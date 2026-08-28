# 统一回测系统 V2 实施任务

对应 Spec：[`../specs/2026-08-28-unified-backtest-v2.md`](../specs/2026-08-28-unified-backtest-v2.md)

> 任务标识：`2026-08-28-unified-backtest-v2`  
> 状态：已评审，0/14 完成  
> 当前阶段：仅完成规划，尚未开始代码实现

## 执行约束

- 开始实施前重新读取本 Spec、本任务文档和当前阶段依赖任务；本轮只生成规划，不进入代码实现。
- 交易系统的 `LedgerEventV2`、真实 Position/Trade/Cash、Projection Generation、FX Conversion View、Portfolio 和 Journal 保持关闭边界；回测只能使用独立 Simulation 域。
- 不把交易系统 `shadow` 账户当作回测容器，不通过 `CASH_FLOW` 伪造回测初始资金，不将模拟事件转换成真实 LedgerEventV2。
- 复用 `Asset.symbol`、Decimal/Money、TradingCalendar interface、Instrument Facts、FX fact 和纯计算规则；若共享抽象尚无第二个消费者，不为“未来复用”扩大公共接口。
- 变更 Spec 中的行为、接口、数据、状态、兼容性或验收标准时，先更新 Spec，再同步本任务和实现。
- DSA 只负责数据 capability；Server 负责 DataSnapshot、Artifact、Simulation Runtime 和 Result；Desktop 不准备或上传完整 bars。
- 测试随 T1–T12 同步完成；T13 只承担跨仓、隔离、迁移、性能和最终一致性门禁。
- Desktop UI 实施前使用 `shadcn` skill；请求、轮询和 Mutation 使用 TanStack Query；工具函数选型按项目规则处理。
- 所有任务只有在完成条件与验证方式均有证据后才能勾选；失败、跳过或运行环境缺失必须如实记录。
- 不覆盖或回滚用户现有修改；当前 `CONTEXT.md`、交易系统文档和其他 Review 文件属于工作区既有内容，除非任务明确涉及，否则不修改。

## 任务依赖与跨任务契约

| 任务 | 依赖 | 产出契约 |
| --- | --- | --- |
| T0 | 无 | 事实域、source、共享基础契约和禁止复用清单 |
| T1 | T0 | StrategySchemaV2、Typed AST、RunConfig、Result/Error |
| T2 | T0 | DataFact、Capability、Calendar、Instrument Facts、聚合规则 |
| T3 | T1、T2 | SnapshotRef、Manifest、ArtifactRef、contentHash |
| T4 | T1、T2 | Series/Indicator、warmup、时间可用性 |
| T5 | T1、T4 | SimulationEvent、phase、TargetIntent、replay |
| T6 | T5 | SimulationLedger、Cash/Position、估值 FX |
| T7 | T2 | ExecutionRules、规则版本、Reject reason |
| T8 | T5、T6、T7 | Exchange Market Simulation、SimulationFill |
| T9 | T5、T6、T7 | CN NAV Simulation、确认/结算事件 |
| T10 | T6、T8、T9 | 模拟仓位、风险退出、公司行动 |
| T11 | T6、T8、T9、T10 | BacktestTrade、Benchmark、Analytics |
| T12 | T1、T3、T5、T6、T10、T11 | Run API、Runner、持久化、Desktop 闭环 |
| T13 | T0–T12 | 跨仓验证、隔离门禁、迁移、性能和文档 |

并行边界：T1 与 T2 可在 T0 完成后并行；T4 与 T7 可在其依赖完成后并行；T8 与 T9 可并行；其余依赖只表示安全前置条件，不表示必须串行开发。

## 任务清单

