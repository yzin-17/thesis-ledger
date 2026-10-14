# 当前实施任务

详细实施与验收状态只维护在各 Task；本页按执行性质提供入口，不复制子任务进度。[2026-10-03 状态对账依据](../reviews/2026-10-03-task-state-reconciliation.md)记录旧门禁的承接关系；包含历史未勾选项的文件不自动等于待实施功能。当前义务不能转入 [TODO](../TODO.md)，已完成正文与取消记录见 [archive](../archive/README.md)。

## 设计已整理，待实施授权

- [统一数据能力适配层与扩展契约](2026-10-09-unified-data-capability-adapter.md)：分别支持新来源和新能力接入；不改变下方业务任务的完成状态或范围。

## 尚有实现工作

- [历史数据按需获取与研究消费（含交接 Prompt）](2026-10-09-history-data-on-demand.md)
- [富途研究所需能力接入](2026-10-08-futu-openapi-full-integration.md)
- [回测真实历史市场规则来源](2026-09-16-backtest-real-historical-market-rules.md)
- [交易系统剩余问题与规则能力元数据](2026-08-26-trade-execution-ledger-system-follow-up.md)
- [策略驱动风险规则与 AI 多模型优化](2026-09-09-strategy-risk-ai-optimization.md)
- [全站 UI 与交互统一](2026-09-08-ui-interaction-consistency.md)
- [日线行情与技术指标交互精炼](2026-09-10-market-chart-indicator-integration.md)
- [图表跨日更新、双向加载与截止日期降级](2026-09-17-market-chart-refresh.md)
- [行情详情状态矩阵与读取交互](2026-08-21-market-detail-read-model.md)

## 已有实现，当前验收仍开放


- [组合估值走势](2026-09-07-portfolio-valuation-series.md)
- [投资组合快照与受管估值任务](2026-08-28-portfolio-snapshot-system.md)
- [投资组合每日摘要及窄屏行情详情](2026-09-09-portfolio-daily-summary.md)
- [AI 接入层与三类业务生成](2026-09-19-vercel-ai-sdk-integration.md)
- [AI Provider 配置与模型用途](2026-09-21-ai-provider-model-usage-configuration.md)
- [AI 输出模式与完整流](2026-09-22-ai-json-mode-stream-validation.md)
- [AI 自动选择与测试后保存](2026-09-23-ai-provider-auto-test-save.md)
- [AI 免费依据移除后的费用/客户端门禁](2026-09-21-remove-ai-free-evidence.md)
- [研究助手任务工作台](2026-08-25-ai-research-workbench.md)
- [账户永久删除](2026-09-14-permanent-account-deletion.md)
- [涨跌配色跨端验收](2026-09-15-market-color-scheme.md)
- [数据源凭据与逐来源在线验收](2026-09-14-market-provider-credentials.md)
- [自动化执行租约与进程恢复](2026-09-05-automation-execution-lease-hardening.md)
- [录入持仓与账户模式](2026-08-18-position-entry-account-model.md)
- [市场数据产品原生验收主任务](2026-08-18-market-data-provider-v1-2.md)
  - [Mobile 原生联网/视觉](2026-08-18-market-data-provider-v1-2-closure-09-mobile-native-acceptance.md) · [最终证据汇总](2026-08-18-market-data-provider-v1-2-closure-11-final-review.md)
- [现金资金范围与划转](2026-08-30-cash-account-funding-and-transfer.md)
- [定期现金入账](2026-08-30-recurring-cash-deposit-plan.md)
- [服务端目录聚合的账户/复盘消费](2026-09-18-instrument-directory-server-read-aggregation.md)
- [组合收益指标的目标运行时验收](2026-09-09-portfolio-pnl-metrics.md)

## 依赖真实输入的扩展与现行链路承接

- [共同 ETF 价格已完成范围及原 AC/任务追溯](2026-09-25-multi-source-adjustment-aware-backtest.md)
- [RouteTarget 历史断言与当前延迟验收](2026-09-16-market-data-route-target-v2.md)
- [消费者历史断言与当前跨模块验收](2026-09-16-market-data-consumer-consistency-v2.md)
- [策略实验历史执行断言与当前交互对账](2026-09-08-strategy-lab-execution-parity.md)

