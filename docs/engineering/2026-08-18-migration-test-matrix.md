# current baseline 测试矩阵

当前运行时输入只有一份 `20260905000000_fresh_database_baseline`。旧 migration 不属于运行时升级路径；矩阵中的“可自动执行”表示命令已固化；“待环境验证”表示仍需在真实 PostgreSQL 快照或正式发布环境中执行并归档结果。

| 起点                   | 执行路径                                   | 目标              | 数据检查                          | 当前证据                                                                                                                                |
| ---------------------- | ------------------------------------------ | ----------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 空库                   | PostgreSQL 官方 init 执行 current baseline | 当前 schema       | marker、seed、integrity、核心回归 | `pnpm migration:matrix` 基线为 1 个 migration；隔离 PostgreSQL baseline 与权限不变量演练通过，真实 external volume 切换仍需显式运维窗口 |
| 已有卷且 marker 不匹配 | 不自动修改或删除，保持 unhealthy           | 阻断应用启动      | marker、Compose health、卷状态    | Server schema guard 与 Compose 静态门禁覆盖；现有开发卷重建属于 T3                                                                      |
| current 版本           | 更新 baseline 后显式重建空卷               | 新 current schema | integrity、投影、导出、备份恢复   | 变更前必须 Review baseline SQL 并重新执行隔离 fresh 演练                                                                                |

## 自动检查

`pnpm migration:matrix` 会检查活动 migration 目录命名、`migration.sql` 非空，并验证唯一 current baseline。更新 baseline 版本时必须同步 Review Spec、Task、ADR、Compose 挂载路径和脚本基线，避免文档与代码计数漂移。

`pnpm db:integration` 在真实 Compose PostgreSQL/Redis 上验证健康、Snapshot 幂等、Redis NX 锁与 integrity；fresh baseline 先在隔离数据库验证：

```text
DATABASE_URL=<隔离数据库连接串> pnpm db:migrate
pnpm db:seed
pnpm test
pnpm security:secrets
```

baseline 不做自动 destructive rollback；发布失败时按 `docs/operations/2026-08-18-release-and-recovery.md` 先保留卷和日志，再使用备份恢复或经批准的卷重建。
