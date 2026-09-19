import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResearchTaskSpec, inferArtifactKind } from '../workflows/task-spec.js';
import { routeResearchTask, REASON_CODES } from '../workflows/router.js';
import { createOperationGraph } from '../workflows/graph.js';
import { runResearchEvidence } from '../gateway-evidence.js';

describe('Phase 5: Adaptive Scientific Workflow Router & Operation Graph', () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tianshu-router-test-'));
    mkdirSync(join(tmpDir, '.rivet'), { recursive: true });
    writeFileSync(join(tmpDir, '.rivet', 'research.json'), JSON.stringify({ enabled: true }), 'utf8');
  });

  after(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('TaskSpec normalization & artifact inference', () => {
    it('infers artifact kind correctly from extension', () => {
      assert.equal(inferArtifactKind('data.csv'), 'dataset');
      assert.equal(inferArtifactKind('experiment.tsv'), 'dataset');
      assert.equal(inferArtifactKind('dataset.parquet'), 'dataset');
      assert.equal(inferArtifactKind('train.py'), 'code');
      assert.equal(inferArtifactKind('benchmark.sh'), 'code');
      assert.equal(inferArtifactKind('navier_cauchy.sym'), 'formula');
      assert.equal(inferArtifactKind('equation.tex'), 'formula');
      assert.equal(inferArtifactKind('chart.png'), 'figure');
      assert.equal(inferArtifactKind('paper.pdf'), 'document');
    });

    it('normalizes task spec with sensible defaults', () => {
      const spec = createResearchTaskSpec({
        objective: 'Test normalization',
        inputs: ['wind_tunnel.csv', { relativePath: 'model.py', kind: 'code' }],
      });

      assert.ok(spec.taskId.startsWith('task_'));
      assert.equal(spec.objective, 'Test normalization');
      assert.equal(spec.inputs.length, 2);
      assert.equal(spec.inputs[0].kind, 'dataset');
      assert.equal(spec.inputs[1].kind, 'code');
      assert.equal(spec.persistence, 'artifacts');
      assert.equal(spec.budgets.maxIterations, 3);
    });
  });

  describe('Adaptive routing to five scientific paradigms', () => {
    it('prioritizes explicit paradigm override', () => {
      const spec = createResearchTaskSpec({
        objective: 'Analyze whatever data',
        explicitParadigm: 'theoretical',
      });
      const decision = routeResearchTask(spec);

      assert.equal(decision.primary, 'theoretical');
      assert.ok(decision.reasonCodes.includes(REASON_CODES.EXPLICIT_PARADIGM));
      assert.ok(decision.operations.includes('theory.dimension@1'));
    });

    it('routes dataset input directly to empirical paradigm with ZERO literature requests', () => {
      const spec = createResearchTaskSpec({
        objective: '清洗风洞数据并进行正态性检验与区间估计',
        inputs: ['wind_tunnel.csv'],
      });
      const decision = routeResearchTask(spec);

      assert.equal(decision.primary, 'empirical');
      assert.ok(decision.reasonCodes.includes(REASON_CODES.DATASET_INPUT_PRESENT) || decision.reasonCodes.includes(REASON_CODES.EMPIRICAL_OBJECTIVE_MATCH));

      // Strictly zero literature queries
      assert.ok(!decision.operations.includes('research_query.search_papers'));
      assert.ok(!decision.operations.includes('research_query.resolve_paper'));
      assert.ok(!decision.operations.includes('research_evidence.ingest_document'));

      // Contains empirical data operations & gates
      assert.ok(decision.operations.includes('data.inspect@1'));
      assert.ok(decision.operations.includes('statistics.compare@1'));
      assert.ok(decision.requiredGates.includes('data-quality'));
      assert.ok(decision.requiredGates.includes('statistical-validity'));
    });

    it('routes theoretical objective to theoretical paradigm with physical gates', () => {
      const spec = createResearchTaskSpec({
        objective: '推导 Navier-Stokes 柱坐标展开并验证量纲齐次性与无粘极限',
      });
      const decision = routeResearchTask(spec);

      assert.equal(decision.primary, 'theoretical');
      assert.ok(decision.reasonCodes.includes(REASON_CODES.THEORY_OBJECTIVE_MATCH));
      assert.ok(decision.operations.includes('theory.dimension@1'));
      assert.ok(decision.operations.includes('theory.symbolic@1'));
      assert.ok(decision.operations.includes('theory.limit@1'));
      assert.ok(decision.requiredGates.includes('dimensional-consistency'));
      assert.ok(decision.requiredGates.includes('symbolic-physical'));
    });

    it('routes benchmark objective to benchmark paradigm with reproducibility gates', () => {
      const spec = createResearchTaskSpec({
        objective: '对 ResNet 模型进行 3 组单变量消融实验评测与跑分',
        inputs: ['eval.py'],
      });
      const decision = routeResearchTask(spec);

      assert.equal(decision.primary, 'benchmark');
      assert.ok(decision.reasonCodes.includes(REASON_CODES.BENCHMARK_OBJECTIVE_MATCH));
      assert.ok(decision.operations.includes('benchmark.plan@1'));
      assert.ok(decision.operations.includes('benchmark.run@1'));
      assert.ok(decision.operations.includes('benchmark.compare@1'));
      assert.ok(decision.requiredGates.includes('benchmark-validity'));
      assert.ok(decision.requiredGates.includes('reproducibility'));
    });

    it('routes hypothesis conjecture to hypothesis loop paradigm', () => {
      const spec = createResearchTaskSpec({
        objective: '提出并快速验伪 PINN 物理损失权重衰减假设，支持非线性试错',
      });
      const decision = routeResearchTask(spec);

      assert.equal(decision.primary, 'hypothesis');
      assert.ok(decision.reasonCodes.includes(REASON_CODES.HYPOTHESIS_OBJECTIVE_MATCH));
      assert.ok(decision.operations.includes('hypothesis.formulate'));
      assert.ok(decision.operations.includes('hypothesis.test'));
      assert.ok(decision.operations.includes('hypothesis.evaluate'));
      assert.ok(decision.operations.includes('hypothesis.revise'));
    });

    it('routes paper survey objective to literature paradigm', () => {
      const spec = createResearchTaskSpec({
        objective: '检索并综述 arXiv 上关于量子退相干最新研究论文',
      });
      const decision = routeResearchTask(spec);

      assert.equal(decision.primary, 'literature');
      assert.ok(decision.reasonCodes.includes(REASON_CODES.LITERATURE_OBJECTIVE_MATCH));
      assert.ok(decision.operations.includes('research_query.search_papers'));
      assert.ok(decision.requiredGates.includes('literature-grounding'));
    });
  });

  describe('Operation Directed Acyclic Graph (DAG) & Lifecycle', () => {
    it('constructs valid DAG and computes topological execution order', () => {
      const spec = createResearchTaskSpec({
        objective: '清洗实验数据、拟合曲线并生成出版级图表',
        inputs: ['measurements.csv'],
      });
      const decision = routeResearchTask(spec);
      const graph = createOperationGraph(decision);

      const order = graph.getExecutionOrder();
      assert.ok(Array.isArray(order));
      assert.equal(order.length, graph.getNodes().length);

      // Verify node 0 has 0 dependencies and is immediately ready
      const readyInitially = graph.getReadyNodes();
      assert.ok(readyInitially.length >= 1);
      assert.equal(readyInitially[0].id, order[0]);
    });

    it('manages dependency state transitions and node readiness', () => {
      const decision = {
        primary: 'empirical',
        operations: ['data.inspect@1', 'data.prepare@1', 'statistics.fit@1'],
      };
      const graph = createOperationGraph(decision);

      const nodes = graph.getNodes();
      assert.equal(nodes.length, 3);

      const inspectNode = nodes[0];
      const prepareNode = nodes[1];
      const fitNode = nodes[2];

      assert.equal(inspectNode.status, 'ready');
      assert.equal(prepareNode.status, 'pending');
      assert.equal(fitNode.status, 'pending');

      // 1. Mark inspect completed -> prepare becomes ready
      graph.markNodeStatus(inspectNode.id, 'completed');
      assert.equal(prepareNode.status, 'ready');
      assert.equal(fitNode.status, 'pending');

      // 2. Mark prepare completed -> fit becomes ready
      graph.markNodeStatus(prepareNode.id, 'completed');
      assert.equal(fitNode.status, 'ready');

      // 3. Mark fit completed -> all completed
      graph.markNodeStatus(fitNode.id, 'completed');
      assert.equal(graph.isCompleted(), true);
      assert.equal(graph.hasFailures(), false);
    });

    it('propagates failure to block downstream dependent nodes', () => {
      const decision = {
        primary: 'empirical',
        operations: ['data.inspect@1', 'data.prepare@1', 'statistics.fit@1'],
      };
      const graph = createOperationGraph(decision);
      const nodes = graph.getNodes();

      graph.markNodeStatus(nodes[0].id, 'failed', { error: 'Corrupt dataset' });
      assert.equal(nodes[1].status, 'blocked');
      assert.equal(graph.hasFailures(), true);
      assert.equal(graph.isCompleted(), false);
    });

    it('detects cyclic dependencies and throws error', () => {
      const decision = {
        primary: 'empirical',
        operations: ['data.inspect@1', 'data.prepare@1'],
      };
      // Manually inject a cycle A -> B -> A
      assert.throws(() => {
        createOperationGraph(decision, {
          dependencies: {
            node_0_data_inspect_1: ['node_1_data_prepare_1'],
            node_1_data_prepare_1: ['node_0_data_inspect_1'],
          },
        });
      }, /Cyclic dependency detected/);
    });
  });

  describe('Gateway integration with plan_workflow', () => {
    it('executes plan_workflow via gateway returning complete DAG and route decision', async () => {
      const res = await runResearchEvidence({
        action: 'plan_workflow',
        workspace: tmpDir,
        objective: '清洗风洞数据并绘制箱线图',
        inputs: ['wind_tunnel.csv'],
      });

      assert.equal(res.isError, undefined);
      assert.equal(res.data.primary, 'empirical');
      assert.ok(res.data.supporting.includes('figure'));
      assert.ok(res.data.operations.includes('figure.render@1'));
      assert.ok(res.data.requiredGates.includes('data-quality'));
      assert.ok(Array.isArray(res.data.executionOrder));
      assert.ok(res.content.includes('首选范式: empirical'));
      assert.ok(res.content.includes('拓扑执行序'));
    });
  });
});
