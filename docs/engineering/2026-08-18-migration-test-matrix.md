# Migration 测试矩阵

当前迁移按时间顺序组成单一 Prisma 链，所有支持路径都通过 `prisma migrate deploy` 自动执行，不允许跳过中间迁移。矩阵中的“可自动执行”表示命令已固化；“待环境验证”表示仍需在真实 PostgreSQL 快照或正式发布环境中执行并归档结果。

| 起点 | 执行路径 | 目标 | 数据检查 | 当前证据 |
| --- | --- | --- | --- | --- |
| 空库 | 全部 35 个迁移 | 当前 schema | seed、integrity、核心回归 | 当前 `pnpm migration:matrix` 基线为 35 个迁移；Trade V2 隔离迁移 smoke 与本地 Compose 不变量已有独立证据，完整生产副本迁移仍需发布阶段演练 |
| V0.1 | initial 后按顺序 deploy | 当前 schema | Account、Position、Import、Risk、Notification | 迁移文件和向前兼容字段已 Review；发布环境仍需按同一迁移链验证 |
| V0.3 | Ledger/Performance 之前的迁移后继续 deploy | 当前 schema | Ledger、Position Projection、Snapshot | `migrate-positions`、Ledger V2 legacy migration smoke 与 rebuild 测试已有本地证据 |
| 当前版本 | 新增迁移 deploy | 当前 schema | integrity、投影、导出、备份恢复 | 当前迁移矩阵与 Trade Projection 本地迁移 smoke 已通过；生产数据副本、备份恢复与正式切换继续作为发布门禁 |

## 自动检查

`pnpm migration:matrix` 会检查迁移目录命名递增、每个目录包含 `migration.sql`、SQL 文件非空，并验证矩阵引用的迁移数量。当前门禁脚本的权威基线为 35；新增或删除 migration 时必须同时 Review SQL、迁移矩阵和脚本基线，避免文档与代码计数漂移。

`pnpm db:integration` 在真实 Compose PostgreSQL/Redis 上验证健康、Snapshot 幂等、Redis NX 锁与 integrity；跨快照升级仍在 CI、staging 或发布环境执行：

```text
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm security:secrets
```

旧 `LedgerEvent` 的费用迁移使用 `pnpm migration:legacy-ledger` 做隔离数据库演练。脚本验证事件数量、V2 envelope、成本策略、费用明细以及旧列收缩；负数、缺失值、`NaN` 与未知事件必须在写入 V2 字段前阻断，并断言失败事务不创建新事实或静默改写原始事件。

迁移不做自动 destructive rollback；发布失败时按 `docs/operations/2026-08-18-release-and-recovery.md` 先回退兼容应用，再使用前向修复或备份恢复。
