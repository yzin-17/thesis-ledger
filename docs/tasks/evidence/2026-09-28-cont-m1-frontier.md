# M1 续接实施前沿核对

## 检查点

`CONT-M1-frontier / worker_done`：只读发现完成。最优下一叶为下述 `S05-content-cutoff-precision`；S05 最终资格编排仍为 `blocked`，不授予 `qualified`、`historical-window-bound` 或预检 `ready`。完整 M1/M2/M3 与 AC01–AC20 继续开放。

依据：主 Spec §3.1、§6、§8–13，主 Task §3–8/12.8/12.9，以及 [最新集中 Review](2026-09-28-backtest-implementation-review.md)。执行指导使用 `spec-driven-workflow` 的 implementation 参考。已读 RTK、Codex 规则及仓库 AGENTS.md；Context Mode 工具发现不可调用，使用 RTK、有界查询和限定源码读取。

只写本文；没有修改、revert、stage、commit 源码或既有台账，没有业务请求、数据库写入、Provider/AI/浏览器请求、目标更新或全量验证。所有 Shell 调用同步返回，没有创建后台进程、HTTP 服务或临时数据库；本叶进程均已停止，资源与写权交还。其他代理仍可在各自所有权内工作，本文不宣称它们停止。

## S05 最终资格：两次独立核对

1. 文档证据核对：Spec §6 与最新 Review 明确要求原发布机器认证、持续证券场所、真实 XSHE 日历、历史来源修订/同期捕获、完整执行日历一致、发布前撤销/摘要再查、封存与离线重验。[场所发现](2026-09-28-s05-venue-parser-discovery.md)只证明 159516 的首次上市事件；没有证明 2026 连续场所范围或日级原记录历史公开真实性。现有 XSHG 原包不覆盖 XSHE。
2. 实际源码核对：`market-pit-reconstruction.repository.ts` 只有 `bindContent`/`bindSourceTimes`；`market-pit-decision-window-v3.ts` 只输出 `decision-windows-bound`；`market-pit-calendar-package-v1.ts` 只登记固定 XSHG parser；`market-pit-source-capture-v1.ts` 只绑定归档身份/摘要/原 fetchedAt。定向搜索未发现场所原文 parser、历史修订原发布认证或 `historical-window-bound` 的生产成功实现。`backtest-reconstruction-preflight-v3.ts` 在必要绑定通过后仍拒绝历史窗口，`backtest-snapshot-v3-pit-guard.ts` 仍拒绝严格 V3 执行。

因此，原认证/场所真实性卡点确认后记录跳过；不重跑真实请求，不创建可由注入 fixture 签发资格的管线。即使后续补齐解析器，实际预检、冻结、离线及真实来源验收仍须分叶执行。

## 可直接派发的源码叶

### S05-content-cutoff-precision：v2 实际归档内容截点保持精度

