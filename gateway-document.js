/**
 * Research Document Gateway for tianshu-research.
 * Provides unified interface for scientific document inspection, section reading,
 * and text-locator resolution.
 */

import { existsSync, readFileSync } from 'node:fs'
import {
  parseDocument,
  readSection,
  locateText,
  ingestDocument,
  loadDocument,
} from './document/document-parser.js'

export async function runResearchDocument(params = {}) {
  const action = typeof params.action === 'string' ? params.action.trim() : ''
  const workspace = params.workspace || process.cwd()

  try {
    // Resolve raw document content
    let parsed = null
    let docId = params.docId || params.id

    if (params.text && typeof params.text === 'string') {
      parsed = parseDocument(params.text)
    } else if (params.documentPath && typeof params.documentPath === 'string') {
      if (!existsSync(params.documentPath)) {
        return { content: `Error: Document file "${params.documentPath}" does not exist`, isError: true }
      }
      const raw = readFileSync(params.documentPath, 'utf8')
      parsed = parseDocument(raw)
    } else if (docId) {
      try {
        const loaded = loadDocument(workspace, docId)
        parsed = loaded.parsed
      } catch (err) {
        if (action !== 'ingest') {
          return { content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true }
        }
      }
    }

    if (action === 'ingest') {
      if (!docId) {
        return { content: 'Error: id (or docId) is required for ingest', isError: true }
      }
      let contentToIngest = params.text
      if (!contentToIngest && params.sourcePath) {
        if (!existsSync(params.sourcePath)) {
          return { content: `Error: sourcePath "${params.sourcePath}" not found`, isError: true }
        }
        contentToIngest = readFileSync(params.sourcePath, 'utf8')
      }
      if (!contentToIngest) {
        return { content: 'Error: text or valid sourcePath is required for ingest', isError: true }
      }

      const record = ingestDocument(workspace, docId, contentToIngest, {
        title: params.title,
        doi: params.doi,
        arxivId: params.arxivId,
        authors: params.authors,
      })

      return {
        content: `✅ 论文文档已入库索引 [${record.id}]: 《${record.meta.title}》\n页数预估: ${record.meta.pages} 页 (${record.meta.characters} 字符)\n章节数: ${record.meta.sections.length} 个`,
        data: record.meta,
      }
    }

    if (!parsed) {
      return {
        content: 'Error: A valid document source (documentPath, text, or docId) is required',
        isError: true,
      }
    }

    if (action === 'inspect') {
      const lines = [
        `### 📄 科学文献结构概览: 《${parsed.title}》`,
        '',
        `- **总字符数**: ${parsed.totalCharacters} 字符 (~ ${parsed.estimatedPages} 页)`,
        `- **总行数**: ${parsed.totalLines} 行`,
      ]

      if (parsed.abstract) {
        lines.push('', '#### 📌 摘要 (Abstract)', `> ${parsed.abstract.slice(0, 500)}${parsed.abstract.length > 500 ? '...' : ''}`)
      }

      lines.push('', '#### 📑 章节大纲 (Sections Outline)')
      for (const s of parsed.sections) {
        const indent = '  '.repeat(Math.max(0, s.level - 1))
        lines.push(`${indent}- **[${s.index}]** ${s.title} (第 ${s.estimatedPage} 页, ${s.charEnd - s.charStart} 字符)`)
      }

      return {
        content: lines.join('\n'),
        data: {
          title: parsed.title,
          abstract: parsed.abstract,
          totalCharacters: parsed.totalCharacters,
          estimatedPages: parsed.estimatedPages,
          sections: parsed.sections.map((s) => ({
            index: s.index,
            title: s.title,
            level: s.level,
            page: s.estimatedPage,
          })),
        },
      }
    }

    if (action === 'read_section') {
      if (params.section === undefined || params.section === null) {
        return { content: 'Error: section (number or heading name) is required for read_section', isError: true }
      }

      const sec = readSection(parsed, params.section)
      const lines = [
        `### 📖 章节内容: [${sec.index}] ${sec.title}`,
        `*定位信息: 预估第 ${sec.estimatedPage} 页 | 行 ${sec.lineStart}-${sec.lineEnd} | 字符偏移 ${sec.charStart}-${sec.charEnd}*`,
        '',
        sec.content,
      ]

      return {
        content: lines.join('\n'),
        data: {
          sectionIndex: sec.index,
          title: sec.title,
          estimatedPage: sec.estimatedPage,
          charStart: sec.charStart,
          charEnd: sec.charEnd,
          content: sec.content,
        },
      }
    }

    if (action === 'locate_text') {
      const query = params.query
      if (!query || typeof query !== 'string') {
        return { content: 'Error: query is required for locate_text', isError: true }
      }

      const matches = locateText(parsed, query, params.contextChars || 100)
      if (matches.length === 0) {
        return {
          content: `未在文献中匹配到关键词 "${query}"`,
          data: { matches: [] },
        }
      }

      const lines = [
        `### 🔍 找到 ${matches.length} 处匹配点 (关键词: "${query}"):`,
        '',
        ...matches.map((m, idx) => {
          const loc = m.locator
          return `${idx + 1}. **[第 ${loc.page} 页 §${loc.section}]** (偏移: ${loc.charOffset})\n   > "${m.snippet}"`
        }),
        '',
        '💡 *可以直接将以上定位信息填入 `research_evidence` 的 `locator` 参数中。*',
      ]

      return {
        content: lines.join('\n'),
        data: { matches },
      }
    }

    return {
      content: `Error: Unsupported research_document action "${action}". Supported: inspect, read_section, locate_text, ingest`,
      isError: true,
    }
  } catch (err) {
    return {
      content: `文献处理失败: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    }
  }
}

