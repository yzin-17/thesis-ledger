# 统一回测系统与交易系统任务衔接 Review（复核版）

> 日期：2026-08-28  
> 状态：复核完成，Spec/Task 已生成，待实施  
> Review 对象：上一版回测—交易系统衔接 Review、此前确认的回测 V2 12 项任务、当前交易系统实现与任务文档
> 对应 Spec：[`统一回测系统 V2`](../specs/2026-08-28-unified-backtest-v2.md)  
> 对应 Task：[`统一回测系统 V2 实施任务`](../tasks/2026-08-28-unified-backtest-v2.md)

## 1. 复核结论

上一版 Review 的主判断仍然成立：回测必须是独立的模拟事实域，不能写入交易系统的真实账本。但有两处需要纠正：

1. `T0–T14` 是 15 项，不是 14 项；其中新增的通用 `BacktestTradeCycle` 任务并非 V2 必需，反而会提前耦合两个事实域。
2. 当前代码并没有已实现的共享 `MarketRuleSet`。只有 `TradingCalendar` 接口和 CN 实现；HK/US 日历、五类市场规则和通用 Adapter 仍是待实现能力。上一版把它描述成“复用现有规则”过于乐观。

修正后的结论：

- 交易系统主任务和返工任务保持已完成，不重开；
- Strategy Lab V1 的已完成任务保持关闭，不把 V2 需求倒灌进旧任务；
- 回测原 12 项仍可作为骨架，但 T1/T5/T6/T7/T8/T10/T11/T12 需要重写或拆分；
- 新增一个跨域接缝任务、拆分 Exchange/NAV 两项，形成 **14 项回测任务（T0–T13）**；
- V2 只输出独立的 `BacktestTrade`，暂不建设通用 Trade Projection Adapter；
- V2 先使用回测内部的深模块 `ExecutionRules`，共享 `Asset.symbol`、Decimal、Calendar 和事实契约，但不提前制造只有一个消费者的跨域 MarketRuleSet seam；
- BullMQ/`worker_threads` 不作为首版硬门槛，先保留小型 Runner interface 和可验证的进程内实现，性能 Spike 证明需要后再替换 Adapter。

## 2. 当前代码与文档事实

交易系统已经形成独立的真实账户链路：

```text
专用成交/修正命令
        ↓
不可变 LedgerEventV2
        ↓
Position / Trade / Cash / FX Conversion View
        ↓
Portfolio / Journal / AI Review
```

关键事实：

- `packages/domain/src/ledger-v2.ts` 已固定 `DecimalString`、LedgerEventV2、修正动作和类型化载荷；
- `packages/domain/src/trade-projection.ts` 直接接收 LedgerEventV2，只表达 `actual/shadow` 账户模式；
- `packages/domain/src/trade-costs.ts` 依赖实际账户的成本策略 Revision；
- `packages/domain/src/trading-calendar.ts` 虽声明 `CN/HK/US` 类型，但当前只有 `CnTradingCalendar` 实现，覆盖 2025–2026；
- 当前没有 `MarketRuleSet` 或 `ExecutionRules` 实现，`packages/domain/src/backtest.ts` 仍硬编码 T+1、10% 涨跌停和 lot 规则；
- `apps/server/src/backtest/backtest.service.ts` 的 `localWorker` 在进程内调用引擎，直接接收 bars 和 `initialCash: number`，没有 BullMQ 或 `worker_threads` 回测实现；
- `packages/domain/src/backtest-engine.ts`、`backtest.ts`、`backtest-analytics.ts` 仍以 JavaScript `number` 为主；
- `packages/schemas/src/strategy.ts` 仍是 `strategySchemaV1`；
- `docs/tasks/2026-08-25-strategy-lab-workbench.md` 的 V1 T1–T8 已完成；
- 交易系统 T1–T17 及返工任务已完成并有本地证据；
- 此前统一回测 V2 的正式 Spec/Task 已按本复核版创建，当前 SSOT 为对应 Spec/Task；上一版 12 项仅作为重排前的历史基线。

## 3. 不可违反的事实域接缝

```text
真实账户域
User Command → LedgerEventV2 → Core Projection → Portfolio / Journal

回测模拟域
DSA → DataSnapshot → Simulation Event Engine → SimulationLedger → BacktestResult

可共享的基础契约
Asset.symbol
Decimal / Money
TradingCalendar interface
Instrument facts
FX fact contract
时间可用性与纯计算规则
```

必须禁止：

1. 回测成交写入 `LedgerEventV2`；
2. 用交易系统的 `shadow` 账户承载回测；
3. 回测结果进入真实 Portfolio Trade 或 Journal Candidate；
4. 用 `CASH_FLOW` 伪造回测初始资金；
5. 用账户 `Projection Generation` 替代回测 `DataSnapshot`；
6. 用真实 FX Conversion View 直接计算没有 LedgerEvent 的回测现金流；
7. 为了“复用”而给 `TradeProjection` 增加 `backtest` 账户模式。

