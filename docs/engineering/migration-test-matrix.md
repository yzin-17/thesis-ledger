# Migration 测试矩阵

当前迁移按时间顺序组成单一 Prisma 链，所有支持路径都通过 `prisma migrate deploy` 自动执行，不允许跳过中间迁移。矩阵中的“可自动执行”表示命令已固化；“待环境验证”表示仍需在真实 PostgreSQL 快照上跑并归档结果。

| 起点     | 执行路径                                   | 目标             | 数据检查                                              | 当前证据                                                               |
| -------- | ------------------------------------------ | ---------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| 空库     | 全部 15 个迁移                             | 当前 schema      | seed、integrity、核心回归                             | Compose PostgreSQL 已部署 15 个迁移；`db:integration` 通过             |
| V0.1     | initial 后按顺序 deploy                    | 当前 schema      | Account、Position、Import、Risk、Notification         | 迁移文件和向前兼容字段已 Review                                        |
| V0.3     | Ledger/Performance 之前的迁移后继续 deploy | 当前 schema      | Ledger opening balance、Position projection、Snapshot | `migrate-positions` 与 rebuild 测试已通过                              |
| 当前版本 | 新增迁移 deploy                            | V1 预发布 schema | integrity、导出、备份恢复                             | `prisma migrate deploy` 报告 No pending migrations；备份恢复待 staging |

## 自动检查

`pnpm migration:matrix` 会检查迁移目录命名递增、每个目录包含 `migration.sql`、SQL 文件非空，并验证矩阵引用的迁移数量。`pnpm db:integration` 在真实 Compose PostgreSQL/Redis 上验证健康、Snapshot 幂等、Redis NX 锁与 integrity；跨快照升级仍在 CI 或 staging 执行：

```text
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm security:secrets
```

迁移不做自动 destructive rollback；发布失败时按 `docs/release-and-recovery.md` 先回退应用，再使用前向修复或备份恢复。
