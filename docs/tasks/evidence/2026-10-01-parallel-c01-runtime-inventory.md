# C01 当前运行链路全量库存

> 任务：Canonical C01；本轮仅生成库存证据，不实施迁移。
> 范围：主仓 Schema/Domain、Server/Worker、Prisma、API Client/Desktop；相邻 DSA ThesisLedger Data/Control；infra 打包。
> 唯一写集：`docs/tasks/evidence/2026-10-01-parallel-c01-runtime-inventory.md`。两份主 Task、Spec、handoff 只读。
> 基线采样：2026-10-01 03:57:12 +08:00；结束复核见文末。这是共享 dirty 工作区的时间切片，不是提交或部署版本。
> 最新结论：2026-10-02，C01/C02/C03/C04 与 E01 已收口；当前库存以本文历史矩阵、§9及 [C01/C02 收口证据](2026-10-02-c01-c02-completion.md)、[E01 单一执行接线](2026-10-02-e01-execution-completion.md)合并读取。E01 已删除双 Runner 与瞬时基准分派，当前只有 LocalSnapshotV3Runner 和独立 NAV Runner。§2～§8为早期采样，旧路径和未完成结论不代表当前状态。

## 1. 盘点方法与证据边界

读取了主仓及父目录 AGENTS、全局 Codex/RTK 规则、DOCUMENTATION-GUIDE、Canonical Spec/Task 和多来源回测 Task；采用 spec-driven-workflow 的叶边界与验证分层。本轮没有子代理、提交、数据改写、部署、Provider 请求或客户端操作。Context Mode 未暴露可调用工具，使用 RTK 与 Python 聚合源码输出。

扫描 1208 个输入：两包 `src`、API Client、Server `src`、Desktop `src`、DSA `api/src`、infra `scripts`，并纳入 Prisma Schema/raw-owned、兼容矩阵及三份共享主文档。扫描不含 node_modules/dist，测试与历史证据不用于证明生产可达性。历史 migration 仅用于结构输入核对，不作为删除对象。79 个 Market/Backtest/Ledger/NAV/Simulation Schema/Domain 模块见附录 A，96 个路由声明见附录 B。

| 仓库 | HEAD（不包含未提交源码） | 初始 dirty 条目 |
| --- | --- | --- |
| 主仓 | `fe0e871e37a09964f7a113b82e7d09f6d4d95f7e` | 779 |
| DSA | `f497b6dad0e5519bbbcce1e51a2889d2c2634009` | 287 |
| infra | `9a1f03756afe6831875fa2434619af6500307b00` | 17 |

可达性分为「生产接线」「公开但仅准备」「独立离线」「仅导出/内核」「拒绝入口」「归档」。生产接线由 Controller、Module/DI、调用函数及存储读写交叉核对；有源码接线不等于目标服务本轮实测成功。数据库核对仅覆盖源码结构和 migration matrix，未连接实际数据库查行。

Canonical Task §1 的初始基线与部分旧证据已经过时：当前 Controller 不含旧 jobs HTTP；LocalSnapshotStore 只组合 V3 Store；Ledger 信封已经是 3。多来源 Task 当前 §1 报告 E01-I1.6 已完成真实固定 HiThink 范围验收；本轮不复验、不撤销该记录，也不把其推广成 NAV、严格 PIT、备用源、真实费用或整体 M1/M2/M3 通过。

## 2. 用户路径及生产者／消费者／存储矩阵

以下路径相对主仓，`../daily-stock-analysis` 与 `../thesis-ledger-infra` 指相邻仓库；冒号后为本轮核验行。保留当前业务合同及不可变证据标识，不代表保留旧 Run/Snapshot/Ledger 读取兼容。

