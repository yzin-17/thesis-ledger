# 统一回测系统与交易系统任务衔接 Review

> 日期：2026-08-28  
> 状态：已被复核版取代  
> Review 对象：此前确认的统一回测 V2 12 项任务、当前交易与成交记录系统及已落地代码

> 最新结论见 [`统一回测系统与交易系统任务衔接 Review（复核版）`](2026-08-28-unified-backtest-trade-integration-review-v2.md)。

## 1. 当前事实

交易系统已经形成独立的事实源和投影链：

```text
专用成交/修正命令
        ↓
不可变 LedgerEventV2
        ↓
Position / Trade / Cash / FX Conversion View
        ↓
Portfolio / Journal / AI Review
```

相关权威文档和实现为：

- [`交易与成交记录系统`](../specs/2026-08-26-trade-execution-ledger-system.md)；
- [`交易与成交记录系统实施任务`](../tasks/2026-08-26-trade-execution-ledger-system.md)；
- [`交易系统返工任务`](../tasks/2026-08-26-trade-execution-ledger-system-follow-up.md)；
- `packages/domain/src/ledger-v2.ts`、`trade-projection.ts`、`trade-costs.ts`；
- `docs/operations/2026-08-28-trade-projection-cutover.md`。

回测当前仍是另一条链：

```text
Desktop 上传 bars + number 初始资金
        ↓
BacktestService
        ↓
backtest-engine / backtest.ts / backtest-analytics
        ↓
BacktestResult
```

具体证据：

- `apps/server/src/backtest/backtest.service.ts` 接收并持久化 `bars`、`initialCash: number`；
- `packages/domain/src/backtest-engine.ts`、`backtest.ts` 和 `backtest-analytics.ts` 使用 JavaScript `number`；
- `packages/schemas/src/strategy.ts` 仍为 `strategySchemaV1`，含多 `universe.symbols`、`risk` sizing 和 `open/close/nextOpen`；
- `trade-projection.ts` 直接接收 `LedgerEventV2`，只表达 `actual/shadow` 账户模式；
- `trade-costs.ts` 依赖实际账户的成本策略 Revision，不等同于策略回测的 cost 配置；
- 当前工作树没有此前的 `2026-08-25-unified-backtest-system-v2` Spec/Task 文件；可见的是已完成的 Strategy Lab V1 任务和交易系统任务。

## 2. 不可违反的系统接缝

回测和交易系统应保持两个事实域：

```text
真实账户域
User Command → LedgerEventV2 → Core Projection → Portfolio / Journal

回测模拟域
DSA → DataSnapshot → Simulation Event Engine → Simulation Ledger → BacktestResult

共享深模块
Decimal / Money
Asset.symbol
TradingCalendar
InstrumentFacts / MarketRuleSet
FX fact contract
纯时间语义与成本分配规则
```

必须禁止：

1. 回测成交写入真实账户 `LedgerEventV2`。
2. 用交易系统的 `shadow` 账户模式承载回测；`shadow` 仍然是账户事实。
3. 回测结果进入 Portfolio 的真实 Trade 列表或 Journal Candidate。
4. 用 `CASH_FLOW` 伪造回测初始资金入账。
5. 用账户 `Projection Generation` 替代回测 `DataSnapshot`。
6. 用真实账户的 FX Conversion View 直接计算没有 LedgerEvent 的回测现金流。
7. 将模拟事件伪装成 LedgerEventV2 后复用真实账户物化投影。

推荐的深模块接缝：

```text
SimulationLedger
  接收 SimulationFill / SimulationSettlement
  返回模拟余额、仓位和交易结果
  不写入 LedgerEventV2

TradeCycleProjector
  ActualLedgerAdapter → LedgerEventV2
  BacktestFillAdapter → SimulationFill
```

纯 Trade Cycle/Cost 算法可以共享；实际账户持久化、账户模式、Projection Generation 和 Journal 写入路径不能共享。

## 3. 原 12 项回测任务适用性

