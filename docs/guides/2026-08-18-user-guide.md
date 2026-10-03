# 核心模块使用说明

## 账户与持仓录入

`/accounts` 用于创建、编辑、停用和重新启用账户；`/position-entry` 用于选择账户后录入当前持仓和现金。账户只描述名称、机构、类型、实际/影子模式、币种和状态，不保存本次录入来源。

手动录入表达“设置当前余额”，不是伪造一笔买入：持仓写入 `POSITION_BASELINE_OBSERVATION`，现金写入 `CASH_BALANCE_OBSERVATION`。数量设为零或执行“清空持仓”会保留可审计的零余额观察。截图导入先生成 Import Draft，经审核、冲突检查和提交后才写入 Ledger；未提交行不改变现有持仓，截图中的现金字段不作为正式现金事实。

真实账户与影子账户使用独立 Ledger、投影和估值范围，默认聚合只包含实际账户。完整边界见 [`录入持仓与账户模型重构`](../specs/2026-08-18-position-entry-account-model.md) 和 [`Ledger 与收益计算`](../domain/2026-08-18-ledger-and-performance.md)。

## 市场数据与标的

市场数据管理使用独立的 `/market-data` 页面。ThesisLedger 保存 Desired Provider Policy、标的目录和产品缓存；DSA Fork 保存 Provider 运行时配置、Effective Policy、健康状态和目录抓取能力。浏览器不直接持有 DSA Control Token，也不直接访问 Provider SDK。

新持仓优先从目录搜索 Instrument 并确认标准 Asset；Stock、ETF 和场外基金使用各自明确的数据能力。Quote、Bar、Indicator、Chip 和 Fund NAV 都必须保留实际 Provider、marketTime、freshness/data-quality；`stale`、`partial`、`unsupported` 和 `unavailable` 不得被零值或旧缓存伪装成完整实时数据。

在“标的目录”搜索后点击“行情详情”，无需先录入持仓。已有持仓入口继续显示数量、成本和盈亏；目录入口只展示行情。ETF 日线当前可配置 HiThink 前复权，以及腾讯不复权、前复权、后复权。HiThink 可在数据源页面保存 API Key；腾讯无需此类凭证。保存对应口径的主备路由即可使用基础价格能力，无需逐标的申请人工准入或日级证明。

图表口径独立于回测配置，切换、扩窗和刷新沿用同一口径；实际来源以图表标注为准。HiThink 前复权不可用时，已配置的腾讯前复权备源可接替完整窗口。报价、分红、净值等能力分别显示可用状态，日线成功不保证其他分段可用。

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

回测以独立模拟事实域处理策略与冻结输入，Server 和 Worker 读取现行版本的冻结配置与结果。核心数据边界为：

```text
DSA → DataSnapshot → Simulation Event Engine → SimulationLedger → BacktestResult
```

回测不得写入真实 `LedgerEventV2`、actual/shadow 账户、Portfolio Trade 或 Journal。具体市场、资产类型、周期和价格口径的可用性由来源能力、路由与覆盖证据共同决定，配置成功或服务健康不代表该区间能够运行。

复权研究需明确价格口径、记账方式和历史性质。原始实际份额路径要求与成交和持仓有关的事件事实；归一化路径使用模拟单位，不重复注入已计入价格序列的分红或拆分，事件按策略依赖读取。固定供应商快照研究保留实际观测时刻，不等同于历史当时已知的数据，也不能宣称严格无前视。

使用时先在 `/market-data` 核对对应市场、资产、周期和价格口径的配置，再检查回测窗口与数据预检结果。来源不可用或必要覆盖不足时保留失败原因，不通过换用未声明来源或缩短区间把失败变成成功。重放使用已冻结输入；新的来源或参数应形成新的运行配置，不改写既有结果。

HiThink/腾讯的固定快照归一化价格研究由系统自动整理实际 Bar、交易日状态、来源摘要和采集时间。缺日按显式“不交易”研究假设处理，不补造价格。已配置的同口径备用按整个窗口选取；信号、成交和基准继续使用本次冻结的同一序列。真实份额、严格历史 PIT、公司行动和量额规则只在计算实际依赖它们时检查，详见 Spec §1.1。

AI 候选共享冻结比较数据和假设，封存测试内容不得进入模型提示词。归一化绝对价格和模拟数量不能直接生成真实账户风险规则；真实风险采纳需重新编译和验证其依据。详细行为见[多源复权感知回测规格](../specs/2026-09-25-multi-source-adjustment-aware-backtest.md)，实际完成与未通过门禁见[当前任务](../tasks/2026-09-25-multi-source-adjustment-aware-backtest.md)。真实来源、普通回测、图表/Electron 与 AI 验收仍分开记录。

## AI Research

AI Research 只能调用获准的只读/研究 Tool。关键数字必须能追溯到 Tool 与 Provider provenance；Tool 失败返回 unavailable，不用零值补结论。AI 不得写 Ledger、Position 或 Trade，也不得输出自动交易指令。

## Automation 与运维

AutomationJob 保存 cron、timezone、重试策略、锁、nextRunAt 和执行历史；Snapshot、行情同步、风险扫描、日报等任务复用服务端业务能力。排查运行问题时先查看任务状态和历史 run，再检查 Provider、Redis 锁、数据库和权限。

日常启动、故障排查见 [`运维与故障排查`](../operations/2026-08-18-operations.md)；备份恢复和发布门禁见 [`发布、备份与恢复`](../operations/2026-08-18-release-and-recovery.md)。