| 库存项与源码定位 | 生产者 | 消费者／用户路径 | 持久化／传输格式 | 当前可达性及处置理由 |
| --- | --- | --- | --- | --- |
| 策略 AST：`packages/schemas/src/backtest-v2.ts:405,431`；`backtest.service.ts:46,52,99` | 策略创建/版本创建 | 策略编辑、回测配置、风险应用、优化候选、V3 Runner | Strategy/StrategyVersion schemaVersion=2，schema JSON 内 '2' | 现行领域合同。替换名称/模块可由 C03 收敛；不能因 V2 名称删除表达式、资产/货币/费用/信号能力。 |
| RunConfig V3：`backtest-v2.ts:581,607`；`backtest-run.service.ts:181` | 当前 prepare/configured-run 与 create | API Client、Desktop、Worker、冻结/结果 | 请求 contractVersion=3，配置 schemaVersion='3' | 生产接线。旧无版本配置不能直接新建。准备 scope 不能冒充依赖闭包。 |
| RunConfig V2 与无版本别名：`backtest-v2.ts:576-578` | 公共 Schema 导出 | 旧执行共享类型/测试；现行 V3 共享字段与校验 | V2 解码无 schemaVersion；别名 runConfigSchema | 真正旧输入解码候选。先把现行公共字段/校验的所有权独立，再删除旧 decoder/type/alias；不能删除整文件。 |
| Run 状态机：`backtest-v3-run-lifecycle.ts:44,107,156`；`backtest-run-attempt.ts:54` | BacktestV3RunLifecycle、attempt/CAS | 创建、投递、领取、运行、取消、重试、恢复 | BacktestJob mode='V3'；input contractVersion=3/schemaVersion='3'；attempt/status | 生产接线，旧模式拒绝。C02 仍需逐 CAS、隔离 DB 与目标读取验收，不以 mode 默认值判全完成。 |
| 队列与 Processor：`backtest-bull-queue.ts:7,11,42`；`backtest.processor.ts:19` | BacktestQueueService/BullMQ | Processor→prepareBacktestExecution→BacktestService | Redis backtest-run/run，payload={jobId}，上限3次；DB 是事实源 | 现行基础设施。保留重试预算、取消及晚到结果原子条件，不由队列终态替代 DB。 |
| Worker 前置失败 CAS：`backtest-execution-owner.ts:35,53,75` | 预算无效/耗尽分支 | Processor 领取之前 | updateMany id/status/attempt/cancel 条件 | 开头已校验当前模式；两处失败提交未显式绑定 mode/input 格式，C02-b/c 需用并发变更反例核对，库存不代替缺陷验收。 |
| 当前读取：`backtest-current-run-read.ts:35,54`；`backtest.service.ts:107` | Run 列表/单项投影 | /backtests/runs；API Client/回测详情/优化关联列表 | 当前 result/schemaVersion=3、manifest/config/checksum 互相绑定 | 生产接线。旧或损坏列表条目过滤；单项拒绝。实际旧行拒绝仍须独立 DB/HTTP 验证。 |
| 场内经济内核：`backtest-v3-runner.ts:15,187`；`backtest-v2-execution-exchange.ts:2,477`；`packages/domain/src/backtest-engine.ts:796` | runExchangeVertical→runExchangeSimulation | V3 Frozen Runner | 内部结果 schemaVersion='2'，外部映射 V3 result | 仍可达的现行经济能力。迁出 V2 命名时保留税费、T+1、拆分/分红、数量/价格坐标及拒单原因。 |
| V3 Runner V2 名称与基准双算法：`backtest.module.ts:20,59`；`backtest-v3-runner.ts:296`；`backtest-v3-benchmark.ts:35,243` | DI 注入 LocalSnapshotV3RunnerV2 | V3 Run 与基准比较 | trading-date-v2 默认；instant-v1 仍为类/算法选择 | V2 指基准日期对齐算法，不是旧 Run。C03 可收敛实际生产使用算法；影响结果身份，不能机械去版本号。 |
| 旧 NAV 编排：`backtest-v2-execution-nav.ts:50,580`；`backtest-v2-execution.ts:5` | runCnNavVertical | 本轮生产引用仅定义和聚合再导出 | 旧内部 schemaVersion='2' 结果 | 仅导出，删除候选。先等待 N3 提取/验证申赎内核所需能力；不能把旧编排的无生产调用理解为 NAV 业务可删除。 |
| NAV 准备：`backtest-nav-preparation.controller.ts:5,12`；`backtest-nav-preparation.service.ts:39,51,82`；`market-nav-reader-v3.ts:42,62` | DSA nav-inputs→Market 精确 Reader→Server prepare | /backtests/run-config/nav/prepare | scope=nav-input-plan；规则/日期/来源/准入/策略/config 摘要；结束复核新增 receipt | 公开准备源码在变：service 已调用 receipts.save，但 Module 当次复核尚未注册 Repository，接线完整性未确认。普通 create/Builder/Runner 仍为场内接线，不因准备收据声明 NAV 可投递。 |
| NAV 冻结与 Domain：`backtest-nav-snapshot-store.ts:153,215`；`backtest-nav-domain-input.ts:63`；`backtest-nav-offline.ts` | 独立 NAV Store 与输入适配 | N3 离线事件/估值；未来当前 Worker | 当前 NAV manifest、NAV/context Parquet；严格与 research-assumption 分开 | 独立离线合同。N2 写入/关联和 N3 生产接线前保留；确认、结算、截止边界、期末 pending 不得被场内算法替代。 |
| 场内冻结 Store：`backtest-snapshot.ts:243`；`backtest-snapshot-v3-store.ts:86,162,247` | DsaSnapshotBuilder/buildV3 | Worker、Runner、冻结重放 | building/finalized JSON；snapshot-manifest-v3；Parquet ArtifactRef、contentHash/comparable fingerprint | 生产接线。LocalSnapshotStore 已只组合 v3/artifacts；旧 manifest 不再由这里宽松升级。C04 验证旧文件/篡改拒绝。 |
| 结果与成交：`backtest-v2.ts:654,671,836` | V3 Runner 包装现行经济结果 | Run 详情、优化比较、交易与回放 | result schemaVersion='3'、snapshotVersion='snapshot-manifest-v3'；fill/trade DTO 仍命名 V2 | 现行 DTO 与证据。C03 统一命名/导出时保留经济字段；C04 校验结果与冻结身份，不能把 fill 名称当历史数据解码。 |
| Market Bar/Chart：`market.controller.ts:180,199,220,323`；`market-bar-reader.ts:34,38` | V3 Window/Chart Reader→DSA 精确目标 | 行情详情、指标、绩效、Risk、Automation、Backtest | Data/Chart V3；BarSeries 领域投影 | 生产接线。旧 MarketBar/BarSeries V2 事实读取已不在当前 Reader；readV3/readChartV3 是用途边界，不是两代 fallback。 |
| 行情窗口证据：`market-window-evidence-v3.repository.ts:45,70`；`schema.prisma:596` | 精确窗口获取、完整响应归档 | frozen-window Reader、Snapshot 与重建证明 | MarketBarWindowEvidenceV3；请求/响应 JSONB、精确来源、修订、hash、coverage、priceBasis | 当前不可变证据。保留原文和身份；缺值或缺证明不填旧格式默认值。 |
| 派生序列：`market-derived-series.repository.ts:12,31`；`schema.prisma:626` | freezeMarketDerivedSeriesV3 | 详情/Chart/派生读取 | MarketDerivedSeriesSnapshotV3 JSON，inputFingerprint/algorithmRevision | 当前不可变派生证据。身份冲突拒绝覆盖；不将派生 qfq 宣称源 raw/hfq。 |
| Quote/NAV/Holdings/FX/Chip：`market.service.ts:127,183,318,348`；`market-quote-reader.ts:172` | 当前 DSA Reader/MarketService | 最新行情、净值图、持仓、估值与 AI 工具 | 响应 version=3；缓存见 §3 | 当前业务。缓存过期/陈旧状态与来源拒绝分别核对；不恢复旧源路由。 |
| FundNavPoint 回读：`market.service.ts:248,280`；`schema.prisma:124` | 当前净值历史获取 upsert | Market getFundNavHistory 捕获异常后查 DB；Risk 直接查表 | Decimal NAV/date/provider/fetchedAt/freshness/fallbackUsed，无 wire 格式标记 | 生产可达残余：DB 旧行可被装入 version=3 响应。E02 必须判别缓存来源/格式，U02 同步 Risk；不得以现行外层版本证明旧事实合格。 |
| Desired/Effective/Catalog：`market-policy-storage.ts:16,50`；`market-policy-catalog.ts:112,216`；`schema.prisma:676,693` | MarketControl/DSA Apply 与目录同步 | Market 管理界面；所有精确 Reader | 当前 Policy JSON、修订、Effective 状态、目录 checksum/cursor | 当前控制合同。保留单调修订与失效/撤销；旧 Policy 归档不参与运行读取。 |
| Provider/凭证/OAuth：`market-data.controller.ts:58-105`；`schema.prisma:648,711,1119` | Provider 管理/只写凭证/测试与 OAuth | 配置、状态、移除、授权 | ProviderConfig/Health/Tombstone；DSA SQLite credential/config revision | 当前控制业务。凭证不回显；密钥版本 v1 与 Provider manifest version 独立于 Data/Control。E04-b 验全部 Provider 类型。 |
| Ledger 当前信封/写仓库：`ledger-v2.ts:192,202`；`ledger-v2.repository.ts:70`；`schema.prisma:494` | 执行/现金/划转/基线/对账/Import 命令 | ledger API、投影、审计、修订/撤销/恢复 | 信封 version=3、DB envelopeVersion=3；经济 payloadVersion 通常1 | 现行可达；名称 V2 不是旧信封。旧 null/非3 标记由 requireCurrentLedgerEnvelope 拒绝。E03-b 正在核对全部旁路。 |
| Ledger 重建/导入：`ledger.controller.ts:142,147`；`ledger.service.ts:494,583`；`core-projection.ts:494` | LedgerRepository、Baseline 与 Import | rebuild、migrate-positions、上传/提交/回滚、Portfolio | 当前信封→Position/Trade/Cash 等投影；基线保留 UNKNOWN 时间精度 | rebuild 校验当前信封。migrate-positions 是仍公开的 Position→当前 Baseline 写入能力，应在 E03-b 明确保留/关闭；不能凭方法名视为旧 Run 兼容。 |
| Domain 旧 Ledger：`packages/domain/src/ledger.ts:80,140,210`；`domain/src/index.ts:4` | 旧简化 AVG/FIFO/cash 纯函数 | 未见生产具名 import；Server 的同名 projectFifo 是本地实现 | 无当前信封判别的简化 LedgerEvent | 真正旧领域导出候选。C03 具名 import/测试核对后删除；不要误删 ledger-v2 当前 Decimal/修订投影。 |
| Domain 旧回测入口：`backtest-engine.ts:273,796`；`backtest.ts:64` | runBacktest/旧订单执行；同文件当前 runExchangeSimulation | 当前 Server import 的是 runExchangeSimulation；AI 同名工具是可选 adapter | 旧 number 结果与当前 Decimal 模拟同文件 | 部分删除候选。按函数依赖收敛旧入口及专属 helpers；同文件当前内核保留。AI 工具同名不证明调用这个旧函数。 |
| 客户端 Market：`api-client/src/index.ts:477,506`；Desktop market-detail/market-data API | API Client + Desktop 请求封装 | /api/market 与 /api/market-data | 当前 Schema/wire、TanStack Query keys | 生产消费；routes/capabilities-v3 key 是缓存身份。U01 需真实请求/错误展示，不以类型通过代替交互。 |
| 客户端 Run：`api-client/src/index.ts:644`；`strategy.api.ts:15,50,79` | API Client parsed response；Desktop requestDesktopJson | Run 列表、详情、新建/运行/取消/重试 | API Client 解析 backtestRunResponseSchemaV3；Desktop 泛型 JSON | 生产可达。路径已统一，Desktop 泛型本身不做运行时 Schema 拒绝；U01 需覆盖错误响应与旧记录显示。UI jobs 名称/导航不是旧 jobs HTTP。 |
| 客户端执行模型：`BacktestModelConfiguration.tsx:11,34`；`OptimizationPricePreparation.tsx:172` | 双 parser 分支默认 version=2 | 现行调用显式 version=3；旧分支仍导出 | 两 parser 都有 execution-model-v1 标识；V3 增 normalized assumptions | 旧 UI 解码默认/分支候选。先核对全部调用，再收敛唯一现行 parser，保留 execution-model-v1 冻结标識。 |
| 客户端 Ledger：`api-client/src/index.ts:534-638` | Ledger 命令/API DTO | 执行、现金、划转、审计、replay、对账、Import | V2 名称 Schema，但 envelope=3 | 当前用户路径；E03-c/U01 消费迁移与错误展示，依赖 E03-b 稳定。 |
| 其他消费面：`portfolio.service.ts:6`；`performance-snapshot.service.ts:49`；`strategy-risk-context.service.ts:148,239`；`workflow-runner.service.ts:42` | Portfolio/Performance/Risk/Automation | 估值、风险触发、绩效、工作流 | Market Reader V3/Quote/FX；Ledger 当前投影；Risk FundNavPoint 旁路 | U02 按用途拆叶；当前 readV3/readChartV3 不能退回不带来源的旧 Reader。FundNavPoint 旁路另验。 |
| 优化/AI/Journal：`strategy-optimization-read.service.ts:364`；`ai-research.executor.ts:277`；`journal.service.ts:558` | Optimization current Run、AI adapters、Journal 投影 | 实验列表/公平比较/风险采纳；研究 getPortfolio 等；交易复盘 | Optimization raw SQL JSONB+Run refs；Journal ledgerRevision；AI tool outputs | 当前领域合同。AI Research 实际 adapters 未注册 runBacktest；可选工具 factory 不是旧引擎生产调用。仍需公平比较/严格来源/真实 AI 交叉门禁。 |
| 平台导出：`platform/data-export.service.ts:8,38`；`data-export.controller.ts:13`；`automation-runtime.service.ts:136` | 原始 Prisma 行聚合 | 导出 HTTP/Automation backup | formatVersion=2，包括原始 Ledger/Position/Strategy | 当前导出文件版本，不等于旧业务 wire。未做当前信封过滤；U02 需明确备份原始保留与业务读取边界，不能直接删备份或宣称其可导入当前格式。 |
| DSA Data：`api/app.py:390-394`；`api/thesis_ledger.py:1232,1243,1595` | 精确 Data Gateway/Provider adapters | Server Client/Market/Backtest；chart/events/nav 专属 Router | /api/v3/thesis-ledger；contractVersion/version=3；Data Token | 当前生产路由。通用 /api/v1 不在替换范围；专属旧前缀是404拒绝入口（app.py:399-419）。 |
| DSA Calendar/Instrument：`api/thesis_ledger.py:36,1595,1631`；`thesis_ledger_v2_dependencies.py:48` | 内部 v2_dependencies/tradability 名称模块 | 当前 V3 backtest dependencies | 输出 version=3；market-rules-v1、calendar/source revision | 当前可达事实生产者，保留规则/交易状态语义。E04-d 可按适配器职责收敛名称，不能删除真实依赖事实。 |
| DSA NAV：`api/thesis_ledger_nav_v3.py:17`；`thesis_ledger_nav_projection.py:42` | raw source + rules/calendar/admission | Server MarketNavReader 与 NAV prepare | nav-source-record-envelope-v1；NAV V3 response，research/strict 显式 | 当前证据生产；N2 合同/鉴权/来源证据与 N3 离线消费重叠，先等所有者稳定。不能把 projection 当原始 Provider 原文。 |
| DSA Control/OAuth：`api/thesis_ledger.py:1740,1957,1973,1993`；`api/thesis_ledger_oauth.py:23` | ControlStore、Registry、Policy/Catalog/OAuth | Server Control Client、Market 管理 UI | Control contractVersion=3；SQLite 状态与修订/cursor/lease | 当前生产路由；Effective GET 允许 None/3（1977）为省略参数通路，不执行 V1/V2；E04-c 明确严格边界后测试，不直接当降级。 |
| DSA 内部 manifest/密钥/映射：`thesis_ledger_efinance_manifest.py:21`；`thesis_ledger_control.py:462,728`；`thesis_ledger_mapping_evidence_store.py:25` | Provider Registry、credential encryption、mapping evidence | exact adapter/admission、Provider runtime | efinance manifest version=2；secret key v1；内容摘要命名 JSON | 当前内部版本/来源证据；不是旧 wire。保留确切来源/凭证修订与 hash；旧 alias 只可在实际 adapter/route 引用核对后移除。 |
| PIT/系列/模型证据：`market-pit-reconstruction-v3.ts:25,101,216`；`market-frozen-window.ts:5`；`backtest-execution-model.ts:242` | frozen window、historical proof、冻结执行模型 | Snapshot preflight/离线读回 | market-series-v1、market-frozen-window-v1、execution-model-v1；PIT proof contractVersion1/2 | 当前证据类型版本。PIT 1/2 联合是实在的双格式，不可因“V3文件”忽略；仅 bound/archives-bound，不授予 qualified。C04 须决定当前证据边界并保留必要验证，不能恢复旧 Run。 |
| 打包/部署：`infra/docker/server.Dockerfile:6,14,22`；`../thesis-ledger-infra/scripts/update.sh:220`；`check-runtime-database-input.mjs:40` | Server 递归 workspace build/deploy、DSA SDK build、官方 infra 入口 | 同源 Server/Worker/DSA | compatibility schemaVersion=2，Data/Control=3；完整 Prisma+24 SQL+raw-owned | 当前部署元合同，保留2；不可变镜像/合同/协议/业务 smoke独立。没有本轮部署，快更不证明镜像升级。 |

