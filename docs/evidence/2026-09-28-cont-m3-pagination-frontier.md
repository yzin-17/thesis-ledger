# M3 基金目录分页实施前沿

日期：2026-09-28。任务：`CONT-M3-pagination`。状态：`worker_done`，完成有界发现，未实施源码。

## 范围与判定

本轮唯一写入为本文；主仓与 DSA 的 WIP 保留，未 stage/commit/revert。依据为主 Spec §3.3、§4、§9、AC20，主 Task §10、R01.5-pagination、§12.9，以及 DSA 完整 `docs/thesis-ledger-source-capabilities.md` §2–5 和 `docs/thesis-ledger-catalog-source-evidence.md`。使用 `spec-driven-workflow`；Context Mode 未提供可调用工具，使用 RTK 和有界读取。目录记录是来源能力的唯一台账，以下只是前提索引，不另建支持矩阵。

**核心结论：R01.5 的安全解析和分页读取已存在，不应再次派发同一实现。** 当前缺口分为离线 HTTP 传输边界验证、基金分类合同、既有 Catalog 消费接线和真实完整读取四项。分类合同缺失使生产接线 blocked；完整读取首次和两次重试均 ReadTimeout，预算已耗尽，本轮没有重发请求。M3 不完成；AC20 的明确待验证状态不等于来源在线或实现承诺已全部履行。

## 现有证据与原文恢复

2026-09-27 的有限候选观察记录：HTTPS `https://fund.eastmoney.com/data/rankhandler.aspx`，请求 `pi=1,pn=5`，连接/读取超时 5/15 秒；首次 ReadTimeout，第一次重试 HTTP 200，879 字节，响应 SHA-256 `6cef52266e0feb291e8d2a890149ca08225a771aa65095a7354ca8c7a223b150`。旧记录观察到 `datas/allRecords/pageIndex/pageNum/allPages/allNum` 和分类计数，但没有证明全量、后续页、历史目录或 ETF 分类。

已有来源文档未提供这份原文的临时路径。本轮在 `/private/tmp` 一级按 catalog/fund/efinance 名称查找，并对 rank 名称做一次有界补查，未找到该原文；后者受无关 OptionsPlus 临时节点读取权限限制，未绕过权限或反复扫描。故**不能重新计算上述响应摘要**，也不能以重造响应替代原文。879 字节和原响应哈希是历史记录，当前未复验。下面可直接核对的是现有源码与旧定向日志，而不是源端协议全部事实。

旧日志 `/private/tmp/goal-fund-catalog-parser-20260927.log`：13 passed；`/private/tmp/goal-fund-catalog-reader-20260927.log`：19 passed（13 parser + 6 reader）。本轮直接读取最终统计，没有重新运行测试。旧证据还报告关键 flake8 通过，本轮未重跑，不能据日志生成时的成功断言当前所有输入未变。当前文件 SHA-256：

| DSA 路径 | 当前摘要 |
| --- | --- |
| `data_provider/eastmoney_fund_catalog_page.py` | `69bda56fd043649afacb22e36093d72c0f7789549a66f2239902e2fe757eed38` |
| `data_provider/eastmoney_fund_catalog_reader.py` | `34fc2ad04ce24e2a860214d6bf5c81d1313c09a4bca488a97574d13d030c762d` |
| `tests/test_eastmoney_fund_catalog_page.py` | `1c70ffdeff647458a8e10e9a76919c8765ba1600df51e0d60b8d4a0e50e7c58d` |
| `tests/test_eastmoney_fund_catalog_reader.py` | `63149bf1177ff9a9bfa0c1106ce6a6c71b989b1ce3601f61f40e8370e9f85db3` |
| `src/services/thesis_ledger_catalog.py` | `816c76a1f7fb656e3c462c3ddd83a0c4c9a43321238e01360e5d8adb2a00826c` |

完整新读取器旧探针：宿主隔离进程外层 55 秒，首次及两次重试均 ReadTimeout，无完整结果。目标 Efinance 原 loader：50 秒，首次及两次重试均 JSONDecodeError。AKShare 三资产完整 Catalog：60 秒，首次及两次重试均 `catalog_all_providers_unavailable`。三个预算分别沿用，不能因修复解析器、换叶编号或恢复上下文重置。股票 5,569 条的独立成功不是三资产消费者成功。

