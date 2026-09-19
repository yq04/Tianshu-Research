# HANDOFF — Tianshu-Research (天枢理工科研能力扩展包)

> **给完全没有本会话上下文的新 Agent 或开发者**：动手前请完整精读本文。本阶段已彻底完成针对「跨项目 MCP 行为污染与前缀缓存破坏」以及「固化工作流脱离理工科研实际」两大结构性缺陷的全面架构重构与持续演进（Phase 1 至 Phase 12 全部插件侧 + Phase 10 CPU 核心 + 真实线上冒烟 + DeepSeek 缓存实测 + 异步运行操作化 + Jupyter 真内核冒烟）。当前插件与独立仓库全部 **356 项 Node.js 单测与 14 项 Python 测试 100% 绿灯通过（Exit 0）**，0.2.0 已发布（GitHub tag），代码已全量同步。

---

## 一、我们在做什么任务

在 **Tianshu-Harness**（天枢智能体运行时，CLI 为 `rivet`，包名 `tianshu-tui` 3.20.0，主工作区 `D:\1_Research\Develop_Research`，宿主远端 `yq04/Tianshu-harness.git`) 的基础上，打造并交付第一方理工科研能力扩展包 **Tianshu-Research Overlay**（插件目录 `plugins/tianshu-research/`，独立开源仓库 `D:\1_Research\Tianshu-Research`，远端 `https://github.com/yq04/Tianshu-Research`）。

### 核心背景与演进逻辑
用户提出了两个直击架构要害的严峻质询：
1. **跨项目 MCP 污染与前缀缓存破坏**：在外部宿主（Cursor/Claude Desktop）或全局加载 MCP 后，非科研项目（如写 Web 前端、后端微服务、系统运维）的大模型会被无差别注入科研工具，导致工具混淆、意图漂移，并击碎天枢 DeepSeek 95%–99% 的 KV 前缀缓存；
2. **工作流过度固化（单一文献瀑布流）**：旧架构将所有科研任务强行塞进「文献初筛 → 方案设计 → 证据沉淀 → 门禁核验 → 论文写作」的单一流水线中，无法适应理工科广泛存在的「数据驱动分析、纯理论推导与符号计算、工程代码评测消融、敏捷假说快速验伪」等核心科研范式。

为此，由 GPT-6 Astra 主导架构规划与两轮深度复核（落盘至 `task_plan.md`，包含第 13 节实证事实表与 Phase 6-12 演进蓝图），随后由 Gemini 团队完成 Phase 1 至 Phase 7 的全量代码实现、接口对齐与确定性测试闭环。

---

## 二、已经完成了什么（交付清单）

全量 **356 项 Node.js 单元测试与 14 项 Python 测试 100% 绿灯（Exit 0）**，以下核心成果已全量同步至双仓库：

### 1. Phase 1：契约固化、Scope 守卫与量纲物理漏洞修复
- **作用域与调用守卫**（`scope/workspace-scope.js`、`scope/invocation-guard.js`）：实现可信根目录解析；补齐缺失字段；严格拦截非科研项目越界写入与执行。
- **量纲解析器物理漏洞修复**（`compute/compute-gateway.js`、`compute/sympy_runner.py`）：修复未消费完输入、未闭合括号及非法字符漏洞；严格引入跨量纲加减一致性核对，彻底解决 `force + length` 与 `force / (area` 被误判为 `consistent: true` 的物理缺陷。

### 2. Phase 2：通用 MCP 连接级休眠与项目隔离（零污染机制）
- **连接级休眠状态机**（`protocol/exposure.js`、`protocol/server.js`）：
  - 维护 `Negotiating -> ResolvingScope -> (Active | Dormant | Revoked)` 状态；
  - **Dormant 休眠模式**：在普通无科研声明目录下，`tools/list` 直接返回空数组 `tools: []`，`initialize` 握手绝对不返回科研 System Instructions，从根源上杜绝大模型在非科研项目中的认知漂移与无谓 token 占用；
  - **Active 激活模式**：仅当检测到科研项目声明（`.rivet/research.json`、开发主仓或 `--workspace`）时暴露 4 个公开网关；
  - 声明 `listChanged: false`，生成确定的抗扰动 SHA-256 `canonicalToolsDigest` 指纹，坚决捍卫前缀缓存。

