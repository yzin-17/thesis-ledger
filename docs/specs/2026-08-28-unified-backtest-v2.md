# 统一回测系统 V2 Spec

> 任务标识：`2026-08-28-unified-backtest-v2`  
> 日期：2026-08-28  
> 状态：已评审，待实施  
> 范围基线：[`统一回测系统与交易系统任务衔接 Review（复核版）`](../reviews/2026-08-28-unified-backtest-trade-integration-review-v2.md)  
> 对应任务：[`统一回测系统 V2 实施任务`](../tasks/2026-08-28-unified-backtest-v2.md)

## 背景与问题

当前回测能力仍以 V1 策略 Schema、单标的日线 Bar 和进程内引擎为主。回测任务可以直接携带 bars 和数值型初始资金，Server 尚未以冻结数据快照作为运行输入；市场规则主要集中在 A 股模拟函数中，跨市场、跨时区和跨周期语义不完整。

当前仓库已经落地另一套交易与成交记录系统。它以不可变 `LedgerEventV2` 为真实账户唯一经济事实源，并重建 `Position`、`Trade`、`Cash` 和 `FX Conversion View`，同时支持实际账户与影子账户、账户级 `Projection Generation`、修正链和 Journal 事实引用。

这两套系统解决的是不同问题：

- 交易系统记录和重建用户真实账户事实；
- 回测系统在冻结市场数据上模拟策略、订单、成交、现金和权益。

如果回测直接复用真实账户 Ledger、`shadow` 账户、Trade Projection 或 Journal 写入路径，会把模拟结果伪装成账户事实，造成资产余额、投影世代、复盘快照和统计口径污染。相反，如果回测完全另起一套数值、资产身份、日历和费用语义，又会产生第二套难以验证的基础规则。

本 Spec 定义一个独立的回测模拟事实域：共享稳定的基础契约和纯计算规则，但不共享真实账户事实、持久化投影或用户复盘写入路径。

## 目标

- 支持中国内地、香港、美国的 Stock 和 ETF；支持中国内地 NAV Fund；不支持香港或美国 NAV Fund。
- Stock/ETF 支持 `1d/60m/30m/15m/5m/1m`；CN NAV Fund 只支持日频。
- 允许多个 Signal Source，但每个 StrategyVersion 只允许一个 Execution Instrument。
- 使用 Typed AST、Series、Indicator 和统一 `occurredAt/availableAt` 语义，默认防止未来函数。
- 建立确定性的 Simulation Event Engine，固定 `Signal → TargetIntent → Order → Fill → Position` 链路。
- 场内只模拟 `Market + DAY` 全成或拒绝；场外只模拟中国内地 NAV Fund 的日频申购、赎回和确认/结算生命周期。
- 使用回测内部的深模块 `ExecutionRules` 表达市场执行规则；共享 `Asset.symbol`、Decimal/Money、TradingCalendar、Instrument Facts 和 FX 事实契约，但不把当前 CN-only 日历误认为三市场规则已经完成。
- 使用封闭初始资金、分币种现金、原币持仓和只读 FX 估值；不模拟自动换汇、外部入金或外部出金。
- 由 thesis-ledger Server 为每个 BacktestRun 创建独占 DataSnapshot，并使用本地持久卷上的 `Parquet + Zstd` Artifact；不把 MinIO/S3 或通用 Artifact 平台作为 V2 依赖。
- 输出独立的 `BacktestResult` 和最小 `BacktestTrade`，不将结果写入真实 `LedgerEventV2`、Portfolio Trade 或 Journal。
- 提供基础 Benchmark、收益、风险和交易分析，保留明确的不可用、完整度和警告状态。
- 通过 StrategyVersion、RunConfig、Snapshot、规则/聚合版本、引擎版本和结果校验和支持可复现重放。

## 非目标

### 真实交易与账户事实

- 不写入、更新或删除真实账户 `LedgerEventV2`。
- 不使用交易系统 `actual/shadow` 账户承载回测。
- 不改变账户级 `Ledger Revision` 或 `Projection Generation`。
- 不向 Portfolio 的真实 Trade 列表、Cash 视图、Journal Candidate 或 AI Review 写入回测结果。
- 不生成券商订单、撤单、真实成交或自动交易指令。

### 市场、资产和成交

- 不支持香港或美国 NAV Fund。
- 不支持 Derivative、Margin、Short Selling、杠杆融资、组合再平衡或组合优化。
- 不支持 Limit Order、Partial Fill、GTC、Tick、Level-2、Order Book、Iceberg、TWAP、VWAP Algorithm 或复杂成交量冲击模型。
- 不建设通用 MarketRuleSet 平台；V2 只建设回测所需的 `ExecutionRules` 深模块，未来有第二个真实执行消费者时再评估抽取共享 seam。

### 资金、外汇和绩效

- 回测开始后不支持外部资金注入或提取。
- 不支持 `autoFx`、FX Order、FX Spread、FX Routing 或复杂 FX Settlement。
- 不建设完整 TWR、XIRR、现金流归因或版本化 Risk-free Rate 平台。
- 不直接复用依赖真实 LedgerEvent 的 FX Conversion View 计算回测现金流。

### 策略研究和界面

- 不支持 Risk Based sizing、Trailing Stop、ATR Stop、组合风险预算、CVaR 或 Risk Parity。
- 不支持 Parameter Sweep、Grid/Random Search、Walk-forward、训练/验证/测试切分或 AI Strategy Assistant。
- 不建设通用 Trade Projection Adapter 或回测与真实 Trade 的统一持久化表；V2 结果使用最小 `BacktestTrade`。
- 不提供 Server 草稿自动保存、草稿协同、版本 Diff 或完整三栏 Builder 发布门禁。

## 现状与约束

### 现有回测能力

