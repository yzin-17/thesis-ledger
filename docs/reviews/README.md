# 当前 Review 与发布证据

`docs/reviews` 保留仍承担发布外部门禁、跨仓审计、来源路由查阅或当前优化决策的正文。一次性运行结果、已结案对账与实施日志进入 [`../archive/reviews/`](../archive/reviews/)，原始证据统一从[验证证据](../evidence/README.md)查阅。

本 README 不再手工枚举全部 Review 状态；每个主题的当前状态由对应 Task/Review 自身维护，避免目录索引在新增 Review 后长期漂移。

实施与验收状态由[当前 Task](../tasks/README.md)及其 Spec 维护。当前 Task 可以引用归档报告复用证据；引用历史报告不要求将正文留在当前目录，归档也不取消报告中未满足的验收条件。

## 当前查阅入口

- [自选页与候选功能本地复核及综合方案](2026-11-05-thesis-ledger-feature-proposals.md#10-codex-本地复核)：第 10 节记录当前三仓基线、13 项能力对照、两端页面分工、标的分析与资讯、多模型模拟交易、自动周复盘及验收边界；保留原讨论，三个主题已建立[正式 Spec](../specs/README.md) 与[实施任务](../tasks/README.md#已规划的产品实施顺序)，功能待实施。

- [主要来源覆盖与首批备用源核对](2026-11-04-astock-source-coverage.md)：34个来源按已验能力和证据分开，四组实源资格及字段／分页替代性从此查阅；不把采证成功当作产品备用源已启用。

- [发布外部门禁记录](2026-08-18-v1.0-release-gate-review.md)：保留原发布范围中的未覆盖条件；已完成的旧本地检查不作为今天重跑的清单。原生联网与视觉等当前义务继续由各 Task 管理。
- [DSA Fork 审计](2026-08-18-dsa-fork-delta-audit.md)：跨仓归属、移植及上游合并依据；来源实际实现由 DSA 维护。
- [来源与功能路由矩阵](2026-10-10-provider-adaptation-and-route-matrix.md)：查阅来源差异与证据映射；设计和当前进度回查原 Spec/Task。
- [用户体验评审与优化建议](2026-10-14-user-experience-optimization.md)：保留本轮体验问题、实测范围及待处理建议，不自动扩大产品任务。
- [页面一致性、密度与交互恢复验收](../archive/reviews/2026-10-19-ui-consistency-and-density-audit.md#web-recovery-20261020)：保留 10-19 状态基线和排查历史，补充 10-20 修复、162 个布局视图、目标 Web 与保留数据核对；任务已完成归档，真实业务门禁维持原归属。
- [股票收藏项目实现对照](2026-10-18-starred-project-implementation-coverage.md)：逐项记录参考点、源码覆盖与本地问题对账；核查任务见研究增强 T0R，不替代领域实施状态。
- [衍生品与可转债来源复核](../archive/reviews/2026-11-04-astock-derivative-reference.md)：原 47 类基础上新增 16 类，当前 63 类查询的来源、语义和验收从此查阅；[前轮公开实现复用](../archive/reviews/2026-11-04-astock-public-source-reuse.md)保留原 18 类新增及取消依据；[原模块盘点](2026-10-22-astock-data-module-followups.md)、[前期评估](../archive/reviews/2026-11-03-astock-followup-feasibility.md)及[原轮交付](../archive/reviews/2026-11-03-market-reference-delivery.md)保留当时事实。

投资复盘的[中间对账](../archive/reviews/2026-10-04-journal-review-consistency.md)与[最终验收](../archive/reviews/2026-10-05-journal-review-completion.md)、统一适配层的[实施日志](../archive/reviews/2026-10-11-unified-data-capability-implementation-log.md)和旧[聚合对账](../archive/reviews/2026-10-04-parallel-task-integration.md)均为历史记录。可由固定脱敏输入重复执行的基准留在 `docs/evidence/benchmarks`。

## 原始证据

`../evidence/` 下的截图、XML 和一次性运行产物只作为验证证据，不作为产品需求或运行手册。

- 状态 XML、日志摘要和截图必须和实际场景对应；
- 不同文件名如果实际指向同一二进制 blob，不应被当作多个状态的独立视觉证据；
- 重复、误命名且没有独立审计价值的二进制可以删除，但保留仍能证明不同状态的 XML/日志；
- 外部发布附件、真实账号或敏感数据不得直接进入仓库证据目录。

历史 Review 统一从 [`../archive/README.md`](../archive/README.md) 和 [`../archive/reviews/`](../archive/reviews/) 追溯。主题 Review 文件使用 `YYYY-MM-DD-<topic>.md` 命名；`README.md` 仅作为治理入口。

已结案报告直接链接归档正文；本轮已修正引用并移除两份旧 Review 跳转壳，原锚点保留在归档正文。

本轮目录、归档依据、保留门禁与检查结果见[三仓文档整理记录](../archive/reviews/2026-11-05-three-repository-documentation.md)。
