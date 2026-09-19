# 理论推导范式 (Theoretical & Derivation Paradigm Specification)

> 本文档适用于物理/数学方程推导、符号运算、量纲齐次性审查、渐近极限与自洽性核验任务。

---

## 1. 核心定位与场景边界
- **适用场景**：公式展开、偏微分方程变分弱形式推导、量纲齐次性校验、渐近极限与物理守恒性核验、符号解析解与数值点抽样比对。
- **关键规则**：推导过程必须形式化可复算；不得凭借大模型自由生成伪造“看起来合理”的公式；必须通过物理量纲审查与边界退化核验。

## 2. 推荐最小操作序列
1. **量纲齐次性审查**：
   `execute_operation(operationId="theory.dimension@1", args={lhs:"force", rhs:"mass * acceleration", customUnits:{...}})`
   - 核验等式左右两端 SI 基本量纲 [M, L, T, ...] 是否严格一致。
2. **符号代数演算**：
   `execute_operation(operationId="theory.symbolic@1", args={expr:"(x+1)**2 - (x**2 + 2*x + 1)", action:"simplify"})`
   - 利用符号计算引擎验证代数恒等性或求解解析解。
3. **渐近与边界极限审查**：
   `execute_operation(operationId="theory.limit@1", args={expr:"sin(x)/x", variable:"x", point:0})`
   - 检验在物理边界（如 Re -> 0, t -> oo, r -> 0）下的极限退化行为。
4. **数值抽样反例核验**：
   `execute_operation(operationId="theory.numeric-check@1", args={lhsExpr:"...", rhsExpr:"...", variableRanges:{x:[0.1, 10.0]}, tolerance:1e-5})`
   - 在随机抽样点数值比对左右端值，严防符号推导假象。

## 3. 适用科学门禁 (Scientific Gates)
- **`dimensional-consistency`**：物理量纲齐次性门禁，任何等式项两端或加和项之间量纲不一致立即拒绝。
- **`symbolic-physical`**：符号代数简化与边界极限门禁，核查极限收敛值与守恒不变量。
- **`provenance-integrity`**：推导脚本与前提假说引用完整性。

## 4. 交付出口 (Deliverables)
- 逐步可验证的公式推导手稿 (Markdown / LaTeX)。
- 量纲自洽性审查凭证。
- 符号与数值极限核验收据。