- 当前策略契约为 `strategySchemaV1`，使用 `universe.symbols`、`entrySignals/exitSignals`、`risk` sizing 和 `open/close/nextOpen` 执行时点。
- 当前领域引擎使用 `BacktestBar`、`BacktestStrategy`、`BacktestTrade` 和 `BacktestResult`，金额、数量、价格和指标主要使用 JavaScript `number`。
- 当前 Server 回测任务把 bars 和 `initialCash` 作为 Job input 保存，进程内 Worker 直接调用引擎；没有 Snapshot 驱动的输入边界。
- 当前 Strategy Lab V1 已完成创建策略、创建版本、回测配置、任务列表和结果展示；这些任务不重开，V2 以新 Schema 和新运行契约承接。

### 现有交易系统能力

- `LedgerEventV2` 是真实账户唯一经济事实源，金额、数量、价格、费用和 Revision 使用十进制字符串或十进制领域值。
- 真实账户投影包含 Position、Trade、Cash、待结算明细和独立 FX Conversion View；Trade Projection 只表达 `actual/shadow` 账户模式。
- 真实交易 Spec 明确不包含订单、撤单、待确认 NAV 申请等真实执行生命周期；回测的 Exchange/NAV 模拟必须保持独立。
- 当前 `TradingCalendar` 只实现 CN 日历；HK/US 日历、交易 Session、市场规则和 Instrument Facts 的完整覆盖仍是 V2 工作内容，不能假设已存在。

### 跨仓和工程约束

- DSA 负责 Bar、NAV、FX、公司行动、Trading Calendar、Instrument Facts 和 Provider capability；不负责回测 Snapshot 或 Artifact 生命周期。
- thesis-ledger Server 负责 StrategyVersion、Run、Snapshot、Artifact、Simulation Runtime、Result 和复现元数据。
- Desktop 负责策略配置、运行控制和结果展示，不准备或上传完整 bars。
- `Asset.symbol` 是当前账本和资产关系的稳定业务键；Instrument 只负责搜索和身份确认，V2 不引入第二套账本资产身份。
- Desktop 请求和轮询继续使用 TanStack Query；界面沿用现有 shadcn/Base UI 和原子类。
- V2 Schema/Task 不通过兼容 re-export、长期双写或隐式 V1→V2 转换器完成迁移。

## 设计方案

### 1. 事实域与模块接缝

真实账户域和回测模拟域必须保持以下关系：

```text
真实账户域
专用成交命令 → LedgerEventV2 → Core Projection → Portfolio / Journal

回测模拟域
DSA → DataSnapshot → Simulation Event Engine → SimulationLedger → BacktestResult

共享基础契约
Asset.symbol
Decimal / Money
TradingCalendar interface
Instrument Facts
FX fact contract
时间可用性和纯计算规则
```

回测模拟域使用 `source=BACKTEST` 的结果元数据，但不把 source 字段加入真实 `LedgerEventV2` 联合，也不把回测注册为 `actual/shadow` 账户模式。

可共享的接口包括：

- `Asset.symbol` 及其市场/资产类型确认；
- Decimal/Money 的精度和十进制字符串边界；
- TradingCalendar 的时间和交易日接口；
- Instrument Facts、FX Rate 和公司行动事实格式；
- 不包含持久化副作用的时间、成本和聚合纯函数。

V2 不共享：

- `LedgerEventV2` 持久化、账户锁、Ledger Revision 和 AccountLedgerState；
- 真实 Position/Trade/Cash 物化表与 Projection Generation；
- 真实 FX Conversion View、TradePlan、Journal Candidate 和 AI Review Snapshot；
- 真实账户成本策略 Revision。

### 2. 市场、资产和周期支持矩阵

| 市场 | Stock | ETF | NAV Fund |
| --- | --- | --- | --- |
| 中国内地（CN） | 支持 | 支持 | 支持（日频） |
| 香港（HK） | 支持 | 支持 | 不支持 |
| 美国（US） | 支持 | 支持 | 不支持 |

Stock/ETF 周期：

```text
1d / 60m / 30m / 15m / 5m / 1m
```

数据能力分为：

```text
基础 Bar：1m / 1d，由 DSA 提供
派生 Bar：5m / 15m / 30m / 60m，由 Server 从冻结 1m 派生
NAV：CN NAV Fund 日频事实，不属于 Bar 周期
```

Capability 必须区分：

```text
supported
unavailable
unsupported
base timeframe
derived timeframe
```

任何一层返回 `unavailable` 时，都必须说明 Provider、区间、freshness 或数据质量原因，不得静默缩小 universe、切换周期或改用不同资产。

### 3. StrategySchemaV2 与 RunConfig

核心引用类型：

```ts
type Timeframe = '1d' | '60m' | '30m' | '15m' | '5m' | '1m';

interface Money {
  amount: DecimalString;
  currency: 'CNY' | 'HKD' | 'USD';
}

interface AssetSymbolRef {
  symbol: string;
  market: 'CN' | 'HK' | 'US';
  assetType: 'stock' | 'etf' | 'fund';
}

type SeriesField = 'open' | 'high' | 'low' | 'close' | 'volume' | 'nav';

interface SignalSource {
  id: string;
  asset: AssetSymbolRef;
  timeframe: Timeframe;
  series: SeriesField[];
}

interface SeriesRef {
  sourceId: string;
  field: SeriesField;
}

type SizingRule =
  | { type: 'fixedAmount'; amount: DecimalString }
  | { type: 'percentOfEquity'; percent: DecimalString }
  | { type: 'fixedQuantity'; quantity: DecimalString }
  | { type: 'targetWeight'; weight: DecimalString };

type RiskRule =
  | { type: 'fixedStop'; percent: DecimalString }
  | { type: 'fixedTakeProfit'; percent: DecimalString }
  | { type: 'maxHoldingPeriod'; periods: number };

interface StrategyCostModel {
  commissionRate: DecimalString;
  minimumCommission?: Money;
  slippageRate: DecimalString;
}

type ExecutionConfig =
  | {
      mode: 'exchange';
      orderType: 'market';
      timeInForce: 'DAY';
      timing: 'nextEligibleBarOpen';
    }
  | {
      mode: 'nav';
      requestTypes: Array<'subscribe' | 'redeem'>;
      timing: 'nextAvailableNav';
    };
```

