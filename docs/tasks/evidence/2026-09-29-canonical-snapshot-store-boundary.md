# 现行 Snapshot Store 边界收敛

> 2026-09-29；对应[单一现行链路替换任务](../2026-09-29-thesis-ledger-canonical-runtime-replacement.md)的 C04/E01。本记录为源码与本地测试证据，目标 Worker 和运行态未验收。

## 修改

- `LocalSnapshotStore` 删除旧 manifest V1/V2 的本地 `startBuild`、`finalize`、`load`、`retry`、`replay`、`deleteRun` 和迁移 dry-run；当前运行时只通过 `v3` Store 构建、核验与回放。共享 Artifact 写入保留单段 Run ID、相对路径和父目录拒绝，现行 Store 使用同一检查。
- 旧 Store 专用的模型完整性与迁移测试删除；当前依赖闭包计算测试保留，现行 Store 对旧/损坏 manifest、跨 Run 路径及 Artifact 篡改的拒绝测试保留或补充。HiThink、Tushare、RQData 现行事件原文回放测试直接使用 `v3.putArtifact`。
- V3 manifest 构建已直接调用 `buildCurrentSnapshotBase` 计算基础依赖闭包、预热窗口和规则版本，旧 `buildSnapshotManifest`、旧 manifest 类型及研究模型版本分支已删除。V3 Run 创建与快照构建直接校验当前 RunConfig，策略执行币种现金不足仍在冻结和写库前拒绝；旧 `validateStrategyRunConfig` 仍用于其他合同测试，策略 Schema 目前仍是 V2 名称，须在 C03 继续收敛。

## 验证

| 层级 | 结果 |
| --- | --- |
| 定向 | Snapshot 边界 8 文件/31 项、当前构建及 Run 生命周期 5 文件/46 项、现行现金拒绝 9 项通过。 |
| 包级 | Schemas 46 文件/568 项通过；Server 226 文件通过、25 文件跳过，1773 项通过、91 项跳过。 |
| 类型与构建 | Schemas 与 Server 类型检查、Schemas 与 Server build 通过。 |
| 边界与差异 | `node scripts/check-boundaries.mjs`、相关 `git diff --check` 通过。 |

目标 PostgreSQL/Worker 和正式部署仍未执行本叶，C03/C04/E01/D02 不勾选。
