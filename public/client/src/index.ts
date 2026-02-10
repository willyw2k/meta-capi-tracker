/**
 * Meta CAPI Tracker — Client-Side Library v3.0 (TypeScript)
 * ==========================================================
 *
 * Usage:
 *   MetaTracker.init({
 *     endpoint: 'https://your-server.com/api/v1/track',
 *     apiKey: 'your-api-key',
 *     pixelId: '123456789',
 *   });
 */

import {
  VERSION, MAX_QUEUE_SIZE, BATCH_INTERVAL,
  config, queue, batchTimer, initialized,
  transportMethod, adBlockDetected,
  mergeConfig, setInitialized, setBatchTimer,
  log, warn,
} from './state';
import { generateEventId, saveToStorage, removeFromStorage } from './utils';
import { transportSend, resolveEndpoint } from './transport';
import { CookieKeeper } from './cookie-keeper';
import { AdBlockRecovery } from './ad-block-recovery';
import { PixelRouter } from './pixel-router';
import { AdvancedMatching } from './advanced-matching';
import { BrowserPixel } from './browser-pixel';
import { ConsentManager } from './consent-manager';
import type {
  TrackerInitOptions, MetaEventName, CustomData, RawUserData,
  TrackOptions, TrackingEvent, MetaTrackerAPI, CaptureSource,
  MatchQualityResult, DebugInfo, HashedUserData,
} from './types';

// ── Core Queue ───────────────────────────────────────────────

async function sendEvents(events: TrackingEvent[]): Promise<void> {
  if (!events.length) return;
  const url = events.length === 1 ? resolveEndpoint('/event') : resolveEndpoint('/batch');
  const body = events.length === 1 ? events[0] : { events };
  try { await transportSend(url, body); } catch (e) { warn('Send failed:', e); }
}

function flushQueue(): void {
  if (!queue.length) return;
  sendEvents(queue.splice(0, MAX_QUEUE_SIZE));
}

function enqueueEvent(event: TrackingEvent): void {
  queue.push(event);
  if (config.batchEvents) {
    if (batchTimer) clearTimeout(batchTimer);
    setBatchTimer(setTimeout(flushQueue, BATCH_INTERVAL));
  } else { flushQueue(); }
}

// ══════════════════════════════════════════════════════════════
// ── PUBLIC API
// ══════════════════════════════════════════════════════════════

