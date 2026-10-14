# 行情图表周期聚合实施任务

> 2026-10-06 最终结论：T1～T6、G1、P1、R1 全部完成，AC1–AC11 通过，任务正文归档。当前生产构建重采 40 次 500 点周期切换，无 ≥50ms 长任务，第二帧 25.2–52.2ms；真实四周期窗口请求均为 200。当前输入、分层验证及证据边界见[R1 最终 Review](../../tasks/evidence/2026-10-06-market-period-r1-final-review.md)和[原始采样](../../tasks/evidence/2026-10-06-market-period-r1-runtime-samples.json)。下列早期检查点保留其当时边界，当前结论以 R1 为准。

## 历史检查点

> 2026-10-06 P1 性能验收：生产构建的 500 点图表完成 40 次四周期切换，MACD/RSI 副图各 20 次，未观察到 50ms 及以上主线程长任务；第二帧时间 26.8–91.5ms。实际生产页面四次切换均只读取对应周期详情窗口，能力元数据不含行情点，没有全量日线客户端聚合请求。P1 已关闭，R1 继续开放。见[P1 性能证据](../../tasks/evidence/2026-10-06-market-period-p1-performance.md)与[原始采样](../../tasks/evidence/2026-10-06-market-period-p1-samples.json)。

> 2026-10-06 G1 浏览器验收：真实目标 Server/DSA 与当前 Desktop 开发页面通过四周期请求、读数、右轴、涨跌幅、拖动/分页、年度指标空值、基金与跨标的偏好检查；陈旧/空响应采用标签页内受控注入并单独标记。验收修复了空数组分段处理、共享周期偏好及无图表时的回退提示，SDK 75 项、Desktop 112 项回归和相关工程检查通过。G1 已关闭，P1/R1 继续开放；不代表 Electron 安装包或镜像发布。见[G1 验收证据](../../tasks/evidence/2026-10-06-market-period-g1-browser-acceptance.md)。

> 2026-10-05 T6 工程收尾：Schema 676、Domain 386、SDK 72、Server 784、Desktop 108、DSA 62 项通过；Server 另有 27 项条件跳过，不计为通过。相关构建/类型、全工作区分组 lint、边界/依赖图、尺寸 ratchet、结构打包输入与 diff 门禁通过，跨仓共享夹具和当前生成结果逐字节一致。T6 已关闭，G1/P1/R1 继续开放。见[T6 工程门禁证据](../../tasks/evidence/2026-10-05-market-period-t6-engineering-gates.md)。

> 2026-10-05 T5 本地收尾：T5.2 的周期能力窗口与提示标的隔离已修正，108 项行情详情回归、Desktop 类型/build、定向 lint 和工程门禁通过；T5.1/T5.2 共同满足父 T5 的本地完成条件。T6、G1、P1、R1 保持未勾选，完整浏览器与性能不由本地通过代替。见[T5.2 收尾证据](../../tasks/evidence/2026-10-05-market-period-t52-local-completion.md)。

> 2026-10-05 部署检查点：目标保数据升级与官方更新已完成，新详情/周期能力已部署，独立能力与 1d/1w 两点详情 Schema、非法参数 400 检查通过。完整真实来源窗口、显示/计算指纹矩阵与缓存故障仍归 T3.2b2.2/T3.3c/T3.2c3，保持未勾选。下方交付时点的“未部署”记录为历史边界，当前基线见[部署证据](../../tasks/evidence/2026-10-05-target-preserve-upgrade-baseline.md)。

> 状态对账（2026-10-04）：T1.1～T1.3、T2 与 DSA 计算叶 T4 已完成；T1.2 拒绝路径及 T1.3/T4 受控计算通过目标验证。公开 Bar/RouteTarget 原始周期仍为 1m/1d；T3、T5～T6、G1/P1/R1 继续开放。收益走势 interval 与价格口径不是此任务周期。历史对账见[2026-10-03 Review](../reviews/2026-10-03-task-state-reconciliation.md)，局部交付见[并行证据](../../tasks/evidence/2026-10-04-market-period-parallel.md)与[跨仓计算证据](../../tasks/evidence/2026-10-04-market-period-indicator-contract.md)。

对应 Spec：[当前 Spec](../../specs/2026-09-16-market-chart-period-aggregation.md)

> 任务标识：`market-chart-period-aggregation`
> 状态：T1～T6、G1 与 P1 已满足各自完成条件；最终一致性 Review R1 待执行。
> 范围说明：本文件只覆盖 `5d / 1w / 1mo / 1y` 派生周期的契约、聚合、窗口、指标与 Desktop 交互；分钟线另行立项。

## 执行约束

- 保留当前工作树全部未提交修改；不提交、不推送、不清理、不重置、不格式化整个仓库。改 Desktop 重叠文件前先读当前文件与 diff，只做局部增量。
- 以下为立项时环境记录；2026-10-04 已确认 `pnpm`、`rtk` 在 PATH，本 worktree 用冻结锁文件安装独立依赖，不共用父对话构建目录。历史二进制入口：
  - Desktop typecheck：`cd apps/desktop && ../../node_modules/.bin/tsc -p tsconfig.json --noEmit`
  - 定向测试：`cd apps/desktop && ../../node_modules/.bin/vitest run src/features/market-detail`
  - ESLint：仓库根 `./node_modules/.bin/eslint <paths>`
