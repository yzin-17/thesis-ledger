# 自主交易竞技场实施记录

## 基线与边界

2026-11-12 从当前 main 未提交工作区开始实施。实施前工作区已有 802 项变更，包含既有 CONTEXT.md 修改；不回退或批量暂存这些变更。旧竞技场仍是日频协议，自主比赛使用独立协议与状态。

本地没有找到 brainstorming 引用的 writing-plans 技能；按仓库现有 spec-driven-workflow 建立成对 Spec／Task。用户已确认设计并明确要求开始实施。

## T01：协议与账户计算

- `pnpm --filter @thesis-ledger/schemas exec vitest run test/arena-live.test.ts test/model-arena.test.ts`：5 项通过，覆盖新旧协议、全市场、同场预算、事件预约与成对退出。
- `pnpm --filter @thesis-ledger/domain exec vitest run test/arena-live-account.test.ts`：5 项通过，覆盖精确资金、冻结现金不降低净值、未结算份额、配对数量预留及预约消费。
- schemas、domain 的 `pnpm --filter <包> build` 均通过。
- 首次在 Context Mode 中运行测试时 PATH 缺少 pnpm，未实际执行测试；改用正常登录 Shell 后执行。首次协议测试发现 Zod 叠加 min 约束保留旧最小值，已改为从 element 新建数组并重验通过。
- 未执行迁移、Docker 更新或外部模型调用；上述证据仅证明本地契约与纯计算。

## T02：持久化所有权

采用四张 raw-owned 表，理由是账户 JSONB 行锁事务、每模型一个活动周期的部分唯一索引及显式 attempt 条件；符合现有编排存储模式。新 migration 只新增表和索引，不改变旧比赛。Prisma Schema 无变更。

- `node scripts/check-migration-matrix.mjs`：50 个 migration、105 张 SQL 表、85 个 Prisma model、20 张 raw-owned 表通过，head 为 `20261112010000_autonomous_model_arena`。
- `node scripts/check-runtime-database-input.mjs`：50 份 migration SQL 与运行时执行器打包输入一致。
- `node scripts/test-ai-provider-postgres.mjs test/model-arena/live-storage-postgres.integration.test.ts`：通过仓库已有维护入口创建专属临时 PostgreSQL，全部 migration 执行及结构清单通过，3 项测试通过；覆盖高精度字符串、活动周期部分唯一、跨比赛引用与估值唯一。入口结束清理专属容器，未操作目标业务数据库。

## T03：创建、归属与状态

- 新增 `/arena-matches` 身份鉴权入口，与旧 `/model-arenas` 分离；读取在服务端批量投影标的名称。
- 同一隔离 PostgreSQL 入口扩展至 5 项测试并全部通过；包含开始首次预约、owner 隔离、重复开始拒绝、暂停保留委托、已出站周期转未知耗用、恢复不新建预约及结束保留持仓。
- 初次扩展测试因早先存储样本仅写最小协议，列表严格解析拒绝该样本；已将存储样本改为完整有效协议后重验。没有放宽生产协议校验。
- `pnpm --filter @thesis-ledger/server build` 通过。尚未执行 HTTP、浏览器、实际 Provider 与目标运行态验收。

## T04：预约与领取

- `node scripts/test-ai-provider-postgres.mjs test/model-arena/live-storage-postgres.integration.test.ts test/model-arena/live-appointments-postgres.integration.test.ts`：9 项通过，其中预约组 4 项，覆盖并发扫描、单次领取、仅事件长期休眠、未知日历／休市／暂停及有限租约恢复；已出站失联终态为未知耗用且禁止重发。
- Server build 再次通过；真实 Redis 投递和重启链路保留在 G01/G04。
- T05 最终提交需要 T06 的原子委托契约，因此先推进已就绪的 T06，再回到 T05；不改变原 AC 或范围。

## T06.1：委托纯计算

- `pnpm --filter @thesis-ledger/domain exec vitest run test/arena-live-orders.test.ts test/arena-live-account.test.ts`：12 项通过，覆盖版本冲突、整批失败无副作用、可用资金、限价和滑点、市场单跳空、成对退出、暂停恢复、未结算数量及过期释放。
- domain、schemas build 通过。
- 增加委托 `activeSince`：保留原创建时点，恢复时更新实际生效时点，拒绝使用暂停期间旧报价。该字段不改变原始成交历史。
- T06 按纯计算、Market 执行证据、事务持久化三个独立表面拆为 T06.1–T06.3，保留原 AC 与目标运行态门禁。

