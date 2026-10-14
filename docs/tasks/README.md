# 当前实施任务

详细实施与验收状态只维护在各 Task；本页按执行性质提供入口，不复制子任务进度。[2026-10-03 状态对账依据](../archive/reviews/2026-10-03-task-state-reconciliation.md)记录旧门禁的承接关系；包含历史未勾选项的文件不自动等于待实施功能。当前义务不能转入 [TODO](../TODO.md)，已完成正文与取消记录见 [archive](../archive/README.md)。

## 尚有实现工作

- [富途研究所需能力接入](2026-10-08-futu-openapi-full-integration.md)
- [交易系统剩余问题与规则能力元数据](2026-08-26-trade-execution-ledger-system-follow-up.md)
- [策略驱动风险规则与 AI 多模型优化](2026-09-09-strategy-risk-ai-optimization.md)
- [全站 UI 与交互统一](2026-09-08-ui-interaction-consistency.md)
- [日线行情与技术指标交互精炼](2026-09-10-market-chart-indicator-integration.md)
- [图表跨日更新、双向加载与截止日期降级](2026-09-17-market-chart-refresh.md)
- [行情详情状态矩阵与读取交互](2026-08-21-market-detail-read-model.md)

## 已有实现，当前验收仍开放

- [统一数据能力适配层](2026-10-09-unified-data-capability-adapter.md)：框架、迁移与已验收机制完成；RQ/Tushare 真实正向条件仍开放，当前不开户、采购或重复相同请求。
- [历史数据按需获取（含交接 Prompt）](2026-10-09-history-data-on-demand.md)：S、D1～D5、跨上市/普通窗口和下载已完成；L3 摘牌正例仍未过，当前停止扩搜，等待新合格输入和明确接续指令。
- [投资组合快照与产品验收](2026-08-28-portfolio-snapshot-system.md)：统一维护受管任务、估值走势/触屏、每日摘要/详情窄屏与真实收益指标的剩余条件，各节按原 Spec 独立验收。
- [AI 接入层与三类业务生成](2026-09-19-vercel-ai-sdk-integration.md)
- [AI Provider 配置与模型用途](2026-09-21-ai-provider-model-usage-configuration.md)
- [AI 输出模式与完整流](2026-09-22-ai-json-mode-stream-validation.md)
- [AI 自动选择与测试后保存](2026-09-23-ai-provider-auto-test-save.md)
- [AI 免费依据移除后的费用/客户端门禁](2026-09-21-remove-ai-free-evidence.md)
- [研究助手任务工作台](2026-08-25-ai-research-workbench.md)
- [账户永久删除](2026-09-14-permanent-account-deletion.md)
- [数据源凭据与逐来源在线验收](2026-09-14-market-provider-credentials.md)
- [自动化执行租约与进程恢复](2026-09-05-automation-execution-lease-hardening.md)
- [录入持仓与账户模式](2026-08-18-position-entry-account-model.md)
- [Mobile 原生联网、视觉与配色验收](2026-08-18-market-data-provider-v1-2-closure-09-mobile-native-acceptance.md)：原 v1.2 父任务、最终汇总与配色剩余条件由同一入口维护，旧协议与历史发布不重复执行。
- [现金资金、划转与定期入账验收](2026-08-30-cash-account-funding-and-transfer.md)：资金/划转原运行条件继续保留，定期入账 Scheduler、通知、宽窄屏与键盘按原 Spec 独立验收。
- [服务端目录聚合的账户/复盘消费](2026-09-18-instrument-directory-server-read-aggregation.md)

## 依赖真实输入的扩展与现行链路承接

- [RouteTarget 历史断言与当前延迟验收](2026-09-16-market-data-route-target-v2.md)
- [消费者历史断言与当前跨模块验收](2026-09-16-market-data-consumer-consistency-v2.md)
- [策略实验历史执行断言与当前交互对账](2026-09-08-strategy-lab-execution-parity.md)

