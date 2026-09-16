# 历史文档归档

本目录保存仍有审计、迁移或历史决策价值，但不再作为当前实现依据的文档。

| 目录 | 内容 |
| --- | --- |
| [`specs/`](specs/) | 旧版 Investment OS / Provider 规格、已完成架构改进，以及被当前 Snapshot / Trade Projection 等方案取代的历史规格 |
| [`tasks/`](tasks/) | 已完成任务、旧阶段任务、历史迁移、被取代的任务，以及已经关闭当前运行时验收的专项任务 |
| [`reviews/`](reviews/) | 历史一致性 Review、一次性 closure/发布执行记录和被新版复核取代的 Review |
| [`architecture/`](architecture/) | 被当前架构 SSOT 取代的实现说明、DSA 详细历史审计和旧 Traceability |
| [`domain/`](domain/) | 被合并或取代的领域说明和一次性 Domain Model 审计 |

归档文档可以被历史 Review 引用，但不能作为新实现的需求、接口或运行状态真源。若要删除归档内容，必须先确认 Git 历史或外部证据已满足保留要求。

近期归档包括：

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
