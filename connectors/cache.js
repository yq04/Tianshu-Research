/**
 * Request-keyed File Cache for tianshu-research connectors (Phase 9A).
 *
 * Stores HTTP response snapshots as deterministic JSON files keyed by
 * sha256(method + '\n' + url). Used by the snapshot transport for offline
 * replay (fixtures) and as a polite response cache. One file per request
 * keeps fixtures diffable and stable.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Deterministic request key: sha256 of "METHOD\nurl".
 */
export function computeRequestKey(method, url) {
  const normalized = `${String(method || 'GET').toUpperCase()}\n${String(url ?? '')}`;
  return createHash('sha256').update(normalized).digest('hex');
}

export class FileCache {
  constructor({ dir } = {}) {
    if (!dir) throw new Error('FileCache requires a directory');
    this.dir = resolve(dir);
  }

  ensureDir() {
    mkdirSync(this.dir, { recursive: true });
    return this.dir;
  }

  pathFor(key) {
    return join(this.dir, `${key}.json`);
  }

  get(key, { maxAgeMs } = {}) {
    const file = this.pathFor(key);
    if (!existsSync(file)) return null;
    let entry;
    try {
      entry = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
    if (maxAgeMs !== undefined && Number.isFinite(maxAgeMs)) {
      const storedAt = Number(entry?.storedAt) || 0;
      if (Date.now() - storedAt > maxAgeMs) return null;
    }
    return entry;
  }

  put(key, value) {
    this.ensureDir();
    const entry = { storedAt: Date.now(), value };
    writeFileSync(this.pathFor(key), JSON.stringify(entry, null, 2), 'utf8');
    return entry;
  }

  delete(key) {
    const file = this.pathFor(key);
    if (existsSync(file)) {
      unlinkSync(file);
      return true;
    }
    return false;
  }

  listKeys() {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -'.json'.length))
      .sort();
  }
}
