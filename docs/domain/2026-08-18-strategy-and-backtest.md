# 策略与回测领域边界

## 当前事实

策略使用 `Strategy` 和不可变的 `StrategyVersion` 保存；修改策略创建新版本，历史回测结果继续引用原版本，不被后续编辑覆盖。当前已落地的回测能力仍以 V1 策略 Schema、进程内引擎和既有 Strategy Lab 为主；统一回测 V2 已完成 Spec/Task 评审，但仍处于实施阶段，不能把 V2 目标描述成已经上线的能力。

当前 V1 回测主要覆盖 A 股日线执行语义，包括 T+1、涨跌停、停牌、最小交易单位、手续费、印花税、滑点、公司行动、PIT、数据完整度、基准和样本切分。当前实现仍有 `number` 数值、任务直接携带 bars、CN-only 日历等历史边界，后续由 V2 逐步替换。

## 真实账户域与回测模拟域

真实账户和回测必须保持两个事实域：

```text
真实账户域
专用成交命令 → LedgerEventV2 → Position / Trade / Cash Projection → Portfolio / Journal

回测模拟域
DSA → DataSnapshot → Simulation Event Engine → SimulationLedger → BacktestResult
```

回测成交不得写入真实 `LedgerEventV2`，不得使用 `actual/shadow` 账户承载模拟，不得改变账户 `Ledger Revision` / `Projection Generation`，也不得把回测结果写入真实 Portfolio Trade、Journal Candidate 或 AI Review。

两个事实域只共享稳定基础契约和纯计算规则，例如：

- `Asset.symbol`；
- Decimal / Money；
- `TradingCalendar` interface；
- Instrument Facts、FX fact contract；
- 时间可用性、聚合和不依赖账户持久化的纯计算规则。

不要为了复用而让 Simulation Event 伪装成 LedgerEvent，也不要提前建设只有单一消费者的通用 MarketRuleSet/Trade Projection Adapter。

## 统一回测 V2 目标

当前 V2 规格的目标范围为：

- 中国内地、香港、美国 Stock / ETF；中国内地 NAV Fund；
- 场内 `1d/60m/30m/15m/5m/1m`，CN NAV Fund 日频；
- Typed AST、Series/Indicator、统一 `occurredAt/availableAt` 和未来函数防护；
- `Signal → TargetIntent → Order → Fill → Position` 的确定性模拟链；
- 场内 Market + DAY 全成或拒绝，场外 NAV Fund 独立申购/赎回确认与结算模拟；
- Server 创建独占 DataSnapshot，并使用本地 Artifact 保存冻结输入；
- 分币种封闭现金、原币持仓和只读 FX 估值；
- 输出独立 `BacktestResult` / `BacktestTrade`，支持可复现重放。

V2 不支持 Limit Order、Partial Fill、GTC、做空、融资、衍生品、组合优化、复杂 FX routing、Parameter Sweep 或通用 Trade Projection Adapter。完整当前范围以 [`../specs/2026-08-28-unified-backtest-v2.md`](../specs/2026-08-28-unified-backtest-v2.md) 为准。

## 数据完整度与可复现性

任何回测都必须明确数据来源、数据时点、完整度和限制。决策时只使用当时已经可用的数据；缺失历史成分、公司行动、分钟数据或 Provider 能力时必须保留 warning/unavailable，不得静默缩小 universe 或用当前数据补历史事实。

可复现结果至少固定 StrategyVersion、RunConfig、DataSnapshot、规则/聚合版本、引擎版本和结果 checksum。当前 V1 的历史结果按原契约保留；V2 不通过长期双写或隐式 V1→V2 转换制造第二套兼容真源。