- [ ] T0：冻结交易系统—回测系统接缝与隔离契约
  - 覆盖验收标准：AC2、AC3、AC5、AC21、AC30。
  - 依赖：无。
  - 涉及仓库：thesis-ledger；必要时同步 DSA Contract 文档。
  - 涉及范围：回测 Spec/架构说明、source=BACKTEST、SimulationEvent/SimulationLedger/BacktestTrade 命名、Asset.symbol、Decimal/Money、事实域隔离、禁止复用清单。
  - 完成条件：
    - 明确真实账户域与回测模拟域的输入、输出、持久化和查询边界；
    - 明确回测不写 LedgerEventV2、不使用 actual/shadow、不改变 Projection Generation、不进入 Portfolio/Journal；
    - 明确可共享的基础契约和暂不共享的真实账户投影；
    - 记录“回测结果不进入真实 Trade/Journal”的默认决策及未来另立读取模型的影响边界；
    - Spec、Task、Architecture 和 DSA Contract 使用同一 source、资产身份和十进制命名。
  - 验证方式：文档交叉检查、契约名称搜索、边界单元测试设计评审、链接/格式检查。
  - 验证证据：待实施后填写。

- [ ] T1：实现 StrategySchemaV2、Typed AST 与公共 Contract
  - 覆盖验收标准：AC1、AC3、AC4、AC5、AC24、AC25。
  - 依赖：T0。
  - 涉及仓库：thesis-ledger；跨仓 fixtures 由 DSA 配合。
  - 涉及范围：StrategySchemaV2、带稳定 id 的 SignalSource、SeriesRef、primaryTimeframe evaluation clock、Typed AST、RunConfig、BacktestResult、SimulationFill/BacktestTrade、结构化 Error、capability 校验和 Decimal/Money 公共边界。
  - 完成条件：
    - V2 Schema 与 V1 独立，发布和运行均使用 V2 校验；
    - 多 Signal Source、稳定 Source id、唯一 Execution Instrument、Asset.symbol 和 CN NAV 日频约束可表达；
    - AST 的 Series 只通过 `sourceId + field` 引用，Boolean/Numeric 类型、Indicator 输入/输出（含 MACD output selector）、PositionState 白名单和 cross 相邻 tick 语义可校验；
    - `primaryTimeframe` 是唯一 evaluation clock：Exchange 由 Execution Instrument 市场的已完成 primary Bar 驱动，NAV 由日频 valuation event 驱动；entry/exit 使用 false→true edge trigger（首次有效结果以前值 false 处理），unavailable 不视为 false，同 tick 固定 `risk > exit > entry`；
    - AST 只包含 Spec 定义的节点，未知节点/Source/Series/指标/参数/类型返回字段路径明确的错误；
    - Amount、Quantity、Price、Fee、InitialCash 和结果公共契约使用十进制字符串或 Decimal 领域类型；
    - HK/US NAV、Limit、autoFx、Risk Based、Trailing/ATR Stop 等非目标能力在 Schema 层拒绝；
    - 建立 DSA/Server/Worker/Desktop 可共享的 JSON fixtures，不增加 V1 compatibility adapter。
  - 验证方式：Schema 单元测试、AST 类型测试、非法配置测试、十进制往返测试、跨仓 fixture 解析/序列化和相关 package typecheck。
  - 验证证据：待实施后填写。

- [ ] T2：实现 DSA 基础数据 capability 与 Server 周期聚合
  - 覆盖验收标准：AC1、AC6、AC7、AC10、AC14、AC18。
  - 依赖：T0。
  - 涉及仓库：daily-stock-analysis、thesis-ledger。
  - 涉及范围：内部按 T2.1 数据/Provider capability、T2.2 三市场 Calendar/Instrument Facts/FX/公司行动、T2.3 Server 派生分钟周期三个工作流推进；对外仍作为一个 T2 契约交付。
  - 完成条件：
    - capability 明确支持/不可用/不支持、base/derived timeframe、freshness、quality、区间和 Provider revision；
    - DSA 不承担 Snapshot、Artifact、Backtest Manifest 或真实账户投影；
    - Server 按市场时区、Calendar、Session 从冻结 1m 派生 5m/15m/30m/60m；
    - 聚合固定 OHLCV、缺失分钟、停牌、不完整尾窗、午休和交易日边界规则；
    - 派生数据保留正确 `occurredAt/availableAt`，1d 直接使用 DSA 日线；
    - HK/US Calendar 和 capability 的实际实现不能以当前 CN-only 实现冒充完成。
  - 验证方式：DSA Contract/Provider 测试、三市场 capability fixtures、聚合 Golden Tests、时间语义测试、代表性分钟数据读取和性能 Spike 初测。
  - 验证证据：待实施后填写。

