# 当前 Market、Backtest 与 Ledger 运行链

本页记录现行模块与消费边界。替换要求以[Spec](../archive/specs/2026-09-29-thesis-ledger-canonical-runtime-replacement.md)为准，运行验收以[Task](../archive/tasks/2026-09-29-thesis-ledger-canonical-runtime-replacement.md)及其证据为准。

## 接口与合同所有权

| 领域     | 当前入口                                                     | 合同与执行所有权                                                                                                            |
| -------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Market   | `/api/market/*`、`/api/market-data/*`                        | Market Reader 核验来源、时间、路由、准入和当前证据；Schemas 拥有公开响应与客户端投影                                        |
| Backtest | `/api/v1/backtests/runs`、`/api/v1/backtests/runs/nav`       | PostgreSQL 当前 Run 状态、attempt CAS 与有界恢复；Exchange/NAV 独立输入与执行；冻结读取守卫绑定配置、快照、模型、结果和 Run |
| Ledger   | `/api/v1/ledger/*`                                           | Ledger 命令、Repository 和投影只支持持久信封版本 3；账户经济事实与 Backtest SimulationLedger 分开                           |
| DSA      | `/api/v3/thesis-ledger/*`、`/api/v3/thesis-ledger/control/*` | 专属 Data/Control 当前合同；Provider 适配、SQLite 控制状态与原文证据留在 DSA                                                |

API Client 在传输边界解析响应并绑定请求 Run/Provider/Job 身份。Desktop 使用 TanStack Query 管理当前状态；Policy Desired 与 Effective、目录状态与同步任务分别显示，失败不变成成功或空集合。旧路径、旧 Run、旧 Snapshot 和旧 Ledger 行拒绝读取，不自动升级或重算。

## 业务消费

### 统一能力接缝

选定腾讯/HiThink 日线、腾讯 ETF 即时报价，以及 efinance、Akshare、BaoStock、pytdx、TickFlow、Alpha Vantage、Finnhub、Tushare、Longbridge、Futu、Yahoo 的选定既有日线已接入 DSA 静态 `CapabilityRegistry`；内部日线合同覆盖现行 STOCK/ETF/INDEX，INDEX 当前只有原 Yahoo US qfq 绑定。Yahoo 两项原 Share 参考窗口也分别绑定，复用原参考包与消费边界。BaoStock 与公告来源按独立状态、风险、规则、日期和阶段绑定标准查询合同。来源模块拥有定义、工厂、精确组合、适配器及修订；查找视图由同一绑定派生。工厂静态作用域区分能力专有实例和原 Provider 凭据版本缓存，保留 SDK 复用、原精确执行器的凭据验证实例及 probe 隔离；Tushare 的 HMAC 缓存条件与工厂探测预算由同一来源声明。Longbridge 原 OAuth 工厂使用内部可选数据库路径和原 CAS 刷新，probe 保持只读。执行继续经过现行 Control、Runtime、Market Reader 和 `DsaDataCapabilityReaderV3`，未迁移能力保留原入口。实现与运行态证据分别见[统一适配层 Task](../tasks/2026-10-09-unified-data-capability-adapter.md)。 Futu 日线保留原隔离 worker 与 4.5s 预算，一次完整响应计数不等于 SDK 页数；空 Native 生产接缝已退役，已迁移非 HiThink 日线检查复用同一标准处理器。 Futu 四项报价也由同一来源模块绑定，精确来源不匹配按绑定事实拒绝；报价检查复用标准证券代码与原 worker。 Futu 当前资料四目标使用独立强类型 QueryContract，HTTP/probe 同时校验请求和结果；内部 admission_required 分离原配置读取与目录 gated 标记，当前观察不证明历史变化。 HK 每手当前参考由 Futu/LB 共享标准 QueryContract，保留缓存时钟/观察摘要和历史未核验，不作为价格单位依据；公共读取不分支供应商。 Longbridge 四报价/Yahoo 七报价复用同一 QuoteBinding，内部 INDEX 只对应现行 Yahoo US 目标，原代码桥接/SDK结果/来源时钟保持。 TickFlow/Tushare/Finnhub/Alpha 单标股票报价均已绑定；TickFlow/Alpha 缺失量额由标准适配保留未知，真实零不变，本地修订与上游协议分别表达。

