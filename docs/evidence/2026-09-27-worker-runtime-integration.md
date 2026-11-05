# V3 队列与实际 Worker 联通

## 2026-09-27 队列边界接线修复

仓库门禁发现集成测试直接导入 BullMQ，不符合队列适配器边界。测试已改为使用生产 `BacktestBullQueue`，保留真实队列 waiting 断言并使用生产重试策略；门禁未增加例外。适配器关闭队列后在 finally 中断开其自行创建的 Redis 连接，避免资源残留。

模块边界、工作区依赖检查通过；文件尺寸检查存在 13 项存量警告且未提供有效基线，不能视为完整尺寸增量验收。队列生命周期与 CAS 测试 11 项通过；真实 Worker 集成测试因未配置隔离环境跳过，未重试已达到次数上限的 JSONB 证据哈希卡点。此次尚未执行目标容器同步，以下旧证据的投递端口实现描述仅对应当时版本。

补充：`bull-queue-disposal.test.ts` 2 项测试覆盖正常关闭及关闭失败时释放连接、保留原异常；Server 类型检查与改动适配器/集成文件 ESLint 通过。类型检查首轮发现测试仍引用已删除的 transport 局部变量，改为生产队列查询后通过。

## 已完成证据

测试文件：`apps/server/test/backtest/v3-worker-runtime.integration.test.ts`。

2026-09-27 使用独立 PostgreSQL 17、Redis 7，当前全部 migration 和完整 SchemaVersion head，通过当前源码的 `pnpm --filter @thesis-ledger/server build` 产物启动生产 `backtest-worker.main.js`。生产入口继续加载 `backtest.processor.js`、Nest Module、实际 Prisma 和 Runner，没有替换 Worker 处理函数。

1 项集成测试通过：普通 V3 创建服务冻结 fixture 数据，通过实际 `BacktestQueueService` 和 BullMQ 投递；Redis 任务先为 waiting，再由独立 Worker 进程领取；数据库最终 succeeded、executionAttempt=1，严格 V3 结果可解析；新建 Store/Runner 只读冻结快照，重放校验和与持久结果相同。

Worker 的 DSA 地址设为不可达的本地端口，运行阶段不依赖在线行情。测试创建端的 DSA/行情/修订输入是显式 fixture。投递端口包装实际 BullMQ Queue，未覆盖生产 BacktestBullQueue 的连接初始化；创建侧通知端口为空实现，生产 Worker 内部事件发布仍使用实际依赖。

首轮隔离 SchemaVersion 误填时间前缀，生产结构门禁拒绝启动；修正为完整 migration 名称后实际执行成功。首次重放断言误用 V2 Store，被版本隔离拒绝；改为 `snapshots.v3.replay` 后整项通过。两次修正均限测试环境或测试代码，未放宽产品门禁。

Server typecheck、build、定向 ESLint 通过。测试 Worker 已停止，隔离 PostgreSQL/Redis 容器已删除，临时快照清理完成。未改目标应用容器，也未访问真实 Provider 或创建目标业务作业。

## 失败终态、查询与真实域隔离

后续在同一套隔离 PostgreSQL/Redis 和生产 Worker 入口扩展验证，再次通过。使用上一轮同一 build 产物；本轮仅改测试，没有重复构建镜像或服务。

- 创建第二条独立 V3 任务，在 Worker 启动前改写其冻结产物。Worker 通过完整性检查失败路径持久化 `failed`、`DATA_UNAVAILABLE`、`result=null`；成功任务仍正常执行。
- 通过实际 `BacktestService.statusForRead` 与 `ResultReadPolicyService` 查询两个任务，成功结果与持久结果一致，失败任务返回失败状态且无结果。此处为服务级查询，不声称覆盖 HTTP 路由。
- beforeAll 建立 actual/shadow 账户、非空 LedgerEvent 和 JournalEntry 哨兵；执行前后比较 16 张表的行数和完整行摘要，全部一致。表范围：Account、Position、LedgerEvent、Trade、AccountLedgerState、PortfolioSnapshot、JournalEntry、JournalReviewSnapshot、TradePlan、TradeEntryLeg、TradeBaselineComponent、TradeCorporateActionAdjustment、TradeCloseSlice、TradeCloseAllocation、TradeDividendAttribution、TradeEvidenceSource。空表同时验证未新增事实。
- Server typecheck、定向 ESLint 通过；Worker、两项隔离容器及临时快照清理完成。