表中 `backtest*.ts` 无完整前缀时指 `apps/server/src/backtest`，`market*.ts` 指 `apps/server/src/market`，`ledger*.ts/core-projection.ts` 指 `apps/server/src/ledger`；Schema 行在已明确的 `packages/schemas/src` 下。

## 3. 持久化库存与旧数据边界

| 存储家族 | 生产者／消费者 | 格式与处置 |
| --- | --- | --- |
| BacktestJob、Strategy、StrategyVersion | Backtest lifecycle/Worker；策略、Run、优化 | V3 Run 与 AST2 独立；Strategy 两表默认 schemaVersion=1 仍在 Schema，但当前写入显式2，C03 核对默认/旧行拒绝，不能自动把1升级2。 |
| LedgerEvent、AccountLedgerState、AccountCostStrategyVersion | LedgerRepository/命令/投影；Import/Portfolio/Performance/Journal | envelopeVersion 与 payloadVersion 分离；ledgerRevision、成本方法/投影 generation 属于领域修订。旧空值拒绝与全量旁路由 E03-b 核对。 |
| Position、Trade、TradeEntryLeg、TradeBaselineComponent、TradeCorporateActionAdjustment、TradeCloseSlice、TradeCloseAllocation、TradeDividendAttribution、TradeEvidenceSource、CashBalance、CashSettlement | 当前 Ledger 投影及现金结算；持仓/交易/审计/绩效 | 现行经济投影；不能当旧缓存表删除。 |
| ImportDraft、ImportDraftRevision、BaselineObservationBatch | Import/基线写入、提交/修订/回滚；Ledger | 草稿与证据身份、当前事件关联；N/A wire版本不代表旧格式合格。 |
| FundNavPoint、Asset、Instrument、InstrumentAssetAssociation、CatalogSyncState | Market/目录/净值持久化；详情、Risk、估值 | FundNavPoint 无冻结证据判别；其余身份/目录为当前领域。旧缓存回读风险见主矩阵。 |
| NavBacktestPreparation（结束复核新增） | BacktestNavPreparationRepository.save→Prisma create；prepare service 调用；未来创建守卫消费 | request/evidence JSON、preparationHash/contentChecksum、expiresAt、consumedRunId唯一关联；当前源码写入候选见§7，Module/创建/部署验收仍归N2.5，不据中途新增Schema宣称可用。 |
| MarketBarWindowEvidenceV3、MarketDerivedSeriesSnapshotV3 | MarketRepository；冻结与派生读取 | 当前不可变精确来源证据；完整响应/摘要/coverage缺失须拒绝，格式 backfill 的授权语义须在 C04 单独核对。 |
| DesiredProviderPolicy、DesiredProviderPolicyRevision、ProviderTombstone、ProviderConfig、ProviderHealth、ProviderHealthCheck、DataQualityIssue | 当前 Market Control、健康与审计；Reader/UI | 当前修订/凭证/健康，不删除来源/密钥内部版本。 |
| PortfolioSnapshot、AccountValuationPoint | Portfolio/Performance；UI、绩效/估值 | PortfolioSnapshot payloadVersion默认2是估值快照领域格式；不是 Run V2。需 U02 按真实读取器核对，禁止借 Canonical 迁移经济事实。 |
| raw-owned 11表 | 所属服务 raw SQL 或 migration | StrategyRiskApplication/Audit；OptimizationExperiment/Candidate/Attempt/Adoption；AutomationRunLease 是当前事务/租约能力。其余四表是归档，见下一行。 |
| MarketBarSeriesCoverageArchive、MarketBarSeriesFactArchive、DesiredProviderPolicyLegacyArchive、DesiredProviderPolicyRevisionLegacyArchive | 新增 migration 保数据归档；运行代码不读写 | 真正旧记录，保留原始行供升级审计；不是运行 fallback。删除表/数据须独立授权和部署流程。 |
| 其余 Prisma model | 账户、配置、Risk、通知、定投、Journal、AI、Automation、Audit | matrix全部覆盖59 model；不按版本扫描结果删除这些既有业务实体。 |
| DSA Control SQLite | ControlStore（control.py:713-836）；所有 Control/Data route/admission | policy_state/history、route_admission_v3、provider_config/tombstone/health/request_budget、catalog_generation/job/ack；Job owner/lease/ACK/cursor都是现行状态。SQLite 列增补不是旧业务读取授权。 |
| 本地 Artifact Store | LocalArtifactStore、V3/NAV Store；离线 Runner | Parquet+manifest+hash，最终发布不可覆盖；旧文件保留原始字节、当前 decoder 拒绝。DSA mapping evidence为摘要命名 JSON，保留来源原文。 |
| Redis Market | MarketService/Quote/ResultCache/指标Controller；交互 Reader | quote:3、fund-nav:3、fund-nav-history:3、fund-holdings:3、chip:3、market-indicators-v3；fresh/last-valid 与 market lock。旧指标键只可清理，不读为现行。NAV DB fallback独立于Redis版本隔离。 |
| Redis Queue/事件与 Desktop Query | BullMQ/事件Publisher；Worker/SSE/UI | backtest-run/run payload仅jobId；Desktop strategy jobs key/导航是当前界面术语。浏览器Query缓存无权补齐旧结果。 |
| 平台导出与 infra 输入 | DataExport/Automation backup；运维、离线文件 | export formatVersion=2、compatibility schemaVersion=2均为当前文件/工具格式，不由版本数字删除。导出与重新导入当前业务语义需独立界定。 |

