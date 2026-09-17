/**
 * Evidence Ledger core storage for tianshu-research.
 * Manages sources.jsonl, evidence.jsonl, and claims.jsonl in <workspace>/.rivet/research/.
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export function getResearchDir(workspace = process.cwd()) {
  return join(resolve(workspace), '.rivet', 'research')
}

function readJsonlFile(filePath) {
  if (!existsSync(filePath)) return []
  try {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    const records = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        records.push(JSON.parse(trimmed))
      } catch {
        // ignore malformed line
      }
    }
    return records
  } catch {
    return []
  }
}

function appendJsonlFile(filePath, record) {
  appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8')
}

export function getSources(workspace) {
  const dir = getResearchDir(workspace)
  return readJsonlFile(join(dir, 'sources.jsonl'))
}

export function getEvidenceList(workspace) {
  const dir = getResearchDir(workspace)
  return readJsonlFile(join(dir, 'evidence.jsonl'))
}

export function getClaims(workspace) {
  const dir = getResearchDir(workspace)
  return readJsonlFile(join(dir, 'claims.jsonl'))
}

export function addSource(workspace, sourceData) {
  if (!sourceData || typeof sourceData !== 'object') {
    throw new Error('sourceData must be an object')
  }
  const id = sourceData.id ? String(sourceData.id).trim() : ''
  if (!id) {
    throw new Error('sourceData.id is required')
  }
  const title = sourceData.title ? String(sourceData.title).trim() : ''
  if (!title) {
    throw new Error('sourceData.title is required')
  }

  const dir = getResearchDir(workspace)
  mkdirSync(dir, { recursive: true })
  const sourcesPath = join(dir, 'sources.jsonl')

  const record = {
    id,
    type: sourceData.type || 'paper',
    title,
    authors: Array.isArray(sourceData.authors) ? sourceData.authors : [],
    year: sourceData.year !== undefined && sourceData.year !== null ? Number(sourceData.year) : undefined,
    doi: sourceData.doi ? String(sourceData.doi).trim() : undefined,
    arxivId: sourceData.arxivId ? String(sourceData.arxivId).trim() : undefined,
    landingUrl: sourceData.landingUrl ? String(sourceData.landingUrl).trim() : undefined,
    pdfUrl: sourceData.pdfUrl ? String(sourceData.pdfUrl).trim() : undefined,
    verification: sourceData.verification || 'unverified',
    createdAt: sourceData.createdAt || new Date().toISOString(),
  }

  appendJsonlFile(sourcesPath, record)
  return record
}

export function addEvidence(workspace, evidenceData) {
  if (!evidenceData || typeof evidenceData !== 'object') {
    throw new Error('evidenceData must be an object')
  }
  const id = evidenceData.id ? String(evidenceData.id).trim() : ''
  if (!id) {
    throw new Error('evidenceData.id is required')
  }
  const sourceId = evidenceData.sourceId ? String(evidenceData.sourceId).trim() : ''
  if (!sourceId) {
    throw new Error('evidenceData.sourceId is required')
  }
  const excerpt = evidenceData.excerpt ? String(evidenceData.excerpt).trim() : ''
  if (!excerpt) {
    throw new Error('evidenceData.excerpt is required')
  }

  // 严格检查 sourceId 必须在 sources.jsonl 中存在
  const existingSources = getSources(workspace)
  const sourceExists = existingSources.some(s => s.id === sourceId)
  if (!sourceExists) {
    throw new Error(`Source with id "${sourceId}" not found in sources.jsonl`)
  }

  const dir = getResearchDir(workspace)
  mkdirSync(dir, { recursive: true })
  const evidencePath = join(dir, 'evidence.jsonl')

  const locator = evidenceData.locator && typeof evidenceData.locator === 'object' ? {
    page: evidenceData.locator.page !== undefined ? Number(evidenceData.locator.page) : undefined,
    section: evidenceData.locator.section ? String(evidenceData.locator.section).trim() : undefined,
    equation: evidenceData.locator.equation ? String(evidenceData.locator.equation).trim() : undefined,
    figure: evidenceData.locator.figure ? String(evidenceData.locator.figure).trim() : undefined,
    table: evidenceData.locator.table ? String(evidenceData.locator.table).trim() : undefined,
  } : {}

  const record = {
    id,
    sourceId,
    locator,
    relation: evidenceData.relation || 'supports',
    excerpt,
    verification: evidenceData.verification || 'unverified',
    createdAt: evidenceData.createdAt || new Date().toISOString(),
  }

  appendJsonlFile(evidencePath, record)
  return record
}

export function addClaim(workspace, claimData) {
  if (!claimData || typeof claimData !== 'object') {
    throw new Error('claimData must be an object')
  }
  const id = claimData.id ? String(claimData.id).trim() : ''
  if (!id) {
    throw new Error('claimData.id is required')
  }
  const statement = claimData.statement ? String(claimData.statement).trim() : ''
  if (!statement) {
    throw new Error('claimData.statement is required')
  }
  if (!Array.isArray(claimData.evidenceIds) || claimData.evidenceIds.length === 0) {
    throw new Error('claimData.evidenceIds must be a non-empty array')
  }

  // 严格检查 evidenceIds 必须在 evidence.jsonl 中存在
  const existingEvidence = getEvidenceList(workspace)
  const evidenceIdSet = new Set(existingEvidence.map(e => e.id))
  for (const eid of claimData.evidenceIds) {
    const trimmedEid = String(eid).trim()
    if (!evidenceIdSet.has(trimmedEid)) {
      throw new Error(`Evidence with id "${trimmedEid}" not found in evidence.jsonl`)
    }
  }

  const dir = getResearchDir(workspace)
  mkdirSync(dir, { recursive: true })
  const claimsPath = join(dir, 'claims.jsonl')

  const record = {
    id,
    statement,
    type: claimData.type || 'finding',
    evidenceIds: claimData.evidenceIds.map(e => String(e).trim()),
    status: claimData.status || 'tentative',
    createdAt: claimData.createdAt || new Date().toISOString(),
  }

  appendJsonlFile(claimsPath, record)
  return record
}

export function queryEvidence(workspace, filter = {}) {
  const list = getEvidenceList(workspace)
  return list.filter(item => {
    if (filter.sourceId && item.sourceId !== filter.sourceId) {
      return false
    }
    if (filter.relation && item.relation !== filter.relation) {
      return false
    }
    if (filter.text && typeof filter.text === 'string') {
      const queryText = filter.text.toLowerCase()
      if (!item.excerpt || !item.excerpt.toLowerCase().includes(queryText)) {
        return false
      }
    }
    return true
  })
}

export function getLedgerSummary(workspace) {
  const sources = getSources(workspace)
  const evidence = getEvidenceList(workspace)
  const claims = getClaims(workspace)
  return {
    sourcesCount: sources.length,
    evidenceCount: evidence.length,
    claimsCount: claims.length,
  }
}
