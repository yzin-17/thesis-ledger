# 目标保数据升级与部署基线证据

历史权威状态见[归档任务](../../archive/tasks/2026-10-05-target-preserve-upgrade-baseline.md)，验收标准见[规格](../../archive/specs/2026-10-05-target-preserve-upgrade-baseline.md)。本记录对应未提交工作区，不把 HEAD 当成完整部署输入。

## 输入与准备

初始主仓 321 项 dirty、DSA 10 项 dirty、infra clean，均保留。主仓 HEAD `514abeebfe57bac0c16271439d8b777ff3b02a9f`；DSA HEAD `d40549602d187da7bdd0e8bebb59d2a0fc271919`；infra HEAD `dd3d92b5f46a780d10fdc3e66543b98471aa9bc2`。

实际库名/owner 均为 `thesis_ledger`；Compose 项目 `thesis-ledger-dev`。旧 head `20261001120000_require_explicit_strategy_contract`，71 表。当前源码 28 项 migration、76 表（60 Prisma、16 raw-owned），head `20261004140000_strategy_authoring_records`；待执行仅 `20261004130000_strategy_authoring_drafts`、`20261004140000_strategy_authoring_records`。DSA 镜像缺少现行日历/周期指标合同文件，故官方更新最小必要目标为 `all`。

升级计划固定预期补齐两项新增 migration，运行时升级实现未修改。以下本地检查通过：

- Server `vitest run test/platform/database-upgrade-plan.test.ts test/platform/database-upgrade-sql.test.ts test/platform/database-upgrade-rehearsal.test.ts test/platform/database-upgrade-archive-map.test.ts`：26 项。
- 通过本轮专用、禁用网络的 PostgreSQL 容器运行 `database-upgrade-postgres.integration.test.ts` 与 `database-upgrade-backup.integration.test.ts`：8 项；覆盖 custom dump 恢复、输入/消费者绑定、全部旧列数据摘要、角色权限拒绝、旧 head 拒绝及权限阶段失败回滚 DDL/数据/marker。两个测试容器与自身匿名测试卷已精确清理，目标卷未动。
- Server `typecheck`、`build`、修改测试定向 ESLint、Prettier、`git diff --check`：通过。
- `check-migration-matrix.mjs`、`check-runtime-database-input.mjs`、`check-boundaries.mjs`：通过；infra `preserve-database.test.sh`、`compose-contract.test.sh`：通过。
- DSA `.venv/bin/python -m pytest tests/test_thesis_ledger_market_calendar.py tests/test_thesis_ledger_period_indicators.py -q`：31 项通过，4 个既有依赖/收集告警。

## 真实备份、恢复与保护基线

消费者原已停止。首次 Docker socket 不存在，经宿主启动后只启动现有 PostgreSQL 进行只读核验，不重建容器。

只读准备目录：`../thesis-ledger-infra/.database-upgrades/baseline-prepare-20261005.PNoIzG/`。`backup.dump` 为 18,722,959 字节，SHA256 `d966f7cf7ac28012d4ac17b38eabbdaefa6c4aa8f0e7ff75eef221ce85fd0bc9`。备份恢复到无网络隔离副本并执行两项增量，结构、`thesis_ledger_app` 逐项权限和全部旧列数据摘要通过。计划指纹 `16836ef30b9213005a3b12e076f7d3d596301b8431ff79f50e8f38a0516e7849`；权限脚本 SHA256 `50054d41973220f0dde36f688f483c505c48940aceb0464f5d5d8d7099eb70fc`。源库未改，正式入口还须绑定待部署镜像重新准备。

`before-summary.json` 保存全部表及保护账户的行数和哈希。最终 HTTP 对账从真实备份恢复副本，经现行领域转换与事实链规则计算语义，排除共享 instrumentDirectory，排序对象键，并将 PostgreSQL 无时区时间按 Prisma UTC 规则解析；结果保存在正式批次 `protected-http-backup-comparison.json`，三个账户均与实际 HTTP 完全一致。早期脚本的对象键序/宿主时区差异仅影响验收哈希，旧数据库摘要始终一致；早期 `before-http-semantic*.json` 不作为最终对账结论。

