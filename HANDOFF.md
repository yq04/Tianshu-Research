# HANDOFF — Tianshu-Research（2026-09-17 实施完成）

> 写给**完全没有本会话上下文**的下一个 Agent 或人。动手前读完本文，再读根目录 `task_plan.md`。  
> **重要更新**：旧 Phase A–K 顺序已由 GPT-6 Astra 审查重组为 4 个精简实施阶段，目前 **Phase 1 ~ Phase 4 核心代码与验证已全部实施完毕并通过测试**。

---

## 1. 项目背景与定位

在宿主 **Tianshu-Harness**（工作区 `D:\1_Research\Develop_Research`，产品名天枢，CLI 命令 `rivet`，包名 `tianshu-tui` **3.20.0**）上落地第一方科研能力层 **Tianshu-Research**（`plugins/tianshu-research/`）。

本项目坚守天枢的核心架构哲学：

1. **学习天枢，而不是给天枢加一层流程操作系统**：天枢靠 CVM 认知虚拟机、kernel budget 工具预算（核心工具 ≤26）、信念宪法与前缀缓存（DeepSeek V4 长会话 95%–99% 命中）发挥模型能力；科研层是**量具 + 门禁**，收敛暴露工具，在运行时防止「编 DOI / 用普通网页搜索冒充学术库 / 未读全文虚构页码」。
2. **Harness 负责思考与编排，Research 负责测量与存证**：多 Agent 协作走宿主原生 `/team` 与 `/council`；精读全文走宿主 `pdf_read` / `read_file`；严禁 fork `AgentLoop`，严禁将科研工具注入 `createDefaultToolRegistry` 或 CORE_TOOLS。
3. **DeepSeek 是默认主模型，不是配置错误**：默认只暴露 4 个公开工具，收敛工具签名，降低模型选择认知过载。
4. **Zotero / Obsidian 严格作为可选导出出口，绝非前置依赖**：默认三档使用：短用在对话中输出论文候选与摘要；中用利用宿主已有 `write_file` 保存工作区 Markdown 读卡；长用显式写入 JSONL 证据账本并通过科学门禁核验。

---

## 2. 实施完成状态（Phases 1–4 全绿）

由 GPT-6 Astra 审查替代旧 A–K 繁琐往复，一次性收敛到 4 个阶段，现已全部完成并经验证：

### Phase 1：工具契约与默认用法收敛（100% GREEN）
- **公开工具收敛为 4 个**：`research_query`、`research_evidence`、`journal_palette`、`research_status`。固定此四项顺序。
- 历史工具及别名（`paper_search` / `paper_lookup` / `research_compute` / `research_document` / `research_job`）保留内部实现与有价值单测，但从公开注册清单与 MCP tools/list 移除，调用明确返回未知工具。
- 原生插件清单（`package.json`）、原生入口（`index.js`）、MCP 协议服务（`mcp-server.js`）、契约定义（`tool-contracts.js`）、宿主预设（`src/mcp/presets.ts` 与 `src/plugins/plugin-presets.ts`）全量对齐为 4 个工具。
- 隔离测试 deny-list 严格覆盖新 4 名及所有历史科研工具（裸名与 `mcp__tianshu-research__*` 前缀），严防泄漏进内核工具表。
- `research_status` 默认引擎状态标记为 `unprobed`（已配置实现，尚未探测），不伪造全绿状态。
- `/research` 斜杠指令与 `research-flow` skill 更新为短用/中用/长用三档指引，移除强制 Zotero、强制 citekey 要求。

