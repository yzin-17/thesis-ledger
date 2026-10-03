# 回测任务默认模式与当前创建入口对齐

## 发现与修改

当前创建入口及领取、重试、恢复的状态条件均显式使用 `mode='V3'`，但 `BacktestJob.mode` 在 Prisma Schema 和现行数据库结构中的默认值仍为 `V1`。已将 Schema 默认值改为 `V3`，新增 `20260929180000_backtest_job_current_mode_default` migration 修改数据库默认值；未改写历史 migration 或已有记录。此修改只收紧新记录的默认模式，不替代应用层对旧记录、输入和冻结产物的校验。

## 本地验证

| 检查 | 输入范围 | 结果 |
| --- | --- | --- |
| `pnpm --filter @thesis-ledger/server exec prisma validate --schema prisma/schema.prisma`，使用一次性占位 `DATABASE_URL` | 当前 Prisma Schema | 通过 |
| `pnpm migration:matrix` | 全部 22 份 migration SQL、当前 Prisma Schema、raw-owned 清单 | 通过；动态 head 为新增 migration |
| `node scripts/check-runtime-database-input.mjs` | Server runtime package、Schema、22 份 migration 和结构执行器 | 通过 |
| `git diff --check` 与新增 SQL 空白检查 | 本次 Schema 行及 migration | 通过 |
| Server 定向测试 | 数据库结构、增量升级计划及相邻 Market 缓存清理，共 4 文件 28 项 | 通过 |
| `pnpm --filter @thesis-ledger/server typecheck` | 当前 Server TypeScript | 通过 |
| Prisma Client 生成与 `pnpm --filter @thesis-ledger/server build` | 当前 Schema 和 Server 包 | 通过 |

本表记录该叶验证时的 22 份 migration 输入。随后新增 Ledger 信封标记 migration，最新动态 head 与 23 份输入检查见[Ledger 标记证据](2026-09-29-canonical-ledger-envelope-marker.md)。

当前 Docker daemon 不可用，未执行隔离 PostgreSQL 的 migration 应用、目标数据库结构 head、Server/Worker 闭环或真实客户端验收。`C02-b` 与 `D01` 保持未完成；恢复运行态后需确认默认值、旧模式记录拒绝及目标结构一致。

一次使用 `pnpm ... test -- <files>` 的命令误触发 Server 全包，过程中发现 `database-structure.test.ts` 的 migration head/数量和 `database-upgrade-plan.test.ts` 的增量清单仍固定为上一 head；已修正并停止该次全包。最终只按上表执行 4 文件 28 项定向复测，不将中止的全包记为通过。
