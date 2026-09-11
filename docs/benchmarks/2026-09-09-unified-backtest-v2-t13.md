# 统一回测 V2 T13 性能与功能基线

> 2026-09-11 当前结论：固定 CN 股票日频场景已完成真实买卖闭环、同 Snapshot 重放、账户隔离、Artifact 缺失/恢复复验及 Browser 三条展示链路；Provider `executionRules.unavailable` 已由显式研究模型边界有界收敛。该局部证据不覆盖完整目标市场、资产与周期，因此 V2 T13 保持未完成。下文按阶段保留原测试、失败与“可勾选”等当时判断，当前状态以末尾最新复验及本说明为准。
>
> 普通回测已改为可信、可复现的策略研究。客户级历史凭证、收费协议与提现档案不再是前置，但关键价格、公司行为、持仓/现金约束仍需齐备；固定 CN 股票日频场景的新模型与按需门禁已实现并取得真实运行及 Browser 局部证据，但完整目标市场、资产、周期及其浏览器展示仍待验收，不能把历史失败改写为通过。见[规则增量 Spec](../specs/2026-09-10-backtest-historical-execution-rule-facts.md)与[Task](../tasks/2026-09-10-backtest-historical-execution-rule-facts.md)。已有 CN 日频局部证据不代表完整目标市场/资产/周期。

## 范围

本报告先记录 T13 第一阶段可在本地、无数据库和无真实 Provider 条件下复现的基线，随后补充真实 Worker、Docker、DSA Provider、数据库迁移与账户隔离运行态证据。两类证据分别标注，不以离线 workload 替代真实运行态结论。

## 固定输入与命令

- 代码工作树：`thesis-ledger`，日期：2026-09-09。
- 输入：CN/HK/US 各 10 个交易日，合计 8,820 条 1m Bar；派生 5m Bar；MA(50)；事件排序；本地 ArtifactStore。
- Provider：`t13-performance-fixture`，revision：`2026-09-09`。
- 命令：`pnpm exec tsx scripts/backtest-v2-performance-spike.ts`。
- 确定性复跑两次得到相同 `functionalDigest=36d95ed785ec7d17ff38112a0d5cc8a3761443734ed3a2aef7a3bbedd045f15e`。

## 首次基线

| 工作负载            |            输入/输出 |              耗时 |
| ------------------- | -------------------: | ----------------: |
| 5m 聚合             |   8,820 → 1,764 Bars |      2,022.743 ms |
| Artifact 写入       |         76,562 bytes |        111.969 ms |
| Artifact 读取       |   8,820 rows，列裁剪 |         91.028 ms |
| MA(50)              |         2,400 points |        125.321 ms |
| 事件迭代            |         8,820 events |          1.687 ms |
| 同进程 workload RSS | 近似 Runner workload | 516,505,600 bytes |

第二次复跑耗时分别为 2,011.235、164.495、83.407、129.619、0.981 ms，RSS 为 449,085,440 bytes；数据摘要保持不变。当前 RSS 包含 `parquet-wasm` 初始化开销，不能直接作为生产 Worker 容量上限。

## 功能门禁结果

- `scripts/backtest-v2-t13-gate.mjs`：通过；fixture 覆盖 CN Stock、HK Stock、US ETF 和 CN NAV Golden scenario，并拒绝将 HK/US NAV 作为支持能力。设置 `DSA_V2_CAPABILITIES_URL` 后会额外校验 DSA 完整 capability 矩阵；未设置时不冒充真实 DSA 验收。
- `scripts/backtest-v2-isolation-audit.mjs`：通过；扫描 46 个回测/Simulation 源文件，未发现真实 `LedgerEventV2`、`TradeProjection`、`CASH_FLOW` 或真实 Ledger/Portfolio/Journal import。
- `packages/schemas/test/backtest-v2-t13-golden.test.ts`：2 tests passed；Exchange/CN NAV fixture 可解析，HK/US NAV、Limit 和非目标 Risk 在 Schema 层拒绝。
- 现有 `packages/schemas/test/backtest-v2.test.ts` 与 Server V2 Run/Snapshot/Artifact 测试覆盖非目标配置、future data、checksum、Artifact 缺失/损坏和删除清理；本阶段未改变 T13 勾选状态。