策略版本使用独立的 V2 Schema。概念结构为：

```ts
interface StrategySchemaV2 {
  schemaVersion: '2';
  name: string;
  description?: string;
  signalSources: SignalSource[];
  executionInstrument: AssetSymbolRef;
  primaryTimeframe: Timeframe;
  entry: Expression;
  exit: Expression;
  sizing: SizingRule;
  risk: RiskRule[];
  execution: ExecutionConfig;
  cost: StrategyCostModel;
  benchmark?: AssetSymbolRef;
}
```

约束：

- `signalSources` 可包含多个标的；每个 Source 必须有 StrategyVersion 内唯一且稳定的 `id`，AST 中的 Series 必须通过 `sourceId + field` 显式引用；只有 `executionInstrument` 可以产生 Order、Fill 和 Position。
- `primaryTimeframe` 是策略唯一的 Signal Evaluation Clock，至少一个 Signal Source 必须使用该周期。Exchange 策略以 Execution Instrument 所在市场、该周期的已完成 Bar 作为 evaluation tick；CN NAV 以日频 NAV evaluation event 作为 tick。每个 tick 只消费 `availableAt <= tick` 的最新可用 Source/Indicator 值；其他周期或其他标的没有可用值时返回 unavailable，不向未来取值。
- `entry`、`exit` 使用 false→true edge trigger 生成 Signal，持续为 true 不重复生成；第一次有效 evaluation 视为前值 false，之后只有前一个有效 evaluation 结果为 false、当前为 true 才形成 edge，unavailable 不视为 false。同一 evaluation tick 冲突优先级固定为 `risk > exit > entry`，同一 tick 完成退出后不再处理 entry。
- 标的关系使用已确认的 `Asset.symbol`；Instrument 搜索结果必须在提交前显式确认。
- `executionInstrument` 必须匹配支持矩阵，且 CN NAV Fund 只能使用 `NavExecution` 和 `1d`。
- `execution.mode=exchange` 只能用于 CN/HK/US Stock/ETF；`execution.mode=nav` 只能用于 CN NAV Fund。
- Exchange 只接受 `Market + DAY + nextEligibleBarOpen`；NAV 只接受 `subscribe/redeem + nextAvailableNav`，不接受场内 Order 配置。
- SignalSource 的 Series 必须与资产类型匹配：Stock/ETF 可声明 OHLCV，CN NAV Fund 只可声明 `nav`；CN NAV Fund 的 `primaryTimeframe` 和其 Signal Source 周期只能为 `1d`。
- `sizing` 只支持 Fixed Amount、Percent of Equity、Fixed Quantity、Target Weight。
- `risk` 只支持 Fixed Stop、Fixed Take Profit、Max Holding Period。
- StrategyVersion 发布后不可修改；修改必须创建新版本。未发布草稿只存在于客户端，不进入 Server 可变状态机。

Typed AST 最小集合为：

```text
all / any / not
compare / cross
constant
Series(sourceId, field)
Indicator(name, input, params, output?)
PositionState
```

AST 必须区分 BooleanExpression 与 NumericExpression：`all/any/not/compare/cross` 输出布尔值；`constant/Series/Indicator/PositionState` 按节点定义输出可校验类型。`Series` 只能引用 StrategyVersion 中声明过的 `SignalSource.id + field`；Indicator 的输入必须来自显式 NumericExpression，不允许使用字符串路径或隐式“当前标的”。MA/EMA/RSI/ATR/VWAP/Highest/Lowest 使用单一 `value` 输出；MACD 必须显式选择 `macd/signal/histogram` 输出。`PositionState` 只暴露 `isOpen/quantity/averageCost/holdingPeriods`，不允许读取真实账户状态。

内置 Indicator 为：

```text
MA / EMA / RSI / MACD / ATR / VWAP / Highest / Lowest
```

`ATR` 只能作为表达式输入，不能配置为 ATR Stop。未知节点、未知 Source、未知 Series、未知 Indicator、类型不匹配、非法参数和非目标能力必须在 Schema 校验阶段拒绝。`cross` 使用相邻两个 evaluation tick 的已知值判断穿越；任一输入在当前或前一 tick unavailable 时，本次结果为 unavailable。

RunConfig 概念结构为：

```ts
interface RunConfig {
  startDate: string;
  endDate: string;
  dataAsOf: string;
  baseCurrency: 'CNY' | 'HKD' | 'USD';
  initialCash: Partial<Record<'CNY' | 'HKD' | 'USD', DecimalString>>;
  valuationPolicy: PortfolioValuationPolicy;
}
```

`startDate <= endDate`；初始资金非负，且 Execution Instrument 币种有可用余额；回测开始后不允许外部现金流。`dataAsOf` 表示本次 Snapshot 允许读取的事实知识截止时间：Snapshot Builder 不得纳入 `availableAt > dataAsOf` 的事实；它不是回测结束时间，也不能绕过各事实自己的 `availableAt`。

### 4. 数据、时间和周期聚合

DSA 为 Stock/ETF 提供 `1m/1d` Bar，为 CN NAV Fund 提供日频 NAV，并提供 FX、现金分红、拆股、Trading Calendar、Instrument Facts、Provider/source revision、freshness、quality 和 completeness。

Server 从冻结 `1m` 派生 `5m/15m/30m/60m`：

- 使用标的市场的时区、交易日历和 Session 划分窗口；
- 不跨午休、闭市、盘前盘后边界或交易日拼接；
- `open` 取第一条，`high` 取最大值，`low` 取最小值，`close` 取最后一条，`volume` 求和；
- 缺失分钟、停牌和不完整尾窗采用版本化策略，并写入 Snapshot Manifest；
- 派生 Bar 的 `occurredAt` 为窗口结束，`availableAt` 不早于全部输入的最大 `availableAt`；
- `1d` 直接使用 DSA 日线事实，不从分钟数据重复构建。