## T06.2 / T06.3：来源与事务

- `pnpm --filter @thesis-ledger/server exec vitest run test/market/live-execution-reader.test.ts`：5 项通过，覆盖来源时钟、真实结算日、法定费用、旧价、未知会话及跨标的／公司行动缺失。
- 当前独立交易状态合同限定 STOCK；ETF 缺少可消费的状态证明，明确返回 `live_tradability_unavailable`。ETF 来源实现仍属于 T06.2，不能标记该叶完成。
- `node scripts/test-ai-provider-postgres.mjs test/model-arena/live-orders-postgres.integration.test.ts test/model-arena/live-storage-postgres.integration.test.ts`：8 项通过，其中委托事务 3 项，验证并发、账户版本、暂停及来源证据保存。
- 为每笔模拟成交保存完整来源证据，模型输入省略该原始证据正文以控制上下文；冻结内容仍保存在比赛账户事实中。
- Server `tsc --noEmit -p tsconfig.json` 通过；尝试不存在的 tsconfig.build.json 未执行有效检查，已纠正命令。

## T05：受控模型研究

- `node scripts/test-ai-provider-postgres.mjs test/model-arena/live-research-postgres.integration.test.ts`：4 项通过，覆盖只读工具后一次提交、事件休眠、每步实际用量、身份不符、出站前预算拒绝和未知结果不重发。
- 首次测试收集阶段发现 fixture 在同步 find 回调使用 await，修正为先读取周期后测试通过；未放宽生产校验。
- 新生成合同拥有只读工具请求和最终决策两种输出；从过大 ai-execution 文件抽出竞技场合同集合，未增加该存量文件规模。
- Market 原生指标计算从 Controller 提取到有明确所有权的 Reader，图表与研究复用同一缓存、指纹和 DSA 计算；相关原有回归仍须在下一本地检查执行。
- 尚未执行真实 SDK/Redis 纵向闭环，未调用真实付费模型。

## 估值、工具、独立页面与纵向闭环

- 领域账户、委托与估值三个文件共 15 项通过；估值组覆盖初始本金峰值、缺价暂停全场排名、并列名次、最大回撤保留、整手／滑点／法定费用及独立缺口抽样。
- `live-valuations-postgres.integration.test.ts` 3 项通过：共同空仓批次与现金基准、行情准备期间账户版本变化拒绝发布、日历不可用及结束后不再采样。初次调用曾在依赖包 build 之前加载旧 dist 合同，正确构建 schemas 后重验通过。
- `live-research-tools.test.ts` 6 项通过：查询前限定市场和资产、固定池越界、唯一目录身份、按需原生周期、取消、搜索关闭及网关响应关联。Market 原有指标窗口和图表共 21 项通过；执行证据补时区归一测试后 6 项通过，原始来源证据仍保留原时区。
- `ARENA_WITH_REDIS=1 node scripts/test-journal-review-postgres.mjs test/model-arena/live-runtime.integration.test.ts` 通过：现行 50 份 migration 初始化专属临时库，独立 Redis、实际 AI SDK 与本机受控 HTTP 完成两模型只读工具→统一提交→观察成交→订阅成交唤醒→仅价格预约休眠；六次实际本机 SDK 请求，零外部模型请求。关闭专属 Redis 客户端后，待投递任务仍在 PostgreSQL，未同步降级执行。专属 Redis 与 PostgreSQL 已由维护脚本清理。
- Desktop 受控浏览器：1440、1024、768、390 均通过图例显隐、净值切换、时间范围、持仓、成交证据和建赛页，零页面错误、无页面横向溢出。截图位于 `/tmp/arena-live-qa/`，不作为源码跟踪。首次脚本拦截规则误伤源码的 shared/api 导入，已改为只匹配 URL 根路径 `/api/`；390 宽度发现 Tabs 的最小内容宽度撑开表格，增加调用处 min-w-0 后重验通过。
- Mobile 实际业务组件与实际 chartDocument 在浏览器的受控宿主中，390、768、1024 的触摸点读数、图例、指标、成交资料均通过。它不证明原生 WebView 宿主、底部导航或设备验收。当前没有已启动的 iOS 模拟器；默认 PATH 中无 adb。
- Mobile 图表原有回归：f06、f06-visibility、m13 共 9 项通过；f06-updates 首次因最后一次 applyOptions 未包含配色而失败，合并配色后该组 8 项通过。新增竞技场最多 12 个模型加 2 条基准的独立数据预算，原市场图表仍保持 10 条曲线上限；未提高复杂度阈值。
- 两端 tsc 和共享 API client build 已通过当前阶段检查；后续修改后需按输入变化重验。不得将受控页面、SDK、本机 HTTP 或隔离数据库证据提升为真实来源、原生设备或目标部署通过。

