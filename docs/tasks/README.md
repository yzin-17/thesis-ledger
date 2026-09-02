# 当前实施任务

当前任务目录优先保留仍在实施的任务，以及实现已经完成但仍存在明确运行时/外部环境验收边界的任务。已完成、被替代或只承担历史证据作用的任务应进入 `../archive/tasks/`。

## 仍在实施或待完成

- [统一回测系统 V2](2026-08-28-unified-backtest-v2.md)
- [市场数据与标的中心 v1.2](2026-08-18-market-data-provider-v1-2.md)
- [市场数据 v1.2 closure-09：Mobile 原生验收](2026-08-18-market-data-provider-v1-2-closure-09-mobile-native-acceptance.md)
- [市场数据 v1.2 closure-11：最终追踪 Review](2026-08-18-market-data-provider-v1-2-closure-11-final-review.md)
- [录入持仓与账户模型重构](2026-08-18-position-entry-account-model.md)
- [持仓行情详情共享读模型](2026-08-21-market-detail-read-model.md)
- [投资组合快照系统](2026-08-28-portfolio-snapshot-system.md)
- [投资复盘工作台（统一 Trade Projection）](2026-08-28-journal-review-trade-projection.md)

## 实现完成，仍保留验收边界

以下任务已有确定性实现和验证证据，但仍记录浏览器、真实 Provider、在线服务或目标设备等运行时验收边界，因此暂不归档：

- [巨型组件拆分与请求层统一](2026-08-23-large-component-split.md)
- [风险中心 AB 组合交互](2026-08-23-risk-center-interaction.md)
- [研究助手任务工作台](2026-08-25-ai-research-workbench.md)
- [策略实验工作台](2026-08-25-strategy-lab-workbench.md)
- [投资复盘交互设计](2026-08-25-journal-review-interaction-design.md)
- [现金账户资金范围与内部划转](2026-08-30-cash-account-funding-and-transfer.md)
- [定期现金入账计划](2026-08-30-recurring-cash-deposit-plan.md)
- [Docker 构建缓存重试](2026-09-01-docker-build-cache-retry.md)

“实现完成”只表示代码一致性和已记录的确定性验证完成，不等于真实 Provider、生产数据、设备、浏览器或 Worker 运行时验收已经完成。运行时门禁关闭后，再按 `DOCUMENTATION-GUIDE.md` 归档。

## 已完成的当前实现参考

交易与成交记录系统主任务的 T1–T17 / Review 已完成；返工任务的 T18“交易规则能力元数据验证与运行时验收”仍未完成，本轮不再把两份文档作为新的执行入口；当前实现与领域规则仍由对应 Trade Spec 及子 Spec 负责。两份任务暂留当前目录仅用于现有实现证据和历史链接，后续在 T18 完成并统一重写内部相对链接后移动到 archive：

- [交易与成交记录系统实施任务](2026-08-26-trade-execution-ledger-system.md)
- [交易与成交记录系统剩余问题与返工任务](2026-08-26-trade-execution-ledger-system-follow-up.md)

## 已归档

已完成的 V0.1–V1.0 阶段任务、market-data v1.2 已完成专项、architecture improvement、Fresh Database Baseline、历史工作区迁移，以及已经被新 Snapshot 方案取代的收益快照自动化任务位于 [`../archive/tasks/`](../archive/tasks/)。历史任务保留原验证证据，但不再作为当前开发入口。

新功能必须成对创建：`docs/specs/YYYY-MM-DD-<topic>.md` 与 `docs/tasks/YYYY-MM-DD-<topic>.md`。主题任务文件使用 `YYYY-MM-DD-<topic>.md` 命名；`README.md` 仅作为目录入口。