迁移矩阵本轮静态核验：24 migration、70 SQL 表、59 Prisma model、11 raw-owned，head=`20260930100000_rebase_legacy_market_policy`。该结果不证明目标库已经应用 head、不证明旧行拒绝；本轮没有实际 DB 行库存/容器对齐断言。

## 4. 后续叶子与真实依赖

以下为 C01 建议，未修改共享 Task 的状态或编号。已有局部实现优先补证和残余收口，不重新实施已完成叶；多来源 Task 的 C01/C03/C04 与 Canonical 同号任务属于不同任务标识，后续派发必须带主题名。

| 父任务／建议叶 | 剩余断言／最小写集 | 启动依赖与验证 |
| --- | --- | --- |
| C02-a 目标创建拒绝 | 已有V3入口；补当前/旧请求查库前拒绝、幂等目标HTTP | 当前场内合同；NAV正向须N2.5+N3最小生产分支；定向→隔离DB→目标API |
| C02-b 持久/领取闭环 | 模式、预算失败CAS、重复领取、晚到结果及队列事实源 | 状态机源码稳定；检查execution-owner两处CAS；隔离PG/Redis/真实Worker |
| C02-c 生命周期故障 | 取消/手动自动重试/恢复、attempt预算、旧模式状态不变 | C02-b；故障注入同镜像复用，不能成功查缺失前补投 |
| C02-d 当前读链 | 列表/单项/优化关联、损坏结果、旧config/manifest/模式拒绝 | C04读取合同、U01消费；隔离PG旧行→目标HTTP→客户端 |
| C03-a 旧纯导出删除 | runConfigV2/无版本alias、旧Domain ledger、旧runBacktest专属helper | 本库存+具名import/依赖反查；保留共享校验/当前runExchangeSimulation；Schema/Domain golden/边界 |
| C03-b 当前策略/经济合同归属 | AST2、现行fill/trade、V2命名核心、Prisma策略默认、双基准算法 | C03-a；N3/E03-b停止相关写入；类型/build与经济/基准golden，变更格式先改Spec |
| C03-c Ledger公共合同收口 | V2名称但envelope3的导出/命令/投影，删除仅旧解析 | E03-b、E03-c契约稳定；不能和在途Ledger写集并行修改 |
| C04-a 场内冻结/结果边界 | 已有V3 Store；补旧JSON/Parquet/结果/互相身份与篡改拒绝 | 场内合同稳定；受控文件→隔离DB→冻结离线重放 |
| C04-b PIT/模型证据边界 | proof1/2联合、series/model-v1标识、必要条件与qualification；审计JSONB补字段用途 | 多来源S05历史证明合同；保持严格PIT负例，明确双证据格式是否现行能力后再删除 |
| C04-c NAV冻结/结果 | 当前研究/严格模式、日期/来源原文、Parquet、期末pending与结果身份 | N2/N3稳定；复用离线/来源证据，不能替代N4目标验收 |
| E02-a 非Bar旧事实回读 | FundNavPoint→version3、Risk直读的来源/格式判别与失败关闭 | U02 Risk协同；与N2精确NAV Reader区分实时图表缓存/冻结输入 |
| E02-b 缓存/控制/派生审计 | 所有缓存fresh/stale/lock、Desired/Effective/Catalog、派生证据旧格式拒绝 | 当前Market合同，E04-c配对；定向并发/撤销/目录→目标HTTP |
| E04-a Data配对 | Bar/Chart/Event/Quote/NAV/Holdings/FX/Chip/calendar/facts/capabilities与旧URL404 | 所有Reader/DSA同源；N2 API合同；定向offline-tests→目标Token/HTTP |
| E04-b Provider/OAuth | Registry/config/test/remove/OAuth/凭证只写、晚到/撤销 | 当前Control3；目标Server→DSA→Desktop，不用握手代替Provider动作 |
| E04-c Policy/Catalog | Apply/Effective版本参数、cursor/checksum/ACK/Job lease恢复、旧SQLite状态 | E02-b与DSA同步；目标HTTP/CAS、拒绝不改状态 |
| E04-d 删除残余适配 | v2_dependencies等现行命名归属、旧DTO/alias/夹具反查 | E04-a/b/c与N2生产稳定；不删除DSA通用api/v1/外部SDK/native协议 |
| U01-a Market客户端 | 当前路径、中文标签、来源/陈旧/缺覆盖/拒绝展示 | E02/E04合同稳定；包级→真实Browser/Electron必要路径 |
| U01-b Run客户端 | Desktop运行时解析、旧记录错误、run列表/detail/动作、唯一模型parser | C02-d/C03-b/C04；NAV依赖N2.5/N3/N4，不自动回退Bar配置 |
| U01-c Ledger客户端 | 当前动作/审计/replay/Import展示，不补旧字段 | E03-b→E03-c；浏览器与必要Electron验收 |
| U02-a Portfolio/Performance | 当前Ledger投影、Quote/FX/Bar估值、Portfolio快照格式 | E03-b/E02；受控估值与真实调用，保留费用/现金/交易时序 |
| U02-b Risk/Automation | FundNavPoint旁路、readV3身份、状态/freshness、workflow与定投 | E02-a/E03-b；Risk事件/真实工作流不以currentCache推严格历史事实 |
| U02-c 优化/Research/AI/Journal | 当前Run过滤、公平比较与visibility、工具adapter、ledgerRevision | C02-d/C04/E03-b；多来源AI/采纳门禁，真实模型独立 |
| U02-d 导出/备份 | formatVersion2与原始旧行保留、当前业务导入/显示边界 | E03-b与导出领域合同；不把不可用旧行自动转换，不删备份 |

依赖顺序：先由在途 N2/N3/E03-b 完成各自合同里程碑，再在稳定写集上实施 C03/C04/E02/E04 的相应叶；C02 的独立场内故障验证可按当前合同先行。U01/U02 消费迁移跟随对应生产合同，最后分别做目标部署、HTTP、Worker、客户端和业务验收。没有把多个运行面合并成一个叶，也没有把所有步骤依赖于整个 NAV 完成。

## 5. 并发交界与跨任务验收

- N2 重叠：backtest-nav准备/Reader/Schema、DSA nav-inputs、日期/规则/准入、未来NAV创建和冻结关联。C03/C04/E02/E04不得复写这些进行中合同；本轮仅列入口。
- N3 重叠：backtest-nav-offline事件/估值/策略、Domain nav-simulation、结果/基准、旧runCnNavVertical中现行经济能力。先等离线分支交回写权，之后N2.5和N3生产接线形成最小创建→冻结→领取→终态闭环；离线成功不能授予公开投递。
- E03-b 重叠：Ledger命令/repository/投影、Import回滚/基线、Portfolio/Performance旁路；C03-c/U01-c/U02-a/d只按稳定输出派发。migrate-positions公开写入的性质须由该所有者确认，不由库存任务删除。
- 多来源Task §1及现行Spec保留M1/M2/M3与AC01–AC20：精确Provider/upstream/revision、复权坐标、来源事实/稀疏缺日、严格PIT、独立备用、费用、基金NAV、基准公平比较、AI优化/采纳、经济不变量和部署分别验收。Canonical删除旧兼容不能替代这些交付。
- 历史S01“双格式Policy”、旧K-Contract/K-Run文件清单及旧磁盘阻塞仅作为历史记录；当前源码、最新叶证据及对应Task负责现状。C01不继承历史未勾选为“当前失败”，也不从最新单条成功推父任务全完成。

## 6. 本轮验证与状态建议

- `rtk proxy node scripts/check-migration-matrix.mjs`：通过（24/70/59/11，head见上）。
- `rtk proxy node ../thesis-ledger-infra/scripts/check-compatibility.mjs`：通过；唯一Data/Control=3，四项发布要求保留。
- 生产引用、Controller/Module/DI、Schema导出、Prisma结构、SQLite建表、缓存及官方打包入口只读核对；旧专属URL字面命中只位于DSA404拒绝路由。
- 没有运行包测试/build、隔离数据库、Docker更新、目标HTTP、Provider或客户端。纯库存文档不触发高成本门禁；上述缺席不计作通过。
- 状态建议：C01源码库存交付完成，可由共享Task所有者引用本证据后勾选库存叶；其余C02/C03/C04/E02/E04/U01/U02及N2/N3/E03-b保持各自真实状态。目标DB旧行库存、目标部署和业务验收归其专属叶，本轮没有取得此类新证据。
- 无主Task/Spec/handoff/TODO改写，无提交、暂存、清理或归档。后续叶只提出边界与依赖，本轮停止。

