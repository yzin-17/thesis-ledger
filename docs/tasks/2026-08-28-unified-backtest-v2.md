# 统一回测系统 V2 实施任务

对应 Spec：[`../specs/2026-08-28-unified-backtest-v2.md`](../specs/2026-08-28-unified-backtest-v2.md)

后续增量：[`策略驱动风险规则与 AI 多模型优化实施任务`](2026-09-09-strategy-risk-ai-optimization.md)；该任务不重复认领本任务尚未完成的 V2 引擎能力。

> 任务标识：`2026-08-28-unified-backtest-v2`
> 状态：实施中，13/14 完成
> 当前阶段：T0–T12 已完成；进入 T13 跨仓集成、隔离、迁移、性能与最终一致性验收

## 执行约束

- 开始各阶段实施前重新读取本 Spec、本任务文档和当前阶段依赖任务；代码修改按任务依赖与验证阶梯推进。
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

- [x] T0：冻结交易系统—回测系统接缝与隔离契约
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
  - 验证证据：
    - 代码版本：从 `ad2a7e786c291822887b1d0550b72a1db835a908` 开始实施，保持既有真实账户与 V1 回测行为不变；本 Step 未提交。
    - 文档交叉检查：Spec 第 1 节、[`策略与回测领域边界`](../domain/2026-08-18-strategy-and-backtest.md) 与 [`DSA Contract V1 兼容说明`](../architecture/2026-08-18-thesis-ledger-dsa-compatibility.md) 已统一 `source=BACKTEST`、`Asset.symbol`、Decimal/Money、`SimulationEvent`、`SimulationLedger` 和 `BacktestTrade` 命名。
    - 隔离决策：明确禁止回测读写真实 Ledger、Portfolio、Journal、AI Review、`actual/shadow` 与 Projection Generation；未来需要展示关联时另建只读模型，不修改本默认决策。
    - 自动门禁：`scripts/check-boundaries.mjs` 已增加 Backtest 与 Ledger/Portfolio/Journal 的双向依赖禁令，以及普通 AI 研究直接消费 Backtest 的禁令。
    - 验证命令：`node scripts/check-boundaries.mjs`：通过；`pnpm exec prettier --check docs/architecture/2026-08-18-thesis-ledger-dsa-compatibility.md docs/specs/2026-08-28-unified-backtest-v2.md docs/tasks/2026-08-28-unified-backtest-v2.md`：通过；三份文档相对链接检查：通过；`git diff --check`：通过。

- [x] T1：实现 StrategySchemaV2、Typed AST 与公共 Contract
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
  - 验证证据：
    - 契约：新增独立 `StrategySchemaV2`、Typed AST、`RunConfig`、`SimulationFill`、`BacktestTrade`、`BacktestResult` 和结构化错误码；增加 Exchange/NAV 共享 JSON fixtures，未增加 V1 转换器。
    - 语义：Schema 覆盖多 Source、唯一 Execution Instrument、`sourceId + field`、Boolean/Numeric 类型、MACD output selector、PositionState 白名单、执行币种正数初始现金和非目标能力拒绝。
    - 主代理验证：`pnpm --filter @thesis-ledger/schemas test`：121 passed；`pnpm --filter @thesis-ledger/domain test`：111 passed；`pnpm --dir packages/schemas typecheck`、`pnpm --dir packages/domain typecheck`：通过。

- [x] T2：实现 DSA 基础数据 capability 与 Server 周期聚合
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
  - 验证证据：
    - 跨仓契约：DSA V2 capability 显式返回 base/derived、可用状态、范围、新鲜度、质量和 Provider revision；未经 Provider registry/health 确认的非 fixture 事实返回 `unavailable` 和空 facts，不冒充真实能力。
    - 聚合：Server 仅在 base `1m` 与对应 Calendar fact 可用时声明派生周期；Domain 按 CN/HK/US 时区、节假日、Session 和半日市生成 5m/15m/30m/60m，保留最大 `availableAt`、缺失和尾窗状态，`1d` 只验证并透传 DSA 事实。
    - 精度：公共 Bar、FX、NAV、tick/lot 使用规范十进制字符串，聚合内部使用 `DecimalValue`；DSA 真实日线边界也做 DecimalString 序列化。
    - 主代理验证：DSA `\.venv/bin/python -m pytest tests/test_thesis_ledger_contract.py -q`：14 passed；Schemas：121 passed；Domain：111 passed；Server：444 passed；三个 TypeScript package typecheck 和两仓 scoped `git diff --check`：通过。
    - 验收边界：当前为离线 Contract/fixture 与确定性聚合验证；未声称非 fixture 的真实 Provider 已可用，后续 Snapshot/Runner 真实数据验收属于 T12/T13。

