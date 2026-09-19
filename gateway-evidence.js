/**
 * Research Evidence Gateway for tianshu-research.
 * Provides unified interface for managing sources, typed scientific evidence (v2),
 * operations dispatch, reproducible workflow planning, and composable scientific gates.
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import {
  addClaim,
  addEvidence,
  addSource,
  getLedgerSummary,
  queryEvidence,
  exportCslJson,
  exportRis,
} from './ledger/evidence-ledger.js';
import {
  addEvidenceV2,
  addClaimV2,
  getEvidenceV2,
  getClaimV2,
  listEvidenceV2,
  listClaimsV2,
  getLedgerV2Summary,
} from './ledger/evidence-v2.js';
import { getAllEvidenceCombined, getAllClaimsCombined } from './ledger/legacy-adapter.js';
import { saveArtifact } from './ledger/artifact-store.js';
import { getOperationDescriptor, listOperationDescriptors } from './contracts/operations.js';
import { dispatchOperation } from './operations/dispatcher.js';
import { aggregateGateReport, renderGateReport } from './gates/report.js';
import { evaluateProjectGates } from './gates/evaluator.js';
import {
  verifyEvidenceLedger,
  renderVerificationReport,
} from './gates/scientific-verifier.js';
import { ingestDocument, loadDocument, readSection } from './document/document-parser.js';
import { assertInvocationAuthorized } from './scope/invocation-guard.js';
import { createResearchTaskSpec } from './workflows/task-spec.js';
import { routeResearchTask } from './workflows/router.js';
import { ResearchWorkflowStore } from './workflows/store.js';
import { WorkflowScheduler } from './workflows/scheduler.js';
import { createOperationGraph } from './workflows/graph.js';


const WRITE_ACTIONS = [
  'add_source',
  'add_evidence',
  'add_claim',
  'ingest_document',
  'export_csl_json',
  'export_ris',
  'execute_operation',
];

export async function runResearchEvidence(params = {}, context = {}) {
  const action = typeof params.action === 'string' ? params.action.trim() : '';
  const workspace = params.workspace ? resolve(params.workspace) : process.cwd();

  if (WRITE_ACTIONS.includes(action)) {
    if (!params.workspace || !isAbsolute(params.workspace)) {
      return {
        content: 'Error: workspace must be an explicit absolute path to the project directory for writing research data.',
        isError: true,
      };
    }
  }

  try {
    assertInvocationAuthorized('research_evidence', action, params, context);

    // --- 1. DESCRIBE OPERATION ---
    if (action === 'describe_operation') {
      const opId = params.operationId || params.id;
      if (!opId) {
        return { content: 'Error: operationId is required for describe_operation', isError: true };
      }
      const desc = getOperationDescriptor(opId);
      if (!desc) {
        return {
          content: 'Error: Operation "' + opId + '" not found in authoritative catalogue.',
          isError: true,
        };
      }
      const lines = [
        '### Operation: ' + desc.id,
        '- 领域能力: ' + desc.capability,
        '- 概述: ' + desc.summary,
        '- 执行模式: ' + desc.execution,
        '- 副作用: ' + desc.effects.join(', '),
        '- 依赖项: ' + (desc.dependencies.length > 0 ? desc.dependencies.join(', ') : '无 (zero-dependency)'),
        '',
        '#### Input Schema:',
        JSON.stringify(desc.inputSchema, null, 2),
        '',
        '#### Output Schema:',
        JSON.stringify(desc.outputSchema, null, 2),
      ];
      return {
        content: lines.join('\n'),
        data: desc,
      };
    }

    // --- 2. EXECUTE OPERATION ---
    if (action === 'execute_operation') {
      const opId = params.operationId || params.id;
      if (!opId) {
        return { content: 'Error: operationId is required for execute_operation', isError: true };
      }
      const args = params.arguments || params.args || {};
      const result = await dispatchOperation(opId, args, {
        workspace,
        scope: context?.scope,
      });

      if (params.persist && result.measurements) {
        try {
          const art = saveArtifact(workspace, JSON.stringify(result.measurements, null, 2), {
            kind: 'metrics',
            mediaType: 'application/json',
            filename: 'operation_result.json',
          });
          result.artifacts = result.artifacts || [];
          result.artifacts.push(art);
        } catch {}
      }

      const icon = result.status === 'completed' ? '✅ ' : (result.status === 'blocked' ? '🚫 ' : '❌ ');
      const content = icon + '[' + opId + '] ' + result.summary + (result.issues?.length > 0 ? '\n问题: ' + result.issues.map(i => i.message).join('; ') : '');

      return {
        content,
        data: result,
        isError: result.status === 'failed' || result.status === 'blocked',
      };
    }

    // --- 3. PLAN WORKFLOW ---
    if (action === 'plan_workflow') {
      const taskSpec = createResearchTaskSpec({
        taskId: params.taskId,
        objective: params.objective || params.statement || params.title || '',
        explicitParadigm: params.explicitParadigm || params.paradigm,
        inputs: params.inputs,
        deliverables: params.deliverables,
        persistence: params.persistence,
        budgets: params.budgets,
      });

      const decision = routeResearchTask(taskSpec, { workspace });
      const graph = createOperationGraph(decision);

      const plan = {
        taskId: taskSpec.taskId,
        objective: taskSpec.objective,
        primary: decision.primary,
        supporting: decision.supporting,
        reasonCodes: decision.reasonCodes,
        missingInputs: decision.missingInputs,
        operations: decision.operations,
        requiredGates: decision.requiredGates,
        executionOrder: graph.getExecutionOrder(),
        graph: graph.toJSON(),
        summary: 'Planned research route for [' + decision.primary + ']: ' + taskSpec.objective,
      };

      const lines = [
        '### 科学工作流规划 (Scientific Workflow Plan)',
        '- 任务标识: ' + taskSpec.taskId,
        '- 目标: ' + taskSpec.objective,
        '- 首选范式: ' + decision.primary,
        '- 辅助范式: ' + (decision.supporting.length > 0 ? decision.supporting.join(', ') : '无'),
        '- 路由依据: ' + decision.reasonCodes.join(', '),
        '- 推荐操作序列: ' + decision.operations.join(' -> '),
        '- 拓扑执行序: ' + plan.executionOrder.join(' -> '),
        '- 适用科学门禁: ' + decision.requiredGates.join(', '),
      ];

      if (decision.missingInputs.length > 0) {
        lines.push('- 待补充输入: ' + decision.missingInputs.join(', '));
      }

      if (taskSpec.persistence !== 'none') {
        try {
          const store = new ResearchWorkflowStore({ workspace, taskId: taskSpec.taskId });
          store.appendEvent({
            kind: 'TASK_CREATED',
            revision: 1,
            payload: {
              taskSpec,
              decision,
              graph: graph.toJSON(),
              budgets: taskSpec.budgets,
            },
          });
        } catch {
          // Persistence initialization error is non-fatal for pure planning
        }
      }

      return {
        content: lines.join(String.fromCharCode(10)),
        data: plan,
      };
    }

    // --- 3.1 PATCH WORKFLOW ---
    if (action === 'patch_workflow') {
      const taskId = params.taskId;
      const store = new ResearchWorkflowStore({ workspace, taskId });
      store.loadEvents();
      const patchResult = store.applyPatch(params.patch);
      return {
        content: '✅ 已应用图补丁至任务 ' + taskId + ' (Revision ' + patchResult.baseRevision + ' -> ' + patchResult.newRevision + ')',
        data: patchResult,
      };
    }

    // --- 3.2 STEP WORKFLOW ---
    if (action === 'step_workflow') {
      const taskId = params.taskId;
      const scheduler = await WorkflowScheduler.resumeWorkflow(taskId, { workspace });
      const steps = typeof params.steps === 'number' && params.steps > 0 ? params.steps : 1;
      let lastResult = null;
      for (let i = 0; i < steps; i++) {
        lastResult = await scheduler.step();
        if (lastResult.stopped) break;
      }
      return {
        content: 'Workflow step for ' + taskId + ': ' + (lastResult?.stopped ? 'stopped' : 'progressed'),
        data: lastResult,
      };
    }

    // --- 3.3 RESUME WORKFLOW ---
    if (action === 'resume_workflow') {
      const taskId = params.taskId;
      const scheduler = await WorkflowScheduler.resumeWorkflow(taskId, { workspace });
      const runResult = await scheduler.runToCompletion();
      return {
        content: 'Workflow resumed for task ' + taskId + ' with status: ' + runResult.status,
        data: runResult,
      };
    }

    // --- 3.4 PROVIDE HUMAN INPUT ---
    if (action === 'provide_human_input') {
      const taskId = params.taskId;
      const scheduler = await WorkflowScheduler.resumeWorkflow(taskId, { workspace });
      const inputResult = scheduler.provideHumanInput(params.nodeId, params.inputData);
      return {
        content: '✅ 已成功录入人工输入至节点 ' + params.nodeId + ' (Task: ' + taskId + ')',
        data: inputResult,
      };
    }

    // --- 3.5 GET WORKFLOW STATE ---
    if (action === 'get_workflow_state') {
      const taskId = params.taskId;
      const store = new ResearchWorkflowStore({ workspace, taskId });
      store.loadEvents();
      const state = store.getState();
      return {
        content: 'Workflow ' + taskId + ' state: revision=' + state.revision + ', status=' + state.status + ', events=' + state.eventCount,
        data: state,
      };
    }

    // --- 4. VERIFY PROJECT ---
    if (action === 'verify_project') {
      const evalRes = evaluateProjectGates(workspace, params);
      const report = evalRes.report;
      return {
        content: renderGateReport(report),
        data: report,
      };
    }

    // --- 5. INGEST DOCUMENT ---
    if (action === 'ingest_document') {
      const docId = params.docId || params.id;
      if (!docId) {
        return { content: 'Error: docId is required for ingest_document', isError: true };
      }

      let contentToIngest = params.text;
      if (!contentToIngest && params.sourcePath) {
        const resolvedPath = isAbsolute(params.sourcePath) ? params.sourcePath : resolve(workspace, params.sourcePath);
        if (!existsSync(resolvedPath)) {
          return { content: 'Error: sourcePath "' + params.sourcePath + '" not found', isError: true };
        }
        if (resolvedPath.toLowerCase().endsWith('.pdf')) {
          return { content: 'Error: 检测到 PDF 文件扩展名。本插件不直接解析二进制 PDF，请使用天枢内置 pdf_read 提取文本后再导入。', isError: true };
        }
        contentToIngest = readFileSync(resolvedPath, 'utf8');
      }

      if (!contentToIngest) {
        return { content: 'Error: text or valid sourcePath is required for ingest_document', isError: true };
      }

      if (typeof contentToIngest === 'string' && contentToIngest.trim().startsWith('%PDF-')) {
        return { content: 'Error: 检测到 PDF 格式。本插件不直接解析二进制 PDF，请使用天枢内置 pdf_read 提取文本后再导入。', isError: true };
      }

      const record = ingestDocument(workspace, docId, contentToIngest, {
        title: params.title,
        doi: params.doi,
        arxivId: params.arxivId,
        authors: params.authors,
        sourcePath: params.sourcePath,
      });

      return {
        content: '✅ 论文材料已导入索引库 [' + record.id + ']: 《' + record.meta.title + '》\n字符数: ' + record.meta.characters + ', 章节数: ' + record.meta.sections.length,
        data: record.meta,
      };
    }

    // --- 6. ADD SOURCE ---
    if (action === 'add_source') {
      const sourceData = params.source || params;
      const record = addSource(workspace, sourceData);
      const yearStr = record.year ? ' (' + record.year + ')' : '';
      const docStr = record.documentId ? ' [文档: ' + record.documentId + ']' : '';
      return {
        content: '✅ 已录入参考文献 [' + record.id + ']: 《' + record.title + '》' + yearStr + docStr,
        data: record,
      };
    }

    // --- 7. ADD EVIDENCE (v1 + v2) ---
    if (action === 'add_evidence') {
      const evidenceData = params.evidence || params;
      // If evidence explicitly declares non-literature kind, or has no sourceId -> use v2 typed evidence
      if ((evidenceData.kind && evidenceData.kind !== 'literature') || !evidenceData.sourceId) {
        const record = addEvidenceV2(workspace, evidenceData);
        return {
          content: '✅ 已记录 [' + record.kind + '] 科学证据 [' + record.id + ']\n陈述/摘录: "' + (record.statement || record.excerpt) + '"',
          data: record,
        };
      }

      // Otherwise default to legacy literature evidence
      const record = addEvidence(workspace, evidenceData);
      const locParts = [];
      if (record.locator?.page) locParts.push('p.' + record.locator.page);
      if (record.locator?.section) locParts.push('§' + record.locator.section);
      if (record.locator?.lineStart) locParts.push('L' + record.locator.lineStart + (record.locator.lineEnd ? '-' + record.locator.lineEnd : ''));
      if (record.locator?.charOffset !== undefined) locParts.push('char:' + record.locator.charOffset);
      if (record.locator?.equation) locParts.push('Eq.' + record.locator.equation);
      if (record.locator?.figure) locParts.push('Fig.' + record.locator.figure);
      if (record.locator?.table) locParts.push('Tab.' + record.locator.table);
      const locStr = locParts.length > 0 ? ' @ ' + locParts.join(', ') : '';
      return {
        content: '✅ 已记录证据片段 [' + record.id + '] -> 关联文献 [' + record.sourceId + ']' + locStr + '\n摘录: "' + record.excerpt + '"',
        data: record,
      };
    }

    // --- 8. ADD CLAIM (v1 + v2) ---
    if (action === 'add_claim') {
      const claimData = params.claim || params;
      if ((claimData.kind && claimData.kind !== 'literature') || claimData.conclusion) {
        const record = addClaimV2(workspace, claimData);
        return {
          content: '✅ 已创建 [' + record.kind + '] 科学主张 [' + record.id + ']: "' + record.statement + '"\n支撑证据: ' + record.evidenceIds.join(', ') + ' (结论: ' + record.conclusion + ')',
          data: record,
        };
      }

      const record = addClaim(workspace, claimData);
      return {
        content: '✅ 已创建科学主张 [' + record.id + ']: "' + record.statement + '"\n支撑证据: ' + record.evidenceIds.join(', ') + ' (状态: ' + record.status + ')',
        data: record,
      };
    }

    // --- 9. QUERY EVIDENCE ---
    if (action === 'query_evidence') {
      const filterData = params.filter || params;
      const results = queryEvidence(workspace, filterData);
      const v2Results = listEvidenceV2(workspace, filterData);
      const combined = [...results, ...v2Results];

      if (combined.length === 0) {
        return {
          content: '未找到匹配的证据片段。',
          data: { count: 0, items: [] },
        };
      }
      const lines = [
        '### 检索到 ' + combined.length + ' 条证据记录:',
        '',
        ...combined.map((r, i) => {
          const kindStr = r.kind ? '[' + r.kind + '] ' : '';
          const locParts = [];
          if (r.locator?.page) locParts.push('p.' + r.locator.page);
          if (r.locator?.section) locParts.push('§' + r.locator.section);
          if (r.locator?.lineStart) locParts.push('L' + r.locator.lineStart + (r.locator.lineEnd ? '-' + r.locator.lineEnd : ''));
          if (r.locator?.charOffset !== undefined) locParts.push('char:' + r.locator.charOffset);
          if (r.locator?.equation) locParts.push('Eq.' + r.locator.equation);
          if (r.locator?.figure) locParts.push('Fig.' + r.locator.figure);
          if (r.locator?.table) locParts.push('Tab.' + r.locator.table);
          const locStr = locParts.length > 0 ? ' (' + locParts.join(', ') + ')' : '';
          return (i + 1) + '. **[' + r.id + ']** ' + kindStr + (r.sourceId ? '[来源: ' + r.sourceId + locStr + '] ' : '') + '[关系: ' + r.relation + ']\n   > "' + (r.excerpt || r.statement) + '"';
        }),
      ];
      return {
        content: lines.join('\n'),
        data: { count: combined.length, items: combined },
      };
    }

    // --- 10. GET SUMMARY ---
    if (action === 'get_summary') {
      const summary = getLedgerSummary(workspace);
      const v2Summary = getLedgerV2Summary(workspace);
      const totalEv = summary.evidenceCount + v2Summary.totalEvidence;
      const totalCl = summary.claimsCount + v2Summary.totalClaims;

      const lines = [
        '### 证据账本统计总览 (Evidence Ledger Summary)',
        '',
        '- 参考文献 (Sources): ' + summary.sourcesCount + ' 篇',
        '- 证据片段 (Evidence Total): ' + totalEv + ' 条 (文献: ' + summary.evidenceCount + ', 有类型v2: ' + v2Summary.totalEvidence + ')',
        '- 科学主张 (Claims Total): ' + totalCl + ' 项 (文献: ' + summary.claimsCount + ', 有类型v2: ' + v2Summary.totalClaims + ')',
      ];
      return {
        content: lines.join('\n'),
        data: {
          ...summary,
          v2: v2Summary,
          totalEvidence: totalEv,
          totalClaims: totalCl,
        },
      };
    }

    // --- 11. VERIFY LEDGER (Legacy) ---
    if (action === 'verify_ledger') {
      const result = verifyEvidenceLedger(workspace, { locatorThreshold: params.locatorThreshold });
      return {
        content: renderVerificationReport(result),
        data: result,
      };
    }

    // --- 12. READ SECTION ---
    if (action === 'read_section') {
      const docId = params.docId || params.id;
      if (!docId) {
        return { content: 'Error: docId is required for read_section', isError: true };
      }
      const sectionSelector = params.section ?? params.sectionName ?? params.heading;
      if (sectionSelector === undefined || sectionSelector === null || String(sectionSelector).trim() === '') {
        return { content: 'Error: section (title, keyword, or index) is required for read_section', isError: true };
      }

      const loaded = loadDocument(workspace, docId);
      if (!loaded || !loaded.parsed) {
        return { content: 'Error: Document "' + docId + '" not found in ' + workspace, isError: true };
      }

      const sec = readSection(loaded.parsed, sectionSelector);
      const maxChars = Math.min(4000, Math.max(200, Number(params.maxChars) || 2000));
      const offset = Math.max(0, Number(params.offset) || 0);
      const fullText = sec.content || '';
      const sliced = fullText.slice(offset, offset + maxChars);
      const hasMore = fullText.length > offset + maxChars;
      const docTitle = loaded.meta?.title || loaded.parsed.title || docId;

      const lines = [
        '### 《' + docTitle + '》 § ' + sec.title,
        '- 文档标识: ' + docId,
        '- 章节位置: index ' + sec.index + (sec.lineStart ? ', L' + sec.lineStart + '-L' + sec.lineEnd : '') + (sec.charStart !== undefined ? ', char: ' + sec.charStart + '-' + sec.charEnd : ''),
        '- 字符范围: ' + offset + ' - ' + (offset + sliced.length) + ' / ' + fullText.length + (hasMore ? ' (已截断至上限 ' + maxChars + ' 字符，可通过 offset 继续读取)' : ''),
        '',
        sliced,
      ];

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
      };
    }

    // --- 13. EXPORT CSL JSON ---
    if (action === 'export_csl_json') {
      const result = exportCslJson(workspace, params.outputPath);
      return {
        content: '✅ 已导出 ' + result.count + ' 篇文献至 CSL-JSON: ' + result.filePath,
        data: result,
      };
    }

    // --- 14. EXPORT RIS ---
    if (action === 'export_ris') {
      const result = exportRis(workspace, params.outputPath);
      return {
        content: '✅ 已导出 ' + result.count + ' 篇文献至 RIS 格式: ' + result.filePath,
        data: result,
      };
    }

    return {
      content: 'Error: Unsupported research_evidence action "' + action + '". Supported actions: add_source, add_evidence, add_claim, query_evidence, get_summary, verify_ledger, ingest_document, read_section, export_csl_json, export_ris, describe_operation, execute_operation, plan_workflow, verify_project, patch_workflow, step_workflow, resume_workflow, provide_human_input, get_workflow_state',
      isError: true,
    };
  } catch (err) {
    return {
      content: '证据账本操作失败: ' + (err instanceof Error ? err.message : String(err)),
      isError: true,
    };
  }
}
