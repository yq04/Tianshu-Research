/**
 * Scientific Gate & Evidence Verifier for tianshu-research.
 * Audits the relational integrity, exact locator coverage, and assertion soundness of the Evidence Ledger.
 */

import { getSources, getEvidenceList, getClaims } from '../ledger/evidence-ledger.js'
import { loadDocument } from '../document/document-parser.js'

export const DEFAULT_LOCATOR_THRESHOLD = 0.9

export function verifyEvidenceLedger(workspace = process.cwd(), options = {}) {
  const locatorThreshold = typeof options.locatorThreshold === 'number'
    ? Math.max(0, Math.min(1, options.locatorThreshold))
    : DEFAULT_LOCATOR_THRESHOLD

  const sources = getSources(workspace)
  const evidenceList = getEvidenceList(workspace)
  const claims = getClaims(workspace)

  const violations = []

  // 0. Audit file read errors (corrupted JSONL lines)
  const checkReadErrors = (list, name) => {
    if (Array.isArray(list.readErrors) && list.readErrors.length > 0) {
      for (const err of list.readErrors) {
        violations.push({
          severity: 'error',
          type: 'ledger_read_error',
          message: 'Corrupted line in ' + name + ' (line ' + err.line + '): ' + err.error,
        })
      }
    }
  }
  checkReadErrors(sources, 'sources.jsonl')
  checkReadErrors(evidenceList, 'evidence.jsonl')
  checkReadErrors(claims, 'claims.jsonl')

  // Check duplicate IDs within each file
  const checkDuplicateIds = (list, entityName, type) => {
    const seen = new Set()
    for (const item of list) {
      if (seen.has(item.id)) {
        violations.push({
          severity: 'error',
          type,
          id: item.id,
          message: 'Duplicate ' + entityName + ' id: "' + item.id + '".',
        })
      }
      seen.add(item.id)
    }
  }
  checkDuplicateIds(sources, 'source', 'duplicate_source_id')
  checkDuplicateIds(evidenceList, 'evidence', 'duplicate_evidence_id')
  checkDuplicateIds(claims, 'claim', 'duplicate_claim_id')

  const sourceMap = new Map(sources.map(s => [s.id, s]))
  const evidenceMap = new Map(evidenceList.map(e => [e.id, e]))

  let locatorCount = 0
  let groundingChecked = 0
  let groundingMatched = 0
  let groundingSkipped = 0

  const docCache = new Map()

  // 1. Audit Evidence
  for (const ev of evidenceList) {
    // Referential check: sourceId
    const src = sourceMap.get(ev.sourceId)
    if (!src) {
      violations.push({
        severity: 'error',
        type: 'orphan_evidence',
        id: ev.id,
        message: 'Evidence [' + ev.id + '] references non-existent sourceId "' + ev.sourceId + '".',
      })
    }

    // Locator completeness check
    const loc = ev.locator || {}
    const hasLocator = Boolean(
      (loc.page !== undefined && loc.page > 0) ||
      loc.section ||
      loc.lineStart !== undefined ||
      loc.charOffset !== undefined ||
      loc.equation ||
      loc.figure ||
      loc.table
    )

    if (hasLocator) {
      locatorCount++
      ev.hasValidLocator = true
    } else {
      ev.hasValidLocator = false
      violations.push({
        severity: 'warning',
        type: 'missing_locator',
        id: ev.id,
        message: 'Evidence [' + ev.id + '] is missing an exact locator (section, line, charOffset, page, equation, figure, or table).',
      })
    }

    // Excerpt quality check
    const excerpt = typeof ev.excerpt === 'string' ? ev.excerpt.trim() : ''
    if (excerpt.length < 15) {
      violations.push({
        severity: 'warning',
        type: 'short_excerpt',
        id: ev.id,
        message: 'Evidence [' + ev.id + '] excerpt is too short (' + excerpt.length + ' chars); should contain substantive quoted content.',
      })
    }

    // Grounding check if source has an ingested documentId
    if (src && src.documentId) {
      groundingChecked++
      let docText = docCache.get(src.documentId)
      if (docText === undefined) {
        try {
          const loaded = loadDocument(workspace, src.documentId)
          docText = loaded.rawText
          docCache.set(src.documentId, docText)
        } catch (err) {
          docText = null
          docCache.set(src.documentId, null)
        }
      }

      if (docText === null) {
        violations.push({
          severity: 'error',
          type: 'missing_ingested_document',
          id: ev.id,
          message: 'Evidence [' + ev.id + '] source references documentId "' + src.documentId + '" which cannot be loaded in workspace.',
        })
      } else {
        const normDoc = docText.replace(/\s+/g, ' ').toLowerCase()
        const normExcerpt = excerpt.replace(/\s+/g, ' ').toLowerCase()
        if (normDoc.includes(normExcerpt)) {
          groundingMatched++
          ev.grounded = true
        } else {
          violations.push({
            severity: 'error',
            type: 'ungrounded_excerpt',
            id: ev.id,
            message: 'Evidence [' + ev.id + '] excerpt was not found in ingested document "' + src.documentId + '".',
          })
        }
      }
    } else {
      groundingSkipped++
      violations.push({
        severity: 'warning',
        type: 'skipped_grounding',
        id: ev.id,
        message: 'Evidence [' + ev.id + '] source has no local documentId; text grounding skipped.',
      })
    }
  }

  // Check locator coverage threshold
  const rawLocatorRate = evidenceList.length > 0 ? (locatorCount / evidenceList.length) : 1.0
  if (evidenceList.length > 0 && rawLocatorRate < locatorThreshold) {
    violations.push({
      severity: 'error',
      type: 'low_locator_coverage',
      message: 'Locator coverage rate ' + Math.round(rawLocatorRate * 100) + '% is below required threshold ' + Math.round(locatorThreshold * 100) + '%.',
    })
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
        message: 'Claim [' + claim.id + '] does not cite any evidence IDs.',
      })
    } else {
      let hasSupporting = false
      let hasGroundedSupporting = false

      for (const eid of eids) {
        const ev = evidenceMap.get(eid)
        if (!ev) {
          violations.push({
            severity: 'error',
            type: 'missing_cited_evidence',
            id: claim.id,
            message: 'Claim [' + claim.id + '] cites missing evidenceId "' + eid + '".',
          })
        } else {
          if (ev.relation === 'supports') {
            hasSupporting = true
            if (ev.hasValidLocator && ev.grounded) {
              hasGroundedSupporting = true
            }
          }
        }
      }

      // Verified claim must have supporting evidence with locator and grounded excerpt
      if (claim.status === 'verified') {
        if (!hasSupporting) {
          violations.push({
            severity: 'error',
            type: 'unsupported_verified_claim',
            id: claim.id,
            message: 'Claim [' + claim.id + '] is marked "verified" but lacks supporting evidence with relation "supports".',
          })
        } else if (!hasGroundedSupporting) {
          violations.push({
            severity: 'error',
            type: 'unverified_evidence_backing',
            id: claim.id,
            message: 'Verified claim [' + claim.id + '] requires at least one grounded, located supporting evidence.',
          })
        }
      }
    }

    // Check for unresolved placeholder text
    const stmt = typeof claim.statement === 'string' ? claim.statement : ''
    const placeholders = ['TODO', 'TBD', '[citation needed]']
    for (const p of placeholders) {
      if (stmt.includes(p)) {
        if (claim.status === 'verified') {
          violations.push({
            severity: 'error',
            type: 'placeholder_in_verified_claim',
            id: claim.id,
            message: 'Verified claim [' + claim.id + '] contains placeholder "' + p + '".',
          })
        } else {
          violations.push({
            severity: 'warning',
            type: 'placeholder_in_claim',
            id: claim.id,
            message: 'Claim [' + claim.id + '] contains placeholder "' + p + '".',
          })
        }
      }
    }
  }

  const errors = violations.filter(v => v.severity === 'error')
  const warnings = violations.filter(v => v.severity === 'warning')

  const isEmpty = sources.length === 0 && evidenceList.length === 0 && claims.length === 0

  return {
    passed: errors.length === 0,
    isEmpty,
    metrics: {
      sourcesCount: sources.length,
      evidenceCount: evidenceList.length,
      claimsCount: claims.length,
      verifiedClaimsCount,
      locatorCoverageRate: Math.round(rawLocatorRate * 100) / 100,
      locatorThreshold,
      groundingChecked,
      groundingMatched,
      groundingSkipped,
      errorsCount: errors.length,
      warningsCount: warnings.length,
    },
    violations,
  }
}