- `tsc`、`eslint`、全量 `vitest` 一律后台执行（前台会被 SIGTERM 杀掉，exit 137）；Desktop 全量套件约 9 分钟，`test/date-display-contract`、`test/drawer-layout-contract`、`test/sticky-table-actions.contract`、`test/ui-contract` 需 `--testTimeout=120000` 才不误报超时。
- 验证按「定向测试 → 包级检查 → 仓库门禁 → 目标运行态 → 浏览器」推进，低层级失败时不提前跑高成本门禁。
- 跨仓顺序：T1 冻结契约后，T2/T3 在主仓、T4 在 DSA；DSA 只做既有计算层的 additive 适配与直接测试，不复制主仓实现。
- 不得为了加快验证而放宽数据口径、跳过 calendar fact 检查或伪造周期 bar。

## 实施前基线

- 2026-09-16 只读盘点：`packages/schemas/src/market.ts:79/134/160`、`market-bar-series-v2.ts:8` 的 `timeframe` 只有 `1m | 1d`；`market-v2.controller.ts:232-243` 的 `detail()` 无 `timeframe` 参数，`:286` 写死 `timeframe: '1d'`；独立 bars/indicator 路由已有 `query.timeframe ?? '1d'`。
- `market-bar-reader.ts:345` 只读 `routeStatus.DAILY_BAR`；`market-detail.service.ts:64-67` 把 bars 与 MA/MACD/RSI 绑定在 `DAILY_BAR`。
- DSA 能力声明仍为 `bars.timeframes = ['1d']`、`indicators.timeframes = ['1d']`（`services/dsa-adapter/src/index.ts:8-13`，`test/capability.test.ts` 快照锁定）。
- 指标端点已是「给定 points 的纯计算」（`market-bar-series-v2.ts:111-137`、`market-v2.controller.ts:172-198`），指标缓存键含 `inputFingerprint`，周期不同天然隔离。
- 派生先例与命名法：`backtest-bar-aggregation.service.ts:20-46` 的 `kind: 'derived'` + `provider: 'thesis-ledger-server'` + `providerRevision` + calendar fact 缺失即降级；`packages/schemas/src/backtest-data.ts:10` 的 `dataTimeframeKindSchema = z.enum(['base','derived'])`。
- 图表侧页内可比语义已冻结：Desktop 以「页 = 一次详情响应」构建 ChartPoint 并按日期合并（`market-chart-model.ts::mergeChartPoints`、`market-chart-types.ts::chartPageFromResponse`）。
- 已知既有缺陷（不属本任务，但会经过同一路径）：`/api/v2/market/:symbol/detail` 未接收客户端发送的 `calculationAnchor`（`market-v2.controller.ts:232-243`），且 `loadEarlier` 传的是上一页序列末尾日期。若 T3/T5 验证发现它影响预热正确性，先单独修复并留证，不在本任务内夹带。

## 任务

### T1：冻结周期契约、派生标识与规则版本（任务组，完整条件由 T1.1–T1.3 共同承担）

- 覆盖验收标准：AC1、AC2、AC3、AC4
- 依赖：无
- 涉及范围：`packages/schemas/src/market.ts`、`market-bar-series-v2.ts`、`packages/api-client/`、DSA 侧 Contract/capability 声明与直接测试；Desktop 只同步类型消费。
- 不包含：聚合算法实现、Server 窗口逻辑、Desktop UI、分钟线。
- 完成条件：`timeframe` 枚举扩展为 `1m | 1d | 5d | 1w | 1mo | 1y`；新增基础/派生标识（沿用 `base | derived` 命名）；`/detail` 接受 `timeframe` 且默认 `1d`；派生序列的 provenance 字段（provider、规则版本、基础来源引用）命名冻结；未声明周期返回结构化错误而不是回退；旧客户端不传 `timeframe` 的响应与错误语义不变。
- 完成状态契约：冻结显式 `evaluationAsOf`、计划 Session 推导的 `bucketEndAt`、`5d` 锚点及覆盖证据；未结束周期不标 `complete`，未解释缺失不当作停牌；冻结 `availableAt` 与评估时刻的关系。
- 验证方式：Schema 契约测试、API Client 契约测试、DSA Contract 测试、跨仓 payload fixture；记录主仓与 DSA HEAD。
- 停止条件：若 `base | derived` 标识无法在不破坏既有 BarSeries V2 消费者的前提下加入，保留 T1 未勾选并记录兼容矩阵后请示，不得用「周期名映射到假 provider」绕过。

- [x] T1.1：冻结公共聚合输入、派生展示与规则版本合同
  - 覆盖断言：AC1 的时间/覆盖规则、AC2 的来源命名、AC3 的旧来源合同兼容；不证明 HTTP 或跨仓消费。
  - 依赖：无；当前源码与主仓行情链一致。
  - 写入范围：行情周期专属 Schema/Domain 类型与测试、两个包的最小导出及本主题 Spec/Task；不修改旧来源合同、Journal 或 Provider 协议。
  - 完成条件：全周期枚举、独立派生展示合同、规则版本、评估时刻、计划 Session/覆盖证据、5 日锚点及来源引用可校验；旧 BarSeries 与来源 Route/Data 合同不回归。
  - 验证：Schema 定向测试、受影响包 build/typecheck、边界检查。
  - 停止点：契约与验证通过后记录就绪里程碑；不能扩展到 API/DSA。
  - 执行记录：2026-10-04 公共 Schema/Domain 类型就绪。Schema 定向 4 文件 34 项通过，包含旧 BarSeries/Chart/Data 来源协议回归；shared/domain/schemas build、domain/schemas typecheck 与 import boundaries 通过。独立派生合同未改变现行来源身份或 HTTP 默认行为；API/DSA 仍由 T1.2/T1.3 承担。

