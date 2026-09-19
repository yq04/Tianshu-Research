# 能力基准与消融（Phase 11）

> 面向：需要度量科研智能体真实能力（而非统计模块测试数量）的会话与 CI。
> 模块：`capability-benchmark/harness.js`（运行器）、`capability-benchmark/oracles/`（判分侧）、`datasets/manifest.json`（哈希固定数据集）、`tasks/<suite>/*.json`（任务定义）、`trials/<suite>/*.trial.json`（答卷）。

## 1. 诚实评分六条铁律

1. **数据集哈希固定**：每个数据集在 `datasets/manifest.json` 中钉死 sha256 / license / split；harness 逐字节校验，不一致直接拒绝运行，绝不静默改用新数据。
2. **假收据必 fail**：答卷必须携带 `rawOutput`（真实计算统计量）；判分侧用插件自己的确定性模块对钉死数据集**重算**核对，`pValue` 对不上 → `FABRICATED_STATISTICS`，直接 0 分。只有结论没有收据 → `INCOMPLETE_RECEIPT`，0 分。
3. **p-hacking 必 fail**：声称 `significant` 但核实后的 p >= alpha → `VERDICT_MISMATCH`（reason 标注 p-hacking）。
4. **负结果可满分**：正确报告 `not_significant` / `refuted` 是合法科学结论，判满分——这正是任务集的设计意图（两个 smoke 任务的最优答案就是负结果）。
5. **失败 trial 不出分母**：崩溃 trial（`status: failed`）计 0 分并留在分母；畸形 trial 文件进 `trialErrors` 如实上报，不隐藏、不删除。
6. **模型/预算不混比**：报告按 `(modelId, budgetId)` 分组成行，不同模型或不同预算永不合并；成本计量区分 `mainModel` 与 `sidecar`（council / compaction）侧路，各自独立累计。

## 2. 运行

```bash
# 离线回放（无网络、无模型调用）
npm run benchmark:smoke
# 等价于：
node capability-benchmark/harness.js --suite smoke --mode replay --offline
# 自定义答卷目录
node capability-benchmark/harness.js --suite smoke --mode replay --trials-dir <dir>
```

报告落盘 `<workspace>/.rivet/research/benchmark/<suite>-report.json`，含内容摘要（canonical JSON + sha256，无墙钟字段，两次运行字节级一致）。

**live 模式**：本阶段 harness 明确拒绝 `--mode live`（需要已配置的模型适配器与显式预算）——宁可报错也不伪造 live 结果。live 结果与离线 smoke 分开报告。

## 3. 答卷格式

```json
{
  "trialId": "stats-ok-modelA-b1",
  "taskId": "stats-nonsignificance@smoke",
  "modelId": "modelA",
  "budgetId": "budget-b1",
  "submitted": {
    "conclusion": "not_significant",
    "rawOutput": { "method": "welch", "alpha": 0.05, "statistic": 0.0927, "pValue": 0.928034 }
  },
  "usage": { "mainModel": { "inputTokens": 1200, "outputTokens": 300, "cacheReadTokens": 900 },
             "sidecar": { "council": { "inputTokens": 200, "outputTokens": 80 } } }
}
```

## 4. smoke 套件基线

| 组 | 通过/总分 | 得分 | 含义 |
|----|-----------|------|------|
| modelA@budget-b1 | 3/8 | 0.375 | 含 p-hacking / 假收据 / 缺收据 / 伪造检查等全部反例 |
| modelA@budget-b2 | 1/1 | 1 | 同模型不同预算：独立成行 |
| modelB@budget-b1 | 1/1 | 1 | 不同模型：独立成行 |
| modelC@budget-b1 | 0/1 | 0 | 崩溃 trial 留在分母 |

工程独立：运行器（harness.js）只做加载/校验/聚合，全部答案标签与判分逻辑在 `oracles/` 判分侧——部署时可在判分侧挂隐藏标签而不动运行器。
