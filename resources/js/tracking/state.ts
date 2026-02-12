/**
 * Shared mutable state — centralised to avoid circular imports.
 */
import type { TrackerConfig, TrackingEvent } from '@/types/types';

export const VERSION = '2.1.0';
export const MAX_QUEUE_SIZE = 50;
export const RETRY_DELAYS: readonly number[] = [1000, 5000, 15000];
export const BATCH_INTERVAL = 2000;

export let config: TrackerConfig = {
  endpoint: "https://meta.wakandaslots.com/api/v1/track",
  apiKey: "77KTyMIdlLOR7HGvyO3Jm02DfFntnka0nYSxWIoiP9YkhVoPLRgy9N6aWZovuyvbm6GdO59tKRHLWAVFq0cWTokaRrwGhnsIZ3le7WD9rIbU5WHbSkhCxjYKc6by23Tk",
  pixelId: "1515428220005755",
  pixels: [],
  autoPageView: true, debug: false, hashPii: true,
  respectDnt: false, batchEvents: true, minMatchQuality: 60,
  browserPixel: { enabled: true, autoPageView: true, syncEvents: true },
  consent: { enabled: false, mode: 'opt-in', consentCategory: 'C0004', waitForConsent: true, defaultConsent: false },
  cookieKeeper: { enabled: true, refreshInterval: 86_400_000, maxAge: 180, cookieNames: ['_fbp', '_fbc', '_mt_id'] },
  adBlockRecovery: { enabled: true, proxyPath: '/collect', useBeacon: true, useImage: true, customEndpoints: [] },
  advancedMatching: {
    enabled: true, autoCaptureForms: true, captureUrlParams: true,
    captureDataLayer: true, captureMetaTags: true, autoIdentifyOnSubmit: true,
    formFieldMap: {}, dataLayerKey: 'dataLayer', userDataKey: null,
  }
};

export const queue: TrackingEvent[] = [];
export let batchTimer: ReturnType<typeof setTimeout> | null = null;
export let initialized = false;
export let transportMethod = 'fetch';
export let adBlockDetected = false;
export let cookieKeeperTimer: ReturnType<typeof setInterval> | null = null;

// Setters (ES module exported `let` bindings are read-only from outside)
export function mergeConfig(opts: Partial<TrackerConfig>): void {
  Object.assign(config, opts, {
    browserPixel: { ...config.browserPixel, ...((opts.browserPixel as object) ?? {}) },
    consent: { ...config.consent, ...((opts.consent as object) ?? {}) },
    cookieKeeper: { ...config.cookieKeeper, ...((opts.cookieKeeper as object) ?? {}) },
    adBlockRecovery: { ...config.adBlockRecovery, ...((opts.adBlockRecovery as object) ?? {}) },
    advancedMatching: { ...config.advancedMatching, ...((opts.advancedMatching as object) ?? {}) },
  });
}
export function setInitialized(v: boolean): void { initialized = v; }
export function setTransportMethod(v: string): void { transportMethod = v; }
export function setAdBlockDetected(v: boolean): void { adBlockDetected = v; }
export function setBatchTimer(v: ReturnType<typeof setTimeout> | null): void { batchTimer = v; }
export function setCookieKeeperTimer(v: ReturnType<typeof setInterval> | null): void { cookieKeeperTimer = v; }

// Logging
export function spliceQueue(count: number): TrackingEvent[] { return queue.splice(0, count); }
export function pushQueue(event: TrackingEvent): void { queue.push(event); }
export function log(...args: unknown[]): void { if (config.debug) console.log('[MetaTracker]', ...args); }
export function warn(...args: unknown[]): void { if (config.debug) console.warn('[MetaTracker]', ...args); }
