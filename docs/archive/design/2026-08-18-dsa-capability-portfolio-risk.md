# DSA Portfolio / Risk 能力审计

上游已包含 Account、Trade、Cash Ledger、Corporate Action、Position、Position Lot、Daily Snapshot、FX、Risk Alert 等持久模型，并提供账户、交易、快照、导入、风险和告警 API。服务层显式处理并发冲突、超卖、成本法、导入以及组合风险。

## 复用边界

- V0.1 可借用其行为和 fixture 验证产品链路，但客户端不得直连。
- Investment OS 自 V0.3 起自行拥有 Account、Ledger、Position Projection、Snapshot 和 Performance，DSA Portfolio 不再作为任何事实源。
- DSA 的指标、筹码、行情结果可以作为 Risk Evaluation Context 输入；规则版本、RiskEvent、通知策略和 Audit Log 属于 Investment OS。
- 上游 Portfolio Agent 未来必须通过 Investment OS Tool 获取真实组合，不读取 DSA 自有 Portfolio 表。

## 运行验证（2026-08-01）

在 Fork 提交 `831ada5370123551e5cb4fc099208dd70e892e22` 的自有镜像和隔离 SQLite 数据库中完成：

1. `POST /api/v1/portfolio/accounts` 创建 `Investment OS audit` 账户，返回 `id=1`。
2. `POST /api/v1/portfolio/trades` 录入 `600519` 买入 10 股、价格 `1200`、手续费 `1.2`，返回 `id=1`。
3. `GET /api/v1/portfolio/snapshot?account_id=1&include_realtime=true` 返回 1 个账户、10 股持仓、实时价 `1350.6`、市值 `13506.0`、未实现盈亏 `1504.8`，`data_quality=ok`。
4. `GET /api/v1/portfolio/risk?account_id=1&include_realtime=true` 返回集中度、行业集中度、回撤和止损结果；单一持仓集中度 `100%` 正确触发告警，止损项为 `0`。

这验证了 DSA 的账户、交易、FIFO 成本、实时估值和风险报告行为；Investment OS 仍不把 DSA Portfolio 作为事实源。因此 T014 的运行验证已完成。