| 原任务                           | 结论             | 调整方向                                                                                                           |
| -------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| T1 Contract、Typed AST、Fixtures | 保留并重写       | 增加 `REAL_LEDGER/BACKTEST` 来源、SimulationEvent、DecimalString、Asset.symbol；不使用第二套 instrument identity。 |
| T2 数据能力与周期聚合            | 保留             | 共用 Calendar、InstrumentFacts、FX/公司行动事实；DSA 不拥有 Snapshot。                                             |
| T3 Snapshot/Artifact             | 保留并改名       | 明确 DataSnapshot 与 Projection Generation、FX Evidence Version 的生命周期不同。                                   |
| T4 Series/Indicator/时间         | 保留             | 复用 Decimal 与时间语义；Indicator 不得修改真实 Trade。                                                            |
| T5 确定性事件内核                | 保留并重写       | 输出 SimulationEvent/SimulationFill，禁止写入 LedgerEventV2。                                                      |
| T6 封闭资本多币种 Ledger         | **不可原样保留** | 改为 SimulationLedger；复用 Decimal、settlement 和 FX fact，不复制 LedgerEvent/CashProjection/AccountLedgerState。 |
| T7 MarketRuleSet/InstrumentFacts | 保留并收敛       | 复用现有 TradingCalendar 和规则；删除 `simulateAStockExecution` 的硬编码市场规则。                                 |
| T8 Exchange 与 CN NAV            | **必须拆分**     | Exchange Market 模拟和 CN NAV 模拟分别实现，均不得调用真实成交命令。                                               |
| T9 仓位、风险、公司行动          | 保留但重写       | 属于模拟域；公司行动和纯成本规则可复用，不创建真实账户事件。                                                       |
| T10 Benchmark/Analytics          | 保留并隔离来源   | 只消费 BacktestResult/SimulationTrade，不与实际 Trade/Journal 统计混算。                                           |
| T11 Runtime/Desktop              | 保留并扩大       | Server 按 StrategyVersion + RunConfig 构建 Snapshot；Desktop 不上传 bars，UI 标明模拟来源。                        |
| T12 集成/迁移/性能/文档          | 保留并扩展       | 增加无 Ledger 写入、无 Projection Generation 变化、无 Journal 过期门禁；不复用 Trade Projection Cutover。          |

结论：原任务中 T2/T4 基本适用；T3/T7/T10/T11/T12 需接口修改；T1/T5/T6/T8/T9 必须重写或拆分，不能直接开工。

## 4. 交易系统任务如何处理

当前交易系统任务及返工任务均已完成并有本地证据，不应重新打开：

- 交易系统 T2 的 DecimalString、Money、LedgerEventV2 可作为回测公共契约；
- Trade Projection、成本分配和 FX View 只通过纯算法或事实接口复用，不能复用实际账户写入入口；
- 交易系统的 actual/shadow、Projection Generation、ImportDraft、Portfolio Trade 和 Journal 是账户域概念，不扩展成 backtest 模式；
- Trade Projection 影子切换手册只适用于真实账本读取切换，不适用于回测 Snapshot 或引擎迁移；
- 已完成的 Strategy Lab V1 T1–T8 也不重开；它的 `strategySchemaV1`、单标的表单和日线 bars 流程是 V1 基线，不是 V2 契约。

## 5. 推荐的新任务排序

原 12 项建议调整为 14 项：新增 T0 接缝任务，拆分 T8，新增 BacktestTradeCycle 接缝任务。