## 未完成与运行态阻塞

- 未连接真实 DSA、PostgreSQL、Redis、Docker Worker；跨仓 HTTP capability 与真实 Ledger/Revision/Projection/Portfolio/Journal 前后快照需在部署环境执行。
- 磁盘空间不足故障注入需要受控临时卷，不能用本地工作树模拟；Artifact 缺失、损坏和 Run 删除清理已有离线回归，空间不足仍待真实运行态证据。
- 真实 Runner 峰值 RSS、长时间分钟数据 Functional Gate 和 Docker 恢复/回滚不由本地 workload 结论替代。

## 第二阶段真实环境探测（2026-09-09）

- Docker daemon 可用；`thesis-ledger-dev-thesis-ledger-1`、`thesis-ledger-dev-dsa-1`、`thesis-ledger-dev-postgres-1`、`thesis-ledger-dev-redis-1` 均为 healthy。Server `/api/v1/health` 和 DSA `/health` 返回 200，Redis 返回 `PONG`。
- 当前 dev Server 镜像仍为 V1：`POST /api/v1/backtests/runs` 返回 404；旧 `/api/v1/backtests/strategies` 返回的策略 `schemaVersion` 为 1。当前没有运行中的 `backtest-worker` 容器，因此不能冒充 V2 Runner smoke、crash/retry/cancel 或真实 RSS 验收。
- 当前 DSA OpenAPI 只暴露 `/api/v1/thesis-ledger/capabilities`，没有 `/api/v1/thesis-ledger/v2/capabilities`；使用真实地址执行 T13 gate 得到 `DSA capability HTTP 404`，不是 capability 通过。
- DSA 旧 Contract V1 在带 token 的只读请求下返回 `contractVersion=1`，Bars 仅 `1d`、Indicators 仅 `MA/MACD/RSI`；这与 T13 所需的 V2 capability 矩阵不同，故未将旧 Contract 响应当作 V2 证据。
- PostgreSQL 只读盘点：`StrategyVersion` 中 2 行 `schemaVersion=1`，`BacktestJob` 共 8 行；`SchemaVersion` 为 `20260905000000_fresh_database_baseline`，运行数据库的 `BacktestJob` 还没有 V2 `mode`/`snapshotId` 列。主仓 `node scripts/check-migration-matrix.mjs` 已通过 4 条迁移静态矩阵；`migrationDryRun({ retainedV1Rows: 2, legacyCallers: 2 })` 返回 `allowed=false`，要求先 Expand/Cutover，不能 Contract。
- 真实账户只读快照（未执行 V2 smoke，因为旧 Server 路由缺失）记录为：1 个 LedgerEvent、最大 Ledger Revision 1、最大 Projection Generation 1；LedgerState hash `dc637c9e6a7f9020a6921e49ad5029cf`、Trade hash `cd84140401798a070621de2466db69ea`、Journal hash `334c4a4c42fdb79d7ebc3e73b517e6f8`、PortfolioSnapshot hash `76a98eba3a80e0b79dea0d66694e61e0`。探测前后相同，但这只能证明本次只读探测未写入，不能替代 V2 运行前后证明。
- `pnpm exec tsx scripts/backtest-v2-artifact-fault-smoke.ts`：通过 missing/corrupt/readonly；`ENOSPC` 需要受控配额或临时卷，本阶段未注入。

## 第三阶段构建与迁移阻塞（2026-09-10）

