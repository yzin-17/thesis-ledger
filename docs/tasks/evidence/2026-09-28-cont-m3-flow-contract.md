# R06.12 最新日主力资金流合同发现

## 1. 范围与结论

任务 `CONT-M3-flow-contract`；基线为 [主 Spec](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md) §3.3、§4、§9、AC20，[主 Task](../2026-09-25-multi-source-adjustment-aware-backtest.md) §12.9 和 [前沿发现](2026-09-28-m3-r04-r07-frontier.md) §3.2。能力事实仍由 DSA [能力目录](../../../../daily-stock-analysis/docs/thesis-ledger-source-capabilities.md) R06.12 所有。

已自主选择 `stock_individual_fund_flow`，只核实 CN STOCK 最新可用日主力金额。结论：发现完成，实施跳过，ready 叶 0。两次查证仍缺该 endpoint 金额单位及完整公开主力金额样本；不把未知单位登记为 CNY 元，不构造 raw fixture。此结论不是重新要求用户选择 endpoint，也不关闭 R06.12、G0-M、AC20。

## 2. 直接核实的来源事实

| 项目 | 核实结果 |
| --- | --- |
| 本地安装版本 | DSA `.venv/lib/python3.12/site-packages/akshare-1.18.94.dist-info/METADATA:3` 为 `1.18.94`；仅读取文件，未 import SDK |
| 请求签名 | 安装源码 `akshare/stock/stock_fund_em.py:20` 为 `stock_individual_fund_flow(stock="600094", market="sh")` |
| 作用域 | `market_map` 为 `sh:1/sz:0/bj:0`，`secid` 由市场映射和 stock 组成。必须显式固定市场与代码；不能只传裸代码而承受默认 `sh`，不能用无参数调用接收默认 `600094` |
| 返回身份 | SDK 只从响应 `data.klines` 构建 DataFrame，返回 13 列没有证券代码或市场。只能证明请求作用域；无法从该 DataFrame 独立验证响应身份，不得声称已完成响应代码回核 |
| 日期 | 精确列 `日期`；SDK 使用 `pd.to_datetime(..., errors="coerce").dt.date`。无排序或最新日选择；无公告/可见/抓取时间 |
| 金额与比例 | 精确金额列 `主力净流入-净额`，另有 `主力净流入-净占比`。金额使用 `pd.to_numeric(..., errors="coerce")`，没有乘除换算；源码没有单位声明或主力聚合算法证明 |
| 窗口 | SDK `lmt="0"`；官方文档称近 100 个交易日，公开样例却为 101 行，不能把文案作为严格条数或完整覆盖证明 |
| 版本限制 | `requirements.txt:14` 为 `akshare>=1.12.0`，Docker 从该文件安装；官方站展示 `1.18.97`，本地为 `1.18.94`。本轮未检查目标运行版本，不能将本地合同当作目标版本证明 |

