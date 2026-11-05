# E04-a 与 E02 Data 生产读取配对

## 执行边界

沿用 Canonical Spec/Task；本阶段完成 Data 当前合同与旧 URL 对账，收口非 Bar 读取中旧事实补版本及缓存身份旁路。Bar/Chart/Event、精确 NAV 冻结、日历/Instrument Facts 的已完成合同继续复用。Policy/Provider/目录消费配对、U01/U02 和部署最终验收独立保留。

源码确认：DSA 专属 Data 仅注册 `/api/v3/thesis-ledger`，旧 v1/v2 前缀由完整 app 拒绝；通用 DSA api/v1 不属于本次删除。Server 当前 Market 路径为 `api/market` 与 `api/market-data`。外部适配器来源名称归一属于 Provider 所有权，不作为旧精确路由 fallback 删除。

发现：MarketService 在净值历史失败后读取无版本 FundNavPoint 并补 version3；Quote/NAV/Holdings/Chip 部分新鲜或 last-valid 缓存只校验格式，未绑定请求代码。前者删除读回，保留现行身份/投影写入；后者使来源加载和所有缓存读取经过同一当前身份校验。允许的 last-valid 仅限可严格解析的当前合同与相同标的，不伪造版本或来源。

写集：Market 当前身份解析模块、MarketService/QuoteReader、边界门禁与负例回归、Data 对账/目标验收脚本及 Task。DSA 先复验当前 Data 各端点及完整 app 旧路由，再决定是否需要修复生产代码。

验证：定向旧格式/错误标的/旧 DB 拒绝与有效 current cache → Server 包级/类型/build/边界 → DSA Data 定向与官方离线全包 → 实际目标 Server→DSA、鉴权/旧 URL、源码一致和数据不变。所有缺证项保持未勾选。

## 合同与所有权对账

| Data 家族 | DSA 生产者与当前格式 | Server 消费者与边界 |
| --- | --- | --- |
| Bar | thesis_ledger router_v3 → 精确 Gateway；request/response contractVersion3 | DsaClient → MarketBarWindowReaderV3 → 冻结/派生/业务消费者；精确来源、覆盖与 G0 门禁保留 |
| Chart | thesis_ledger_chart_v3；当前 Chart 合同 | MarketChartReaderV3；不同用途不作为旧 Bar fallback |
| Event | thesis_ledger_events_v3；当前事件合同 | DsaClient events → Market Event Selector → Snapshot/公司行动；严格来源和日期绑定 |
| Quote | thesis_ledger quote；version3、Provider/时刻及单位 | MarketQuoteReader；源响应、fresh、last-valid 都经当前 Schema 与代码校验 |
| NAV 展示/历史 | thesis_ledger fund-nav/history；每点version3、Provider/抓取/净值日期 | MarketService；当前历史缓存继续可用，无版本数据库投影不升级为 Data |
| Holdings | thesis_ledger fund-holdings；version3、报告期/来源/证据，未知披露时间null | MarketService；当前生产响应与缓存必须绑定fundSymbol |
| Chip | thesis_ledger chip；version3、引擎及计算时间 | MarketService；源响应/fresh/last-valid 同一代码校验 |
| FX | thesis_ledger fx-rates；version3、汇率日/可用性 | DsaClient/MarketService 与估值消费者；目标本币身份汇率解析通过；非本币真实业务仍属 D02 |
| Calendar/Instrument Facts | 当前 Data URL 与version3；底层 v2_dependencies 是现行规则/历史事实生产者 | DsaClient 严格 Schema →当前 Snapshot Builder；I1 精确来源与历史状态不放宽 |
| Indicators | 当前 POST contractVersion3，冻结序列摘要与输入身份 | DsaClient/MarketController；当前计算版本与请求身份保留 |
| NAV 冻结输入 | thesis_ledger_nav_v3；当前来源原文、规则/日历及准入 | MarketNavReader → Preparation/Store → NAV Runner；N4 真实来源证据复用 |
| Capabilities | 当前公开能力声明只广告Data3 | DsaClient严格当前能力解析；公共能力与受保护Data区分 |

