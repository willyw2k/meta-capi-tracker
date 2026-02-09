export declare const CookieKeeper: {
    init(): void;
    restoreCookies(): void;
    captureFbclid(): void;
    ensureFbp(): void;
    ensureVisitorId(): void;
    syncToServer(): Promise<void>;
    refreshCookies(): void;
    scheduleRefresh(): void;
    getFbp(): string | null;
    getFbc(): string | null;
    getVisitorId(): string | null;
};
//# sourceMappingURL=cookie-keeper.d.ts.map