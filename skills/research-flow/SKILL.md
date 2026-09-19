---
name: research-flow
description: 天枢理工多范式科研流。涵盖文献驱动 (literature)、数据实证 (empirical)、理论推导 (theoretical)、工程评测 (benchmark) 与敏捷假说回环 (hypothesis)。日常纯代码项目休眠保持零污染；按需查阅 references/ 保护前缀缓存。
triggers: [论文, 文献, arxiv, OpenAlex, 检索文献, 查论文, DOI, paper search, literature, 润色论文, 读论文, 配色, 科研图, colormap, matplotlib, 数据分析, 统计检验, 假设检验, 理论推导, 量纲, 方差分析, 消融实验, 跑分, benchmark]
---

# 天枢自适应多范式科研工作流 (Tianshu-Research)

天枢科研并非刻板单向的瀑布流，而是根据任务目标与输入材料自适应分流的**五大科研场景矩阵**。

## 1. 场景范式分流导航（按需阅读 references/）

为保护大模型上下文窗口与前缀缓存（Prefix Cache），**严禁一次性将所有场景文档全量塞入 Prompt**。根据本次任务范式，**仅阅读对应的单一参考文件**：

| 科研范式 | 核心定位与适用场景 | 对应按需参考文档 |
|---|---|---|
| **literature** | OA 文献初筛、arXiv/OpenAlex 检索、切片精读、Zotero 导出 | `references/literature.md` |
| **empirical** | CSV/Parquet 数据清洗、统计假设检验、真实置信区间、顶刊出图 | `references/empirical.md` |
| **theoretical** | 物理/数学公式推导、量纲齐次性审查、符号代数、边界渐近极限 | `references/theoretical.md` |
| **benchmark** | 受控代码跑分、单变量消融实验、资源指标监控、可复现收据 | `references/benchmark.md` |
| **hypothesis** | 可证伪假说提出、快速辨别试验、负结果合规存证、跨版本演进 | `references/hypothesis-loop.md` |
| **门禁规约** | 五态科学门禁（pass / fail / inconclusive / not_applicable / error） | `references/scientific-gates.md` |

---

## 2. 作用域守卫与前缀缓存保护原则（硬性纪律）

1. **日常纯代码项目保持零污染与休眠 (Dormancy)**：
   - 目录中仅有常规 `.csv`、代码中调用 `matplotlib` 或普通算法讨论，**绝不足以激活科研授权**，更不得自动发起文献检索或创建科研账本。
   - 只有在用户显式提出科研指令（如 `/research`、明确要求“核验物理量纲”、“按顶刊标准检验置信区间”）或工作区配置了科研授权时才激活。
2. **保护前缀缓存（Prefix Cache Friendly）**：
   - 严禁在进行中的多轮对话中频繁开关 MCP 服务。工具集签名变动会导致全量前缀缓存失效重算。
3. **数据分析任务零文献请求**：
   - 用户要求“清洗这个风洞 CSV 并给出均值与 95% 置信区间”时，直接进入 `empirical` 范式，**绝对不调用文献搜索 API**。

---

## 3. 三档使用模式（轻量化优先）

- **默认：短用（纯对话，零文件）**：
  - 检索论文给出候选表；查单篇给出“问题 / 方法 / 结果 / 局限”四行卡片。
  - 数据简单计算直接输出统计量与区间；理论推导直接给出简洁证明。
  - 结束，不写文件，不碰账本。
- **中用（用户明确要求「记下来 / 写进项目」）**：
  - 在 `.rivet/research/notes/<slug>.md` 写入人可读的 Markdown 读卡（格式参考 `references/reading-card.md`）。
- **长用（用户明确要求「建立证据链 / 科学核验」）**：
  - 调度结构化证据账本，建立 `add_source` / `add_evidence` / `add_claim`，并执行五态门禁审查。
  - 复杂协作工单按需采用 `references/team-templates.md`，短任务坚持单 Agent，不强制派发全波次团队。

---

## 4. 辅助轻量能力

- **顶刊科研图配色**：调用 `journal_palette`（100 套出版级配色，支持 categorical / heatmap / colorblind 等科学角色，详见 `figure/journal_palette.py`）。
- **学术润色**：用户提供段落时，对照修改语法与用词，保留领域专业符号，不伪造额外实验或文献，详见 `references/polishing.md`。
- **文献导出出口**：支持导出标准 CSL-JSON 与 RIS 格式，无缝对接 Zotero 开源生态。
