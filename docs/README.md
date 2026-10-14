# ThesisLedger 文档导航

这里是主仓文档的唯一入口。DSA Fork 和 `thesis-ledger-infra` 保持各自仓库的文档边界，不在本目录重复维护 Provider 实现或 Compose 细节。

文档治理规则见 [`项目文档生命周期指南`](DOCUMENTATION-GUIDE.md)；明确延期、尚未正式立项的后续实现统一见 [`TODO.md`](TODO.md)；历史完成态见 [`archive/`](archive/)。

## 当前重点

以下只列当前仍在实施或仍承担当前验收门禁的主题。详细完成状态以各 Task 文件头部和任务清单为准，README 不重复维护逐步进度。

2026-10-03 文档状态对账：[任务分类入口](tasks/README.md) · [对账依据](reviews/2026-10-03-task-state-reconciliation.md) · [已完成的治理任务](archive/tasks/2026-10-03-task-state-reconciliation.md)。旧协议、历史环境和取消计划以权威 Task 的当前对账段为准。

- 统一数据能力适配层（选定框架闭环已验收，功能迁移继续实施）：[规格](specs/2026-10-09-unified-data-capability-adapter.md) · [任务](tasks/2026-10-09-unified-data-capability-adapter.md) · [来源差异与功能路由矩阵](reviews/2026-10-10-provider-adaptation-and-route-matrix.md)
- 历史数据按需获取与研究消费：[规格](specs/2026-10-09-history-data-on-demand.md) · [任务与交接 Prompt](tasks/2026-10-09-history-data-on-demand.md) · [真实可得性预研](reviews/2026-10-09-historical-data-availability-research.md)
- 市场数据多源接入、手动路由与复权感知回测：[规格](specs/2026-09-25-multi-source-adjustment-aware-backtest.md) · [任务](tasks/2026-09-25-multi-source-adjustment-aware-backtest.md)
- 富途研究所需能力接入：[规格](specs/2026-10-08-futu-openapi-full-integration.md) · [任务](tasks/2026-10-08-futu-openapi-full-integration.md)
- ThesisLedger 当前运行链：[架构与 API](architecture/canonical-runtime.md) · [已归档规格](archive/specs/2026-09-29-thesis-ledger-canonical-runtime-replacement.md) · [已完成任务](archive/tasks/2026-09-29-thesis-ledger-canonical-runtime-replacement.md) · [收口证据](tasks/evidence/2026-10-02-canonical-final-completion.md)
  - NAV 执行现行合同与已完成验收：[规格](specs/2026-10-01-n3-nav-worker.md) · [归档任务](archive/tasks/2026-10-01-n3-nav-worker.md) · [验收证据](tasks/evidence/2026-10-01-n4-nav-target.md)
  - 工作区 lint 执行门禁：[已归档规格](archive/specs/2026-10-03-workspace-lint-process-isolation.md) · [已完成任务](archive/tasks/2026-10-03-workspace-lint-process-isolation.md)
- AI 自动选择与测试后保存：[规格](specs/2026-09-23-ai-provider-auto-test-save.md) · [任务](tasks/2026-09-23-ai-provider-auto-test-save.md)
- AI 输出模式与完整流验收（增量修订）：[规格](specs/2026-09-22-ai-json-mode-stream-validation.md) · [任务](tasks/2026-09-22-ai-json-mode-stream-validation.md)
- AI 接入层迁移至 Vercel AI SDK：[规格](specs/2026-09-19-vercel-ai-sdk-integration.md) · [任务](tasks/2026-09-19-vercel-ai-sdk-integration.md)
  - 发布与回滚输入：[AI SDK 切换与兼容回滚手册](operations/2026-09-19-ai-sdk-cutover-and-rollback.md)
- 数据源即时启停与页面凭证配置：[规格](specs/2026-09-14-market-provider-credentials.md) · [任务](tasks/2026-09-14-market-provider-credentials.md)
  - HiThink 默认主源与页面 API Key：[规格](specs/2026-10-07-market-hithink-defaults-credentials.md) · [已完成任务](archive/tasks/2026-10-07-market-hithink-defaults-credentials.md)
  - 数据源精确接入与自主选择：[规格](specs/2026-10-07-market-route-user-choice.md) · [已完成任务](archive/tasks/2026-10-07-market-route-user-choice.md)
  - 全部数据源精确检查：[规格](specs/2026-10-07-all-provider-exact-checks.md) · [已完成任务](archive/tasks/2026-10-07-all-provider-exact-checks.md) · [客户端验收](reviews/2026-10-08-market-provider-client-acceptance.md)
