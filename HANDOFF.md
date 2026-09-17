# HANDOFF — Tianshu-Research 综合交接文档（2026-09-17）

> **受众与阅读要求**：本文档写给**完全没有此前会话上下文**的后续 Agent 或人类开发者。请务必在展开任何操作前完整阅读本文件。

---

## 1. 我们在做什么任务（项目定位与架构共识）

我们在 **Tianshu-Harness**（天枢智能体运行时宿主，公开代码库为 `huiliyi37/Tianshu-harness`）之上，构建理工科原生科研扩展层 **Tianshu-Research**。

### 1.1 核心架构定位共识
- **不是独立科研 Agent，也不是单纯外挂的臃肿 MCP Server**：Tianshu-Research 是依附于 Tianshu-Harness 的**第一方原生科研能力扩展包（Research Capability Layer）**。
- **职责划分原则**：“一套科研内核，两个交互表面；Harness 负责思考与编排，Research 负责测量、证据链与科学验收”。
  - **Tianshu-Harness**：唯一的认知中枢、会话中枢和多 Agent 编排器（CVM 认知虚拟机、统一记忆、Prefix Cache、`/team`、`/council`、Worker 调度）。
  - **Tianshu-Research**：提供科研领域网关（Gateway Tools）、物理证据账本（Evidence Ledger）、结构化文献解析（Document Parser）、异步任务状态机（Job Manager）、渐进式科学计算（Research Compute）与科学门禁（Scientific Gates）。
- **双交互表面**：
  1. **原生插件表面**：目录位于 `plugins/tianshu-research/`，通过 `package.json`、Slash Commands（`/research`, `/research-status`）和 Skill（`skills/research-flow`）深度融入天枢运行时。
  2. **标准 stdio MCP 表面**：入口为 `mcp-server.js`，支持桌面端与外部客户端通过标准 JSON-RPC 2.0 协议发现并调用全部科研工具。
- **独立 GitHub 仓库管理**：
  - 本地独立仓库路径：`D:\1_Research\Tianshu-Research`
  - GitHub 远程仓库：`https://github.com/yq04/Tianshu-Research.git`（分支 `main`）

