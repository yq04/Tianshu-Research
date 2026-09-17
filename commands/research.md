# /research — 科研意图识别与研究流引导

你收到了用户的科研指令或探索主题：`$ARGUMENTS`。

## 执行步骤与纪律
1. **状态诊断**：调用 `research_status` 工具获取当前工作区的科研账本统计、检索引擎与色板就绪情况。
2. **意图分析**：
   - 若 `$ARGUMENTS` 为论文 DOI 或 arXiv ID/URL，调用 `research_query`（action: "resolve_paper"）解析文献详情。
   - 若 `$ARGUMENTS` 为研究课题或关键词，制定精准检索策略，调用 `research_query`（action: "search_papers"）检索高质量 OA 论文。
   - 若 `$ARGUMENTS` 为空，展示当前科研环境快照，并引导用户提供具体探索课题或论文标识符。
3. **证据账本驱动 (Evidence Ledger)**：
   - 筛选出目标文献后，调用 `research_evidence`（action: "add_source"）将文献元数据纳入账本。
   - 提取原文核心结论与数据时，必须提供精确定位锚点（如 page / section / equation / figure），调用 `research_evidence`（action: "add_evidence"）关联到已录入文献。
   - 形成科学结论时，调用 `research_evidence`（action: "add_claim"）关联证据链，严禁无来源凭空编造。