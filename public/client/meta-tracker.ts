/**
 * Meta CAPI Tracker - Client-Side Library v2.1
 * ==============================================
 * Enhanced tracking with Advanced Matching, Cookie Keeper,
 * Ad Blocker Recovery, and Multi-Domain support.
 *
 * Advanced Matching Features:
 * - Auto-capture PII from forms (email, phone, name, address)
 * - URL parameter extraction (email, fbclid, utm)
 * - DataLayer integration (GTM ecommerce, custom objects)
 * - Meta-specific normalization before hashing
 * - Identity graph: merges data from all sources with priority
 * - Match quality scoring for diagnostics
 *
 * Usage:
 *   MetaTracker.init({
 *     endpoint: 'https://your-server.com/api/v1/track',
 *     apiKey: 'your-api-key',
 *     pixelId: '123456789',
 *     advancedMatching: {
 *       enabled: true,
 *       autoCaptureForms: true,
 *       captureUrlParams: true,
 *       captureDataLayer: true,
 *       captureMetaTags: true,
 *       formFieldMap: {},
 *     },
 *   });
 */

// ══════════════════════════════════════════════════════════════
// ── TYPE DEFINITIONS
// ══════════════════════════════════════════════════════════════

/** Meta PII field identifiers. */
type PiiField = 'em' | 'ph' | 'fn' | 'ln' | 'ge' | 'db' | 'ct' | 'st' | 'zp' | 'country' | 'external_id';

/** Non-PII fields that Meta accepts. */
type NonPiiField = 'client_ip_address' | 'client_user_agent' | 'fbc' | 'fbp'
  | 'subscription_id' | 'fb_login_id' | 'lead_id';

/** All Meta user_data fields. */
type UserDataField = PiiField | NonPiiField;

/** Long-form field aliases accepted in public API. */
type FieldAlias = 'email' | 'phone' | 'first_name' | 'last_name' | 'gender'
  | 'date_of_birth' | 'city' | 'state' | 'zip' | 'zipcode' | 'postal_code';

/** User data input – accepts both short and long field names. */
export type UserDataInput = Partial<Record<PiiField | NonPiiField | FieldAlias, string>>;

/** Hashed/normalized user data ready for the server. */
export type HashedUserData = Partial<Record<UserDataField, string>>;

/** Data source identifiers for the identity graph. */
type CaptureSource = 'explicit' | 'identify' | 'form' | 'form_prefill'
  | 'url' | 'dataLayer' | 'customDataLayer' | 'metatag';

/** Internal captured data entry. */
interface CapturedEntry {
  value: string;
  source: CaptureSource;
}

/** Cookie Keeper configuration. */
export interface CookieKeeperConfig {
  enabled: boolean;
  refreshInterval: number;
  maxAge: number;
  cookieNames: string[];
}

/** Ad Blocker Recovery configuration. */
export interface AdBlockRecoveryConfig {
  enabled: boolean;
  proxyPath: string;
  useBeacon: boolean;
  useImage: boolean;
  customEndpoints: string[];
}

/** Advanced Matching configuration. */
export interface AdvancedMatchingConfig {
  enabled: boolean;
  autoCaptureForms: boolean;
  captureUrlParams: boolean;
  captureDataLayer: boolean;
  captureMetaTags: boolean;
  autoIdentifyOnSubmit: boolean;
  formFieldMap: Record<string, PiiField>;
  dataLayerKey: string;
  userDataKey: string | null;
}

/** Pixel routing entry. */
export interface PixelConfig {
  pixelId: string;
  domains: string[];
}

/** Full tracker configuration. */
export interface TrackerConfig {
  endpoint: string;
  apiKey: string;
  pixelId: string;
  pixels: PixelConfig[];
  autoPageView: boolean;
  debug: boolean;
  hashPii: boolean;
  respectDnt: boolean;
  batchEvents: boolean;
  cookieKeeper: CookieKeeperConfig;
  adBlockRecovery: AdBlockRecoveryConfig;
  advancedMatching: AdvancedMatchingConfig;
}

/** Options for init – all fields optional except endpoint + apiKey. */
export type TrackerInitOptions = Partial<TrackerConfig> & {
  endpoint: string;
  apiKey: string;
} & ({ pixelId: string } | { pixels: PixelConfig[] });

/** Options for individual track() calls. */
export interface TrackOptions {
  event_id?: string;
  pixel_id?: string;
  action_source?: string;
}

/** Event payload sent to the server. */
export interface TrackEvent {
  pixel_id: string;
  event_name: string;
  event_id: string;
  event_time: number;
  event_source_url: string;
  action_source: string;
  user_data: HashedUserData;
  match_quality: number;
  visitor_id: string | null;
  custom_data?: Record<string, unknown>;
}

/** Diagnostics output from AdvancedMatching.getDiagnostics(). */
export interface MatchDiagnostics {
  capturedFields: number;
  fields: Record<string, { source: CaptureSource; hasValue: boolean; isHashed: boolean }>;
  storedIdentity: Record<string, boolean>;
}

/** Debug info returned from getDebugInfo(). */
export interface DebugInfo {
  version: string;
  initialized: boolean;
  transport: string;
  adBlockDetected: boolean;
  config: { endpoint: string; pixelId: string; pixelCount: number };
  cookies: { fbp: string | null; fbc: string | null; visitorId: string | null };
  routing: { domain: string; active: string[]; all: string[] };
  advancedMatching: MatchDiagnostics;
  queueSize: number;
}

/** Match quality result. */
export interface MatchQualityResult {
  score: number;
  fields: string[];
}

/** Field detection patterns for form auto-capture. */
interface FieldPattern {
  types?: string[];
  names?: string[];
  ids?: string[];
  autocomplete?: string[];
  placeholders?: string[];
}

/** Transport function signature. */
type TransportFn = (url: string, data: unknown) => Promise<Record<string, unknown>>;

/** Transport definition. */
interface TransportDef {
  name: string;
  fn: TransportFn;
  skip?: boolean;
}

/** Disguised payload for ad-blocker recovery. */
interface DisguisedPayload {
  d: string;
  t: number;
  v: string;
}

/** DataLayer entry (loose – GTM can push anything). */
interface DataLayerEntry {
  [key: string]: unknown;
  ecommerce?: {
    purchase?: {
      actionField?: { email?: string; [k: string]: unknown };
    };
  };
}

/** Augment Window for globals. */
declare global {
  interface Window {
    MetaTracker: MetaTrackerApi;
    MetaTrackerQueue?: [string, ...unknown[]][];
    doNotTrack?: string;
    [key: string]: unknown; // for dynamic dataLayer / userData keys
  }
}