## 附录 A：Schema／Domain 模块搜索覆盖

下表是自动词法索引的搜索覆盖与导出数量，不是生产消费者证明；同名局部函数、类型、Python字段可能命中同一词，不能据此判可达或删除。生产链路判定以§2具体调用/DI为准。覆盖包括所有文件名含market/backtest/ledger/simulation/nav的模块，当前公开入口见各包index.ts；内部helper不一定公共导出。


| 模块 | 导出数量 | 词法命中范围（仅搜索线索） |
| --- | --- | --- |
| `packages/schemas/src/market-chart-options-v3.ts` | 6 | `apps/server/src/market`、`apps/desktop/src/features` |
| `packages/schemas/src/backtest-execution-model.ts` | 17 | `apps/desktop/src/features`、`packages/schemas`、`apps/server/src/backtest` |
| `packages/schemas/src/market-hithink-identity-v3.ts` | 7 | `apps/server/src/market`、`packages/schemas` |
| `packages/schemas/src/market-bar-series.ts` | 17 | `apps/server/src/market`、`packages/schemas`、`apps/server/src/risk`、`apps/desktop/src/features`、`apps/server/src/integration`、`daily-stock-analysis/src/services` |
| `packages/schemas/src/backtest-run-preparation-v3.ts` | 6 | `packages/schemas`、`apps/desktop/src/features`、`apps/server/src/backtest`、`packages/api-client` |
| `packages/schemas/src/backtest-price-input-bindings.ts` | 2 | `packages/schemas` |
| `packages/schemas/src/backtest-data.ts` | 44 | `apps/server/src/backtest`、`packages/schemas`、`packages/domain`、`apps/server/src/risk`、`apps/server/src/integration` |
| `packages/schemas/src/market-route-target.ts` | 2 | `packages/schemas` |
| `packages/schemas/src/backtest-nav-preparation-v3.ts` | 4 | `apps/server/src/backtest` |
| `packages/schemas/src/market-route-admission-v3.ts` | 1 | `packages/schemas` |
| `packages/schemas/src/backtest-daily-tradability.ts` | 2 | `apps/server/src/backtest`、`packages/schemas` |
| `packages/schemas/src/market-route-compatibility-v3.ts` | 11 | `apps/server/src/market` |
| `packages/schemas/src/market-coverage-proof-v3.ts` | 4 | `packages/schemas`、`apps/server/src/backtest`、`apps/server/src/market` |
| `packages/schemas/src/market-pit-historical-references-v1.ts` | 7 | `packages/schemas` |
| `packages/schemas/src/market-pit-calendar-structure-v1.ts` | 2 | `packages/schemas` |
| `packages/schemas/src/market-multi-window-v3.ts` | 2 | `apps/server/src/backtest`、`apps/server/src/integration`、`packages/schemas`、`apps/server/src/market` |
| `packages/schemas/src/market-rqdata-identity-v3.ts` | 5 | `apps/server/src/market`、`packages/schemas` |
| `packages/schemas/src/market-event-admission-v3.ts` | 1 | `packages/schemas` |
| `packages/schemas/src/market-data-wire-v3.ts` | 22 | `apps/server/src/backtest`、`apps/server/src/market`、`packages/schemas`、`apps/server/src/integration` |
| `packages/schemas/src/market-price-protocol.ts` | 11 | `apps/server/src/market`、`packages/schemas`、`apps/server/src/backtest` |
| `packages/schemas/src/market-event-wire-v3.ts` | 6 | `apps/server/src/backtest`、`apps/server/src/market`、`apps/server/src/integration` |
| `packages/schemas/src/market-control-wire-v3.ts` | 12 | `apps/server/src/integration` |
| `packages/schemas/src/market-chart-wire-v3.ts` | 5 | `apps/server/src/market`、`apps/server/src/integration` |
| `packages/schemas/src/backtest-v2.ts` | 84 | `packages/domain`、`apps/desktop/src/features`、`apps/server/src/strategy-optimization`、`apps/server/src/backtest`、`packages/schemas`、`apps/server/src/platform`、`apps/server/src/risk` |
| `packages/schemas/src/backtest-indicators.ts` | 8 | 未命中其他生产扫描文件 |
| `packages/schemas/src/market-pit-reconstruction-v3.ts` | 10 | `apps/server/src/market`、`packages/schemas` |
| `packages/schemas/src/market-pit-reconstruction-manifest-validation-v3.ts` | 3 | `packages/schemas` |
| `packages/schemas/src/backtest-preflight-context-v3.ts` | 13 | `apps/server/src/backtest`、`packages/schemas` |
| `packages/schemas/src/market-route-catalog-v3.ts` | 4 | `apps/server/src/market`、`apps/server/src/integration` |
| `packages/schemas/src/backtest-nav-visibility-v3.ts` | 4 | `packages/schemas` |
| `packages/schemas/src/backtest-nav-preparation-result-v3.ts` | 6 | `apps/server/src/backtest` |
| `packages/schemas/src/market-route-v3.ts` | 13 | `packages/schemas`、`apps/server/src/market`、`apps/desktop/src/features`、`apps/server/src/integration`、`apps/server/src/backtest` |
| `packages/schemas/src/backtest-preflight-v3.ts` | 8 | `packages/schemas`、`apps/server/src/backtest`、`apps/desktop/src/features`、`packages/api-client` |
| `packages/schemas/src/market.ts` | 47 | `apps/desktop/src/features`、`apps/server/src/performance`、`daily-stock-analysis/src/analyzer.py`、`apps/server/src/integration`、`apps/server/src/market`、`apps/server/src/portfolio`、`apps/server/src/ledger`、`packages/domain`、`daily-stock-analysis/src/services`、`packages/schemas`、`apps/server/src/imports`、`daily-stock-analysis/src/core` |
| `packages/schemas/src/market-tushare-identity-v3.ts` | 7 | `packages/schemas`、`apps/server/src/market` |
| `packages/schemas/src/backtest-run-preflight-v3.ts` | 2 | `apps/server/src/backtest`、`packages/api-client` |
| `packages/schemas/src/backtest-nav-freeze-v3.ts` | 8 | `packages/schemas`、`apps/server/src/backtest` |
| `packages/schemas/src/market-frozen-window.ts` | 2 | `packages/schemas`、`apps/server/src/market` |
| `packages/schemas/src/market-multi-window-encoding-v3.ts` | 1 | `apps/server/src/integration`、`apps/server/src/market` |
| `packages/schemas/src/market-daily-tradability-v3.ts` | 2 | `apps/server/src/backtest`、`packages/schemas`、`apps/server/src/market` |
| `packages/schemas/src/market-pit-evidence-instant-v1.ts` | 4 | `apps/server/src/market`、`packages/schemas`、`apps/server/src/backtest`、`apps/server/src/integration` |
| `packages/schemas/src/market-pit-historical-evidence-v1.ts` | 9 | `apps/server/src/market`、`packages/schemas` |
| `packages/schemas/src/backtest-nav-calendar-v3.ts` | 1 | `packages/schemas`、`apps/server/src/backtest` |
| `packages/schemas/src/market-pit-historical-bar-bindings-v1.ts` | 1 | `packages/schemas` |
| `packages/schemas/src/ledger-v2.ts` | 58 | `apps/server/src/ledger`、`packages/schemas`、`apps/desktop/src/features`、`packages/domain`、`apps/server/src/imports`、`apps/server/src/portfolio` |
| `packages/schemas/src/backtest-nav-source-v3.ts` | 4 | `packages/schemas`、`apps/server/src/backtest`、`apps/server/src/market`、`apps/server/src/integration` |
| `packages/domain/src/backtest-execution-model.ts` | 26 | `packages/domain`、`apps/server/src/backtest` |
| `packages/domain/src/backtest-expression-context.ts` | 1 | `packages/domain` |
| `packages/domain/src/backtest-analytics-v2.ts` | 10 | `apps/server/src/backtest` |
| `packages/domain/src/nav-simulation-guards.ts` | 3 | `packages/domain` |
| `packages/domain/src/backtest.ts` | 4 | `packages/domain` |
| `packages/domain/src/backtest-data.ts` | 7 | `packages/schemas`、`apps/server/src/backtest`、`apps/server/src/risk` |
| `packages/domain/src/backtest-corporate-actions.ts` | 10 | `packages/domain`、`apps/server/src/backtest` |
| `packages/domain/src/backtest-rule-compatibility.ts` | 11 | `apps/server/src/backtest` |
| `packages/domain/src/backtest-normalized-budget.ts` | 3 | `apps/server/src/backtest`、`packages/domain` |
| `packages/domain/src/nav-simulation-contracts.ts` | 20 | `apps/server/src/backtest`、`packages/domain` |
| `packages/domain/src/backtest-series.ts` | 13 | `packages/domain`、`apps/server/src/backtest` |
| `packages/domain/src/backtest-simulation-evaluator.ts` | 5 | `packages/domain`、`apps/server/src/backtest` |
| `packages/domain/src/simulation-valuation.ts` | 8 | `apps/server/src/backtest` |
| `packages/domain/src/backtest-exchange.ts` | 15 | `packages/domain` |
| `packages/domain/src/backtest-normalized-accounting.ts` | 4 | `packages/domain` |
| `packages/domain/src/backtest-sizing-risk-adapter.ts` | 8 | `packages/domain`、`apps/server/src/backtest` |
| `packages/domain/src/backtest-risk.ts` | 9 | `packages/domain` |
| `packages/domain/src/backtest-benchmark-compatibility.ts` | 10 | `apps/server/src/backtest`、`packages/domain` |
| `packages/domain/src/backtest-event-signal.ts` | 1 | `packages/domain` |
| `packages/domain/src/nav-simulation.ts` | 7 | `apps/server/src/backtest` |
| `packages/domain/src/backtest-v2.ts` | 22 | `apps/server/src/strategy-optimization`、`apps/server/src/backtest`、`apps/desktop/src/features`、`packages/domain`、`packages/schemas` |
| `packages/domain/src/simulation-ledger.ts` | 20 | `packages/domain`、`apps/server/src/backtest` |
| `packages/domain/src/backtest-indicators.ts` | 15 | `apps/server/src/backtest`、`apps/desktop/src/features`、`packages/schemas`、`packages/domain` |
| `packages/domain/src/backtest-trades.ts` | 8 | `apps/server/src/backtest`、`packages/domain` |
| `packages/domain/src/backtest-observation-clock.ts` | 5 | `apps/server/src/backtest`、`packages/domain` |
| `packages/domain/src/backtest-analytics.ts` | 11 | `packages/domain` |
| `packages/domain/src/ledger.ts` | 6 | `apps/server/src/ledger`、`apps/server/src/platform` |
| `packages/domain/src/backtest-engine.ts` | 12 | `apps/desktop/src/features`、`apps/server/src/ai`、`apps/server/src/backtest`、`daily-stock-analysis/src/repositories`、`daily-stock-analysis/src/agent`、`daily-stock-analysis/src/core`、`daily-stock-analysis/src/services`、`daily-stock-analysis/src/storage.py`、`packages/schemas` |
| `packages/domain/src/nav-simulation-rules.ts` | 9 | `apps/server/src/backtest`、`apps/server/src/market`、`packages/schemas`、`packages/domain` |
| `packages/domain/src/backtest-tradability.ts` | 2 | `apps/server/src/backtest` |
| `packages/domain/src/backtest-sizing.ts` | 11 | `packages/domain`、`apps/server/src/backtest` |
| `packages/domain/src/backtest-simulation.ts` | 33 | `packages/domain`、`apps/server/src/backtest`、`daily-stock-analysis/src/agent`、`daily-stock-analysis/src/services` |
| `packages/domain/src/ledger-v2.ts` | 23 | `packages/domain`、`apps/server/src/ledger`、`apps/desktop/src/features`、`packages/schemas` |

