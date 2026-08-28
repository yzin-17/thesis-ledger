# 2026-08 文档审查记录

审查依据：[PR #18：改善文档生命周期与清理流程](https://github.com/yzin-17/thesis-ledger/pull/18)。

## 审查范围

本次检查覆盖 `docs/README.md`、当前 Spec/Task、Architecture、ADR、Review 入口、归档目录，以及 DSA/provider 相关文档。目标是落实 PR 提出的 SSOT、生命周期和后续清理规则，不改变业务实现或跨仓接口。

## 发现与处理

| 发现                                                                    | 处理                                                                                                                                    |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 生命周期规则分散在多个 README 中，缺少统一入口                          | 新增 [`DOCUMENTATION-GUIDE.md`](../DOCUMENTATION-GUIDE.md)，集中定义类别、SSOT、生命周期和 Review 清单；`docs/README.md` 收敛为导航入口 |
| DSA/provider 文档同时出现在 Spec、Architecture 和 Task 中，职责容易混淆 | 固定 `Spec = 需求与范围`、`Architecture = 当前边界与兼容性`、`Task = 实施状态与证据`；Provider 原始实现继续归 DSA 仓库                  |
| 版本矩阵与 DSA Contract 兼容说明存在重复                                | `architecture/version-matrix.md` 作为发布级版本 SSOT；`2026-08-18-thesis-ledger-dsa-compatibility.md` 只保留 Contract V1 能力与验证规则 |
| 已完成的 market-data closure 任务仍占用当前任务目录                     | closure-01 至 closure-08、closure-10 移至 `docs/archive/tasks/`；closure-09 和 closure-11 仍因原生 Mobile 门禁保持当前状态              |
| 已完成的 architecture improvement 计划仍位于当前 Spec/Task              | 计划及其 Spec 按归档日期移至 `docs/archive/`，并保留兼容矩阵链接和原始验收内容                                                          |
| DSA 集成模块说明位于 docs 根目录，且内容与当前三仓边界不完全一致        | 正文整理到 `docs/engineering/2026-08-22-dsa-integration-module.md`，旧路径保留兼容入口                                                  |

## 当前 SSOT 映射

| 主题                    | 当前入口                                                                                                                                        | 负责内容                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 市场数据与标的中心 v1.2 | [`specs/2026-08-18-market-data-provider-spec-v1.2.md`](../specs/2026-08-18-market-data-provider-spec-v1.2.md)                                   | 目标、范围、模型和验收标准                         |
| v1.2 当前实现边界       | [`architecture/2026-08-18-market-data-provider-v1-2-implementation.md`](../architecture/2026-08-18-market-data-provider-v1-2-implementation.md) | 三仓职责、Control Contract、Policy、缓存和发布边界 |
| v1.2 实施状态           | [`tasks/2026-08-18-market-data-provider-v1-2.md`](../tasks/2026-08-18-market-data-provider-v1-2.md)                                             | 主任务状态、验证证据和未完成门禁                   |
| 三仓发布版本            | [`architecture/version-matrix.md`](../architecture/version-matrix.md)                                                                           | ThesisLedger、DSA、Schema、数据库和 infra 兼容门禁 |
| DSA Contract V1 能力    | [`architecture/2026-08-18-thesis-ledger-dsa-compatibility.md`](../architecture/2026-08-18-thesis-ledger-dsa-compatibility.md)                   | Data/Control Contract 能力和验证规则               |
| 当前发布与运行证据      | [`reviews/README.md`](README.md)                                                                                                                | 发布门禁、运行阻塞和平台证据                       |

## 遗留项与后续动作

- market-data/provider v1.2 主任务的 T11、closure-09 和 closure-11 仍保留在当前目录；原生 Mobile 联网与视觉验收完成后，再进行下一次归档 Review。
- DSA Provider 适配器、凭证和上游细节不在本仓重复整理；如 DSA 仓库发生接口变化，应先更新 Contract/兼容矩阵，再同步主仓文档。
- 继续按月执行文档 Review；下一次重点检查当前 Spec、Task、Architecture 和发布证据是否仍指向同一版本基线。

## 状态

- [x] 文档生命周期指南已建立。
- [x] `docs/README.md`、任务入口和归档入口已同步。
- [x] 已完成任务与当前阻塞任务已分离。
- [x] DSA/provider 的当前 SSOT 关系已记录。