export function renderVerificationReport(result) {
  const { passed, isEmpty, metrics, violations } = result
  const lines = [
    '### 科学证据门禁审查报告 (Scientific Gate Audit Report)',
    '',
  ]

  if (isEmpty) {
    lines.push('ℹ️ **尚无可核实主张 (No Claims Yet)**: 证据账本未录入记录，结构检查通过。')
  } else if (passed) {
    lines.push('✅ **门禁审查通过 (PASS)**: 证据链完整，定位符覆盖率达标，无未接通的验证声明。')
  } else {
    lines.push('❌ **门禁审查未通过 (FAIL)**: 发现阻断性违规，请修复后重新核实。')
  }

  lines.push(
    '',
    '#### 📊 核心指标',
    '- 参考文献总数 (Sources): ' + metrics.sourcesCount,
    '- 证据片段总数 (Evidence): ' + metrics.evidenceCount,
    '- 科学主张总数 (Claims): ' + metrics.claimsCount + ' (其中 Verified: ' + metrics.verifiedClaimsCount + ')',
    '- 精准定位覆盖率 (Locator Coverage): ' + Math.round(metrics.locatorCoverageRate * 100) + '% (要求 >= ' + Math.round(metrics.locatorThreshold * 100) + '%)',
    '- 材料全文核对 (Grounding): ' + metrics.groundingMatched + ' 处匹配 / ' + metrics.groundingChecked + ' 处核验 (' + metrics.groundingSkipped + ' 处未导入全文跳过)',
    '- 阻断性违规 (Errors): ' + metrics.errorsCount,
    '- 改进型警告 (Warnings): ' + metrics.warningsCount,
  )

  if (violations.length > 0) {
    lines.push('', '#### 🔍 详细违规清单')
    for (const v of violations) {
      const icon = v.severity === 'error' ? '🔴 [ERROR]' : '🟡 [WARN]'
      lines.push('- ' + icon + ' ' + v.message)
    }
  }

  lines.push('', '*注：门禁仅核实账本引用结构、摘录存在性与定位完整性；不替代同行评议与科学真理判断。*')

  return lines.join('\n')
}