- [ ] T3：实现 Run-owned DataSnapshot 与本地 ArtifactStore
  - 覆盖验收标准：AC8、AC9、AC10、AC11、AC22、AC23。
  - 依赖：T1、T2。
  - 涉及仓库：thesis-ledger。
  - 涉及范围：Snapshot Builder、Canonical Manifest、聚合/规则版本、分区哈希、内容哈希、本地持久卷 ArtifactStore、Run/Snapshot 删除与 retry 生命周期。
  - 完成条件：
    - 每个新 Run 独占 Snapshot，同一 Run retry 复用 Snapshot，新 Run 不复用；
    - Manifest 记录 StrategyVersion、RunConfig、dataAsOf、AST 推导的数据依赖闭包、warmup/lookback、Provider、Calendar、规则、聚合、质量、完整度和分区哈希；
    - 实现 `put/open-read/exists/delete`，Artifact 使用 `Parquet + Zstd`；
    - Worker 通过 ArtifactRef 读取，不由主进程 clone 全量 bars；
    - Snapshot 区分 building/finalized：finalize 前失败可清理 staging 后重建，finalized 后 retry 必须复用且禁止重新读取在线数据；
    - Snapshot 构建/哈希失败不回退在线数据；删除 Run 清理其独占 finalized/staging Artifact；
    - V1 数据盘点入口和回测迁移边界不与交易系统 Projection Cutover 混用。
  - 验证方式：Manifest canonicalization、partition/content hash、Snapshot replay、同 Run retry、新 Run 隔离、删除清理、损坏/缺失 Artifact 和 migration dry-run 测试。
  - 验证证据：待实施后填写。

- [ ] T4：实现 Series、Indicator 与时间可用性
  - 覆盖验收标准：AC4、AC5、AC7、AC10、AC11、AC18、AC26。
  - 依赖：T1、T2。
  - 涉及仓库：thesis-ledger。
  - 涉及范围：raw/adjusted Series、warmup、lookback、MA/EMA/RSI/MACD/ATR/VWAP/Highest/Lowest、跨周期/跨标的对齐和 `occurredAt/availableAt`。
  - 完成条件：
    - Indicator 输入、参数、输出类型和 availableAt 可追踪；
    - 从 AST 推导 required lookback；startDate 前 warmup 可参与计算但不产出 Signal/Trade/Equity，warmup 不足显式 unavailable，不使用零值、前值或未来值；
    - 跨市场时区和跨周期按绝对时间对齐；
    - raw price 供执行，adjusted derived Series 供指标；
    - ATR 可用于表达式但不生成 ATR Stop；
    - 未来数据变化不会影响更早输出。
  - 验证方式：Indicator Golden、lookback/warmup、跨周期 alignment、未来函数 property、raw/adjusted 公司行动测试和 typecheck。
  - 验证证据：待实施后填写。

