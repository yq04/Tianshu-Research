/**
 * Content-Addressed Artifact Store for tianshu-research.
 * Implements immutable artifact persistence indexed by SHA-256 in
 * <workspace>/.rivet/research/v2/artifacts/<sha256>/
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

export function getArtifactsBaseDir(workspace = process.cwd()) {
  return join(resolve(workspace), '.rivet', 'research', 'v2', 'artifacts');
}

/**
 * Computes the SHA-256 checksum of a buffer or string.
 */
export function computeDigest(data) {
  const hash = createHash('sha256');
  if (typeof data === 'string') {
    hash.update(data, 'utf8');
  } else {
    hash.update(data);
  }
  return hash.digest('hex');
}

/**
 * Saves a scientific artifact with content-addressed indexing.
 * Atomic write via temp file and directory creation.
 */
export function saveArtifact(workspace, bufferOrString, options = {}) {
  const ws = resolve(workspace || process.cwd());
  const kind = options.kind || 'document';
  const mediaType = options.mediaType || 'text/plain';
  const filename = options.filename || 'content.dat';
  const producedByRunId = options.producedByRunId || undefined;

  const data = typeof bufferOrString === 'string' ? Buffer.from(bufferOrString, 'utf8') : bufferOrString;
  const sha256 = computeDigest(data);
  const id = options.id || ('art_' + sha256.slice(0, 16));

  const baseDir = getArtifactsBaseDir(ws);
  const hashDir = join(baseDir, sha256);
  mkdirSync(hashDir, { recursive: true });

  const finalPath = join(hashDir, filename);
  const metaPath = join(hashDir, 'artifact.json');

  if (!existsSync(finalPath)) {
    const tmpPath = join(hashDir, '.' + filename + '.tmp.' + Math.random().toString(36).slice(2, 8));
    writeFileSync(tmpPath, data);
    renameSync(tmpPath, finalPath);
  }

  const relPath = relative(ws, finalPath).replace(/\\/g, '/');

  const ref = {
    id,
    kind,
    relativePath: relPath,
    sha256,
    mediaType,
    filename,
    size: data.length,
    producedByRunId,
  };

  writeFileSync(metaPath, JSON.stringify(ref, null, 2), 'utf8');
  return ref;
}

/**
 * Returns metadata or content for a stored artifact.
 */
export function getArtifact(workspace, sha256OrId) {
  const ws = resolve(workspace || process.cwd());
  const baseDir = getArtifactsBaseDir(ws);
  let dir = join(baseDir, sha256OrId);
  if (!existsSync(dir)) {
    if (existsSync(baseDir)) {
      const subs = readdirSync(baseDir);
      for (const sub of subs) {
        const metaP = join(baseDir, sub, 'artifact.json');
        if (existsSync(metaP)) {
          try {
            const meta = JSON.parse(readFileSync(metaP, 'utf8'));
            if (meta.id === sha256OrId || meta.sha256.startsWith(sha256OrId)) {
              dir = join(baseDir, sub);
              break;
            }
          } catch {}
        }
      }
    }
  }

  if (!existsSync(dir)) return null;

  const metaPath = join(dir, 'artifact.json');
  if (!existsSync(metaPath)) return null;

  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const filePath = join(ws, meta.relativePath);
  return {
    meta,
    filePath,
    read: () => readFileSync(filePath),
    readText: () => readFileSync(filePath, 'utf8'),
  };
}

export function hasArtifact(workspace, sha256OrId) {
  return Boolean(getArtifact(workspace, sha256OrId));
}
