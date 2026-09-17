# Tianshu-Research 联网冒烟测试与联调报告

- **测试日期**：2026-09-17
- **测试环境**：Windows Node.js v24.16.0
- **测试范围**：arXiv Atom API 与 OpenAlex REST API 有限联网初筛与单篇检索冒烟

## 1. 联网端点验证

遵循最小请求与频控纪律（每个来源仅发 1 次 limit=1 请求，单篇查询各 1 次，同源间隔 1000ms）：

| 接口 | 请求目标 | 响应状态 | 耗时 | 返回示例 |
|---|---|---|---|---|
| arXiv 检索 | all:quantum computing (limit=1) | 200 OK | ~1090ms | Tierkreis: A Dataflow Framework for Hybrid Quantum-Classical Computing |
| OpenAlex 检索 | quantum computing (filter=is_oa:true, per_page=1) | 200 OK | ~1297ms | Quantum Computing in the NISQ era and beyond |
| arXiv 单篇 | id_list=1706.03762 | 200 OK | ~286ms | Attention Is All You Need |
| OpenAlex DOI | doi:10.1038/nature12373 | 200 OK | ~486ms | Nanometre-scale thermometry in a living cell |

所有接口均正常返回结构化学术元数据，未发生 401/403/429 或超限重试。

## 2. 本地 MCP Stdio 与离线协议验证

- **JSON-RPC 2.0 协议验证**：已通过 14 项测试用例，覆盖 initialize（协议版本协商至 2024-11-05）、tools/list、tools/call、通知无响应、带 id 通知拒绝与显式 null 参数防御。
- **解析器离线测试**：已通过 12 项测试用例，覆盖括号 DOI 清洗、XML 实体解码、OpenAlex 倒排索引重构、arXiv 错误 entry 过滤与 OA PDF 区分。
- **色板测试**：通过 7 项 Node.js 测试与 6 项 Python unittest 测试，严格保证离散切片 [:n] 与连续插值 map_n 的语义一致。

## 3. 桌面端（Desktop）联调状态

- 当前开发代码仓库内未检出 desktop/ 前端 Tauri 源码目录（宿主主干将桌面端与 CLI 运行时分离）。
- 服务端生命周期接口（GET /mcp/presets、POST /mcp/servers、DELETE /mcp/servers/:id、onToolsRemoved 世代撤销）已通过 mcp-hot-add.test.ts 与 mcp-inject-tools.test.ts 完整单测验证。
- 待获得包含 Tauri 桌面源码的工程环境后，再行验证端到端桌面卡片可见性与侧边栏渲染。
