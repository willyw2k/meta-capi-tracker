/**
 * GTM Integration — DataLayer bridge for Google Tag Manager.
 *
 * Automatically maps GA4/Enhanced Ecommerce dataLayer events to Meta CAPI
 * events, and optionally pushes MetaTracker events back to the dataLayer
 * for other GTM tags to consume.
 *
 * Supported GA4 ecommerce events:
 *   - page_view       → PageView
 *   - view_item       → ViewContent
 *   - add_to_cart     → AddToCart
 *   - remove_from_cart (logged only)
 *   - add_to_wishlist → AddToWishlist
 *   - begin_checkout  → InitiateCheckout
 *   - add_payment_info → AddPaymentInfo
 *   - purchase        → Purchase
 *   - sign_up         → CompleteRegistration
 *   - generate_lead   → Lead
 *   - search          → Search
 *   - view_item_list  → ViewContent
 *   - select_item     → ViewContent
 */

import { config, log, warn } from '@/tracking/state';
import type { CustomData, RawUserData, GtmConfig } from '@/types/types';

// ── GA4 → Meta event mapping ────────────────────────────────

const GA4_EVENT_MAP: Record<string, string> = {
  page_view: 'PageView',
  view_item: 'ViewContent',
  view_item_list: 'ViewContent',
  select_item: 'ViewContent',
  add_to_cart: 'AddToCart',
  add_to_wishlist: 'AddToWishlist',
  begin_checkout: 'InitiateCheckout',
  add_payment_info: 'AddPaymentInfo',
  purchase: 'Purchase',
  refund: '', // skip
  remove_from_cart: '', // skip
  sign_up: 'CompleteRegistration',
  generate_lead: 'Lead',
  search: 'Search',
  login: '', // skip — no direct Meta equivalent
  view_cart: 'ViewContent',
  add_shipping_info: 'AddPaymentInfo',
  select_promotion: 'ViewContent',
};

// ── Ecommerce data extraction ────────────────────────────────

interface GA4Item {
  item_id?: string;
  item_name?: string;
  item_category?: string;
  price?: number;
  quantity?: number;
  [key: string]: unknown;
}

interface GA4EcommerceData {
  items?: GA4Item[];
  value?: number;
  currency?: string;
  transaction_id?: string;
  shipping?: number;
  tax?: number;
  coupon?: string;
  search_term?: string;
  [key: string]: unknown;
}

function extractCustomData(eventName: string, ecommerce: GA4EcommerceData | undefined, dlEntry: Record<string, unknown>): CustomData {
  const cd: CustomData = {};

  const ecom = ecommerce ?? {};

  // Value & currency
  if (ecom.value !== undefined) cd.value = Number(ecom.value);
  if (ecom.currency) cd.currency = String(ecom.currency);

  // Transaction / order ID
  if (ecom.transaction_id) cd.order_id = String(ecom.transaction_id);

  // Search
  if (ecom.search_term) cd.search_string = String(ecom.search_term);
  if (dlEntry.search_term) cd.search_string = String(dlEntry.search_term);

  // Items → content_ids, contents, num_items, content_type
  if (Array.isArray(ecom.items) && ecom.items.length) {
    cd.content_ids = ecom.items
      .map((item) => item.item_id ?? item.item_name ?? '')
      .filter(Boolean);

    cd.contents = ecom.items.map((item) => ({
      id: String(item.item_id ?? item.item_name ?? ''),
      quantity: item.quantity ?? 1,
      item_price: item.price,
    }));

    cd.num_items = ecom.items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);

    // Infer content_type
    cd.content_type = 'product';

    // Content name from first item
    if (ecom.items[0]?.item_name) cd.content_name = ecom.items[0].item_name;

    // Category from first item
    if (ecom.items[0]?.item_category) cd.content_category = ecom.items[0].item_category;
  }

  // Fallback value from items if not set
  if (cd.value === undefined && cd.contents?.length) {
    cd.value = cd.contents.reduce(
      (sum, c) => sum + ((c.item_price ?? 0) * (c.quantity ?? 1)), 0,
    );
  }

  return cd;
}

