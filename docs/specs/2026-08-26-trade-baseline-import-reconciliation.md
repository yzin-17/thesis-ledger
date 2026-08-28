# 历史基线、导入与对账子 Spec

上位 Spec：[`2026-08-26-trade-execution-ledger-system.md`](2026-08-26-trade-execution-ledger-system.md)

依赖：[`交易账本写入与修正协议`](2026-08-26-trade-ledger-write-correction.md)

## 背景与问题

现有账户包含只有当前数量和成本价、缺少完整成交历史的 Position。直接把它们转换成 BUY 会伪造开仓事实；补录历史成交又可能与既有余额重复计入。

## 目标

- 将当前持仓表达为可审计的业务时点观察，而不伪造成交。
- 支持完整或部分账户快照、多次检查点和逐步历史补录。
- 使用确定性建议和用户确认建立覆盖关系。
- 为截图和现有导入链路提供可回溯、可冻结的 ImportDraft。

## 非目标

- CSV 成交导入或券商自动同步。
- AI 自动确认对账关系。
- 证券转入转出。
- 根据部分历史自动推翻 Baseline 观察值。

## 现状与约束

- Baseline 是余额观察事实，不是成交事实。
- 基线平均买入价只表示来源提供的账面成本价，费用是否包含可以未知。
- 历史成交可以逐步补录，不能要求一次补齐全部历史。
- 孤立 SELL 不能直接进入 LONG-only 账本。

## 设计方案

### Baseline Observation Batch

批次包含：

- `batchId`、`accountId`。
- `scope: FULL | PARTIAL`。
- `observedAt`：余额对应的业务时点；来源时间未知时为 `NULL`，并将时间精度标记为 `UNKNOWN`。
- `capturedAt`：截图或来源文件生成时间；来源未提供时为 `NULL`，不得使用 `recordedAt` 或 UTC 伪造。
- `recordedAt`：服务端写入时间。
- 来源类别、具体渠道、原始证据引用与内容哈希。

批次引用约束：

- 每个 `POSITION_BASELINE_OBSERVATION` 的 payload `batchId` 必须对应已持久化的 `BaselineObservationBatch.id`，且批次与事件属于同一账户。
- 批次和对应事件必须在同一账户写事务内创建；未知来源时间也必须创建批次，不能仅生成悬空的 `batchId`。

批次内每个资产形成独立 `POSITION_BASELINE_OBSERVATION` 事实，保存数量、来源平均账面成本价和成本口径 `INCLUDES_FEES | EXCLUDES_FEES | UNKNOWN`。第一阶段默认允许 `UNKNOWN`。

- `FULL` 表示该账户在 observedAt 的完整资产快照；未出现的既有资产可形成数量 0 观察。
- `PARTIAL` 只影响明确出现的资产，禁止推断其他资产为 0。
- 不同 observedAt 的观察均保留为独立检查点；只有观察本身错误时才使用账本修正链。

### Trade 中的 Baseline Component

- Baseline 不进入真实 Entry Leg。
- 每个检查点比较已知有效成交投影与观察数量、成本，无法解释的差额形成 Baseline Component。
- 基线尚未完全解释时，`openedAt` 保持空；最早已知成交另存 `earliestEvidenceAt`。
- 数量观察为 0 时生命周期可以 ENDED，但 `closedAt`、退出价和价差收益保持空，结束证据为 `BALANCE_OBSERVATION`。

### Reconciliation

系统根据账户、`Asset.symbol`、经济时间、数量和成本生成确定性候选；每个候选必须展示匹配依据和冲突原因，不使用 AI 评分决定权威映射。

用户确认后追加 `BASELINE_RECONCILIATION`，保存：

- 目标观察事实的 `factId`。
- 被纳入历史解释的成交 `factId` 集合。
- 确认时 Ledger Revision、操作者、来源和原因。
- 覆盖数量、覆盖成本和确定性规则版本。

同一成交只纳入历史解释一次，并从自身 occurredAt 向后重放全部观察检查点。每个检查点计算：

```text
remainingQuantity = observedQuantity - reconciledActualQuantity
remainingCost = observedQuantity * sourceAverageCost - reconciledActualCost
```

负残量、成本异常或重复覆盖不会自动修正；投影保留 Baseline 权威观察并标记明确冲突。

第一阶段确定性规则版本为 `1`：

