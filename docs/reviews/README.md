# 当前 Review 与发布证据

`docs/reviews/` 保留仍承担发布外部门禁、跨仓审计、来源路由查阅或当前优化决策的正文。一次性运行结果、已结案对账与实施日志进入 [`../archive/reviews/`](../archive/reviews/)，原始证据继续留在 `evidence/`。

本 README 不再手工枚举全部 Review 状态；每个主题的当前状态由对应 Task/Review 自身维护，避免目录索引在新增 Review 后长期漂移。

实施与验收状态由[当前 Task](../tasks/README.md)及其 Spec 维护。当前 Task 可以引用归档报告复用证据；引用历史报告不要求将正文留在当前目录，归档也不取消报告中未满足的验收条件。

## 当前查阅入口

- [发布外部门禁记录](2026-08-18-v1.0-release-gate-review.md)：保留原发布范围中的未覆盖条件；已完成的旧本地检查不作为今天重跑的清单。原生联网与视觉等当前义务继续由各 Task 管理。
- [DSA Fork 审计](2026-08-18-dsa-fork-delta-audit.md)：跨仓归属、移植及上游合并依据；来源实际实现由 DSA 维护。
- [来源与功能路由矩阵](2026-10-10-provider-adaptation-and-route-matrix.md)：查阅来源差异与证据映射；设计和当前进度回查原 Spec/Task。
- [用户体验评审与优化建议](2026-10-14-user-experience-optimization.md)：保留本轮体验问题、实测范围及待处理建议，不自动扩大产品任务。

投资复盘的[中间对账](../archive/reviews/2026-10-04-journal-review-consistency.md)与[最终验收](../archive/reviews/2026-10-05-journal-review-completion.md)、统一适配层的[实施日志](../archive/reviews/2026-10-11-unified-data-capability-implementation-log.md)和旧[聚合对账](../archive/reviews/2026-10-04-parallel-task-integration.md)均为历史记录。可由固定脱敏输入重复执行的基准留在 `docs/benchmarks/`。

## 原始证据

`evidence/` 下的截图、XML 和一次性运行产物只作为验证证据，不作为产品需求或运行手册。

- 状态 XML、日志摘要和截图必须和实际场景对应；
- 不同文件名如果实际指向同一二进制 blob，不应被当作多个状态的独立视觉证据；
- 重复、误命名且没有独立审计价值的二进制可以删除，但保留仍能证明不同状态的 XML/日志；
- 外部发布附件、真实账号或敏感数据不得直接进入仓库证据目录。

历史 Review 统一从 [`../archive/README.md`](../archive/README.md) 和 [`../archive/reviews/`](../archive/reviews/) 追溯。主题 Review 文件使用 `YYYY-MM-DD-<topic>.md` 命名；`README.md` 仅作为治理入口。

少量旧路径仍被原始证据或邻仓引用，只保留归档链接供兼容，不属于当前报告正文；已无实际引用的跳转文件删除。