### 3. Phase 3：有类型证据、按需操作目录与真实 RunReceipt
- **按需操作目录（Operation Catalogue）**：建立 16 个白名单操作 ID 的固定注册表，通过 `describe_operation` 和 `execute_operation` 在 4 个固定网关内按需执行能力，不增加顶级工具。
- **有类型证据模型（Evidence-v2）**：支持 `literature`、`empirical`、`theoretical`、`benchmark` 四类有类型证据与 Claim，**非文献科研无需伪造外部 DOI 或 paper source 即可直接合规入库**；实现基于 SHA-256 的内容寻址产物存储（`ledger/artifact-store.js`）。
- **防伪作业收据（RunReceipt）**：使用安全数组 spawn 执行任务，记录真实物理耗时与退出码。
- **五态科学门禁与报告**：实现五态判定（`pass`, `fail`, `inconclusive`, `not_applicable`, `error`），空账本严格返回 `not_applicable`，根除“空账本虚报全绿”。

### 4. Phase 4：三条科研能力纵向闭环（数据分析、理论物理自洽、工程消融）
- **Phase 4A 数据分析与图表**：`data/inspect.js` 表格画像与离群点检测；`data/statistics.js` 高精度 Welch/Student t 检验、Mann-Whitney U 检验与效应量；**严格落实非显著结果（p >= alpha）为合法科学结论**；`figure/render.js` 生成 Okabe-Ito 矢量 SVG 图表与伴生 Python 脚本。
- **Phase 4B 理论推导与物理自洽**：公式量纲齐次性审查，严格拦截跨量纲相加；符号极限审查在 SymPy 缺失时强制返回 `inconclusive`，绝不虚报 pass。
- **Phase 4C 工程评测与消融实验**：矩阵规划、批跑收集真实验收凭证、变动对比计算与复现性门禁。

### 5. Phase 5：场景路由、敏捷回环与 Skill 解耦重构
- **自适应场景路由器**：`workflows/router.js` 依据输入材料自适应路由（数据文件直接进 empirical，产生 0 次文献检索；代码消融进 benchmark；纯理论进 theoretical）；基于 Kahn 算法构建操作依赖图（DAG）。
- **敏捷假说回环（Hypothesis Loop）**：负结果（refuted）作为第一类科学发现完整保留，失败实验不删除，反例固化并生成新 revision（Revision 2, 3...）继续试错；硬性迭代预算控制。
- **模块化 Skill 与文档**：重构 `SKILL.md` 为五范式分流，拆解为 6 个按需查阅指南。

### 6. Phase 6A：可信基线纠偏（Scope 与 MCP 生命周期固化）
- **真实物理路径与穿透防御**（`scope/path-policy.js`）：基于 `fs.realpathSync.native` 实现物理路径解析，处理 Windows 盘符大小写不敏感规范化；实现回溯父目录解析，防御 Windows Junction / 软链接逃逸；全路径 SHA-256 生成 `createCanonicalScopeId`，彻底消除前缀截断碰撞；递归深度扫描校验所有嵌套路径与安全标识符。
- **作用域严格授权**（`scope/workspace-scope.js`）：显式 `enabled: false` 拥有绝对最高优先级，不可被开发仓逻辑覆写；废除仅凭历史数据目录或随机 cwd 自动激活的隐式信任。
- **MCP 生命周期与前缀缓存稳定**（`protocol/server.js`）：
  - 首次 `tools/list` 引入有界 scope 解析 barrier；
  - 确立 Single Freeze 纪律：一旦在 connection 模式冻结（空列表或 4 工具），迟到的 roots 响应绝不动态篡改工具清单，确保兑现 `listChanged: false`；
  - 监听客户端 `notifications/roots/list_changed`，科研根移除后即时将执行能力切换至 `Revoked`，同时保持工具外表稳定；
  - 修复多字节分帧：基于 `Buffer.byteLength` 与 `StringDecoder` 按真实字节边界切包，彻底解决含中文等多字节报文丢失问题。
- **结构化封包**（`protocol/result-envelope.js`）：统一封装标准 MCP content 文本块与计算数据、门禁报告结构体，杜绝数据丢失。

