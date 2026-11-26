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

## 2026-11-22 G02 实际页面与断网恢复

真实页面使用当前客户端源码，通过只读代理读取目标服务现有记录。目录为 4 场自主比赛和 5 场历史日频比赛。自主详情样本取已结束的回放，读取冻结日历及服务端返回的 666 个估值点。应用外壳的账户列表和建赛页的模型列表、自选分组使用空样本。隔离场次复用已有双模型收益与成交样本，连接故障只注入本机测试环境。

### Desktop 实际页面

- 在 1440／1024／768／390 使用完整应用外壳验证目录搜索、清空、真实自主收益图、模型账户、冻结设置、历史比赛详情、新建入口和返回。详情返回保留搜索条件。四宽度均无页面横向溢出及页面错误。已查看 1440 和 390 的实际收益页截图。
- 390 初次读取长模型名时，图例撑宽了收益图的隐式网格列。显式约束列宽，并允许模型名在图例中截断后，四宽度复验通过。完整名称通过控件标题查看，排名表在自身容器内滚动。

### Mobile 实际页面

- iOS 26.5 的 iPhone 17e 模拟器通过 XCTest，Android API 37 模拟器通过 UIAutomator。两端验证底部竞技场导航、真实自主列表与收益图、模型账户、历史日频详情、新建入口和原生返回。
- 两端通过实际原生 WebView 触摸净值点值，切换近一周和图例显隐。复用原生二进制，嵌入当前工作树的 Metro JS 并核对字节，同时校验 iOS 原生代码与 Android 的 17 个原生库。Android 使用只读启动的模拟器和临时用户。
- iOS 首次自动化曾按同名标题误选另一状态的比赛，随后长页滚动手势落入图表区域。按完整状态标签定位并在图表外滚动后，通过实际页面复验。

### 隔离连接恢复

- Desktop 在 390 触摸浏览器验证延迟首读、请求断开后的错误提示与筛选保留、手动刷新成功。详情在浏览器离线后保持模型账户页签，重连重新读取取得 HTTP 200。
- iOS 列表及详情连接被切断后保留已有内容，点击“重新读取”后恢复，当前净值视图一并保留。首次断线暴露的 Expo 内部错误已归入共享中文网络提示。
- Android 列表连接中断后保留已有内容并可重读。详情在隔离模拟器开启飞行模式后显示离线提示，关闭后自动取得新的 HTTP 200，同一净值视图仍可访问。

### 本地门禁与证据

Desktop／Mobile TypeScript、修改文件 ESLint 和 `git diff --check` 通过。当前 Mobile 竞技场刷新及原生查询生命周期共 13 项定向测试通过。已有 React `act` 提示和 ESLint 解析 React Native 第三方 Flow 语法的提示仍有输出，命令均退出 0。复用原受控页面的四周期、账户、成交交互及空数据回执。

回执位于本地 `.recovery-artifacts/arena-g02-20261122/`。Desktop 为 `desktop-final.log` 和 `desktop-fixture-run2.log`，iOS 为 `ios-g02-target.xcresult` 与 `ios-g02-run2.xcresult` 中通过的断线用例，Android 为 `android-run2.log` 的实际页面回执和 `android-fixture.log`。`source-sha256.txt` 与两端包校验记录对应本轮客户端。`relay-final.json` 记录最终代理会话的 90 次目标 GET 200，含定位及复验。模型调用、业务库写入、提交、推送均为 0。G02 已完成，真实来源与目标队列恢复继续由 G03、G04 验收。

## 2026-11-22 G03 三市场规则核对

从正在运行的目标 Server 只读取得生效策略修订 202。沪股公共费选本地资料，港股股票每手股数及港美股股票／ETF 的主报价选富途。A 股主报价选同花顺。来源就绪状态表示可按原路由尝试读取，具体证券及日期覆盖由查询结果判断。

### A 股公共费用

