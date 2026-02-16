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
/** Meta PII field identifiers. */
type PiiField = 'em' | 'ph' | 'fn' | 'ln' | 'ge' | 'db' | 'ct' | 'st' | 'zp' | 'country' | 'external_id';
/** Non-PII fields that Meta accepts. */
type NonPiiField = 'client_ip_address' | 'client_user_agent' | 'fbc' | 'fbp' | 'subscription_id' | 'fb_login_id' | 'lead_id';
/** All Meta user_data fields. */
type UserDataField = PiiField | NonPiiField;
/** Long-form field aliases accepted in public API. */
type FieldAlias = 'email' | 'phone' | 'first_name' | 'last_name' | 'gender' | 'date_of_birth' | 'city' | 'state' | 'zip' | 'zipcode' | 'postal_code';
/** User data input – accepts both short and long field names. */
export type UserDataInput = Partial<Record<PiiField | NonPiiField | FieldAlias, string>>;
/** Hashed/normalized user data ready for the server. */
export type HashedUserData = Partial<Record<UserDataField, string>>;
/** Data source identifiers for the identity graph. */
type CaptureSource = 'explicit' | 'identify' | 'form' | 'form_prefill' | 'url' | 'dataLayer' | 'customDataLayer' | 'metatag';
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
/** Browser Pixel configuration. */
export interface BrowserPixelConfig {
    enabled: boolean;
    autoPageView: boolean;
    syncEvents: boolean;
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
    minMatchQuality: number;
    browserPixel: BrowserPixelConfig;
    cookieKeeper: CookieKeeperConfig;
    adBlockRecovery: AdBlockRecoveryConfig;
    advancedMatching: AdvancedMatchingConfig;
}
/** Options for init – all fields optional except endpoint + apiKey. */
export type TrackerInitOptions = Partial<TrackerConfig> & {
    endpoint: string;
    apiKey: string;
} & ({
    pixelId: string;
} | {
    pixels: PixelConfig[];
});
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
    fields: Record<string, {
        source: CaptureSource;
        hasValue: boolean;
        isHashed: boolean;
    }>;
    storedIdentity: Record<string, boolean>;
}
/** Debug info returned from getDebugInfo(). */
export interface DebugInfo {
    version: string;
    initialized: boolean;
    transport: string;
    adBlockDetected: boolean;
    config: {
        endpoint: string;
        pixelId: string;
        pixelCount: number;
    };
    cookies: {
        fbp: string | null;
        fbc: string | null;
        visitorId: string | null;
    };
    routing: {
        domain: string;
        active: string[];
        all: string[];
    };
    advancedMatching: MatchDiagnostics;
    queueSize: number;
}
/** Match quality result. */
export interface MatchQualityResult {
    score: number;
    fields: string[];
}
/** Augment Window for globals. */
declare global {
    interface Window {
        MetaTracker: MetaTrackerApi;
        MetaTrackerQueue?: [string, ...unknown[]][];
        doNotTrack?: string;
        [key: string]: unknown;
    }
}
export interface MetaTrackerApi {
    readonly VERSION: string;
    init(options: TrackerInitOptions): Promise<MetaTrackerApi>;
    track(eventName: string, customData?: Record<string, unknown>, userData?: UserDataInput, options?: TrackOptions): Promise<string | undefined>;
    trackPageView(userData?: UserDataInput): Promise<string | undefined>;
    trackViewContent(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
    trackAddToCart(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
    trackPurchase(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
    trackLead(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
    trackCompleteRegistration(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
    trackInitiateCheckout(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
    trackSearch(customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
    trackToPixel(pixelId: string, name: string, customData?: Record<string, unknown>, userData?: UserDataInput): Promise<string | undefined>;
    identify(userData?: UserDataInput): Promise<void>;
    clearIdentity(): void;
    addPixel(pixelId: string, domains: string | string[]): void;
    removePixel(pixelId: string): void;
    refreshCookies(): void;
    flush(): void;
    isAdBlocked(): boolean;
    getTransport(): string;
    getDebugInfo(): DebugInfo;
    getMatchQuality(extraUserData?: UserDataInput): Promise<MatchQualityResult>;
    addUserData(data: UserDataInput, source?: string): void;
}
export {};
//# sourceMappingURL=meta-tracker.d.ts.map