## 附录 B：生产路由声明清单

此表列声明位置及Controller组合路径；Server main.ts:44-49 设置全局 api/v1 前缀，排除 api/market/(.*) 和 api/market-data/(.*)，因此实际 Run/Ledger/导出公开地址另有 /api/v1 前缀，Market 已是 /api/market*。API Client/桌面基于相应base URL组合。DSA表中已列完整 /api/v3 路径。本轮没有发HTTP请求，未用路由声明推目标404/200。DSA Data/Control/OAuth不同鉴权依赖仍须分别验证；旧前缀拒绝路由单独见app.py:399-419，DSA通用api/v1不在表内。

| 声明位置 | 方法／路径 | 分类 |
| --- | --- | --- |
| `apps/server/src/ledger/ledger.controller.ts:51` | `POST /ledger/executions` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:56` | `POST /ledger/executions/replace` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:61` | `POST /ledger/executions/void` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:66` | `POST /ledger/executions/restore` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:71` | `POST /ledger/executions/move-account` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:76` | `POST /ledger/cash-flows` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:81` | `POST /ledger/cash-flows/replace` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:86` | `POST /ledger/cash-flows/void` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:91` | `POST /ledger/cash-flows/restore` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:96` | `POST /ledger/cash-transfers` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:101` | `POST /ledger/cash-transfers/replace` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:108` | `POST /ledger/cash-transfers/void` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:113` | `POST /ledger/cash-transfers/restore` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:120` | `POST /ledger/baseline-observation-batches` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:127` | `POST /ledger/import-draft-revisions` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:132` | `POST /ledger/import-draft-revisions/revise` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:137` | `POST /ledger/import-draft-revisions/submit` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:142` | `POST /ledger/:accountId/rebuild` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:147` | `POST /ledger/migrate-positions` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:152` | `GET /ledger/:accountId/events` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:160` | `GET /ledger/:accountId/events/audit` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:168` | `GET /ledger/:accountId/events/replay` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:179` | `GET /ledger/:accountId/reconciliation-candidates` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:184` | `POST /ledger/reconciliations/confirm` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:189` | `POST /ledger/reconciliations/void` | Server现行入口 |
| `apps/server/src/ledger/ledger.controller.ts:194` | `POST /ledger/reconciliations/restore` | Server现行入口 |
| `apps/server/src/platform/data-export.controller.ts:11` | `GET /exports/account` | Server现行入口 |
| `apps/server/src/backtest/backtest.controller.ts:21` | `POST /backtests/strategies` | Server现行入口 |
| `apps/server/src/backtest/backtest.controller.ts:27` | `POST /backtests/strategies/:id/versions` | Server现行入口 |
| `apps/server/src/backtest/backtest.controller.ts:32` | `POST /backtests/runs` | Server现行入口 |
| `apps/server/src/backtest/backtest.controller.ts:37` | `POST /backtests/runs/:id/cancel` | Server现行入口 |
| `apps/server/src/backtest/backtest.controller.ts:42` | `POST /backtests/runs/:id/retry` | Server现行入口 |
| `apps/server/src/backtest/backtest.controller.ts:47` | `POST /backtests/runs/:id/run` | Server现行入口 |
| `apps/server/src/backtest/backtest.controller.ts:52` | `GET /backtests/runs` | Server现行入口 |
| `apps/server/src/backtest/backtest.controller.ts:57` | `GET /backtests/runs/:id` | Server现行入口 |
| `apps/server/src/backtest/backtest.controller.ts:67` | `GET /backtests/strategies` | Server现行入口 |
| `apps/server/src/backtest/backtest-run-preflight.controller.ts:8` | `POST /backtests/run-config/preflight` | 公开准备/预检 |
| `apps/server/src/backtest/backtest-nav-preparation.controller.ts:12` | `POST /backtests/run-config/nav/prepare` | 公开准备/预检 |
| `apps/server/src/backtest/backtest-run-preparation.controller.ts:11` | `POST /backtests/run-config/prepare` | 公开准备/预检 |
| `apps/server/src/market/market-data.controller.ts:35` | `GET /api/market-data/policy` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:39` | `GET /api/market-data/routes/capabilities` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:50` | `POST /api/market-data/policy/retry` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:54` | `POST /api/market-data/policy/rollback/:revision` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:58` | `GET /api/market-data/providers` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:62` | `POST /api/market-data/providers/:providerId/config` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:69` | `POST /api/market-data/providers/:providerId/test` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:76` | `POST /api/market-data/providers/:providerId/remove` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:80` | `POST /api/market-data/providers/longbridge/oauth/sessions` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:93` | `GET /api/market-data/providers/longbridge/oauth/sessions/current` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:99` | `GET /api/market-data/providers/longbridge/oauth/sessions/:sessionId` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:105` | `POST /api/market-data/providers/longbridge/oauth/sessions/:sessionId/cancel` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:111` | `GET /api/market-data/instruments/search` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:117` | `POST /api/market-data/instruments/:id/confirm` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:121` | `GET /api/market-data/instruments/associations` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:125` | `GET /api/market-data/catalog/status` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:129` | `GET /api/market-data/catalog/jobs/:jobId` | Server现行入口 |
| `apps/server/src/market/market-data.controller.ts:135` | `POST /api/market-data/catalog/sync` | Server现行入口 |
| `apps/server/src/market/market.controller.ts:180` | `GET /api/market/:symbol/bars` | Server现行入口 |
| `apps/server/src/market/market.controller.ts:199` | `GET /api/market/:symbol/indicators/:name` | Server现行入口 |
| `apps/server/src/market/market.controller.ts:220` | `GET /api/market/:symbol/detail` | Server现行入口 |
| `apps/server/src/market/market.controller.ts:323` | `GET /api/market/:symbol/chart-options` | Server现行入口 |
| `apps/server/src/market/market.controller.ts:350` | `GET /api/market/:symbol/quote` | Server现行入口 |
| `apps/server/src/market/market.controller.ts:355` | `GET /api/market/:symbol/fund-nav` | Server现行入口 |
| `apps/server/src/market/market.controller.ts:360` | `GET /api/market/:symbol/fund-nav/history` | Server现行入口 |
| `apps/server/src/market/market.controller.ts:372` | `GET /api/market/:symbol/chip` | Server现行入口 |
| `../daily-stock-analysis/api/thesis_ledger_oauth.py:81` | `POST /api/v3/thesis-ledger/control/providers/longbridge/oauth/sessions` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger_oauth.py:92` | `GET /api/v3/thesis-ledger/control/providers/longbridge/oauth/sessions/current` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger_oauth.py:100` | `GET /api/v3/thesis-ledger/control/providers/longbridge/oauth/sessions/{session_id}` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger_oauth.py:108` | `POST /api/v3/thesis-ledger/control/providers/longbridge/oauth/sessions/{session_id}/cancel` | DSA现行专属入口 |



| `../daily-stock-analysis/api/thesis_ledger.py:1232` | `GET /api/v3/thesis-ledger/capabilities` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1243` | `POST /api/v3/thesis-ledger/market/bars` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1293` | `POST /api/v3/thesis-ledger/market/indicators/calculate` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1513` | `GET /api/v3/thesis-ledger/market/fx-rates` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1537` | `GET /api/v3/thesis-ledger/market/fund-nav` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1550` | `GET /api/v3/thesis-ledger/market/fund-nav/history` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1569` | `GET /api/v3/thesis-ledger/market/fund-holdings` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1582` | `GET /api/v3/thesis-ledger/market/quote` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1595` | `GET /api/v3/thesis-ledger/backtest/calendar` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1631` | `GET /api/v3/thesis-ledger/backtest/instrument-facts` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1687` | `GET /api/v3/thesis-ledger/market/chip` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1740` | `POST /api/v3/thesis-ledger/control/handshake` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1773` | `GET /api/v3/thesis-ledger/control/providers` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1782` | `GET /api/v3/thesis-ledger/control/routes/capabilities` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1814` | `POST /api/v3/thesis-ledger/control/providers/{provider_id}/config` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1826` | `POST /api/v3/thesis-ledger/control/providers/{provider_id}/test` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1945` | `POST /api/v3/thesis-ledger/control/providers/{provider_id}/remove` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1957` | `POST /api/v3/thesis-ledger/control/policies/apply` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1973` | `GET /api/v3/thesis-ledger/control/policies/effective` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:1993` | `GET /api/v3/thesis-ledger/catalog/snapshot` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:2001` | `GET /api/v3/thesis-ledger/catalog/delta` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:2009` | `POST /api/v3/thesis-ledger/control/catalog/jobs` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:2018` | `GET /api/v3/thesis-ledger/control/catalog/jobs/{job_id}` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger.py:2026` | `POST /api/v3/thesis-ledger/control/catalog/ack` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger_events_v3.py:15` | `POST /api/v3/thesis-ledger/market/events` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger_chart_v3.py:124` | `POST /api/v3/thesis-ledger/market/chart-bars` | DSA现行专属入口 |
| `../daily-stock-analysis/api/thesis_ledger_nav_v3.py:17` | `POST /api/v3/thesis-ledger/backtest/nav-inputs` | DSA现行专属入口 |

