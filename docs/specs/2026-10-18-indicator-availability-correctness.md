# 指标依赖时钟与不可用状态修复规格

> 任务标识：`indicator-availability-correctness`；日期：2026-10-18；状态：本地修复及 IVAG 目标 Worker 构建、冻结、执行、重放和历史保护均通过。目标证据见[验收记录](../tasks/evidence/2026-10-19-p0-target-acceptance.md)。
> [实施任务](../archive/tasks/2026-10-18-indicator-availability-correctness.md) · [全局优先级](../tasks/README.md#priority-p0) · [IR09/IR10 原始反例](../reviews/2026-10-18-starred-project-source-audit.md#indicator-findings)。

## 1. 目标与范围

修复 RSI 递归状态遗失依赖时钟及 ATR 遗失前收时钟/复活不可用输入的问题。处理顺序列 P0，原审查中的 P1 缺陷等级与证据层不变。固定快照研究不是严格历史 PIT；此次只贯彻既有可见性合同，不恢复全历史追补或更换引擎。

当前 [Domain 指标内核](../../packages/domain/src/backtest-indicators.ts) 被 [Server 指标助手](../../apps/server/src/backtest/backtest-adjusted-indicators.ts) 及仍在使用的 [分派函数](../../apps/server/src/backtest/backtest-v2-execution-shared.ts) 消费。原反例已在纯函数和该 Server 助手隔离复现，未证明所有既有 V3 Run 都受影响。

遵循现行[经济与冻结合同](2026-09-25-multi-source-adjustment-aware-backtest.md)及[指标合同](2026-09-10-market-chart-indicator-integration.md)。不更改 RSI 平滑方式、EMA 种子、MACD 缩放或现有支持矩阵；不因参考引擎数值不同重写算法。

## 2. 依赖与状态合同

递归指标状态在重置前必须保留所有仍影响数值的依赖可见性；最近窗口不能代替递归状态的完整依赖。继续使用 [BacktestAvailability](../../packages/domain/src/backtest-observation-clock.ts) 的实际 `availableAt` 与显式 `researchClock`，不得把观察时间改成研究决策时间以伪造可见性。

TR/ATR 必须核验实际参与计算的当前高低价和前一收盘价及其状态，合并全部依赖时钟。`unavailable` 即使携带 OHLC 也不变为 available；缺字段、无效数和预热不足不能靠补零或继承残留字段产生合法信号。首个 TR 的既有算法约定需固定，不擅自改变初值。

输入中断后的重置/预热按固定方法处理，不能数值重置而保留旧时钟，或数值延续却清除依赖。嵌套指标的时钟与状态必须沿表达式传播。缓存预计算、复权输入与逐 tick 对齐不得使过去结果消费未来可用输入。

保留 [NAV 先过滤可见输入](../../apps/server/src/backtest/backtest-nav-offline-signals.ts) 和[策略编写 OHLCV 约束](../../packages/schemas/src/strategy-authoring-definition.ts)。仅给 scalar 的 ATR 探索反例不升级为新的生产缺陷。

## 3. 版本和历史结果

在实施前确认真正控制计算、缓存和冻结重放的版本入口。修复改变输出可见性时，新增计算身份或按既有版本协议隔离；不得让旧缓存冒充修复后结果，也不得用新内核无提示地重算旧 Run。旧结果保持只读；受影响范围按输入和方法判定，不批量宣布历史全部无效。

确需修改共享 Schema、引擎标识或重放策略时先写回 IVA0 的兼容清单；不为修复清理用户缓存、重写快照或扩大历史数据采购。目标验收可使用专用冻结合成输入，不依赖真实模型调用。

本次计算身份使用 `thesis-ledger-v3-local-runner-v3`。指标缓存仅存在于一次 `buildPointInTimeIndicatorSeries` 调用内，没有持久跨 Run 缓存；Snapshot manifest 与内容哈希继续只标识冻结输入。已成功 Run 直接读取原结果；已经绑定其他本地 Runner 版本的 queued Run 收敛为带 `INDICATOR_ENGINE_VERSION_CHANGED` 原因的 failed，保留原引擎身份、结果与冻结材料；同类 failed Run 的 retry 拒绝跨版本执行，须显式创建新 Run。尚未绑定计算版本的新 Run 按现行版本领取，NAV 专用版本不受此规则影响。

## 4. 验收标准

| ID | 必须验证的结果 |
| --- | --- |
| IVA-AC1 | RSI period=2、收盘 `[100,90,91,92,93]`、首点到 Jan10 可见：Jan5 不得消费仍依赖该首点的结果；修改首点为 1000 不产生提前可用的输出。 |
| IVA-AC2 | ATR1 实际使用到 Jan10 才可见的前收 100 与 Jan2 高12/低10/收11，不得在 Jan2 接受结果 90。 |
| IVA-AC3 | unavailable OHLC 不被 TR/ATR 恢复成 available；中断、重置和重新预热有确定性断言。 |
| IVA-AC4 | EMA 正对照、普通单调时钟、研究时钟、嵌套表达式及既有复权/NAV/编写保护不回归；追加未来输入不改变过去可用输出。 |
| IVA-AC5 | 完整 Server 指标消费及正式 V3 执行路径在受控冻结输入下通过，不只验证提取的纯函数。 |
| IVA-AC6 | 计算/缓存身份和旧结果兼容可核对；目标版本与执行路径匹配，原 Run/Snapshot 不变。 |

## 5. 验证边界

复用[原反例输入与脚本说明](../reviews/2026-10-18-starred-project-source-audit.md#reproduction)，将反例纳入领域正式测试。用同一锚点比较批量与逐 tick 结果，不能用不同预热起点的数值不等断言失败。

Domain、Server、版本隔离和目标执行分别验收，旧指标图表 UI 与来源资格不重开。涉及此内核的策略评价、风险预览或 Market Consumer 只能复用修复后匹配证据；不使用指标的新闻/DSA 盘点不被设置为全局等待。
