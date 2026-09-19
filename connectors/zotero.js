/**
 * Zotero Web API v3 Client for tianshu-research (Phase 9A).
 *
 * Implements honest, conflict-safe library writes:
 *  - Conditional writes: PATCH carries `If-Unmodified-Since-Version`; a stale
 *    write fails with `ZoteroConflictError` (HTTP 412) carrying the server
 *    version — the client NEVER overwrites a concurrent edit silently.
 *  - Deduplication: createItem refuses to write when an item with the same
 *    DOI / arXiv id already exists (returns { status: 'duplicate' }).
 *  - Attachment scope: attachment operations fail closed unless the target
 *    collection is inside the explicitly declared allowedCollections.
 *  - Backoff: 429 honors the Zotero `Backoff` / `Retry-After` headers.
 *
 * The API key travels only in the Authorization header and is masked in all
 * diagnostics. Transport is injectable; offline tests use fixtures only.
 */

import { asTransport, maskCredential } from './source-snapshot.js';

const ZOTERO_API_BASE = 'https://api.zotero.org';
const API_VERSION = '3';
const DEFAULT_PAGE_SIZE = 25;

export class ZoteroError extends Error {
  constructor(message, { status = 0, itemKey, serverVersion } = {}) {
    super(message);
    this.name = 'ZoteroError';
    this.status = status;
    this.itemKey = itemKey;
    this.serverVersion = serverVersion;
  }
}

export class ZoteroConflictError extends ZoteroError {
  constructor(message, { itemKey, serverVersion } = {}) {
    super(message, { status: 412, itemKey, serverVersion });
    this.name = 'ZoteroConflictError';
  }
}

export class ZoteroScopeError extends ZoteroError {
  constructor(message) {
    super(message, { status: 0 });
    this.name = 'ZoteroScopeError';
  }
}

function safeDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function parseBackoffMs(headers, fallbackMs) {
  const raw = headers['backoff'] ?? headers['retry-after'];
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const asDate = raw ? Date.parse(raw) : NaN;
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return fallbackMs;
}

/**
 * Fails closed unless targetCollection is explicitly within allowedCollections.
 */
export function assertAttachmentScope({ targetCollection, allowedCollections }) {
  const allowed = Array.isArray(allowedCollections) ? allowedCollections.map(String) : [];
  if (allowed.length === 0 || !targetCollection || !allowed.includes(String(targetCollection))) {
    throw new ZoteroScopeError(
      `附件写入被拒绝：目标 collection「${targetCollection || '(none)'}」不在声明的作用域内 ` +
        `（allowedCollections: [${allowed.join(', ')}]）。附件操作必须在显式作用域内执行。`,
    );
  }
  return true;
}

