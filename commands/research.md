# /research — 科研文献检索与解析

你收到了用户的科研指令或探索参数：`$ARGUMENTS`。

## 执行步骤与纪律
1. **参数解析与分流**：
   - 若 `$ARGUMENTS` 为空：给出简短用法说明（如 `/research <DOI 或 arXiv ID>` 或 `/research <关键词>`），等待用户输入具体目标。不强制调用 `research_status`。
   - 若 `$ARGUMENTS` 为论文标识符（DOI、arXiv ID 或 URL）：调用 `research_query`（action: "resolve_paper", id: "$ARGUMENTS"），在对话中展示元数据和摘要。
   - 若 `$ARGUMENTS` 为研究课题或关键词：调用 `research_query`（action: "search_papers", query: "$ARGUMENTS"），在对话中以表格或列表列出候选文献（题名、年份、DOI/arXiv、是否有 OA PDF），等待用户选择，不预设批量入库。
2. **默认短用原则**：
   - 默认不在本地建立结构化账本，不写工作区文件，不强制调用 `research_status`，不写入记忆库或第三方文献软件。
   - 用户要求解读时，基于手头材料给出“问题 / 方法 / 结果 / 局限”四行，明确说明未读全文或无法判断之处。
3. **扩展支持（仅在用户明确要求时）**：
   - 若用户要求“记下来 / 写进项目”：使用宿主现有文件写入工具在 `.rivet/research/notes/` 创建 Markdown 读卡。
   - 若用户要求“建立证据链 / 核实”：再使用 `research_evidence` 录入文献、证据与主张，并执行 `verify_ledger`。
