# 敏捷假设回环范式 (Agile Hypothesis Loop Paradigm Specification)

> 本文档适用于假设驱动探索、可证伪命题验伪、非线性试错与负结果存证任务。

---

## 1. 核心定位与科研哲学
- **现代科学哲学**：可证伪性（Falsifiability）是科学探索的核心。在理工科研中，被实验或理论推翻的假说（Negative Results / Refuted Findings）不是“失败的垃圾”，而是**合规的第一类科研发现**，能够划定理论适用边界。
- **演进生命周期**：
  `proposed (提出假说)` -> `testing (执行验伪)` -> `supported | refuted | inconclusive (得出结论)` -> `revision (演进新版本)`
- **非线性试错纪律**：
  - 严禁通过覆盖、删除或修改历史记录来伪造“实验从一开始就完全正确”；
  - 遇到反例或失败，老版本假说标记为 `refuted`，自动生成带有版本号的新 Revision（如 v2、v3）；
  - 新版本自动继承前序版本的失败反例与前提约束；
  - 严格受 `budget.maxIterations`（默认 3 轮）约束，达到预算上限优雅停止并如实汇报未决结论。

## 2. 核心操作规范
1. **建立假说会话**：
   - 设定明确的可证伪命题（例如：“当网格尺寸 h < 0.01 时，显式格式在 CFL=1.2 下依然保持无条件稳定”）。
   - 设定迭代轮数预算（如 `maxIterations: 3`）。
2. **执行辨别试验 (Discriminative Test)**：
   - 设计最小辨别实验或反例搜索。
   - 记录试验观察与反例（如 CFL=1.2 时第 45 步能量发散）。
3. **做出科学判定**：
   - 若被反例推翻：记录为 `refuted`，沉淀反例，不覆盖历史。
   - 若符合预期：记录为 `supported`。
   - 若材料不充分：记录为 `inconclusive`。
4. **生成修正版本 (Advance Revision)**：
   - 修正适用边界或引入新的松弛条件（如：“显式格式仅在 CFL <= 1.0 稳定，CFL > 1.0 须采用隐式时间积分”）。
   - 产生 Revision 2 继续检验。

## 3. 适用科学门禁 (Scientific Gates)
- **`provenance-integrity`**：追踪假说演进历史链条，确保父版本与反例映射完整。
- 动态继承所调用的测试领域的门禁（若使用数据检验，则触发 `data-quality` 与 `statistical-validity`；若使用推导，则触发 `dimensional-consistency`）。

## 4. 交付出口 (Deliverables)
- 假说演进全生命周期审计卡片 (Hypothesis Audit Card)。
- 明确标注的负结果反例清单 (Preserved Counter-examples)。
- 最终版本科学结论（Supported 或受预算停止的 Inconclusive 报告）。