### 1.2 对比参考项目与能力甄别决策
在规划与研发过程中，我们深度调研并审视了开源界优秀科研方案，吸收其精华，摒弃其反模式：
1. **对比 [binary-husky/gpt_academic](https://github.com/binary-husky/gpt_academic)**：
   - **吸纳**：函数插件化思维、多步骤处理流、严格的异常隔离与学术 Markdown 规范。
   - **摒弃**：GPL-3.0 传染协议（本项目坚持宽松开源协议，代码零拷贝）、冗杂的 UI 强耦合、直接爬取盗版源（Sci-Hub）、以及由 LLM 机械化生成全文论文的学术不端隐患。
2. **对比 [Yuan1z0825/nature-skills](https://github.com/Yuan1z0825/nature-skills)**：
   - **吸纳**：文献卡片精读规范（问题/方法/结果/局限）、证据与主张的科学论证链条。
   - **摒弃**：缺乏真实物理定位凭证的“软引用”、重度依赖外部专有闭源工具、以及容易导致模型发散的无约束 Prompt 堆砌。
3. **色板包重构命名纪律**：
   - 项目严禁直接使用 `thebestcolor` 原名，已彻底更名为 **`journal_palette`**（提供 100 套经学术顶刊验证的高级配色方案及色弱无障碍色板，支持 Node.js 内存计算插值与 Python `journal_palette.py` 本地脚本渲染）。

### 1.3 前缀缓存保护与工程边界（“不做”清单）
- **绝不污染核心基线**：科研工具绝对不进入天枢默认工具注册表（`createDefaultToolRegistry`），默认保持关闭（opt-in），确保日常代码开发任务的前缀缓存命中率稳定在 95%–99%。
- **开放获取优先（OA-First）**：默认首选 arXiv（Atom XML）与 OpenAlex（2.5 亿免 Key 开放文献元数据及直接 PDF 链接），即装即用。
- **严禁全自动生成整篇论文、严禁绕过版权破解、严禁强行绑定重型数据库**。

---

## 2. 已经完成了什么（分阶段落地与验证证据）

截至 2026-09-17，`task_plan.md` 规划的 Phase 1 至 Phase 5 已全部高质量落地闭环，所有定型单测与门禁测试全部 100% 绿色通过（Exit 0）。

### 2.1 工具面 Gateway 收敛（4+1 网关 + 1 状态 + 3 兼容）
收敛细粒度工具，采用基于 `action` 的 `Discriminated Union` 严密 Schema（`additionalProperties: false`），既保证类型安全又最大化保护模型前缀缓存：
1. **`research_status`**：科研环境就绪度、工作区路径、证据账本与色板看板。
2. **`research_query`**：跨 arXiv 与 OpenAlex 的文献检索（`search_papers`）与单篇元数据直链解析（`resolve_paper`）。
3. **`research_evidence`**：三层物理证据账本生命周期管理（`add_source` / `add_evidence` / `add_claim` / `query_evidence` / `get_summary` / `verify_ledger`）。
4. **`research_document`**：结构化文档章节大纲解析（`inspect`）、按章节精读（`read_section`）、高精度原文定位（`locate_text`）与工作区文档入库（`ingest`）。
5. **`research_job`**：异步科研长任务状态机调度（`start` / `query` / `update` / `cancel` / `list` / `report`），并在 `<workspace>/.rivet/research/runs/<jobId>/` 下维护持久化事件流 `events.jsonl` 与交付结果 `result.json`。
6. **`research_compute`**：渐进式科学计算网关（Node 端零依赖量纲分析 `dimension_check`、数值容差比对 `numeric_eval`、本地 Python 科学计算库探测 `probe_environment`，及优雅降级的符号微积分 `symbolic_eval`）。
7. **向后兼容原子工具**：`paper_search`、`paper_lookup`、`journal_palette` 保持 100% 兼容。

### 2.2 物理证据账本（Evidence Ledger）
- 位于工作区 `<workspace>/.rivet/research/`：
  - `sources.jsonl`：文献元数据（DOI, arXiv, Title, Authors, Year, OA PDF URL）。
  - `evidence.jsonl`：带绝对物理定位（Page, Section, Equation, Figure, Table, Offset）的原文摘录，严格外键关联合法 `sourceId`。
  - `claims.jsonl`：推导论断与其支撑证据集合，严格外键关联合法 `evidenceIds`。
- **科学门禁**：`gates/scientific-verifier.js` 实现断言外键完整性、精确定位覆盖率（Locator Coverage Rate）及学术占位符（如 `[citation needed]`, `[TODO]`）强制拦截。

### 2.3 宿主协同与多 Agent 编排模版
- **Slash Commands**：`/research`（智能识别文献意图并引导检索）与 `/research-status`（快速输出当前工作区科研就绪度）。
- **多 Agent 编排模版**：在 `skills/research-flow/references/team-templates.md` 中定义了深度适配天枢 `/team` 与 `/council` 的分波次工单规约（Scout 检索员 -> Reader 精读员 -> Synthesizer 综合员 -> Council 审计员）。

### 2.4 测试验证汇总表（全部 Exit 0）
```powershell
# 1. 科研扩展全部 67 项 Node 单元测试 (67 pass, 0 fail)
node --test plugins/tianshu-research/test/*.test.js

# 2. 配色模块 Python 单元测试 (6 pass, 0 fail)
python -B -m unittest discover -s plugins/tianshu-research/test -p test_journal_palette.py

# 3. 插件打包暂存、独立启动与前缀隔离门禁测试 (10 pass, 0 fail)
npx tsx --test scripts/__tests__/stage-plugins.test.ts src/mcp/__tests__/research-isolation.test.ts

# 4. 独立仓库 D:\1_Research\Tianshu-Research 单元测试 (67 Node + 6 Python pass)
cd D:\1_Research\Tianshu-Research
node --test test/*.test.js
python -B -m unittest discover -s test -p test_journal_palette.py
```

### 2.5 仓库同步状态
- 独立仓库 `D:\1_Research\Tianshu-Research` 已经完整同步最新代码，并成功推送至 GitHub 远程仓库：
  - 最新 Commit：`e757d3c` (`feat(document,job): implement research_document and research_job gateways with full tests`)
  - Remote: `https://github.com/yq04/Tianshu-Research.git` (`main` 分支保持纯净且最新)。

---

## 3. 当前卡在哪（环境状态、依赖与未决事项）

1. **宿主仓库未提交（符合纪律）**：
   - 宿主目录 `D:\1_Research\Develop_Research` 中，`plugins/tianshu-research/`、`scripts/stage-plugins.js`、`scripts/__tests__/stage-plugins.test.ts` 以及相关门禁测试属于未提交状态。
   - **硬性闸门**：根据 `AGENTS.md` 高危命令纪律，在未经用户明确发出提交指令前，**严禁自行在宿主仓库执行 git commit**。
2. **桌面端侧边栏卡片联动**：
   - 桌面端 Settings → MCP 页面显示“科研文献”卡片依赖于编译后的 sidecar 返回 `MCP_PRESETS`。若要通过桌面 GUI 点击体验，需编译运行本 fork 生成的 sidecar。CLI / TUI 终端下可通过 `/mcp enable tianshu-research` 立即体验。
3. **Python 科学计算环境为可选软依赖**：
   - `research_compute` 的符号微积分依赖宿主环境是否安装 `sympy`。若未安装，网关会自动平滑降级（返回 `degraded: true, available: false`），不会中断主链路。

---

## 4. 下一步计划是什么（优先级与执行指引）

1. **若用户需要体验真实科研流**：
   - 在 TUI 终端中执行 `/mcp enable tianshu-research` 或调用 `/research [研究课题]`。
   - 调度 `research_query` 检索目标文献，利用 `research_document` 导入并切分章节，通过 `research_evidence` 录入支撑论据，最后使用 `scientific-verifier` 审计证据链。
2. **Phase 6 演进（可视化与交互交付物）**：
   - 探索通过天枢 Canvas / Markdown Artifact 渲染直观的证据链图谱（Evidence Graph），展现 Source -> Evidence -> Claim 树状关系。
3. **多 Agent 真实场景演练**：
   - 在支持 `/team` 的会话中，加载 `skills/research-flow/references/team-templates.md`，派发真实的 Scout 与 Reader 子代理协同检索，观察 `.rivet/research/` 下账本与异步任务日志流的生成。
4. **代码提交与上游合并**：
   - 当用户发出提交指令时，先展示文件变更清单，征得确认后再执行提交。

---

## 5. 踩过的坑 —— 绝对不要再踩（血泪教训）

1. **Gemini / CPA 致命 400 陷阱（第一红线 · 违者会话报废）**：
   - **绝对严禁在 `functions__exec` 中调用 `notify(...)` 或 `yield_control()`**！
   - 会导致后台队列与 Gemini 的 1:1 工具调用响应机制严重错位，触发 `functionResponse.id does not match functionCall.id`，直接使整个会话永久报废！
   - 过程汇报通过正常的 `commentary` 发送；JS 脚本内的结果通过最终的一次性 `text(...)` 输出。
2. **JS 模板字符串中的反引号与转义陷阱**：
   - 在动态生成或写入含有代码的模板字符串时，如果内容包含反引号（如嵌入嵌套变量），**必须正确转义为 \`**，否则 JS 引擎会将后续文本解析为函数调用（报错 `TypeError: "..." is not a function`）。
   - 在 JS 字符串字面量中编写正则表达式（如匹配括号 `/(1)/`）时，反斜杠必须写为双反斜杠 `/\(1\)/`，否则会被字符串预解析吞噬为普通括号，导致正则断言失败。
3. **状态机更新中的内存事件同步**：
   - 在 `jobs/job-manager.js` 的 `updateJob` 中，向 `events.jsonl` 追加事件的同时，必须同步更新返回的内存对象 `updated.events`，否则外部立即查询最新事件时会拿到旧数组。
4. **严禁将科研工具塞入天枢默认工具表**：
   - 严禁将 `research_query`、`research_evidence` 等加入 `CORE_TOOLS` 或 `createDefaultToolRegistry`。必须保持 opt-in 插件形态，确保默认编程任务的 Prefix Cache 稳定在 95%+。
5. **严禁使用 `thebestcolor` 原名**：
   - 统一使用 `journal_palette`，调用时不带参数仅返回角色目录与推荐，切勿一次性将 100 套色板十六进制倾倒进上下文。
6. **多 Agent 派发选型纪律**：
   - 常规编码、执行测试、目录搜索等防上下文爆炸任务，**必须默认使用 `gemini-3.8-flash`**。
   - 仅在重大架构设计时显式调用 `gpt-6-astra`（`xhigh` 模式，等待超时设为 180s~300s，子代理未完成前严禁无工具调用结束 Turn）。