// ══════════════════════════════════════════════════════════════
// ── IIFE MODULE
// ══════════════════════════════════════════════════════════════

(function (window: Window, document: Document): void {
  'use strict';

  const VERSION = '2.1.0';
  const MAX_QUEUE_SIZE = 50;
  const RETRY_DELAYS: readonly number[] = [1000, 5000, 15000];
  const BATCH_INTERVAL = 2000;

  // ── State ──────────────────────────────────────────────────────

  let config: TrackerConfig = {
    endpoint: '',
    apiKey: '',
    pixelId: '',
    pixels: [],
    autoPageView: true,
    debug: false,
    hashPii: true,
    respectDnt: false,
    batchEvents: true,
    cookieKeeper: {
      enabled: true,
      refreshInterval: 86400000,
      maxAge: 180,
      cookieNames: ['_fbp', '_fbc', '_mt_id'],
    },
    adBlockRecovery: {
      enabled: true,
      proxyPath: '/collect',
      useBeacon: true,
      useImage: true,
      customEndpoints: [],
    },
    advancedMatching: {
      enabled: true,
      autoCaptureForms: true,
      captureUrlParams: true,
      captureDataLayer: true,
      captureMetaTags: true,
      autoIdentifyOnSubmit: true,
      formFieldMap: {},
      dataLayerKey: 'dataLayer',
      userDataKey: null,
    },
  };

  let queue: TrackEvent[] = [];
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  let initialized = false;
  let transportMethod = 'fetch';
  let adBlockDetected = false;
  let cookieKeeperTimer: ReturnType<typeof setInterval> | null = null;

  // ── Utilities ──────────────────────────────────────────────────

  function log(...args: unknown[]): void {
    if (config.debug) console.log('[MetaTracker]', ...args);
  }

  function warn(...args: unknown[]): void {
    if (config.debug) console.warn('[MetaTracker]', ...args);
  }

  function generateEventId(): string {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
  }

  function generateVisitorId(): string {
    const stored = getFromStorage('_mt_id');
    if (stored) return stored;
    const id = 'mt.' + Date.now().toString(36) + '.' + Math.random().toString(36).substring(2, 12);
    saveToStorage('_mt_id', id);
    return id;
  }

  async function sha256(value: string | null | undefined): Promise<string | null> {
    if (!value) return null;
    const normalized = value.toString().trim().toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function isHashed(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  }

  // ── Storage Helpers ────────────────────────────────────────────

  function setCookie(name: string, value: string, days: number): void {
    const maxAge = days * 86400;
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    const domain = getRootDomain();
    const domainStr = domain ? `; domain=.${domain}` : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/${domainStr}; max-age=${maxAge}; SameSite=Lax${secure}`;
  }

  function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function deleteCookie(name: string): void {
    const domain = getRootDomain();
    const domainStr = domain ? `; domain=.${domain}` : '';
    document.cookie = `${name}=; path=/${domainStr}; max-age=0`;
  }

  function getRootDomain(): string {
    try {
      const parts = window.location.hostname.split('.');
      if (parts.length <= 1 || /^\d+$/.test(parts[parts.length - 1])) return '';
      return parts.slice(-2).join('.');
    } catch {
      return '';
    }
  }

  function getFromStorage(key: string): string | null {
    const cookieVal = getCookie(key);
    if (cookieVal) return cookieVal;
    try { return localStorage.getItem('mt_' + key); } catch { return null; }
  }

  function saveToStorage(key: string, value: string, days?: number): void {
    days = days || (config.cookieKeeper.maxAge || 180);
    setCookie(key, value, days);
    try { localStorage.setItem('mt_' + key, value); } catch { /* silently fail */ }
  }

  function removeFromStorage(key: string): void {
    deleteCookie(key);
    try { localStorage.removeItem('mt_' + key); } catch { /* silently fail */ }
  }

  // ══════════════════════════════════════════════════════════════
  // ── ADVANCED MATCHING
  // ══════════════════════════════════════════════════════════════

  const AdvancedMatching = {
    _capturedData: {} as Record<string, CapturedEntry>,
    _formObserver: null as MutationObserver | null,
    _formListeners: new WeakSet<HTMLFormElement>(),

    init(): void {
      if (!config.advancedMatching.enabled) return;

      log('AdvancedMatching: initializing');

      if (config.advancedMatching.captureUrlParams) this.captureFromUrl();
      if (config.advancedMatching.captureMetaTags) this.captureFromMetaTags();
      if (config.advancedMatching.captureDataLayer) this.captureFromDataLayer();
      if (config.advancedMatching.autoCaptureForms) this.watchForms();

      log('AdvancedMatching: ready, captured:', Object.keys(this._capturedData));
    },

    // ── META-SPECIFIC NORMALIZER ──────────────────────────────

    normalizers: {
      em(value: string | null): string | null {
        if (!value || typeof value !== 'string') return null;
        value = value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
        return value;
      },

      ph(value: string | null): string | null {
        if (!value || typeof value !== 'string') return null;
        let digits = value.replace(/\D/g, '');
        if (digits.length < 7) return null;
        if (digits.startsWith('00')) digits = digits.substring(2);
        return digits || null;
      },

      fn(value: string | null): string | null {
        if (!value || typeof value !== 'string') return null;
        let v = value.trim().toLowerCase();
        v = v.replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s*/i, '');
        v = v.replace(/[^a-z\s\u00C0-\u024F]/g, '');
        try { v = v.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { /* no-op */ }
        return v.trim() || null;
      },

      ln(value: string | null): string | null {
        return AdvancedMatching.normalizers.fn(value);
      },

      ge(value: string | null): string | null {
        if (!value || typeof value !== 'string') return null;
        const v = value.trim().toLowerCase();
        if (v.startsWith('m') || v === 'male') return 'm';
        if (v.startsWith('f') || v === 'female') return 'f';
        return null;
      },

      db(value: string | null): string | null {
        if (!value || typeof value !== 'string') return null;
        const v = value.trim();
        if (/^\d{8}$/.test(v)) return v;
        const formats: RegExp[] = [
          /^(\d{4})-(\d{2})-(\d{2})$/,
          /^(\d{2})\/(\d{2})\/(\d{4})$/,
          /^(\d{2})-(\d{2})-(\d{4})$/,
        ];
        for (const regex of formats) {
          const m = v.match(regex);
          if (m) {
            if (m[1].length === 4) return m[1] + m[2] + m[3];
            return m[3] + m[1] + m[2];
          }
        }
        return null;
      },

      ct(value: string | null): string | null {
        if (!value || typeof value !== 'string') return null;
        let v = value.trim().toLowerCase();
        v = v.replace(/[^a-z\s\u00C0-\u024F]/g, '');
        try { v = v.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { /* no-op */ }
        return v.trim() || null;
      },

      st(value: string | null): string | null {
        if (!value || typeof value !== 'string') return null;
        const v = value.trim().toLowerCase();
        if (/^[a-z]{2}$/.test(v)) return v;
        const match = v.match(/\b([a-z]{2})\b/);
        return match ? match[1] : v.substring(0, 2);
      },

      zp(value: string | null): string | null {
        if (!value || typeof value !== 'string') return null;
        const v = value.trim().toLowerCase().replace(/\s+/g, '');
        if (/^\d{5}(-\d{4})?$/.test(v)) return v.substring(0, 5);
        return v || null;
      },

      country(value: string | null): string | null {
        if (!value || typeof value !== 'string') return null;
        const v = value.trim().toLowerCase();
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
        return map[v] || (v.length === 2 ? v : null);
      },

      external_id(value: string | null): string | null {
        if (!value || typeof value !== 'string') return null;
        return value.trim() || null;
      },
    } satisfies Record<PiiField, (value: string | null) => string | null>,

    normalize(field: string, value: string): string | null {
      if (isHashed(value)) return value;
      const normalizer = this.normalizers[field as PiiField];
      return normalizer ? normalizer(value) : (value ? String(value).trim().toLowerCase() : null);
    },

    async normalizeAndHash(userData: UserDataInput): Promise<HashedUserData> {
      if (!userData) return {};

      const piiFields: PiiField[] = ['em', 'ph', 'fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'];
      const result: HashedUserData = {};

      for (const field of piiFields) {
        const value = (userData as Record<string, string | undefined>)[field];
        if (!value) continue;

        if (isHashed(value)) {
          result[field] = value;
          continue;
        }

        const normalized = this.normalize(field, value);
        if (!normalized) continue;

        if (config.hashPii) {
          result[field] = (await sha256(normalized)) ?? undefined;
        } else {
          result[field] = normalized;
        }
      }

      // Non-PII fields: copy as-is
      const nonPiiFields: NonPiiField[] = [
        'client_ip_address', 'client_user_agent', 'fbc', 'fbp',
        'subscription_id', 'fb_login_id', 'lead_id',
      ];
      for (const field of nonPiiFields) {
        const val = (userData as Record<string, string | undefined>)[field];
        if (val) result[field] = val;
      }

      return result;
    },

    // ── FORM AUTO-CAPTURE ─────────────────────────────────────

    _fieldPatterns: {
      em: {
        types: ['email'],
        names: ['email', 'e-mail', 'user_email', 'userEmail', 'customer_email',
                'login', 'username', 'emailAddress', 'email_address'],
        ids: ['email', 'user-email', 'customer-email', 'signup-email', 'login-email'],
        autocomplete: ['email'],
        placeholders: ['email', 'e-mail', 'your email', 'email address'],
      },
      ph: {
        types: ['tel'],
        names: ['phone', 'telephone', 'tel', 'mobile', 'phone_number', 'phoneNumber',
                'cell', 'cellphone', 'mobile_number', 'contact_number', 'whatsapp'],
        ids: ['phone', 'telephone', 'mobile', 'phone-number'],
        autocomplete: ['tel', 'tel-national', 'tel-local'],
        placeholders: ['phone', 'telephone', 'mobile', 'whatsapp', 'nomor telepon', 'hp'],
      },
      fn: {
        names: ['first_name', 'firstName', 'fname', 'given-name', 'givenName',
                'first', 'name_first', 'billing_first_name'],
        ids: ['first-name', 'firstname', 'fname', 'given-name'],
        autocomplete: ['given-name'],
        placeholders: ['first name', 'given name', 'nama depan'],
      },
      ln: {
        names: ['last_name', 'lastName', 'lname', 'family-name', 'familyName',
                'surname', 'last', 'name_last', 'billing_last_name'],
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
        names: ['zip', 'zipcode', 'zip_code', 'postal', 'postal_code', 'postcode',
                'billing_zip', 'billing_postcode', 'shipping_zip'],
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
      ge: {
        names: ['gender', 'sex'],
        ids: ['gender', 'sex'],
        autocomplete: ['sex'],
        placeholders: ['gender', 'jenis kelamin'],
      },
      db: {
        names: ['birthday', 'birthdate', 'date_of_birth', 'dob', 'dateOfBirth',
                'birth_date', 'bday'],
        ids: ['birthday', 'birthdate', 'dob', 'date-of-birth'],
        autocomplete: ['bday'],
        placeholders: ['birthday', 'date of birth', 'tanggal lahir'],
      },
    } satisfies Record<string, FieldPattern>,

    detectFieldParam(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): PiiField | '_fullname' | null {
      const type = (input.type || '').toLowerCase();
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const autocomplete = (input.autocomplete || '').toLowerCase();
      const placeholder = ('placeholder' in input ? (input.placeholder || '') : '').toLowerCase();

      // Check custom field map first
      if (config.advancedMatching.formFieldMap) {
        for (const [selector, param] of Object.entries(config.advancedMatching.formFieldMap)) {
          try {
            if ((input as Element).matches(selector)) return param;
          } catch { /* invalid selector */ }
        }
      }

      // Check against patterns
      for (const [param, patterns] of Object.entries(this._fieldPatterns)) {
        if ('types' in patterns && patterns.types && patterns.types.includes(type)) return param as PiiField;
        if (patterns.names && patterns.names.some(n => name.includes(n))) return param as PiiField;
        if (patterns.ids && patterns.ids.some(i => id.includes(i))) return param as PiiField;
        if (patterns.autocomplete && patterns.autocomplete.includes(autocomplete)) return param as PiiField;
        if (patterns.placeholders && patterns.placeholders.some(p => placeholder.includes(p))) return param as PiiField;
      }

      // Fallback: full name → split into fn/ln
      if (['name', 'full_name', 'fullname', 'customer_name'].includes(name) ||
          ['name', 'full-name', 'fullname'].includes(id)) {
        return '_fullname';
      }

      return null;
    },

    scanForm(form: HTMLFormElement): Partial<Record<PiiField, string>> {
      const data: Partial<Record<PiiField, string>> = {};
      const inputs = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input, select, textarea'
      );

      for (const input of inputs) {
        if (input.type === 'hidden' || input.type === 'password' || input.type === 'submit') continue;

        const value = input.value?.trim();
        if (!value) continue;

        const param = this.detectFieldParam(input);
        if (!param) continue;

        if (param === '_fullname') {
          const parts = value.split(/\s+/);
          if (parts.length >= 2) {
            data.fn = data.fn || parts[0];
            data.ln = data.ln || parts.slice(1).join(' ');
          } else {
            data.fn = data.fn || value;
          }
        } else {
          data[param] = data[param] || value;
        }
      }

      return data;
    },

    watchForms(): void {
      // Capture on form submit
      document.addEventListener('submit', (e: SubmitEvent) => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement)) return;

        const data = this.scanForm(form);
        if (Object.keys(data).length > 0) {
          this._mergeCapture('form', data);
          log('AdvancedMatching: form submit captured', Object.keys(data));

          if (config.advancedMatching.autoIdentifyOnSubmit && (data.em || data.ph)) {
            MetaTracker.identify(data);
          }
        }
      }, true);

      // Capture on input change
      document.addEventListener('change', (e: Event) => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) return;

        const value = input.value?.trim();
        if (!value) return;

        const param = this.detectFieldParam(input);
        if (!param || param === '_fullname') return;

        this._mergeCapture('form', { [param]: value });
        log('AdvancedMatching: field captured', param);
      }, true);

      // Scan existing forms
      this._scanExistingForms();

      // Watch for dynamically added forms
      if (window.MutationObserver) {
        this._formObserver = new MutationObserver((mutations: MutationRecord[]) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType !== 1) continue;
              const el = node as HTMLElement;
              if (el.tagName === 'FORM') {
                this._scanSingleForm(el as HTMLFormElement);
              } else if (el.querySelectorAll) {
                el.querySelectorAll<HTMLFormElement>('form').forEach(f => this._scanSingleForm(f));
              }
            }
          }
        });

        this._formObserver.observe(document.body, { childList: true, subtree: true });
      }
    },

    _scanExistingForms(): void {
      document.querySelectorAll<HTMLFormElement>('form').forEach(form => this._scanSingleForm(form));
    },

    _scanSingleForm(form: HTMLFormElement): void {
      const data = this.scanForm(form);
      if (Object.keys(data).length > 0) {
        this._mergeCapture('form_prefill', data);
        log('AdvancedMatching: pre-filled form scanned', Object.keys(data));
      }
    },

    // ── URL PARAMETER CAPTURE ────────────────────────────────

    captureFromUrl(): void {
      try {
        const url = new URL(window.location.href);
        const params = url.searchParams;
        const data: Partial<Record<PiiField, string>> = {};

        const emailParams = ['email', 'em', 'e', 'user_email', 'customer_email'];
        for (const p of emailParams) {
          const val = params.get(p);
          if (val && val.includes('@')) { data.em = val; break; }
        }

        const phoneParams = ['phone', 'ph', 'tel', 'mobile', 'whatsapp'];
        for (const p of phoneParams) {
          const val = params.get(p);
          if (val && val.replace(/\D/g, '').length >= 7) { data.ph = val; break; }
        }

        if (params.get('first_name') || params.get('fn')) {
          data.fn = params.get('first_name') || params.get('fn') || undefined;
        }
        if (params.get('last_name') || params.get('ln')) {
          data.ln = params.get('last_name') || params.get('ln') || undefined;
        }

        const eidParams = ['external_id', 'eid', 'user_id', 'uid', 'customer_id', 'player_id'];
        for (const p of eidParams) {
          const val = params.get(p);
          if (val) { data.external_id = val; break; }
        }

        if (params.get('country') || params.get('cc')) {
          data.country = params.get('country') || params.get('cc') || undefined;
        }

        if (Object.keys(data).length > 0) {
          this._mergeCapture('url', data);
          log('AdvancedMatching: URL params captured', Object.keys(data));
        }
      } catch { /* invalid URL */ }
    },

    // ── DATALAYER CAPTURE ────────────────────────────────────

    captureFromDataLayer(): void {
      const dlKey = config.advancedMatching.dataLayerKey || 'dataLayer';
      const dl = window[dlKey] as DataLayerEntry[] | undefined;

      if (Array.isArray(dl)) {
        for (const entry of dl) {
          this._extractFromDataLayerEntry(entry);
        }

        // Watch for future pushes
        const origPush = dl.push.bind(dl);
        dl.push = (...args: DataLayerEntry[]): number => {
          const result = origPush(...args);
          for (const entry of args) {
            this._extractFromDataLayerEntry(entry);
          }
          return result;
        };
      }

      // Custom user data object
      const userDataKey = config.advancedMatching.userDataKey;
      if (userDataKey && window[userDataKey]) {
        this._extractUserObject(window[userDataKey] as Record<string, unknown>, 'customDataLayer');
      }
    },

    _extractFromDataLayerEntry(entry: DataLayerEntry): void {
      if (!entry || typeof entry !== 'object') return;

      const userKeys = ['user', 'userData', 'user_data', 'customer', 'visitor', 'contact'];
      for (const key of userKeys) {
        if (entry[key] && typeof entry[key] === 'object') {
          this._extractUserObject(entry[key] as Record<string, unknown>, 'dataLayer');
        }
      }

      if (entry.ecommerce) {
        const ecom = entry.ecommerce;
        if (ecom.purchase?.actionField) {
          const af = ecom.purchase.actionField;
          if (af.email) this._mergeCapture('dataLayer', { em: af.email });
        }
      }

      this._extractUserObject(entry as Record<string, unknown>, 'dataLayer');
    },

    _extractUserObject(obj: Record<string, unknown>, source: CaptureSource): void {
      if (!obj || typeof obj !== 'object') return;

      const data: Partial<Record<PiiField, string>> = {};
      const fieldMap: Record<string, PiiField> = {
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

      for (const [key, param] of Object.entries(fieldMap)) {
        const val = obj[key];
        if (val && typeof val === 'string' && val.trim()) {
          data[param] = val.trim();
        }
      }

      if (Object.keys(data).length > 0) {
        this._mergeCapture(source, data);
        log('AdvancedMatching: data layer captured', Object.keys(data));
      }
    },

    // ── META TAG CAPTURE ─────────────────────────────────────

    captureFromMetaTags(): void {
      const data: Partial<Record<PiiField, string>> = {};

      // Schema.org / JSON-LD
      const scripts = document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const json = JSON.parse(script.textContent || '{}') as Record<string, unknown>;
          if (json.email) data.em = json.email as string;
          if (json.telephone) data.ph = json.telephone as string;
          if (json.givenName) data.fn = json.givenName as string;
          if (json.familyName) data.ln = json.familyName as string;
          if (json.address && typeof json.address === 'object') {
            const addr = json.address as Record<string, string>;
            if (addr.addressLocality) data.ct = addr.addressLocality;
            if (addr.addressRegion) data.st = addr.addressRegion;
            if (addr.postalCode) data.zp = addr.postalCode;
            if (addr.addressCountry) data.country = addr.addressCountry;
          }
        } catch { /* invalid JSON-LD */ }
      }

      // OpenGraph profile tags
      const ogEmail = document.querySelector<HTMLMetaElement>('meta[property="profile:email"]');
      if (ogEmail?.content) data.em = ogEmail.content;

      const ogFirstName = document.querySelector<HTMLMetaElement>('meta[property="profile:first_name"]');
      if (ogFirstName?.content) data.fn = ogFirstName.content;

      const ogLastName = document.querySelector<HTMLMetaElement>('meta[property="profile:last_name"]');
      if (ogLastName?.content) data.ln = ogLastName.content;

      const ogGender = document.querySelector<HTMLMetaElement>('meta[property="profile:gender"]');
      if (ogGender?.content) data.ge = ogGender.content;

      if (Object.keys(data).length > 0) {
        this._mergeCapture('metatag', data);
        log('AdvancedMatching: meta tags captured', Object.keys(data));
      }
    },

    // ── IDENTITY GRAPH ───────────────────────────────────────

    _sourcePriority: {
      explicit: 100,
      identify: 90,
      form: 80,
      form_prefill: 70,
      url: 60,
      dataLayer: 50,
      customDataLayer: 50,
      metatag: 30,
    } satisfies Record<CaptureSource, number>,

    _mergeCapture(source: CaptureSource, data: Partial<Record<string, string>>): void {
      for (const [param, value] of Object.entries(data)) {
        if (!value) continue;
        const existing = this._capturedData[param];
        const existingPriority = existing ? (this._sourcePriority[existing.source] || 0) : -1;
        const newPriority = this._sourcePriority[source] || 0;

        if (!existing || newPriority >= existingPriority) {
          this._capturedData[param] = { value, source };
        }
      }
    },

    getCapturedData(): Partial<Record<PiiField, string>> {
      const result: Partial<Record<string, string>> = {};
      for (const [param, entry] of Object.entries(this._capturedData)) {
        result[param] = entry.value;
      }
      return result;
    },

    async buildUserData(explicitUserData: UserDataInput = {}): Promise<HashedUserData> {
      // Start with auto-captured data (lowest priority, gets overwritten)
      const merged: Record<string, string> = { ...this.getCapturedData() } as Record<string, string>;

      // Layer on stored identity
      const storageMap: Partial<Record<PiiField, string>> = {
        em: '_mt_em', ph: '_mt_ph', external_id: '_mt_eid',
        fn: '_mt_fn', ln: '_mt_ln', ct: '_mt_ct', st: '_mt_st',
        zp: '_mt_zp', country: '_mt_country',
      };

      for (const [field, storageKey] of Object.entries(storageMap)) {
        if (!merged[field] && storageKey) {
          const stored = getFromStorage(storageKey);
          if (stored) merged[field] = stored;
        }
      }

      // Layer on explicit userData (highest priority for PII)
      const aliasMap: Record<FieldAlias, PiiField> = {
        email: 'em', phone: 'ph', first_name: 'fn', last_name: 'ln',
        gender: 'ge', date_of_birth: 'db', city: 'ct', state: 'st',
        zip: 'zp', zipcode: 'zp', postal_code: 'zp',
      };

      for (const [key, value] of Object.entries(explicitUserData)) {
        const param = aliasMap[key as FieldAlias] || key;
        if (value) merged[param] = value;
      }

      // Normalize + hash PII fields
      const result = await this.normalizeAndHash(merged);

      // Add browser identifiers (not hashed)
      result.fbp = result.fbp || CookieKeeper.getFbp() || undefined;
      result.fbc = result.fbc || CookieKeeper.getFbc() || undefined;
      result.client_user_agent = result.client_user_agent || navigator.userAgent;

      // Auto external_id from visitor ID if still missing
      if (!result.external_id) {
        const visitorId = CookieKeeper.getVisitorId();
        if (visitorId) result.external_id = (await sha256(visitorId)) ?? undefined;
      }

      return result;
    },

    scoreMatchQuality(userData: HashedUserData): number {
      let score = 0;
      const weights: Record<string, number> = {
        em: 30, ph: 25, external_id: 15,
        fn: 5, ln: 5, ct: 3, st: 2, zp: 3, country: 2,
        ge: 2, db: 3, fbp: 5, fbc: 10,
        client_ip_address: 3, client_user_agent: 2,
      };

      for (const [field, weight] of Object.entries(weights)) {
        if ((userData as Record<string, unknown>)[field]) score += weight;
      }

      return Math.min(score, 100);
    },

    getDiagnostics(): MatchDiagnostics {
      const captured: Record<string, { source: CaptureSource; hasValue: boolean; isHashed: boolean }> = {};
      for (const [param, entry] of Object.entries(this._capturedData)) {
        captured[param] = {
          source: entry.source,
          hasValue: true,
          isHashed: isHashed(entry.value),
        };
      }
      return {
        capturedFields: Object.keys(this._capturedData).length,
        fields: captured,
        storedIdentity: {
          em: !!getFromStorage('_mt_em'),
          ph: !!getFromStorage('_mt_ph'),
          fn: !!getFromStorage('_mt_fn'),
          ln: !!getFromStorage('_mt_ln'),
          external_id: !!getFromStorage('_mt_eid'),
        },
      };
    },
  };

  // ══════════════════════════════════════════════════════════════
  // ── COOKIE KEEPER
  // ══════════════════════════════════════════════════════════════

  const CookieKeeper = {
    init(): void {
      if (!config.cookieKeeper.enabled) return;
      this.restoreCookies();
      this.captureFbclid();
      this.ensureFbp();
      this.ensureVisitorId();
      this.syncToServer();
      this.scheduleRefresh();
      log('CookieKeeper: ready', { fbp: this.getFbp(), fbc: this.getFbc() });
    },

    restoreCookies(): void {
      const cookieNames = config.cookieKeeper.cookieNames || [];
      for (const name of cookieNames) {
        if (!getCookie(name)) {
          try {
            const backup = localStorage.getItem('mt_' + name);
            if (backup) setCookie(name, backup, config.cookieKeeper.maxAge);
          } catch { /* no localStorage */ }
        } else {
          try { localStorage.setItem('mt_' + name, getCookie(name)!); } catch { /* silently fail */ }
        }
      }
    },

    captureFbclid(): void {
      try {
        const fbclid = new URL(window.location.href).searchParams.get('fbclid');
        if (fbclid) {
          const fbc = `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}`;
          saveToStorage('_fbc', fbc, config.cookieKeeper.maxAge);
        }
      } catch { /* invalid URL */ }
    },

    ensureFbp(): void {
      if (!getFromStorage('_fbp')) {
        const fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 2147483647)}`;
        saveToStorage('_fbp', fbp, config.cookieKeeper.maxAge);
      }
    },

    ensureVisitorId(): void {
      if (!getFromStorage('_mt_id')) {
        generateVisitorId();
      }
    },

    async syncToServer(): Promise<void> {
      const cookies: Record<string, string | null> = {
        _fbp: getFromStorage('_fbp'),
        _fbc: getFromStorage('_fbc'),
        _mt_id: getFromStorage('_mt_id'),
        _mt_em: getFromStorage('_mt_em'),
        _mt_ph: getFromStorage('_mt_ph'),
      };
      if (!cookies._fbp && !cookies._fbc && !cookies._mt_id) return;

      const lastSync = getFromStorage('_mt_cookie_sync');
      if (lastSync && (Date.now() - parseInt(lastSync, 10)) < config.cookieKeeper.refreshInterval) return;

      try {
        await transportSend(resolveEndpoint('/cookie-sync'), {
          cookies,
          domain: window.location.hostname,
          max_age: config.cookieKeeper.maxAge,
        });
        saveToStorage('_mt_cookie_sync', Date.now().toString(), 1);
      } catch (e) {
        warn('CookieKeeper: sync failed', (e as Error).message);
      }
    },

    refreshCookies(): void {
      const days = config.cookieKeeper.maxAge;
      for (const name of (config.cookieKeeper.cookieNames || [])) {
        const value = getFromStorage(name);
        if (value) setCookie(name, value, days);
      }
      saveToStorage('_mt_cookie_sync', '0', 1);
      this.syncToServer();
    },

    scheduleRefresh(): void {
      if (cookieKeeperTimer) clearInterval(cookieKeeperTimer);
      cookieKeeperTimer = setInterval(() => this.refreshCookies(), config.cookieKeeper.refreshInterval);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.restoreCookies();
      });
    },

    getFbp(): string | null { return getFromStorage('_fbp'); },
    getFbc(): string | null { return getFromStorage('_fbc'); },
    getVisitorId(): string | null { return getFromStorage('_mt_id'); },
  };

  // ══════════════════════════════════════════════════════════════
  // ── AD BLOCKER RECOVERY
  // ══════════════════════════════════════════════════════════════

  const AdBlockRecovery = {
    async detect(): Promise<boolean> {
      if (!config.adBlockRecovery.enabled) return false;
      try {
        const testUrl = config.endpoint.replace(/\/track\/?$/, '') + '/health';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(testUrl, { method: 'GET', signal: controller.signal, cache: 'no-store' });
        clearTimeout(timeout);
        if (!response.ok) throw new Error('Blocked');
        return false;
      } catch {
        adBlockDetected = true;
        log('AdBlockRecovery: DETECTED');
        return true;
      }
    },

    getEndpoint(path: string): string {
      if (adBlockDetected && config.adBlockRecovery.proxyPath) {
        return config.endpoint.replace(/\/api\/v1\/track\/?$/, '') + config.adBlockRecovery.proxyPath + path;
      }
      return config.endpoint + path;
    },

    getFallbackEndpoints(path: string): string[] {
      const eps = [this.getEndpoint(path)];
      if (config.adBlockRecovery.customEndpoints) {
        for (const ep of config.adBlockRecovery.customEndpoints) eps.push(ep + path);
      }
      return eps;
    },

    disguisePayload(data: unknown): DisguisedPayload {
      return { d: btoa(JSON.stringify(data)), t: Date.now(), v: VERSION };
    },

    getHeaders(): Record<string, string> {
      const h: Record<string, string> = { 'Content-Type': 'application/json' };
      h[adBlockDetected ? 'X-Request-Token' : 'X-API-Key'] = config.apiKey;
      return h;
    },
  };

  // ══════════════════════════════════════════════════════════════
  // ── PIXEL ROUTER
  // ══════════════════════════════════════════════════════════════

  const PixelRouter = {
    resolve(hostname?: string): string[] {
      hostname = hostname || window.location.hostname;
      if (!config.pixels || config.pixels.length === 0) return config.pixelId ? [config.pixelId] : [];
      const matched: string[] = [];
      let catchAll: string | null = null;

      for (const pc of config.pixels) {
        if (!pc.pixelId || !pc.domains) continue;
        for (const pattern of pc.domains) {
          if (pattern === '*') { catchAll = pc.pixelId; continue; }
          if (this.matchDomain(hostname, pattern)) { matched.push(pc.pixelId); break; }
        }
      }

      if (matched.length === 0 && catchAll) matched.push(catchAll);
      return [...new Set(matched)];
    },

    matchDomain(hostname: string, pattern: string): boolean {
      if (hostname === pattern) return true;
      if (pattern.startsWith('*.')) {
        const suffix = pattern.substring(2);
        return hostname.endsWith('.' + suffix) || hostname === suffix;
      }
      return hostname.endsWith('.' + pattern);
    },

    getAllPixelIds(): string[] {
      if (!config.pixels || config.pixels.length === 0) return config.pixelId ? [config.pixelId] : [];
      return [...new Set(config.pixels.map(p => p.pixelId).filter(Boolean))];
    },
  };

  // ══════════════════════════════════════════════════════════════
  // ── TRANSPORT LAYER
  // ══════════════════════════════════════════════════════════════

  function resolveEndpoint(path: string): string {
    return adBlockDetected ? AdBlockRecovery.getEndpoint(path) : config.endpoint + path;
  }

  async function transportFetch(url: string, data: unknown): Promise<Record<string, unknown>> {
    const headers = AdBlockRecovery.getHeaders();
    const body = adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data;
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      keepalive: true,
      credentials: 'include',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json().catch(() => ({}));
  }

  function transportBeacon(url: string, data: unknown): Promise<Record<string, unknown>> {
    const body = adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data;
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    if (!navigator.sendBeacon(url + '?api_key=' + encodeURIComponent(config.apiKey), blob)) {
      throw new Error('Beacon failed');
    }
    return Promise.resolve({ sent: true });
  }

  function transportXhr(url: string, data: unknown): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      const headers = AdBlockRecovery.getHeaders();
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.withCredentials = true;
      xhr.timeout = 10000;
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve(JSON.parse(xhr.responseText || '{}'))
          : reject(new Error(`XHR ${xhr.status}`));
      xhr.onerror = () => reject(new Error('XHR error'));
      xhr.ontimeout = () => reject(new Error('XHR timeout'));
      xhr.send(JSON.stringify(adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data));
    });
  }

  function transportImage(url: string, data: unknown): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const encoded = btoa(JSON.stringify(data));
      const params = new URLSearchParams({ d: encoded, k: config.apiKey, t: Date.now().toString() });
      const imgUrl = url.replace(/\/(event|batch)$/, '/pixel.gif') + '?' + params;
      if (imgUrl.length > 4000) { reject(new Error('Payload too large')); return; }
      const img = new Image(1, 1);
      img.onload = () => resolve({ sent: true });
      img.onerror = () => reject(new Error('Image pixel failed'));
      img.src = imgUrl;
    });
  }

  async function transportSend(url: string, data: unknown, attempt = 0): Promise<Record<string, unknown> | undefined> {
    const transports: TransportDef[] = [
      { name: 'fetch', fn: transportFetch },
      { name: 'beacon', fn: transportBeacon, skip: !config.adBlockRecovery.useBeacon },
      { name: 'xhr', fn: transportXhr },
      { name: 'img', fn: transportImage, skip: !config.adBlockRecovery.useImage },
    ].filter(t => !t.skip);

    for (const transport of transports) {
      const pathSuffix = url.includes(config.endpoint)
        ? url.replace(config.endpoint, '')
        : url.replace(/^https?:\/\/[^\/]+/, '').replace(/.*\/api\/v1\/track/, '');
      const endpoints = adBlockDetected ? AdBlockRecovery.getFallbackEndpoints(pathSuffix) : [url];

      for (const ep of endpoints) {
        try {
          const result = await transport.fn(ep, data);
          if (transport.name !== transportMethod) {
            log(`Transport: ${transportMethod} → ${transport.name}`);
            transportMethod = transport.name;
          }
          return result;
        } catch (e) {
          log(`${transport.name} → ${ep}: ${(e as Error).message}`);
        }
      }
    }

    if (attempt < RETRY_DELAYS.length) {
      return new Promise(r =>
        setTimeout(() => r(transportSend(url, data, attempt + 1)), RETRY_DELAYS[attempt])
      );
    }

    warn('All transports exhausted');
    return undefined;
  }

  // ── Core Tracking ──────────────────────────────────────────────

  async function sendEvents(events: TrackEvent[]): Promise<void> {
    if (!events.length) return;
    const url = events.length === 1 ? resolveEndpoint('/event') : resolveEndpoint('/batch');
    const body = events.length === 1 ? events[0] : { events };
    try { await transportSend(url, body); } catch (e) { warn('Send failed:', e); }
  }

  function flushQueue(): void {
    if (!queue.length) return;
    sendEvents(queue.splice(0, MAX_QUEUE_SIZE));
  }

  function enqueueEvent(event: TrackEvent): void {
    queue.push(event);
    if (config.batchEvents) {
      if (batchTimer) clearTimeout(batchTimer);
      batchTimer = setTimeout(flushQueue, BATCH_INTERVAL);
    } else {
      flushQueue();
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ── PUBLIC API
  // ══════════════════════════════════════════════════════════════

  const MetaTracker: MetaTrackerApi = {
    VERSION,

    async init(options: TrackerInitOptions): Promise<MetaTrackerApi> {
      if (initialized) { warn('Already initialized'); return this; }
      if (!options.endpoint || !options.apiKey) { warn('Missing: endpoint, apiKey'); return this; }
      if (!('pixelId' in options && options.pixelId) &&
          !('pixels' in options && options.pixels?.length)) {
        warn('Missing: pixelId or pixels[]');
        return this;
      }
      if (options.respectDnt && (navigator.doNotTrack === '1' || window.doNotTrack === '1')) return this;

      config = {
        ...config,
        ...options,
        cookieKeeper: { ...config.cookieKeeper, ...(options.cookieKeeper || {}) },
        adBlockRecovery: { ...config.adBlockRecovery, ...(options.adBlockRecovery || {}) },
        advancedMatching: { ...config.advancedMatching, ...(options.advancedMatching || {}) },
      } as TrackerConfig;

      initialized = true;
      log('Initialized v' + VERSION);

      CookieKeeper.init();
      AdvancedMatching.init();

      if (config.adBlockRecovery.enabled) {
        AdBlockRecovery.detect().then(b => { if (b) log('Ad blocker recovery: ACTIVE'); });
      }

      if (config.autoPageView) this.trackPageView();

      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushQueue();
      });
      window.addEventListener('beforeunload', flushQueue);

      return this;
    },

    async track(
      eventName: string,
      customData: Record<string, unknown> = {},
      userData: UserDataInput = {},
      options: TrackOptions = {},
    ): Promise<string | undefined> {
      if (!initialized) { warn('Not initialized'); return undefined; }

      const eventId = options.event_id || generateEventId();

      const enrichedUserData = config.advancedMatching.enabled
        ? await AdvancedMatching.buildUserData(userData)
        : await AdvancedMatching.normalizeAndHash(userData);

      const matchScore = AdvancedMatching.scoreMatchQuality(enrichedUserData);
      log(`Match quality: ${matchScore}/100`);

      const pixelIds = options.pixel_id ? [options.pixel_id] : PixelRouter.resolve();
      if (!pixelIds.length) { warn('No pixel for:', window.location.hostname); return undefined; }

      for (const pixelId of pixelIds) {
        const event: TrackEvent = {
          pixel_id: pixelId,
          event_name: eventName,
          event_id: pixelIds.length > 1 ? `${eventId}_${pixelId.slice(-4)}` : eventId,
          event_time: Math.floor(Date.now() / 1000),
          event_source_url: window.location.href,
          action_source: options.action_source || 'website',
          user_data: { ...enrichedUserData },
          match_quality: matchScore,
          visitor_id: CookieKeeper.getVisitorId() || null,
        };

        if (Object.keys(customData).length > 0) event.custom_data = customData;

        log('Track:', eventName, '→', pixelId, `(match: ${matchScore})`);
        enqueueEvent(event);
      }

      return eventId;
    },

    // ── Convenience methods ────────────────────────────────────

    trackPageView(ud: UserDataInput = {}): Promise<string | undefined> {
      return this.track('PageView', {}, ud);
    },
    trackViewContent(cd: Record<string, unknown> = {}, ud: UserDataInput = {}): Promise<string | undefined> {
      return this.track('ViewContent', cd, ud);
    },
    trackAddToCart(cd: Record<string, unknown> = {}, ud: UserDataInput = {}): Promise<string | undefined> {
      return this.track('AddToCart', cd, ud);
    },
    trackPurchase(cd: Record<string, unknown> = {}, ud: UserDataInput = {}): Promise<string | undefined> {
      return this.track('Purchase', cd, ud);
    },
    trackLead(cd: Record<string, unknown> = {}, ud: UserDataInput = {}): Promise<string | undefined> {
      return this.track('Lead', cd, ud);
    },
    trackCompleteRegistration(cd: Record<string, unknown> = {}, ud: UserDataInput = {}): Promise<string | undefined> {
      return this.track('CompleteRegistration', cd, ud);
    },
    trackInitiateCheckout(cd: Record<string, unknown> = {}, ud: UserDataInput = {}): Promise<string | undefined> {
      return this.track('InitiateCheckout', cd, ud);
    },
    trackSearch(cd: Record<string, unknown> = {}, ud: UserDataInput = {}): Promise<string | undefined> {
      return this.track('Search', cd, ud);
    },
    trackToPixel(pixelId: string, name: string, cd: Record<string, unknown> = {}, ud: UserDataInput = {}): Promise<string | undefined> {
      return this.track(name, cd, ud, { pixel_id: pixelId });
    },

    // ── Identity ───────────────────────────────────────────────

    async identify(userData: UserDataInput = {}): Promise<void> {
      if (!initialized) { warn('Not initialized'); return; }

      const aliasMap: Record<string, PiiField> = {
        email: 'em', phone: 'ph', first_name: 'fn', last_name: 'ln',
        gender: 'ge', date_of_birth: 'db', city: 'ct', state: 'st',
        zip: 'zp', zipcode: 'zp', postal_code: 'zp',
      };

      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(userData)) {
        if (!value) continue;
        const param = aliasMap[key] || key;
        normalized[param] = value;
      }

      const hashed = await AdvancedMatching.normalizeAndHash(normalized);

      const storageMap: Partial<Record<PiiField, string>> = {
        em: '_mt_em', ph: '_mt_ph', fn: '_mt_fn', ln: '_mt_ln',
        external_id: '_mt_eid', ct: '_mt_ct', st: '_mt_st',
        zp: '_mt_zp', country: '_mt_country',
      };

      for (const [field, key] of Object.entries(storageMap)) {
        const val = (hashed as Record<string, string | undefined>)[field];
        if (val && key) saveToStorage(key, val, config.cookieKeeper.maxAge);
      }

      AdvancedMatching._mergeCapture('identify', normalized);

      log('Identify:', Object.keys(hashed).filter(
        k => (hashed as Record<string, unknown>)[k] && !['client_user_agent', 'fbp', 'fbc'].includes(k)
      ));
      CookieKeeper.syncToServer();
    },

    clearIdentity(): void {
      const keys = ['_mt_em', '_mt_ph', '_mt_fn', '_mt_ln', '_mt_eid',
                     '_mt_ct', '_mt_st', '_mt_zp', '_mt_country'];
      keys.forEach(k => removeFromStorage(k));
      AdvancedMatching._capturedData = {};
      log('Identity cleared');
    },

    // ── Multi-domain ───────────────────────────────────────────

    addPixel(pixelId: string, domains: string | string[]): void {
      config.pixels.push({ pixelId, domains: Array.isArray(domains) ? domains : [domains] });
    },

    removePixel(pixelId: string): void {
      config.pixels = config.pixels.filter(p => p.pixelId !== pixelId);
    },

    // ── Cookie Keeper ──────────────────────────────────────────

    refreshCookies(): void {
      CookieKeeper.refreshCookies();
    },

    // ── Diagnostics ────────────────────────────────────────────

    flush(): void { flushQueue(); },
    isAdBlocked(): boolean { return adBlockDetected; },
    getTransport(): string { return transportMethod; },

    getDebugInfo(): DebugInfo {
      return {
        version: VERSION,
        initialized,
        transport: transportMethod,
        adBlockDetected,
        config: { endpoint: config.endpoint, pixelId: config.pixelId, pixelCount: config.pixels.length },
        cookies: { fbp: CookieKeeper.getFbp(), fbc: CookieKeeper.getFbc(), visitorId: CookieKeeper.getVisitorId() },
        routing: { domain: window.location.hostname, active: PixelRouter.resolve(), all: PixelRouter.getAllPixelIds() },
        advancedMatching: AdvancedMatching.getDiagnostics(),
        queueSize: queue.length,
      };
    },

    async getMatchQuality(extraUserData: UserDataInput = {}): Promise<MatchQualityResult> {
      const userData = config.advancedMatching.enabled
        ? await AdvancedMatching.buildUserData(extraUserData)
        : await AdvancedMatching.normalizeAndHash(extraUserData);
      return {
        score: AdvancedMatching.scoreMatchQuality(userData),
        fields: Object.keys(userData).filter(k => (userData as Record<string, unknown>)[k]),
      };
    },

    addUserData(data: UserDataInput, source: CaptureSource = 'explicit'): void {
      AdvancedMatching._mergeCapture(source, data as Partial<Record<string, string>>);
    },
  };

  // ── Expose globally ────────────────────────────────────────────

  window.MetaTracker = MetaTracker;

  if (window.MetaTrackerQueue && Array.isArray(window.MetaTrackerQueue)) {
    window.MetaTrackerQueue.forEach(([method, ...args]) => {
      const fn = (MetaTracker as unknown as Record<string, unknown>)[method];
      if (typeof fn === 'function') (fn as (...a: unknown[]) => void).apply(MetaTracker, args);
    });
  }

})(window, document);

