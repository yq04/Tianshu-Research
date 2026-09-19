# 迁移说明 — 0.1.0 → 0.2.0

> 范围冻结于 Phase 12 候选版本汇总。发布/push 由既有用户授权流程执行，本文档只描述行为差异与升级步骤。

## 1. 新增能力（对既有使用零破坏）

| 新增 | 位置 | 说明 |
|------|------|------|
| Council 评审契约 | `integration/review-contracts.js` | 多席位独立同行评审：法定人数、反例门禁、chair 否决、五态映射。策略在代码中，提示词无法放宽。 |
| CVM 单向投影 | `integration/context-projection.js` | 科研事实 → 宿主认知层（Claims/Ledger/Pressure/Stigmergy）的只读、字节级确定性快照。 |
| 文献连接器 | `connectors/` | OpenAlex（游标分页、同 DOI 版本合并）、arXiv（跨进程限流）、Zotero Web API v3（412 条件写入）。 |
| Jupyter 内核网关 | `notebook/` | 交互执行与清洁复跑分离；执行记录与复现报告落盘 `.rivet/research/notebook/`。 |
| 能力基准 | `capability-benchmark/` | `npm run benchmark:smoke` 离线运行；数据集哈希固定、假收据必 fail。 |
| 发布工具 | `scripts/` | `check-release-parity.js` 双仓 parity 校验；`capture-host-surface.js` 宿主表面快照。 |

公开网关仍是固定 4 工具（`research_query` / `research_evidence` / `journal_palette` / `research_status`），运行期不增删顶级工具，`listChanged: false` 纪律不变。

## 2. 行为变更

1. **工作流 `review` 节点不再自动通过**：0.1.0 中 review 节点硬编码 `approved`（占位缺陷）；0.2.0 起无裁决时进入 `awaiting_input`，有裁决时按评审契约真实聚合。依赖旧行为的图需要补上 Council 裁决或改用 `decision` 节点。
2. **`research_query` 新增 `search_sources` 动作**：连接器化检索（可选 `mode: replay/record` 离线快照）；归入 `literature` 能力组。
3. **`test:python` 脚本升级**：从单文件改为 `unittest discover`（当前 14 项 Python 测试）。

## 3. 可选依赖（全部声明式，不隐式安装）

- **Jupyter**：`pip install -r requirements-notebook.txt`（jupyter_client ≥ 8 + ipykernel ≥ 6）。缺依赖时 notebook 操作返回 `blocked`，绝不伪造执行收据。可用 `TIANSHU_PYTHON` 指定解释器。
- **Zotero / OpenAlex / arXiv**：零强制依赖；Zotero 写入库需 `ZOTERO_USER_ID` + `ZOTERO_API_KEY`（仅 Authorization 头传输，诊断脱敏）。

## 4. 工作区能力组

`notebook.execute@1` / `notebook.replay@1` 归入新能力组 `notebook`。显式配置了 `configuredCapabilities` 的工作区需要在 `.rivet/research.json` 中加入 `"notebook"` 才能启用；未显式配置能力组的工作区不受影响。

## 5. 升级步骤

1. 拉取 0.2.0 代码后运行 `npm test && npm run test:python`（候选版本应全绿：330 Node + 14 Python）。
2. 运行 `node scripts/check-release-parity.js --peer <独立仓库路径>` 确认双仓 parity。
3. 如使用 Jupyter，安装 `requirements-notebook.txt`。
4. 宿主兼容性矩阵见 `docs/host-compatibility.md`；未测宿主如实标注「未测」，不代表已验证。