- [x] T3：实现 Run-owned DataSnapshot 与本地 ArtifactStore
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
  - 验证证据：
    - 持久化：`LocalArtifactStore` 使用 `parquet-wasm` 和 Apache Arrow 实际写入 `Parquet + Zstd`，验证 `PAR1`、ZSTD metadata、增量 SHA-256、磁盘 Blob、列裁剪和 AsyncIterable 读取；公共接口不暴露库类型。
    - 不可变性：Artifact 和 finalized manifest 原子独占发布，拒绝覆盖、跨 Run key、篡改 building manifest、身份不匹配复用与空 complete Snapshot；并发相同 finalize 幂等，不同内容失败。
    - 依赖闭包：复用 Domain `strategyRequiredLookback`，记录版本化保守 warmup range policy；为 Signal/Execution/Benchmark/FX/Corporate Action/Calendar/Instrument/NAV 建立稳定去重 dataset entries，并将派生分钟周期回溯到 `1m` 基础数据。
    - 生命周期：同 Run retry 复用 finalized Snapshot，新 Run 隔离，重建/删除清理孤儿与 staging Artifact，即使 manifest 损坏也能安全清理。
    - 主代理验证：Server 58 files / 457 tests passed；`pnpm --dir apps/server typecheck`、`pnpm --dir apps/server build`：通过。

- [x] T4：实现 Series、Indicator 与时间可用性
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
  - 验证证据：
    - 计算：新增 raw/adjusted Series 与 MA/EMA/RSI/MACD/ATR/VWAP/Highest/Lowest，使用 `DecimalValue` 并传播输入最大 `availableAt`；ATR gap 和 MACD output selector 具有 Golden 测试。
    - 时间：跨 Source/周期/市场按绝对时间取 `availableAt <= evaluationAt` 的最新值；公司行动复用 T2 单一契约，以显式 knowledge time 生成 adjusted 历史窗口，raw 执行价不变。
    - warmup：从嵌套 AST 递归推导 required lookback，检查 startDate 前紧邻连续可用点；不足/中断显式 `unavailable`，startDate 前点不输出运行结果。
    - 主代理验证：Schemas 126 tests passed；Domain 126 tests passed；两包 typecheck 和目标 ESLint：通过。

- [x] T5：实现 Deterministic Simulation Event Engine
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
  - 验证证据：
    - 仿真内核：固定 11 个 phase 与绝对时间/phase/sequence tie-break，事件队列逐个弹出全局最早事件；新入队的同刻 TargetIntent、Order、Fill 会在下一 evaluation tick 前完成。
    - 求值语义：Typed AST evaluator 使用 Decimal 比较，只在 `primaryTimeframe` tick 运行；Series/Indicator 通过显式 Source 读取 `availableAt <= t` 的事实，future fact 返回结构化 `FUTURE_DATA`，unavailable 不会被折叠为 false。
    - 信号与隔离：entry/exit 使用 false→true edge，同 tick 固定 `risk > exit > entry`；Signal 仅生成 TargetIntent，只有 SimulationFill 触发模拟 mutation port，模块没有真实 Ledger 写入口。
    - 确定性：事件 ID、稳定序列、cancel/retry 和重复 Fill 防护具有回归测试；追加未来点不改变更早结果，跨 tick 测试证明 tick1 Fill 对 tick2 仓位相关风险求值可见。
    - 主代理验证：`backtest-simulation.test.ts` 9 tests passed；目标 `git diff --check` 通过。子代理完成 Domain 142 tests、typecheck、build 与目标 ESLint；全仓 complexity guardrail 被既存 React Native Flow 解析错误阻塞，未作为 T5 局部通过的替代证据。

