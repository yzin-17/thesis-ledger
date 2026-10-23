# 历史文档归档

- 2026-10-23 [研报长期按需读取](tasks/2026-10-23-research-report-on-demand.md)完成日期可选的 v2 合同、标准错误投影与来源空日期字段兼容、保留数据完整更新及目标无日期单页验收；采集 201、2 条/来源总数 772，新旧历史 200，旧快照摘要不变。原来源启停、20 条路由、11 张受保护业务表与挂载保持，用户确认的预期修改保留。[现行 Spec](../specs/2026-10-23-research-report-on-demand.md)与[完整证据](../tasks/evidence/2026-10-23-research-report-on-demand.md)保留，当前按需读取不再依赖首次 24 小时验收记录。

- 2026-10-23 [研报最小元数据](tasks/2026-10-23-research-report-metadata.md)完成单标单页采证、限定范围首次准入、单条路由、真实采集、引用/本地历史及同一 Server 重启留存；用户确认的并发账户新增保留，原数据、凭据及原路由保护通过。[现行 Spec](../specs/2026-10-23-research-report-metadata.md)与[完整证据](../tasks/evidence/2026-10-23-research-report-metadata.md)保留，模型研究与全历史边界保持。

- 2026-10-22 [财联社与见闻市场快讯](tasks/2026-10-22-market-flash-news-dg3.md)完成；独立市场快讯合同、两家 DSA/Docker/Market/Web 与原数据保全通过，原个股新闻和研究 G3 边界保持；其他模块已入后续 TODO。
- 2026-10-22 [Yahoo 新闻接入与 DG3 扩展](tasks/2026-10-22-yahoo-news-dg3.md)完成；NVDA.US 的 Yahoo V3/Market/Web、零尝试拒绝与保全通过，原 NVIDIA 作为备用，HiThink/AKShare 和研究边界保持。
- 2026-10-22 [HiThink 新闻接入与 Yahoo 验证](tasks/2026-10-22-hithink-yahoo-news.md)完成；HiThink 目标 V3/Market/Web 与保全通过，Yahoo Search 的宿主/目标样本验证通过，原来源和研究边界保留。

- 2026-10-22 [现有来源新闻接入](tasks/2026-10-22-existing-source-news.md)复用已启用 AKShare，完成 A 股样本、目标 V3/Market/Web、精确准入及原数据保护；原 NVIDIA 证据继续复用。

- 2026-10-22 [免费官方新闻与 DG3 接入](tasks/2026-10-22-free-news-dg3.md)和 [DSA 纯数据服务](../../../daily-stock-analysis/docs/archive/tasks/2026-10-18-data-only-service.md)完成全部适用叶并归档；单发行方实源、实际 Web 与原数据保全通过，研究 G3 的模型及发布条件保持。

