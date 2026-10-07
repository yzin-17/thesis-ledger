# E01-N2.5 / N2.6 NAV 准备凭证与 Run 持久化证据

状态：N2.5 与 N2.6 已完成最终复核和隔离 PostgreSQL 验收；N3 Worker 接线与 N4 目标运行态留其独立任务验收。

## 隔离数据库方案

`apps/server/test/backtest/nav-postgres.integration-harness.ts` 在显式设置 `E01_N2_6_POSTGRES=1` 时启动一个带唯一名称与随机标签的 PostgreSQL 测试容器。容器使用本机已有 `postgres:17-alpine` 镜像的 image ID、随机映射到 `127.0.0.1` 的临时端口及临时内存文件系统，不挂载应用或数据库数据卷。验收逐个执行仓库排序后的全部 migration SQL，再核对 `SchemaVersion` head、预期表数量及表覆盖；随后执行相邻 `thesis-ledger-infra/scripts/bootstrap-app-role.sql`，并用应用角色初始化项目 `PrismaService`，由其执行完整结构门禁。

管理员 SQL 入口会先核对本次容器的随机标签，仅供事务回滚场景在这个隔离数据库安装故障注入触发器。清理时同样先核对标签，再移除本次创建的容器。

## 验收覆盖

`apps/server/test/backtest/backtest-nav-postgres.integration.test.ts` 使用受控 NAV 来源 fixture，不调用真实 Provider。覆盖准备 API 写入完整请求和证据、数据库断连后由新 Prisma 会话及新 Run Service 读取凭证与已冻结 Run、冻结 Manifest 与 Parquet 回放一致、策略/路由/有效期失效拒绝、三类凭证篡改与交叉绑定拒绝、消费幂等及并发、冻结失败终态，以及事务故障回滚后数据库无 Run 且孤儿快照不能通过 Run 读取。过期用例保留合法 `expiresAt`，将时钟推进到该时间之后，验证新 Run 被拒绝、已消费 Run 仍可读取且相同幂等键仍返回原 Run。

## 实测结果

- 隔离镜像：`postgres:17-alpine`，image ID `sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73`。容器名和端口由每次测试随机生成；端口仅绑定 `127.0.0.1`，数据目录使用 tmpfs。
- 结构输入：排序执行全部 25 条 migration SQL。结构 head 为 `20261001100000_nav_backtest_preparation`；`SchemaVersion` 与该 head 一致；预期及实有 `public` 表均为 71 张，覆盖 11 张 raw-owned 表。初始化实际 `bootstrap-app-role.sql` 后，以 `nav_n2_6_app` 连接并通过完整 `PrismaService` 结构门禁。
- 首两次启动在测试用例前失败，均未执行数据库验收且均清理了本次容器：第一次把本地 socket 的 `pg_isready` 暂时响应误认为数据库已建成；第二次撞上 PostgreSQL 初始化进程退出。夹具改为等待容器内 `127.0.0.1` TCP 上的正式 PostgreSQL，并通过 owner 查询确认或创建专属测试库。
- 首次完整执行为 5/10 通过、5/10 断言失败，原因是测试把 Nest `POST /backtests/runs/nav` 默认成功状态写成 200，实际为 201。将创建成功断言改为精确 201（准备 API 仍精确 200；消费冲突仍精确 409）后重新执行。
- 最终 Review 补强版第一次执行为 9/10 通过。唯一失败是交叉 hash 测试把 `Scenario.request` 属性重新赋值，但准备请求闭包仍引用原对象，导致两份收据实际具有相同 hash；该执行触发了幂等冲突。将用例改为修改闭包共享对象，并断言两份收据 hash 确实不同后重跑。
- 最终命令：`E01_N2_6_POSTGRES=1 rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-nav-postgres.integration.test.ts`。最终结果：1 个测试文件通过，10/10 用例通过，耗时 6.37 秒；无 skipped 用例。补强后实测包括有效凭证过期、过期后读取已消费 Run 与幂等重放、精确证据/策略/路由/交叉 hash 错误响应、新 Prisma 与 Run Service 读取已冻结 Run、Manifest/Parquet 重放、并发单次消费、失败回滚及孤儿文件读取拒绝。
- 本轮定向检查：`tsc --noEmit --project /private/tmp/e01-n2-types.tsconfig.json`、两份 owned 测试/harness 的 ESLint、测试/harness/证据文档的 Prettier 检查均通过。
- 同步本地门禁由主协调记录，本轮未重复运行：151 项回归、全 Server typecheck/build、complexity/function 门禁、migration matrix 与 runtime package input 门禁通过，Schema exports 无变化；Proof 错误分类、已知快照文件失败映射与来源/Run 绑定修复纳入该组门禁。上述检查不代表 N3 Worker 执行或目标运行时验收完成。
- 最终清理核对未发现遗留的 `tl-nav-n2-6-*` 测试容器或 `tl-nav-n2-6-artifacts-*` 临时目录。该验收没有连接或改动开发 PostgreSQL、应用容器或既有 Docker volumes。