- [ ] T5：实现 Deterministic Simulation Event Engine
  - 覆盖验收标准：AC2、AC10、AC11、AC23、AC25、AC26、AC27。
  - 依赖：T1、T4。
  - 涉及仓库：thesis-ledger。
  - 涉及范围：事件 phase、稳定排序、Typed AST evaluator、Signal、TargetIntent、Order、SimulationFill、Reject、NAV/Settlement 事件和 replay。
  - 完成条件：
    - 固定事件 phase 和同时间 tie-break；
    - Signal Evaluation 只发生在 primaryTimeframe tick，Series/Indicator 通过显式 Source 引用取 `availableAt <= t` 的最新值；
    - entry/exit 使用 false→true edge trigger，同 tick 固定 `risk > exit > entry`；
    - 引擎只消费 `availableAt <= t` 的事实；
    - Signal 不直接改 Cash/Position，只有模拟成交/结算/公司行动可改 SimulationLedger；
    - 事件输出类型与 LedgerEventV2 分离，运行时无真实账本写入口；
    - cancel/retry/并发不产生重复 SimulationFill、NAV confirmation 或 Ledger Event；
    - 拒绝事件包含错误码、规则版本和输入事实。
  - 验证方式：event ordering、future-function property、deterministic replay、same-time tie-break、取消/重试幂等和无真实 Ledger 写入测试。
  - 验证证据：待实施后填写。

- [ ] T6：实现 SimulationLedger、封闭资金与估值 FX
  - 覆盖验收标准：AC2、AC5、AC12、AC13、AC19、AC20、AC21、AC26、AC27。
  - 依赖：T5。
  - 涉及仓库：thesis-ledger。
  - 涉及范围：CNY/HKD/USD 初始现金、settled/unsettled Cash、唯一执行标的 Position、Simulation Settlement、估值 FX 和 PortfolioValuationPolicy。
  - 完成条件：
    - 初始资金只在 RunConfig/SimulationLedger 中存在，不生成真实 CASH_FLOW；
    - 交易只能使用执行币种已结算现金，无余额时 Reject，不生成 FX Order；
    - 现金、持仓、费用、分红和结算按原币种守恒；
    - FX 仅用于估值，缺失时保留原币结果并返回本位币 unavailable/partial；
    - 估值使用固定时间策略和 `availableAt`，不读取未来价格/FX；
    - 模拟运行前后真实账户 Ledger、Projection Generation、Portfolio Trade 和 Journal 不变。
  - 验证方式：每币种 cash conservation、settled/unsettled、余额不足、禁止换汇、FX 缺失/stale、估值时点、真实账本零写入和结果重放测试。
  - 验证证据：待实施后填写。

- [ ] T7：实现回测内部 ExecutionRules
  - 覆盖验收标准：AC1、AC6、AC7、AC14、AC15、AC25、AC26。
  - 依赖：T2。
  - 涉及仓库：thesis-ledger；DSA 提供事实和 capability。
  - 涉及范围：TradingEligibility、OrderRules、PriceRules、PositionSettlement、CashSettlement、Calendar/Instrument Facts Adapter 和规则版本。
  - 完成条件：
    - 回测内部有小接口、深实现的 ExecutionRules，不依赖当前未实现的共享 MarketRuleSet；
    - CN/HK/US 日历、时区、Session、停牌、可买卖、lot/tick、价格规则、法定税费/交易费、持仓和资金结算可由版本化事实驱动；
    - Strategy Cost 只提供佣金/最低佣金/滑点模拟参数，不重复承载市场法定费用；
    - 删除 `simulateAStockExecution` 中硬编码的单市场规则依赖；
    - Reject 原因、规则版本和输入事实可追踪；
    - 不把 `tPlusOne` 布尔值当作全部市场语义。
  - 验证方式：三市场规则 Golden、Session/时区、停牌、lot/tick、价格限制、持仓/现金结算和规则版本重放测试。
  - 验证证据：待实施后填写。

