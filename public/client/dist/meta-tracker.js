"use strict";
var MetaTrackerBundle = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    MetaTracker: () => MetaTracker,
    default: () => index_default
  });

  // src/state.ts
  var VERSION = "2.1.0";
  var MAX_QUEUE_SIZE = 50;
  var RETRY_DELAYS = [1e3, 5e3, 15e3];
  var BATCH_INTERVAL = 2e3;
  var config = {
    endpoint: "https://meta.wakandaslots.com/api/v1/track",
    apiKey: "77KTyMIdlLOR7HGvyO3Jm02DfFntnka0nYSxWIoiP9YkhVoPLRgy9N6aWZovuyvbm6GdO59tKRHLWAVFq0cWTokaRrwGhnsIZ3le7WD9rIbU5WHbSkhCxjYKc6by23Tk",
    pixelId: "1515428220005755",
    pixels: [],
    autoPageView: true,
    debug: false,
    hashPii: true,
    respectDnt: false,
    batchEvents: true,
    cookieKeeper: { enabled: true, refreshInterval: 864e5, maxAge: 180, cookieNames: ["_fbp", "_fbc", "_mt_id"] },
    adBlockRecovery: { enabled: true, proxyPath: "/collect", useBeacon: true, useImage: true, customEndpoints: [] },
    browserPixel: { enabled: false, autoPageView: true, syncEvents: true },
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
    }
  };
  var queue = [];
  var batchTimer = null;
  var initialized = false;
  var transportMethod = "fetch";
  var adBlockDetected = false;
  var cookieKeeperTimer = null;
  function mergeConfig(opts) {
    Object.assign(config, opts, {
      browserPixel: { ...config.browserPixel, ...opts.browserPixel ?? {} },
      cookieKeeper: { ...config.cookieKeeper, ...opts.cookieKeeper ?? {} },
      adBlockRecovery: { ...config.adBlockRecovery, ...opts.adBlockRecovery ?? {} },
      advancedMatching: { ...config.advancedMatching, ...opts.advancedMatching ?? {} }
    });
  }
  function setInitialized(v) {
    initialized = v;
  }
  function setTransportMethod(v) {
    transportMethod = v;
  }
  function setAdBlockDetected(v) {
    adBlockDetected = v;
  }
  function setBatchTimer(v) {
    batchTimer = v;
  }
  function setCookieKeeperTimer(v) {
    cookieKeeperTimer = v;
  }
  function log(...args) {
    if (config.debug) console.log("[MetaTracker]", ...args);
  }
  function warn(...args) {
    if (config.debug) console.warn("[MetaTracker]", ...args);
  }

  // src/utils.ts
  async function sha256(value) {
    if (!value) return null;
    const data = new TextEncoder().encode(value.toString().trim().toLowerCase());
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function isHashed(value) {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
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
  function getRootDomain() {
    try {
      const parts = window.location.hostname.split(".");
      if (parts.length <= 1 || /^\d+$/.test(parts[parts.length - 1])) return "";
      return parts.slice(-2).join(".");
    } catch {
      return "";
    }
  }
  function setCookie(name, value, days) {
    const maxAge = days * 86400;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    const domain = getRootDomain();
    const domainStr = domain ? `; domain=.${domain}` : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/${domainStr}; max-age=${maxAge}; SameSite=Lax${secure}`;
  }
  function getCookie(name) {
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : null;
  }
  function deleteCookie(name) {
    const domain = getRootDomain();
    document.cookie = `${name}=; path=/${domain ? `; domain=.${domain}` : ""}; max-age=0`;
  }
  function getFromStorage(key) {
    const c = getCookie(key);
    if (c) return c;
    try {
      return localStorage.getItem("mt_" + key);
    } catch {
      return null;
    }
  }
  function saveToStorage(key, value, days) {
    days = days ?? (config.cookieKeeper.maxAge || 180);
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

  // src/ad-block-recovery.ts
  var AdBlockRecovery = {
    async detect() {
      if (!config.adBlockRecovery.enabled) return false;
      try {
        const testUrl = config.endpoint.replace(/\/track\/?$/, "") + "/health";
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3e3);
        const r = await fetch(testUrl, { method: "GET", signal: ctrl.signal, cache: "no-store" });
        clearTimeout(t);
        if (!r.ok) throw new Error("Blocked");
        return false;
      } catch {
        setAdBlockDetected(true);
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
      for (const ep of config.adBlockRecovery.customEndpoints ?? []) eps.push(ep + path);
      return eps;
    },
    disguisePayload(data) {
      if (!adBlockDetected) return data;
      return { d: btoa(JSON.stringify(data)), t: Date.now(), v: VERSION };
    },
    getHeaders() {
      const h = { "Content-Type": "application/json" };
      h[adBlockDetected ? "X-Request-Token" : "X-API-Key"] = config.apiKey;
      return h;
    }
  };

  // src/transport.ts
  function resolveEndpoint(path) {
    return adBlockDetected ? AdBlockRecovery.getEndpoint(path) : config.endpoint + path;
  }
  async function viaFetch(url, data) {
    const body = adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data;
    const r = await fetch(url, {
      method: "POST",
      headers: AdBlockRecovery.getHeaders(),
      body: JSON.stringify(body),
      keepalive: true,
      credentials: "include"
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json().catch(() => ({}));
  }
  function viaBeacon(url, data) {
    const body = adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data;
    const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
    if (!navigator.sendBeacon(url + "?api_key=" + encodeURIComponent(config.apiKey), blob)) {
      throw new Error("Beacon failed");
    }
    return Promise.resolve({ sent: true });
  }
  function viaXhr(url, data) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      for (const [k, v] of Object.entries(AdBlockRecovery.getHeaders())) xhr.setRequestHeader(k, v);
      xhr.withCredentials = true;
      xhr.timeout = 1e4;
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(JSON.parse(xhr.responseText || "{}")) : reject(new Error(`XHR ${xhr.status}`));
      xhr.onerror = () => reject(new Error("XHR error"));
      xhr.ontimeout = () => reject(new Error("XHR timeout"));
      const body = adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data;
      xhr.send(JSON.stringify(body));
    });
  }
  function viaImage(url, data) {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({ d: btoa(JSON.stringify(data)), k: config.apiKey, t: Date.now().toString() });
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
      { name: "fetch", fn: viaFetch },
      { name: "beacon", fn: viaBeacon, skip: !config.adBlockRecovery.useBeacon },
      { name: "xhr", fn: viaXhr },
      { name: "img", fn: viaImage, skip: !config.adBlockRecovery.useImage }
    ].filter((t) => !t.skip);
    for (const transport of transports) {
      const pathSuffix = url.includes(config.endpoint) ? url.replace(config.endpoint, "") : url.replace(/^https?:\/\/[^/]+/, "").replace(/.*\/api\/v1\/track/, "");
      const endpoints = adBlockDetected ? AdBlockRecovery.getFallbackEndpoints(pathSuffix) : [url];
      for (const ep of endpoints) {
        try {
          const result = await transport.fn(ep, data);
          if (transport.name !== transportMethod) {
            log(`Transport: ${transportMethod} \u2192 ${transport.name}`);
            setTransportMethod(transport.name);
          }
          return result;
        } catch (e) {
          log(`${transport.name} \u2192 ${ep}: ${e.message}`);
        }
      }
    }
    if (attempt < RETRY_DELAYS.length) {
      return new Promise((r) => setTimeout(() => r(transportSend(url, data, attempt + 1)), RETRY_DELAYS[attempt]));
    }
    warn("All transports exhausted");
    return void 0;
  }

  // src/cookie-keeper.ts
  var CookieKeeper = {
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
      for (const name of config.cookieKeeper.cookieNames ?? []) {
        if (!getCookie(name)) {
          try {
            const b = localStorage.getItem("mt_" + name);
            if (b) setCookie(name, b, config.cookieKeeper.maxAge);
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
        const fbclid = new URL(window.location.href).searchParams.get("fbclid");
        if (fbclid) saveToStorage("_fbc", `fb.1.${Math.floor(Date.now() / 1e3)}.${fbclid}`, config.cookieKeeper.maxAge);
      } catch {
      }
    },
    ensureFbp() {
      if (!getFromStorage("_fbp")) {
        saveToStorage("_fbp", `fb.1.${Date.now()}.${Math.floor(Math.random() * 2147483647)}`, config.cookieKeeper.maxAge);
      }
    },
    ensureVisitorId() {
      if (!getFromStorage("_mt_id")) generateVisitorId();
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
      const last = getFromStorage("_mt_cookie_sync");
      if (last && Date.now() - parseInt(last, 10) < config.cookieKeeper.refreshInterval) return;
      try {
        await transportSend(resolveEndpoint("/cookie-sync"), { cookies, domain: window.location.hostname, max_age: config.cookieKeeper.maxAge });
        saveToStorage("_mt_cookie_sync", Date.now().toString(), 1);
      } catch (e) {
        warn("CookieKeeper: sync failed", e.message);
      }
    },
    refreshCookies() {
      for (const name of config.cookieKeeper.cookieNames ?? []) {
        const v = getFromStorage(name);
        if (v) setCookie(name, v, config.cookieKeeper.maxAge);
      }
      saveToStorage("_mt_cookie_sync", "0", 1);
      this.syncToServer();
    },
    scheduleRefresh() {
      if (cookieKeeperTimer) clearInterval(cookieKeeperTimer);
      setCookieKeeperTimer(setInterval(() => this.refreshCookies(), config.cookieKeeper.refreshInterval));
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") this.restoreCookies();
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

  // src/pixel-router.ts
  var PixelRouter = {
    resolve(hostname) {
      hostname = hostname ?? window.location.hostname;
      if (!config.pixels?.length) return config.pixelId ? [config.pixelId] : [];
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
      if (!matched.length && catchAll) matched.push(catchAll);
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
      if (!config.pixels?.length) return config.pixelId ? [config.pixelId] : [];
      return [...new Set(config.pixels.map((p) => p.pixelId).filter(Boolean))];
    }
  };

  // src/advanced-matching.ts
  var capturedData = {};
  var normalizers = {
    em(v) {
      if (!v) return null;
      v = v.trim().toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
    },
    ph(v) {
      if (!v) return null;
      let d = v.replace(/\D/g, "");
      if (d.length < 7) return null;
      if (d.startsWith("00")) d = d.substring(2);
      return d || null;
    },
    fn(v) {
      if (!v) return null;
      v = v.trim().toLowerCase().replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s*/i, "");
      v = v.replace(/[^a-z\s\u00C0-\u024F]/g, "");
      try {
        v = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      } catch {
      }
      return v.trim() || null;
    },
    ln(v) {
      return normalizers.fn(v);
    },
    ge(v) {
      if (!v) return null;
      v = v.trim().toLowerCase();
      if (v.startsWith("m") || v === "male") return "m";
      if (v.startsWith("f") || v === "female") return "f";
      return null;
    },
    db(v) {
      if (!v) return null;
      v = v.trim();
      if (/^\d{8}$/.test(v)) return v;
      const fmts = [/^(\d{4})-(\d{2})-(\d{2})$/, /^(\d{2})\/(\d{2})\/(\d{4})$/, /^(\d{2})-(\d{2})-(\d{4})$/];
      for (const rx of fmts) {
        const m = v.match(rx);
        if (m) return m[1].length === 4 ? m[1] + m[2] + m[3] : m[3] + m[1] + m[2];
      }
      return null;
    },
    ct(v) {
      if (!v) return null;
      v = v.trim().toLowerCase().replace(/[^a-z\s\u00C0-\u024F]/g, "");
      try {
        v = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      } catch {
      }
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
      v = v.trim().toLowerCase().replace(/\s+/g, "");
      if (/^\d{5}(-\d{4})?$/.test(v)) return v.substring(0, 5);
      return v || null;
    },
    country(v) {
      if (!v) return null;
      v = v.trim().toLowerCase();
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
      return map[v] ?? (v.length === 2 ? v : null);
    },
    external_id(v) {
      return v?.trim() || null;
    }
  };
  var fieldPatterns = {
    em: {
      types: ["email"],
      names: ["email", "e-mail", "user_email", "userEmail", "customer_email", "login", "username", "emailAddress", "email_address"],
      ids: ["email", "user-email", "customer-email", "signup-email", "login-email"],
      autocomplete: ["email"],
      placeholders: ["email", "e-mail", "your email", "email address"]
    },
    ph: {
      types: ["tel"],
      names: ["phone", "telephone", "tel", "mobile", "phone_number", "phoneNumber", "cell", "cellphone", "mobile_number", "contact_number", "whatsapp"],
      ids: ["phone", "telephone", "mobile", "phone-number"],
      autocomplete: ["tel", "tel-national", "tel-local"],
      placeholders: ["phone", "telephone", "mobile", "whatsapp", "nomor telepon", "hp"]
    },
    fn: {
      names: ["first_name", "firstName", "fname", "given-name", "givenName", "first", "name_first", "billing_first_name"],
      ids: ["first-name", "firstname", "fname", "given-name"],
      autocomplete: ["given-name"],
      placeholders: ["first name", "given name", "nama depan"]
    },
    ln: {
      names: ["last_name", "lastName", "lname", "family-name", "familyName", "surname", "last", "name_last", "billing_last_name"],
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
      names: ["zip", "zipcode", "zip_code", "postal", "postal_code", "postcode", "billing_zip", "billing_postcode", "shipping_zip"],
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
    ge: { names: ["gender", "sex"], ids: ["gender", "sex"], autocomplete: ["sex"], placeholders: ["gender", "jenis kelamin"] },
    db: {
      names: ["birthday", "birthdate", "date_of_birth", "dob", "dateOfBirth", "birth_date", "bday"],
      ids: ["birthday", "birthdate", "dob", "date-of-birth"],
      autocomplete: ["bday"],
      placeholders: ["birthday", "date of birth", "tanggal lahir"]
    }
  };
  var sourcePriority = {
    explicit: 100,
    identify: 90,
    form: 80,
    form_prefill: 70,
    url: 60,
    dataLayer: 50,
    customDataLayer: 50,
    metatag: 30
  };
  var dataLayerFieldMap = {
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
  var aliasMap = {
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
  var storageMap = {
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
  var PII_FIELDS = ["em", "ph", "fn", "ln", "ge", "db", "ct", "st", "zp", "country", "external_id"];
  var NON_PII_FIELDS = ["client_ip_address", "client_user_agent", "fbc", "fbp", "subscription_id", "fb_login_id", "lead_id"];
  var AdvancedMatching = {
    // ── Lifecycle ──────────────────────────────────────────────
    init() {
      if (!config.advancedMatching.enabled) return;
      log("AdvancedMatching: initializing");
      if (config.advancedMatching.captureUrlParams) this.captureFromUrl();
      if (config.advancedMatching.captureMetaTags) this.captureFromMetaTags();
      if (config.advancedMatching.captureDataLayer) this.captureFromDataLayer();
      if (config.advancedMatching.autoCaptureForms) this.watchForms();
      log("AdvancedMatching: ready, captured:", Object.keys(capturedData));
    },
    // ── Normalize + Hash ───────────────────────────────────────
    normalize(field, value) {
      if (isHashed(value)) return value;
      const fn = normalizers[field];
      return fn ? fn(value) : value ? String(value).trim().toLowerCase() : null;
    },
    async normalizeAndHash(userData) {
      if (!userData) return {};
      const result = {};
      for (const field of PII_FIELDS) {
        const value = userData[field];
        if (!value) continue;
        if (isHashed(value)) {
          result[field] = value;
          continue;
        }
        const normalized = this.normalize(field, value);
        if (!normalized) continue;
        result[field] = config.hashPii ? await sha256(normalized) ?? void 0 : normalized;
      }
      for (const field of NON_PII_FIELDS) {
        if (userData[field]) {
          result[field] = userData[field];
        }
      }
      return result;
    },
    // ── Form Auto-Capture ──────────────────────────────────────
    detectFieldParam(input) {
      const type = (input.type || "").toLowerCase();
      const name = (input.name || "").toLowerCase();
      const id = (input.id || "").toLowerCase();
      const ac = (input.autocomplete || "").toLowerCase();
      const ph = ("placeholder" in input ? input.placeholder || "" : "").toLowerCase();
      for (const [sel, param] of Object.entries(config.advancedMatching.formFieldMap ?? {})) {
        try {
          if (input.matches(sel)) return param;
        } catch {
        }
      }
      for (const [param, p] of Object.entries(fieldPatterns)) {
        if (p.types?.includes(type)) return param;
        if (p.names?.some((n) => name.includes(n))) return param;
        if (p.ids?.some((i) => id.includes(i))) return param;
        if (p.autocomplete?.includes(ac)) return param;
        if (p.placeholders?.some((x) => ph.includes(x))) return param;
      }
      if (["name", "full_name", "fullname", "customer_name"].includes(name) || ["name", "full-name", "fullname"].includes(id)) return "_fullname";
      return null;
    },
    scanForm(form) {
      const data = {};
      const inputs = form.querySelectorAll("input, select, textarea");
      for (const input of inputs) {
        if (["hidden", "password", "submit"].includes(input.type)) continue;
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
      document.addEventListener("submit", (e) => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement)) return;
        const data = this.scanForm(form);
        if (Object.keys(data).length) {
          this._mergeCapture("form", data);
          log("AdvancedMatching: form submit captured", Object.keys(data));
          if (config.advancedMatching.autoIdentifyOnSubmit && (data.em || data.ph)) {
            window.MetaTracker?.identify(data);
          }
        }
      }, true);
      document.addEventListener("change", (e) => {
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
        document.querySelectorAll("form").forEach((f) => {
          const d = this.scanForm(f);
          if (Object.keys(d).length) {
            this._mergeCapture("form_prefill", d);
            log("AdvancedMatching: pre-filled form scanned", Object.keys(d));
          }
        });
        if (typeof MutationObserver !== "undefined" && document.body) {
          const obs = new MutationObserver((muts) => {
            for (const mut of muts) for (const node of mut.addedNodes) {
              if (!(node instanceof HTMLElement)) continue;
              const forms = node.tagName === "FORM" ? [node] : [...node.querySelectorAll("form")];
              for (const f of forms) {
                const d = this.scanForm(f);
                if (Object.keys(d).length) this._mergeCapture("form_prefill", d);
              }
            }
          });
          obs.observe(document.body, { childList: true, subtree: true });
        }
      };
      if (document.body) {
        startObserving();
      } else {
        document.addEventListener("DOMContentLoaded", startObserving);
      }
    },
    // ── URL Parameter Capture ──────────────────────────────────
    captureFromUrl() {
      try {
        const params = new URL(window.location.href).searchParams;
        const data = {};
        for (const p of ["email", "em", "e", "user_email", "customer_email"]) {
          const v = params.get(p);
          if (v?.includes("@")) {
            data.em = v;
            break;
          }
        }
        for (const p of ["phone", "ph", "tel", "mobile", "whatsapp"]) {
          const v = params.get(p);
          if (v && v.replace(/\D/g, "").length >= 7) {
            data.ph = v;
            break;
          }
        }
        const fn = params.get("first_name") ?? params.get("fn");
        if (fn) data.fn = fn;
        const ln = params.get("last_name") ?? params.get("ln");
        if (ln) data.ln = ln;
        for (const p of ["external_id", "eid", "user_id", "uid", "customer_id", "player_id"]) {
          const v = params.get(p);
          if (v) {
            data.external_id = v;
            break;
          }
        }
        const cc = params.get("country") ?? params.get("cc");
        if (cc) data.country = cc;
        if (Object.keys(data).length) {
          this._mergeCapture("url", data);
          log("AdvancedMatching: URL params captured", Object.keys(data));
        }
      } catch {
      }
    },
    // ── DataLayer Capture ──────────────────────────────────────
    captureFromDataLayer() {
      const dlKey = config.advancedMatching.dataLayerKey || "dataLayer";
      const dl = window[dlKey];
      if (Array.isArray(dl)) {
        for (const entry of dl) this._extractFromDataLayerEntry(entry);
        const origPush = dl.push.bind(dl);
        dl.push = (...args) => {
          const r = origPush(...args);
          for (const entry of args) this._extractFromDataLayerEntry(entry);
          return r;
        };
      }
      const udk = config.advancedMatching.userDataKey;
      if (udk && window[udk]) this._extractUserObject(window[udk], "customDataLayer");
    },
    _extractFromDataLayerEntry(entry) {
      if (!entry || typeof entry !== "object") return;
      const obj = entry;
      for (const key of ["user", "userData", "user_data", "customer", "visitor", "contact"]) {
        if (obj[key] && typeof obj[key] === "object") this._extractUserObject(obj[key], "dataLayer");
      }
      const ecom = obj.ecommerce;
      const af = ecom?.purchase?.actionField;
      if (af?.email) this._mergeCapture("dataLayer", { em: af.email });
      this._extractUserObject(obj, "dataLayer");
    },
    _extractUserObject(obj, source) {
      if (!obj) return;
      const data = {};
      for (const [key, param] of Object.entries(dataLayerFieldMap)) {
        const val = obj[key];
        if (val && typeof val === "string" && val.trim()) data[param] = val.trim();
      }
      if (Object.keys(data).length) {
        this._mergeCapture(source, data);
        log("AdvancedMatching: data layer captured", Object.keys(data));
      }
    },
    // ── Meta Tag Capture ───────────────────────────────────────
    captureFromMetaTags() {
      const data = {};
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const j = JSON.parse(script.textContent || "");
          if (j.email) data.em = j.email;
          if (j.telephone) data.ph = j.telephone;
          if (j.givenName) data.fn = j.givenName;
          if (j.familyName) data.ln = j.familyName;
          if (j.address && typeof j.address === "object") {
            const a = j.address;
            if (a.addressLocality) data.ct = a.addressLocality;
            if (a.addressRegion) data.st = a.addressRegion;
            if (a.postalCode) data.zp = a.postalCode;
            if (a.addressCountry) data.country = a.addressCountry;
          }
        } catch {
        }
      }
      const meta = (prop) => document.querySelector(`meta[property="${prop}"]`)?.content;
      if (meta("profile:email")) data.em = meta("profile:email");
      if (meta("profile:first_name")) data.fn = meta("profile:first_name");
      if (meta("profile:last_name")) data.ln = meta("profile:last_name");
      if (meta("profile:gender")) data.ge = meta("profile:gender");
      if (Object.keys(data).length) {
        this._mergeCapture("metatag", data);
        log("AdvancedMatching: meta tags captured", Object.keys(data));
      }
    },
    // ── Identity Graph ─────────────────────────────────────────
    _mergeCapture(source, data) {
      for (const [param, value] of Object.entries(data)) {
        if (!value) continue;
        const existing = capturedData[param];
        const existingP = existing ? sourcePriority[existing.source] ?? 0 : -1;
        if (!existing || (sourcePriority[source] ?? 0) >= existingP) {
          capturedData[param] = { value, source };
        }
      }
    },
    getCapturedData() {
      const r = {};
      for (const [p, e] of Object.entries(capturedData)) r[p] = e.value;
      return r;
    },
    async buildUserData(explicitUserData = {}) {
      const merged = { ...this.getCapturedData() };
      for (const [field, key] of Object.entries(storageMap)) {
        if (!merged[field] && key) {
          const v = getFromStorage(key);
          if (v) merged[field] = v;
        }
      }
      for (const [key, value] of Object.entries(explicitUserData)) {
        if (!value) continue;
        merged[aliasMap[key] ?? key] = value;
      }
      const result = await this.normalizeAndHash(merged);
      result.fbp = result.fbp || CookieKeeper.getFbp() || void 0;
      result.fbc = result.fbc || CookieKeeper.getFbc() || void 0;
      result.client_user_agent = result.client_user_agent || navigator.userAgent;
      if (!result.external_id) {
        const vid = CookieKeeper.getVisitorId();
        if (vid) result.external_id = await sha256(vid) ?? void 0;
      }
      return result;
    },
    // ── Match Quality Scoring ──────────────────────────────────
    scoreMatchQuality(userData) {
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
      let score = 0;
      for (const [f, w] of Object.entries(weights)) {
        if (userData[f]) score += w;
      }
      return Math.min(score, 100);
    },
    // ── Diagnostics ────────────────────────────────────────────
    getDiagnostics() {
      const fields = {};
      for (const [p, e] of Object.entries(capturedData)) {
        fields[p] = { source: e.source, hasValue: true, isHashed: isHashed(e.value) };
      }
      return {
        capturedFields: Object.keys(capturedData).length,
        fields,
        storedIdentity: {
          em: !!getFromStorage("_mt_em"),
          ph: !!getFromStorage("_mt_ph"),
          fn: !!getFromStorage("_mt_fn"),
          ln: !!getFromStorage("_mt_ln"),
          external_id: !!getFromStorage("_mt_eid")
        }
      };
    },
    resetCapturedData() {
      capturedData = {};
    },
    // Re-export for external use
    aliasMap,
    storageMap
  };

  // src/browser-pixel.ts
  var STANDARD_EVENTS = [
    "PageView", "ViewContent", "AddToCart", "AddPaymentInfo",
    "AddToWishlist", "CompleteRegistration", "Contact", "CustomizeProduct",
    "Donate", "FindLocation", "InitiateCheckout", "Lead", "Purchase",
    "Schedule", "Search", "StartTrial", "SubmitApplication", "Subscribe"
  ];
  var BrowserPixel = {
    _loaded: false,
    init() {
      if (!config.browserPixel || !config.browserPixel.enabled) return;
      if (this._loaded) return;
      if (typeof window.fbq === "function") {
        log("BrowserPixel: fbq already present, initializing pixels");
        this._initPixels();
        this._loaded = true;
        return;
      }
      log("BrowserPixel: loading fbevents.js");
      var n = window.fbq = function() {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!window._fbq) window._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      var script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      var firstScript = document.getElementsByTagName("script")[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else {
        var insert = function() {
          var s = document.getElementsByTagName("script")[0];
          if (s && s.parentNode) s.parentNode.insertBefore(script, s);
          else document.head.appendChild(script);
        };
        if (document.body) insert();
        else document.addEventListener("DOMContentLoaded", insert);
      }
      this._initPixels();
      this._loaded = true;
    },
    _initPixels() {
      var pixelIds = PixelRouter.getAllPixelIds();
      if (!pixelIds.length) { warn("BrowserPixel: no pixel IDs configured"); return; }
      for (var pid of pixelIds) {
        window.fbq("init", pid);
        log("BrowserPixel: init pixel", pid);
      }
      if (config.browserPixel.autoPageView) {
        window.fbq("track", "PageView");
        log("BrowserPixel: PageView fired");
      }
    },
    trackEvent(eventName, eventId, customData) {
      if (!config.browserPixel || !config.browserPixel.enabled || !config.browserPixel.syncEvents) return;
      if (typeof window.fbq !== "function") return;
      var isStandard = STANDARD_EVENTS.includes(eventName);
      var fbqParams = { ...customData || {} };
      var fbqOptions = { eventID: eventId };
      if (isStandard) {
        window.fbq("track", eventName, fbqParams, fbqOptions);
      } else {
        window.fbq("trackCustom", eventName, fbqParams, fbqOptions);
      }
      log("BrowserPixel: synced", eventName, "eventID:", eventId);
    }
  };

  // src/index.ts
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
      setBatchTimer(setTimeout(flushQueue, BATCH_INTERVAL));
    } else {
      flushQueue();
    }
  }
  var MetaTracker = {
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
      if (options.respectDnt && (navigator.doNotTrack === "1" || window.doNotTrack === "1")) return this;
      mergeConfig(options);
      setInitialized(true);
      log("Initialized v" + VERSION);
      CookieKeeper.init();
      AdvancedMatching.init();
      BrowserPixel.init();
      if (config.adBlockRecovery.enabled) {
        AdBlockRecovery.detect().then((blocked) => {
          if (blocked) log("Ad blocker recovery: ACTIVE");
        });
      }
      if (config.autoPageView) this.trackPageView();
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushQueue();
      });
      window.addEventListener("beforeunload", flushQueue);
      return this;
    },
    async track(eventName, customData = {}, userData = {}, options = {}) {
      if (!initialized) {
        warn("Not initialized");
        return void 0;
      }
      const eventId = options.event_id ?? generateEventId();
      const enrichedUserData = config.advancedMatching.enabled ? await AdvancedMatching.buildUserData(userData) : await AdvancedMatching.normalizeAndHash(userData);
      const matchScore = AdvancedMatching.scoreMatchQuality(enrichedUserData);
      log(`Match quality: ${matchScore}/100`);
      const pixelIds = options.pixel_id ? [options.pixel_id] : PixelRouter.resolve();
      if (!pixelIds.length) {
        warn("No pixel for:", window.location.hostname);
        return void 0;
      }
      for (const pixelId of pixelIds) {
        const event = {
          pixel_id: pixelId,
          event_name: eventName,
          event_id: pixelIds.length > 1 ? `${eventId}_${pixelId.slice(-4)}` : eventId,
          event_time: Math.floor(Date.now() / 1e3),
          event_source_url: window.location.href,
          action_source: options.action_source ?? "website",
          user_data: { ...enrichedUserData },
          match_quality: matchScore,
          visitor_id: CookieKeeper.getVisitorId() ?? null
        };
        if (Object.keys(customData).length) event.custom_data = customData;
        log("Track:", eventName, "\u2192", pixelId, `(match: ${matchScore})`);
        enqueueEvent(event);
        BrowserPixel.trackEvent(eventName, event.event_id, customData);
      }
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
    trackToPixel(pixelId, name, cd = {}, ud = {}) {
      return this.track(name, cd, ud, { pixel_id: pixelId });
    },
    // ── Identity ───────────────────────────────────────────────
    async identify(userData = {}) {
      if (!initialized) {
        warn("Not initialized");
        return;
      }
      const normalized = {};
      for (const [key, value] of Object.entries(userData)) {
        if (!value) continue;
        normalized[AdvancedMatching.aliasMap[key] ?? key] = value;
      }
      const hashed = await AdvancedMatching.normalizeAndHash(normalized);
      for (const [field, storageKey] of Object.entries(AdvancedMatching.storageMap)) {
        const val = hashed[field];
        if (val && storageKey) saveToStorage(storageKey, val, config.cookieKeeper.maxAge);
      }
      AdvancedMatching._mergeCapture("identify", normalized);
      log("Identify:", Object.keys(hashed).filter(
        (k) => hashed[k] && !["client_user_agent", "fbp", "fbc"].includes(k)
      ));
      CookieKeeper.syncToServer();
    },
    clearIdentity() {
      ["_mt_em", "_mt_ph", "_mt_fn", "_mt_ln", "_mt_eid", "_mt_ct", "_mt_st", "_mt_zp", "_mt_country"].forEach(removeFromStorage);
      AdvancedMatching.resetCapturedData();
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
        routing: { domain: window.location.hostname, active: PixelRouter.resolve(), all: PixelRouter.getAllPixelIds() },
        advancedMatching: AdvancedMatching.getDiagnostics(),
        queueSize: queue.length
      };
    },
    async getMatchQuality(extraUserData = {}) {
      const ud = config.advancedMatching.enabled ? await AdvancedMatching.buildUserData(extraUserData) : await AdvancedMatching.normalizeAndHash(extraUserData);
      return {
        score: AdvancedMatching.scoreMatchQuality(ud),
        fields: Object.keys(ud).filter((k) => ud[k])
      };
    },
    addUserData(data, source = "explicit") {
      AdvancedMatching._mergeCapture(source, data);
    }
  };
  window.MetaTracker = MetaTracker;
  if (window.MetaTrackerQueue && Array.isArray(window.MetaTrackerQueue)) {
    for (const [method, ...args] of window.MetaTrackerQueue) {
      const fn = MetaTracker[method];
      if (typeof fn === "function") fn.apply(MetaTracker, args);
    }
  }
  var index_default = MetaTracker;
  return __toCommonJS(index_exports);
})();
//# sourceMappingURL=meta-tracker.js.map