efinance 股票/ETF、pytdx 股票和 AKShare ETF 即时报价也已归来源绑定。efinance 股票只读原单标快照，保留 TTL 缓存/限流与 ETF 冷却；pytdx 使用原单标 session 并校验证券及市场，缺失量额和未证明单位保持未知。AKShare ETF 复用原 4.5s 单证券 helper；本地修订与上游修订分别维护。

AKShare 股票 Eastmoney/Tencent/Sina 三项报价已绑定，来源模块保留各自缓存、HTTP、熔断和错误。Eastmoney 一次适配调用可以有零次或最多两次 SDK 请求，内部市场分页未导出；Tencent 原成交量投影含启发式，不能当作单位已核验。Sina 适配器严格核对唯一响应封套，缺来源时钟仍为未知。旧无目标 smoke 的 Sina 默认只由对应报价绑定声明，显式用户路由始终严格匹配。

HiThink 两项快照报价已归来源绑定和工厂，SDK 字典由来源投影为标准报价结果，原修订/4.5s/单位/时钟/错误 retryable 保持。Runtime 使用 Guard 已核对的同一凭据快照，并再次核对政策/凭据代次；现行配置读取不要求旧人工准入。旧修订与枚举 helper 从绑定派生，所有现行报价均通过绑定执行，公共分发不透传未登记 SDK 方法。

最新基金净值 FUND_NAV 已由 AKShare/EF 两来源共享强类型请求、标准点/结果和关联校验。SDK 列名/DataFrame 仅在 Eastmoney 适配器处理，Runtime/API 消费标准结果；完整来源先校验再取最新、未来估值日仍拒绝。原分页/55s/错误与旧 API 形状保持。估值日及 UTC 兼容日期编码不表示公告可见时间，身份仅请求绑定、公告可见性未核验；历史净值仍独立原路径。

普通历史净值 FUND_NAV_HISTORY 也已由两来源共享独立请求/序列合同，复用标准点。完整 SDK 序列先验证、后截窗取尾，原报告日与 UTC API 边界顺序保持，API 无 SDK 列名。源错误与请求错误分别管理；SDK/原文和精确研究/冻结协议保持原路径。NAV 精确检查/smoke 现也复用同一绑定与合同，公共 Runtime/诊断的 SDK列名兼容方法已退役。适配器保留选择前最大报告估值日用于原检查未来日条件，不作为覆盖证明；精确 probe 的原样本日范围、独立工厂与缓存隔离保持，研究/浏览器/真实检查仍分别验收。

普通 FUND_HOLDINGS 查询已由 AKShare 精确绑定读取强类型持仓合同；来源适配器拥有原中文字段、季度、证券身份和百分比转换，完整序列先校验再选择最新季度。现有 API 只投影标准模型，旧权重排序、摘要和披露日未知保持。来源当前年/上一年空结果回看保持最多两次 SDK 调用，非空坏数据立即拒绝，不是切换来源；业务查询不再读取 DataFrame.attrs。精确检查/smoke 现也复用标准绑定，Runtime 原持仓 SDK透传/列名校验已退役；独立 probe 工厂和正常缓存隔离保持，SDK投影前错误沿原分类。目标未选持仓路由，真实消费仍待单独验收。

当前 CN/STOCK CHIP_SUMMARY 已由 AKShare/Eastmoney 与 Tushare 两个精确绑定读取同一标准估算摘要；来源适配拥有原 DTO、有限价格/成本区间/明确0–1比例/报告日和身份。两来源方法分别保留，不称原始持仓或跨源等价。原 SDK 算法与限流/年度或日历条件、Tushare工厂30s正常/5s检查、HMAC环境凭据缓存与控制快照不缓存保持；API删除按大于1猜比例，原字段和日期UTC回显保持，精确检查/smoke同合同。目录和测试不替代真实消费。

