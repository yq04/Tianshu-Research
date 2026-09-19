/**
 * OpenAlex Connector for tianshu-research (Phase 9A).
 *
 * Implements cursor pagination, deduplication that MERGES versions instead of
 * dropping them (same DOI in two records -> one record with union of
 * locations, never data loss), Retry-After-aware 429/503 backoff, and
 * credential masking (api_key / mailto never appear unmasked in errors).
 *
 * Transport is injected: SnapshotTransport (live/record/replay) or any
 * fetch-like function. No global state.
 */

import { asTransport, maskUrl, maskCredential } from './source-snapshot.js';
import { mapOpenAlexWork, cleanDoi, reconstructInvertedAbstract } from '../search.js';

const OPENALEX_ENDPOINT = 'https://api.openalex.org/works';
const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 200;
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 100;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);

export function maskApiKey(key) {
  return maskCredential(key);
}

function safeDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function parseRetryAfter(headerValue, fallbackMs) {
  if (!headerValue) return fallbackMs;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const asDate = Date.parse(headerValue);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return fallbackMs;
}

/**
 * Deduplicates works by canonical identity, MERGING location versions so that
 * the same DOI appearing in multiple records keeps every version.
 */
export function dedupeWorks(records) {
  const byKey = new Map();
  const out = [];
  for (const rec of records) {
    const key = (rec.doi && `doi:${String(rec.doi).toLowerCase()}`) || rec.sourceId || `title:${String(rec.title).toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, rec);
      out.push(rec);
      continue;
    }
    // Merge versions: union by landing/pdf signature, keep record order stable.
    const seen = new Set((existing.versions || []).map((v) => `${v.landingPage || ''}|${v.pdfUrl || ''}|${v.isOa ? 1 : 0}`));
    for (const v of rec.versions || []) {
      const sig = `${v.landingPage || ''}|${v.pdfUrl || ''}|${v.isOa ? 1 : 0}`;
      if (!seen.has(sig)) {
        seen.add(sig);
        existing.versions.push(v);
      }
    }
    existing.mergedDuplicates = (existing.mergedDuplicates || 0) + 1;
    if (!existing.abstract && rec.abstract) existing.abstract = rec.abstract;
  }
  return out;
}

/**
 * Extracts all location variants of a work as a stable versions array.
 */
export function extractVersions(work) {
  const locations = Array.isArray(work?.locations) ? work.locations : [];
  const versions = [];
  const seen = new Set();
  for (const loc of locations) {
    if (!loc || typeof loc !== 'object') continue;
    const landingPage = typeof loc.landing_page_url === 'string' ? loc.landing_page_url : '';
    const pdfUrl = typeof loc.pdf_url === 'string' ? loc.pdf_url : '';
    const sig = `${landingPage}|${pdfUrl}|${loc.is_oa ? 1 : 0}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    versions.push({
      landingPage,
      pdfUrl,
      isOa: loc.is_oa === true,
      source: loc?.source?.display_name || '',
      license: loc.license || '',
    });
  }
  return versions;
}