### 共享与不共享的判定

当前只有真实账户投影一个消费者的算法，不应立即抽象成跨域接口。按照深模块原则：

- 可以共享：`DecimalValue`、`Money`、`Asset.symbol`、时间/日历基础类型和数据事实格式；
- V2 内部实现：`ExecutionRules`、`SimulationLedger`、`BacktestTrade`、回测估值 FX Adapter；
- 暂不共享：LedgerEvent 持久化、AccountLedgerState、Projection Generation、TradeProjection 表、Journal 写入、实际账户成本策略 Revision；
- 若以后确实出现第二个交易事实消费者，再单独抽取纯 `TradeCostAllocator` seam，不把本次 V2 变成通用投影重构。

## 4. 原 12 项任务适用性

| 原任务                           | 结论             | 复核后的处理                                                                                                                   |
| -------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| T1 Contract、Typed AST、Fixtures | 保留并重写       | 加入 Backtest source、SimulationEvent、DecimalString、`Asset.symbol` 和“禁止写 Ledger”契约；不要加入 `backtest` account mode。 |
| T2 数据能力与周期聚合            | 保留             | 仍需实现 HK/US 数据/日历 capability；不能假设当前 `TradingCalendar` 已覆盖三市场。                                             |
| T3 Snapshot/Artifact             | 保留             | DataSnapshot 与账户 Projection Generation、FX Evidence Version 分离；Server 管理本地 Artifact。                                |
| T4 Series/Indicator/时间         | 保留             | 复用基础 Decimal/时间事实；指标只服务模拟运行。                                                                                |
| T5 确定性事件内核                | 保留并重写       | 输出 SimulationEvent/SimulationFill，禁止写入真实 LedgerEventV2。                                                              |
| T6 封闭资本多币种 Ledger         | 不可原样保留     | 改为 SimulationLedger；复用数值和事实格式，不复制真实账户投影。                                                                |
| T7 MarketRuleSet/InstrumentFacts | 保留但改为新实现 | 先建设回测内部深模块 `ExecutionRules`，使用共享事实输入；当前没有可直接复用的 MarketRuleSet。                                  |
| T8 Exchange 与 CN NAV            | 必须拆分         | Exchange Market 和 CN NAV 是两个独立模拟生命周期，均不调用真实成交命令。                                                       |
| T9 仓位、风险、公司行动          | 保留但重写       | 只实现回测 sizing/risk/corporate action，不创建真实账户事件。                                                                  |
| T10 Benchmark/Analytics          | 保留并隔离       | 只消费 BacktestResult/BacktestTrade；不要求通用 TradeCycleProjector。                                                          |
| T11 Runtime/Desktop              | 保留并扩大       | Server 构建 Snapshot，Desktop 不上传 bars；Runner interface 先用进程内 Adapter。                                               |
| T12 集成/迁移/性能/文档          | 保留并扩展       | 增加 Ledger 不变、Projection Generation 不变、Journal 不过期和 source 隔离门禁。                                               |

## 5. 复核后的 14 项任务

| 任务 | 主题                             | 主要结果                                                                               |
| ---- | -------------------------------- | -------------------------------------------------------------------------------------- |
| T0   | 交易系统—回测接缝                | 冻结事实域、共享契约、禁止复用和 `source=BACKTEST`；默认不进入真实 Portfolio/Journal。 |
| T1   | StrategySchemaV2 与 Contract     | 多 Signal Source、唯一 Execution Instrument、DecimalString、Run/Result/Error。         |
| T2   | DSA 数据与周期聚合               | Stock/ETF `1m/1d`、CN NAV 日频、HK/US capability、Server 派生分钟周期。                |
| T3   | DataSnapshot 与 Artifact         | 每 Run 独占 Snapshot、Manifest/哈希、本地 Parquet/Zstd、Worker URI 读取。              |
| T4   | Series/Indicator/时间            | raw/adjusted、warmup、跨周期和 `occurredAt/availableAt`。                              |
| T5   | Simulation Event Engine          | 固定 phase、SimulationEvent、未来函数防护、事件幂等。                                  |
| T6   | SimulationLedger                 | 封闭初始资金、分币种现金、结算和估值，不写真实 Ledger。                                |
| T7   | 回测内部 ExecutionRules          | Calendar、Instrument Facts、TradingEligibility、Order/Price/Settlement 规则。          |
| T8   | Exchange Market Simulation       | CN/HK/US Stock/ETF 的 Market DAY 全成或拒绝。                                          |
| T9   | CN NAV Simulation                | 仅 CN NAV、日频、cutoff/NAV/确认/份额/现金结算。                                       |
| T10  | 模拟仓位、风险与公司行动         | 四种 sizing、Fixed Stop/Take、Max Holding、dividend/split。                            |
| T11  | Benchmark 与基础分析             | 模拟权益、最小 BacktestTrade、单 Benchmark、基础指标和 unavailable。                   |
| T12  | Runtime、持久化与 Desktop        | StrategyVersion + RunConfig 建 Run；Snapshot 驱动；不上传 bars；模拟来源隔离展示。     |
| T13  | 集成、隔离门禁、迁移、性能与文档 | 跨仓契约、无 Ledger 写入证明、独立迁移、性能 Spike、故障恢复和最终 Review。            |

