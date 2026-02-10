/**
 * Pixel Router — multi-domain pixel ID resolution.
 */
import { config } from './state';

export const PixelRouter = {
  resolve(hostname?: string): string[] {
    hostname = hostname ?? window.location.hostname;
    if (!config.pixels?.length) return config.pixelId ? [config.pixelId] : [];
    const matched: string[] = [];
    let catchAll: string | null = null;
    for (const pc of config.pixels) {
      if (!pc.pixelId || !pc.domains) continue;
      for (const pattern of pc.domains) {
        if (pattern === '*') { catchAll = pc.pixelId; continue; }
        if (this.matchDomain(hostname, pattern)) { matched.push(pc.pixelId); break; }
      }
    }
    if (!matched.length && catchAll) matched.push(catchAll);
    return [...new Set(matched)];
  },

  matchDomain(hostname: string, pattern: string): boolean {
    if (hostname === pattern) return true;
    if (pattern.startsWith('*.')) {
      const suffix = pattern.substring(2);
      return hostname.endsWith('.' + suffix) || hostname === suffix;
    }
    return hostname.endsWith('.' + pattern);
  },

  getAllPixelIds(): string[] {
    if (!config.pixels?.length) return config.pixelId ? [config.pixelId] : [];
    return [...new Set(config.pixels.map((p) => p.pixelId).filter(Boolean))];
  },
};
