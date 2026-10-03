# M2 币种与基金身份合同前沿发现

日期：2026-09-28。任务：`CONT-M2-currency`。结论：既有内容寻址存储可以复用；可以先实施独立的 Tushare 纯证据解析叶，不能复用 RQData 专属 wire 字段开放 Tushare 事件。

## 范围与依据

本次仅写本文，源码、配置、台账、账号、数据库及运行态均只读；没有 Provider 请求、测试执行、目标证据发布、fixture 生成、暂存或提交。主仓 HEAD `fe0e871e`、DSA HEAD `f497b6da`；读取时分别有 539、160 项脏工作区记录，全部保留。已读 RTK、Codex、两仓 AGENTS 及 `spec-driven-workflow` 的任务规划规则。Context Mode 当前不可调用，使用 RTK 和有界派生输出。

权威入口：主 [Spec](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md) §4/§5/§8/§9/AC20、主 [Task](../2026-09-25-multi-source-adjustment-aware-backtest.md) §9/§12.9、DSA `docs/thesis-ledger-m2-source-gates.md`。DSA 专题中早期“RQData 隔离/配置/消费未接入”是历史记录；当前完成叶以 Task §9 的 `M29-b2-*` 为准，不能重新实施已完成叶。

## 已核对的接缝与缺失事实

| 现有代码入口 | 直接确认的合同与限制 |
| --- | --- |
| DSA `src/services/thesis_ledger_mapping_evidence_store.py:13` | `MappingEvidenceStore` 只管理 bytes 与 `sha256:<64位小写摘要>`，无来源语义；最多 1 MiB、原子发布、同摘要不覆盖、读回摘要复核、非普通文件/符号链接拒绝。可以保存独立身份与币种证据 bundle；存储成功不是审核或准入。 |
| DSA `src/services/rqdata_fund_identity_evidence.py:52` | RQData 专属 resolver 绑定当前事件准入、精确来源/能力、全部映射范围与观测截点；JSON 重复字段拒绝，身份引用和分红币种引用各自显式。其查询代码必须等于交易所代码的六位数字部分，不能直接作为 Tushare 身份规则。 |
| DSA `src/services/thesis_ledger_rqdata_mapped_read.py:14` | 当前准入摘要决定本地证据文件，读取账号前解析身份，读取后重核准入和原字节；独立凭据/主密钥修订核验由既有读取接缝执行。此编排可作为设计参照，不改造成通用大杂烩。 |
| DSA `data_provider/tushare_fund_dividends.py:42` | `validate_fund_dividend_scope` 接受 SH/SZ/OF 后缀，但 ETF 明确拒绝 OF；NAV_FUND 与 ETF 区分。当前 standardizer 用同一 symbol 核对原 `ts_code` 并生成事实，尚无查询身份与交易身份分离合同。 |
| DSA `data_provider/tushare_fund_dividend_reader.py:17` | `fund_div(ts_code=symbol, fields=...)` 单次精确读取；币种是必传调用参数，未加载已核验证据；本地最多 2000 行、可显式到 10000 行，未知上游分页，覆盖始终不完整。 |
| DSA `src/services/thesis_ledger_event_v3_adapters.py:45` | 生产事件库存只登记 EastMoney 与 RQData cash/split，没有 Tushare；不能因纯 resolver 完成就添加库存。 |
| Schemas `src/market-rqdata-identity-v3.ts:93` 与 `src/market-event-wire-v3.ts:70` | `identityEvidence` 由 RQData 专属合同消费；非 RQData 附该字段会被拒绝。新来源需独立字段和验证器，不偷塞现有字段。 |
| Server `src/market/market-rqdata-identity-v3.ts:8` | 当前执行端重算 UTF-8 原字节 SHA-256；在线选择及 Snapshot 离线均调用，尚无 Tushare 验证入口。 |

确切缺失：本次指定输入没有目标 `159516.SZ` 的已审核 Tushare `fund_div ts_code` 对应原文、独立分红币种原文/摘要及有效日期范围；没有真实接口权限、可证明取尽的上游分页协议、完整事件历史与历史修订覆盖。已有调用参数 `currency=CNY` 或交易币种不能替代分红币种事实。上述缺失不妨碍实现纯校验合同，但妨碍发布目标准入、真实事件库存与完整冻结资格。

当前已批准的读取代码形状与真实身份要分开：M26-a/b1 已实现 ETF `六位代码.SH/SZ`，净值基金可用 `六位代码.OF`；没有批准任何真实目标映射或 OF→SH/SZ 别名。下一个纯 resolver 首版仅覆盖 CN ETF，要求 ASCII `[0-9]{6}\.(SH|SZ)`，`queryFundCode === symbol` 的完整同代码直接映射。即使数字相同也必须有独立身份引用，不能自动生成映射；OF、无后缀、不同交易所、不同数字和历史别名全部拒绝。NAV_FUND 与跨代码映射须有独立合同后另拆叶，不能隐含扩展本叶。

