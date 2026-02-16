"use strict";
(function(window2, document2) {
  "use strict";
  const VERSION = "2.1.0";
  const MAX_QUEUE_SIZE = 50;
  const RETRY_DELAYS = [1e3, 5e3, 15e3];
  const BATCH_INTERVAL = 2e3;
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
    browserPixel: {
      enabled: true,
      autoPageView: true,
      syncEvents: true
    },
    cookieKeeper: {
      enabled: true,
      refreshInterval: 864e5,
      maxAge: 180,
      cookieNames: ["_fbp", "_fbc", "_mt_id"]
    },
    adBlockRecovery: {
      enabled: true,
      proxyPath: "/collect",
      useBeacon: true,
      useImage: true,
      customEndpoints: []
    },
    advancedMatching: {
      enabled: true,
      autoCaptureForms: true,
      captureUrlParams: true,
      captureDataLayer: true,
      captureMetaTags: true,
      autoIdentifyOnSubmit: true,
      formFieldMap: {},
      dataLayerKey: "dataLayer",
      userDataKey: null
    },
    gtm: {
      enabled: false,
      autoMapEcommerce: true,
      pushToDataLayer: true,
      dataLayerKey: "dataLayer",
      eventMapping: {}
    }
  };
  let queue = [];
  let batchTimer = null;
  let initialized = false;
  let transportMethod = "fetch";
  let adBlockDetected = false;
  let cookieKeeperTimer = null;
  function log(...args) {
    if (config.debug) console.log("[MetaTracker]", ...args);
  }
  function warn(...args) {
    if (config.debug) console.warn("[MetaTracker]", ...args);
  }
  function generateEventId() {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
  }
  function generateVisitorId() {
    const stored = getFromStorage("_mt_id");
    if (stored) return stored;
    const id = "mt." + Date.now().toString(36) + "." + Math.random().toString(36).substring(2, 12);
    saveToStorage("_mt_id", id);
    return id;
  }
  async function sha256(value) {
    if (!value) return null;
    const normalized = value.toString().trim().toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function isHashed(value) {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  }
  function setCookie(name, value, days) {
    const maxAge = days * 86400;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    const domain = getRootDomain();
    const domainStr = domain ? `; domain=.${domain}` : "";
    document2.cookie = `${name}=${encodeURIComponent(value)}; path=/${domainStr}; max-age=${maxAge}; SameSite=Lax${secure}`;
  }
  function getCookie(name) {
    const match = document2.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : null;
  }
  function deleteCookie(name) {
    const domain = getRootDomain();
    const domainStr = domain ? `; domain=.${domain}` : "";
    document2.cookie = `${name}=; path=/${domainStr}; max-age=0`;
  }
  function getRootDomain() {
    try {
      const parts = window2.location.hostname.split(".");
      if (parts.length <= 1 || /^\d+$/.test(parts[parts.length - 1])) return "";
      return parts.slice(-2).join(".");
    } catch {
      return "";
    }
  }
  function getFromStorage(key) {
    const cookieVal = getCookie(key);
    if (cookieVal) return cookieVal;
    try {
      return localStorage.getItem("mt_" + key);
    } catch {
      return null;
    }
  }
  function saveToStorage(key, value, days) {
    days = days || (config.cookieKeeper.maxAge || 180);
    setCookie(key, value, days);
    try {
      localStorage.setItem("mt_" + key, value);
    } catch {
    }
  }
  function removeFromStorage(key) {
    deleteCookie(key);
    try {
      localStorage.removeItem("mt_" + key);
    } catch {
    }
  }
  const AdvancedMatching = {
    _capturedData: {},
    _formObserver: null,
    _formListeners: /* @__PURE__ */ new WeakSet(),
    init() {
      if (!config.advancedMatching.enabled) return;
      log("AdvancedMatching: initializing");
      if (config.advancedMatching.captureUrlParams) this.captureFromUrl();
      if (config.advancedMatching.captureMetaTags) this.captureFromMetaTags();
      if (config.advancedMatching.captureDataLayer) this.captureFromDataLayer();
      if (config.advancedMatching.autoCaptureForms) this.watchForms();
      log("AdvancedMatching: ready, captured:", Object.keys(this._capturedData));
    },
    // ── META-SPECIFIC NORMALIZER ──────────────────────────────
    normalizers: {
      em(value) {
        if (!value || typeof value !== "string") return null;
        value = value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
        return value;
      },
      ph(value) {
        if (!value || typeof value !== "string") return null;
        let digits = value.replace(/\D/g, "");
        if (digits.length < 7) return null;
        if (digits.startsWith("00")) digits = digits.substring(2);
        return digits || null;
      },
      fn(value) {
        if (!value || typeof value !== "string") return null;
        let v = value.trim().toLowerCase();
        v = v.replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s*/i, "");
        v = v.replace(/[^a-z\s\u00C0-\u024F]/g, "");
        try {
          v = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        } catch {
        }
        return v.trim() || null;
      },
      ln(value) {
        return AdvancedMatching.normalizers.fn(value);
      },
      ge(value) {
        if (!value || typeof value !== "string") return null;
        const v = value.trim().toLowerCase();
        if (v.startsWith("m") || v === "male") return "m";
        if (v.startsWith("f") || v === "female") return "f";
        return null;
      },
      db(value) {
        if (!value || typeof value !== "string") return null;
        const v = value.trim();
        if (/^\d{8}$/.test(v)) return v;
        const formats = [
          /^(\d{4})-(\d{2})-(\d{2})$/,
          /^(\d{2})\/(\d{2})\/(\d{4})$/,
          /^(\d{2})-(\d{2})-(\d{4})$/
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
      ct(value) {
        if (!value || typeof value !== "string") return null;
        let v = value.trim().toLowerCase();
        v = v.replace(/[^a-z\s\u00C0-\u024F]/g, "");
        try {
          v = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        } catch {
        }
        return v.trim() || null;
      },
      st(value) {
        if (!value || typeof value !== "string") return null;
        const v = value.trim().toLowerCase();
        if (/^[a-z]{2}$/.test(v)) return v;
        const match = v.match(/\b([a-z]{2})\b/);
        return match ? match[1] : v.substring(0, 2);
      },
      zp(value) {
        if (!value || typeof value !== "string") return null;
        const v = value.trim().toLowerCase().replace(/\s+/g, "");
        if (/^\d{5}(-\d{4})?$/.test(v)) return v.substring(0, 5);
        return v || null;
      },
      country(value) {
        if (!value || typeof value !== "string") return null;
        const v = value.trim().toLowerCase();
        if (/^[a-z]{2}$/.test(v)) return v;
        const map = {
          "united states": "us",
          "usa": "us",
          "united kingdom": "gb",
          "uk": "gb",
          "canada": "ca",
          "australia": "au",
          "germany": "de",
          "france": "fr",
          "indonesia": "id",
          "japan": "jp",
          "india": "in",
          "brazil": "br",
          "mexico": "mx",
          "spain": "es",
          "italy": "it",
          "netherlands": "nl",
          "singapore": "sg",
          "malaysia": "my",
          "philippines": "ph",
          "thailand": "th",
          "vietnam": "vn",
          "south korea": "kr",
          "china": "cn",
          "taiwan": "tw",
          "hong kong": "hk",
          "new zealand": "nz",
          "portugal": "pt",
          "sweden": "se",
          "norway": "no",
          "denmark": "dk",
          "finland": "fi",
          "poland": "pl",
          "cambodia": "kh",
          "turkey": "tr",
          "argentina": "ar",
          "colombia": "co",
          "chile": "cl",
          "peru": "pe",
          "south africa": "za",
          "nigeria": "ng",
          "egypt": "eg",
          "saudi arabia": "sa",
          "united arab emirates": "ae",
          "uae": "ae",
          "russia": "ru",
          "ukraine": "ua",
          "ireland": "ie",
          "switzerland": "ch",
          "austria": "at",
          "belgium": "be",
          "czech republic": "cz",
          "romania": "ro"
        };
        return map[v] || (v.length === 2 ? v : null);
      },
      external_id(value) {
        if (!value || typeof value !== "string") return null;
        return value.trim() || null;
      }
    },
    normalize(field, value) {
      if (isHashed(value)) return value;
      const normalizer = this.normalizers[field];
      return normalizer ? normalizer(value) : value ? String(value).trim().toLowerCase() : null;
    },
    async normalizeAndHash(userData) {
      if (!userData) return {};
      const piiFields = ["em", "ph", "fn", "ln", "ge", "db", "ct", "st", "zp", "country", "external_id"];
      const result = {};
      for (const field of piiFields) {
        const value = userData[field];
        if (!value) continue;
        if (isHashed(value)) {
          result[field] = value;
          continue;
        }
        const normalized = this.normalize(field, value);
        if (!normalized) continue;
        if (config.hashPii) {
          result[field] = await sha256(normalized) ?? void 0;
        } else {
          result[field] = normalized;
        }
      }
      const nonPiiFields = [
        "client_ip_address",
        "client_user_agent",
        "fbc",
        "fbp",
        "subscription_id",
        "fb_login_id",
        "lead_id"
      ];
      for (const field of nonPiiFields) {
        const val = userData[field];
        if (val) result[field] = val;
      }
      return result;
    },
    // ── FORM AUTO-CAPTURE ─────────────────────────────────────
    _fieldPatterns: {
      em: {
        types: ["email"],
        names: [
          "email",
          "e-mail",
          "user_email",
          "userEmail",
          "customer_email",
          "login",
          "username",
          "emailAddress",
          "email_address"
        ],
        ids: ["email", "user-email", "customer-email", "signup-email", "login-email"],
        autocomplete: ["email"],
        placeholders: ["email", "e-mail", "your email", "email address"]
      },
      ph: {
        types: ["tel"],
        names: [
          "phone",
          "telephone",
          "tel",
          "mobile",
          "phone_number",
          "phoneNumber",
          "cell",
          "cellphone",
          "mobile_number",
          "contact_number",
          "whatsapp"
        ],
        ids: ["phone", "telephone", "mobile", "phone-number"],
        autocomplete: ["tel", "tel-national", "tel-local"],
        placeholders: ["phone", "telephone", "mobile", "whatsapp", "nomor telepon", "hp"]
      },
      fn: {
        names: [
          "first_name",
          "firstName",
          "fname",
          "given-name",
          "givenName",
          "first",
          "name_first",
          "billing_first_name"
        ],
        ids: ["first-name", "firstname", "fname", "given-name"],
        autocomplete: ["given-name"],
        placeholders: ["first name", "given name", "nama depan"]
      },
      ln: {
        names: [
          "last_name",
          "lastName",
          "lname",
          "family-name",
          "familyName",
          "surname",
          "last",
          "name_last",
          "billing_last_name"
        ],
        ids: ["last-name", "lastname", "lname", "family-name", "surname"],
        autocomplete: ["family-name"],
        placeholders: ["last name", "family name", "surname", "nama belakang"]
      },
      ct: {
        names: ["city", "town", "billing_city", "shipping_city", "address_city"],
        ids: ["city", "billing-city", "shipping-city"],
        autocomplete: ["address-level2"],
        placeholders: ["city", "town", "kota"]
      },
      st: {
        names: ["state", "province", "region", "billing_state", "shipping_state"],
        ids: ["state", "province", "region", "billing-state"],
        autocomplete: ["address-level1"],
        placeholders: ["state", "province", "region", "provinsi"]
      },
      zp: {
        names: [
          "zip",
          "zipcode",
          "zip_code",
          "postal",
          "postal_code",
          "postcode",
          "billing_zip",
          "billing_postcode",
          "shipping_zip"
        ],
        ids: ["zip", "zipcode", "postal-code", "postcode"],
        autocomplete: ["postal-code"],
        placeholders: ["zip", "postal code", "zip code", "kode pos"]
      },
      country: {
        names: ["country", "country_code", "countryCode", "billing_country", "shipping_country"],
        ids: ["country", "billing-country", "shipping-country"],
        autocomplete: ["country", "country-name"],
        placeholders: ["country", "negara"]
      },
      ge: {
        names: ["gender", "sex"],
        ids: ["gender", "sex"],
        autocomplete: ["sex"],
        placeholders: ["gender", "jenis kelamin"]
      },
      db: {
        names: [
          "birthday",
          "birthdate",
          "date_of_birth",
          "dob",
          "dateOfBirth",
          "birth_date",
          "bday"
        ],
        ids: ["birthday", "birthdate", "dob", "date-of-birth"],
        autocomplete: ["bday"],
        placeholders: ["birthday", "date of birth", "tanggal lahir"]
      }
    },
    detectFieldParam(input) {
      const type = (input.type || "").toLowerCase();
      const name = (input.name || "").toLowerCase();
      const id = (input.id || "").toLowerCase();
      const autocomplete = (input.autocomplete || "").toLowerCase();
      const placeholder = ("placeholder" in input ? input.placeholder || "" : "").toLowerCase();
      if (config.advancedMatching.formFieldMap) {
        for (const [selector, param] of Object.entries(config.advancedMatching.formFieldMap)) {
          try {
            if (input.matches(selector)) return param;
          } catch {
          }
        }
      }
      for (const [param, patterns] of Object.entries(this._fieldPatterns)) {
        if ("types" in patterns && patterns.types && patterns.types.includes(type)) return param;
        if (patterns.names && patterns.names.some((n) => name.includes(n))) return param;
        if (patterns.ids && patterns.ids.some((i) => id.includes(i))) return param;
        if (patterns.autocomplete && patterns.autocomplete.includes(autocomplete)) return param;
        if (patterns.placeholders && patterns.placeholders.some((p) => placeholder.includes(p))) return param;
      }
      if (["name", "full_name", "fullname", "customer_name"].includes(name) || ["name", "full-name", "fullname"].includes(id)) {
        return "_fullname";
      }
      return null;
    },
    scanForm(form) {
      const data = {};
      const inputs = form.querySelectorAll(
        "input, select, textarea"
      );
      for (const input of inputs) {
        if (input.type === "hidden" || input.type === "password" || input.type === "submit") continue;
        const value = input.value?.trim();
        if (!value) continue;
        const param = this.detectFieldParam(input);
        if (!param) continue;
        if (param === "_fullname") {
          const parts = value.split(/\s+/);
          if (parts.length >= 2) {
            data.fn = data.fn || parts[0];
            data.ln = data.ln || parts.slice(1).join(" ");
          } else {
            data.fn = data.fn || value;
          }
        } else {
          data[param] = data[param] || value;
        }
      }
      return data;
    },
    watchForms() {
      document2.addEventListener("submit", (e) => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement)) return;
        const data = this.scanForm(form);
        if (Object.keys(data).length > 0) {
          this._mergeCapture("form", data);
          log("AdvancedMatching: form submit captured", Object.keys(data));
          if (config.advancedMatching.autoIdentifyOnSubmit && (data.em || data.ph)) {
            MetaTracker.identify(data);
          }
        }
      }, true);
      document2.addEventListener("change", (e) => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) return;
        const value = input.value?.trim();
        if (!value) return;
        const param = this.detectFieldParam(input);
        if (!param || param === "_fullname") return;
        this._mergeCapture("form", { [param]: value });
        log("AdvancedMatching: field captured", param);
      }, true);
      const startObserving = () => {
        this._scanExistingForms();
        if (window2.MutationObserver && document2.body) {
          this._formObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                const el = node;
                if (el.tagName === "FORM") {
                  this._scanSingleForm(el);
                } else if (el.querySelectorAll) {
                  el.querySelectorAll("form").forEach((f) => this._scanSingleForm(f));
                }
              }
            }
          });
          this._formObserver.observe(document2.body, { childList: true, subtree: true });
        }
      };
      if (document2.body) {
        startObserving();
      } else {
        document2.addEventListener("DOMContentLoaded", startObserving);
      }
    },
    _scanExistingForms() {
      document2.querySelectorAll("form").forEach((form) => this._scanSingleForm(form));
    },
    _scanSingleForm(form) {
      const data = this.scanForm(form);
      if (Object.keys(data).length > 0) {
        this._mergeCapture("form_prefill", data);
        log("AdvancedMatching: pre-filled form scanned", Object.keys(data));
      }
    },
    // ── URL PARAMETER CAPTURE ────────────────────────────────
    captureFromUrl() {
      try {
        const url = new URL(window2.location.href);
        const params = url.searchParams;
        const data = {};
        const emailParams = ["email", "em", "e", "user_email", "customer_email"];
        for (const p of emailParams) {
          const val = params.get(p);
          if (val && val.includes("@")) {
            data.em = val;
            break;
          }
        }
        const phoneParams = ["phone", "ph", "tel", "mobile", "whatsapp"];
        for (const p of phoneParams) {
          const val = params.get(p);
          if (val && val.replace(/\D/g, "").length >= 7) {
            data.ph = val;
            break;
          }
        }
        if (params.get("first_name") || params.get("fn")) {
          data.fn = params.get("first_name") || params.get("fn") || void 0;
        }
        if (params.get("last_name") || params.get("ln")) {
          data.ln = params.get("last_name") || params.get("ln") || void 0;
        }
        const eidParams = ["external_id", "eid", "user_id", "uid", "customer_id", "player_id"];
        for (const p of eidParams) {
          const val = params.get(p);
          if (val) {
            data.external_id = val;
            break;
          }
        }
        if (params.get("country") || params.get("cc")) {
          data.country = params.get("country") || params.get("cc") || void 0;
        }
        if (Object.keys(data).length > 0) {
          this._mergeCapture("url", data);
          log("AdvancedMatching: URL params captured", Object.keys(data));
        }
      } catch {
      }
    },
    // ── DATALAYER CAPTURE ────────────────────────────────────
    captureFromDataLayer() {
      const dlKey = config.advancedMatching.dataLayerKey || "dataLayer";
      const dl = window2[dlKey];
      if (Array.isArray(dl)) {
        for (const entry of dl) {
          this._extractFromDataLayerEntry(entry);
        }
        const origPush = dl.push.bind(dl);
        dl.push = (...args) => {
          const result = origPush(...args);
          for (const entry of args) {
            this._extractFromDataLayerEntry(entry);
          }
          return result;
        };
      }
      const userDataKey = config.advancedMatching.userDataKey;
      if (userDataKey && window2[userDataKey]) {
        this._extractUserObject(window2[userDataKey], "customDataLayer");
      }
    },
    _extractFromDataLayerEntry(entry) {
      if (!entry || typeof entry !== "object") return;
      const userKeys = ["user", "userData", "user_data", "customer", "visitor", "contact"];
      for (const key of userKeys) {
        if (entry[key] && typeof entry[key] === "object") {
          this._extractUserObject(entry[key], "dataLayer");
        }
      }
      if (entry.ecommerce) {
        const ecom = entry.ecommerce;
        if (ecom.purchase?.actionField) {
          const af = ecom.purchase.actionField;
          if (af.email) this._mergeCapture("dataLayer", { em: af.email });
        }
      }
      this._extractUserObject(entry, "dataLayer");
    },
    _extractUserObject(obj, source) {
      if (!obj || typeof obj !== "object") return;
      const data = {};
      const fieldMap = {
        email: "em",
        em: "em",
        user_email: "em",
        customerEmail: "em",
        phone: "ph",
        ph: "ph",
        telephone: "ph",
        mobile: "ph",
        phoneNumber: "ph",
        first_name: "fn",
        fn: "fn",
        firstName: "fn",
        givenName: "fn",
        last_name: "ln",
        ln: "ln",
        lastName: "ln",
        familyName: "ln",
        surname: "ln",
        gender: "ge",
        ge: "ge",
        sex: "ge",
        date_of_birth: "db",
        db: "db",
        birthday: "db",
        dob: "db",
        birthdate: "db",
        city: "ct",
        ct: "ct",
        town: "ct",
        state: "st",
        st: "st",
        province: "st",
        region: "st",
        zip: "zp",
        zp: "zp",
        zipcode: "zp",
        postal_code: "zp",
        postcode: "zp",
        country: "country",
        country_code: "country",
        countryCode: "country",
        external_id: "external_id",
        user_id: "external_id",
        userId: "external_id",
        customer_id: "external_id",
        customerId: "external_id"
      };
      for (const [key, param] of Object.entries(fieldMap)) {
        const val = obj[key];
        if (val && typeof val === "string" && val.trim()) {
          data[param] = val.trim();
        }
      }
      if (Object.keys(data).length > 0) {
        this._mergeCapture(source, data);
        log("AdvancedMatching: data layer captured", Object.keys(data));
      }
    },
    // ── META TAG CAPTURE ─────────────────────────────────────
    captureFromMetaTags() {
      const data = {};
      const scripts = document2.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const json = JSON.parse(script.textContent || "{}");
          if (json.email) data.em = json.email;
          if (json.telephone) data.ph = json.telephone;
          if (json.givenName) data.fn = json.givenName;
          if (json.familyName) data.ln = json.familyName;
          if (json.address && typeof json.address === "object") {
            const addr = json.address;
            if (addr.addressLocality) data.ct = addr.addressLocality;
            if (addr.addressRegion) data.st = addr.addressRegion;
            if (addr.postalCode) data.zp = addr.postalCode;
            if (addr.addressCountry) data.country = addr.addressCountry;
          }
        } catch {
        }
      }
      const ogEmail = document2.querySelector('meta[property="profile:email"]');
      if (ogEmail?.content) data.em = ogEmail.content;
      const ogFirstName = document2.querySelector('meta[property="profile:first_name"]');
      if (ogFirstName?.content) data.fn = ogFirstName.content;
      const ogLastName = document2.querySelector('meta[property="profile:last_name"]');
      if (ogLastName?.content) data.ln = ogLastName.content;
      const ogGender = document2.querySelector('meta[property="profile:gender"]');
      if (ogGender?.content) data.ge = ogGender.content;
      if (Object.keys(data).length > 0) {
        this._mergeCapture("metatag", data);
        log("AdvancedMatching: meta tags captured", Object.keys(data));
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
      metatag: 30
    },
    _mergeCapture(source, data) {
      for (const [param, value] of Object.entries(data)) {
        if (!value) continue;
        const existing = this._capturedData[param];
        const existingPriority = existing ? this._sourcePriority[existing.source] || 0 : -1;
        const newPriority = this._sourcePriority[source] || 0;
        if (!existing || newPriority >= existingPriority) {
          this._capturedData[param] = { value, source };
        }
      }
    },
    getCapturedData() {
      const result = {};
      for (const [param, entry] of Object.entries(this._capturedData)) {
        result[param] = entry.value;
      }
      return result;
    },
    async buildUserData(explicitUserData = {}) {
      const merged = { ...this.getCapturedData() };
      const storageMap = {
        em: "_mt_em",
        ph: "_mt_ph",
        external_id: "_mt_eid",
        fn: "_mt_fn",
        ln: "_mt_ln",
        ct: "_mt_ct",
        st: "_mt_st",
        zp: "_mt_zp",
        country: "_mt_country"
      };
      for (const [field, storageKey] of Object.entries(storageMap)) {
        if (!merged[field] && storageKey) {
          const stored = getFromStorage(storageKey);
          if (stored) merged[field] = stored;
        }
      }
      const aliasMap = {
        email: "em",
        phone: "ph",
        first_name: "fn",
        last_name: "ln",
        gender: "ge",
        date_of_birth: "db",
        city: "ct",
        state: "st",
        zip: "zp",
        zipcode: "zp",
        postal_code: "zp"
      };
      for (const [key, value] of Object.entries(explicitUserData)) {
        const param = aliasMap[key] || key;
        if (value) merged[param] = value;
      }
      const result = await this.normalizeAndHash(merged);
      result.fbp = result.fbp || CookieKeeper.getFbp() || void 0;
      result.fbc = result.fbc || CookieKeeper.getFbc() || void 0;
      result.client_user_agent = result.client_user_agent || navigator.userAgent;
      if (!result.external_id) {
        const visitorId = CookieKeeper.getVisitorId();
        if (visitorId) result.external_id = await sha256(visitorId) ?? void 0;
      }
      return result;
    },
    scoreMatchQuality(userData) {
      let score = 0;
      const weights = {
        em: 30,
        ph: 25,
        external_id: 15,
        fn: 5,
        ln: 5,
        ct: 3,
        st: 2,
        zp: 3,
        country: 2,
        ge: 2,
        db: 3,
        fbp: 5,
        fbc: 10,
        client_ip_address: 3,
        client_user_agent: 2
      };
      for (const [field, weight] of Object.entries(weights)) {
        if (userData[field]) score += weight;
      }
      return Math.min(score, 100);
    },
    getDiagnostics() {
      const captured = {};
      for (const [param, entry] of Object.entries(this._capturedData)) {
        captured[param] = {
          source: entry.source,
          hasValue: true,
          isHashed: isHashed(entry.value)
        };
      }
      return {
        capturedFields: Object.keys(this._capturedData).length,
        fields: captured,
        storedIdentity: {
          em: !!getFromStorage("_mt_em"),
          ph: !!getFromStorage("_mt_ph"),
          fn: !!getFromStorage("_mt_fn"),
          ln: !!getFromStorage("_mt_ln"),
          external_id: !!getFromStorage("_mt_eid")
        }
      };
    }
  };
  const CookieKeeper = {
    init() {
      if (!config.cookieKeeper.enabled) return;
      this.restoreCookies();
      this.captureFbclid();
      this.ensureFbp();
      this.ensureVisitorId();
      this.syncToServer();
      this.scheduleRefresh();
      log("CookieKeeper: ready", { fbp: this.getFbp(), fbc: this.getFbc() });
    },
    restoreCookies() {
      const cookieNames = config.cookieKeeper.cookieNames || [];
      for (const name of cookieNames) {
        if (!getCookie(name)) {
          try {
            const backup = localStorage.getItem("mt_" + name);
            if (backup) setCookie(name, backup, config.cookieKeeper.maxAge);
          } catch {
          }
        } else {
          try {
            localStorage.setItem("mt_" + name, getCookie(name));
          } catch {
          }
        }
      }
    },
    captureFbclid() {
      try {
        const fbclid = new URL(window2.location.href).searchParams.get("fbclid");
        if (fbclid) {
          const fbc = `fb.1.${Math.floor(Date.now() / 1e3)}.${fbclid}`;
          saveToStorage("_fbc", fbc, config.cookieKeeper.maxAge);
        }
      } catch {
      }
    },
    ensureFbp() {
      if (!getFromStorage("_fbp")) {
        const fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 2147483647)}`;
        saveToStorage("_fbp", fbp, config.cookieKeeper.maxAge);
      }
    },
    ensureVisitorId() {
      if (!getFromStorage("_mt_id")) {
        generateVisitorId();
      }
    },
    async syncToServer() {
      const cookies = {
        _fbp: getFromStorage("_fbp"),
        _fbc: getFromStorage("_fbc"),
        _mt_id: getFromStorage("_mt_id"),
        _mt_em: getFromStorage("_mt_em"),
        _mt_ph: getFromStorage("_mt_ph")
      };
      if (!cookies._fbp && !cookies._fbc && !cookies._mt_id) return;
      const lastSync = getFromStorage("_mt_cookie_sync");
      if (lastSync && Date.now() - parseInt(lastSync, 10) < config.cookieKeeper.refreshInterval) return;
      try {
        await transportSend(resolveEndpoint("/cookie-sync"), {
          cookies,
          domain: window2.location.hostname,
          max_age: config.cookieKeeper.maxAge
        });
        saveToStorage("_mt_cookie_sync", Date.now().toString(), 1);
      } catch (e) {
        warn("CookieKeeper: sync failed", e.message);
      }
    },
    refreshCookies() {
      const days = config.cookieKeeper.maxAge;
      for (const name of config.cookieKeeper.cookieNames || []) {
        const value = getFromStorage(name);
        if (value) setCookie(name, value, days);
      }
      saveToStorage("_mt_cookie_sync", "0", 1);
      this.syncToServer();
    },
    scheduleRefresh() {
      if (cookieKeeperTimer) clearInterval(cookieKeeperTimer);
      cookieKeeperTimer = setInterval(() => this.refreshCookies(), config.cookieKeeper.refreshInterval);
      document2.addEventListener("visibilitychange", () => {
        if (document2.visibilityState === "visible") this.restoreCookies();
      });
    },
    getFbp() {
      return getFromStorage("_fbp");
    },
    getFbc() {
      return getFromStorage("_fbc");
    },
    getVisitorId() {
      return getFromStorage("_mt_id");
    }
  };
  const AdBlockRecovery = {
    async detect() {
      if (!config.adBlockRecovery.enabled) return false;
      try {
        const testUrl = config.endpoint.replace(/\/track\/?$/, "") + "/health";
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3e3);
        const response = await fetch(testUrl, { method: "GET", signal: controller.signal, cache: "no-store" });
        clearTimeout(timeout);
        if (!response.ok) throw new Error("Blocked");
        return false;
      } catch {
        adBlockDetected = true;
        log("AdBlockRecovery: DETECTED");
        return true;
      }
    },
    getEndpoint(path) {
      if (adBlockDetected && config.adBlockRecovery.proxyPath) {
        return config.endpoint.replace(/\/api\/v1\/track\/?$/, "") + config.adBlockRecovery.proxyPath + path;
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
      return { d: btoa(JSON.stringify(data)), t: Date.now(), v: VERSION };
    },
    getHeaders() {
      const h = { "Content-Type": "application/json" };
      h[adBlockDetected ? "X-Request-Token" : "X-API-Key"] = config.apiKey;
      return h;
    }
  };
  const PixelRouter = {
    resolve(hostname) {
      hostname = hostname || window2.location.hostname;
      if (!config.pixels || config.pixels.length === 0) return config.pixelId ? [config.pixelId] : [];
      const matched = [];
      let catchAll = null;
      for (const pc of config.pixels) {
        if (!pc.pixelId || !pc.domains) continue;
        for (const pattern of pc.domains) {
          if (pattern === "*") {
            catchAll = pc.pixelId;
            continue;
          }
          if (this.matchDomain(hostname, pattern)) {
            matched.push(pc.pixelId);
            break;
          }
        }
      }
      if (matched.length === 0 && catchAll) matched.push(catchAll);
      return [...new Set(matched)];
    },
    matchDomain(hostname, pattern) {
      if (hostname === pattern) return true;
      if (pattern.startsWith("*.")) {
        const suffix = pattern.substring(2);
        return hostname.endsWith("." + suffix) || hostname === suffix;
      }
      return hostname.endsWith("." + pattern);
    },
    getAllPixelIds() {
      if (!config.pixels || config.pixels.length === 0) return config.pixelId ? [config.pixelId] : [];
      return [...new Set(config.pixels.map((p) => p.pixelId).filter(Boolean))];
    }
  };
  function resolveEndpoint(path) {
    return adBlockDetected ? AdBlockRecovery.getEndpoint(path) : config.endpoint + path;
  }
  async function transportFetch(url, data) {
    const headers = AdBlockRecovery.getHeaders();
    const body = adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data;
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      keepalive: true,
      credentials: "include"
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json().catch(() => ({}));
  }
  function transportBeacon(url, data) {
    const body = adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data;
    const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
    if (!navigator.sendBeacon(url + "?api_key=" + encodeURIComponent(config.apiKey), blob)) {
      throw new Error("Beacon failed");
    }
    return Promise.resolve({ sent: true });
  }
  function transportXhr(url, data) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      const headers = AdBlockRecovery.getHeaders();
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.withCredentials = true;
      xhr.timeout = 1e4;
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(JSON.parse(xhr.responseText || "{}")) : reject(new Error(`XHR ${xhr.status}`));
      xhr.onerror = () => reject(new Error("XHR error"));
      xhr.ontimeout = () => reject(new Error("XHR timeout"));
      xhr.send(JSON.stringify(adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data));
    });
  }
  function transportImage(url, data) {
    return new Promise((resolve, reject) => {
      const encoded = btoa(JSON.stringify(data));
      const params = new URLSearchParams({ d: encoded, k: config.apiKey, t: Date.now().toString() });
      const imgUrl = url.replace(/\/(event|batch)$/, "/pixel.gif") + "?" + params;
      if (imgUrl.length > 4e3) {
        reject(new Error("Payload too large"));
        return;
      }
      const img = new Image(1, 1);
      img.onload = () => resolve({ sent: true });
      img.onerror = () => reject(new Error("Image pixel failed"));
      img.src = imgUrl;
    });
  }
  async function transportSend(url, data, attempt = 0) {
    const transports = [
      { name: "fetch", fn: transportFetch },
      { name: "beacon", fn: transportBeacon, skip: !config.adBlockRecovery.useBeacon },
      { name: "xhr", fn: transportXhr },
      { name: "img", fn: transportImage, skip: !config.adBlockRecovery.useImage }
    ].filter((t) => !t.skip);
    for (const transport of transports) {
      const pathSuffix = url.includes(config.endpoint) ? url.replace(config.endpoint, "") : url.replace(/^https?:\/\/[^\/]+/, "").replace(/.*\/api\/v1\/track/, "");
      const endpoints = adBlockDetected ? AdBlockRecovery.getFallbackEndpoints(pathSuffix) : [url];
      for (const ep of endpoints) {
        try {
          const result = await transport.fn(ep, data);
          if (transport.name !== transportMethod) {
            log(`Transport: ${transportMethod} \u2192 ${transport.name}`);
            transportMethod = transport.name;
          }
          return result;
        } catch (e) {
          log(`${transport.name} \u2192 ${ep}: ${e.message}`);
        }
      }
    }
    if (attempt < RETRY_DELAYS.length) {
      return new Promise(
        (r) => setTimeout(() => r(transportSend(url, data, attempt + 1)), RETRY_DELAYS[attempt])
      );
    }
    warn("All transports exhausted");
    return void 0;
  }
  async function sendEvents(events) {
    if (!events.length) return;
    const url = events.length === 1 ? resolveEndpoint("/event") : resolveEndpoint("/batch");
    const body = events.length === 1 ? events[0] : { events };
    try {
      await transportSend(url, body);
    } catch (e) {
      warn("Send failed:", e);
    }
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
    } else {
      flushQueue();
    }
  }
  const BrowserPixel = {
    _loaded: false,
    init() {
      if (!config.browserPixel.enabled) return;
      if (this._loaded) return;
      if (typeof window2.fbq === "function") {
        log("BrowserPixel: fbq already present, initializing pixels");
        this._initPixels();
        this._loaded = true;
        return;
      }
      log("BrowserPixel: loading fbevents.js");
      const n = window2.fbq = function() {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!window2._fbq) window2._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      const script = document2.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      const firstScript = document2.getElementsByTagName("script")[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else {
        const insert = () => {
          const s = document2.getElementsByTagName("script")[0];
          if (s && s.parentNode) s.parentNode.insertBefore(script, s);
          else document2.head.appendChild(script);
        };
        if (document2.body) insert();
        else document2.addEventListener("DOMContentLoaded", insert);
      }
      this._initPixels();
      this._loaded = true;
    },
    _initPixels() {
      const pixelIds = PixelRouter.getAllPixelIds();
      if (!pixelIds.length) {
        warn("BrowserPixel: no pixel IDs configured");
        return;
      }
      for (const pid of pixelIds) {
        window2.fbq("init", pid);
        log("BrowserPixel: init pixel", pid);
      }
      if (config.browserPixel.autoPageView) {
        window2.fbq("track", "PageView");
        log("BrowserPixel: PageView fired");
      }
    },
    trackEvent(eventName, eventId, customData = {}, pixelId = null) {
      if (!config.browserPixel.enabled || !config.browserPixel.syncEvents) return;
      if (typeof window2.fbq !== "function") return;
      const standardEvents = [
        "PageView",
        "ViewContent",
        "AddToCart",
        "AddPaymentInfo",
        "AddToWishlist",
        "CompleteRegistration",
        "Contact",
        "CustomizeProduct",
        "Donate",
        "FindLocation",
        "InitiateCheckout",
        "Lead",
        "Purchase",
        "Schedule",
        "Search",
        "StartTrial",
        "SubmitApplication",
        "Subscribe"
      ];
      const isStandard = standardEvents.includes(eventName);
      const fbqParams = { ...customData };
      const fbqOptions = { eventID: eventId };
      if (isStandard) {
        window2.fbq("track", eventName, fbqParams, fbqOptions);
      } else {
        window2.fbq("trackCustom", eventName, fbqParams, fbqOptions);
      }
      log("BrowserPixel: synced", eventName, "eventID:", eventId);
    }
  };
  const GA4_EVENT_MAP = {
    page_view: "PageView",
    view_item: "ViewContent",
    view_item_list: "ViewContent",
    select_item: "ViewContent",
    add_to_cart: "AddToCart",
    add_to_wishlist: "AddToWishlist",
    begin_checkout: "InitiateCheckout",
    add_payment_info: "AddPaymentInfo",
    purchase: "Purchase",
    refund: "",
    remove_from_cart: "",
    sign_up: "CompleteRegistration",
    generate_lead: "Lead",
    search: "Search",
    login: "",
    view_cart: "ViewContent",
    add_shipping_info: "AddPaymentInfo",
    select_promotion: "ViewContent"
  };
  let _gtmInitialized = false;
  let _originalDlPush = null;
  const GtmIntegration = {
    init() {
      if (!config.gtm.enabled || _gtmInitialized) return;
      try {
        log("GTM: initializing dataLayer bridge");
        const dlKey = config.gtm.dataLayerKey || "dataLayer";
        if (!Array.isArray(window2[dlKey])) {
          window2[dlKey] = [];
          log("GTM: created", dlKey);
        }
        const dataLayer = window2[dlKey];
        if (config.gtm.autoMapEcommerce) {
          for (const entry of dataLayer) {
            try {
              this._processEntry(entry);
            } catch (err) {
              warn("GTM: error processing existing entry", err);
            }
          }
        }
        _originalDlPush = dataLayer.push.bind(dataLayer);
        dataLayer.push = (...args) => {
          const result = _originalDlPush(...args);
          if (config.gtm.autoMapEcommerce) {
            for (const entry of args) {
              try {
                this._processEntry(entry);
              } catch (err) {
                warn("GTM: error processing push", err);
              }
            }
          }
          return result;
        };
        _gtmInitialized = true;
        log("GTM: dataLayer bridge active");
      } catch (err) {
        warn("GTM: failed to initialize", err);
      }
    },
    _processEntry(entry) {
      if (!entry || typeof entry !== "object") return;
      const obj = entry;
      const event = obj.event;
      if (!event || typeof event !== "string") return;
      if (event.startsWith("gtm.") || obj._source === "meta-capi-tracker") return;
      const metaEvent = this._resolveEventName(event);
      if (!metaEvent) return;
      let customData = {};
      let userData = {};
      try {
        const ecom = obj.ecommerce;
        customData = this._extractCustomData(event, ecom, obj);
        userData = this._extractUserData(obj);
      } catch (err) {
        warn("GTM: error extracting data", event, err);
        return;
      }
      log("GTM: mapping", event, "\u2192", metaEvent);
      if (window2.MetaTracker && typeof window2.MetaTracker.track === "function") {
        window2.MetaTracker.track(metaEvent, customData, userData).catch((err) => {
          warn("GTM: failed to track mapped event", metaEvent, err);
        });
      }
    },
    _resolveEventName(dlEvent) {
      const custom = config.gtm.eventMapping[dlEvent];
      if (custom) return custom;
      const mapped = GA4_EVENT_MAP[dlEvent];
      if (mapped !== void 0) return mapped || null;
      return null;
    },
    _extractCustomData(_eventName, ecommerce, dlEntry) {
      const cd = {};
      const ecom = ecommerce ?? {};
      if (ecom.value !== void 0) cd.value = Number(ecom.value);
      if (ecom.currency) cd.currency = String(ecom.currency);
      if (ecom.transaction_id) cd.order_id = String(ecom.transaction_id);
      if (ecom.search_term) cd.search_string = String(ecom.search_term);
      if (dlEntry.search_term) cd.search_string = String(dlEntry.search_term);
      const items = ecom.items;
      if (Array.isArray(items) && items.length) {
        cd.content_ids = items.map((i) => String(i.item_id ?? i.item_name ?? "")).filter(Boolean);
        cd.contents = items.map((i) => ({ id: String(i.item_id ?? i.item_name ?? ""), quantity: i.quantity ?? 1, item_price: i.price }));
        cd.num_items = items.reduce((sum, i) => sum + (i.quantity ?? 1), 0);
        cd.content_type = "product";
        if (items[0]?.item_name) cd.content_name = items[0].item_name;
        if (items[0]?.item_category) cd.content_category = items[0].item_category;
      }
      if (cd.value === void 0 && Array.isArray(cd.contents)) {
        cd.value = cd.contents.reduce(
          (sum, c) => sum + (c.item_price ?? 0) * (c.quantity ?? 1),
          0
        );
      }
      return cd;
    },
    _extractUserData(dlEntry) {
      const ud = {};
      const userKeys = ["user", "userData", "user_data", "customer", "visitor", "contact"];
      for (const key of userKeys) {
        if (dlEntry[key] && typeof dlEntry[key] === "object") {
          const obj = dlEntry[key];
          if (obj.email || obj.em) ud.em = String(obj.email ?? obj.em);
          if (obj.phone || obj.ph) ud.ph = String(obj.phone ?? obj.ph);
          if (obj.first_name || obj.fn || obj.firstName) ud.fn = String(obj.first_name ?? obj.fn ?? obj.firstName);
          if (obj.last_name || obj.ln || obj.lastName) ud.ln = String(obj.last_name ?? obj.ln ?? obj.lastName);
          if (obj.external_id || obj.user_id || obj.userId) ud.external_id = String(obj.external_id ?? obj.user_id ?? obj.userId);
          if (obj.city || obj.ct) ud.ct = String(obj.city ?? obj.ct);
          if (obj.state || obj.st) ud.st = String(obj.state ?? obj.st);
          if (obj.zip || obj.zp || obj.postal_code) ud.zp = String(obj.zip ?? obj.zp ?? obj.postal_code);
          if (obj.country || obj.country_code) ud.country = String(obj.country ?? obj.country_code);
        }
      }
      if (dlEntry.user_id) ud.external_id = ud.external_id || String(dlEntry.user_id);
      if (dlEntry.userId) ud.external_id = ud.external_id || String(dlEntry.userId);
      return ud;
    },
    pushToDataLayer(event, data = {}) {
      try {
        const dlKey = config.gtm.dataLayerKey || "dataLayer";
        const dl = window2[dlKey];
        if (!Array.isArray(dl)) {
          warn("GTM: dataLayer not found");
          return;
        }
        const pushFn = _originalDlPush ?? dl.push.bind(dl);
        pushFn({ event, ...data, _source: "meta-capi-tracker" });
        log("GTM: pushed to dataLayer:", event);
      } catch (err) {
        warn("GTM: error pushing to dataLayer", event, err);
      }
    },
    notifyDataLayer(eventName, eventId, customData = {}) {
      if (!config.gtm.enabled || !config.gtm.pushToDataLayer) return;
      try {
        this.pushToDataLayer("meta_capi_event", { meta_event_name: eventName, meta_event_id: eventId, meta_custom_data: customData });
      } catch (err) {
        warn("GTM: error notifying dataLayer", eventName, err);
      }
    }
  };
  const MetaTracker = {
    VERSION,
    async init(options) {
      if (initialized) {
        warn("Already initialized");
        return this;
      }
      if (!options.endpoint || !options.apiKey) {
        warn("Missing: endpoint, apiKey");
        return this;
      }
      if (!("pixelId" in options && options.pixelId) && !("pixels" in options && options.pixels?.length)) {
        warn("Missing: pixelId or pixels[]");
        return this;
      }
      if (options.respectDnt && (navigator.doNotTrack === "1" || window2.doNotTrack === "1")) return this;
      config = {
        ...config,
        ...options,
        browserPixel: { ...config.browserPixel, ...options.browserPixel || {} },
        cookieKeeper: { ...config.cookieKeeper, ...options.cookieKeeper || {} },
        adBlockRecovery: { ...config.adBlockRecovery, ...options.adBlockRecovery || {} },
        advancedMatching: { ...config.advancedMatching, ...options.advancedMatching || {} },
        gtm: { ...config.gtm, ...options.gtm || {} }
      };
      initialized = true;
      log("Initialized v" + VERSION);
      BrowserPixel.init();
      CookieKeeper.init();
      AdvancedMatching.init();
      GtmIntegration.init();
      if (config.adBlockRecovery.enabled) {
        AdBlockRecovery.detect().then((b) => {
          if (b) log("Ad blocker recovery: ACTIVE");
        });
      }
      if (config.autoPageView) await this.trackPageView();
      window2.addEventListener("visibilitychange", () => {
        if (document2.visibilityState === "hidden") flushQueue();
      });
      window2.addEventListener("beforeunload", flushQueue);
      return this;
    },
    async track(eventName, customData = {}, userData = {}, options = {}) {
      if (!initialized) {
        warn("Not initialized");
        return void 0;
      }
      const eventId = options.event_id || generateEventId();
      const enrichedUserData = config.advancedMatching.enabled ? await AdvancedMatching.buildUserData(userData) : await AdvancedMatching.normalizeAndHash(userData);
      const matchScore = AdvancedMatching.scoreMatchQuality(enrichedUserData);
      log(`Match quality: ${matchScore}/100`);
      if (matchScore < config.minMatchQuality) {
        warn(`Match quality ${matchScore} below threshold ${config.minMatchQuality}, skipping event`);
        return void 0;
      }
      const pixelIds = options.pixel_id ? [options.pixel_id] : PixelRouter.resolve();
      if (!pixelIds.length) {
        warn("No pixel for:", window2.location.hostname);
        return void 0;
      }
      for (const pixelId of pixelIds) {
        const event = {
          pixel_id: pixelId,
          event_name: eventName,
          event_id: pixelIds.length > 1 ? `${eventId}_${pixelId.slice(-4)}` : eventId,
          event_time: Math.floor(Date.now() / 1e3),
          event_source_url: window2.location.href,
          action_source: options.action_source || "website",
          user_data: { ...enrichedUserData },
          match_quality: matchScore,
          visitor_id: CookieKeeper.getVisitorId() || null
        };
        if (Object.keys(customData).length > 0) event.custom_data = customData;
        log("Track:", eventName, "\u2192", pixelId, `(match: ${matchScore})`);
        enqueueEvent(event);
        BrowserPixel.trackEvent(eventName, event.event_id, customData, pixelId);
      }
      GtmIntegration.notifyDataLayer(eventName, eventId, customData);
      return eventId;
    },
    // ── Convenience methods ────────────────────────────────────
    trackPageView(ud = {}) {
      return this.track("PageView", {}, ud);
    },
    trackViewContent(cd = {}, ud = {}) {
      return this.track("ViewContent", cd, ud);
    },
    trackAddToCart(cd = {}, ud = {}) {
      return this.track("AddToCart", cd, ud);
    },
    trackPurchase(cd = {}, ud = {}) {
      return this.track("Purchase", cd, ud);
    },
    trackLead(cd = {}, ud = {}) {
      return this.track("Lead", cd, ud);
    },
    trackCompleteRegistration(cd = {}, ud = {}) {
      return this.track("CompleteRegistration", cd, ud);
    },
    trackInitiateCheckout(cd = {}, ud = {}) {
      return this.track("InitiateCheckout", cd, ud);
    },
    trackSearch(cd = {}, ud = {}) {
      return this.track("Search", cd, ud);
    },
    trackAddToWishlist(cd = {}, ud = {}) {
      return this.track("AddToWishlist", cd, ud);
    },
    trackAddPaymentInfo(cd = {}, ud = {}) {
      return this.track("AddPaymentInfo", cd, ud);
    },
    trackContact(cd = {}, ud = {}) {
      return this.track("Contact", cd, ud);
    },
    trackCustomizeProduct(cd = {}, ud = {}) {
      return this.track("CustomizeProduct", cd, ud);
    },
    trackDonate(cd = {}, ud = {}) {
      return this.track("Donate", cd, ud);
    },
    trackFindLocation(cd = {}, ud = {}) {
      return this.track("FindLocation", cd, ud);
    },
    trackSchedule(cd = {}, ud = {}) {
      return this.track("Schedule", cd, ud);
    },
    trackStartTrial(cd = {}, ud = {}) {
      return this.track("StartTrial", cd, ud);
    },
    trackSubmitApplication(cd = {}, ud = {}) {
      return this.track("SubmitApplication", cd, ud);
    },
    trackSubscribe(cd = {}, ud = {}) {
      return this.track("Subscribe", cd, ud);
    },
    trackToPixel(pixelId, name, cd = {}, ud = {}) {
      return this.track(name, cd, ud, { pixel_id: pixelId });
    },
    // ── Identity ───────────────────────────────────────────────
    async identify(userData = {}) {
      if (!initialized) {
        warn("Not initialized");
        return;
      }
      const aliasMap = {
        email: "em",
        phone: "ph",
        first_name: "fn",
        last_name: "ln",
        gender: "ge",
        date_of_birth: "db",
        city: "ct",
        state: "st",
        zip: "zp",
        zipcode: "zp",
        postal_code: "zp"
      };
      const normalized = {};
      for (const [key, value] of Object.entries(userData)) {
        if (!value) continue;
        const param = aliasMap[key] || key;
        normalized[param] = value;
      }
      const hashed = await AdvancedMatching.normalizeAndHash(normalized);
      const storageMap = {
        em: "_mt_em",
        ph: "_mt_ph",
        fn: "_mt_fn",
        ln: "_mt_ln",
        external_id: "_mt_eid",
        ct: "_mt_ct",
        st: "_mt_st",
        zp: "_mt_zp",
        country: "_mt_country"
      };
      for (const [field, key] of Object.entries(storageMap)) {
        const val = hashed[field];
        if (val && key) saveToStorage(key, val, config.cookieKeeper.maxAge);
      }
      AdvancedMatching._mergeCapture("identify", normalized);
      log("Identify:", Object.keys(hashed).filter(
        (k) => hashed[k] && !["client_user_agent", "fbp", "fbc"].includes(k)
      ));
      CookieKeeper.syncToServer();
    },
    clearIdentity() {
      const keys = [
        "_mt_em",
        "_mt_ph",
        "_mt_fn",
        "_mt_ln",
        "_mt_eid",
        "_mt_ct",
        "_mt_st",
        "_mt_zp",
        "_mt_country"
      ];
      keys.forEach((k) => removeFromStorage(k));
      AdvancedMatching._capturedData = {};
      log("Identity cleared");
    },
    // ── Multi-domain ───────────────────────────────────────────
    addPixel(pixelId, domains) {
      config.pixels.push({ pixelId, domains: Array.isArray(domains) ? domains : [domains] });
    },
    removePixel(pixelId) {
      config.pixels = config.pixels.filter((p) => p.pixelId !== pixelId);
    },
    // ── Cookie Keeper ──────────────────────────────────────────
    refreshCookies() {
      CookieKeeper.refreshCookies();
    },
    // ── GTM Integration ───────────────────────────────────────
    pushToDataLayer(event, data = {}) {
      GtmIntegration.pushToDataLayer(event, data);
    },
    // ── Diagnostics ────────────────────────────────────────────
    flush() {
      flushQueue();
    },
    isAdBlocked() {
      return adBlockDetected;
    },
    getTransport() {
      return transportMethod;
    },
    getDebugInfo() {
      return {
        version: VERSION,
        initialized,
        transport: transportMethod,
        adBlockDetected,
        config: { endpoint: config.endpoint, pixelId: config.pixelId, pixelCount: config.pixels.length },
        cookies: { fbp: CookieKeeper.getFbp(), fbc: CookieKeeper.getFbc(), visitorId: CookieKeeper.getVisitorId() },
        routing: { domain: window2.location.hostname, active: PixelRouter.resolve(), all: PixelRouter.getAllPixelIds() },
        advancedMatching: AdvancedMatching.getDiagnostics(),
        queueSize: queue.length
      };
    },
    async getMatchQuality(extraUserData = {}) {
      const userData = config.advancedMatching.enabled ? await AdvancedMatching.buildUserData(extraUserData) : await AdvancedMatching.normalizeAndHash(extraUserData);
      return {
        score: AdvancedMatching.scoreMatchQuality(userData),
        fields: Object.keys(userData).filter((k) => userData[k])
      };
    },
    addUserData(data, source = "explicit") {
      AdvancedMatching._mergeCapture(source, data);
    }
  };
  window2.MetaTracker = MetaTracker;
  if (window2.MetaTrackerQueue && Array.isArray(window2.MetaTrackerQueue)) {
    window2.MetaTrackerQueue.forEach(([method, ...args]) => {
      const fn = MetaTracker[method];
      if (typeof fn === "function") fn.apply(MetaTracker, args);
    });
  }
})(window, document);