Tushare ETF none 专用日线已绑定同一现有日线能力，复用原精确SDK及4.5s/366日分段。原分段与完整头部验证归来源适配；DailyRead保留实际日期分段数，公共执行器删除ETF供应商特判，不修复坏证明。源传输完整不等于交易日覆盖，原量额转换保持。唯一精确组合可兼容旧分页证明省略复权，多组合仍须显式选择；完整证券代码保留至SDK身份核验。HiThinkETF专用路径已在后续子叶完成来源绑定。

HiThink ETF qfq专用日线现也由来源绑定执行，原完整/交互读取、日历/上市证据、稀疏交易状态及既有单位合同保持。Runtime专有closure/helper退役；公共日线执行与精确检查仅走标准绑定。来源请求元信息由DailyBinding派生，原修订/未知上游版本不变。错误保留code/retryable/安全diagnostics，交互来源不反向依赖Runtime；旧服务只投影来源错误。来源声明无目标准备工厂保留HiThink原凭据复核次数/错误边界，Tushare复核工厂缓存声明保留原HMAC缓存。其余未迁移能力继续原路径，冻结/研究门禁独立。

公共费用六个精确目标已使用费用专有请求/结果合同与三官方来源绑定，复用原只读包读取器、十进制费率、范围/原文/摘要和收费日政策。原参考数据分派优先标准费用处理器，已迁移目标/工厂旧登记退役；港美交易状态已在后续子叶标准绑定，底层原读取器保持。标准模型验证完整左闭右开分段、身份和文档引用后投影原V3 JSON，不推断历史可用性，不添加路由或费用/研究假设。原金额进位、TAF与T+2条件保持；真实目标/冻结门禁单独记录。

旧聚合HISTORICAL_TRADING_STATUS七目标已进入独立强类型请求/结果与来源绑定，复用原公告包、BaoStock隔离/历史缓存/基础日期和港美盘中读取。公共local_rule_operation供应商分派及七旧登记退役；独立五能力保持原模型/读取。标准结果核对逐日完整窗口、来源/文档/结构化引用、覆盖未知数组与独立基础日期；来源级守卫保留旧BaoStock基础记录口径和港美整日unknown。旧V3响应/冻结字段不变，不将outDate改为最后交易日、不扩大研究资格。

目录可选 `barQuery` 提供整窗查询语义，基础价格备用按该事实与消费者要求判断，仍核对保存目标、就绪、复权、政策及实际响应。CN 股票现行兼容证明边界保持。新字段先由主仓消费者支持，再更新 DSA；旧冻结目录不回填，目录变化不改来源修订或旧结果。

首次新能力的最小合同示例是隔离 `ORDER_BOOK`；两类输入与订阅纯状态测试只用于扩展验证，未进入生产目录。当前生产接口没有盘口订阅或页面。已有能力增加来源及新能力的具体文件/测试接缝见[接入指南](../../../daily-stock-analysis/docs/thesis-ledger-capability-adapters.md)。

Market 的能力组合读取核对同一证券/窗口与有效政策，分别保留必需/可选结果、覆盖、时钟及冲突。政策身份比较排除每次DSA投影重新生成的采样`appliedAt`，首份完整政策照常冻结；其他全部字段，包括requestId、修订、启停、目标和资格仍比较，真实变化拒绝。普通 STOCK 固定来源的新组合产物为 `frozen-status-composition-v1`，由原 Snapshot Builder、ArtifactStore 和离线 Runner 消费；新交易状态只沿原已知停牌规则约束执行，其余新事实保留为观察输入。仅选择其他独立功能时仍保留原交易状态约束，不双读同一能力。原生命周期准备、旧聚合冻结和已有 manifest 保持原路径；新版本不回填旧产物或改变研究资格。实际新业务组合/冻结验收状态见原Task，不以代码或只读投影核对代替。

