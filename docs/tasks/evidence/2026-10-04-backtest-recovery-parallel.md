# 当前 Backtest Run 隔离进程故障恢复证据

## 结论和边界

原 T4 拆出的 R1 领取后 SIGKILL、R2 专属 Redis 短停、R3 运输记录重建全部通过。真实 PostgreSQL、Redis、BullMQ、独立 Worker PID、生产 processor 和领域 Runner 参与执行；每条 Run 两笔模拟成交、三个估值点，结果 Schema、身份、checksum、唯一终态与离线重放一致。没有需要集成的生产业务修复。

**原 T4 保持未勾选**。本测试入口使用真实 BullMQ Worker 和生产 `backtest.processor.js`，仅添加专属 queue prefix；不把它等同于目标 Compose `backtest-worker.main.js` 的心跳/健康检查。生产 reconciler 在 R1 每15秒显式触发；目标 Server 定时器、目标部署和 Electron 不在本轮覆盖范围。

执行包：[隔离叶 Task](../2026-10-04-backtest-recovery-parallel.md)。权威需求为原主仓 `docs/tasks/2026-09-09-backtest-bullmq-lifecycle.md` 的2026-10-03对账与配对 Spec 的 AC2/AC8/AC9/AC10。Canonical C02 的已归档 Task、当前 owner/执行器/transport 源码及现有测试用于确认当前单一 Run 边界；没有恢复 jobs/V1/V2 旧入口，也没有计入 AI 研究恢复证据。

## 工作区、依赖和输入基线

- 工作区：`/Users/yzin/.codex/worktrees/44dc/thesis-ledger`；工作区和原主仓 HEAD 均为 `514abeebfe57bac0c16271439d8b777ff3b02a9f`。
- 开始时工作区干净，原主仓262项 dirty WIP；原主仓、DSA、infra始终只读，没有 reset/clean/stage/commit/push。
- Backtest 全部源码/已有测试、Platform 全部源码、全部 Prisma 输入、lockfile、根/Server manifest 和 TypeScript 配置逐文件一致。
- 原主仓不同的相关依赖：`market.module.ts`、`market.controller.ts`、`integration/dsa/dsa.client.ts`；Domain的 `trade-costs.ts`/`index.ts`；Schemas的 `market-bar-series.ts`/`market.ts`/`index.ts`及 `journal-review.test.ts`。原主仓新增的行情/日记文件也未复制。生产 processor 仅通过 Platform 消费冻结执行核心，报告仍限定于本工作区基线；父对话按最终集成后的输入决定复验范围。
- 安装：Node `24.18.0`、pnpm `11.9.0`、BullMQ锁定 `6.3.4`、Prisma Client `6.19.3`、Vitest `3.2.7`；frozen-lockfile安装没有改变 manifest/lockfile。
- 325个基线文件的路径与内容联合 SHA-256：`e689b6a1adc22019069d93e9eee9a5d5c9128b07937947961a90acf703f6ec8f`。范围为 Backtest/Platform、全部Prisma输入、Shared/Domain/Schemas源码及上述manifest/TS配置；不含测试和产物。

## 真实隔离环境

最终验收容器 PostgreSQL `tl-backtest-recovery-10926-66d0848c`、Redis `tl-backtest-recovery-redis-10926-69f3697f`；loopback端口分别为 53968/54003；队列 `backtest-run`，随机prefix `recovery-69f3697f-5a2c-4bb1-985b-504900bf8577`。

数据库 `backtest_recovery`，受限应用角色 `backtest_recovery_app`。程序实际核对 `current_database/current_user`，应用连接经 `PrismaService.onModuleInit`。依目录顺序执行全量26个migration SQL，自动派生head `20261001120000_require_explicit_strategy_contract`；核验71张实际public表全部存在且无额外表，包含60个Prisma model及11张raw-owned表。应用权限通过只读infra `scripts/bootstrap-app-role.sql`初始化，完成结构/role检查后才启动Worker；没有用db push或共享数据库。

PostgreSQL使用专属tmpfs；Redis使用本测试创建的临时宿主目录，AOF和 `appendfsync=always`保持短停运输记录。容器操作前核对专属nonce标签。没有创建或删除Docker volume，没有操作目标消费者、目标Redis/数据库、既有Run或父对话端口。

复用已有镜像：PostgreSQL `sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73`；Redis `sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241`。没有构建生产镜像。

专属构建输出 `/Users/yzin/.codex/worktrees/44dc/thesis-ledger/apps/server/dist/backtest-recovery`，属于忽略的dist目录；冻结产物目录 `/var/folders/t6/qhk7wqzd07g25xwy7mr46gb00000gn/T/tl-backtest-recovery-artifacts-dddprS`。Run和策略身份全部随机创建；当前Run不关联Account，本测试没有写账户表。准备阶段使用随机loopback HTTP fixture提供冻结领域输入；Worker设置 `DSA_BASE_URL=http://127.0.0.1:1`，结果来自真实离线领域执行，没有调用收费Provider或硬编码成功。