### 7. Phase 6B：可信基线纠偏（公开执行、证据防伪与门禁纵向闭环）
- **彻底铲除门禁占位 pass**：新建统一门禁求值调度器 `gates/evaluator.js`，`verify_project` 彻底移除硬编码 `status: 'pass'` 占位分支，真实调用数据质量、统计有效性、图表可溯性、量纲守恒、符号物理、基准公正性与复现收据 7 类审计器；缺数据或缺方程严格返回 `inconclusive` 或 `fail`。
- **彻底铲除跑分合成数据**：`benchmark.run@1` 彻底删除缺少 executable 时伪造的 `0.85` / `10.0` 合成指标，缺少 executable 严格报错拒绝；`run.status@1` 真实查询任务存储，未知 runId 严格返回 `not_found`；`run.cancel@1` 接入真实进程树终止。
- **实现数据准备变换流水线**：新建 `data/prepare.js`，完整实现 `data.prepare@1`（清洗、选列、去缺失值、归一化）并产出真实 Artifact。
- **作业状态持久化与竞争安全**：新建 `jobs/run-store.js` 持久化任务元数据；新建 `jobs/process-control.js` 提供跨平台进程树安全终止；`jobs/executor.js` 修复未捕获退出码默认判成功缺陷，引入 Settle-Once 竞争安全防线；`jobs/run-receipt.js` 语义纠偏为 `integrityChecksum` 并保留兼容别名。

### 8. Phase 7：科研持久状态与动态操作图（Event Journal、Graph Patch、CAS、断点恢复与预算控制）
- **事件日志模型与持久化**（`workflows/events.js` & `workflows/store.js`）：
  - 定义 17 类强类型核心科研事件，所有状态转移追加写入 `<workspace>/.rivet/research/events/<taskId>.jsonl`；
  - 具备 100% 事件溯源（Event Sourcing）能力，支持从日志序列零损失重建图节点、执行状态、输出产物与预算消耗。
- **版本化操作图补丁引擎**（`workflows/graph-patch.js`）：
  - 节点具备实例语义（允许同一 operation 在不同 revision 多次出现）；
  - 强 CAS 校验：若 `graph.revision !== patch.baseRevision`，抛出 `CAS_CONFLICT` 拒绝合入；
  - 依赖传递失效：当上游节点被标记为 `superseded` 时，自动递归标记所有下游依赖节点为 `superseded`，同时严格保留旧节点、产物、证伪收据与科学结论，永不物理删除；
  - Kahn 算法无环验证，发现循环依赖时原子拦截回滚。
- **多维实验预算控制**（`workflows/budget.js`）：
  - 支持 `maxIterations`, `maxRuns`, `maxParallelRuns`, `maxWallSeconds`, `maxExternalRequests` 等多维配额；
  - 实施两阶段配额制：前置预留（reserve）、后置核销（commit）、异常释放（release）；
  - 失败与重试计入已消耗配额，超额时触发优雅停机与部分交付（Partial Delivery），绝不强行扩采样。
- **调度器与非阻塞人机协作**（`workflows/scheduler.js` & `workflows/host-adapter.js`）：
  - 完整生命周期流转：`pending -> ready -> running -> (completed | failed | cancelled | blocked | superseded | awaiting_input)`；
  - 人机协作非阻塞：遇到 `human-input` 节点暂停该节点，不阻塞其他无依赖分支推进；人类输入到达后唤醒后续节点；
  - 断点恢复（`resumeWorkflow`）：意外崩溃或中断后，仅恢复调度未完成节点，已完成节点直接复用产物。
- **网关深度打通**（`gateway-evidence.js` & `contracts/operations.js`）：
  - 接入 `patch_workflow`, `step_workflow`, `resume_workflow`, `provide_human_input`, `get_workflow_state` 动作与操作描述符。