## 实时规则的实质缺口

当前源代码核验：DSA 的 `static_cn_instrument_fact` 与港美研究身份接口将 `executionRules.status` 明确设为 `unavailable`，原因是缺少覆盖执行期的价格限制、法定收费及结算事实。现有 MarketLiveExecutionReader 因此会正确拒绝真实委托，但这也意味着它尚不能承担实际功能。T06.2 仍保持未勾选，不能用受控 supported fixture 制造真实成交就绪结论。

只读查看现行路由：CN 股票／ETF 当前主报价为 HiThink，港美股票／ETF 为富途；费用采用本地资料，CN 股票交易状态／价格规则采用本地资料。未修改这些路由，也未调用其上游报价。已向用户提出最多 12 批、只用现有配额、额外费用零元且遇阻停止的真实核验选择，尚未收到回复。

## 收益读取、成交点位与公共 HTTP

- `node scripts/test-ai-provider-postgres.mjs test/model-arena/live-storage-postgres.integration.test.ts test/model-arena/live-appointments-postgres.integration.test.ts test/model-arena/live-orders-postgres.integration.test.ts test/model-arena/live-research-postgres.integration.test.ts test/model-arena/live-valuations-postgres.integration.test.ts test/model-arena/live-http-postgres.integration.test.ts`：最新六文件共 24 项通过，输入包含以下修复。
- `LiveValuationQuery` 在 PostgreSQL 内抽取每条序列的极值和首尾，返回有界图表输入；累计缺失计数投影为每序列 `gapBefore`，即使频繁交替缺价也不无限增加传输点数。5000 批次、两模型独立极值、连续及频繁缺口的隔离测试通过；两个客户端按标记断线，未改写原始估值。期间收益直接读取原始边界，结束使用最后完整共同批次，最后一批缺口不会成为封存净值。
- 新增自主成交点位接口及共享客户端，按比赛冻结时区将实际成交时刻归属市场本地日期；模型和范围筛选在数据库执行。新旧比赛共同供标的图选择，自主点位进入对应模型账户，旧点位继续进入原轮次报告。保存原始 `day`／`executedAt`，聚合 K 线只改变绘制位置。
- 实际 Nest HTTP 使用受控身份 guard、本机 HTTP、真实隔离 PostgreSQL 和已构建 API client，覆盖未认证、跨 owner、UUID／严格参数、创建、列表、详情、重复启动、暂停恢复、结束及成交查询。它验证业务归属与传输，不证明实际身份服务／会话登录验收。首次从 Server 导入未声明的 api-client 包无法收集，随后改用已构建 dist；早期 guard 替身未覆盖 Nest enhancer，修正替身后验证通过，未更改生产鉴权。

## 暂停恢复、请求预算及交易费用

- 暂停前尚未出站的原预约允许恢复；一旦有出站请求，暂停恢复保留 `needs_attention` 与未知结果审计，不恢复已消费预约。隔离测试证明该模型不会自动再研究，其他未出站模型可独立恢复，显式重试后才建立新预约。早期断言错误地要求所有模型均不恢复，已改为分别核对模型归属，没有限制正常未出站任务。
- 研究工具与模型调用都在调用前核对并预留参赛者及全场请求额度；工具结果包含独立审计，令牌和模型费用仍按实际 SDK 收据结算。5 项研究测试包含“模型第一步已用完请求额度，工具不得继续读取来源”。网页搜索保留实际上游尝试次数，未隐式启用来源。
- `arenaOrderFee` 同时传递精确成交额、实际股数和成交价；新增公共收费纯函数复用既有金额进位和 TAF 算法，覆盖按股数收费、上限、低价豁免、港股印花税进位、跨币种拒绝及原始精度。测试费率仅为受控样本，不是现行市场收费认证。该适配能力不能替代 T06.2 的真实来源和有效期核验。
- `pnpm --filter @thesis-ledger/domain exec vitest run test/arena-live-account.test.ts test/arena-live-orders.test.ts test/arena-live-valuation.test.ts test/arena-live-public-fees.test.ts`：最新 19 项通过。schemas 自主协议组 3 项通过；最初新旧合并组 5 项属于不同检查范围，不累计为额外覆盖。