## 领取屏障与故障时序

屏障暂存原始manifest字节，将本测试的 `finalized.json`替换为FIFO，令生产snapshot replay等待真实文件I/O。必须独立读取确认数据库running/owner后才SIGKILL。恢复执行时向FIFO提供原始manifest，恢复普通文件并验证字节相同；生产Runner、校验和经济执行不做mock。只终止本测试持有的ChildProcess。

R1保留默认锁/stalled检测、并发1与最多三次durable attempt，未提高阈值。active运输不能被reconciler抢占；stalled运输再次领取看到旧running后不重复业务执行，随后既有reconcile重排并派生owner=2。

R2真实停止/启动专属Redis，确认查询失败后reconcile不改写running数据库整行；AOF恢复的运输仍active，同一Worker/owner=1成功。R3仅删除该随机prefix的运输键，成功查询确认缺失后才恢复，重新投递的本地attemptsMade=0，数据库owner继续从1增加到2。

下表时间均为2026-10-04北京时间。

| 叶 | 时刻 | 事件 | 断言/身份 |
| --- | --- | --- | --- |
| R1 | 22:13:28.104 | 启动 Worker | PID 11462 |
| R1 | 22:13:29.129 | 数据库领取 | running，owner=1 |
| R1 | 22:13:29.142 | Worker 退出 | PID 11462，SIGKILL |
| R1 | 22:13:29.146 | 启动 Worker | PID 11472 |
| R1 | 22:14:29.357 | 默认 stalled 检测 | PID 11472 |
| R1 | 22:14:44.232 | 数据库领取 | running，owner=2 |
| R1 | 22:14:44.240 | 旧 owner CAS 拒绝 | owner1→owner2，4 次探针更新0行 |
| R1 | 22:14:44.772 | 数据库成功终态 | owner=2，唯一结果=1 |
| R1 | 22:14:44.809 | Worker 退出 | PID 11472，exit=0 |
| R2 | 22:14:44.935 | 启动 Worker | PID 12856 |
| R2 | 22:14:46.155 | 数据库领取 | running，owner=1 |
| R2 | 22:14:46.427 | Redis 短停 | 专属实例 |
| R2 | 22:14:46.749 | 查询失败但数据库整行保持 | 专属实例 |
| R2 | 22:14:46.953 | Redis 恢复 | 专属实例 |
| R2 | 22:14:47.561 | 数据库成功终态 | owner=1，唯一结果=1 |
| R2 | 22:14:47.597 | Worker 退出 | PID 12856，exit=0 |
| R3 | 22:14:47.728 | 启动 Worker | PID 12942 |
| R3 | 22:14:48.930 | 数据库领取 | running，owner=1 |
| R3 | 22:14:49.075 | Worker 退出 | PID 12942，SIGKILL |
| R3 | 22:14:49.198 | 运输记录重建 | 删除 11 个专属运输键；DB owner=1，attemptsMade=0 |
| R3 | 22:14:49.199 | 启动 Worker | PID 12972 |
| R3 | 22:14:50.914 | 数据库领取 | running，owner=2 |
| R3 | 22:14:50.936 | 旧 owner CAS 拒绝 | owner1→owner2，4 次探针更新0行 |
| R3 | 22:14:52.581 | 数据库成功终态 | owner=2，唯一结果=1 |
| R3 | 22:14:52.654 | Worker 退出 | PID 12972，exit=0 |
| R3 | 22:14:52.658 | 非终态总数 | queued/running=0 |

R1/R3新owner=2仍running时，旧owner=1的四个数据库CAS探针尝试写succeeded/failed/queued/cancelled，全部更新0行且整行不变。探针采用生产成功/失败/重排路径的 `id+mode+running+executionAttempt+cancelRequestedAt=null`条件。cancelled探针只是非法旧owner状态写入检查，**不代表生产取消确认语义通过**。旧进程已死亡，这里证明数据库晚到写入fencing，不伪称被杀进程重新提交；生产状态机另外由既有owner/CAS定向测试承接。

| 叶 | Run身份 | 最终owner | checksum | 成交/估值点 | 唯一结果/重放 |
| --- | --- | --- | --- | --- | --- |
| R1 | `246dc89b-08e5-4bf8-9837-58e88c95b8ec` | 2 | `1edd1a18c1fe2b7c` | 2/3 | 1/相同 |
| R2 | `cb3d4f59-f14f-4502-97dc-3bedff36d04c` | 1 | `116e6c7706695ba3` | 2/3 | 1/相同 |
| R3 | `b3998a4b-24ec-4e62-b491-dbc68ef6f8b1` | 2 | `4af41c8642dc7b68` | 2/3 | 1/相同 |

各结果通过 `backtestResultSchemaV3`，持久化checksum与结果checksum一致；按Run查询成功结果只有1行，终态后再次ensureEnqueued/reconcile完整行保持。checksum包含随机Run身份，不要求不同Run的checksum彼此相等。最终queued/running总数为0。