证券图表的 `5d / 1w / 1mo / 1y` 由 Domain 聚合纯函数与 Market 周期读取/展示服务拥有；原生来源 identity、路由和事实存储保持 `1m / 1d`。DSA 只对给定周期点计算指标，Desktop 消费展示联合合同与独立 `period-options`，不承担聚合或公式。派生缓存是可重建视图，绑定来源口径、日历、规则、锚点及显式评估时刻。现行行为与预算见[周期聚合 Spec](../specs/2026-09-16-market-chart-period-aggregation.md)，验收记录从其任务入口追溯。

Portfolio、Performance 和 Automation 经 Market Reader/领域服务获取行情；分钟线来源未就绪时返回不可用。Risk 场外基金上下文经 `MarketService.getFundNavHistory` 获取当前净值，核验标的及评估时间，不直读 `FundNavPoint`。窗口不能覆盖开仓日期时不补持有期数。

Strategy Optimization 分组查询属于优化领域，读取结果交由 Backtest 完整冻结守卫校验；旧模式及损坏记录不生成当前指标。Research/AI 的回测入口经当前准备、Run 和结果服务。账户、Journal、Import、导出与备份的账本投影经当前 Ledger 读取器；历史注释或归档文件不能成为当前经济事实。

内部 Run 事件由当前状态机提交后发布，Desktop 仍解析当前摘要；初始资金只取当前 RunConfig 的本币金额。事件发布不建立另一条执行入口。

## 保留的格式标识

策略 AST `schemaVersion=2`、Ledger 经济 `payloadVersion=1`、HiThink 原生单位格式 v1/v2、映射证据 `contractVersion=1`、来源适配器修订和 `raw-times-factor-over-fixed-anchor-binary64-v2` 各自标识不同层的现行格式。它们用于原文、模型或摘要校验，不能解释为 ThesisLedger 旧 API。历史 migration 与验收文档保留原文。当前 Exchange 执行与 Ledger Repository 的存量文件名，以及 `toLedgerEventV2` 持久行转换器，均只有现行实现；转换器先要求当前信封标记再解析，不接受旧行。公共类型已按领域命名。

DSA 日历与可交易性事实分别由 `thesis_ledger_dependency_facts`、`thesis_ledger_tradability_provider` 拥有，旧模块路径和转导别名已删除。DSA 原生 `/api/v1` 继续服务其自身业务。

## 部署与验收

官方现金公告已通过EventBinding进入原事件V3入口，来源模块拥有定义、工厂、动态修订和标准现金处理器。现有公告执行器继续复核读取前后政策/目录/准入及安全，公共层只交付本请求回调，标准证据投影回原noticeDividendEvidence。缺包修订保持不可解析，包字节变更使旧准入失效；查询来源不声明订阅。公告真实成功消费受现有过期准入限制，冻结与浏览器层单独验收。

东财现金已通过相同现金能力合同和来源绑定进入原事件入口，复用原有界页面及元/份Decimal转换，保留本次观察摘要、当前availableAt和覆盖未知。原准入sourceRevision表示接口合同，不能改为页面摘要；不由分页完成签发历史完整覆盖。事件工厂延迟到准入后，标准查询不构造无实际需要的SDK。当前事件保留原读取与身份/映射语义；用户主备由有效政策routeIndex决定，不取目录枚举顺序。

RQData现金/拆分已由来源定义拥有manifest、凭据规则、工厂、精确修订和当前准入解析，公共事件/RQ Runtime透传分支退役。来源通过请求绑定回调复用原持久身份映射、不可变账号HMAC复核与30s隔离，现金/拆分各自强类型经济事实共享事件信封；身份/币种原文、观察摘要、覆盖未知和原V3 wire保持。manifest统一从注册的全部来源派生，保留原能力/开关；字段值归一化规则由来源声明。当前现金均已来源绑定，真实账号、目标成功消费、浏览器/新冻结按原Task独立验收。