所有事实使用：

```text
occurredAt  = 事实发生时间
availableAt = 引擎最早可以消费的时间
```

引擎推进到 `t` 时只能消费 `availableAt <= t` 的事实。Indicator、公司行动、NAV、FX、Benchmark 和派生 Bar 不能提前可用；warmup 不足返回显式 unavailable，不用零值、前值或未来值填充。

Snapshot Builder 必须从 StrategyVersion AST 和 RunConfig 推导数据依赖闭包：`SignalSources + ExecutionInstrument + Benchmark + required FX + CorporateActions + Calendar + InstrumentFacts + derived timeframe base data + warmup data`。Indicator/lookback 所需的 `startDate` 之前数据可以进入 Snapshot 并参与计算，但 Signal、Order、Trade、Equity 和指标结果从 `startDate` 开始输出；依赖闭包或 warmup 无法满足时必须显式 unavailable/failed，不静默缩短窗口。

### 5. DataSnapshot 与 Artifact

每个 BacktestRun 创建一个独占 DataSnapshot：

```text
BacktestRun 1 ── 1 DataSnapshot
```

Snapshot 至少保存：

```text
runId
asOf / dataAsOf
StrategyVersion identity
RunConfig checksum
manifestVersion
aggregationVersion
provider/source revision
calendar/rule/corporate-action versions
dataset dependency closure
instrument/market/assetType/timeframe/date range
warmup/lookback range
occurredAt/availableAt semantics version
quality/completeness/warnings
artifact partition paths and hashes
contentHash
```

生命周期：

- Snapshot Builder 区分 `building` 与 `finalized`；只有 `finalized` Snapshot 才是不可变运行输入。
- 新 Run 不复用旧 Snapshot；
- Snapshot finalize 前失败可以清理 staging Artifact 后在同一 Run 重建；不得把不完整 Snapshot 提交给 Runner；
- Snapshot finalized 后，同一 Run 的 simulation retry 必须复用原 Snapshot，不重新读取在线数据，也不得生成新的 contentHash；
- Run 保留时保留 finalized Snapshot 和 Artifact；删除 Run 时删除其独占 Snapshot、Artifact 和遗留 staging 数据；
- 不实现跨 Run 去重、引用计数、pin 或 grace 状态机；
- Snapshot 构建或 finalized 后哈希校验失败时 Run 失败，不回退到未冻结在线数据。

V2 只实现 Server 管理的本地持久卷 ArtifactStore，最小接口为：

```text
put / open-read / exists / delete
```

Artifact 格式为 `Parquet + Zstd`。Worker 通过 Artifact URI 读取所需列和分区，不由主进程预加载后 clone 全量数据。MinIO/S3 只能作为后续 Adapter，不是 V2 发布依赖。

### 6. Deterministic Simulation Event Engine

事件按绝对时间、固定 phase 和稳定序列键排序。概念 phase 为：

```text
Session / Settlement State
Corporate Action
Data Available
Series / Indicator Update
Risk / Signal Evaluation
TargetIntent
Order Validation
Fill or Reject
NAV Confirmation / Cash Settlement
Portfolio Valuation
Result Emission
```

模拟事件和结果使用独立类型：

```ts
interface SimulationEvent {
  eventId: string;
  runId: string;
  type: string;
  phase: string;
  occurredAt: string;
  availableAt: string;
  payload: Record<string, unknown>;
}

interface SimulationFill {
  fillId: string;
  executionSymbol: string;
  side: 'buy' | 'sell';
  quantity: DecimalString;
  price: DecimalString;
  charges: Money[];
  occurredAt: string;
  reason: 'signal' | 'risk';
}

interface BacktestTrade {
  source: 'BACKTEST';
  executionSymbol: string;
  openedAt: string;
  closedAt: string;
  entryQuantity: DecimalString;
  exitQuantity: DecimalString;
  entryValue: Money;
  exitValue: Money;
  realizedPnl: Money;
  charges: Money[];
  returnRate: DecimalString;
  closeReason: 'signal' | 'risk';
  fillIds: string[];
}
```

实现必须满足：

- Signal 只生成 TargetIntent，不直接修改现金或仓位；Signal Evaluation 只在 `primaryTimeframe` tick 上发生，并遵守 Source 引用、edge trigger 和 `risk > exit > entry` 优先级。
- Order 只针对 Execution Instrument，并经过 capability、交易资格、价格、现金、持仓和结算规则；
- 只有 SimulationFill、NAV confirmation/settlement 和模拟公司行动可以改变 SimulationLedger；
- 拒绝事件保留稳定错误码、规则版本、事件时间和输入事实；
- cancel、retry、并行调度和对象遍历顺序不改变事件序列或结果；
- 回测事件不会转换为或写入 LedgerEventV2。

### 7. SimulationLedger、资金和估值

SimulationLedger 只存在于 BacktestRun：

```text
Portfolio
├── baseCurrency
├── CashBalance[currency]
│   ├── settled
│   └── unsettled
├── Position[executionInstrument]
└── valuation-only FX Rate
```

资金规则：

- 初始资金按 CNY/HKD/USD 配置；
- 下单只能使用 Execution Instrument 币种的已结算现金；
- 卖出、赎回、分红和费用按原币种入账；
- 不把一种币种现金直接用于另一币种交易，不生成 FX Order；
- 定投只是多次消耗已有现金的申购意图，余额不足时 Reject；
- 所有余额变化由不可重复应用的 Simulation Event 产生；
- 初始资金不生成真实账户 `CASH_FLOW`。

FX 只用于 PortfolioValuationPolicy 估值：

- 使用估值时点前 `availableAt <= valuationAt` 的 FX；
- 汇率缺失时保留原币结果，并标记本位币结果 unavailable/partial；
- 保存 FX 时间、来源、source revision、stale 和 completeness；
- 不复用依赖真实 LedgerEvent 的 FX Conversion View。

估值策略固定保存：

