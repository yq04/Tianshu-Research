/**
 * Scientific Gate & Evidence Verifier for tianshu-research.
 * Audits the relational integrity, exact locator coverage, and assertion soundness of the Evidence Ledger.
 */

import { getSources, getEvidenceList, getClaims } from '../ledger/evidence-ledger.js'

export function verifyEvidenceLedger(workspace = process.cwd()) {
  const sources = getSources(workspace)
  const evidenceList = getEvidenceList(workspace)
  const claims = getClaims(workspace)

  const sourceIdSet = new Set(sources.map(s => s.id))
  const evidenceIdSet = new Set(evidenceList.map(e => e.id))
  const evidenceMap = new Map(evidenceList.map(e => [e.id, e]))

  const violations = []
  let locatorCount = 0

  // 1. Audit Evidence
  for (const ev of evidenceList) {
    // Referential check: sourceId
    if (!sourceIdSet.has(ev.sourceId)) {
      violations.push({
        severity: 'error',
        type: 'orphan_evidence',
        id: ev.id,
        message: `Evidence [${ev.id}] references non-existent sourceId "${ev.sourceId}".`,
      })
    }

    // Locator completeness check
    const loc = ev.locator || {}
    const hasLocator = Boolean(loc.page || loc.section || loc.equation || loc.figure || loc.table)
    if (hasLocator) {
      locatorCount++
    } else {
      violations.push({
        severity: 'warning',
        type: 'missing_locator',
        id: ev.id,
        message: `Evidence [${ev.id}] is missing an exact locator (page, section, equation, figure, or table).`,
      })
    }

    // Excerpt quality check
    const excerpt = typeof ev.excerpt === 'string' ? ev.excerpt.trim() : ''
    if (excerpt.length < 15) {
      violations.push({
        severity: 'warning',
        type: 'short_excerpt',
        id: ev.id,
        message: `Evidence [${ev.id}] excerpt is too short (${excerpt.length} chars); should contain substantive quoted content.`,
      })
    }
  }

  // 2. Audit Claims
  let verifiedClaimsCount = 0
  for (const claim of claims) {
    if (claim.status === 'verified') {
      verifiedClaimsCount++
    }

    // Check evidenceIds existence
    const eids = Array.isArray(claim.evidenceIds) ? claim.evidenceIds : []
    if (eids.length === 0) {
      violations.push({
        severity: 'error',
        type: 'orphan_claim',
        id: claim.id,
        message: `Claim [${claim.id}] does not cite any evidence IDs.`,
      })
    } else {
      let hasSupporting = false
      for (const eid of eids) {
        if (!evidenceIdSet.has(eid)) {
          violations.push({
            severity: 'error',
            type: 'missing_cited_evidence',
            id: claim.id,
            message: `Claim [${claim.id}] cites missing evidenceId "${eid}".`,
          })
        } else {
          const ev = evidenceMap.get(eid)
          if (ev && ev.relation !== 'contradicts') {
            hasSupporting = true
          }
        }
      }

      // If claim is marked verified, it must have at least one supporting evidence
      if (claim.status === 'verified' && !hasSupporting) {
        violations.push({
          severity: 'error',
          type: 'unsupported_verified_claim',
          id: claim.id,
          message: `Claim [${claim.id}] is marked "verified" but lacks supporting evidence.`,
        })
      }
    }

    // Check for unresolved placeholder text in verified statements
    if (claim.status === 'verified') {
      const stmt = typeof claim.statement === 'string' ? claim.statement : ''
      const placeholders = ['TODO', '未读全文', '无法判断', 'TBD']
      for (const p of placeholders) {
        if (stmt.includes(p)) {
          violations.push({
            severity: 'warning',
            type: 'unresolved_placeholder_in_claim',
            id: claim.id,
            message: `Verified claim [${claim.id}] contains placeholder "${p}".`,
          })
        }
      }
    }
  }

  const errors = violations.filter(v => v.severity === 'error')
  const warnings = violations.filter(v => v.severity === 'warning')
  const locatorRate = evidenceList.length > 0 ? (locatorCount / evidenceList.length) : 1.0

  return {
    passed: errors.length === 0,
    metrics: {
      sourcesCount: sources.length,
      evidenceCount: evidenceList.length,
      claimsCount: claims.length,
      verifiedClaimsCount,
      locatorCoverageRate: Math.round(locatorRate * 100) / 100,
      errorsCount: errors.length,
      warningsCount: warnings.length,
    },
    violations,
  }
}

export function renderVerificationReport(result) {
  const { passed, metrics, violations } = result
  const lines = [
    '### 科学证据门禁审查报告 (Scientific Gate Audit Report)',
    '',
    passed ? '✅ **门禁审查通过 (PASS)**: 证据链完整，无悬空引用。' : '❌ **门禁审查未通过 (FAIL)**: 发现关键断言或证据链阻断违规。',
    '',
    '#### 📊 核心指标',
    `- 参考文献总数 (Sources): ${metrics.sourcesCount}`,
    `- 证据片段总数 (Evidence): ${metrics.evidenceCount}`,
    `- 科学主张总数 (Claims): ${metrics.claimsCount} (其中 Verified: ${metrics.verifiedClaimsCount})`,
    `- 精准定位覆盖率 (Locator Coverage): ${Math.round(metrics.locatorCoverageRate * 100)}%`,
    `- 阻断性违规 (Errors): ${metrics.errorsCount}`,
    `- 改进型警告 (Warnings): ${metrics.warningsCount}`,
  ]

  if (violations.length > 0) {
    lines.push('', '#### 🔍 详细违规清单')
    for (const v of violations) {
      const icon = v.severity === 'error' ? '🔴 [ERROR]' : '🟡 [WARN]'
      lines.push(`- ${icon} ${v.message}`)
    }
  }

  return lines.join('\n')
}