## 第一叶的精确合同提案

此处是供协调者先写入 Spec 的合同增量，不是已经发布的 Schema 或真实审核事实。领域所有者是 DSA Tushare 基金事件适配；来源原文存储继续由既有 `MappingEvidenceStore` 负责。共享 wire 所有者仍是 `packages/schemas`，Server 只单向消费共享合同。

bundle 严格字段如下：

- 顶层：`contractVersion: 1`、`kind: 'tushare-fund-identity'`、`mappings`，数量 1..1000；未知字段及重复 JSON 字段（含转义同名）拒绝。
- 每项：`symbol`、`instrumentType: 'ETF'`、`queryFundCode`、`scopeDateFrom`、`scopeDateTo`、`observedAt`、`identityEvidence`、`dividendCurrencyEvidence`；两类 evidence 均必填，不能从其中一类推定另一类。
- 身份引用：`identityEvidence: { documentUrl, documentSha256 }`；分红币种引用：`dividendCurrencyEvidence: { currency, documentUrl, documentSha256 }`；`currency` 只接受现有 `CNY/HKD/USD`，引用必须是无账号的 HTTPS URL，摘要为 64 位小写十六进制。不要求两个摘要不同，同一权威原文能同时证明两类事实时也必须显式列出两个角色。
- 日期均为合法规范 ISO date，范围不倒置；`observedAt` 为实际、有时区的核验观察时刻。原文内容上限沿用 1 MiB。首版每个 symbol 只允许一项，重复/重叠多条不隐式选版本。

建议纯出口：`resolve_tushare_fund_identity(content: bytes, admission, *, symbol, start, end, data_as_of, observed_at)`，返回冻结 dataclass `TushareFundIdentity(query_fund_code, currency, evidence_ref, evidence_sha256, content)`。不读文件、不读凭据、不请求 SDK、不生成 canonical event、不修改事实或 availableAt。

与既有 MarketRoute/准入的关联断言：

1. 调用 `event_admission_snapshot(admission, observed_at=observed_at)` 核验 consumer、admitted 状态、未撤销、版本与 `[validFrom, validUntil)`；`observed_at` 自身必须为 aware datetime。
2. `routeKey` 必须精确等于 `{ kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' }`，`target` 精确等于 `{ providerId: 'tushare', upstreamSource: 'tushare' }`。不能借 raw/factor/split/RQData 准入替代。
3. 在预先拒绝非规范 symbol/date 后复用 `route_admission_scope_applies`，请求完整窗口须包含于准入范围。函数内部会 upper/trim，故纯 resolver 必须先严格校验输入，不能借该行为接受非规范代码。
4. `sha256(content)` 同时等于准入 `evidenceSha256` 与 `evidenceRef` 的摘要；全部 mapping 必须在当前准入 scopeSymbols/日期范围内，选中 mapping 必须覆盖整个请求。
5. 准入 `recordedAt <= dataAsOf`；每项实际 `observedAt <= observed_at`、`<= recordedAt`、`<= dataAsOf`，按真实时刻精度比较，不丢弃小数秒。只证明关联、范围和截点，不把引用声明升级为原文经济事实审核。
6. 缺身份、缺币种、损坏、重复、过期、错来源/范围、未来证据均以稳定脱敏错误关闭。纯函数不承诺当前适配/来源/凭据修订；生产调用者必须复用现有 `_market_v3_admission_matches_current` 和用途隔离 HMAC，读取前后复核，不能仅靠纯函数认为运行时准入仍有效。

可直接复用的原语是 `event_admission_snapshot`、`route_admission_scope_applies`、`MappingEvidenceStore`、`hashlib.sha256`、`json.loads(object_pairs_hook=...)`、aware `datetime`、冻结 dataclass。RQData `_instant/_date/_document` 是私有来源实现，仅作为同约束参照，不从 Tushare 反向 import；不为两个来源新建无所有权的 shared/common。

## 按依赖顺序的五个小叶

只建议当前执行第一叶；其余为协调者后续独立派发的边界。协调者先在主 Spec §4 固定以上首版合同，并在 §8/§9 固定原字节冻结、独立来源字段、先消费者后启用生产者和覆盖不完整的语义；主 Task 记录新叶。文档所有权不交给源码执行者。

