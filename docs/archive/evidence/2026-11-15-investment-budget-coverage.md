# 普通回测与 AI 实验投入上限覆盖检查

## 结论与范围

2026-11-15 对当前单标的 Exchange 回测执行链检查通过。普通策略回测与策略中心 AI 优化实验共用实际投入限制；阶段加仓、首次风险预算和每日目标波动率均在计划数量转换后再次核对实际成交计划。未发现这三个计划通过实验入口绕过投入限制。

本轮仅新增回归测试与本记录，没有修改产品执行代码、部署、调用模型、创建实验或改写策略、版本、行情快照和回测结果。基金 NAV 执行不属于本次 Exchange 合同与结论范围。

## 执行链核对

- 普通入口：`BacktestController.createRun` → `BacktestService.createRun` → `BacktestRunService.createRun`；领取后经 `executeBacktestV3Run` 调用 `LocalSnapshotV3Runner.run`。
- 实验入口：`StrategyOptimizationRunService.recordBaseline`、`evaluateCandidateSplit` 共用 `executeRun`；最终基线与候选在 `StrategyOptimizationFinalization` 中仍调用同一个 `executeRun`。该方法经过配置预检调用 `BacktestService.createRun`，排队和等待公共回测任务，不自行执行另一套仓位算法。已有幂等任务沿用历史结果，不因修复自动重算。
- Server 与 Worker 的模块均将 `BACKTEST_V3_RUNNER` 绑定到 `LocalSnapshotV3Runner`。其 Exchange 分支经过 `runExchangeVertical` → `runExchangeSimulation` → `createExchangeSizingAdapter`。
- 适配器先执行 `computeSizing` 和 `tradePlanSizing`，再调用 `fitBuyToInvestmentBudget`。因此普通仓位、模型生成的计划和手工保存的同类计划，都接受最后一道实际现金扣减核对。

## 限制口径

| 类型         | 逐笔核对条件                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------ |
| 普通权益比例 | 本次含滑点成交额＋全部买入费用 ≤ 执行前权益 × 普通投入比例                                       |
| 阶段加仓     | 已有持仓按执行开盘价估值＋本次含滑点成交额＋全部买入费用 ≤ 执行前权益 × 该阶段最大投入比例       |
| 首次风险预算 | 止损距离算出的数量还须满足已有持仓占用＋本次含费用、滑点支出 ≤ 执行前权益 × 风险计划最大投入比例 |
| 目标波动率   | 同上，总投入受信号日冻结的动态目标比例约束；动态目标低于最高配置比例时，使用动态目标             |

风险预算和目标波动率按既有合同替代普通首次仓位比例；阶段加仓使用阶段配置的总持仓上限。风险预算中的最大投入比例与按止损距离估计的损失预算是不同约束，本结论不保证跳空止损损失不超过风险估计。

预算使用 `ExchangeMarketSimulation.plan` 返回的真实 `cashReservation`，包括全部买入费用与滑点；可用现金同时收紧。执行开盘权益与持仓估值来自独立执行投影，不将收盘决策权益回填为开盘权益。缺输入时拒绝新增投入。只能缩量，原始手数向下取整，归一化单位保持原精度搜索。仅保护计划仍采用普通入场计算。

这约束新增买入时的投入，不保证后续市场价格变化后的持仓权重恒定，也不预扣尚未发生的未来卖出费用。目标波动率与风险预算、非空阶段计划的互斥规则保持原合同。

## 本轮验证

新增 `apps/server/test/strategy-optimization/investment-budget.test.ts` 四组受控测试：普通仓位、加仓、风险预算、目标波动率。每组先运行一次普通冻结 Runner，再通过真实 `StrategyOptimizationRunService.executeRun` 的开发、验证、测试三个分段运行相同冻结 Runner，共 16 次结果验证。为隔离入口差异，三个分段刻意使用同一受控日期范围；持久化、配置预检和队列使用替身，模型没有被调用。

每次结果与普通结果深比较，并独立从现金、持仓、原始开盘、成交价及每项费用重建预算，用十进制严格比较，不设误差容忍。所有买入都要求正费用、正滑点；加仓必须实际产生第二次买入；波动率必须实际增减仓，且包含低于 50% 最高配置的动态目标。动态目标独立从信号前收盘样本标准差计算，不读取引擎预算函数或诊断字段。

最终检查：

- `pnpm --filter @thesis-ledger/server exec vitest run test/strategy-optimization/investment-budget.test.ts test/strategy-optimization/strategy-optimization-versioned-run.test.ts test/backtest/investment-budget.test.ts --testTimeout 60000`：3 文件、11 测试通过。覆盖冻结 Runner 的保护计划一致性、高开／低开、加仓持仓占用、每日动态调仓，以及实验预检、旧版本拒绝和幂等任务保留。
- `pnpm --filter @thesis-ledger/domain exec vitest run test/backtest-investment-budget.test.ts`：3 测试通过。覆盖原始手数、最低佣金、现金与比例双约束、持仓超限、不足一手、执行投影缺失和卖出。
- `pnpm --filter @thesis-ledger/server exec tsc --noEmit`：通过；新增测试文件定向 ESLint：通过。
- 只读检查正在运行的 `thesis-ledger-dev-thesis-ledger-1` 与 `thesis-ledger-dev-backtest-worker-1`：实际解析的 Domain 目录及 Server 目录中，预算、数量适配器、计划数量、归一化搜索、执行投影、实验执行服务共 6 个模块，两个容器分别全部与当前宿主构建产物 SHA-256 一致（12/12）。没有重启或更新容器。

此前使用原 282 行冻结行情的正式回测及含费用、滑点受控叠加证据沿用[原验收记录](2026-11-15-backtest-investment-budget.md)，本轮没有再创建持久化回测。上述实验验证证明分段调用与真实冻结引擎的约束，不作为新一次真实模型生成、实验数据库或队列端到端验收。

## 关联

[现行投入合同](../../specs/2026-11-15-backtest-investment-budget.md)；[交易计划合同](../../specs/2026-11-15-backtest-trade-plans.md)。