export function createOpenAlexConnector({
  transport,
  mailto = 'tianshu-research@users.noreply.github.com',
  apiKey = process.env.OPENALEX_API_KEY?.trim() || '',
  maxRetries = DEFAULT_MAX_RETRIES,
  perPage = DEFAULT_PER_PAGE,
  delayFn = safeDelay,
} = {}) {
  const t = asTransport(transport);
  const effectivePerPage = Math.min(MAX_PER_PAGE, Math.max(1, Number(perPage) || DEFAULT_PER_PAGE));

  function buildUrl({ path = '', params = {} } = {}) {
    const url = new URL(`${OPENALEX_ENDPOINT}${path}`);
    url.searchParams.set('mailto', mailto);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    if (apiKey) url.searchParams.set('api_key', apiKey);
    return url.toString();
  }

  /**
   * Performs one GET with honest retry/backoff on 429/503-class responses.
   * Honors Retry-After when present; otherwise exponential base backoff.
   */
  async function requestJson(url) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await t.fetch(url, { method: 'GET' });
      if (res.status >= 200 && res.status < 300) {
        try {
          return JSON.parse(res.text);
        } catch {
          throw new Error(`OpenAlex 返回了非 JSON（${maskUrl(url)}）`);
        }
      }
      if (!RETRYABLE_STATUSES.has(res.status)) {
        throw new Error(`OpenAlex HTTP ${res.status}（${maskUrl(url)}）：${res.text.slice(0, 180)}`);
      }
      lastError = new Error(
        `OpenAlex HTTP ${res.status}（${maskUrl(url)}）在 ${maxRetries + 1} 次尝试后仍然失败；请稍后重试或配置专用 API 凭据`,
      );
      if (attempt < maxRetries) {
        const fallbackMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
        const waitMs = res.status === 429 || res.status === 503
          ? parseRetryAfter(res.headers['retry-after'], fallbackMs)
          : fallbackMs;
        await delayFn(waitMs);
      }
    }
    throw lastError;
  }

  function toSourceRecord(work) {
    const base = mapOpenAlexWork(work);
    if (!base) return null;
    const id = typeof work?.id === 'string' ? work.id.replace(/^https?:\/\/openalex\.org\//i, '') : '';
    return {
      sourceId: id ? `openalex:${id}` : '',
      ...base,
      versions: extractVersions(work),
    };
  }

  return {
    source: 'openalex',

    /** Non-sensitive connector description for diagnostics. */
    describe() {
      return {
        endpoint: OPENALEX_ENDPOINT,
        mailto: maskUrl(`?mailto=${mailto}`).split('=')[1] || '***',
        apiKey: apiKey ? maskCredential(apiKey) : '(none)',
        perPage: effectivePerPage,
        maxRetries,
      };
    },

    /**
     * Cursor-paginated works search with dedup + version merge.
     * @returns {Promise<{ records: Array, meta: { pages, rawCount, cursor } }>}
     */
    async searchWorks({ query, maxResults = 25, filter = '', select } = {}) {
      const q = String(query ?? '').trim();
      if (!q) throw new Error('OpenAlex search requires a query');
      const want = Math.max(1, Math.floor(Number(maxResults) || 25));

      const collected = [];
      let cursor = '*';
      let pages = 0;
      let rawCount = 0;

      while (collected.length < want) {
        const params = {
          search: q,
          filter: filter ? `is_oa:true,${filter}` : 'is_oa:true',
          'per-page': effectivePerPage,
          cursor,
        };
        if (select) params.select = select;
        const url = buildUrl({ params });
        const data = await requestJson(url);
        pages += 1;

        const results = Array.isArray(data?.results) ? data.results : [];
        rawCount += results.length;
        for (const work of results) {
          const rec = toSourceRecord(work);
          if (rec) collected.push(rec);
        }

        const nextCursor = data?.meta?.next_cursor;
        if (!nextCursor || results.length === 0) break;
        cursor = nextCursor;
      }

      const deduped = dedupeWorks(collected).slice(0, want);
      return { records: deduped, meta: { pages, rawCount, cursor: cursor === '*' ? '' : cursor } };
    },

    /** Single-work lookup by DOI. */
    async lookupDoi(doi) {
      const clean = cleanDoi(String(doi ?? '').replace(/^https?:\/\/doi\.org\//i, ''));
      if (!/^10\.\d{4,}\/\S+$/.test(clean)) {
        throw new Error(`不像 DOI：${maskUrl(String(doi ?? ''))}`);
      }
      const url = buildUrl({ path: `/doi:${clean}` });
      const work = await requestJson(url);
      return toSourceRecord(work);
    },

    /**
     * Reconstructs an abstract from an inverted index without importing the
     * heavy path (delegates to the shared implementation).
     */
    _reconstructAbstract: reconstructInvertedAbstract,
  };
}
