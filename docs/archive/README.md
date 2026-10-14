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

- 每手股数独立路由：[已完成任务](tasks/2026-10-08-security-lot-size-routing.md)，当前选择富途的真实股数、模型冻结及页面/下载通过；[现行Spec](../specs/2026-10-08-security-lot-size-routing.md)保留，[验收证据](../tasks/evidence/2026-10-08-security-lot-size-live-acceptance.md)区分长桥未配置与开发同步边界。

- 多源扩展、历史规则与P6：[多源任务](tasks/2026-10-03-multi-source-remaining-acceptance.md) · [历史规则任务](tasks/2026-10-06-historical-rules-primary-backup.md) · [P6任务](tasks/2026-10-07-p6-market-state-expansion.md)。基础报价/普通研究、M31、用户选定状态/市场、港美实际股数与精简镜像/恢复范围完成；[现行P6 Spec](../specs/2026-10-07-p6-market-state-expansion.md)保留，最终证据见[港股与当前版本核验](../tasks/evidence/2026-10-08-p6-hk-share-window-acceptance.md)。取消项不记作通过，港股每手历史变更未核验。

- 自然语言策略编写：[完整任务](tasks/2026-09-18-natural-language-strategy-authoring.md)、[可信身份与会话](tasks/2026-10-05-strategy-identity.md)、[执行与调用事实](tasks/2026-10-05-authoring-execution.md)均完成各自门禁；[现行 Spec](../specs/2026-09-18-natural-language-strategy-authoring.md)保留，详见[最终对账](../tasks/evidence/2026-10-06-authoring-completion.md)与[浏览器证据](../tasks/evidence/2026-10-06-authoring-browser.md)。

- 行情图表周期聚合：[已完成任务](tasks/2026-09-16-market-chart-period-aggregation.md)，完整 AC1–AC11 与 T1～T6/G1/P1/R1 已通过；[现行 Spec](../specs/2026-09-16-market-chart-period-aggregation.md)保留，分层证据见[R1 最终 Review](../tasks/evidence/2026-10-06-market-period-r1-final-review.md)。

- 投资复盘：[原任务](tasks/2026-08-28-journal-review-trade-projection.md)、[契约子任务](tasks/2026-10-04-journal-review-contracts.md)、[收口任务](tasks/2026-10-05-journal-review-completion.md)；完整 AC1—AC16 与本轮 Web／真实模型／目标恢复／远端 CI 已通过，见[最终 Review](../reviews/2026-10-05-journal-review-completion.md)。现行产品与契约 Spec 保留。

- [基金定投计划](tasks/2026-09-08-recurring-fund-investment.md)与[日期精度成本策略修复](tasks/2026-10-04-ledger-date-cost-boundary.md)：全部实施及分层运行时验收完成，Spec 继续保留当前契约；
- `2026-09-17-strategy-center-ux-consolidation`：T00—T16 与 G1—G3 已完成，最终一致性 Review 通过；Spec 继续保留为当前产品与交互契约；
- `2026-08-28-unified-backtest-v2`、`2026-09-10-backtest-historical-execution-rule-facts`、`2026-09-11-backtest-v2-closure-follow-up`：V2 产品/引擎交付与收敛任务已经完成；真实历史市场规则由新的 active task 承接；
- `2026-09-14-portfolio-valuation-demand-guard`：当前功能和运行态门禁已经完成；明确延期的 batch/catalog、FX、LedgerEvent 与 realized PnL 优化转入 `docs/TODO.md`；
- `2026-09-16-market-bar-series-cache-v2`：BarSeries Fact/Coverage、Reader、缓存和当前 Docker 门禁已经完成；当前架构由 `architecture/2026-09-16-market-data-v2.md` 维护；
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

归档主题文档使用 `YYYY-MM-DD-<topic>.md` 命名。归档意味着退出当前实现入口，不意味着删除历史证据。为兼容历史链接，原目录可以暂时保留只含归档链接的短跳转文件；跳转文件不属于当前实现文档。