- [x] T6：实现 SimulationLedger、封闭资金与估值 FX
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
  - 验证证据：
    - 封闭账本：`SimulationLedger` 仅从 RunConfig 初始化 CNY/HKD/USD 现金，维护唯一执行标的的 settled/unsettled Cash 与 Position；模块不生成真实 `CASH_FLOW`，也没有真实 Ledger、FX Order 或账户命令入口。
    - 精确结算：Fill、Dividend 与 pending position/cash effect 按唯一来源事件分账，Settlement 使用 `sourceEventId + kind` 只释放目标项；交错 T+N 不会提前结算后续 Fill，公司行动和重放保持幂等。
    - 会计守恒：买卖、费用、分红与拆股均使用 Decimal 原币记账；无执行币种现金、未结算持仓、错误币种、负费用、无效/未来时间返回稳定 Reject。拆股保持总 cost basis 不变并反向调整平均成本。
    - 估值：先保留每币种现金/持仓结果，再按 `occurredAt/availableAt <= valuationAt` 选择最新价格与 FX；FX 仅用于折算，missing/stale/invalid/future 时保留已知现金和原币结果，本位币输出 partial/unavailable 及来源诊断。
    - 主代理验证：`simulation-ledger.test.ts` 8 tests passed，Domain typecheck 通过。子代理完成 Domain 15 files / 151 tests、ESLint、Prettier、file-size ratchet 和 `git diff --check`；file-size 仅有既存 legacy warnings。

- [x] T7：实现回测内部 ExecutionRules
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
  - 验证证据：
    - 深模块：`VersionedExecutionRules` 接受版本化 Calendar、Instrument、Order、Price、Position/Cash Settlement 和 statutory charge 事实，输出稳定 `RULE_REJECTED` reason code、规则版本与 Calendar/Instrument provenance。
    - 事实适配：`tradingCalendarFromFact` 从冻结 DSA Calendar Fact 建立时区、Session、节假日和范围语义；三市场 lot/tick、价格限制、停牌/可交易、持仓/现金结算和 Decimal 市场收费由输入事实驱动。
    - V1 隔离：`simulateAStockExecution` 改为对新深模块的兼容适配，保留既有 V1 行为，不再自行执行涨跌幅、T+1、lot 和法定收费判断。
    - 主代理验证：Domain 126 tests passed（含 CN/HK/US Golden、Session/节假日、停牌、lot/tick、价格、结算、收费和 provenance）；Domain typecheck 与目标 ESLint：通过。

- [x] T8：实现 Exchange Market Simulation
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
  - 验证证据：
    - 执行路径：`ExchangeMarketSimulation` 仅接受 CN/HK/US Stock/ETF 的 Market + DAY，使用信号后的首个合法交易 Session 作为目标日，并在 `nextEligibleBarOpen` 全成或稳定 Reject；目标日失败不跨日保留。
    - 时间语义：Bar 分离 `openedAt/openAvailableAt` 与完整窗口 `occurredAt/availableAt`，前收盘价也有独立 `previousCloseAvailableAt`；收盘信号可在下一交易日开盘执行，完整 Bar 稍后完成不会被误判为开盘未来数据。
    - 规则与成本：订单先经版本化 `ExecutionRules` 规范 lot/tick、Session、停牌、价格和结算，再以 normalized quantity 计算 raw-open 滑点、佣金、最低佣金、法定费用和现金需求；Strategy commission 与规则侧收费保留独立来源，最低佣金 Money 必须匹配执行币种。
    - 模拟账本：产出显式 `SimulationLedgerFill` 和按市场时区首个 Session 生成的精确 settlement events；buy 分别处理 position/cash T+N，sell 只产生 cash settlement，所有 source 都引用稳定 fill eventId，不调用真实成交或 Ledger。
    - 主代理验证：`backtest-exchange.test.ts` 17 tests passed，覆盖三市场 Golden、risk-next-open、DAY expiry、次日开盘、费用/价格/单位/现金拒绝、未来前收、无效时间、T6 SimulationLedger 端到端与重复应用。子代理完成目标 ESLint、复杂度、Prettier 和 diff-check；包级 typecheck 的最后一轮被并行未完成的 T9 文件阻塞，T8 定向编译测试已通过，统一包级检查留待 T9 收口后重跑。

