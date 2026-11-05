# ThesisLedger 文档导航

这里是主仓文档的唯一入口。文档生命周期遵循[项目指南](DOCUMENTATION-GUIDE.md)；明确延期且尚未立项的功能见 [TODO](TODO.md)，完成与取消记录见[归档](archive/README.md)。DSA 和 infra 各自维护来源实现与部署操作。

## 怎么读

先打开[任务索引](tasks/README.md)选择本次主题，再读 Task 的当前剩余条件。Spec 用来核对要修改的合同；历史 Task、Review 和 evidence 只在验收或追溯时按需打开。保留文档不等于功能没写完，也不要求每次开发读取全部历史。

## 当前重点

先按[全局 P0～P3 排期](tasks/README.md#priority-policy)选择任务；优先级与可执行状态分开，外部条件暂缺不触发重复调用。

- P0 正确性修复：[后台风险估值](archive/tasks/2026-10-18-risk-valuation-correctness.md)、[指标依赖时钟](archive/tasks/2026-10-18-indicator-availability-correctness.md)、[收益/再平衡/目标保存](archive/tasks/2026-10-18-performance-correctness.md)。三个独立主题已完成正式目标及Web验收并归档；现行Spec继续有效，原完成项不重开。

剩余任务从[任务索引](tasks/README.md)进入，数量和执行状态以现行 Task 的摘要、剩余条件和证据为准。目录聚合验收已交给交易 follow-up；策略实验一致性验收已交给策略风险/AI Task，各原合同和未通过条件保留。

- 数据供给与研究增强：DSA DG2a/b/c、DG3、研究G2a/b及G3现行V2模型/报告/引用/历史读取已通过；财联社/见闻市场快讯已完成DSA、正式Docker、Market/Web与保全，见[来源复核](reviews/2026-10-22-market-flash-news-dg3-final-review.md)，任务归档。原HiThink/AKShare、Yahoo/NVIDIA个股/发行方新闻按未变输入复用；市场快讯不推断证券关联。研究比较、not_due/幂等/历史与范围已验；11-05收盘后最早观察窗口已到期，100个境内价格窗口未变，合格经济价格正向条件仍按所属任务保留，用户确认不降低门槛，旧模型预算保持冻结，见[最新真实数据核对](tasks/evidence/2026-11-05-fund-and-research-real-data-gates.md)。**研究阶段化评估已完成：保留单链，不实施生产三阶段**，见[决策结论](specs/2026-10-18-research-evidence-evolution.md#p3-decision-20261103)。[现行Spec](specs/2026-10-18-research-evidence-evolution.md) · [任务](tasks/2026-10-18-research-evidence-evolution.md) · [a-stock-data模块对照](reviews/2026-10-22-astock-data-module-followups.md)。

- 统一数据能力适配层：框架、迁移与已验收切片完成，RQ/Tushare 正向消费仍受外部条件限制；[通用 Spec](specs/2026-10-09-unified-data-capability-adapter.md) · [来源专属合同（按需读取）](specs/2026-10-09-unified-data-capability-source-contracts.md) · [Task](tasks/2026-10-09-unified-data-capability-adapter.md) · [来源与路由矩阵](reviews/2026-10-10-provider-adaptation-and-route-matrix.md)。不因缺账号或权限自动开户、采购或重复探测。 [来源凭据配置](archive/tasks/2026-09-14-market-provider-credentials.md)已完成最终Review；Longbridge后续范围仍由TODO持有。
- 历史数据按需获取：S/L、跨上市及摘牌消费、实际诊断下载和 D1～D5 有界研究均已验收，10-31归档；[Spec](specs/2026-10-09-history-data-on-demand.md) · [已归档Task](archive/tasks/2026-10-09-history-data-on-demand.md) · [最后验收证据](tasks/evidence/2026-10-31-history-demand-l3v.md)。
- 富途研究能力：报价/图表、历史 1m 子集、首批股票研究冻结及正式镜像已完成；[Spec](specs/2026-10-08-futu-openapi-full-integration.md)继续维护现行范围，[已完成 Task](archive/tasks/2026-10-08-futu-openapi-full-integration.md)仅供追溯，不列当前待办。
- 策略与界面：[策略风险/AI现行规格](specs/2026-09-09-strategy-risk-ai-optimization.md) · [已归档实施记录](archive/tasks/2026-09-09-strategy-risk-ai-optimization.md) · [交易 follow-up](archive/tasks/2026-08-26-trade-execution-ledger-system-follow-up.md) · [全站UI完成记录](archive/tasks/2026-09-08-ui-interaction-consistency.md)。
- 页面一致性与交互恢复（Web 已完成）：[Spec](specs/2026-10-19-ui-consistency-and-interaction-recovery.md) · [已完成 Task](archive/tasks/2026-10-19-ui-consistency-and-interaction-recovery.md) · [修复与独立验收](reviews/2026-10-19-ui-consistency-and-density-audit.md#web-recovery-20261020)。状态恢复、页面结构和覆盖缺口已收口；真实业务门禁保持原领域归属。
- AI：[配置、用途与测试后保存当前范围](archive/tasks/2026-09-21-ai-provider-model-usage-configuration.md)完成最终Review并归档；用户明确将[实际正金额费用验收](TODO.md#ai-provider-positive-cost-acceptance)延期，未计通过，费用上限0保持。[范围决定与逐项复核](tasks/evidence/2026-11-01-ai-fee-deferral-and-closeout.md)保留原失败/未知及费用区别。SDK原48项/JSON Mode12项、工作台和T19均已归档；[统一页面配置实施记录](archive/tasks/2026-10-19-ai-provider-database-only.md)及[数据库唯一来源Spec](specs/2026-10-19-ai-provider-database-only.md)继续按原范围使用。
- Portfolio、Cash、Market Consumer 与客户端的未覆盖产品/运行断言继续保留在[任务索引](tasks/README.md)；Scheduler 进程验收已完成归档，其证据不替代各业务的外部通知或来源条件。

## 现行合同与架构

实施 Task 归档后，仍有效的产品 Spec 继续保留：

- 标的名称：[统一读取合同](specs/2026-11-04-instrument-display-read-model.md) · [已完成实施记录](archive/tasks/2026-11-04-instrument-display-read-model.md)；当前名称在 Server 批量解析，历史快照保留冻结语义。

- AI 模型目录：[通用模型发现](specs/2026-09-15-ai-provider-model-discovery.md) · [用户手动目录配置](specs/2026-10-26-provider-model-catalog-configuration.md)；实现状态与分层验收从对应 Spec 的任务进入。
- 手机端：[Android / iOS 使用说明](guides/2026-10-25-mobile-client.md) · [Web 至手机迁移 Spec](specs/2026-10-22-web-mobile-feature-parity.md) · [迁移验收归档](archive/tasks/2026-10-22-web-mobile-feature-parity.md) · [最终审查](reviews/2026-10-30-web-mobile-parity-final-review.md)。
- 当前运行链、API 与所有权：[Canonical](architecture/canonical-runtime.md) · [版本矩阵](architecture/version-matrix.md) · [Server 模块边界](architecture/2026-09-02-server-module-boundaries.md)。
- 价格/数量/复权与冻结研究：[经济模型与价格 Spec](specs/2026-09-25-multi-source-adjustment-aware-backtest.md)；取消与保留范围以[10-08 决定](specs/2026-10-03-multi-source-remaining-acceptance.md#scope-cancellation-20261008)为准。
- 数据来源：[路由领域语义](domain/2026-09-16-provider-routing-and-reliability.md) · [自主选择](specs/2026-10-07-market-route-user-choice.md) · [精确检查](specs/2026-10-07-all-provider-exact-checks.md) · [凭据任务](archive/tasks/2026-09-14-market-provider-credentials.md)。
- 市场资料：[查询说明](market-reference.md) · [当前规格](specs/2026-11-03-market-reference-data.md) · [衍生品与可转债复核及 63 类范围](reviews/2026-11-04-astock-derivative-reference.md)。原 47 类证据继续复用，新增 16 类的分层验收见[当前证据](tasks/evidence/2026-11-04-astock-derivative-reference.md)，按需查询沿用现有来源配置。 来源是否已测、未测范围和四组备用路径差异见[来源覆盖核对](reviews/2026-11-04-astock-source-coverage.md)。
- 研究产品：[策略中心](specs/2026-09-17-strategy-center-ux-consolidation.md) · [自然语言策略编写](specs/2026-09-18-natural-language-strategy-authoring.md) · [投资复盘](specs/2026-08-28-journal-review-trade-projection.md) · [Journal 使用说明](guides/2026-10-04-journal-review.md) · [研究默认模型配置](specs/2026-10-19-research-default-model-placement.md)。
- 行情与实际数量：[图表交互](specs/2026-09-10-market-chart-indicator-integration.md) · [更新与截止日期](specs/2026-09-17-market-chart-refresh.md) · [周期聚合](specs/2026-09-16-market-chart-period-aggregation.md) · [NAV 执行](specs/2026-10-01-n3-nav-worker.md) · [每手股数](specs/2026-10-08-security-lot-size-routing.md) · [P6](specs/2026-10-07-p6-market-state-expansion.md)。
- 费用、状态与公告：[历史规则主备](specs/2026-10-06-historical-rules-primary-backup.md) · [资料展示](specs/2026-10-07-local-history-package-display.md) · [按需获取](specs/2026-10-07-local-history-library.md) · [回测公告准备与每日更新](specs/2026-10-08-announcement-preparation.md) · [四证券有界扩展](specs/2026-10-08-history-announcement-proof-expansion.md)。
- 基金定投与成本：[定投合同](specs/2026-09-08-recurring-fund-investment.md) · [成本时间边界](specs/2026-10-04-ledger-date-cost-boundary.md)。

## 目录说明

基金盘中估值：[现行规格](specs/2026-11-04-fund-intraday-valuation.md) · [当前任务](tasks/2026-11-04-fund-intraday-valuation.md) · [验收记录](reviews/2026-11-04-fund-intraday-valuation.md)。11-05现有HiThink快照/qfq最小读取通过，费用未核实；000001官方披露参考已生产接入并通过真实持仓及Server契约核验，配置保持修订188。真实有效分钟和同日正式净值误差仍开放，见[最新执行](tasks/evidence/2026-11-05-hithink-direct-and-disclosure.md)。

桌面九个主页面的[刷新合同](specs/2026-11-04-desktop-refresh-consistency.md)定义顶部入口、活动查询范围与独立操作，逐页盘点和验证边界见[已归档任务](archive/tasks/2026-11-04-desktop-refresh-consistency.md)。

桌面列表的[列对齐规格](specs/2026-11-04-desktop-list-column-alignment.md)统一文字、数字、状态与操作方向；完整表格盘点、宽窄屏和详情验证见[排查记录](tasks/evidence/2026-11-04-desktop-list-column-alignment.md)及[已归档任务](archive/tasks/2026-11-04-desktop-list-column-alignment.md)。

账户数据的[成交与定投分区规格](specs/2026-11-05-account-data-transactions-investments.md)定义独立定投页签、成交展示、行内操作与来源定位；本地 Web 的验证结果和边界见[验收记录](tasks/evidence/2026-11-05-account-data-transactions-investments.md)及[已归档任务](archive/tasks/2026-11-05-account-data-transactions-investments.md)。

账户数据采用[单账户范围](specs/2026-11-05-account-data-single-account.md)，恢复当前模式最近账户，并兼容旧全部账户地址；跨账户汇总由投资组合承担。见[验收记录](tasks/evidence/2026-11-05-account-data-single-account.md)与[归档任务](archive/tasks/2026-11-05-account-data-single-account.md)。

现金页面的[布局规格](specs/2026-11-05-cash-page-layout.md)定义余额主次、紧凑空状态、流水列及定期入账分组；本地组件与固定数据浏览器验证见[基础验收](reviews/2026-11-05-cash-page-layout.md)及[定期入账分组验收](reviews/2026-11-05-recurring-cash-layout.md)，实施见[已归档任务](archive/tasks/2026-11-05-cash-page-layout.md)。

桌面业务列表的[边框规格](specs/2026-11-05-desktop-list-frame-consistency.md)按独立表格、卡片内列表、只读行和复杂对象统一边界；全部表格声明及列表族盘点、三个布局宽度与运行态限制见[验收记录](tasks/evidence/2026-11-05-desktop-list-frame-consistency.md)和[已归档任务](archive/tasks/2026-11-05-desktop-list-frame-consistency.md)。

交易标的下拉的[现行规格](specs/2026-11-04-portfolio-trade-instrument-filter.md)定义完整历史选项及稳定加载，实施与本地 API/Web 证据见[已归档任务](archive/tasks/2026-11-04-portfolio-trade-instrument-filter.md)。

基金行情详情的[现行规格](specs/2026-11-04-market-detail-pnl-diagnostics.md)定义陈旧原因与净值/累计盈亏双轴同图，实施和本地 Web/API 证据见[已归档任务](archive/tasks/2026-11-04-market-detail-pnl-diagnostics.md)。

累计盈亏图表的[现行规格](specs/2026-11-04-portfolio-pnl-chart.md)定义历史口径、账户联动和缺口展示，实施与本地运行态证据见[已归档任务](archive/tasks/2026-11-04-portfolio-pnl-chart.md)。

投资组合的当前[账户筛选规格](specs/2026-11-04-portfolio-account-filter.md)定义页面范围，实施与本地 Web 验证见[已归档任务](archive/tasks/2026-11-04-portfolio-account-filter.md)。

| 目录                                                                           | 用途                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [specs/](specs/)                                                               | 现行需求、行为合同、范围与验收标准                                  |
| [tasks/](tasks/)                                                               | 当前实施与独立验收；已归档任务从归档入口查阅                        |
| [TODO.md](TODO.md)                                                             | 明确延期且尚未正式立项的功能                                        |
| [architecture/](architecture/) · [domain/](domain/) · [adr/](adr/)             | 当前架构、领域不变量与已接受决策                                    |
| [engineering/](engineering/) · [operations/](operations/) · [guides/](guides/) | 工程约束、运维入口与使用说明                                        |
| [reviews/](reviews/README.md) · [benchmarks/](benchmarks/)                     | 当前查阅报告与可复跑基准；历史运行记录进入 archive，进度回查原 Task |
| [archive/](archive/)                                                           | 已完成、取消、被替代及历史实施记录                                  |

收益分析的[统一工作区规格](specs/2026-11-05-performance-workspace.md)定义“组合概览、收益分析、配置目标、交易”四个页签、共享账户及旧地址跳转；资产总值与累计盈亏按[同图规格](specs/2026-11-05-combined-performance-trend.md)共享区间与时间轴；入口合并的本地计算与交互保留、包回归和固定数据浏览器证据见[验收记录](reviews/2026-11-05-performance-workspace.md)，实施状态见[任务](archive/tasks/2026-11-05-performance-workspace.md)。

配置中的[负现金处理](specs/2026-11-05-negative-cash-allocation.md)沿用带符号余额和净资产分母；本机接口与页面修复证据见[验收记录](reviews/2026-11-05-negative-cash-allocation.md)。
新增成交按[现金写入准入](specs/2026-11-05-execution-cash-admission.md)校验本金、费用及可用资金，历史金额保持原样；验收结果见[记录](reviews/2026-11-05-execution-cash-admission.md)。

## 当前主链路

- 真实账户由 Ledger 持久信封版本 3 的经济事实生成 Position、Trade、Cash 投影，供 Portfolio/Journal 消费。
- 当前 V3 Run 经持久状态与 Worker 执行，使用不可变 Snapshot、模拟成交/账本与结果，不能写入真实 Ledger。
- Market 消费标准能力、保存的主备和来源事实；DSA 拥有来源适配与有效控制，缓存和冻结各自保留身份、时钟与未知状态。

## 历史文档

已完成和取消的任务从[归档入口](archive/README.md)追溯。09-25 多源主任务、旧历史规则调查与内部 ETF 回退已经退出当前执行入口；现行价格合同和取消决定保留。历史未勾选、旧环境或失败不触发重新实施。

任务索引、正文和跨仓引用直接指向归档任务，`tasks/` 保留当前任务与支撑资料。一次性 Review 与被后继合同承接的 Spec 从归档查阅。

2026-10-03 [状态对账](archive/reviews/2026-10-03-task-state-reconciliation.md)只记录当时基线；后续状态以原 Task 的最新证据为准。新功能按指南建立 Spec/Task；当前验收不能转入 TODO。

行情图表、交易叠加、ETF收费及规则监测的当前行为见[使用说明](guides/market-chart-and-rule-monitor.md)和[总体规格](specs/2026-11-04-todo-4-15-delivery.md)；原TODO第4～15项的独立验收见[归档任务](archive/tasks/2026-11-04-todo-4-15-delivery.md)及[最终证据](tasks/evidence/2026-11-05-todo-4-15-final-acceptance.md)。