- 候选只使用同账户、同 `Asset.symbol` 且经济时间不晚于目标观察检查点的已知成交；任一方业务时间未知时不自动生成可确认候选。
- 候选中的成交按 `occurredAt → economicOrderKey → factId` 排序，并以当前尚未被其他对账事件纳入的有序前缀形成；已确认覆盖的成交从自身发生时间起自动参与后续检查点重放。
- 候选事件中的 `executionFactIds` 只记录本次新增纳入的成交；`coveredQuantity` 与 `coveredCost` 表示加入本次候选后，在目标检查点按历史顺序重放得到的累计实际值。
- 候选预览同时计算目标检查点及其之前的所有检查点，覆盖数量和成本使用十进制计算；数量或成本无法守恒时返回冲突原因，不写入账本。
- 用户确认时必须重新读取并校验候选、账户 Ledger Revision 和成交使用状态；确认只追加一条 `BASELINE_RECONCILIATION` 事件，撤销或恢复通过该事件的修正链完成。
- 候选和检查点使用稳定的状态与原因代码表达 `PARTIAL`、`MATCHED`、`CONFLICTED`、重复覆盖、账户或资产范围不匹配、超额卖出、时间未知、币种不一致、负残量和缺少基线成本等情况。

### ImportDraft

- 一个 Draft 只属于一个账户；多账户文件在解析后拆分。
- Draft 保存原始文件受控引用、哈希、解析器版本、来源行 ID、解析结果、候选资产映射和问题列表。
- 解析结果中的数量、价格、金额和收益率使用十进制字符串；服务端校验与领域计算不得先转换为 JavaScript `number`。
- 未提交 Draft 可修改；每次提交形成冻结 Draft Revision。
- 用户可以选择有效行原子提交；问题行继续保留在未完成 Draft Revision。
- `partial` Draft 可以从未提交行创建后续 Revision；已提交 Revision 的行和原始内容保持冻结，后续 Revision 只包含未提交行，`submittedRowIds` 仅记录当前 Revision 的提交范围。
- 相同幂等键且内容相同标记为重复；内容不同标记为冲突，确认后通过账本修正协议处理。
- 缺少买入或 Baseline 支撑的历史 SELL 留在 Draft，补齐证据后才可提交。

## 对外行为或接口变化

- 新增创建、查看、修正 Baseline Observation Batch 的命令与查询。
- 新增对账候选查询、确认、作废和恢复命令。
- 现有截图或导入流程必须先创建 ImportDraft，不直接写 Position 或 BUY/SELL。
- 账户数据提供 Baseline、其他账本事件、Draft 问题和对账冲突入口。

## 数据、状态或兼容性影响

- 旧 `opening-balance`、`position-balance` 迁移为 Position Baseline Observation。
- 旧 `cash-balance` 迁移为 Cash Balance Observation。
- 历史迁移对无法恢复批次时间的 Position Baseline 事实创建 `UNKNOWN` 精度且时间字段为空的批次记录，不得遗留悬空 `batchId`。
- `CASH_BALANCE_OBSERVATION` 不使用 `BaselineObservationBatch`；其 payload 不得携带 Baseline 批次引用。
- 旧 `rollback` 必须根据 payload 映射为专用事实或修正动作；无法确定时阻断迁移。
- 现有 Position 数据只用于迁移对比，不能直接生成虚假 BUY。

## 风险与备选方案

- 来源平均成本价可能包含费用，基线收益必须标记估算且默认排除正式胜率统计。
- FULL/PARTIAL 选择错误会影响未出现资产；提交前必须显示影响预览并要求确认。
- 对账候选可能很多；使用确定性过滤和分页，不通过自动提交降低操作量。

## 未决问题

无。

## 验收标准

1. Existing Position 不会被迁移成虚假 BUY。
2. FULL 与 PARTIAL 快照对未出现资产的处理不同且可验证。
3. 多个观察检查点能够按业务时间重放。
4. 部分和完整对账保持数量及成本守恒。
5. 同一成交不会在多个检查点重复覆盖。
6. 对账建议不产生账本写入，只有用户确认才生效。
7. 孤立 SELL 和幂等内容冲突保留在 Draft。
8. 已提交 Draft Revision 和原始证据引用不可修改。
9. AC9：每个 `POSITION_BASELINE_OBSERVATION` 的 `batchId` 都能读取到同账户的 `BaselineObservationBatch`。
10. AC10：未知来源时间的迁移不会伪造业务时间，并仍创建可追踪批次；历史悬空 `batchId` 可由 repair migration 修复。

## 测试策略

- 服务测试验证未知时间路径仍创建批次，并验证批次与事件使用同一账户写事务。
- Prisma schema 与 repair migration 校验可空时间字段、历史 Position Baseline 回填、Cash Balance 悬空引用清理和重复执行安全性。
