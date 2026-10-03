# ThesisLedger 版本链路跨运行时库存（首轮）

本表按实际入口和调用者分类。名称中的 V2/V3 仅是线索；保留与删除取决于当前业务职责。C01 尚需逐个核对 Schema 导出、缓存键、数据库读取与测试 fixture，因此本表不是删除许可。

| 领域 | 生产者与持久化 | 当前调用者 | 待收敛点 |
| --- | --- | --- | --- |
| Backtest HTTP | `backtest.controller.ts` 公开 `runs`；`BacktestJob` 持久化 `mode`、`input`、Snapshot、结果 | API Client、Desktop、Strategy Optimization | 公开 `jobs`、Service V1 本地执行及 V2 Run 分派已删除；当前执行服务只接受完整 V3 合同。仍需目标 HTTP 与旧数据拒绝验证。 |
| Backtest 队列 | `backtest-bull-queue.ts` 现行队列 `backtest-run`；PostgreSQL attempt 与取消标记为事实源 | `backtest.processor.ts`、队列恢复器、Server 创建与重试 | 旧队列消息不由新 Worker 消费；CAS 已固定当前模式，仍需隔离 PostgreSQL/Redis 与目标 Worker 验证创建到终态。 |
| Market 读与控制 | `market-v2.controller.ts` 公开 bars、detail、chart-options、quote、NAV、chip；`market-data.controller.ts` 公开 policy、Provider、目录与控制；Prisma 存 Bar Fact、Coverage、V3 证据/派生快照 | API Client、Desktop Market Detail/Settings、Onboarding、Portfolio、Backtest Reader | 公开 URL 已切到 `/api/market*`；内部响应、来源别名、缓存键和旧 DSA 上游仍需逐一审计。 |
| Ledger | `ledger.controller.ts` 公开 `ledger` 命令/事件/重放；`LedgerEvent` 表与 `ledger-v2.repository.ts` 保存当前经济事实 | Server Import、Portfolio、基线重建，Desktop Account Data 与交易动作，API Client | V2 事件模型仍承载当前经济语义；须先建立单一当前合同及读取拒绝，再移除旧类型/投影兼容。 |
| DSA ThesisLedger | 当前 `api/app.py` 只挂 ThesisLedger V3 Data、Chart、Event 和 OAuth Router；Provider 配置与目录存于 DSA Control Store | Server `DsaClient` 和 Market Service/Quote Reader 均调用 `/api/v3/thesis-ledger/*`；非 ThesisLedger `api/v1` 独立保留 | 已迁移的旧 ThesisLedger URL 不再挂载；仍需核对旧 Store 字段、Schema 别名和每个目标 HTTP 行为。 |
| 部署 | infra `compose.yml` 的 Server、Worker 共用 `/app/var/backtest`；DSA 单独镜像/数据，PostgreSQL 与 Redis 持久化 | `scripts/sync-code.sh`、`scripts/update.sh`、目标容器 | 当前代码未部署；队列名变化需 Server/Worker 同时更新。结构或运行时输入变更时使用官方 `update.sh`，不直接操作 compose。 |

## 需要继续核对的引用

1. `packages/schemas/src/index.ts` 对 Market/Backtest/Ledger V1/V2 名称的导出、每个消费者的实际使用及证据格式是否不可变。
2. Market API Client、Desktop、Server Reader 的现行缓存键；DSA `DsaClient` 的 V1/V2 调用与目标路由配对。
3. Ledger 旧事件读取与投影兼容分支、`raw-owned-tables.json` 和 migration matrix 对现行表的定义。
4. Strategy Optimization 以外的 Server 消费者是否仍创建旧 Run 或直读旧 Market；隔离数据库中的旧记录是否被任何内部查询展示。

## 2026-09-29 追加引用核对