已跳过来源和取消注册不列为必须恢复的动作；多源高级扩展与指定旧资产/历史整手原件追补的取消范围见[现行Spec](../specs/2026-10-03-multi-source-remaining-acceptance.md#scope-cancellation-20261008)，不按旧输入条件自动重启。其他现行任务继续按自己的范围实施，旧接口与兼容门禁保留实际未覆盖断言。

## 已完成、已替代及取消记录

原 v1.2 父任务/最终汇总、涨跌配色、估值走势、每日摘要、收益指标及定期现金入账的原文已归档为“被现有 Task 承接、验收仍开放”。上述当前入口持有全部剩余条件，归档不等于产品完成；历史实施、原勾选和失败保留。

- 共同 ETF 价格交付：[原任务与历史 AC](../archive/tasks/2026-09-25-multi-source-adjustment-aware-backtest.md) · [现行经济模型/复权合同](../specs/2026-09-25-multi-source-adjustment-aware-backtest.md)。原跳过叶和取消范围不再作为当前执行清单，保留的后继交付已收尾。
- 旧历史规则调查：[历史 Task](../archive/tasks/2026-09-16-backtest-real-historical-market-rules.md)；现行规则由[主备合同](../specs/2026-10-06-historical-rules-primary-backup.md)和[P6](../specs/2026-10-07-p6-market-state-expansion.md)承接，原 T1～T5 不重新启动。
- Docker 更新、自动化历史分页、两项 AI 移除及七项 09-27 局部修复的完成记录见[归档目录](../archive/README.md)，仍有效 Spec 保留。

- 每手股数独立路由与富途真实读取：[已完成任务](../archive/tasks/2026-10-08-security-lot-size-routing.md) · [当前合同](../specs/2026-10-08-security-lot-size-routing.md) · [来源/冻结/页面证据](evidence/2026-10-08-security-lot-size-live-acceptance.md)。本次选定富途验收完成，长桥未配置不计实读。

- 多源扩展、历史规则与P6：[多源任务](../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md) · [历史规则任务](../archive/tasks/2026-10-06-historical-rules-primary-backup.md) · [P6任务](../archive/tasks/2026-10-07-p6-market-state-expansion.md) · [当前P6合同](../specs/2026-10-07-p6-market-state-expansion.md) · [最终港股与镜像恢复](evidence/2026-10-08-p6-hk-share-window-acceptance.md)。保留范围完成，取消项及历史未核验事实保留。

- 中国内地公告获取与状态读取：[已完成任务](../archive/tasks/2026-10-07-local-history-library.md) · [当前Spec](../specs/2026-10-07-local-history-library.md)。真实多公司获取、公告列表、停复牌HTTP及镜像固化验证完成。

- 自然语言策略编写：[完整任务](../archive/tasks/2026-09-18-natural-language-strategy-authoring.md) · [现行 Spec](../specs/2026-09-18-natural-language-strategy-authoring.md) · [最终分层证据](evidence/2026-10-06-authoring-completion.md) · [真实浏览器](evidence/2026-10-06-authoring-browser.md)。身份与执行支撑任务分别归档。

- 回测任务生命周期：[已完成任务](../archive/tasks/2026-09-09-backtest-bullmq-lifecycle.md) · [隔离恢复任务](../archive/tasks/2026-10-04-backtest-recovery-parallel.md) · [当前 Spec](../specs/2026-09-09-backtest-bullmq-lifecycle.md) · [最终目标验收](evidence/2026-10-06-backtest-target-lifecycle.md)

- 行情图表周期聚合：[已完成任务](../archive/tasks/2026-09-16-market-chart-period-aggregation.md) · [当前 Spec](../specs/2026-09-16-market-chart-period-aggregation.md) · [最终验收](evidence/2026-10-06-market-period-r1-final-review.md)

- 投资复盘工作台：[已完成任务](../archive/tasks/2026-08-28-journal-review-trade-projection.md) · [契约子任务](../archive/tasks/2026-10-04-journal-review-contracts.md) · [收口任务](../archive/tasks/2026-10-05-journal-review-completion.md) · [当前 Spec](../specs/2026-08-28-journal-review-trade-projection.md) · [最终验收](../archive/reviews/2026-10-05-journal-review-completion.md)

- 基金定投运行时闭环：[已完成任务](../archive/tasks/2026-09-08-recurring-fund-investment.md) · [当前产品 Spec](../specs/2026-09-08-recurring-fund-investment.md)
- 日期精度成本策略边界：[已完成修复](../archive/tasks/2026-10-04-ledger-date-cost-boundary.md)
- 当前 Canonical 链路：[已完成任务](../archive/tasks/2026-09-29-thesis-ledger-canonical-runtime-replacement.md)
- 现金页面 UI：[已完成任务](../archive/tasks/2026-09-03-cash-page-ui-optimization.md)
- 实时行情涨跌展示：[已完成任务](../archive/tasks/2026-09-18-market-quote-change-display.md)
- 巨型组件拆分：[已完成任务](../archive/tasks/2026-08-23-large-component-split.md)
- 风险中心交互：[已完成任务](../archive/tasks/2026-08-23-risk-center-interaction.md)
- 历史建仓时间补录：[已完成任务](../archive/tasks/2026-09-10-trade-opening-boundary-supplement.md)
- RQData 注册与试用：[用户取消记录](../archive/tasks/2026-10-03-rqdata-account-validation.md)
- ETF 适配器内部备用：[历史方案](../archive/tasks/2026-09-08-etf-daily-independent-fallback.md)，由显式 RouteTarget/共同价格替代，不恢复内部跨源回退
- 旧缓存与 Provider 路由 UI：[历史完成记录](../archive/tasks/2026-09-08-market-data-cache-and-provider-routing.md)，现行合同由 Canonical/多源拥有
- 交易与成交记录：[原主任务](../archive/tasks/2026-08-26-trade-execution-ledger-system.md)，当前剩余责任只维护在 follow-up
- 文档状态对账：[治理任务](../archive/tasks/2026-10-03-task-state-reconciliation.md)

当前任务正文从本页入口读取。原始证据、测试输入或邻仓仍引用的少量旧路径仅保留归档链接，不属于当前 Task；无实际引用的跳转文件删除。其他已完成文档从归档目录追溯；尚有当前验收的任务保留原位置。新主题成对创建 Spec/Task，尚未立项且已明确延期的实现才进入 TODO。
