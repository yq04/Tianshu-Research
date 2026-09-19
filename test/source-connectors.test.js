/**
 * Test Suite: Source Connectors (Phase 9A, plugin side)
 * Offline, deterministic tests for OpenAlex / arXiv connectors, rate
 * limiters, response cache, and snapshot transport. No network access.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MinIntervalRateLimiter,
  CrossProcessRateLimiter,
  ageLockFile,
} from '../connectors/rate-limit.js';
import { computeRequestKey, FileCache } from '../connectors/cache.js';
import { SnapshotTransport, maskUrl, maskCredential } from '../connectors/source-snapshot.js';
import { createOpenAlexConnector, dedupeWorks } from '../connectors/openalex.js';
import { createArxivConnector, dedupeArxiv, splitArxivVersion } from '../connectors/arxiv.js';
import { runResearchQuery } from '../gateway-query.js';

describe('Phase 9A: Source Connectors', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tianshu-connectors-test-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /** Builds an injectable transport recording every call. */
  const fakeTransport = (handlers) => {
    const calls = [];
    const queue = [...handlers];
    const fn = async (url, opts = {}) => {
      calls.push({ url, opts });
      const handler = queue.length > 0 ? queue.shift() : queue[0];
      if (typeof handler === 'function') return handler(url, opts);
      const { status = 200, headers = {}, text = '' } = handler || {};
      return { status, headers, text: () => text };
    };
    fn.calls = calls;
    return fn;
  };

  const openAlexWork = (overrides = {}) => ({
    id: 'https://openalex.org/W1',
    display_name: 'A Study of PDE Solvers',
    publication_year: 2023,
    doi: 'https://doi.org/10.1000/pde-1',
    authorships: [{ author: { display_name: 'Alice' } }, { author: { display_name: 'Bob' } }],
    cited_by_count: 7,
    abstract_inverted_index: { Solvers: [0], PDE: [1] },
    best_oa_location: { pdf_url: 'https://example.org/pde.pdf', landing_page_url: 'https://example.org/pde' },
    primary_location: { landing_page_url: 'https://example.org/pde' },
    open_access: { is_oa: true, oa_url: 'https://example.org/oa' },
    locations: [
      { landing_page_url: 'https://example.org/pde', pdf_url: 'https://example.org/pde.pdf', is_oa: true, source: { display_name: 'Journal A' } },
      ...(overrides.extraLocations || []),
    ],
    ...overrides,
  });

  describe('OpenAlex connector', () => {
    it('paginates with cursor and merges pages', async () => {
      const transport = fakeTransport([
        {
          status: 200,
          headers: {},
          text: JSON.stringify({
            meta: { next_cursor: 'CURSOR2', count: 3 },
            results: [openAlexWork({ id: 'https://openalex.org/W1' })],
          }),
        },
        {
          status: 200,
          headers: {},
          text: JSON.stringify({
            meta: {},
            results: [
              openAlexWork({ id: 'https://openalex.org/W2', doi: 'https://doi.org/10.1000/pde-2' }),
            ],
          }),
        },
      ]);
      const connector = createOpenAlexConnector({ transport, apiKey: '' });
      const { records, meta } = await connector.searchWorks({ query: 'pde solvers', maxResults: 10 });

      assert.equal(meta.pages, 2);
      assert.equal(records.length, 2);
      assert.ok(transport.calls[1].url.includes('cursor=CURSOR2'));
      assert.equal(records[0].sourceId, 'openalex:W1');
      assert.equal(records[0].versions.length, 1);
      assert.equal(records[0].versions[0].pdfUrl, 'https://example.org/pde.pdf');
    });

    it('dedupes same-DOI records by merging versions (no version loss)', async () => {
      const recA = {
        sourceId: 'openalex:W1',
        doi: '10.1000/pde-1',
        title: 'A Study of PDE Solvers',
        versions: [{ landingPage: 'https://a.example/1', pdfUrl: 'https://a.example/1.pdf', isOa: true }],
      };
      const recB = {
        sourceId: 'openalex:W9',
        doi: '10.1000/pde-1',
        title: 'A Study of PDE Solvers',
        versions: [
          { landingPage: 'https://a.example/1', pdfUrl: 'https://a.example/1.pdf', isOa: true },
          { landingPage: 'https://b.example/preprint', pdfUrl: '', isOa: false },
        ],
      };
      const merged = dedupeWorks([recA, recB]);
      assert.equal(merged.length, 1);
      assert.equal(merged[0].versions.length, 2); // duplicate location skipped, new one kept
      assert.equal(merged[0].mergedDuplicates, 1);
      assert.ok(merged[0].versions.some((v) => v.landingPage === 'https://b.example/preprint'));
    });

    it('backs off on 429 honoring Retry-After and then succeeds', async () => {
      const delays = [];
      const transport = fakeTransport([
        { status: 429, headers: { 'retry-after': '0' }, text: 'slow down' },
        { status: 200, headers: {}, text: JSON.stringify({ meta: {}, results: [openAlexWork()] }) },
      ]);
      const connector = createOpenAlexConnector({
        transport,
        apiKey: '',
        delayFn: (ms) => {
          delays.push(ms);
          return Promise.resolve();
        },
      });
      const { records } = await connector.searchWorks({ query: 'pde', maxResults: 5 });
      assert.equal(records.length, 1);
      assert.equal(transport.calls.length, 2);
      assert.deepEqual(delays, [0]);
    });

    it('throws an honest error after exhausting 429 retries', async () => {
      const transport = fakeTransport([
        { status: 429, headers: {}, text: 'rate limited' },
        { status: 429, headers: {}, text: 'rate limited' },
      ]);
      const connector = createOpenAlexConnector({ transport, apiKey: '', maxRetries: 1, delayFn: () => Promise.resolve() });
      await assert.rejects(
        () => connector.searchWorks({ query: 'pde' }),
        /429.*失败|429/, // mentions the status, no fabricated data
      );
      assert.equal(transport.calls.length, 2); // initial + 1 retry, then stop
    });

    it('masks api_key in error messages and describe()', async () => {
      const secret = 'supersecretkey-98765';
      const transport = fakeTransport([{ status: 403, headers: {}, text: 'forbidden' }]);
      const connector = createOpenAlexConnector({ transport, apiKey: secret });
      await assert.rejects(() => connector.searchWorks({ query: 'pde' }), (err) => {
        assert.ok(!err.message.includes(secret), 'raw api key must never leak into errors');
        assert.ok(err.message.includes('403'));
        return true;
      });
      const desc = connector.describe();
      assert.ok(!JSON.stringify(desc).includes(secret));
      assert.equal(desc.apiKey, maskCredential(secret));
    });

    it('maskUrl masks api_key and mailto query params', () => {
      const masked = maskUrl('https://api.openalex.org/works?search=x&api_key=abcdef123456&mailto=someone@example.org');
      assert.ok(!masked.includes('abcdef123456'));
      assert.ok(!masked.includes('someone@example.org'));
      assert.ok(masked.includes('api_key=ab***56'));
    });
  });

  describe('arXiv connector', () => {
    const atomEntry = (id, title, extra = '') => `<entry>
      <id>${id}</id><title>${title}</title><published>2023-05-01T00:00:00Z</published>
      <summary>Summary of ${title}</summary><author><name>Carol</name></author>${extra}
    </entry>`;

    it('preserves arXiv version from the Atom id URL', async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">
        ${atomEntry('http://arxiv.org/abs/1706.03762v2', 'Attention Is All You Need')}
      </feed>`;
      const transport = fakeTransport([{ status: 200, headers: {}, text: xml }]);
      const connector = createArxivConnector({ transport, crossProcess: false, minIntervalMs: 0 });
      const { records } = await connector.search({ query: 'attention', maxResults: 3 });

      assert.equal(records.length, 1);
      assert.equal(records[0].arxivId, '1706.03762');
      assert.equal(records[0].version, 'v2');
      assert.deepEqual(records[0].versions, ['v2']);
      assert.equal(records[0].sourceId, 'arxiv:1706.03762');
    });

    it('merges version lists when deduplicating the same arXiv id', () => {
      const v1 = { sourceId: 'arxiv:1706.03762', title: 'Attention', arxivId: '1706.03762', version: 'v1', versions: ['v1'] };
      const v2 = { sourceId: 'arxiv:1706.03762', title: 'Attention', arxivId: '1706.03762', version: 'v2', versions: ['v2'] };
      const merged = dedupeArxiv([v1, v2]);
      assert.equal(merged.length, 1);
      assert.deepEqual(merged[0].versions, ['v1', 'v2']);
      assert.equal(merged[0].version, 'v2');
    });

    it('stops pagination when the feed is exhausted', async () => {
      const xml = `<?xml version="1.0"?><feed>${atomEntry('http://arxiv.org/abs/2401.00001v1', 'Solo entry')}</feed>`;
      const transport = fakeTransport([{ status: 200, headers: {}, text: xml }]);
      const connector = createArxivConnector({ transport, crossProcess: false, minIntervalMs: 0 });
      const { records, meta } = await connector.search({ query: 'rare topic', maxResults: 10 });
      assert.equal(meta.pages, 1);
      assert.equal(records.length, 1);
      assert.equal(transport.calls.length, 1);
    });

    it('routes every request through the rate limiter', async () => {
      const xml = `<?xml version="1.0"?><feed>${atomEntry('http://arxiv.org/abs/2401.00001v1', 'T')}</feed></xml>`.replace('</feed></xml>', '</feed>');
      let scheduled = 0;
      const limiter = {
        schedule: async (fn) => {
          scheduled += 1;
          return fn();
        },
      };
      const transport = fakeTransport([{ status: 200, headers: {}, text: xml }]);
      const connector = createArxivConnector({ transport, rateLimiter: limiter });
      await connector.lookup('2401.00001');
      assert.equal(scheduled, 1);
    });
  });

  describe('CrossProcessRateLimiter', () => {
    it('enforces the min interval across sequential acquisitions', async () => {
      const lockDir = join(tempDir, 'locks');
      const limiter = new CrossProcessRateLimiter({ name: 'arxiv-api', minIntervalMs: 80, lockDir, pollMs: 5 });
      const stamps = [];
      for (let i = 0; i < 3; i++) {
        await limiter.schedule(async () => stamps.push(Date.now()));
      }
      assert.equal(stamps.length, 3);
      assert.ok(stamps[1] - stamps[0] >= 70, `gap1=${stamps[1] - stamps[0]}`);
      assert.ok(stamps[2] - stamps[1] >= 70, `gap2=${stamps[2] - stamps[1]}`);
    });

    it('takes over a stale lock left by a crashed holder', async () => {
      const lockDir = join(tempDir, 'locks-stale');
      mkdirSync(lockDir, { recursive: true });
      const limiter = new CrossProcessRateLimiter({
        name: 'arxiv-api',
        minIntervalMs: 0,
        lockDir,
        staleMs: 1000,
        pollMs: 5,
      });
      // Simulate a crashed holder: a lock file older than staleMs.
      writeFileSync(join(lockDir, 'arxiv-api.lock'), JSON.stringify({ holder: 'dead-pid' }), 'utf8');
      ageLockFile(lockDir, 'arxiv-api', 60_000);

      let ran = false;
      await limiter.schedule(async () => {
        ran = true;
      });
      assert.equal(ran, true);
      assert.ok(!existsSync(join(lockDir, 'arxiv-api.lock')), 'lock must be released after the call');
    });

    it('MinIntervalRateLimiter serializes and spaces calls in-process', async () => {
      const limiter = new MinIntervalRateLimiter({ minIntervalMs: 30 });
      const stamps = [];
      const p1 = limiter.schedule(async () => stamps.push(Date.now()));
      const p2 = limiter.schedule(async () => stamps.push(Date.now()));
      await Promise.all([p1, p2]);
      assert.equal(stamps.length, 2);
      assert.ok(stamps[1] - stamps[0] >= 25, `gap=${stamps[1] - stamps[0]}`);
    });
  });

  describe('Snapshot transport & cache', () => {
    it('record mode persists responses and replay mode serves them byte-stable', async () => {
      const snapshotDir = join(tempDir, 'snapshots');
      const recorder = new SnapshotTransport({
        mode: 'record',
        snapshotDir,
        fetchImpl: async () => ({ status: 200, headers: { 'x-test': '1' }, text: () => '<feed>ok</feed>' }),
      });
      const url = 'https://api.openalex.org/works?search=pde';
      const recorded = await recorder.fetch(url);
      assert.equal(recorded.text, '<feed>ok</feed>');

      const replayer = new SnapshotTransport({ mode: 'replay', snapshotDir });
      const replayed = await replayer.fetch(url);
      assert.equal(replayed.text, '<feed>ok</feed>');
      assert.equal(replayed.status, 200);

      // A request never recorded must fail honestly, never fabricate.
      await assert.rejects(() => replayer.fetch('https://api.openalex.org/works?search=other'), /SNAPSHOT_MISS/);
    });

    it('FileCache keys requests deterministically by method + url', () => {
      const cache = new FileCache({ dir: join(tempDir, 'cache') });
      const key = computeRequestKey('GET', 'https://example.org/a?b=1');
      assert.equal(key, computeRequestKey('GET', 'https://example.org/a?b=1'));
      assert.notEqual(key, computeRequestKey('POST', 'https://example.org/a?b=1'));
      assert.equal(cache.get(key), null);
      cache.put(key, { status: 200, text: 'hello' });
      assert.equal(cache.get(key).value.text, 'hello');
      assert.deepEqual(cache.listKeys(), [key]);
      assert.equal(cache.delete(key), true);
      assert.equal(cache.get(key), null);
    });

    it('splitArxivVersion splits canonical id and version suffix', () => {
      assert.deepEqual(splitArxivVersion('http://arxiv.org/abs/1706.03762v3'), { id: '1706.03762', version: 'v3' });
      assert.deepEqual(splitArxivVersion('http://arxiv.org/abs/1706.03762'), { id: '1706.03762', version: null });
      assert.deepEqual(splitArxivVersion('http://arxiv.org/abs/cs/0112017v2'), { id: 'cs/0112017', version: 'v2' });
    });

    it('gateway search_sources replays offline from recorded snapshots', async () => {
      const snapshotDir = join(tempDir, 'gateway-snapshots');
      const pageBody = JSON.stringify({ meta: {}, results: [openAlexWork()] });

      // Record the exact URL the connector will request.
      const connectorUrlTransport = new SnapshotTransport({
        mode: 'record',
        snapshotDir,
        fetchImpl: async (url) => ({ status: 200, headers: {}, text: () => pageBody }),
      });
      const probe = createOpenAlexConnector({ transport: connectorUrlTransport, apiKey: '' });
      await probe.searchWorks({ query: 'pde', maxResults: 5 });

      // Offline replay through the public gateway: zero network, real records.
      const res = await runResearchQuery(
        { action: 'search_sources', source: 'openalex', query: 'pde', maxResults: 5, mode: 'replay', snapshotDir, cwd: tempDir },
        () => {
          throw new Error('NETWORK ACCESS DENIED IN REPLAY MODE');
        },
      );
      assert.equal(res.isError, undefined, res.content);
      assert.ok(res.content.includes('检索完成'));
      assert.ok(res.content.includes('A Study of PDE Solvers'));

      // Replay of an unrecorded query must fail honestly (no fabricated data).
      const miss = await runResearchQuery(
        { action: 'search_sources', source: 'openalex', query: 'never-recorded', maxResults: 5, mode: 'replay', snapshotDir, cwd: tempDir },
        () => {
          throw new Error('NETWORK ACCESS DENIED IN REPLAY MODE');
        },
      );
      assert.equal(miss.isError, true);
      assert.ok(miss.content.includes('SNAPSHOT_MISS'));
    });

    it('gateway search_sources requires snapshotDir for non-live modes', async () => {
      const res = await runResearchQuery(
        { action: 'search_sources', source: 'openalex', query: 'pde', mode: 'replay' },
        async () => {
          throw new Error('should not be called');
        },
      );
      assert.equal(res.isError, true);
      assert.ok(res.content.includes('snapshotDir'));
    });
  });
});
