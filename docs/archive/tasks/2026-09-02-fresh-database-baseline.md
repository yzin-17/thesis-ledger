# Fresh Database Baseline 实施任务

> 状态：T1–T3 及最终一致性 Review 已完成，已归档。

对应 Spec：[`../specs/2026-09-02-fresh-database-baseline.md`](../specs/2026-09-02-fresh-database-baseline.md)

## 任务

- [x] T1：收敛 current baseline 与 Server Schema 版本 seam
  - 覆盖验收标准：AC1、AC4、AC5、AC7
  - 依赖：无
  - 涉及范围：`apps/server/prisma`、Server platform 启动与健康模块、数据库 baseline 和定向测试。
  - 完成条件：活动 migration 收敛为一份 current baseline；baseline 完整包含当前 Prisma 结构、数据库不变量和唯一版本标记；Server 连接后验证版本，健康响应复用同一常量；NestJS 启用 shutdown hooks。
  - 验证方式：Prisma validate、Server platform 定向测试、baseline 结构扫描、空 PostgreSQL 数据库执行与触发器/`CHECK`/版本断言。
  - 验证证据：
    - `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder pnpm --filter @thesis-ledger/server prisma validate --schema prisma/schema.prisma`：通过。
    - `pnpm --filter @thesis-ledger/server test -- test/platform/schema-version.test.ts test/platform/fresh-database-baseline.test.ts test/ledger/ledger-v2.repository.test.ts test/automation/cash-deposit-materialization-migration.test.ts test/notifications/notification-outbox-migration.test.ts`：45 个测试文件、327 个测试通过，覆盖 Schema guard、健康响应、shutdown hook、baseline 结构和三项不可变 trigger。
    - `pnpm migration:matrix`：活动目录仅含 `20260902000000_fresh_database_baseline`，通过（1 个 migration）。`node scripts/check-boundaries.mjs`：通过。
    - 独立 PostgreSQL 临时容器执行 `prisma migrate deploy`：baseline 应用成功，Schema marker 为 `20260902000000_fresh_database_baseline`；临时容器已删除。

- [x] T2：将 fresh database 初始化收敛到 PostgreSQL 服务
  - 覆盖验收标准：AC1、AC2、AC3、AC6
  - 依赖：T1
  - 涉及范围：`thesis-ledger-infra/compose.yml`、`compose.dev.yml`、数据库访问初始化脚本、更新脚本及其测试。
  - 完成条件：Compose 不再定义数据库初始化任务服务；PostgreSQL 空卷按顺序安装 baseline 与 app role 权限；健康检查验证 current Schema 版本；ThesisLedger 只依赖 PostgreSQL、Redis 与 DSA 健康状态并只接收 app role 连接串；更新失败不删除 external volume。
  - 验证方式：Compose config、infra Shell 测试、角色权限断言、版本不匹配阻断测试、服务列表静态扫描。
  - 验证证据：
    - `docker compose --env-file .env.example -f compose.yml -f compose.dev.yml config --services`：仅有 `postgres`、`redis`、`dsa`、`thesis-ledger`；`scripts/compose-contract.test.sh`：通过。
    - `scripts/compose-contract.test.sh` 与 `scripts/update.test.sh`：通过；Compose 服务集合仅含四个长期服务，并在两个隔离 PostgreSQL 官方 init 临时容器中验证 owner/app 为空或同名时非零失败；临时容器均已清理。更新脚本不执行卷删除。
    - 独立 PostgreSQL 临时容器执行官方 init：Schema marker、三项 trigger、7 项关键 CHECK、owner/app 角色隔离均通过；app role 可 INSERT/SELECT，LedgerEvent UPDATE/DELETE 被权限拒绝，owner 侧也被 append-only trigger 拒绝。临时容器已删除，未使用 `thesis-ledger-postgres-data`。
    - 两仓 `git diff --check`、受影响源码/文档 Prettier 和 Shell 语法检查：通过。

- [x] T3：完成真实 fresh-volume 切换与运行文档同步
  - 覆盖验收标准：AC2、AC3、AC4、AC5、AC6、AC8
  - 依赖：T1、T2
  - 涉及范围：精确重建 `thesis-ledger-postgres-data`、开发栈启动验证、主仓 ADR 与 infra README/更新流程说明。
  - 完成条件：只删除并重建已获授权的 PostgreSQL external volume，不改 Redis 与 DSA SQLite volume；四个长期服务健康；数据库版本、触发器、`CHECK` 和 app role 权限实测符合 Spec；文档与实际行为一致。
  - 验证方式：Docker volume 精确清单、Compose `ps -a`、健康接口、PostgreSQL 元数据与权限查询、服务端定向测试、`git diff --check`。
  - 验证证据：
    - `thesis-ledger:dev` 构建成功，Docker build 完成 Server 编译并生成镜像。
    - 仅停止/删除 `thesis-ledger` 与 `postgres`，仅删除并重建 external volume `thesis-ledger-postgres-data`；Redis/DSA volume 保留，创建时间仍为 2026-08-08 与 2026-08-18，PostgreSQL 新 volume 创建于 2026-09-02。
    - Fresh PostgreSQL healthy；Schema marker 为 `20260902000000_fresh_database_baseline`；三项 trigger 为 `BaselineObservationBatch_submitted`、`ImportDraftRevision_frozen`、`LedgerEvent_append_only`；public schema 有 23 项 `CHECK` constraint。
    - app role 成功读取 marker，并在事务中插入 Account 后回滚；以 app role 执行 LedgerEvent UPDATE 被拒绝。
    - 新 ThesisLedger healthy；`docker compose ps -a` 仅列出 `postgres`、`redis`、`dsa`、`thesis-ledger` 且全部 healthy；`/api/v1/health` 返回 healthy，`schemaVersion`、database、redis、dsa 均正确。
    - ThesisLedger 容器用户为 `thesis`，环境中无 `POSTGRES_OWNER*`；两仓 `git diff --check`：通过。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证；未获提交授权，当前保持未提交状态
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：T1、T2、T3 均已实现并完成确定性、隔离 PostgreSQL 与真实 fresh-volume 运行验证；最终一致性 Review 通过。
- 发现的问题：无。
- 遗留风险：Fresh-only 明确不兼容旧 Schema/业务数据；后续破坏性 Schema 变化仍需显式重建 PostgreSQL external volume，不能自动删除或迁移现有卷。
- 验证命令与结果：T1/T2/T3 证据已记录在对应任务下；Server 327/327、Prisma validate、typecheck、migration matrix、boundary、Compose/init/权限、真实 Docker build/health 与两仓 `git diff --check` 均通过；当前无提交。