- [ ] T8：实现 Exchange Market Simulation
  - 覆盖验收标准：AC2、AC8、AC10、AC11、AC13、AC14、AC15、AC23、AC26、AC27。
  - 依赖：T5、T6、T7。
  - 涉及仓库：thesis-ledger。
  - 涉及范围：CN/HK/US Stock/ETF 的 Market、DAY、nextEligibleBarOpen、全成/拒绝、费用税费和滑点；V2 不实现 intrabar stop/same-bar OHLC 顺序推断。
  - 完成条件：
    - 只接受 Market Order，不实现 Limit/GTC/Partial Fill/盘口/成交量模型；
    - 订单在下一个符合规则的 Bar 开盘尝试，DAY 失败不跨日保留；
    - 成交使用 raw price 和基础成本模型；
    - 停牌、现金、持仓、价格规则、lot/tick 和结算失败有稳定 Reject；
    - Risk 在已完成 evaluation tick 上判断，触发后只在下一 eligible Bar open 执行，不按当前 Bar 阈值价成交；
    - 只产生 SimulationFill，不调用真实成交命令。
  - 验证方式：CN/HK/US 端到端 Golden、DAY expiry、费用/税费、价格/交易单位、risk-next-open、无真实 Ledger 写入和确定性重放测试。
  - 验证证据：待实施后填写。

- [ ] T9：实现 CN NAV Simulation
  - 覆盖验收标准：AC1、AC2、AC8、AC10、AC11、AC12、AC13、AC16、AC23、AC26、AC27。
  - 依赖：T5、T6、T7。
  - 涉及仓库：thesis-ledger；DSA 提供 CN NAV 日频事实。
  - 涉及范围：CN NAV Fund 的 subscribe/redeem、cutoff、valuation date、NAV availableAt、confirmation、share availability、费用和现金结算。
  - 完成条件：
    - 仅 CN NAV Fund、仅日频；HK/US NAV 和场内订单路径拒绝；
    - 模拟提交、定价、确认、份额可用和现金结算事件；
    - NAV 延迟不使用未来值；余额不足和不可用份额稳定 Reject；
    - 定投只消耗已有 CNY 现金；
    - 不写真实 NAV LedgerEvent、不调用真实账户命令。
  - 验证方式：cutoff 前后、NAV 延迟、确认/份额/现金结算、费用、余额不足、非目标市场、重试幂等和真实账本零写入测试。
  - 验证证据：待实施后填写。

- [ ] T10：实现模拟仓位、风险退出与公司行动
  - 覆盖验收标准：AC2、AC5、AC10、AC11、AC12、AC13、AC17、AC18、AC26、AC27。
  - 依赖：T6、T8、T9。
  - 涉及仓库：thesis-ledger。
  - 涉及范围：四种 sizing、Fixed Stop/Take Profit、Max Holding Period、cash dividend、split、raw/adjusted 联动。
  - 完成条件：
    - Fixed Amount、Percent of Equity、Fixed Quantity、Target Weight 按 Spec 计算，lotSize 规范化；
    - Fixed Stop、Fixed Take Profit、Max Holding Period 在 Exchange 和 CN NAV 语义下可运行；Stop/Take Profit 只在完成的 evaluation tick 判断并生成 Risk TargetIntent，不实现 intrabar 阈值成交；Risk 作为持仓期 level condition，在 DAY Reject 后可于后续 tick 重试；
    - Risk Based、Trailing Stop、ATR Stop、组合风险预算不可配置；
    - dividend/split 只在支持口径中更新现金、数量和成本，不重复计入收益；
    - 不支持且影响结果的公司行动显式失败或使结果不可发布。
  - 验证方式：sizing 边界、目标权重、余额不足、risk-next-execution、NAV 日频风险、dividend/split 和非目标拒绝测试。
  - 验证证据：待实施后填写。