- `apps/server/src/integration/dsa/dsa.client.ts` 仍实际调用 ThesisLedger 专属 V1 Control/目录/报价/NAV/FX、V2 bars/指标及 V3 bars/图表/事件端点。DSA 通用 `/api/v1` 与 ThesisLedger 专属路径需分开处理，不能全局替换 URL。
- Desktop `market-data.api.ts`、`provider-oauth.api.ts`、Onboarding 与 Portfolio，以及 Server 两个 Market Controller 的公开 URL 已统一为 `/api/market*`；SSE/缓存键和 Market Reader 的来源/覆盖语义仍需验证。
- Ledger 当前命令、查询及重放直接消费 `LedgerEventV2`、`LedgerV2Repository` 和多组 `*SchemaV2`；这些是当前事件经济合同，不属于可直接删除的旧读兼容。须先定义现行事件写读合同与拒绝边界，再迁移 Import、Portfolio、Desktop 和 API Client。
- Backtest 当前策略仍以 `strategySchemaV2`、数据库 `schemaVersion=2` 表示。Run 的合同为 V3，不代表策略模型已升级；把策略版本号机械改成 3 会改变持久化身份和校验，须在 C03 设计后实施。
- Market Policy 仍是真正的双合同：Server `market-policy-storage.ts` 默认种下 V2 路由矩阵，V3 存储同时封装 `legacyV2Routes`，`MarketControlService.getPolicy()` 可返回 V2；DSA 控制推送仍调用 `applyControlPolicyV2`。Desktop `MarketPolicyResponse` 是 V2/V3 联合，路由状态、工作流与面板有 V2 降级和旧选择展示。删除 Desktop 分支前须同时确定 Server 的 V3 默认、旧存储拒绝、DSA 控制协议及数据库目标状态，不能只改页面类型。

## 2026-09-29 指标与 DSA 旧数据入口追加核对

- Market Policy 行的双合同描述属于首轮库存。当前策略写入、持久化和生效读取已切到 V3，旧请求/记录按独立证据拒绝；不得把首轮状态误认作当前状态。
- DSA `api/thesis_ledger.py` 的 `/api/v2/thesis-ledger/market/indicators/calculate` 已由原函数直接迁至 `/api/v3/thesis-ledger/market/indicators/calculate`，旧 Router 不再挂载。Server Client、Schemas 和 Desktop 指标引擎标识已对应迁移，见[指标计算证据](2026-09-29-canonical-indicator-contract.md)。
- DSA `GET /api/v1/thesis-ledger/market/bars` 在当前 Server、Desktop 和 API Client 源码无调用；它与仍在使用的 `GET /api/v1/thesis-ledger/v2/market/bars` 是两个入口。前者仅是公开旧日线 Facade，但 `_real_bars`、Data Gateway `bars()` 和测试夹具仍被后者或其他指标逻辑复用，拆除旧路由时不能删除这些内部能力。
- DSA `GET /api/v1/thesis-ledger/v2/market/bars`、`/v2/calendar`、`/v2/instrument-facts`、`/v2/corporate-actions` 仍由 Server `DsaClient` 的回测依赖方法调用；须先迁移现行回测预检与事实消费，再删除路由。`GET /api/v1/thesis-ledger/market/indicators/{name}` 仍由 Server `market-indicator-request.ts` 调用，属于另一条旧计算链。

## 2026-09-29 无调用方入口拆除后

上一节中 V1 日线与逐指标 GET 的判断已用于[删除实现](2026-09-29-canonical-dead-market-v1-routes.md)：Server `getIndicator()`、请求构造与旧缓存以及 DSA 两条公开路由已移除。`MarketController.detail()` 将指标从 `nonBarRequested` 排除，现行图表仍由 V3 图表 Reader 和指标 POST 负责。回测的 `/v2/market/bars`、日历、标的事实与公司行动仍有现行 Server 消费，不能按文件名删除。

## 2026-09-29 当前归属补记

上文对旧 URL 的描述是当时的执行快照；此后 Server→DSA、公开 Market/Provider/Backtest 路径已按主 Task 后续证据迁至当前入口。新的源码反查未找到 `snapshot-manifest-v1/v2` 解码、`BacktestRunCreateV2` 或旧创建 Schema 引用；Schema 的当前 Snapshot 只接受 `snapshot-manifest-v3`。DSA Control Store 的 V1/V2 策略投影和通用 Runtime 旧读取已删除。

当前 `backtest-v3-runner.ts` 仍调用 `backtest-v2-execution-exchange.ts`；后者是现行经济执行内核，不能按文件名删除。`runConfigSchemaV2` 仍被 V3 准备 Schema 的基础字段校验和策略优化消费；应抽取现行 RunConfig 的共同经济规则，再移除旧输入解析。`LedgerEventV2` 与 `LedgerV2Repository` 仍是当前 Ledger 命令、查询和投影的事实源；本轮只删除旧迁移划转的宽松读取。Ledger 事件合同与持久格式的单一路径需要独立设计和隔离数据库验证，旧 migration SQL 不改写。

当前目标 `docker ps` 仅显示 `traffic-monitor`，ThesisLedger Server/Worker/DSA 未运行。主仓与 DSA 的源码尚未进入目标容器；本地包级通过不能作为 D02 完成证据。C01 的全量消费者、缓存键与持久化格式矩阵仍待核齐。

