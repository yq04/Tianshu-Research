/**
 * Research status diagnostic tool for tianshu-research.
 * Reports workspace paths, evidence ledger counts, search engine status, and palette readiness.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getLedgerSummary, getResearchDir } from '../ledger/evidence-ledger.js'
import { ROLES } from '../tool-contracts.js'

export function runResearchStatus(params = {}) {
  const workspace = params.workspace ? resolve(params.workspace) : process.cwd()
  const researchDir = getResearchDir(workspace)
  const dirExists = existsSync(researchDir)
  const summary = getLedgerSummary(workspace)

  const lines = [
    '### 天枢科研运行状态 (Tianshu-Research Status)',
    '',
    `- **工作区路径 (Workspace)**: \`${workspace}\``,
    '- **证据账本 (Evidence Ledger)**:',
    `  - 账本目录: \`${researchDir}\` (${dirExists ? '已创建' : '未初始化 / 随首次写入自动建立'})`,
    `  - 参考文献 (Sources): ${summary.sourcesCount} 篇`,
    `  - 证据片段 (Evidence): ${summary.evidenceCount} 条`,
    `  - 科学主张 (Claims): ${summary.claimsCount} 项`,
    '- **学术检索引擎 (Search Engines)**:',
    '  - arXiv: 已配置实现 (尚未探测 / unprobed)',
    '  - OpenAlex: 已配置实现 (尚未探测 / unprobed)',
    '- **可视化色板 (Figure Palettes)**:',
    `  - 顶刊配色库: 就绪 (100 套出版级配色，支持 ${ROLES.length} 类科学角色)`,
    '',
    '💡 **操作指引**:',
    '- 检索文献: `research_query` (action: "search_papers", query: "...")',
    '- 解析文献: `research_query` (action: "resolve_paper", id: "arXiv_ID 或 DOI")',
    '- 记录证据: `research_evidence` (action: "add_source" / "add_evidence" / "add_claim")',
  ]

  return {
    content: lines.join('\n'),
    data: {
      workspace,
      researchDir,
      ledger: summary,
      engines: {
        arxiv: 'unprobed',
        openalex: 'unprobed',
      },
      palettes: {
        count: 100,
        rolesCount: ROLES.length,
      },
    },
  }
}
