/**
 * Shared mutable state — centralised to avoid circular imports.
 */
import type { TrackerConfig, TrackingEvent } from './types';
export declare const VERSION = "2.1.0";
export declare const MAX_QUEUE_SIZE = 50;
export declare const RETRY_DELAYS: readonly number[];
export declare const BATCH_INTERVAL = 2000;
export declare let config: TrackerConfig;
export declare const queue: TrackingEvent[];
export declare let batchTimer: ReturnType<typeof setTimeout> | null;
export declare let initialized: boolean;
export declare let transportMethod: string;
export declare let adBlockDetected: boolean;
export declare let cookieKeeperTimer: ReturnType<typeof setInterval> | null;
export declare function mergeConfig(opts: Partial<TrackerConfig>): void;
export declare function setInitialized(v: boolean): void;
export declare function setTransportMethod(v: string): void;
export declare function setAdBlockDetected(v: boolean): void;
export declare function setBatchTimer(v: ReturnType<typeof setTimeout> | null): void;
export declare function setCookieKeeperTimer(v: ReturnType<typeof setInterval> | null): void;
export declare function spliceQueue(count: number): TrackingEvent[];
export declare function pushQueue(event: TrackingEvent): void;
export declare function log(...args: unknown[]): void;
export declare function warn(...args: unknown[]): void;
//# sourceMappingURL=state.d.ts.map