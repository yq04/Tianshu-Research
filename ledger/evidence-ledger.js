/**
 * Evidence Ledger core storage for tianshu-research.
 * Manages sources.jsonl, evidence.jsonl, and claims.jsonl in <workspace>/.rivet/research/.
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'

export function getResearchDir(workspace = process.cwd()) {
  return join(resolve(workspace), '.rivet', 'research')
}

export function readJsonlFile(filePath) {
  if (!existsSync(filePath)) {
    const records = []
    records.readErrors = []
    return records
  }
  const readErrors = []
  const records = []
  try {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        records.push(JSON.parse(trimmed))
      } catch (err) {
        readErrors.push({
          line: i + 1,
          content: trimmed,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  } catch (err) {
    readErrors.push({
      line: 0,
      content: '',
      error: 'File read failure: ' + (err instanceof Error ? err.message : String(err)),
    })
  }
  records.readErrors = readErrors
  return records
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

  const existingSources = getSources(workspace)
  if (existingSources.some(s => s.id === id)) {
    throw new Error('Duplicate source id: "' + id + '"')
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
    documentId: sourceData.documentId ? String(sourceData.documentId).trim() : undefined,
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

  const existingSources = getSources(workspace)
  const sourceExists = existingSources.some(s => s.id === sourceId)
  if (!sourceExists) {
    throw new Error('Source with id "' + sourceId + '" not found in sources.jsonl')
  }

  const existingEvidence = getEvidenceList(workspace)
  if (existingEvidence.some(e => e.id === id)) {
    throw new Error('Duplicate evidence id: "' + id + '"')
  }

  const dir = getResearchDir(workspace)
  mkdirSync(dir, { recursive: true })
  const evidencePath = join(dir, 'evidence.jsonl')

  const rawLoc = evidenceData.locator && typeof evidenceData.locator === 'object' ? evidenceData.locator : {}
  const locator = {}
  if (rawLoc.page !== undefined && Number.isInteger(Number(rawLoc.page)) && Number(rawLoc.page) > 0) {
    locator.page = Number(rawLoc.page)
  }
  if (rawLoc.section) locator.section = String(rawLoc.section).trim()
  if (rawLoc.lineStart !== undefined) locator.lineStart = Number(rawLoc.lineStart)
  if (rawLoc.lineEnd !== undefined) locator.lineEnd = Number(rawLoc.lineEnd)
  if (rawLoc.charOffset !== undefined) locator.charOffset = Number(rawLoc.charOffset)
  if (rawLoc.equation) locator.equation = String(rawLoc.equation).trim()
  if (rawLoc.figure) locator.figure = String(rawLoc.figure).trim()
  if (rawLoc.table) locator.table = String(rawLoc.table).trim()

  const relation = evidenceData.relation ? String(evidenceData.relation).trim() : 'supports'

  const record = {
    id,
    sourceId,
    locator,
    relation,
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

  const existingClaims = getClaims(workspace)
  if (existingClaims.some(c => c.id === id)) {
    throw new Error('Duplicate claim id: "' + id + '"')
  }

  const existingEvidence = getEvidenceList(workspace)
  const evidenceIdSet = new Set(existingEvidence.map(e => e.id))
  for (const eid of claimData.evidenceIds) {
    const trimmedEid = String(eid).trim()
    if (!evidenceIdSet.has(trimmedEid)) {
      throw new Error('Evidence with id "' + trimmedEid + '" not found in evidence.jsonl')
    }
  }

  const dir = getResearchDir(workspace)
  mkdirSync(dir, { recursive: true })
  const claimsPath = join(dir, 'claims.jsonl')

  const allowedStatuses = ['tentative', 'verified', 'disputed', 'rejected']
  const st = claimData.status ? String(claimData.status).trim().toLowerCase() : 'tentative'
  const status = allowedStatuses.includes(st) ? st : 'tentative'

  const record = {
    id,
    statement,
    type: claimData.type || 'finding',
    evidenceIds: claimData.evidenceIds.map(e => String(e).trim()),
    status,
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

export function exportCslJson(workspace = process.cwd(), customOutputPath) {
  const sources = getSources(workspace)
  const evidenceList = getEvidenceList(workspace)

  const evidenceBySource = new Map()
  for (const ev of evidenceList) {
    if (ev.sourceId) {
      if (!evidenceBySource.has(ev.sourceId)) evidenceBySource.set(ev.sourceId, [])
      evidenceBySource.get(ev.sourceId).push(ev)
    }
  }

  const cslItems = sources.map((src) => {
    const authors = Array.isArray(src.authors)
      ? src.authors.map((name) => {
          const parts = String(name).trim().split(/\s+/)
          if (parts.length > 1) {
            return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') }
          }
          return { literal: String(name).trim() }
        })
      : []

    const item = {
      id: src.id,
      type: src.type === 'preprint' ? 'manuscript' : 'article-journal',
      title: src.title,
      author: authors,
    }

    if (src.year) {
      item.issued = { 'date-parts': [[Number(src.year)]] }
    }
    if (src.doi) {
      item.DOI = src.doi
    }
    if (src.landingUrl || src.pdfUrl) {
      item.URL = src.landingUrl || src.pdfUrl
    }
    const evs = evidenceBySource.get(src.id) || []
    if (evs.length > 0) {
      item.note = 'TianshuEvidence: ' + evs.length + ' record(s); doc: ' + (src.documentId || 'none')
    }
    return item
  })

  const exportDir = join(getResearchDir(workspace), 'export')
  if (!existsSync(exportDir)) {
    mkdirSync(exportDir, { recursive: true })
  }
  const filePath = customOutputPath
    ? (isAbsolute(customOutputPath) ? customOutputPath : resolve(workspace, customOutputPath))
    : join(exportDir, 'literature.csl.json')

  writeFileSync(filePath, JSON.stringify(cslItems, null, 2), 'utf8')
  return {
    filePath,
    count: cslItems.length,
    items: cslItems,
  }
}

export function exportRis(workspace = process.cwd(), customOutputPath) {
  const sources = getSources(workspace)
  const evidenceList = getEvidenceList(workspace)

  const evidenceBySource = new Map()
  for (const ev of evidenceList) {
    if (ev.sourceId) {
      if (!evidenceBySource.has(ev.sourceId)) evidenceBySource.set(ev.sourceId, [])
      evidenceBySource.get(ev.sourceId).push(ev)
    }
  }

  const risRecords = sources.map((src) => {
    const lines = []
    lines.push('TY  - JOUR')
    lines.push('TI  - ' + src.title)
    if (Array.isArray(src.authors)) {
      for (const a of src.authors) {
        lines.push('AU  - ' + a)
      }
    }
    if (src.year) {
      lines.push('PY  - ' + src.year)
    }
    if (src.doi) {
      lines.push('DO  - ' + src.doi)
    }
    if (src.landingUrl || src.pdfUrl) {
      lines.push('UR  - ' + (src.landingUrl || src.pdfUrl))
    }
    const evs = evidenceBySource.get(src.id) || []
    if (evs.length > 0) {
      lines.push('N1  - TianshuEvidence: ' + evs.length + ' record(s); doc: ' + (src.documentId || 'none'))
    }
    lines.push('ER  - ')
    return lines.join('\n')
  })

  const exportDir = join(getResearchDir(workspace), 'export')
  if (!existsSync(exportDir)) {
    mkdirSync(exportDir, { recursive: true })
  }
  const filePath = customOutputPath
    ? (isAbsolute(customOutputPath) ? customOutputPath : resolve(workspace, customOutputPath))
    : join(exportDir, 'literature.ris')

  writeFileSync(filePath, risRecords.join('\n\n') + (risRecords.length > 0 ? '\n' : ''), 'utf8')
  return {
    filePath,
    count: risRecords.length,
    raw: risRecords.join('\n\n'),
  }
}