| 叶子 | 依赖、唯一交付 | 下一写集与本地验证 |
| --- | --- | --- |
| M26-b2-identity-resolver | Spec 合同增量确认；纯 DSA 解析结果与安全拒绝可独立验收，无运行入口依赖 | DSA 新建 `src/services/tushare_fund_identity_evidence.py`、`tests/test_tushare_fund_identity_evidence.py`，来源门禁文档/中文 CHANGELOG 由协调者更新。执行 `.venv/bin/python -m pytest tests/test_tushare_fund_identity_evidence.py tests/test_rqdata_fund_identity_evidence.py tests/test_thesis_ledger_mapping_evidence_store.py -q`，受影响源码 lint/语法检查。 |
| M26-b2-identity-wire | resolver 字段/拒绝合同稳定；仅共享 bundle、独立 `tushareIdentityEvidence` 和严格事件关联合同，不做服务执行或库存 | 主仓新建 `packages/schemas/src/market-tushare-identity-v3.ts`、专属 test；局部更新 `market-event-wire-v3.ts`、`index.ts` 和事件合同 test。验证 Tushare 独立字段正反例及 RQData/EastMoney 原合同回归，Schemas 定向测试/type/build。协调者先评估 wire 文件 ratchet，超阈值不得继续加规模。 |
| M26-b2-identity-consumer | wire 完成；Server 对在线选择与离线冻结重算原 UTF-8 摘要，核对 scope、事实币种，完整覆盖仍拒绝 | 新建 `apps/server/src/market/market-tushare-identity-v3.ts`、专属测试；局部接入 `market-event-selector-v3.ts`、`backtest-snapshot-v3-events.ts`，受影响选择/冻结测试。验证原字节 Parquet 往返、篡改/缺证据/未来时刻/空集与不完整覆盖；先定向再 typecheck。依赖边界/尺寸门禁随跨模块接线核对，不改门禁阈值。 |
| M26-b2-mapped-read | resolver+wire 稳定；仅受控 Tushare 读取编排，读前证据和准入检查、冻结凭据快照、读后准入/文件/凭据复核 | DSA 新建 `src/services/thesis_ledger_tushare_mapped_read.py` 及专属 test；复用既有 FundDividendsMixin/TushareHistoryRequest/凭据 HMAC，不注册库存。通过注入读取器验证缺证据零来源调用、撤销/轮换/文件变更晚到拒绝、原字节返回、空集版本保留和 coverage=false；不改现有 standardizer 以支持 OF 别名。 |
| M26-b2-event-runtime-local | 前四叶通过；精确 Tushare CASH 库存、当前修订和鉴权 HTTP 执行接线，独立于真实授权 | DSA 新建 `src/services/thesis_ledger_tushare_event_v3.py` 及专属 test；局部接入 `thesis_ledger_event_v3_adapters.py`、`thesis_ledger_event_v3.py`、`thesis_ledger_market_v3_revisions.py`、`thesis_ledger_provider_runtime.py`，仅 manifest 实际需要的 cash 能力条目。按既有大文件 ratchet 提取职责；SQLite/HTTP 受控验证、跨仓严格 exchange 消费，未准入拒绝且零来源调用。目标同步与真实权限/范围审核另设验收，不写合成目标准入。 |

第一叶测试必须覆盖：同代码完整引用解析且保留原字节；独立币种缺失/非法；OF/无后缀/跨交易所/数字不同拒绝；Unicode 数字和空白拒绝；同名 JSON/重复 mapping；摘要篡改；精确 route/target 错配；scope 越界/缺映射；失效/撤销准入；未来/无时区/非法日期及小数秒截点边界。后续测试仅可明确标为离线合同输入，不能仿造真实公告或标成目标已审核。本次没有创建测试输入。

## M21–M34 剩余归类