```ts
interface PortfolioValuationPolicy {
  baseTimezone: string;
  dailyValuationTime: string;
  pricePolicy: 'latestAvailable';
  fxPolicy: 'latestAvailable';
}
```

组合权益先按原币种计算，再折算到基础币种；价格、FX、Benchmark 和 Equity Curve 使用同一估值策略。

### 8. ExecutionRules 与场内执行

V2 在回测域建设 `ExecutionRules` 深模块，接收共享 TradingCalendar、Instrument Facts、数据 capability 和版本化规则事实，返回：

```text
TradingEligibility
OrderRules
PriceRules
PositionSettlement
CashSettlement
```

具体规则不得只用客户端硬编码的 `tPlusOne` 或 A 股 10% 限制表达。规则至少覆盖：交易日历、时区、Session、停牌、可买卖、lotSize、tickSize、适用价格限制、持仓可卖时间、资金结算时间和标的个体约束。

ExchangeExecution 只支持：

```text
Market
DAY
nextEligibleBarOpen
full fill or reject
```

规则：

- 信号在事实可用后生成 TargetIntent，订单在下一个符合规则的 Bar 开盘尝试；
- DAY 订单在目标交易日因停牌、价格、现金、持仓或资格失败时 Reject，不跨日保留；
- 不检查盘口、成交量和 Partial Fill；
- 成交使用 raw price，加 StrategyVersion 配置的滑点/佣金；法定税费、交易费和市场侧收费由版本化 ExecutionRules 决定，不在 Strategy Cost 中重复配置；
- `minimumCommission` 如配置必须使用 Execution Instrument 币种；
- 不支持 Limit、GTC、算法订单、成交量参与率或复杂流动性模型；
- 只支持多头，不支持做空、融资和保证金。

V2 不实现 intrabar synthetic stop。Fixed Stop/Take Profit 只在已完成的 Signal Evaluation tick 上按已知价格判断，触发后生成 Risk TargetIntent；Exchange 在下一个 `nextEligibleBarOpen` 执行，CN NAV 在下一个可用 NAV 生命周期执行。因此 V2 不使用 same-bar OHLC 顺序推断或 `intraBarPolicy`。

### 9. CN NAV 执行

NavExecution 只适用于 CN NAV Fund，且只支持日频。它不使用 Exchange Order 或场内开盘价，必须表达：

```text
subscribe / redeem request
cutoff
valuation date
NAV occurredAt / availableAt
confirmation date
share availability
redemption cash date
subscription fee
redemption fee
```

规则：

- 申购只能消耗已有 CNY 已结算现金；
- 赎回只能使用已确认且可用份额；
- 提交、定价、确认、份额可用和现金结算是不同 Simulation Event；
- NAV 不可用时保持待处理或以稳定错误码失败，不用未来 NAV 回填；
- 不调用真实账户成交命令，也不写入真实 NAV LedgerEvent；
- HK/US NAV 在 Schema 和运行时均拒绝。

### 10. 仓位、风险和公司行动

仓位方式：

```text
Fixed Amount
Percent of Equity
Fixed Quantity
Target Weight
```

所有金额使用 Execution Instrument 币种或由估值 FX 折算的 Decimal；数量按 lotSize 规范化。Target Weight 只调整唯一 Execution Instrument，不构成组合优化。

风险退出：

```text
Fixed Stop
Fixed Take Profit
Max Holding Period
```

Fixed Stop/Take Profit 相对平均成本按固定百分比计算，并只使用当前 evaluation tick 已可用的完成价格/NAV 判断；触发后进入统一 TargetIntent，不在当前 Bar 内按阈值价格成交。Risk 在持仓存在时按 level condition 每个 evaluation tick 重算；若前一次 DAY 执行被 Reject 且仓位仍存在，下一 tick 可再次生成 Risk TargetIntent，直到退出或条件解除。Max Holding Period 按有效执行 Bar 或 CN NAV 估值事件计数。Risk Based、Trailing Stop 和 ATR Stop 不能保存为可运行配置。

V2 首版支持：

```text
cash dividend
split
```

场内执行使用 raw price，Indicator 使用由公司行动事实派生的 adjusted Series。分红进入原币种现金，拆分调整数量和单位成本；同一公司行动不得重复计入复权收益和 Ledger。影响持仓或信号但不在支持范围内的公司行动必须显式失败或使结果不可发布。

### 11. BacktestResult 与基础分析

BacktestResult 是回测域结果，至少包含：

```text
source = BACKTEST
runId / strategyVersionId / snapshotId
engineVersion / schemaVersion
market rule / calendar / aggregation versions
contentHash / resultChecksum
completeness / warnings
rejected orders / NAV requests
SimulationFill[]
BacktestTrade[]
Equity Curve / Drawdown Curve
metrics / benchmark
```

`SimulationFill` 表示不可重复应用的模拟成交事实；`BacktestTrade` 是仅属于回测域、由一个或多个 SimulationFill 派生的已平仓 round-trip 交易结果，不是交易系统的 Trade Projection。V2 以 Position 从 `0 → long → 0` 作为一个 trade lifecycle：期间加仓和部分减仓都归入同一 BacktestTrade，直到仓位回到零才关闭；entry/exit quantity、value、charges 和 realizedPnl 聚合全部相关 Fill。Win Rate、Profit Factor 和 Trade Count 只基于 closed `BacktestTrade`。

回测到 `endDate` 默认不强制平仓：未平仓 Position 以估值价格进入最终 Equity 和 Total Return，但不生成虚假的 `end` Fill，也不计入 Win Rate、Profit Factor 或 Trade Count。

每个 Run 最多一个 Benchmark：StrategyVersion 指定的 Benchmark，或未指定时的 Execution Instrument Buy & Hold。输出：

```text
Total Return
CAGR
Max Drawdown
Volatility
Sharpe (riskFreeRate = 0)
Win Rate
Profit Factor
Trade Count
Turnover
Basic Period Return
```

