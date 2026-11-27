# 风险监控常驻来源与旧任务续查

对应 [Spec](../specs/2026-11-06-risk-monitoring-schedule.md) 与 [Task](../tasks/2026-11-06-risk-monitoring-schedule.md)。本轮是在“已有更新消费仍未满足盘中常驻监控”后的续查，不是验收完成记录。

## 只读运行态

检查时间：2026-11-06 17:51:34 UTC。使用现有 `thesis-ledger-dev-thesis-ledger-1` 中 Prisma 的 SELECT/count，以及已配置的 DSA Control GET。未运行 Provider 测试、报价、历史请求、OpenD 订阅、行情采集器或任何通知投递。

- Desired 与 Effective policy 均为修订 **189**，全局启用、已应用；目录 integrity 为 complete，catalogRevision 为 `1106839547598160`。
- 风险规则共 **7** 条；当前已启用、未归档、无需修复且已生效的规则 **0** 条。此前只读明细中，未归档且 enabled 的集合也为空。不能把这个结果写成“没有配置规则”，不能替用户启用。
- `risk-evaluation` 自动化任务 **0**，`systemKey=risk-monitoring-close` **0**。本目标不存在需要暂停、重排或删除的旧 16:05 任务。
- HiThink 已配置、启用，credentialConfigured=true，configVersion=9；富途已配置、启用，credentialConfigured=true，configVersion=1；腾讯无需凭据、已配置且启用；长桥停用、未配置凭据。只输出这些脱敏事实，没有读取或保存凭据内容。
- 相关 Provider 的 settings/configSchema 均无已配置的常驻调用预算字段。这里不能推出上游实际收费为零或当前账户具备订阅权限。

一次初始 Control GET 因误用不存在的环境变量返回401；检查实际源码后，改用已有 `THESIS_LEDGER_CONTROL_TOKEN`，同一只读操作成功。没有更换、生成或扩大任何 token。

## 已选来源与真实能力

| 范围 | 当前有效选择 | 已确认的边界 | 能否直接闭环 |
| --- | --- | --- | --- |
| 中国股票报价 | HiThink `a-share-prices-snapshot`，eligible=true | 已接入单次快照，仍有来源准入与凭据围栏；当前没有常驻预算承诺。15秒缓存是 Server 缓存，不是上游推送频率或无限读取许可 | 不能在本轮约束下直接开始持续调用受限快照 |
| 中国 ETF 报价 | HiThink `fund-market-snapshot` 当次 eligible=false/upstream_failure；腾讯 `tencent` 为已配置的 eligible 备选 | 腾讯无需新凭据，但现行 DSA 对**每来源、每标的**请求在调用前占用600秒窗口，失败/进程重启也不会立即释放；Server 现有 ETF 缓存、手动刷新与退避也遵守600秒 | 已实现不快于600秒的后台采样及固定来源执行，隔离闭环通过；未运行真实上游，不保证捕捉采样间短暂越界，不能宣称实时推送 |
| 港美股票/ETF 报价 | 当前 policy **未选任何报价路由** | 富途报价目录 ready、连接已配置；长桥未配置。ready目录不代表已选路由、订阅额度或该账户的实时权利 | 不能借监控自动改变来源选择；不能直接从 SDK 存在推导可用订阅 |
| 港美分钟线 | 当前 policy **未选任何 MINUTE_BAR 路由** | 富途四类1m目录 ready；现有 `MinuteRequest.from_request` 只允许 `parameters={interactive_chart:true}`，调用 `request_history_kline`，不是流式订阅；历史查询消耗历史额度，不可偷偷作为常驻补洞 | 尚缺风险执行合同与常驻更新接缝，不能把交互图表或历史分页当成已完成 K 线事件流 |
| 场外基金 | 已配置正式净值来源 | 正式 NAV 按公布日期评估，不存在可据以承诺的盘中报价流 | 继续使用正式净值，不用估算或请求时间替代 NAV 日期 |

运行态 GET 的目录输出中，富途/腾讯/HiThink的相关行均可为 ready；这与 Effective 中选中目标的 eligible、以及具体调用的权利/预算是不同事实。没有把目录读取当作来源成功验收。

