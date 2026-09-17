---
title: Tianshu-Research 能力地图 — 在天枢上叠加理工科研能力
type: research
status: draft
date: 2026-09-16
tags: [tianshu-research, skills, plugins, mcp, stem, literature]
---

# Tianshu-Research 能力地图

> 天枢是编码 Agent 运行时，不是科研工作台。理工科研能力应做成 **Tianshu-Research overlay**（Skills + Plugin + 自定义星域 + 项目模板），不要硬分叉 `src/agent/loop.ts`。

## 调研问题

1. 天枢现在实际是什么？科研相关能力已经有哪些、缺哪些？
2. 查阅资料、阅读文献、科研 Skills、实验复现、论文写作，各自该落在哪一层？
3. Tianshu-Research 应该是独立 overlay，还是改 Harness 内核？

## 方法

- Fork [`yq04/Tianshu-harness`](https://github.com/yq04/Tianshu-harness) 并与上游 `huiliyi37/Tianshu-harness@361e043`（2026-09-16，`tianshu-tui@3.20.0`）对齐后 clone 到本工作区。
- 读 [AGENTS.md](../../AGENTS.md)、[docs/architecture-overview.md](../architecture-overview.md)、[docs/skills-architecture.md](../skills-architecture.md)、[docs/plugins.md](../plugins.md)。
- 核对本树 `src/agent/`、`src/skills/`、`src/plugins/`、`src/tools/`、`src/mcp/`、`plugins/`。
- 全树检索 `arxiv` / `pubmed` / `OpenAlex` / `Semantic Scholar` / `bibtex`：**src 内零命中**。

## 发现

### 1. 天枢是什么

天枢（CLI 仍为 `rivet`）是针对 DeepSeek V4 前缀缓存优化的 **终端编程智能体运行时**。三大支柱：

1. **CVM** — `RuntimeHookPipeline` 五阶段（preTurn → afterPerception → postTool → postTurn → postSession），条件装配 60+ hook。
2. **Prefix-cache-first** — 冻结 system + 工具定义；动态内容只进 volatile appendix。
3. **星域纪律** — 16 个内置域，全部是软件工程认知姿态。

入口：`src/main.ts` → `bootstrapInteractiveSession` → `AgentLoop`。Skills 在 agent 创建前加载；MCP / plugins 默认 **异步后装**，随后 `agent.updateTools()`（工具指纹可能在首轮后变化）。

本公开 checkout **没有 `desktop/`**。`package.json` 仍有 `test:desktop`。上游走双仓同步（[CONTRIBUTING.md](../../CONTRIBUTING.md)）：公开仓不按普通 GitHub merge 合入。Tianshu-Research 更不应直接改公开仓核心。

不要和 [`oh-my-tianshu`](https://github.com/huiliyi37/oh-my-tianshu)（DeepSeek Harness 插件化 fork）混为一条产品线。

### 2. 已有、可被科研复用的能力

| 能力 | 落点 | 科研含义 |
|------|------|----------|
| 通用检索 | `web_search`：Bing / Brave / DDG / Tavily / 博查 | 网页检索，不是学术库；排序按网页相关性 |
| 抓网页 | `web_fetch` | **拒绝二进制**；PDF URL 必须改走 `import_resource` |
| 导入文档 | `import_resource` + `doc-extract.ts` | PDF/DOCX 抽文本；PDF 依赖 `pdftotext`；带 `[extracted-text]` 失真标注 |
| 原生 PDF 插件 | `plugins/office-pdf`：`pdf_read` / `pdf_create` | 可读论文正文；无公式/图表结构；生成面向办公报告 |
| 知识工作方法论 | [docs/seed-capsule-knowledge-work.md](../seed-capsule-knowledge-work.md) | 已有「汇集→梳理→交付→长周期」骨架，面向报告而非 STEM 文献 |
| 验证纪律 | 瑶光域、`self-verify-hook`、DeliveryGate、wave-gate | **编码形**验证：`run_tests` / `deliver_task` / 测试 bash 才算 verify；`web_search`/`web_fetch` 被标成 **read-class** |
| 多视角 | `/council`、`/team`、`/scout`、galaxy | 可做对抗审稿 / 并行检索；council 在 minimal 档默认不装 |
| 记忆 | `.rivet/knowledge/memory.jsonl` | 可记课题约束；信息素是会话内代码足迹，不跨论文 |
| 办公插件 | docx / xlsx / pptx | 可交报告/海报，不是 LaTeX 论文 |
| TUI LaTeX | `src/tui/pi/latex-*.ts` | **只渲染对话里的公式为 Unicode**，不能写/编译论文 |

内置 Skills 只有：`leave-ritual`、`skill-management`、`galaxy`。随包 bundled：`brainstorming`、`visual-acceptance`。`research-spec` 已退役（`RETIRED_BUNDLED_SKILLS`）。

MCP 预设：Context7 / GitHub / Slack / Notion / GDrive / M365 / Linear / tianshu-mcp。**没有**学术库。

### 3. 硬缺口（src 内零实现）

- 学术检索：arXiv / OpenAlex / Semantic Scholar / Crossref / PubMed / Unpaywall
- 引用核验：DOI、bibtex、引用图、开放获取 PDF
- 论文结构阅读：IMRaD、图表、公式、补充材料
- 实验闭环：Jupyter / pytest-beyond-repo / 数据校验 / 随机种子 / 可复现环境
- 科研写作：LaTeX 工程、投稿模板、引用管理
- 科研认知姿态：无「科学方法」星域；最接近的是瑶光（复现）、开阳（对账）、天权（审查）、文曲（写作关键词含 research）

### 4. 三条合法扩展通道（按改动半径）

**Skills**（`.rivet/skills/` 或 `~/.agents/skills/`）

- 三级披露：L1 只放 name+description（发现块约 1500 字符预算）；L2 `skill` 工具加载全文；L3 目录技能的 `references/` / `scripts/` 按需读。
- 运行时扫描：内置 → `~/.agents/skills` → `~/.rivet/skills` → 项目 `.agents/skills` → 项目 `.rivet/skills`（后者覆盖）。
- 不热加载；发现块进 volatile appendix，**不进冻结前缀**。
- `skill-management` 明文建议：整个项目不要超过约 5 个 skill。科研包必须少而厚（目录技能 + L3），不能塞 20 个扁平 md。

**Plugins**（`~/.rivet/plugins/<name>/`，样板 `plugins/office-pdf`）

- 同进程 Node 模块，可带 npm 依赖；manifest 可绑 tools + skills + hooks + slash commands。
- 工具名冲突会 **拒绝整个插件**；skill 名冲突只跳过该 skill。
- 安装：`/plugin install ./path`，下会话生效。内核 wrapper 展平 `params.input` 并做路径守卫。
- 适合：必须有新 tool 的学术 API / 结构化 PDF。

**MCP**

- 工具名 `mcp__<server>__<tool>`，进同一审批链。适合先接现成学术 MCP，验证工具面，再决定是否收成 first-party plugin。
- 后装会改工具指纹 → 前缀缓存碎一次。科研会话应在启动前配好（或 `asyncExtras: false`）。

**自定义星域**（零改内核）

- `.rivet/domains/<id>/card.md`：`name` / `keywords` / `toolWhitelist` / `volatileBlock` / 正文 `systemPromptSuffix`。
- **不能覆盖** 16 个内置 id。`toolWhitelist` 是真实交集；拼错会 fail-closed 成空工具表。
- 域切换会切冻结前缀。课题状态不要写进星域块。

**不要先做**

- 往 `CORE_TOOLS` / `default-registry.ts` 加学术工具（kernel 预算 ≤26，永久占用前缀）。
- 改 `AgentLoop` / `static.ts` / 内置星域碑文（受保护区，需 owner）。
- 把 `web_search` 后端直接改成学术库当默认（会污染日常编码检索）。

### 5. 科研任务 → 落层判断

| 用户任务 | 现状 | Tianshu-Research 第一刀 | 何时才动内核 |
|----------|------|-------------------------|--------------|
| 查阅资料 | 通用网页搜索 | Skill：强制走 DOI/arXiv/OpenAlex；Plugin 或 MCP 提供 `paper_search` | 仅当学术检索必须常驻 CORE |
| 阅读文献 | `import_resource` + `pdf_read`，版面失真 | Skill：抽 IMRaD、图表用 vision、负向结论回看原 PDF | 结构化 PDF parser 成熟后再做 plugin |
| 引用核验 | self-verify 不认网页为 verify | Skill：每条断言要 DOI；脚本核 Crossref | 若要 CVM 把「无 DOI 结论」当验证债，再加 hook |
| 实验复现 | 瑶光 + `run_tests` 面向仓库测试 | Skill + bash：环境、种子、数据校验、最小复现 | 不要新 kernel 工具 |
| 科研写作 | office 插件 + 文曲域 | Skill：论文结构/投稿清单；LaTeX 走 bash | LaTeX 插件可后置 |
| 长周期课题 | plan / memory / handoff | 项目模板 + knowledge-work 胶囊的 STEM 特化 | 不改 loop |

## 结论与可借鉴点

**产品形态**：Tianshu-Research 是天枢之上的 **科研 overlay 发行包**，不是新 harness。用户继续跑 `rivet`，在科研仓库里加载本包的 skills / plugin / 域卡 / `.rivet-config.json`。

**推荐推进顺序**（未实现，待立项）：

1. **项目骨架** — 独立仓 `Tianshu-Research`（不要把科研资产长期堆进本 harness fork）。含：安装说明、`.rivet-config.json`（`tools.preset: full`，启用 office-pdf）、自定义域 `research`。
2. **Skills 包（≤5 个目录技能）** — 建议：`literature-search`、`paper-read`、`cite-verify`、`experiment-repro`、`scientific-write`。SKILL.md 当路由，重料进 `references/`，可执行核验进 `scripts/`。可对照本机已有的 paper-lookup / literature-review，但必须改写成天枢 frontmatter + 三级披露，不能原样丢 `.cursor/skills`。
3. **Plugin `tianshu-research`** — 对标 office-pdf：`paper_search`（arXiv + OpenAlex + Semantic Scholar）、可选 `cite_lookup(doi)`。捆绑上述 skills。权限 `net` + `fs`。
4. **MCP 试验槽** — 若已有稳定学术 MCP，先配进科研会话，量工具面再决定收编。
5. **后置** — 自定义域方法论（谨慎、要证据、courage ~0.7）；再后才考虑 citation-verify CVM hook（要改 harness，走上游贡献流程）。

**明确不值得先做**：新内置星域、kernel 学术工具、改冻结系统提示、把 TUI latex-to-unicode 当成论文引擎、fork AgentLoop。

**复用优先于发明**：知识工作四段流、瑶光「复现即证」、`import_resource` 失真标注、office-pdf、council 对抗审查，都已经是科研纪律的半成品。Tianshu-Research 要把它们从「编码/办公」特化成「文献/实验/引用」。

## GitHub 开源科研 Skill 调研（2026-09-16）

使用 GitHub CLI 检索 `SKILL.md`、学术 MCP、Zotero/Obsidian 联动仓。结论：**业界成功形态不是「塞 100 个 Skill」，而是「少量编排 Skill + MCP 工具层」。** 天枢发现层约 1500 字符、`skill-management` 建议全项目不超过约 5 个 skill，必须比 Claude Scholar 更克制。

### 最该借鉴的发行形态

| 仓库 | Stars | License | 对 Tianshu-Research 的意义 |
|------|------:|---------|---------------------------|
| [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) | 45128 | MIT | 166 个科学 skill 的内容库（paper-lookup / literature-review / citation-management / scientific-writing / pyzotero）。**当 L3 参考与脚本母本，禁止全量装进天枢。** |
| [Galaxy-Dawn/claude-scholar](https://github.com/Galaxy-Dawn/claude-scholar) | 5513 | 见仓 | 最完整的「人在回路」科研 OS：Zotero MCP、Obsidian KB、`zotero-obsidian-bridge`、Nature 写作/润色/审稿回复、引用核验、证据门。**编排与证据合同直接可抄。** |
| [Geek96/paper-research-skill](https://github.com/Geek96/paper-research-skill) | 21 | MIT | 结构最贴你的需求：`paper-research` 编排器 → `paper-fetch` → `paper-zotero` → `paper-wiki`（Obsidian）。Skill 管流程，MCP 管搜索/Zotero/Obsidian。**推荐作为 overlay 骨架。** |
| [openags/paper-search-mcp](https://github.com/openags/paper-search-mcp) | 2640 | MIT | arXiv / PubMed / S2 / bioRxiv 搜索+下载。接天枢 MCP，不要写成 kernel 工具。 |
| [54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp) | 5040 | MIT | 文献库 MCP 事实标准。 |
| [coddingtonbear/obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api) | 2930 | — | Obsidian 本地 REST；再经 MCP 或直写 vault。 |
| [WenyuChiou/research-hub](https://github.com/WenyuChiou/research-hub) | 55 | MIT | Zotero + Obsidian + NotebookLM 工作区，强调「用任意两个即可」。 |
| [917Dhj/DeepPaperNote](https://github.com/917Dhj/DeepPaperNote) | 1079 | MIT | 单篇深读 → Obsidian 笔记。并入 `paper-read`。 |
| [Master-cai/Research-Paper-Writing-Skills](https://github.com/Master-cai/Research-Paper-Writing-Skills) | 6844 | MIT | 中文 CS 论文写作笔记改编。并入 `manuscript-write`。 |
| [zLanqing/codex-claude-academic-skills](https://github.com/zLanqing/codex-claude-academic-skills) | 3941 | MIT | **三个**中文 skill 覆盖阅读报告 / 写作润色审稿 / 科学计算。证明「少而厚」可行。 |
| [PHY041/claude-skill-citation-checker](https://github.com/PHY041/claude-skill-citation-checker) | 32 | — | .bib 对 Crossref / S2 / OpenAlex 核验。并入 `cite-verify`。 |
| [cookjohn/cnki-skills](https://github.com/cookjohn/cnki-skills) / [gs-skills](https://github.com/cookjohn/gs-skills) | 940 / 509 | — | 知网 / Google Scholar（浏览器 MCP）。作可选 L3，不进默认 5 技能。 |

不要当默认路径：[Spark-To-Paper-Skills](https://github.com/Spark-To-Paper-Skills/spark-to-paper-skills)（1035）「一句话出草稿」幻觉风险高。Claude Scholar 的立场更合适：**人做判断，Agent 加速流程**。

### 业界分层（应原样落到天枢）

```
Skill = 方法论与路由（短 SKILL.md + references/ + scripts/）
MCP   = 真工具（搜论文、读写 Zotero、写 Obsidian）
Vault = 知识落盘（citekey 为稳定 ID，Better BibTeX）
Zotero = 文献真相源（PDF / 元数据 / 批注）
```

Geek96 的流水线：检索下载 → Zotero 去重入库 → Obsidian wiki/MOC/综合。Galaxy-Dawn 的桥：`Zotero → Sources/Papers → Knowledge → Writing`，晋升知识必须带 Evidence Record。这正好补上天枢 `self-verify-hook` 把 `web_search` 当只读、不算验证的缺口。

## 修订后的产品形态

**已被 [tianshu-research-plan.md](./tianshu-research-plan.md) 取代。** 更深度核对上游后：编码 Agent 应走 `paper-search` / `zotero-cli` + `~/.agents/skills`，默认不上 MCP，也不做 6 技能 / 星域 / slash。v1 只装两个上游 CLI，自写两个薄路由 skill。

## 来源

- 本树 `src/skills/skill-loader.ts` — 五层加载顺序、退役 `research-spec`、内置三个 skill
- 本树 `src/plugins/plugin-loader.ts` / `docs/plugins.md` — 插件 ABI 与安装目录
- 本树 `src/tools/web-search/build-backends.ts` — 网页搜索后端清单
- 本树 `src/tools/doc-extract.ts` / `src/tools/web-fetch/fetch-core.ts` — PDF 路径与二进制拒绝
- 本树 `src/agent/hooks/self-verify-hook.ts` — 网页检索不算 verification
- 本树 `src/agent/star-domain-data.ts` / `star-domain-registry.ts` — 16 内置域 + 自定义 card.md
- 本树 `docs/seed-capsule-knowledge-work.md` — 最接近科研的现有方法论
- 上游仓库 https://github.com/huiliyi37/Tianshu-harness — 公开仓 HEAD `361e043`
- GitHub：K-Dense-AI/scientific-agent-skills、Galaxy-Dawn/claude-scholar、Geek96/paper-research-skill、openags/paper-search-mcp、54yyyu/zotero-mcp、917Dhj/DeepPaperNote、Master-cai/Research-Paper-Writing-Skills、zLanqing/codex-claude-academic-skills
