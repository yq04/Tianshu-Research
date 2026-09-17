---
name: research-flow
description: 查 OA 文献（arXiv / OpenAlex）。粘贴 abs/DOI 即查一篇；短用出候选表等人选。用户要科研图配色时用 journal_palette / journal_palette Python 色板。不要用 web_search 当学术库。用户没说入库就不要写 Zotero。
triggers: [论文, 文献, arxiv, OpenAlex, 检索文献, 查论文, DOI, paper search, literature, 润色论文, 读论文, 配色, 科研图, colormap, matplotlib]
---

# 科研短流程（初筛，不是写论文）

点装路径：

- 桌面：**Settings → MCP 服务 →「科研文献」→ 启用**
- TUI：`/mcp market` 然后 `/mcp enable tianshu-research`

推荐使用 MCP 点装。注意：MCP 启用亦写入全局用户配置，在下一次请求时改变工具指纹；完成科研任务后可通过 `/mcp disable tianshu-research` 或桌面设置停用。

工具集包含收敛网关（`research_query` / `research_evidence` / `research_status`）及完全向后兼容的原子工具（`paper_search` / `paper_lookup` / `journal_palette`）。支持快捷斜杠指令 `/research` 与 `/research-status`。这是 **OA 初筛 + 证据账本 + 顶刊图色板**，不是一键全文翻译/投稿套件。

交互习惯参考 [gpt_academic](https://github.com/binary-husky/gpt_academic)（GPL-3.0，只借鉴用法，不拷代码）：粘贴 arXiv 链接就查这一篇；先摘要后全文；润色只改用户给出的段落。

读卡/证据边界参考 [nature-skills](https://github.com/Yuan1z0825/nature-skills)（Apache-2.0；不是 Nature 期刊官方）：材料不够就标「现有材料无法判断」，不要编页码、图号或未读过的实验。证据落盘推荐使用 `research_evidence` 录入结构化账本（`sources.jsonl`、`evidence.jsonl`、`claims.jsonl`）。需要深度多 Agent 综述时参考 `references/team-templates.md` 调度 Harness `/team` 与 `/council`。

## 默认：短用

1. 用户丢来 **关键词** → `paper_search` 或 `mcp__tianshu-research__paper_search`（CS 预印本用 `source=arxiv`）。不要用 `web_search` 冒充学术检索。
2. 用户丢来 **arXiv 链接 / id / DOI** → `paper_lookup` / `mcp__tianshu-research__paper_lookup`。
3. 表格或卡片给出题名 / 年 / DOI / 是否有 OA PDF。**等人选**再展开。不要一口气「综述十篇」。
4. 用户要中文解读：只根据**手头材料**写 **问题 / 方法 / 结果 / 局限** 四行。只有摘要就写明「未读全文」；缺图/表/实验就写「现有材料无法判断」，不要补造。
   - 详细精读卡模板见 `references/reading-card.md`。
5. 结束。不要写笔记、remember、Zotero，除非用户明确说「记住 / 入库」。

## 读 PDF（用户要精读时）

- OA PDF URL 用天枢已有的 `import_resource` 或 `pdf_read`，不要自己下载付费全文。
- 公式、图表、表格看原 PDF。抽取文本会糊。
- 不要做「PDF 全文翻译成中文长文」——那是另一类产品，质量一般，也不是本插件的范围。

## 科研图配色（用户要出图时）

100 套顶刊色板已改写为 journal_palette Python 模块，**不要**调用 MATLAB `.p`，也**不要**把这些颜色写进天枢 TUI 主题。

1. 先问图类型：分类曲线 / 热图 / 发散 / 必须色盲安全。没说清就用 `journal_palette` 不带参数，只看推荐 role。
2. 取色：`mcp__tianshu-research__journal_palette`（`role=categorical|heatmap|diverging|colorblind` 或色板 id 1–100）。色盲安全优先使用 `role=colorblind`（Okabe–Ito）；灰度印刷须配合不同线型（linestyle）或标记（marker）。
3. 画图脚本：将 `journal_palette.py` 与 `journal_palette.json`（位于插件目录 `figure/` 或独立发行包内）复制到用户绘图脚本同级目录。直接使用工具返回的 hex 色值是最简路径；Python 脚本可调用 `colors = journal_palette(16)`；热图连续插值使用 `journal_palette(45, map_n=256)` 或 `66`（viridis）。`apply_journal_style()` 设置 Arial 矢量字体、精简坐标轴与图例规范。
4. 不要编造数据或统计星号。完整多面板/投稿尺寸/source data 走 nature-figure，不是本工具。

## 润色（用户贴了段落时）

- 先用一句话说清：语言（中/英）和段落角色（摘要/引言/结果/讨论/其他）。默认 generic 学术英文，不要冒充 Nature 投稿规范。
- 只改给出的句子：语法、含混、重复。证据不足就标出来，不要补实验或结论。
- 对照列出改动，保留领域术语与符号。
- 禁止根据关键词直接写一篇可投稿论文。
- 详细润色交付规范与不变量保护要求见 `references/polishing.md`。

## 长用（用户明确要求时）

- 入库：本机需打开 Zotero；没有就明说。
- 笔记必须带 `doi` 或 `citekey`。
- `memory remember` 只记课题一句 + 工作 citekey。

## 明确做不到

谷歌学术 related work 生成、知网、付费 PDF、LaTeX 全文校对套件、语音输入、Nature 官方投稿模板、组会 PPT、专利稿、完整 nature-figure 绘图流水线。本插件只有色板 + 最短 rcParams，不是投稿图工厂。