- 账户永久删除：[规格](specs/2026-09-14-permanent-account-deletion.md) · [任务](tasks/2026-09-14-permanent-account-deletion.md)
- 全站体验统一：[规格](specs/2026-09-08-ui-interaction-consistency.md) · [任务](tasks/2026-09-08-ui-interaction-consistency.md)
- 策略风险规则与 AI 多模型优化：[规格](specs/2026-09-09-strategy-risk-ai-optimization.md) · [任务](tasks/2026-09-09-strategy-risk-ai-optimization.md)
- 自然语言创建与修改回测策略：[规格](specs/2026-09-18-natural-language-strategy-authoring.md) · [已完成任务](archive/tasks/2026-09-18-natural-language-strategy-authoring.md)
  - [底层并行交付](tasks/evidence/2026-10-04-natural-language-strategy-parallel.md) · [主仓聚合与保数据验证](tasks/evidence/2026-10-04-natural-language-strategy-integration.md)
  - [当前分层验收与剩余浏览器门禁](tasks/evidence/2026-10-06-authoring-completion.md) · [已完成身份支撑](archive/tasks/2026-10-05-strategy-identity.md) · [已完成执行支撑](archive/tasks/2026-10-05-authoring-execution.md)
- 投资复盘工作台：[当前规格](specs/2026-08-28-journal-review-trade-projection.md) · [已完成任务](archive/tasks/2026-08-28-journal-review-trade-projection.md) · [已完成收口](archive/tasks/2026-10-05-journal-review-completion.md)
  - [使用说明](guides/2026-10-04-journal-review.md) · [最终验收对账](reviews/2026-10-05-journal-review-completion.md) · [最终核对与证据入口](tasks/evidence/2026-10-05-journal-final-j85.md)
- 组合收益指标的运行时验收：[规格](specs/2026-09-09-portfolio-pnl-metrics.md) · [任务](tasks/2026-09-09-portfolio-pnl-metrics.md)
- 组合估值走势：[规格](specs/2026-09-07-portfolio-valuation-series.md) · [任务](tasks/2026-09-07-portfolio-valuation-series.md)
- 日线行情与技术指标联动：[规格](specs/2026-09-10-market-chart-indicator-integration.md) · [任务](tasks/2026-09-10-market-chart-indicator-integration.md)
- 行情图表跨日更新、双向加载与盘中快照：[规格](specs/2026-09-17-market-chart-refresh.md) · [任务](tasks/2026-09-17-market-chart-refresh.md)
- 服务端标的目录聚合：[规格](specs/2026-09-18-instrument-directory-server-read-aggregation.md) · [任务](tasks/2026-09-18-instrument-directory-server-read-aggregation.md)
- 行情图表周期聚合：[规格](specs/2026-09-16-market-chart-period-aggregation.md) · [已完成任务](archive/tasks/2026-09-16-market-chart-period-aggregation.md) · [最终验收](tasks/evidence/2026-10-06-market-period-r1-final-review.md)
- RouteTarget 历史断言与当前延迟验收：[规格](specs/2026-09-16-market-data-route-target-v2.md) · [任务](tasks/2026-09-16-market-data-route-target-v2.md)
- 消费者历史断言与当前跨模块验收：[规格](specs/2026-09-16-market-data-consumer-consistency-v2.md) · [任务](tasks/2026-09-16-market-data-consumer-consistency-v2.md)
- 回测真实历史市场规则数据源：[规格](specs/2026-09-16-backtest-real-historical-market-rules.md) · [任务](tasks/2026-09-16-backtest-real-historical-market-rules.md)
- 涨跌配色配置：[规格](specs/2026-09-15-market-color-scheme.md) · [任务](tasks/2026-09-15-market-color-scheme.md)

策略中心统一交互与回测结果体验、组合估值按需查询及 ETF 行情上游保护已经完成当前功能与运行态验收，历史任务已归档；策略中心 [Spec](specs/2026-09-17-strategy-center-ux-consolidation.md) 继续作为当前产品契约。仍明确计划后续实施的 batch/catalog、FX、LedgerEvent 与 realized PnL 优化统一进入 [`TODO.md`](TODO.md)。