- [x] T1.2：API 请求/响应消费与结构化周期降级
  - 覆盖断言：AC3、AC2 的公开展示合同；承接 T1 原有 `/detail` 默认 `1d`、枚举扩展和未声明周期返回结构化状态的全部义务。
  - 依赖：T1.1；仅原生来源路由仍保持 1m/1d。
  - 写入范围：当前 `market.controller.ts` 的相邻 period helper、API Client 周期传输合同及定向测试；共享响应接入由集成责任人串行维护。
  - 完成条件：bars/indicators/detail 消费展示周期，默认日线；基金拒绝派生，未声明周期不静默回退；旧请求响应不回归。
  - 验证：HTTP 定向测试、API Client 传输测试、Schema/Server/API Client 包级检查。
  - 执行记录：2026-10-04 三端点周期传输及 400/422/503 稳定错误完成；请求 helper 和 SDK 模块已提取。初始定向 32 项通过，最终 SDK 传输/旧调用 20 项通过，Schema 全包 619、API Client 全包 68、Server 行情特性 614 项通过（27 项默认条件跳过）；类型、build、lint、边界与尺寸 ratchet 通过。官方快更后目标 HTTP/SDK 21 项只读拒绝路径通过，既有 Journal 与受保护 Ledger 保持一致。派生成功序列仍由 T3/T4 接通，完整 T1 仍等待 T1.3。

- [x] T1.3：DSA 周期指标合同与跨仓 payload 验证
  - 覆盖断言：AC4；承接 T1 的 DSA Contract/capability、跨仓 fixture 与版本记录义务。
  - 依赖：T1.1；DSA 独立可写工作区和指定责任人。
  - 写入范围：DSA 指标周期输入与 capability；来源 bars 仍只声明原生周期，不在 DSA 聚合。
  - 完成条件：周期指标输入/预热/上限声明一致，主仓与 DSA 共用 payload 通过双方直接测试，记录双方 HEAD。
  - 验证：双方合同测试、DSA Python 编译/定向 pytest；不要求收费来源。
  - 执行记录：2026-10-04 父对话在实际 DSA 原仓串行完成。独立派生指纹/能力合同、两仓共享夹具与旧协议兼容通过；主仓定向 35 项、Schema 全包 635 项、DSA 四文件 58 项、API Client 68 项及类型/编译/工程门禁通过。官方快更后目标 10 项受控 HTTP 检查与 Journal 保护复验通过。双方 HEAD、夹具摘要和验证边界见[跨仓证据](../../tasks/evidence/2026-10-04-market-period-indicator-contract.md)。

- [x] T2：实现 Domain 派生聚合纯函数与 golden 测试
  - 覆盖验收标准：AC1、AC5
  - 依赖：T1.1 公共聚合合同就绪里程碑；API/DSA 叶不参与纯计算，不构成启动依赖。
  - 涉及范围：`packages/domain/`（与 `aggregateMinuteBars` 同级的新聚合函数）及其测试；不涉及 Server 装配。
  - 不包含：交易日历 fact 的采集、指标计算、缓存、UI。
  - 完成条件：`5d / 1w / 1mo / 1y` 按 Spec 的桶边界聚合 OHLCV 与 `completionStatus`/`availableAt`；桶内混合 `adjustment` 或口径不一致时 fail-closed；不补零、不补最近值；桶内无有效日线时不出 bar；同输入 + 同 calendar revision + 同规则版本 + 同评估时刻/锚点输出逐字段稳定，函数不读取系统时钟。
  - 验证方式：golden test 覆盖跨月/跨年周、半日市、停牌缺失交易日、`incomplete`/`unknown` 传播、混合复权、`5d` 锚点随窗口移动、Dedupe 与排序；Domain 包级测试与 typecheck。
  - 完成状态回归：周二日线均完整但周线未结束、当前月/年尾桶未结束、最后计划 Session 结束前/恰好结束/结束后、有可信停牌证据与无解释缺口、证据晚于评估时刻、固定 `evaluationAsOf` 回放均须有确定性断言。
  - 执行记录：2026-10-04 本地完成。T1.1 前置已验证；`aggregateMarketDailyBars` 和 `canonicalMarketPeriodEncoding` 只消费显式事实与证据。calendar coverage 必须覆盖含日线的整个桶；5d 不接受日历边缘不足五日片段。定向 Domain 35 项、Schema 13 项通过（包含实际 Domain 输出回到 Schema）；Domain 包级 39 文件 330 项、Schema 包级 52 文件 602 项通过，build/typecheck、定向 ESLint 与复杂度检查通过。完成状态、日历版本、基础输入、完整价格口径和必要覆盖证据进入规范化编码；T3 负责摘要与缓存装配。无交易证据只解释缺日，不产生零值 bar。未接入 HTTP/DSA/Desktop，未访问外部来源或部署环境。

