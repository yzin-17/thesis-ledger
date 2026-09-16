# 当前 Review 与发布证据

`docs/reviews/` 只保留仍用于**当前发布门禁、运行阻塞、跨仓审计或当前实现验收引用**的 Review 与证据。已完成的一次性 closure、被新复核取代的 Review 和历史发布执行记录进入 [`../archive/reviews/`](../archive/reviews/)。

本 README 不再手工枚举全部 Review 状态；每个主题的当前状态由对应 Task/Review 自身维护，避免目录索引在新增 Review 后长期漂移。

## 分类原则

- 发布/运行门禁：真实 Docker、Provider、Worker、浏览器、设备、数据库恢复等当前仍需复核的证据；
- 跨仓审计：DSA Fork attribution、Contract 兼容和需要长期复核的跨仓边界；
- 当前功能 Review：仍被 active Task 明确引用的最终一致性或运行态 Review；
- 一次性 closure：任务已经关闭且只剩历史审计价值时，移动到 `archive/reviews/`；
- 固定 benchmark：如果可以由固定脱敏输入重复执行，应进入 `docs/benchmarks/`，而不是把一次运行结果留在 Review 中。

## Evidence

`evidence/` 下的截图、XML 和一次性运行产物只作为验证证据，不作为产品需求或运行手册。

- 状态 XML、日志摘要和截图必须和实际场景对应；
- 不同文件名如果实际指向同一二进制 blob，不应被当作多个状态的独立视觉证据；
- 重复、误命名且没有独立审计价值的二进制可以删除，但保留仍能证明不同状态的 XML/日志；
- 外部发布附件、真实账号或敏感数据不得直接进入仓库证据目录。

历史 Review 统一从 [`../archive/README.md`](../archive/README.md) 和 [`../archive/reviews/`](../archive/reviews/) 追溯。主题 Review 文件使用 `YYYY-MM-DD-<topic>.md` 命名；`README.md` 仅作为治理入口。