- 已核对 `thesis-ledger-infra`：`compose.yml` 确实定义独立 `backtest-worker`，其入口为 `node apps/server/dist/src/backtest/backtest-worker.main.js`；V2 Run 由 Server 的 `BacktestV2Run` 调度到该 Worker，不因容器名称缺失而误判 Runner 架构。
- 按“不删除卷、不清理业务数据、不执行 prune”约束尝试更新当前工作树。仓库 `scripts/update.sh all` 在构建前因其旧 Dockerfile 静态约定仍要求 `RUN pnpm --filter @thesis-ledger/server prisma generate`，而当前 Dockerfile 已使用 `exec prisma generate`，因此脚本安全退出且未启动更新。随后直接执行 compose build；首次只读沙箱被 Docker Buildx activity 目录权限拒绝，受控权限重试启动过构建，但最终镜像时间戳仍为旧的 `thesis-ledger:dev`（约 7 小时）和 `daily-stock-analysis:thesisledger-dev`（约 9 小时），未形成可验收的新镜像。
- 当前真实运行态已出现明确空间阻塞：主机可用空间约 4.8 GiB，`docker system df` 显示 Build Cache 26.99 GiB（其中约 8.283 GiB 可回收）；本阶段未执行任何清理。PostgreSQL 容器健康检查持续报告 `/var/run/postgresql:5432: rejecting connections`，日志显示 recovery checkpoint 因 `No space left on device` 在 `pg_logical/replorigin_checkpoint.tmp` 写入失败并反复重启。旧 Server 随后因 Prisma `P1017 Server has closed the connection` 退出；未主动停止或重建任何容器。
- 因数据库当前不可连接，未执行 expand migration，也未冒险修改 `SchemaVersion`。第二阶段只读基线仍为 2 个 V1 `StrategyVersion`、8 个 `BacktestJob`；本阶段没有可伪造的迁移后计数。DSA V2 capability、V2 Run/Runner、cancel/retry/crash、真实账户前后快照和 RSS 均停止在安全边界，不能以旧镜像或不健康数据库代替真实证据。
- 最小后续命令（需用户明确授权空间治理后执行）：先在保留卷和业务数据的前提下释放足够 Docker/主机空间，再确认 PostgreSQL recovery 与旧 Server 恢复健康；随后重新构建两侧 dev 镜像并只应用 `20260909120000_backtest_v2_runs` expand migration，核对 2/8 行数后再继续 V2 smoke。当前禁止执行 `docker system prune`、卷删除或重建以绕过阻塞。

## 第三阶段重试结果（2026-09-10）

- 用户已授权仅执行 `docker buildx prune --force`，回收约 8.283 GiB，未删除镜像、容器或 volume。复核后主机可用空间约 12 GiB，PostgreSQL 已恢复 `healthy`；Redis 与 DSA 旧容器仍为 `healthy`，旧 Server 容器仍为退出状态。
- 使用当前 `thesis-ledger` 与 `daily-stock-analysis` 工作树直接执行 compose build（未执行 prune、未触碰 volume）。构建在 DSA Web 的 `npm ci` 阶段因 `npm error code ECONNRESET`、`npm error network aborted` 失败；并行 Python 基础层还出现 `isl26-0.26-r2: unexpected end of file`。Compose 随即取消 Server 构建，相关镜像时间戳未更新，不能作为新代码运行态证据。
- 由于构建未成功，未更新或重建任何应用服务；未执行 PostgreSQL expand migration，因此没有迁移后 2 个 V1 `StrategyVersion` 与 8 个 `BacktestJob` 的计数证据。V2 capability、Run/Runner、取消/重试/崩溃、真实账户隔离和 RSS 继续保持未验证。
- 最小后续动作：在网络/镜像下载稳定后，重新执行同一 compose build；仅当两侧镜像构建完成并核对 digest 后，才可启动应用、执行 `20260909120000_backtest_v2_runs` expand migration，再复核 V1 数据保留。当前不以旧镜像恢复结果冒充 V2 验收。

## 第三阶段 DSA 恢复与 Server 构建边界（2026-09-10）

