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
 *       autoCaptureForms: true,   // Watch form inputs
 *       captureUrlParams: true,   // Extract from URL
 *       captureDataLayer: true,   // Read GTM dataLayer
 *       captureMetaTags: true,    // Read og/schema tags
 *       formFieldMap: {},         // Custom field→param mapping
 *     },
 *   });
 */
(function (window, document) {
  'use strict';

  const VERSION = '2.1.0';
  const MAX_QUEUE_SIZE = 50;
  const RETRY_DELAYS = [1000, 5000, 15000];
  const BATCH_INTERVAL = 2000;

  // ── State ──────────────────────────────────────────────────────

  let config = {
    endpoint: "https://meta.wakandaslots.com/api/v1/track",
    apiKey: "77KTyMIdlLOR7HGvyO3Jm02DfFntnka0nYSxWIoiP9YkhVoPLRgy9N6aWZovuyvbm6GdO59tKRHLWAVFq0cWTokaRrwGhnsIZ3le7WD9rIbU5WHbSkhCxjYKc6by23Tk",
    pixelId: "1515428220005755",
    pixels: [],
    autoPageView: true,
    debug: false,
    hashPii: true,
    respectDnt: false,
    batchEvents: true,
    minMatchQuality: 60,
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
    browserPixel: {
      enabled: true,             // Auto-load Meta browser pixel (fbevents.js)
      autoPageView: true,         // Fire fbq('track', 'PageView') on init
      syncEvents: true,           // Mirror tracked events to browser pixel with same event_id
    },
    consent: {
      enabled: false,             // Enable consent management
      mode: 'opt-in',            // 'opt-in' = block until consent, 'opt-out' = allow until revoked
      consentCategory: 'C0004',  // OneTrust category for advertising/targeting
      waitForConsent: true,      // Queue events while waiting for consent
      defaultConsent: false,     // Default consent state before CMP responds
    },
    advancedMatching: {
      enabled: true,
      autoCaptureForms: true,
      captureUrlParams: true,
      captureDataLayer: true,
      captureMetaTags: true,
      autoIdentifyOnSubmit: true, // Auto-persist identity when form submitted
      formFieldMap: {},           // Custom CSS selector → param mapping
      dataLayerKey: 'dataLayer',  // GTM default
      userDataKey: null,          // Custom window object (e.g. 'userData')
    },
  };

  let queue = [];
  let batchTimer = null;
  let initialized = false;
  let transportMethod = 'fetch';
  let adBlockDetected = false;
  let cookieKeeperTimer = null;

  // ── Utilities ──────────────────────────────────────────────────

  function log(...args) {
    if (config.debug) console.log('[MetaTracker]', ...args);
  }
  function warn(...args) {
    if (config.debug) console.warn('[MetaTracker]', ...args);
  }

  function generateEventId() {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
  }

  function generateVisitorId() {
    const stored = getFromStorage('_mt_id');
    if (stored) return stored;
    const id = 'mt.' + Date.now().toString(36) + '.' + Math.random().toString(36).substring(2, 12);
    saveToStorage('_mt_id', id);
    return id;
  }

  async function sha256(value) {
    if (!value) return null;
    const normalized = value.toString().trim().toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function isHashed(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  }

  // ── Storage Helpers ────────────────────────────────────────────

  function setCookie(name, value, days) {
    const maxAge = days * 86400;
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    const domain = getRootDomain();
    const domainStr = domain ? `; domain=.${domain}` : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/${domainStr}; max-age=${maxAge}; SameSite=Lax${secure}`;
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function deleteCookie(name) {
    const domain = getRootDomain();
    const domainStr = domain ? `; domain=.${domain}` : '';
    document.cookie = `${name}=; path=/${domainStr}; max-age=0`;
  }

  function getRootDomain() {
    try {
      const parts = window.location.hostname.split('.');
      if (parts.length <= 1 || /^\d+$/.test(parts[parts.length - 1])) return '';
      return parts.slice(-2).join('.');
    } catch (e) { return ''; }
  }

  function getFromStorage(key) {
    const cookieVal = getCookie(key);
    if (cookieVal) return cookieVal;
    try { return localStorage.getItem('mt_' + key); } catch (e) { return null; }
  }

  function saveToStorage(key, value, days) {
    days = days || (config.cookieKeeper.maxAge || 180);
    setCookie(key, value, days);
    try { localStorage.setItem('mt_' + key, value); } catch (e) {}
  }

  function removeFromStorage(key) {
    deleteCookie(key);
    try { localStorage.removeItem('mt_' + key); } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════
  // ── ADVANCED MATCHING
  // ══════════════════════════════════════════════════════════════
  //
  // Meta Advanced Matching improves event match quality by
  // collecting and properly hashing user PII parameters.
  //
  // Data sources (in priority order):
  //   1. Explicit userData passed to track()
  //   2. identify() stored identity
  //   3. Auto-captured form data
  //   4. URL parameters
  //   5. DataLayer / GTM
  //   6. Meta tags / structured data
  //
  // All PII is normalized per Meta's requirements BEFORE hashing.
  //
  // ══════════════════════════════════════════════════════════════

  const AdvancedMatching = {
    // Collected user data from auto-capture sources
    _capturedData: {},
    _formObserver: null,
    _formListeners: new WeakSet(),

    init() {
      if (!config.advancedMatching.enabled) return;

      log('AdvancedMatching: initializing');

      if (config.advancedMatching.captureUrlParams) this.captureFromUrl();
      if (config.advancedMatching.captureMetaTags) this.captureFromMetaTags();
      if (config.advancedMatching.captureDataLayer) this.captureFromDataLayer();
      if (config.advancedMatching.autoCaptureForms) this.watchForms();

      log('AdvancedMatching: ready, captured:', Object.keys(this._capturedData));
    },

    // ── META-SPECIFIC NORMALIZER ──────────────────────────────
    //
    // Each parameter has specific normalization rules per Meta docs:
    // https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters

    normalizers: {
      /**
       * Email: trim, lowercase. No hashing if already hashed.
       */
      em(value) {
        if (!value || typeof value !== 'string') return null;
        value = value.trim().toLowerCase();
        // Basic email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
        return value;
      },

      /**
       * Phone: digits only, remove formatting, must include country code.
       * Meta requires format: digits only, no +, no dashes, with country code.
       */
      ph(value) {
        if (!value || typeof value !== 'string') return null;
        // Strip all non-digit characters
        let digits = value.replace(/\D/g, '');
        if (digits.length < 7) return null;
        // If starts with 00, replace with nothing (international prefix)
        if (digits.startsWith('00')) digits = digits.substring(2);
        // Ensure minimum length (country code + number)
        if (digits.length < 10) {
          // Might be missing country code — can't reliably add one
          // but still valid if 7+ digits
        }
        return digits || null;
      },

      /**
       * First/Last name: trim, lowercase, remove digits and special chars.
       * Meta: Use a-z only. Remove accents if possible.
       */
      fn(value) {
        if (!value || typeof value !== 'string') return null;
        value = value.trim().toLowerCase();
        // Remove titles and suffixes
        value = value.replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s*/i, '');
        // Remove non-alpha except spaces (for multi-word names)
        value = value.replace(/[^a-z\s\u00C0-\u024F]/g, '');
        // Normalize accents
        try { value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
        return value.trim() || null;
      },

      ln(value) {
        return AdvancedMatching.normalizers.fn(value);
      },

      /**
       * Gender: single char, 'm' or 'f'.
       */
      ge(value) {
        if (!value || typeof value !== 'string') return null;
        value = value.trim().toLowerCase();
        if (value.startsWith('m') || value === 'male') return 'm';
        if (value.startsWith('f') || value === 'female') return 'f';
        return null;
      },

      /**
       * Date of birth: YYYYMMDD format.
       */
      db(value) {
        if (!value || typeof value !== 'string') return null;
        value = value.trim();
        // Already in YYYYMMDD
        if (/^\d{8}$/.test(value)) return value;
        // Try parsing common formats
        const formats = [
          /^(\d{4})-(\d{2})-(\d{2})$/,   // YYYY-MM-DD
          /^(\d{2})\/(\d{2})\/(\d{4})$/,  // MM/DD/YYYY
          /^(\d{2})-(\d{2})-(\d{4})$/,    // MM-DD-YYYY
        ];
        for (const regex of formats) {
          const m = value.match(regex);
          if (m) {
            if (m[1].length === 4) return m[1] + m[2] + m[3]; // YYYY-MM-DD
            return m[3] + m[1] + m[2]; // MM/DD/YYYY or MM-DD-YYYY
          }
        }
        return null;
      },

      /**
       * City: lowercase, no punctuation, no digits.
       */
      ct(value) {
        if (!value || typeof value !== 'string') return null;
        value = value.trim().toLowerCase();
        value = value.replace(/[^a-z\s\u00C0-\u024F]/g, '');
        try { value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
        return value.trim() || null;
      },

      /**
       * State: 2-letter code, lowercase.
       */
      st(value) {
        if (!value || typeof value !== 'string') return null;
        value = value.trim().toLowerCase();
        // If it's a 2-letter code, use it directly
        if (/^[a-z]{2}$/.test(value)) return value;
        // Try to extract a 2-letter code from common formats
        const match = value.match(/\b([a-z]{2})\b/);
        return match ? match[1] : value.substring(0, 2);
      },

      /**
       * Zip/Postal: lowercase, first 5 chars for US.
       * For other countries, use full code without spaces.
       */
      zp(value) {
        if (!value || typeof value !== 'string') return null;
        value = value.trim().toLowerCase().replace(/\s+/g, '');
        // US: take first 5 digits
        if (/^\d{5}(-\d{4})?$/.test(value)) return value.substring(0, 5);
        return value || null;
      },

      /**
       * Country: 2-letter ISO code, lowercase.
       */
      country(value) {
        if (!value || typeof value !== 'string') return null;
        value = value.trim().toLowerCase();
        if (/^[a-z]{2}$/.test(value)) return value;
        // Common full names → codes
        const map = {
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
        return map[value] || (value.length === 2 ? value : null);
      },

      /**
       * External ID: trim, no normalization needed, but hash.
       */
      external_id(value) {
        if (!value || typeof value !== 'string') return null;
        return value.trim() || null;
      },
    },

    /**
     * Normalize a single field value using Meta's rules.
     */
    normalize(field, value) {
      if (isHashed(value)) return value; // Already hashed
      const normalizer = this.normalizers[field];
      return normalizer ? normalizer(value) : (value ? String(value).trim().toLowerCase() : null);
    },

    /**
     * Normalize + hash an entire user_data object per Meta spec.
     * This replaces the old generic hashUserData function.
     */
    async normalizeAndHash(userData) {
      if (!userData) return {};

      const piiFields = ['em', 'ph', 'fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'];
      const result = {};

      for (const field of piiFields) {
        let value = userData[field];
        if (!value) continue;

        if (isHashed(value)) {
          result[field] = value;
          continue;
        }

        // Normalize per Meta spec
        const normalized = this.normalize(field, value);
        if (!normalized) continue;

        // Hash
        if (config.hashPii) {
          result[field] = await sha256(normalized);
        } else {
          result[field] = normalized;
        }
      }

      // Non-PII fields: copy as-is
      const nonPiiFields = ['client_ip_address', 'client_user_agent', 'fbc', 'fbp',
                            'subscription_id', 'fb_login_id', 'lead_id'];
      for (const field of nonPiiFields) {
        if (userData[field]) result[field] = userData[field];
      }

      return result;
    },

    // ── FORM AUTO-CAPTURE ─────────────────────────────────────

    /**
     * Default field detection patterns.
     * Maps input attributes → Meta parameter.
     */
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
    },

    /**
     * Detect which Meta parameter a form input maps to.
     */
    detectFieldParam(input) {
      const type = (input.type || '').toLowerCase();
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const autocomplete = (input.autocomplete || '').toLowerCase();
      const placeholder = (input.placeholder || '').toLowerCase();

      // Check custom field map first
      if (config.advancedMatching.formFieldMap) {
        for (const [selector, param] of Object.entries(config.advancedMatching.formFieldMap)) {
          try {
            if (input.matches(selector)) return param;
          } catch (e) {}
        }
      }

      // Check against patterns
      for (const [param, patterns] of Object.entries(this._fieldPatterns)) {
        if (patterns.types && patterns.types.includes(type)) return param;
        if (patterns.names && patterns.names.some(n => name.includes(n))) return param;
        if (patterns.ids && patterns.ids.some(i => id.includes(i))) return param;
        if (patterns.autocomplete && patterns.autocomplete.includes(autocomplete)) return param;
        if (patterns.placeholders && patterns.placeholders.some(p => placeholder.includes(p))) return param;
      }

      // Fallback: detect full name field → split into fn/ln
      if (['name', 'full_name', 'fullname', 'customer_name'].includes(name) ||
          ['name', 'full-name', 'fullname'].includes(id)) {
        return '_fullname'; // Special marker
      }

      return null;
    },

    /**
     * Scan a form for PII fields.
     */
    scanForm(form) {
      const data = {};
      const inputs = form.querySelectorAll('input, select, textarea');

      for (const input of inputs) {
        if (input.type === 'hidden' || input.type === 'password' || input.type === 'submit') continue;

        const value = input.value?.trim();
        if (!value) continue;

        const param = this.detectFieldParam(input);
        if (!param) continue;

        if (param === '_fullname') {
          // Split full name into first + last
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

    /**
     * Watch for form interactions and auto-capture PII.
     */
    watchForms() {
      // Capture on form submit
      document.addEventListener('submit', (e) => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement)) return;

        const data = this.scanForm(form);
        if (Object.keys(data).length > 0) {
          this._mergeCapture('form', data);
          log('AdvancedMatching: form submit captured', Object.keys(data));

          // Auto-identify on submit
          if (config.advancedMatching.autoIdentifyOnSubmit && (data.em || data.ph)) {
            MetaTracker.identify(data);
          }
        }
      }, true);

      // Capture on input blur (field by field)
      document.addEventListener('change', (e) => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) return;

        const value = input.value?.trim();
        if (!value) return;

        const param = this.detectFieldParam(input);
        if (!param || param === '_fullname') return;

        this._mergeCapture('form', { [param]: value });
        log('AdvancedMatching: field captured', param);
      }, true);

      // Scan existing forms and observe for new ones once DOM is ready
      const startObserving = () => {
        this._scanExistingForms();

        // Watch for dynamically added forms
        if (window.MutationObserver && document.body) {
          this._formObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.tagName === 'FORM') {
                  this._scanSingleForm(node);
                } else if (node.querySelectorAll) {
                  node.querySelectorAll('form').forEach(f => this._scanSingleForm(f));
                }
              }
            }
          });

          this._formObserver.observe(document.body, { childList: true, subtree: true });
        }
      };

      // Defer if document.body isn't available yet (script in <head>)
      if (document.body) {
        startObserving();
      } else {
        document.addEventListener('DOMContentLoaded', startObserving);
      }
    },

    _scanExistingForms() {
      document.querySelectorAll('form').forEach(form => this._scanSingleForm(form));
    },

    _scanSingleForm(form) {
      const data = this.scanForm(form);
      if (Object.keys(data).length > 0) {
        this._mergeCapture('form_prefill', data);
        log('AdvancedMatching: pre-filled form scanned', Object.keys(data));
      }
    },

    // ── URL PARAMETER CAPTURE ────────────────────────────────

    captureFromUrl() {
      try {
        const url = new URL(window.location.href);
        const params = url.searchParams;
        const data = {};

        // Email from URL
        const emailParams = ['email', 'em', 'e', 'user_email', 'customer_email'];
        for (const p of emailParams) {
          const val = params.get(p);
          if (val && val.includes('@')) { data.em = val; break; }
        }

        // Phone from URL
        const phoneParams = ['phone', 'ph', 'tel', 'mobile', 'whatsapp'];
        for (const p of phoneParams) {
          const val = params.get(p);
          if (val && val.replace(/\D/g, '').length >= 7) { data.ph = val; break; }
        }

        // Name from URL
        if (params.get('first_name') || params.get('fn')) {
          data.fn = params.get('first_name') || params.get('fn');
        }
        if (params.get('last_name') || params.get('ln')) {
          data.ln = params.get('last_name') || params.get('ln');
        }

        // External ID
        const eidParams = ['external_id', 'eid', 'user_id', 'uid', 'customer_id', 'player_id'];
        for (const p of eidParams) {
          const val = params.get(p);
          if (val) { data.external_id = val; break; }
        }

        // Country from URL
        if (params.get('country') || params.get('cc')) {
          data.country = params.get('country') || params.get('cc');
        }

        if (Object.keys(data).length > 0) {
          this._mergeCapture('url', data);
          log('AdvancedMatching: URL params captured', Object.keys(data));
        }
      } catch (e) {}
    },

    // ── DATALAYER CAPTURE ────────────────────────────────────

    captureFromDataLayer() {
      // GTM dataLayer
      const dlKey = config.advancedMatching.dataLayerKey || 'dataLayer';
      const dl = window[dlKey];

      if (Array.isArray(dl)) {
        for (const entry of dl) {
          this._extractFromDataLayerEntry(entry);
        }

        // Watch for future pushes
        const origPush = dl.push.bind(dl);
        dl.push = (...args) => {
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
        this._extractUserObject(window[userDataKey], 'customDataLayer');
      }
    },

    _extractFromDataLayerEntry(entry) {
      if (!entry || typeof entry !== 'object') return;

      // Look for user-related objects in the entry
      const userKeys = ['user', 'userData', 'user_data', 'customer', 'visitor', 'contact'];
      for (const key of userKeys) {
        if (entry[key] && typeof entry[key] === 'object') {
          this._extractUserObject(entry[key], 'dataLayer');
        }
      }

      // Ecommerce purchase events often have user data
      if (entry.ecommerce) {
        const ecom = entry.ecommerce;
        if (ecom.purchase?.actionField) {
          const af = ecom.purchase.actionField;
          if (af.email) this._mergeCapture('dataLayer', { em: af.email });
        }
      }

      // Direct top-level user fields
      this._extractUserObject(entry, 'dataLayer');
    },

    _extractUserObject(obj, source) {
      if (!obj || typeof obj !== 'object') return;

      const data = {};
      const fieldMap = {
        // key in source → Meta param
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

    captureFromMetaTags() {
      const data = {};

      // Schema.org / JSON-LD
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const json = JSON.parse(script.textContent);
          if (json.email) data.em = json.email;
          if (json.telephone) data.ph = json.telephone;
          if (json.givenName) data.fn = json.givenName;
          if (json.familyName) data.ln = json.familyName;
          if (json.address) {
            if (json.address.addressLocality) data.ct = json.address.addressLocality;
            if (json.address.addressRegion) data.st = json.address.addressRegion;
            if (json.address.postalCode) data.zp = json.address.postalCode;
            if (json.address.addressCountry) data.country = json.address.addressCountry;
          }
        } catch (e) {}
      }

      // OpenGraph profile tags
      const ogEmail = document.querySelector('meta[property="profile:email"]');
      if (ogEmail?.content) data.em = ogEmail.content;

      const ogFirstName = document.querySelector('meta[property="profile:first_name"]');
      if (ogFirstName?.content) data.fn = ogFirstName.content;

      const ogLastName = document.querySelector('meta[property="profile:last_name"]');
      if (ogLastName?.content) data.ln = ogLastName.content;

      const ogGender = document.querySelector('meta[property="profile:gender"]');
      if (ogGender?.content) data.ge = ogGender.content;

      if (Object.keys(data).length > 0) {
        this._mergeCapture('metatag', data);
        log('AdvancedMatching: meta tags captured', Object.keys(data));
      }
    },

    // ── IDENTITY GRAPH ───────────────────────────────────────

    /**
     * Source priority: higher = more trusted.
     */
    _sourcePriority: {
      explicit: 100,       // Passed directly to track()
      identify: 90,        // identify() stored data
      form: 80,            // Form submit
      form_prefill: 70,    // Pre-filled form values
      url: 60,             // URL parameters
      dataLayer: 50,       // GTM / dataLayer
      customDataLayer: 50, // Custom user data object
      metatag: 30,         // Meta tags / JSON-LD
    },

    /**
     * Merge captured data from a source.
     * Lower-priority sources don't overwrite higher-priority ones.
     */
    _mergeCapture(source, data) {
      for (const [param, value] of Object.entries(data)) {
        const existing = this._capturedData[param];
        const existingPriority = existing ? (this._sourcePriority[existing.source] || 0) : -1;
        const newPriority = this._sourcePriority[source] || 0;

        if (!existing || newPriority >= existingPriority) {
          this._capturedData[param] = { value, source };
        }
      }
    },

    /**
     * Get the merged identity from all captured sources.
     * Returns raw (un-hashed) values.
     */
    getCapturedData() {
      const result = {};
      for (const [param, entry] of Object.entries(this._capturedData)) {
        result[param] = entry.value;
      }
      return result;
    },

    /**
     * Build the final user_data object by merging (in priority order):
     *   1. Explicit userData from track() call
     *   2. identify() stored identity
     *   3. Auto-captured data (form, URL, dataLayer, meta tags)
     *   4. Cookie-based identifiers (fbp, fbc, external_id)
     *
     * Then normalize + hash everything per Meta spec.
     */
    async buildUserData(explicitUserData = {}) {
      // Start with auto-captured data (lowest priority, gets overwritten)
      const merged = { ...this.getCapturedData() };

      // Layer on stored identity
      const piiFields = ['em', 'ph', 'fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'];
      const storageMap = {
        em: '_mt_em', ph: '_mt_ph', external_id: '_mt_eid',
        fn: '_mt_fn', ln: '_mt_ln', ct: '_mt_ct', st: '_mt_st',
        zp: '_mt_zp', country: '_mt_country',
      };

      for (const [field, storageKey] of Object.entries(storageMap)) {
        if (!merged[field]) {
          const stored = getFromStorage(storageKey);
          if (stored) merged[field] = stored;
        }
      }

      // Layer on explicit userData (highest priority for PII)
      // Support both short (em) and long (email) field names
      const aliasMap = {
        email: 'em', phone: 'ph', first_name: 'fn', last_name: 'ln',
        gender: 'ge', date_of_birth: 'db', city: 'ct', state: 'st',
        zip: 'zp', zipcode: 'zp', postal_code: 'zp',
      };

      for (const [key, value] of Object.entries(explicitUserData)) {
        const param = aliasMap[key] || key;
        if (value) merged[param] = value;
      }

      // Normalize + hash PII fields
      const result = await this.normalizeAndHash(merged);

      // Add browser identifiers (not hashed)
      result.fbp = result.fbp || CookieKeeper.getFbp();
      result.fbc = result.fbc || CookieKeeper.getFbc();
      result.client_user_agent = result.client_user_agent || navigator.userAgent;

      // Auto external_id from visitor ID if still missing
      if (!result.external_id) {
        const visitorId = CookieKeeper.getVisitorId();
        if (visitorId) result.external_id = await sha256(visitorId);
      }

      return result;
    },

    /**
     * Calculate match quality score (0-100).
     * Higher = better chance Meta can match the event to a user.
     */
    scoreMatchQuality(userData) {
      let score = 0;
      const weights = {
        em: 30,             // Email is the strongest signal
        ph: 25,             // Phone is second
        external_id: 15,    // External ID
        fn: 5, ln: 5,      // Name helps
        ct: 3, st: 2, zp: 3, country: 2, // Address
        ge: 2, db: 3,      // Demographics
        fbp: 5, fbc: 10,   // Facebook identifiers (fbc is very strong)
        client_ip_address: 3,
        client_user_agent: 2,
      };

      for (const [field, weight] of Object.entries(weights)) {
        if (userData[field]) score += weight;
      }

      return Math.min(score, 100);
    },

    /**
     * Get detailed diagnostics about captured data.
     */
    getDiagnostics() {
      const captured = {};
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
  // ── COOKIE KEEPER (unchanged from v2.0)
  // ══════════════════════════════════════════════════════════════

  const CookieKeeper = {
    init() {
      if (!config.cookieKeeper.enabled) return;
      this.restoreCookies(); this.captureFbclid(); this.ensureFbp();
      this.ensureVisitorId(); this.syncToServer(); this.scheduleRefresh();
      log('CookieKeeper: ready', { fbp: this.getFbp(), fbc: this.getFbc() });
    },

    restoreCookies() {
      const cookieNames = config.cookieKeeper.cookieNames || [];
      for (const name of cookieNames) {
        if (!getCookie(name)) {
          try {
            const backup = localStorage.getItem('mt_' + name);
            if (backup) { setCookie(name, backup, config.cookieKeeper.maxAge); }
          } catch (e) {}
        } else {
          try { localStorage.setItem('mt_' + name, getCookie(name)); } catch (e) {}
        }
      }
    },

    captureFbclid() {
      try {
        const fbclid = new URL(window.location.href).searchParams.get('fbclid');
        if (fbclid) {
          const fbc = `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}`;
          saveToStorage('_fbc', fbc, config.cookieKeeper.maxAge);
        }
      } catch (e) {}
    },

    ensureFbp() {
      if (!getFromStorage('_fbp')) {
        const fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 2147483647)}`;
        saveToStorage('_fbp', fbp, config.cookieKeeper.maxAge);
      }
    },

    ensureVisitorId() {
      if (!getFromStorage('_mt_id')) {
        generateVisitorId();
      }
    },

    async syncToServer() {
      const cookies = {
        _fbp: getFromStorage('_fbp'), _fbc: getFromStorage('_fbc'),
        _mt_id: getFromStorage('_mt_id'), _mt_em: getFromStorage('_mt_em'),
        _mt_ph: getFromStorage('_mt_ph'),
      };
      if (!cookies._fbp && !cookies._fbc && !cookies._mt_id) return;
      const lastSync = getFromStorage('_mt_cookie_sync');
      if (lastSync && (Date.now() - parseInt(lastSync, 10)) < config.cookieKeeper.refreshInterval) return;
      try {
        await transportSend(resolveEndpoint('/cookie-sync'), {
          cookies, domain: window.location.hostname, max_age: config.cookieKeeper.maxAge,
        });
        saveToStorage('_mt_cookie_sync', Date.now().toString(), 1);
      } catch (e) { warn('CookieKeeper: sync failed', e.message); }
    },

    refreshCookies() {
      const days = config.cookieKeeper.maxAge;
      for (const name of (config.cookieKeeper.cookieNames || [])) {
        const value = getFromStorage(name);
        if (value) setCookie(name, value, days);
      }
      saveToStorage('_mt_cookie_sync', '0', 1);
      this.syncToServer();
    },

    scheduleRefresh() {
      if (cookieKeeperTimer) clearInterval(cookieKeeperTimer);
      cookieKeeperTimer = setInterval(() => this.refreshCookies(), config.cookieKeeper.refreshInterval);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.restoreCookies();
      });
    },

    getFbp() { return getFromStorage('_fbp'); },
    getFbc() { return getFromStorage('_fbc'); },
    getVisitorId() { return getFromStorage('_mt_id'); },
  };

  // ══════════════════════════════════════════════════════════════
  // ── AD BLOCKER RECOVERY (unchanged from v2.0)
  // ══════════════════════════════════════════════════════════════

  const AdBlockRecovery = {
    async detect() {
      if (!config.adBlockRecovery.enabled) return false;
      try {
        const testUrl = config.endpoint.replace(/\/track\/?$/, '') + '/health';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(testUrl, { method: 'GET', signal: controller.signal, cache: 'no-store' });
        clearTimeout(timeout);
        if (!response.ok) throw new Error('Blocked');
        return false;
      } catch (e) {
        adBlockDetected = true;
        log('AdBlockRecovery: DETECTED');
        return true;
      }
    },

    getEndpoint(path) {
      if (adBlockDetected && config.adBlockRecovery.proxyPath) {
        return config.endpoint.replace(/\/api\/v1\/track\/?$/, '') + config.adBlockRecovery.proxyPath + path;
      }
      return config.endpoint + path;
    },

    getFallbackEndpoints(path) {
      const eps = [this.getEndpoint(path)];
      if (config.adBlockRecovery.customEndpoints) {
        for (const ep of config.adBlockRecovery.customEndpoints) eps.push(ep + path);
      }
      return eps;
    },

    disguisePayload(data) {
      if (!adBlockDetected) return data;
      return { d: btoa(JSON.stringify(data)), t: Date.now(), v: VERSION };
    },

    getHeaders() {
      const h = { 'Content-Type': 'application/json' };
      h[adBlockDetected ? 'X-Request-Token' : 'X-API-Key'] = config.apiKey;
      return h;
    },
  };

  // ══════════════════════════════════════════════════════════════
  // ── PIXEL ROUTER (unchanged from v2.0)
  // ══════════════════════════════════════════════════════════════

  const PixelRouter = {
    resolve(hostname) {
      hostname = hostname || window.location.hostname;
      if (!config.pixels || config.pixels.length === 0) return config.pixelId ? [config.pixelId] : [];
      const matched = []; let catchAll = null;
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
    matchDomain(hostname, pattern) {
      if (hostname === pattern) return true;
      if (pattern.startsWith('*.')) {
        const suffix = pattern.substring(2);
        return hostname.endsWith('.' + suffix) || hostname === suffix;
      }
      return hostname.endsWith('.' + pattern);
    },
    getAllPixelIds() {
      if (!config.pixels || config.pixels.length === 0) return config.pixelId ? [config.pixelId] : [];
      return [...new Set(config.pixels.map(p => p.pixelId).filter(Boolean))];
    },
  };

  // ══════════════════════════════════════════════════════════════
  // ── TRANSPORT LAYER (unchanged from v2.0)
  // ══════════════════════════════════════════════════════════════

  function resolveEndpoint(path) {
    return adBlockDetected ? AdBlockRecovery.getEndpoint(path) : config.endpoint + path;
  }

  async function transportFetch(url, data) {
    const headers = AdBlockRecovery.getHeaders();
    const body = adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data;
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), keepalive: true, credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json().catch(() => ({}));
  }

  function transportBeacon(url, data) {
    const body = adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data;
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    if (!navigator.sendBeacon(url + '?api_key=' + encodeURIComponent(config.apiKey), blob))
      throw new Error('Beacon failed');
    return { sent: true };
  }

  function transportXhr(url, data) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      const headers = AdBlockRecovery.getHeaders();
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.withCredentials = true; xhr.timeout = 10000;
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(JSON.parse(xhr.responseText || '{}')) : reject(new Error(`XHR ${xhr.status}`));
      xhr.onerror = () => reject(new Error('XHR error'));
      xhr.ontimeout = () => reject(new Error('XHR timeout'));
      xhr.send(JSON.stringify(adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data));
    });
  }

  function transportImage(url, data) {
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

  async function transportSend(url, data, attempt = 0) {
    const transports = [
      { name: 'fetch', fn: transportFetch },
      { name: 'beacon', fn: transportBeacon, skip: !config.adBlockRecovery.useBeacon },
      { name: 'xhr', fn: transportXhr },
      { name: 'img', fn: transportImage, skip: !config.adBlockRecovery.useImage },
    ].filter(t => !t.skip);

    for (const transport of transports) {
      const pathSuffix = url.includes(config.endpoint) ? url.replace(config.endpoint, '') : url.replace(/^https?:\/\/[^\/]+/, '').replace(/.*\/api\/v1\/track/, '');
      const endpoints = adBlockDetected ? AdBlockRecovery.getFallbackEndpoints(pathSuffix) : [url];
      for (const ep of endpoints) {
        try {
          const result = await transport.fn(ep, data);
          if (transport.name !== transportMethod) { log(`Transport: ${transportMethod} → ${transport.name}`); transportMethod = transport.name; }
          return result;
        } catch (e) { log(`${transport.name} → ${ep}: ${e.message}`); }
      }
    }
    if (attempt < RETRY_DELAYS.length) {
      return new Promise(r => setTimeout(() => r(transportSend(url, data, attempt + 1)), RETRY_DELAYS[attempt]));
    }
    warn('All transports exhausted');
  }

  // ── Core Tracking ──────────────────────────────────────────────

  async function sendEvents(events) {
    if (!events.length) return;
    const url = events.length === 1 ? resolveEndpoint('/event') : resolveEndpoint('/batch');
    const body = events.length === 1 ? events[0] : { events };
    try { await transportSend(url, body); } catch (e) { warn('Send failed:', e); }
  }

  function flushQueue() {
    if (!queue.length) return;
    sendEvents(queue.splice(0, MAX_QUEUE_SIZE));
  }

  function enqueueEvent(event) {
    queue.push(event);
    if (config.batchEvents) {
      if (batchTimer) clearTimeout(batchTimer);
      batchTimer = setTimeout(flushQueue, BATCH_INTERVAL);
    } else { flushQueue(); }
  }

  // ══════════════════════════════════════════════════════════════
  // ── BROWSER PIXEL (auto-load Meta fbevents.js)
  // ══════════════════════════════════════════════════════════════

  const BrowserPixel = {
    _loaded: false,

    /**
     * Inject the Meta Pixel base code and initialize all configured pixel IDs.
     */
    init() {
      if (!config.browserPixel.enabled) return;
      if (this._loaded) return;
      if (typeof window.fbq === 'function') {
        // fbq already loaded by the site — just init our pixel IDs
        log('BrowserPixel: fbq already present, initializing pixels');
        this._initPixels();
        this._loaded = true;
        return;
      }

      log('BrowserPixel: loading fbevents.js');

      // Standard Meta Pixel base code
      const n = window.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!window._fbq) window._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];

      // Load fbevents.js
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      const firstScript = document.getElementsByTagName('script')[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else {
        // Defer if no scripts exist yet (script in <head> before anything)
        const insert = () => {
          const s = document.getElementsByTagName('script')[0];
          if (s && s.parentNode) s.parentNode.insertBefore(script, s);
          else document.head.appendChild(script);
        };
        if (document.body) insert();
        else document.addEventListener('DOMContentLoaded', insert);
      }

      this._initPixels();
      this._loaded = true;
    },

    /**
     * Call fbq('init', pixelId) for each configured pixel.
     */
    _initPixels() {
      const pixelIds = PixelRouter.getAllPixelIds();

      if (!pixelIds.length) {
        warn('BrowserPixel: no pixel IDs configured');
        return;
      }

      for (const pid of pixelIds) {
        window.fbq('init', pid);
        log('BrowserPixel: init pixel', pid);
      }

      if (config.browserPixel.autoPageView) {
        window.fbq('track', 'PageView');
        log('BrowserPixel: PageView fired');
      }
    },

    /**
     * Fire a browser pixel event with the same eventID for deduplication.
     * Meta deduplicates browser + server events when event_name and event_id match.
     */
    trackEvent(eventName, eventId, customData = {}, pixelId = null) {
      if (!config.browserPixel.enabled || !config.browserPixel.syncEvents) return;
      if (typeof window.fbq !== 'function') return;

      // Standard Meta events that fbq recognizes
      const standardEvents = [
        'PageView', 'ViewContent', 'AddToCart', 'AddPaymentInfo',
        'AddToWishlist', 'CompleteRegistration', 'Contact', 'CustomizeProduct',
        'Donate', 'FindLocation', 'InitiateCheckout', 'Lead', 'Purchase',
        'Schedule', 'Search', 'StartTrial', 'SubmitApplication', 'Subscribe',
      ];

      const isStandard = standardEvents.includes(eventName);
      const fbqParams = { ...customData };
      const fbqOptions = { eventID: eventId };

      if (isStandard) {
        window.fbq('track', eventName, fbqParams, fbqOptions);
      } else {
        window.fbq('trackCustom', eventName, fbqParams, fbqOptions);
      }

      log('BrowserPixel: synced', eventName, 'eventID:', eventId);
    },
  };

  // ══════════════════════════════════════════════════════════════
  // ── CONSENT MANAGER
  // ══════════════════════════════════════════════════════════════

  const consentPendingQueue = [];
  let consentGranted = null;

  const ConsentManager = {

    init() {
      if (!config.consent.enabled) {
        consentGranted = true;
        return;
      }
      consentGranted = config.consent.mode === 'opt-out'
        ? (config.consent.defaultConsent ?? true)
        : (config.consent.defaultConsent ?? false);
      log('ConsentManager: mode=' + config.consent.mode, 'default=' + consentGranted);
      this._detectCMP();
    },

    _detectCMP() {
      if (typeof window.OneTrust !== 'undefined' || typeof window.OptanonWrapper !== 'undefined') { this._initOneTrust(); return; }
      if (typeof window.Cookiebot !== 'undefined') { this._initCookiebot(); return; }
      if (typeof window.truste !== 'undefined') { this._initTrustArc(); return; }
      if (typeof window.Osano !== 'undefined') { this._initOsano(); return; }
      if (typeof window.gtag === 'function') { this._initGoogleConsentMode(); return; }
      if (typeof window.__tcfapi === 'function') { this._initTCF(); return; }
      log('ConsentManager: no CMP detected, using default consent=' + consentGranted);

      if (config.consent.waitForConsent) {
        const recheck = () => {
          if (typeof window.OneTrust !== 'undefined') { this._initOneTrust(); return; }
          if (typeof window.Cookiebot !== 'undefined') { this._initCookiebot(); return; }
          if (typeof window.truste !== 'undefined') { this._initTrustArc(); return; }
          if (typeof window.Osano !== 'undefined') { this._initOsano(); return; }
          if (typeof window.__tcfapi === 'function') { this._initTCF(); return; }
          log('ConsentManager: no CMP after DOM ready');
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', recheck);
        else setTimeout(recheck, 1000);
      }
    },

    _initOneTrust() {
      log('ConsentManager: OneTrust detected');
      const category = config.consent.consentCategory;
      const checkConsent = () => {
        const groups = window.OnetrustActiveGroups || '';
        this._updateConsent(groups.includes(category), 'OneTrust');
      };
      const origWrapper = window.OptanonWrapper;
      window.OptanonWrapper = function () {
        if (typeof origWrapper === 'function') origWrapper();
        checkConsent();
      };
      if (window.OnetrustActiveGroups) checkConsent();
    },

    _initCookiebot() {
      log('ConsentManager: Cookiebot detected');
      const checkConsent = () => {
        const cb = window.Cookiebot;
        if (!cb) return;
        this._updateConsent(cb.consent?.marketing === true, 'Cookiebot');
      };
      window.addEventListener('CookiebotOnAccept', checkConsent);
      window.addEventListener('CookiebotOnDecline', checkConsent);
      if (window.Cookiebot?.consented) checkConsent();
    },

    _initTrustArc() {
      log('ConsentManager: TrustArc detected');
      const checkConsent = () => {
        try {
          const behavior = window.truste?.eu?.bindMap?.prefCookie;
          this._updateConsent(behavior !== undefined ? parseInt(behavior, 10) >= 3 : false, 'TrustArc');
        } catch { /* ignore */ }
      };
      window.addEventListener('message', (e) => {
        if (typeof e.data === 'string' && e.data.includes('truste.eu.cookie')) setTimeout(checkConsent, 100);
      });
      checkConsent();
    },

    _initOsano() {
      log('ConsentManager: Osano detected');
      const osano = window.Osano;
      if (typeof osano?.cm?.addEventListener === 'function') {
        osano.cm.addEventListener('osano-cm-consent-saved', (change) => {
          this._updateConsent(change.MARKETING === 'ACCEPT', 'Osano');
        });
      }
      if (typeof osano?.cm?.getConsent === 'function') {
        const consent = osano.cm.getConsent();
        if (consent.MARKETING) this._updateConsent(consent.MARKETING === 'ACCEPT', 'Osano');
      }
    },

    _initGoogleConsentMode() {
      log('ConsentManager: Google Consent Mode detected');
      const dl = window.dataLayer || [];
      const origPush = dl.push.bind(dl);
      dl.push = (...args) => {
        const r = origPush(...args);
        for (const entry of args) {
          if (entry && typeof entry === 'object' && entry[0] === 'consent' && entry[1] === 'update') {
            const params = entry[2];
            if (params?.ad_storage) this._updateConsent(params.ad_storage === 'granted', 'GoogleConsentMode');
          }
        }
        return r;
      };
      try {
        const cs = window.google_tag_data?.ics?.entries;
        if (cs?.ad_storage) this._updateConsent(cs.ad_storage.value === 'granted', 'GoogleConsentMode');
      } catch { /* ignore */ }
    },

    _initTCF() {
      log('ConsentManager: IAB TCF v2 detected');
      const checkTCF = () => {
        window.__tcfapi('getTCData', 2, (data, success) => {
          if (!success || !data) return;
          if (!data.gdprApplies) { this._updateConsent(true, 'TCF'); return; }
          const consents = data.purpose?.consents ?? {};
          this._updateConsent(consents[1] === true && consents[4] === true, 'TCF');
        });
      };
      window.__tcfapi('addEventListener', 2, (_, success) => { if (success) checkTCF(); });
      checkTCF();
    },

    _updateConsent(granted, source) {
      const prev = consentGranted;
      consentGranted = granted;
      if (prev !== granted) log('ConsentManager: consent ' + (granted ? 'GRANTED' : 'REVOKED') + ' via ' + source);
      if (granted && consentPendingQueue.length) this._flushPending();
    },

    _flushPending() {
      log('ConsentManager: flushing', consentPendingQueue.length, 'queued calls');
      while (consentPendingQueue.length) {
        const call = consentPendingQueue.shift();
        const fn = MetaTracker[call.method];
        if (typeof fn === 'function') fn.apply(MetaTracker, call.args);
      }
    },

    hasConsent() {
      if (!config.consent.enabled) return true;
      return consentGranted === true;
    },

    grantConsent() { this._updateConsent(true, 'manual'); },
    revokeConsent() { this._updateConsent(false, 'manual'); },

    queueIfNeeded(method, args) {
      if (!config.consent.enabled) return false;
      if (consentGranted === true) return false;
      if (config.consent.waitForConsent) {
        consentPendingQueue.push({ method, args });
        log('ConsentManager: queued', method, '(' + consentPendingQueue.length + ' pending)');
        return true;
      }
      warn('ConsentManager: blocked', method, '(no consent)');
      return true;
    },
  };

  // ══════════════════════════════════════════════════════════════
  // ── PUBLIC API
  // ══════════════════════════════════════════════════════════════

  const MetaTracker = {
    VERSION,

    async init(options = {}) {
      if (initialized) { warn('Already initialized'); return this; }
      if (!options.endpoint || !options.apiKey) { warn('Missing: endpoint, apiKey'); return this; }
      if (!options.pixelId && (!options.pixels || !options.pixels.length)) { warn('Missing: pixelId or pixels[]'); return this; }
      if (options.respectDnt && (navigator.doNotTrack === '1' || window.doNotTrack === '1')) return this;

      config = {
        ...config, ...options,
        browserPixel: { ...config.browserPixel, ...(options.browserPixel || {}) },
        consent: { ...config.consent, ...(options.consent || {}) },
        cookieKeeper: { ...config.cookieKeeper, ...(options.cookieKeeper || {}) },
        adBlockRecovery: { ...config.adBlockRecovery, ...(options.adBlockRecovery || {}) },
        advancedMatching: { ...config.advancedMatching, ...(options.advancedMatching || {}) },
      };

      initialized = true;
      log('Initialized v' + VERSION);

      ConsentManager.init();
      BrowserPixel.init();
      CookieKeeper.init();
      AdvancedMatching.init();

      if (config.adBlockRecovery.enabled) {
        AdBlockRecovery.detect().then(b => { if (b) log('Ad blocker recovery: ACTIVE'); });
      }

      if (config.autoPageView) this.trackPageView();

      window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushQueue(); });
      window.addEventListener('beforeunload', flushQueue);
      return this;
    },

    /**
     * Track event with Advanced Matching.
     * userData is merged with auto-captured data, normalized per Meta spec, then hashed.
     */
    async track(eventName, customData = {}, userData = {}, options = {}) {
      if (!initialized) { warn('Not initialized'); return; }
      if (ConsentManager.queueIfNeeded('track', [eventName, customData, userData, options])) return;

      const eventId = options.event_id || generateEventId();

      // Build enriched user_data via Advanced Matching
      const enrichedUserData = config.advancedMatching.enabled
        ? await AdvancedMatching.buildUserData(userData)
        : await AdvancedMatching.normalizeAndHash(userData);

      // Match quality score
      const matchScore = AdvancedMatching.scoreMatchQuality(enrichedUserData);
      log(`Match quality: ${matchScore}/100`);

      if (matchScore < config.minMatchQuality) {
        warn(`Match quality ${matchScore} below threshold ${config.minMatchQuality}, skipping event`);
        return;
      }

      const pixelIds = options.pixel_id ? [options.pixel_id] : PixelRouter.resolve();
      if (!pixelIds.length) { warn('No pixel for:', window.location.hostname); return; }

      for (const pixelId of pixelIds) {
        const event = {
          pixel_id: pixelId,
          event_name: eventName,
          event_id: pixelIds.length > 1 ? `${eventId}_${pixelId.slice(-4)}` : eventId,
          event_time: Math.floor(Date.now() / 1000),
          event_source_url: window.location.href,
          action_source: options.action_source || 'website',
          user_data: { ...enrichedUserData },
          match_quality: matchScore,
          // Pass raw visitor ID for server-side profile linking
          visitor_id: CookieKeeper.getVisitorId() || null,
        };

        if (Object.keys(customData).length > 0) event.custom_data = customData;

        log('Track:', eventName, '→', pixelId, `(match: ${matchScore})`);
        enqueueEvent(event);

        // Sync to browser pixel with same eventID for deduplication
        BrowserPixel.trackEvent(eventName, event.event_id, customData, pixelId);
      }

      return eventId;
    },

    // ── Convenience methods ────────────────────────────────────

    trackPageView(ud = {}) { return this.track('PageView', {}, ud); },
    trackViewContent(cd = {}, ud = {}) { return this.track('ViewContent', cd, ud); },
    trackAddToCart(cd = {}, ud = {}) { return this.track('AddToCart', cd, ud); },
    trackPurchase(cd = {}, ud = {}) { return this.track('Purchase', cd, ud); },
    trackLead(cd = {}, ud = {}) { return this.track('Lead', cd, ud); },
    trackCompleteRegistration(cd = {}, ud = {}) { return this.track('CompleteRegistration', cd, ud); },
    trackInitiateCheckout(cd = {}, ud = {}) { return this.track('InitiateCheckout', cd, ud); },
    trackSearch(cd = {}, ud = {}) { return this.track('Search', cd, ud); },
    trackToPixel(pixelId, name, cd = {}, ud = {}) { return this.track(name, cd, ud, { pixel_id: pixelId }); },

    // ── Identity ───────────────────────────────────────────────

    /**
     * Persist user identity across sessions.
     * Accepts both short (em, ph) and long (email, phone) field names.
     * All values are normalized + hashed before storage.
     */
    async identify(userData = {}) {
      if (!initialized) { warn('Not initialized'); return; }

      // Alias long field names
      const aliasMap = {
        email: 'em', phone: 'ph', first_name: 'fn', last_name: 'ln',
        gender: 'ge', date_of_birth: 'db', city: 'ct', state: 'st',
        zip: 'zp', zipcode: 'zp', postal_code: 'zp',
      };

      const normalized = {};
      for (const [key, value] of Object.entries(userData)) {
        if (!value) continue;
        const param = aliasMap[key] || key;
        normalized[param] = value;
      }

      // Normalize + hash each field
      const hashed = await AdvancedMatching.normalizeAndHash(normalized);

      // Persist to storage
      const storageMap = {
        em: '_mt_em', ph: '_mt_ph', fn: '_mt_fn', ln: '_mt_ln',
        external_id: '_mt_eid', ct: '_mt_ct', st: '_mt_st',
        zp: '_mt_zp', country: '_mt_country',
      };

      for (const [field, key] of Object.entries(storageMap)) {
        if (hashed[field]) saveToStorage(key, hashed[field], config.cookieKeeper.maxAge);
      }

      // Also feed into AdvancedMatching identity graph
      AdvancedMatching._mergeCapture('identify', normalized);

      log('Identify:', Object.keys(hashed).filter(k => hashed[k] && !['client_user_agent', 'fbp', 'fbc'].includes(k)));
      CookieKeeper.syncToServer();
    },

    clearIdentity() {
      const keys = ['_mt_em', '_mt_ph', '_mt_fn', '_mt_ln', '_mt_eid',
                     '_mt_ct', '_mt_st', '_mt_zp', '_mt_country'];
      keys.forEach(k => removeFromStorage(k));
      AdvancedMatching._capturedData = {};
      log('Identity cleared');
    },

    // ── Multi-domain ───────────────────────────────────────────

    addPixel(pixelId, domains) {
      config.pixels.push({ pixelId, domains: Array.isArray(domains) ? domains : [domains] });
    },

    removePixel(pixelId) {
      config.pixels = config.pixels.filter(p => p.pixelId !== pixelId);
    },

    // ── Cookie Keeper ──────────────────────────────────────────

    refreshCookies() { CookieKeeper.refreshCookies(); },

    // ── Consent ────────────────────────────────────────────────

    hasConsent() { return ConsentManager.hasConsent(); },
    grantConsent() { ConsentManager.grantConsent(); },
    revokeConsent() { ConsentManager.revokeConsent(); },

    // ── Diagnostics ────────────────────────────────────────────

    flush() { flushQueue(); },
    isAdBlocked() { return adBlockDetected; },
    getTransport() { return transportMethod; },

    /**
     * Get full debug info including Advanced Matching diagnostics.
     */
    getDebugInfo() {
      return {
        version: VERSION, initialized, transport: transportMethod, adBlockDetected,
        config: { endpoint: config.endpoint, pixelId: config.pixelId, pixelCount: config.pixels.length },
        cookies: { fbp: CookieKeeper.getFbp(), fbc: CookieKeeper.getFbc(), visitorId: CookieKeeper.getVisitorId() },
        routing: { domain: window.location.hostname, active: PixelRouter.resolve(), all: PixelRouter.getAllPixelIds() },
        advancedMatching: AdvancedMatching.getDiagnostics(),
        queueSize: queue.length,
      };
    },

    /**
     * Get current match quality score.
     */
    async getMatchQuality(extraUserData = {}) {
      const userData = config.advancedMatching.enabled
        ? await AdvancedMatching.buildUserData(extraUserData)
        : await AdvancedMatching.normalizeAndHash(extraUserData);
      return {
        score: AdvancedMatching.scoreMatchQuality(userData),
        fields: Object.keys(userData).filter(k => userData[k]),
      };
    },

    /**
     * Manually add captured user data (from custom integrations).
     */
    addUserData(data, source = 'explicit') {
      AdvancedMatching._mergeCapture(source, data);
    },
  };

  // ── Expose globally ────────────────────────────────────────────
  window.MetaTracker = MetaTracker;

  if (window.MetaTrackerQueue && Array.isArray(window.MetaTrackerQueue)) {
    window.MetaTrackerQueue.forEach(([method, ...args]) => {
      if (typeof MetaTracker[method] === 'function') MetaTracker[method](...args);
    });
  }

})(window, document);
