# 市场数据消费者一致性 V2 Spec

> 任务标识：market-data-consumer-consistency-v2
> 日期：2026-09-16
> 状态：T1–T4 本地实现完成；已授权开发库重建与保留事实恢复，真实运行态门禁未完成
> 对应任务：[市场数据消费者一致性 V2 实施任务](../tasks/2026-09-16-market-data-consumer-consistency-v2.md)

## 背景与问题

Risk 目前可能直接读取 `MarketBar`，绕过当前路由、完整性和 provenance；绩效、回测和组合相关模块对 stale、complete、point-in-time 的要求也没有统一入口。结果是同一行情事实在不同消费者中可能有不同来源和时间语义。

## 目标

- Strategy Risk 只使用 `complete` 的 `MarketBarReader` 结果，缺数据时 fail-closed。
- 绩效预估使用 `interactive`，正式校准使用 `complete`。
- Backtest V2 使用 `point-in-time`，要求 `availableAt <= asOf`，并冻结实际路由、Provider/source revision 和 fingerprint。
- Portfolio、Performance、Automation 继续单向消费 Market 模块；Catalog/Asset identity 保持 provider-neutral。
- DSA native analysis 保留独立策略、缓存和熔断 namespace；其他 feature 不得直读 `MarketBar` 或绕过 Reader 调用 DSA bars。
- 提供受保护的开发行情与衍生产物清理模式，为不迁移旧行情的 V2 切换建立可审计入口。
- 当开发库结构门禁只能通过重建达到当前 head 时，先生成并验证完整灾备，再以数据包恢复计划保留的领域事实；恢复范围按依赖图覆盖账户、交易、持仓及其必要关联，不以三张孤立表代替业务一致性。

## 非目标

- 不修改交易、账户、持仓、风险规则的事实模型。
- 不把当前策略强行解释为历史市场日期当时的策略；新任务使用执行时策略，已冻结快照不随策略改变。
- 不在本 Spec 修改 Provider adapter 或缓存 TTL。
- 不提供生产数据升级或清理路径，不删除 Docker volume，不删除账户、交易、持仓、策略、风险规则和配置审计。

## 设计方案

Market 模块提供深模块 `MarketBarReader.read`，消费者只选择 acceptance 和 point-in-time 参数，不接触 RouteTarget、缓存 key 或 DSA HTTP。Reader 返回带 coverage、completion、availableAt、provenance 和 fingerprint 的 BarSeries。Risk 与正式校准拒绝 incomplete/unknown/stale；Backtest 将读取结果和 provenance 一起写入冻结 snapshot。

通过 `scripts/check-boundaries.mjs` 增加跨 feature 依赖规则：Risk、Performance、Backtest、Portfolio、Automation 只能导入 Market 暴露的 reader/contract，不得导入 Prisma MarketBar repository 或 DSA bars client。

开发清理采用默认只读预检、显式执行的双阶段入口。预检必须从实际连接重新读取数据库名和 owner，列出将清理的 `MarketBar`、BarSeries fact/coverage、`BacktestJob`、`PortfolioSnapshot`、`AccountValuationPoint`、`RiskPositionState`、`RiskRuleTriggerState`、`RiskEvent`，以及本地 backtest snapshot 根目录和限定前缀的 Redis view/indicator/lock/circuit key。`JournalEntry.riskEventId` 在保留 Journal 的前提下先置空；`StrategyRiskApplication`、`StrategyRiskApplicationAudit`、`RiskRule`、`RiskRuleAudit` 均保留。执行只允许 `NODE_ENV=development`，并要求数据丢失开关、数据库/owner 精确匹配和包含 scope 的确认值；任何目标、关联或目录不明确时 fail-closed。清理 Redis 时禁止 `FLUSHDB`，文件清理不得越过已解析并校验的 snapshot 根目录。

若 infra 结构门禁要求重建整个 `public` schema，则重建前必须生成带 checksum 的完整 PostgreSQL custom-format dump，并在隔离数据库完成可读恢复和关键计数核对；另生成保留事实数据包，排除上述行情、回测、估值快照、风险事件与运行状态以及旧 `SchemaVersion`。重建达到当前 migration head 后，按 PostgreSQL 依赖顺序恢复数据包，再核对账户、交易、持仓、LedgerEvent、现金与交易子事实计数及引用完整性。完整灾备在验收结束前保留；不得将未验证的导出视为可恢复。

## 对外行为或接口变化

消费者的内部读取接口改为 acceptance-aware reader；Backtest snapshot 增加 RouteTarget、revision、providerRevision、source 和 fingerprint。对外错误统一为可解释的 unavailable/incomplete/stale，不返回部分数据冒充完整结果。

## 测试策略

覆盖 Risk fail-closed、绩效两种 acceptance、Backtest availableAt/asOf 和冻结重放、跨模块依赖门禁，以及 Portfolio/Automation 不回归。测试 fixture 只证明语义，不证明线上 Provider 和 Docker 版本。

## 验收标准

- AC1：Risk 使用 complete reader 并对不完整数据 fail-closed。
- AC2：绩效预估/正式校准使用规定 acceptance。
- AC3：Backtest 满足 point-in-time 并冻结实际 provenance/fingerprint。
- AC4：Portfolio、Performance、Automation 单向消费 Market；Catalog/Asset identity 不携带 Provider 依赖。
- AC5：边界门禁阻止直读 MarketBar 或绕过 Reader 调用 bars。
- AC6：跨模块定向测试、包级检查和当前 Docker 运行态门禁按任务完成；未完成门禁保持未通过。
- AC7：开发清理默认不写入；只有数据库、owner、表、Redis namespace 和 snapshot 根目录重新展示并精确确认后才可执行，且保留清单中的领域事实与配置审计。
- AC8：全库开发重建前存在 checksum 完整灾备及隔离恢复证据；重建后账户、交易、持仓及其必要关联按依赖图恢复，计划清理对象保持为空，当前 migration head 和引用完整性均通过。
