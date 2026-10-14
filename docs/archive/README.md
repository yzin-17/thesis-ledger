# 历史文档归档

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