## 当前接口合同

`parse_fund_catalog_page(text, *, page, page_size)` 返回不可变 `FundCatalogPage(page,page_size,total,pages,rows)`，`rows` 只保留六位 ASCII 代码及非空名称。

- 外壳只接受完整 `var rankData = {...};`；字段值使用 JSON decoder，不执行 JS。重复/未知字段、脚本表达式、附加脚本、尾逗号拒绝。
- 必需字段为 `datas/allRecords/pageIndex/pageNum/allPages`；允许 `allNum` 与 `etf_count/zs_count/gp_count/hh_count/zq_count/qdii_count/fof_count`，只校验它们是非负整数。**没有解释 allNum 或分类计数的业务意义，也没有逐行证券类型。**
- 当前数学断言为 `allPages=ceil(allRecords/page_size)`、`pageIndex=请求页`、`pageNum=请求页大小`；每页行数严格等于剩余量与页大小的较小值；页内重复代码拒绝。请求页大小 1–1000，声明总量 1–100000，文本 UTF-8 长度不超过 8 MiB。
- 每个 datas 字符串按前两逗号切分，第三段内容没有业务解码；不能从第三段、代码前缀、名称或聚合 etf_count 补出分类。当前测试是显式合成协议反例，不是原样来源 fixture。

`read_fund_catalog(*,page_size=1000,max_pages=50,timeout_seconds=45,fetch_page=...,monotonic=...)` 顺序读取，首次页决定总页/总量，后页必须一致；跨页重复、失败、晚到和超页预算整体拒绝，无内部重试，不返回部分结果。输出 `rows/retrieval/contentFingerprint/observedAt`；retrieval 包含协议名、页大小、总量、页数和每页哈希。哈希计算基于解码后的 UTF-8 文本，**不是保留 BOM 等原始 HTTP 字节的哈希**；指纹基于分页证据 JSON，不是历史修订号。observedAt 是读取完成时的实际观测时间，不是挂牌或基金成立时间。

`_fetch_page` 当前固定 HTTPS endpoint；params 为 `op=dy,dt=kf,rs='',gs=0,sc=qjzf,st=desc,es=0,qdii='',pi=请求页,pn=请求页大小,dx=0`，Referer 为 HTTPS fundranking 页面；TLS 使用 requests 默认验证，禁止重定向，stream=True，timeout 为 `(min(5,remaining),remaining)`，逐 chunk 8 MiB 上限，解码 UTF-8-sig。HTTP 非200拒绝。单请求 timeout 不能替代跨 chunk 或全部 SDK 调用的硬期限。

现有 Catalog 使用 spawn 子进程，父进程 poll 到期限后终止并回收，稳定 `CatalogBuildError.code/retryable` 跨进程保留；通用异常当前变为可重试 `catalog_provider_unavailable`。`_efinance_catalog` 仍检测目标 0.5.9 不存在的 `fund.get_realtime_quotes`，没有调用新 reader；stock 分支按 STOCK，旧基金分支按 MUTUAL_FUND/OF。其输出是普通 catalog item 列表，尚无 retrieval 原文投影。分类证据缺失时不能把所有 reader rows 直接投影为 MUTUAL_FUND/OF。

现有 `build_catalog` 的合并身份键明确为 `canonicalCode/market/instrumentType`，其最近端 loader 接口是完整 item 列表；未发现用于消费无市场/类型候选 rows 的现存目录入口。把未知分类的 rankhandler rows 挂为普通目录会提前赋予未证明身份；新增候选目录/诊断保存面也需要先定义范围与Consumer，不能只以“非trade-ready”标签绕过这三个必需身份字段。当前能独立消费未知分类的既有入口只有 reader 本身的离线结果验证，并非产品 Catalog 接线。

## 可派发的最小下一叶

**首选依赖就绪叶：`R01.5-http-boundary-tests`，仅补离线传输边界测试。** 现有6项 reader 测试注入 fetch_page，完全绕过实际 `_fetch_page`；这层可在不新增来源事实、不调用网络、不修改消费者的情况下验证。不是再次实现 parser/reader，也不关闭 R01.5。

