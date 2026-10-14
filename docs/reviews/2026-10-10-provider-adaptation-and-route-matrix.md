# 全来源适配差异与功能路由矩阵

本报告是统一数据能力适配层的来源检查与路由映射正文。设计和进度仍由[原 Spec](../specs/2026-10-09-unified-data-capability-adapter.md)和[原 Task](../tasks/2026-10-09-unified-data-capability-adapter.md)维护。首次检查日期：2026-10-10；最近实施增量及文档对账：2026-10-14。静态检查已经覆盖当前产品声明、精确库存、绑定和实际消费者；账户运行结果按独立层次记录，不能由静态库存推定。

## 1. 检查输入与证据边界

2026-10-14 Tushare账户功能权限控制按原Task TA1～TA5完成。六个既有精确绑定分别检查`daily`、`hk_daily`、`fund_daily`、`rt_k`、`cyq_chips`、`fund_div`；`purpose=account_access`与普通业务检查分开。可访问、缺权限、凭证缺失/无效和未知分别记录；来源功能说明、权限侧栏及路由候选消费同一标准记录，保留禁用条目和原因，明确缺权限显示“当前账户缺少权限”，未知显示“权限待验证”。来源拥有接口参数与错误解释，UI不根据积分、接口名或另一功能成功推定权限。每次最多6请求、单接口3秒、DSA总预算18秒、Server外层22秒，无重试；当前配置报告仅在内存保留5分钟，绑定凭证/有效端点/配置代次，变化、过期或重启失效；草稿隔离，不额外保存凭据、启源或修改主备。[实现与分层验收](2026-10-14-tushare-account-capability-access.md)。