| 父项 | 尚需实现或本地接线 | 真实权限、事实或历史覆盖门禁 |
| --- | --- | --- |
| M21 | a/b 已完成；不重做字段合同。数值标准化须有 ETF 单位依据后再拆，不先猜转换 | ETF 量额单位、三口径目标覆盖/算法基准及真实准入；EastMoney 包装不算独立备用。 |
| M22 | 标准化/读取/映射/存储/runtime/freeze/日历叶已完成，不重做 | 目标拆分映射、真实来源完整事件/修订覆盖与冻结执行；159596 独立正样本不外推 159516 全历史。 |
| M23 | 标准化/有界读取/V3生产/transport/选择/聚合/准入投影/冻结/日期叶已完成 | 全部分页取尽与目标独立公告/事件/修订历史覆盖；已有单页观察不授完整覆盖。 |
| M24 | raw 分段及 b1/b2 已完成 | b3 逐接口账号权限、目标单位/交易日覆盖及 G-M2-Price；没有新环境预检或真实请求。 |
| M25 | 原始因子读取 a 完成；b 精确锚点/方向/转换关系及准入冻结合同仍缺 | 可靠基金转换定义、因子历史版本与 c 账号权限/目标完整覆盖；常值因子不授转换资格。 |
| M26 | a/b1 完成；本报告五叶及真实分页/完整覆盖合同仍需完成 | 已审核基金 ts_code 对应、独立分红币种、fund_div 权限、独立公告日期/金额、历史修订覆盖；complete=false。 |
| M27 | 官方 TdxAiData 的精确三口径适配未实现；先固定真实 SDK/接口合同 | 官方来源、授权/许可、单位/基准/窗口、目标资产覆盖未知；CN STOCK 声明不外推 ETF。 |
| M28 | 权息 endpoint/Consumer/事件类型映射未选，不能造正常化规则 | 正样本、比例/现金单位、生效与可见日期、实际权限及完整覆盖未知。 |
| M29 | 标准化、读取、spawn、凭据、identity、wire、consumer、runtime-local 均完成 | runtime-target 正向 HTTP→Server exchange、ETF 身份、逐接口账号权限与完整拆分/修订覆盖；目标无匹配策略/准入不能由本地受控 SDK替代。 |
| M30 | 标准化/读取和共享 RQData identity/runtime 链已完成，不重做 | 独立分红币种、分红接口权限、公告交叉核验、完整历史/修订和正向目标冻结消费。 |
| M31 | HiThink fund_div endpoint 字段合同未确认，不能按搜索缓存写适配 | 官方文档曾 404/不可取得、fund_type 是否必需有冲突；独立接口授权、日期/单位/覆盖另验，不阻断无事件依赖 qfq。 |
| M32 | 纯计算、编码、基准、raw接缝、PG仓储均完成；真实因子/准入与实际 Reader 路由仍缺 | M25 可靠转换证据及真实 G0、目标应用角色/Server/Worker消费；隔离库通过不替代目标验收。 |
| M33 | a 信号与 b raw开盘记账已完成 | 真实冻结事件、记账/信号与目标执行门禁；晚观测事实继续拒绝，归一化不重复现金/拆分。 |
| M34 | 固定官方 SDK、镜像架构/系统依赖隔离尚缺；只能事实固定后实施 | 官方二进制来源、分发许可、CPU/ABI/系统库、目标镜像加载与真实只读请求，不由宿主可用推定。 |

AC20 仍要求真实 raw/hfq、独立备用和分红/拆分路径；当前局部合同不关闭 G0-M/G-M2-*。所有父项继续开放，不按局部完成叶计完成百分比。

## 预算与检查结果

沿用 Task §12.9 的“卡点最多重试一次后记录跳过”，并保留已耗尽 I01/HiThink/BaoStock 批量/Catalog/AI/浏览器等原预算；新叶、新 ID 或恢复不重置。没有重新请求原卡点。文档中历史 Token 未配置、RQData 未安装/未接线与数据库缺表描述有后续修复记录，不作为本轮实时环境结论；没有重查账号或容器。

本轮静态误猜两个不存在的 runtime/route 文件路径后，改用一次文件目录发现定位实际 `thesis_ledger_provider_runtime.py` 与 route admission 原语，没有继续对不存在路径机械重试；这不是业务验收，也未消耗/恢复外部请求预算。

源码读取摘要：

| 文件 | SHA-256 |
| --- | --- |
| DSA `thesis_ledger_mapping_evidence_store.py` | `b3c7bfb481d620bec4c6f4c2b0df0f343cec58b47557dad2150e91529f35410a` |
| DSA `rqdata_fund_identity_evidence.py` | `1ea97d049588c15eafc4ef37d5a292a5cd809e1a9383d63cb872697af6b54f90` |
| DSA `tushare_fund_dividends.py` | `bf53c4cf1161dff94f8b93bbbc58c9c4f27063eee743ef82e4dce81fc178b9fa` |
| DSA `tushare_fund_dividend_reader.py` | `c0428506e6855404bcf0a2322387dda4db081003e8ced823b5cb1f730802e25b` |
| Schemas `market-rqdata-identity-v3.ts` | `7c8be9d04b9cbd05b37624832c8043640a5f402921bbabb968e8a9e4abba9c32` |
| Schemas `market-event-wire-v3.ts` | `a2f1dbeae9763bd160e9087de8fd6229bfeb158b99e08fc8f71b78b5176b9c1b` |

发现状态：`worker_done`，第一源码叶等待协调者固定 Spec 合同后可派发。仅本文产出，不提前实现、不继续领取下一叶；所有命令已经结束，无剩余进程或共享执行资源。