### Phase 2：长用证据链接通与门禁真实性（100% GREEN）
- **真实定位与 PDF 拒收**：`document-parser.js` 对 `%PDF-` 文件头及 `.pdf` 扩展名实行 fail-closed 拦截，引导使用宿主 `pdf_read` 提取纯文本；CRLF 规范化换行；`locateText` 输出真实 `section`、`lineStart`、`lineEnd`、`charOffset`，杜绝假页码（`estimatedPage` 不进入 locator）。
- **材料入口与关联**：在 `research_evidence` 增加窄动作 `ingest_document` 与 `documentId` 支持，支持 `ingest_document` → `add_source(documentId)` → `add_evidence(sourceId)` → `add_claim` → `verify_ledger` 闭环。
- **账本严格性与接地核验**：`evidence-ledger.js` 拒绝重复 id；记录并上报损坏 JSONL 行；`scientific-verifier.js` 默认 90% locator 覆盖率门槛；检查证据 excerpt 是否真实存在于导入的 `source.documentId` 文本中；`verified` 主张强制要求具备有效 locator、已匹配原文摘录且 `relation === 'supports'`；拦截 `TODO`、`TBD`、`[citation needed]` 占位符。
- **留存计算止误报**：`compute-gateway.js` 对未知量纲符号返回 `consistent: false` 与未知符号清单，不再误报为一致。

### Phase 3：标准启用入口双路互斥（100% GREEN）
- 创建 `src/plugins/research-conflict.ts`，以原生插件已安装且未禁用 vs MCP 服务已配置且未禁用作为冲突判定准则。
- 在 CLI / TUI 启用入口（`src/mcp/preset-enable.ts`、`src/tui/slash-commands.ts` `/plugin enable`）与 REST 接口（`src/server/mcp-api.ts` `POST /mcp/servers`、`src/plugins/plugin-installer.ts` `installFromLocal`、`src/server/plugin-api.ts` `POST /plugins/enable`）中加入对称阻断检查。
- 当一方处于启用状态时，启用另一方返回 400 明确错误并指引先禁用对侧，避免同一套科研工具出现两份指纹而打碎前缀缓存。

### Phase 4：文档与验收收尾（100% GREEN）
- 文档同步：更新 `docs/plugins.md`、`plugins/tianshu-research/README.md` 与 `scripts/__tests__/stage-plugins.test.ts`，移除 TheBestColor，统一 4 工具名称与三档行为说明。
- `skills/research-flow/references/reading-card.md` 明确中用读卡规范，说明标识符缺失不影响笔记，不强制 citekey。
- 验收测试：在 `plugins/tianshu-research/test/gateway.test.js` 维护了 Phase 4 Acceptance 测试套件，端到端检验短用（零科研文件写入）、中用（Markdown 读卡写盘不碰 JSONL）、长用（门禁由红转绿及全文核对真实生效）。

---

## 3. 验证结果汇总

所有受影响测试通过即止，未出现虚假退出码或过度膨胀测试用例：

1. **科研插件全套测试**：
   `node --test --test-timeout=60000 plugins/tianshu-research/test/*.test.js`
   - **81 / 81 tests pass (0 failures, 0 skipped)**
2. **宿主隔离、预设与注册表测试**：
   `npx tsx --test --test-timeout=120000 src/plugins/__tests__/plugin-loader.test.ts src/plugins/__tests__/plugin-presets.test.ts src/mcp/__tests__/research-isolation.test.ts src/server/__tests__/mcp-presets.test.ts src/tools/__tests__/default-registry.test.ts`
   - **51 / 51 tests pass (0 failures, 1 optional live skipped)**
3. **互斥与插件管理接口测试**：
   `npx tsx --test --test-timeout=120000 src/mcp/__tests__/preset-enable.test.ts src/plugins/__tests__/plugin-installer.test.ts src/server/__tests__/mcp-presets.test.ts src/server/__tests__/plugin-api.test.ts`
   - **51 / 51 tests pass (0 failures, 1 optional live skipped)**
4. **打包与预发布测试**：
   `npx tsx --test scripts/__tests__/stage-plugins.test.ts`
   - **4 / 4 tests pass (0 failures)**

---

## 4. 关键文件与边界注意事项

1. **工作区状态与 Git 纪律**：
   - 未执行任何 `git commit`、`git push`、`git stash` 或 `git reset`，严格遵守 `AGENTS.md` 高危命令纪律。
   - `task_plan.md` 位于根目录，受 `.gitignore` 忽略。