年化因子来自估值频率和版本化日历，不对所有市场和周期无条件硬编码 `252`。指标样本不足、FX 缺失或数据不完整时返回 unavailable 和原因，不用零值掩盖。

### 12. Runtime、持久化与 Desktop

BacktestRun 状态保持：

```text
queued / running / succeeded / failed / cancelled
```

创建 Run 的输入为 `strategyVersionId + RunConfig + idempotencyKey`。Server 构建 Snapshot；Desktop 不上传 bars。

运行时先定义小型 Runner interface 和进程内 Adapter，保证输入、取消、重试、幂等和错误契约可验证。BullMQ、`worker_threads` 或其他调度/隔离实现只有在性能 Spike 证明必要后再进入独立实现任务，不是 V2 首版硬门槛。

同一 Run retry 复用 Snapshot，不产生重复 SimulationFill、NAV confirmation 或 Ledger Event；成功结果不可被后续 attempt 覆盖。Worker 崩溃、Artifact 不可读、取消和诊断返回结构化错误。

Desktop 复用现有 Strategy Lab 的策略库、编辑 Sheet、回测配置 Dialog、任务列表和结果 Dialog，但 V2 必须显示：

- 多 Signal Source 和唯一 Execution Instrument；
- 周期、市场/资产 capability 和 CN NAV 日频限制；
- 分币种初始现金和估值基础币种；
- “模拟交易”来源、Snapshot 和复现信息；
- 非目标配置不可见且不能通过 Advanced JSON 绕过。

回测结果只在 BacktestRun/BacktestResult 查询中展示，不进入实际账户、Portfolio Trade 或 Journal。

### 13. V1 迁移与数据边界

实施前只读盘点 V1 StrategyVersion、BacktestJob 和历史 Result：

- 如果没有必须保留的 V1 回测数据，采用 `Expand → Cutover → Contract`，不做长期双写；
- 如果存在必须保留的数据，迁移作为独立项目重新评审，不在 V2 隐式加入 Backfill、兼容转换器或长期并行读模型；
- 交易系统的 `Trade Projection` 影子切换、账户投影重建和四阶段读取切换不用于回测 Snapshot 迁移；
- Contract 前必须证明没有遗留 V1 调用方，且回滚点和数据保留策略已记录。

## 对外行为或接口变化

### 策略与运行

- 新增独立 `StrategySchemaV2`；StrategyVersion 发布、读取和运行均按 V2 Schema 校验。
- 创建 BacktestRun 的输入改为 `strategyVersionId + RunConfig + idempotencyKey`；不再接受 bars 或临时 Schema 作为运行输入。
- Run 读取增加 Snapshot identity、contentHash、attempt、stage、完整度、警告和结构化错误。
- retry 指向同一 Run/Snapshot；用户显式创建新 Run 才生成新 Snapshot。

### 结果

- Result 增加 `source=BACKTEST`、snapshotId、contentHash、resultChecksum、策略/聚合/日历/规则/引擎版本、SimulationFill 和 BacktestTrade。
- Result 区分 metric value、unavailable、warning 和 rejected records。
- Result 不出现在实际 Portfolio Trade、Cash、Journal 或 AI Review 数据源中。

### DSA 与能力

- capability 公开 CN/HK/US Stock/ETF、CN NAV 日频、Stock/ETF `1m/1d`、FX、公司行动、Calendar、Instrument Facts、freshness 和质量状态。
- DSA 不新增回测 Snapshot、Artifact、Backtest Manifest 或真实账户投影 API。
- 派生分钟周期由 Server 标记为 derived，不伪装为 DSA 原生周期。

### Desktop

- 策略编辑、校验和运行控制使用 V2 Schema；不再从页面草稿或客户端 bars 构造运行输入。
- Query key、Mutation 和轮询包含 backtest source、Run、Snapshot 和筛选上下文；不得与 Portfolio Trade/Journal 查询共用未区分的 key。
- 非目标市场、资产、订单、资金和风险配置在 UI、Schema 和 Server 运行时均不可用。

## 数据、状态或兼容性影响

### 数据模型

V2 需要独立保存：

```text
StrategySchemaV2 / immutable StrategyVersion
BacktestRun / RunAttempt
RunConfig
DataSnapshot / Manifest
Artifact URI / content hash
Simulation Event / SimulationFill / Reject
BacktestTrade / Equity / Metric / Benchmark
Reproducibility metadata
```

关系型数据库保存 identity、状态、索引、URI、哈希和摘要；大体积列式数据写入 ArtifactStore，不把完整 bars 或 Equity Series 塞入单行 JSON 作为唯一输入。

### 与交易系统的数据隔离

- 回测初始资金、模拟现金、模拟持仓和模拟成交只属于 BacktestRun；
- 不创建真实账户 `CASH_FLOW`、BUY/SELL LedgerEvent 或 NAV LedgerEvent；
- 不改变任何账户 `Ledger Revision`、`Projection Generation`、真实 Trade、Cash 或 Journal Snapshot；
- 真实账户与回测使用同一 `Asset.symbol` 和 Decimal/Money 边界，但数据查询、缓存、统计和权限上下文必须区分 source；
- 交易系统已有 actual/shadow 结果保持原语义，不加入 backtest 模式。

### 状态与删除

- StrategyVersion 不可变；客户端草稿不进入 Server 状态机；
- BacktestRun 公开状态保持五态，attempt/stage 只作为诊断；
- 删除 Run 时级联删除其独占 Snapshot 和 Artifact；
- 取消、失败或 retry 不产生部分成功结果和重复模拟事件。

### V1 兼容与迁移

- V1 Strategy/BacktestJob 不通过隐式转换器继续运行 V2；
- 只有在存量盘点确认无保留数据、无遗留调用方时，才执行 `Expand → Cutover → Contract`；
- 如果必须保留历史结果，旧数据只读保留并由独立迁移规格定义，不把交易系统的账本迁移手册当作回测迁移方案。

## 测试策略

### 关键可观察行为

