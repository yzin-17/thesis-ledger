# 项目文档生命周期指南

本文定义 ThesisLedger 主仓文档的分类、唯一事实源（SSOT）、生命周期和跨仓边界。它是文档治理规则的唯一入口；`docs/README.md` 负责导航，具体主题文档负责保存事实和证据。

## 文档类别与唯一事实源

| 类别 | 路径 | 应记录的内容 |
| --- | --- | --- |
| Architecture | `docs/architecture/` | 当前系统架构、跨仓职责、技术约束和兼容边界 |
| Domain | `docs/domain/` | 稳定的领域术语、模型和业务不变量 |
| ADR | `docs/adr/` | 已接受且需要长期保留的架构决策 |
| Specs | `docs/specs/` | 当前产品需求、设计目标、范围和验收标准 |
| Tasks | `docs/tasks/` | 当前实施拆分、完成状态、验证方式和当前遗留项 |
| TODO | `docs/TODO.md` | 已明确延期到后续、但尚未正式立项的实现 backlog |
| Guides | `docs/guides/` | 面向用户的使用教程和操作说明 |
| Engineering | `docs/engineering/` | 数据库、依赖、组件和工程实现规范 |
| Operations | `docs/operations/` | 部署、维护、备份、恢复和发布流程 |
| Reviews | `docs/reviews/` | 一致性 Review、发布门禁、运行结果和一次性证据索引 |
| Benchmarks | `docs/benchmarks/` | 可重复执行的固定基准集和性能证据 |
| Archive | `docs/archive/` | 已完成、被替代或仅用于历史审计的文档 |

同一事实只能有一个正文 SSOT。其他文档应通过链接引用，不复制整段设计、接口或验证结论。

## SSOT 关系

- “要实现什么以及为什么”以 `specs/` 为准。
- “如何拆分、完成到什么程度以及有什么验证证据”以 `tasks/` 为准。
- “明确以后做、但现在不属于当前完成条件的事项”以 `TODO.md` 为准。
- “当前系统如何工作、跨仓边界是什么以及兼容条件是什么”以 `architecture/` 为准。
- “已经接受的不可逆决策”以 `adr/` 为准；ADR 不替代当前实现说明。
- “领域词汇和不变量”以 `domain/` 为准；产品 Spec 可以引用，但不应重新定义同一术语。
- “运行结果、发布门禁和外部环境限制”以 `reviews/` 及其证据为准；它们不替代需求或架构文档。
- 已归档文档只提供历史上下文，不能作为新实现的需求、接口或当前运行状态依据。

当文档之间出现冲突时，先确认文档所属类别，再更新拥有该事实的 SSOT，并在其他文档中保留链接，不通过复制内容解决冲突。

## TODO 与当前未完成事项的边界

只有文档明确写明“后续实现”“后续版本”“另行立项”或“已确认后续范围”的内容，且它**不属于当前 Spec/Task 的完成条件**时，才能进入 `docs/TODO.md`。

以下内容不得因为暂时难以验收而移入 TODO：

- 当前 Task 尚未完成的代码或迁移；
- 真实 Provider、凭证、网络、Docker、Worker、数据库、浏览器、设备或模拟器门禁；
- 当前任务要求的用户确认、受保护数据操作或发布验证；
- 已经存在正式 successor Spec/Task 的事项。

普通“非目标”也不自动进入 TODO。只有明确承诺后续实现的非目标才迁入 TODO；原 Spec/Task 只保留简短引用，不继续维护未来方案细节。

TODO 条目启动实施时，先创建成对的 `specs/YYYY-MM-DD-<topic>.md` 与 `tasks/YYYY-MM-DD-<topic>.md`，再从 TODO 删除该条目，避免形成第二套任务状态表。

## DSA 与 Provider 的跨仓边界

主仓只维护以下内容：

- ThesisLedger 拥有的领域模型、产品 API、缓存语义和客户端边界；
- Data Contract / Control Contract 的消费侧接口、当前架构和兼容矩阵；
- DSA 与 `thesis-ledger-infra` 的职责、发布顺序和验证入口。

Provider 适配器、原始凭证、Provider-specific 配置、Effective Policy 运行细节和 DSA 专属 Contract 实现属于同级 `daily-stock-analysis` 仓库。Compose、镜像、持久卷和部署时兼容清单属于 `thesis-ledger-infra`。主仓不复制这两个仓库的实现细节，只记录跨仓约束和可验证的接口边界。

## 生命周期规则

1. 新主题先创建成对的 `docs/specs/YYYY-MM-DD-<topic>.md` 和 `docs/tasks/YYYY-MM-DD-<topic>.md`，两者共享稳定任务标识。
2. 需要长期保留的架构选择单独记录 ADR；实施过程中发现范围、接口或验收标准变化时，先更新 Spec，再同步任务和实现。
3. 实现完成后，更新当前架构说明、领域术语、用户/运维指南和 Review 入口；任务文档保留完成条件与验证证据，不把证据复制到 Spec。
4. 仍有未完成任务、外部门禁或用户待确认事项的文档留在当前目录，并明确状态和阻塞原因。
5. 明确延期、且不属于当前完成条件的未来实现迁入 `docs/TODO.md`；当前 Spec/Task 只保留 TODO 链接，不继续维护未来方案正文。
6. 已完成且不再需要继续执行的任务、被新版本取代的 Spec 和过期的实施方案移动到 `docs/archive/`，保留原任务标识、状态、验证证据和必要的链接。
7. 为兼容历史相对链接，归档时允许暂时在原路径保留**只含归档链接的兼容跳转文件**；该文件不得复制状态、验收或实现内容，也不算 active Task/Spec。后续统一修正全部引用后应删除跳转文件。
8. 有历史决策价值的文档归档而不是删除；只有确认 Git 历史和外部证据均不再需要时，才另行提出删除。
9. 自动生成、可完全重建的清单或运行产物不应作为人工维护正文长期留在 `docs/`；应优先由脚本、CI artifact 或 release notice 生成。
10. 主题文档使用 `YYYY-MM-DD-<topic>.md` 命名；目录入口和工具约定文件保留 `README.md` 等标准名称。

## 文档 Review 清单

每次整理至少检查：

- 同一设计、术语、版本或验证结论是否在多个文档中重复维护；
- Spec、Task、TODO、Architecture、ADR、Review 是否各自只承担对应职责；
- 当前入口是否能从 `docs/README.md` 找到，归档文档是否仍可追溯；
- 已完成任务是否已归档，仍有阻塞的任务是否保留在当前目录；
- 明确写成“后续再实现”的内容是否已经迁到 `TODO.md`，而不是继续堆在当前 Task 尾部；
- Benchmarks 是否真的是可重复基准，而不是一次性验收记录；
- 相对链接、仓库路径、命令、配置键和版本号是否仍然有效；
- 三仓边界是否清晰，是否把 DSA 或 infra 的实现细节复制进主仓；
- Review 是否明确区分确定性检查、容器运行、在线 Provider、浏览器/设备和外部服务证据；
- 自动生成清单、重复二进制和可重建产物是否仍有长期保留必要。

当前治理记录统一从 [`docs/reviews/README.md`](reviews/README.md) 进入，不在本指南硬编码某一次历史 Review。