- [ ] T11：实现 BacktestTrade、Benchmark 与基础 Analytics
  - 覆盖验收标准：AC2、AC5、AC11、AC13、AC19、AC20、AC21、AC26、AC27。
  - 依赖：T6、T8、T9、T10。
  - 涉及仓库：thesis-ledger。
  - 涉及范围：SimulationFill、closed BacktestTrade 投影、Fill 配对规则、Equity/Drawdown、Benchmark、Return/Risk/Trade Metrics、unavailable/warning、结果 checksum 和复现元数据。
  - 完成条件：
    - SimulationFill 表示模拟成交事实；BacktestTrade 明确 source=BACKTEST，以 Position `0 → long → 0` 为一个生命周期聚合期间全部加仓/减仓 Fill，不复用真实 Trade Projection 表或 actual/shadow mode；
    - Win Rate、Profit Factor、Trade Count 只基于 closed BacktestTrade；endDate 默认不强平，未平仓仅进入最终估值；
    - 每个 Run 最多一个 Benchmark，未配置时使用 Execution Instrument Buy & Hold；
    - 输出 Spec 定义的基础指标，Sharpe 使用零风险利率，年化因子遵守估值频率/日历；
    - 缺失数据、FX、样本不足和不完整结果返回 unavailable/warning，不使用零值掩盖；
    - Result 保存 Snapshot、规则/聚合/引擎版本和 resultChecksum。
  - 验证方式：指标 Golden、零交易/亏损/样本不足、Benchmark 对齐、跨币种估值、BacktestTrade source 隔离和 checksum 重放测试。
  - 验证证据：待实施后填写。

- [ ] T12：完成 Snapshot 驱动 Runtime、持久化与 Desktop 闭环
  - 覆盖验收标准：AC1、AC2、AC3、AC8、AC9、AC11、AC19、AC21、AC22、AC23、AC24、AC25、AC30。
  - 依赖：T1、T3、T5、T6、T10、T11。
  - 涉及仓库：thesis-ledger。
  - 涉及范围：StrategyVersion/Run/Snapshot/Result 持久化、Runner interface、进程内 Adapter、Run 状态、幂等/取消/重试、Strategy Lab V2 UI、Query/Mutation/轮询。
  - 完成条件：
    - Run 创建只接受 StrategyVersion ID、RunConfig 和 idempotency key；Server 构建 Snapshot；
    - Runner 只从 finalized SnapshotRef/ArtifactRef 读取，不接收 Desktop bars；finalized 后的 retry 不得重新访问在线数据；
    - queued/running/succeeded/failed/cancelled、attempt/stage、cancel/retry 和结构化诊断可用；
    - 同一 Run retry 不重复事件，成功结果不可被后续 attempt 覆盖；
    - Desktop 支持 V2 Schema、Signal Sources、Execution Instrument、周期、资金、结果和复现信息；
    - 非目标配置在 UI、JSON、Server Schema 和 Runtime 一致拒绝；
    - 回测结果只在 Backtest 查询中展示，不进入 Portfolio Trade、Journal 或真实账户查询。
  - 验证方式：Repository/API/状态/idempotency/Runner 测试，Desktop 组件/Query/Mutation/Overlay/可访问性测试，使用 `shadcn` skill 检查组件复用，Desktop/Server typecheck、目标测试、build 和浏览器 smoke。
  - 验证证据：待实施后填写。

