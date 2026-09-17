/**
 * Research Evidence Gateway for tianshu-research.
 * Provides unified interface for managing sources, exact locators, and claims in Evidence Ledger.
 */

import {
  addClaim,
  addEvidence,
  addSource,
  getLedgerSummary,
  queryEvidence,
} from './ledger/evidence-ledger.js'
import {
  verifyEvidenceLedger,
  renderVerificationReport,
} from './gates/scientific-verifier.js'

export async function runResearchEvidence(params = {}) {
  const action = typeof params.action === 'string' ? params.action.trim() : ''
  const workspace = params.workspace || process.cwd()

  try {
    if (action === 'add_source') {
      const sourceData = params.source || params
      const record = addSource(workspace, sourceData)
      const yearStr = record.year ? ` (${record.year})` : ''
      return {
        content: `✅ 已录入参考文献 [${record.id}]: 《${record.title}》${yearStr}`,
        data: record,
      }
    }

    if (action === 'add_evidence') {
      const evidenceData = params.evidence || params
      const record = addEvidence(workspace, evidenceData)
      const locParts = []
      if (record.locator?.page) locParts.push(`p.${record.locator.page}`)
      if (record.locator?.section) locParts.push(`§${record.locator.section}`)
      if (record.locator?.equation) locParts.push(`Eq.${record.locator.equation}`)
      if (record.locator?.figure) locParts.push(`Fig.${record.locator.figure}`)
      if (record.locator?.table) locParts.push(`Tab.${record.locator.table}`)
      const locStr = locParts.length > 0 ? ` @ ${locParts.join(', ')}` : ''
      return {
        content: `✅ 已记录证据片段 [${record.id}] -> 关联文献 [${record.sourceId}]${locStr}\n摘录: "${record.excerpt}"`,
        data: record,
      }
    }

    if (action === 'add_claim') {
      const claimData = params.claim || params
      const record = addClaim(workspace, claimData)
      return {
        content: `✅ 已创建科学主张 [${record.id}]: "${record.statement}"\n支撑证据: ${record.evidenceIds.join(', ')} (状态: ${record.status})`,
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
        `### 检索到 ${results.length} 条证据记录:`,
        '',
        ...results.map((r, i) => {
          const locParts = []
          if (r.locator?.page) locParts.push(`p.${r.locator.page}`)
          if (r.locator?.section) locParts.push(`§${r.locator.section}`)
          if (r.locator?.equation) locParts.push(`Eq.${r.locator.equation}`)
          if (r.locator?.figure) locParts.push(`Fig.${r.locator.figure}`)
          if (r.locator?.table) locParts.push(`Tab.${r.locator.table}`)
          const locStr = locParts.length > 0 ? ` (${locParts.join(', ')})` : ''
          return `${i + 1}. **[${r.id}]** [来源: ${r.sourceId}${locStr}] [关系: ${r.relation}]\n   > "${r.excerpt}"`
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
        `- 参考文献 (Sources): ${summary.sourcesCount} 篇`,
        `- 证据片段 (Evidence): ${summary.evidenceCount} 条`,
        `- 科学主张 (Claims): ${summary.claimsCount} 项`,
      ]
      return {
        content: lines.join('\n'),
        data: summary,
      }
    }

    if (action === 'verify_ledger') {
      const result = verifyEvidenceLedger(workspace)
      return {
        content: renderVerificationReport(result),
        data: result,
      }
    }

    return {
      content: `Error: Unsupported research_evidence action "${action}". Supported actions: add_source, add_evidence, add_claim, query_evidence, get_summary, verify_ledger`,
      isError: true,
    }
  } catch (err) {
    return {
      content: `证据账本操作失败: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    }
  }
}
