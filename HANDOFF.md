# HANDOFF — Tianshu-Research (天枢理工科研能力扩展包)

> **给完全没有本会话上下文的新 Agent 或开发者**：动手前请完整精读本文。当前代码、测试、文档与双 GitHub 仓库已全线封顶就绪，无需再进行无休止的底层重构或过度验证。后续唯一目标是**基于用户给定的真实课题展开端到端实战演练**。

---

## 一、我们在做什么任务

在 **Tianshu-Harness**（天枢智能体运行时，CLI 为 `rivet`，包名 `tianshu-tui` 3.20.0，主工作区 `D:\1_Research\Develop_Research`）的基础上，打造并交付第一方理工科研能力扩展包 **Tianshu-Research Overlay**（插件目录 `plugins/tianshu-research/`，独立开源仓库 `D:\1_Research\Tianshu-Research`，远端为 `https://github.com/yq04/Tianshu-Research`）。

**核心哲学契约**：
1. **一套科研内核，两个交互表面**：既能作为天枢第一方插件（具备原生 Skill、斜杠指令、双路互斥与桌面端一键集成），也能作为通用 stdio MCP Server（服务于 Cursor、Claude Desktop 等外部环境）。
2. **Harness 负责思考与编排，Research 负责测量、存证与科学验收**：严禁在插件内重新造一套孤立混乱的 Agent 运行时；多智能体协作直接复用宿主原生的 `/team` 与 `/council`。
3. **DeepSeek 是默认主模型，坚决捍卫前缀缓存**：严格保护 DeepSeek V4 在长会话中 95%–99% 的 KV Cache 命中率。科研工具面严格收敛为 4 个公开网关，绝不侵入宿主 26 个核心编程工具面。
4. **全面拥抱开源 Zotero，坚决摒弃商业 EndNote**：支持导出标准 CSL-JSON 与 RIS，一键导入 Zotero 客户端或对接 `zotero-mcp`。

---

## 二、已经完成了什么

项目经历了重组与深度实测问题治理（Phase 1 至 Phase 10），全部 86 项 Node.js 单元测试与 6 项 Python 出版色板测试 100% 绿灯，所有改动已推送到 GitHub 双仓库：

### 1. 公开工具面收敛为 4 大网关（Phase 1–4）
- **`research_query`**：开放文献统一检索网关。并发检索 arXiv 与 OpenAlex 2.5 亿学术图谱，按 DOI/arXiv ID 直链 OA PDF 与官方 HTML。
- **`research_evidence`**：结构化证据账本、窄精读与科学门禁网关。涵盖材料入库（`ingest_document`）、章节定向精读（`read_section`，严格限 2000 字符内防爆 Token）、添加来源/证据/主张、双向检索、门禁核验（`verify_ledger`）、CSL-JSON 与 RIS 标准导出。
- **`journal_palette`**：100 套顶刊出版色板（Nature, Science, IEEE, Okabe-Ito 色盲友好）。内存即时计算，零额外依赖。
- **`research_status`**：科研环境与工作区状态诊断，不伪造全绿状态。
- **历史工具下线**：`paper_search`、`paper_lookup`、`research_compute`、`research_document`、`research_job` 等已收敛进内部网关，不再泄露至公开工具表。
- **双路启用互斥**：在 CLI、TUI 与 REST 接口中实现了插件与 MCP 服务的对称互斥检查，杜绝双份工具指纹摧毁前缀缓存。

### 2. 实测四大隐患深度治理与五层工作流吸收（Phase 5–10）
- **防 20 万 Token 撑爆**：针对大模型单调累积导致的 20 万 Token 上下文暴涨与首字延迟恶化，研发 `read_section` 窄动作，将单轮论文精读增量压制在 1000 tokens 以内。
- **学术源防风控与节流**：OpenAlex 接入官方 Polite Pool（自动注入 `&mailto=`，支持 API Key）；实现 arXiv 3 秒内存 Promise 队列调度器，强制请求间隔 `>= 3000ms`；捕获 429/403 优雅降级。
- **TUN 代理 Fake-IP 规避**：针对 Windows 下 Clash / Mihomo 将境外域名解析为 198.18.x.x 假网段触发宿主 SSRF 拦截的问题，在检索卡片直链 arXiv 官方 HTML，并在 Skill 中指引静默下载。
- **项目级隔离防干扰 (Zero-Pollution)**：确立全局默认关闭、科研项目根目录局部挂载 `.rivet-config.json` 的规范，日常常规编程 0 额外 Token 消耗、0 缓存抖动、0 决策干扰。
- **Zotero 开源生态对接**：提供 `export_csl_json` 与 `export_ris`，产物输出至 `.rivet/research/export/`，一键拖拽入库；编写 `docs/zotero-integration.md`。
- **五阶段多 Agent 闭环与双重门禁**：在 `team-templates.md` 中定义了 Scout、Strategist、Coder、Writer、Gatekeeper 协作流水线，设定一级证据链真实性门禁与二级代码复现门禁。

### 3. 双仓库与发布构建全量固化
- **宿主仓库**（`https://github.com/yq04/Tianshu-harness.git`）：更新了插件源码、打包脚本、静态资源、测试用例与开发文档（Commit `eebc2b2`）。
- **独立仓库**（`https://github.com/yq04/Tianshu-Research.git`）：更新了 4 网关架构、CI 自动化工作流、npm test 脚本、完整 README、Zotero 与 CVM 模版（Commit `e94609e`）。

---

## 三、当前卡在哪（Current Status & Blockers）