- BuildKit 回收约 8.283 GiB 后，PostgreSQL 恢复为 `healthy`。当前 DSA 工作树镜像已成功构建为 `daily-stock-analysis:thesisledger-dev`（digest `953f96cd3d31`），并以 `docker compose up -d --no-deps dsa` 安全重建；容器健康，未删除或重建 volume。
- 真实 DSA V2 capability gate：`DSA_V2_CAPABILITIES_URL=http://localhost:8000/api/v1/thesis-ledger/v2/capabilities` 配合容器已有 token 执行 `node scripts/backtest-v2-t13-gate.mjs`，结果 `status=passed`、`provider=akshare`、`capabilityCount=39`。这只证明 DSA capability 一致性，不代表 Server Run 或数据库迁移已完成。
- ThesisLedger Server 官方构建入口先后遇到 Alpine `apk` TLS 错误、基础镜像下载 HTTP 502，以及 Corepack 下载 pnpm 时 `ECONNRESET`；随后已成功构建当前镜像，最新 `thesis-ledger:dev` image ID 为 `5d61215116d0`。但为避免在数据库迁移门禁未解除时切换执行面，尚未用该镜像重建 Server，也未启动/更新 `backtest-worker`。这些是构建环境记录，不是 V2 运行态验收结论。
- 因 Server/Worker 尚未切换到新镜像，未执行 `20260909120000_backtest_v2_runs` expand migration；没有迁移后 2 个 V1 `StrategyVersion` 与 8 个 `BacktestJob` 的新快照。V2 Run API/Runner、cancel/retry/crash、真实账户隔离及 Runner RSS 继续未验证，T13 保持未勾选。

## 第三阶段数据库迁移安全门禁（2026-09-10）

- 最新只读镜像/服务状态：`thesis-ledger:dev` image ID `5d61215116d0`（约 3 分钟前构建），DSA image ID `953f96cd3d31`；PostgreSQL 与 DSA 均为 `healthy`。当前运行中的 Server 仍是旧容器且已退出，未执行 Server/Worker 的 `--no-deps` 重建。
- PostgreSQL 只读盘点：`StrategyVersion(schemaVersion=1)=2`、`BacktestJob=8`；任务状态为 `queued=1`、`succeeded=7`。`MarketBar.upstreamSource` 列已存在，但 `BacktestJob` 尚无 BullMQ 生命周期列（`executionAttempt`、`dispatchedAt`、`errorCode`、`errorSummary`），也尚无 V2 列（`mode`、`idempotencyKey`、`stage`、`snapshotId`、`snapshotManifest`、`runConfig`、`diagnostics`）。
- 迁移安全门禁：按仓库迁移顺序需先处理 `20260909090000_backtest_bullmq_lifecycle`，再处理 `20260909120000_backtest_v2_runs`。前者会把现有 `queued`/`running` 旧任务更新为 `failed`，并写入 `errorCode=legacy_execution_incomplete`；当前 1 条 queued 旧任务因此存在业务状态变化风险。后者虽然是 expand，但不能绕过该前置生命周期迁移。未获用户明确授权前不执行任何 migration，也不修改 `SchemaVersion`。
- 结论：最新 Server 镜像构建成功、DSA V2 capability gate 已通过，但数据库迁移门禁阻止切换 Server/Worker 执行面；真实 V2 Run、取消/重试/崩溃、真实账户隔离和 Runner RSS 仍未验证，T13 继续未勾选。

## 后续真实运行态补充（2026-09-10）