- [x] T3：接入 Server 派生能力声明、窗口/预热换算与派生视图缓存
  - 覆盖验收标准：AC2、AC3、AC5、AC9
  - 依赖：T1.1 公共合同、T1.2 API 消费及 T2；T1.3 的 DSA 指标合同不阻塞 Server 派生视图自身实施。
  - 涉及范围：`apps/server/src/market/` 的 Reader/Controller/detail 装配、calendar fact 读取、派生能力声明、Redis 派生视图与失效、窗口与预热换算；相关 Server 定向测试。
  - 不包含：新增 Provider 或路由、改变日线事实治理、新增数据库 migration、指标公式。
  - 完成条件：派生能力仅在 `DAILY_BAR` 可用且 calendar fact 可用时声明，否则带 reason 降级；`barsLimit` 表示所选周期条数；基础事实量与指标计算点数分别校验上限，超限返回可解释参数错误；派生视图 key 含周期、基础段 identity/fingerprint、规则版本、锚点与 calendar revision，基础事实或日历变化时失效；跨周期页不得合并；`hasMoreBefore` 按桶边界判断。
  - 完成状态缓存：绑定显式评估时刻，或每次返回前重新判定尾桶状态；禁止跨过 `bucketEndAt` 后直接复用旧结论。保留计算输入指纹、显示指纹与 `calculationInput` 的对应关系。
  - 验证方式：Server 定向测试覆盖能力声明、降级 reason、缓存 key 与失效、超限报错、桶边界 `hasMoreBefore`、跨周期隔离及跨完成边界重算；Server typecheck/build。

  - [x] T3.1：真实日历读取与 Session 投影。依赖 T1.1；写入 Market 日历适配/读取服务及测试、Module 注册与边界门禁。不提前开放 HTTP 派生成功。完成条件：唯一且完整的显式日历事实按固定评估时刻投影，半日/假日/覆盖有效，错误与未来事实降级，日历完整内容进入 revision；本地定向测试和类型检查通过，实际 DSA 读取结果单独记录。执行结果：32 项新测试、Server 行情 646 项、类型/build/工程门禁通过；实际 DSA 日历读取与宿主机投影生成 38 日/76 Session，目标 Server 新服务尚未同步。见[日历证据](../../tasks/evidence/2026-10-04-market-period-calendar.md)。
  - [x] T3.1b：独立展示日历范围。依赖 T3.1；年线预检发现旧 104 日结算预算阻止年初完整年度桶，新增 DSA `/market/calendar`、有界 366 日未来计划及 20000 日总范围，复用实际来源和事实信封；Server 改用该读取路径。完成条件：完整年度请求通过双方定向测试，超限拒绝，原回测预算与旧接口回归通过，Python/Server 编译及文档通过；目标新入口另行留证。执行结果：Server 48 项、DSA 56 项及编译/门禁通过；官方快更后实际年度读取生成 242 日/484 Session，四项目标 HTTP 检查与指标/Journal 保护复验通过，公开派生路径仍待装配。见[日历证据](../../tasks/evidence/2026-10-04-market-period-calendar.md)。
  - [x] T3.2：基础窗口、预热与缓存。依赖 T3.1/T3.1b/T2/T4；完成原 T3 的所选周期条数、双层上限、口径、桶边界分页、完成时刻与失效责任，验证定向窗口/缓存矩阵。
    - [x] T3.2a：按计划 Session 规划完整周期桶与双层预算。Domain 复用既有桶边界，不复制周期算法；Server 选择可见桶和其前置预热桶，按实际计划交易日数校验基础上限，分别校验指标点上限。半日/假日、跨年、5d 锚点、开始/结束与不完整日历边缘直接测试通过，函数只消费显式评估时刻。该叶不发起行情读取。执行结果：新增窗口 16 项、最终 Server 行情及 DSA 客户端 684 项、Domain 386 项通过；类型/build/工程门禁通过，golden 字节未变。见[窗口证据](../../tasks/evidence/2026-10-04-market-period-window.md)。
    - [x] T3.2b：装配实际日线与派生视图。依赖 T3.2a；读取完整基础窗口，绑定现行来源/完整价格口径与实际点；生成显示/计算窗口各自摘要与桶边界分页，按固定评估时刻及原事实计算完成状态，缺日不得补造。
      - [x] T3.2b1：基础序列到派生视图的纯装配。仅消费现行日线合同，核验原输入摘要及完整价格口径，显式绑定日历/时刻/锚点；显示与计算各自生成上下文和最终指纹，缺日保留 unknown，空序列不补造。执行结果：装配 22 项、Server 行情/DSA 客户端 706 项、Schema 640 项、API Client 68 项及类型/build/工程门禁通过；宿主机新装配到目标 DSA 四周期受控计算通过，微秒依据时刻保留。未读取 Provider 或部署新 Server 装配。见[纯装配证据](../../tasks/evidence/2026-10-04-market-period-view.md)。
      - [x] T3.2b2：真实基础窗口读取服务。依赖 b1；接收显式完整日历范围，按日历计划获取足量日线和实际预热，评估时刻在事实获取后固定并重读日历。重新规划改变基础起止窗口时最多重新获取一次，持续变化返回 window_changed；保持原生 1d 来源，不补造覆盖。传输错误、空来源、非法来源和日历不可得分别降级；注册服务并完成定向装配/运行验证。公开入口负责日历范围和请求参数，仍属于 T3.3。
        - [x] T3.2b2.1：读取编排与消费合同。实现以上有界状态转换、完整窗口和来源校验；读取编排 13 项、装配/窗口回归共 51 项，类型/build、定向 lint/复杂度与边界门禁通过。作为缓存消费的启动前置。真实来源成功门禁不关闭，见[读取编排证据](../../tasks/evidence/2026-10-04-market-period-reader.md)。
        - [x] T3.2b2.2：真实来源成功验收。目标日历与实际日线来源取得完整窗口，宿主机新 Reader/目标公开链分别留证。2026-10-05 用户授权选源后采用现行腾讯 ETF/qfq 路由，宿主机当前 Reader 四周期 bars 成功；`600519.SH` 仍无日线路由，目标新公开链仍待部署，保持未勾选。见[真实消费证据](../../tasks/evidence/2026-10-05-market-period-public-consumption.md)。
    - [x] T3.2c：派生缓存与指标投影。启动依赖 T3.2b1/T3.2b2.1 的已验证消费合同；完整验收仍依赖 T3.2b2.2。缓存绑定基础输入、规则/日历、周期/锚点、评估时刻和完整口径，重验命中内容；DSA 计算与显示投影分别绑定，实际输入/日历/时间变化、跨周期、预热不足和故障降级通过定向测试。
      - [x] T3.2c1：精确评估时刻的派生视图缓存。缓存 13 项与实际读取/注入两文件 27 项通过；输入变化与跨完成边界隔离，内存 128 项、Redis 60 秒，命中重验元数据/内容/上下文及覆盖摘要，故障回到当前事实重算；refresh 强制重算，不缓存来源错误。类型/build/工程门禁通过，见[缓存与消费证据](../../tasks/evidence/2026-10-04-market-period-cache-and-indicators.md)。
      - [x] T3.2c2：派生指标纯消费。11 项通过；实际点/最终摘要、结果集合、引擎与精确点序列核验，对显示窗口投影并保留 calculationInput，null 保留，传输与协议分别降级。宿主机当前消费到目标 DSA 四周期受控计算、两点显示与重复读取缓存通过；不代表真实 Provider/目标 Server 成功。见[缓存与消费证据](../../tasks/evidence/2026-10-04-market-period-cache-and-indicators.md)。
      - [x] T3.2c3：实际输入/日历变化和故障目标验证。依赖真实来源窗口就绪，独立核验缓存与 DSA 成功链路；目标路由未配置时保持开放。
  - [x] T3.3：公开成功响应与能力声明。本地启动依赖 T3.2b2.1/T3.2c1/T3.2c2/T1.2，完整验收仍依赖 T3.2b2.2/T3.2c3；接 bars/indicators/detail，按真实 DAILY_BAR 与日历能力声明，旧原生调用回归并核对实际 HTTP、显示与计算指纹；该叶后才开放 T5。
    - [x] T3.3a：bars 与独立指标公开消费。完整日历范围复用 Domain 边界，5d 锚点基于实际计划，明确默认点数/双层预算和结构化错误；接实际 Reader/缓存/DSA 消费，保持原生日线调用。公开/范围/原入口 32 项、组合行情/Backtest 1355 项、Domain 386 项、类型/build/工程门禁通过。宿主机新装配消费真实腾讯 ETF 四周期 bars；5d/周线实际 DSA 成功，月线来源 503/年度指标超限保持降级。当时目标新公开链未部署；后续闭合见运行态闭合证据。早期记录见[公开消费证据](../../tasks/evidence/2026-10-05-market-period-public-consumption.md)。
    - [x] T3.3b：详情分段与实际能力声明。展示联合详情与独立周期能力入口已完成；Schema 全包 673 项、SDK 全包 72 项、Server 受影响范围 784 项通过（27 项条件跳过），类型/build、lint/格式和工程门禁通过。宿主机当前能力服务消费目标真实日历与现行价格路由，腾讯 ETF 四周期 bars 前置可用，年度指标分别降级；当时新目标公开入口未部署；后续闭合见运行态闭合证据。早期记录见[详情与能力证据](../../tasks/evidence/2026-10-05-market-period-detail-and-options.md)。
      - [x] T3.3b1：详情联合合同与独立编排。Schema 展示合同、SDK 条件类型、Market 派生详情服务及 Controller/Module 接入已完成；原生消费类型、分段降级、显示/计算指纹、参数错误与单次来源获取通过 Schema/SDK/HTTP 定向及类型/build 验证。Desktop 周期 UI 留给 T5。
      - [x] T3.3b2：独立周期能力入口。复用实际窗口预检，完成周期 options 合同、SDK 与 Market 能力服务；日历/完整预算/选定口径分别核验，基础与指标独立声明。目标只读核验 17 次日历、15 次价格能力请求，行情获取、DSA 指标和模型调用均为零；三账户语义摘要不变。目标部署仍归 T3.3c。
    - [x] T3.3c：目标公开成功验收。依赖真实来源和目标结构/代码就绪，核对实际 HTTP 周期、显示/计算指纹、能力/失败语义；未通过时保持开放。