- 支持矩阵和非目标拒绝在 DSA、Schema、Server、Runtime、Desktop 一致；
- 未来数据不会影响更早的 Indicator、Signal、Order、Fill 或 Equity；
- 相同固定输入重跑得到相同事件序列、成交、权益和 resultChecksum；
- Snapshot 能重放，Run retry 不重新读取在线数据、不重复成交；
- 每币种现金、结算、仓位、费用和公司行动满足守恒；
- 回测不能写 LedgerEventV2、改变 Projection Generation 或使 Journal 过期。

### 优先测试层级

1. Schema/Contract：V2 类型、DecimalString、Asset.symbol、capability 和错误路径；
2. Domain：时间、Series、Indicator、聚合、事件排序、SimulationLedger、ExecutionRules 和 NAV 生命周期；
3. Server：Snapshot、Artifact、Run 状态、幂等、取消、重试、结果持久化和隔离审计；
4. DSA：三市场 Stock/ETF、CN NAV、Calendar、FX、公司行动、freshness 和完整度；
5. Desktop：V2 编辑、配置、任务、结果、轮询和非目标阻断；
6. Integration：跨仓 Golden、真实运行态、故障恢复、迁移和性能 Spike。

### 关键边界与回归场景

- CN/HK/US Session、时区、午休、缺失分钟、停牌、不完整尾窗；
- `occurredAt/availableAt`、Indicator warmup、跨周期和跨标的对齐；
- Market DAY、lot/tick、价格限制、T+N、费用、税费、DAY Reject；
- Risk 在完成 evaluation tick 触发后于下一 eligible execution 执行，不使用 same-bar OHLC 顺序推断；
- CN NAV cutoff、NAV 延迟、确认、份额可用、赎回现金和费用；
- 分币种现金、无执行币种余额、FX 缺失、stale 估值和禁止自动换汇；
- dividend/split raw/adjusted 防重复计入；
- Schema/Runtime/UI 同时拒绝 HK/US NAV、Limit、autoFx、Risk Based、Trailing/ATR Stop；
- 回测运行前后真实 Ledger、Projection Generation、Portfolio Trade 和 Journal Snapshot 不变；
- Worker/Runner 取消、崩溃、retry、Artifact 缺失/损坏和删除清理。

### 可复用的现有测试入口

- 复用 `packages/schemas` 的契约测试和十进制字符串测试；
- 复用 `packages/domain` 的 Decimal、TradingCalendar、Ledger/Trade cost 边界测试作为纯规则回归参考，但不把真实 Ledger Projection 作为回测实现入口；
- 复用 Server 的 Backtest controller/service 测试、市场 capability 测试和结果 checksum 测试；
- 复用 Desktop Strategy Lab 的 Query、Mutation、Overlay、状态和可访问性测试；
- 复用 DSA Provider/Contract 测试框架，不复制回测 Snapshot 逻辑到 DSA。

## 风险与备选方案

### 数据和日历覆盖

当前只实现 CN Calendar，HK/US 数据与日历需要新增 capability 和 Golden Fixtures。处理方式是先按 `supported/unavailable/unsupported` 公开事实，不能在回测中静默降级。若某市场在发布门禁前没有可追溯数据，阻塞该能力而不是伪造完整支持。

### 数值边界和成本

现有引擎大量使用 `number`，而交易系统已使用 Decimal/Money。回测应先统一金额、数量、费用和结果 API 的十进制边界，再决定 Indicator 内部表示；不能把真实账户的成本策略 Revision 伪装成 StrategyVersion cost。

### 跨域复用过早

目前只有真实账户使用 Trade Projection 和 FX Conversion View，回测没有第二个真实执行消费者。V2 采用回测内部 `ExecutionRules`、SimulationLedger 和 BacktestTrade，降低跨域接口复杂度；未来出现第二个消费者时，再单独抽取纯函数 seam。

### 本地 Artifact 容量

每 Run 独占 Snapshot 会增加磁盘使用。Run 删除时级联清理，并提供用量和清理诊断；只有性能/容量证据证明不足时，才通过同一 ArtifactStore 接口增加对象存储 Adapter。

### Runner 运行方式

进程内 Runner 不能满足大规模分钟数据时，再通过小型 Runner interface 替换为 worker_threads 或队列执行。先以性能 Spike 决定，不把调度基础设施本身变成 V2 核心风险。

### V1 存量数据

切换前只读盘点 V1 Strategy/BacktestJob。存在必须保留的数据时，单独创建迁移规格；不使用交易系统的 Projection Cutover 手册直接迁移回测数据。

## 已决策与未决问题

### 已决策

1. V2 回测结果不进入 Portfolio 的真实 Trade 列表或 Journal，只在 BacktestRun/BacktestResult 中展示。未来如需统一展示，必须先创建独立的模拟结果读取模型 Spec，并重新评估 source、权限、统计和过期语义；该事项不阻塞 V2 实施。

### Non-blocking

1. Functional Gate 的分钟数据规模、耗时和峰值 RSS 数字由性能 Spike 决定，不改变 API、数据或事件语义。
2. V1 BacktestJob 是否存在必须保留的存量数据由只读盘点决定；若存在，影响独立迁移项目，不改变 V2 模拟域边界。
3. 各 Provider 的 HK/US 数据可用性可能随时间变化；以 capability 和运行时 `unavailable` 表达，不改变产品支持矩阵。

## 验收标准