## 正式市场会话与消费展示

- 执行和价格预约核对“此刻开放的同一个实际会话”；盘前、午休前或上一会话的报价即使仍在延迟上限内也不参与触发。估值的开市报价复用该检查；休市快照继续使用共享事实，不改为执行证据。
- `pnpm --filter @thesis-ledger/server exec vitest run test/model-arena/live-research-tools.test.ts test/market/live-execution-reader.test.ts test/market/live-quote-session.test.ts`：13 项通过，包括 6 项执行读取、1 项跨时段报价与 6 项工具测试。
- 可用现金及可卖份额由 Server 按 Market 的正式会话日期投影；日历未知返回未确认，两端不再以本机日期解禁。按标的汇总分批持仓展示数量和可卖合计，原始份额及分批可卖日期保持不变；隔离 HTTP 覆盖未知状态，估值查询覆盖已知日期，高精度汇总由领域测试覆盖。
- Desktop 相关图表／旧比赛／周报回归 35 项、Mobile 相关回归 13 项通过；既有刷新测试输出 React act 警告，未扩大为无警告结论。Mobile 使用 `--exclude 'release/**'`，不把历史构建副本算作当前测试。
- 最新受控浏览器再次通过：Desktop 1440／1024／768／390，Mobile 390／768／1024，均无页面错误；移动触摸读数来自实际 chartDocument。截图在 `/tmp/arena-live-qa/`。这些测试仍未覆盖完整 AppShell／原生底部导航、真实服务失败恢复及目标运行态。

## 本地门禁与验收缺口