## 本地检查输入与复现

本地回归输入为本次准备记录、准备 API、NAV Run 创建/读取、队列拒绝边界、新模型/migration 及其定向与相邻测试；最终复核修复后执行以下 11 文件回归，共 151 项通过。隔离数据库补强使用同一生产源码，另执行上文 10 项实际 PostgreSQL 验收。已通过的真实来源取证沿用 N2.3/N2.4 证据，本轮数据库夹具仍为受控来源。

```sh
rtk proxy pnpm --filter @thesis-ledger/server exec vitest run \
  test/backtest/backtest-nav-run-http.test.ts test/backtest/backtest-nav-queue-boundary.test.ts \
  test/backtest/nav-preparation-repository.test.ts test/backtest/backtest-nav-preparation-http.test.ts \
  test/backtest/queue-lifecycle.test.ts test/backtest/queue-cas-isolation.test.ts \
  test/backtest/current-run-boundary.test.ts test/backtest/backtest-nav-snapshot-store.test.ts \
  test/market-nav-reader-v3.test.ts test/platform/database-structure.test.ts \
  test/platform/database-upgrade-plan.test.ts
```

| 检查         | 命令与范围                                                                                                                                                                                                 | 最后结果                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 包级检查     | `rtk proxy pnpm --filter @thesis-ledger/schemas build`、`typecheck`；`rtk proxy pnpm --filter @thesis-ledger/server typecheck`、`build`                                                                    | 通过；最终完整 Server 检查已恢复通过，无需修改并行 N3 文件                                              |
| Prisma       | `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/nav_receipt_validate rtk proxy pnpm --filter @thesis-ledger/server prisma validate`；`generate`                                          | 通过；仅新增模型与必要反向关联，历史 migration 未修改                                                   |
| 结构与打包   | `rtk proxy node scripts/check-migration-matrix.mjs`；`rtk proxy node scripts/check-runtime-database-input.mjs`                                                                                             | 25 条 migration、71 张 SQL 表、60 个 Prisma model、11 张 raw-owned 表；runtime 逐条输入及结构执行器通过 |
| 边界         | `rtk proxy node scripts/check-boundaries.mjs`                                                                                                                                                              | 通过；依赖保持 Backtest 单向消费 Market Reader                                                          |
| 格式与复杂度 | 本次 Schemas、Server、测试文件限定 `prettier --check`、`eslint --max-warnings=0`；生产函数另启用 `complexity:[warn,20]` 与 `max-lines-per-function:[warn,{max:220,skipBlankLines:true,skipComments:true}]` | 通过；过大的校验按证据读取、异常归类、准备关联、配置关联、来源与冻结上下文职责提取，无阈值调整          |

上述输入或依赖发生变化时只重跑受影响检查；目标镜像/开发数据库仍由 N4 更新与验收。

## N3 执行器接线合同

N3 在独立 NAV 路由与执行器中消费此写入格式：`BacktestJob.mode` 为 `V3`，`input` 带 `contractVersion: 3`、`schemaVersion: '3'`、`inputKind: 'nav'`、完整 NAV `runConfig`、`preparationId` 与 `preparationHash`；`snapshotManifest` 和 `snapshotId` 指向对应 NAV 冻结证据，`NavBacktestPreparation.consumedRunId` 唯一关联该 Job。创建请求使用 `backtestNavRunCreateV3Schema`，读取响应使用 `backtestNavRunResponseV3Schema`；独立 HTTP 路径为 `POST /api/v1/backtests/runs/nav`（成功返回 201）与 `GET /api/v1/backtests/runs/nav/:id`（成功返回 200）。队列尚未具备 NAV 执行能力时，投递、补投及 Worker 领取入口都必须拒绝将 `inputKind: 'nav'` 交给仅支持场内数据的执行器。终态错误码应保留可机器识别的 `NAV_RUNNER_UNAVAILABLE` 或快照失败码。

当前 N2.5 创建路径在快照成功后写入 `failed / NAV_RUNNER_UNAVAILABLE`，不向 Worker 投递。N3 启用前，队列入口、补投和 Worker 领取都应依据 `inputKind: 'nav'` 拒绝把该 Job 交给仅支持场内数据的执行器；N3 接好 NAV 执行分支后，再由显式具备 NAV 能力的执行路径启用投递。上述 N3 接线与 Worker 验收不属于本次 N2.6 隔离数据库测试，也尚未完成。

## 执行记录

本次仅使用受控来源 fixture 与独立 PostgreSQL 容器验证 Server 持久化边界；没有验证真实 Provider、NAV Worker 执行、目标开发容器、桌面端或产品业务结果。Worker 投递及 NAV 执行器仍由 N3 单独完成和验收。