| 账户                                   | ledgerRevision / projectionGeneration | 全部事件 / 有效事件 | 升级前 HTTP 语义 SHA256                                            |
| -------------------------------------- | ------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| `0e9677d2-98c6-45b1-8bc3-8d07b9209180` | 16 / 16                               | 16 / 2              | `6f53824a10e933230d8f9d0da4b6d2d5799abf08748db7903673843a01337690` |
| `93337db7-a5a0-40c5-823f-63577e9e924b` | 1 / 1                                 | 1 / 1               | `274b7db4c64d80fa939da32e15afe23eb3dfd33af37c30a95784ee8f18730f0d` |
| `95bd7e1a-72df-4cd7-aae8-121d8545e5ea` | 3 / 3                                 | 3 / 3               | `3f49a936703c6e42b56d20372801ab394ba11c27f66726437b19627d4b2282bb` |

既有 JournalEntry 1、JournalReviewSnapshot 2、AiRun 16、AiToolCall 3、TradePlan 1、Strategy 16、StrategyVersion 20、BacktestJob 47。ProviderConfig 2、AiRoutingSettings 1、DesiredProviderPolicy 1、DesiredProviderPolicyRevision 10。保护摘要不写业务内容或凭据，不新增账户。

## 执行与故障恢复

用户在本聊天直接确认实际保数据升级部署；随后另行授权 Docker 重启和“清除所有可清空的缓存”。

官方命令：`DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger REPAIR_BUILD_CACHE_ON_NO_SPACE=false ./scripts/update.sh all`。首次日志 `/private/tmp/tl-preserve-upgrade-baseline-20261005.log`，镜像构建阶段失败退出 1；未进入消费者停止、备份事务或服务启动。宿主 APFS 曾仅余 138 MiB，Docker 日志确认 `init.log: no space left on device` 并退出引擎，DSA apt 层报只读文件系统。

官方 `docker desktop restart` 被错误窗口阻塞；随后官方 `docker desktop stop --timeout 20` 和 `docker desktop start --timeout 60` 成功，未强杀进程。目标 PostgreSQL 启动后重新核验，仍为旧 head/71 表，保护账户与 Journal/AI 历史摘要不变。`traffic-monitor` 恢复健康。

按授权仅执行 `docker buildx prune --all --force` 清理未使用 BuildKit 缓存，共 8.788 GB；日志 `/private/tmp/tl-buildkit-prune-20261005.log`。镜像、回滚镜像、业务容器、命名卷和备份均保留；虚拟盘空闲由约 6.9 GiB 增至 14.6 GiB。

同一官方入口重试成功，退出码 0，日志 `/private/tmp/tl-preserve-upgrade-baseline-20261005-retry.log`。清理缓存后的 DSA 系统依赖及原生 SDK 构建耗时增加，保留同一构建等待完成，没有按分钟重建镜像。

## 最终目标结果

正式执行目录 `../thesis-ledger-infra/.database-upgrades/run.BiB68z/`。官方入口停止消费者后生成新的 0600 备份，18,722,959 字节，SHA256 `e0b27829fd360dc0fc6cb1c3b159c4cf84c1f212db1d856d528997d9bfa617f6`；恢复旧 head、演练到新 head、全部预期结构/应用权限/旧列数据保留均通过，计划与权限指纹和前述准备一致。待部署镜像与本地完整结构输入一致，事务执行成功，随后完整结构门禁通过并启动消费者。

