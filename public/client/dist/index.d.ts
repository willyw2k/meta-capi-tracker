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
import type { MetaTrackerAPI } from './types';
declare const MetaTracker: MetaTrackerAPI;
export { MetaTracker };
export default MetaTracker;
export type { TrackerConfig, TrackerInitOptions, MetaEventName, MetaStandardEvent, CustomData, RawUserData, HashedUserData, TrackOptions, TrackingEvent, MetaTrackerAPI, PixelConfig, CookieKeeperConfig, AdBlockRecoveryConfig, AdvancedMatchingConfig, CaptureSource, MatchQualityResult, DebugInfo, } from './types';
//# sourceMappingURL=index.d.ts.map