官方 [AKShare 文档](https://akshare.akfamily.xyz/data/stock/stock.html) 给出上述参数与列名，金额列说明为 `-`，比例注明 `%`。其 `600094/sh` 样例日期递增，主力金额列被 `...` 省略。样例足以反证首行为最新行，不能固定金额单位或生成完整主力 raw 样本。官方 [SDK 源码](https://github.com/akfamily/akshare/blob/main/akshare/stock/stock_fund_em.py) 的当前公开签名、市场映射、列选择及转换与本地所读逻辑一致；该观察不构成全文件或发布制品相等证明。

## 3. 两次查证与卡点

1. 首查：官方 AKShare 文档的该 endpoint 字段表、公开样例和本地安装源码。日期、精确字段及请求作用域足够明确；金额单位未明示，主力金额原样本未完整展示，响应身份被 SDK 丢弃。
2. 针对性补查：只检索官方 AKShare 站点和 `akfamily/akshare` 关于该函数与“单位：元”的定义，并核对官方当前源码。命中明确“元”的是相邻同花顺 `stock_fund_flow_individual`，不是本 endpoint；不得借用。官方同 endpoint 仍无单位声明，转换仅数值解析，也不能从数量级推断元/万元。故停止继续检索，记录 skip。

没有访问东方财富资金流 URL 或任何 Provider 数据接口，没有读取凭据、数据库、容器或账号。目标版本及真实返回行仍未验证。

## 4. 现存消费者合同与风险

- DSA `data_provider/fundamental_adapter.py:599` 的 `get_capital_flow` 当前顺序尝试三种 `stock_individual_fund_flow` 调用和两个 `stock_main_fund_flow` 调用。第一次仅传 stock，默认市场 `sh`；第二次传不存在的 symbol 参数；第三次无参数，可能取默认标的。共用 `_extract_latest_row:355` 在无代码列时直接首行，主力金额用关键词抽取，可能命中比例列。
- `data_provider/base.py:3442` 的 `DataFetcherManager.get_capital_flow_context` 按现有股票过滤/超时/重试合同调用 adapter。`stock_flow` 任一非空值或板块排名即可使块为 `ok`；仅追加日期或单位 metadata 会误触发“有资金数据”，未来必须让判断只看已确认资金值。
- `base.py:2715` 的块只返回 status/coverage/source_chain/errors/data。当前 CN `result_ctx:3185` 和资金流块均无 `as_of`；`base.py:2888` 的 `as_of` 是其他离岸上下文的本机 UTC 时间，不能借给该来源日期。
- 现有 `src/agent/tools/data_tools.py:669` 的 `_handle_get_capital_flow` 消费该块，返回 `main_net_inflow`、5/10 日和板块排名，没有日期或单位。工具描述称 today，但本 endpoint 只能提供最新可用日期，不能据本机日期或调用成功声称今日。`src/core/pipeline.py:525` 获取并传递完整 fundamental context，已有研究消费入口存在；不需要新 Reader/UI。
- 现有测试 `tests/test_data_tools_get_capital_flow.py` 的 `1500000.0` 是 mock 契约值，不是该来源单位或公开样本证据。

## 5. 实施前提与单叶边界

本轮不输出 ready 实施叶。补齐同 endpoint 明确金额单位、完整公开主力金额样本或可审核的既存原始证据，并确认拟消费版本及代码/市场绑定后，才可转为一个“最新日主力金额归一化与现存消费者接线”叶。

唯一候选写集限定 DSA：新 `data_provider/eastmoney_individual_fund_flow.py`（endpoint 专属纯解析 helper）、新 `tests/test_eastmoney_individual_fund_flow.py`、`data_provider/fundamental_adapter.py` 的本 endpoint 调用接缝、`data_provider/base.py` 的资金值就绪判断、`src/agent/tools/data_tools.py` 的日期/单位透传及工具描述、现有 `tests/test_data_tools_get_capital_flow.py`。三个存量源码分别为 715/3774/730 行；新增职责应移入 helper，替换接缝时不得增加大文件规模。协调者在前提满足后确认独占写权，并同步 DSA 用户可见合同文档与 CHANGELOG。

必要 Spec 增量由协调者先写入主 Spec §3.3：R06.12 只按唯一最大有效来源 `日期` 选择原始金额；明确固定单位与传输字段；请求 stock/market 必须绑定，声明响应没有独立身份列的限制；来源日不是实时性、公告时间、策略可见性或历史资格。建议增加 `stock_flow.as_of` 为来源日 `YYYY-MM-DD`，不是抓取 timestamp；单位字段名称和值在单位证据到位后固定。原 `main_net_inflow` 数值必须按明确单位合同解释，不得静默改为万元。

该叶不修改全局 `_extract_latest_row`，不扩展 5/10 日、行业或其他 fallback 来源，不增加 Reader/UI。金额行拒绝时不允许改用默认标的、排名 endpoint 或模糊字段恢复成功；外层研究流程可继续，其余独立块不据此失效。

未来定向验证限定全 mock：`rtk proxy .venv/bin/python -m pytest tests/test_eastmoney_individual_fund_flow.py tests/test_data_tools_get_capital_flow.py -q`，随后按实际变更补窄接缝测试和静态检查；真实 Provider 准入另行登记，不能用离线测试替代。

必须失败关闭的反例：无市场绑定/错市场/空请求代码；空表；精确日期或金额列缺失/重复列；无效日期/NaT；重复最新日期；最新金额 NaN/Infinity/百分比字符串；只有净占比；错身份列（若调用层提供可验证身份）；无法证明单位。乱序应按日期选唯一最新行，零金额和负金额可合法，不可因 falsy 丢弃；旧日有效金额不能遮蔽最新日无效金额。日期/单位 metadata 单独存在不能把资金块升级为 ok。

## 6. 交付边界

仅新增本证据文件，全部 WIP 保留；未修改主 Spec/Task/能力 SSOT、源码或测试。未运行测试、build、数据库、Provider、Docker、浏览器或真实准入；仅核对现存路径、字段和候选验证命令。Context Mode 未暴露，使用 RTK 有界读取。无后台进程，写权交还协调者；不领取下一任务。

## 7. 独立请求作用域修复发现

后继发现 `CONT-M3-flow-request-scope` 只处理默认市场和默认证券请求风险。完整金额合同的 skip 保持；本节不依赖金额单位、日期排序或主力算法证明，不重新查单位、不请求数据接口。结论：一个独立请求作用域叶 **Ready**，只证明不因缺少身份而请求默认证券。

### 7.1 当前入口能否提供明确场所

`data_provider/base.py:70` 的 `normalize_stock_code` 明确剥离 `.SH/.SZ` 以及 SH/SZ 前缀。`get_capital_flow_context:3447` 在调用 adapter 前执行它；`get_fundamental_context:3150` 也在聚合前归一化。因此普通研究/工具入口传给 `AkshareFundamentalAdapter.get_capital_flow` 的是裸六位代码，即使调用方原来提供后缀，场所已丢失。`_market_tag` 只能判 cn 等国家市场，不能证明 sh/sz，不可用它签发交易所绑定；adapter 的 `_normalize_code` 同样会剥离后缀。

adapter 公共方法可直接接收未被预归一化的 `600519.SH`、`000001.SZ`。本叶可接受这两种严格完整格式，解析成 `stock="600519", market="sh"` 和 `stock="000001", market="sz"`。对当前普通消费者传入的裸代码，本 endpoint 零调用、stock_flow 为空并记录缺场所诊断。该叶不恢复此前丢失的信息，不按代码前缀猜交易所，不扩展 `.BJ`、前缀/别名格式；这些能力须另有明确合同。现有股票/ETF过滤和外层 fail-open 保持，不把调用作用域证明提升为资产类型或响应身份审核。

### 7.2 唯一 Ready 叶

ID 建议 `R06.12-request-scope-guard`；结果为“只向明确绑定的证券发起单次 stock_individual_fund_flow 调用，缺失绑定或来源失败时不默认请求其他证券”。精确写集仅 DSA 三文件：

- 新 `data_provider/eastmoney_individual_fund_flow_request.py`：纯请求参数解析器，例如 `resolve_individual_fund_flow_request(stock_code)`；仅严格六位数字加 `.SH/.SZ`，返回 stock/market 或稳定拒绝原因，不 import AKShare，不访问网络，不使用 `_normalize_code` 来接受缺场所输入。
- `data_provider/fundamental_adapter.py`：仅 import 与 `get_capital_flow` 的股票请求接缝。先解析请求绑定；成功时候选列表只有 `("stock_individual_fund_flow", {"stock": bare_code, "market": explicit_market})`；拒绝时根本不进入股票 `_call_df_candidates`。删除该接缝的 symbol 变体、无参数 individual 变体和 stock_main 后备请求，避免首个失败后通过默认证券恢复成功。现有行业请求独立保留，故“零调用”只指股票 individual/main 请求，不代表行业块零请求。保持现有值映射、日期选择和 source_chain 格式，均继续标记未验证；不修改其他 getter、全局 `_extract_latest_row` 或 `_source_metadata`。文件尺寸 ratchet 要求本文件净行数不增长。
- 新 `tests/test_eastmoney_individual_fund_flow_request.py`：纯解析及实际 adapter 接缝的离线调用参数测试。通过 patch `sys.modules` 提供伪 AKShare 函数，运行真实 `_call_df_candidates`，不要只 mock 共用 helper 返回值而绕过 kwargs 传递。

前提只有已核实本地 SDK `stock/market` 签名和明确输入后缀；没有新外部依赖。此叶不改 `base.py`，因此当前裸代码消费者的股票资金流将安全拒绝；行业块仍可独立使整个资金块为 ok，测试必须同时断言 stock_flow 为空，不能用聚合 status 掩盖拒绝。若产品需要裸代码继续成功，必须另行建立明确场所绑定与传递合同，不能扩大本叶为猜测绑定。

### 7.3 定向调用测试与停止条件

未来命令：`rtk proxy .venv/bin/python -m pytest tests/test_eastmoney_individual_fund_flow_request.py -q`。本轮未执行。

必要用例：`.SH/.SZ` 明确输入分别只调用一次 individual，并精确断言两个 kwargs；上海失败、空表或抛异常后不调用 individual 无参、symbol 变体或任何 stock_main；裸码 `600519`/`000001`、空串、五/七位、非法后缀、多个后缀、`.BJ/.HK` 均不调用 individual/main；缺场所时行业 mock 可返回数据，但 stock_flow 必须为空且保留拒绝诊断。合法调用返回 mock 数值只用于证明既有接缝转交，不声明它是官方 raw fixture或证明金额单位/日期正确。

必要 Spec 增量由协调者在主 Spec §3.3 固定：R06.12 的请求必须由显式 `.SH/.SZ` 绑定构成 stock/market，缺失时拒绝股票 endpoint；禁止 default market、无参默认标的和其他股票 endpoint 兜底。保留未来金额合同与真实准入门禁。

本节追加后无新官方访问、业务请求、凭据、DB、测试、build 或运行态操作。仅证据文件追加；源码只读。无后台进程，写权再次交还协调者。