本轮主仓与两条并行任务的完成范围、验证层次及后续依赖见[聚合对账](reviews/2026-10-04-parallel-task-integration.md)。

2026-10-05 增量：[行情目标来源/缓存/HTTP](tasks/evidence/2026-10-05-market-period-runtime-closure.md) · [Desktop 周期消费](tasks/evidence/2026-10-05-market-period-desktop-consumption.md) · [Journal 目标模型内容 v2](tasks/evidence/2026-10-05-journal-model-content-v2.md) · [研究输出合同 Spec](specs/2026-10-05-research-json-prompt-contract.md)/[Task](tasks/2026-10-05-research-json-prompt-contract.md) · [可信身份 Spec](specs/2026-10-05-strategy-identity.md)/[Task](tasks/2026-10-05-strategy-identity.md)/[隔离证据](tasks/evidence/2026-10-05-strategy-identity-isolated.md) · [编写执行 Spec](specs/2026-10-05-authoring-execution.md)/[Task](tasks/2026-10-05-authoring-execution.md)。投资复盘的保数据目标更新、Web 浏览器、真实结果消费、对应功能提交 CI 与最终对账已完成；其他工作线的义务以各自 Task 为准。早期数量及依赖保留在[历史执行基线](reviews/2026-10-05-remaining-task-execution-order.md)。

## 当前架构入口

- 公告来源与已收录资料：[展示契约](specs/2026-10-07-local-history-package-display.md) · [完成记录](archive/tasks/2026-10-07-local-history-package-display.md)

- 基金定投计划：[当前产品契约](specs/2026-09-08-recurring-fund-investment.md) · [完成任务](archive/tasks/2026-09-08-recurring-fund-investment.md) · [运行时证据](tasks/evidence/2026-10-04-recurring-fund-runtime.md)
- 日期精度成本策略：[时间比较契约](specs/2026-10-04-ledger-date-cost-boundary.md) · [完成修复](archive/tasks/2026-10-04-ledger-date-cost-boundary.md)
- 市场数据 V2 与复权感知 V3：[市场数据架构与实施边界](architecture/2026-09-16-market-data-v2.md)
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
  - 中国内地公告获取与状态读取：[当前规格](specs/2026-10-07-local-history-library.md) · [已完成实施记录](archive/tasks/2026-10-07-local-history-library.md)。
  - 回测公告自动准备与每日更新：[当前规格](specs/2026-10-08-announcement-preparation.md) · [完成记录](archive/tasks/2026-10-08-announcement-preparation.md) · [目标验收](reviews/2026-10-08-announcement-preparation-acceptance.md)。
  - 四证券历史公告事实扩展与原文核验：[当前规格](specs/2026-10-08-history-announcement-proof-expansion.md) · [完成记录](archive/tasks/2026-10-08-history-announcement-proof-expansion.md) · [原文与生产验收](tasks/evidence/2026-10-08-history-announcement-proof-expansion.md)。

## 历史文档

[`archive/`](archive/) 保存已完成、被取代或仅用于历史审计的文档。归档文档保留上下文和验证证据，但不作为当前实现依据；入口见 [`archive/README.md`](archive/README.md)。

每手股数独立主备路由与所选富途真实读取：[现行合同](specs/2026-10-08-security-lot-size-routing.md) · [已完成任务](archive/tasks/2026-10-08-security-lot-size-routing.md) · [实际来源与冻结消费](tasks/evidence/2026-10-08-security-lot-size-live-acceptance.md)。长桥保留可选实现，未配置不记实读；当前开发同步边界见Task。

多源扩展保留范围已收口：[现行范围Spec](specs/2026-10-03-multi-source-remaining-acceptance.md) · [P6现行合同](specs/2026-10-07-p6-market-state-expansion.md) · [已完成任务](archive/tasks/2026-10-03-multi-source-remaining-acceptance.md) · [港股与当前版本验收](tasks/evidence/2026-10-08-p6-hk-share-window-acceptance.md)。M31、选定P6、港美实际股数和精简F01均完成；历史整手采用明确研究预设，变更未核验。

新功能按指南成对创建 `specs/YYYY-MM-DD-<topic>.md` 与 `tasks/YYYY-MM-DD-<topic>.md`。明确延期而尚未正式立项的内容先进入 `TODO.md`；被新方案取代或任务完成后及时归档，不继续在根导航维护详细状态。
