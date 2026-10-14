# ThesisLedger 文档导航

这里是主仓文档的唯一入口。文档生命周期遵循[项目指南](DOCUMENTATION-GUIDE.md)；明确延期且尚未立项的功能见 [TODO](TODO.md)，完成与取消记录见[归档](archive/README.md)。DSA 和 infra 各自维护来源实现与部署操作。

## 当前重点

完整当前任务从[任务索引](tasks/README.md)进入，执行状态以原 Task 的当前摘要、剩余条件和证据为准。

- 统一数据能力适配层：框架、迁移与已验收切片完成，RQ/Tushare 正向消费仍受外部条件限制；[通用 Spec](specs/2026-10-09-unified-data-capability-adapter.md) · [来源专属合同（按需读取）](specs/2026-10-09-unified-data-capability-source-contracts.md) · [Task](tasks/2026-10-09-unified-data-capability-adapter.md) · [来源与路由矩阵](reviews/2026-10-10-provider-adaptation-and-route-matrix.md)。不因缺账号或权限自动开户、采购或重复探测。
- 历史数据按需获取：S、跨上市/普通窗口、诊断下载和 D1～D5 已完成，摘牌正向消费保留开放且当前停止扩搜；[Spec](specs/2026-10-09-history-data-on-demand.md) · [Task](tasks/2026-10-09-history-data-on-demand.md)。
- 富途研究能力：当前报价/图表与冻结验收、历史 1m 子集及本主题收尾由 [Spec](specs/2026-10-08-futu-openapi-full-integration.md) · [Task](tasks/2026-10-08-futu-openapi-full-integration.md)维护；分钟 M1～M4 已正式立项。
- 策略与界面：[策略风险/AI 优化](tasks/2026-09-09-strategy-risk-ai-optimization.md) · [交易 follow-up](tasks/2026-08-26-trade-execution-ledger-system-follow-up.md) · [全站 UI](tasks/2026-09-08-ui-interaction-consistency.md) · [指标交互](tasks/2026-09-10-market-chart-indicator-integration.md) · [图表更新与降级](tasks/2026-09-17-market-chart-refresh.md)。
- AI 独立验收：[SDK 业务生成](tasks/2026-09-19-vercel-ai-sdk-integration.md) · [用途配置](tasks/2026-09-21-ai-provider-model-usage-configuration.md) · [输出模式](tasks/2026-09-22-ai-json-mode-stream-validation.md) · [测试后保存](tasks/2026-09-23-ai-provider-auto-test-save.md)。
- Portfolio、Cash、Scheduler、Market Consumer 与客户端的未覆盖产品/运行断言继续保留在[任务索引](tasks/README.md)；各功能的完成证据不能互相替代。

## 现行合同与架构

实施 Task 归档后，仍有效的产品 Spec 继续保留：

- 当前运行链、API 与所有权：[Canonical](architecture/canonical-runtime.md) · [版本矩阵](architecture/version-matrix.md) · [Server 模块边界](architecture/2026-09-02-server-module-boundaries.md)。
- 价格/数量/复权与冻结研究：[经济模型与价格 Spec](specs/2026-09-25-multi-source-adjustment-aware-backtest.md)；取消与保留范围以[10-08 决定](specs/2026-10-03-multi-source-remaining-acceptance.md#scope-cancellation-20261008)为准。
- 数据来源：[路由领域语义](domain/2026-09-16-provider-routing-and-reliability.md) · [自主选择](specs/2026-10-07-market-route-user-choice.md) · [精确检查](specs/2026-10-07-all-provider-exact-checks.md) · [凭据任务](tasks/2026-09-14-market-provider-credentials.md)。
- 研究产品：[策略中心](specs/2026-09-17-strategy-center-ux-consolidation.md) · [自然语言策略编写](specs/2026-09-18-natural-language-strategy-authoring.md) · [投资复盘](specs/2026-08-28-journal-review-trade-projection.md) · [Journal 使用说明](guides/2026-10-04-journal-review.md)。
- 行情周期与实际数量：[周期聚合](specs/2026-09-16-market-chart-period-aggregation.md) · [NAV 执行](specs/2026-10-01-n3-nav-worker.md) · [每手股数](specs/2026-10-08-security-lot-size-routing.md) · [P6](specs/2026-10-07-p6-market-state-expansion.md)。
- 费用、状态与公告：[历史规则主备](specs/2026-10-06-historical-rules-primary-backup.md) · [资料展示](specs/2026-10-07-local-history-package-display.md) · [按需获取](specs/2026-10-07-local-history-library.md) · [回测公告准备与每日更新](specs/2026-10-08-announcement-preparation.md) · [四证券有界扩展](specs/2026-10-08-history-announcement-proof-expansion.md)。
- 基金定投与成本：[定投合同](specs/2026-09-08-recurring-fund-investment.md) · [成本时间边界](specs/2026-10-04-ledger-date-cost-boundary.md)。

## 目录说明

| 目录 | 用途 |
| --- | --- |
| [specs/](specs/) | 现行需求、行为合同、范围与验收标准 |
| [tasks/](tasks/) | 当前实施与独立验收；短归档跳转不属于当前任务 |
| [TODO.md](TODO.md) | 明确延期且尚未正式立项的功能 |
| [architecture/](architecture/) · [domain/](domain/) · [adr/](adr/) | 当前架构、领域不变量与已接受决策 |
| [engineering/](engineering/) · [operations/](operations/) · [guides/](guides/) | 工程约束、运维入口与使用说明 |
| [reviews/](reviews/README.md) · [benchmarks/](benchmarks/) | 当前查阅报告与可复跑基准；历史运行记录进入 archive，进度回查原 Task |
| [archive/](archive/) | 已完成、取消、被替代及历史实施记录 |

## 当前主链路

- 真实账户由 Ledger 持久信封版本 3 的经济事实生成 Position、Trade、Cash 投影，供 Portfolio/Journal 消费。
- 当前 V3 Run 经持久状态与 Worker 执行，使用不可变 Snapshot、模拟成交/账本与结果，不能写入真实 Ledger。
- Market 消费标准能力、保存的主备和来源事实；DSA 拥有来源适配与有效控制，缓存和冻结各自保留身份、时钟与未知状态。

## 历史文档

已完成和取消的任务从[归档入口](archive/README.md)追溯。09-25 多源主任务、旧历史规则调查与内部 ETF 回退已经退出当前执行入口；现行价格合同和取消决定保留。历史未勾选、旧环境或失败不触发重新实施。

仅原始证据、测试输入或邻仓仍需要的旧路径保留短跳转；它们不属于当前任务或合同。一次性 Review 与被后继合同承接的 Spec 从归档查阅。

2026-10-03 [状态对账](archive/reviews/2026-10-03-task-state-reconciliation.md)只记录当时基线；后续状态以原 Task 的最新证据为准。新功能按指南建立 Spec/Task；当前验收不能转入 TODO。
