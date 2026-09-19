/**
 * Research status diagnostic tool for tianshu-research.
 * Reports workspace paths, evidence ledger counts, search engine status, palette readiness, and scope metadata.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getLedgerSummary, getResearchDir } from '../ledger/evidence-ledger.js'
import { ROLES } from '../tool-contracts.js'
import { resolveWorkspaceScope } from '../scope/workspace-scope.js'

export function runResearchStatus(params = {}, context = {}) {
  const scope = context?.scope || (params.workspace ? resolveWorkspaceScope({ workspace: params.workspace }) : null)
  const workspace = params.workspace ? resolve(params.workspace) : (scope?.canonicalRoot || process.cwd())
  const researchDir = getResearchDir(workspace)
  const dirExists = existsSync(researchDir)
  const summary = getLedgerSummary(workspace)

  const lines = [
    '### 天枢科研运行状态 (Tianshu-Research Status)',
    '',
    `- **工作区路径 (Workspace)**: \`${workspace}\``,
  ]

  if (scope) {
    lines.push(
      `- **授权作用域 (Scope ID)**: \`${scope.scopeId}\``,
      `- **信任级别 (Trust Level)**: \`${scope.trust}\``,
      `- **科研资格 (Eligibility)**: ${scope.isResearchEligible ? '具备 (Eligible)' : '未启用 / 休眠 (Dormant)'}`,
      `- **允许能力 (Capabilities)**: ${scope.configuredCapabilities.join(', ')}`
    )
  }

  lines.push(
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
  )

  return {
    content: lines.join('\n'),
    data: {
      workspace,
      scope: scope ? {
        scopeId: scope.scopeId,
        canonicalRoot: scope.canonicalRoot,
        trust: scope.trust,
        isResearchEligible: scope.isResearchEligible,
        capabilities: scope.configuredCapabilities,
        policyRevision: scope.policyRevision,
      } : null,
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