## 可复现入口和验证

在本工作区执行 `node scripts/test-backtest-recovery.mjs`。入口生成Prisma Client，构建Shared/Domain/Schemas和专属Server输出，再显式启用三个真实隔离测试。需要已安装frozen-lockfile依赖、本机Docker和上述两个已有镜像。role SQL可用 `BACKTEST_RECOVERY_APP_ROLE_SQL`指定；当前默认只读路径为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/scripts/bootstrap-app-role.sql`。

| 命令 | 输入范围和最后结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 本工作区锁定依赖；成功。 |
| Server Vitest：`durable-owner-recovery.test.ts reconciler.test.ts queue-cas-isolation.test.ts` | 19项通过。 |
| `node scripts/test-backtest-recovery.mjs` | 最终入口3项通过；R1 77.175秒、R2 2.788秒、R3 5.061秒，总93.53秒，exit0。断言helper已按职责移出describe，新增文件无220行函数告警。 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/backtest` | 78文件/585项通过，7文件/23项因独立环境开关跳过；新增3项由上一行显式验证。 |
| Server `tsc -p tsconfig.json --noEmit`及标准 `pnpm --filter @thesis-ledger/server build` | 类型检查和标准Nest构建通过。最后入口另完成专属输出构建。 |
| `pnpm exec eslint`加本主题4个ts文件 | 通过，0输出；重排后的测试额外按220行error规则通过。 |
| `pnpm exec prettier --check`加本主题文件 | 测试、fixture、脚本、Task通过；最终文档检查见收尾记录。 |
| `node scripts/check-boundaries.mjs` | 全仓import方向通过，生产源码无修改。 |
| `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` | ratchet通过，10处既有超限均未增长。 |
| `node scripts/lint-workspace.mjs --guardrails` | 全仓8组/1420文件通过，保留既有warning；本主题describe新告警已移除并定向error门禁通过。 |
| `node scripts/check-migration-matrix.mjs` | 26migration/71表/60model/11raw-owned通过。 |
| `node scripts/check-runtime-database-input.mjs` | 标准Nest构建后通过，26migration与打包executor齐全。 |
| `git diff --check` | 通过；新增文件由专属lint和格式检查覆盖。 |

全仓guardrails首次失败是API Client尚未构建，Desktop出现类型解析error；补齐本工作区API Client产物后全仓通过。runtime输入检查首次因只有专属输出而缺少默认dist executor，标准Nest构建后通过。两次环境准备失败不被计为业务缺陷或通过证据。

原始日志：`/tmp/tl-backtest-44dc-final-entry-v2.log`；定向/包级/typecheck/构建/门禁日志同 `tl-backtest-44dc-`前缀。这些为可清理的本机日志；本报告保存关键身份、时序、断言与结果，不依赖临时日志永久存在。

## 缺陷、清理和未覆盖门禁

首次R2/R3失败是测试环境使用空HostPort，Docker在stop/start后重新分配端口。独立无业务容器复现 `50990→50995`，旧Worker连接旧端口。专属Redis fixture改为随机选端口后显式绑定，并在恢复后核对端口；业务retry/timeout没有改变。修正后R2/R3独立通过，最终入口全部通过。未复现需要修改生产owner/CAS/transport的业务缺陷。

最终 22:14:53.458清理完成：本测试PID 11462/11472/12856/12942/12972均已退出；旧owner为SIGKILL，新/存活Worker正常SIGTERM exit0。关闭Queue/Redis/HTTP/Prisma，按nonce删除本测试两个容器及临时产物目录。首次失败环境、端口复现容器也已清理；只清理本测试创建的资源，未删除共享卷。收尾检查确认本主题容器剩余0、冻结目录不存在、专属Redis临时目录剩余0；最终8个新增文件均在本主题所有权范围。

未覆盖门禁继续开放：目标claimed后硬杀、目标Redis短停、目标transport恢复、默认Worker入口心跳健康、API/Worker/DSA/客户端部署同源、429、Electron SSE/取消/结果、目标唯一终态及完整T4。隔离通过不能代替这些门禁。

## 父对话最小集成顺序

1. 仅复核并集成本主题测试、fixture、入口、Task和证据；本轮没有生产修复patch。
2. `recovery-postgres.fixture.ts`由已有NAV隔离harness派生，仅改变专属身份与role SQL入口；如与并行通用helper冲突，由父对话统一参数化，保留全migration/raw-owned/head/role/标签保护。不要携入原主仓其他dirty WIP。
3. 最终集成后的Domain费用、Schemas、DSA client等输入发生变化时，先确认fixture/冻结执行兼容，再复跑对应入口；相同输入不重复昂贵验收。
4. 按原T4另行执行目标部署和客户端验收，再更新原主仓权威Task；当前隔离叶不授权部署，也不勾选T4。

最终一致性：只新增本主题文件；没有Spec行为变更、TODO/归档变更、Schema/migration变更、生产部署或commit。本执行包为worker_done，由父对话负责最终接受。