- 2026-10-22 [账户与持仓录入](tasks/2026-08-18-position-entry-account-model.md#最终一致性-review)完成 T12/T13 与现行九项 AC 的最终核对，复用已有账户、基金、草稿/对账及原生证据，通过后归档；[现行 Spec](../specs/2026-08-18-position-entry-account-model.md)保留，原数据与审计不变。
- 2026-10-21 三份 P0 正确性任务全部目标/Web 条件完成：[风险估值](tasks/2026-10-18-risk-valuation-correctness.md)、[指标可用性](tasks/2026-10-18-indicator-availability-correctness.md)、[收益正确性](tasks/2026-10-18-performance-correctness.md)；现行 Spec 保留，不重跑未变输入。
- 2026-10-21 [组合快照与走势](tasks/2026-08-28-portfolio-snapshot-system.md)、[基金复权](tasks/2026-10-21-fund-adjusted-returns.md)及[规则精确时钟](tasks/2026-10-21-trade-rule-evidence-clock.md)完成对应独立条件；合格权威规则生产、未开放账户入口和其他原领域门禁继续由各自父 Task 持有。
- 2026-10-21 AI 非生成差集完成：[显式价格迁移](tasks/2026-10-21-ai-provider-pricing-migration.md)、[冻结历史保留](tasks/2026-10-21-ai-provider-history-preservation.md)、[混合模型与认证方式](tasks/2026-10-21-ai-controlled-config-web.md)、[带凭证类型转换](tasks/2026-10-21-ai-credential-type-conversion.md)、[默认引用原子清除](tasks/2026-10-21-ai-default-lifecycle-target.md)。原配置 T2.5 收口，真实认证/生成/费用和业务仍暂停。
- 2026-10-21 [Automation 真实行情组合](tasks/2026-10-21-automation-market-consumer.md)与[RouteTarget 主源冷态](tasks/2026-10-21-route-cold-primary.md)完成；共同消费者 G1 关闭，故障备用仍按原暂停保留。所有专属账户归零停用，原数据保留。

本目录保存仍有审计、迁移或历史决策价值，但不再作为当前实现依据的文档。

| 目录                             | 内容                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [`specs/`](specs/)               | 旧版 Investment OS / Provider 规格、已完成架构改进，以及被当前 Snapshot / Trade Projection 等方案取代的历史规格 |
| [`tasks/`](tasks/)               | 已完成任务、旧阶段任务、历史迁移、被取代的任务，以及已经关闭当前运行时验收的专项任务                            |
| [`reviews/`](reviews/)           | 历史一致性 Review、一次性 closure/发布执行记录和被新版复核取代的 Review                                         |
| [`architecture/`](architecture/) | 被当前架构 SSOT 取代的实现说明、DSA 详细历史审计和旧 Traceability                                               |
| [`domain/`](domain/)             | 被合并或取代的领域说明和一次性 Domain Model 审计                                                                |

归档文档可以被历史 Review 引用，但不能作为新实现的需求、接口或运行状态真源。若要删除归档内容，必须先确认 Git 历史或外部证据已满足保留要求。

近期归档包括：

- 2026-10-20 [页面一致性与交互恢复](tasks/2026-10-19-ui-consistency-and-interaction-recovery.md)：R1～R20、V1～V6、C1～C3、G1～G3 的 Web 实施与独立验收完成；当前任务正文 17→16。[现行 Spec](../specs/2026-10-19-ui-consistency-and-interaction-recovery.md)与[最终记录](../reviews/2026-10-19-ui-consistency-and-density-audit.md#web-recovery-20261020)保留，真实模型、新闻和领域实源门禁仍由原任务持有；旧路径只保留兼容跳转。

- 2026-10-20 [AI 服务统一页面配置](tasks/2026-10-19-ai-provider-database-only.md)：本地、同一目标镜像保留副本及获准临时配置的目标 Web 保存/删除还原均通过，原配置、默认、密文和业务数据保持。当前 Task 正文 18→17；[现行 Spec](../specs/2026-10-19-ai-provider-database-only.md)保留，其他 AI 真实用途门禁继续归原 Task 且暂停。[分层证据](../tasks/evidence/2026-10-19-ai-provider-database-only.md#2026-10-20-获准目标-web-保存与最终复核)保留原路径，旧 Task 路径只保留兼容跳转。

- 2026-10-17 [Scheduler 执行租约](tasks/2026-09-05-automation-execution-lease-hardening.md)：当前镜像内专用执行进程的 SIGKILL、租约恢复、双实例竞争、旧 owner fencing 和 unknown-outcome 不重放通过，当前 Task 正文 13→12。现行 Spec 保留，Cash 的真实处理器补期结果共用[一份证据](../tasks/evidence/2026-10-16-cash-runtime-acceptance.md#10-17-scheduler-进程与现金补期恢复)，外部通知继续开放。

- 2026-10-17 [图表交互与更新](tasks/2026-09-10-market-chart-indicator-integration.md)：跨日重开、V3 整窗乱序隔离、在途去重、失败恢复、同日修订和真实截止日期降级已补齐，当前 Task 正文 14→13。现行指标/更新 Spec 保留；稳定盘中日线继续留在原 TODO，不新增跳转文件。见[逐项证据](../tasks/evidence/2026-10-16-market-detail-chart-acceptance.md#10-17-图表更新与截止日期补验)。

- 2026-10-17 [富途研究能力](tasks/2026-10-08-futu-openapi-full-integration.md)：报价/图表、历史 1m 与首批腾讯/苹果 qfq 研究冻结已完成；正式重建后的 22 份输入及两份快照各两次断网重放通过，最后的镜像条件关闭。当前 Task 正文 15→14，无新增跳转文件；[Spec](../specs/2026-10-08-futu-openapi-full-integration.md)保留现行合同，[最终证据](../tasks/evidence/2026-10-15-futu-minute-integration.md#2026-10-17-研究镜像固化与重建后复验)保留失败、范围与数据保护边界。

- 2026-10-16 [行情详情读模型](tasks/2026-08-21-market-detail-read-model.md)及四份子 Ticket：完整资产/状态、Network、失败恢复、取消、宽窄屏与一致性通过；修复窄屏裁切、报价币种/精度与净值 ISO 日期崩溃。[现行 Spec](../specs/2026-08-21-market-detail-read-model.md)继续保留；实源、受控样本和后继图表/分钟范围分别记账。

- 2026-10-16 [账户永久删除](tasks/2026-09-14-permanent-account-deletion.md)：三端具名确认、失败保留、真实删除、防重及空态分层验收通过，仅删除用户当次确认的三个空测试账户；原有账户与历史数据保持。[现行合同](../specs/2026-09-14-permanent-account-deletion.md)继续保留。

- 2026-10-15 第七轮三份大 Task 精简：[实施与完整性记录](tasks/2026-10-14-docs-large-document-cleanup.md#第七轮三份大-task-精简)。统一适配层删除已有历史承载的 193 条完成摘要；历史按需的阶段定义补存原历史，当前只留摘牌正向条件；[研究助手完整原文](tasks/2026-08-25-ai-research-workbench-history.md)与 23 项 AC 映射按需追溯。三份当前正文 99,330 → 21,160 字节；18 个当前任务入口及未通过验收保留。

- 2026-10-15 第六轮证据状态与验收接续：[实施与验证记录](tasks/2026-10-14-docs-large-document-cleanup.md#第六轮证据状态纠正与验收接续)。T17 后继数据库、Portfolio 已完成修复及当前 CI/Android 状态纠正；目录聚合和策略实验一致性分别交给现行交易、策略风险/AI Task 后归档。当前正文 20 → 18，原合同、未通过条件与历史原文保留，没有新增兼容文件。

- 2026-10-15 第五轮 Task 精简与合并：[实施与验证记录](tasks/2026-10-14-docs-large-document-cleanup.md#第五轮task-精简与合并)。三份大 Task 和指标 Task 的完成日志保留为历史记录；六份同域 Task 由四个现有入口承接，全部原合同与未通过条件保留。当前正文 26 → 20，兼容 Task 14 → 6；15 个只需文档导航的跳转文件在改为直接归档链接后删除。测试输入、脚本和邻仓仍需的兼容路径继续保留。

- 2026-10-15 当前 Task 承接：[实施与验证记录](tasks/2026-10-14-docs-large-document-cleanup.md#第四轮当前-task-承接)。7 份父任务或同域验收记录由现有 Mobile、投资组合、现金任务承接后归档，验收仍开放。各原 Spec、未通过条件及历史证据保留；没有增加新的当前 Task 文件。

- 2026-10-14 第三轮入口清理：[实施与验证记录](tasks/2026-10-14-docs-large-document-cleanup.md#第三轮跳转与历史入口清理)。34 份历史 Review 和 8 份旧 Spec 退出当前正文；删除 47 个无实际引用跳转，两份反向跳转由真实归档正文替换。仍被原始证据、测试输入和邻仓引用的兼容入口保留，当前合同和未通过验收继续由原 Spec/Task 管理。

- 2026-10-14 第二轮巨型文档与重复证据精简：[实施与验证记录](tasks/2026-10-14-docs-large-document-cleanup.md)。三份 Task 的详细执行历史及六份一次性报告按原主题保留；来源专属约束仍是现行合同，按需查阅附页。S05 原件迁出 Markdown 正文，解码字节与原摘要一致；相同 Android XML 只保留规范副本。未通过验收继续留在当前 Task。

- 2026-10-14 当前入口治理：[实施与验证记录](tasks/2026-10-14-docs-current-entry-cleanup.md)。16 份历史 Task 退出当前执行入口：09-25 多源、Docker 更新、自动化历史分页、两份 AI 配置移除、ETF 内部备用、七份 09-27 修复、交易主任务、旧历史规则、缓存与路由。ETF 旧备用及旧历史规则 Spec 一并归档，其余 Spec 保留；取消、跳过与未验证记录不改为通过。原始证据保持原路径与字节。

- 每手股数独立路由：[已完成任务](tasks/2026-10-08-security-lot-size-routing.md)，当前选择富途的真实股数、模型冻结及页面/下载通过；[现行Spec](../specs/2026-10-08-security-lot-size-routing.md)保留，[验收证据](../tasks/evidence/2026-10-08-security-lot-size-live-acceptance.md)区分长桥未配置与开发同步边界。

- 多源扩展、历史规则与P6：[多源任务](tasks/2026-10-03-multi-source-remaining-acceptance.md) · [历史规则任务](tasks/2026-10-06-historical-rules-primary-backup.md) · [P6任务](tasks/2026-10-07-p6-market-state-expansion.md)。基础报价/普通研究、M31、用户选定状态/市场、港美实际股数与精简镜像/恢复范围完成；[现行P6 Spec](../specs/2026-10-07-p6-market-state-expansion.md)保留，最终证据见[港股与当前版本核验](../tasks/evidence/2026-10-08-p6-hk-share-window-acceptance.md)。取消项不记作通过，港股每手历史变更未核验。

- 自然语言策略编写：[完整任务](tasks/2026-09-18-natural-language-strategy-authoring.md)、[可信身份与会话](tasks/2026-10-05-strategy-identity.md)、[执行与调用事实](tasks/2026-10-05-authoring-execution.md)均完成各自门禁；[现行 Spec](../specs/2026-09-18-natural-language-strategy-authoring.md)保留，详见[最终对账](../tasks/evidence/2026-10-06-authoring-completion.md)与[浏览器证据](../tasks/evidence/2026-10-06-authoring-browser.md)。

- 行情图表周期聚合：[已完成任务](tasks/2026-09-16-market-chart-period-aggregation.md)，完整 AC1–AC11 与 T1～T6/G1/P1/R1 已通过；[现行 Spec](../specs/2026-09-16-market-chart-period-aggregation.md)保留，分层证据见[R1 最终 Review](../tasks/evidence/2026-10-06-market-period-r1-final-review.md)。

- 投资复盘：[原任务](tasks/2026-08-28-journal-review-trade-projection.md)、[契约子任务](tasks/2026-10-04-journal-review-contracts.md)、[收口任务](tasks/2026-10-05-journal-review-completion.md)；完整 AC1—AC16 与本轮 Web／真实模型／目标恢复／远端 CI 已通过，见[最终 Review](reviews/2026-10-05-journal-review-completion.md)。现行产品与契约 Spec 保留。

- [基金定投计划](tasks/2026-09-08-recurring-fund-investment.md)与[日期精度成本策略修复](tasks/2026-10-04-ledger-date-cost-boundary.md)：全部实施及分层运行时验收完成，Spec 继续保留当前契约；
- `2026-09-17-strategy-center-ux-consolidation`：T00—T16 与 G1—G3 已完成，最终一致性 Review 通过；Spec 继续保留为当前产品与交互契约；
- `2026-08-28-unified-backtest-v2`、`2026-09-10-backtest-historical-execution-rule-facts`、`2026-09-11-backtest-v2-closure-follow-up`：V2 产品/引擎交付与收敛任务已经完成；历史规则后继由已完成的[主备任务](tasks/2026-10-06-historical-rules-primary-backup.md)和[P6 任务](tasks/2026-10-07-p6-market-state-expansion.md)承接，未选定扩展不作为当前重做入口；
- `2026-09-14-portfolio-valuation-demand-guard`：当前功能和运行态门禁已经完成；明确延期的 batch/catalog、FX、LedgerEvent 与 realized PnL 优化转入 `docs/TODO.md`；
- `2026-09-16-market-bar-series-cache-v2`：BarSeries Fact/Coverage、Reader、缓存和当前 Docker 门禁已经完成；原 V2 设计保留历史依据，当前架构由 [Canonical](../architecture/canonical-runtime.md)维护；
- `2026-09-11-backtest-v2-closure.md`：一次性收敛验收记录从 `benchmarks/` 归档到 `archive/reviews/`；
- `2026-08-18-market-data-provider-v1-2-implementation.md`：旧 Market Data v1.2 实施说明被 Market Data V2 Architecture 取代；
- `2026-08-18-provider-selection.md` 与 `2026-08-18-provider-reliability.md`：旧 Provider 领域说明合并为 V2 `provider-routing-and-reliability`。

更早的归档批次还包括：

- `2026-08-24-performance-snapshot-automation` Spec/Task：已由 `2026-08-28-portfolio-snapshot-system` 取代；
- `2026-08-28-architecture-guardrails-hardening` Spec/Task：实现和 PR #22 已完成；
- `2026-09-02-fresh-database-baseline` Spec/Task：实现、真实 fresh-volume 切换和最终一致性 Review 已完成；
- `2026-08-25-journal-review-interaction-design` Spec/Task：已由统一 Trade Projection 的 Journal 方案接管当前契约；
- `2026-09-01-docker-build-cache-retry` Task：静态/替身验证及真实 `update.sh` 运行时验收均已完成，Spec 继续保留为当前行为说明；
- `2026-08-28-unified-backtest-trade-integration-review.md`：已被同日复核版 Review 取代；
- `2026-08-18-v1-release-checklist.md`：V1 一次性发布执行记录，当前 Operations 只保留可复用 checklist；
- `2026-08-18-spec-traceability.md`：记录 V0.x/V1 历史追踪，不再作为当前 Spec 状态 SSOT。

归档主题文档使用 `YYYY-MM-DD-<topic>.md` 命名。归档意味着退出当前实现入口，不意味着删除历史证据。当前导航直接链接实际正文；只为原始证据、测试输入或邻仓仍需要的路径保留短跳转，已无实际引用的跳转删除。归档记录里的原执行路径仅说明当时输入，不自动产生长期维持旧路径的义务。