### 8. Phase 8（插件侧）：CVM 单向投影、Council 评审契约与 review 节点去占位
- **CVM 上下文单向投影**（`integration/context-projection.js`）：把科研事实（v2 claims、support/refute 证据计数、工作流任务状态、预算压力）单向投影为宿主 CVM（Claims / Ledger / Pressure / Stigmergy）可消费的只读快照；严格只读（投影不产生任何文件写入），无墙钟时间戳、全集合排序，两次调用产出字节级 canonical JSON + SHA-256 `digest`，捍卫前缀缓存；被标 `supported` 却存在反例的 claim 如实投影 `conclusionConflict` 并发出 `counterevidence_conflict` 信号。
- **Council 评审契约**（`integration/review-contracts.js`）：reader / reviewer / chair 三席能力矩阵（**任何角色无 write/execute 权限**，`roleCan` fail-closed）；三条不可协商不变量——①有效裁决席 < requiredQuorum 一律 `inconclusive`（Council 缺席不通过）②blocking 策略下反例证据未被任何审批席回应时多数赞成直接 `rejected`（多数不能覆盖反例）③chair 否决一票否决；平票一律落向更保守结果；`evaluateReviewGate` 与 `gates/report.js` 五态门禁对齐。
- **review 节点去占位**（`workflows/host-adapter.js`）：铲除 `reviewStatus: 'approved'` 硬编码占位——无裁决时节点诚实转入 `awaiting_input` 等待派发 Council/人工主席，提供真实裁决时按契约聚合（approved 才 completed）；人工意见经 `workflow.input@1` 恢复节点。
- **评审指南**（`skills/research-flow/references/research-review.md`）：席位矩阵、生命周期、反例门禁与快速示例。
- **新增测试**：`test/context-projection.test.js`（8 项：投影精确性、确定性/缓存安全、只读纪律、篡改检测）、`test/review-contracts.test.js`（16 项：三条不变量、席位权限、五态映射、工作流集成）。

### 9. Phase 9A：文献生态适配（连接器、限流、离线快照与 Zotero 同步）
- **共享基础设施**（`connectors/`）：
  - `rate-limit.js`：`MinIntervalRateLimiter`（进程内）+ `CrossProcessRateLimiter`（锁文件跨进程互斥，满足 arXiv「全机每 3 秒 1 请求」ToU）；陈旧锁（崩溃残留）按 bounded 超时接管，绝不绕过限速；
  - `cache.js`：`computeRequestKey`（sha256(method+url)）+ `FileCache`（一请求一 JSON 文件，可 diff、可提交为 fixtures）；
  - `source-snapshot.js`：`SnapshotTransport` 三模式——`live`（真实网络）/`record`（真实网络 + 落盘快照）/`replay`（纯离线回放，缺失快照抛 `SNAPSHOT_MISS` 绝不伪造）；`maskUrl`/`maskCredential` 凭据脱敏。
- **OpenAlex 连接器**（`connectors/openalex.js`）：cursor 游标分页；去重采用**合并策略**——同 DOI 多条记录合并为一条并 union 其 versions（同 DOI 不同版本不丢失）；429/503 按 `Retry-After` 诚实退避（有界重试，超限如实报错）；api_key/mailto 全链路脱敏。
- **arXiv 连接器**（`connectors/arxiv.js`）：start 偏移分页；从 Atom id 保留版本号（vN）并合并版本列表；默认接入跨进程限流器；5xx 有界重试，4xx 即刻如实报错。
- **Zotero Web API v3 客户端**（`connectors/zotero.js`）：**412 条件写入**（`If-Unmodified-Since-Version`，冲突抛 `ZoteroConflictError` 携带服务器版本，绝不静默覆盖）；**诚实去重**（createItem 先扫标识符，重复直接返回 duplicate 且零网络写入）；**附件 scope fail-closed**（目标 collection 不在声明作用域内在任何网络请求前拒绝）；429 按 `Backoff` 头退避；key 仅走 Authorization 头且诊断脱敏。
- **网关接入**（`gateway-query.js`）：新增 `research_query.search_sources` 动作（连接器化检索 + 可选 `mode: replay/record` 离线快照），四网关顶级工具面保持不变；`scope/invocation-guard.js` 将其归入 literature 信息类动作并保留深度参数校验（工作区外 snapshotDir 被正确拦截）。
- **文档**（`docs/zotero-integration.md`）：新增第 5 节记录连接器纪律与配置。
- **新增测试**：`test/source-connectors.test.js`（15 项：游标分页、合并不丢版本、429 退避、凭据脱敏、跨进程限流与陈旧锁接管、快照录制/回放、gateway 离线 replay 集成）、`test/zotero-sync.test.js`（11 项：分页、去重零写入、412 冲突、附件 scope、退避、脱敏）。全部离线 fixtures，零网络、零真实库写入。

