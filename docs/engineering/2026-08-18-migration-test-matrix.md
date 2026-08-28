# Migration 测试矩阵

当前迁移按时间顺序组成单一 Prisma 链，所有支持路径都通过 `prisma migrate deploy` 自动执行，不允许跳过中间迁移。矩阵中的“可自动执行”表示命令已固化；“待环境验证”表示仍需在真实 PostgreSQL 快照上跑并归档结果。

| 起点     | 执行路径                                   | 目标             | 数据检查                                              | 当前证据                                                                                                                                          |
| -------- | ------------------------------------------ | ---------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 空库     | 全部 34 个迁移                             | 当前 schema      | seed、integrity、核心回归                             | 当前工作树 `migration:matrix` 已通过 34 个迁移；Compose 既有验证已部署 33 条迁移并通过 Baseline/核心投影不变量，完整生产副本迁移仍需单独演练      |
| V0.1     | initial 后按顺序 deploy                    | 当前 schema      | Account、Position、Import、Risk、Notification         | 迁移文件和向前兼容字段已 Review                                                                                                                   |
| V0.3     | Ledger/Performance 之前的迁移后继续 deploy | 当前 schema      | Ledger opening balance、Position projection、Snapshot | `migrate-positions` 与 rebuild 测试已通过                                                                                                         |
| 当前版本 | 新增迁移 deploy                            | V1 预发布 schema | integrity、导出、备份恢复                             | 当前工作树新增 Trade/Journal 投影迁移；Compose owner URL 的既有验证累计完成 33 条，当前新增迁移尚未部署到开发持久卷；备份恢复与生产副本待 staging |

## 自动检查

`pnpm migration:matrix` 会检查迁移目录命名递增、每个目录包含 `migration.sql`、SQL 文件非空，并验证矩阵引用的迁移数量。`pnpm db:integration` 在真实 Compose PostgreSQL/Redis 上验证健康、Snapshot 幂等、Redis NX 锁与 integrity；跨快照升级仍在 CI 或 staging 执行：

```text
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm security:secrets
```

旧 `LedgerEvent` 的费用迁移使用 `pnpm migration:legacy-ledger` 做隔离数据库演练。脚本按当前迁移链执行到 `20260826050000_migrate_legacy_ledger_v2`，分别验证零费用、正费用和混合费用明细；负数、缺失值、`NaN` 与未知事件会在写入 V2 字段前阻断，并断言失败事务不创建策略表、不改写原始事件。

迁移不做自动 destructive rollback；发布失败时按 `docs/operations/2026-08-18-release-and-recovery.md` 先回退应用，再使用前向修复或备份恢复。