| 新任务 | 主题                          | 主要结果                                                                          |
| ------ | ----------------------------- | --------------------------------------------------------------------------------- |
| T0     | 交易系统—回测接缝             | 冻结事实域、共享模块、禁止复用和结果 source；默认回测不进入 Portfolio/Journal。   |
| T1     | StrategySchemaV2 与 Contract  | 多 Signal Source、唯一 Execution Instrument、DecimalString、Run/Result/错误契约。 |
| T2     | DSA 与周期聚合                | `1m/1d` 基础数据、CN NAV 日频、Server 派生分钟周期和 capability。                 |
| T3     | DataSnapshot 与 Artifact      | 每 Run 独占 Snapshot、Manifest/哈希、本地 Parquet/Zstd、Worker URI 读取。         |
| T4     | Series/Indicator/时间         | raw/adjusted、warmup、跨周期、`occurredAt/availableAt`。                          |
| T5     | Simulation Event Engine       | 确定性 phase、SimulationEvent、未来函数防护和幂等。                               |
| T6     | SimulationLedger              | 封闭初始资金、分币种现金、结算和估值；不写真实 Ledger。                           |
| T7     | 共享市场规则适配器            | MarketRuleSet、InstrumentFacts、Calendar 版本化。                                 |
| T8     | Exchange Market Simulation    | CN/HK/US Stock/ETF 的 Market DAY 全成或拒绝。                                     |
| T9     | CN NAV Simulation             | 仅 CN NAV、日频、cutoff/NAV/确认/份额/现金结算。                                  |
| T10    | BacktestTradeCycle 与成本接缝 | SimulationFill → Trade Cycle/Close Slice；不进入真实 Trade 表。                   |
| T11    | 模拟仓位、风险与公司行动      | 四种 sizing、Fixed Stop/Take、Max Holding、dividend/split。                       |
| T12    | Benchmark 与基础分析          | 模拟权益、单 Benchmark、基础指标、不可用状态。                                    |
| T13    | Runtime、持久化与 Desktop     | StrategyVersion + RunConfig 建 Run；不上传 bars；模拟结果隔离展示。               |
| T14    | 跨仓、隔离门禁、迁移与性能    | 核验无 Ledger 写入/无 Generation 变化/无 Journal 过期，独立迁移与性能门禁。       |

依赖顺序：

```text
T0 → T1 → T2 → T3
          ├→ T4 → T5 → T6
          └→ T7 → T8 / T9
T5 + T6 + T8/T9 → T10 → T11 → T12 → T13 → T14
```

## 6. 必须先改的接口

| 当前模块                  | 当前问题                                 | 调整方向                                                    |
| ------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| `strategySchemaV1`        | 仍是 V1 多 universe、number 和 risk 配置 | 新增独立 StrategySchemaV2。                                 |
| `BacktestService.queue`   | 接收并持久化 bars                        | 只接受 StrategyVersion、RunConfig、幂等键。                 |
| `BacktestWorker.run`      | 接收 bars、number 初始资金               | 接收 SnapshotRef/ArtifactRef，金额使用 Decimal/Money。      |
| `simulateAStockExecution` | 硬编码 A 股规则                          | 改为 MarketRuleSet Adapter。                                |
| `LedgerEventV2`           | 真实账户唯一事实源                       | 保持不变，回测使用 SimulationEvent/SimulationFill。         |
| `trade-projection.ts`     | 只接受 actual/shadow LedgerEvent         | 不添加 backtest 模式，通过 BacktestFillAdapter 复用纯算法。 |
| `trade-costs.ts`          | 依赖账户成本策略 Revision                | 回测使用 StrategyVersion cost 的独立适配器。                |
| `fx-conversion.ts`        | 依赖真实 LedgerEvent                     | 抽出 FX fact/valuation 接口，回测使用独立实现。             |

## 7. Review 前置检查与结论

### Spec/Task 覆盖

此前的统一回测 V2 Spec/Task 当前不在工作树，因此本 Review 无法直接执行文件级 AC 映射；本结论基于此前确认的 12 项基线、当前交易系统文档和代码事实。

### Blocking Question

回测结果是否允许进入 Portfolio 的真实 Trade 列表或 Journal？

推荐默认：**不允许**。回测结果只在 BacktestRun/BacktestResult 内可见；未来如需统一展示，另立“模拟结果读取模型”规格。

### 规划结论

**Blocked before implementation。**

阻塞原因是回测 Spec/Task 尚未记录与已完成交易系统之间的事实源、类型、投影和查询隔离，而不是交易系统能力不足。确认默认边界并恢复/创建新的回测 Spec 与 Task 后，才能开始 T0/T1。

## 8. 后续动作

1. 确认回测与真实 Trade/Journal 的隔离默认值；
2. 在回测 Spec 增加共享契约、SimulationLedger 和隔离门禁；
3. 将原 12 项任务重排为 T0–T14；
4. 对新 Spec/Task 执行 Spec coverage、placeholder、dependency、cross-task consistency preflight；
5. 交易系统已完成任务保持关闭，只接受明确的跨系统契约变更。
