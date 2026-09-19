# HANDOFF — Tianshu-Research（天枢理工科研能力扩展包）交接文档

> **给完全没有本会话上下文的新 Agent 或开发者**：动手前请完整精读本文。
> 状态：**Phase 1–12 插件侧全部封顶，0.2.0 已正式发布（GitHub tag 0.2.0），356 项 Node.js 单测 + 14 项 Python 测试 100% 绿灯，双仓 parity 零漂移，四类真实环境验证全部通过。**
> 最后更新：2026-09-19。

---

## 一、我们在做什么任务

在 **Tianshu-Harness**（天枢智能体运行时，CLI `rivet`，主工作区 `D:\1_Research\Develop_Research`）之上，打造第一方理工科研能力扩展包 **Tianshu-Research Overlay**。双仓镜像结构：

| 仓库 | 路径 | 远端 |
|------|------|------|
| 宿主仓（开发主仓） | `D:\1_Research\Develop_Research\plugins\tianshu-research\` | 私有镜像 |
| 独立开源仓 | `D:\1_Research\Tianshu-Research\` | `https://github.com/yq04/Tianshu-Research`（origin） |

**双仓同步红线**：修改插件代码后必须同步到独立仓并保证两边测试全绿；用 `node scripts/check-release-parity.js --peer D:/1_Research/Tianshu-Research` 校验（`scripts/parity-allowlist.json` 白名单声明合法的单侧文件——LICENSE/CI/.gitignore 等基础设施，白名单外任何漂移即 fail）。**绝不 push 宿主仓到 tianshu 公开远端**。

驱动的两个架构质询：
1. **跨项目 MCP 污染与前缀缓存破坏** → 连接级休眠（Dormant 时 `tools/list` 返回空、不注入科研 System Instructions）、固定 4 大公开网关、`listChanged: false` + SHA-256 工具指纹。
2. **工作流过度固化** → 多范式路由（empirical/theoretical/benchmark/假说回环）、非文献证据一等公民（无需伪造 DOI）、负结果（inconclusive/refuted）是合法科学结论。

四网关顶级工具面（**运行期永不增删**）：`research_query` / `research_evidence` / `journal_palette` / `research_status`。一切能力收敛在操作目录（**25 个操作 ID**，经 `describe_operation`/`execute_operation` 按需发现）。

背景：由 GPT-6 Astra 主导架构规划（`task_plan.md` 含 Phase 6–12 演进蓝图与逐阶段验收清单），Gemini 团队完成 Phase 1–7 实现，本会话完成 Phase 8 插件侧至 Phase 12 及发布。

---

## 二、已经完成了什么

### 交付全景（Phase 1–12 全部完成）

| 阶段 | 核心交付 | 关键文件 |
|------|----------|----------|
| Phase 1–2 | Scope 守卫、量纲物理修复、MCP 休眠与项目隔离、Single Freeze | `scope/`、`protocol/`、`compute/` |
| Phase 3 | Evidence-v2 有类型证据、RunReceipt 防伪、五态门禁（空账本=`not_applicable`） | `ledger/`、`gates/`、`jobs/` |
| Phase 4 | 数据分析（Welch/Mann-Whitney/Okabe-Ito SVG）、理论物理自洽、工程消融 | `data/`、`figure/`、`benchmark/` |
| Phase 5 | 场景路由 + Kahn DAG、敏捷假说回环（负结果一等公民）、Skill 解耦（6 个按需指南） | `workflows/`、`skills/` |
| Phase 6A/6B | 物理路径穿透防御、多字节分帧、门禁零占位（`gates/evaluator.js`）、铲除合成跑分、`data.prepare@1` | `scope/path-policy.js`、`data/prepare.js` |
| Phase 7 | Event Sourcing（17 类事件）、CAS 图补丁、多维预算（reserve/commit/release）、断点恢复、非阻塞 human-input | `workflows/store.js`、`graph-patch.js`、`budget.js`、`scheduler.js` |
| Phase 8 插件侧 | CVM 单向投影（字节级确定性、只读、前缀缓存安全）、Council 评审契约（法定人数/反例门禁/chair 否决/席位无写执行权）、**review 节点去占位**（无裁决→`awaiting_input`，绝不硬编码 approved） | `integration/context-projection.js`、`integration/review-contracts.js` |
| Phase 9A | OpenAlex（游标分页、同 DOI 版本合并不丢失）、arXiv（跨进程限流 3s/请求、版本保留）、Zotero v3（412 条件写入、诚实去重、附件 scope fail-closed）、离线快照回放（`SNAPSHOT_MISS` 绝不伪造）、凭据脱敏 | `connectors/`（6 模块） |
| Phase 9B | Jupyter 内核网关：NDJSON bridge、epoch 计数、IOPUB 输出监听、执行记录 + 干净内核重放（乱序 cell/多 epoch/非 ok cell 一律拒绝正式复现） | `notebook/`（4 模块） |
| Phase 10 CPU 核心 | 后端契约（提交幂等/跨租户拒绝/诚实 not_found）、local-process 后端（单例）、资源策略（fail-closed 准入 + `allowedExecutables`）、断线对账（orphaned 绝不升级为 completed）、`run.submit@1`/`run.reconcile@1` 操作化 | `jobs/backends/`、`resource-policy.js`、`reconcile.js` |
| Phase 11 | 能力基准 harness：数据集 sha256 钉死、假收据必 fail、p-hacking 必 fail、**负结果满分**、失败 trial 不出分母、(modelId,budgetId) 不混比、成本分侧路、报告字节级确定性、live 模式显式拒绝 | `capability-benchmark/` |
| Phase 12 | 双仓 parity 校验（白名单制）、宿主表面快照（`verifiedAgainstRealHost: false` 纪律）、`docs/migration-0.2.0.md`、0.2.0 发布 | `scripts/`、`docs/` |