- 结果：v2 实际完整归档的观察、价格、可见及抓取时钟以现有 Schemas 精确瞬时原语核对 `dataAsOf`；晚一微秒也不能返回 `archives-bound`。只修复内容必要阶段，返回类型、资格边界和错误分类保持现有合同。
- 前置：Spec §6 已规定 v2 证据精度；共享 `market-pit-evidence-instant-v1.ts` 已存在并从 Server 单向消费。没有来源、凭据、数据库或最终资格前置。协调者须确认独占写集与稳定 Schemas dist。
- 精确写集：`apps/server/src/market/market-pit-reconstruction-content-v3.ts`；可新增 `apps/server/src/market/market-pit-reconstruction-content-clock-v3.ts`，仅承载该 Market 内容时钟职责；`apps/server/test/market/market-pit-reconstruction-content-v2.test.ts`。不修改共享出口、Schema、repository、预检、Store 或原始 fixture。
- 源码事实：内容模块 `archiveExceedsCutoffV3` 把 cutoff/observedAt/Bar 时钟经 `Date.parse` 比较，输入 cutoff 在第 94 行仍转为毫秒。第 59 行比较价格坐标时排除 observedAt，故实际归档观察与本次输入观察可以不同；v2 输入自身的精确 Schema 校验不能证明实际归档 metadata 已精确受限。最新 Review 已明确此 legacy 边界尚待收敛。本轮再次定向搜索确认它仍存在。
- 合同：v1 历史入口保持已有独立语义；仅 v2 采用精确比较。`fetchedAt` 仍消费实际 repository 的 Date，不制造更高精度捕获事实。非法时钟失败关闭，保留原字节、摘要、时间字符串、读取次数、内容/范围/摘要校验和首错顺序。原 numeric Bar key 的兼容边界在本叶作定向核对，不因日线规范禁止同毫秒多 Bar 而扩大 wire 合同。
- 有意义的用例：输入清单合法且在截点内，但实际归档 observedAt 或额外原 Bar 的事实晚于截点一微秒；相等边界；等价偏移；非法/未知偏移；已有 v1/来源时钟回归。fixture 只验证拒绝，不授予资格。必须先构造能够通过原身份/摘要/范围门禁的完整归档，不能只测试比较器。
- 定向命令：`rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/market/market-pit-reconstruction-content-v2.test.ts test/market/market-pit-reconstruction-content-v3.test.ts test/market/market-pit-reconstruction-source-times-v3.test.ts`；通过后 `rtk proxy pnpm --filter @thesis-ledger/server typecheck`，再对独占文件执行既有 lint/strict complexity/格式检查。测试失败最多重试一次，记录后跳过；共享全包/build/目标更新由协调者后续稳定输入阶段控制。
- 消费者：`MarketPitReconstructionRepository.bindContent → bindSourceTimes → backtestHistoricalExecutionPreflightFailureV3`。严格预检和 Store 仍拒绝最终资格；本叶不能关闭 S05/S07/S08/S09 或真实门禁。
- 阻塞/停止条件：原始归档时钟类型与精确比较不兼容时先记录具体类型，不修改 Prisma 或增加猜测时间；若需要 wire、数据库、公共契约变更则 `needs_split`。没有真实预算消耗。

## I01 离线诊断候选及边界

父协调者补充要求继续追根因。本轮已核对原失败源码与独立诊断证据，没有因为合成 JSONB 一致而排除原问题。

- 原失败入口：`apps/server/test/backtest/v3-worker-runtime.integration.test.ts`，`worker-dsa-http-fixture.ts:70` 调用 `makeReaderResult` 后只替换请求 requestId。`v3-snapshot-fixtures.ts:40` 的 `makeReaderResult` 按实际请求窗口生成工作日日线，OHLC/amount 使用浮点表达式；完整响应来自固定 `packages/schemas/fixtures/market-data-v3.response.etf-qfq.json`，之后经过严格 Schema、DsaClient、Reader 和 repository。
- 原失败日志只保存 priceBasisEqual/coverageEqual/storedHashValid/incomingHashEqual 四个脱敏布尔量，没有保存 ORM 回读 completeResponse 或原失败字段差异。原集成 `afterAll` 精确删除快照，证据确认原隔离数据库与服务已清理。
- 当前仍存在 `/private/tmp/run-worker-runtime-fixture.py`、`/private/tmp/i01-jsonb-driver-0928-launcher.py` 及 `i01-jsonb-driver-0928-e142bb42.log/.json`；本轮仅核对路径存在性，未执行脚本。这些 JSONB 文件对应另一次 15 条合成 Bar，不是原 ORM 失败载荷。未找到原失败 completeResponse 的保留路径；临时目录只作限定文件名库存，遇一个无关权限拒绝未扩大扫描。
- 可以按现存源码重建相同算法响应，不能声称恢复了原请求窗口、当时编译产物和 ORM 回读原字节。`marketFrozenWindowHashV3` 单窗口仍用严格 Schema 后 `JSON.stringify`，多窗口则用独立规范编码；对象字段顺序、数值负零、未知字段等需要实际差异证明，当前不足以选定哈希修复。

候选 `I01-original-response-offline` 尚未达到源码修复派发条件。若恢复原输入/ORM 回读载荷和对应请求窗口，可以独占新增 `apps/server/test/market/market-window-original-response-diagnostic.test.ts` 与独立 evidence，使用现有解析/哈希 API 对实际原载荷做字段、类型、数组顺序、IEEE-754、规范文本差异；不改生产哈希、不启动 Worker/HTTP/DB，不重新获取来源。定向命令为 `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/market/market-window-original-response-diagnostic.test.ts`。输出只记录差异路径/类型/位模式和摘要；有根因后另派最小源码修复。缺原回读载荷时只可做有界恢复发现，不能将新合成输入命名为原响应复原。

## 其余 M1 未勾选父项对账