const MetaTracker: MetaTrackerAPI = {
  VERSION,

  async init(options: TrackerInitOptions): Promise<MetaTrackerAPI> {
    if (initialized) { warn('Already initialized'); return this; }
    if (!options.endpoint || !options.apiKey) { warn('Missing: endpoint, apiKey'); return this; }
    if (!('pixelId' in options && options.pixelId) && !('pixels' in options && options.pixels?.length)) {
      warn('Missing: pixelId or pixels[]'); return this;
    }
    if (options.respectDnt && (navigator.doNotTrack === '1' || window.doNotTrack === '1')) return this;

    mergeConfig(options);
    setInitialized(true);
    log('Initialized v' + VERSION);

    ConsentManager.init();
    CookieKeeper.init();
    AdvancedMatching.init();
    BrowserPixel.init();

    if (config.adBlockRecovery.enabled) {
      AdBlockRecovery.detect().then((blocked: boolean) => { if (blocked) log('Ad blocker recovery: ACTIVE'); });
    }

    if (config.autoPageView) this.trackPageView();

    window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushQueue(); });
    window.addEventListener('beforeunload', flushQueue);
    return this;
  },

  async track(
    eventName: MetaEventName, customData: CustomData = {},
    userData: RawUserData = {}, options: TrackOptions = {},
  ): Promise<string | undefined> {
    if (!initialized) { warn('Not initialized'); return undefined; }
    if (ConsentManager.queueIfNeeded('track', [eventName, customData, userData, options])) return undefined;

    const eventId = options.event_id ?? generateEventId();

    const enrichedUserData: HashedUserData = config.advancedMatching.enabled
      ? await AdvancedMatching.buildUserData(userData)
      : await AdvancedMatching.normalizeAndHash(userData);

    const matchScore = AdvancedMatching.scoreMatchQuality(enrichedUserData);
    log(`Match quality: ${matchScore}/100`);

    if (matchScore < config.minMatchQuality) {
      warn(`Match quality ${matchScore} below threshold ${config.minMatchQuality}, skipping event`);
      return undefined;
    }

    const pixelIds = options.pixel_id ? [options.pixel_id] : PixelRouter.resolve();
    if (!pixelIds.length) { warn('No pixel for:', window.location.hostname); return undefined; }

    for (const pixelId of pixelIds) {
      const event: TrackingEvent = {
        pixel_id: pixelId,
        event_name: eventName,
        event_id: pixelIds.length > 1 ? `${eventId}_${pixelId.slice(-4)}` : eventId,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: window.location.href,
        action_source: options.action_source ?? 'website',
        user_data: { ...enrichedUserData },
        match_quality: matchScore,
        visitor_id: CookieKeeper.getVisitorId() ?? null,
      };
      if (Object.keys(customData).length) event.custom_data = customData;
      log('Track:', eventName, '→', pixelId, `(match: ${matchScore})`);
      enqueueEvent(event);
      BrowserPixel.trackEvent(eventName, event.event_id, customData);
    }

    return eventId;
  },

  // ── Convenience methods ────────────────────────────────────

  trackPageView(ud: RawUserData = {}) { return this.track('PageView', {}, ud); },
  trackViewContent(cd: CustomData = {}, ud: RawUserData = {}) { return this.track('ViewContent', cd, ud); },
  trackAddToCart(cd: CustomData = {}, ud: RawUserData = {}) { return this.track('AddToCart', cd, ud); },
  trackPurchase(cd: CustomData = {}, ud: RawUserData = {}) { return this.track('Purchase', cd, ud); },
  trackLead(cd: CustomData = {}, ud: RawUserData = {}) { return this.track('Lead', cd, ud); },
  trackCompleteRegistration(cd: CustomData = {}, ud: RawUserData = {}) { return this.track('CompleteRegistration', cd, ud); },
  trackInitiateCheckout(cd: CustomData = {}, ud: RawUserData = {}) { return this.track('InitiateCheckout', cd, ud); },
  trackSearch(cd: CustomData = {}, ud: RawUserData = {}) { return this.track('Search', cd, ud); },
  trackToPixel(pixelId: string, name: MetaEventName, cd: CustomData = {}, ud: RawUserData = {}) {
    return this.track(name, cd, ud, { pixel_id: pixelId });
  },

  // ── Identity ───────────────────────────────────────────────

  async identify(userData: RawUserData = {}): Promise<void> {
    if (!initialized) { warn('Not initialized'); return; }

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(userData)) {
      if (!value) continue;
      normalized[AdvancedMatching.aliasMap[key] ?? key] = value;
    }

    const hashed = await AdvancedMatching.normalizeAndHash(normalized as RawUserData);

    for (const [field, storageKey] of Object.entries(AdvancedMatching.storageMap)) {
      const val = (hashed as Record<string, string | undefined>)[field];
      if (val && storageKey) saveToStorage(storageKey, val, config.cookieKeeper.maxAge);
    }

    AdvancedMatching._mergeCapture('identify', normalized as RawUserData);
    log('Identify:', Object.keys(hashed).filter(
      (k) => (hashed as Record<string, unknown>)[k] && !['client_user_agent', 'fbp', 'fbc'].includes(k),
    ));
    CookieKeeper.syncToServer();
  },

  clearIdentity(): void {
    ['_mt_em', '_mt_ph', '_mt_fn', '_mt_ln', '_mt_eid', '_mt_ct', '_mt_st', '_mt_zp', '_mt_country']
      .forEach(removeFromStorage);
    AdvancedMatching.resetCapturedData();
    log('Identity cleared');
  },

  // ── Multi-domain ───────────────────────────────────────────

  addPixel(pixelId: string, domains: string | string[]): void {
    config.pixels.push({ pixelId, domains: Array.isArray(domains) ? domains : [domains] });
  },
  removePixel(pixelId: string): void {
    config.pixels = config.pixels.filter((p) => p.pixelId !== pixelId);
  },

  // ── Cookie Keeper ──────────────────────────────────────────

  refreshCookies(): void { CookieKeeper.refreshCookies(); },

  // ── Consent ────────────────────────────────────────────────

  hasConsent(): boolean { return ConsentManager.hasConsent(); },
  grantConsent(): void { ConsentManager.grantConsent(); },
  revokeConsent(): void { ConsentManager.revokeConsent(); },

  // ── Diagnostics ────────────────────────────────────────────

  flush(): void { flushQueue(); },
  isAdBlocked(): boolean { return adBlockDetected; },
  getTransport(): string { return transportMethod; },

  getDebugInfo(): DebugInfo {
    return {
      version: VERSION, initialized, transport: transportMethod, adBlockDetected,
      config: { endpoint: config.endpoint, pixelId: config.pixelId, pixelCount: config.pixels.length },
      cookies: { fbp: CookieKeeper.getFbp(), fbc: CookieKeeper.getFbc(), visitorId: CookieKeeper.getVisitorId() },
      routing: { domain: window.location.hostname, active: PixelRouter.resolve(), all: PixelRouter.getAllPixelIds() },
      advancedMatching: AdvancedMatching.getDiagnostics(),
      queueSize: queue.length,
    };
  },

  async getMatchQuality(extraUserData: RawUserData = {}): Promise<MatchQualityResult> {
    const ud = config.advancedMatching.enabled
      ? await AdvancedMatching.buildUserData(extraUserData)
      : await AdvancedMatching.normalizeAndHash(extraUserData);
    return {
      score: AdvancedMatching.scoreMatchQuality(ud),
      fields: Object.keys(ud).filter((k) => (ud as Record<string, unknown>)[k]),
    };
  },

  addUserData(data: RawUserData, source: CaptureSource = 'explicit'): void {
    AdvancedMatching._mergeCapture(source, data);
  },
};

// ── Expose globally ──────────────────────────────────────────

window.MetaTracker = MetaTracker;

if (window.MetaTrackerQueue && Array.isArray(window.MetaTrackerQueue)) {
  for (const [method, ...args] of window.MetaTrackerQueue) {
    const fn = (MetaTracker as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
    if (typeof fn === 'function') fn.apply(MetaTracker, args);
  }
}

export { MetaTracker };
export default MetaTracker;

// Re-export types for consumers
export type {
  TrackerConfig, TrackerInitOptions, MetaEventName, MetaStandardEvent,
  CustomData, RawUserData, HashedUserData, TrackOptions, TrackingEvent,
  MetaTrackerAPI, PixelConfig, CookieKeeperConfig, AdBlockRecoveryConfig,
  AdvancedMatchingConfig, BrowserPixelConfig, ConsentConfig, CaptureSource, MatchQualityResult, DebugInfo,
} from './types';