## 7. 结束复核与并发漂移

2026-10-01 04:15:10 +08:00 对初始1208输入逐文件重算SHA-256：10个输入变化，0个缺失；变化清单如下（没有改写这些文件）：

- `thesis-ledger/packages/schemas/src/backtest-nav-preparation-result-v3.ts`
- `thesis-ledger/packages/domain/src/nav-simulation-rules.ts`
- `thesis-ledger/apps/server/src/ledger/cash-projection.ts`
- `thesis-ledger/apps/server/src/backtest/backtest-nav-offline-events.ts`
- `thesis-ledger/apps/server/src/backtest/backtest-nav-preparation.service.ts`
- `thesis-ledger/apps/server/src/backtest/backtest-nav-offline.ts`
- `thesis-ledger/apps/server/src/market/market-nav-reader-v3.ts`
- `thesis-ledger/apps/server/prisma/schema.prisma`
- `thesis-ledger/docs/tasks/2026-09-29-thesis-ledger-canonical-runtime-replacement.md`
- `thesis-ledger/docs/specs/2026-09-29-thesis-ledger-canonical-runtime-replacement.md`

随后只复核受影响的关键身份/路径：Ledger现金投影仍先调用requireCurrentLedgerEnvelope（cash-projection.ts:335）；RunConfig V3、旧模式拒绝和公开Router范围未发生本轮所见变化；NAV Reader新增currentRouteState（market-nav-reader-v3.ts:53）用于创建复核，准备service新增Repository注入及receipts.save（backtest-nav-preparation.service.ts:17,32,86）。此时BacktestModule尚未看到Repository注册，未来Run消费尚不能确认为完整生产闭环。没有因此运行测试或修改在途文件。

新增 `apps/server/src/backtest/backtest-nav-preparation-repository.ts:17,20,39` 与准备receipt核验模块，当前写入准备收据的有效期为checkedAt后15分钟与准入到期的较早值；摘要/原文重放核验在save前执行。新增 `schema.prisma:1035` 的NavBacktestPreparation，与StrategyVersion和BacktestJob关联；新增migration `20261001100000_nav_backtest_preparation`。源码可达性记录为「N2.5进行中的准备持久化接线」，不会将刚写入的代码或Prisma生成视为验证通过。

因为migration输入变化，本轮只重跑低成本matrix：**25 migrations、71 SQL表、60 Prisma model、11 raw-owned，head=20261001100000_nav_backtest_preparation，通过**。该结果取代§3的初始静态结构计数作为最后一次源码结构核对；目标数据库head未查询。N2新增输入不在初始1208文件集合内，不能由初始集合的hash复核证明全部稳定。N3离线和E03-b现金文件继续由各自所有者验证；本库存不复验、不抢写、不冻结其他会话。

共享主Task/Spec也变化，最后读取仍由其所有者管理N2/N3/E03状态。此文只给C01时间切片和残余叶建议，若后续实现需要稳定输入，执行者必须重新核验这些在途文件及其最新叶证据。初始基线与结束新增结构均保留，避免把混合时间切片误报为单一已部署版本。


## 8. 继续轮次：准备收据、创建边界与并行叶交付复核

复核起点：2026-10-01 04:22:58 +08:00；主仓dirty条目793，DSA287，infra17。只读查看当前源码和两份并行叶证据，写入仍只有本文件。§7的Module未注册结论为04:15时间切片，本节更新当前可达性；初始附录79模块/96路由数量不包含下面新增的NAV Run合同/路由。

| 新增／变化库存 | 生产者→消费者 | 持久格式与当前可达性 | 处置／依赖 |
| --- | --- | --- | --- |
| 准备收据接线：`apps/server/src/backtest/backtest.module.ts:28,48`；`backtest-nav-preparation.service.ts:36,92` | 当前准备API→BacktestNavPreparationRepository.save→NavBacktestPreparation | Repository已注册；成功准备响应包含receipt，保存原请求/完整证据/checksum/expiry。§2准备行的“Module未注册”已被本次源码核验取代 | 现行准备持久化，N2.5.1负责定向/DB/目标证明；不将接线视作业务执行就绪。 |
| 收据读回：`apps/server/src/backtest/backtest-nav-preparation-receipt.ts:125,143,152` | NAV创建服务→validateNavPreparationReceipt→原准备证明重放 | 拒绝checksum不符、过期、规则/原文/来源绑定不一致；不能只信任prepare外层摘要 | 保留独立receipt合同；与C04 NAV冻结身份、C02幂等和N2.6隔离DB关联。 |
| NAV创建与消费关联：`apps/server/src/backtest/backtest-nav-run.service.ts:207,255,290,334,360` | NAV创建→收据/当前策略/路由复核→LocalNavSnapshotStore→事务写Run/唯一消费 | mode=V3、inputKind=nav，独立NAV配置/manifest；当前写status=failed、attempt=0、dispatchedAt=null，保留冻结关联 | 新增现行创建候选，不能再称所有创建源码都仅场内；仍未开放执行。C02/C04必须纳入这条失败保管与幂等链。 |
| 新入口：`apps/server/src/backtest/backtest-nav-run.controller.ts:4,8`；`backtest.module.ts:29,41,49` | POST /api/v1/backtests/runs/nav→BacktestNavRunService | Controller/Service已注册，创建DTO/响应由`packages/schemas/src/backtest-nav-run-v3.ts:11,19`定义，index.ts:29导出 | 属于新增当前专属入口，非旧Run兼容；目标HTTP尚未由本轮验证。 |
| NAV读取身份：`apps/server/src/backtest/backtest-nav-run-read.ts:63,85`；`backtest-nav-run.service.ts:405,426` | 创建响应／NAV服务读取→准备关联、配置/冻结身份核验 | 独立NAV响应有配置/manifest，不能由场内responseSchema代替。通用Run列表/单项、API Client/Desktop是否消费该读法仍待集成核对 | C02-d/U01-b必须覆盖NAV失败记录与旧行错误；当前API Client/strategy.api未发现新增NAV创建符号接线。 |
| 投递拒绝：`apps/server/src/backtest/backtest-queue.service.ts:38` | ensureEnqueued→isNavBacktestInput | 终态先返回；非终态NAV抛NAV_V3_EXECUTION_UNAVAILABLE。Processor仍依赖通用persistedContractVersion/Run执行入口 | 不授予NAV Worker成功执行；N2.5.3/N3须分别验证错误投递、直接Worker领取和晚到边界，不能用队列拒绝替代全部执行面证明。 |

