# 开发数据库重建验证记录

> 日期：2026-09-14
> 规格：[开发数据库重建](../archive/specs/2026-09-14-dev-database-rebuild.md)
> 状态：[实施任务](../archive/tasks/2026-09-14-dev-database-rebuild.md) 为验收状态的唯一入口

## 环境与证据边界

验证对象为本主题未提交的主仓与 infra 工作区改动。既有市场图表改动保留，历史 migration 与 `schema.prisma` 未改写。G1 阶段只使用隔离容器；用户随后明确确认 G2，已构建并部署当前源码镜像、重建指定开发库并恢复服务，external volume 保留。

隔离测试使用本机 `postgres:17-alpine`，镜像 ID 为 `sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73`。测试容器使用随机名称和临时内存数据目录，不挂载现有 volume，结束后仅删除本测试资源。

## 可重复验证入口

在主仓执行：

```bash
pnpm --filter @thesis-ledger/server test test/platform test/backtest/backtest-worker-startup.test.ts
pnpm --filter @thesis-ledger/server typecheck
pnpm --filter @thesis-ledger/server build
node scripts/check-migration-matrix.mjs
node scripts/check-runtime-database-input.mjs
node scripts/check-boundaries.mjs
python3 scripts/test-dev-database-rebuild.py
```

以上命令均由主代理独立运行通过，build 与打包检查在最终代码修复后重新执行。平台与 worker 测试共 5 个文件、42 项通过。打包检查使用当前 build 输出，核对 tarball 中 schema、raw-owned 清单、全部 migration SQL 与执行器；不等同于生产 Docker 镜像验收。普通迁移矩阵不触发依赖重新部署，可通过 `VERIFY_RUNTIME_DATABASE_INPUT=true` 显式合并打包检查。

在 infra 执行 `bash scripts/compose-contract.test.sh`，生成失败、psql 失败、check 拒绝、stop 失败与成功启动顺序通过。两仓 `git diff --check` 通过。

本主题 TypeScript 文件定向 ESLint 通过。文件尺寸检查退出码为 0，报告 9 项存量警告；该次未提供历史基线，不能据此宣称验证了全仓 ratchet。infra 的 `update.sh` 提取启动与数据库编排职责后为 571 行，未扩大原文件。

## 隔离 PostgreSQL 结果

[隔离验收脚本](../../scripts/test-dev-database-rebuild.py) 使用编译后的实际 SQL 生成器和 infra 权限脚本，所有场景通过：

| 场景 | 实际断言 |
| --- | --- |
| 空库重建 | public 包含 65 张表，使用全部 7 份 SQL，head 为 `20260912163000_automation_durable_occurrence` |
| 旧 baseline 重建 | 先实际安装 baseline，再插入测试表与记录；完整重建后为当前 head，旧测试表被清除 |
| SQL 失败回滚 | 在 COMMIT 前注入除零错误；执行失败后，重建前的测试记录值 `42` 仍存在，证明原数据回滚保留 |
| 重复重建 | 再次成功重建后旧测试表被清除，且 `_prisma_migrations` 不存在 |
| 权限 | app role 可向 `StrategyRiskApplication` INSERT，不可 UPDATE `LedgerEvent` 或 `SchemaVersion` |
| A 目标连接 B | A 的 SQL 在 B 执行时于 DROP 前失败，B 中测试记录值 `7` 保留 |
| 当前 head 缺表 | 删除 `StrategyRiskApplicationAudit` 后，check 即使看到当前 head 也失败 |

测试启动最初遇到 PostgreSQL 临时初始化进程已接受 socket 连接、但目标库尚未创建的问题。测试现等待最终 TCP 服务就绪，随后上述场景通过；这属于测试启动时序修正。

## 关键修复复核

CLI 原先允许确认目标 A 与执行目标 B 分离；现已统一目标校验。主代理重复原复现参数，编译后 CLI 返回退出码 1，stdout 为空。

worker 在创建 Redis/BullMQ 消费者前通过独立 Prisma 探针检查结构，并在成功或失败时断开探针；不再新增持久 Nest 应用上下文。检查失败和启动顺序已有定向测试。

## 当前开发环境部署验收

用户于 2026-09-14 明确确认重建 `thesis-ledger-dev/thesis_ledger` 并启动 Server/Worker。实际调用：

```bash
DEV_DATABASE_MODE=rebuild \
DEV_DATABASE_ALLOW_DATA_LOSS=true \
DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger \
REPAIR_BUILD_CACHE_ON_NO_SPACE=false \
  ./scripts/update.sh thesis-ledger
```

首次调用因沙箱无法访问 BuildKit 状态目录而在构建阶段失败，尚未进入数据库阶段；使用允许的执行权限重试成功。实际 rebuild 仅执行一次，未清理 PostgreSQL 或 Redis volume，未重建 DSA 镜像。

主代理于 `2026-09-14T06:18:12Z` 独立审计：

- Server 与 Worker 运行镜像均为 `sha256:4d76826723419df570a9e9ec19dff40d00fd0bb3d43554012b797d5fa32927d2`。
- PostgreSQL、Server、Worker 容器均为 running / healthy。
- 结构 head 为 `20260912163000_automation_durable_occurrence`，public 表数 65，逐表核对缺失清单为空，`_prisma_migrations` 不存在。
- `/api/v1/health` 返回 healthy；database、redis、dsa 均 healthy，fundNav 为 true。
- Worker 心跳探针退出码为 0。Server 本次启动日志包含 Nest 成功启动记录；Server/Worker 自本次启动起的日志中均无缺表或 Prisma 已知请求异常。
- PostgreSQL 仍使用 `thesis-ledger-postgres-data`，其他持久卷保留。

更新日志保存在 `/private/tmp/2026-09-14-thesis-ledger-g2-update.log` 与 `/private/tmp/2026-09-14-thesis-ledger-g2-update-retry.log`。本次证明开发库结构及应用启动恢复，不代表正式环境的保留数据升级已验收。

## 新增账户外键后的再次重建

2026-09-14 后续新增 `20260914090000_permanent_account_deletion`，源码与新镜像已包含第 8 份结构 SQL，但数据库仍为上一节记录的旧 head。默认 check 因版本不匹配拒绝启用新镜像，旧 Server/Worker 保持 healthy。

用户再次明确确认清空 `thesis-ledger-dev/thesis_ledger` 的 public 数据并重建。本次直接复用已构建镜像，通过 infra `scripts/dev-database.sh` 的目标确认、消费者停止、结构重建及启动函数执行；未重复构建镜像，未修改默认 check 行为，未删除 volume，实际重建仅一次。

主代理于 `2026-09-14T09:52:17Z` 验收通过：

- Server/Worker 镜像为 `sha256:48b5639085bc27bfc14ca848522d36aa6d74b8ed098936c5855e7727ac9e9cb9`。
- 当前 head 为 `20260914090000_permanent_account_deletion`；65 张表全部存在，`_prisma_migrations` 不存在。
- `TargetAllocation`、`RiskEvent`、`JournalEntry`、`JournalReviewSnapshot`、`AiDecisionLog` 的 5 个新增 Account 外键均存在。
- PostgreSQL、Server、Worker 均 running / healthy；API 的 database、redis、dsa 依赖均 healthy，Worker 心跳探针退出码为 0。
- 本次 Server/Worker 启动日志无缺表或 Prisma 已知请求异常。

执行日志：`/private/tmp/thesis-ledger-confirmed-rebuild-current-image.log`。本次仅验证结构部署与服务恢复，不替代账户永久删除功能的业务验收。
