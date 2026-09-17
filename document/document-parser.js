/**
 * Scientific Document Parser & Section Locater for tianshu-research.
 * Parses scientific texts, extracts structured sections, calculates exact physical locators,
 * and facilitates evidence-backed reading without heavy external dependencies.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const CHARS_PER_PAGE = 2500

export function parseDocument(rawText) {
  if (typeof rawText === 'string' && rawText.trim().startsWith('%PDF-')) {
    throw new Error('检测到 PDF 格式。本插件不直接解析二进制 PDF，请使用天枢内置 pdf_read 提取文本后再导入。')
  }

  // Normalize CRLF to LF for deterministic character offsets and line counts
  const text = String(rawText || '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')

  const rawSections = []
  let currentSection = null
  let runningChar = 0

  const sectionRegexes = [
    // Markdown headers: # Title, ## Section
    /^(#{1,4})\s+(.+)$/,
    // Numbered scientific headings: 1. Introduction, 2.1 Related Work, IV. Results
    /^([0-9IVX]+(?:\.[0-9]+)*\.?)\s+([A-Z][A-Za-z0-9\s\-_:()]+)$/,
    // Common standard headings: Abstract, References, Acknowledgments
    /^(Abstract|References|Acknowledgments|Conclusion|Introduction)\b/i,
  ]

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    const trimmed = line.trim()
    const lineLen = line.length + 1 // include newline

    let matchedHeading = null
    let headingLevel = 2

    for (const rx of sectionRegexes) {
      const m = trimmed.match(rx)
      if (m) {
        if (m[1] && m[1].startsWith('#')) {
          headingLevel = m[1].length
          matchedHeading = m[2].trim()
        } else if (m[2]) {
          matchedHeading = m[1] + ' ' + m[2].trim()
          headingLevel = m[1].replace(/\.$/, '').includes('.') ? 3 : 2
        } else {
          matchedHeading = m[1].trim()
          headingLevel = 2
        }
        break
      }
    }

    if (matchedHeading) {
      if (currentSection) {
        currentSection.charEnd = runningChar
        currentSection.lineEnd = lineIdx
        currentSection.content = text.slice(currentSection.charStart, currentSection.charEnd).trim()
        rawSections.push(currentSection)
      }

      currentSection = {
        index: rawSections.length + 1,
        title: matchedHeading,
        level: headingLevel,
        charStart: runningChar,
        charEnd: text.length,
        lineStart: lineIdx + 1,
        lineEnd: lines.length,
        estimatedPage: Math.floor(runningChar / CHARS_PER_PAGE) + 1,
        content: '',
      }
    }

    runningChar += lineLen
  }

  if (currentSection) {
    currentSection.charEnd = text.length
    currentSection.lineEnd = lines.length
    currentSection.content = text.slice(currentSection.charStart, currentSection.charEnd).trim()
    rawSections.push(currentSection)
  }

  // Fallback: If no explicit sections were parsed, treat entire text as single section
  if (rawSections.length === 0 && text.trim()) {
    rawSections.push({
      index: 1,
      title: 'Body',
      level: 1,
      charStart: 0,
      charEnd: text.length,
      lineStart: 1,
      lineEnd: lines.length,
      estimatedPage: 1,
      content: text.trim(),
    })
  }

  // Identify title and abstract
  let title = 'Untitled Scientific Document'
  const firstHeader = rawSections.find((s) => s.level === 1)
  if (firstHeader) {
    title = firstHeader.title
  } else if (lines.length > 0 && lines[0].trim()) {
    title = lines[0].trim().replace(/^#+\s*/, '')
  }

  const abstractSec = rawSections.find((s) => s.title.toLowerCase().includes('abstract'))
  const abstract = abstractSec ? abstractSec.content : ''

  // Filter out top-level title header and abstract from body sections for clean section indexing
  const sections = rawSections
    .filter((s) => {
      if (s.level === 1 && s.title === title) return false
      if (s.title.toLowerCase() === 'abstract') return false
      return true
    })
    .map((s, idx) => ({ ...s, index: idx + 1 }))

  return {
    title,
    abstract,
    totalCharacters: text.length,
    totalLines: lines.length,
    estimatedPages: Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE)),
    sections,
    rawText: text,
  }
}

export function readSection(parsedDoc, selector) {
  if (!parsedDoc || !Array.isArray(parsedDoc.sections)) {
    throw new Error('Invalid parsedDoc')
  }

  if (typeof selector === 'number' || (typeof selector === 'string' && /^\d+$/.test(selector))) {
    const idx = Number(selector)
    const sec = parsedDoc.sections.find((s) => s.index === idx)
    if (!sec) {
      throw new Error('Section index ' + idx + ' not found (total sections: ' + parsedDoc.sections.length + ')')
    }
    return sec
  }

  const query = String(selector).toLowerCase().trim()
  let found = parsedDoc.sections.find((s) => s.title.toLowerCase() === query)
  if (!found) {
    found = parsedDoc.sections.find((s) => s.title.toLowerCase().includes(query))
  }

  if (!found) {
    throw new Error('Section matching "' + selector + '" not found. Available: ' + parsedDoc.sections.map((s) => s.title).join(', '))
  }

  return found
}

