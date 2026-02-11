/**
 * Meta CAPI Tracker — Type Definitions v3.0
 */

export type MetaPiiField =
  | 'em' | 'ph' | 'fn' | 'ln' | 'ge' | 'db'
  | 'ct' | 'st' | 'zp' | 'country' | 'external_id';

export type MetaNonPiiField =
  | 'client_ip_address' | 'client_user_agent'
  | 'fbc' | 'fbp' | 'subscription_id' | 'fb_login_id' | 'lead_id';

export type MetaUserDataField = MetaPiiField | MetaNonPiiField;

export type UserDataAlias =
  | 'email' | 'phone' | 'first_name' | 'last_name'
  | 'gender' | 'date_of_birth' | 'city' | 'state'
  | 'zip' | 'zipcode' | 'postal_code' | 'country_code';

export interface PixelConfig { pixelId: string; domains: string[]; }
export interface CookieKeeperConfig { enabled: boolean; refreshInterval: number; maxAge: number; cookieNames: string[]; }
export interface BrowserPixelConfig { enabled: boolean; autoPageView: boolean; syncEvents: boolean; }
export interface AdBlockRecoveryConfig { enabled: boolean; proxyPath: string; useBeacon: boolean; useImage: boolean; customEndpoints: string[]; }
export interface ConsentConfig {
  enabled: boolean; mode: 'opt-in' | 'opt-out'; consentCategory: string;
  waitForConsent: boolean; defaultConsent: boolean;
}
export interface AdvancedMatchingConfig {
  enabled: boolean; autoCaptureForms: boolean; captureUrlParams: boolean;
  captureDataLayer: boolean; captureMetaTags: boolean; autoIdentifyOnSubmit: boolean;
  formFieldMap: Record<string, MetaPiiField>; dataLayerKey: string; userDataKey: string | null;
}

export interface TrackerConfig {
  endpoint: string; apiKey: string; pixelId: string; pixels: PixelConfig[];
  autoPageView: boolean; debug: boolean; hashPii: boolean;
  respectDnt: boolean; batchEvents: boolean; minMatchQuality: number;
  browserPixel: BrowserPixelConfig; consent: ConsentConfig;
  cookieKeeper: CookieKeeperConfig; adBlockRecovery: AdBlockRecoveryConfig;
  advancedMatching: AdvancedMatchingConfig;
}

export type TrackerInitOptions = Partial<TrackerConfig> &
  { endpoint: string; apiKey: string } &
  ({ pixelId: string } | { pixels: PixelConfig[] });

export type RawUserData = Partial<Record<MetaPiiField | MetaNonPiiField | UserDataAlias, string>>;
export type HashedUserData = Partial<Record<MetaUserDataField, string>>;

export type MetaStandardEvent =
  | 'PageView' | 'ViewContent' | 'AddToCart' | 'AddToWishlist'
  | 'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase'
  | 'Lead' | 'CompleteRegistration' | 'Contact'
  | 'CustomizeProduct' | 'Donate' | 'FindLocation'
  | 'Schedule' | 'Search' | 'StartTrial'
  | 'SubmitApplication' | 'Subscribe';

export type MetaEventName = MetaStandardEvent | (string & {});

export interface CustomData {
  value?: number; currency?: string; content_name?: string;
  content_category?: string; content_ids?: string[];
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
  content_type?: string; order_id?: string; num_items?: number;
  search_string?: string; status?: string; [key: string]: unknown;
}

export interface TrackOptions { event_id?: string; pixel_id?: string; action_source?: string; }

export interface TrackingEvent {
  pixel_id: string; event_name: string; event_id: string;
  event_time: number; event_source_url: string; action_source: string;
  user_data: HashedUserData; match_quality: number;
  visitor_id: string | null; custom_data?: CustomData;
}

export type CaptureSource =
  | 'explicit' | 'identify' | 'form' | 'form_prefill'
  | 'url' | 'dataLayer' | 'customDataLayer' | 'metatag';

export interface CapturedEntry { value: string; source: CaptureSource; }
export type CapturedData = Record<string, CapturedEntry>;

export interface TransportDef {
  name: string; fn: (url: string, data: unknown) => Promise<unknown>; skip?: boolean;
}

export interface FieldPatterns {
  types?: string[]; names?: string[]; ids?: string[];
  autocomplete?: string[]; placeholders?: string[];
}

export interface MatchQualityResult { score: number; fields: string[]; }

export interface AdvancedMatchingDiagnostics {
  capturedFields: number;
  fields: Record<string, { source: string; hasValue: boolean; isHashed: boolean }>;
  storedIdentity: Record<string, boolean>;
}

export interface DebugInfo {
  version: string; initialized: boolean; transport: string; adBlockDetected: boolean;
  config: { endpoint: string; pixelId: string; pixelCount: number };
  cookies: { fbp: string | null; fbc: string | null; visitorId: string | null };
  routing: { domain: string; active: string[]; all: string[] };
  advancedMatching: AdvancedMatchingDiagnostics; queueSize: number;
}

export interface DisguisedPayload { d: string; t: number; v: string; }
export type Normalizer = (value: string) => string | null;

export interface MetaTrackerAPI {
  readonly VERSION: string;
  init(options: TrackerInitOptions): Promise<MetaTrackerAPI>;
  track(eventName: MetaEventName, customData?: CustomData, userData?: RawUserData, options?: TrackOptions): Promise<string | undefined>;
  trackPageView(userData?: RawUserData): Promise<string | undefined>;
  trackViewContent(customData?: CustomData, userData?: RawUserData): Promise<string | undefined>;
  trackAddToCart(customData?: CustomData, userData?: RawUserData): Promise<string | undefined>;
  trackPurchase(customData?: CustomData, userData?: RawUserData): Promise<string | undefined>;
  trackLead(customData?: CustomData, userData?: RawUserData): Promise<string | undefined>;
  trackCompleteRegistration(customData?: CustomData, userData?: RawUserData): Promise<string | undefined>;
  trackInitiateCheckout(customData?: CustomData, userData?: RawUserData): Promise<string | undefined>;
  trackSearch(customData?: CustomData, userData?: RawUserData): Promise<string | undefined>;
  trackToPixel(pixelId: string, eventName: MetaEventName, customData?: CustomData, userData?: RawUserData): Promise<string | undefined>;
  identify(userData: RawUserData): Promise<void>;
  clearIdentity(): void;
  addPixel(pixelId: string, domains: string | string[]): void;
  removePixel(pixelId: string): void;
  refreshCookies(): void;
  hasConsent(): boolean;
  grantConsent(): void;
  revokeConsent(): void;
  flush(): void;
  isAdBlocked(): boolean;
  getTransport(): string;
  getDebugInfo(): DebugInfo;
  getMatchQuality(extraUserData?: RawUserData): Promise<MatchQualityResult>;
  addUserData(data: RawUserData, source?: CaptureSource): void;
}

declare global {
  interface Window {
    MetaTracker: MetaTrackerAPI;
    MetaTrackerQueue?: Array<[string, ...unknown[]]>;
    doNotTrack?: string;
    [key: string]: unknown;
  }
}
