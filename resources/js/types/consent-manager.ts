/**
 * ConsentManager — Consent Management Platform (CMP) integration.
 *
 * Supports:
 *  - Auto-detection of OneTrust, Cookiebot, TrustArc, Osano, Google Consent Mode
 *  - opt-in (block until consent) and opt-out (allow until revoked) modes
 *  - Queues events while waiting for consent, flushes on grant
 *  - Manual grantConsent() / revokeConsent() / hasConsent() API
 */
import { config, log, warn } from './state';

interface PendingCall {
  method: string;
  args: unknown[];
}

const pendingQueue: PendingCall[] = [];
let consentGranted: boolean | null = null; // null = not yet determined

export const ConsentManager = {

  init(): void {
    if (!config.consent.enabled) {
      consentGranted = true; // consent not required — allow everything
      return;
    }

    // Set default based on mode
    if (config.consent.mode === 'opt-out') {
      consentGranted = config.consent.defaultConsent ?? true;
    } else {
      consentGranted = config.consent.defaultConsent ?? false;
    }

    log('ConsentManager: mode=' + config.consent.mode, 'default=' + consentGranted);

    this._detectCMP();
  },

  // ── CMP Auto-Detection ──────────────────────────────────────

  _detectCMP(): void {
    // OneTrust
    if (typeof (window as any).OneTrust !== 'undefined' || typeof (window as any).OptanonWrapper !== 'undefined') {
      this._initOneTrust();
      return;
    }

    // Cookiebot
    if (typeof (window as any).Cookiebot !== 'undefined') {
      this._initCookiebot();
      return;
    }

    // TrustArc / TrustE
    if (typeof (window as any).truste !== 'undefined') {
      this._initTrustArc();
      return;
    }

    // Osano
    if (typeof (window as any).Osano !== 'undefined') {
      this._initOsano();
      return;
    }

    // Google Consent Mode v2
    if (typeof (window as any).gtag === 'function') {
      this._initGoogleConsentMode();
      return;
    }

    // No CMP detected — check for __tcfapi (IAB TCF v2)
    if (typeof (window as any).__tcfapi === 'function') {
      this._initTCF();
      return;
    }

    log('ConsentManager: no CMP detected, using default consent=' + consentGranted);

    // If waitForConsent and no CMP, re-check after DOM is ready
    if (config.consent.waitForConsent) {
      const recheck = () => {
        if (typeof (window as any).OneTrust !== 'undefined') { this._initOneTrust(); return; }
        if (typeof (window as any).Cookiebot !== 'undefined') { this._initCookiebot(); return; }
        if (typeof (window as any).truste !== 'undefined') { this._initTrustArc(); return; }
        if (typeof (window as any).Osano !== 'undefined') { this._initOsano(); return; }
        if (typeof (window as any).__tcfapi === 'function') { this._initTCF(); return; }
        log('ConsentManager: no CMP after DOM ready');
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', recheck);
      } else {
        setTimeout(recheck, 1000);
      }
    }
  },

  // ── OneTrust ────────────────────────────────────────────────

  _initOneTrust(): void {
    log('ConsentManager: OneTrust detected');
    const category = config.consent.consentCategory;

    const checkConsent = () => {
      const groups: string = (window as any).OnetrustActiveGroups || '';
      const granted = groups.includes(category);
      this._updateConsent(granted, 'OneTrust');
    };

    // OptanonWrapper is called when OneTrust consent changes
    const origWrapper = (window as any).OptanonWrapper;
    (window as any).OptanonWrapper = function () {
      if (typeof origWrapper === 'function') origWrapper();
      checkConsent();
    };

    // Check current state
    if ((window as any).OnetrustActiveGroups) {
      checkConsent();
    }
  },

  // ── Cookiebot ───────────────────────────────────────────────

  _initCookiebot(): void {
    log('ConsentManager: Cookiebot detected');

    const checkConsent = () => {
      const cb = (window as any).Cookiebot;
      if (!cb) return;
      const granted = cb.consent?.marketing === true;
      this._updateConsent(granted, 'Cookiebot');
    };

    window.addEventListener('CookiebotOnAccept', checkConsent);
    window.addEventListener('CookiebotOnDecline', checkConsent);

    // Check current state
    const cb = (window as any).Cookiebot;
    if (cb?.consented) {
      checkConsent();
    }
  },

  // ── TrustArc ────────────────────────────────────────────────

  _initTrustArc(): void {
    log('ConsentManager: TrustArc detected');

    const checkConsent = () => {
      try {
        const behavior = (window as any).truste?.eu?.bindMap?.prefCookie;
        // TrustArc: 0 = no consent, 1 = required only, 2 = functional, 3 = advertising
        const granted = behavior !== undefined ? parseInt(behavior, 10) >= 3 : false;
        this._updateConsent(granted, 'TrustArc');
      } catch { /* ignore */ }
    };

    // TrustArc fires 'message' events
    window.addEventListener('message', (e) => {
      if (typeof e.data === 'string' && e.data.includes('truste.eu.cookie')) {
        setTimeout(checkConsent, 100);
      }
    });

    checkConsent();
  },

  // ── Osano ───────────────────────────────────────────────────

  _initOsano(): void {
    log('ConsentManager: Osano detected');

    const osano = (window as any).Osano;
    if (typeof osano?.cm?.addEventListener === 'function') {
      osano.cm.addEventListener('osano-cm-consent-saved', (change: { MARKETING?: string }) => {
        const granted = change.MARKETING === 'ACCEPT';
        this._updateConsent(granted, 'Osano');
      });
    }

    // Check current
    if (typeof osano?.cm?.getConsent === 'function') {
      const consent = osano.cm.getConsent();
      if (consent.MARKETING) {
        this._updateConsent(consent.MARKETING === 'ACCEPT', 'Osano');
      }
    }
  },

  // ── Google Consent Mode v2 ──────────────────────────────────

  _initGoogleConsentMode(): void {
    log('ConsentManager: Google Consent Mode detected');

    // Listen for consent updates via dataLayer
    const dl: unknown[] = (window as any).dataLayer || [];
    const origPush = dl.push.bind(dl);
    dl.push = (...args: unknown[]) => {
      const r = origPush(...args);
      for (const entry of args) {
        if (entry && typeof entry === 'object' && (entry as Record<string, unknown>)[0] === 'consent' && (entry as Record<string, unknown>)[1] === 'update') {
          const params = (entry as Record<string, unknown>)[2] as Record<string, string> | undefined;
          if (params?.ad_storage) {
            this._updateConsent(params.ad_storage === 'granted', 'GoogleConsentMode');
          }
        }
      }
      return r;
    };

    // Check current consent state via gtag
    try {
      const consentState = (window as any).google_tag_data?.ics?.entries;
      if (consentState?.ad_storage) {
        this._updateConsent(consentState.ad_storage.value === 'granted', 'GoogleConsentMode');
      }
    } catch { /* ignore */ }
  },

  // ── IAB TCF v2 ──────────────────────────────────────────────

  _initTCF(): void {
    log('ConsentManager: IAB TCF v2 detected');

    const checkTCF = () => {
      (window as any).__tcfapi('getTCData', 2, (data: { gdprApplies?: boolean; purpose?: { consents?: Record<number, boolean> } } | null, success: boolean) => {
        if (!success || !data) return;
        if (!data.gdprApplies) {
          this._updateConsent(true, 'TCF');
          return;
        }
        // Purpose 1 (store/access info) + Purpose 4 (targeted ads) required for Meta pixel
        const consents = data.purpose?.consents ?? {};
        const granted = consents[1] === true && consents[4] === true;
        this._updateConsent(granted, 'TCF');
      });
    };

    // Listen for changes
    (window as any).__tcfapi('addEventListener', 2, (_: unknown, success: boolean) => {
      if (success) checkTCF();
    });

    checkTCF();
  },

  // ── Consent State Management ────────────────────────────────

  _updateConsent(granted: boolean, source: string): void {
    const prev = consentGranted;
    consentGranted = granted;

    if (prev !== granted) {
      log('ConsentManager: consent ' + (granted ? 'GRANTED' : 'REVOKED') + ' via ' + source);
    }

    if (granted && pendingQueue.length) {
      this._flushPending();
    }
  },

  _flushPending(): void {
    log('ConsentManager: flushing', pendingQueue.length, 'queued calls');
    const tracker = (window as any).MetaTracker;
    if (!tracker) return;

    while (pendingQueue.length) {
      const call = pendingQueue.shift()!;
      const fn = tracker[call.method];
      if (typeof fn === 'function') {
        fn.apply(tracker, call.args);
      }
    }
  },

  // ── Public API ──────────────────────────────────────────────

  hasConsent(): boolean {
    if (!config.consent.enabled) return true;
    return consentGranted === true;
  },

  grantConsent(): void {
    this._updateConsent(true, 'manual');
  },

  revokeConsent(): void {
    this._updateConsent(false, 'manual');
  },

  /** Queue a call to replay once consent is granted. Returns true if queued, false if consent is already granted. */
  queueIfNeeded(method: string, args: unknown[]): boolean {
    if (!config.consent.enabled) return false;
    if (consentGranted === true) return false;

    if (config.consent.waitForConsent) {
      pendingQueue.push({ method, args });
      log('ConsentManager: queued', method, '(' + pendingQueue.length + ' pending)');
      return true;
    }

    // Not waiting — just block
    warn('ConsentManager: blocked', method, '(no consent)');
    return true;
  },

  getPendingCount(): number {
    return pendingQueue.length;
  },
};