- [x] T4：DSA 在周期序列上计算指标并声明预热
  - 覆盖验收标准：AC4
  - 依赖：T1.3 的 DSA 周期合同；T1.1 为字段前置。
  - 涉及范围：DSA 既有指标计算适配层、Contract 声明与直接测试/文档；主仓不复制实现。
  - 不包含：在 DSA 内做周期聚合（聚合属主仓 Domain）、改变既有日线计算路径。
  - 完成条件：指标以传入的周期序列为输入计算，参数与公式不变；预留热不足返回 null 而不是插值；输入超过上限时返回可解释错误；旧日线调用行为不变。
  - 验证方式：DSA 定向 pytest（周期输入、预热 null、超限报错、旧路径回归）、Python 编译检查；记录 DSA HEAD。
  - 执行记录：2026-10-04 与 T1.3 共享实际计算适配，但分别对账完成条件。四周期实际 pandas 计算、月线 MA5、年度预热空值、超限/篡改错误及旧日线行为通过本地回归；目标容器四周期计算与年度空值通过。DSA 不读取来源或聚合；公开成功响应及历史覆盖可得性仍由 T3 装配，未据此关闭完整 AC4。见[跨仓证据](../../tasks/evidence/2026-10-04-market-period-indicator-contract.md)。

- [x] T5：Desktop 周期语义组、偏好正交与页隔离
  - 覆盖验收标准：AC6、AC7、AC8、AC9、AC11
  - 依赖：T1.2 的 API 消费、T3 与 T4。
  - 涉及范围：`apps/desktop/src/features/market-detail/` 的工具栏、请求装配、偏好持久化、ChartPoint 页构建与直接测试。
  - 不包含：聚合实现、指标计算、NAV 图表行为、全局 CSS。
  - 完成条件：新增「周期」语义组且只渲染真实可用周期；周期与区间偏好正交并进入请求 key、缓存失效与乱序保护；切换周期清空视口与页集合、不保留上一周期 bars、不请求整段日线做客户端聚合；口径区显示周期与「派生」来源；不可用周期回退 `1d` 并提示；读数分组、右轴末值、稳定槽位、拖动分页、实时概览隔离不回归。
  - 验证方式：Desktop 定向组件测试（可用周期渲染、偏好正交、页集合隔离、来源文案、回退提示）、既有 market-detail 套件不回归、Desktop typecheck 与目标 ESLint。