已跳过来源和取消注册不列为必须恢复的动作；多源高级扩展与指定旧资产/历史整手原件追补的取消范围见[现行Spec](../specs/2026-10-03-multi-source-remaining-acceptance.md#scope-cancellation-20261008)，不按旧输入条件自动重启。其他现行任务继续按自己的范围实施，旧接口与兼容门禁保留实际未覆盖断言。

## 已完成、已替代及取消记录

- 每手股数独立路由与富途真实读取：[已完成任务](../archive/tasks/2026-10-08-security-lot-size-routing.md) · [当前合同](../specs/2026-10-08-security-lot-size-routing.md) · [来源/冻结/页面证据](evidence/2026-10-08-security-lot-size-live-acceptance.md)。本次选定富途验收完成，长桥未配置不计实读。

- 多源扩展、历史规则与P6：[多源任务](../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md) · [历史规则任务](../archive/tasks/2026-10-06-historical-rules-primary-backup.md) · [P6任务](../archive/tasks/2026-10-07-p6-market-state-expansion.md) · [当前P6合同](../specs/2026-10-07-p6-market-state-expansion.md) · [最终港股与镜像恢复](evidence/2026-10-08-p6-hk-share-window-acceptance.md)。保留范围完成，取消项及历史未核验事实保留。

- 中国内地公告获取与状态读取：[已完成任务](../archive/tasks/2026-10-07-local-history-library.md) · [当前Spec](../specs/2026-10-07-local-history-library.md)。真实多公司获取、公告列表、停复牌HTTP及镜像固化验证完成。

- 自然语言策略编写：[完整任务](../archive/tasks/2026-09-18-natural-language-strategy-authoring.md) · [现行 Spec](../specs/2026-09-18-natural-language-strategy-authoring.md) · [最终分层证据](evidence/2026-10-06-authoring-completion.md) · [真实浏览器](evidence/2026-10-06-authoring-browser.md)。身份与执行支撑任务分别归档。

- 回测任务生命周期：[已完成任务](../archive/tasks/2026-09-09-backtest-bullmq-lifecycle.md) · [隔离恢复任务](../archive/tasks/2026-10-04-backtest-recovery-parallel.md) · [当前 Spec](../specs/2026-09-09-backtest-bullmq-lifecycle.md) · [最终目标验收](evidence/2026-10-06-backtest-target-lifecycle.md)

- 行情图表周期聚合：[已完成任务](../archive/tasks/2026-09-16-market-chart-period-aggregation.md) · [当前 Spec](../specs/2026-09-16-market-chart-period-aggregation.md) · [最终验收](evidence/2026-10-06-market-period-r1-final-review.md)

- 投资复盘工作台：[已完成任务](../archive/tasks/2026-08-28-journal-review-trade-projection.md) · [契约子任务](../archive/tasks/2026-10-04-journal-review-contracts.md) · [收口任务](../archive/tasks/2026-10-05-journal-review-completion.md) · [当前 Spec](../specs/2026-08-28-journal-review-trade-projection.md) · [最终验收](../reviews/2026-10-05-journal-review-completion.md)

- 基金定投运行时闭环：[已完成任务](../archive/tasks/2026-09-08-recurring-fund-investment.md) · [当前产品 Spec](../specs/2026-09-08-recurring-fund-investment.md)
- 日期精度成本策略边界：[已完成修复](../archive/tasks/2026-10-04-ledger-date-cost-boundary.md)
- 当前 Canonical 链路：[已完成任务](../archive/tasks/2026-09-29-thesis-ledger-canonical-runtime-replacement.md)
- 现金页面 UI：[已完成任务](../archive/tasks/2026-09-03-cash-page-ui-optimization.md)
- 实时行情涨跌展示：[已完成任务](../archive/tasks/2026-09-18-market-quote-change-display.md)
- 巨型组件拆分：[已完成任务](../archive/tasks/2026-08-23-large-component-split.md)
- 风险中心交互：[已完成任务](../archive/tasks/2026-08-23-risk-center-interaction.md)
- 历史建仓时间补录：[已完成任务](../archive/tasks/2026-09-10-trade-opening-boundary-supplement.md)
- RQData 注册与试用：[用户取消记录](../archive/tasks/2026-10-03-rqdata-account-validation.md)
- ETF 适配器内部备用：[历史方案](2026-09-08-etf-daily-independent-fallback.md)，由显式 RouteTarget/共同价格替代，不恢复内部跨源回退
- 旧缓存与 Provider 路由 UI：[历史完成记录](2026-09-08-market-data-cache-and-provider-routing.md)，现行合同由 Canonical/多源拥有
- 交易与成交记录：[原主任务](2026-08-26-trade-execution-ledger-system.md)，当前剩余责任只维护在 follow-up
- 文档状态对账：[治理任务](../archive/tasks/2026-10-03-task-state-reconciliation.md)

原路径的兼容跳转仅链接归档正文，不属于 active Task。其他已完成文档从归档目录追溯；尚有当前验收的文档保留原位置。新主题成对创建 Spec/Task，尚未立项且已明确延期的实现才进入 TODO。
