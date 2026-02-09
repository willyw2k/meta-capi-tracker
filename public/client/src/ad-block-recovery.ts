/**
 * Ad Blocker Recovery — detection, disguised endpoints, payload obfuscation.
 */
import { config, adBlockDetected, setAdBlockDetected, log, VERSION } from './state';
import type { DisguisedPayload } from './types';

export const AdBlockRecovery = {
  async detect(): Promise<boolean> {
    if (!config.adBlockRecovery.enabled) return false;
    try {
      const testUrl = config.endpoint.replace(/\/track\/?$/, '') + '/health';
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(testUrl, { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!r.ok) throw new Error('Blocked');
      return false;
    } catch {
      setAdBlockDetected(true);
      log('AdBlockRecovery: DETECTED');
      return true;
    }
  },

  getEndpoint(path: string): string {
    if (adBlockDetected && config.adBlockRecovery.proxyPath) {
      return config.endpoint.replace(/\/api\/v1\/track\/?$/, '') + config.adBlockRecovery.proxyPath + path;
    }
    return config.endpoint + path;
  },

  getFallbackEndpoints(path: string): string[] {
    const eps = [this.getEndpoint(path)];
    for (const ep of config.adBlockRecovery.customEndpoints ?? []) eps.push(ep + path);
    return eps;
  },

  disguisePayload(data: unknown): DisguisedPayload | unknown {
    if (!adBlockDetected) return data;
    return { d: btoa(JSON.stringify(data)), t: Date.now(), v: VERSION };
  },

  getHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    h[adBlockDetected ? 'X-Request-Token' : 'X-API-Key'] = config.apiKey;
    return h;
  },
};