## I01 仍需补齐

- 完整 I01 依赖项和输入范围对账。
- 当前来源选择、准入及路由修订由 fixture 提供；需对账实际 Reader/路由选择接线与父项依赖，受控 HTTP 传输结果见下节。

该证据关闭成功/失败队列执行、服务级查询、隔离与离线重放子叶，I01 父项保持未勾选。

## 普通 HTTP 创建与结果读取

新增 `worker-http-fixture.ts`，加载当前 build 的实际 `BacktestController` 及其装饰器元数据，在 loopback 临时端口启动 Nest HTTP 应用；注入实际 BacktestService/ResultReadPolicyService 和隔离数据库执行服务。事件流依赖为空替身，本测试不调用 SSE；没有手写模拟路由替代 Controller。

创建请求改为 `POST /api/v1/backtests/runs`，断言 201 与 queued；后续实际队列、生产 Worker、重放及隔离断言保持。增加两个 `GET /api/v1/backtests/runs/:id`，均返回 200：成功结果与数据库严格 V3 结果一致；受损快照任务返回 failed、DATA_UNAVAILABLE、无结果。

扩展后的组合测试 1 项通过，Server typecheck、两文件 ESLint 通过。复用同一 build，未变更生产源码。复现隔离运行命令为 `rtk proxy python3 /private/tmp/run-worker-runtime-fixture.py`，该临时脚本从完整 migration 输入派生 head，并仅清理自身创建的容器。HTTP 应用、Worker、Redis/PostgreSQL 和临时快照均已清理。

## 受控 DSA HTTP 传输

新增 `worker-dsa-http-fixture.ts`，仅监听 loopback 临时端口并验证测试 Bearer 凭据。实际 `DsaClient` 获取日历、标的事实和 V3 行情，保留其请求 Schema、响应解析、请求身份及目标 pin 校验。未登记端点返回 404，未登记行情请求返回 400；测试确认三类端点均实际被访问。

在此基础上重跑同一组合：HTTP 创建、实际 BullMQ/生产 Worker、成功及篡改失败终态、HTTP 结果查询、16 表摘要、冻结离线重放全部通过。Worker 仍使用不可达 DSA 地址，执行阶段只读冻结产物。类型检查首次发现 fixture 未收窄 selected/unavailable 联合类型，增加明确拒绝未选择结果后通过；定向 ESLint 通过。

准确边界：Reader 的来源选择、准入、修订和冻结证据由 fixture 构造，行情响应通过真实 DsaClient HTTP 传输回填，尚未使用生产选择器/证据仓库。故本项不能代替真实来源准入或完整 Reader 路由验收。此次生产代码未变化，不重复 build；隔离服务和临时产物均已清理。

## 生产 Reader 接线卡点：本轮跳过

随后接入实际 `MarketBarWindowReaderV3`、`selectMarketWindowV3` 和 `MarketWindowEvidenceV3Repository`。有效策略、能力目录和行情均经实际 DsaClient HTTP 获取，Data/Control 使用不同测试令牌；本地 desired policy 和准备修订仍为受控 fixture。

首次执行及两次重试均在第二条相同窗口创建时失败，状态为 DATA_UNAVAILABLE，原因是窗口证据身份冲突。进一步诊断：

- PostgreSQL 回读的 sourcePriceBasis 与输入深比较一致。
- coverageProof 深比较一致。
- 本次输入的完整响应哈希与既有记录 completeResponseHash 一致。
- PostgreSQL 回读 completeResponse 后重新计算的哈希与其保存的 completeResponseHash **不一致**。

这定位到完整响应持久化往返及哈希稳定性，尚未定位具体字段或确认修复。没有覆盖旧证据、绕开冲突校验或将失败当作通过。根据用户“卡点重试两遍仍不能完成则跳过”，本轮停止重试该链路，保留开启 `BACKTEST_WORKER_TEST_DATABASE_URL`/`BACKTEST_WORKER_TEST_REDIS_URL` 时可复现的失败测试及脱敏布尔诊断。隔离容器、HTTP 服务和临时快照已清理。

前文通过记录仍对应当时的端口 fixture/HTTP 版本；**当前新增生产 Reader 版本未通过**，不可引用历史通过作为当前完整 I01 验收。I01 父项继续开放，下一项独立任务不受此卡点阻止。