- **AC1：** DSA、Schema、Server、Runtime 和 Desktop 对 CN/HK/US Stock/ETF、仅 CN NAV Fund 的支持矩阵一致；HK/US NAV 无法保存或运行。
- **AC2：** 回测结果带 `source=BACKTEST`，不写入、更新或删除真实 `LedgerEventV2`，不改变账户 Ledger Revision 或 Projection Generation。
- **AC3：** StrategySchemaV2 允许多个 Signal Source，并强制每个 StrategyVersion 只有一个 Execution Instrument，且使用确认后的 `Asset.symbol`。
- **AC4：** Typed AST 只接受 `all/any/not/compare/cross/constant/Series/Indicator/PositionState`，Series 通过 `sourceId + field` 显式引用；`primaryTimeframe` 是唯一 evaluation clock，未知节点、Source、Series、类型、参数或指标返回字段明确的错误。
- **AC5：** 金额、数量、价格、费用、RunConfig 和 Result 的公共边界使用 Decimal/Money 与十进制字符串，不以 JavaScript `number` 作为唯一持久化口径。
- **AC6：** DSA 提供 Stock/ETF `1m/1d`、CN NAV 日频、FX、公司行动、Calendar、Instrument Facts、Provider revision、freshness 和 completeness capability。
- **AC7：** Server 能从冻结 `1m` 按版本化日历/Session 规则确定性派生 `5m/15m/30m/60m`，并正确处理午休、缺失分钟、停牌和尾窗。
- **AC8：** 每个 BacktestRun 独占一个 DataSnapshot；同一 Run retry 复用 Snapshot，新 Run 不复用旧 Snapshot。
- **AC9：** Snapshot Manifest、数据依赖闭包、warmup/lookback、Artifact 分区、contentHash 和复现元数据完整；Snapshot 有明确 `building → finalized` 边界，Artifact 使用 Server 本地持久卷上的 `Parquet + Zstd`，V2 不依赖 MinIO/S3。
- **AC10：** Bar、NAV、FX、公司行动、派生 Series 和 Indicator 均遵守 `occurredAt/availableAt` 与 `dataAsOf`；Snapshot 自动包含所需 warmup，但未来数据变化不影响更早的结果。
- **AC11：** 相同 StrategyVersion、RunConfig、Snapshot、规则/聚合版本和引擎版本重跑得到相同事件序列、成交、权益和 resultChecksum。
- **AC12：** SimulationLedger 使用封闭初始资金、分币种 settled/unsettled Cash 和 Position；无外部入金/出金，不生成真实 CASH_FLOW。
- **AC13：** FX 只用于估值；无执行币种现金时交易被拒绝，不生成 FX Order；缺失 FX 时原币结果保留，本位币结果明确 unavailable/partial。
- **AC14：** 回测内部 `ExecutionRules` 覆盖交易日历、时区、Session、交易资格、订单、价格、持仓结算和资金结算，并保存规则版本。
- **AC15：** ExchangeExecution 只支持 `Market + DAY + nextEligibleBarOpen + full fill or reject`；Risk 只在已完成 evaluation tick 触发并在下一 eligible open 执行，不实现 intrabar stop；CN/HK/US Stock/ETF 的停牌、lot/tick、价格规则和费用均有确定性结果。
- **AC16：** NavExecution 只支持中国内地 NAV Fund 日频，并覆盖 cutoff、valuation date、NAV availableAt、confirmation、share availability、现金结算和费用。
- **AC17：** Fixed Amount、Percent of Equity、Fixed Quantity、Target Weight、Fixed Stop、Fixed Take Profit 和 Max Holding Period 语义可运行；Risk Based、Trailing Stop、ATR Stop 不可配置。
- **AC18：** cash dividend 和 split 的 raw/adjusted 口径、现金、数量和成本变化不重复计入；不支持且影响结果的公司行动会显式失败或标记不可发布。
- **AC19：** BacktestResult 输出独立 SimulationFill 和由 Fill 确定性派生的 closed BacktestTrade、订单/拒绝/NAV 记录、完整度、警告、Snapshot/版本和结果 checksum；未平仓 Position 只参与最终估值，不冒充真实 Trade Projection。
- **AC20：** 每个 Run 最多一个 Benchmark，并输出 Total Return、CAGR、Max Drawdown、Volatility、零风险利率 Sharpe、Win Rate、Profit Factor、Trade Count、Turnover 和基础周期收益；Win Rate/Profit Factor/Trade Count 仅基于完成 `0 → long → 0` 生命周期的 closed BacktestTrade，不可计算项返回 unavailable。
- **AC21：** Portfolio、Journal、AI Review 和真实账户查询不会读取或混入 BacktestResult；回测运行前后真实账户事实、投影世代和复盘快照保持不变。
- **AC22：** 创建 BacktestRun 只接受 StrategyVersion ID、RunConfig 和幂等键；Desktop 不读取或上传 bars，Server 从 DSA 构建并冻结 Snapshot。
- **AC23：** Run 状态保持 queued/running/succeeded/failed/cancelled；idempotency、cancel、retry、Runner 崩溃和结构化诊断可验证，且不产生重复模拟事件。
- **AC24：** Desktop 使用 V2 Schema、多个 Signal Source、唯一 Execution Instrument、分币种资金、模拟来源和复现信息；非目标配置不能通过 UI 或 Advanced JSON 绕过。
- **AC25：** Schema、Server 和 Runtime 对 capability 不满足、Snapshot 哈希不一致、未来数据、资金不足、规则拒绝、NAV 延迟和不支持公司行动返回稳定错误码或不可发布状态。
- **AC26：** Contract、Schema、Series/Indicator、时间、聚合、SimulationLedger、ExecutionRules、Exchange、NAV、公司行动和 Analytics 具有对应单元、Golden、属性或会计不变量测试。
- **AC27：** 集成测试证明回测不写真实 LedgerEvent、不改变 Projection Generation、不触发真实 Trade/Journal 过期，且 actual/shadow 与 backtest 查询隔离。
- **AC28：** 性能 Spike 记录代表性 CN/HK/US 分钟数据、Artifact 读取、Indicator、事件迭代、Runner 耗时和峰值 RSS，并据此形成 Functional Gate/Performance Baseline。
- **AC29：** V1 数据盘点完成；无存量时按 `Expand → Cutover → Contract` 迁移，有存量时停止 Contract 并建立独立迁移方案。
- **AC30：** Architecture、Domain、DSA Contract、Runtime、恢复、回滚、用户限制、Spec、Task 和最终一致性 Review 与实现保持同步。