- [ ] T13：完成跨仓集成、隔离门禁、迁移、性能与最终一致性 Review
  - 覆盖验收标准：AC1–AC30。
  - 依赖：T0–T12。
  - 涉及仓库：thesis-ledger、daily-stock-analysis、thesis-ledger-infra（仅在所需环境配置变更时）。
  - 涉及范围：跨仓 Contract/Golden、真实运行态隔离验证、V1 数据盘点、Expand/Cutover/Contract、Runner/Artifact 性能、故障恢复、文档和最终 Review。
  - 完成条件：
    - CN/HK/US Stock/ETF、CN NAV 的跨仓 Golden Scenario 和 capability 一致性通过；
    - 证明回测运行前后真实 LedgerEvent、Ledger Revision、Projection Generation、Portfolio Trade、Journal Snapshot 均不变；
    - future-function、deterministic replay、Ledger/SimulationLedger invariants、Snapshot hash、Result checksum 和非目标拒绝回归通过；
    - 完成代表性分钟数据、Artifact 读取、Indicator、事件迭代和 Runner 峰值 RSS 性能 Spike，并形成 Functional Gate/Performance Baseline；
    - 验证 Runner 崩溃、取消、retry、Artifact 缺失/损坏/空间不足和 Run 删除清理；
    - 完成 V1 数据盘点；无存量时验证 Expand → Cutover → Contract，有存量时停止 Contract 并记录独立迁移任务；
    - 同步 Architecture、Domain、DSA Contract、Runtime、恢复、回滚和用户限制文档；
    - 完成最终一致性 Review；Spec 中已决策事项不得被实现重新打开，Non-blocking 问题如未解决需记录但不阻塞既定 V2 边界。
  - 验证方式：三仓目标测试、主仓 typecheck/test/build/lint/format、DSA pytest、migration dry-run、隔离审计、浏览器/真实运行态 smoke、性能报告、文档链接和 `git diff --check`。
  - 验证证据：待实施后填写。

## 验收标准映射

| Spec AC | 主要任务 | 补充任务 |
| --- | --- | --- |
| AC1 | T1、T2、T7、T8、T9、T12 | T13 |
| AC2 | T0、T5、T6、T8、T9、T10、T11、T12 | T13 |
| AC3 | T0、T1 | T12 |
| AC4 | T1、T4 | T5、T12 |
| AC5 | T0、T1、T4、T6、T10、T11 | T13 |
| AC6 | T2、T7 | T8、T9、T13 |
| AC7 | T2、T4 | T3、T13 |
| AC8 | T3 | T8、T9、T12、T13 |
| AC9 | T3 | T12、T13 |
| AC10 | T2、T4、T5 | T8、T9、T10、T13 |
| AC11 | T3、T4、T5、T6、T8、T9、T10、T11 | T12、T13 |
| AC12 | T6、T9、T10 | T5、T8、T13 |
| AC13 | T6、T8、T9、T11 | T10、T12、T13 |
| AC14 | T2、T7 | T8、T9、T13 |
| AC15 | T7、T8 | T5、T6、T10、T13 |
| AC16 | T2、T9 | T6、T8、T13 |
| AC17 | T1、T10 | T6、T8、T9、T12 |
| AC18 | T2、T4、T10 | T6、T11、T13 |
| AC19 | T1、T11 | T3、T6、T12、T13 |
| AC20 | T6、T11 | T10、T12、T13 |
| AC21 | T0、T6、T11、T12 | T5、T13 |
| AC22 | T1、T3、T12 | T13 |
| AC23 | T3、T5、T8、T9、T12 | T13 |
| AC24 | T1、T12 | T0、T13 |
| AC25 | T1、T5、T7、T12 | T2、T8、T9、T13 |
| AC26 | T1–T11 | T13 |
| AC27 | T0、T5、T6、T8、T9、T11、T12 | T13 |
| AC28 | T13 | T2、T3、T12 |
| AC29 | T13 | T3、T12 |
| AC30 | T0、T12 | T13 |

## 最终一致性 Review

- [ ] Spec 中的全部验收标准均有对应实现
- [ ] 所有已勾选任务均有验证证据
- [ ] 所有任务依赖均已满足且无错误阻塞关系
- [ ] 跨任务接口、类型和命名保持一致
- [ ] 不存在未定义实现契约、占位描述或与 Spec 已决策事项冲突的实现
- [ ] 实现未超出 Spec 声明的范围
- [ ] 测试策略、测试实现与验证结果一致
- [ ] 测试与文档已同步更新
- [ ] 必要实施 Step 均已验证；如未获提交授权，已记录提交状态
- [ ] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：待实施完成后填写。
- 发现的问题：待最终 Review 填写。
- 遗留风险：待最终 Review 填写。
- 验证命令与结果：待最终 Review 填写。
