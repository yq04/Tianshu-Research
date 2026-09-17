/**
 * Research Evidence Gateway for tianshu-research.
 * Provides unified interface for managing sources, exact locators, document ingest, and claims in Evidence Ledger.
 */

import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import {
  addClaim,
  addEvidence,
  addSource,
  getLedgerSummary,
  queryEvidence,
  exportCslJson,
  exportRis,
} from './ledger/evidence-ledger.js'
import {
  verifyEvidenceLedger,
  renderVerificationReport,
} from './gates/scientific-verifier.js'
import { ingestDocument, loadDocument, readSection } from './document/document-parser.js'

const WRITE_ACTIONS = ['add_source', 'add_evidence', 'add_claim', 'ingest_document', 'export_csl_json', 'export_ris']

export async function runResearchEvidence(params = {}) {
  const action = typeof params.action === 'string' ? params.action.trim() : ''
  const workspace = params.workspace ? resolve(params.workspace) : process.cwd()

  if (WRITE_ACTIONS.includes(action)) {
    if (!params.workspace || !isAbsolute(params.workspace)) {
      return {
        content: 'Error: workspace must be an explicit absolute path to the project directory for writing research data.',
        isError: true,
      }
    }
  }

  try {
    if (action === 'ingest_document') {
      const docId = params.docId || params.id
      if (!docId) {
        return { content: 'Error: docId is required for ingest_document', isError: true }
      }

      let contentToIngest = params.text
      if (!contentToIngest && params.sourcePath) {
        const resolvedPath = isAbsolute(params.sourcePath) ? params.sourcePath : resolve(workspace, params.sourcePath)
        if (!existsSync(resolvedPath)) {
          return { content: 'Error: sourcePath "' + params.sourcePath + '" not found', isError: true }
        }
        if (resolvedPath.toLowerCase().endsWith('.pdf')) {
          return { content: 'Error: 检测到 PDF 文件扩展名。本插件不直接解析二进制 PDF，请使用天枢内置 pdf_read 提取文本后再导入。', isError: true }
        }
        contentToIngest = readFileSync(resolvedPath, 'utf8')
      }

      if (!contentToIngest) {
        return { content: 'Error: text or valid sourcePath is required for ingest_document', isError: true }
      }

      if (typeof contentToIngest === 'string' && contentToIngest.trim().startsWith('%PDF-')) {
        return { content: 'Error: 检测到 PDF 格式。本插件不直接解析二进制 PDF，请使用天枢内置 pdf_read 提取文本后再导入。', isError: true }
      }

      const record = ingestDocument(workspace, docId, contentToIngest, {
        title: params.title,
        doi: params.doi,
        arxivId: params.arxivId,
        authors: params.authors,
        sourcePath: params.sourcePath,
      })

      return {
        content: '✅ 论文材料已导入索引库 [' + record.id + ']: 《' + record.meta.title + '》\n字符数: ' + record.meta.characters + ', 章节数: ' + record.meta.sections.length,
        data: record.meta,
      }
    }

    if (action === 'add_source') {
      const sourceData = params.source || params
      const record = addSource(workspace, sourceData)
      const yearStr = record.year ? ' (' + record.year + ')' : ''
      const docStr = record.documentId ? ' [文档: ' + record.documentId + ']' : ''
      return {
        content: '✅ 已录入参考文献 [' + record.id + ']: 《' + record.title + '》' + yearStr + docStr,
        data: record,
      }
    }

    if (action === 'add_evidence') {
      const evidenceData = params.evidence || params
      const record = addEvidence(workspace, evidenceData)
      const locParts = []
      if (record.locator?.page) locParts.push('p.' + record.locator.page)
      if (record.locator?.section) locParts.push('§' + record.locator.section)
      if (record.locator?.lineStart) locParts.push('L' + record.locator.lineStart + (record.locator.lineEnd ? '-' + record.locator.lineEnd : ''))
      if (record.locator?.charOffset !== undefined) locParts.push('char:' + record.locator.charOffset)
      if (record.locator?.equation) locParts.push('Eq.' + record.locator.equation)
      if (record.locator?.figure) locParts.push('Fig.' + record.locator.figure)
      if (record.locator?.table) locParts.push('Tab.' + record.locator.table)
      const locStr = locParts.length > 0 ? ' @ ' + locParts.join(', ') : ''
      return {
        content: '✅ 已记录证据片段 [' + record.id + '] -> 关联文献 [' + record.sourceId + ']' + locStr + '\n摘录: "' + record.excerpt + '"',
        data: record,
      }
    }

    if (action === 'add_claim') {
      const claimData = params.claim || params
      const record = addClaim(workspace, claimData)
      return {
        content: '✅ 已创建科学主张 [' + record.id + ']: "' + record.statement + '"\n支撑证据: ' + record.evidenceIds.join(', ') + ' (状态: ' + record.status + ')',
        data: record,
      }
    }

    if (action === 'query_evidence') {
      const filterData = params.filter || params
      const results = queryEvidence(workspace, filterData)
      if (results.length === 0) {
        return {
          content: '未找到匹配的证据片段。',
          data: { count: 0, items: [] },
        }
      }
      const lines = [
        '### 检索到 ' + results.length + ' 条证据记录:',
        '',
        ...results.map((r, i) => {
          const locParts = []
          if (r.locator?.page) locParts.push('p.' + r.locator.page)
          if (r.locator?.section) locParts.push('§' + r.locator.section)
          if (r.locator?.lineStart) locParts.push('L' + r.locator.lineStart + (r.locator.lineEnd ? '-' + r.locator.lineEnd : ''))
          if (r.locator?.charOffset !== undefined) locParts.push('char:' + r.locator.charOffset)
          if (r.locator?.equation) locParts.push('Eq.' + r.locator.equation)
          if (r.locator?.figure) locParts.push('Fig.' + r.locator.figure)
          if (r.locator?.table) locParts.push('Tab.' + r.locator.table)
          const locStr = locParts.length > 0 ? ' (' + locParts.join(', ') + ')' : ''
          return (i + 1) + '. **[' + r.id + ']** [来源: ' + r.sourceId + locStr + '] [关系: ' + r.relation + ']\n   > "' + r.excerpt + '"'
        }),
      ]
      return {
        content: lines.join('\n'),
        data: { count: results.length, items: results },
      }
    }

    if (action === 'get_summary') {
      const summary = getLedgerSummary(workspace)
      const lines = [
        '### 证据账本统计总览 (Evidence Ledger Summary)',
        '',
        '- 参考文献 (Sources): ' + summary.sourcesCount + ' 篇',
        '- 证据片段 (Evidence): ' + summary.evidenceCount + ' 条',
        '- 科学主张 (Claims): ' + summary.claimsCount + ' 项',
      ]
      return {
        content: lines.join('\n'),
        data: summary,
      }
    }

    if (action === 'verify_ledger') {
      const result = verifyEvidenceLedger(workspace, { locatorThreshold: params.locatorThreshold })
      return {
        content: renderVerificationReport(result),
        data: result,
      }
    }

    if (action === 'read_section') {
      const docId = params.docId || params.id
      if (!docId) {
        return { content: 'Error: docId is required for read_section', isError: true }
      }
      const sectionSelector = params.section ?? params.sectionName ?? params.heading
      if (sectionSelector === undefined || sectionSelector === null || String(sectionSelector).trim() === '') {
        return { content: 'Error: section (title, keyword, or index) is required for read_section', isError: true }
      }

      const loaded = loadDocument(workspace, docId)
      if (!loaded || !loaded.parsed) {
        return { content: 'Error: Document "' + docId + '" not found in ' + workspace, isError: true }
      }

      const sec = readSection(loaded.parsed, sectionSelector)
      const maxChars = Math.min(4000, Math.max(200, Number(params.maxChars) || 2000))
      const offset = Math.max(0, Number(params.offset) || 0)
      const fullText = sec.content || ''
      const sliced = fullText.slice(offset, offset + maxChars)
      const hasMore = fullText.length > offset + maxChars
      const docTitle = loaded.meta?.title || loaded.parsed.title || docId

      const lines = [
        '### 《' + docTitle + '》 § ' + sec.title,
        '- 文档标识: ' + docId,
        '- 章节位置: index ' + sec.index + (sec.lineStart ? ', L' + sec.lineStart + '-L' + sec.lineEnd : '') + (sec.charStart !== undefined ? ', char: ' + sec.charStart + '-' + sec.charEnd : ''),
        '- 字符范围: ' + offset + ' - ' + (offset + sliced.length) + ' / ' + fullText.length + (hasMore ? ' (已截断至上限 ' + maxChars + ' 字符，可通过 offset 继续读取)' : ''),
        '',
        sliced,
      ]

      return {
        content: lines.join('\n'),
        data: {
          docId,
          section: sec.title,
          index: sec.index,
          charStart: sec.charStart,
          charEnd: sec.charEnd,
          lineStart: sec.lineStart,
          lineEnd: sec.lineEnd,
          totalChars: fullText.length,
          returnedChars: sliced.length,
          hasMore,
          text: sliced,
        },
      }
    }

    if (action === 'export_csl_json') {
      const result = exportCslJson(workspace, params.outputPath)
      return {
        content: '✅ 已导出 ' + result.count + ' 篇文献至 CSL-JSON: ' + result.filePath,
        data: result,
      }
    }

    if (action === 'export_ris') {
      const result = exportRis(workspace, params.outputPath)
      return {
        content: '✅ 已导出 ' + result.count + ' 篇文献至 RIS 格式: ' + result.filePath,
        data: result,
      }
    }

    return {
      content: 'Error: Unsupported research_evidence action "' + action + '". Supported actions: add_source, add_evidence, add_claim, query_evidence, get_summary, verify_ledger, ingest_document, read_section, export_csl_json, export_ris',
      isError: true,
    }
  } catch (err) {
    return {
      content: '证据账本操作失败: ' + (err instanceof Error ? err.message : String(err)),
      isError: true,
    }
  }
}
