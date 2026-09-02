# 投资复盘任务与交易系统适用性 Review

## Review 范围

本 Review 对比以下两组文档和当前实现：

- 原始投资复盘 Spec 与任务：[`2026-08-25-journal-review-interaction-design.md`](../archive/specs/2026-08-25-journal-review-interaction-design.md)、[`2026-08-25-journal-review-interaction-design.md`](../archive/tasks/2026-08-25-journal-review-interaction-design.md)。
- 现行交易系统及 Journal 迁移文档：[`2026-08-26-trade-execution-ledger-system.md`](../specs/2026-08-26-trade-execution-ledger-system.md)、[`2026-08-26-trade-projection-read-model.md`](../specs/2026-08-26-trade-projection-read-model.md)、[`2026-08-26-trade-journal-migration.md`](../specs/2026-08-26-trade-journal-migration.md)、[`2026-08-26-trade-execution-ledger-system-follow-up.md`](../tasks/2026-08-26-trade-execution-ledger-system-follow-up.md)。

审查依据包括当前物化 `Trade`/`TradeCloseSlice` 模型、`TradeQueryService`、`JournalService` 和当前 API Schema。审查只更新词汇与 Review 记录，不改写原任务的历史证据。

## 结论

原 8/25 任务仍能描述投资复盘的产品目标，但不再适合作为当前实施入口。它应被视为“Trade Projection 引入前的历史基线”；当前 Journal 的接口、交易粒度、证据状态和测试门禁应以 8/26 Trade 系列 Spec 及其 T15/T17 为准。

当前实现已经完成以下迁移：

- Journal 通过 `TradeQueryService` 读取物化 Trade 和 Close Slice，不再自行从 Ledger 拼装交易。
- 复盘对象已经分为 `TRADE_CYCLE` 和 `CLOSE_SLICE`。
- TradePlan 通过显式 `tradeId`/事件证据关联；旧候选无法唯一映射时保留 legacy 状态。
- 复盘快照保存投影版本、指纹和事实集合，并能区分 `CURRENT` 与 `STALE`。

## 原任务逐项适用性

| 原任务 | 结论 | 重新适用时的处理 |
| --- | --- | --- |
| T1 候选和查询契约 | 保留目标，契约已被替代 | 以当前 `mode`、`reviewObjectType`、`tradeId`、`closeSliceId`、投影指纹和 legacy 字段为准。 |
| T2 服务端交易生命周期重建 | 不再适用为 Journal 任务 | 由 Trade Projection 的 T8–T10 承担；不得恢复旧的 Journal→Ledger 计算路径。 |
| T3 候选聚合 endpoint | 保留目标，依赖已变化 | 候选服务只编排 `TradeQueryService` 结果、计划、Journal 和快照状态。 |
| T4 Desktop 数据访问 | 保留 | Query key、API 类型和模式隔离必须同步 Trade Projection 契约。 |
| T5 页面信息架构 | 保留 | 账户数据和投资组合已有独立 Trade 入口，Journal 只负责复盘编排。 |
| T6 单笔选择与证据核对 | 保留，粒度需扩展 | 同时支持完整 Trade 与 Close Slice，并展示 Baseline、证据不足、legacy 和过期状态。 |
| T7 确定性结果 | 保留，数据边界需扩展 | 结果需尊重十进制字符串、成本估算、原币/本位币和统计资格。 |
| T8 周期复盘 | 保留，统计口径需改写 | 完整周期统计只使用符合资格的 `TRADE_CYCLE`，Close Slice 单独统计。 |
| T9 AI 解读 | 保留 | AI 输入需携带确定性 Trade 事实、来源和投影边界；失败不影响快照。 |
| T10 回归测试 | 保留，旧证据已过期 | 以当前 Trade/Journal 测试数量、指纹、legacy 和模式隔离用例为准。 |
| T11 文档与质量检查 | 保留 | 用户文档应说明成交、交易周期、持仓和基线观察的区别。 |
| T12 最终一致性 Review | 原结论不再适用 | 由 Trade 任务 T17 和本 Review 共同承担当前一致性判断。 |

## 必须修正的旧表述

### 1. “直接从 Ledger 选择已平仓交易”已过时

原 Spec 把 Ledger 作为 Journal 候选的直接组装入口。当前应改为：Ledger 是经济事实源，Journal 消费 Trade Projection；Trade Projection 再提供完整 Trade、Close Slice、成本分配和证据状态。

### 2. 旧候选不是唯一的“交易”粒度

当前必须区分：

- `TRADE_CYCLE`：完整生命周期，用于周期统计、胜率和完整持有周期；
- `CLOSE_SLICE`：一次减仓事实，用于退出行为和成本分配复盘。

### 3. 精度边界已在新 Spec 收敛

Trade 读取模型和 Ledger V2 使用十进制字符串。Journal 主链路使用 decimal string DTO，旧 `CompletedTrade<number>` 仅保留为 legacy adapter；舍入、不可安全适配和旧快照兼容由新任务验证。

### 4. 未知开仓边界已在新 Spec 收敛

Trade Projection 允许 `openedAt = null`。不得使用 `earliestEvidenceAt`、Baseline 记录时间或服务端时间伪造开仓边界；依赖真实开仓的指标统一返回证据不足。

### 5. “未新增数据库迁移”已是历史表述

原任务最终证据中的该结论只属于当时范围。Trade 系统后续已经引入物化 Trade、Close Slice、Projection Generation、快照和基线相关数据结构；旧结论不能作为当前系统状态。

## 适用性判定

- 原 8/25 Spec：`历史目标仍有参考价值，但不是当前契约`。
- 原 8/25 任务：`历史任务已完成，不应重新执行；T2/T12 的当前职责已被后续 Trade 任务接管`。
- 继续开发 Journal：`使用当前 Trade 与统一 Trade Projection Spec/Task；如需新增行为，创建新的 Journal follow-up 任务，不在旧任务上追加隐含范围`。

## Planning Review 结论

- Spec 覆盖：当前 Trade/Journal 子 Spec 已覆盖 Trade Cycle、Close Slice、基线、快照、legacy 和统计资格；原 8/25 文档存在被替代的候选粒度与数据源表述。
- 占位扫描：相关 Spec/任务没有发现阻塞性的未定义实现指令。
- 依赖关系：当前 Journal 依赖 Trade Projection、账本修正和 Baseline 对账；Trade 任务已记录该依赖。
- Blocking Question：无。
- 结论：旧任务适用性 Review 已完成；新的 Journal Spec/Task 已成为当前实施入口。

## 后续建议

1. 原 8/25 Spec 和任务文档已归档为历史基线；当前入口使用新的 [`统一 Trade Projection Spec`](../specs/2026-08-28-journal-review-trade-projection.md) 和 [`实施任务`](../tasks/2026-08-28-journal-review-trade-projection.md)。
2. 后续 Journal 迭代不得重新实现 Trade Projection，新增行为应建立在当前统一投影契约上。
3. 后续 Review 使用当前测试和运行态证据，不再引用原任务中的旧测试计数作为现状。

## 当前 Review 状态

- [x] 已确认原任务与现行 Trade 系统的边界
- [x] 已逐项判断 T1–T12 的适用性
- [x] 已识别旧契约、精度和未知时间语义的漂移
- [x] 已生成新的 Trade Projection 对齐版 Spec/Task
- [x] 原 8/25 Spec/Task 已归档，当前 Review 引用已同步
