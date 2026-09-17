# Tianshu-Research 多 Agent 科研协作与 WorkOrder 规范模版

> 本规范定义了基于 Tianshu-Harness 原生 `/team` 与 `/council` 编排器的科研多智能体拓扑结构。
> **定位准则**：Tianshu-Harness 是唯一的认知中枢与任务调度器；Tianshu-Research 提供专业科研工具面、结构化证据账本（Evidence Ledger）与科学门禁（Scientific Gate）。

---

## 1. 科研多智能体协作拓扑 (Team Topology)

文献综述、假设求证与对比实验采用标准四阶段分波（Wave-Gate）架构：

```mermaid
flowchart TD
    W1[Wave 1: Scout / 学术侦察员] -->|候选论文清单 & DOI/arXiv ID| W2[Wave 2: Reader / 精读抽取员]
    W2 -->|写入 sources.jsonl & evidence.jsonl| W3[Wave 3: Synthesizer / 跨文献综合员]
    W3 -->|生成 claims.jsonl & 初稿报告| W4{Wave 4: Council / 科学门禁评审席}
    W4 -->|门禁通过| Output[最终结构化综述 / 结论报告]
    W4 -->|门禁未通过 (打回重构)| W2
```

---

## 2. 角色工单定义 (WorkOrder Specifications)

### 角色 1: Scout (文献初筛员)
- **目标 (Objective)**: 围绕研究主题检索开放获取（OA）文献，过滤高相关度论文，提取标准标识符（arXiv ID, DOI, OA URL）。
- **工具集**: `research_query` (action: `search_papers`)
- **交付要求**:
  1. 输出不超过 8 篇高相关文献列表，包含：标题、作者、发表年、DOI 或 arXiv ID、OA PDF 链接。
  2. 严格杜绝使用通用 Web 搜索伪造论文引用。
- **验收指令**:
  ```text
  assert results.every(p => p.doi || p.arxivId)
  assert results.length >= 1
  ```

---

### 角色 2: Reader (精读与证据抽取员)
- **目标 (Objective)**: 对初筛出的论文进行精读，提取实验数据、理论方法、对比结论及**精确物理定位**（页码、章节、图号、公式号），写入 Evidence Ledger。
- **工具集**: `research_query` (action: `resolve_paper`), `research_evidence` (action: `add_source`, `add_evidence`)
- **行为规范**:
  1. 必须先通过 `add_source` 录入参考文献元数据，获取合法的 `sourceId`。
  2. 提取具体观点时，调用 `add_evidence` 录入，且**必须附带非空 locator**（如 `page: 4, section: "3.2", figure: "Fig 2"`）。
  3. 证据摘录（`excerpt`）必须为论文真实原文段落或核心数据，禁止泛化改写。
- **验收指令**:
  ```text
  assert evidence.every(e => e.sourceId && (e.locator.page || e.locator.section || e.locator.figure || e.locator.equation))
  ```

---

### 角色 3: Synthesizer (科学综合员)
- **目标 (Objective)**: 跨文献对比证据片段，提炼学术共识、前沿分歧与实验瓶颈，形成结构化科学断言（Claims），沉淀至账本。
- **工具集**: `research_evidence` (action: `query_evidence`, `add_claim`)
- **行为规范**:
  1. 所有推导出的科学断言必须通过 `add_claim` 记录，并显式挂载 1 个或多个 `evidenceIds`。
  2. 若存在多篇文献观点冲突（如算法性能在不同基准下表现不同），创建多条证据并准确标记 `relation: "supports" | "contradicts"`。
  3. 未通读全文或证据不足的断言，状态严禁标记为 `verified`，须保持 `tentative`。
- **验收指令**:
  ```text
  assert claims.every(c => Array.isArray(c.evidenceIds) && c.evidenceIds.length > 0)
  ```

---

### 角色 4: Council Reviewer (科学门禁评审席)
- **目标 (Objective)**: 运用科学门禁（Scientific Gate）对整份证据账本及综述报告进行全量审计，防范悬空断言与伪造引用。
- **工具集**: `research_evidence` (action: `verify_ledger`), `research_status`
- **审查准则**:
  1. **引用闭环**: 检查 `sources.jsonl`、`evidence.jsonl`、`claims.jsonl` 间无任何悬空引用（Zero Orphan References）。
  2. **定位覆盖率**: 证据定位覆盖率（Locator Coverage Rate）必须达到 90% 以上。
  3. **未读与占位拦截**: 状态为 `verified` 的断言中绝不允许出现 `TODO`、`未读全文`、`无法判断` 等占位关键词。
  4. **审查决策**:
     - 若 `verify_ledger` 返回 `passed: true`，予以批准交付。
     - 若返回 `passed: false`，按违规清单打回至 Reader / Synthesizer 修正。

---

## 3. Harness `/team` 快速启动配置范例

在天枢终端或会话中，可直接按照以下格式下发科研团队任务：

```yaml
mission: "针对量子错误缓解（Quantum Error Mitigation）近三年最新进展进行证据链综述"
tasks:
  - id: "scout_task"
    title: "检索 QEM 核心开放获取论文"
    profile: "cheap_search"
    kind: "explore"
    verification:
      - "research_query search_papers --query 'quantum error mitigation zero noise extrapolation' --limit 5"
  - id: "reader_task"
    title: "提取核心文献方法与实验数据证据"
    dependsOn: ["scout_task"]
    profile: "deep_reader"
    kind: "execute"
    verification:
      - "research_evidence query_evidence --limit 10"
  - id: "synthesis_task"
    title: "提炼科学断言并构建综述报告"
    dependsOn: ["reader_task"]
    profile: "synthesizer"
    kind: "execute"
    verification:
      - "research_evidence get_summary"
  - id: "council_gate"
    title: "执行科学证据门禁审计"
    dependsOn: ["synthesis_task"]
    profile: "council_reviewer"
    kind: "review"
    verification:
      - "research_evidence verify_ledger"
```

