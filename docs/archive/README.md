# 历史文档归档

本目录保存仍有审计、迁移或历史决策价值，但不再作为当前实现依据的文档。

| 目录 | 内容 |
| --- | --- |
| [`specs/`](specs/) | 旧版 Investment OS / Provider 规格、已完成架构改进，以及被当前 Snapshot / Trade Projection 等方案取代的历史规格 |
| [`tasks/`](tasks/) | V0.1–V1.0 阶段任务、market-data v1.2 已完成专项、架构改进、历史迁移、被取代的旧任务，以及完成运行时验收的专项任务 |
| [`reviews/`](reviews/) | Phase 0 / V0.1–V0.9 历史一致性 Review、被复核版取代的 Review 和历史发布执行记录 |
| [`architecture/`](architecture/) | DSA 详细历史审计和不再作为当前追踪入口的历史 Traceability |
| [`domain/`](domain/) | Domain Model 一次性总审计 |

归档文档可以被历史 Review 引用，但不能作为新实现的需求、接口或运行状态真源。若要删除归档内容，必须先确认 Git 历史或外部证据已满足保留要求。

近期归档包括：

- `2026-08-24-performance-snapshot-automation` Spec/Task：已由 `2026-08-28-portfolio-snapshot-system` 取代；
- `2026-08-28-architecture-guardrails-hardening` Spec/Task：实现和 PR #22 已完成；
- `2026-09-02-fresh-database-baseline` Spec/Task：实现、真实 fresh-volume 切换和最终一致性 Review 已完成；
- `2026-08-25-journal-review-interaction-design` Spec/Task：已由统一 Trade Projection 的 Journal 方案接管当前契约；
- `2026-09-01-docker-build-cache-retry` Task：静态/替身验证及真实 `update.sh` 运行时验收均已完成，Spec 继续保留为当前行为说明；
- `2026-08-28-unified-backtest-trade-integration-review.md`：已被同日复核版 Review 取代；
- `2026-08-18-v1-release-checklist.md`：V1 一次性发布执行记录，当前 `operations/release-checklist.md` 仅保留可复用模板；
- `2026-08-18-spec-traceability.md`：记录 V0.x/V1 历史追踪，不再作为当前 Spec 状态 SSOT。

归档主题文档使用 `YYYY-MM-DD-<topic>.md` 命名。归档意味着退出当前实现入口，不意味着删除历史证据。