| 父项 | 已存在的本地交付/接线 | 剩余义务及类型 |
| --- | --- | --- |
| D01 | API `thesis_ledger.py:1737` 调用 `try_hithink_multi_window_v3`；实际 helper 规划五年窗口、总预算、逐窗生产准入和全部交集比较；DSA 父响应、Server `dsa-market-bars-v3`/multi-window parser、完整窗口 hash、Snapshot multi-window validation/source-evidence 已接。独立旧 collector 未被调用不能据此断言生产调度缺失 | 旧子叶勾选与实际证据须由账本所有者对账；真实 HiThink 目标准入/窗口和 I01 完整 ORM 往返仍待外部/诊断，不能重写已存在调度 |
| S03、S04 | 日期覆盖缓存、版本隔离 repository、整窗 selector/Reader 和冻结窗口消费已有本地与隔离数据库证据 | I01 原完整 JSONB 响应差异、真实来源联通及父项依赖对账；不是再写一套缓存或主备 |
| S05 | 内容、来源时钟、XSHG 原包、捕获、决策窗口、精确 v2 Schema、旧严格保护已存在 | 真正源码：内容精度叶；外部合同/事实：原发布、持续场所、XSHE 与修订；然后最终验证、执行日历全投影、封存/离线接线分叶，当前 blocked |
| S07 | 全依赖预检、HTTP/API、客户端、事件诊断、修订失效及普通 U03 消费已有局部证据 | S04/S05 真实依赖、目标 UI/非法提交组合门禁；未发现可安全追加的独立 API 源码缺口 |
| S08、S09 | Builder/source/artifact/dependency/execution 接缝、统一价格绑定、持久终态、CAS、离线重放及旧兼容已有实现 | S05 最终证据冻结/离线和 I01；`backtest-snapshot-v3-calendar-alignment.ts` 目前核对覆盖日期/会话/结算，不含已核验历史证据的全投影比对，后者需最终证据合同就绪；不可先开放 strict |
| I01 | 原 Controller/Queue/Worker 成功子叶已有历史证据；生产 Reader 版本失败仍保留 | 原 ORM 回读字段差异未知；上节给恢复候选，不重跑耗尽门禁 |
| A01、A02 | 父窗口/候选绑定、反馈投影、失败分层、封存生命周期及隔离 PostgreSQL 已存在 | S08/S07、真实 V3 Worker/来源和真实 AI；不能用 SDK fixture 提升真实完成 |
| U01、U02、U03 | 路由/预设/准备→联合预检和中文诊断已实现 | 真实 Catalog/API 保存、目标界面/Electron 及失败/取消组合；未发现可直接新增的独立源码叶 |
| U04、U05 | 独立图表协议、Server/DSA/客户端窗口流程与口径缓存、结果/AI 披露已有实现 | 图表目标运行/交易时段证据、完整评价组/基准及 UI/Electron；按已有叶证据补验，不重做下拉框或结果布局 |
| G-Legacy | 独立 PostgreSQL、Parquet 落盘及 CN/HK/US/NAV 重放子叶已有证据 | S09/A03 与完整父项范围对账；本叶未重跑 |
| F01、F02 | 协议 smoke、发布/禁用/回退说明及主要契约文档已有局部交付 | 相容镜像回退剩余验证、文档全文/源码/版本最终对账与未完成依赖；属于文档/发布验收，不是新资格源码 |
| G-Deploy、G-Run、G-UI、G-AI | 官方保留数据升级/协议及最近 sync 可写层一致已有证据 | I01、真实 HiThink、普通 Run/重放、目标 UI、真实 AI 仍开放；healthy/sync 不等于业务通过 |

C01–C04、D02/D03、S01/S02/S06、B01–B05、A03 和 G-Math 已有完成状态。特别是 G-Math 的独立整数分币对照不重复实现；AC18 仍按已固定的样本和误差范围解释。

## 预算与交还

HiThink 159516、I01 原完整 Worker/Reader 门禁、AI 与浏览器同前提失败预算已耗尽；恢复、换任务 ID、fixture 或此次发现均不重置。此前 BaoStock/Catalog 等预算继续沿用。当前叶新增真实请求 0、重试 0、目标修改 0、数据库写 0。两次独立只读核对用于确认 S05 卡点，未机械重跑真实门禁。

本报告只确认所列源码及文档边界；没有把历史测试结果重签为本轮通过。下一实施先派内容精度叶；原响应诊断待精确原载荷前置，最终资格继续记录跳过。所有仍未执行的真实门禁和父项保持开放。