- 用户已明确授权迁移。按严格限定的任务 ID 执行 expand migration：BullMQ lifecycle migration 对唯一 queued 旧任务执行 `UPDATE 1`，该任务按既定兼容策略收敛为 `failed`；随后 V2 runs migration 成功完成。迁移前保留的 2 个 V1 `StrategyVersion` 与 8 个 V1 `BacktestJob` 未被删除或重建，T13 未因此勾选。
- Server 与 `backtest-worker` 使用新镜像重建后曾同时 `healthy`。此前真实 Run 暴露 Server 默认 `/app/var` 无写权限；主代理已在 `infra/docker/server.Dockerfile` 创建并 `chown /app/var/backtest`，并在 `thesis-ledger-infra/compose.yml` 为 Server/Worker 增加共享外部卷 `thesis-ledger-backtest-data`。镜像已成功重建。
- Docker VM 曾再次出现 `ENOSPC`：PostgreSQL 退出，Redis 报告 AOF `MISCONF`。第二次仅清理约 1.578 GiB BuildKit cache，未删除业务 volume 或业务数据；随后 PostgreSQL、Redis、Server、Worker 恢复 `healthy`。
- 三次真实 V2 Run 均按当前 DSA capability 正确失败，未伪造成功结果：Exchange + ETF fixture 在 `corporateActions` 上返回 `unavailable`；单标的 `600519.SH` Run 返回 `corporateActions unavailable`；CN NAV `110011.OF` Run 同样在 `corporateActions unavailable` 处失败。失败原因与 DSA 返回的能力边界一致，未进入可发布的 Runner 结果验收。
- 真实 DSA capability 结果：`provider=akshare`，`calendars=0`、`instrumentFacts=0`，`fx`/`corporateActions`/`nav` 均为 `unavailable`。这证明当前真实 Provider/PIT 数据面仍未接入，不能用 fixture capability gate 替代真实数据验收。
- Desktop V2 用户可见文案中文核验仍通过；`StrategyV2Summary`、`StrategyEditorSheet`、`StrategySections`、`StrategyDashboard`、`StrategyJobs` 及 loading/error/diagnostic 新文案未发现可替换的英文用户标签。Contract/API/schema/JSON/枚举值保持原样。
- Compose 契约补充验证（2026-09-10）：主代理在 `infra/compose.yml` 挂载 `004-backtest-v2-runs.sql`，新增 Server/Worker 共享外部卷门禁，并同步更新 `scripts/compose-contract.test.sh`；在 `thesis-ledger-infra` 执行 `bash scripts/compose-contract.test.sh` 通过。
- 当时结论：迁移、Artifact 目录/共享卷与运行态空间恢复已有证据，但 DSA 真实 Provider/PIT 数据面尚未接入，因此当时保持 T13 未勾选。后续最终闭环证据见下节。

## 最终真实运行态收口（2026-09-10）

### Provider 与 PIT 数据边界

- DSA 已支持 CN STOCK/1d raw bar、CN 交易日历、CN STOCK instrument facts 与 CN STOCK `CASH_DIVIDEND` corporate actions。V2 raw bar 通过 Provider runtime 的不复权入口获取，`availableAt` 使用交易日 Asia/Shanghai 15:00；当日未收盘或未来事实拒绝进入回测。
- ETF、NAV、FX、拆分及未接入市场继续返回显式 `unsupported`/`unavailable`。该边界与 capability、Server 校验和运行态失败路径一致，不把 fixture 能力宣称为真实能力。

### 迁移、共享卷与自动化验证

- BullMQ lifecycle 与 V2 字段/索引迁移均已应用；迁移前的 2 个 V1 `StrategyVersion` 与 8 个 V1 `BacktestJob` 保留，唯一 queued legacy job 已按授权收敛为 `failed/legacy_execution_incomplete`。
- Server/Worker 已使用共享 snapshot volume `thesis-ledger-backtest-data`，并曾同时 healthy；Server/Worker 的 `/app/var/backtest` 权限与共享目录已纳入 compose 契约门禁。
- 定向与包级验证：Server 65 files/477 tests、Schemas 13 files/134 tests、DSA 23 tests、Server typecheck、目标 ESLint、boundaries、compose-contract、性能 spike/digest 与 `git diff --check` 均通过。
- 最终阶段 BuildKit cache prune 回收 21.83 GB，早期另一次回收 22.06 GB；两次均只删除可重建缓存，不含镜像、容器或卷。已有 missing/corrupt/readonly/ENOSPC 恢复与 Run 删除清理证据继续有效。

### 真实 Run、取消与重试恢复

- Run `6bc2ee8a-c47b-4964-929c-cabb02f5a63c` 在 Worker 停止期间创建并取消，Worker 重启后保持 `cancelled`。
- Run `f544ab82-ff24-4bb5-b474-5a7f5d81ea40` 初次因结果 Schema 缺少 `orderId`/`availableAt` 按上限 3 次失败；修复后 retry 从 attempt0 开始并在 attempt1 succeeded。结果 snapshot 为 `4679f...`，checksum 为 `3a9bc0e298208f83`，产生 1 个 fill：贵州茅台 100 股、1641.64、`2023-12-18T01:30Z`。成功后重复 retry 保持 attempt1、checksum 与 fillCount 不变。
- Run `fab50622-0c77-44c7-b16d-9f0ecbed43f2` succeeded，产生 1 个 fill，checksum 为 `505553f668690e43`。
- Worker 实跑约 122 MiB / 7.748 GiB（1.54%），Server 约 120.6 MiB；该 RSS 记录来自真实容器运行，不与包含 `parquet-wasm` 初始化开销的离线 spike 混淆。