东财拆分已来源绑定并共用Split合同，保留原正比例/标签、可选登记日、原文字节、日期映射及观察组合修订；SDK读取窗口仍扩至明确源折算日，消费生效日只从原映射获得。统一模型沿原公开正比例合同，来源特有方向规则归RQ适配器。公共generic事件尾段已退役，当前事件均已来源绑定；当前无拆分路线，不由代码同步推定真实消费通过。

Tushare现金已标准绑定，来源固定guard/SDK/安全回调保持原执行顺序及30s预算，原provider凭据缓存继续使用。公共Tushare执行/当前准入特判退役，现金金额/可见日及身份原文投影回原V3字段；事件信封精确比较时钟，不经微秒或浮点截断。来源未提供可见性时保持未知，未配置来源不自动加入政策。现行事件均由来源binding执行，目标成功消费/浏览器/新冻结与后续控制缓存门禁仍独立。

HiThink现金已绑定同一现金合同，来源固定原文/准入/SDK/安全回调复用原认证、HMAC、金额/日期、全部准入标的范围和精确时钟，原wire及未知覆盖保持。公共事件现金/拆分分派与供应商当前准入特判已退役，目录/修订/策略准入按binding派生。迁移阶段记录的19来源140精确目标各有一个binding；当前清单由来源注册和能力矩阵派生，未新增用户路由/准入或业务资格；不能以本地移植数量代替Provider配置代次、缓存、真实目标消费或新旧冻结验证。

当前报价、场外基金净值/历史/持仓和筹码缓存先经原Data V3只读`market/cache-context`核对控制。有效政策、来源配置/凭据及绑定修订形成不透明代次，fresh/last-valid/flight/锁共用该代次；停用、未选、控制不可用或读取期间变化不消费旧缓存。基金读取由`MarketFundReader`承担，原DsaClient/URL/TTL与可选身份持久化保留。控制投影不执行SDK，原无assetType报价仍由DSA解析；本地回归和目标只读投影已验证，真实切代次/故障及新冻结继续由原Task独立验收。

四基金/筹码缓存数据GET与控制cache-context POST在原消费trace内有有界传输观察，记录独立transportId/attempt/开始结束且只含pathname，不含query/body/headers或秘密。GET原2次尝试、控制原1次和错误/超时保持；无trace独立CLI保留原stdout。观察/计数缺完成记录不支持零调用证明，HTTP尝试不等同SDK页数或源执行。真实未选拒绝已核对，临时选择/切代次仍需具体授权；持仓原Reader进程与绩效HTTP证据分别记录。

原路由界面已展示五项独立功能开关与业务分组，精确候选从同一目录派生并披露querySupport参数范围。关闭保留主备，编辑来源不重置关闭状态；新选择显式启用并由原保存API携带expectedRevision。当前目录客户端投影由共享Schema验证，Desktop不维护重复信封校验；参数范围不是实际窗口覆盖证明。真实浏览器草稿和原界面保存/关闭/恢复已通过：五独立功能真实消费成功，关闭状态保留主备且0数据/风险仍可消费，CAS恢复原16路线至实时120。H09新组合冻结/原Worker两次断网重放亦已通过；个别来源正向资格与coverage限制仍分别记录，见[最终分层对账](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h07-h12-final-obligation-reconcile)。

DSA来源声明已拥有凭据准入修订策略、认证载荷构造与有限报价守卫。公共摘要沿原用途隔离HMAC，HiThink/Tushare/RQData原载荷字节和权限保持；报价Runtime按声明在预算前准备、工厂复用同次快照、读取后复核。HiThink复用原Guard，来源不接收Runtime或任意SDK方法，其他未声明守卫的查询行为保持；真实政策代次与新冻结门禁仍由原Task分层记录。

报价兼容准入查找由来源有限reader处理，同次可选快照与原scope/有效期保持。精确日线修订直接消费同一DailyBinding；通用Gateway的日线仍走原kind=data控制拒绝，不选择或执行bar目标，旧SDK/attrs死分支退役。已绑定报价按原manifest核对，未登记目标失败关闭；公开修订及其他宽manifest兼容不因目录整理改写。

