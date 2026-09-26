# 当前实施任务

`docs/tasks/` 只承担两类职责：

1. 仍有当前实现工作未完成的任务；
2. 代码已经实现，但真实 Provider、Docker、Worker、浏览器、设备、用户确认等仍属于**当前完成条件**的任务。

详细状态只维护在各 Task 文件自身；本 README 只做轻量索引，不复制 T1/T2/G1 等逐步进度。明确延期到以后、且不属于当前完成条件的事项统一进入 [`../TODO.md`](../TODO.md)。已完成任务正文进入 [`../archive/tasks/`](../archive/tasks/)。

## 当前仍在实施

- [AI 自动选择与测试后保存](2026-09-23-ai-provider-auto-test-save.md)

- [AI 接入层迁移至 Vercel AI SDK](2026-09-19-vercel-ai-sdk-integration.md)
- [目标配置版本与并发一致性加固](2026-09-16-performance-target-allocation-consistency.md)

- [自然语言创建与修改回测策略](2026-09-18-natural-language-strategy-authoring.md)
- [数据源即时启停与页面凭证配置](2026-09-14-market-provider-credentials.md)
- [账户永久删除](2026-09-14-permanent-account-deletion.md)
- [行情图表周期聚合](2026-09-16-market-chart-period-aggregation.md)
- [回测真实历史市场规则数据源](2026-09-16-backtest-real-historical-market-rules.md)
- [日线行情与技术指标联动 / 交互精炼](2026-09-10-market-chart-indicator-integration.md)
- [行情图表跨日更新、双向加载与盘中快照](2026-09-17-market-chart-refresh.md)
- [实时行情涨跌展示](2026-09-18-market-quote-change-display.md)
- [服务端标的目录聚合](2026-09-18-instrument-directory-server-read-aggregation.md)
- [全站体验统一](2026-09-08-ui-interaction-consistency.md)

## 当前主要是运行时或外部门禁

- [市场数据 RouteTarget V2](2026-09-16-market-data-route-target-v2.md)
- [市场数据消费者一致性 V2](2026-09-16-market-data-consumer-consistency-v2.md)
- [涨跌配色配置](2026-09-15-market-color-scheme.md)
- [V1 回测任务 BullMQ 生命周期](2026-09-09-backtest-bullmq-lifecycle.md)
- [自动化执行耐久身份、租约与恢复加固](2026-09-05-automation-execution-lease-hardening.md)
- [策略驱动风险规则与 AI 多模型优化](2026-09-09-strategy-risk-ai-optimization.md)
- [组合概览收益指标语义统一](2026-09-09-portfolio-pnl-metrics.md)
- [市场数据与标的中心 v1.2](2026-08-18-market-data-provider-v1-2.md)
- [市场数据 v1.2 closure-09：Mobile 原生验收](2026-08-18-market-data-provider-v1-2-closure-09-mobile-native-acceptance.md)
- [市场数据 v1.2 closure-11：最终追踪 Review](2026-08-18-market-data-provider-v1-2-closure-11-final-review.md)
- [录入持仓与账户模型重构](2026-08-18-position-entry-account-model.md)
- [持仓行情详情共享读模型](2026-08-21-market-detail-read-model.md)
- [巨型组件拆分与请求层统一](2026-08-23-large-component-split.md)
- [风险中心 AB 组合交互](2026-08-23-risk-center-interaction.md)
- [研究助手任务工作台](2026-08-25-ai-research-workbench.md)
- [投资组合快照系统](2026-08-28-portfolio-snapshot-system.md)
- [投资复盘工作台（统一 Trade Projection）](2026-08-28-journal-review-trade-projection.md)
- [现金账户资金范围与内部划转](2026-08-30-cash-account-funding-and-transfer.md)
- [定期现金入账计划](2026-08-30-recurring-cash-deposit-plan.md)
- [现金页面 UI 优化](2026-09-03-cash-page-ui-optimization.md)
- [ETF 日线独立备用源](2026-09-08-etf-daily-independent-fallback.md)
- [日线缓存与 Provider 主备路由](2026-09-08-market-data-cache-and-provider-routing.md)
- [基金定投计划](2026-09-08-recurring-fund-investment.md)
- [历史建仓时间补录](2026-09-10-trade-opening-boundary-supplement.md)

## 已归档任务的兼容跳转

为避免历史 Spec、Review 和提交中的旧相对链接立即失效，少数已完成任务在原路径只保留一个**兼容跳转文件**；历史正文已经移到 `../archive/tasks/`，这些跳转文件不属于 active task：

- `2026-08-28-unified-backtest-v2.md`
- `2026-09-10-backtest-historical-execution-rule-facts.md`
- `2026-09-11-backtest-v2-closure-follow-up.md`
- `2026-09-14-portfolio-valuation-demand-guard.md`
- `2026-09-16-market-bar-series-cache-v2.md`

交易与成交记录系统主任务及 follow-up 仍因现有 T18/历史链接留在当前目录；完成对应当前门禁并统一修正内部引用后再归档，不把它们转成 TODO。

新功能必须成对创建 `docs/specs/YYYY-MM-DD-<topic>.md` 与 `docs/tasks/YYYY-MM-DD-<topic>.md`。如果只是明确的后续想法而尚未立项，先进入 `docs/TODO.md`，不要提前创建长期悬空 Task。
