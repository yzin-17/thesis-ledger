# 当前实施任务

当前任务目录保留两类内容：仍在实施的任务，以及代码实现已完成但仍需要最终、运行时或外部环境验收的任务。只有已完成且无需继续跟踪门禁的任务才移动到 `../archive/tasks/`。

## 仍在实施或待完成

- [交易与成交记录系统](2026-08-26-trade-execution-ledger-system.md)
- [交易与成交记录系统剩余问题与返工任务](2026-08-26-trade-execution-ledger-system-follow-up.md)
- [市场数据与标的中心 v1.2](2026-08-18-market-data-provider-v1-2.md)
- [市场数据 v1.2 closure-09：Mobile 原生验收](2026-08-18-market-data-provider-v1-2-closure-09-mobile-native-acceptance.md)
- [市场数据 v1.2 closure-11：最终追踪 Review](2026-08-18-market-data-provider-v1-2-closure-11-final-review.md)
- [录入持仓与账户模型重构](2026-08-18-position-entry-account-model.md)
- [持仓行情详情共享读模型](2026-08-21-market-detail-read-model.md)
- [收益分析 Snapshot 自动化入口](2026-08-24-performance-snapshot-automation.md)

## 实现完成，仍保留验收边界

以下任务已有确定性实现和验证证据，但文档仍记录浏览器、真实 Provider、真实 Worker、在线服务或目标设备等运行时验收边界，因此暂不归档：

- [巨型组件拆分与请求层统一](2026-08-23-large-component-split.md)
- [风险中心 AB 组合交互](2026-08-23-risk-center-interaction.md)
- [研究助手任务工作台](2026-08-25-ai-research-workbench.md)
- [投资复盘工作台](2026-08-25-journal-review-interaction-design.md)
- [策略实验工作台](2026-08-25-strategy-lab-workbench.md)

其中“实现完成”只表示代码一致性和已记录的确定性验证完成，不等于真实 Provider、生产数据、设备、浏览器或 Worker 运行时验收已经完成。运行时门禁完成后，再按 `DOCUMENTATION-GUIDE.md` 进行归档判断。

已完成的 V0.1–V1.0 阶段任务、market-data v1.2 closure-01 至 closure-08/10、architecture improvement 任务和历史工作区迁移任务位于 [`../archive/tasks/`](../archive/tasks/)。历史任务仍保留原编号和验证证据，但不再作为当前开发入口。

新功能必须成对创建：`docs/specs/YYYY-MM-DD-<topic>.md` 与 `docs/tasks/YYYY-MM-DD-<topic>.md`。任务完成前不得把历史任务复制回当前目录。

主题任务文件使用 `YYYY-MM-DD-<topic>.md` 命名；`README.md` 仅作为目录入口，保留标准名称。