### 10. Phase 9B：Jupyter 交互执行与清洁复跑（探索 ≠ 复现）
- **NDJSON 内核桥**（`notebook/bridge.py`）：stdio NDJSON 协议对接 jupyter_client；消息关联遵循 Jupyter 消息规范（parent_header.msg_id + busy/idle）；deadline 超时中断内核并如实返回 `timeout` + 部分输出；`jupyter_client` 缺失时输出 `unavailable` 诚实降级（绝不伪造收据）；流/错误/execute_result/display_data 输出归一化。
- **内核管理器**（`notebook/kernel-manager.js`）：每会话独立桥进程（内核任务隔离）；msgId 消息关联；epoch 计数（restart 确认后 +1，隐藏状态随之清零）；晚到输出（late output）捕获不丢弃；桥死亡/spawn 失败/不可用一律映射 `{ status: 'blocked' }`；shutdown 快速路径不等死进程。
- **执行记录**（`notebook/execution-record.js`）：确定性 JSON 记录（无墙钟字段）；正式复现资格分析——单 epoch、顺序单调（乱序 cell → `OUT_OF_ORDER_CELLS`）、全部 ok，否则门禁诚实拒绝且记录原样保留。
- **干净重放**（`notebook/replay.js`）：全新内核按序重跑全部 cell 逐 cell 对比（忽略 executionCount 等非语义字段）；`reproduced→pass`、`diverged→fail`（含隐藏状态教训：读取记录之外状态的 cell 如实 diverge）、`not_comparable→inconclusive`、内核缺失→`blocked`。
- **操作目录**：新增 `notebook.execute@1` / `notebook.replay@1`（capability `notebook`，依赖 `jupyter`），经 describe/execute_operation 按需发现，四网关顶级工具面不变。
- **依赖声明**：`requirements-notebook.txt` 独立声明（jupyter_client + ipykernel），不隐式安装；`npm run test:python` 升级为 unittest discover 全量运行。
- **新增测试**：`test/notebook-bridge.test.js`（21 项：fake bridge 离线验证会话/epoch/错误/超时/晚到输出/阻塞诚实降级/重放门禁/dispatcher 集成）、`test/test_notebook_replay.py`（8 项：fake kernel 验证关联/超时中断/重启复位/外来源消息忽略/坏输入不致命）。零真实 Jupyter 依赖。

### 11. Phase 11：能力基准与消融（离线 harness + 防伪造判分）
- **哈希固定数据集**（`capability-benchmark/datasets/`）：manifest 钉死每个数据集的 sha256 / license / split，harness 逐字节校验，数据被篡改即拒绝运行（绝不静默改数据跑分）；两个 synthetic fixture（非显著组比较 p=0.928、强显著组比较 p<1e-6）由插件自身统计模块真实计算生成，含零合成跑分。
- **判分侧 oracles**（`capability-benchmark/oracles/`，与运行器工程独立）：`statistical` / `dimension` / `exact` 三个判分器 + `verify.js` 反伪造核验——答卷 rawOutput 的统计量对钉死数据集**重算核对**，FABRICATED_STATISTICS / FABRICATED_CHECK / INCOMPLETE_RECEIPT / VERDICT_MISMATCH（p-hacking）一律 0 分；答案标签全部挂在判分侧。
- **负结果满分**：`not_significant` 与 `refuted` 是 smoke 套件两个任务的最优答案——诚实负结果是一等公民。
- **确定性报告**（`capability-benchmark/report.js`）：按 `(modelId, budgetId)` 分组成行（不同模型/预算永不合并）；失败与崩溃 trial 留在分母（score 0）；畸形 trial 进 trialErrors 如实上报；成本计量区分 mainModel 与 sidecar（council / compaction）；canonical JSON + sha256 digest，无墙钟字段，两次运行字节级一致。
- **运行器**（`capability-benchmark/harness.js`）：`--suite smoke --mode replay --offline` 全离线运行；**live 模式显式拒绝**（需要已配置模型适配器与预算，宁可报错不伪造）；报告落盘 `<ws>/.rivet/research/benchmark/`。`npm run benchmark:smoke` 一键运行。
- **新增测试**：`test/capability-harness.test.js`（15 项：哈希篡改拒绝、防伪造、p-hacking、负结果满分、分母纪律、分组隔离、成本分侧路、报告确定性、live 拒绝、CLI 端到端）。