源码证据：[DSA ETF 预算执行](../../../daily-stock-analysis/src/services/thesis_ledger_provider_runtime.py)、[持久预算占用](../../../daily-stock-analysis/src/services/thesis_ledger_control.py)、[Server ETF 窗口](../../apps/server/src/market/market-quote-cache-policy.ts)、[富途来源绑定](../../../daily-stock-analysis/data_provider/thesis_ledger_sources/futu.py)、[分钟合同](../../../daily-stock-analysis/src/services/thesis_ledger_minute_contract_v1.py)、[富途分钟读取](../../../daily-stock-analysis/data_provider/futu_history.py)。

## 订阅能力的区分

富途 SDK 在产品外具备报价/K线订阅能力，已有接入文档也把 `StockQuoteHandlerBase`、`CurKlineHandlerBase` 和 subscribe 列为未接入。当前 DSA 的精确 Quote 绑定是 query；源码中没有这些推送处理器或现成的常驻流执行器。注册器虽然识别 operation=`subscribe`，找不到对应 binding 时仍明确拒绝，不能据此声明订阅可用。

[富途官方订阅说明](https://openapi.futunn.com/futu-api-doc/quote/sub.html)说明港股订阅需相应 LV1 或以上权利，BMP 不支持；初次/重连订阅还可能推送缓存样本。官方示例同时展示订阅额度占用及连接关闭的释放语义。因此当前 OpenD host/port 已配置，不足以证明持续订阅无需额外权限或额度。没有调用 subscribe、query_subscription 或账户权限探测来扩大本轮操作。

## 来源设计与已实现范围

产品目标维持“规则启用后自动监控，关页不停止”，不再以16:05排程作前置。按实际来源逐项实现，不要求用户先指定统一延迟。腾讯ETF已落实第一条路径的代码和离线/隔离验收，第二条仍是未实现能力：

1. **现有报价的常驻获取**：Market 拥有采集，不让 Risk 直接调用 Provider。按规则推导完整 symbol/assetType 的需求集合，账户/组合规则覆盖其全部持仓；遵守用户当前 Desired/Effective 顺序、精确身份、全局开关与准入。只允许已核实合同边界的选中公开目标，Redis lease/window跨进程限流并在上游前占用；规则停用或移除后释放本应用需求。取得新源时间/正式净值后，复用现有日志触发评估及数据库去重。ETF现有600秒上限必须直接展示，无法回溯窗口内未知越界。
2. **已配置 OpenD 的持续订阅**：先确认用户要选用的精确市场/资产路由、现有账户权利、可用订阅额度及正常时段语义，再由 DSA 增加 subscribe 执行绑定、持久的本应用所有权与连接恢复，Market 消费流并沿用当前 Risk 状态机。只释放本应用订阅，禁止 `unsubscribe_all` 影响其他程序。K线需要明确发生/可得时间及完成条件，不能把未结束尾柱、重连缓存或交互查询冒充新收盘事件。真实上游与故障验收另设阶段，不启用真实通知。

已新增**执行前锁定来源及 generation** 的 Data POST 接缝；原 quote GET 保持兼容。即使现在 ETF 首选 HiThink 不可用、实际会落到腾讯，也不能通过一次元数据预检便假定未来请求始终只消耗腾讯；目标资格可能在请求前变化。不得临时重写用户策略、绕过主来源或调用探测接口来实现“免费强制走备选”。

实现已经包含规则需求自动登记和腾讯ETF后台采样执行器，无需额外监控开关；尚未部署、未解冻或实际请求任何来源。600秒来自当前来源限制，不是向用户要求统一延迟。HiThink仍需现有受限来源的常驻预算证据；富途仍缺已选路由、已核实订阅权利和执行流；正式净值后台获取、汇率刷新及已完成K线仍待按各自合同接入。这些具体缺口不能用腾讯采样闭环的通过掩盖。

## 16:05任务迁移影响

本目标任务数为0，**当前无需执行任何迁移**。此前“旧任务仍可能按原计划执行”是兼容性说明，不能误写成目标确有旧任务。

其他环境存在旧任务时，先给出只读预览：任务ID、systemKey、enabled、cron/timezone、nextRunAt、retryPolicy/lockTtl与活动执行数，保留配置及历史。仅识别 `risk-monitoring-close` 且仍匹配原默认设置的候选；用户改过的默认任务也按自定义处理，不自动暂停。

只有常驻来源覆盖、事件/通知一致性及目标验收通过，并且用户已明确该运行态变更后，才对精确候选做事务内CAS暂停（只变 enabled，保留 cron/timezone/历史；若需改变 nextRunAt，应在预览中说明）。不删除任务或运行记录，不批量停用所有 `risk-evaluation`，不启用外部通知。已经开始的旧扫描先单独核对能否安全结束；数据库越界去重负责兼容重叠，不把禁用任务等同于取消了在途执行。

如果新链路未覆盖来源或无法满足时延，不用暂停旧任务掩盖缺口，也不擅自重启用户此前停用的任务。回退操作沿用明确授权和原配置。当前没有执行任何这些动作。

## 本轮验证与变更

- 只读运行态核查如上，修订189与任务0重复核对一致；未改变真实7条规则的状态。
- 更正 Server 的分钟错误说明：由“没有精确来源”改为“现行合同仅交互图表，风险尚未接入完成分钟更新”，保持拒绝行为，未借此读取历史或旧缓存。
- `vitest run test/risk/strategy-runtime.test.ts`：14项通过。这里未改执行链，不重复生产镜像构建、Docker更新或8项旧隔离验收，也不把这14项当作持续来源验收。


## 本次源码与验证增量（2026-11-06 18:23 UTC）

- DSA 新增 `POST /api/v3/thesis-ledger/market/background-quote/plan`，只读控制事实，不触发 Provider；响应按资产/当前顺序报告目标、generation、policyRevision、获取方式、最短请求间隔、未知的源更新频率或稳定原因码。`POST /market/background-quote` 携带 generation，标准 Runtime 在预算/上游前及返回前重核；只允许当前首个 eligible 的腾讯中国ETF，保留原 routeIndex 和 fallbackUsed，不尝试 HiThink。原 GET 兼容。协议所有权见 [DSA Spec](../../../daily-stock-analysis/docs/specs/2026-11-06-background-quote-source.md)。
- Risk 从数据库当前生效规则推导独立的行情需求；组合/账户覆盖其持仓，精确标的分类批量取本地目录，未知不猜。每5秒仅核对本地需求；Market对成功取得的只读计划缓存60秒；计划请求失败时由本地需求协调重试。上游报价按来源至少600秒，且只使用中国市场工作日交易时段的时钟窗口；未核实交易所节假日，不承诺节假日零调用。关页不影响后台执行；无规则无数据请求，停用/归档/未来规则由事实源自然收敛。每1秒的本地观察协调负责规则保存后的已有数据首评；这两个本地协调周期不是统一的行情扫描频率。
- Market复用标准报价缓存、锁与ETF请求窗口，再通过原观察日志触发Risk；额外的后台尝试窗口在请求前占用，跨Server进程/重启共享。即使Redis窗口丢失，DSA原SQLite来源预算仍阻止额外请求。源数据失败不清除风险越界状态。当前选择的备选来源是来源身份，不能等同于陈旧回退；合格备选报价允许评估并保留实际来源和fallbackUsed。
- Desktop/Mobile沿用TanStack Query读取状态，显示标的当前本地名称、来源、最短请求间隔、上游更新频率未知、来源时间、获取时间、最早下一次窗口和具体等待原因；名称按完整代码批量本地投影，不查远程或改写冻结通知。来源协调心跳与风险处理心跳分开，不把旧状态当作在运行。

| 验证 | 最终结果与输入范围 |
| --- | --- |
| `node scripts/test-risk-source-dsa.mjs` | 40项通过，含真实标准Runtime+临时SQLite，成功/失败/重启预算、当前备选routeIndex=1、受限主来源零调用、身份/代次/来源改变拒绝与HTTP鉴权；随后DSA数据源码语法、统一能力边界、runtime打包输入和测试登记全部通过 |
| `node scripts/test-risk-monitoring-runtime.mjs` | 9项通过；48个migration、head `20261106030000_strategy_submission`，真实隔离PostgreSQL/Redis；新增规则→Market完整报价读取→日志→持久风险事件用例，不开页面；真实与模拟各一事件，仅真实入队一次，重启和重复协调不再发事件。DSA传输为受控响应，通知为mock |
| Server定向组合 | 103通过、12跳过（隔离测试另由专用脚本运行）；新增状态名称/时效测试1通过；最后身份/状态/需求组合11通过（与前述集合有重叠），符号或资产与计划不一致时在控制/预算/数据请求前拒绝；此前通知专项验证保持，未声称此次重跑全仓 |
| 消费合同 | Schemas新计划2通过；Desktop来源展示2通过，Mobile通过真实API-client解析1通过；Schemas/Domain/API-client构建通过 |
| 类型与构建 | 全Server `tsc --noEmit` 通过；生产源码单独编译通过；Desktop/Mobile typecheck通过；Desktop生产构建通过（既有大chunk警告保留）；完整Nest构建通过 |
| 门禁 | 新执行/展示代码ESLint complexity≤20通过；Server边界通过；`GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` 通过，6项存量警告未增长 |
| 浏览器 | 真实组件、真实样式、GET-only受控fixture于1440/1024/768/390逐项截图/DOM检查，横向溢出均false，来源和时间行完整、无16:05入口；viewport已恢复，临时页关闭，Vite5187已停止。不是目标部署页面或原生Mobile运行验收 |

DSA生产镜像本身没有pytest；脚本通过只读挂载已有本地venv中的纯Python测试工具，生产依赖仍由既有镜像提供。首次缺pytest失败未安装依赖；首次策略全对象断言受动态appliedAt影响，改为比较路由与修订；首次新闭环误期望仅一个事件，已更正为实际/模拟两事件且仅一条通知入队。编译发现新增可选字段的exactOptionalPropertyTypes不匹配，已修复后重跑通过。所有失败与日志保留于本机 `/tmp/risk-source-*.log`，没有将失败写成通过。

两个专用脚本只创建UUID隔离资源、复用本地镜像、不注入真实凭据或发送通知，不操作目标服务/volumes；DSA容器禁用网络，风险隔离环境仅使用受控DSA响应与通知mock；运行后均已清理。未执行目标sync/update，未构建生产镜像，真实上游时效、连接恢复和节假日仍无验收证据。当前目标有效规则0、旧任务0的只读事实不因代码完成而变化。

## 2026-11-27 目标后台报价验收

19:08 至 19:09（中国标准时间），在目标 Server `390afbd9878b` 和 DSA `71f05951ed19` 核对真实选源与后台资格，两个容器均为 `healthy`。通过 DSA 只读控制快照确认 Desired 与 Effective 均为修订 203，随后使用目标 `POST /api/v1/thesis-ledger/market/background-quote/plan` 验证每条现行报价路由。以下主备目标在普通报价路由均为 `eligible=true`；各计划返回 HTTP 200、`acquisition=blocked`、`reason=background_budget_unverified`，采集间隔与源更新周期均为空。

| 报价范围 | 样本 | 主来源 | 备用来源 |
| --- | --- | --- | --- |
| 沪深 ETF | `510300.SH` | `hithink/fund-market-snapshot` | `akshare/eastmoney` |
| 沪深股票 | `600519.SH` | `hithink/a-share-prices-snapshot` | `akshare/eastmoney` |
| 港股 | `00700.HK` | `futu/futu` | `yfinance/yfinance` |
| 香港 ETF | `02800.HK` | `futu/futu` | `yfinance/yfinance` |
| 美股 | `AAPL.US` | `futu/futu` | `yfinance/yfinance` |
| 美国 ETF | `SPY.US` | `futu/futu` | `yfinance/yfinance` |
| 美国指数 | `^GSPC.US` | `yfinance/yfinance` | 无 |

- HiThink 与富途均已配置凭证。目标来源注册未为这两个适配器提供逐功能账户报告，后台能力以实际计划返回为准，无法据普通快照资格推断常驻额度或订阅权。公开腾讯报价来源已启用，后台合同允许选中的腾讯沪深 ETF 进入公开快照采集，策略 203 未选腾讯。
- 使用 `510300.SH` 当前计划及 `generation` 调用实际 `POST /api/v1/thesis-ledger/market/background-quote`。首轮返回 HTTP 503，诊断脚本读取顶层错误字段时未能提取稳定码。改按 `detail.code` 读取后，复验请求 `target-background-execution-20261127-510300-recheck` 用时 34 毫秒，返回 HTTP 503 `not_admitted`，无报价。执行入口在调用上游前拒绝，34 毫秒是拒绝响应时间。
- Server 的 `GET /api/v1/risk/monitoring` 和 `GET /api/v1/risk/rules` 均返回 HTTP 200。风险处理与采集协调心跳正常。2 条生效规则均绑定策略应用，分别为成本止损与最长持有期，独立后台报价需求为 0。19:09:27 Redis DB 0 的采集状态 `sources=[]`，后台尝试键及最近样本键均未查到。没有 `sourceTime` 或 `fetchedAt` 可计算时效。
- 当前目标 Server 的后台执行产物包含市场会话判断及 Redis `SET NX` 尝试窗口。600 秒是符合准入的腾讯公开快照计划的请求间隔；当前 DSA 的 `claim_provider_request_budget` 为兼容空操作。旧记录描述的 DSA SQLite 二次预算保护属于原实现。
- 本轮已完成选源、准入与负向执行验收。后台实源请求 0 次，配置、规则与通知均未修改。正向实源时效仍由 R5 持有，须在已选来源获后台资格并有实际报价需求的交易时段，核对记入采集状态的来源时间和获取时间。

## 2026-11-27 三家来源权限与配额

- **HiThink**。19:16 使用目标保存凭证（配置版本 9、凭证版本 1）各读一次 `600519.SH` 股票快照及 `510300.SH` ETF 快照。两次均 HTTP 200、业务码 0、返回 1 条匹配记录。请求编号分别为 `80b6f0ac2fb644629db8fbc81864dcb7`、`53a28e63a2de43139d272a6c1eb9a3eb`。两次均返回 `X-RateLimit-Limit: 15`、`X-RateLimit-Remaining: 15`，未给出窗口单位、重置时间或额度共享范围。公开接口资料说明限流码 4001，未查到这两个快照的计量窗口，后台额度保持未验证。[同花顺接入文档](https://fuyao.aicubes.cn/docs/quickstart/)
- **富途**。19:16 至 19:17 从目标 DSA 使用现有 OpenD（配置及凭证均为版本 1）读取权限及订阅用量。OpenD 10.12、SDK 10.8.6808，行情登录为 READY。港股 LV2、美股 LV3。OpenD 全连接普通行情订阅已用 0、剩余 300。本批采用现有快照接口，未占用订阅槽位。快照协议公布每 30 秒 60 次，每次最多 400 个标的。DSA 现有适配器继续单标读取，同一 DSA 进程内按 OpenD 端点对报价和市场状态快照共享 60 次滑动窗口。富途服务仍管理其他客户端的配额。[富途快照接口](https://openapi.futunn.com/futu-api-doc/en/quote/get-market-snapshot.html) · [富途权限及配额](https://openapi.futunn.com/futu-api-doc/en/intro/authority.html)
- **Yahoo**。目标使用无账号凭证的 yfinance。Yahoo 服务条款要求使用自动化方式采集前取得明确许可。本轮未取得当前接入的自动化授权和对应配额，保持后台未准入。Yahoo 上游权限试探为 0 次。[Yahoo 服务条款](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)

富途账户许可通过正常「检查功能权限」写入相同端点的账户报告。后台计划仅考虑当前选中且普通资格可用的富途港美股票和 ETF，查验对应的账户报告。实际快照前用同一 OpenD SDK 连接复核该市场的权限。股票／ETF 的 Server 共享请求窗口沿用 15／600 秒，上游更新频率保持未知。

## 2026-11-27 富途目标接入

- 本地 DSA 定向 153 项通过，覆盖已有富途普通报价、后台权限复核、滚动配额、账户报告和 TickFlow 权限回归。初次有两条富途旧报价测试把宿主平台初始化子进程计为 SDK 请求。通过未改动的 HEAD 独立复现，收窄测试替身到实际富途 worker 后重跑通过。主仓 Schema 3 项、Server 14 项通过，Schemas／Domain 构建与 Server 类型检查、构建通过。
- 19:28 在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `DSA_SOURCE_DIR=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis THESIS_LEDGER_SOURCE_DIR=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger ./scripts/sync-code.sh all`，退出 0。DSA、Server、Worker 均健康，镜像和外部卷保持。DSA 权限、额度、计划三份源码，以及目标 Server 的协调器和已安装 Schema 文件与宿主摘要一致。更新使用容器可写层。
- 19:28:52 通过 `POST /api/market-data/providers/futu/test` 的 `account_access` 检查请求 `target-futu-background-entitlement-20261127`。HTTP 201、`persisted=true`，港股股票及 ETF、美股股票及 ETF 共四项均为 `allowed`。从目标编译版 Server 读取 7 类后台计划，核对策略修订 203 及主备来源和原顺序一致。前述四类为 `account-snapshot`，HiThink 两类和 Yahoo 指数仍为 `background_budget_unverified`。
- 19:29:52 使用目标已部署的 Server 后台协调器、真实 DSA 计划与交易日历、隔离进程内状态验证四个样本。港股及美股均返回 `outside_market_session`，报价和额度预约调用均为 0。实际风险监控接口后续读取心跳正常，仍有 2 条生效规则，`sources=[]`。真实盘中报价样本及延迟尚未取得。
- 目标交易日历显示美股下一常规会话为中国标准时间 11 月 27 日 22:30 至 11 月 28 日 02:00，港股下一常规会话从 11 月 30 日 09:30 开始。盘中验收沿用现行配置和已保存权限，用股票及 ETF 样本通过后台计划和执行入口，核对 `sourceTime`、`fetchedAt`、来源和共享缓存状态。[美股提前收市日历](https://www.nyse.com/trade/hours-calendars)

## 2026-11-27 富途美股盘中时效验收

北京时间 22:31，目标 Server 的 `MarketSessionReader` 确认处于美股常规会话。使用已部署的 `MarketBackgroundQuotesService`、`MarketQuoteReader` 和真实 DSA，隔离进程内缓存和请求窗口，依次读取 `AAPL.US` 与 `SPY.US` 各一次。两项均命中策略 203 首选 `futu/futu`，DSA 日志按请求编号确认各有一次成功的富途 Provider 调用。

| 标的 | 来源时间（北京时间） | 获取时间（北京时间） | 来源至获取延迟 | Server 调用 DSA 用时 | DSA 请求编号 |
| --- | --- | --- | ---: | ---: | --- |
| `AAPL.US` | 22:31:00 | 22:31:01.538178 | 1,538 毫秒 | 1,349 毫秒 | `693c395e-3b80-4784-a09f-4b601ffc9d37` |
| `SPY.US` | 22:31:02 | 22:31:03.002721 | 1,002 毫秒 | 1,274 毫秒 | `79ffb752-9096-497c-a0b4-2eefe5626c0c` |

- 来源至获取延迟为 `fetchedAt - sourceTime`，按验收程序的毫秒精度记录。DSA 实际 Provider 调用分别用时 1,207 毫秒和 1,128 毫秒。两笔均为 `account-snapshot`、`sample_observed`、`freshness=live`、`servedFromCache=false`、`fallbackUsed=false`。
- 开市前、执行前后核对有效策略内容及目标顺序一致。业务规则与共享采集状态未注入样本。目标风险监控接口实测返回 HTTP 200，两个心跳均正常，仍有 2 条生效规则，`sources=[]`。本次通过范围为两个美股标的的一轮目标后台实源采集，持续采集覆盖由 R5 继续跟踪。

## 2026-11-27 HiThink 与 Yahoo 后台配额复核

- **HiThink 官方口径**。维护者确认服务不限制累计调用次数，同时实施个人和全局限流。全局容量随实时负载变化。公开快照说明、归属主站的 API Key 管理公开页面及开发者仓库未给出当前个人额度的计量窗口，也未确认股票和 ETF 快照是否共享该额度。[官方累计请求说明](https://github.com/Hithink-Tech-Org/Financial-API/issues/10#issuecomment-5390206606) · [官方快照限流答复](https://github.com/Hithink-Tech-Org/Financial-API/issues/80#issuecomment-5661260611)
- **HiThink 当前凭证复验**。23:17 至 23:18（中国标准时间），在目标 DSA 用配置版本 9、凭证版本 1 做两轮顺序小样本，分别以股票→股票→ETF→股票和 ETF→股票→ETF→股票读取，每轮 4 次。8 次均 HTTP 200、业务码 0。各响应的 `X-RateLimit-Limit=15`，余额依次为 `15 / 15 / 14.9 / 15` 及 `15 / 15 / 14.81 / 15`。两个余额下降回包的请求编号为 `db73712c68a44b329715a59cd6d30bab`、`350db2b08a6f476eb64d1b2730c8d107`，均为紧随股票请求的 ETF 请求。响应未携带单位、重置时间或共享组。该结果验证了余额会变化，个人额度的补充速率及跨接口共享边界继续等待官方证据。
- **Yahoo**。目标 yfinance 无专用凭证。Yahoo 服务条款要求自动化采集事先获得明确许可。公开开发者 API 目录未列出 Finance 行情接入，Finance 订阅说明的历史数据导出适用于页面下载。当前接入仍缺自动化授权与对应上限，Yahoo 行情请求 0 次。[Yahoo 服务条款](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html) · [开发者 API 目录](https://developer.yahoo.com/api/) · [Finance 订阅说明](https://help.yahoo.com/kb/finance-for-web/investment-insights-sln29276.html)
- **目标回读**。策略修订仍为 203。沪深股票和 ETF 保留 HiThink／AkShare 顺序，美股指数仍为 Yahoo。三类后台计划均返回 `background_budget_unverified`。港股盘中验收按用户确认移出本批。

## 2026-11-28 HiThink 动态限流接入

- 同一 DSA 进程内，以有效 API Key 区分本地预算。股票和 ETF 的交互及后台精确快照都通过该预算，同一凭据同时只发一笔。根据响应中的 `X-RateLimit-Limit` 和 `X-RateLimit-Remaining` 处理额度，保留分数余额。HTTP 429 或业务码 4001 使用 `Retry-After`，支持秒数和 HTTP 日期。额度不足或被限流且无有效提示时，使用 1 至 60 秒的本地指数退避，到期放行一次探测。上游计量窗口、快照更新间隔及上游是否跨接口共享继续保持未知。
- DSA 定向 154 项通过，含两端点共用余额、低余额成功回包、429 非 JSON、业务码 4001、两种 `Retry-After`、提示缺失时的恢复间隔、不同凭据隔离及后台选路代次固定。数据闭包语法、统一能力边界、运行时打包和测试登记检查通过。主仓 Schema 5 项、Server 14 项通过，完成 Schema 构建、Server 类型检查及 Server 构建。限流分支用受控回包验收，目标未主动触发真实限流。
- 北京时间约 01:29，在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `DSA_SOURCE_DIR=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis THESIS_LEDGER_SOURCE_DIR=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger ./scripts/sync-code.sh all`，退出 0。DSA、Server 和 Worker 均健康。目标 HiThink 适配器、共享预算、后台计划和 Server 已安装 Schema 的 SHA-256 与宿主一致。更新位于容器可写层，容器重建将恢复镜像内代码。
- 北京时间 01:29:10，从目标 Server 读回策略 203。前后股票和 ETF 均为 HiThink 首选、AkShare 备用；`^GSPC.US` 继续用 Yahoo，后台计划仍为 `background_budget_unverified`。使用已部署的后台协调器、真实 DSA 计划及交易日历、隔离进程内状态，核对以下结果。

| 标的 | 后台计划 | 当前首选 | Server 请求间隔 | 本次采集 |
| --- | --- | --- | --- | --- |
| `600519.SH` | `account-snapshot` | `hithink/a-share-prices-snapshot` | 15 秒 | `outside_market_session` |
| `510300.SH` | `account-snapshot` | `hithink/fund-market-snapshot` | 600 秒 | `outside_market_session` |

协调器报价和请求额度预约均为 0 次，来源时间与获取时间为 null。按用户确认取消 A 股盘中时效验收，两笔盘中样本未采集。上一轮的 8 次 HiThink 探测保留为接口与额度回包证据。
