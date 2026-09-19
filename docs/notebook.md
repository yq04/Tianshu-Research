# Notebook 交互执行与清洁复跑（Phase 9B）

> 面向：需要交互式探索（Jupyter 内核）与正式复现（干净无状态重放）分离的科研会话。
> 模块：`notebook/kernel-manager.js`（Node 侧）、`notebook/bridge.py`（Python 侧）、`notebook/execution-record.js`、`notebook/replay.js`。

## 1. 核心纪律：探索 ≠ 复现

交互探索可以乱序跑 cell、重启内核、依赖隐藏状态；**正式复现必须**在全新内核（新 epoch）中按记录顺序重跑全部 cell 并逐 cell 对比输出。两者在数据模型上严格分离：

- 交互执行经 `notebook.execute@1`，写入执行记录（`.rivet/research/notebook/<session>.record.json`）；
- 正式复现经 `notebook.replay@1`，产出复现报告（`.rivet/research/notebook/<record>.replay.json`）与五态门禁结论。

## 2. 操作目录

| 操作 ID | 作用 | 能力 |
|---------|------|------|
| `notebook.execute@1` | 在持久内核会话中执行一个 cell，诚实记录输出/错误/超时 | `notebook` |
| `notebook.replay@1` | 在全新内核中重放执行记录并对比 | `notebook` |

通过 `research_evidence` 网关的 `describe_operation` / `execute_operation` 按需发现与执行，四网关顶级工具面保持不变。

## 3. 正式复现门禁（fail-closed）

执行记录满足以下全部条件才允许正式复现（否则门禁诚实拒绝，绝不伪造等价性）：

1. **单 epoch**：全部 cell 在同一内核生命周期内执行（会话中途重启 → `MULTI_EPOCH_SESSION`）；
2. **顺序单调**：cell 执行顺序严格递增（乱序 cell 可能依赖隐藏状态 → `OUT_OF_ORDER_CELLS`）;
3. **全部 ok**：无 error / timeout cell（`NON_OK_CELLS`）；
4. 记录非空。

复现结论映射五态门禁：`reproduced → pass`、`diverged → fail`（逐 cell 报告差异）、`not_comparable → inconclusive`、内核不可用 → `blocked`。**隐藏状态教训**：读取了记录之外状态（如上个会话赋值的变量）的 cell 会在干净重放中如实 diverge——这正是门禁存在的意义。

## 4. 诚实降级（Zero Fake Pass）

- Python / `jupyter_client` 缺失：bridge 报 `unavailable`，操作返回 **`blocked`**，绝不伪造执行收据；
- cell 超时：bridge 中断内核并返回 `timeout` + 已收集的部分输出；
- cell 异常：如实返回 `error` 与 traceback 摘要（负结果是一等公民）；
- 晚到输出（内核 reply 之后的 flush）被捕获并归档，不静默丢弃。

## 5. 环境准备（显式声明，不隐式安装）

```bash
pip install -r plugins/tianshu-research/requirements-notebook.txt
# jupyter_client>=8.0.0, ipykernel>=6.29.0
```

可用 `TIANSHU_PYTHON` 环境变量指定 Python 解释器。全部单测基于 fake bridge / fake kernel，不要求本机安装 Jupyter。