### 真实账户隔离与结果限制

- 本次真实回测即时前后哈希严格一致：`AccountLedgerState` 1=`4e7acffd...`、`JournalEntry` 0=`d41d8c...`、`LedgerEvent` 1=`31d6eae...`、`PortfolioSnapshot` 9=`78dd2f7a...`、`Trade` 1=`9d4e545...`。较早的 `PortfolioSnapshot` 基线曾因后台运行时更新变化，但本次即时前后快照严格一致。
- 真实成功结果 `completeness=partial`，必须展示“可卖持仓不足”警告；策略快速退出遇到 CN T+1，证据证明买入成交闭环，不证明闭合卖出交易或完整收益闭环。
- 最终 T13 结论：跨仓 Golden/capability、隔离、迁移、共享 snapshot volume、取消、崩溃后 retry、Artifact 故障恢复、性能与 RSS 证据已覆盖，T13 可勾选。未支持范围仍需未来单独完成 Provider/PIT 与真实运行态验收。

## R01–R10 后当前版本真实运行态复验（2026-09-10）

- 在不删除 volume、不清理业务数据的前提下重建并替换 DSA、Server、Worker。DSA 当前镜像 ID 为 `30a5e24076cd`，Server/Worker 共享镜像 ID `c3d7dc60e09a`；三个容器及 PostgreSQL、Redis 均为 `healthy`。Server/Worker 均挂载同一个 `thesis-ledger-backtest-data:/app/var/backtest`。
- 当前工作树同时存在未完成的 `trade-opening-boundary` 改动，其 Server build 出现独立 TypeScript 错误。为避免修改或回退该组用户改动，本次 Server/Worker 镜像从隔离临时上下文构建：保留统一回测 V2 当前改动，只排除该未完成改动。DSA 镜像直接从当前 DSA 工作树构建。
- 新建真实验收策略版本 `4b01aa1c-6efb-465f-aaf0-f256e6f5c530`，标的为 `600519.SH`、CN STOCK、1d，固定买入 100 股，并以 `holdingPeriods >= 1` 作为退出条件，避免把买入当日的 CN T+1 拒绝误当作闭合交易。
- Run `145d7946-296a-4323-a1f7-f7676ee453ae` 使用 `2024-01-02` 至 `2024-03-29` 和 `dataAsOf=2026-09-10T16:55:00+08:00`。真实 DSA 已返回 68 条 raw bar，但 Instrument Fact 中 `executionRules.status=unavailable`，原因为“缺少覆盖请求历史区间的价格限制、法定收费与结算规则事实”。Server 因此在 Snapshot Builder 阶段以 `failed/DATA_UNAVAILABLE` 收敛，`snapshotId=null`，未投递 Worker，也未生成可用于检验闭合买卖、完整权益曲线或结果完整度的 Result。
- 该失败证明 R02/R06 的缺事实失败关闭已在真实运行态生效，但不构成成功纵向验收。当前版本的主要阻塞已从“旧镜像未重验”收敛为“DSA 没有可覆盖请求历史区间的版本化执行规则事实”；在完成必要事实、显式规则模型及对应成功复验前，T13 继续保持未完成；客户级档案已不作为前置。
- 运行前后真实账户表计数与内容哈希严格一致：`AccountLedgerState` 1=`a94d31146c81beadea002de6b6a7099d`、`JournalEntry` 0=`d41d8cd98f00b204e9800998ecf8427e`、`LedgerEvent` 1=`985f08030a316f3a9b3958dcddd4211f`、`PortfolioSnapshot` 15=`9159bebb442980239e412abfe2aa9af7`、`Trade` 1=`52355a08eee0f7efdd0e906af5d4509f`。这证明本次失败路径没有污染真实账户，但不能替代成功 Run 的隔离验收。