- [x] T9：实现 CN NAV Simulation
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
  - 验证证据：
    - 能力边界：`CnNavSimulation` 仅接受 CN NAV Fund + 1d，并从独立 `SimulationLedgerConfig` 创建 fresh 模拟账本；HK/US NAV、错误币种/标的和非日频在运行时稳定拒绝。
    - 生命周期：使用冻结 TradingCalendar、`calendarVersion` 和本地 cutoff 规则，显式处理 request、cutoff、NAV pricing、confirmation、share availability、subscription cash settlement、redemption cash 与 cancel；周末/节假日滚到下一交易日，cutoff 后一秒不会错误使用当日 NAV。
    - 事实与时点：Pricing 消费与 T2 同形的 symbol/market/instrumentType/provider/revision/freshness/quality/status NAV Fact；NAV、确认、份额和现金事件均校验 occurredAt/availableAt 不早于来源事实，延迟事件可在事实可用后重试，不使用未来 NAV。
    - 会计与隔离：申购仅预留并消耗 CNY settled cash，赎回仅使用已确认可用份额；费用、份额和现金用 Decimal 比较，confirmation/settlement 只调用 T6 SimulationLedger，不调用 Exchange Order 或真实 Ledger/账户命令。
    - 确定性：同一固定 config 每次构造 fresh ledger，完整事件序列重放得到相同请求和账本状态；duplicate/cancel/retry 不产生重复 Fill、确认或结算。
    - 主代理验证：T8+T9 定向 26 tests passed；Domain 16 files / 170 tests 与 typecheck 通过。子代理完成 Domain build、T9 ESLint/Prettier、complexity/max-lines、file-size ratchet 和 `git diff --check`，仅保留既存 file-size legacy warnings。

- [x] T10：实现模拟仓位、风险退出与公司行动
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
  - 验证证据：
    - `backtest-sizing.ts` 以 Decimal 实现四种 sizing、lotSize 规范化、Target Weight buy/sell/none、正反向 FX 与实际消费事实的 `availableAt`；`backtest-risk.ts` 仅在完成 tick 上实现 Fixed Stop、Fixed Take Profit、Max Holding Period level condition，并产出稳定 Risk TargetIntent。
    - `backtest-sizing-risk-adapter.ts` 将 sizing/risk 接入 T5 `SimulationExecutionPort`，分别驱动 T8 Exchange 下一可用开盘和 T9 CN NAV subscribe/redeem request；NAV 不经过 Exchange Order。
    - `backtest-corporate-actions.ts` 将 T2 cash dividend/split/reverse split 事实按时点、标的、币种和 runId 幂等接入 T6 SimulationLedger；raw 执行与 adjusted signal 分离，未知行动和 NAV Fund 显式拒绝。
    - 主代理验证：T10 定向测试通过；Domain 22 files / 201 tests 与 typecheck 通过，`git diff --check` 通过。

- [x] T11：实现 BacktestTrade、Benchmark 与基础 Analytics
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
  - 验证证据：
    - `backtest-trades.ts` 以 SimulationFill 的 `0 → long → 0` 生命周期投影 source=BACKTEST 的 closed BacktestTrade，聚合全部加减仓、费用与 Decimal 盈亏；未平仓不在 endDate 强平，交易指标只消费 closed trades。
    - `backtest-analytics-v2.ts` 实现 Equity/Drawdown、Return/Risk/Trade metrics、最多一个 Benchmark 与默认 Execution Instrument Buy & Hold；缺失 FX、样本不足和不完整输入返回 unavailable/warning。
    - 结果 checksum 使用 canonicalization，并覆盖 Snapshot、market rule、calendar、aggregation、engine、schema 等复现元数据；相同输入重放稳定。
    - 主代理验证：T11 定向测试通过；Domain 22 files / 201 tests 与 typecheck 通过，`git diff --check` 通过。