旧精确路由不是外部 Provider 适配器的原生字段别名。`thesis_ledger_source_identity.py` 只归一适配器已确认名称，未知来源不伪造；没有把它作为请求路由或旧 wire fallback 删除。通用 DSA API、当前不可变证据版本以及 current last-valid 可用性机制保留。

## 实施与回归

新增 Market 所有者模块 `market-current-data.ts`，四类非 Bar 数据各自用当前 Schema 解析并核对标的；所有源响应和缓存调用复用对应解析入口。MarketService 删除历史净值失败后的 FundNavPoint 查询与version3补字段，现行身份/投影写入保留。边界门禁禁止 Market 将无合同证据的 FundNavPoint 投影读回为 Data。

新增回归同时覆盖旧版本、缓存代码污染和正向同代码命中：4类fresh、3类last-valid、历史净值失败不查旧库。DSA完整 app含SPA回退新增13类Data旧URL双前缀GET/POST拒绝回归；没有修改DSA生产接口或依赖，其Changelog仅新增测试说明。

| 层级 | 输入/命令 | 最终结果 |
| --- | --- | --- |
| Server 定向 | current-data-boundary、services、quote-concurrency | 3文件29项通过 |
| DSA Data 定向 | contract、market_v3、chart_v3、events_v3、legacy_routes_with_spa、data_v3_target_pins | 90项通过 |
| Server 包级 | `pnpm --filter @thesis-ledger/server test` | 248文件2019项通过；30文件110项环境门控跳过，不计通过 |
| 客户端回归 | API Client/ Desktop全包 | 46项/523项通过；本轮无客户端/原生改动 |
| DSA 官方离线 | 仓库.venv加入PATH后 `./scripts/ci_gate.sh offline-tests` | 7689项通过、626子测试通过；1项跳过、4项排除；68条既有警告，未作为通过项 |
| 静态质量 | Server类型/build、修改文件ESLint、复杂度20/函数长度220、边界、Prettier；Python测试py_compile | 全部通过；原MarketService缩减为367行，QuoteReader284行，新合同模块34行 |

## 实际目标配对

Server/Worker 源码稳定后执行 infra `./scripts/sync-code.sh thesis-ledger`，兼容预检、构建、可写层同步、健康等待通过。DSA生产代码未变，5个Data/完整app模块与当前工作区逐字节一致，不重复构建或更新DSA。

`node scripts/e04-data-target-acceptance.mjs` 最终通过：

- Server/Worker 当前解析、服务和QuoteReader，以及DSA五个Data模块，共11项同源核验通过。
- 实际Server进程环境中的DsaClient向目标DSA发起请求：能力声明只广告3、FX本币身份汇率及交易日历均解析当前合同。
- 目标DSA旧专属URL双前缀、14路径GET/POST共56项404；13条受保护当前Data端点无Token均401；5类POST旧合同均422。Server三个旧api/v2 Market路径均404。
- 目标当前编译MarketService连接实际Prisma，独立实例注入受控上游失败和空缓存；原错误返回，查询事件确认FundNavPoint读取为0。此为目标编译服务故障验证，不把受控上游当作真实Provider成功。
- 目标BacktestJob仍43行，摘要前后均为 `459bf78cc2db44b8a984f6524df11698`，未创建业务Run、改写原记录或提交Provider配置。

快更仅更新Server/Worker可写层，镜像仍为 `sha256:ed7f1174ba5e6d2bfe944cc4aa7166afe2c2c435feaffaf56e9651866c9896a3`，不作为镜像发布证据。目标本轮没有重复执行非本币FX、Quote/Chip/Holdings真实来源业务验收；这些仍由D02/U01/U02及关联来源Task拥有，旧协议关闭与鉴权不代替业务可用性。

E04-a 与 E02-a Data 读取叶完成；E02/E04父项及其他子叶保持开放。下一阶段为E04-b与E02-b Provider生产/消费配对，见[剩余顺序](2026-10-02-canonical-remaining-order.md)。