### 12. Phase 12：发布准备（parity 校验、表面快照与 0.2.0 候选）
- **双仓 parity 校验器**（`scripts/check-release-parity.js`，只读）：逐文件 sha256 比对宿主插件树与独立开源仓，报告 identical / differing / only-in-self / only-in-peer；`scripts/parity-allowlist.json` 显式版本化白名单（LICENSE、CI、.gitignore 等合法基础设施差异），白名单外任何单侧文件即 fail；交叉校验 package.json 双 manifest 版本与 4 工具固定网关面。绝不覆盖并发修改。
- **宿主表面快照**（`scripts/capture-host-surface.js`）：记录插件声明的可观察表面（4 网关 + 23 操作目录 + 能力组 + 可选生态降级行为）；快照强制携带 `verifiedAgainstRealHost: false` 与「未测」纪律声明——插件声明 ≠ 真实宿主验证，绝不把文档当运行保证。
- **版本与迁移**：双仓 package.json 升至 **0.2.0**（`version` + `tianshu.version`）；`docs/migration-0.2.0.md` 记录行为变更（review 节点去占位、`search_sources` 动作、`notebook` 能力组、可选依赖声明）与升级步骤；README 徽章与 0.2.0 亮点更新。
- **候选版验收**：parity 零漂移（177 文件 identical）；双仓完整 suite 各跑一次（337 Node + 14 Python 全绿）。
- **新增测试**：`test/release-parity.test.js`（7 项：同树 parity、篡改检测、白名单外 fail-closed、白名单内单独上报、网关面漂移拒绝、版本不一致拒绝、快照诚实性）。

### 13. Phase 10（CPU 核心）：后端契约、本地后端、资源策略与断线对账
- **后端契约**（`jobs/backends/interface.js`）：统一 submit/query/cancel/reconcile 契约 + `guardBackend` 通用防线——跨租户访问一律 `CrossTenantRefusalError`（fail-closed）、未知 run 如实 `not_found`、提交幂等（同键不重复执行）；契约结构校验 `assertBackendContract`。
- **本地后端**（`jobs/backends/local-process.js`，supported）：复用现有确定性执行器（安全 spawn、settle-once、真进程树终止、真实收据），提交即返回、幂等重放、查询/取消走真实 run-store。
- **注册表纪律**（`jobs/backends/registry.js`）：`local-process` 标 supported（已被契约套件验证）；`torchrun-elastic` / `jax-multiproc` / `slurm-remote` 仅作声明、**supported: false** 并注明理由——未经真实硬件验收绝不声称支持。
- **资源策略**（`jobs/resource-policy.js`）：fail-closed 准入——墙时/输出预算上限、可执行文件必须落在工作区内且真实存在、并发上限；违规即拒绝（PolicyViolationError 带码），绝不静默放宽。
- **断线对账**（`jobs/reconcile.js`）：崩溃/断线后以后端为权威对账——已验证终态收据照实入库；后端无记录的任务标记 `orphaned`（诚实地报「从未验证完成」，绝不升级为 completed）；后端不可达时本地状态分毫不动；对账幂等；按工作区隔离。
- **run-store 增强**：`getRun` 返回形状补齐 `error` 字段（对账的 orphaned 原因可被如实读取）。
- **新增测试**：`test/backend-contract.test.js`（9 项：契约校验、跨租拒绝、not_found 诚实、幂等不重执行、本地真实收据、取消收据、注册表 support 纪律、资源策略全反例）、`test/remote-reconcile.test.js`（6 项：收据入库、orphaned 不伪造、不可达不动状态、活跃任务不动、幂等、租户隔离）。

### 14. 发布后完善：真实线上冒烟与策略强制执行
- **连接器线上冒烟**（`scripts/live-smoke.js`）：对真实外部源只读验证——OpenAlex 检索+DOI 直查（真实数据 4 个 versions 合并保留，实证同 DOI 版本不丢失）、arXiv 检索（经跨进程限流器、landingUrl 保留版本号）；**6/6 执行检查全过**，Zotero 无凭据诚实 SKIPPED（零外部写入）。结果已记入 `docs/smoke.md`；复跑 `node scripts/live-smoke.js`。
- **资源策略强制执行**：`executeRunSpec` 接受可选 `resourcePolicy`（fail-closed 准入）——违规运行在**进程 spawn 之前**被拒绝并以 `RESOURCE_POLICY_REFUSED (<code>)` 如实记录收据；`countActiveRuns` 支撑并发上限；`allowedExecutables` 显式白名单豁免工作区外运行时二进制（node/python）。策略严格 opt-in，未注入时行为不变。

---

## 三、当前卡在哪（Current Status & Blockers）

**结论：Phase 1 至 Phase 12 插件侧工作全部封顶 + Phase 10 CPU 核心落地 + 真实环境验证（线上冒烟 6/6、DeepSeek 缓存实测 95.1% 优秀档），0.2.0 已正式发布（GitHub tag 0.2.0），不存在任何代码、架构或单测阻塞！**