- [x] T12：完成 Snapshot 驱动 Runtime、持久化与 Desktop 闭环
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
  - 验证证据：
    - Server 已实现严格 V2 Run API、Snapshot Builder、finalized Snapshot/Artifact-only Runner、V1/V2 队列路由、幂等创建、attempt 条件提交、取消中断、retry、结构化诊断与 canonical Result checksum；Prisma 采用独立增量 migration，Schema validate 通过且无历史 migration 变更。
    - Runtime 已接通 Exchange 与 CN NAV 两条 vertical：Exchange 使用版本化规则、sizing、risk、SimulationLedger、结算、公司行动、指标、冻结 FX 估值与派生分钟周期；CN NAV 按事实 `availableAt` 逐 tick 消费 request/cutoff/NAV/confirmation/share/cash 事件，后续退出与风险评价可见已确认持仓。
    - Desktop 已支持 V2 Schema 摘要、Signal Sources/Execution Instrument、RunConfig、V2 创建/取消/retry、stage/attempt/结构化诊断、指标/权益/交易/NAV 拒绝与复现元数据；请求状态由 TanStack Query 管理，并复用既有 shadcn 组件。
    - 验证通过：Domain 22 files / 203 tests、Schemas 12 files / 130 tests、API Client 1 file / 10 tests、Server 64 files / 473 tests、Desktop 定向 2 files / 49 tests；Domain/Server/Desktop typecheck、Server/Desktop build、Prisma validate 与 `git diff --check` 通过。Desktop build 仅有既有的大 chunk warning。
    - 浏览器 smoke：本地 `http://localhost:5173/strategy` 实测通过。使用合法 V2 JSON 在不保存数据的前提下切换到 V2 可视化编辑器，确认 `Signal Sources`、Execution Instrument、Primary timeframe、Sizing、Risk、Execution、Cost 与能力边界均可见；`390×844` 下页面与 Dialog `scrollWidth === clientWidth`，无横向溢出，关闭后 overlay 正常消失；浏览器控制台无 warning/error。当前 Server 部分数据源不可用时，页面按既有契约显示“数据可能陈旧”，未冒充完整实时运行态验收。