HiThink三项固定只读probe由来源静态策略拥有，公共smoke保留draft零写入、非draft原健康记录和安全错误桥接。Tushare/TickFlow代表报价及Finnhub/AlphaVantage严格日线亦由来源策略拥有参数；有限capabilities只选择已有绑定，adapter_required沿原cache=false/probe工厂，保留注入实例零快照读取、真实工厂单次快照及查询缓存不替换。日线诊断整帧校验由日线模块拥有，Runtime保留原错误委托。规范能力、原快照和代表标的只用于诊断；单日/单证券成功不构成覆盖或准入。其余未迁移诊断保持当前行为，剩余验收见原Task。

官方CN费用、HK/US规则及公告状态/现金精确只读诊断已在本地实现中归来源exact_probe_read声明拥有。公共入口按唯一精确绑定传递只读key/target及可选实际policy_revision并校验标准样本；来源保留原文件/读取器、字节前后核验及现金UTC时钟，官方名称前缀和公共文件分派退役。七个独立公告功能的本地诊断复用各自标准请求/处理器/结果，缺失或变化实际政策代次时拒绝，不生成占位修订。RQ/HiThink/Tushare/东财六在线事件诊断本地使用EventBinding.probe_read及有限EventProbeReadContext，保留原当前凭据/准入复核、映射读取、4.5秒预算、隔离工厂及页数差异；公共层不再拥有这四来源分派，不传Runtime或任意SDK方法。正式目标验证继续见原Task，诊断成功不授予消费、覆盖或冻结资格。

宽manifest的既有HiThink现金/股票兼容由来源catalog_manifest_policy拥有，公共目录仅传当前manifest/Key/Target和唯一绑定派生的日线事实；bool决定原兼容结果，None继续原检查，不读SDK/凭据。报价仍要求精确绑定及当前来源声明；Control合法data目标以事件/修订事实判断，不再豁免供应商。原股票日线宽兼容与现金严格组合保持，不赋予新来源、历史覆盖或消费资格。

六来源环境凭据由EnvironmentCredentialPolicy拥有原字段读取、必要方法选择和最终快照附加；公共Control复用同一来源credentials定义，不维护供应商字段/方法名单。原三次环境值/配置读取、HiThink直接读取、Tushare最终httpUrl及Longbridge既有只读OAuth/legacy解析保持；不改变页面坏凭据禁止回退、加密、HMAC、工厂缓存或OAuth刷新。未声明来源保持原空值路径，不自动配置账号。

精确报价绑定可声明dependency_modules覆盖来源默认依赖，AK ETF/eastmoney报价仍只需要requests，其他AK目标仍用akshare；公共安装检查不维护AK/Bao名单。政策后置准入复核由SourceDefinition的policy_admission_guard拥有，有限只读上下文不含Runtime/SQL连接，公共层保持原基础配置短路及事件检查顺序。HiThink现金仍在事件检查后重新核对凭据/修订，原未准入零额外读取；已绑定报价/日线不会新增检查。两片本地合同与正式最小dsa同步/原控制只读核对通过，SDK、上游修订、资格与旧冻结不变，快更仅可写层。

研究日历补证资格由对应DailyBinding.research_calendar_eligible拥有，公共层按完整精确绑定/原assume-untradable-no-bar模式查找，先复用旧覆盖。腾讯/HiThink的CN证券校验、Yahoo港美已核验身份及两有界包窗口/观察时钟保持；有限标准上下文不传原DTO/SDK/帧。未声明目标继续拒绝，不扩大HFQ/其他资产或研究，未知上市不转成已知。本地/正式最小同步及原成功Run断网重放保持；零量/身份其他入口在迁移前继续原边界。