- 输入：上述 reader/page 两文件、已有两份测试、当前摘要；独占写集仅 DSA `tests/test_eastmoney_fund_catalog_reader.py`。来源公开文档和所有源码只读。协调者另行登记结果，不让测试叶修改主 Task。
- 用可控 response/context manager 和 monkeypatch requests.get 验证精确 HTTPS URL/页参数/Referer、默认 TLS验证、禁止 redirect、stream模式与剩余预算 timeout；非200包括redirect拒绝；8 MiB边界及超过边界拒绝；UTF-8-sig 解码和非法 UTF-8 拒绝；iter_content失败必须关闭 response 且不返回部分结果。它们是传输边界合成测试，不冒充 source fixture。
- 完成检查：在 DSA 执行 `rtk proxy .venv/bin/python -m pytest -q tests/test_eastmoney_fund_catalog_page.py tests/test_eastmoney_fund_catalog_reader.py`，再对唯一测试写集执行项目关键 flake8及 `rtk git diff --check -- tests/test_eastmoney_fund_catalog_reader.py`。仅新增有风险边界回归，不运行全量/部署。
- 停止：上述合同由现有实现满足且离线定向通过即结束；若发现必须改源码、原字节证据格式或总期限机制，报告新的最小修复叶，不能扩展写集。首次局部失败只重试一次；确定性失败分析后停止，不放宽断言。

**第二叶 `R01.5-classification-contract`：blocked，来源事实先行。** 独占候选写集 DSA `docs/thesis-ledger-catalog-source-evidence.md`；协调者主 Task另行维护。需要可核验的原文/文档说明 `dt=kf` 的集合范围、是否含ETF/场内份额、六位基金代码对应的市场及逐行分类机制；固定 accepted 类型/排除理由和源身份。若只证明是基金排名集合而不能证明全开放式目录，应保留候选读取，不能签发全部基金目录。已有原文需先找到精确路径并核对879字节摘要；没有事实时只输出 blocked，不造fixture、不追加已耗尽的网络探针。

**第三叶 `R01.5-catalog-consumer`：依赖分类合同，不与第二叶或部署合并。** 冻结合同后，候选精确写集 DSA `src/services/thesis_ledger_catalog.py` 的 Efinance loader、`tests/test_thesis_ledger_catalog_sources.py`、`tests/test_thesis_ledger_catalog.py`。parser/reader及Server/Desktop只读。消费read_fund_catalog的完整结果，类型/market由已核验合同显式提供；ValueError映射不可重试稳定无效响应，传输错误保持受控不可用；沿用可终止子进程，拒绝迟到、失败和部分发布。股票/基金同loader的总期限要共同受父进程约束，不能各自45秒后宣称符合60秒预算。

该消费叶完成检查应覆盖旧fund SDK方法不存在仍使用新reader、明确类型、分类不足零读取/零发布、完整/重复/变化/超时拒绝、跨进程不可重试错误只调用一次、未改变已有股票回退和跨源优先级。先定向 catalog tests；若必须改目录输出Schema、DB保存证据或主仓Reader合同，标记 needs_split，由独立消费面叶处理。真实 Catalog Job/数据库刷新、官方目标代码同步与真实来源正向验收分别另叶；本轮不执行，不将容器可写层当镜像发布。

## 全部 M3 登记单元的剩余前提索引

完整能力目录 §5 有116个固定编号及R07.8按显式URL物化模板；以下逐编号覆盖，范围写法只是同类前提压缩，不表示可整体派发。选择叶与其后继适配叶必须分别领取；共通前提为 P02/C04、对应G0、实际来源/endpoint、单位/时点/权限/覆盖和现存Consumer。价格能力另依赖S03–S05；最新数据不能自动进入严格历史回测。以下保留目录的状态，不宣称已进行每叶完整源码审计。

本轮用 §5 至 §6 之间表格首列 `Rxx.n`（含可选 `/{sourceId}`）作为提取规则直接计数：117行、117唯一ID、116固定ID、1个 `R07.8/{sourceId}` 模板。各组行数为12/32/6/5/8/23/27/4，总计117；R01–R08章节组名没有纳入计数。因此“117唯一ID”和“116固定叶”并不矛盾，不合并或删除任何ID。以下索引每个编号均可回到SSOT §5 同名首列唯一行，并以该行完整的来源/Consumer/输出/门禁为准；这些前提摘要不用于替代其支持状态或勾选验收。