### 真实环境验证（全部有据可查，见 `docs/smoke.md`）

| 验证 | 结果 |
|------|------|
| 文献源线上冒烟（`node scripts/live-smoke.js`） | **6/6 过**（OpenAlex 检索+DOI 直查，真实数据 4 versions 合并；arXiv 经限流器）；Zotero 无凭据诚实 SKIPPED |
| DeepSeek 前缀缓存探针（宿主仓 `scripts/verify-cache-hit-rate.ts`，`DEEPSEEK_API_KEY` 已配） | **20 轮同前缀会话，收敛段命中率 95.1%（优秀档）**，前缀全部稳定 |
| Jupyter 真内核冒烟（`node scripts/notebook-live-smoke.js`；已装 jupyter_client 8.10 + ipykernel 7.3） | **6/6 过**（算术/隐藏状态/流捕获/诚实错误/重启清态/干净重放 reproduced） |
| 基准 smoke（`npm run benchmark:smoke`） | 5/11 trials（含 p-hacking/假收据/缺收据/伪造检查/崩溃 trial 全部反例），分组/分母/确定性符合设计 |

### 版本与仓库状态

- 独立仓 `main` = `5ebffc7`，tag **`0.2.0`** 已推送 GitHub；工作区干净。
- 宿主仓提交链至 `3cb6315`（仅本地 main，未推送宿主远端——该 push 流程无既有约定）。
- 双仓 `package.json` version = **0.2.0**。

---

## 三、当前卡在哪

**无任何代码、架构或单测阻塞。** 剩余未完成项全部硬性依赖本环境不具备的外部条件：

| 未完成项 | 缺什么 |
|----------|--------|
| Phase 8 宿主侧 / Phase 6C（`src/agent/research/context-bridge.ts`、`work-order-adapter.ts`、`council-adapter.ts`、`src/agent/hooks/research-state-hook.ts`、`src/mcp/scoped-pool.ts`） | **需修改天枢运行时 `src/`（TypeScript）**——唯一有实质工程量的剩余路线图项；插件侧契约已就绪待消费；建议单独立项 |
| Phase 10 GPU/SLURM 真实验收（`torchrun-elastic`/`jax-multiproc`/`slurm-remote` 已声明为 unsupported 并注明理由） | 真实多卡/SLURM 硬件，按 task_plan 验收清单逐项验证后方可翻 supported |
| 真实宿主兼容矩阵逐格实测 | Cursor / Claude Desktop / VS Code / 天枢 sidecar 实装（`docs/host-compatibility.md` 未测格子如实标注「未测」） |
| Zotero 线上冒烟 | `ZOTERO_USER_ID` / `ZOTERO_API_KEY`（配置后 `live-smoke.js` 自动补测，只读） |
| live 能力基准（`--mode live`） | 模型适配器 + 显式预算（harness 现在显式拒绝 live，宁可报错不伪造） |

