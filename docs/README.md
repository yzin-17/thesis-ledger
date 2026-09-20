# ThesisLedger 文档导航

这里是主仓文档的唯一入口。DSA Fork 和 `thesis-ledger-infra` 保持各自仓库的文档边界，不在本目录重复维护 Provider 实现或 Compose 细节。

文档治理规则见 [`项目文档生命周期指南`](DOCUMENTATION-GUIDE.md)；明确延期、尚未正式立项的后续实现统一见 [`TODO.md`](TODO.md)；历史完成态见 [`archive/`](archive/)。

## 当前重点

以下只列当前仍在实施或仍承担当前验收门禁的主题。详细完成状态以各 Task 文件头部和任务清单为准，README 不重复维护逐步进度。

- AI 接入层迁移至 Vercel AI SDK：[规格](specs/2026-09-19-vercel-ai-sdk-integration.md) · [任务](tasks/2026-09-19-vercel-ai-sdk-integration.md)
  - 发布与回滚输入：[AI SDK 切换与兼容回滚手册](operations/2026-09-19-ai-sdk-cutover-and-rollback.md)
- 数据源即时启停与页面凭证配置：[规格](specs/2026-09-14-market-provider-credentials.md) · [任务](tasks/2026-09-14-market-provider-credentials.md)
- 账户永久删除：[规格](specs/2026-09-14-permanent-account-deletion.md) · [任务](tasks/2026-09-14-permanent-account-deletion.md)
- 全站体验统一：[规格](specs/2026-09-08-ui-interaction-consistency.md) · [任务](tasks/2026-09-08-ui-interaction-consistency.md)
- 策略风险规则与 AI 多模型优化：[规格](specs/2026-09-09-strategy-risk-ai-optimization.md) · [任务](tasks/2026-09-09-strategy-risk-ai-optimization.md)
- 自然语言创建与修改回测策略：[规格](specs/2026-09-18-natural-language-strategy-authoring.md) · [任务](tasks/2026-09-18-natural-language-strategy-authoring.md)
- 组合概览收益指标语义统一：[规格](specs/2026-09-09-portfolio-pnl-metrics.md) · [任务](tasks/2026-09-09-portfolio-pnl-metrics.md)
- 历史建仓时间补录：[规格](specs/2026-09-10-trade-opening-boundary-supplement.md) · [任务](tasks/2026-09-10-trade-opening-boundary-supplement.md)
- 日线行情与技术指标联动：[规格](specs/2026-09-10-market-chart-indicator-integration.md) · [任务](tasks/2026-09-10-market-chart-indicator-integration.md)
- 行情图表跨日更新、双向加载与盘中快照：[规格](specs/2026-09-17-market-chart-refresh.md) · [任务](tasks/2026-09-17-market-chart-refresh.md)
- 实时行情涨跌展示：[规格](specs/2026-09-18-market-quote-change-display.md) · [任务](tasks/2026-09-18-market-quote-change-display.md)
- 服务端标的目录聚合：[规格](specs/2026-09-18-instrument-directory-server-read-aggregation.md) · [任务](tasks/2026-09-18-instrument-directory-server-read-aggregation.md)
- 行情图表周期聚合：[规格](specs/2026-09-16-market-chart-period-aggregation.md) · [任务](tasks/2026-09-16-market-chart-period-aggregation.md)
- 市场数据 RouteTarget V2：[规格](specs/2026-09-16-market-data-route-target-v2.md) · [任务](tasks/2026-09-16-market-data-route-target-v2.md)
- 市场数据消费者一致性 V2：[规格](specs/2026-09-16-market-data-consumer-consistency-v2.md) · [任务](tasks/2026-09-16-market-data-consumer-consistency-v2.md)
- 回测真实历史市场规则数据源：[规格](specs/2026-09-16-backtest-real-historical-market-rules.md) · [任务](tasks/2026-09-16-backtest-real-historical-market-rules.md)
- 涨跌配色配置：[规格](specs/2026-09-15-market-color-scheme.md) · [任务](tasks/2026-09-15-market-color-scheme.md)