| 编号 | 当前剩余前提 |
| --- | --- |
| R01.1 | 股票单函数成功；三资产完整消费者/刷新及准入仍缺，耗尽预算沿用 |
| R01.2、R01.3 | 各自ETF/基金字段与覆盖/分类、完整loader消费及G0；不能继承股票成功 |
| R01.4 | Efinance股票精确分页/真实完整目录与准入；EastMoney同源关系已保留 |
| R01.5 | 本文四个分离前沿，完整成功预算耗尽 |
| R01.6、R01.7 | 名称选择和受控单标Manager已验证；默认多源优先级/完整CN范围与准入仍缺 |
| R01.8、R01.9 | 带市场/类型及上市状态的消费合同未选择；批量六位名称冲突预算耗尽；后继不能以名称预取代证券列表 |
| R01.10 | 日历专项已完成，保留版本/发布时间/范围及容器可写层限制；不授予个股历史状态 |
| R01.11、R01.12 | 历史挂牌/停牌来源、as-of及现存Reader未定；先选择再适配，缺Bar不判状态 |
| R02.1、R02.2 | HiThink股票报价endpoint/Reader/单位/时间/权限选择，再单来源适配 |
| R02.3、R02.4 | HiThink ETF 独立报价范围与合同选择，再适配 |
| R02.5、R02.6 | AKShare股票/ETF分别锁定实际报价endpoint、上游/时点/单位及真实准入 |
| R02.7、R02.8 | Efinance单标股票/ETF真实响应已有；完整单位/范围/来源时点准入仍缺 |
| R02.9、R02.10 | TencentFetcher报价确认unsupported，无Reader；保留明确结论，实际腾讯报价归R02.5，不重复实现 |
| R02.11 | 新浪指数精确身份/离线Consumer已完成；来源时点、交易阶段、单位与G0仍缺 |
| R02.12 | Efinance指数endpoint/同源指纹、时间字段、测试及真实准入 |
| R02.13 | Tushare指数日期/身份/金额换算离线完成；真实权限/源端时点仍缺，不称实时 |
| R02.14 | TickFlow指数代码/单位/时间合同及Key/套餐/权限 |
| R02.15、R02.16 | 选一个分钟源/资产/interval/口径/Consumer，再适配；不扩M1日线 |
| R02.17、R02.18 | RQData历史Bar资产/endpoint/频率/口径/Reader与SDK账号选择，再适配；事件权限不能替代 |
| R02.19、R02.20 | 官方Tdx none端点/SDK授权/架构/Reader选择，再独立raw单位与窗口验证 |
| R02.21、R02.22 | 官方Tdx qfq接口/基准/Reader选择，再独立适配 |
| R02.23、R02.24 | 官方Tdx hfq查询窗口/基准/Reader选择及实测，再适配 |
| R02.25、R02.26 | 官方Tdx分钟interval/接口/许可/架构/Consumer选择，再适配 |
| R02.27、R02.28 | 官方Tdx盘后包版本/资产/字段/系统依赖/Consumer选择，再适配 |
| R02.29、R02.30 | Tushare fund_daily选择及本地实现复用M24；Token/积分/目标ETF覆盖与真实G0仍缺 |
| R02.31、R02.32 | fund_adj原始读取已存在，仍缺单一Consumer、锚点/可见时间/修订与转换依据；后继依赖冻结合同 |
| R03.1、R03.2、R03.3、R03.4 | 最新/历史日期校验、同源有界NAV真实样本已有；正式披露时间/源版本/完整历史及准入逐项仍缺 |
| R03.5、R03.6 | 盘中估值源/endpoint/Consumer/TTL与stale选择，再独立缓存适配，禁作成交Bar |
| R04.1 | 持仓行校验已有专题；披露/观察时间、报告期、代码权重单位及空/无权限来源准入仍需逐项核对 |
| R04.2、R04.3 | 一个资料字段组/Provider/endpoint/Consumer先选择，再适配 |
| R04.4、R04.5 | 资产配置独立字段组/endpoint/披露时点/Consumer选择，再适配 |
| R05.1 | 600004原文已采集；首行映射未修，证券身份、金额倍率/比例单位、publish_date/修订语义仍缺 |
| R05.2 | 独立估值endpoint及PE/PB/市值单位、观察日/滞后合同与测试 |
| R05.3、R05.4 | Yahoo一个市场/财报字段组/条款/period/as-of/revision/Consumer选择，再适配 |
| R05.5、R05.6 | Yahoo一个市场/估值字段组/单位币种/as-of选择，再适配 |
| R05.7、R05.8 | HiThink一个资产/研究字段/endpoint/时间/Consumer选择，再适配 |
| R06.1、R06.2 | 一个市场宽度统计字段组/endpoint/Consumer先选择，再计算/时间测试 |
| R06.3、R06.4、R06.5 | EastMoney/Sina/Efinance行业排名分别固定endpoint/分类版本/来源/as-of，不能合并为同一口径 |
| R06.6、R06.7、R06.8 | THS/东财/SW1分别固定分类、日期/快照、权限和派生输入；不互相外推 |
| R06.9 | 概念排名独立endpoint/分类版本/时间与真实G0 |
| R06.10、R06.11 | 个股板块归属字段/截面日期/分类版本/Consumer选择，再适配 |
| R06.12、R06.13、R06.14 | individual资金流最新日/5日/10日各自日期、金额单位/累计算法和实际运行来源 |
| R06.15、R06.16、R06.17 | main资金流最新日及5/10日字段存在性分别核实；缺字段保留unavailable，保持回退关系 |
| R06.18、R06.19 | 行业rank/summary分别锁窗口/单位/as-of及仍存Consumer，保留runtime source |
| R06.20 | 先确认一个龙虎榜历史Consumer和披露/事件日期需求 |
| R06.21、R06.22、R06.23 | 依赖R06.20，各endpoint独立源身份/字段/披露时间，未满足历史用途则blocked |
| R07.1 | 拆分映射已有M22相关实现；生效日映射、完整历史、源修订及真实事件门禁独立保留 |
| R07.2、R07.3 | ETF现金接口/单位/日期/现存Reader选择，再适配；依赖M22/M23 |
| R07.4 | 公告索引notice独立源时间合同，不能冒充拆分事件 |
| R07.5、R07.6、R07.7 | 股票三候选各自endpoint/upstream/日期/事件完整性与实际选中source证据 |
| R07.8/{sourceId} | 仅按显式启用URL物化；每URL稳定source key/解析版本/许可/发布时间，未启用为N/A |
| R07.9、R07.10、R07.11、R07.12、R07.13 | NewsNow五source id各自实例授权/实际发布方/时间/payload；显式启用后请求，不作行情事件 |
| R07.14、R07.15 | a-stock-data/Tencent固定版本/许可/endpoint/资产/现存Consumer审查选择，再适配并去重 |
| R07.16、R07.17 | a-stock-data/Tdx盘后包版本/源身份/字段/资产/Consumer选择，再适配 |
| R07.18、R07.19 | a-stock-data公告版本/远端服务/许可/可见时间/Consumer选择，再适配 |
| R07.20、R07.21 | 问财底层检索SDK/服务/许可/资产字段/Consumer选择，再适配，摘要禁作确定性事实 |
| R07.22、R07.23 | 问财公告检索接口/源身份/时间/Consumer选择，再适配 |
| R07.24 | Tushare fund_div已实现读取/标准化；独立身份币种冻结、事件消费和完整覆盖/权限仍依M26-b2/c |
| R07.25、R07.26 | RQData split/dividend本地与目标拒绝接线完成；真实ETF映射/币种审核、逐接口权限、历史完整与目标正向仍缺 |
| R07.27 | 官方Tdx权息资产/事件类型/日期/SDK授权/Consumer未选；不与社区或候选代码混同 |
| R08.1 | 维护者提供可信精确镜像、来源链/许可/可达性/覆盖；无镜像保持关闭 |
| R08.2 | R08.1通过后只选一资产/能力/口径/现存Reader |
| R08.3 | R08.2通过后独立只读Reader及指纹/空/重复测试 |
| R08.4 | R08.2通过后另行显式范围/幂等导入；不得与R08.3或主库替换合并 |

## 停止记录

本轮没有启动Provider、Catalog子进程、测试、Docker或后台会话；所有短只读命令已退出，无任务进程待停止。仅文档检查；不创建后继、不修改共享台账。原文未找到和无关临时节点权限错误经过一次有界补查后停止，未请求扩大读取范围。已有耗尽预算保持原状态。后续最优就绪叶为离线HTTP边界测试；来源分类合同及消费者接线分别blocked，不宣布M3/G-M3/F02完成。
