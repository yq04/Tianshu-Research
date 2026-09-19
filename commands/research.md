# /research — 自适应多范式科研调度指令

你收到了用户的科研指令或探索参数：`$ARGUMENTS`。

## 执行步骤与纪律
1. **多范式场景自适应分流**：
   - **参数为空**：给出简要用法说明：
     - `/research <DOI 或 arXiv ID>`（文献解析）
     - `/research <研究关键词>`（文献初筛）
     - `/research data <路径.csv>`（数据画像与统计检验）
     - `/research theory <方程或公式>`（量纲齐次性与符号推导）
     - `/research benchmark <评测目标>`（消融实验与跑分对比）
     - `/research hypothesis <猜想命题>`（敏捷假设验伪回环）
   - **文献初筛或解析**：
     - 若为论文标识符（DOI、arXiv ID 或 URL）：调用 `research_query(action="resolve_paper", id="$ARGUMENTS")`，在对话中展示元数据与摘要。
     - 若为学术课题：调用 `research_query(action="search_papers", query="$ARGUMENTS")`，以候选表列出文献，等待用户选择，不预设批量入库。
   - **数据实证 (Empirical)**：
     - 用户涉及数据清洗、方差分析、回归或出图：调用 `research_evidence(action="plan_workflow", objective=..., inputs=[...])` 或直接执行数据/统计操作，**严禁调用学术库检索**。
   - **理论推导 (Theoretical)**：
     - 用户涉及方程推导、量纲分析：调用理论操作 `theory.dimension@1` 等，执行量纲与物理自洽审查。
   - **工程评测 (Benchmark)**：
     - 用户涉及消融或性能对比：调用 `benchmark.plan@1` 等，捕获可复现收据。
   - **敏捷假说 (Hypothesis)**：
     - 用户提出猜想并要求验伪：建立假设回环会话，执行辨别试验，负结果合规保留，多版本演进。

2. **默认轻量短用原则**：
   - 短任务单 Agent 在主会话中搞定，不写工作区文件，不强制派发多 Agent 团队或 Council。
   - 仅当用户明确要求「记录读卡」或「建立证据账本」时，才落盘至 `.rivet/research/`。

## 项目级配置与宿主兼容说明
- **天枢原生配置格式**（项目根目录 `.rivet-config.json`）：
  ```json
  {
    "mcp": {
      "servers": {
        "tianshu-research": {
          "command": "node",
          "args": ["D:/1_Research/Develop_Research/plugins/tianshu-research/mcp-server.js"]
        }
      }
    }
  }
  ```