策略中心统一交互与回测结果体验、组合估值按需查询及 ETF 行情上游保护已经完成当前功能与运行态验收，历史任务已归档；策略中心 [Spec](specs/2026-09-17-strategy-center-ux-consolidation.md) 继续作为当前产品契约。仍明确计划后续实施的 batch/catalog、FX、LedgerEvent 与 realized PnL 优化统一进入 [`TODO.md`](TODO.md)。

## 当前架构入口

- 市场数据 V2 当前实现：[Market Data V2 架构](architecture/2026-09-16-market-data-v2.md)
- Provider 路由与可靠性领域语义：[Provider 路由与可靠性](domain/2026-09-16-provider-routing-and-reliability.md)
- DSA 与主仓兼容边界：[DSA Contract 兼容说明](architecture/2026-08-18-thesis-ledger-dsa-compatibility.md)
- 三仓发布级版本与兼容关系：[版本与兼容矩阵](architecture/version-matrix.md)
- Server 模块边界：[Server 模块边界](architecture/2026-09-02-server-module-boundaries.md)

## 目录说明

| 目录 / 文件                      | 用途                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`specs/`](specs/)               | 当前产品需求、设计目标、范围和验收标准                                                         |
| [`tasks/`](tasks/)               | 当前实施任务和仍属于当前完成条件的运行时/外部门禁；入口见 [`tasks/README.md`](tasks/README.md) |
| [`TODO.md`](TODO.md)             | 已明确延期到未来、但尚未正式立项的实现 backlog；不能承接当前未完成门禁                         |
| [`architecture/`](architecture/) | 当前跨仓边界、实现结构和兼容条件                                                               |
| [`domain/`](domain/)             | 稳定领域术语、模型和业务不变量                                                                 |
| [`engineering/`](engineering/)   | 数据库、缓存、依赖、组件和工程实现规范                                                         |
| [`operations/`](operations/)     | 日常运维、发布、备份恢复和迁移/切换手册                                                        |
| [`guides/`](guides/)             | 面向用户的当前使用说明                                                                         |
| [`adr/`](adr/)                   | 已接受的长期架构决策                                                                           |
| [`reviews/`](reviews/)           | 当前发布门禁、运行阻塞、跨仓审计和一次性证据索引                                               |
| [`benchmarks/`](benchmarks/)     | 可重复执行的固定基准集和性能证据，不存放一次性 closure/review                                  |
| [`archive/`](archive/)           | 已完成、被取代或只用于历史审计的 Spec/Task/Review/Architecture/Domain                          |

## 当前主链路

- 真实账户事实：`LedgerEventV2 → Position / Trade / Cash Projection → Portfolio / Journal`。
- 投资复盘：Journal 消费统一 Trade Projection，区分 `TRADE_CYCLE` 与 `CLOSE_SLICE`。
- 回测：V2 使用独立模拟事实域 `DataSnapshot → Simulation Event Engine → SimulationLedger → BacktestResult`，不得写入真实 Ledger。
- 市场数据：ThesisLedger 负责 Desired Policy、RouteTarget 消费、BarSeries Fact/Coverage、Reader 与产品缓存；DSA Fork 负责 Provider runtime、Effective Policy 与 source-pinned 数据能力。

## 历史文档

[`archive/`](archive/) 保存已完成、被取代或仅用于历史审计的文档。归档文档保留上下文和验证证据，但不作为当前实现依据；入口见 [`archive/README.md`](archive/README.md)。

新功能按指南成对创建 `specs/YYYY-MM-DD-<topic>.md` 与 `tasks/YYYY-MM-DD-<topic>.md`。明确延期而尚未正式立项的内容先进入 `TODO.md`；被新方案取代或任务完成后及时归档，不继续在根导航维护详细状态。