- 原 HTTP 422 对应的本地上交所 A 股竞价主包覆盖 2023-08-23 至 2023-08-29。首次监测缺少与原包绑定的基线，而且现行收费指引引用了正文附件。重新读取 6 份登记正文及 1 份附件，逐项核验费率，登记与原包 SHA-256 绑定的基线，保留原主包、备用包及已冻结结果。[减半征收公告](https://shanxi.chinatax.gov.cn/web/detail/sx-11400-545-1780448) · [上交所收费指引](https://www.sse.com.cn/lawandrules/sselawsrules2025/charge/c/c_20250610_10781461.shtml) · [发改委监管费标准](https://www.ndrc.gov.cn/xxgk/zcfb/ghxwj/201806/t20180627_960950_ext.html) · [证券登记结算收费表](https://www.chinaclear.cn/zdjs/fbzyls/202506/9d22b74d9f2e40edb67b44d1f6596f18/files/%E4%B8%8A%E6%B5%B7%E5%B8%82%E5%9C%BA%E8%AF%81%E5%88%B8%E7%99%BB%E8%AE%B0%E7%BB%93%E7%AE%97%E4%B8%9A%E5%8A%A1%E6%94%B6%E8%B4%B9%E5%8F%8A%E4%BB%A3%E6%94%B6%E7%A8%8E%E8%B4%B9%E4%B8%80%E8%A7%88%E8%A1%A8.pdf)
- 隔离验收先发现原主、备用包的费项与口径相同，却因说明、来源引用和覆盖起点不同被判冲突。统一入口在两包都覆盖请求且费率一致时选主包，仅备份覆盖的日期继续读备份。费率差异仍拒绝。原文件和历史回执保持原字节。
- 用本轮官方资料回执通过隔离 Data API。原 `600036.SH`、2026-11-12 重现请求返回 HTTP 200，隔离覆盖投影推进至 2026-11-22。手续费项为卖出印花税 0.05%、双向经手费 0.00341%、双向证管费 0.002%、双向过户费 0.001%。随后读取 11-22 复用投影，深市样本及 11-23 返回 422。变更附件摘要后返回 422，隔离库记录 `updates_pending`，未生成覆盖投影。券商佣金和金额取整由执行设置提供。
- 修复范围为上交所 A 股竞价公共费，深交所、北交所及 ETF 继续各自按本地包的标的和日期判断。目标当前 `DAILY_PRICE_RULE` 只选有界本地资料，现有绑定支持规则描述，缺少该样本的当日精确上下限。收费覆盖的通过记录不增加实时成交资格。

### 港股交易单位与价位

- 本机现有 OpenD 通过 DSA 的富途适配器读取 `00700.HK` 为 100 股／手，观察时间为北京时间 19:58:05，包含独立来源摘要。目标修订 202 的港股股票独立每手股数路由同样选富途。旧 `00147.HK` 每手股数保持既有证据。
- 港交所最低价位第二阶段于 2026-08-03 生效。普通港元股票 code 01 以候选价格所在区间的上限和价位为依据，0.25 港元以上至 10 港元为 0.005 港元，10 港元以上至 20 港元为 0.01 港元。受控检查覆盖生效边界及最高价 9995 港元。盘口相邻价差与报价小数位均不授予价位资格。[港交所生效公告](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2026/CT10426E.pdf) · [港交所价位表](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2026/ReductionofMinimumSpreadsFAQP2_E.pdf)
- 竞技场现行股票研究报价可同时返回独立每手股数和价位参考，股数源失败保留价位表。报价币种未知仅返回市场价位表，不计算该报价的价位。用编译产物消费本轮真实静态股数回执，保留 100 股、来源摘要及休市执行未就绪。隔离样本中的报价与会话为受控输入。当前港股缺少已接入的同日交易状态和精确价格限制，也没有腾讯控股当前公开收费包。现有港股收费资料分别限于 `00147.HK` 与 `02800.HK` 的 2025-08-06 至 2025-08-11。香港 ETF 每手股数及 ETF 价位表继续独立，常规股票 code 01 不覆盖 ETF、其他币种柜台或零股撮合。

### 美股已有证据

复用 `AAPL.US` 股票和 `SPY.US` ETF 的富途目标报价、美元、交易单位和独立官方规则核验。两笔报价为 2026-11-13 收盘快照，状态 delayed。原隔离真实分钟成交、开市实时撮合及报价工具断言仍按原回执分别记录，本轮未新增市场报价请求。[美股执行证据](2026-11-14-arena-us-execution-evidence.md#引擎恢复后的最终核对)

### 验证与剩余事项

- 主仓相关定向测试合计 63 项，包括港股参考新测 21 项，Server typecheck、build、定向 ESLint、模块边界及文件尺寸门禁通过。DSA 费用、监测及来源回归 193 项通过，主备识别修复后重验受影响分组 68 项通过。官方资料完整与附件改变的隔离 Data API 2 项通过。DSA 现行关键 flake8、运行边界、Python 语法和变更文件差异检查通过。扩大 flake8 到非门禁格式规则时，监测登记文件的 E128 存量提示保留。
- 本地回执位于 `.recovery-artifacts/arena-g03-20261122/`，包含 `target-policy-readonly.json`、七份官方正文及附件回执、`cn-fees-current-isolated.json`、`cn-fees-attachment-changed.json`、`hk-00700-current-lot.json` 与 `hk-compiled-reference-isolated.json`。
- 两仓改动为源码和隔离验收成果。只读查验目标 DSA 仍无本轮基线文件，目标当前规则读取与开市实时执行继续待验。原第 1 批停止回执保留。模型调用、真实业务库写入、路由改动、提交和推送均为 0。G03 继续开放。

## 2026-11-22 G04 队列恢复与目标核对

### 隔离故障与修复

- 首次运行真实隔离 PostgreSQL／Redis 的测试确认，实时样本及日频 Worker 开轮通过，有限时历史样本入队后退出领取。补充诊断保留了回放时点和两条 `delivery_ended_before_claim` 记录，本机 SDK 桩收到 0 次请求。根因是将历史交易会话的结束时刻传给基于墙上时间的领取期限，过去的截止早于实际领取时刻。
- 修复后继续按历史会话判定研究是否可进入，按实际领取时刻计算有限时回放的截止及租约。实时研究仍按 AC16 计算。实际隔离样本以同一最终代码完成双模型研究、下单、成交和订阅唤醒。原来返回前被裁掉的有限时回放正常执行。
- 对隔离 Redis 断开连接时，两条数据库待办保留原周期 ID 和 attempt 0。本机 SDK 桩仍只有故障前的 6 个回执。关闭原消费者，建立新的 Redis 连接、BullMQ Worker 和研究运行器后，两个原周期各以 attempt 1 完成。本机 SDK 桩增至 8 个回执，再次调和保持 8 个。校验覆盖消费者重建及重复投递保护。
- 从主仓根目录以 `ARENA_WITH_REDIS=1 node scripts/test-journal-review-postgres.mjs` 运行日频调度、实时／历史运行和领取约束 9 项，退出 0，临时数据库及 Redis 均已清理。该入口会构建 Server 及其依赖。16 项研究时限、暂停、租约、出站未知用量和预算验证使用独立 `node scripts/test-ai-provider-postgres.mjs test/model-arena/live-research-postgres.integration.test.ts --testTimeout=15000`，退出 0。旧测试进程的 5 秒超时回执另存。infra 从根目录运行 `pnpm exec vitest run scripts/sync-code.test.mjs scripts/update.test.mjs`，快更、关键门禁及回退 10 项通过。

### 目标只读检查

- PostgreSQL 在 `default_transaction_read_only=on` 下返回结构 head `20261114010000_journal_period_review_snapshots`，与宿主最新迁移相同。竞技场比赛、周期、选手、周报、周报修订及 BacktestJob 表均可见。Server、backtest-worker、DSA 健康，九小时日志窗口内缺表及 Arena 队列不可用匹配均为 0。
- 主仓根目录对目标 Server、backtest-worker 各运行 `bash scripts/local-deployment.sh sync-preflight <容器> <宿主暂存目录>`，对 DSA 从其仓脚本调用同名预检，三次均退出 0。预检从目标导出兼容基线到宿主临时证据目录。Server／Worker 当前运行器散列均为 `75991b98f00e06e0fbff2bd2d5b24f5bd613ea676c749c1483ff47fc62fa50d8`，宿主修复产物为 `0a45df09dc0a7dbe9a3ee72e46a71fe7aff75207a5906e90ea9ed20f24d850b0`。目标两端仍待同步。港股股票参考编译文件与 DSA 上交所官方收费基线在各自目标中仍待部署。
- 目标库有一场运行中比赛和一个待处理周期。Server 启动会立即调和与投递；DSA 启动也会恢复持久化目录任务和规则监测。当前授权为真实业务库只读，故 `thesis-ledger-infra/scripts/sync-code.sh` 本轮只核对入口和兼容检查，部署命令待授权。回执位于 `.recovery-artifacts/arena-closeout-20261122/`，含首轮失败、隔离恢复、预算门禁和目标只读日志。真实模型调用、业务库写入、提交和推送均为 0。

## 2026-11-23 目标维护与载荷权限修复

### 当次正式快更

- 重启前以 PostgreSQL 只读事务和 Redis 只读命令核对。自主竞技场队列保留原维护归属暂停，唯一待办属于当前运行中的比赛，活跃周期、挂单均为零。BullMQ 的领取检查在暂停时阻止从等待列表获取作业。真实研究、优化、策略编写、日频竞技场均无可领取任务。后台健康检查只探测 DSA。
- 三端应用兼容预检退出 0。从相邻 `thesis-ledger-infra` 根目录执行 `./scripts/sync-code.sh all` 一次，仓库默认 Compose 配置，启用 npmmirror 的三项 registry 变量。为私有日志设置的宿主 `umask 077` 被应用构建继承。脚本完成载荷替换、执行重启、DSA 就绪，随后报告 Server 未能运行，退出 1。按正式入口的恢复分支用原镜像重建三服务，三端健康。
- 回退后 PostgreSQL／Redis 容器与结构 head 保持原身份，Server／Worker 的 `live-runtime.js` 仍为前一版本，港股股票规则编译文件与 DSA 上交所收费基线均未部署。首次启动候选随后由脚本清理，原容器标准输出已不可读。本轮把初次失败与回退健康分开记录。
- 回退后只读核对，11 张交易模拟和模型审计相关表的逐行摘要一致，113 条模型验证回执计数保持，队列仍暂停且原归属一致，唯一待办仍为 pending。真实模型派发、手动比赛、人工业务库写入、提交及推送均为 0。

### 修复与独立启动

- 实际宿主 Server 编译目录为 `0700`、入口为 `0600`，通过 root 传入后镜像中的 `thesis` 用户无法读取。回退镜像的入口分别为目录 `0755`、文件 `0644`。新增权限回归以相同掩码和受限编译输入复现读取位缺失。
- 应用准备脚本仅授予四组部署产物必要读取和遍历权限，暂存外层目录仍可保持 `0700`。在 `umask 077` 下重新生成真实载荷，核实入口 `0644` 及目录 `0755`。主仓准备接口 4 项、隔离生产配置 3 项、模块边界及文件尺寸门禁通过。
- 通过主仓 `backtest-production-compose-smoke.mjs --confirm isolated-production-smoke --sync-payload <候选目录>`，使用同一个 Server／Worker 镜像、生产运行身份、四组只读挂载和独立数据库、Redis、卷。五服务健康，回环隔离 API 返回 200，schema head 正确，107 张表存在。测试使用 DSA fixture 模式及关闭研究与优化执行的隔离配置，退出 0 并清理。目标容器身份及受保护记录无变化。
- 回执目录 `.recovery-artifacts/arena-maintenance-20261123/`，含 `sync-code-all.log`、重启前后审计、初次权限失败、修复后的测试与 `isolated-startup.log`。再次目标同步、目标规则读取、开市报价与执行仍待验收。

## 2026-11-23 修复后快更与目标复验

### 暂停归属及安全恢复

- 北京时间 01:50，目标五个容器均以退出码 0 停止，Redis 日志显示停机时保存了持久快照。为在消费者启动前读取原队列，在 infra 既有恢复入口增加 `--storage-only` 阶段，5 项定向测试和 infra `pnpm check` 通过。该阶段继续校验五个容器、镜像及挂载身份，先启动 PostgreSQL 和 Redis。
- 从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `node scripts/resume-existing-development.mjs --confirm=thesis-ledger-dev --storage-only` 退出 0。原 Redis 暂停归属与此前的只读回执一致，唯一待处理周期仍排队，运行中周期和挂单为零，11 张受保护表摘要及 113 条模型验证回执均一致，其他模型执行入口没有可领取任务。随后从同一目录以原恢复命令启动其余三个容器，退出 0。恢复后和快更前再次核对，状态一致。

### 三端同步及队列持久性

- 追加授权后，从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh all` 一次。使用默认开发 Compose 配置、宿主 `umask 022`，`COREPACK_NPM_REGISTRY`、`pnpm_config_registry`、`npm_config_registry` 均设为 `https://registry.npmmirror.com`。三端应用兼容预检退出 0。正式快更退出 0，Server、Worker、DSA 于 02:06:40 重新启动，三个应用和两个存储服务都健康。五个容器和镜像 ID 一致，快更期间 PostgreSQL／Redis 未重启。快更产物位于容器可写层。
- Server 和 Worker 分别比对 Server、domain、schemas、shared 的完整部署目录，各 7,113 个文件与宿主构建产物一致，聚合 SHA-256 均为 `245c06c6921fcddd86ad5cf7f39f6732b55083b857fdc2c4c9f769910bf8969a`。DSA 比对载荷清单中 638 个文件，与宿主源码一致，聚合 SHA-256 为 `4995b62f83d6fa2df3114b29e03ee1a7e18fddc8c5e721d9ab5fb76e5de6831e`。两端入口目录权限为 `0755`，入口文件为 `0644`，Server 和 DSA 健康入口均返回 200，三个进程均记录启动成功。
- 快更前后 11 张受保护表的行数和摘要相同，模型验证回执均为 113 条。Redis 队列仍由原持有者暂停，活跃任务为零。Redis 唯一等待任务的周期和 attempt 与 PostgreSQL 原待处理任务一一匹配，Worker 于 02:11:55 发出快更后的新心跳。消费者领取与去重继续引用前节真实隔离 Redis 证据，本次目标现场保留同一待办和暂停。

### 目标规则

- 从目标 Server 加载实际 DSA 读取器，在维持生效策略修订 202 的情况下，按现行本地资料路由读取 `600036.SH`。2026-11-12 至 2026-11-23 请求成功，响应费段覆盖至 11-24 前，返回卖出印花税 0.05%、双向经手费 0.00341%、双向证管费 0.002%、双向过户费 0.001%。适用范围为上交所 A 股竞价公共费。同期券商佣金、其他市场覆盖、盘中执行价格限制各依自己的资料或配置。
- 目标富途独立静态资料返回 `00700.HK` 每手 100 股。目标 Server 的港股规则读取器返回 2026-08-03 生效的普通港元股票 code 01 价位表。用 15 港元测试价核对步长为 0.01 港元。每手股数的来源指纹和生效日期保存在回执中。
- 目标交易日历在 02:09 核对三市场处于休市，下一次开放为北京时间 11-23 沪港 09:30、美股 22:30。该时点只验收日历和规则，盘中行情与执行资格单独记录。

完整回执位于 `.recovery-artifacts/arena-maintenance-20261123/retry/`，包含两次恢复输出、三端预检、`sync-code-all.log`、产物摘要、容器身份、原队列核对、规则和实际会话日历。真实模型调用、手动触发比赛、人工业务库写入、提交、推送均为零。启动、心跳和规则读取使用已授权的正常系统维护。

## 2026-11-23 G03 盘中报价与执行资格

### 起始核对和读取边界

- 北京时间 03:07，只读核对原 Redis 暂停归属和唯一待处理周期，11 张受保护表的行数与逐行摘要、113 条模型验证回执与前次一致。Server、Worker 和 DSA 沿用 02:06:40 的启动身份，三端载荷文件数与聚合摘要均与前节一致。
- 当前有效策略修订为 202。招商银行 `600036.SH` 的股票主报价为同花顺 `a-share-prices-snapshot`，腾讯 `00700.HK`、苹果 `AAPL.US` 和标普 ETF `SPY.US` 的主报价为富途。读取沿用现有路由顺序，并核对前后路由一致。
- 目标实际交易日历返回沪港下一会话于北京时间 09:30 开始，美股于 22:30 开始。本次选择会话开始 90 秒后读取，执行前仍由 `MarketSessionReader` 确认实际开放。休市检查返回 `waiting_for_market`，证券报价读取数为零。
- 在目标 Server 的现有编译环境加载 `readLiveResearchQuote` 与 `MarketLiveExecutionReader`。报价读取复用 DSA 的现行 GET、正式解析器、控制代次和会话投影，不加载 Nest 应用、Prisma 或模型运行器。执行资格读取复用实际能力组合与规则读取器。样本回执保存来源时刻、新鲜度、当前会话归属、币种、交易单位、价位与执行拒绝原因。请求不创建比赛或委托。
- 本次回执目录为 `.recovery-artifacts/arena-g03-open-20261123/`。宿主 `node wait-open.mjs` 进程 PID 为 `53429`，按目标日历等待沪港与美股两个时点，等待期间只使用宿主计时器。每个阶段保存容器身份、前后只读状态与独立样本回执。完成回执以独占文件保留，重入优先读取已有结果。

### 沪港盘中结果

- 运行目录为主仓根目录，等待入口 `node .recovery-artifacts/arena-g03-open-20261123/wait-open.mjs`。09:31:30 阶段开始，先以只读命令核对五个目标容器仍沿用原容器、镜像和启动时点，再从目标 `/app/apps/server` 通过 stdin 加载本次读取器，分别执行 `node --input-type=module - open CN` 和 `open HK`，两次退出 0。09:31:38 阶段结束，记录于 `CN-HK-done.json`。

| 标的 | 实际来源和报价 | 来源时刻与读取时刻（北京时间） | 会话与资格 |
| --- | --- | --- | --- |
| `600036.SH` | 同花顺 `a-share-prices-snapshot`，43.56 元 | 来源 09:31:29，读取 09:31:32.470，相差 3.470 秒 | `live`、当前交易会话、CNY，执行 `execution_rules_unavailable` |
| `00700.HK` | 富途，336.4，报价币种未返回 | 来源 09:31:35，读取 09:31:36.768，相差 1.768 秒 | `live`、当前交易会话，执行 `execution_evidence_unavailable` |

- 沪股独立当日交易状态返回 `included`，但 2026-11-23 为 `unknown` 且覆盖不完整；`DAILY_PRICE_RULE` 返回 `unavailable`。证券身份接口返回每手 100 股、价位 0.01 元，整体 `executionRules` 为不可用，原因为缺少请求区间的价格限制、法定收费与结算规则事实。源码核对该路径使用 `identityOnly`，其静态身份结果仅提供单位，未将已通过的独立公共费用拼装成完整执行规则。因此本次同时记录当日状态／限价缺口与执行合同未就绪，上交所公共费用的通过记录继续有效。
- 港股报价没有 `units.priceCurrency`。现行富途报价适配器只对 US 分支附加币种和执行事实，港股每手股数仍由独立静态资料返回 100 股。报价所在档位的 `incrementAtQuote` 因币种缺失为 `null`，沿用此前已核对的普通港元股票价位表。
- 港股执行身份接口返回 HTTP 422、`unsupported_capability`；当日状态组合出现 `ZodError`。对照当前有效政策与组合合同，港股 `DAILY_TRADING_STATUS`、`DAILY_PRICE_RULE` 尚无已启用路由，组合在数据请求前被拒绝。腾讯样本适用的当前费用与完整结算／执行规则仍缺。现有每手股数与市场价位参考各保留其可用范围。
- 两例读取前后路由修订均为 202、目标及顺序一致，未使用后备报价。原队列继续由原持有者暂停，活跃任务为零，唯一等待任务保留。11 张受保护表的摘要、行数和 113 条模型验证回执与本次开始时一致。本阶段验证出两例报价可读及执行拒绝原因，G03 的完整执行资格仍未通过。

### 美股盘中结果

北京时间 12:50 及 13:19 只读核对，原等待进程 `53429` 已退出，未发现同目录等待进程。原目录没有 `US-receipt.json`、`US-done.json`、`US-failed.json` 或 `US-raw.log`。原沪港完成回执保留。本轮新增真实证券请求为零，US 的盘中读取仍待其实际会话开放后继续，续接只处理 US。

### 沪港执行输入根因修复与隔离验证

#### 根因

- 沪股 `identityOnly` 请求实际只取得单位，`tradable=false` 还表示身份不授予历史可交易性。旧实时读取器先要求该结果带全套执行制度，未到独立状态判断便报告 `execution_rules_unavailable`。它还把同一身份的 `tradable=false` 用作当前停牌判断，并直接消费身份内的费率。当前已通过的独立公共费用没有参与这条路径。
- 港股复用了该回测身份及日状态组合路径。腾讯当前执行身份未覆盖，返回 422；生效政策没有启用港股两项日状态能力，组合校验报 `ZodError`。因此外层只显示 `execution_evidence_unavailable`。
- 富途快照已返回停牌、证券状态和每手股数，适配器原本只为 US 投影这些字段。快照及静态接口本身没有通用币种字段，仓内已登记的腾讯富途／Yahoo 交叉身份观察含 HKD，可复用到同一证券、股票类型、交易所与可见时点。其他柜台依其自身观察处理。[快照字段](https://openapi.futunn.com/futu-api-doc/quote/get-market-snapshot.html) · [静态字段](https://openapi.futunn.com/futu-api-doc/quote/get-static-info.html)

#### 源码修复

- DSA 将同次港股快照的现有状态、证券 ID、每手股数及来源时钟投影为当前观察。腾讯币种复用 `futu-research-identities.json` 及现有验证器，保留市场、资产、交易所和时间关联；读取次数仍为原单标静态资料与快照各一次。HK 报价绑定修订推进到 v2，US 保持原 v2。US 官方规则检查仅由 US 观察触发。
- Python 和 TS 共享报价观察合同支持 HK／US，并校验代码后缀与市场。原报价没有观察字段时仍可解析。普通报价、部分字段和休市显示沿用各自合同。
- Server 将当前执行读取按市场分派。港股消费同次快照与既有普通港元股票价位表，跳过错误的回测身份及未启用的港股日状态组合。费用、价格限制和两类结算分别报告。沪股保留当前身份单位及独立日状态，按已启用路由单独读取本次公共费用。身份中的研究资格不参与当前停牌判断，已有完整结算片段仍按原合同及日期校验。
- 多个可独立判断的输入同时返回诊断。单纯身份未取得全套制度时，已核验公共费用仍标为可用；当日状态、价格及结算各保存自己的缺口。费用计算消费本次独立费项，旧身份费率不能覆盖新费率，路由修订变化会使本次输入失效。

本次主仓业务写集为 `market-live-execution-reader.ts`、按市场提取的 `market-cn-live-execution.ts` 与 `market-hk-live-execution.ts`、当前输入读取 `market-live-rule-inputs.ts`、共享报价校验及港股价位参考、`market-quote-execution-facts.ts` 和相关回归。DSA 写集为 `futu_market.py`、`futu_quote_execution.py`、`futu_research_identity.py`、富途来源绑定、当前观察 Pydantic 合同及定向测试。Spec 与 DSA 富途设计同步更新，保留同文件既有其他修改。

#### 验证结果

- DSA 根目录运行 `.venv/bin/python -m pytest -q tests/test_futu_quote_execution.py tests/test_futu_research_identity.py tests/test_futu_market.py tests/test_thesis_ledger_futu_quote_capability_path.py tests/test_futu_quote_consumer.py tests/test_us_live_execution_rules.py`，132 项通过。新增港股成对回归在修复前因币种和当前观察缺失失败，修复后通过；覆盖已登记及未登记证券、资产／交易所不符、观察不可见、未知状态及港美身份交叉。
- 主仓以 `ARENA_G03_DSA_ROOT=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis pnpm --filter @thesis-ledger/server exec vitest run` 执行 `current-execution-offline`、`live-execution-reader`、`hk-live-execution`、`hk-stock-order-reference`、`us-live-execution`、`live-research-quote` 六个分组，58 项通过。隔离组使用原报价数值与来源时点构造受控 SDK 输入，经正式注册器、Data ASGI HTTP、TS Schema 和实际研究入口。停牌及静态字段为受控输入，保留实际来源回执的边界。审计拦截器记录外部网络及数据库连接尝试均为零。
- 隔离腾讯结果包含 HKD、正常状态、每手 100 股和 336.4 港元对应的 0.2 港元价位，当前费用及结算仍为明确的未支持字段。沪股回归同时保留当日状态、价格及结算缺口和已取得费用。隔离链路最初因 SDK／HTTP 时钟未统一及未经过注册器缺少来源字段而失败，调整验证入口后通过，原 09:31 实源失败回执保留。
- 共享包的 `quote-partial-fields`、`market-quote-identity`、`quote-dsa-http-contract` 三组共 24 项通过。Schemas 构建、Server／API client 类型检查、Server 构建均退出 0。定向 ESLint 及复杂度／函数尺寸检查零告警，模块边界、文件尺寸门禁、DSA 507 个运行文件边界与语法、定向 flake8 及变更 Python 编译通过。pnpm 沿用 npmmirror 三项 registry 设置。

#### 当前限制与目标状态

- `600036.SH` 的当前交易状态仍为未知，现有本地价格资料未提供本日精确限价，当前生产身份路径没有可用的持仓及现金结算片段。上交所公共收费通过记录继续有效。
- `00700.HK` 的币种及同次状态在源码隔离中可用，普通港元股票价位参考可计算。当前腾讯公开收费、适用价格限制／无限制事实、持仓及现金结算尚无可用的执行输入。适用价格条件可以使用覆盖对应范围的 `unlimited` 事实。其他币种柜台、未登记证券及 ETF 的币种、价位仍按各自资料处理。
- 当前授权为源码修复与隔离验证。目标 Server、Worker、DSA 继续沿用 02:06:40 的启动身份。13:21 只读核对，目标 Server 实时读取器 SHA-256 为 `736cbb204c40fde469d229c6386aed88087e1f664044b263f284e070cddc79bf`，宿主新产物为 `4bdb32c4536c0f1c4955b465e96c873cedd8743ef1531b2dd0a26831ce6637ce`，新代码尚未同步。G04 早间部署记录有效，新修复的目标消费继续由 G03 持有。
- 11 张受保护表摘要和 113 条模型验证回执与本次开始一致，队列仍由原持有者暂停，活跃任务零、唯一等待任务保留。本轮重启、真实模型调用、真实证券请求、手动触发比赛、人工业务库写入、提交及推送均为零。

完整本地回执位于 `.recovery-artifacts/arena-g03-repair-20261123/`，含三组测试、构建、类型检查、目标只读核对及 US 等待检查。该叶的源码与隔离验收通过，G03 总体继续保留未完成。

## 2026-11-23 沪港修复同步与目标复验

### 维护前保护与正式同步

- 本次用户授权一次目标维护重启和正常维护写入。13:41 以 PostgreSQL 只读事务及 Redis 只读命令确认原队列仍由原持有者暂停，活跃任务为零、唯一待办保留。研究、优化、策略编写、连续提交、历史日频竞技场及其他 Worker 均没有可领取任务。对照启动入口，Provider 只刷新注册信息，实时竞技场的队列领取受原暂停保护。
- 从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh all` 一次，使用默认开发 Compose 配置、宿主 `umask 022`，`COREPACK_NPM_REGISTRY`、`pnpm_config_registry`、`npm_config_registry` 均为 `https://registry.npmmirror.com`。正式兼容预检通过，脚本退出 0。Server、Worker、DSA 于 13:43 重新启动并健康；原五个容器、镜像 ID 一致，PostgreSQL 和 Redis 在此次快更期间没有重启。
- Server 和 Worker 各 7,128 个部署文件与宿主一致，聚合 SHA-256 均为 `4a9b0c47624be961b70ba39098a0fb660d776208774ebfdc1056fbfce639f20c`。DSA 的 638 个载荷文件与宿主源码一致，聚合 SHA-256 为 `8b0af9d14a524c855efd6ca8acfd13fc7528ba609199cc3ac673cf643128cc7f`。快更位于容器可写层。
- Server 和 DSA 健康接口返回 200，Worker 有本次启动后的新心跳。启动 stdout／stderr 的缺表、模块缺失、权限及未处理异常检查均为零。维护前、同步后及新字段读取后的 11 张受保护表行数和摘要一致，模型验证回执均为 113 条，原队列归属和待办均保留。

### 沪港新字段与诊断

执行目录为主仓根目录，在目标 Server 已同步的编译环境通过只读脚本分别读取 CN 和 HK 各一次。脚本使用正式报价解析器及控制代次，调用实际 `readLiveResearchQuote` 与 `MarketLiveExecutionReader`，注入的端口只代理 DSA 读取并记录回执。整个读取不加载 Prisma 或模型运行器。

| 标的 | 目标新响应 | 当前输入与资格 |
| --- | --- | --- |
| `600036.SH` | 13:45:01 的同花顺 `a-share-prices-snapshot` 报价 43.31 元，13:45:02.846 读取，`live`、CNY、当前会话 | `HISTORICAL_PUBLIC_FEES` 可用；当日状态覆盖不足、精确价格规则不可用、持仓及现金结算未支持；整体 `execution_rules_unavailable` |
| `00700.HK` | 13:44:50 的富途报价 342.4 港元，13:45:04.617 读取，`live`、HKD、当前会话；正常状态、每手 100 股 | 当前状态、每手股数及 0.2 港元价位可用；当前腾讯费用覆盖不足，适用价格限制／无限制事实和两类结算未支持；整体 `execution_rules_unavailable` |

- 两例读取前后的有效策略均为修订 202，路由目标与顺序一致。腾讯本次返回真实证券 ID、HK 主板、未退市、来源时刻及响应摘要，当前股数与独立每手股数路由均为 100 股。港股未进入回测身份及日状态组合，旧的 422 身份错误和 `ZodError` 不再出现。费用的 422 为单独的 `insufficient-coverage` 诊断。
- 目标断言逐项核对新字段和同时返回的缺口，退出 0。沪股原始身份结果的整体制度缺失说明继续作为来源原文保留，当前独立费用按实际结果标为可用。现有价格和规则范围保持来源实际支持的边界。
- 复用午间 132／58／24 项测试及构建、类型、Lint 与边界证据。本次业务源码没有继续变化，正式部署入口按既有合同重建并传输载荷。

### 仅美股等待恢复

- 恢复前核对原等待进程 `53429` 已退出，没有同入口等待进程，也没有任何 US 原始日志、回执或完成标记。原沪港回执保留，新的沪港目标回执保存于本次部署目录。
- 从主仓根目录启动 `node .recovery-artifacts/arena-g03-open-20261123/wait-us.mjs`。新进程 PID 为 `39321`，13:50 核对仍在运行，只含 US 一个阶段，复用本次同步后的读取器、容器身份及有效路由。目标日历显示 US 22:30 开始会话，读取时点为北京时间 22:31:30，执行前仍核对实际开放状态。
- 原目录的 `us-monitor.json` 记录进程、读取器摘要及部署关联。US 真正读取前以独占文件登记 `US-reading-intent.json`，随后各读取 AAPL／SPY 一次，不自动重试。已有读取意图、原始日志或回执时先核对证据。13:50 的美股请求数为零。

本次完整回执位于 `.recovery-artifacts/arena-g03-deployment-20261123/`，含正式快更日志、三端产物比对、重启前后只读审计、真实沪港新响应和 US 恢复记录。维护重启执行一次，真实模型调用、手动触发比赛、人工业务库写入、提交及推送均为零。沪港新字段与诊断的目标验收通过，完整来源规则及 US 盘中门禁继续由 G03 持有。

### 美股停止等待与当前报价

- 北京时间 15:33，用户改为停止等待并读取当前美股价格。核对进程命令确为本任务 `wait-us.mjs` 后，对宿主等待进程 `39321` 发送 SIGTERM，确认已退出。当时 US 读取意图、原始日志及回执均未生成。
- 从主仓根目录，在同一目标 Server 编译环境执行一次 `node --input-type=module - prices US`，沿用修订 202 的富途主报价，各读取 AAPL／SPY 一次，退出 0。该阶段只读取价格及会话投影，没有运行执行资格读取器。读取前后路由及顺序一致。

| 标的 | 当前可取得价格 | 来源时刻 | 读取结果 |
| --- | --- | --- | --- |
| `AAPL.US` | 342.56 美元 | 美东 2026-11-20 16:00，即北京时间 11-21 05:00 | 富途，`closed_snapshot`、`delayed`，15:34:11.322 读取 |
| `SPY.US` | 689.81 美元 | 美东 2026-11-20 16:00，即北京时间 11-21 05:00 | 富途，`closed_snapshot`、`delayed`，15:34:11.867 读取 |

当时目标日历显示 US 休市。当前价格读取已完成，盘中报价及执行资格仍无验收回执。等待进程已停止，本次两个证券请求各一次，没有自动重试。11 张受保护表及 113 条模型验证回执一致，原队列仍由原持有者暂停。当前阶段重启、真实模型调用、比赛触发、人工业务库写入、提交及推送均为零。

回执位于本次部署目录的 `US-wait-stopped.json`、`US-price-now-intent.json`、`US-price-now-raw.log`、`US-price-now-receipt.json` 及 `us-current-price-check.json`，原等待和沪港回执继续保留。

### 美股现行规则缺失的后续核对

- 15:39 至 15:43 从主仓根目录，使用目标 Server 的 `MarketRuleMonitorReader` 和 `DsaClient` 读取已有状态、历史、版本及已保存正文差异。两份只读脚本通过 `docker exec -i -w /app/apps/server thesis-ledger-dev-thesis-ledger-1 node --input-type=module -` 执行，均退出 0。请求限于规则监测 GET，没有调用检查创建接口，没有新增行情请求或上游文档抓取。
- 15:34 的报价读取已按现有按需机制登记当日资料检查 `194c534f-8dab-58cb-8193-734f741c24be`，15:34:28 完成。六份资料全部可读，`changed=0`、`unavailable=0`，仅执行一次。历史中的 `trigger=manual` 是现行按需任务的分类，本次没有人工提交新的检查。检查成功只表示资料抓取完成；`changed=0` 表示相对上一条观察没有变化。
- 按已部署的 `us_live_rules_refresh.py` 及登记的正文替代地址核对，六项资料均在该批次内完成观察，其中五项内容摘要与已核验基线一致。TAF 通知的 GovInfo 正文仍与独立登记基线一致。唯一不符的是 FINRA 当前修订目录，已核验摘要为 `65fdf1d3931862ddf43c34164586b68c02530dec35df43bb57b06c0e9f8b1abe`，当前为 `e4051a90a7d6f4582f1cd370307cbffc4833d5c1e21be8122ab5e805be6d578f`。因此即使当日抓取成功，当前逻辑仍不能发布新的 `verifiedThrough`。
- 已保存的目录正文差异可读，共新增 41 行、移除 34 行。新增条目为 `SR-FINRA-2026-025`、`026`、`027`，标题涉及扩展交易时段下的熔断恢复、夜间成交报告和夜盘保护带相关错误成交规则。正文、适用时段及生效范围尚未核对，目录标题不足以认定其对当前现金证券常规时段执行无影响。这是现行规则的待复核项，原价格读取仍为成功；当前两笔报价取得时检查也尚未完成，不能仅凭报价未附规则推断它已经消费了新的检查结果。
- 后续按三个新增条目的实际影响复核当前美股规则范围，再做对应隔离验证；沪港剩余状态、精确限价、适用费用及结算仍按本节前述来源缺口处理。用户停止的开市等待保持停止，盘中执行资格没有新增验收结果。源码和目标业务代码本轮均未修改，不新增重启、模型调用、比赛触发或人工业务库写入。

本轮材料保存于本次部署目录的 `US-rule-status.json`、`US-rule-versions.json` 和 `us-rule-baseline-check.json`。离线逐项核对退出 0，确认六份资料中只有上述一个基线差异。G03 与 T06.2 继续保留未完成。

## 2026-11-23 采样研究政策本地整改

T06.2a0～T06.2c 已完成源码及零模型隔离验证。当前状态、沪港美股票／ETF 成功路径、估值与日历用途拆分、公司行动默认以及策略／基准边界逐项证据见[专门回执](2026-11-23-arena-sampled-policy-local.md)。原严格失败及目标消费事实保持；本批没有目标同步，T06.2d、G03 总体、真实模型准入、完整追平及远端 CI 保持独立状态。

## 2026-11-23 深市 ETF 状态补齐

已启用富途实际读取 159915.SZ 返回未停牌及 NORMAL，来源价格时刻为当日 15:00；源码复用其状态快照并保持同花顺报价路由。106 项 DSA、15 项 Server／跨语言隔离检查通过，源配置保持，未调用模型或同步目标。详见[专门验收](2026-11-23-arena-sz-etf-state.md)。T06.2a0-SZ 完成，T06.2d 仍持有目标同步／消费。

## 2026-11-23 采样政策与深市补充的目标收敛

经用户授权完成正式 `sync-code.sh all`；目标读取暴露动态策略投影时间导致的 409，定向修复及 `sync-code.sh dsa` 完成。沪深港相关目标消费、目标编译版本零模型内存闭环、三端产物与业务／来源保护对账通过。原维护暂停及待处理周期保持，未操作真实比赛。[完整验收、失败事实与边界](2026-11-23-arena-sampled-deployment.md)。
