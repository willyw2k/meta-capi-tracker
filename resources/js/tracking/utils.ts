/**
 * Utility helpers — storage, hashing, ID generation.
 */
import { config } from '@/tracking/state';

export async function sha256(value: string): Promise<string | null> {
  if (!value) return null;
  const data = new TextEncoder().encode(value.toString().trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isHashed(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function generateEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
}

export function generateVisitorId(): string {
  const stored = getFromStorage('_mt_id');
  if (stored) return stored;
  const id = 'mt.' + Date.now().toString(36) + '.' + Math.random().toString(36).substring(2, 12);
  saveToStorage('_mt_id', id);
  return id;
}

function getRootDomain(): string {
  try {
    const parts = window.location.hostname.split('.');
    if (parts.length <= 1 || /^\d+$/.test(parts[parts.length - 1])) return '';
    return parts.slice(-2).join('.');
  } catch { return ''; }
}

export function setCookie(name: string, value: string, days: number): void {
  const maxAge = days * 86_400;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  const domain = getRootDomain();
  const domainStr = domain ? `; domain=.${domain}` : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/${domainStr}; max-age=${maxAge}; SameSite=Lax${secure}`;
}

export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export function deleteCookie(name: string): void {
  const domain = getRootDomain();
  document.cookie = `${name}=; path=/${domain ? `; domain=.${domain}` : ''}; max-age=0`;
}

export function getFromStorage(key: string): string | null {
  const c = getCookie(key);
  if (c) return c;
  try { return localStorage.getItem('mt_' + key); } catch { return null; }
}

export function saveToStorage(key: string, value: string, days?: number): void {
  days = days ?? (config.cookieKeeper.maxAge || 180);
  setCookie(key, value, days);
  try { localStorage.setItem('mt_' + key, value); } catch { /* noop */ }
}

export function removeFromStorage(key: string): void {
  deleteCookie(key);
  try { localStorage.removeItem('mt_' + key); } catch { /* noop */ }
}