---

## 四、下一步计划是什么

按价值排序：

1. **Phase 8 宿主侧 / 6C（下一候选版主体）**：宿主 adapter 消费插件已就绪的两个契约——`projectResearchContext()`（CVM 单向投影快照）与评审契约（`createReviewRequest`/`aggregateReview`/`evaluateReviewGate`）。硬验收：非科研 session 零 bridge/hook 注入；多数赞成不覆盖反例 gate；reader/reviewer 无写执行权；缓存前缀不受动态研究状态影响。涉及 `src/agent/create-runtime-hooks.ts`、`src/context/cognitive-ledger.ts`、`src/agent/obligation-tracker.ts` 的受控接线。开工前先读 task_plan.md 第 22 节（Phase 6C/8）与宿主 `src/mcp/`、`src/plugins/plugin-loader.ts` 结构。
2. **宿主兼容矩阵实测**：按 `docs/host-compatibility.md` 格子逐格跑真实宿主，每格记录 host version、配置范围、可观察工具列表、进程数与证据；未测写「未测」，不用模拟 client 替代真实 UI 结论。
3. **GPU/SLURM 真实验收**（有硬件时）：torchrun worker-group 重启、checkpoint resume、日志截断、产物拉取，逐项过完才翻 supported。
4. **Zotero 凭据配置后**：复跑 `node scripts/live-smoke.js` 自动补测只读项。
5. **0.2.x / 0.3.0 发版**：有用户可见变更时走 `check-release-parity.js` + 双仓全绿 + 打 tag 流程（发布/push 仍需用户授权确认）。

---

## 五、踩过的坑（绝对不要再踩！）

### 沿袭铁律（前几轮会话血泪结晶，违者必炸）

1. **CPA/Gemini 1:1 工具调用死穴**：严禁在 `functions__exec` 脚本中调用 `notify(...)` 或 `yield_control()`——会把 400 错位永久固化进 SQLite，整个会话秒报废。进度在工具调用外发送，脚本结束一次性 `text(...)`。
2. **多智能体分工**：常规写码/测试默认 `gemini-3.8-flash`；仅显式 `/astra-plan` 或架构方案才允许 `gpt-6-astra`（保护 Plus 额度）。
3. **长任务等待闭环**：`wait_agent` 超时设 180000–300000ms；超时后必须在同一回复中再次发起工具调用，严禁输出纯文本交出控制权。
4. **Zero Fake Pass（项目灵魂）**：严禁硬编码 `status:'pass'` 占位；缺数据/缺方程返回 `inconclusive`；缺可执行文件拒绝执行、严禁合成跑分（0.85/10.0 之类已铲除过）；非显著结果（p≥alpha）是合法结论，严禁 p-hacking；空账本报 `not_applicable`。**策略在代码中不在提示词中**——模型伪造系统消息不能放宽任何门禁。
5. **前缀缓存第一原则**：运行期不增删顶级工具；首次 `tools/list` 等 scope 判定，冻结后迟到 roots 不改清单；配置格式区分（天枢 `.rivet-config.json` 的 `mcp.servers` vs Cursor `.cursor/mcp.json` 顶层 `mcpServers`）。
6. **双仓同步红线**：改插件必同步独立仓并两边全绿；共享工作区 commit 只限定 `plugins/tianshu-research` + `HANDOFF.md` 路径，绝不碰其他会话文件（如 `docs/research/`）；验证失败禁止 stash/reset/checkout 清场。
7. **交付报告纪律**：每轮交付必须覆盖三项——做了什么 / 遗留什么 / 设计偏差；SKIPPED ≠ PASS，拒绝 ≠ 静默钳制，策略不能由调用方注入。

### 本会话新踩的工程坑（每条都真实炸过一次）