- [x] T6：完成包级检查与仓库门禁
  - 覆盖验收标准：AC10
  - 依赖：T1–T5
  - 涉及范围：受影响 packages/apps、边界与文件尺寸脚本、锁文件（如新增依赖）。
  - 不包含：数据库 migration、Provider 配置变更。
  - 完成条件：Schema/Domain/API Client/Server/DSA/Desktop 定向测试通过；typecheck/build/lint、`node scripts/check-boundaries.mjs`、文件尺寸 ratchet 与 `git diff --check` 通过；无新增未解释告警。
  - 验证方式：按验证阶梯执行并记录失败详情、既有告警与命令原文。
  - 执行记录（2026-10-05）：先通过五个执行面的定向测试，再完成 Schema/Domain/SDK 全包、Server 受影响范围及 Desktop 行情回归。全工作区 lint 唯一阻断为策略编写 Schema 未使用的类型导入，已仅移除该导入并保留原 re-export；修复后 Schema 676 项、类型/build 和所属 lint 组复验通过，其 212 个 JS/类型声明文件摘要前后相同。其余源码输入摘要未变，复用已通过组，并补齐剩余组，9 组共 1643 个 lint 输入全部覆盖。27 项环境/真实输入条件跳过、DSA 4 项告警及 Mobile 依赖 Flow 解析诊断均单独记录；未用这些结果关闭隔离环境或产品门禁。见[T6 证据](../../tasks/evidence/2026-10-05-market-period-t6-engineering-gates.md)。

- [x] G1：真实运行态与浏览器验收
  - 覆盖验收标准：AC2、AC3、AC6、AC7、AC8、AC10
  - 依赖：T6；Server/DSA 运行版本与 T1 契约一致
  - 涉及范围：隔离本地运行环境、Desktop 图表页、浏览器工具与 Network 证据。
  - 完成条件：四种周期均可切换并真实请求到对应 `timeframe`；派生来源文案可见；切周期后读数、右轴、涨跌幅、分页与拖动加载语义正确；1 年线在指标不可得时的空值语义正确；基金不出现周期选项；陈旧/空/不可用状态可解释；记录 revision、Contract 版本、截图与控制台结果。
  - 验证方式：浏览器检查 DOM/Network/交互/截图；在线 Provider smoke 单独标为观测证据，不用受控 fixture 代替。运行态不可用时保持未勾选并记录阻塞原因。
  - 执行记录（2026-10-06）：`localhost:5173` 当前源码页面消费实际目标 Server/DSA；`159516.SZ` 四周期成功，5 日/周线实际拖动扩为 180 点窗口，月/年线在已到历史边界时不补投。`159001.SZ` 经基金切换后继承周线；无路由股票明确回退并保留持仓上下文。年度指标为空并有降级说明。受控陈旧、空分段和修复后控制台结果独立记录；SDK/页面不再把合法空数组当作价格序列。仅进行了只读 Docker/结构检查，未更新容器、迁移或修改路由；完整截图、请求标识、输入摘要与检查命令见[G1 证据](../../tasks/evidence/2026-10-06-market-period-g1-browser-acceptance.md)。

- [x] P1：周期切换性能门禁
  - 覆盖验收标准：AC11
  - 依赖：T5
  - 涉及范围：Desktop 生产构建页面与浏览器性能记录。
  - 完成条件：500 点负载下周期切换不出现 >200ms 主线程长任务；切换只发出新周期的窗口请求，Network 中不存在「拉全量日线在客户端聚合」的调用；记录设备、浏览器、构建 revision 与采样方法。
  - 验证方式：浏览器 Performance 面板或等价受控测量。
  - 执行记录（2026-10-06）：Apple M2 / 16 GiB、Codex In-app Browser（Chromium UA 154）、1280×720 下，真实图表组件的生产构建以全量视区加载 500 个价格点及三组 500 个指标点；40 次周期切换在绘制后继续观察一秒，未记录长任务条目。实际 Desktop 生产页面的 `159516.SZ` 四周期详情请求为 90/90/90/2 点窗口，响应周期匹配；其余为不含行情点的能力元数据，Network 捕获完整且无全量日线追加请求。基准独立类型检查、生产 build、lint、尺寸 ratchet 与 diff 检查通过，原始浮点采样、请求、构建摘要、截图和边界见[P1 证据](../../tasks/evidence/2026-10-06-market-period-p1-performance.md)。