// ══════════════════════════════════════════════════════════════
// ── PUBLIC API TYPE (for external consumers)
// ══════════════════════════════════════════════════════════════

export interface MetaTrackerApi {
  readonly VERSION: string;

  init(options: TrackerInitOptions): Promise<MetaTrackerApi>;
  track(eventName: string, customData?: Record<string, unknown>, userData?: UserDataInput, options?: TrackOptions): Promise<string | undefined>;

  // Convenience methods
  trackPageView(userData?: UserDataInput): Promise<string | undefined>;
  trackViewContent(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
  trackAddToCart(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
  trackPurchase(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
  trackLead(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
  trackCompleteRegistration(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
  trackInitiateCheckout(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
  trackSearch(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
  trackToPixel(pixelId: string, name: string, customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;

  // Identity
  identify(userData?: UserDataInput): Promise<void>;
  clearIdentity(): void;

  // Multi-domain
  addPixel(pixelId: string, domains: string | string[]): void;
  removePixel(pixelId: string): void;

  // Cookie Keeper
  refreshCookies(): void;

  // Diagnostics
  flush(): void;
  isAdBlocked(): boolean;
  getTransport(): string;
  getDebugInfo(): DebugInfo;
  getMatchQuality(extraUserData?: UserDataInput): Promise<MatchQualityResult>;
  addUserData(data: UserDataInput, source?: string): void;
}