Yahoo零量私有响应摘要/元信息由源内研究帧适配器解析，DailyBinding.research_frame_projection仅在原HK/US股票qfq及00147.HK按股none声明，公共桥接只选择唯一绑定/原模式并验证类型化结果。坏OHLC/金额/摘要/重复日期拒绝、原帧不改、重复投影和旧V3事实/冻结格式保持；US none不自动排除。此投影只处理已读取结果，不执行网络、重试或切源，旧内部帧不成为新产品能力接口。正式最小同步/原控制及实际包/API隔离回归通过；身份事实剩余分派与真实来源资格仍在原Task。

两有界原价身份/单位由精确DailyBinding.research_instrument_policy拥有，公共身份/依赖入口复用原InstrumentFact研究观察合同并选择唯一绑定，不按Yahoo名称或包分派。来源仍读原包/窗口/单位/时钟，公共关联拒绝错证券/市场/币种/来源及晚截点，精确比较不截断纳秒；tradable=false/执行规则unavailable、qfq未知单位/状态及旧冻结字段保持。正式最小同步后原目标DsaClient读取两包/四拒绝通过，原111政策/140目录保持；该证据不是线上账号或新HK/US业务冻结通过，公共manifest残留和全范围Review仍在原Task。

通用manifest构造器不再按AK/Sina删资产，原Sina日线视图由AK来源自己的精确DailyBinding派生并交给原模板；19生产manifest迁移前/后/目标完全相等，其他旧宽声明/别名不变，仍不等于新精确可执行目标。正式最小同步、目录/政策保持与限定回归通过；EF专属准入生产者继续核验自身原文/协议，不纳入通用查询分派或自动准入。

公开报价单位由SourceDefinition.quote_public_units投影已有结果，有限上下文不含Runtime/SDK执行回调，API只复核标准模型。HiThink原SDK单位在来源解析，股票share/CNY、ETF量额unknown和原502错误保持；检查仍在Gateway及普通字段投影之后，不新增读取/切源。未声明来源仍省略units。原Runtime/HTTP新provider隔离证明及正式最小同步/真实原客户端与Server报价通过；完整报价Schema/对象隔离和SDK别名已经由原Task的独立子叶实施验证，目标输入与当前源码匹配。

报价已报告别名由各来源quote_source_aliases有限元组拥有，目标须为本来源已绑定报价。公开API按实际provider查询声明，保留原有效SDK枚举/大小写归一；未报告/未声明/跨来源错报保持未知，不填请求目标。五来源原身份与单位实际目标核对通过，SDK/价格/时钟/修订及用户政策不变；完整报价Schema与原位补值/对象隔离已由K38ab实施验证，声明与结果模型分别保留证据。

现行报价查询读取后统一为冻结QuoteResult强Schema，必要价格/OHLC/昨收与可选字段复制校验，原同快照推导不修改源对象；额外SDK字段/私有单位字典不进入结果。标准已报告来源、单位/有限安全错误一次投影，Runtime二次校验不再读取/投影；单位失败仍在原HTTP阶段报告，不改变切源。其他SDK时间保存为明确unverified观察，不补为行情时钟。正式最小同步/真实客户端与Server获取/缓存通过，原政策/目录/修订及旧冻结保持；全来源账号资格和主题最终Review仍独立。

日线公开单位由精确DailyBinding的有限纯投影声明拥有，AK/Eastmoney与HiThink ETF分别解析自己的原私有合同，API仅查绑定/强Schema DailyFieldUnits。缺合同省略、错目标/互斥合同拒绝、范围外未知、原数值/指纹/HTTP时机保持；正式同步后原合格ETF窗口与交互省略行为已核对，不自动授予新单位、覆盖或研究资格。

原HiThink ETF五年窗口计划已由该精确qfq绑定的纯window_planner拥有，公共多窗口入口查绑定/复核强计划，不按来源名称选择算法。原子窗覆盖预检、同目标控制检查、8次请求/4.5s总期限与交集冲突即停保持；未声明或只有一窗仍走原单窗。不同会话段规划通过隔离HTTP合同，原已选单窗在正式同步后只读核对通过；不等同多年真实来源或新增覆盖资格。