- [x] R1：最终一致性 Review
  - 覆盖验收标准：AC1–AC11
  - 依赖：T6、G1、P1
  - 涉及范围：本 Spec/Task、Contract、Domain/Server/DSA/Desktop 变更与验证证据。
  - 完成条件：逐项核对契约、桶边界、派生标识、预热与窗口、缓存失效、兼容性、非目标与证据边界；未通过门禁保持未勾选。
  - 验证方式：使用本文件唯一的最终一致性 Review 清单；不提交、不推送。
  - 执行记录（2026-10-06）：逐项复核全部 AC、源码责任、跨仓合同与原始证据；文档已对齐当前接口、枚举、窗口/预算、预热职责、全局偏好及阶段历史。Domain 386、Server 784（另 27 项条件跳过）、SDK 75、Desktop 行情 112 项当前回归及相关类型/build/工程门禁通过；目标周期编译产物与当前源码构建逐字节一致。共享传输变动后补做定向 lint、取消烟测、当前生产构建与浏览器四周期窗口请求/40 次性能采样，无 Blocking 问题。详见[R1 最终 Review](../../tasks/evidence/2026-10-06-market-period-r1-final-review.md)。

## 验收映射

| AC / 断言                        | 实现责任任务                           | 验证责任任务或门禁 |
| -------------------------------- | -------------------------------------- | ------------------ |
| AC1 / 四周期确定性聚合与完成状态 | T1.1、T2、T3                           | T1.1；T2；T3；T6   |
| AC2 / 派生能力声明与 provenance  | T1.1（字段）、T1.2（消费）、T3（声明） | T1.1；T3；G1       |
| AC3 / 契约兼容与结构化错误       | T1.1（旧来源合同）、T1.2（API）、T3    | T1.1；T1.2；T3；G1 |
| AC4 / 周期序列上的指标与预热     | T1.3、T4                               | T1.3；T4；G1       |
| AC5 / 窗口、预热换算与桶边界覆盖 | T2、T3                                 | T2；T3             |
| AC6 / Desktop 周期组与偏好正交   | T5                                     | T5；G1             |
| AC7 / 实时概览与图表语义不回归   | T5                                     | T5；G1             |
| AC8 / 来源披露与基金隔离         | T3、T5                                 | T5；G1             |
| AC9 / 跨周期页隔离与请求 key     | T3、T5                                 | T3；T5             |
| AC10 / 工程门禁与运行态证据      | T6                                     | T6；G1；R1         |
| AC11 / 周期切换性能与请求形态    | T5                                     | P1；R1             |

## 依赖与证据边界

- T1 是唯一跨仓契约任务；T2–T5 只能依赖其冻结字段，不得自行发明周期标识或聚合规则。
- T2 的 golden test 只证明聚合规则；不证明交易日历完整性，日历 fact 缺失时必须走降级路径。
- T6 通过只证明代码、契约与确定性测试；不证明在线 Provider 可用、Docker 镜像或浏览器 Network。
- G1 必须使用与 T1/T6 对应的主仓与 DSA revision；旧镜像或 stale 派生视图只能作为环境阻塞记录。
- 分钟线、交易标记、成本线、风险线与测量不在本任务范围。
- 既有通用分页锚点后续工作由 `docs/TODO.md` 的 `market-detail-pagination-anchor` 及原分页 Task 独立承接；本任务按当前周期键和桶边界隔离要求验证，不扩大为通用分页重构。

## 当前执行记录

- 2026-10-05 全量剩余任务继续授权：T3.2b2.2/T3.3c/T3.2c3 已完成，父 T3 及子组对账通过。真实腾讯长窗口修复、宿主当前 Reader 四周期完整读取、目标 21 项 HTTP 窗口/指纹/降级和实际 Redis/DSA 连接故障通过，见[运行态闭合证据](../../tasks/evidence/2026-10-05-market-period-runtime-closure.md)。此前各叶关于未部署/月线 503 的记录属于历史时点，当前以本证据为准。T5 启动前置已解除，T6/G1/P1/R1 仍开放。

### T5 当前执行包

T5 按同一 Desktop 消费面拆为两个可独立验证叶，保留全部原 AC6–AC9/AC11；真实浏览器和性能仍分别由 G1/P1 拥有。

- [x] T5.1：展示联合合同、请求键与页隔离。
  - 依赖 T3/T4。写入 Desktop 行情专属 API/协调器、图表数据适配、详情合并与最新窗口消费及直接测试；不修改服务端聚合或共享来源合同。
  - 完成条件：动态周期消费展示联合合同，周期进入请求键/最新页状态；异周期迟到响应和页不合并；原生日线与基金读取不回归。定向测试及 Desktop typecheck 通过后停止本叶。
