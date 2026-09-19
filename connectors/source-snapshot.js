/**
 * Snapshot Transport for tianshu-research connectors (Phase 9A).
 *
 * Normalized HTTP transport with three modes:
 *   - 'live'    : real network fetch, no persistence.
 *   - 'record'  : real network fetch + persist responses into a snapshot dir
 *                 (fixtures can then be committed for offline tests).
 *   - 'replay'  : serve exclusively from snapshots; a missing request raises
 *                 SNAPSHOT_MISS instead of fabricating data. No network ever.
 *
 * Responses are normalized to { status, headers, text } so connectors stay
 * transport-agnostic (fetch impl, snapshot fixtures, or test doubles).
 * Credential-bearing URLs (api_key / mailto) are masked in all error output.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeRequestKey, FileCache } from './cache.js';

const DEFAULT_FETCH_MS = 12_000;

/**
 * Masks credential query parameters in a URL for safe display/logging.
 */
export function maskUrl(rawUrl) {
  let url = String(rawUrl ?? '');
  if (!url) return '';
  const safeDecode = (v) => {
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  url = url.replace(/([?&]api_key=)([^&]+)/gi, (_m, p1, p2) => `${p1}${maskCredential(safeDecode(p2))}`);
  url = url.replace(/([?&]mailto=)([^&]+)/gi, (_m, p1) => `${p1}***`);
  return url;
}

/**
 * Masks a credential: keeps first/last 2 chars for long values, otherwise
 * fully masks. Never emits the full value.
 */
export function maskCredential(value) {
  const s = String(value ?? '');
  if (!s) return '';
  if (s.length <= 8) return '***';
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}

function normalizeResponse(status, headers, text) {
  return Object.freeze({
    status: Number(status) || 0,
    headers: headers && typeof headers === 'object' ? headers : {},
    text: String(text ?? ''),
  });
}

export class SnapshotTransport {
  /**
   * @param {object} options
   * @param {'live'|'record'|'replay'} [options.mode]
   * @param {string} options.snapshotDir - directory for fixture files (required for record/replay)
   * @param {Function} [options.fetchImpl] - injectable fetch (default global fetch)
   * @param {number} [options.timeoutMs]
   */
  constructor({ mode = 'live', snapshotDir, fetchImpl, timeoutMs = DEFAULT_FETCH_MS } = {}) {
    if (!['live', 'record', 'replay'].includes(mode)) {
      throw new Error(`Invalid snapshot transport mode "${mode}"`);
    }
    if (mode !== 'live' && !snapshotDir) {
      throw new Error(`Snapshot transport mode "${mode}" requires snapshotDir`);
    }
    this.mode = mode;
    this.snapshotDir = snapshotDir ? resolve(snapshotDir) : undefined;
    this.fetchImpl = fetchImpl || globalThis.fetch;
    this.timeoutMs = timeoutMs;
    this.cache = snapshotDir ? new FileCache({ dir: snapshotDir }) : null;
    this.misses = [];
  }

  ensureDir() {
    if (this.snapshotDir && !existsSync(this.snapshotDir)) {
      mkdirSync(this.snapshotDir, { recursive: true });
    }
  }

  /**
   * Performs a request and returns a normalized response.
   * @returns {Promise<{status:number, headers:object, text:string}>}
   */
  async fetch(url, { method = 'GET', headers = {} } = {}) {
    const key = computeRequestKey(method, url);

    if (this.mode === 'replay') {
      const entry = this.cache?.get(key);
      if (!entry || !entry.value) {
        this.misses.push(maskUrl(url));
        throw new Error(
          `SNAPSHOT_MISS: no recorded response for ${method} ${maskUrl(url)} (key ${key}). ` +
            'Replay mode never fabricates data; record the snapshot first or switch to live mode.',
        );
      }
      return normalizeResponse(entry.value.status, entry.value.headers, entry.value.text);
    }

    const response = await this.doNetworkFetch(url, { method, headers });

    if (this.mode === 'record') {
      this.ensureDir();
      this.cache.put(key, {
        status: response.status,
        headers: response.headers,
        text: response.text,
      });
    }
    return response;
  }

  async doNetworkFetch(url, { method = 'GET', headers = {} }) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method,
        signal: ctrl.signal,
        headers: { Accept: 'application/atom+xml, application/json, */*', ...headers },
      });
      const text = await res.text();
      const headerObj = {};
      if (res.headers && typeof res.headers.forEach === 'function') {
        res.headers.forEach((v, k) => {
          headerObj[k] = v;
        });
      }
      return normalizeResponse(res.status, headerObj, text);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Wraps any transport so connectors can treat it uniformly: accepts either a
 * SnapshotTransport instance or a bare fetch-like function.
 */
export function asTransport(transportOrFetch) {
  if (transportOrFetch && typeof transportOrFetch.fetch === 'function') {
    return transportOrFetch;
  }
  if (typeof transportOrFetch === 'function') {
    return {
      async fetch(url, options = {}) {
        const res = await transportOrFetch(url, options);
        const text = typeof res === 'string' ? res : await res.text();
        const headerObj = {};
        if (res && res.headers && typeof res.headers.forEach === 'function') {
          res.headers.forEach((v, k) => {
            headerObj[k] = v;
          });
        } else if (res && res.headers && typeof res.headers === 'object') {
          Object.assign(headerObj, res.headers);
        }
        return normalizeResponse(res.status ?? 200, headerObj, text);
      },
    };
  }
  throw new Error('Transport must be a SnapshotTransport or a fetch-like function');
}
