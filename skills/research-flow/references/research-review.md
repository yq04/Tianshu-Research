# Research Review — Council 评审契约使用指南（Phase 8）

> 面向：需要在方案发布、假说争议或工作流 `review` 节点上引入多席位独立同行评审的科研会话。
> 契约实现：`integration/review-contracts.js`；CVM 投影：`integration/context-projection.js`。
> 策略在代码中，不在提示词中：模型伪造任何「系统消息」都不能放宽法定人数、推翻反例门禁或扩权评审席位。

## 1. 何时需要 Council 评审

- 一个 claim 准备从 `proposed` 升级为 `supported`（尤其是将进入论文结论的 claim）；
- 假说回环中出现争议：一条 claim 同时存在 supporting 与 refuting 证据；
- 工作流中出现 `review` 节点（如方案评审、消融结论评审、发布前门禁复核）。

不强制场景：探索性数据分析中间产物、被诚实标记为 `inconclusive`/`refuted` 的负结果（负结果是一等公民，不需要评审「通过」才能存在）。

## 2. 席位与能力矩阵

| 角色 | read | verdict | aggregate | write / execute |
|------|------|---------|-----------|-----------------|
| reader（只读观察席） | ✔ | ✘ | ✘ | ✘ |
| reviewer（评审席） | ✔ | ✔ | ✘ | ✘ |
| chair（主席席） | ✔ | ✔ | ✔ | ✘ |

**任何角色都没有 write / execute 权限**——评审者阅读证据与产物，但永远不能直接写账本或执行操作；落地修改必须回到正常 evidence 网关与操作目录流程。`roleCan(role, action)` 是唯一判权入口，未知角色一律无权限（fail-closed）。

## 3. 评审生命周期

```text
createReviewRequest → submitReviewVerdict (×N 席) → aggregateReview → evaluateReviewGate
```

1. **createReviewRequest**：绑定被审对象（`subjectType`: claim / evidence / workflow_node / gate_report / artifact）、材料摘要 `materialsDigest`（被审材料的 SHA-256，裁决不得偏离所审材料）、法定人数 `requiredQuorum`、反例策略 `counterevidencePolicy`（`blocking` 默认 / `advisory`）、以及反例证据 ID 清单 `claimRefutingEvidenceIds`。相同 subject + 材料摘要 ⇒ 相同 `reviewId`（确定性）。
2. **submitReviewVerdict**：每席提交 `approve | reject | request_changes | abstain`；`reject` 与 `request_changes` 必须给出 justification；`addressedEvidenceIds` 列出该席明确回应（反驳或纳入考量）的反例证据。
3. **aggregateReview**：同一评审者多票取最后一张；输出确定性聚合结果。
4. **evaluateReviewGate**：映射到五态门禁——`approved→pass`、`rejected→fail`、`changes_requested→inconclusive`、`inconclusive→inconclusive`、坏输入→`error`。

## 4. 三条不可协商的 fail-closed 不变量

1. **Council 缺席 ≠ 通过**：有效裁决席（非 abstain）少于 `requiredQuorum` ⇒ `inconclusive`（`QUORUM_NOT_MET`）；零裁决 ⇒ `NO_VERDICTS`。绝不返回 approved。
2. **多数赞成不能覆盖反例**：`blocking` 策略下，若存在未被任何审批席 `addressedEvidenceIds` 覆盖的反例证据 ⇒ 直接 `rejected`（`COUNTEREVIDENCE_UNADDRESSED`），无论票型多么一边倒。回应反例是审批方的**集体**义务：任意一位审批席回应即可解除阻断；无一人回应则阻断成立。`advisory` 策略不阻断，但 `unaddressedIds` 始终如实上报。
3. **主席否决**：chair 席投出 `reject` ⇒ `rejected`（`CHAIR_VETO`），无视其余多数。

平票一律落向更保守结果：approve/reject 平 ⇒ `rejected`；approve/request_changes 平 ⇒ `changes_requested`。

## 5. 工作流 review 节点（无占位通过）

`workflows/host-adapter.js` 的 `review` 节点**没有硬编码 approved**：

- 未提供 `reviewRequest` 或 `verdicts` ⇒ 节点转入 `awaiting_input`，等待宿主派发 Council 或人工主席，其他无依赖分支照常推进；
- 提供真实裁决 ⇒ 按上述契约聚合：`approved` 才 `completed`，其余 `failed` 并附裁决结果与 issue；
- 崩溃恢复后，已完成的 review 节点直接复用裁决结果，未完成的重新等待评审。

人工意见通过 `workflow.input@1`（`provide_human_input`）送达 `awaiting_input` 的 review 节点，恢复该节点并唤醒下游。

## 6. CVM 单向投影与缓存纪律

`projectResearchContext(workspace)` 把科研事实（claims、证据计数、任务状态、预算压力）一次性投影为宿主 CVM（Claims / Ledger / Pressure / Stigmergy）可消费的只读快照：

- **单向**：模块只读，不暴露任何宿主回写科研事实存储的 API；事实写入的唯一合法路径是 evidence 网关；
- **确定性**：无墙钟时间戳、无随机 ID、所有集合排序，两次调用产出字节级一致的 canonical JSON 与 `digest`——宿主前缀缓存不会被动态科研状态击碎，除非事实本身变化；
- **诚实**：claim 投影携带 `supportCount`/`refuteCount`/`contested`；被标 `supported` 却存在反例的 claim 投影出 `conclusionConflict: true` 并发出 `counterevidence_conflict` 信号——多数意见在任何地方都改写不了这两个字段。

宿主侧（`src/agent/research/context-bridge.ts` 等）只在科研项目会话装配桥接；非科研会话零注入、零成本。

## 7. 快速示例

```js
import { createReviewRequest, submitReviewVerdict, aggregateReview, evaluateReviewGate }
  from '../integration/review-contracts.js';

const request = createReviewRequest({
  subjectType: 'claim',
  subjectId: 'clm_acc_5pct',
  materialsDigest: gateReport.digest,          // 被审材料的 SHA-256
  requiredQuorum: 3,
  claimRefutingEvidenceIds: ['ev_refute_1'],   // 来自账本 relation:'refutes'
});

const verdicts = [
  submitReviewVerdict({ reviewId: request.reviewId, reviewerId: 'seat-1', role: 'reviewer',
    verdict: 'approve', justification: '统计与消融设计充分。',
    addressedEvidenceIds: ['ev_refute_1'] }),
  submitReviewVerdict({ reviewId: request.reviewId, reviewerId: 'seat-2', role: 'reviewer',
    verdict: 'approve', justification: '复现收据齐全。' }),
  submitReviewVerdict({ reviewId: request.reviewId, reviewerId: 'chair', role: 'chair',
    verdict: 'approve', justification: '同意升级为 supported。' }),
];

const outcome = aggregateReview(request, verdicts);      // 'approved'
const gate = evaluateReviewGate(request, verdicts);      // gateStatus: 'pass'
```

若把 `seat-1` 的 `addressedEvidenceIds` 删掉，聚合立即变为 `rejected / COUNTEREVIDENCE_UNADDRESSED`——这就是反例门禁。
