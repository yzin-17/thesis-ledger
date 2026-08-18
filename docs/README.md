# ThesisLedger 文档导航

这里是主仓文档的唯一入口。DSA Fork 和 `thesis-ledger-infra` 保持各自仓库的文档边界，不在本目录重复维护 Provider 实现或 Compose 说明。

## 当前文档

| 目录 | 用途 |
| --- | --- |
| [`specs/`](specs/) | 当前产品、领域和功能规格；其中 [ThesisLedger V1 产品范围](specs/2026-08-18-thesis-ledger-product-v1.md)、[市场数据与标的中心 v1.2](specs/2026-08-18-market-data-provider-spec-v1.2.md) 和 [录入持仓与账户模型重构](specs/2026-08-18-position-entry-account-model.md) 是当前主要入口 |
| [`tasks/`](tasks/) | 当前实施任务；历史阶段任务通过 [`archive/tasks/`](archive/tasks/) 进入 |
| [`architecture/`](architecture/) | 三仓边界、DSA 能力审计摘要、兼容矩阵和 Spec 追踪 |
| [`domain/`](domain/) | Asset、Ledger、收益、风险、策略、日志、Provider 和自动化等领域说明 |
| [`engineering/`](engineering/) | 数据库、Redis、Secret、迁移、UI 组件和第三方依赖工程规范 |
| [`operations/`](operations/) | 日常运维、发布、备份恢复和发布清单 |
| [`guides/`](guides/) | 面向用户的使用说明 |
| [`adr/`](adr/) | 已接受的架构决策记录；新决策使用递增编号，不覆盖历史 ADR |
| [`reviews/`](reviews/) | Review、发布门禁和运行证据；证据按平台放在 `reviews/evidence/` |
| [`benchmarks/`](benchmarks/) | 固定基准集和性能证据 |

## 历史文档

[`archive/specs/`](archive/specs/) 保存已被 ThesisLedger 当前范围或 ADR 取代的 Investment OS 旧版 Spec、开源调研、工作区迁移 Spec，以及历史的市场数据 Provider v1.1 Draft。归档表示保留审计和上下文，不表示这些文档仍是当前实现依据。

阶段任务和历史 Review 已移动到 archive，但保留原任务编号、验证证据和发布追踪关系。新的功能实施应使用 `specs/<topic>.md` 与 `tasks/<topic>.md` 成对创建。

## 文档归位规则

- 主题文档统一使用 `YYYY-MM-DD-<topic>.md` 命名；本轮整理统一使用 `2026-08-18-` 前缀。日期表示命名/整理日期，不等同于原始内容的首次编写日期。
- `README.md`、`AGENTS.md` 等仓库或目录入口文件，以及生成的许可证清单等工具约定文件，保留标准名称，避免破坏工具和导航约定。

- 产品/功能“要实现什么以及为什么”放 `specs/`。
- 实施拆分、完成条件和验证证据放 `tasks/`。
- 不可逆或跨仓的架构选择放 `adr/`；事实审计和兼容矩阵放 `architecture/`。
- 领域语义放 `domain/`；操作步骤和恢复流程放 `operations/`；面向用户的操作教程放 `guides/`。
- Review 和截图/XML 等一次性证据放 `reviews/`，不要把证据混入 Spec、任务或领域说明。
- DSA Provider 源码、Provider 原始配置和 DSA 专属 Contract 细节归 `daily-stock-analysis`；Compose 与版本矩阵归 `thesis-ledger-infra`。