8. **Python 脚本化编辑文件必须 assert 匹配**：`s.replace(old, new)` 不加 `assert old in s` 是静默 no-op——曾让一次「修复」完全没生效还打印了 patched。永远先断言再写回。
9. **ESM 相对导入深度**：新增一层目录后 `../` 与 `../../` 极易写错且报错信息误导（显示的解析路径已是错的）。数清层级，改完立刻 `node -e "import(...)"` 探针验证。
10. **同步函数用 `assert.throws`，异步才用 `assert.rejects`**——对 sync throw 用 rejects 会让异常直接炸穿测试。
11. **fake transport 的 handler 队列耗尽会返回 undefined 默认值**，下游报「非 JSON」之类误导性错误——每个调用序列配齐 handler。
12. **Windows spawn 的 cwd 必须存在**，否则子进程瞬间 error settle（活动计数永远 0，等待逻辑全部失效）；且**不要把 spawn 的 cwd 设为会被 afterEach 删除的临时目录**——子进程短暂持有目录导致 rmSync EPERM（`maxRetries/retryDelay` + 不设 cwd 双保险）。
13. **shutdown 永远不要等死进程**：先检查 `exitCode !== null` 再发命令，否则对已死子进程空等超时（曾白等 3 秒 ×2）。
14. **Jupyter 消息通道**：输出监听必须走 **IOPUB 通道（`kc.get_iopub_msg(timeout)`）**，shell 通道 `kc.get_msg()` 会阻塞饿死整个循环（真内核挂 300 秒的根因；fake 测试永远暴露不了——这就是真机冒烟的价值）。
15. **`createRunSpec` 有 clamp**：`maxOutputBytes` 下限 1024、`wallSeconds` 上限 3600——资源策略测试的上限必须绕开这些钳位。
16. **`dispatchOperation` 是 catch-all**：内部 throw 会被转成 `{ status: 'failed', issues: [EXECUTION_ERROR] }` 返回——测试错误路径要断言 failed **结果**，不能用 `assert.rejects`。
17. **幂等键必须绑定稳定 runId**：调用方不传 runId 时 `createRunSpec` 生成随机 id，同 key 重放会撞 `IDEMPOTENCY_CONFLICT`（设计内的诚实冲突，不是 bug）。
18. **跨调用保持状态的组件必须是单例**：local-process 后端曾每次 dispatch 新建实例，幂等账本随实例丢失（`getLocalProcessBackend()` 单例）。
19. **乱序 cell 的正确构造**：cellIndex 序列必须是**非递增**（把前面的 index 改大）；隐藏状态 diverge 的正确构造是**记录里不含赋值 cell**——重放会重跑记录内全部代码，记录内的状态链可以合法复现。
20. **策略围栏 vs 运行时二进制**：node.exe/python 在工作区外是常态，必须用 `allowedExecutables` 显式白名单豁免；且**策略绝不接受调用方注入**（否则白名单形同虚设）。
21. **`__pycache__`/`.pyc` 别提交**：宿主仓曾误提交 4 个 .pyc（已 `git rm --cached` + 插件 .gitignore 修正）。
22. **SKIPPED 不能当 truthy 映射成 PASS**：状态枚举要显式分支（live-smoke 曾把 skip 标成 PASS）。
23. **先核验再执行**：接手遗留项前先探测条件是否具备（本会话正是探测到 `DEEPSEEK_API_KEY` 已配、网络可达、Python 可装，才把三个「待真实验证」项全部闭环的）。

---

## 附：关键命令速查

```powershell
# 测试（插件根 plugins/tianshu-research/）
npm test                 # 356 项 Node.js 单测
npm run test:python      # 14 项 Python（unittest discover）
npm run benchmark:smoke  # 能力基准离线回放

# 真实环境验证（各自独立执行）
node scripts/live-smoke.js            # 文献源连通性（只读）
node scripts/notebook-live-smoke.js   # Jupyter 真内核（需声明依赖）
# DeepSeek 缓存探针（宿主仓根）：npm exec -- tsx scripts/verify-cache-hit-rate.ts

# 发布纪律
node scripts/check-release-parity.js --peer D:/1_Research/Tianshu-Research
node scripts/capture-host-surface.js   # 宿主表面快照（声明面，未测宿主如实标注）
```

**核心文档**：`task_plan.md`（宿主根，Phase 6–12 蓝图与逐阶段验收清单）、`docs/migration-0.2.0.md`、`docs/notebook.md`、`docs/capability-benchmark.md`、`docs/zotero-integration.md`、`docs/host-compatibility.md`、`skills/research-flow/references/research-review.md`。
