# Tianshu-Research 架构规划与综合开发计划书（完善定稿版）

> **定位声明**：Tianshu-Research 绝非独立的科研 Agent 或臃肿的外部 MCP，而是深度依附于 Tianshu-Harness 的**第一方原生科研能力扩展包（Research Capability Layer）**。Harness 负责思考与编排（CVM、Memory、Prefix Cache、Team/Council），Research 负责科研方法、网关工具、证据账本与科学验收。
> **核心原则**：**一套科研内核、两个交互表面；Harness 负责思考与编排，Research 负责测量、证据链和科学验收。**

## 核心架构推演与共识决断

### 1. 工具面：从离散平铺到 Gateway 收敛
- **收敛为 4+1 网关工具**：`research_query`, `research_evidence`, `research_document`, `research_job`，以及可选的 `research_compute`。
- **Schema 设计**：采用基于 `action` 字段的 `Discriminated Union` 设计（例如 `action: "search_papers" | "resolve_paper"`），并严格设置 `additionalProperties: false`。
- **平滑过渡与向后兼容**：保留原子工具 `paper_search`、`paper_lookup`、`journal_palette` 100% 兼容。

### 2. Evidence Ledger（证据账本）落盘设计
- **数据解耦**：Harness 主记忆 `.rivet/knowledge/memory.jsonl` 只存高层结论与项目偏好。科研细节存入 `<project>/.rivet/research/` 目录。
- **三层账本结构**：
  - `sources.jsonl`：文献元数据（DOI, 标题, 作者, 年份, PDF 链接）。
  - `evidence.jsonl`：Exact Locator（页码、章节、图号、公式号）和真实原文摘录。
  - `claims.jsonl`：从证据中推导出的事实断言及其状态（Tentative, Verified, Superseded）。
- **外键与防伪拦截**：严格校验证据必须挂载合法文献，断言必须绑定证据，杜绝凭空造假。

### 3. 原生插件与 Slash Commands 装配
- 在 `manifest.ts` / `package.json` 中声明：
  - **Commands**: `/research` (主入口环境检查与意图识别), `/research-status` (状态快照)。
  - **Tools**: 轻量级插件工具 `research_status`，快速获取工作区状态快照。
  - **Hooks & Gates**: 科学门禁 `scientific-verifier.js`（引用完整性、定位覆盖率、占位符拦截）。

### 4. 多 Agent 科研任务编排
- **完全复用 Harness 编排器**：不重复造轮子，深度适配 Harness 原生 `/team`、`/council` 与 Worker 机制。
- **WorkOrder 规范**：
  - **Scout / Searcher**：使用 `research_query` 初筛文献与 OA PDF。
  - **Reader / Extractor**：使用 `research_query` 读文献，用 `research_evidence` 提取记录带精确 Locator 的证据。
  - **Synthesizer**：基于 Claim Ledger 生成交叉综合综述。
  - **Council Reviewer**：通过 Scientific Gate 审计整套账本完整性。

### 5. 深度思考与方案甄别：批判性对比《Tianshu-Research 开发计划书》原始草案
1. **仓库工程形态：模块化单体 (Modular ESM) 优于 复杂 Monorepo**
   - 天枢插件采用纯 Node.js ESM 规范免编译执行。维持模块化单体（`ledger/`、`gates/`、`tools/`、`figure/`、`skills/`）实现零外部构建依赖，秒级启动与单测。
2. **交互入口设计：收敛双指令 (`/research` + `/research-status`) 优于 指令泛滥**
   - 避免注册 7 个冗余指令污染天枢命令面板。保留 `/research [topic]` 与 `/research-status`，具体意图由 Skill 自然流转。
3. **学术检索选型：开放获取优先 (arXiv + OpenAlex) 优于 强依赖商业/限流接口**
   - 首发版本坚守开放获取优先（OA-First），首选 arXiv（Atom XML）与 OpenAlex（2.5亿+ 免 Key 开放学术元数据），保证新手“点装即用”，零门槛零配置。
4. **领域知识解耦：通用理工核心 (General STEM Core) 优于 强绑定力学领域**
   - 核心层提供通用理工规范；固体力学等领域知识作为首个可选外围专业技能包叠加，不侵入核心工具与数据账本定义。
5. **天枢主干契约：即刻零侵入运行 优于 依赖未合并的 upstream PR**
   - 确保在今天未改动内核的天枢运行时上 100% 稳定运行，通过参数透传与工作区自动推断（`process.cwd()` / 显式入参）实现多工作区隔离。

---

## 分阶段实施路线与进展

### Phase 1: 骨架搭建与 Gateway 收敛 (M0 - M1) [已完成 ✅]
- 实现 Discriminated Union 架构的 `research_query`、`research_evidence`、`research_status`。
- 保持 `paper_search`、`paper_lookup`、`journal_palette` 完全向后兼容。
- 交付物：`tool-contracts.js`、`gateway-query.js`、`tools/research-status.js`、`/research`、`/research-status`。

### Phase 2: Evidence Ledger 落地与状态机约束 (M2 - M3) [已完成 ✅]
- 实现三层结构化账本存储（`sources.jsonl`、`evidence.jsonl`、`claims.jsonl`）。
- 落地严格的外键约束与防篡改机制。
- 交付物：`ledger/evidence-ledger.js`、`gateway-evidence.js`、`test/ledger.test.js`。

### Phase 3: 多 Agent 工作流与 Scientific Gate 闭环 (M4 - M6) [已完成 ✅]
- 落地 `gates/scientific-verifier.js`：实现引用闭环、物理定位覆盖率（Locator Coverage Rate）、占位符拦截的自动化审计与 Markdown 报告输出。
- 编制规范化的 Scout -> Reader -> Synthesizer -> Council Reviewer 分波工单模版（`skills/research-flow/references/team-templates.md`）。
- 验证指标：42 项 Node 单测 + 6 项 Python 单测 + 10 项暂存隔离门禁全部绿色通过，GitHub 远端同步完毕。

### Phase 4: 渐进式 Python 科学计算降级 (`research_compute`) (M5) [进行中 🚀]
- Node 端轻量量纲匹配与数值容差对比兜底；
- 探测本地 Python 环境中的科学库（SymPy, SciPy, NumPy）；
- 未安装环境时返回 `available: false` 与降级说明，主流程不中断。

### Phase 5: 结构化文献解析与异步任务 (`research_document` + `research_job`)
- `research_job`：实现基于轻量文件事件流的任务状态机（`queued -> searching -> parsing -> completed`）；
- `research_document`：本地提取结构化章节与文本片段，直链 OA PDF 保障溯源。