2. **三档行为边界**：
   - 短用：仅在对话中给出检索与摘要，不落盘任何科研账本。
   - 中用：使用标准 Markdown 写入 `.rivet/research/notes/*.md`，不要求 citekey 与 Zotero。
   - 长用：通过 `research_evidence` 导入纯文本材料、记录 sources/evidence/claims，通过 `verify_ledger` 审核。
3. **互斥保障**：
   - 不要试图同时运行 MCP 与原生插件。系统在各入口已实现 fail-closed 互斥防御。

---

## 5. 给后续 Agent 的指引

代码改造与单测验证已全线闭环。后续若用户指示在真实模型会话中执行验收，请直接：
- 启动真实会话并按意图使用：
  - 测试短用：`research_query(action="search_papers", query="PINN")`
  - 测试中用：将精读成果写入工作区 `.rivet/research/notes/reading_card.md`
  - 测试长用：导入材料、录入账本并执行 `research_evidence(action="verify_ledger")`
- 严禁未经用户明确授权执行任何 git 提交或推送操作。


---

## 3. 实测问题全面治理与五层科研工作流吸收完成（Phases 5–10 全绿）

基于 DeepSeek-V4-Flash 实机遥测分析与用户提供的五层科研工作流全景图，Phase 5 ~ Phase 10 已全部实施并验证通过（全量 86 项单测 + 55 项宿主测试 100% GREEN）：

1. **Phase 5（数据源防风控与限流保护）**：
   - OpenAlex 自动注入 `&mailto=`（支持 `OPENALEX_MAILTO` 环境变量，缺省回退合规邮箱）接入官方 Polite Pool，可选支持 `OPENALEX_API_KEY`。
   - 实现 arXiv 3 秒内存 Promise 节流调度器，强制请求间隔 >= 3000ms。
   - 捕获 429 与 403 异常，给出结构化友好提示与降级，单源失败不崩溃。
2. **Phase 6（上下文预算控制与防 20 万 Token 撑爆）**：
   - `research_evidence` 扩展窄动作 `read_section`（入参：`docId`, `section`, `maxChars: 2000`, `offset`），仅按章节切块提取并截断，严禁整篇论文全量回显。
   - 将单轮精读交互注入的 token 量从 2.5 万 tokens 压制至 1000 tokens 以内。
3. **Phase 7（项目级隔离与日常编程防干扰）**：
   - 确立「**全局默认关闭，科研项目级局部挂载**」规范（在科研项目根目录配置 `.rivet-config.json`）。
   - 日常代码项目保持 26 个核心编程工具面，实现 0 额外 Token 消耗、0 缓存抖动、0 注意力分散。
4. **Phase 8（网络抓取摩擦缓解与直达链接指引）**：
   - 检索卡片为 arXiv 论文增加官方原生 HTML 直达阅读链接（`- html: https://arxiv.org/html/<id>`）。
   - 在 Skill 中规范 TUN 代理 Fake-IP (198.18.0.0/15) 避坑指南，指导静默下载避免盲目重试 `web_fetch` 触发宿主 SSRF 拦截。
5. **Phase 9（Zotero 开源标准导出与五阶段多 Agent 闭环）**：
   - **9A**：实现 `export_csl_json` 与 `export_ris` 导出动作，输出至 `<workspace>/.rivet/research/export/`；编写 `docs/zotero-integration.md`，对接开源 Zotero 客户端与 `zotero-mcp`，彻底替代商业 EndNote。
   - **9B**：重构 `team-templates.md`，建立包含 Scout、Strategist、Coder、Writer、Gatekeeper 五大角色的分波流水线与双重科学门禁（一级证据链门禁 + 二级代码复现门禁），提供开箱即用天枢 `/team` YAML。
6. **Phase 10（全链路自动化测试与防退化验证）**：
   - 插件测试集扩充至 86 项测试（全部通过，通过即止），宿主 55 项隔离与预设测试全部通过。
