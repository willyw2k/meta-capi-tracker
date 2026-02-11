/**
 * BrowserPixel — Auto-load Meta fbevents.js and sync events for deduplication.
 */
import { config, log, warn } from '@/types/state';
import { PixelRouter } from '@/types/pixel-router';

const STANDARD_EVENTS = [
  'PageView', 'ViewContent', 'AddToCart', 'AddPaymentInfo',
  'AddToWishlist', 'CompleteRegistration', 'Contact', 'CustomizeProduct',
  'Donate', 'FindLocation', 'InitiateCheckout', 'Lead', 'Purchase',
  'Schedule', 'Search', 'StartTrial', 'SubmitApplication', 'Subscribe',
] as const;

export const BrowserPixel = {
  _loaded: false,

  init(): void {
    if (!config.browserPixel.enabled) return;
    if (this._loaded) return;

    if (typeof (window as any).fbq === 'function') {
      log('BrowserPixel: fbq already present, initializing pixels');
      this._initPixels();
      this._loaded = true;
      return;
    }

    log('BrowserPixel: loading fbevents.js');

    const n: any = (window as any).fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!(window as any)._fbq) (window as any)._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [] as any[];

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
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

  _initPixels(): void {
    const pixelIds = PixelRouter.getAllPixelIds();
    if (!pixelIds.length) { warn('BrowserPixel: no pixel IDs configured'); return; }

    for (const pid of pixelIds) {
      (window as any).fbq('init', pid);
      log('BrowserPixel: init pixel', pid);
    }

    if (config.browserPixel.autoPageView) {
      (window as any).fbq('track', 'PageView');
      log('BrowserPixel: PageView fired');
    }
  },

  trackEvent(eventName: string, eventId: string, customData: Record<string, unknown> = {}): void {
    if (!config.browserPixel.enabled || !config.browserPixel.syncEvents) return;
    if (typeof (window as any).fbq !== 'function') return;

    const isStandard = (STANDARD_EVENTS as readonly string[]).includes(eventName);
    const fbqParams = { ...customData };
    const fbqOptions = { eventID: eventId };

    if (isStandard) {
      (window as any).fbq('track', eventName, fbqParams, fbqOptions);
    } else {
      (window as any).fbq('trackCustom', eventName, fbqParams, fbqOptions);
    }

    log('BrowserPixel: synced', eventName, 'eventID:', eventId);
  },
};
