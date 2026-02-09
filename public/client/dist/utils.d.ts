export declare function sha256(value: string): Promise<string | null>;
export declare function isHashed(value: unknown): value is string;
export declare function generateEventId(): string;
export declare function generateVisitorId(): string;
export declare function setCookie(name: string, value: string, days: number): void;
export declare function getCookie(name: string): string | null;
export declare function deleteCookie(name: string): void;
export declare function getFromStorage(key: string): string | null;
export declare function saveToStorage(key: string, value: string, days?: number): void;
export declare function removeFromStorage(key: string): void;
//# sourceMappingURL=utils.d.ts.map