- [x] T13：完成跨仓集成、隔离门禁、迁移、性能与最终一致性 Review
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
  - 阶段及最终验证证据：
    - `node scripts/backtest-v2-t13-gate.mjs`：通过；离线 fixture 覆盖 CN Stock、HK Stock、US ETF 和 CN NAV Golden scenario，未把 HK/US NAV 标成支持。设置 `DSA_V2_CAPABILITIES_URL` 后可追加 DSA 完整 capability 矩阵检查。
    - `node scripts/backtest-v2-isolation-audit.mjs`：通过；扫描 46 个回测/Simulation 源文件，未发现真实 `LedgerEventV2`、`TradeProjection`、`CASH_FLOW` 或真实 Ledger/Portfolio/Journal import。
    - `pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-v2-t13-golden.test.ts`：2 tests passed；跨仓 Exchange/CN NAV fixture 可解析，HK/US NAV、Limit 和非目标 Risk 在 Schema 层拒绝。
    - `node scripts/backtest-v1-inventory.mjs`：通过静态盘点；确认 `BacktestJob` 仍保留 V1 mode 默认值和旧队列引用，但当前未提供 `DATABASE_URL`，V1 历史行数仍需数据库只读盘点。
    - `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/artifact-store.test.ts test/backtest/snapshot.test.ts test/backtest/v2-run-lifecycle.test.ts test/backtest/v2-run.test.ts`：4 files / 19 tests passed，覆盖 Artifact 缺失/损坏/删除清理、Snapshot hash 与 retry、Runner 终态/取消/旧 attempt 防覆盖。
    - 性能报告：[`统一回测 V2 T13 性能与功能基线`](../benchmarks/2026-09-09-unified-backtest-v2-t13.md)；`scripts/backtest-v2-performance-spike.ts` 两次复跑的 `functionalDigest` 一致。该 workload 的 RSS 包含 `parquet-wasm` 初始化，不替代真实 Worker/Docker 基线。
    - 尚未完成：真实 DSA HTTP、PostgreSQL/Redis/Docker Worker、真实账户 Ledger/Revision/Projection/Portfolio/Journal 前后快照、磁盘空间不足注入及 Runner 生产 RSS；T13 保持未勾选。
    - 第二阶段运行态探测：Docker/Server/DSA/PostgreSQL/Redis 容器健康，但当前 Server `/api/v1/backtests/runs` 返回 404、DSA V2 capability 返回 404，且无运行中的 `backtest-worker`；数据库仍为 baseline SchemaVersion，2 个 V1 StrategyVersion 和 8 个 BacktestJob 需要先 Expand/Cutover。详细证据见性能与功能基线报告；未将只读探测误记为 V2 smoke。
    - 第三阶段构建/迁移阻塞（2026-09-10）：已确认 compose 的 `backtest-worker` 入口和 V2 Runner 架构；`scripts/update.sh` 因旧 Dockerfile 静态约定安全退出，直接 compose build 未产出新镜像。当前 PostgreSQL recovery 因 `No space left on device` 无法完成 checkpoint，健康检查持续拒绝连接，旧 Server 因 Prisma `P1017` 退出。未执行 prune、卷操作或 migration；2/8 V1 数据仅沿用第二阶段只读基线，真实 DSA/V2 Run、取消/重试/崩溃、账户隔离和 RSS 保持未验证。详见性能与功能基线报告；T13 保持未勾选。
    - 第三阶段重试（2026-09-10）：用户授权仅回收约 8.283 GiB BuildKit cache 后，PostgreSQL 恢复 healthy；当前工作树 compose build 又在 DSA `npm ci` 的 `ECONNRESET`/`network aborted` 失败，并伴随 Python 基础层 `unexpected end of file`，Server 构建被取消。未启动新镜像、未执行 expand migration 或任何业务数据操作；V2 运行态验收继续阻塞，详见性能报告。
    - 第三阶段后续真实证据（2026-09-10）：BuildKit 回收后 PostgreSQL 保持 healthy；DSA 镜像已成功构建并用 `docker compose up -d --no-deps dsa` 安全重建。真实 DSA V2 gate 通过，`provider=akshare`、`capabilityCount=39`。ThesisLedger Server 官方构建虽先后受 Alpine `apk` TLS、HTTP 502、Corepack pnpm `ECONNRESET` 阻塞，后续已成功构建 image ID `5d61215116d0`，但 Server/Worker 尚未重建。
    - 第三阶段数据库门禁（2026-09-10）：只读确认 2 个 V1 `StrategyVersion`、8 个 `BacktestJob`（`queued=1`、`succeeded=7`）；`MarketBar.upstreamSource` 已存在，但 BullMQ lifecycle 列和 V2 列均不存在。BullMQ lifecycle migration 会把 queued 旧任务改为 `failed/legacy_execution_incomplete`，需用户明确授权后才能继续；因此未执行 migration、未新增迁移后快照，T13 继续未勾选。详见性能报告。
    - 后续真实运行态（2026-09-10）：用户已明确授权迁移。按严格限定的任务 ID 执行 BullMQ lifecycle 与 V2 runs expand migration；前置 lifecycle migration 对唯一 queued 旧任务执行 `UPDATE 1` 并将其收敛为 `failed`，2 个 V1 `StrategyVersion` 与 8 个 V1 `BacktestJob` 保留。Server/Worker 新镜像重建成功并曾同时 healthy；Server/Worker 共享外部卷 `thesis-ledger-backtest-data`，Server 镜像已创建并 `chown /app/var/backtest`，解决此前真实 Run 的 `EACCES: permission denied, mkdir '/app/var'`。
    - 后续空间恢复证据（2026-09-10）：Docker VM 再次出现 `ENOSPC`，导致 PostgreSQL 退出、Redis AOF `MISCONF`；第二次仅清理约 1.578 GiB BuildKit cache，未删除业务 volume 或业务数据，随后 PostgreSQL、Redis、Server、Worker 恢复 healthy。
    - 三次真实 Run 证据（2026-09-10）：Exchange + ETF fixture、单标的 `600519.SH`、CN NAV `110011.OF` 三次 Run 均正确停在 DSA `corporateActions unavailable`，未伪造成功结果。真实 DSA capability 为 `provider=akshare`，`calendars=0`、`instrumentFacts=0`，`fx`/`corporateActions`/`nav` 均 unavailable；因此真实 Provider/PIT 数据面是当前唯一主要阻塞。
    - 文案复核（2026-09-10）：Desktop V2 用户可见文案中文核验仍通过，覆盖 `StrategyV2Summary`、`StrategyEditorSheet`、`StrategySections`、`StrategyDashboard`、`StrategyJobs` 及 loading/error/diagnostic 新文案；Contract/API/schema/JSON/枚举技术值未改写。
    - Compose 契约补充证据（2026-09-10）：主代理在 infra `compose.yml` 挂载 `004-backtest-v2-runs.sql`，新增 Server/Worker 共享外部卷门禁，并同步更新 `scripts/compose-contract.test.sh`；`bash scripts/compose-contract.test.sh` 已通过。
    - 最终 DSA Provider 闭环（2026-09-10）：DSA 已支持 CN STOCK/1d raw bar、CN 交易日历、CN STOCK instrument facts 与 CN STOCK `CASH_DIVIDEND` corporate actions；V2 raw bar 通过 Provider runtime 的不复权入口获取，`availableAt` 使用交易日 Asia/Shanghai 15:00，并拒绝未收盘/未来事实。ETF、NAV、FX、拆分及其他未接入范围继续显式 `unsupported`/`unavailable`，不以 fixture 冒充真实能力。
    - 最终迁移与执行面证据：BullMQ lifecycle 与 V2 字段/索引迁移均已应用；迁移前的 2 个 V1 `StrategyVersion` 与 8 个 V1 `BacktestJob` 保留，唯一 queued legacy job 已按授权收敛为 `failed/legacy_execution_incomplete`。Server/Worker 已使用共享 snapshot volume `thesis-ledger-backtest-data`，并曾同时 healthy。
    - 最终自动化验证证据：Server 65 files/477 tests、Schemas 13 files/134 tests、DSA 23 tests、Server typecheck、目标 ESLint、boundaries、compose-contract 和 `git diff --check` 均通过；已有 spike/digest、Artifact missing/corrupt/readonly/ENOSPC 恢复与清理证据继续有效。
    - 真实取消与恢复：Run `6bc2ee8a-c47b-4964-929c-cabb02f5a63c` 在 Worker 停止期间创建并取消，Worker 重启后仍为 `cancelled`。Run `f544ab82-ff24-4bb5-b474-5a7f5d81ea40` 初次因结果 Schema 缺 `orderId`/`availableAt` 按上限 3 次失败；修复后 retry 从 attempt0 开始，在 attempt1 成功，snapshot `4679f...`、checksum `3a9bc0e298208f83`，产生 1 个 fill（贵州茅台 100 股、1641.64、`2023-12-18T01:30Z`）。成功后重复 retry 保持 attempt1、checksum 和 fillCount 不变。
    - 真实成功 Run：Run `fab50622-0c77-44c7-b16d-9f0ecbed43f2` succeeded，产生 1 个 fill，checksum `505553f668690e43`；Worker 实跑峰值约 122 MiB / 7.748 GiB（1.54%），Server 约 120.6 MiB。
    - 最终账户隔离：本次真实回测即时前后哈希严格一致：`AccountLedgerState` 1=`4e7acffd...`、`JournalEntry` 0=`d41d8c...`、`LedgerEvent` 1=`31d6eae...`、`PortfolioSnapshot` 9=`78dd2f7a...`、`Trade` 1=`9d4e545...`。较早 `PortfolioSnapshot` 基线曾受后台运行时更新影响，但本次即时前后快照严格一致。
    - 运行态资源证据：最终阶段 BuildKit cache prune 回收 21.83 GB（早期另一次回收 22.06 GB），仅删除可重建缓存，不含镜像、容器或卷；已有受控 Artifact 空间不足、缺失、损坏、只读和清理恢复证据保留。
    - 最终限制与结论：T13 验收条件已由跨仓测试、真实迁移、运行态故障恢复、账户隔离和 RSS 证据覆盖，现勾选 T13。真实成功结果 `completeness=partial`，必须展示“可卖持仓不足”警告；本次策略因快速退出遇到 CN T+1，结果证明买入成交闭环，不证明闭合卖出交易或完整收益闭环。

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

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致
- [x] 不存在未定义实现契约、占位描述或与 Spec 已决策事项冲突的实现
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证；未获提交授权，当前变更保持未提交
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：完成；T13 已勾选。跨仓、迁移、共享快照卷、真实 Run、取消/重试恢复、账户即时前后隔离、性能与故障恢复证据均已归档。
- 发现的问题：真实成功结果仍为 `completeness=partial`，必须展示“可卖持仓不足”；CN T+1 导致快速退出策略未形成闭合卖出交易，因此不得宣称完整交易闭环或完整收益闭环。
- 遗留风险：ETF、NAV、FX、拆分及未接入市场仍保持显式不支持；未来扩展这些范围必须重新执行对应 Provider/PIT、Golden、隔离和真实运行态验收。
- 验证命令与结果：Server 65 files/477 tests、Schemas 13 files/134 tests、DSA 23 tests、Server typecheck、目标 ESLint、boundaries、compose-contract、性能 spike/digest、故障恢复、Markdown Prettier 与 `git diff --check` 均通过。
