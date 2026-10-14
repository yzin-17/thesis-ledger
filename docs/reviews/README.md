# 当前 Review 与发布证据

`docs/reviews/` 只保留仍用于**当前发布门禁、运行阻塞、跨仓审计或当前实现验收引用**的 Review 与证据。已完成的一次性 closure、被新复核取代的 Review 和历史发布执行记录进入 [`../archive/reviews/`](../archive/reviews/)。

本 README 不再手工枚举全部 Review 状态；每个主题的当前状态由对应 Task/Review 自身维护，避免目录索引在新增 Review 后长期漂移。

当前文档状态对账见[2026-10-03 Review](2026-10-03-task-state-reconciliation.md)。旧发布、设备与 V1/V2 Review 保留原时点证据，当前执行义务及接口以[Task 索引](../tasks/README.md)链接的权威任务为准，不机械重复历史门禁。

## 分类原则

当前投资复盘实现与未完成门禁见[2026-10-04 对账](2026-10-04-journal-review-consistency.md)。

统一数据能力适配层的全来源检查与功能路由映射见[2026-10-10 矩阵](2026-10-10-provider-adaptation-and-route-matrix.md)，设计与进度由其引用的原 Spec/Task 维护。

该主题的历史授权、实施过程和详细命令从[实施日志](2026-10-11-unified-data-capability-implementation-log.md)进入，按初始闭环、功能路由、来源迁移和缓存/公共接缝链接验证正文；当前任务状态仍只由原 Task 维护。

- 发布/运行门禁：真实 Docker、Provider、Worker、浏览器、设备、数据库恢复等当前仍需复核的证据；
- 跨仓审计：DSA Fork attribution、Contract 兼容和需要长期复核的跨仓边界；
- 当前功能 Review：仍被 active Task 明确引用的最终一致性或运行态 Review；
- 一次性 closure：任务已经关闭且只剩历史审计价值时，移动到 `archive/reviews/`；
- 固定 benchmark：如果可以由固定脱敏输入重复执行，应进入 `docs/benchmarks/`，而不是把一次运行结果留在 Review 中。

主仓与并行任务的集成范围见[2026-10-04 聚合对账](2026-10-04-parallel-task-integration.md)。

## Evidence

`evidence/` 下的截图、XML 和一次性运行产物只作为验证证据，不作为产品需求或运行手册。

- 状态 XML、日志摘要和截图必须和实际场景对应；
- 不同文件名如果实际指向同一二进制 blob，不应被当作多个状态的独立视觉证据；
- 重复、误命名且没有独立审计价值的二进制可以删除，但保留仍能证明不同状态的 XML/日志；
- 外部发布附件、真实账号或敏感数据不得直接进入仓库证据目录。

历史 Review 统一从 [`../archive/README.md`](../archive/README.md) 和 [`../archive/reviews/`](../archive/reviews/) 追溯。主题 Review 文件使用 `YYYY-MM-DD-<topic>.md` 命名；`README.md` 仅作为治理入口。