### 并行证据及其适用边界

- [E03-b并行证据](2026-10-01-parallel-e03-b-ledger-projections.md)§验证/最终Review报告：当前信封命令与投影、本地测试/类型/build及独立PostgreSQL验证通过，生产修改只收敛旧信封错误传播。此项是其他执行者的落盘报告，本轮另核源码cash-projection.ts:335仍先requireCurrentLedgerEnvelope。其隔离库基线为24 migration，不能据此宣称新增NAV migration也完成隔离验收。E03-c/d仍未完成；C03-c/U01-c/U02-a可消费其当前信封合同，共享Task状态由主线按基线复核后更新。
- [N3并行离线证据](2026-10-01-parallel-n3-nav-offline.md)报告Domain324项与NAV定向71项通过，但最后Server全包/常规类型有并发输入相关失败，常规build未执行；离线专属编译不替代包构建。历史测试失败记录不作为本轮最新源码失败事实，也不被较早通过覆盖。本轮没有重跑它们。
- N3报告的实质汇合缺口仍需公共合同负责人解决：场内backtestResultSchemaV3要求executionPriceProtocol和bar来源，离线NAV结果不能伪造这些字段。新增NAV Run创建/读取DTO只说明记录合同，不等于成功经济结果DTO、基准身份或Worker成功提交合同已完成。当前V3 Runner未发现NAV离线执行分支。
- N2.5共享Task已拆为准备持久化、创建冻结、执行边界/读取，N2.6独立拥有完整migration与实际Prisma/Parquet、并发幂等/消费/回滚。C01后续顺序应按这些明确叶接续，避免再把整个NAV组当成不可分割依赖。

本轮静态migration matrix再次通过：25 migrations、71 SQL表、60 Prisma model、11 raw-owned，head仍为20261001100000_nav_backtest_preparation。未连接目标DB、未运行共享测试/build、未访问Provider或部署。新增NAV源码仍可能在并发变化；本节只证明本次读取时的接线与格式，实施者须在自己的叶开始核对最新输入。

C01状态建议保持源码库存交付完成。共享Task/Spec/handoff及并行证据均未修改；没有进入C02/C03/C04/E02/E04/U01/U02实施。此轮在指定库存边界停止。


## 9. E03、N3 完成后的库存与依赖更新

盘点时间：2026-10-01 19:11:52 +08:00；主仓dirty条目847。用户报告E03/N3完成后，本轮读取当前Canonical Task、最终E03收口、N3汇合与N4目标证据，并核对生产源码。共享Task已标记E03父项及a至e、E01-N2.5/N2.6、E01-N3/N4完成。§2至§8为早先时间切片：其中“仅离线”“结果合同缺失”“仅失败保管”“禁止NAV投递”“E03-c/d待完成”等阶段结论已被本节取代，不再用作后续启动阻塞。

| 库存／最新源码定位 | 当前生产链路与格式 | 当前结论／后续依赖 |
| --- | --- | --- |
| NAV成功结果：`packages/schemas/src/backtest-nav-result-v3.ts:79,265,320`；`apps/server/src/backtest/backtest-nav-result-v3.ts:108,161` | inputKind=nav、schemaVersion='3'、snapshotVersion=snapshot-manifest-v3；当前执行结果联合区分场内/NAV；验证结果与冻结输入/Runner身份 | NAV不再缺公开经济结果合同；保留NAV事实及研究假设披露，不伪造Bar价格协议。C03/C04后续消费该现行合同。 |
| NAV执行器：`apps/server/src/backtest/backtest-nav-run-execution.ts:14,24`；`backtest-run.service.ts:216,223`；`backtest-nav-v3-runner.ts` | runCurrent按inputKind选择NAV或场内，NAV冻结重放→经济Runner→校验→当前attempt终态提交；BacktestModule注册NavRunExecution（:33,67） | 生产Worker汇合已接通，独立离线阶段不再是可达性上限。N3已完成；C02审计模式/CAS时同时覆盖两类执行输入。 |
| 创建/队列：`apps/server/src/backtest/backtest-queue.service.ts:37,45`；`backtest-nav-run.service.ts` | supportsNavExecution与已注入执行器控制准入；只有缺NAV能力时拒绝，当前就绪配置可创建投递 | 早先一律失败/拒绝投递的库存描述已过期。N2.5与N3创建到终态闭环复用完成证据；不能把历史NAV_RUNNER_UNAVAILABLE记录解释为当前服务无能力。 |
| NAV读取/动作：`apps/server/src/backtest/backtest-nav-run.controller.ts:27,33,38,43,50`；`backtest-nav-result-read.ts:22` | /api/v1/backtests/runs/nav列表/创建/单项/retry/cancel；当前结果及冻结身份核验；与通用场内路由按用途区分 | 多个资产入口承载同一当前Run状态机，不是旧Run兼容。C02-d/C04读链必须覆盖NAV；附录B早期96路由数量不代表最新完整路由数。 |
| API Client/界面：`packages/api-client/src/backtest-nav-run-client.ts:24,26,27,32,38`；`api-client/src/index.ts:648` | NAV客户端解析当前Schema；准备/创建、结果、任务历史与QDII重试已有N4浏览器证据 | §8“尚未发现客户端接线”已被新增模块取代。U01-b复用这些已完成NAV用户路径，仅核对其余Canonical范围，避免重复实施。 |
| Ledger信封/投影/关联：Canonical Task E03-a～e及[最终收口](2026-10-01-e03-backtest-association-closeout.md) | 当前version=3、持久envelopeVersion=3与经济payloadVersion独立；命令、修订/撤销、投影/Import、客户端、目标新旧事件、场内/NAV经济关联已验收 | E03整体已完成；C03-c不再等待E03-b，U01-c/U02相关Ledger范围可复用其证据。旧V2命名导出是否删除仍由Canonical合同收敛叶核对，不撤销E03完成。 |

### 最新证据与验收层次

- [N3 Worker汇合证据](2026-10-01-n3-nav-worker.md)首段明确W01–W06全部完成并归档，最终验收转至[N4目标证据](2026-10-01-n4-nav-target.md)。旧离线证据与W01–W03阶段的未完成描述保留其历史时间，不当作现状。
- N4最终记录覆盖当前来源精确准入、三只真实基金HTTP/Worker、冻结checksum/费用/期末待处理、浏览器准备创建与历史重开、QDII公开重试。Canonical Task明确Electron按用户确认不作为本项门槛；未把Electron记为通过。研究模式的暂停、限购、渠道及严格PIT边界仍由现行结果披露，完成不意味着扩展来源资格。
- [E03最终收口](2026-10-01-e03-backtest-association-closeout.md)§收口核对涵盖a～e：[目标客户端/HTTP证据](2026-10-01-parallel-e03-target-acceptance.md)与场内/NAV关联回归、跨Run身份负例及目标只读复核。最初E03-b证据中的“c/d未执行”仅属于该叶当时范围。
- 上述测试、隔离库、目标部署、HTTP、Provider与浏览器结果来自各叶现有证据，本轮没有重跑或新增这些实测。此轮新证据是共享状态与当前源码接线的一致性核对。

### 剩余叶的依赖调整

§4提出的C02/C03/C04/E02/E04/U01/U02残余核对范围继续保留，但移除“等待N2/N3/E03-b完成或交回写权”的过期门槛。执行前仍检查当前dirty写集和最新证据；完成某个业务阶段不等于全仓源码稳定。

优先衔接C03已确认旧decoder/别名/无消费者纯导出的有界清理，以及C04当前场内/NAV/PIT证据读取边界；E02非Bar旧事实回读、E04专属协议/Store剩余审计按其独立合同实施。U01/U02仅补Canonical尚未覆盖的消费边界，已由E03/N3/N4验收的动作不重复开成未实施叶。各父项是否全部完成仍由共享Task所有者逐项确认，C01不会自动勾选其他组或删除原始数据。

唯一写集仍为本库存文件；没有修改共享Task/Spec/handoff、代码或配置，没有提交/部署。本轮在C01状态更新边界停止。