export function locateText(parsedDoc, query, contextChars = 100) {
  if (!parsedDoc || !parsedDoc.rawText) {
    throw new Error('Invalid parsedDoc')
  }
  const q = String(query).trim()
  if (!q) {
    throw new Error('Search query is required for locateText')
  }

  const text = parsedDoc.rawText
  const lowerText = text.toLowerCase()
  const lowerQ = q.toLowerCase()

  // Precompute line offsets for accurate lineStart and lineEnd
  const lineOffsets = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineOffsets.push(i + 1)
  }

  function getLineNumber(charIdx) {
    let low = 0, high = lineOffsets.length - 1
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      if (lineOffsets[mid] <= charIdx) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return high + 1
  }

  const matches = []
  let pos = 0

  while (pos < text.length) {
    const matchIdx = lowerText.indexOf(lowerQ, pos)
    if (matchIdx === -1) break

    const start = Math.max(0, matchIdx - contextChars)
    const end = Math.min(text.length, matchIdx + q.length + contextChars)
    const snippet = (start > 0 ? '...' : '') + text.slice(start, end).trim() + (end < text.length ? '...' : '')

    // Find enclosing section
    const sec = parsedDoc.sections.find((s) => matchIdx >= s.charStart && matchIdx < s.charEnd)
    const sectionName = sec ? sec.title : (parsedDoc.abstract ? 'Abstract' : 'Preamble')

    const lineStart = getLineNumber(matchIdx)
    const lineEnd = getLineNumber(matchIdx + q.length)

    matches.push({
      query: q,
      locator: {
        section: sectionName,
        lineStart,
        lineEnd,
        charOffset: matchIdx,
      },
      snippet,
    })

    pos = matchIdx + q.length
  }

  return matches
}

export function getDocumentsDir(workspace = process.cwd()) {
  return join(resolve(workspace), '.rivet', 'research', 'documents')
}

export function ingestDocument(workspace, docId, rawText, metadata = {}) {
  if (!docId || typeof docId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(docId.trim())) {
    throw new Error('docId must be a safe single-segment identifier containing only letters, numbers, underscores or hyphens')
  }
  const safeDocId = docId.trim()

  if (metadata.sourcePath && String(metadata.sourcePath).toLowerCase().endsWith('.pdf')) {
    throw new Error('检测到 PDF 文件扩展名。本插件不直接解析二进制 PDF，请使用天枢内置 pdf_read 提取文本后再导入。')
  }
  if (typeof rawText === 'string' && rawText.trim().startsWith('%PDF-')) {
    throw new Error('检测到 PDF 格式。本插件不直接解析二进制 PDF，请使用天枢内置 pdf_read 提取文本后再导入。')
  }

  const parsed = parseDocument(rawText)

  const dir = getDocumentsDir(workspace)
  const targetDir = join(dir, safeDocId)
  mkdirSync(targetDir, { recursive: true })

  const meta = {
    id: safeDocId,
    title: metadata.title || parsed.title,
    doi: metadata.doi || null,
    arxivId: metadata.arxivId || null,
    authors: metadata.authors || [],
    pages: parsed.estimatedPages,
    characters: parsed.totalCharacters,
    sections: parsed.sections.map((s) => ({
      index: s.index,
      title: s.title,
      level: s.level,
      charStart: s.charStart,
      charEnd: s.charEnd,
    })),
    ingestedAt: new Date().toISOString(),
  }

  writeFileSync(join(targetDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
  writeFileSync(join(targetDir, 'content.txt'), parsed.rawText, 'utf8')

  return { id: safeDocId, meta, parsed }
}

export function loadDocument(workspace, docId) {
  if (!docId || typeof docId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(docId.trim())) {
    throw new Error('docId must be a safe single-segment identifier')
  }
  const safeDocId = docId.trim()
  const dir = getDocumentsDir(workspace)
  const targetDir = join(dir, safeDocId)
  const metaFile = join(targetDir, 'meta.json')
  const contentFile = join(targetDir, 'content.txt')

  if (!existsSync(metaFile) || !existsSync(contentFile)) {
    throw new Error('Document "' + safeDocId + '" not found in ' + targetDir)
  }

  const meta = JSON.parse(readFileSync(metaFile, 'utf8'))
  const rawText = readFileSync(contentFile, 'utf8')
  const parsed = parseDocument(rawText)

  return { meta, parsed, rawText }
}