目标独立查询确认 head `20261004140000_strategy_authoring_records`、76 表；新增恰为五张策略编写表。三个账户的身份、修订、代次、全部事件、有效事件、Position/Cash/Trade 数据库摘要一致；HTTP 规范化语义与升级前备份一致。JournalEntry、JournalReviewSnapshot（含冻结分析内容）、TradePlan、AiRun、AiToolCall、Strategy、StrategyVersion、BacktestJob，以及 ProviderConfig、AiRoutingSettings、DesiredProviderPolicy/Revision 摘要均一致。70 张旧数据表中 67 张摘要完全一致；AutomationJob、ProviderHealth、ProviderHealthCheck 在恢复运行后发生计划/健康检查状态更新（最后一表 323→324），不将这些可变状态宣称为逐字段未变。

- Server/Worker 镜像均为 `sha256:471213bfc1796d80526618f4ee037a54f39c9d0e2f8c233e1db2e8bf79c2a8f1`；DSA 为 `sha256:08bfe1b5a0d59d6b27c54e961a5850f603885b4686d459818897c68d3bcd250e`。PostgreSQL/Redis 原容器 ID 和命名卷保留，未更新其镜像。
- Server、Worker、DSA、PostgreSQL、Redis 均 healthy。Server 实际 Prisma 连接为 `thesis_ledger_app` / `thesis_ledger`，逐项角色权限通过；自本次启动以来三应用日志无缺表、Schema mismatch、入口缺失或 Nest 依赖错误，Worker 报 ready。
- 运行态文件哈希与宿主当前构建一致：研究输出提示、行情详情/周期能力服务、Prisma/raw-owned 输入；DSA API、日历和周期指标合同与源码一致。完整 migration 链另由官方镜像输入指纹门禁覆盖。详见 `runtime-identity.json`、`startup-permissions.json`。
- 18 项只读 HTTP 检查通过，记录于 `http-readonly.json`：健康、三个 Ledger Schema、账户、Journal 条目/三个候选/历史快照 Schema、既有三条 AI Run、Backtest 列表、原生 chart-options、新 period-options、非法 limit/timeframe 的 400，以及 1d/1w 两点 qfq 详情联合 Schema。
- 两条既有成功 AI Run 仍 succeeded，旧失败 Run 仍 failed / research_schema_invalid；没有重试、覆盖或调用新模型。现行来源及研究默认配置通过前后哈希保留。
- ETF 四周期 bars 的能力前置均 available；年度 MA 保留 calendar_input_limit，MACD/RSI 保留 calendar_unavailable。这里只验收公开合同与降级，不证明完整真实指标历史/预热窗口。两点详情不关闭 T3.3c 的完整指纹与窗口矩阵。

本轮只完成部署基线。应用源码未修改；仅修复升级计划测试的两个预期条目，更新中文 Spec/Task、证据及相关部署检查点。全部既有 dirty 保留，没有 stage/commit/push。

收尾发现同期外部修改：infra 新增/修改空间门禁、工作流及文档共 9 项 dirty，DSA 新增 AGENTS.md 修改，主仓及工作区规则也更新。本轮未写入或复验这批文件；`update.sh` 的空间门禁改动时间为北京时间 03:22:42，发生在本轮更新执行中，新的统一 Docker 操作入口规则在 03:35:02 写入。成功部署结果对应本轮启动的官方流程，不能作为这批新空间门禁已经验证的证据。发现后已读取新规则；未来 Docker 状态变更须遵守维护脚本入口约束，本轮不再执行状态变更或扩大实施范围。最后三仓 dirty 数为主仓 326、DSA 11、infra 9，仅作为收尾时点快照。

## 未执行门禁

本项的目标事务、代码/镜像/结构一致性、Server/全部 Worker、实际 API 和升级后保护摘要已通过。本项不承接完整真实行情/长预热窗口、缓存故障、AI 在途恢复、Backtest hard-kill、Desktop/浏览器、设备/远端 CI 或周期内容质量；这些仍由原 Task 管理，不计为通过。下一推荐叶为行情 T3.2b2.2 的完整真实基础/指标预热窗口，随后 T3.3c，最后 T3.2c3；本轮停止。