**结论：当前没有任何代码、架构、环境或测试层面的技术阻塞卡点！**

- **代码与测试**：全量 86+6 项单测通过即止，构建脚本 `stage-plugins.js` 运行正常。
- **Git 状态**：两个仓库的本地工作区完全干净（`working tree clean`），且与 GitHub 远程 `main` 分支 100% 同步。
- **唯一等待项**：等待用户提供一个**真实的科研课题**（例如：某个物理信息神经网络 PINN 在流体力学中的改进、拓扑绝缘体材料筛选、某种新型接触力学解析解等），以便展开全链路的实战演练。

---

## 四、下一步计划是什么

不需要再继续写单元测试或反复修改架构文档，直接按以下步骤进入实战演练：

1. **获取用户真实课题**：接收用户的具体研究方向、目标论文或课题描述。
2. **建立干净的科研实战工作区**：
   - 在独立课题目录（如 `D:\1_Research\Case_Study_xxx`）下创建项目级配置文件 `.rivet-config.json`：
     ```json
     {
       "mcpServers": {
         "tianshu-research": {
           "command": "node",
           "args": ["D:/1_Research/Tianshu-Research/mcp-server.js"]
         }
       }
     }
     ```
3. **按五阶段工作流推进实战**：
   - **Wave 1（文献初筛）**：调用 `research_query(action="search_papers", query="...")` 检索前沿文献，提取真实 DOI 与 arXiv 直链。
   - **Wave 2（方案设计与证据沉淀）**：使用 `read_section` 精读核心章节，通过 `research_evidence` 录入 source 与带有真实章节/行号的 evidence 片段，提炼 claim。
   - **Wave 3（科学门禁核验）**：运行 `research_evidence(action="verify_ledger")`，确保 90%+ 定位覆盖率与全文摘录匹配。
   - **Wave 4（导出与图表）**：调用 `export_ris` 导出文献供 Zotero 归档；使用 `journal_palette` 生成 Nature/Science 顶刊配色的仿真曲线图。
   - **Wave 5（双重质控交付）**：运行复现脚本，输出完整的实战科研成果报告。

---

## 五、血泪踩坑总结（绝对不要再踩的坑！）

以下均为在实战与深度实机调试中遇到的致命硬伤，新 Agent 必须严格遵守：

### 1. CPA / Gemini 1:1 工具调用死穴（违者必定秒报废会话）
- **现象**：在 `functions__exec` 脚本中调用 `notify(...)` 或 `yield_control()` 会向服务端额外推入响应，导致 CPA 转换器队列错位，抛出 `functionResponse.id does not match functionCall.id (HTTP 400)`。该错位会被写入 SQLite，导致会话永久报废。
- **铁律**：**严禁在 `exec` 脚本内部调用 `notify(...)` 或 `yield_control()`**！所有过程进度必须且只能在工具调用外通过正常的 `commentary` 消息发送。

### 2. 双仓库绝对区分（别把代码推错地方）
- 本地存在两个平行的 Git 仓库：
  - 宿主：`D:\1_Research\Develop_Research` → 远端 `yq04/Tianshu-harness.git`
  - 插件独立仓：`D:\1_Research\Tianshu-Research` → 远端 `yq04/Tianshu-Research.git`
- **铁律**：更新插件独立开源项目时，必须在 `D:\1_Research\Tianshu-Research` 提交并推送到 `yq04/Tianshu-Research`；不要混淆 remote 或漏推。

### 3. 严禁把整篇 PDF / 论文内容全量打印进会话（20 万 Token 撑爆）
- **现象**：大模型使用 `cat` 或 `read_file` 把 100KB 的论文全部打印到对话历史，导致会话上下文在 10 轮内撑爆到 20.7 万 Tokens，首字延迟（TTFT）飙升到 5.6 秒，严重破坏 DeepSeek 缓存。
- **铁律**：论文必须静默存盘，只使用 `research_evidence(action="read_section", maxChars=2000)` 定向窄读取目标章节！

### 4. 严防 TUN 代理 Fake-IP 触发宿主 SSRF 防御
- **现象**：Windows 用户开启 Clash/Mihomo 的 TUN 模式时，境外国外学术域名被解析为 `198.18.x.x` 假网段，宿主内核的 `validateUrl` 判定为私有网段触发 SSRF 安全拦截。
- **铁律**：不要死循环重试 `web_fetch`；arXiv 优先使用卡片提供的原生直链 `https://arxiv.org/html/<id>`，或使用 `curl` / `Invoke-WebRequest` 下载本地后再解析。

### 5. arXiv 3 秒与 OpenAlex 礼貌池
- **铁律**：发往 arXiv API 的请求必须间隔 `>= 3000ms`（已由内置调度器保障，外部不要高并发暴击）；发往 OpenAlex 的请求必须携带有效 `mailto`。

### 6. 证据账本与科学门禁真实性
- **铁律**：`evidence` 记录必须包含真实物理定位（章节名、行号区间或全文摘录），严禁虚构页码；`verified` 主张要求 90%+ locator 覆盖率且在原文中有真实对应，占位符（`TODO`, `[citation needed]`）会被门禁一票否决。

### 7. 高危命令与过度检验戒律
- **铁律**：严禁未经用户明确授权执行 `git reset --hard`、`git clean`、`git stash drop` 等破坏性命令。
- **铁律**：坚持**通过即止（Stop on Green）**，核心单测通过后立即交付，严禁无端扩散探索虚构边缘用例浪费 Token。
