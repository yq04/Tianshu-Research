---
name: research-flow
description: 查 OA 文献（arXiv / OpenAlex）。粘贴 abs/DOI 即查一篇；短用出候选表等人选。用户要科研图配色时用 journal_palette Python 色板。不要用 web_search 当学术库。用户没说入库就不要写 Zotero。
triggers: [论文, 文献, arxiv, OpenAlex, 检索文献, 查论文, DOI, paper search, literature, 润色论文, 读论文, 配色, 科研图, colormap, matplotlib]
---

# 科研短流程（初筛，不是写论文）

点装路径：

- 桌面：**Settings → MCP 服务 →「科研文献」→ 启用**
- TUI：`/mcp market` 然后 `/mcp enable tianshu-research`

推荐使用 MCP 点装。注意：MCP 启用亦写入全局用户配置，在下一次请求时改变工具指纹；完成科研任务后可通过 `/mcp disable tianshu-research` 或桌面设置停用。

公开可见工具保持极简（`research_query` / `research_evidence` / `journal_palette` / `research_status`）。支持快捷斜杠指令 `/research` 与 `/research-status`。这是 **OA 初筛 + 证据账本 + 顶刊图色板**，不是一键全文翻译/投稿套件。

交互习惯参考 [gpt_academic](https://github.com/binary-husky/gpt_academic)（GPL-3.0，只借鉴用法，不拷代码）：粘贴 arXiv 链接就查这一篇；先摘要后全文；润色只改用户给出的段落。

读卡/证据边界参考 [nature-skills](https://github.com/Yuan1z0825/nature-skills)（Apache-2.0；不是 Nature 期刊官方）：材料不够就标「现有材料无法判断」，不要编页码、图号或未读过的实验。

## 三档使用模式

### 1. 默认：短用（纯对话，零文件）

1. 用户给出 **关键词** → `research_query` (action: "search_papers")，CS 预印本用 `source="arxiv"`。严禁使用 `web_search` 冒充学术库。
2. 用户给出 **arXiv 链接 / id / DOI** → `research_query` (action: "resolve_paper")。
3. 表格或卡片给出题名 / 年份 / DOI / 是否有 OA PDF。**等人选**再展开；若用户已明确指定某篇论文，直接给出该篇分析。
4. 用户要中文解读：只根据**手头材料**给出 **问题 / 方法 / 结果 / 局限** 四行。只有摘要就明确说明「未读全文」；缺图/表/实验就写「现有材料无法判断」，严禁补造。
5. 结束。不写笔记、不调 remember、不建账本、不碰第三方软件。

### 2. 中用（用户明确说「记下来 / 写进项目」）

- 使用宿主现有的文件写入工具（如 `write_file`）在 `.rivet/research/notes/<slug>.md` 写入人可读的 Markdown 读卡。
- 模板格式见 `references/reading-card.md`。任何编辑器均可打开，不强依赖外部应用。

### 3. 长用（用户明确说「建立证据链 / 核实」）

- 显式通过 `research_evidence` 录入结构化账本（`sources.jsonl`、`evidence.jsonl`、`claims.jsonl`）。
- 提取原文核心结论时，提供精确定位（章节、行号、字符区间或已核实页码）。
- 调用 `research_evidence` (action: "verify_ledger") 执行门禁验证。
- 导出出口：仅当用户明确点名 Zotero 或给出 Obsidian 库路径时，才导出对应格式或写入该路径；用户未提时当不存在。

## 精读长文与上下文预算控制（防 20 万 Token 撑爆）

在长文精读和证据提取中，**绝对严禁直接使用 read_file 或在 bash 终端将上百 KB 的论文全文全量回显至对话上下文！**
全量回显单篇论文会一次性注入 2.5 万 tokens，十余轮后上下文迅速膨胀至 20 万 tokens 以上，导致 DeepSeek 首字延迟（TTFT）恶化至数秒并加速触发强制压缩（Compaction）。

**规范轻量精读操作**：
1. **静默导入**：使用 `research_evidence(action="ingest_document", docId="pinn_2025", text=..., sourcePath=...)` 将全文写入工作区结构化磁盘，返回仅含元数据与章节索引。
2. **定向窄读取**：调用 `research_evidence(action="read_section", docId="pinn_2025", section="Introduction", maxChars=2000)`。
   - 仅返回指定章节内容，严格截断在 2000 字符以内；若需阅读后续段落，传入 offset 参数分页读取。
   - 将单轮上下文增量从 25,000 tokens 严格压缩至 1,000 tokens 以内。

## TUN 代理 Fake-IP (198.18.0.0/15) 避坑指南

Windows 环境下开启 Clash / Mihomo 等 TUN 代理软件时，境外域名（如 export.arxiv.org）通常会被劫持解析为 RFC 2544 保留测试网段（198.18.x.x），触发天枢内核安全策略拦截（Access denied: resolves to a private/reserved IP）。
遇到此报错时，**严禁盲目反复重试 web_fetch！**
- **规避方案 A（首选）**：查阅 arXiv 时，优先使用 paper card 中直接给出的官方原生 HTML 在线直链（`- html: https://arxiv.org/html/<id>`）。
- **规避方案 B（脚本静默下载）**：若需获取全文，在终端通过命令行（如 `curl -sL <url> -o .rivet/scratch/paper.html`）下载至临时目录，再调用 `ingest_document(sourcePath=...)` 导入账本。

## Zotero 现代文献出口与五阶段多 Agent 闭环

本项目全面拥抱开源 **Zotero** 生态替代商业闭源的 EndNote：
- **标准 CSL-JSON 导出**：`research_evidence(action="export_csl_json")` → 输出至 `.rivet/research/export/literature.csl.json`。
- **标准 RIS 导出**：`research_evidence(action="export_ris")` → 输出至 `.rivet/research/export/literature.ris`。
- 可直接拖入 Zotero 桌面端，或对接社区开源 `zotero-mcp` 实现自动化双向同步（详见 `docs/zotero-integration.md`）。
- 针对复杂科研课题，推荐使用宿主原生的 `/team` 编排五阶段协作体系（Scout, Strategist, Coder, Writer, Gatekeeper）与双重科学门禁，详见 `references/team-templates.md`。

## 项目级配置隔离与日常使用防干扰

- **日常代码项目 0 干扰**：推荐在科研项目根目录创建局部 `.rivet-config.json` 挂载 `tianshu-research` MCP；日常纯开发项目保持纯净的 26 个核心工具面，避免不必要的 Prompt 开销。
- **保护前缀缓存（Cache Friendly）**：严禁在进行中的多轮长会话中频繁开关 MCP。工具集的改变会导致前缀缓存签名变化并触发 KV Cache 重建。

## 读 PDF（用户要精读时）

- OA PDF URL 用天枢已有的 `import_resource` 或 `pdf_read`，不要自己下载付费全文。
- 公式、图表、表格看原 PDF。抽取文本会糊。
- 不要做「PDF 全文翻译成中文长文」——那是另一类产品，质量一般，也不是本插件的范围。

## 科研图配色（用户要出图时）

100 套顶刊色板已改写为 journal_palette Python 模块，**不要**调用 MATLAB `.p`，也**不要**把这些颜色写进天枢 TUI 主题。

1. 先问图类型：分类曲线 / 热图 / 发散 / 必须色盲安全。没说清就用 `journal_palette` 不带参数，只看推荐 role。
2. 取色：`journal_palette`（`role=categorical|heatmap|diverging|colorblind` 或色板 id 1–100）。色盲安全优先使用 `role=colorblind`（Okabe–Ito）；灰度印刷须配合不同线型（linestyle）或标记（marker）。
3. 画图脚本：将 `journal_palette.py` 与 `journal_palette.json`（位于插件目录 `figure/` 或独立发行包内）复制到用户绘图脚本同级目录。直接使用工具返回的 hex 色值是最简路径；Python 脚本可调用 `colors = journal_palette(16)`；热图连续插值使用 `journal_palette(45, map_n=256)` 或 `66`（viridis）。
4. 不要编造数据或统计星号。

## 润色（用户贴了段落时）

- 先用一句话说清：语言（中/英）和段落角色（摘要/引言/结果/讨论/其他）。默认 generic 学术英文，不要冒充 Nature 投稿规范。
- 只改给出的句子：语法、含混、重复。证据不足就标出来，不要补实验或结论。
- 对照列出改动，保留领域术语与符号。
- 禁止根据关键词直接写一篇可投稿论文。
- 详细润色交付规范与不变量保护要求见 `references/polishing.md`。

## 明确做不到

谷歌学术 related work 生成、知网、付费 PDF、LaTeX 全文校对套件、语音输入、Nature 官方投稿模板、组会 PPT、专利稿、完整 nature-figure 绘图流水线。本插件只有色板 + 最短 rcParams，不是投稿图工厂。