依赖顺序：

```text
T0 → T1 → T2 → T3
          ├→ T4 → T5 → T6
          └→ T7 → T8 / T9
T6 + T8/T9 → T10 → T11 → T12 → T13
```

说明：T7 是回测域的新实现，不是把当前 CN 日历或交易系统投影包装成 Adapter；T11 直接输出最小 `BacktestTrade`，不增加单独的 Trade Projection 重构任务。

## 6. 必须先修正的接口

| 当前接口/模块                     | 现状问题                                 | V2 方向                                                                                  |
| --------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `strategySchemaV1`                | V1 universe、number、risk 和多种成交时点 | 新增独立 StrategySchemaV2，发布/运行均走 V2。                                            |
| `BacktestService.queue`           | 接收并持久化 bars                        | 只接收 StrategyVersion、RunConfig 和幂等键，Server 构建 Snapshot。                       |
| `BacktestWorker.run`              | 接收 bars 和 `number` 初始资金           | 接收 SnapshotRef/ArtifactRef；金额和费用使用 Decimal/Money。                             |
| `simulateAStockExecution`         | 硬编码 CN 规则                           | 由回测内部 `ExecutionRules` 取代；规则输入来自 capability/facts。                        |
| `LedgerEventV2`                   | 真实账户唯一事实源                       | 保持不变；回测使用 SimulationEvent/SimulationFill。                                      |
| `trade-projection.ts`             | 仅 actual/shadow LedgerEvent             | 不加入 backtest 模式；V2 保持最小 BacktestTrade。                                        |
| `trade-costs.ts`                  | 依赖账户成本策略 Revision                | 回测按 StrategyVersion cost 使用独立 Decimal 成本计算。                                  |
| `fx-conversion.ts`                | 依赖真实 LedgerEvent                     | 抽出 FX fact/valuation 输入契约；回测使用独立估值 Adapter。                              |
| `apps/server/src/backtest` Runner | 当前进程内 localWorker                   | 先保留小型 Runner interface；BullMQ/`worker_threads` 由性能 Spike 决定是否进入后续任务。 |

## 7. 规划预检

### Spec/Task 覆盖

当前工作树已包含统一回测 V2 的正式 Spec/Task；现有 Strategy Lab V1 与交易系统任务保持独立，不能代替新的 V2 planning unit。

### 占位与未定义契约

本复核未发现要求实现者自行猜测的占位描述；`SimulationEvent`、`SimulationLedger`、`BacktestTrade`、SnapshotRef 和 source 隔离字段已在 V2 Spec/Task 中定义。

### 依赖检查

- Decimal/Money、`Asset.symbol` 和实际账户 LedgerEventV2 是可复用的基础契约，但真实账户 Projection 不是回测前置依赖；
- T2 必须先证明 HK/US capability 和日历事实，再允许 T7/T8 使用；
- T3 必须早于 Snapshot 驱动的 T12；
- T7 规则实现与 T4/T5 可并行准备，但 T8/T9 集成前必须完成；
- T13 负责跨仓与发布级门禁，不把交易系统的 Trade Projection Cutover 当作回测迁移步骤。

### 非阻塞默认假设

回测结果默认不进入 Portfolio 的真实 Trade 列表或 Journal。该假设与交易系统“LedgerEvent 为唯一经济事实源、actual/shadow 账户隔离”的现有设计一致；若未来要统一展示，应另立模拟结果读取模型 Spec。

### 规划结论

**Ready with non-blocking assumptions。**

规划文档已通过 AC 覆盖、占位、依赖、跨任务契约、相对链接和格式预检。Provider 的 HK/US 可用性、性能门禁数字和 V1 存量盘点仍需在实施/切换前形成证据，但不改变既定 V2 契约，也不要求交易系统任务返工。

## 8. 后续动作

1. 已以本复核版为基线创建稳定任务标识的统一回测 V2 Spec 和 Task；
2. Spec 已写入模拟/真实事实域隔离、共享基础契约和不共享清单；
3. Task 已按 T0–T13 拆分 14 项任务，未加入通用 TradeCycleProjector；
4. 将当前 `TradingCalendar` 的 CN-only 实现和缺失 HK/US capability 作为明确前置工作；
5. 已完成 Spec coverage、placeholder、dependency 和 cross-task consistency preflight；
6. 交易系统已完成任务和 Strategy Lab V1 已完成任务保持关闭；V2 Spec/Task 已评审，满足前置证据后可从 T0 开始实施。
