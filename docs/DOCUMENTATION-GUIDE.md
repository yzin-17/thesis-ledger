# 项目文档生命周期指南

本文定义 ThesisLedger 主仓文档的分类、唯一事实源（SSOT）、生命周期和跨仓边界。它是文档治理规则的唯一入口；`docs/README.md` 负责导航，具体主题文档负责保存事实和证据。

## 文档类别与唯一事实源

| 类别 | 路径 | 应记录的内容 |
| --- | --- | --- |
| Architecture | `docs/architecture/` | 当前系统架构、跨仓职责、技术约束和兼容边界 |
| Domain | `docs/domain/` | 稳定的领域术语、模型和业务不变量 |
| ADR | `docs/adr/` | 已接受且需要长期保留的架构决策 |
| Specs | `docs/specs/` | 产品需求、设计目标、范围和验收标准 |
| Tasks | `docs/tasks/` | 实施拆分、完成状态、验证方式和当前遗留项 |
| Guides | `docs/guides/` | 面向用户的使用教程和操作说明 |
| Engineering | `docs/engineering/` | 数据库、依赖、组件和工程实现规范 |
| Operations | `docs/operations/` | 部署、维护、备份、恢复和发布流程 |
| Reviews | `docs/reviews/` | 一致性 Review、发布门禁、运行结果和一次性证据索引 |
| Benchmarks | `docs/benchmarks/` | 固定基准集和性能证据 |
| Archive | `docs/archive/` | 已完成、被替代或仅用于历史审计的文档 |

同一事实只能有一个正文 SSOT。其他文档应通过链接引用，不复制整段设计、接口或验证结论。

## SSOT 关系

- “要实现什么以及为什么”以 `specs/` 为准。
- “如何拆分、完成到什么程度以及有什么验证证据”以 `tasks/` 为准。
- “当前系统如何工作、跨仓边界是什么以及兼容条件是什么”以 `architecture/` 为准。
- “已经接受的不可逆决策”以 `adr/` 为准；ADR 不替代当前实现说明。
- “领域词汇和不变量”以 `domain/` 为准；产品 Spec 可以引用，但不应重新定义同一术语。
- “运行结果、发布门禁和外部环境限制”以 `reviews/` 及其证据为准；它们不替代需求或架构文档。
- 已归档文档只提供历史上下文，不能作为新实现的需求、接口或当前运行状态依据。

当文档之间出现冲突时，先确认文档所属类别，再更新拥有该事实的 SSOT，并在其他文档中保留链接，不通过复制内容解决冲突。

## DSA 与 Provider 的跨仓边界

主仓只维护以下内容：

- ThesisLedger 拥有的领域模型、产品 API、缓存语义和客户端边界；
- Data Contract / Control Contract 的消费侧接口、当前架构和兼容矩阵；
- DSA 与 `thesis-ledger-infra` 的职责、发布顺序和验证入口。

Provider 适配器、原始凭证、Provider-specific 配置、Effective Policy 运行细节和 DSA 专属 Contract 实现属于同级 `daily-stock-analysis` 仓库。Compose、镜像、持久卷和部署时兼容清单属于 `thesis-ledger-infra`。主仓不复制这两个仓库的实现细节，只记录跨仓约束和可验证的接口边界。

以市场数据与标的中心 v1.2 为例：需求和验收标准在 `docs/specs/`，当前实现边界在 `docs/architecture/`，实施状态和证据在 `docs/tasks/`，发布/运行结论在 `docs/reviews/`；DSA 的 Provider 原始实现仍以 DSA 仓库为准。

## 生命周期规则

1. 新主题先创建成对的 `docs/specs/YYYY-MM-DD-<topic>.md` 和 `docs/tasks/YYYY-MM-DD-<topic>.md`，两者共享稳定任务标识。
2. 需要长期保留的架构选择单独记录 ADR；实施过程中发现范围、接口或验收标准变化时，先更新 Spec，再同步任务和实现。
3. 实现完成后，更新当前架构说明、领域术语、用户/运维指南和 Review 入口；任务文档保留完成条件与验证证据，不把证据复制到 Spec。
4. 仍有未完成任务、外部门禁或用户待确认事项的文档留在当前目录，并明确状态和阻塞原因。
5. 已完成且不再需要继续执行的任务、被新版本取代的 Spec 和过期的实施方案移动到 `docs/archive/`，保留原任务标识、状态、验证证据和必要的链接。
6. 有历史决策价值的文档归档而不是删除；只有确认 Git 历史和外部证据均不再需要时，才另行提出删除。
7. 主题文档使用 `YYYY-MM-DD-<topic>.md` 命名；目录入口和工具约定文件保留 `README.md` 等标准名称。

## 文档 Review 清单

每次整理至少检查：

- 同一设计、术语、版本或验证结论是否在多个文档中重复维护；
- Spec、Task、Architecture、ADR、Review 是否各自只承担对应职责；
- 当前入口是否能从 `docs/README.md` 找到，归档文档是否仍可追溯；
- 已完成任务是否已归档，仍有阻塞的任务是否保留在当前目录；
- 相对链接、仓库路径、命令、配置键和版本号是否仍然有效；
- 三仓边界是否清晰，是否把 DSA 或 infra 的实现细节复制进主仓；
- Review 是否明确区分确定性检查、容器运行、在线 Provider、浏览器/设备和外部服务证据。

本轮审查记录见 [`docs/reviews/2026-08-doc-review.md`](reviews/2026-08-doc-review.md)。
