# 基于认知虚拟机 (CVM) 的多范式科研反思规约 (CVM Reflective Flow Specification)

> 本规约定义天枢认知虚拟机 (CVM) 在理工多范式科研中的状态机调度、显式反思循环 (Reflective Loop) 与因果追踪机制。

---

## 1. 认知虚拟机核心状态机 (CVM State Machine)

科研认知流贯穿六个核心阶段：

```
Perceive (感知输入与材料)
   ↓
Hypothesize / Route (路由范式与提出假设)
   ↓
Execute (调度无环操作 DAG)
   ↓
Evaluate (五态科学门禁核验)
   ↓
Reflect (因果反思与反例沉淀)
   ↓
Deliver or Advance (成果交付 或 演进新版本 Revision)
```

---

## 2. 显式反思循环与负结果沉淀纪律

### 2.1 拒绝无根由的死循环 (Doom Loop Interception)
- 若某次实验或推导失败，反思引擎必须首先分析因果根因（Causal Reason）：
  - 是输入数据存在缺失？
  - 是数学模型假定不当？
  - 还是物理量纲不守恒？
- **连续 3 次相同方法、相同输入失败**：强制终止该试错分支，不得在原地死循环打转。

### 2.2 负结果是第一类科研发现 (Negative Results as Findings)
- 严禁通过 `git reset`、删文件或篡改账本抹去失败记录。
- 每一个被推翻的假说，均在 `priorRefutations` 中留下不可篡改的凭据（反例取值、误差大小、偏离现象），作为划定理论适用边界的黄金证据。

### 2.3 边界上下文预算保护 (Context Budgeting)
- 文献精读必须采用静默导入 + 章节切片，单次增量控制在 1,000 tokens 以内。
- 纯数据、代码评测与推导任务，严禁向上下文注入无关文献或大篇幅原始日志。
