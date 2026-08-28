# 历史文档归档

本目录保存仍有审计、迁移或历史决策价值，但不再作为当前实现依据的文档。

| 目录 | 内容 |
| --- | --- |
| [`specs/`](specs/) | 旧版 Investment OS / Provider 规格、已完成架构改进，以及被当前 Snapshot 系统取代的历史规格 |
| [`tasks/`](tasks/) | V0.1–V1.0 阶段任务、market-data v1.2 已完成专项、架构改进任务、历史迁移任务和被取代的 Snapshot 自动化任务 |
| [`reviews/`](reviews/) | Phase 0 与 V0.1–V0.9 历史一致性 Review |
| [`architecture/`](architecture/) | DSA 详细历史审计和不再作为当前追踪入口的历史 Traceability |
| [`domain/`](domain/) | Domain Model 一次性总审计 |

归档文档可以被历史 Review 引用，但不能作为新实现的需求、接口或运行状态真源。若要删除归档内容，必须先确认 Git 历史或外部证据已满足保留要求。

本轮新增归档包括：

- `2026-08-24-performance-snapshot-automation` Spec/Task：已由 `2026-08-28-portfolio-snapshot-system` 取代；
- `2026-08-28-architecture-guardrails-hardening` Spec/Task：实现和 PR #22 已完成；
- `2026-08-18-spec-traceability.md`：记录 V0.x/V1 历史追踪，不再作为当前 Spec 状态 SSOT。

归档主题文档使用 `YYYY-MM-DD-<topic>.md` 命名。归档意味着退出当前实现入口，不意味着删除历史证据。
