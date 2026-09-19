/**
 * arXiv Connector for tianshu-research (Phase 9A).
 *
 * Implements start-offset pagination, version preservation (the Atom feed id
 * carries vN; records keep the unversioned canonical id plus the observed
 * version), deduplication by canonical id, and the mandatory cross-process
 * rate limit (arXiv API terms: at most one request every three seconds per
 * machine, shared across all processes).
 *
 * Transport and rate limiter are injectable for offline deterministic tests.
 */

import { asTransport } from './source-snapshot.js';
import { CrossProcessRateLimiter, MinIntervalRateLimiter } from './rate-limit.js';
import { parseArxivAtom, cleanDoi } from '../search.js';

const ARXIV_ENDPOINT = 'https://export.arxiv.org/api/query';
const ARXIV_PAGE_SIZE = 100; // arXiv caps max_results per request

/**
 * Extracts the canonical id and version suffix from an arXiv id URL.
 */
export function splitArxivVersion(idUrl) {
  const m = String(idUrl ?? '').match(/arxiv\.org\/(?:abs|pdf|html|e-print)\/([^\s?#]+?)(v(\d+))?$/i);
  if (!m) return { id: '', version: null };
  return { id: m[1], version: m[3] ? `v${m[3]}` : null };
}

function toSourceRecord(entry) {
  const { id, version } = splitArxivVersion(entry.landingUrl);
  return {
    sourceId: id ? `arxiv:${id}` : '',
    ...entry,
    arxivId: id || entry.arxivId,
    version,
    versions: version ? [version] : [],
    cleanDoi: entry.doi ? cleanDoi(entry.doi) : '',
  };
}

/**
 * Dedupes entries by canonical arXiv id, merging version lists (an older
 * listing showing v1 and a newer one showing v2 collapse into one record
 * that preserves both).
 */
export function dedupeArxiv(records) {
  const byId = new Map();
  const out = [];
  for (const rec of records) {
    const key = rec.sourceId || `title:${String(rec.title).toLowerCase()}`;
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, rec);
      out.push(rec);
      continue;
    }
    for (const v of rec.versions || []) {
      if (!existing.versions.includes(v)) existing.versions.push(v);
    }
    if (existing.version && !existing.versions.includes(existing.version)) {
      existing.versions.push(existing.version);
    }
    existing.version = latestVersion(existing.versions);
    existing.mergedDuplicates = (existing.mergedDuplicates || 0) + 1;
  }
  return out;
}

function latestVersion(versions) {
  const nums = (versions || [])
    .map((v) => Number(String(v).replace(/^v/i, '')))
    .filter(Number.isFinite);
  if (nums.length === 0) return null;
  return `v${Math.max(...nums)}`;
}

export function createArxivConnector({
  transport,
  rateLimiter,
  lockDir,
  minIntervalMs = 3000,
  crossProcess = true,
  maxRetries = 2,
  delayFn = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms))),
} = {}) {
  const t = asTransport(transport);

  // Explicit limiter wins; otherwise default: cross-process when a lock dir is
  // available, in-process fallback when the caller disables it (tests).
  const limiter = rateLimiter
    || (crossProcess
      ? new CrossProcessRateLimiter({ name: 'arxiv-api', minIntervalMs, lockDir })
      : new MinIntervalRateLimiter({ minIntervalMs }));

  /**
   * One rate-limited GET with bounded retry on transient 5xx; 4xx-class
   * responses surface immediately as honest errors.
   */
  async function requestXml(url) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await limiter.schedule(() => t.fetch(url, { method: 'GET' }));
      if (res.status >= 200 && res.status < 300) return res.text;
      if (res.status < 500) {
        throw new Error(`arXiv HTTP ${res.status}（${url}）：${res.text.slice(0, 180)}`);
      }
      lastError = new Error(`arXiv HTTP ${res.status} 在 ${maxRetries + 1} 次尝试后仍失败（${url}）`);
      if (attempt < maxRetries) await delayFn(100 * Math.pow(2, attempt));
    }
    throw lastError;
  }

  return {
    source: 'arxiv',

    describe() {
      return {
        endpoint: ARXIV_ENDPOINT,
        minIntervalMs,
        crossProcess: limiter instanceof CrossProcessRateLimiter,
      };
    },

    /**
     * Paginated search: fetches successive start offsets until maxResults are
     * collected or the feed is exhausted. Every page passes through the
     * shared rate limiter (cross-process by default).
     */
    async search({ query, maxResults = 25 } = {}) {
      const q = String(query ?? '').trim();
      if (!q) throw new Error('arXiv search requires a query');
      const want = Math.max(1, Math.floor(Number(maxResults) || 25));

      const collected = [];
      let start = 0;
      let pages = 0;
      while (collected.length < want) {
        const pageSize = Math.min(ARXIV_PAGE_SIZE, want - collected.length);
        const url = `${ARXIV_ENDPOINT}?search_query=${encodeURIComponent(`all:${q}`)}&start=${start}&max_results=${pageSize}`;
        const xml = await requestXml(url);
        const entries = parseArxivAtom(xml);
        pages += 1;

        for (const entry of entries) collected.push(toSourceRecord(entry));
        if (entries.length < pageSize) break; // feed exhausted
        start += pageSize;
      }

      return { records: dedupeArxiv(collected).slice(0, want), meta: { pages, start } };
    },

    /** Single-paper lookup by arXiv id (version ignored for lookup). */
    async lookup(arxivId) {
      const id = String(arxivId ?? '').replace(/^arxiv:/i, '').replace(/v\d+$/i, '').trim();
      if (!id) throw new Error('arXiv lookup requires an id');
      const url = `${ARXIV_ENDPOINT}?id_list=${encodeURIComponent(id)}`;
      const xml = await requestXml(url);
      const entries = parseArxivAtom(xml).map(toSourceRecord);
      return entries[0] ?? null;
    },
  };
}