在本次源码中对 Server Controller、API Client、Desktop 和 DSA ThesisLedger Router 的 V1/V2 公开 URL 做定向 `rg` 反查，没有找到仍可达的旧路径；这只证明公开入口清理，不证明 Ledger、RunConfig、执行内核及所有持久化读者已收敛。

## 当前 DSA 路由与存储接缝复核

`api/app.py:388-392` 仅将 ThesisLedger 的 Data、Chart、Event、OAuth 四组 Router 挂至 `/api/v3`。`api/thesis_ledger.py` 的 Data 路由包含 Bar、指标、FX、基金净值及历史、持仓、Quote、日历、标的事实和筹码；Control 路由包含握手、Provider 状态/配置/测试/移除、Policy 应用/生效、Catalog Job/ACK；Catalog 快照/增量单独使用 Data 鉴权。Chart、Event 和 OAuth 由各自 Router 提供。DSA 通用 `/api/v1` 不属于本次删除对象。

Server `integration/dsa/dsa.client.ts` 的日历、标的事实、Bar、Chart、Event、指标、FX、全部 Control 与 Catalog 调用均为 `/api/v3/thesis-ledger/*`。Quote 在 `market-quote-reader.ts` 调用同一 V3 前缀；基金净值/历史、持仓及筹码在 `market.service.ts` 调用同一前缀。此处为源码路径配对，尚非目标 HTTP 验收。

DSA 当前 V3 日历和标的事实复用了内部文件名含 `v2` 的依赖模块。对外错误文本及该模块的相关运行日志已去掉旧版本提示，内部 `V2DependencyError` 名称保留至当前依赖合同归属收敛；这不改变路由、请求和事实语义。对应 `test_thesis_ledger_v2_dependencies.py` 与 `test_thesis_ledger_v2_tradability.py` 共 25 项通过。

Market Server 的基金净值缓存键为 `fund-nav:3:*`，历史为 `fund-nav-history:3:*`，持仓为 `fund-holdings:3:*`；Desktop Market Query 使用 `marketDataKeys`，其中路由能力键显式为 `route-capabilities-v3`。指标计算原先实际读写 `market-indicators-v2:*`，现切到 V3 前缀，受控清理名单保留旧键并加入新键，见[指标缓存证据](2026-09-29-canonical-indicator-cache-namespace.md)。Bar/Chart/Policy 的其他缓存、失效及全局旧键清单仍需继续核对。

Schema 总入口 `packages/schemas/src/index.ts` 仍导出 `backtest-v2.ts` 与 `ledger-v2.ts`。`runConfigSchemaV2` 主要被旧执行内核和旧测试使用，生产 Run 创建及 Snapshot 解析使用 `runConfigSchemaV3`；`LedgerEventV2` 仍是当前 Ledger 经济写读合同。不能仅依据导出文件名删除。Prisma `BacktestJob` 持久化 `mode`、输入、Snapshot、结果及 attempt，`LedgerEvent` 持久化 `payloadVersion`、`payload` 和修订链；`MarketBarWindowEvidenceV3`、`MarketDerivedSeriesSnapshotV3` 保存现行精确行情证据。`BacktestJob.mode` 默认值已单独迁至 V3，见[默认模式证据](2026-09-29-canonical-backtest-mode-default.md)。数据库旧行读取与缓存全量矩阵尚未核完，C01 继续开放。

在 Server、API Client、Desktop 的生产源码中定向反查旧 Run 模式分支与 `/api/v1|v2/thesis-ledger`、公开 `/api/v2/market|backtest|ledger` 字面 URL，当前没有命中；旧模式仍存在于若干历史测试 fixture，并非当前生产路由。Ledger 生产 Controller 继续解析 `*SchemaV2`，Repository 继续读写 `LedgerEventV2` 且 `payloadVersion=1`；这是一条仍可达的经济链路，E03/C03 必须先定义其现行合同和持久格式，再谈移除旧导出。

Backtest 单项读取原先只检查 Run 外层 `mode/input`，列表可将原始结果 JSON 投影为指标；现已增加当前 RunConfig、Snapshot manifest、结果以及相互身份校验，详见[读取格式门禁](2026-09-29-canonical-current-run-read-boundary.md)。此门禁并不替代旧数据库行的实际 PostgreSQL 读取验收，C01 仍需完整持久格式与消费者清单。