现有Daily/Quote/Query/Event绑定均只有查询生命周期，公共注册统一拒绝operation=subscribe，不因能力合同操作全集包含订阅而授予来源生命周期资格。非日线ExactKey不得携带会被RouteKey投影隐藏的adjustment成员；能力专有参数继续由各请求合同拥有。该批次正式目标140查询登记保持，四类错误订阅与72非法非日线键在工厂/数据执行前拒绝；未新增生产订阅或改变用户路线/源修订。

注册期间从绑定派生capability/version标准合同视图，拒绝来源对同名同版本请求Schema、结果/关联校验或操作语义的分叉；临时视图不作为第二事实源。该批次140绑定共17合同组一致，等价合同复用及合法版本共存已验证；目标同版本冲突零工厂/数据调用拒绝。新版本仍需相应产品Schema/消费支持，不自动改变现有协议、目录修订或冻结。

静态来源工厂的明确CapabilityContractError经有限工厂执行边界转换为公共ProviderCallError，三种原作用域保持code/retryable，固定安全消息并不携带源原文/诊断。调用一次、快照读取/缓存发布规则保持，非标准OAuth/Control/其他异常仍原路径；目标三入口及真实已配置报价已核对，未改变认证、SDK或用户路由。

原本地费用/聚合状态的目录就绪经SourceDefinition.catalog_readiness及有限key/target上下文声明，公共入口只依据精确绑定调用/校验bool或None；数据包路径/文件存在与公告库兼容由来源拥有。原140目标观测逐项保持，十二本地目标就绪、其余原配置/准入路径不变；文件存在不授予窗口覆盖/权限。正式目标目录/修订及报价已核对，未启用测试来源。

独立状态能力 API 已与日线共用 API 所有权的 Data V3 安全错误信封投影：固定消息和本次requestId置于标准error对象，真实能力不支持单独使用unsupported_capability。Server共享Schema及Mapper保留强校验，标准可选来源失败可以冻结为组合failed项，平铺V3、错关联或供应商原文继续阻断。该修复不改变SDK、源修订、研究要求或旧冻结；目标部署和真实新业务冻结的完成状态仍以[原Task](../tasks/2026-10-09-unified-data-capability-adapter.md)为准。

BaoStock独立状态/粗ST及基础日期经来源专属隔离进程复用原SDK标准化，45秒终止/wait边界避免服务进程内全局连接并发；状态/粗ST仍共享同代次获取，日期独立。原工厂、其他日线、全部公开来源/适配修订保持。Market组合及Snapshot外层复核共用同一政策事实比较，首份完整政策冻结，真实字段变化拒绝。目标H09-K2新Run已生成十产物、五事实/三真实可选失败，并通过原Worker两次断网一致/0网络；数据快照complete、固定两日指标partial保持，[分层证据](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h09-real-composition-freeze-passed)。H10原浏览器真实保存/关闭/恢复与最终分层Review已完成；K37部分来源正向资格仍独立受外部条件阻塞，不扩大为组合机制失败。

结构由全部排序 migration SQL 与 raw-owned 清单共同定义，运行时 head 自动派生。普通启动与更新只检查结构；显式开发重建和正式保数据升级遵守独立的精确目标、备份及恢复门禁。

代码变化通过相邻 infra 官方 `sync-code.sh` 同步已有容器，依赖、结构或镜像变化使用 `update.sh`。快更替换完整目录以删除退役代码，但只写容器可写层；重建后必须重新同步或构建含当前源码的镜像。详见[三仓矩阵](version-matrix.md)与 infra Docker 更新说明。

Canonical 完成表示单一现行链及其有界验收闭合。S05 严格 PIT、M32 和旧历史原件追补等已按[10-08 范围决定](../specs/2026-10-03-multi-source-remaining-acceptance.md#scope-cancellation-20261008)取消；保留的合同不重新授权这些范围。统一适配层的正向真实现金验收、历史按需摘牌验收、富途分钟及 AI 等各自范围仍以[当前任务索引](../tasks/README.md)指向的正式任务为准。