export function createZoteroClient({
  transport,
  userId,
  libraryType = 'users', // 'users' | 'groups'
  apiKey = process.env.ZOTERO_API_KEY?.trim() || '',
  apiBaseUrl = ZOTERO_API_BASE,
  maxRetries = 3,
  pageSize = DEFAULT_PAGE_SIZE,
  delayFn = safeDelay,
} = {}) {
  if (!userId) throw new Error('Zotero client requires userId (or groupId with libraryType="groups")');
  const t = asTransport(transport);
  const effectivePageSize = Math.min(100, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE));

  function libraryPath() {
    return `/${libraryType}/${encodeURIComponent(userId)}`;
  }

  function buildUrl(path, params = {}) {
    const url = new URL(`${apiBaseUrl}${libraryPath()}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  function authHeaders(extra = {}) {
    const headers = { 'Zotero-API-Version': API_VERSION, ...extra };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }

  /**
   * One HTTP request with bounded backoff on 429/5xx. Non-retryable failures
   * throw ZoteroError immediately; nothing is ever silently dropped.
   */
  async function request(method, path, { params = {}, body, headers = {} } = {}) {
    const url = buildUrl(path, params);
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await t.fetch(url, {
        method,
        headers: authHeaders(headers),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      if (res.status === 412) {
        let serverVersion;
        try {
          serverVersion = JSON.parse(res.text)?.version;
        } catch {
          serverVersion = undefined;
        }
        return { conflict: true, status: 412, serverVersion, text: res.text };
      }

      if (res.status >= 200 && res.status < 300) {
        return { conflict: false, status: res.status, headers: res.headers, text: res.text };
      }

      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        lastError = new ZoteroError(
          `Zotero HTTP ${res.status}（${path}）在 ${maxRetries + 1} 次尝试后仍失败`,
          { status: res.status },
        );
        await delayFn(parseBackoffMs(res.headers, 100 * Math.pow(2, attempt)));
        continue;
      }

      throw new ZoteroError(
        `Zotero HTTP ${res.status}（${path}）：${res.text.slice(0, 180)}`,
        { status: res.status },
      );
    }
    throw lastError;
  }

  function parseItems(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ZoteroError('Zotero 返回了非 JSON 响应');
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items
      .filter((it) => it && typeof it === 'object' && it.data)
      .map((it) => ({
        key: it.key,
        version: it.version,
        library: it.library || undefined,
        data: it.data,
      }));
  }

  function identifierOf(item) {
    const data = item?.data || {};
    const doi = String(data.DOI || data.doi || '').trim().toLowerCase();
    const archiveId = String(data.archiveID || data.archiveId || '').trim();
    const arxivMatch = archiveId.match(/arxiv[:\s]*([^\s]+)/i)
      || String(data.url || '').match(/arxiv\.org\/abs\/([^\s?#]+)/i);
    const urlMatch = String(data.url || '').match(/arxiv\.org\/abs\/([^\s?#\/]+)/i);
    return { doi, arxivId: (arxivMatch?.[1] || urlMatch?.[1] || '').replace(/v\d+$/i, '').toLowerCase() };
  }

  const api = {
    library: 'zotero',

    describe() {
      return {
        apiBase: apiBaseUrl,
        libraryPath: libraryPath(),
        apiKey: apiKey ? maskCredential(apiKey) : '(none)',
        apiVersion: API_VERSION,
      };
    },

    /**
     * Lists items with start-offset pagination.
     */
    async listItems({ collectionKey, maxItems = 100 } = {}) {
      const path = collectionKey ? `/collections/${encodeURIComponent(collectionKey)}/items` : '/items';
      const collected = [];
      let start = 0;
      while (collected.length < maxItems) {
        const limit = Math.min(effectivePageSize, maxItems - collected.length);
        const res = await request('GET', path, { params: { format: 'json', start, limit } });
        const page = parseItems(res.text);
        collected.push(...page);
        if (page.length < limit) break;
        start += limit;
      }
      return collected;
    },

    /**
     * Finds an existing item by DOI or arXiv id (deduplication scan).
     */
    async findByIdentifier({ doi, arxivId } = {}) {
      const wantDoi = String(doi ?? '').trim().toLowerCase();
      const wantArxiv = String(arxivId ?? '').trim().toLowerCase().replace(/v\d+$/i, '');
      if (!wantDoi && !wantArxiv) return null;
      const items = await api.listItems({ maxItems: 500 });
      for (const item of items) {
        const ids = identifierOf(item);
        if (wantDoi && ids.doi === wantDoi) return item;
        if (wantArxiv && ids.arxivId && ids.arxivId === wantArxiv) return item;
      }
      return null;
    },

    /**
     * Creates an item unless an identical identifier already exists.
     * Honest dedup: duplicate => { status: 'duplicate' } with NO write.
     */
    async createItem(itemData, { dedupe = true, collectionKey } = {}) {
      const data = { ...itemData };
      if (collectionKey && Array.isArray(data.collections)) {
        data.collections = [...new Set([...data.collections, collectionKey])];
      } else if (collectionKey) {
        data.collections = [collectionKey];
      }

      if (dedupe) {
        const existing = await api.findByIdentifier({ doi: data.DOI, arxivId: data.url || data.archiveID });
        if (existing) {
          return { status: 'duplicate', created: false, item: existing };
        }
      }

      const res = await request('POST', '/items', { body: [data], headers: { 'Content-Type': 'application/json' } });
      if (res.status !== 200 && res.status !== 201) {
        throw new ZoteroError(`Zotero createItem 意外状态 ${res.status}`, { status: res.status });
      }
      const created = parseItems(res.text)[0];
      if (!created) throw new ZoteroError('Zotero createItem 未返回成功对象', { status: res.status });
      return { status: 'created', created: true, item: created };
    },

    /**
     * Conditionally updates an item. Stale versions fail with
     * ZoteroConflictError carrying the server version — never overwrite.
     */
    async updateItem(itemKey, patch, { expectedVersion } = {}) {
      if (!itemKey) throw new ZoteroError('updateItem requires itemKey');
      if (!Number.isFinite(Number(expectedVersion))) {
        throw new ZoteroError('updateItem requires expectedVersion (read the item first)');
      }
      const res = await request('PATCH', `/items/${encodeURIComponent(itemKey)}`, {
        body: patch,
        headers: {
          'Content-Type': 'application/json',
          'If-Unmodified-Since-Version': String(expectedVersion),
        },
      });
      if (res.conflict) {
        throw new ZoteroConflictError(
          `Zotero 条件写入冲突（412）：条目 ${itemKey} 在读取后被并发修改 ` +
            `（本地期望版本 ${expectedVersion}，服务器版本 ${res.serverVersion ?? '未知'}）。` +
            '未执行覆盖；请重新读取后重试。',
          { itemKey, serverVersion: res.serverVersion },
        );
      }
      return { status: 'updated', itemKey };
    },

    /**
     * Creates a linked-URL attachment after enforcing the declared
     * attachment scope. Fail-closed: out-of-scope targets are refused
     * before any network write.
     */
    async createLinkAttachment({ parentItemKey, title, url, targetCollection, allowedCollections } = {}) {
      assertAttachmentScope({ targetCollection, allowedCollections });
      const attachmentData = {
        itemType: 'attachment',
        linkMode: 'linked_url',
        title: String(title || 'Linked attachment'),
        url: String(url || ''),
        parentItem: parentItemKey || undefined,
        collections: targetCollection ? [targetCollection] : [],
      };
      const res = await request('POST', '/items', { body: [attachmentData], headers: { 'Content-Type': 'application/json' } });
      const created = parseItems(res.text)[0];
      if (!created) throw new ZoteroError('Zotero 附件创建未返回成功对象', { status: res.status });
      return { status: 'created', item: created };
    },
  };

  return api;
}