function extractUserData(dlEntry: Record<string, unknown>): RawUserData {
  const ud: Record<string, string> = {};

  // Look for user data in common dataLayer patterns
  const userKeys = ['user', 'userData', 'user_data', 'customer', 'visitor', 'contact'];
  for (const key of userKeys) {
    if (dlEntry[key] && typeof dlEntry[key] === 'object') {
      const obj = dlEntry[key] as Record<string, unknown>;
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

  // Also check top-level user fields (some implementations put them directly)
  if (dlEntry.user_id) ud.external_id = ud.external_id || String(dlEntry.user_id);
  if (dlEntry.userId) ud.external_id = ud.external_id || String(dlEntry.userId);

  return ud as RawUserData;
}

// ── Module state ─────────────────────────────────────────────

let _initialized = false;
let _originalPush: ((...args: unknown[]) => number) | null = null;

// ══════════════════════════════════════════════════════════════
// ── EXPORTED MODULE
// ══════════════════════════════════════════════════════════════

export const GtmIntegration = {

  init(): void {
    if (!config.gtm.enabled) return;
    if (_initialized) return;

    try {
      log('GTM: initializing dataLayer bridge');

      const dlKey = config.gtm.dataLayerKey || 'dataLayer';
      const dl = window[dlKey] as unknown[] | undefined;

      if (!Array.isArray(dl)) {
        // Create dataLayer if it doesn't exist
        (window as Record<string, unknown>)[dlKey] = [];
        log('GTM: created', dlKey);
      }

      const dataLayer = (window as Record<string, unknown>)[dlKey] as unknown[];

      // Process existing entries
      if (config.gtm.autoMapEcommerce) {
        for (const entry of dataLayer) {
          try {
            this._processEntry(entry);
          } catch (err) {
            warn('GTM: error processing existing dataLayer entry', err);
          }
        }
      }

      // Intercept future pushes
      _originalPush = dataLayer.push.bind(dataLayer);
      dataLayer.push = (...args: unknown[]): number => {
        const result = _originalPush!(...args);
        if (config.gtm.autoMapEcommerce) {
          for (const entry of args) {
            try {
              this._processEntry(entry);
            } catch (err) {
              warn('GTM: error processing dataLayer push', err);
            }
          }
        }
        return result;
      };

      _initialized = true;
      log('GTM: dataLayer bridge active');
    } catch (err) {
      warn('GTM: failed to initialize dataLayer bridge', err);
    }
  },

  /**
   * Process a single dataLayer entry and fire the corresponding Meta event.
   */
  _processEntry(entry: unknown): void {
    if (!entry || typeof entry !== 'object') return;

    const obj = entry as Record<string, unknown>;
    const event = obj.event as string | undefined;
    if (!event || typeof event !== 'string') return;

    // Skip internal GTM events and our own events to prevent loops
    if (event.startsWith('gtm.')) return;
    if (obj._source === 'meta-capi-tracker') return;

    // Resolve Meta event name
    const metaEvent = this._resolveEventName(event);
    if (!metaEvent) return;

    // Extract ecommerce and user data with defensive error handling
    let customData: CustomData = {};
    let userData: RawUserData = {};

    try {
      const ecommerce = obj.ecommerce as GA4EcommerceData | undefined;
      customData = extractCustomData(event, ecommerce, obj);
      userData = extractUserData(obj);
    } catch (err) {
      warn('GTM: error extracting data from dataLayer entry', event, err);
      return;
    }

    log('GTM: mapping', event, '→', metaEvent);

    // Fire MetaTracker event (without re-pushing to dataLayer to avoid loops)
    if (window.MetaTracker && typeof window.MetaTracker.track === 'function') {
      window.MetaTracker.track(metaEvent, customData, userData).catch((err: unknown) => {
        warn('GTM: failed to track mapped event', metaEvent, err);
      });
    }
  },

  /**
   * Resolve a dataLayer event name to a Meta CAPI event name.
   */
  _resolveEventName(dlEvent: string): string | null {
    // Custom mapping takes priority
    const custom = config.gtm.eventMapping[dlEvent];
    if (custom) return custom;

    // Built-in GA4 mapping
    const mapped = GA4_EVENT_MAP[dlEvent];
    if (mapped !== undefined) return mapped || null; // empty string = skip

    return null; // Unknown event — don't map
  },

  /**
   * Push an event to the GTM dataLayer.
   */
  pushToDataLayer(event: string, data: Record<string, unknown> = {}): void {
    try {
      const dlKey = config.gtm.dataLayerKey || 'dataLayer';
      const dl = window[dlKey] as unknown[] | undefined;

      if (!Array.isArray(dl)) {
        warn('GTM: dataLayer not found, cannot push event');
        return;
      }

      // Use the original push to avoid our interceptor re-processing this event
      const pushFn = _originalPush ?? dl.push.bind(dl);

      pushFn({
        event,
        ...data,
        _source: 'meta-capi-tracker',
      });

      log('GTM: pushed to dataLayer:', event);
    } catch (err) {
      warn('GTM: error pushing to dataLayer', event, err);
    }
  },

  /**
   * Push a MetaTracker event result to the dataLayer for other GTM tags.
   */
  notifyDataLayer(eventName: string, eventId: string | undefined, customData: CustomData = {}): void {
    if (!config.gtm.enabled || !config.gtm.pushToDataLayer) return;

    try {
      this.pushToDataLayer('meta_capi_event', {
        meta_event_name: eventName,
        meta_event_id: eventId,
        meta_custom_data: customData,
      });
    } catch (err) {
      warn('GTM: error notifying dataLayer', eventName, err);
    }
  },

  isInitialized(): boolean {
    return _initialized;
  },
};
