# 策略与回测领域边界

## 当前事实

策略使用 `Strategy` 和不可变的 `StrategyVersion` 保存；修改策略创建新版本，历史回测结果继续引用原版本，不被后续编辑覆盖。当前源码已包含独立快照、Worker 执行和 V3 价格研究协议；各能力的本地实现、目标运行态与真实来源验收分别以[当前任务](../tasks/2026-09-25-multi-source-adjustment-aware-backtest.md)为准，不能从源码存在推定全部场景已可用。

旧 V1 结果按其原契约保留，不通过隐式版本转换改变历史含义。V2 的实际份额执行规则与 V3 的归一化模拟单位分别解释，不把实际 lot/tick 规则套到归一化数量上，也不把模拟价格直接用作真实账户风险阈值。

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

任何回测都必须明确数据来源、数据时点、完整度和限制。严格历史时点模式要求决策只使用当时已经可用的数据，包括复权与修订所依赖的事实；缺失必要历史能力时拒绝，不能自动降为固定快照研究。

固定供应商快照研究明确使用某次观测后冻结的历史序列，保留真实观测时间与来源修订，不将观测时间回填为历史收盘时间。这种研究可以确定性重放，但可复现不证明严格无前视；封存测试也不改变其历史性质。未标记为研究价格的事实继续遵守自身真实可见性约束。两种模式均不得静默缩小范围或混用不同冻结时点的输入。

原始实际份额记账使用原始成交价格，按必要事件处理现金与持仓变化。归一化序列记账使用模拟数量，不再次注入价格序列已包含的拆分与分红；独立事件表仅按策略与记账依赖要求读取。缺少必需事件时失败，不能将未接入解释为没有事件。完整协议见[多源复权感知回测规格](../specs/2026-09-25-multi-source-adjustment-aware-backtest.md)。

可复现结果至少固定 StrategyVersion、RunConfig、DataSnapshot、规则/聚合版本、引擎版本和结果 checksum。当前 V1 的历史结果按原契约保留；V2 不通过长期双写或隐式 V1→V2 转换制造第二套兼容真源。

T13 的离线门禁进一步固定这一边界：跨仓 fixture 只验证 capability/support matrix 和 Golden scenario；V1 盘点脚本只读识别 `BacktestJob`/旧队列引用，未取得数据库快照时不得声称可以执行 Contract。隔离审计、性能 workload 和运行态缺口见 [`统一回测 V2 T13 性能与功能基线`](../benchmarks/2026-09-09-unified-backtest-v2-t13.md)。
