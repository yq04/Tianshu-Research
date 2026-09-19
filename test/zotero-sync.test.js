/**
 * Test Suite: Zotero Sync (Phase 9A, plugin side)
 * Offline, deterministic tests for the Zotero Web API v3 client:
 * pagination, identifier dedup, conditional writes (412), attachment scope,
 * backoff, and credential masking. No network access, no library writes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createZoteroClient,
  ZoteroConflictError,
  ZoteroScopeError,
  assertAttachmentScope,
} from '../connectors/zotero.js';

describe('Phase 9A: Zotero Sync', () => {
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

  const zoteroItem = (key, version, data) => ({ key, version, data });

  const makeClient = (transport, overrides = {}) =>
    createZoteroClient({
      transport,
      userId: '12345',
      apiKey: 'zotero-secret-key-abcdef',
      ...overrides,
    });

  it('lists items with start-offset pagination', async () => {
    const page1 = [zoteroItem('A1', 1, { itemType: 'journalArticle', title: 'One', DOI: '10.1/a' }), zoteroItem('A2', 1, { itemType: 'journalArticle', title: 'Two' })];
    const page2 = [zoteroItem('A3', 1, { itemType: 'preprint', title: 'Three' })];
    const transport = fakeTransport([
      { status: 200, headers: {}, text: JSON.stringify(page1) },
      { status: 200, headers: {}, text: JSON.stringify(page2) },
    ]);
    const client = makeClient(transport, { pageSize: 2 });
    const items = await client.listItems({ maxItems: 3 });

    assert.equal(items.length, 3);
    assert.equal(items[0].key, 'A1');
    assert.ok(transport.calls[0].url.includes('start=0'));
    assert.ok(transport.calls[1].url.includes('start=2'));
    assert.ok(transport.calls[0].url.includes('/users/12345/items'));
    assert.ok(transport.calls[0].opts.headers.Authorization.startsWith('Bearer zotero-secret'));
  });

  it('lists items within a collection scope', async () => {
    const transport = fakeTransport([
      { status: 200, headers: {}, text: JSON.stringify([zoteroItem('C1', 1, { itemType: 'note' })]) },
    ]);
    const client = makeClient(transport);
    const items = await client.listItems({ collectionKey: 'ABC123', maxItems: 5 });
    assert.equal(items.length, 1);
    assert.ok(transport.calls[0].url.includes('/collections/ABC123/items'));
  });

  it('finds an existing item by DOI case-insensitively', async () => {
    const transport = fakeTransport([
      {
        status: 200,
        headers: {},
        text: JSON.stringify([
          zoteroItem('K1', 4, { itemType: 'journalArticle', title: 'PDE Study', DOI: '10.1000/PDE-1' }),
        ]),
      },
      { status: 200, headers: {}, text: '[]' }, // second scan (miss): empty library
    ]);
    const client = makeClient(transport);
    const found = await client.findByIdentifier({ doi: '10.1000/pde-1' });
    assert.ok(found);
    assert.equal(found.key, 'K1');
    const miss = await client.findByIdentifier({ doi: '10.9999/nope' });
    assert.equal(miss, null);
  });

  it('refuses to write a duplicate and performs no POST (honest dedup)', async () => {
    const existing = [zoteroItem('K1', 4, { itemType: 'journalArticle', title: 'PDE Study', DOI: '10.1000/pde-1' })];
    const transport = fakeTransport([
      { status: 200, headers: {}, text: JSON.stringify(existing) },
    ]);
    const client = makeClient(transport);
    const result = await client.createItem({ itemType: 'journalArticle', title: 'PDE Study', DOI: '10.1000/pde-1' });

    assert.equal(result.status, 'duplicate');
    assert.equal(result.created, false);
    assert.equal(result.item.key, 'K1');
    const postCalls = transport.calls.filter((c) => c.opts.method === 'POST');
    assert.equal(postCalls.length, 0, 'dedup must never issue a write');
  });

  it('creates a new item with a POST and reports the created record', async () => {
    const transport = fakeTransport([
      { status: 200, headers: {}, text: JSON.stringify([]) }, // dedup scan: nothing matches
      { status: 200, headers: {}, text: JSON.stringify([zoteroItem('NEW1', 1, { itemType: 'journalArticle', title: 'New Paper', DOI: '10.1000/new-1' })]) }, // POST result
    ]);
    const client = makeClient(transport);
    const result = await client.createItem({ itemType: 'journalArticle', title: 'New Paper', DOI: '10.1000/new-1' });

    assert.equal(result.status, 'created');
    assert.equal(result.created, true);
    assert.equal(result.item.key, 'NEW1');
    const post = transport.calls.find((c) => c.opts.method === 'POST');
    assert.ok(post, 'create must POST');
    assert.ok(Array.isArray(JSON.parse(post.opts.body)));
  });

  it('fails a stale conditional write with ZoteroConflictError (412), never overwriting', async () => {
    const transport = fakeTransport([
      { status: 412, headers: {}, text: JSON.stringify({ version: 99 }) },
    ]);
    const client = makeClient(transport);
    await assert.rejects(
      () => client.updateItem('K1', { title: 'overwritten!' }, { expectedVersion: 4 }),
      (err) => {
        assert.ok(err instanceof ZoteroConflictError);
        assert.equal(err.status, 412);
        assert.equal(err.serverVersion, 99);
        assert.equal(err.itemKey, 'K1');
        assert.ok(err.message.includes('412'));
        assert.ok(err.message.includes('未执行覆盖'));
        return true;
      },
    );
    assert.equal(transport.calls.length, 1, 'a 412 must stop immediately: no retry, no overwrite');
  });

  it('requires expectedVersion for updates (no blind writes)', async () => {
    const transport = fakeTransport([]);
    const client = makeClient(transport);
    await assert.rejects(() => client.updateItem('K1', { title: 'x' }), /expectedVersion/);
    await assert.rejects(() => client.updateItem('', { title: 'x' }, { expectedVersion: 1 }), /itemKey/);
    assert.equal(transport.calls.length, 0, 'validation failures must not hit the network');
  });

  it('backs off on 429 honoring the Backoff header and then succeeds', async () => {
    const delays = [];
    const transport = fakeTransport([
      { status: 429, headers: { backoff: '0' }, text: 'slow down' },
      { status: 200, headers: {}, text: JSON.stringify([zoteroItem('A1', 1, { itemType: 'note' })]) },
    ]);
    const client = makeClient(transport, {
      delayFn: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    const items = await client.listItems({ maxItems: 1 });
    assert.equal(items.length, 1);
    assert.equal(transport.calls.length, 2);
    assert.deepEqual(delays, [0]);
  });

  it('enforces attachment scope fail-closed before any network call', async () => {
    const transport = fakeTransport([
      { status: 200, headers: {}, text: JSON.stringify([zoteroItem('ATT1', 1, { itemType: 'attachment', linkMode: 'linked_url' })]) },
    ]);
    const client = makeClient(transport);

    await assert.rejects(
      () => client.createLinkAttachment({ url: 'https://example.org/data.csv', targetCollection: 'OUTSIDE', allowedCollections: ['INSIDE1'] }),
      (err) => {
        assert.ok(err instanceof ZoteroScopeError);
        assert.ok(err.message.includes('OUTSIDE'));
        return true;
      },
    );
    await assert.throws(
      () => assertAttachmentScope({ targetCollection: 'X', allowedCollections: [] }),
      ZoteroScopeError,
    );
    const postCalls = transport.calls.filter((c) => c.opts.method === 'POST');
    assert.equal(postCalls.length, 0, 'out-of-scope attachment must never reach the network');

    const ok = await client.createLinkAttachment({
      url: 'https://example.org/data.csv',
      title: 'Dataset',
      targetCollection: 'INSIDE1',
      allowedCollections: ['INSIDE1', 'INSIDE2'],
    });
    assert.equal(ok.status, 'created');
    const post = transport.calls.find((c) => c.opts.method === 'POST');
    const body = JSON.parse(post.opts.body);
    assert.equal(body[0].linkMode, 'linked_url');
    assert.deepEqual(body[0].collections, ['INSIDE1']);
  });

  it('masks the API key in describe() and never emits it in errors', async () => {
    const secret = 'zotero-secret-key-abcdef';
    const transport = fakeTransport([{ status: 403, headers: {}, text: 'forbidden' }]);
    const client = makeClient(transport);
    const desc = client.describe();
    assert.ok(!JSON.stringify(desc).includes(secret));
    await assert.rejects(() => client.listItems({ maxItems: 1 }), (err) => {
      assert.ok(!err.message.includes(secret));
      assert.ok(err.message.includes('403'));
      return true;
    });
  });
});
