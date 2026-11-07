# ThesisLedger 文档中心

本文是主仓文档导航。分类与生命周期见[文档指南](DOCUMENTATION-GUIDE.md)；历史资料从[归档](archive/README.md)追溯。

## 当前执行入口

先读[任务索引](tasks/README.md)，再按需要读取对应 Spec 与最新证据。任务状态由 Task 维护，已完成实施不要求仍有效的产品规格一起归档。

| 主题 | 当前入口 |
| --- | --- |
| 统一数据能力适配层与 Tushare 现金消费条件 | [任务](tasks/2026-10-09-unified-data-capability-adapter.md) |
| 研究历史比较与价格复核（已验收，保留证据） | [任务](tasks/2026-10-18-research-evidence-evolution.md) |
| 单只基金盘中估值（已验收，保留证据） | [任务](tasks/2026-11-04-fund-intraday-valuation.md) |
| 自选、模型竞技场与模型周报（已规划） | [自选与共享标的详情](tasks/2026-11-05-watchlist-foundation.md) → [多模型模拟交易竞技场](tasks/2026-11-05-model-arena.md) → [模型每周复盘](tasks/2026-11-05-arena-weekly-review.md) |
| 已确认但尚未立项的后续实现 | [TODO](TODO.md) |
| 当前审查、来源矩阵与待评估方案 | [Review 导航](reviews/README.md) |

## 按内容查阅

| 目录 | 内容 |
| --- | --- |
| [design/](design/README.md) | 长期架构、领域模型与 ADR；[当前运行链](design/canonical-runtime.md)及[版本矩阵](design/version-matrix.md) |
| [specs/](specs/README.md) | 需求、行为与验收合同 |
| [tasks/](tasks/README.md) | 当前执行、阻塞与最新证据入口 |
| [guides/](guides/README.md) | 使用、开发、部署与维护；包括[市场资料查询](guides/market-reference.md)和[移动客户端](guides/2026-10-25-mobile-client.md) |
| [reviews/](reviews/README.md) | 审查判断、差异与待评估方案 |
| [evidence/](evidence/README.md) | 验证记录、原始材料、固定样本与基准 |
| [archive/](archive/README.md) | 完成任务、结案报告、被替代合同与退役资料 |

## 跨仓入口

| 仓库 | 文档与职责 |
| --- | --- |
| [daily-stock-analysis](../../daily-stock-analysis/docs/README.md) | Provider 适配、数据服务、来源合同与数据证据 |
| [thesis-ledger-infra](../../thesis-ledger-infra/docs/README.md) | Compose、镜像、正式更新、备份与恢复 |

本轮目录与归档核对见[三仓文档整理记录](archive/reviews/2026-11-05-three-repository-documentation.md)。
