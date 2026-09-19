# 工程评测范式 (Benchmark & Ablation Paradigm Specification)

> 本文档适用于代码基准测试、单变量消融实验、性能指标监控与复现收据任务。

---

## 1. 核心定位与场景边界
- **适用场景**：基准算法跑分、模型精度/延迟/吞吐对比、超参数或模块单变量消融 (Ablation Study)、资源消耗 (CPU/GPU/Memory) 监控。
- **关键规则**：严格遵循单一变量原则；公平比较必须对齐计算资源预算与数据切分；运行结果必须产出真实执行收据 (RunReceipt)，杜绝只凭肉眼看日志或伪造跑分表格。

## 2. 推荐最小操作序列
1. **消融与实验方案规划**：
   `execute_operation(operationId="benchmark.plan@1", args={baseline:"resnet50_baseline", variations:[{id:"no_residual", param:"residual=False"}], metrics:["accuracy", "latency_ms"]})`
2. **受控执行与收据捕获**：
   `execute_operation(operationId="benchmark.run@1", args={planId:"...", runId:"run_01", command:"python train.py --config ...", timeoutSec:300})`
   - 捕获命令退出码、环境指纹、真实资源指标与耗时。
3. **指标矩阵比对与显著性检验**：
   `execute_operation(operationId="benchmark.compare@1", args={baselineRunId:"run_base", variationRunIds:["run_v1", "run_v2"], targetMetrics:["accuracy", "throughput"]})`
4. **性能对比图表渲染 (可选)**：
   `execute_operation(operationId="figure.render@1", args={chartType:"bar", dataPath:"...", outputPath:"benchmark_matrix.png"})`

## 3. 适用科学门禁 (Scientific Gates)
- **`benchmark-validity`**：消融实验因子隔离性审查、基线对比公平性（计算预算/迭代轮数是否对准）。
- **`reproducibility`**：执行环境哈希一致性、代码 Commit / 数据版本确定性、相同随机种子下重跑自洽性。
- **`provenance-integrity`**：RunReceipt 执行收据完整性与原始输出日志绑定。

## 4. 交付出口 (Deliverables)
- 结构化基准评测计划与变体清单。
- 不可篡改的执行收据 (RunReceipt)。
- 多方案对比矩阵（含差异百分比与方差）。
- 单变量消融归因报告。