## T4 固定场景真实闭环复验（2026-09-11）

- 环境：DSA 镜像 `30a5e24076cd`；Server/Worker 同镜像 `bcae3816afa9`，共享 `thesis-ledger-backtest-data:/app/var/backtest`；PostgreSQL、Redis、DSA、Server、Worker 最终均为 `healthy`。未执行 migration、volume/数据删除或缓存清理。
- 实现缺口与定向验证：Builder 仅在执行标的已有完整、显式研究模型时，以模型替代 Provider 内嵌 execution rules 门禁；其他关键事实保护不变。Snapshot Builder/模型快照 2 文件、13 项测试、Server build 及 boundaries 通过。
- 真实 Run：`runId=40f04c1f-12a5-4456-8413-c435f0292eed`，`snapshotId=8d8d15f58f9f24a2cbbb75d43872e4cd409b2a5270d12d3c4c1921034b3f3523`，`resultChecksum=d15e188e03109748`。模型哈希为 `0b6ac70a935bf63b1a79b1358ce5853624dce4892d6cc03d26a0565b953a5cdf`，Instrument Facts/Bar Artifact 哈希分别为 `3ca395e617ee8afebf5a160d26cb1457efdce2c664875d0ba2a88c5e4db07f17` 与 `fd9300bb7ca209ce5365556e1fe7e6166932d02ed6cdae39c90f1dcfd256d412`。
- 成交与权益：结果 `succeeded/completeness=partial`，买入 1 次、卖出 1 次、闭合交易 1 个、日权益点 58 个。同一 finalized Snapshot 在 Worker 内直接重放得到相同 snapshotId、checksum、2 个 fill 和 1 个闭合交易。
- 成功运行隔离：前后只读指纹完全一致，`AccountLedgerState` 1=`4e7acffda11e61457079412943ba3cf5`、`JournalEntry` 0=`d41d8cd98f00b204e9800998ecf8427e`、`LedgerEvent` 1=`31d6eae0cb2c43bc9216aef03d02b111`、`PortfolioSnapshot` 15=`178a8bfc3d5f119a7d17231ca35cf5be`、`Trade` 1=`9d4e545b32c08d21784cd59d75edeaa1`。
- 故障恢复：execution Artifact 临时缺失时连续两次重放均稳定失败为 `ARTIFACT_NOT_FOUND`；恢复文件后重放 checksum 回到 `d15e188e03109748`，fillCount=2。未重启服务。
- 浏览器复验：保持原有 healthy 服务和 `[::1]:5173` 监听不变，以 `pnpm --filter @thesis-ledger/desktop dev --host 0.0.0.0 --port 5174 --strictPort` 启动临时 Desktop Vite；in-app Browser 成功打开 `http://127.0.0.1:5174/strategy` 并连接现有 API。固定 fixture JSON 成功解析，范围、来源、版本和假设可见，显式确认后显示“已确认执行模型”。
- 成功与失败披露：真实成功结果显示 `completeness=partial`、模型哈希 `0b6ac70a935bf63b1a79b1358ce5853624dce4892d6cc03d26a0565b953a5cdf`、58 个权益点、1 笔闭合交易、`resultChecksum=d15e188e03109748` 与 snapshotId `8d8d15f58f9f24a2cbbb75d43872e4cd409b2a5270d12d3c4c1921034b3f3523`。失败 Run `145d7946-296a-4323-a1f7-f7676ee453ae` 的详情显示 `DATA_UNAVAILABLE`、缺少覆盖历史区间的规则事实及 `snapshot` 路径；页面时间与只读 API 记录精确对应。
- 进程边界：Browser 验证后已关闭临时标签并停止 5174 Vite，端口不再监听；原 5173 进程未重启或中断，也未修改业务代码、服务配置或数据。
- 当前结论：固定 CN 股票场景的 T4 运行态与 Browser 三链路证据均已完整，T4 已勾选；完整目标市场、资产与周期仍未全部通过，V2 T13 保持未勾选。