该增量已完成正式代码同步、实际页面及`update.sh all`镜像固化复验。镜像后实际Server账户检查HTTP201返回6项`credential_missing`、`attempted`合计0；Tushare仍停用/未配置/configVersion=0，策略126/16路线保持，20来源/143精确目录完整，5容器健康、6卷及10个DSA生产文件摘要核对通过。[镜像及实际接口证据](2026-10-14-tushare-account-capability-access.md#镜像固化与剩余条件)。这证明权限控制链路与缺凭证零请求行为，不是新账号的供应商成功或现金消费验收；原`daily`成功及`fund_div/fund_daily/rt_k`权限拒绝只按原账号、原接口范围复用。RQ `K37c-live`与Tushare `K37e-live`仍受外部账号/权益条件阻塞，K37父项保持开放；本次文档对账未重跑验收或请求供应商。

2026-10-14 TickFlow免费历史现为独立显式连接`tickflow-free`/`tickflow-free-history`，三个沪深A股日K复权绑定，原完整服务四绑定保持；库存20连接/143目标。六组实源、80原价OHLC与腾讯参照一致、实际新研究/独立费用及权益复算、页面下载和新旧断网重放通过。量数值相差100倍、成交额存在-50～43元差异，单位及调整锚点/历史可见性限制保持。取消紧张期1个底线后按缺口只退役1个旧DSA回滚，宿主21731MiB/Docker23494MiB达到构建前目标；正式update.sh dsa退出0，新镜像d9cdba416f1f…、源码/基线/6卷及新旧重放复验通过，镜像固化完成。[本轮证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-tickflow-free-history)，当前进度归原Task TF-F；RQ/Tushare不重验。

2026-10-14登记资格Review修正按[现行K37-C](../tasks/2026-10-09-unified-data-capability-adapter.md#k37-c登记资格修正及镜像固化)分层记录：来源读取/适配证据保持；新v2在冻结交易截止按成交持有份额获得权益，旧已结算版本仅证明历史复现。实际登记日买入100份、应收8.8元及新旧重放/页面/下载通过；用户要求重试后正式update.sh all退出0，本地新镜像、实际模块和镜像后的新旧断网重放通过。五条事件共享事实表只去重，不宣称全历史自动核验；RQ/Tushare外部条件不重验。[本轮证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k37-entitlement-v2)，[镜像复验](2026-10-11-unified-data-capability-runtime-evidence.md#record-k37-entitlement-image-solidified)。

2026-10-13现金研究增量按[现行产品合同](../specs/2026-10-09-unified-data-capability-adapter.md#2026-10-13-普通现金研究产品合同)验收：HiThink普通读取/标准化/真实消费已通过，原进度2保持unknown，传输完整与历史覆盖未知分列；默认采用明确或具体核对记录，未知有效记录按显式假设使用，原文/问题/未采用和模型参数冻结。三证券五事件无对账差异、三个新研究Run、实际页面/两份下载、独立Decimal及新旧离线重放已过。RQ/Tushare实现完成、真实成功仍受外部账号/权益条件阻塞；东财现金普通研究按K37b-R独立完成（6次现金读取、五事件对账、三个新Run/断网重放及真实页面/导出）；RQ/Tushare外部条件仍未满足，K37父项保持开放。旧严格入口状态只描述兼容用途，不是新普通研究的前置。[完整证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k37f-research-v2)；当前任务由原Task拥有，不重写下方历史阶段记录。

DSA 的 `scripts/export_thesis_ledger_capability_inventory.py` 从当前manifest、精确库存、来源绑定、旧分支定位及实际消费者递归导出，不是第二份生产注册表。首次库存`/tmp/tl-cap-h12-current-inventory.json` SHA256 `49aa63ff52e4249603c99ee8f6fb1efb63742c9331dd085a4aa16a58dab1461b`：19个Provider/140精确目标/107组合分组/19来源定义/140绑定，329产品模块/335带摘要的DSA输入/66个Server消费文件。该次Provider声明和完整精确目标与H07最终库存相同，每个目标归一比较恰有一个binding；旧分支扫描只定位比较/守卫，不能逐条当作上游执行。各历史阶段库存仍见原Task。

2026-10-12 K38x阶段导出`/tmp/tl-cap-k38x-inventory.json`，SHA256 `407c4eee8910b9a052345ece6f5f42446d7a9270de7cc6956a696ccb47af6d49`：19来源/140目标/140绑定、333产品模块/339摘要输入/67 Server消费文件。该时点唯一登记合同及原目录修订1215469019685014保持；旧/tmp库存不可读，不声称完成原文件新旧比较。精确依赖、政策后置守卫、原研究日历和零量私有投影已来源绑定，2844限定回归及正式最小dsa同步通过。[阶段证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38x-research-frame-projection)。

前期K38z导出`/tmp/tl-cap-k38z-inventory.json`，SHA256 `38453cd532f5a0f1258c6fc4b870857e96b24e8b9b46b9b52eb0ec5fe3f2fe15`：19来源/140目标/140绑定、334产品模块/340摘要输入/67 Server消费文件。该时点身份/单位及manifest例外已迁移，2875限定回归和正式最小同步通过，19生产manifest迁移前/后/目标逐字段相等；原DsaClient两身份包/四错误路径通过，政策111/配置7/目录修订保持。当时待做的报价单位/标准结果已由后续aa/ab完成，真实资格、浏览器/全范围Review仍保留。[Y证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38y-research-instrument-binding)、[Z证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38z-manifest-source-facts)。

K38ac导出`/tmp/tl-cap-k38ac-inventory.json`，SHA256 `c8a7a16af5cc1b61d5c148d7a2d6c473b878ae38e56e4c3be881a8a79dda3f05`：19来源/140目标/140绑定、337产品模块/343摘要输入/67 Server消费文件。providers/exactRoutes/unifiedDefinitions与K38ab实际导出完全相等。报价强Schema隔离及两来源日线单位纯投影已实现，2946限定回归/正式最小同步通过；原客户端合格ETF完整窗68条fund-unit/CNY、交互五条单位省略/旧无覆盖拒绝、111政策保持。测试新provider沿原Runtime/图表形成标准单位，不进入生产目录。[报价证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ab-quote-result-schema)、[日线证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ac-daily-public-units)。

K38ad导出`/tmp/tl-cap-k38ad-inventory.json`，SHA256 `6792c75b62e043c6446d951d2fe8fd89bc25d38fc14a6fc81b134e106ba2a3fd`：19来源/140目标/140绑定、338产品模块/344摘要输入/67 Server消费文件；三登记视图与ac实际文件完全相等。来源五年计划归精确绑定，公共调度保持原覆盖/控制/总预算/冻结；2964限定回归和正式最小同步通过，原客户端合格单窗68条/原单位、111政策/配置7保持。[窗口证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ad-daily-window-plan)。

K38ae/af导出`/tmp/tl-cap-k38aef-inventory.json`，SHA256 `a3b96b479d93d255d82eba9f8da27f72390c5d1a136df9b0b085afbdba65c6b4`：19来源/140目标/140绑定、338模块/344输入/67 Server消费文件；三登记视图及全部消费文件与ad完全相等。查询绑定误声明订阅、非日线隐藏复权成员的实际注册缺口修复，270定向/3181限定回归与正式同步通过；目标140均query、四类订阅与72非法键拒绝/零工厂及数据调用，111政策/配置7保持。[注册证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38aef-registration-boundaries)。

K38ag导出`/tmp/tl-cap-k38ag-inventory.json`，SHA256 `50eb2cf14b8522d0727e13734b18a3af7bbaf4db56150307c0501a1ee2b17512`：19来源/140目标/140绑定、338模块/344输入/67消费文件；四视图与ae/af完全相等。同名同版本标准合同冲突拒绝实现，276定向/3188限定回归及正式同步通过；目标17合同组一致、冲突零工厂/数据拒绝，111政策/配置7保持。[合同证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ag-canonical-contract)。

K38ah导出`/tmp/tl-cap-k38ah-inventory.json`，SHA256 `1204a1c195b532719d1ac4af62f3d7b38854c01f384ba49a38b607258ddbdc44`：19来源/140目标/140绑定、339模块/345输入/67消费文件；四视图与ag完全相等。三工厂作用域的标准失败/安全错误和失败不缓存保持，110定向/3200限定回归及正式同步通过；目标两哈希/快照读取0/1/0、原DsaClient/Server报价、111政策/配置7保持。[工厂证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ah-factory-error-boundary)。

K38ai导出`/tmp/tl-cap-k38ai-inventory.json`，SHA256 `2685d548743dcae057536ea36d7cca9f283742e44c00ae5ca74e54fca3ef52ad`：19来源/140目标/140绑定、339模块/345输入/67消费文件，四视图与ah完全相等。来源拥有本地目录就绪检查，117定向/3214限定回归及正式同步通过；目标140匹配/就绪与前置观察相等/七哈希、原客户端目录140项/修订1215469019685014与报价、111政策/配置7保持。十二ready不等于覆盖/准入，独立公告功能仍原路径，实际资格/浏览器和最终Review保留。[就绪证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ai-local-source-readiness)。

2026-10-12 K38aj阶段库存`/tmp/tl-cap-k38aj-inventory.json`，SHA256 `2044c104ff7e4ff3e26bea644a12517b10a7a4fb86bf55154a9b6dd6f990e75a`，19来源/140目标/140绑定、339模块/345输入/67消费者，四视图与ai相等。RQ明确账号/身份准入拒绝准确投影not_admitted，77定向/3218限定回归及正式同步/三哈希通过。用户现有Tushare凭据仅草稿使用，代表报价实源报告API40203权限限制，不推断现金/日线或保存/启源；公告包诊断成功仍not_admitted，HiThink现金/东财现金及拆分原入口未获准入/attempted=false。111控制、目录及配置保持，[本轮证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38aj-rqdata-guard-errors-and-source-retry)。该段保留阶段时状态；公告/拆分准入与成功、H10真实UI及当前120恢复按下方最新记录，不沿用其浏览器阻塞。

导出进程拒绝 SDK/Fetcher 实例化、网络连接、子进程、数据库连接及文件写入；不会打开账户配置或保存凭据。对不存在的相邻 Server 显式标记消费者缺口。测试能力 ORDER_BOOK 不进入生产清单。原生分析的 `data_provider/__init__.py` 声明单独导出，其 DataFetcherManager 备用顺序不进入产品路由；产品对同一 upstreamSource 的重复包装也不能证明失败域独立。

静态证据入口（路径均相对各自仓库）：

- DSA：`src/services/thesis_ledger_provider_manifests.py`、`thesis_ledger_exact_route_inventory.py`、`thesis_ledger_market_v3_adapters.py`、`thesis_ledger_native_daily.py`、`thesis_ledger_current_data_route.py`、`thesis_ledger_event_v3_adapters.py`。
- 执行：`thesis_ledger_provider_runtime.py::_adapter`、`thesis_ledger_exact_bar_execution.py`、`thesis_ledger_quote_dispatch.py`、`thesis_ledger_current_data_execution.py`；现行目标由这些入口按来源绑定执行。
- Server：`apps/server/src/integration/dsa/dsa-data-capability-reader-v3.ts`、`dsa.client.ts`、`dsa-trading-status-v3.ts`、`apps/server/src/market/market-lifecycle-reader-v3.ts`、`apps/server/src/backtest/backtest-trading-status-snapshot-v3.ts`及执行/基础日期消费者。

目标只读 Provider 检查时间为 `2026-10-10T13:34:14.966Z`，通过原 Server `GET /api/market-data/providers`：HiThink 已启用、凭据已配置、configVersion=5；富途已启用、凭据已配置、configVersion=1；Tushare、TickFlow、Longbridge、Finnhub、AlphaVantage、RQData 均禁用且未配置。其余来源无需账户凭据且启用；它们的 credentialConfigured=false 不能解释为配置失败。这里未进行全来源上游请求，也未改变配置、路由、准入或凭据。

本次验证：

- 静态安全导出测试 6 通过，日志 `/tmp/tl-cap-h02-export-tests.log`。
- 日线、报价、规则、状态、基础日期、事件兼容组：22 个测试文件、313 通过，日志 `/tmp/tl-cap-h03-audit-regression.log`。
- 富途日线/报价/静态信息/每手、净值/披露/持仓、RQData/HiThink/Eastmoney 事件组：18 个测试文件、313 通过，日志 `/tmp/tl-cap-h03-nonbar-audit.log`。
- 两组均为隔离测试，含 SDK/HTTP fixture。未配置账户、当前取消的高级义务及未获授权配置没有被强行调用。此前已通过的真实切片不重开，历史数据按需获取中的退市消费门禁仍由该 Task 维护。
- H01/E05 真实原入口切源：510300.SH 的 2024-07-15～19、ETF 日线 qfq，HiThink 主源→腾讯完整备用→HiThink 恢复，三次均 5 个非缓存交易日、实际来源与索引明确。策略 74→75→76，HiThink 配置 3→4→5；最后 Desired/Effective 76/76、applied、非 stale。具体授权、CAS 恢复及冻结重放见原 Task §9.7。本次授权已执行完毕，不授权其他功能策略保存。
- 既有旧/新冻结结果各两次离线重放、10 资产、网络 0 请求；现有格式和上游修订未为目录迁移改写。H09新增真实组合/十产物及两次原Worker断网重放已通过，见[组合记录](2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-real-composition-freeze-passed)，本轮不重做。
- 单次独立功能目标验收 `c54d07ad-d4d5-4244-a2dc-0020306be900` 经用户另行授权完成：原 Server 的 DsaClient/Runtime 取得公告状态、风险、比例规则、BaoStock 基础日期和公告阶段；政策 76→77→78，原路由恢复并核对 applied/非 stale。600462.SH 阶段已知而覆盖不完整，未升级为 complete；BaoStock outDate 缺失继续 notProvided。详见原 Task §9.10；授权已执行完毕。
- 参数资格从绑定投影：BaoStock 仅 coarseST，公告仅细分风险；比例规则来源拒绝 exactPrices。目录无字段的旧行保持原序列化，资格不是任意证券/窗口覆盖证明。BaoStock 独立功能获取缓存有界、隔离政策/配置代次且重建消费身份；离线门禁见原 Task §9.11，不能据此宣称新组合冻结或浏览器验收完成。

2026-10-13本轮只补H10真实UI层并完成原义务对账：五保存/五消费、状态关闭0数据/风险1数据、原UI CAS恢复120/120；原16路线指纹、Provider2行摘要与公告版本2/拆分版本1准入保持。DSA179、Server/Worker各24个DSA模块与63市场Schema匹配。H09、公告现金、拆分已通过证据不重跑。K38o/p/q/r实现/合同/目标拒绝层及父项收口，缺账号不冒充源成功。[本轮直接证据及全部剩余正向条件](2026-10-11-unified-data-capability-runtime-evidence.md#record-h07-h12-final-obligation-reconcile)。

2026-10-12历史阶段（由上方2026-10-13普通研究记录替代）：当时K37承接东财现金未准入/未实读，RQ无账号、Tusharefund_div40203、HiThink身份准入/progress严格释义不足三live叶。它们不阻塞已通过的H08–H12机制；coverage=false/普通完整冻结限制仍独立。TickFlow免费历史端点未接入，SDK0.1.25仅确认可选api_key/base_url，免费复权/整窗等价仍未知；现行带Key绑定迁移完成，不自动改变来源模式。

## 2. 按来源总表

原19来源/140目标库存SHA256：`49aa63ff52e4249603c99ee8f6fb1efb63742c9331dd085a4aa16a58dab1461b`，属于首次导出的历史输入。下表按该导出及已完成TF-F的三个免费历史绑定更新为20来源/143目标；本次没有重新导出或取数，原摘要不冒充新库存摘要。绑定只表示代码接缝，账号/准入/实读/启用仍分别验收。

| Provider | 声明能力 | 精确目标数 / 分组数 | 新绑定数 | upstreamSource |
|---|---|---|---|---|
| `tencent` | DAILY_BAR, REALTIME_QUOTE | 6 / 3 | 6 | tencent |
| `hithink` | CASH_DISTRIBUTION, DAILY_BAR, REALTIME_QUOTE | 7 / 5 | 7 | hithink-financial-api, fund-market-historical, fund-corporate-actions-dividends, a-share-prices-snapshot, fund-market-snapshot |
| `baostock` | DAILY_BAR, DAILY_TRADING_STATUS, HISTORICAL_TRADING_STATUS, RISK_WARNING, SECURITY_BASIC_DATES | 7 / 5 | 7 | baostock |
| `official-states` | DAILY_PRICE_RULE, DAILY_TRADING_STATUS, HISTORICAL_TRADING_STATUS, LISTING_PHASE, RISK_WARNING | 11 / 11 | 11 | cn-stock-daily-suspension, cn-stock-risk-price-limits, cn-stock-initial-listing, cn-stock-delisting-period |
| `efinance` | DAILY_BAR, FUND_NAV, FUND_NAV_HISTORY, REALTIME_QUOTE | 10 / 6 | 10 | eastmoney |
| `akshare` | CHIP_SUMMARY, DAILY_BAR, FUND_HOLDINGS, FUND_NAV, FUND_NAV_HISTORY, REALTIME_QUOTE | 22 / 14 | 22 | eastmoney, sina, tencent |
| `pytdx` | DAILY_BAR, REALTIME_QUOTE | 2 / 2 | 2 | pytdx |
| `tickflow` | DAILY_BAR, REALTIME_QUOTE | 4 / 2 | 4 | tickflow |
| `tickflow-free` | DAILY_BAR | 3 / 1 | 3 | tickflow-free-history |
| `alphavantage` | DAILY_BAR, REALTIME_QUOTE | 2 / 2 | 2 | alphavantage |
| `finnhub` | DAILY_BAR, REALTIME_QUOTE | 2 / 2 | 2 | finnhub |
| `tushare` | CHIP_SUMMARY, DAILY_BAR, REALTIME_QUOTE | 6 / 6 | 6 | tushare |
| `yfinance` | DAILY_BAR, REALTIME_QUOTE | 16 / 16 | 16 | yfinance, yahoo-gme-share-window, yahoo-hk-share-window |
| `longbridge` | DAILY_BAR, REALTIME_QUOTE, SECURITY_LOT_SIZE | 13 / 9 | 13 | longbridge |
| `futu` | DAILY_BAR, REALTIME_QUOTE, SECURITY_LOT_SIZE, SECURITY_STATIC_INFO | 21 / 13 | 21 | futu |
| `official-rules` | HISTORICAL_PUBLIC_FEES | 2 / 2 | 2 | cn-stock-auction-fees, cn-stock-auction-fees-archive |
| `official-hk-rules` | HISTORICAL_PUBLIC_FEES, HISTORICAL_TRADING_STATUS | 3 / 3 | 3 | hkex-trading-fee, hk-stock-public-fees, hkex-00147-halt |
| `official-us-rules` | HISTORICAL_PUBLIC_FEES, HISTORICAL_TRADING_STATUS | 3 / 3 | 3 | us-section31-exchange-t2, us-stock-public-fees, nyse-gme-halt-observations |
| `official-dividends` | CASH_DISTRIBUTION | 1 / 1 | 1 | cn-etf-cash-notices |
| `rqdata` | 空声明（精确事件绑定独立保留） | 2 / 2 | 2 | rqdata |

各来源的实际结论：

| 来源 | 已有实现、差异与未迁移边界 | 证据与保留限制 |
|---|---|---|
| tencent | 当前产品五日线目标与一个ETF报价目标均已唯一绑定；未在产品精确库存登记的股票/指数原生分析报价不作为本次产品支持。前缀证券代码、日线日期及报价金额转换由来源处理。 | `data_provider/thesis_ledger_sources/tencent.py`、`tencent_native_daily.py`、registry/quote 测试；真实取得退市前价格不能证明最后交易日、跨源等价或 CN 股票研究消费资格。 |
| hithink | 七现行目标全部已唯一绑定：股票三日线、ETF专用日线、两快照报价与现金事件；各自复用原专用读取器。历史价格、快照和公司行动是不同上游，不能互换语义。 | ETF qfq专用读取/交互/请求元信息已来源绑定，Runtime旧helper与分派退役，原稀疏/单位/修订保持；`thesis_ledger_sources/hithink.py`、`thesis_ledger_hithink_etf.py`、`thesis_ledger_hithink_quote_runtime.py`、`thesis_ledger_hithink_event_v3.py`；精确Unknown thscode的1002分类保持。普通现金研究K37f-R真实读取/标准化、有限对账、新快照/计算/页面下载及重放已通过，progress=2和历史覆盖仍未知，默认具体事件核验仅有限样本，[现行现金证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k37f-research-v2)。旧严格入口[准入缺项记录](2026-10-11-unified-data-capability-runtime-evidence.md#record-20261012-event-admission-gaps)仅作兼容历史，不是普通研究前置。选定退市身份失败不推断整家，取消的M31/M32不恢复。 |
| official-hk-rules | 三个实际上游分别提供收费和特定停牌事实；三目标均已来源绑定并保留原区间/证券范围校验。 | `thesis_ledger_multimarket_rules.py` 与 multimarket rule 测试；00147 观察包不是全港股日级状态覆盖。 |
| official-us-rules | 三目标已来源绑定，公共收费、结算版本和GME停牌观察分别保留；不是完整美国市场历史状态源。 | 同上及 `data_provider/market_reference/us-gme-status.json`；观察窗口、市场时钟和 intraday 区间必须保留。 |
| official-rules | 当前/归档拍卖收费两目标均已来源绑定，读取的是原版本化证据包。 | `thesis_ledger_public_fees.py`、archive/routes 测试；政策生效期与观察期不能合并为 fetchedAt。 |
| official-states | 四个原聚合目标与七个独立功能目标共十一项均已来源绑定；原聚合wire/冻结语义保持，独立状态、风险类别、规则和阶段复用既有公告证据。 | `thesis_ledger_trading_status.py`、`thesis_ledger_status_dimensions.py`；旧结构混合是优先拆分点，不填充包未声明的否定事实。 |
| official-dividends | 原精确现金目标已标准事件绑定，动态修订为当前包字节摘要；每十份转每份、准入/安全/空窗语义与wire证据保留。 | `thesis_ledger_sources/official_dividends.py`、event_cash_contract_v1、event_execution_context_v1；同目标唯一登记。2026-10-12按授权将原510300.SH/2023-01-03～02-01准入续期24小时，版本2至北京时间2026-10-13 16:36:59，摘要/修订/原backup保持。K37a-live原Server每份0.064 CNY、新finalized快照9产物、两次断网一致/0网络及独立现金账通过；原观察时钟/PIT及基准partial边界保持，[新证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k37a-notice-live-renewal)。无公告/未覆盖不等于零分红，不产生价格调整因子。 |
| akshare | 十二项日线已迁移精确来源绑定，复用 Eastmoney/Sina/Tencent 单目标接口；ETF 报价已复用原单证券 4.5s helper 绑定；股票 Eastmoney/Tencent/Sina 三项也已绑定；Eastmoney 保留市场快照/缓存及有界两次请求，Tencent 原单标接缝，Sina 来源适配校验唯一响应身份。最新净值已按标准请求/结果绑定；普通历史净值也已标准绑定；持仓业务查询已标准绑定并保留年度空结果回看/未知披露与旧摘要，诊断也消费相同合同，Runtime旧持仓方法退役；筹码查询/诊断已标准绑定且SDK估算算法保持；原生分析指数报价保持自身路径。其 ETF 普通分析备用链与产品精确读取分离。 | `akshare_fetcher.py::get_daily_data_for_source`、`thesis_ledger_quote_dispatch.py`、NAV/holdings处理器及测试；东财现金K37b-R普通研究的实源/五事件对账/新快照/计算/展示导出/重放已通过，缺公告日/状态及覆盖未知保留，[现金证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k37b-research-v2)。拆分159516已通过两事实/真实信封/完成截止和离线消费，完整覆盖限制仍独立；旧现金未准入与首次拆分503/恢复113只属于[历史尝试](2026-10-11-unified-data-capability-runtime-evidence.md#record-k37d-split-apply-read-restored)。别名akshare不证明各能力可执行；DailyRead.frame保留原V3内部桥，标准wire独立校验；Sina默认由绑定声明，不自动选用户路由。 |
| efinance | 六项股票/ETF 日线已迁移来源绑定，保留原精确 SDK 请求与修订；股票/ETF 单标快照已绑定，股票失败不转全市场；最新净值已按标准请求/结果绑定；普通历史净值也已按独立序列合同绑定，精确研究/原文/冻结保持原路径。 | `thesis_ledger_sources/efinance.py`、`efinance_fetcher.py`、`eastmoney_fund_nav.py`；原 Native 六行登记已删除，旧内部 helper 复用来源实现，不重复执行。与 akshare 的 Eastmoney 包装仍为同一上游，不称独立备源；原快照缓存/限流与 ETF 冷却保持，缺失量额与单位未知不填零；股票本地适配修订 v2，上游修订保持。 |
| tushare | 股票CN/HK none日线、CN rt_k报价、筹码、ETF none日线及现金事件六目标已来源绑定，原计算/分页/身份/安全复核保持；普通工厂30s/5s、精确请求4.5s与原缓存保持。新增独立账户检查用途，由来源定义六接口参数及错误解释，标准访问记录用于功能说明、权限侧栏和路由禁选原因；6请求/18秒及5分钟配置绑定缓存与普通读取分开。 | `thesis_ledger_sources/tushare.py`、`tushare_http_client.py`、`tushare_account_access.py`及通用账户合同/执行器；原读取与新增权限控制定向、实际页面、正式镜像和真实缺凭证路径通过，目标仍停用/未配置/版本0，未新验供应商账号。[账户控制验收](2026-10-14-tushare-account-capability-access.md)。原账号daily成功、rt_k及fund_div/fund_daily精确权限拒绝继续按[原接口证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-20261012-exact-entitlement-audit)复用；HK权益/配额、基金接口门槛冲突和vol单位/原始时间边界保留。权限控制完成不代收K37e-live真实现金消费。 |
| tickflow / tickflow-free | 原完整服务三项 CN 股票日线与单标股票报价已绑定，原Key/工厂/缓存/probe及报价修订v2保持；另显式登记免费沪深A股三日线绑定。 | `thesis_ledger_sources/tickflow.py`、原 `tickflow_fetcher.py`及`tickflow_free_history.py`；完整服务账户未验证。免费连接固定free-api/空Key，三个复权有限样本、正常新研究及重放通过；日线原量额/未知单位保持，调整锚点/历史可见性未知。正式最小DSA镜像已固化并复验。[当前免费证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-tickflow-free-history)；[历史模式差异核查](2026-10-11-unified-data-capability-runtime-evidence.md#record-20261012-exact-entitlement-audit)。 |
| pytdx | 沪深股票 none 日线已迁移单目标来源绑定，报价已通过原 session 单标接缝绑定，响应身份/市场校验及上下文释放保持；BJ 在精确读取时明确拒绝，不从六位代码猜测覆盖。 | `thesis_ledger_sources/pytdx.py`、`pytdx_fetcher.py`；原 CN helper 复用来源投影，Native 登记已删除。缺失价格/量额保留未知，真实零保持；报价本地适配修订 v2，vol 字段重命名不能代替单位证明；无复权能力不能伪造 qfq/hfq。 |
| baostock | 三项既有日线已迁移来源绑定，旧聚合状态已标准绑定且原响应保持；三项独立绑定分别执行日级状态、粗 ST 和独立基础日期。新日期响应不附着状态或价格覆盖。 | `thesis_ledger_baostock_daily_status.py`、`thesis_ledger_baostock_lifecycle.py`、status_source/tests；outDate 不等于最后交易日，isST 不证明细分风险警示、价格限制或整理期规则。 |
| yfinance | 七项 qfq 日线和两项 Share none 参考窗口均由来源绑定唯一登记；七项股票/ETF/指数报价也已绑定。来源拥有下载参数、代码映射、MultiIndex 身份与工厂缓存。 | `thesis_ledger_sources/yfinance.py`、原多市场桥接、share-window 模块和 `yfinance_fetcher.py`；原下载参数及参考包读取保持，缺 amount 不合成。参考窗口不能证明当前在线覆盖；通用 qfq 与特定窗口原始价格不跨口径切换，未验证窗口不继承固定资产覆盖。 |
| futu | HK/US 股票/ETF none/qfq/hfq 十二日线、四报价、四当前资料和 HK 每手均由来源绑定唯一登记。 | `thesis_ledger_sources/futu.py`、原 `futu_market.py`/`futu_query_worker.py`/`futu_daily.py`；隔离预算 4.5s、完整分页、报价时钟及 finally 释放保持。一次执行响应不等于 SDK 页数，原 worker 不导出内部页数。当前资料保留精确整数/未知及历史未核验，不充当历史基础日期。未增加权限、分钟、订单簿或订阅范围。 |
| longbridge | HK/US 股票/ETF none/qfq 八目标已迁入来源绑定；HK 每手和四项报价也已来源绑定，legacy/OAuth 工厂集中归来源拥有。 | `thesis_ledger_sources/longbridge.py`、原 `longbridge_fetcher.py`/OAuth CAS 仓储；probe 只读和凭据快照缓存保持。报价原接口仅验证单标身份，不额外证明股票/ETF 类型。未启用未配置账户不能用 fixture 称真实账户已通过。 |
| finnhub | US 股票 qfq 日线与单标报价均已绑定；日线纽约时钟/完整窗口及报价 strict/5s/去 US 后缀保持。 | `thesis_ledger_sources/finnhub.py`、原 SDK；工厂缓存/错误/缺字段保留。未配置未启用，真实权限、深度、时钟和配额未知。 |
| alphavantage | US 股票 none 日线与 GLOBAL_QUOTE 标准投影均已绑定；报价校验证券、缺值不造零，5s/sleep/strict 分类保持，本地报价修订 v2。 | `thesis_ledger_sources/alphavantage.py`、原 SDK；日级交易日期不冒充精确时钟，SDK 原生分析未改。未配置未启用；实际TIME_SERIES_DAILY/compact官方允许免费Key，当前无请求，只能判配置前置/实源未知；不把full/adjusted收费套给compact。[依据](2026-10-11-unified-data-capability-runtime-evidence.md#record-20261012-exact-entitlement-audit)。不扩张复权、真实权限或配额。 |
| rqdata | 原manifest能力空保留，现金/拆分两精确gated目标已标准事件绑定；来源拥有定义、原不可变账号工厂、凭据规则/修订与当前准入。 | `thesis_ledger_sources/rqdata.py`、`rqdata_event_capability.py`、原mapped_read/read/process/identity；30s/2000行、HMAC双核验、映射原文/币种和观察时钟保持，未证明上游分页/历史覆盖。当前未配置/未启用/未选路由，没有真实账号消费证据。 |

2026-10-13东财拆分验收记录（既有证据）：追加明确一次预算后，原版本1准入/936字节在该次读取时有效且一致；原CAS115→116后一次Server事件HTTP200/observed返回两条ratio=2事实，真实采集信封/实际完成截止及离线消费/0网络通过，恢复117、其他16路线/主备/配置保持。[分层运行证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k37d-split-clock-live-consumed)。驱动旧目录/appliedAt误拒绝的原修正、28项局部与正式同步复用，不再次构建/同步/重测。K37d-live仅该正向层收口，原503内因仍未知；coverage=false/普通完整冻结/Runner及父项仍独立受阻，解除须原完整窗口覆盖资格证据，不靠重复两事实/新账号或降低标准。该次Scope/准入/来源修订/Spec验收标准未扩，不据历史步骤续签、保存凭据或重做H09；该阶段库存未重导出，生产来源/绑定声明未改。

## 3. 按能力的适配与消费边界

账户接口访问记录是六个既有能力的控制元数据，不新增能力或生产目标。Tushare账户检查与业务`capabilityResults`分开；空列表的成功只证明本次接口请求被接受，不证明数据质量、历史覆盖或无分红。明确`2002`权限拒绝及带权限内容的`40203`由来源解释；超时、限频、坏响应等保持未知，不把全部失败归为缺权限。草稿检查不发布当前配置缓存，并行配置变化不发布晚到结果；页面不自动发供应商请求，已有主备选择保持。[现行权限合同](../specs/2026-10-09-unified-data-capability-adapter.md#2026-10-14-tushare-账户功能权限提示)。

原连接诊断参数也由同一来源定义拥有：HiThink三项固定SDK诊断、Tushare/TickFlow代表报价及Finnhub/AlphaVantage strict日线均有有限probe_policy。依赖adapter的诊断沿原cache=false/probe工厂，不覆盖正常查询缓存；HiThink原快照模式保持。K38g历史阶段2483项回归/1跳过及目标目录/原报价回归已过，四家账户的正向真实probe未全部实测；Tushare原rt_k拒绝及曾执行的daily/fund_div/fund_daily独立账号对照按各接口范围保留，未计作正向生产probe。[代码证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38g-migration)、[精确层级核查](2026-10-11-unified-data-capability-runtime-evidence.md#record-20261012-exact-entitlement-audit)。这些是原诊断用途的已测/未测范围，与新增account_access分开，不新增生产目标、订阅、准入或全供应商正向验收前置。

HiThink现金/股票的原宽manifest兼容已由来源有限catalog_manifest_policy拥有；报价仍严格匹配，Control以事件/精确能力事实判断而不豁免供应商。K38h历史阶段2660项回归/1跳过及目标目录/原消费对账已过；[证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38h-migration)。该阶段的环境凭据字段/方法等公共残留已由后续K38i完成，不作为当前待迁移事项。

K38i已将六来源环境字段/方法/最终快照迁入EnvironmentCredentialPolicy，保持原次数/异常/缓存与只读OAuth解析；隔离新provider环境快照无需改公共分支。154文件2691项回归/1跳过和目标86/86/配置/目录等价通过，[证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38i-migration)。原账号/probe可访问性未因此验证；当时尚开放的缓存及组合冻结门禁后来由H08/H09完成，当前责任由原Task维护。K38h当时的环境残留结论由本批实现取代，历史验证结果保持。

| 能力 | 已屏蔽的差异与现有参数 | 必须保留的事实 / 迁移缺口 |
|---|---|---|
| DAILY_BAR | 精确 symbol、市场、资产、1d、调整方式、start/end；来源方法处理路径、代码、字段、日期、分页。新绑定 DAILY 已有强类型请求/结果与相关性检查。 | 现行日线全部精确目标已通过来源绑定，原SDK参数/兼容桥保持；部分 volume/amount 缺少跨源单位合同，未知须保留。全窗单源、真实复权/数据时钟/字段缺失/覆盖证明不被字段重命名改变；价格备用不放宽 invalid_proof。 |
| REALTIME_QUOTE | 单标的身份、股票/ETF/指数、明确 upstreamSource；部分交易量/金额单位由来源转换，新腾讯 ETF 报价已有类型合同。 | 现行二十九报价目标均来源绑定，公共quote_dispatch不透传未登记SDK方法；源时间、抓取时间和延迟不等价。权限/快照/缺字段分别保留，不能从查询声明 subscribe。 |
| CASH_DISTRIBUTION | 现金/币种/每份单位、公告/登记/除息/支付日期、身份映射和原始事件证据。 | Eastmoney、HiThink、RQData 与官方公告逐来源资格独立；无事件不能当作 known-zero，基金映射和占位状态不能绕过。 |
| SPLIT_EVENT | 正比例拆分与生效日期独立于现金事件；已存在 Eastmoney/RQData 映射合同。 | 不能把分红转换为拆分，不借路径迁移改 sourceRevision；按来源覆盖和身份保留 unknown。 |
| FUND_NAV | 单位净值、累计净值、估值日期、披露可见时间有专有请求和验证。 | 净值不是 OHLC；估值时钟与披露时钟不可混同。普通实时读取与研究投影准入不同，不自动扩大研究。 |
| FUND_NAV_HISTORY | Eastmoney 原文、身份、研究日历/可见性、逐份净值历史有专用 V3 合同。 | 正常休市/无披露与缺失不可混合；原文解析 hash、可见性、QDII 规则及冻结证据必须保持。 |
| FUND_HOLDINGS | 最近披露持仓、查询年份、原始端点、观察时间、披露日期按 holding_rows 检查。 | 当前快照不证明历史 PIT；比例单位、资产类型和来源窗口必须明示，原 DataFrame attrs 迁到本能力元数据。 |
| CHIP_SUMMARY | 筹码结构有独立摘要/比例和时间参数，Akshare/Eastmoney 与 Tushare 各自读取。 | 不作为价格 K 线，不把原生分析 chip fallback 接入产品；真实权限与结构覆盖仍未知。 |
| HISTORICAL_PUBLIC_FEES | 固定版本收费/结算事实按市场、证券及区间校验。 | 生效日、证据日期和当前获取日分离；港美特定规则包不证明全部场景，六项现行目标已标准绑定并保留原范围。 |
| HISTORICAL_TRADING_STATUS | 旧响应携带日级状态、公告/结构化记录，且可能混含风险、价格规则、上市阶段、基础日期。 | 已实现下节五独立能力及版本化组合，旧聚合合同保持；每项独立覆盖和source/time/error，[真实新组合冻结及离线重放已通过](2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-real-composition-freeze-passed)，范围仍限该证券与窗口。BaoStock isST 不等于完整风险；摘牌日期不证明最后交易日。 |
| SECURITY_STATIC_INFO | Futu 静态标的身份、资产类型与字段已经独立验证。 | 静态/当前信息不能证明历史身份或上市状态，未提供字段保持缺失，不与价格覆盖拼接。 |
| SECURITY_LOT_SIZE | HK 每手整数与标准证券代码已有 Futu/Longbridge 独立处理器。 | 市场、账户可访问性与时效保留；不得默认为 100，也不将每手换算施加到无单位证据的日线。 |
| ORDER_BOOK（测试） | 两种结构、单位/时间、权限/错误隔离、强类型查询与订阅生命周期模型已测试。 | 不在生产目录，无真实行情、账户、订阅或页面；缺序列不宣称连续性，UI 合并不能丢重建增量。 |

库存之外实际正在消费的来源接缝：

| 入口 | 当前事实 | 拆分要求 |
|---|---|---|
| `api/thesis_ledger_announcement_runtime.py` → `cninfo_announcements.py` / `cninfo_announcement_query.py` | 实际取得巨潮公告正文；启用检查借用 official-states 旧状态路由，支持有界页数/预算和仓库存储。 | 公告获取与状态/风险/价格规则提取分离；按实际启用功能决定准备，不再因无价格规则而否定停复牌。公告原文、解析版本与冻结引用独立。 |
| `thesis_ledger_research_calendar.py` / `thesis_ledger_multimarket_calendar.py` / `thesis_ledger_nav_calendar_source.py` | 市场交易日历、exchange_calendars 发布输入和净值研究工作日是不同依赖，原发布版本/范围检查已经存在。 | 不伪装 Provider 行情；统一为独立依赖事实，保留市场、发布版本、覆盖及研究假设。只提供日历不能证明证券当天上市或成交。 |
| `api/thesis_ledger.py::_real_fx_rates` → `PortfolioService._fetch_fx_rate_from_yfinance` | 同币种 identity 和缓存/yfinance 汇率经现有数据库读取；请求方向、asOf、最大年龄及 unavailable 已有处理。 | 汇率能力独立于股票价格；后续关闭功能必须避免发起缺失汇率的上游获取。不能将股票 Provider 目录可用性直接套给 FX，历史时间/陈旧状态保留。 |
| `data_provider/__init__.py` → 原生 DataFetcherManager | 原生股票分析额外功能和备用链独立使用 Fetcher 类；与产品 Provider 有重叠但不共享产品路由意图。 | 保留产品范围外记录，不迁入产品事实或默认为订阅支持，不重写原生分析。 |


## 4. 逐来源与能力的精确组合

每行只合并同一来源、市场、资产和周期中实际登记的复权值，不生成笛卡尔积。当前每个目标恰有一个来源绑定。目录gated是兼容登记标记；实际读取是否要求人工准入仍由绑定及原消费守卫决定，不能把标记等同账号权限、窗口覆盖或消费资格。

| Provider / upstreamSource | 市场 / 资产 | 能力 / 周期 | 复权集合 | 路径 | 目录 gated 标记 |
|---|---|---|---|---|---|
| `akshare` / `eastmoney` | CN / ETF | CASH_DISTRIBUTION / — | — | 来源绑定 | 是 |
| `akshare` / `eastmoney` | CN / ETF | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 否 |
| `akshare` / `eastmoney` | CN / ETF | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `akshare` / `eastmoney` | CN / ETF | SPLIT_EVENT / — | — | 来源绑定 | 是 |
| `akshare` / `eastmoney` | CN / MUTUAL_FUND | FUND_HOLDINGS / — | — | 来源绑定 | 是 |
| `akshare` / `eastmoney` | CN / MUTUAL_FUND | FUND_NAV / — | — | 来源绑定 | 是 |
| `akshare` / `eastmoney` | CN / MUTUAL_FUND | FUND_NAV_HISTORY / — | — | 来源绑定 | 是 |
| `akshare` / `eastmoney` | CN / STOCK | CHIP_SUMMARY / — | — | 来源绑定 | 是 |
| `akshare` / `eastmoney` | CN / STOCK | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 否 |
| `akshare` / `eastmoney` | CN / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `akshare` / `sina` | CN / STOCK | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 否 |
| `akshare` / `sina` | CN / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `akshare` / `tencent` | CN / STOCK | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 否 |
| `akshare` / `tencent` | CN / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `alphavantage` / `alphavantage` | US / STOCK | DAILY_BAR / 1d | none | 来源绑定 | 是 |
| `alphavantage` / `alphavantage` | US / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `baostock` / `baostock` | CN / STOCK | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 是 |
| `baostock` / `baostock` | CN / STOCK | DAILY_TRADING_STATUS / — | — | 来源绑定 | 否 |
| `baostock` / `baostock` | CN / STOCK | HISTORICAL_TRADING_STATUS / — | — | 来源绑定 | 是 |
| `baostock` / `baostock` | CN / STOCK | RISK_WARNING / — | — | 来源绑定 | 否 |
| `baostock` / `baostock` | CN / STOCK | SECURITY_BASIC_DATES / — | — | 来源绑定 | 否 |
| `efinance` / `eastmoney` | CN / ETF | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 是 |
| `efinance` / `eastmoney` | CN / ETF | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `efinance` / `eastmoney` | CN / MUTUAL_FUND | FUND_NAV / — | — | 来源绑定 | 是 |
| `efinance` / `eastmoney` | CN / MUTUAL_FUND | FUND_NAV_HISTORY / — | — | 来源绑定 | 是 |
| `efinance` / `eastmoney` | CN / STOCK | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 是 |
| `efinance` / `eastmoney` | CN / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `finnhub` / `finnhub` | US / STOCK | DAILY_BAR / 1d | qfq | 来源绑定 | 是 |
| `finnhub` / `finnhub` | US / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `futu` / `futu` | HK / ETF | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 是 |
| `futu` / `futu` | HK / ETF | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `futu` / `futu` | HK / ETF | SECURITY_STATIC_INFO / — | — | 来源绑定 | 是 |
| `futu` / `futu` | HK / STOCK | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 是 |
| `futu` / `futu` | HK / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `futu` / `futu` | HK / STOCK | SECURITY_LOT_SIZE / — | — | 来源绑定 | 是 |
| `futu` / `futu` | HK / STOCK | SECURITY_STATIC_INFO / — | — | 来源绑定 | 是 |
| `futu` / `futu` | US / ETF | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 是 |
| `futu` / `futu` | US / ETF | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `futu` / `futu` | US / ETF | SECURITY_STATIC_INFO / — | — | 来源绑定 | 是 |
| `futu` / `futu` | US / STOCK | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 是 |
| `futu` / `futu` | US / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `futu` / `futu` | US / STOCK | SECURITY_STATIC_INFO / — | — | 来源绑定 | 是 |
| `hithink` / `a-share-prices-snapshot` | CN / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `hithink` / `fund-corporate-actions-dividends` | CN / ETF | CASH_DISTRIBUTION / — | — | 来源绑定 | 是 |
| `hithink` / `fund-market-historical` | CN / ETF | DAILY_BAR / 1d | qfq | 来源绑定 | 是 |
| `hithink` / `fund-market-snapshot` | CN / ETF | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `hithink` / `hithink-financial-api` | CN / STOCK | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 是 |
| `longbridge` / `longbridge` | HK / ETF | DAILY_BAR / 1d | none, qfq | 来源绑定 | 是 |
| `longbridge` / `longbridge` | HK / ETF | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `longbridge` / `longbridge` | HK / STOCK | DAILY_BAR / 1d | none, qfq | 来源绑定 | 是 |
| `longbridge` / `longbridge` | HK / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `longbridge` / `longbridge` | HK / STOCK | SECURITY_LOT_SIZE / — | — | 来源绑定 | 是 |
| `longbridge` / `longbridge` | US / ETF | DAILY_BAR / 1d | none, qfq | 来源绑定 | 是 |
| `longbridge` / `longbridge` | US / ETF | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `longbridge` / `longbridge` | US / STOCK | DAILY_BAR / 1d | none, qfq | 来源绑定 | 是 |
| `longbridge` / `longbridge` | US / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `official-dividends` / `cn-etf-cash-notices` | CN / ETF | CASH_DISTRIBUTION / — | — | 来源绑定 | 是 |
| `official-hk-rules` / `hk-stock-public-fees` | HK / STOCK | HISTORICAL_PUBLIC_FEES / — | — | 来源绑定 | 是 |
| `official-hk-rules` / `hkex-00147-halt` | HK / STOCK | HISTORICAL_TRADING_STATUS / — | — | 来源绑定 | 是 |
| `official-hk-rules` / `hkex-trading-fee` | HK / STOCK | HISTORICAL_PUBLIC_FEES / — | — | 来源绑定 | 是 |
| `official-rules` / `cn-stock-auction-fees` | CN / STOCK | HISTORICAL_PUBLIC_FEES / — | — | 来源绑定 | 是 |
| `official-rules` / `cn-stock-auction-fees-archive` | CN / STOCK | HISTORICAL_PUBLIC_FEES / — | — | 来源绑定 | 是 |
| `official-states` / `cn-stock-daily-suspension` | CN / STOCK | DAILY_TRADING_STATUS / — | — | 来源绑定 | 否 |
| `official-states` / `cn-stock-daily-suspension` | CN / STOCK | HISTORICAL_TRADING_STATUS / — | — | 来源绑定 | 是 |
| `official-states` / `cn-stock-delisting-period` | CN / STOCK | DAILY_PRICE_RULE / — | — | 来源绑定 | 否 |
| `official-states` / `cn-stock-delisting-period` | CN / STOCK | HISTORICAL_TRADING_STATUS / — | — | 来源绑定 | 是 |
| `official-states` / `cn-stock-delisting-period` | CN / STOCK | LISTING_PHASE / — | — | 来源绑定 | 否 |
| `official-states` / `cn-stock-initial-listing` | CN / STOCK | DAILY_PRICE_RULE / — | — | 来源绑定 | 否 |
| `official-states` / `cn-stock-initial-listing` | CN / STOCK | HISTORICAL_TRADING_STATUS / — | — | 来源绑定 | 是 |
| `official-states` / `cn-stock-initial-listing` | CN / STOCK | LISTING_PHASE / — | — | 来源绑定 | 否 |
| `official-states` / `cn-stock-risk-price-limits` | CN / STOCK | DAILY_PRICE_RULE / — | — | 来源绑定 | 否 |
| `official-states` / `cn-stock-risk-price-limits` | CN / STOCK | HISTORICAL_TRADING_STATUS / — | — | 来源绑定 | 是 |
| `official-states` / `cn-stock-risk-price-limits` | CN / STOCK | RISK_WARNING / — | — | 来源绑定 | 否 |
| `official-us-rules` / `nyse-gme-halt-observations` | US / STOCK | HISTORICAL_TRADING_STATUS / — | — | 来源绑定 | 是 |
| `official-us-rules` / `us-section31-exchange-t2` | US / STOCK | HISTORICAL_PUBLIC_FEES / — | — | 来源绑定 | 是 |
| `official-us-rules` / `us-stock-public-fees` | US / STOCK | HISTORICAL_PUBLIC_FEES / — | — | 来源绑定 | 是 |
| `pytdx` / `pytdx` | CN / STOCK | DAILY_BAR / 1d | none | 来源绑定 | 是 |
| `pytdx` / `pytdx` | CN / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `rqdata` / `rqdata` | CN / ETF | CASH_DISTRIBUTION / — | — | 来源绑定 | 是 |
| `rqdata` / `rqdata` | CN / ETF | SPLIT_EVENT / — | — | 来源绑定 | 是 |
| `tencent` / `tencent` | CN / ETF | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 否 |
| `tencent` / `tencent` | CN / ETF | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `tencent` / `tencent` | CN / STOCK | DAILY_BAR / 1d | none, qfq | 来源绑定 | 否 |
| `tickflow` / `tickflow` | CN / STOCK | DAILY_BAR / 1d | hfq, none, qfq | 来源绑定 | 是 |
| `tickflow` / `tickflow` | CN / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `tushare` / `tushare` | CN / ETF | CASH_DISTRIBUTION / — | — | 来源绑定 | 是 |
| `tushare` / `tushare` | CN / ETF | DAILY_BAR / 1d | none | 来源绑定 | 是 |
| `tushare` / `tushare` | CN / STOCK | CHIP_SUMMARY / — | — | 来源绑定 | 是 |
| `tushare` / `tushare` | CN / STOCK | DAILY_BAR / 1d | none | 来源绑定 | 是 |
| `tushare` / `tushare` | CN / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `tushare` / `tushare` | HK / STOCK | DAILY_BAR / 1d | none | 来源绑定 | 是 |
| `yfinance` / `yahoo-gme-share-window` | US / STOCK | DAILY_BAR / 1d | none | 来源绑定 | 是 |
| `yfinance` / `yahoo-hk-share-window` | HK / STOCK | DAILY_BAR / 1d | none | 来源绑定 | 是 |
| `yfinance` / `yfinance` | CN / ETF | DAILY_BAR / 1d | qfq | 来源绑定 | 是 |
| `yfinance` / `yfinance` | CN / ETF | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `yfinance` / `yfinance` | CN / STOCK | DAILY_BAR / 1d | qfq | 来源绑定 | 是 |
| `yfinance` / `yfinance` | CN / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `yfinance` / `yfinance` | HK / ETF | DAILY_BAR / 1d | qfq | 来源绑定 | 是 |
| `yfinance` / `yfinance` | HK / ETF | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `yfinance` / `yfinance` | HK / STOCK | DAILY_BAR / 1d | qfq | 来源绑定 | 是 |
| `yfinance` / `yfinance` | HK / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `yfinance` / `yfinance` | US / ETF | DAILY_BAR / 1d | qfq | 来源绑定 | 是 |
| `yfinance` / `yfinance` | US / ETF | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `yfinance` / `yfinance` | US / INDEX | DAILY_BAR / 1d | qfq | 来源绑定 | 是 |
| `yfinance` / `yfinance` | US / INDEX | REALTIME_QUOTE / — | — | 来源绑定 | 是 |
| `yfinance` / `yfinance` | US / STOCK | DAILY_BAR / 1d | qfq | 来源绑定 | 是 |
| `yfinance` / `yfinance` | US / STOCK | REALTIME_QUOTE / — | — | 来源绑定 | 是 |

## 5. 旧路由到独立功能的映射

以下是实现与迁移草案，尚未保存用户策略。原路由继续有效直至对应能力批次通过；迁移界面显示差异并由用户确认，以 expectedRevision CAS 保存。保留用户的主备顺序、最多两个目标、禁用状态及凭据；注册能力不自动加入路由。禁止按市场/资产/复权数组默认扩张。

| 旧路由 / 真实 upstreamSource | 独立能力与专有参数 | 可提供与不可推断的事实 | 用户意图与消费者 |
|---|---|---|---|
| HISTORICAL_TRADING_STATUS / baostock | DAILY_TRADING_STATUS（start/end）；RISK_WARNING（start/end，coarseST）；SECURITY_BASIC_DATES（symbol） | tradestatus 与 isST 分开投影，ipoDate/outDate 独立读 query_stock_basic；无细分风险、价格规则、最后交易日证明。 | 原目标顺序只投影到来源实际支持的功能；其余功能保持未配置。基础日期失败不掩盖状态有效值；完整风险需求仍不满足。 |
| 同能力 / official-states / cn-stock-daily-suspension | DAILY_TRADING_STATUS（start/end） | 公告覆盖范围内的停复牌状态/区间，不默认“其余天 trading”。 | 状态消费者按整能力要求采用；不自动增加价格规则目标。 |
| 同能力 / official-states / cn-stock-risk-price-limits | RISK_WARNING；DAILY_PRICE_RULE（start/end） | 明确的风险类别和每日限制；未声明字段 unknown，支持 noDailyPriceLimit 的明确理由。 | 相同上游可一次取证后分别投影，但结果来源/覆盖/失败各自归属；不建立重复抓取流水线。 |
| 同能力 / official-states / cn-stock-initial-listing | LISTING_PHASE；DAILY_PRICE_RULE（start/end） | 公告明确的初期阶段、起止与不限价原因；不是基础上市日期的新推定源。 | 保持已有上市阶段交易条件，不默认扩大证券范围。 |
| 同能力 / official-states / cn-stock-delisting-period | LISTING_PHASE；DAILY_PRICE_RULE（start/end） | 整理期/摘牌公告的阶段和规则，不从 outDate 推导最后交易日或摘牌后估值。 | 现有研究模型条件保持，未授权宽松协议停在边界。 |
| 同能力 / official-hk-rules / hkex-00147-halt；official-us-rules / nyse-gme-halt-observations | DAILY_TRADING_STATUS（start/end，区间事实） | 仅已观察的证券/窗口/日内停牌区间；没有日内序列则不能宣称全天已验证。 | 保留港美原区间解释与时钟，不能按全日停牌覆盖未观察时段。 |
| DAILY_BAR / 各现有精确目标 | DAILY_BAR 原 request，不加风险/日期通用可选字段 | 同口径整窗价格；原字段单位需在该来源合同证明后转换。 | 主备单责任与数量限制不变，invalid_proof 不删除。 |
| 已分离的 NAV/NAV_HISTORY/现金/拆分/持仓/筹码/静态/每手/收费 | 原能力专有 request / result | 不重新合并已有模型；来源模块拥有 SDK 与原始 DTO。 | 保持原合法未迁移路径，逐能力迁移，不能先将未迁移来源全部设为不可用。 |
| 公告/日历/FX 原依赖接口 | ANNOUNCEMENT_DOCUMENT / MARKET_CALENDAR / FX_RATE（独立后续子叶） | 原文、交易日、转换方向/日期是各自事实。 | 功能启停控制准备/获取；依赖与上层功能需求明确，功能关闭不新增上游工作。 |

三层控制由一份事实驱动：Provider 全局启用/凭据 → 精确功能路由 enabled → 已选主备。enabled=false 保留 targets，不新增 provider×capability 开关；缓存键与请求代次包含功能政策修订。请求开始和结果发布均检查相同代次，关闭后晚到结果不成为可消费缓存。新功能首次创建默认关闭；旧功能的缺省启用通过兼容解析表达，不能偷偷保存账户策略。

组合消费按功能拆开：状态、风险、规则、基础日期、阶段分别保留采用状态、来源、时钟、覆盖、错误和原始证据。配置可用但请求返回 unknown 不触发逐日拼源。价格始终全窗单源。风险/规则必需时缺失使对应计算拒绝；可选基础日期失败只保留警示，不替代其他字段。字段冲突保留显式冲突记录，不能用来源优先顺序无声覆写。

<a id="6-分批实施边界与验收"></a>
## 6. 分批实施边界与验收（历史阶段）

H06 分开共享合同、DSA 对应合同、政策启停/迁移兼容测试；H07 分别迁移状态/基础日期与公告投影、已稳定查询能力、原生日线、事件/NAV 等来源批次，公共 Runtime 不新增供应商分支。旧目标在批次迁移后从原登记删除，源修订沿用原值；真实语义改变另起版本。H08 再接统一启停执行与有界缓存失效；H09 用独立组合冻结版本记录新事实，同时旧版本离线重放；H10 再接功能 UI 与迁移预览。

2026-10-12阶段门禁记录（历史）：当时未覆盖未配置/未准入来源的真实成功消费、最终公共残留Review、界面的实际临时政策保存及对应消费、父项依赖及最终Review。五缓存功能代次、报价Provider配置及隔离失败、H09-K2真实组合/三可选失败/新冻结/两次原Worker断网一致已通过；两日指标partial及警示保留，数据快照complete。H10当时浏览器打开被工具权限拒绝，该阶段没有以API检查代替保存。这不是当前阻塞清单：后续H08～H12、HiThink/东财普通现金、TickFlow免费历史和TA均已按各自范围完成，当前仅保留原Task中的RQ/Tushare实源子项及K37父项。取消的严格PIT、M31/M32、专业Quote和盘口生产订阅不恢复。

以下段落全部保留各批次验证历史，其政策84、140目标、未迁移/浏览器拒绝或父项开放等措辞只描述对应阶段。当前代码与控制事实以上方2026-10-14增量及来源表为准，当前验收对账见§7、任务状态以[原Task当前摘要与§9.5](../tasks/2026-10-09-unified-data-capability-adapter.md#95-当前未完成执行包与阻塞)为准；不沿用旧授权或历史“尚未迁移”派发新工作。

公共费用六目标已按原精确组合迁移标准合同与三来源定义；现行140目标不扩展。六目标的标准输出与实际原读取器逐字段相同，原率/金额字符串、文档摘要、范围、进位/TAF/T+2规则保持，生产目录无隔离测试来源。旧聚合交易状态与公告/东财现金已在后续子叶迁移，当前本地目标移植完成，H07真实层及H08–H12未关闭。

旧聚合状态七目标已标准绑定，独立五能力、原读包/缓存/进程/基础日期/盘中语义保持；公共供应商分派和旧数据登记退役。已知日事实引用不与基础日期混用，盘中源全日状态保持unknown。原冻结与目标消费门禁仍独立核验。

公告与东财现金两个精确目标已来源绑定并共用一个现金能力合同。东财有界分页/元每份/观察时钟/观测摘要保持，标准wire无公告原文或完整覆盖；公告保留原文/准入完整覆盖证据。原四读取器摘要未变，生产目标140保持，该阶段未迁移五事件继续原执行。118文件1761通过、五文件事件兼容55通过；真实成功消费、浏览器、新冻结及H08–H12仍独立开放。

RQData现金/拆分两目标已迁移，现金继续共用原标准合同，拆分经济模型独立，固定事件信封共用；原wire/身份/账号/进程/未知覆盖保持。所有19个manifest和凭据定义同源派生，公共执行/当前准入/密码规则RQ特判退役，隔离新providerId复用字段规则无需公共分支。最终128文件1905通过/1跳过，三静态门禁及正式dsa同步通过；目标政策84/84及Provider状态相同。剩余东财拆分、Tushare/HiThink现金三事件待迁移，真实账号消费/浏览器/新冻结与H08–H12未关闭。

东财拆分已与RQ共用Split合同，沿现行公开正比例约束保留ratio1/小比例的原SPLIT标签、原登记日/明确映射/观察时钟和组合修订；RQ方向约束回归其源适配器。原四拆分模块SHA未改，公共generic事件尾段退役。131文件1946通过/1跳过、三静态门禁及正式dsa同步通过；目标84/84与Provider语义状态相同，当前无拆分路线，真实消费未验。现仅Tushare/HiThink现金两目标未迁移，H08–H12保持开放。

Tushare现金已复用同一个现金合同，原本地原文先验、政策/目录/账号顺序、多次安全复核、30s、原HMAC快照和缓存、实际Decimal HTTP/可见日保持；公共Runtime透传和当前准入分支退役。标准时钟精确比较保留1ns/1024位小数边界和原字节；不向其他无可见事实来源签发可见性。134文件2126通过/1跳过、三静态门禁及正式dsa同步通过，目标政策84/84与Provider状态相同。Tushare仍未配置/未启用/未选，无真实账号消费；现仅HiThink现金未迁移，H08–H12继续开放。

HiThink现金已标准绑定，原api_key/X-api-key、原文/全部标的范围/不可变HMAC快照/30s和金额/日期保留，公共最后现金分派退役。139文件2201通过/1跳过，四文件兼容71通过，三静态门禁/正式dsa同步通过；原五核心读取文件SHA相同。现行140精确目标全部本地binding移植且目标导入成立，政策84/84与Provider语义状态相同；现金主HiThink未准入、公告备用过期，未进行真实成功消费。移植数量不能代替H08配置/缓存、H09新冻结、真实来源与目标/浏览器等未覆盖门禁，H07总叶与H08–H12未关闭。

H08五类当前缓存已绑定原Data V3只读控制代次。共享94文件1039通过，Server单worker完整360文件2811通过/47文件217条件跳过，DSA受影响组2207通过/1跳过；控制定向新增环境凭据轮换和损坏状态拒绝。正式all同步通过且镜像保持，目标10次控制读取/零数据读取证明报价ready、其余四能力未选，政策84/Provider状态相同。真实缓存切代次、故障、来源数据成功消费、浏览器与新冻结未由只读投影替代，H08保持开放。

H10原路由界面已复用精确目录和公共客户端投影Schema，五独立功能可关闭并保留主备、编辑来源保留关闭状态、参数范围中文回显，保存携带显式CAS。共享95文件1043通过、Desktop134文件810通过，类型/build/严格受影响复杂度和边界门禁通过；真实浏览器连接目标API的草稿案例通过且已丢弃，目标仍84/独立功能0。实际保存与消费未执行，不能以UI证明H09新冻结。600519.SH两个预检窗口主源覆盖不足/备用invalid_proof未selected，未改现行研究合同或选择来源；原Task对应门禁保持开放。

## 7. AC13–AC20 当前验收对账

本表定位现有证据与未过门禁，进度勾选仍只在原Task；不以静态数量代替运行态或研究消费。H08～H12基础断言复用2026-10-13完成记录，TF-F和TA增量复用各自2026-10-14定向/实际消费及正式固化证据；本次只做文档对账，不把当时政策、目录数量、源码摘要或权限报告有效期当作新实时观察。

| 条件 | 当前直接证据 | 仍未闭合的范围 / 下一执行叶 |
|---|---|---|
| AC13 分阶段收口 | 原H01/E05、H07范围实现/全源检查及H08–H12分阶段证据完成；本轮H10真实UI与目标输入核对补齐 | 适用断言通过；主题仍有K37原显式正向义务，未归档/冒称所有任务完成 |
| AC14 全源逐能力检查 | 原19来源/140目标的唯一绑定检查已完成；TickFlow免费历史增量后20来源/143目标，TA镜像后实际目录complete/143。产品、内置、原生、测试及范围外分列，来源执行/依赖/修订按对应证据范围核对 | 检查完成；未配置账号/未选窗口准确未验证，免费模式、内部准入及供应商精确拒绝分层，不强行全量联网 |
| AC15 差异表真实 | §2来源、§3能力与§4精确组合保持单一库存；实现/迁移/权限/准入/实际消费/覆盖分开，原Task§9.5承接剩余责任 | 对账完成；gated不是付费判断，HTTP200/目录ready不等于正向成功 |
| AC16 独立选源 | 原五功能/手动主备及H09真实组合；H10实际UI保存和原Server5项消费通过。TA新增标准访问记录驱动六功能候选，缺权限禁选并保留原因，未知与凭证问题分别展示，已有主备不自动删改 | H10与TA各自消费范围通过；[原五功能证据](2026-10-11-unified-data-capability-runtime-evidence.md#record-h10-real-ui-save-disable-restore)、[权限控制验收](2026-10-14-tushare-account-capability-access.md)；不推定新账号有权限 |
| AC17 独立启停 | 原五缓存/配置/有界故障通过；本轮UI关闭状态119保留主备/其他4启用，原路由状态control-rejected/0数据，风险仍complete/1数据；原UI恢复120原指纹 | 适用层通过；不外推所有供应商故障或凭据旋转，当前CAS使用实时状态 |
| AC18 按需求处理 | H09原Builder/冻结/Runner合同及真实新Run：HiThink价格、BaoStock状态/日期、3公告可选失败分别冻结；数据快照complete/两日指标partial分别披露 | 原需求/冲突/必需缺失断言通过；CN备用invalid_proof、事件coverage=false与个别正向来源限制保持，非所有来源可生成完整快照 |
| AC19 冻结与兼容 | 原拆分映射、用户选择/缓存隔离、旧快照及新真实组合十产物/原Worker两次0网络一致；本轮复用拆分真实信封/完成截止/离线消费，UI120恢复原16路线 | 对应原断言通过；不重跑H09、不改原资产/策略或将两拆分事实推导完整覆盖 |
| AC20 全源缺口处理 | K38原140绑定的代码/合同/目标层对账、3218限定回归及179/24/63运行摘要匹配保留为当时证据，H08～H12适用机制已收口。后续HiThink/东财普通现金、登记资格v2、TF-F及TA按各自定向/消费者/镜像证据完成；目录增量为20/143 | K37父项与RQ K37c-live、Tushare K37e-live两子项仍未勾选，真实成功受账号/权益外部条件阻塞；HiThink与东财普通现金已通过。详见[唯一剩余责任](../tasks/2026-10-09-unified-data-capability-adapter.md#95-当前未完成执行包与阻塞)，不代收实源正向层或归档主题 |

### 7.1 AC01–AC12 接缝证据与层级边界

本表是同一Spec断言的证据索引，当前勾选仍由原Task维护。下表140绑定、3218回归、111/120政策及原源码摘要均是2026-10-12～13基础阶段的历史证据，新增TF-F/TA范围按§1和§7的对应记录对账，不将旧统计作为当前观测。2026-10-12核对全部140绑定共17种生产能力请求，均extra=forbid/strict；生产仅query。结果校验/实际消费需结合各能力的合同测试，不能只由可调用validator证明结果正确。日线内部DailyRead保留帧桥接，原Runtime整帧校验与公开Data V3/共享Schema构成结果边界；不虚称所有内部返回都是同一种Pydantic模型。

| 断言 | 当前证据与责任边界 |
|---|---|
| AC01 既有日线/非K查询闭环 | 原A/B闭环、H07逐能力源路径测试及真实选定ETF/报价消费；当前扩大全集按限定文件集合3218通过，不替代全部账号实读 |
| AC02 单一登记及坏绑定拒绝 | 安全库存140目标/140绑定、三视图等价；重复/缺处理器/版本/操作/隐藏口径及同版本合同分叉负测、目标四类/72坏键/合同冲突拒绝，工厂不执行 |
| AC03 新provider只改来源与注册 | 原capability_registry新provider经隔离SQLite→Runtime/Gateway→HTTP；K38aa单位、K38ac日线单位及K38ad不同计划仅测试声明，不新增公共供应商分支/业务代码 |
| AC04 语义/来源/字段隔离 | 原各能力关联与参数隔离；报价强结果/已报告别名、两来源日线单位、研究身份/零量及窗口纯策略。未知/原时钟/单位范围保留，真实账号与未选窗口继续未验证 |
| AC05 基础价格备用 | 原C01标准事实与消费需求、同口径整窗/手选及H01/E05实际切源恢复；CN股票invalid_proof不放宽，不以allowFallback单字段授予资格 |
| AC06 精确组合及拒绝 | 真实有效组合唯一登记；请求、操作、口径/深度负测；ae/af修复订阅冒认/隐藏口径。目录不推导独立参数数组的笛卡尔积 |
| AC07 新ORDER_BOOK | 原两种不同输入、共享JSON/强模型与关联/权限/单位/深度合同；当前生产17能力不含ORDER_BOOK，未建设真实行情产品 |
| AC08 订阅生命周期 | 原BookSession/BookSubscriptions取消释放、重同步、切源代次/旧消息、溢出与连续性未知合同；现有查询类不能声明订阅。纯状态证据不称真实连接验收 |
| AC09 权限/参数/凭据 | 原源工厂/快照/缓存/在途失效及盘口隔离，五缓存/HiThink配置和单次隔离故障实证；真实未配置账号/准入仍未代收，未自动保存凭据 |
| AC10 标准消费者与能力入口 | 原Market Reader/基础备用/业务消费边界检查，67消费文件在ab至ae/af间逐哈希相等；草稿/本地CAS及H10原浏览器五项保存/关闭/消费/恢复已过，原16路线恢复至实时120 |
| AC11 政策/目录/冻结 | 原111恢复/控制投影、十物理产物/旧结果/原Worker两次0网络重放；本轮源修订/Worker/冻结输入未变，不改Ledger或取消决定 |
| AC12 接入指南/诚实分层 | 指南/当前架构/本矩阵与原Task/支持记录同步；命令、失败过程、静态/fixture/目标/账号/浏览器分开记录。最终分层Review与适用断言对账通过，K37显式正向义务仍未全部通过，主题不归档 |

注册修复、范围内目标与字段边界详细过程见[ae/af记录](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38aef-registration-boundaries)、[报价结果](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ab-quote-result-schema)、[单位投影](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ac-daily-public-units)、[窗口调度](2026-10-11-unified-data-capability-runtime-evidence.md#record-k38ad-daily-window-plan)。其他原验收证据沿各Task叶和本表AC13–AC20引用，不复制全部历史过程。

Task§9.82–9.86进一步收敛公共层：来源拥有凭据修订策略/原认证载荷、有限报价Guard及准入reader；通用日线SDK死分支和不可达修订/报价目录fallback退役。140精确组合的修订及manifest匹配迁移前后逐项相同，公开SourceRevision不改。原HiThink/Tushare/RQ凭据字节、报价快照/预算/后置拒绝及Futu完整worker执行回归保留；这些代码证据不替代上述真实账号、政策代次或新冻结缺口。
