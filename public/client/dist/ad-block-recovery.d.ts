import type { DisguisedPayload } from './types';
export declare const AdBlockRecovery: {
    detect(): Promise<boolean>;
    getEndpoint(path: string): string;
    getFallbackEndpoints(path: string): string[];
    disguisePayload(data: unknown): DisguisedPayload | unknown;
    getHeaders(): Record<string, string>;
};
//# sourceMappingURL=ad-block-recovery.d.ts.map