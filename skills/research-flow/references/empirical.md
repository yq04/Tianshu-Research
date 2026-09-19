# 数据驱动范式 (Empirical & Data Paradigm Specification)

> 本文档适用于测量数据处理、统计假设检验、置信区间估计、回归建模与科研出图任务。

---

## 1. 核心定位与场景边界
- **适用场景**：CSV / TSV / Parquet / HDF5 数据集清洗、描述统计、双样本检验、方差分析 (ANOVA)、非参数检验、回归拟合、置信区间与顶级期刊图表渲染。
- **关键规则**：**数据分析任务严格产生 0 次文献检索或论文查询请求**。不得无端检索文献；不得把大模型幻觉估算的“置信度 0.95”当作真实样本统计置信区间。

## 2. 推荐最小操作序列
1. **数据探查**：
   `execute_operation(operationId="data.inspect@1", args={datasetPath:"data.csv", maxRows:1000})`
   - 提取行数、列类型、缺失值分布、基本统计量。
2. **数据清洗与预处理 (可选)**：
   `execute_operation(operationId="data.prepare@1", args={datasetPath:"data.csv", dropNa:true, filterQuery:"..."})`
3. **统计检验与比较**：
   `execute_operation(operationId="statistics.compare@1", args={sampleA:[...], sampleB:[...], testType:"welch_t|mann_whitney", alpha:0.05})`
   - 输出真实统计量、精确 p 值、效应量 (Cohen's d) 与 95% 置信区间。
4. **回归与曲线拟合 (可选)**：
   `execute_operation(operationId="statistics.fit@1", args={datasetPath:"...", modelType:"linear|polynomial", xColumn:"x", yColumn:"y"})`
5. **出版级科研出图 (可选)**：
   `execute_operation(operationId="figure.render@1", args={chartType:"scatter|box|line", paletteId:16, dataPath:"...", outputPath:"figure1.png"})`

## 3. 适用科学门禁 (Scientific Gates)
- **`data-quality`**：核验数据缺失率、异常值、模式格式自洽性与转换过程可追溯性。
- **`statistical-validity`**：核验样本独立性、正态性/同方差前置假定、检验方法选取恰当性、效应量报告与多重比较校正。
- **`figure-traceability`**：核验图表数据溯源、物理量纲单位明确标注、误差棒语义（SD vs SEM vs 95% CI）清晰度。
- **`provenance-integrity`**：核实派生数据与计算过程的哈希完整性。

## 4. 交付出口 (Deliverables)
- 结构化统计检验报告（含真实统计量与区间）。
- 清洗后派生数据表（保留转换脚本）。
- 矢量/高清位图科研插图（带明确单位与图例）。
