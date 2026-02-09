/**
 * Advanced Matching — PII capture, normalisation, hashing, identity graph.
 *
 * Data sources (priority order):
 *   1. Explicit userData → track()
 *   2. identify() stored identity
 *   3. Auto-captured form data
 *   4. URL parameters
 *   5. DataLayer / GTM
 *   6. Meta tags / structured data
 */
import type { MetaPiiField, CaptureSource, HashedUserData, RawUserData, AdvancedMatchingDiagnostics } from './types';
export declare const AdvancedMatching: {
    init(): void;
    normalize(field: string, value: string): string | null;
    normalizeAndHash(userData: RawUserData): Promise<HashedUserData>;
    detectFieldParam(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string | null;
    scanForm(form: HTMLFormElement): RawUserData;
    watchForms(): void;
    captureFromUrl(): void;
    captureFromDataLayer(): void;
    _extractFromDataLayerEntry(entry: unknown): void;
    _extractUserObject(obj: Record<string, unknown>, source: CaptureSource): void;
    captureFromMetaTags(): void;
    _mergeCapture(source: CaptureSource, data: RawUserData): void;
    getCapturedData(): RawUserData;
    buildUserData(explicitUserData?: RawUserData): Promise<HashedUserData>;
    scoreMatchQuality(userData: HashedUserData): number;
    getDiagnostics(): AdvancedMatchingDiagnostics;
    resetCapturedData(): void;
    aliasMap: Record<string, MetaPiiField>;
    storageMap: Partial<Record<MetaPiiField, string>>;
};
//# sourceMappingURL=advanced-matching.d.ts.map