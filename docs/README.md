# ThesisLedger 文档导航

这里是主仓文档的唯一入口。文档生命周期遵循[项目指南](DOCUMENTATION-GUIDE.md)；明确延期且尚未立项的功能见 [TODO](TODO.md)，完成与取消记录见[归档](archive/README.md)。DSA 和 infra 各自维护来源实现与部署操作。

## 怎么读

先打开[任务索引](tasks/README.md)选择本次主题，再读 Task 的当前剩余条件。Spec 用来核对要修改的合同；历史 Task、Review 和 evidence 只在验收或追溯时按需打开。保留文档不等于功能没写完，也不要求每次开发读取全部历史。

## 当前重点

先按[全局 P0～P3 排期](tasks/README.md#priority-policy)选择任务；优先级与可执行状态分开，外部条件暂缺不触发重复调用。

- P0 正确性修复：[后台风险估值](tasks/2026-10-18-risk-valuation-correctness.md)、[指标依赖时钟](tasks/2026-10-18-indicator-availability-correctness.md)、[收益/再平衡/目标保存](tasks/2026-10-18-performance-correctness.md)。三个独立主题承接七项已确认修复输入，仅完成建档排期，尚未修改业务代码；原完成项不重开。

剩余任务从[任务索引](tasks/README.md)进入，数量和执行状态以现行 Task 的摘要、剩余条件和证据为准。目录聚合验收已交给交易 follow-up；策略实验一致性验收已交给策略风险/AI Task，各原合同和未通过条件保留。

- 数据供给与研究增强：DSA DG2a/b/c、DG3 和研究 G2a/b 已通过；财联社/见闻市场快讯已完成 DSA、正式 Docker、Market/Web 与保全，见[最新复核](reviews/2026-10-22-market-flash-news-dg3-final-review.md)，任务归档。原 HiThink/AKShare、Yahoo/NVIDIA 个股/发行方新闻按未变输入复用；市场快讯不推断证券关联。G3 的模型、原预算与报告/引用/历史读取条件仍开放。[现行 Spec](specs/2026-10-18-research-evidence-evolution.md) · [优先级与任务](tasks/2026-10-18-research-evidence-evolution.md) · [a-stock-data 后续模块](reviews/2026-10-22-astock-data-module-followups.md)。

- 统一数据能力适配层：框架、迁移与已验收切片完成，RQ/Tushare 正向消费仍受外部条件限制；[通用 Spec](specs/2026-10-09-unified-data-capability-adapter.md) · [来源专属合同（按需读取）](specs/2026-10-09-unified-data-capability-source-contracts.md) · [Task](tasks/2026-10-09-unified-data-capability-adapter.md) · [来源与路由矩阵](reviews/2026-10-10-provider-adaptation-and-route-matrix.md)。不因缺账号或权限自动开户、采购或重复探测。
- 历史数据按需获取：S、跨上市/普通窗口、诊断下载和 D1～D5 已完成，摘牌正向消费保留开放且当前停止扩搜；[Spec](specs/2026-10-09-history-data-on-demand.md) · [Task](tasks/2026-10-09-history-data-on-demand.md)。
- 富途研究能力：报价/图表、历史 1m 子集、首批股票研究冻结及正式镜像已完成；[Spec](specs/2026-10-08-futu-openapi-full-integration.md)继续维护现行范围，[已完成 Task](archive/tasks/2026-10-08-futu-openapi-full-integration.md)仅供追溯，不列当前待办。
- 策略与界面：[策略风险/AI 优化与实验承接验收](tasks/2026-09-09-strategy-risk-ai-optimization.md) · [交易 follow-up](tasks/2026-08-26-trade-execution-ledger-system-follow-up.md) · [全站 UI](tasks/2026-09-08-ui-interaction-consistency.md)。
- 页面一致性与交互恢复（Web 已完成）：[Spec](specs/2026-10-19-ui-consistency-and-interaction-recovery.md) · [已完成 Task](archive/tasks/2026-10-19-ui-consistency-and-interaction-recovery.md) · [修复与独立验收](reviews/2026-10-19-ui-consistency-and-density-audit.md#web-recovery-20261020)。状态恢复、页面结构和覆盖缺口已收口；真实业务门禁保持原领域归属。
- AI：[SDK、完整业务与输出模式](tasks/2026-09-19-vercel-ai-sdk-integration.md) · [配置、用途、测试后保存与费用](tasks/2026-09-21-ai-provider-model-usage-configuration.md) · [研究工作台真实业务与交互](tasks/2026-08-25-ai-research-workbench.md#运行时验收门禁未完成)维护各自剩余条件，真实模型继续暂停。[统一页面配置实施记录](archive/tasks/2026-10-19-ai-provider-database-only.md)已完成归档，[数据库唯一来源 Spec](specs/2026-10-19-ai-provider-database-only.md)继续有效；已过证据按相同断言复用。
- Portfolio、Cash、Market Consumer 与客户端的未覆盖产品/运行断言继续保留在[任务索引](tasks/README.md)；Scheduler 进程验收已完成归档，其证据不替代各业务的外部通知或来源条件。

## 现行合同与架构

实施 Task 归档后，仍有效的产品 Spec 继续保留：

- AI 模型目录：[通用模型发现](specs/2026-09-15-ai-provider-model-discovery.md) · [用户手动目录配置](specs/2026-10-26-provider-model-catalog-configuration.md)；实现状态与分层验收从对应 Spec 的任务进入。
- 手机端：[Android / iOS 使用说明](guides/2026-10-25-mobile-client.md) · [Web 至手机迁移 Spec](specs/2026-10-22-web-mobile-feature-parity.md) · [分批实施与平台验收](tasks/2026-10-22-web-mobile-feature-parity.md)。
- 当前运行链、API 与所有权：[Canonical](architecture/canonical-runtime.md) · [版本矩阵](architecture/version-matrix.md) · [Server 模块边界](architecture/2026-09-02-server-module-boundaries.md)。
- 价格/数量/复权与冻结研究：[经济模型与价格 Spec](specs/2026-09-25-multi-source-adjustment-aware-backtest.md)；取消与保留范围以[10-08 决定](specs/2026-10-03-multi-source-remaining-acceptance.md#scope-cancellation-20261008)为准。
- 数据来源：[路由领域语义](domain/2026-09-16-provider-routing-and-reliability.md) · [自主选择](specs/2026-10-07-market-route-user-choice.md) · [精确检查](specs/2026-10-07-all-provider-exact-checks.md) · [凭据任务](tasks/2026-09-14-market-provider-credentials.md)。
- 研究产品：[策略中心](specs/2026-09-17-strategy-center-ux-consolidation.md) · [自然语言策略编写](specs/2026-09-18-natural-language-strategy-authoring.md) · [投资复盘](specs/2026-08-28-journal-review-trade-projection.md) · [Journal 使用说明](guides/2026-10-04-journal-review.md) · [研究默认模型配置](specs/2026-10-19-research-default-model-placement.md)。
- 行情与实际数量：[图表交互](specs/2026-09-10-market-chart-indicator-integration.md) · [更新与截止日期](specs/2026-09-17-market-chart-refresh.md) · [周期聚合](specs/2026-09-16-market-chart-period-aggregation.md) · [NAV 执行](specs/2026-10-01-n3-nav-worker.md) · [每手股数](specs/2026-10-08-security-lot-size-routing.md) · [P6](specs/2026-10-07-p6-market-state-expansion.md)。
- 费用、状态与公告：[历史规则主备](specs/2026-10-06-historical-rules-primary-backup.md) · [资料展示](specs/2026-10-07-local-history-package-display.md) · [按需获取](specs/2026-10-07-local-history-library.md) · [回测公告准备与每日更新](specs/2026-10-08-announcement-preparation.md) · [四证券有界扩展](specs/2026-10-08-history-announcement-proof-expansion.md)。
- 基金定投与成本：[定投合同](specs/2026-09-08-recurring-fund-investment.md) · [成本时间边界](specs/2026-10-04-ledger-date-cost-boundary.md)。

## 目录说明

| 目录                                                                           | 用途                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [specs/](specs/)                                                               | 现行需求、行为合同、范围与验收标准                                  |
| [tasks/](tasks/)                                                               | 当前实施与独立验收；短归档跳转不属于当前任务                        |
| [TODO.md](TODO.md)                                                             | 明确延期且尚未正式立项的功能                                        |
| [architecture/](architecture/) · [domain/](domain/) · [adr/](adr/)             | 当前架构、领域不变量与已接受决策                                    |
| [engineering/](engineering/) · [operations/](operations/) · [guides/](guides/) | 工程约束、运维入口与使用说明                                        |
| [reviews/](reviews/README.md) · [benchmarks/](benchmarks/)                     | 当前查阅报告与可复跑基准；历史运行记录进入 archive，进度回查原 Task |
| [archive/](archive/)                                                           | 已完成、取消、被替代及历史实施记录                                  |

## 当前主链路

- 真实账户由 Ledger 持久信封版本 3 的经济事实生成 Position、Trade、Cash 投影，供 Portfolio/Journal 消费。
- 当前 V3 Run 经持久状态与 Worker 执行，使用不可变 Snapshot、模拟成交/账本与结果，不能写入真实 Ledger。
- Market 消费标准能力、保存的主备和来源事实；DSA 拥有来源适配与有效控制，缓存和冻结各自保留身份、时钟与未知状态。

## 历史文档

已完成和取消的任务从[归档入口](archive/README.md)追溯。09-25 多源主任务、旧历史规则调查与内部 ETF 回退已经退出当前执行入口；现行价格合同和取消决定保留。历史未勾选、旧环境或失败不触发重新实施。

仅原始证据、测试输入或邻仓仍需要的旧路径保留短跳转；它们不属于当前任务或合同。一次性 Review 与被后继合同承接的 Spec 从归档查阅。

2026-10-03 [状态对账](archive/reviews/2026-10-03-task-state-reconciliation.md)只记录当时基线；后续状态以原 Task 的最新证据为准。新功能按指南建立 Spec/Task；当前验收不能转入 TODO。