- [x] T5.2：周期偏好、能力与工具栏。
  - 本地收尾（2026-10-05）：周期选项分别消费非年度 90 点和年度 2 点的真实窗口前置，缓存键含窗口；回退中文提示绑定标的。新增挂载交互覆盖实际点击、周期/区间正交、重开恢复、能力失效及持久化、标的隔离、基金禁用和能力查询失败。23 文件、108 项行情详情测试、Desktop typecheck/build、定向 lint、边界/依赖图/尺寸 ratchet 与 diff 检查通过。性能夹具仅同步消费键并通过构建，不表示 P1 采样通过。详见[T5.2 收尾证据](../../tasks/evidence/2026-10-05-market-period-t52-local-completion.md)；G1 的完整真实分页/回退/截图与 P1 仍开放。
  - 2026-10-05：消费层、偏好、能力及文案已实现；102 项定向测试、类型/build/lint/工程门禁通过。实际浏览器四周期与基金隔离通过阶段检查，完整回退/分页和性能验收待地址授权，见[Desktop 证据](../../tasks/evidence/2026-10-05-market-period-desktop-consumption.md)。
  - 依赖 T5.1。写入行情周期选择 hook/语义组、既有 Dialog/Chart 接缝及直接测试，复用已有组件和 TanStack Query。
  - 完成条件：全局持久化周期并跨标的复用，兼容读取旧标的键，且与区间正交；仅渲染实际可用周期，失效回退 1d 并提示；切换清空视口与页，派生来源和周期中文可见；基金无周期组。定向交互/市场详情回归/typecheck/lint 通过，不以本地结果代替 G1/P1。

- 2026-10-04 规划预检：T1 跨公共合同、API、DSA 三个独立执行面，已拆为 T1.1–T1.3，保留原义务和 AC。T2 仅依赖经验证的 T1.1；T3/T4/T5 仍按其消费合同和运行前置验收。规划结论为 Ready（T1.1）；T2 在 T1.1 验证后就绪。原主仓与 worktree HEAD 均为 `514abeebfe57bac0c16271439d8b777ff3b02a9f`，DSA HEAD 为 `d40549602d187da7bdd0e8bebb59d2a0fc271919`。行情/Schema 来源文件无缺失前置，主仓 Journal dirty WIP 不复制。证据与交接见 [`evidence/2026-10-04-market-period-parallel.md`](../../tasks/evidence/2026-10-04-market-period-parallel.md)。
- 2026-10-04 交付检查：T1.1 与 T2 本地完成，原 T1 任务组仍缺 T1.2/T1.3；T3–T6/G1/P1/R1 未完成。共享包导出只新增周期专属行，父对话合并时须保留主仓 Journal 新导出。文件尺寸 ratchet 通过，有 10 个未增长的既有告警；本次新增代码的 complexity ≤20、函数尺寸 ≤220，无新增 lint/复杂度告警。未 stage/commit/push，未修改 DSA/infra/根 manifest/lockfile，未占用浏览器、端口、数据库或容器。

- 2026-09-16：按用户反馈完成 Spec/Task 立项。范围限定为 `5d / 1w / 1mo / 1y` 派生周期；分钟线只记录事实与前置条件，不进入实施。规划结论：桶边界、派生位置（Domain + Server 声明，不新增事实表）、指标可得性与兼容策略均有单一实现责任与对应验证，无 Blocking 问题；未开始 T1。
- 2026-09-16 评审修订：补齐 `evaluationAsOf`、`bucketEndAt`、覆盖证据及尾桶完成状态，分配至 T1/T2/T3；区分基础事实获取上限与指标计算上限。本次仅修订规划，所有周期实现任务仍未开始，不以行情 V2 修复测试代替周期功能验收。

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [x] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据
- [x] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [x] 跨任务接口、类型、状态、时间、错误与副作用语义一致
- [x] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [x] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [x] 派生周期未被写成事实、未被伪装为 Provider 原生周期
- [x] 周/月/年及 5 日桶同时满足周期结束、日线及覆盖证据条件，固定评估时刻可回放
- [x] 证据类型、场景覆盖、代码版本与目标环境支持所声明的验收结果
- [x] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [x] 必要实施 Step 已验证；提交处理符合授权且保留既有用户修改
- [x] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

完整 AC1–AC11、所有已勾选叶及其启动/验收依赖均复核通过。当前契约、桶边界、日历/来源证据、指标预热、双层预算、缓存绑定、兼容与非目标一致；未发现未处理的 Blocking 或实现/规格/证据不一致。当前代码/运行态/生产页面的适用范围和条件门禁见[R1 最终 Review](../../tasks/evidence/2026-10-06-market-period-r1-final-review.md)。未提交或推送，保留共享工作树中的既有与并发修改。

### 2026-10-04 局部 Review（历史）

- T1.1/T2 的原规格断言、实现与实际验证一致，本地交付通过。T1.2 的公开传输与拒绝路径已通过目标验证；该结论不覆盖派生成功序列、完整 AC1–AC11 或全部产品运行态。
- T1.2 已消费公开请求并明确拒绝尚未装配的派生；原生来源路由没有扩大为派生周期。T1.3/T4 的独立合同及 provided-points 计算已通过双方测试和目标受控计算。T3 需接入真实 calendar fact，并按完整桶取基础日线/预热，不得把 `latestCompleteTradingDate` 或本地工作日日历作为完整性证明。
- 该时点 R1 及最终清单尚未勾选，T3、T5/T6、完整派生目标部署、真实来源、浏览器和 P1 尚未执行；后续分别完成，当前状态由上方 R1 结论及其证据维护。
