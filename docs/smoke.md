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

---

## 3. 0.2.0 连接器线上冒烟（2026-09-19，Phase 9A 验收项）

通过 Phase 9A 新连接器（`connectors/`）对真实外部源执行只读冒烟：`node scripts/live-smoke.js`。最小请求纪律（每源 1 次检索 + 1 次 DOI 验证），arXiv 走跨进程限流器，**零写入外部库**：

| 检查项 | 结果 | 证据 |
|---|---|---|
| openalex.search.http | PASS | 分页 1 次，原始 25 条（游标连接器） |
| openalex.schema.record | PASS | openalex:W2781738013，**4 个 versions 合并保留**（真实数据验证同 DOI 版本不丢失） |
| openalex.schema.abstract | PASS | 倒排摘要重构 500 字符 |
| openalex.doiLookup | PASS | doi:10.22331/q-2018-08-06-79 → "Quantum Computing in the NISQ era and beyond" |
| arxiv.search.http | PASS | arXiv:2105.02723（经跨进程限流器，默认 ≥3s 间隔） |
| arxiv.schema.record | PASS | landingUrl 保留版本号 v1 |
| zotero.readOnly | SKIPPED | 未配置 ZOTERO_USER_ID/ZOTERO_API_KEY——诚实跳过，绝不伪造；配置后仅只读 |

**结论：6/6 执行检查全过，1 项诚实跳过。** 复跑命令：`node scripts/live-smoke.js`（可选 `--out <path>` 落盘报告）。退出码 0 = 全部已执行检查通过；跳过项不计入失败。

---

## 4. 真实 DeepSeek 前缀缓存探针（2026-09-19，Phase 12 验收项）

执行宿主仓 `scripts/verify-cache-hit-rate.ts`（同一 session、固定 tools、相同模型参数、逐轮增长对话），实测 20 轮：

| 指标 | 实测值 | 判据 |
|---|---|---|
| Turn 1（冷启动） | 0.0%（11,497 input tokens 全 miss） | 预期行为 |
| 逐轮命中爬升 | 73.6% → 95.6% 单调上升 | 正常 |
| **收敛段（末 5 轮）命中率** | **95.1%** | ≥95% = 优秀档 ✅ |
| 前缀稳定性 | 全部稳定 🔒 | 无字节漂移 ✅ |
| 逐轮 miss 量 | 稳定 ~4.1–4.2k tokens（可变尾部自然增长） | 无异常碎裂 |

**结论：缓存健康度「优秀」，与文档宣称的 95–99% 稳态命中率一致，未触发「达不到既往命中率时分析上下文/TTL」条款。** 探针期间未改写任何观察值。

---

## 5. Jupyter 真内核冒烟（2026-09-19，Phase 9B 验收项）

按 `docs/notebook.md` 声明路径安装声明依赖（`pip install -r requirements-notebook.txt` → jupyter_client 8.10.0 + ipykernel 7.3.0，python3 kernelspec），经**真实 bridge.py → jupyter_client → ipykernel** 全链路执行：`node scripts/notebook-live-smoke.js`。

| 检查项 | 结果 | 证据 |
|---|---|---|
| kernel.execute.arithmetic | PASS | 真内核返回 execute_result '5'（epoch 1） |
| kernel.hiddenstate.within-epoch | PASS | 同 epoch 内 `X=21` 后 `X*2` → '42' |
| kernel.stream.capture | PASS | print() 流式输出捕获 'hello smoke' |
| kernel.error.honest | PASS | `1/0` 如实 ZeroDivisionError，不伪造 |
| kernel.restart.clears-state | PASS | 重启后 epoch 1→2，`X` → NameError（隐藏状态确已清零） |
| kernel.replay.reproduced | PASS | 干净内核重放 2 cell → reproduced / pass |

**结论：6/6 全过。** 真机测试发现并修复一处 fake 测试无法暴露的真实缺陷：输出监听误用 shell 通道 `get_msg`（阻塞），已改走 IOPUB 通道 `get_iopub_msg`（parent_header 关联语义不受影响）。复跑：`node scripts/notebook-live-smoke.js`（依赖未安装时诚实 blocked，不伪造）。
