/**
 * Transport Layer — fetch → beacon → XHR → image fallback chain.
 */
import { AdBlockRecovery } from '@/types/ad-block-recovery';
import {
  config, adBlockDetected, transportMethod, setTransportMethod,
  log, warn, RETRY_DELAYS,
} from './state';
import type { TransportDef } from './types';

export function resolveEndpoint(path: string): string {
  return adBlockDetected ? AdBlockRecovery.getEndpoint(path) : config.endpoint + path;
}

async function viaFetch(url: string, data: unknown): Promise<unknown> {
  const body = adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data;
  const r = await fetch(url, {
    method: 'POST', headers: AdBlockRecovery.getHeaders(),
    body: JSON.stringify(body), keepalive: true, credentials: 'include',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json().catch(() => ({}));
}

function viaBeacon(url: string, data: unknown): Promise<unknown> {
  const body = adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data;
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  if (!navigator.sendBeacon(url + '?api_key=' + encodeURIComponent(config.apiKey), blob)) {
    throw new Error('Beacon failed');
  }
  return Promise.resolve({ sent: true });
}

function viaXhr(url: string, data: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    for (const [k, v] of Object.entries(AdBlockRecovery.getHeaders())) xhr.setRequestHeader(k, v);
    xhr.withCredentials = true;
    xhr.timeout = 10_000;
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300
      ? resolve(JSON.parse(xhr.responseText || '{}'))
      : reject(new Error(`XHR ${xhr.status}`));
    xhr.onerror = () => reject(new Error('XHR error'));
    xhr.ontimeout = () => reject(new Error('XHR timeout'));
    const body = adBlockDetected ? AdBlockRecovery.disguisePayload(data) : data;
    xhr.send(JSON.stringify(body));
  });
}

function viaImage(url: string, data: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ d: btoa(JSON.stringify(data)), k: config.apiKey, t: Date.now().toString() });
    const imgUrl = url.replace(/\/(event|batch)$/, '/pixel.gif') + '?' + params;
    if (imgUrl.length > 4000) { reject(new Error('Payload too large')); return; }
    const img = new Image(1, 1);
    img.onload = () => resolve({ sent: true });
    img.onerror = () => reject(new Error('Image pixel failed'));
    img.src = imgUrl;
  });
}

export async function transportSend(url: string, data: unknown, attempt = 0): Promise<unknown> {
  const transports: TransportDef[] = [
    { name: 'fetch', fn: viaFetch },
    { name: 'beacon', fn: viaBeacon, skip: !config.adBlockRecovery.useBeacon },
    { name: 'xhr', fn: viaXhr },
    { name: 'img', fn: viaImage, skip: !config.adBlockRecovery.useImage },
  ].filter((t) => !t.skip);

  for (const transport of transports) {
    const pathSuffix = url.includes(config.endpoint)
      ? url.replace(config.endpoint, '')
      : url.replace(/^https?:\/\/[^/]+/, '').replace(/.*\/api\/v1\/track/, '');
    const endpoints = adBlockDetected ? AdBlockRecovery.getFallbackEndpoints(pathSuffix) : [url];

    for (const ep of endpoints) {
      try {
        const result = await transport.fn(ep, data);
        if (transport.name !== transportMethod) {
          log(`Transport: ${transportMethod} → ${transport.name}`);
          setTransportMethod(transport.name);
        }
        return result;
      } catch (e: unknown) { log(`${transport.name} → ${ep}: ${(e as Error).message}`); }
    }
  }

  if (attempt < RETRY_DELAYS.length) {
    return new Promise((r) => setTimeout(() => r(transportSend(url, data, attempt + 1)), RETRY_DELAYS[attempt]));
  }
  warn('All transports exhausted');
  return undefined;
}
