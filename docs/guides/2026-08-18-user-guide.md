# 核心模块使用说明

## 账户与持仓录入

`/accounts` 用于创建、编辑、停用和重新启用账户；`/position-entry` 用于选择账户后录入当前持仓和现金。账户只描述名称、机构、类型、实际/影子模式、币种和状态，不保存本次录入来源。

手动录入表达“设置当前余额”，不是伪造一笔买入：持仓写入 `POSITION_BASELINE_OBSERVATION`，现金写入 `CASH_BALANCE_OBSERVATION`。数量设为零或执行“清空持仓”会保留可审计的零余额观察。截图导入先生成 Import Draft，经审核、冲突检查和提交后才写入 Ledger；未提交行不改变现有持仓，截图中的现金字段不作为正式现金事实。

真实账户与影子账户使用独立 Ledger、投影和估值范围，默认聚合只包含实际账户。完整边界见 [`录入持仓与账户模型重构`](../specs/2026-08-18-position-entry-account-model.md) 和 [`Ledger 与收益计算`](../domain/2026-08-18-ledger-and-performance.md)。

## 市场数据与标的

市场数据管理使用独立的 `/market-data` 页面。ThesisLedger 保存 Desired Provider Policy、标的目录和产品缓存；DSA Fork 保存 Provider 运行时配置、Effective Policy、健康状态和目录抓取能力。浏览器不直接持有 DSA Control Token，也不直接访问 Provider SDK。

新持仓优先从目录搜索 Instrument 并确认标准 Asset；Stock、ETF 和场外基金使用各自明确的数据能力。Quote、Bar、Indicator、Chip 和 Fund NAV 都必须保留实际 Provider、marketTime、freshness/data-quality；`stale`、`partial`、`unsupported` 和 `unavailable` 不得被零值或旧缓存伪装成完整实时数据。

当前实现边界见 [`市场数据与标的中心 v1.2`](../specs/2026-08-18-market-data-provider-spec-v1.2.md) 和 [`实施说明`](../architecture/2026-08-18-market-data-provider-v1-2-implementation.md)。

## Portfolio、Trade 与投资复盘

`LedgerEventV2` 是真实账户唯一经济事实源，Position、Trade 和 Cash 都是可重建读取模型。Portfolio 的交易视图读取统一 Trade Projection，不把 Position 或 Journal 当成第二套可编辑交易事实。

投资复盘不再直接从 Ledger 拼装“已平仓交易”，而是消费两级复盘对象：

- `TRADE_CYCLE`：完整持有生命周期，用于完整交易复盘和符合资格的周期统计；
- `CLOSE_SLICE`：单次减仓，用于退出行为、成本和费用分配复盘，不增加完整交易次数或胜率。

缺少真实开仓、退出、计划或成本证据时显示“证据不足”。确定性结果先于 AI；AI 失败不会清空确定性复盘结果，也不会写入 Ledger 或自动产生买卖指令。当前契约见 [`投资复盘工作台（统一 Trade Projection）`](../specs/2026-08-28-journal-review-trade-projection.md)。

## Performance 与 Snapshot

收益、TTWROR/XIRR 和历史曲线依赖 Portfolio Snapshot。Snapshot 是带数据质量的可重建历史缓存，不是新的资产事实源。当前 Snapshot 系统同时承担手动创建、自动化生成、质量状态和历史读取入口；旧的“收益快照自动化入口”文档已经退出当前实施入口。

完整范围见 [`投资组合快照系统`](../specs/2026-08-28-portfolio-snapshot-system.md)。

## Risk 与通知

RiskRule 负责确定性判断，RiskEvent 保存规则版本、触发值、阈值、行情时点和账户范围。影子账户风险必须明确标注模拟，默认不与真实账户混算。Notification 只负责渠道、静默、去重、重试和送达记录，不重新计算风险。

完整规则见 [`风控与通知说明`](../domain/2026-08-18-risk-and-notifications.md)。

## Strategy 与 Backtest

当前已运行的回测仍以 V1 Strategy/Backtest 能力为主；统一回测 V2 已完成 Spec/Task 评审并进入实施阶段。V2 的核心边界是把回测作为独立模拟事实域：

```text
DSA → DataSnapshot → Simulation Event Engine → SimulationLedger → BacktestResult
```

回测不得写入真实 `LedgerEventV2`、actual/shadow 账户、Portfolio Trade 或 Journal。V2 目标覆盖中国内地/香港/美国 Stock 与 ETF，以及中国内地 NAV Fund，并逐步补齐分钟周期、冻结数据快照、Decimal、跨市场日历和执行规则。

不要把 V2 规划能力当成已经上线的当前功能。详细状态见 [`策略与回测领域边界`](../domain/2026-08-18-strategy-and-backtest.md) 和 [`统一回测系统 V2`](../specs/2026-08-28-unified-backtest-v2.md)。

## AI Research

AI Research 只能调用获准的只读/研究 Tool。关键数字必须能追溯到 Tool 与 Provider provenance；Tool 失败返回 unavailable，不用零值补结论。AI 不得写 Ledger、Position 或 Trade，也不得输出自动交易指令。

## Automation 与运维

AutomationJob 保存 cron、timezone、重试策略、锁、nextRunAt 和执行历史；Snapshot、行情同步、风险扫描、日报等任务复用服务端业务能力。排查运行问题时先查看任务状态和历史 run，再检查 Provider、Redis 锁、数据库和权限。

日常启动、故障排查见 [`运维与故障排查`](../operations/2026-08-18-operations.md)；备份恢复和发布门禁见 [`发布、备份与恢复`](../operations/2026-08-18-release-and-recovery.md)。