- 最新 Server build、Desktop／Mobile typecheck、schemas／domain／api-client build 通过；边界和 workspace 依赖图通过。迁移矩阵为 50 份 migration、105 张表、85 个 Prisma model、20 张 raw-owned 表，head=`20261112010000_autonomous_model_arena`；未据此声称目标数据库已升级。
- 本次竞技场生产源码定向 ESLint 40 文件返回 0 error／0 warning，后续受影响的调用处也独立检查通过；依赖分析仍打印 React Native Flow 源码解析诊断（最新 4 次），未关闭规则、添加 ignore 或宣称完整仓库静态检查无问题。
- 文件尺寸门禁通过，仍报告 6 项既有大文件警告；没有提高阈值。限流策略总门禁最初发现规则版本、回测标的序列、优化执行模型三条工作区接口漏登记，核对实际读取成本后补登记；39 项策略测试通过，竞技场点位读取独立归入 preview。
- SDK／Redis 维护脚本在请求预算和暂停修复后已重验通过；隔离环境自行清理。没有调用外部真实模型，没有修改来源启用、路由或真实业务数据；没有更新目标 Docker 运行态。
- T06.2 尚缺独立实时规则及 ETF 状态合同、已验证来源和适配。官方资料亦有近期制度修订，不能用旧常量补齐：参见[港交所价位调整](https://www.hkex.com.hk/Services/Trading/Securities/Overview/Trading-Mechanism/Reduction-of-Minimum-Spreads?sc_lang=en)和[SEC 最小价位实施延期原文](https://www.govinfo.gov/content/pkg/FR-2026-06-15/pdf/2026-11997.pdf)。查阅公开文件不是配置源真实数据准入证明。
- G02 尚缺目标完整应用及原生宿主，G03 的有界来源核验待回复，G04 未部署。上述未完成项目继续保留在 Task，不能把本轮本地通过提升为整体验收完成。

## 调度分页最终复核

发现运行中／暂停比赛读取固定取前 100 行，会让后续长赛季一直无法进入观察。改用 `(createdAt,id)` 游标分页，每页保持 100 行，运行调度与预约扫描复用同一读取；暂停过滤独立，未增加任何模型预约或改变行情观察间隔。

`live-storage-postgres.integration.test.ts` 新增 102 场同创建时间比赛的实际数据库覆盖，验证无遗漏、无重复及 101 场运行／1 场暂停过滤。存储 6 项和预约 5 项合计 11 项通过；这是前述 24 项组合之后受影响输入的增量复验，不累计为 35 项独立覆盖。Server build、这三个生产文件的 ESLint、边界及迁移矩阵再次通过。

本轮受控浏览器所用两个 Vite 服务已停止；截图保留在 `/tmp/arena-live-qa/`。隔离数据库与 Redis 均由维护入口清理，目标业务容器没有变更。

分页修改后，`ARENA_WITH_REDIS=1 node scripts/test-journal-review-postgres.mjs test/model-arena/live-runtime.integration.test.ts` 最新再次通过 1 项实际 SDK／隔离 Redis 纵向闭环；脚本完成当前 Server 构建，并已清理本次 Redis 与 PostgreSQL。原始来源准入与目标运行态验收仍未完成。

## 用户授权后的有界来源核验

用户回复“授权上述有界核验”，允许当前 HiThink／富途及本地规则来源的三市场股票／ETF 样本、最多 12 批、零新增费用；不调用模型、不修改路由，权限不足、额外收费或覆盖不足即停止，不自动重试。以一条 Data HTTP 请求计一批，先做当前日期的本地规则门禁。

实际入口：在主仓执行 `rtk proxy node scripts/local-runtime/arena-live-rule-preflight.mjs --market CN --asset STOCK --batch 1`。脚本核对目标容器的 Compose 项目、服务和健康身份，只运行只读 DsaClient；沿现行主目标精确 pin `local-materials/local-materials/0`，Data 传输固定单次，不启动 Nest 应用、模型、Worker 或调度器。读取有效政策属于本地配置读取，不是行情／规则数据批次。

实际结果：`2026-11-12T04:13:57.239Z`，`600036.SH` 的 `HISTORICAL_PUBLIC_FEES`、区间 `2026-11-12` 至同日，requestId=`fd8c3e7d-e4f7-449e-88a1-6848b1662cc9`，返回 HTTP 422、`insufficient-coverage`；入口以退出码 2 明确停止。原始脱敏回执见[第 1 批回执](2026-11-12-autonomous-model-arena-source-01.json)。

已用 1／12 批，本次全部核验停止；其余 11 批、CN ETF、HK／US 以及全部外部行情均未执行。外部报价读取 0、模型调用 0、自动重试 0、路由修改 0、新增费用 0 元。不能把“未消耗外部配额”解释为供应商权限或行情准入通过。

为防重复执行，入口在发现该授权的既有停止回执时会在 Docker／服务端请求之前拒绝再次运行。当时未修改运行容器内的代码或资料；目标部署、三市场准入及 T06.2 未完成。用户随后要求超出日期范围时尝试最新资料，完整检查无新增变更时推进已核验覆盖；该修正不认证未经核对的历史资料，也不重启已经停止的来源核验。

安全门禁验证：`node --check scripts/local-runtime/arena-live-rule-preflight.mjs` 通过；保存停止回执后调用同一入口，在回执检查处以退出码 1 拒绝，未进入 Docker 检查或服务端请求。这是本地防重复门禁检查，没有执行第二批数据读取。

## 创建页返回入口与网页搜索控件

按用户截图反馈，创建页与自主比赛详情的返回入口统一复用共享 Button 的 `ghost`／`sm` 变体与左箭头，使用原生 Link 导航；创建页按内容宽度显示。网页搜索改用共享 Switch／SwitchThumb，默认关闭并继续向原保存逻辑传递 `allowWebSearch`；说明文字不会触发切换。

Desktop `tsc --noEmit`、两个修改组件的 ESLint、浏览器脚本语法及 `git diff --check` 通过。既有受控实际组件浏览器入口 `scripts/local-runtime/arena-live-browser.mjs` 覆盖 1440／1024／768／390：返回宽度及两次导航正确，Switch 鼠标和空格键切换、默认状态及标签不激活均通过，无横向溢出及页面错误。收益图表原有交互同时通过。已查看桌面与窄屏截图，输出在 `/tmp/arena-live-controls-qa/`。这是受控浏览器验收，没有修改或提交真实比赛数据，没有来源或模型调用，未作为整场竞技场真实业务验收。

## 本地规则按需刷新

用户要求已落入 DSA 的[规格](../../../daily-stock-analysis/docs/specs/2026-11-12-local-rule-demand-refresh.md)、[任务](../../../daily-stock-analysis/docs/tasks/2026-11-12-local-rule-demand-refresh.md)和[证据](../../../daily-stock-analysis/docs/evidence/2026-11-12-local-rule-demand-refresh.md)。收费读取的统一／原始入口均能按需检查官方资料，完整无变更时保存覆盖投影，原件和冻结记录保留。137 项相关测试通过，覆盖 CN／HK／US 股票与 ETF、实际受控 Data HTTP、SQLite 重开、并发和失败。

早期旧回归意外进行了 6 次真实官方文档读取，已披露并修复默认测试网络隔离；无报价、模型或新增费用。首次资料结果为待采纳，尚不具备当前费用认证；实际记录和指纹保存在上述 DSA 证据。T06.2／G03 继续未完成。

该 DSA 子项已通过 infra 正式 `sync-code.sh dsa` 同步到目标健康容器，15 个生产文件的宿主／容器指纹一致、模块导入通过；这只证明代码运行形态，不是三市场真实准入，也未部署主仓竞技场 migration／API／Worker。更新位于容器可写层，镜像保持不变。

## 首页比赛列表与布局

Desktop 首页直接读取并合并自主比赛与历史日频比赛，按创建时间倒序展示，并保留类型、市场、赛期、模型数和状态。各自仍打开原协议详情，历史详情返回竞技场首页；原 `/arena/history` 列表地址重定向到首页并保留 URL 查询、片段和返回来源状态。首页不再有单独的历史列表按钮。独立列表组件拥有两类查询和投影，旧协议数据、详情和冻结内容保持原值。

新建和刷新置于共享 PageHeader 操作区，首页与自主详情的刷新均使用现有 RefreshIconButton。列表同范围刷新保留记录，等待两类请求结束后再收起共用加载圈。首次加载、两类皆空、局部读取失败及完全失败分别表达；只有两类成功且均为空时显示一次共享 Empty。宽屏标题和操作左右排列，窄屏自然换行；表格在自身容器内横向滚动。

本次定向验证：

- `pnpm --filter @thesis-ledger/desktop exec tsc --noEmit`：通过。
- `pnpm --filter @thesis-ledger/desktop exec eslint src/features/model-arena/ArenaLiveList.tsx src/features/model-arena/ArenaLivePage.tsx src/features/model-arena/ArenaPage.tsx`：通过。
- `PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright node scripts/local-runtime/arena-live-list-browser.mjs`：1440／1024／768／390 均通过。覆盖首页直接展示两类比赛、历史详情与返回、旧列表重定向、两请求先后完成、刷新失败保留已有记录、仅历史比赛、单一空状态、首次部分加载、初始失败及手动恢复；无页面错误、无业务写入。长标题和表格不撑宽页面。
- `PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright ARENA_QA_OUTPUT=/tmp/arena-live-layout-regression-qa node scripts/local-runtime/arena-live-browser.mjs`：同四档宽度通过，收益图表、图例、净值、时间范围、持仓、成交、创建、返回及网页搜索 Switch 均保持可用。
- 浏览器脚本语法与本次文件 `git diff --check`：通过。

已查看 1440 与 390 的列表及空状态截图，位于 `/tmp/arena-live-list-qa/`；原有流程截图位于 `/tmp/arena-live-layout-regression-qa/`。验证使用实际组件、路由和 API client 加受控 HTTP 响应，不读取真实比赛或调用模型／外部来源。验证服务在检查后停止；未提交代码。本节只验收此次 Desktop 布局和消费流程，G02／G03／G04 继续保持其原状态。

## 列表搜索、筛选与分页

Desktop 改用新只读目录接口 `GET /arena-matches/catalog`。当前 owner 的自主与日频比赛先在数据库中过滤，再统一计数、排序和分页；每页允许 10／25／50 条，单次 SQL 保证结果和计数来自同一快照。旧数组接口及其 200 条保护保持原样，Desktop 的搜索范围不受该旧接口截断。查询只返回列表元数据，不读报价或调用模型，不改变数据库结构及历史协议。

支持名称、模型及模型来源的字面包含搜索，忽略大小写；类型、市场和状态可组合，排序包括创建时间新旧、名称及赛期。关键词通过搜索按钮或回车提交；筛选改变回到第一页，越界页收敛至末页，空结果保持第一页。URL 保留筛选、排序、页码及每页数量，详情与创建返回携带原列表 URL；未知枚举独立回落到默认显示，返回地址限制为安全的竞技场列表路径。下拉回显和选项共用中文标签，搜索、清空筛选和分页使用共享组件，无匹配与真实空列表分别表达。

当前本地证据：

- schemas：`vitest run test/arena-catalog.test.ts`，9 项通过；schemas 与 api-client build 通过。
- `node scripts/test-ai-provider-postgres.mjs test/model-arena/live-catalog-postgres.integration.test.ts test/model-arena/live-http-postgres.integration.test.ts`：6 项通过；维护入口创建和清理隔离 PostgreSQL，执行 51 个 migration。207 场比赛验证早期数据不被旧 200 条截断、字面百分号／下划线／单引号、模型／来源搜索、组合条件、稳定分页、空结果、越界页和跨 owner 数据／计数隔离；实际 Nest HTTP 加已构建 API client 验证认证、参数及只读响应。
- `pnpm --filter @thesis-ledger/desktop exec vitest run test/arena-catalog-navigation.test.ts test/arena-detail-refresh.ui.test.tsx`：12 项通过，其中新增 URL 合同 3 项。原刷新测试的 React act 提示和宿主 localStorage 实验警告保留，未扩展为完整应用验收。
- Desktop typecheck、Server build、修改生产文件定向 ESLint、`node scripts/check-boundaries.mjs` 通过。限流登记最初发现并发工作新增的实验 complete／retry 两项未登记；沿实际服务追踪确认均会发起任务后补到 task 分类，目录登记为 read，最新限流测试 40 项通过。
- `PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright node scripts/local-runtime/arena-live-list-browser.mjs`：1440／1024／768／390 均通过，覆盖关键词不逐字请求、服务端查询参数、类型／市场／状态组合、中文回显、排序、分页与每页数量、越界收敛、详情／创建返回、旧地址、无匹配／真空、失败保留记录及菜单边界。浏览器定位曾与 Field 的真实可访问名称不一致，后又在 React 更新或菜单可见前过早断言；按实际可访问名称及响应／可见状态等待修正，未放宽断言。
- `PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright ARENA_QA_OUTPUT=/tmp/arena-live-catalog-regression-qa node scripts/local-runtime/arena-live-browser.mjs`：同四宽度通过，图表、图例、净值、周期、持仓、成交、创建、返回和网页搜索保持可用。
- 浏览器脚本语法和本次文件 `git diff --check` 通过。

已查看桌面与窄屏实际组件截图。目录截图在 `/tmp/arena-live-catalog-qa/`，回归截图在 `/tmp/arena-live-catalog-regression-qa/`。受控浏览器全部业务请求为本地 GET 响应，写入、模型及外部来源调用均为零。

正式 `sync-code.sh thesis-ledger` 首次因另一项正式更新占锁而在写入前退出；持有进程是 PID 24926，其 BuildKit 子进程仍在构建，未删除锁或打断该任务。目标运行态的最终结果由 T12.3.2 持有；本地通过不能替代目标同步或整场竞技场验收。

补查历史比赛的轮次详情后，列表返回条件同时沿“列表 → 历史比赛 → 轮次 → 历史比赛 → 列表”保留，其他来源深链继续返回原来源；四宽度目录浏览器、Desktop typecheck 与该组件 ESLint 已按修改输入重验通过。最后只读检查目标容器健康，但尚不存在新目录编译模块；更新锁仍由原 PID 持有，未执行第二次同步、数据库写入或容器变更。本次受控浏览器服务已停止，代码未提交，唯一剩余交付叶为 T12.3.2 的运行同步，整体竞技场门禁保持原状态。

## 默认时间顺序与操作位置

Desktop 目录固定按创建时间倒序读取；URL 中已有排序值归入这一顺序，更新 URL 时清除该参数。页头保留新建比赛作为主操作及共享刷新图标；搜索框与搜索按钮独立一行，按钮紧邻输入框；下一行只放类型、市场、状态与清空，窄屏自然换行。没有新增 CSS、共享组件覆盖或业务数据写入，服务端既有目录合同保持兼容。

最新 `arena-catalog-navigation.test.ts` 4 项、Desktop `tsc --noEmit`、3 个修改生产文件的 ESLint 及 `git diff --check` 通过。`ARENA_LIST_QA_OUTPUT=/tmp/arena-live-toolbar-qa` 的目录浏览器验证在 1440／1024／768／390 全部通过：确认不存在排序下拉框，旧排序 URL 仍按最新创建时间返回，搜索与输入框相邻同排，新建位于搜索上方页头；组合筛选、分页、返回、失败保留及空状态继续通过。已查看桌面与窄屏截图，未重复执行输入未变的数据库／原图表检查。

该界面验证之初，运行同步尚待完成：只读检查发现锁持有者已变为 PID 54695，命令为正式 `update thesis-ledger`；当时目标容器健康但仍未发现目录编译模块。未将当时的受控接口成功当作运行问题已修复，恢复证据见下一节。

## 目录运行恢复与真实只读页面

既有正式 `update thesis-ledger` 随后释放锁并完成容器切换；复用该次更新，没有再次构建、直接修改容器或删除更新锁。目标容器 `7cd24f3afb068efb04df174bccd786fd1efdd151247830842d11bc0e06339dc8` 健康，镜像 `sha256:8066e62ea225285e281698676d3dfad77a481fa253e24fc235e8e1aa9360764f`；Worker 运行且使用同一镜像。

`node scripts/local-runtime/arena-catalog-runtime-check.mjs` 通过：目录 reader、controller 和 module 的 3 个编译产物与宿主字节指纹一致。4 次本地数据库只读查询取得现有 5 场，组合筛选得到对应 1 场，随机另一 owner 无数据或计数；未启动应用、队列、模型或行情，未写入业务数据。

目标 HTTP 验收最初按会话模式预期无凭据请求返回 401，实际返回 200；核对 IdentityGuard 与 localIdentityPrincipal 后确认目标使用已有本地身份模式，未改认证设置。随后按该现行模式验证两个真实 GET：共享合同解析成功，全部 5 场及组合筛选的 1 场一致。此结果不能替代会话模式认证验收，原隔离 HTTP 的认证／跨 owner 证明继续独立保留。

最终复验 `vitest run test/arena-catalog-navigation.test.ts test/arena-detail-refresh.ui.test.tsx` 共 13 项通过（4 项 URL、9 项原刷新），保留原 29 条 React act 提示及 1 条宿主实验警告；受控浏览器服务已停止，未提交代码。

`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright node scripts/local-runtime/arena-catalog-runtime-browser.mjs` 通过：实际 ArenaLivePage、共享 API client 和样式连接目标目录接口，在 1440／390 各执行 4 次有界 GET，读取现有 5 场、按真实标题搜索、清空和刷新，均无读取错误、页面错误及横向溢出。API 路由只允许目录 GET，其余请求即拒绝，未打开比赛详情或提交表单，业务写入／模型／来源调用均为零。已查看截图 `/tmp/arena-live-toolbar-runtime-qa/1440.png` 与 `/tmp/arena-live-toolbar-runtime-qa/390.png`。该证据覆盖本次列表与目标读取恢复，完整应用外壳、原生宿主及竞技场实时业务仍由 G02／G03／G04 持有。

## 搜索与新建同行

新建比赛移到搜索行右侧，搜索框和搜索按钮保持在左侧；标题区域保留共享刷新。通过工具栏 actions 组合原 Link，原创建地址和返回筛选状态不变，窄屏同排且无页面横向溢出。

两个生产组件的 ESLint、Desktop typecheck、脚本语法及本次文件 diff 检查通过。目录浏览器在 1440／1024／768／390 验证新建与搜索同排且居右，原搜索、筛选、分页、返回及失败状态继续通过，截图在 `/tmp/arena-live-toolbar-inline-qa/`。实际组件连接目标目录接口在 1440／390 各执行 4 次目录 GET，现有 5 场比赛的搜索与刷新正常，业务写入、外部来源及模型调用为零；已查看截图 `/tmp/arena-live-toolbar-inline-runtime-qa/1440.png` 和 `/tmp/arena-live-toolbar-inline-runtime-qa/390.png`。本次仅调整消费侧布局，复用已通过且输入未变的服务端证据，未重复部署；验证服务已停止，代码未提交。
