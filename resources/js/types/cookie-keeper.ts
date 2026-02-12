/**
 * Cookie Keeper — ITP survival via server-side cookie renewal.
 */
import { config, log, warn, cookieKeeperTimer, setCookieKeeperTimer } from '@/types/state';
import { getCookie, setCookie, getFromStorage, saveToStorage, generateVisitorId } from '@/types/utils';
import { transportSend, resolveEndpoint } from '@/types/transport';

export const CookieKeeper = {
  init(): void {
    if (!config.cookieKeeper.enabled) return;
    this.restoreCookies(); this.captureFbclid(); this.ensureFbp();
    this.ensureVisitorId(); this.syncToServer(); this.scheduleRefresh();
    log('CookieKeeper: ready', { fbp: this.getFbp(), fbc: this.getFbc() });
  },

  restoreCookies(): void {
    for (const name of config.cookieKeeper.cookieNames ?? []) {
      if (!getCookie(name)) {
        try { const b = localStorage.getItem('mt_' + name); if (b) setCookie(name, b, config.cookieKeeper.maxAge); } catch { /* */ }
      } else {
        try { localStorage.setItem('mt_' + name, getCookie(name)!); } catch { /* */ }
      }
    }
  },

  captureFbclid(): void {
    try {
      const fbclid = new URL(window.location.href).searchParams.get('fbclid');
      if (fbclid) saveToStorage('_fbc', `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}`, config.cookieKeeper.maxAge);
    } catch { /* */ }
  },

  ensureFbp(): void {
    if (!getFromStorage('_fbp')) {
      saveToStorage('_fbp', `fb.1.${Date.now()}.${Math.floor(Math.random() * 2_147_483_647)}`, config.cookieKeeper.maxAge);
    }
  },

  ensureVisitorId(): void { if (!getFromStorage('_mt_id')) generateVisitorId(); },

  async syncToServer(): Promise<void> {
    const cookies: Record<string, string | null> = {
      _fbp: getFromStorage('_fbp'), _fbc: getFromStorage('_fbc'),
      _mt_id: getFromStorage('_mt_id'), _mt_em: getFromStorage('_mt_em'), _mt_ph: getFromStorage('_mt_ph'),
    };
    if (!cookies._fbp && !cookies._fbc && !cookies._mt_id) return;
    const last = getFromStorage('_mt_cookie_sync');
    if (last && Date.now() - parseInt(last, 10) < config.cookieKeeper.refreshInterval) return;
    try {
      await transportSend(resolveEndpoint('/cookie-sync'), { cookies, domain: window.location.hostname, max_age: config.cookieKeeper.maxAge });
      saveToStorage('_mt_cookie_sync', Date.now().toString(), 1);
    } catch (e: unknown) { warn('CookieKeeper: sync failed', (e as Error).message); }
  },

  refreshCookies(): void {
    for (const name of config.cookieKeeper.cookieNames ?? []) {
      const v = getFromStorage(name); if (v) setCookie(name, v, config.cookieKeeper.maxAge);
    }
    saveToStorage('_mt_cookie_sync', '0', 1);
    this.syncToServer();
  },

  scheduleRefresh(): void {
    if (cookieKeeperTimer) clearInterval(cookieKeeperTimer);
    setCookieKeeperTimer(setInterval(() => this.refreshCookies(), config.cookieKeeper.refreshInterval));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.restoreCookies(); });
  },

  getFbp(): string | null { return getFromStorage('_fbp'); },
  getFbc(): string | null { return getFromStorage('_fbc'); },
  getVisitorId(): string | null { return getFromStorage('_mt_id'); },
};