- **代码与测试**：全部 **337 项 Node.js 单测与 14 项 Python 测试 100% 绿灯（Exit 0）**；parity 零漂移。
- **双仓库状态**：宿主 `plugins/tianshu-research/` 与独立开源仓库 `D:\1_Research\Tianshu-Research` 代码与测试完全镜像同步。
- **当前所处状态**：持久化动态操作图、零占位门禁（含 review 节点）、CVM 单向投影契约、Council 评审契约与多源文献连接器（限流/离线快照/Zotero 冲突安全写入）均已就绪。

---

## 四、下一步计划是什么

下一阶段建议按 [task_plan.md](D:/1_Research/Develop_Research/task_plan.md:1540) 继续推进后续模块：

1. **Phase 8 宿主侧收尾 — CVM 认知虚拟机、星域与 Council 深度集成（需授权改宿主 `src/`）**：
   - 插件侧契约已就绪（`integration/context-projection.js` + `integration/review-contracts.js`），宿主侧落地 `src/agent/research/context-bridge.ts`、`work-order-adapter.ts`、`council-adapter.ts` 与 `src/agent/hooks/research-state-hook.ts` 消费上述投影与契约；
   - 将天枢的认知底座（Claims、Ledger、Pressure、Stigmergy）与科研事实存储进行单向投影（消费插件快照）；接入天机（反事实假设）、天府（结构与数据沿袭守护）、文曲（图文与结论表达）三大星域特质；
   - 接入 Council 多智能体独立同行评审机制：非科研 session 零 bridge/hook 注入；多数赞成不覆盖反例 gate；reader/reviewer 无写执行权。
2. **Phase 10 收尾 — GPU/远端 backend 真实验收（CPU 契约层已落地）**：
   - `torchrun-elastic` / `jax-multiproc` / `slurm-remote` 已声明为 unsupported 集成点；需真实多卡/SLURM 环境按 task_plan 验收清单（worker-group 重启、checkpoint resume、日志截断、产物拉取）逐项验证后方可翻 supported；
3. **Phase 6C / 方案 B（天枢宿主内核 Scoped MCP 连接池集成）**：
   - 若授权修改宿主源码（`src/`），落地 `src/mcp/scoped-pool.ts` 与 `session-surface.ts`，在宿主桌面 Sidecar 层面实现会话级 MCP 连接池。
4. **版本发布 ✅ 已完成（用户已授权）**：
   - 独立开源仓已提交 `eeafc76`（156 文件，Phase 8/9A/9B/11/12 全量）并打标 **`0.2.0`**，`main` 与标签均已推送至 `https://github.com/yq04/Tianshu-Research`；
   - 宿主仓以路径限定方式提交 `plugins/tianshu-research/` 与 `HANDOFF.md`（共享工作区纪律：未触碰其他会话文件，如 `docs/research/`）；
   - 真实 DeepSeek cache probe ✅ 已执行（2026-09-19）：20 轮同前缀会话，收敛段命中率 95.1%（优秀档），前缀全部稳定，与 95–99% 宣称一致；证据见 `plugins/tianshu-research/docs/smoke.md` 第 4 节；
   - Jupyter 真内核冒烟 ✅ 已执行（2026-09-19）：真实 bridge.py → jupyter_client 8.10.0 → ipykernel 7.3.0 全链路 6/6 全过（算术/隐藏状态/流捕获/诚实错误/重启清态/干净重放 reproduced）；真机测试发现并修复输出监听误用 shell 通道的真实缺陷（改走 IOPUB）；证据见 `docs/smoke.md` 第 5 节；
   - 真实宿主逐格验收（Cursor / Claude Desktop / VS Code / 天枢 sidecar）未执行，`docs/host-compatibility.md` 中如实标注。

