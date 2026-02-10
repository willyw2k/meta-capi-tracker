/**
 * Advanced Matching — PII capture, normalisation, hashing, identity graph.
 *
 * Data sources (priority order):
 *   1. Explicit userData → track()
 *   2. identify() stored identity
 *   3. Auto-captured form data
 *   4. URL parameters
 *   5. DataLayer / GTM
 *   6. Meta tags / structured data
 */

import { config, log } from './state';
import { sha256, isHashed, getFromStorage } from './utils';
import { CookieKeeper } from './cookie-keeper';
import type {
  MetaPiiField, CaptureSource, CapturedData,
  HashedUserData, RawUserData, FieldPatterns, Normalizer,
  AdvancedMatchingDiagnostics,
} from './types';

// ── Module state ─────────────────────────────────────────────

let capturedData: CapturedData = {};

// ══════════════════════════════════════════════════════════════
// ── NORMALIZERS (per Meta docs)
// ══════════════════════════════════════════════════════════════

const normalizers: Record<string, Normalizer> = {
  em(v) {
    if (!v) return null;
    v = v.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
  },
  ph(v) {
    if (!v) return null;
    let d = v.replace(/\D/g, '');
    if (d.length < 7) return null;
    if (d.startsWith('00')) d = d.substring(2);
    return d || null;
  },
  fn(v) {
    if (!v) return null;
    v = v.trim().toLowerCase().replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s*/i, '');
    v = v.replace(/[^a-z\s\u00C0-\u024F]/g, '');
    try { v = v.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { /* */ }
    return v.trim() || null;
  },
  ln(v) { return normalizers.fn(v); },
  ge(v) {
    if (!v) return null;
    v = v.trim().toLowerCase();
    if (v.startsWith('m') || v === 'male') return 'm';
    if (v.startsWith('f') || v === 'female') return 'f';
    return null;
  },
  db(v) {
    if (!v) return null;
    v = v.trim();
    if (/^\d{8}$/.test(v)) return v;
    const fmts: RegExp[] = [/^(\d{4})-(\d{2})-(\d{2})$/, /^(\d{2})\/(\d{2})\/(\d{4})$/, /^(\d{2})-(\d{2})-(\d{4})$/];
    for (const rx of fmts) {
      const m = v.match(rx);
      if (m) return m[1].length === 4 ? m[1] + m[2] + m[3] : m[3] + m[1] + m[2];
    }
    return null;
  },
  ct(v) {
    if (!v) return null;
    v = v.trim().toLowerCase().replace(/[^a-z\s\u00C0-\u024F]/g, '');
    try { v = v.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { /* */ }
    return v.trim() || null;
  },
  st(v) {
    if (!v) return null;
    v = v.trim().toLowerCase();
    if (/^[a-z]{2}$/.test(v)) return v;
    const m = v.match(/\b([a-z]{2})\b/);
    return m ? m[1] : v.substring(0, 2);
  },
  zp(v) {
    if (!v) return null;
    v = v.trim().toLowerCase().replace(/\s+/g, '');
    if (/^\d{5}(-\d{4})?$/.test(v)) return v.substring(0, 5);
    return v || null;
  },
  country(v) {
    if (!v) return null;
    v = v.trim().toLowerCase();
    if (/^[a-z]{2}$/.test(v)) return v;
    const map: Record<string, string> = {
      'united states': 'us', 'usa': 'us', 'united kingdom': 'gb', 'uk': 'gb',
      'canada': 'ca', 'australia': 'au', 'germany': 'de', 'france': 'fr',
      'indonesia': 'id', 'japan': 'jp', 'india': 'in', 'brazil': 'br',
      'mexico': 'mx', 'spain': 'es', 'italy': 'it', 'netherlands': 'nl',
      'singapore': 'sg', 'malaysia': 'my', 'philippines': 'ph', 'thailand': 'th',
      'vietnam': 'vn', 'south korea': 'kr', 'china': 'cn', 'taiwan': 'tw',
      'hong kong': 'hk', 'new zealand': 'nz', 'portugal': 'pt', 'sweden': 'se',
      'norway': 'no', 'denmark': 'dk', 'finland': 'fi', 'poland': 'pl',
      'cambodia': 'kh', 'turkey': 'tr', 'argentina': 'ar', 'colombia': 'co',
      'chile': 'cl', 'peru': 'pe', 'south africa': 'za', 'nigeria': 'ng',
      'egypt': 'eg', 'saudi arabia': 'sa', 'united arab emirates': 'ae', 'uae': 'ae',
      'russia': 'ru', 'ukraine': 'ua', 'ireland': 'ie', 'switzerland': 'ch',
      'austria': 'at', 'belgium': 'be', 'czech republic': 'cz', 'romania': 'ro',
    };
    return map[v] ?? (v.length === 2 ? v : null);
  },
  external_id(v) { return v?.trim() || null; },
};

// ── Field detection patterns ─────────────────────────────────

const fieldPatterns: Record<string, FieldPatterns> = {
  em: {
    types: ['email'],
    names: ['email', 'e-mail', 'user_email', 'userEmail', 'customer_email', 'login', 'username', 'emailAddress', 'email_address'],
    ids: ['email', 'user-email', 'customer-email', 'signup-email', 'login-email'],
    autocomplete: ['email'],
    placeholders: ['email', 'e-mail', 'your email', 'email address'],
  },
  ph: {
    types: ['tel'],
    names: ['phone', 'telephone', 'tel', 'mobile', 'phone_number', 'phoneNumber', 'cell', 'cellphone', 'mobile_number', 'contact_number', 'whatsapp'],
    ids: ['phone', 'telephone', 'mobile', 'phone-number'],
    autocomplete: ['tel', 'tel-national', 'tel-local'],
    placeholders: ['phone', 'telephone', 'mobile', 'whatsapp', 'nomor telepon', 'hp'],
  },
  fn: {
    names: ['first_name', 'firstName', 'fname', 'given-name', 'givenName', 'first', 'name_first', 'billing_first_name'],
    ids: ['first-name', 'firstname', 'fname', 'given-name'],
    autocomplete: ['given-name'],
    placeholders: ['first name', 'given name', 'nama depan'],
  },
  ln: {
    names: ['last_name', 'lastName', 'lname', 'family-name', 'familyName', 'surname', 'last', 'name_last', 'billing_last_name'],
    ids: ['last-name', 'lastname', 'lname', 'family-name', 'surname'],
    autocomplete: ['family-name'],
    placeholders: ['last name', 'family name', 'surname', 'nama belakang'],
  },
  ct: {
    names: ['city', 'town', 'billing_city', 'shipping_city', 'address_city'],
    ids: ['city', 'billing-city', 'shipping-city'],
    autocomplete: ['address-level2'],
    placeholders: ['city', 'town', 'kota'],
  },
  st: {
    names: ['state', 'province', 'region', 'billing_state', 'shipping_state'],
    ids: ['state', 'province', 'region', 'billing-state'],
    autocomplete: ['address-level1'],
    placeholders: ['state', 'province', 'region', 'provinsi'],
  },
  zp: {
    names: ['zip', 'zipcode', 'zip_code', 'postal', 'postal_code', 'postcode', 'billing_zip', 'billing_postcode', 'shipping_zip'],
    ids: ['zip', 'zipcode', 'postal-code', 'postcode'],
    autocomplete: ['postal-code'],
    placeholders: ['zip', 'postal code', 'zip code', 'kode pos'],
  },
  country: {
    names: ['country', 'country_code', 'countryCode', 'billing_country', 'shipping_country'],
    ids: ['country', 'billing-country', 'shipping-country'],
    autocomplete: ['country', 'country-name'],
    placeholders: ['country', 'negara'],
  },
  ge: { names: ['gender', 'sex'], ids: ['gender', 'sex'], autocomplete: ['sex'], placeholders: ['gender', 'jenis kelamin'] },
  db: {
    names: ['birthday', 'birthdate', 'date_of_birth', 'dob', 'dateOfBirth', 'birth_date', 'bday'],
    ids: ['birthday', 'birthdate', 'dob', 'date-of-birth'],
    autocomplete: ['bday'],
    placeholders: ['birthday', 'date of birth', 'tanggal lahir'],
  },
};

// ── Source priority ──────────────────────────────────────────

const sourcePriority: Record<CaptureSource, number> = {
  explicit: 100, identify: 90, form: 80, form_prefill: 70,
  url: 60, dataLayer: 50, customDataLayer: 50, metatag: 30,
};

// ── Mapping tables ───────────────────────────────────────────

const dataLayerFieldMap: Record<string, MetaPiiField> = {
  email: 'em', em: 'em', user_email: 'em', customerEmail: 'em',
  phone: 'ph', ph: 'ph', telephone: 'ph', mobile: 'ph', phoneNumber: 'ph',
  first_name: 'fn', fn: 'fn', firstName: 'fn', givenName: 'fn',
  last_name: 'ln', ln: 'ln', lastName: 'ln', familyName: 'ln', surname: 'ln',
  gender: 'ge', ge: 'ge', sex: 'ge',
  date_of_birth: 'db', db: 'db', birthday: 'db', dob: 'db', birthdate: 'db',
  city: 'ct', ct: 'ct', town: 'ct',
  state: 'st', st: 'st', province: 'st', region: 'st',
  zip: 'zp', zp: 'zp', zipcode: 'zp', postal_code: 'zp', postcode: 'zp',
  country: 'country', country_code: 'country', countryCode: 'country',
  external_id: 'external_id', user_id: 'external_id', userId: 'external_id',
  customer_id: 'external_id', customerId: 'external_id',
};

const aliasMap: Record<string, MetaPiiField> = {
  email: 'em', phone: 'ph', first_name: 'fn', last_name: 'ln',
  gender: 'ge', date_of_birth: 'db', city: 'ct', state: 'st',
  zip: 'zp', zipcode: 'zp', postal_code: 'zp',
};

const storageMap: Partial<Record<MetaPiiField, string>> = {
  em: '_mt_em', ph: '_mt_ph', external_id: '_mt_eid',
  fn: '_mt_fn', ln: '_mt_ln', ct: '_mt_ct', st: '_mt_st',
  zp: '_mt_zp', country: '_mt_country',
};

// ── PII field list ───────────────────────────────────────────

const PII_FIELDS: MetaPiiField[] = ['em', 'ph', 'fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'];
const NON_PII_FIELDS = ['client_ip_address', 'client_user_agent', 'fbc', 'fbp', 'subscription_id', 'fb_login_id', 'lead_id'] as const;

// ══════════════════════════════════════════════════════════════
// ── EXPORTED MODULE
// ══════════════════════════════════════════════════════════════

export const AdvancedMatching = {

  // ── Lifecycle ──────────────────────────────────────────────

  init(): void {
    if (!config.advancedMatching.enabled) return;
    log('AdvancedMatching: initializing');
    if (config.advancedMatching.captureUrlParams) this.captureFromUrl();
    if (config.advancedMatching.captureMetaTags) this.captureFromMetaTags();
    if (config.advancedMatching.captureDataLayer) this.captureFromDataLayer();
    if (config.advancedMatching.autoCaptureForms) this.watchForms();
    log('AdvancedMatching: ready, captured:', Object.keys(capturedData));
  },

  // ── Normalize + Hash ───────────────────────────────────────

  normalize(field: string, value: string): string | null {
    if (isHashed(value)) return value;
    const fn = normalizers[field];
    return fn ? fn(value) : (value ? String(value).trim().toLowerCase() : null);
  },

  async normalizeAndHash(userData: RawUserData): Promise<HashedUserData> {
    if (!userData) return {};
    const result: HashedUserData = {};

    for (const field of PII_FIELDS) {
      const value = (userData as Record<string, string | undefined>)[field];
      if (!value) continue;
      if (isHashed(value)) { result[field] = value; continue; }
      const normalized = this.normalize(field, value);
      if (!normalized) continue;
      result[field] = config.hashPii ? (await sha256(normalized) ?? undefined) : normalized;
    }

    for (const field of NON_PII_FIELDS) {
      if ((userData as Record<string, string | undefined>)[field]) {
        result[field] = (userData as Record<string, string | undefined>)[field];
      }
    }
    return result;
  },

  // ── Form Auto-Capture ──────────────────────────────────────

  detectFieldParam(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string | null {
    const type = (input.type || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    const ac = (input.autocomplete || '').toLowerCase();
    const ph = ('placeholder' in input ? (input.placeholder || '') : '').toLowerCase();

    // Custom map first
    for (const [sel, param] of Object.entries(config.advancedMatching.formFieldMap ?? {})) {
      try { if (input.matches(sel)) return param; } catch { /* */ }
    }

    for (const [param, p] of Object.entries(fieldPatterns)) {
      if (p.types?.includes(type)) return param;
      if (p.names?.some((n) => name.includes(n))) return param;
      if (p.ids?.some((i) => id.includes(i))) return param;
      if (p.autocomplete?.includes(ac)) return param;
      if (p.placeholders?.some((x) => ph.includes(x))) return param;
    }

    if (['name', 'full_name', 'fullname', 'customer_name'].includes(name) ||
        ['name', 'full-name', 'fullname'].includes(id)) return '_fullname';

    return null;
  },

  scanForm(form: HTMLFormElement): RawUserData {
    const data: Record<string, string> = {};
    const inputs = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea');
    for (const input of inputs) {
      if (['hidden', 'password', 'submit'].includes((input as HTMLInputElement).type)) continue;
      const value = input.value?.trim();
      if (!value) continue;
      const param = this.detectFieldParam(input);
      if (!param) continue;
      if (param === '_fullname') {
        const parts = value.split(/\s+/);
        if (parts.length >= 2) { data.fn = data.fn || parts[0]; data.ln = data.ln || parts.slice(1).join(' '); }
        else { data.fn = data.fn || value; }
      } else { data[param] = data[param] || value; }
    }
    return data as RawUserData;
  },

  watchForms(): void {
    document.addEventListener('submit', (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      const data = this.scanForm(form);
      if (Object.keys(data).length) {
        this._mergeCapture('form', data);
        log('AdvancedMatching: form submit captured', Object.keys(data));
        if (config.advancedMatching.autoIdentifyOnSubmit && (data.em || data.ph)) {
          window.MetaTracker?.identify(data);
        }
      }
    }, true);

    document.addEventListener('change', (e: Event) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) return;
      const value = input.value?.trim();
      if (!value) return;
      const param = this.detectFieldParam(input);
      if (!param || param === '_fullname') return;
      this._mergeCapture('form', { [param]: value } as RawUserData);
      log('AdvancedMatching: field captured', param);
    }, true);

    // Scan existing forms and observe for new ones once DOM is ready
    const startObserving = () => {
      document.querySelectorAll<HTMLFormElement>('form').forEach((f) => {
        const d = this.scanForm(f);
        if (Object.keys(d).length) { this._mergeCapture('form_prefill', d); log('AdvancedMatching: pre-filled form scanned', Object.keys(d)); }
      });

      // Watch dynamic forms
      if (typeof MutationObserver !== 'undefined' && document.body) {
        const obs = new MutationObserver((muts) => {
          for (const mut of muts) for (const node of mut.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            const forms = node.tagName === 'FORM' ? [node as HTMLFormElement] : [...node.querySelectorAll<HTMLFormElement>('form')];
            for (const f of forms) { const d = this.scanForm(f); if (Object.keys(d).length) this._mergeCapture('form_prefill', d); }
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
      }
    };

    // Defer if document.body isn't available yet (script in <head>)
    if (document.body) {
      startObserving();
    } else {
      document.addEventListener('DOMContentLoaded', startObserving);
    }
  },

  // ── URL Parameter Capture ──────────────────────────────────

  captureFromUrl(): void {
    try {
      const params = new URL(window.location.href).searchParams;
      const data: Record<string, string> = {};

      for (const p of ['email', 'em', 'e', 'user_email', 'customer_email']) {
        const v = params.get(p); if (v?.includes('@')) { data.em = v; break; }
      }
      for (const p of ['phone', 'ph', 'tel', 'mobile', 'whatsapp']) {
        const v = params.get(p); if (v && v.replace(/\D/g, '').length >= 7) { data.ph = v; break; }
      }
      const fn = params.get('first_name') ?? params.get('fn'); if (fn) data.fn = fn;
      const ln = params.get('last_name') ?? params.get('ln'); if (ln) data.ln = ln;
      for (const p of ['external_id', 'eid', 'user_id', 'uid', 'customer_id', 'player_id']) {
        const v = params.get(p); if (v) { data.external_id = v; break; }
      }
      const cc = params.get('country') ?? params.get('cc'); if (cc) data.country = cc;

      if (Object.keys(data).length) { this._mergeCapture('url', data as RawUserData); log('AdvancedMatching: URL params captured', Object.keys(data)); }
    } catch { /* */ }
  },

  // ── DataLayer Capture ──────────────────────────────────────

  captureFromDataLayer(): void {
    const dlKey = config.advancedMatching.dataLayerKey || 'dataLayer';
    const dl = window[dlKey] as unknown[] | undefined;

    if (Array.isArray(dl)) {
      for (const entry of dl) this._extractFromDataLayerEntry(entry);
      const origPush = dl.push.bind(dl);
      dl.push = (...args: unknown[]): number => {
        const r = origPush(...args);
        for (const entry of args) this._extractFromDataLayerEntry(entry);
        return r;
      };
    }

    const udk = config.advancedMatching.userDataKey;
    if (udk && window[udk]) this._extractUserObject(window[udk] as Record<string, unknown>, 'customDataLayer');
  },

  _extractFromDataLayerEntry(entry: unknown): void {
    if (!entry || typeof entry !== 'object') return;
    const obj = entry as Record<string, unknown>;
    for (const key of ['user', 'userData', 'user_data', 'customer', 'visitor', 'contact']) {
      if (obj[key] && typeof obj[key] === 'object') this._extractUserObject(obj[key] as Record<string, unknown>, 'dataLayer');
    }
    const ecom = obj.ecommerce as Record<string, unknown> | undefined;
    const af = (ecom?.purchase as Record<string, unknown> | undefined)?.actionField as Record<string, unknown> | undefined;
    if (af?.email) this._mergeCapture('dataLayer', { em: af.email as string });
    this._extractUserObject(obj, 'dataLayer');
  },

  _extractUserObject(obj: Record<string, unknown>, source: CaptureSource): void {
    if (!obj) return;
    const data: Record<string, string> = {};
    for (const [key, param] of Object.entries(dataLayerFieldMap)) {
      const val = obj[key];
      if (val && typeof val === 'string' && val.trim()) data[param] = val.trim();
    }
    if (Object.keys(data).length) { this._mergeCapture(source, data as RawUserData); log('AdvancedMatching: data layer captured', Object.keys(data)); }
  },

  // ── Meta Tag Capture ───────────────────────────────────────

  captureFromMetaTags(): void {
    const data: Record<string, string> = {};

    for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(script.textContent || '') as Record<string, unknown>;
        if (j.email) data.em = j.email as string;
        if (j.telephone) data.ph = j.telephone as string;
        if (j.givenName) data.fn = j.givenName as string;
        if (j.familyName) data.ln = j.familyName as string;
        if (j.address && typeof j.address === 'object') {
          const a = j.address as Record<string, string>;
          if (a.addressLocality) data.ct = a.addressLocality;
          if (a.addressRegion) data.st = a.addressRegion;
          if (a.postalCode) data.zp = a.postalCode;
          if (a.addressCountry) data.country = a.addressCountry;
        }
      } catch { /* */ }
    }

    const meta = (prop: string) => document.querySelector<HTMLMetaElement>(`meta[property="${prop}"]`)?.content;
    if (meta('profile:email')) data.em = meta('profile:email')!;
    if (meta('profile:first_name')) data.fn = meta('profile:first_name')!;
    if (meta('profile:last_name')) data.ln = meta('profile:last_name')!;
    if (meta('profile:gender')) data.ge = meta('profile:gender')!;

    if (Object.keys(data).length) { this._mergeCapture('metatag', data as RawUserData); log('AdvancedMatching: meta tags captured', Object.keys(data)); }
  },

  // ── Identity Graph ─────────────────────────────────────────

  _mergeCapture(source: CaptureSource, data: RawUserData): void {
    for (const [param, value] of Object.entries(data)) {
      if (!value) continue;
      const existing = capturedData[param];
      const existingP = existing ? (sourcePriority[existing.source] ?? 0) : -1;
      if (!existing || (sourcePriority[source] ?? 0) >= existingP) {
        capturedData[param] = { value, source };
      }
    }
  },

  getCapturedData(): RawUserData {
    const r: Record<string, string> = {};
    for (const [p, e] of Object.entries(capturedData)) r[p] = e.value;
    return r as RawUserData;
  },

  async buildUserData(explicitUserData: RawUserData = {}): Promise<HashedUserData> {
    // Merge: auto-captured → stored identity → explicit (highest priority)
    const merged: Record<string, string> = { ...this.getCapturedData() as Record<string, string> };

    for (const [field, key] of Object.entries(storageMap)) {
      if (!merged[field] && key) { const v = getFromStorage(key); if (v) merged[field] = v; }
    }

    for (const [key, value] of Object.entries(explicitUserData)) {
      if (!value) continue;
      merged[aliasMap[key] ?? key] = value;
    }

    const result = await this.normalizeAndHash(merged as RawUserData);

    result.fbp = result.fbp || CookieKeeper.getFbp() || undefined;
    result.fbc = result.fbc || CookieKeeper.getFbc() || undefined;
    result.client_user_agent = result.client_user_agent || navigator.userAgent;

    if (!result.external_id) {
      const vid = CookieKeeper.getVisitorId();
      if (vid) result.external_id = (await sha256(vid)) ?? undefined;
    }

    return result;
  },

  // ── Match Quality Scoring ──────────────────────────────────

  scoreMatchQuality(userData: HashedUserData): number {
    const weights: Record<string, number> = {
      em: 30, ph: 25, external_id: 15, fn: 5, ln: 5,
      ct: 3, st: 2, zp: 3, country: 2, ge: 2, db: 3,
      fbp: 5, fbc: 10, client_ip_address: 3, client_user_agent: 2,
    };
    let score = 0;
    for (const [f, w] of Object.entries(weights)) {
      if ((userData as Record<string, unknown>)[f]) score += w;
    }
    return Math.min(score, 100);
  },

  // ── Diagnostics ────────────────────────────────────────────

  getDiagnostics(): AdvancedMatchingDiagnostics {
    const fields: AdvancedMatchingDiagnostics['fields'] = {};
    for (const [p, e] of Object.entries(capturedData)) {
      fields[p] = { source: e.source, hasValue: true, isHashed: isHashed(e.value) };
    }
    return {
      capturedFields: Object.keys(capturedData).length,
      fields,
      storedIdentity: {
        em: !!getFromStorage('_mt_em'), ph: !!getFromStorage('_mt_ph'),
        fn: !!getFromStorage('_mt_fn'), ln: !!getFromStorage('_mt_ln'),
        external_id: !!getFromStorage('_mt_eid'),
      },
    };
  },

  resetCapturedData(): void { capturedData = {}; },

  // Re-export for external use
  aliasMap,
  storageMap,
};