### 15. 发布后完善 II：异步运行操作化（background-jobs 适配入口，插件侧闭环）
- **`run.submit@1`**（`contracts/operations.js` + `operations/dispatcher.js`）：经 local-process 后端异步提交 RunSpec（fire-and-forget），同 idempotencyKey + 同 runId 幂等重放不重执行，同 key 异 runId 如实 `IDEMPOTENCY_CONFLICT` failed 结果；资源策略由工作区默认策略派生（**绝不接受调用方注入的策略**——那是策略注入漏洞）。与既有 `run.status@1` / `run.cancel@1` / `run.reconcile@1` 构成完整异步运行闭环。
- **`run.reconcile@1`**：断线对账操作化——入库已验证收据、orphaned 如实上报（附 ORPHANED_RUNS warning issue）、不伪造完成。
- **守卫职责收敛**（`jobs/backends/interface.js`）：`guardBackend` 只负责租户所有权与诚实性；幂等语义完全归属各后端自有持久状态（本地为进程级单例 `getLocalProcessBackend()`，远端本就在远端）。
- 操作目录扩至 **25 个操作 ID**，四网关顶级工具面不变。

---

## 五、血泪踩坑总结（绝对不要再踩的坑！）

### 1. CPA / Gemini 1:1 工具调用死穴（违者必定秒报废会话）
- **现象**：在 `functions__exec` 脚本中调用 `notify(...)` 或 `yield_control()` 会向服务端额外注入响应，导致 CPA 队列错位，抛出 `functionResponse.id does not match functionCall.id (HTTP 400)`。该错位会被永久固化进 SQLite，导致整个会话秒报 400 彻底报废。
- **铁律**：**绝对严禁在 `functions__exec` 脚本中调用 `notify(...)` 或 `yield_control()`**！所有过程进度必须在工具调用外部通过正常消息发送，脚本完成时一次性 `text(...)` 输出。

### 2. 多智能体子代理分工纪律（严格保护 Plus 额度）
- **现象**：日常写代码、搜目录、跑测试、防上下文爆满误调了 `gpt-6-astra`，导致 ChatGPT Plus 额度被迅速烧光。
- **铁律**：
  - 常规代码编写、测试运行、防上下文爆满：**必须默认使用 `gemini-3.8-flash`**！
  - 仅当用户显式调用 `/astra-plan` 或明确要求架构方案时，才允许派发 `gpt-6-astra`（`fork_turns: "3"` 或 `"none"`）。

### 3. 多智能体长任务等待闭环纪律（严禁无工具调用提前交出控制权）
- **现象**：调用 `wait_agent` 等待子代理时使用 30s 默认超时，超时后主智能体输出了一段纯文本进度而没有发起工具调用，被前端判定为 Turn 结束，迫使用户手动点击“继续”。
- **铁律**：`wait_agent` 超时设为 `180000` 到 `300000`（3~5分钟）。若偶发超时，**必须在同一次回复中再次发起下一次 `wait_agent` 调用**！绝对禁止在子代理尚在运行时仅输出纯文本而不发起工具调用！

### 4. 科学门禁真实性与零占位原则（Zero Fake Pass）
- **铁律**：
  - **严禁为了走通流程硬编码 status:'pass'**：缺少数据或方程必须如实返回 `inconclusive`；缺少可执行文件必须拒绝执行，严禁返回合成跑分；
  - **非显著结果（p >= alpha）是合法科学发现**：如果实验设计严谨、样本量符合规范，方法门禁通过，结论如实记为 `inconclusive` 或 `refuted`，严禁 p-hacking；
  - **空账本严禁报全绿**：无 claim、无 evidence 的项目门禁汇总必须是 `not_applicable`；
  - **非文献证据无需伪造 DOI**：数据、公式、跑分证据均有自身一等公民 locator。

### 5. 前缀缓存第一原则与 Single Freeze 纪律
- **铁律**：
  - **维持固定 4 大公开网关**：不在运行期动态增删顶级工具，所有多范式能力必须收敛在 `research_evidence` 的 `describe_operation` 和 `execute_operation` 中，坚决捍卫 DeepSeek 95%~99% 的 KV 缓存；
  - **首次 list 必须等待 scope 判定**：一旦在 connection 模式冻结清单，后续迟到的 roots 响应绝不可修改工具列表；
  - **配置格式区分**：天枢项目级配置结构为 `mcp.servers`（写在 `.rivet-config.json`），外部宿主 Cursor 项目配置为 `.cursor/mcp.json` 的顶层 `mcpServers`。

### 6. 双仓库同步红线
- 本地存在平行的两个仓库：宿主 `plugins/tianshu-research/` 与独立开源仓库 `D:\1_Research\Tianshu-Research`。
- **铁律**：修改插件代码后，必须将变更完整同步到独立仓库，并确保两边单测全绿，禁止遗漏同步！
