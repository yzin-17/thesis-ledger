# M3 R05.1 单接口财务表格合同发现

日期：2026-09-28。任务：`M3-r05-single-endpoint-contract-0928`。交付状态：`needs_split`；本叶只读发现完成，源码实施尚未 ready。

## 1. 结论与范围

唯一聚焦既有首选 `stock_financial_abstract(symbol=stock_code)`，用途仍为 CN STOCK 的当前研究上下文。该接口返回的是指标行、报告期列，不能把 `_extract_latest_row` 的首行解释为最新财报。下一接缝应是该接口专属的最新报告期列选择和指标单元格映射，而不是给所有候选共用的首行选择器增加排序。

目前不能冻结完整可实施合同：官方文档没有规定该表各指标的金额/比率单位；原样样本未找到；源码将请求代码拼为 `sh{symbol}`，返回表未保留身份字段。报告期列的存在可确定，但确切指标标签、类别重复关系、实际响应身份与单位仍缺证据。仅修复选择而猜测单位或字段，会把原先空值变成未经证明的数值；因此不提出源码实施 write set。

依据为完整 [Spec §3.3、AC20](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md)、[前沿发现 §3.1](2026-09-28-m3-r04-r07-frontier.md) 和 DSA `docs/thesis-ledger-source-capabilities.md:278` 的 R05.1。M3 只接既有 Consumer；R05.1 要逐字段核报告期、公告/可见时间、单位、空值及修订，最新值不得进入严格历史回测。AC20 要求逐登记单元真实准入或明确待验证；本文不关闭 G0-M。

## 2. 版本与工作区基线

- 主仓 HEAD：`fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`；首次状态摘要 539 条变更。
- DSA HEAD：`f497b6dad0e5519bbbcce1e51a2889d2c2634009`；首次状态摘要 160 条变更。读取的是当前脏工作区文件，而非声称等同 HEAD。
- `requirements.txt` 为 `akshare>=1.12.0`，没有精确 pin；本次固定读取的已安装发行包为 `.venv/lib/python3.12/site-packages/akshare-1.18.94.dist-info/METADATA` 的 `Version: 1.18.94`。该事实不能证明目标 Docker 使用同版。
- 已安装库源文件 `akshare/stock_fundamental/stock_finance_sina.py` SHA256：`e84c993cf6e74a521047c79072abf1bd1ae0a984b4713f3b30982edce663a7b7`。未获得此安装包的上游 Git commit SHA，不能把散列写成上游 commit。
- DSA `data_provider/fundamental_adapter.py` SHA256：`a25745a3f6676431803c49c17639bfa8c5c2fa467fa5fd608704709144ca635d`；`requirements.txt` SHA256：`2dafb1468c834c5acd53aed1b89207c547f767fa3719b407bf64cf41f5809684`。

## 3. 已有候选与消费合同

实际阅读 `fundamental_adapter.py:448–597`：候选依次是 abstract 带 `symbol`、analysis 带 `symbol`、analysis 无参数。`_call_df_candidates` 遇第一个非空 DataFrame 就停止；函数缺失、异常或空表才继续。无参数 analysis 在本安装版默认请求 `600004`，不是当前股票；此候选事实仅记录，不在本叶改动。

非空 abstract 即使最终所有财务字段为空，也不会再尝试 analysis。当前 `_extract_latest_row:355–376` 在有代码列时取首个匹配行，无代码列时取首行；`_pick_by_keywords:95–105` 匹配的是列名，不是 `指标` 列的值。abstract 的报告期列名不匹配这些关键词，所以真实表形态下当前财务抽取预期为空，这是源码推断，尚未执行来源验证。`growth` 仍被赋予含空值的四键字典，`source_chain` 仍追加 `growth:stock_financial_abstract`；bundle 最后按字典非空判为 `partial`，不能当财务内容可用的证明。

既有输出须保留：`growth` 的 `revenue_yoy/net_profit_yoy/roe/gross_margin`；`earnings.financial_report` 的 `report_date/revenue/net_profit_parent/operating_cash_flow/roe`。目前浮点转换只移除逗号和 `%`，没有金额倍率换算，也没有百分数除以 100；报告日期映射查 `报告期/报告日期/截止日期/统计截止日期`，不含回退接口的 `日期`。不得将总利润、扣非利润或每股现金流代替这些字段。

已实际阅读消费逻辑：

- `data_provider/base.py:3138–3347` 规范股票代码、管理缓存和预算，调用 bundle 并将 growth/earnings 包成含 `status/data/source_chain/errors` 的块；财务值本身不在这里换算。维持其 fail-open 聚合边界。
- `src/core/pipeline.py:522–562` 获取上下文并写基本面快照；`2820–2839` 将完整上下文放进 `PipelineAnalysisArtifacts`。这是当前研究消费，不是历史财务 PIT Reader。
- `src/agent/tools/data_tools.py:135–162、489–522` 将各块压缩为 `status/data`，返回 `fundamental_context` 给 `get_stock_info`。
- `src/services/screening_service.py:3356–3359、3637–3655` 清除非有限 JSON 数值并压缩；`screening/dsa_provider.py:89–104、177–206` 获取该上下文，目前摘要使用 coverage 状态，并非独立财报单位校验。

以上消费者保留原结构、预算、缓存及其他 bundle 候选；不能借财务接口合同顺带改预告、快报、机构、分红或资金流。

## 4. 官方事实、固定源码推断与未知合同

官方页面查阅于 2026-09-28：[AKShare 股票数据，关键指标-新浪](https://akshare.akfamily.xyz/data/stock/stock.html)（以页面接口名 `stock_financial_abstract` 定位；页面版本显示 1.18.97），同页财务指标接口用于辨别回退形态。官方页面与本地 1.18.94 不是相同版本，不能把当前网页当版本锁。

| 合同维度 | 可以确认的事实及证据层 | 尚未冻结的事实 |
| --- | --- | --- |
| 参数/身份 | 官方：`symbol` 是股票代码；abstract 表列为 `选项`、`指标` 和具体报告期。固定源码：请求 `CompanyFinanceService.getFinanceReport2022`，参数 `paperCode=sh{symbol}`、`source=gjzb`、`type=0`、`page=1`、`num=1000` | 请求作用域不证明响应身份；输出无代码。SH/SZ/BJ 的处理及响应自证身份未知，不外推市场覆盖 |
| 表方向 | 官方示例是指标行、`YYYYMMDD` 报告期列；示例精确标签包括 `常用指标/归母净利润` 和 `常用指标/营业总收入`。固定源码：报告期键来自 JSON `report_list`，指标名来自 `item_title` | 所有输出字段对应的精确 `选项+指标` 组合，重复标签是否同义及可否唯一选择，缺完整原样样本 |
| 值形态 | 固定源码对全部报告期列执行 `pd.to_numeric(errors='coerce')`，非数字变 NaN；官方示例有数值与 NaN | 原始字符串、缺失哨兵、指标单位字段及零值语义未知。禁止补零、推导指标或从科学计数法猜单位 |
| 报告期/排序 | 官方称具体报告期；源码保留 `report_list` 键的插入顺序，没有日期排序。行顺序按常用、每股、盈利、成长、收益质量、财务风险、营运类别组装 | 不保证第一报告期最新；报告期不等于公告日/可见时间。是否季度累计、单季或年度需逐指标证明 |
| 金额/比率 | abstract 官方输出参数的描述未给单位，本地代码未换算 | `revenue/net_profit_parent/operating_cash_flow` 币种和金额倍率，`roe/revenue_yoy/net_profit_yoy/gross_margin` 百分数/小数单位均未证明 |
| 时间/修订 | 返回表没有公告时间、可见时间和修订版本；来源当前历史表不等于历史版本档案 | `available_at/published_at/revised_at` 和历史 PIT 全部未知。本机采集时间只记采集时间，不能补作来源时点 |

同页 analysis 是回退辨别证据，非本叶实施对象：其日期为行、官方有带 `(%)` 或 `（元）` 的指标；固定源码 `stock_finance_sina.py:228–324` 按 `日期` 升序排序、转成 `datetime.date`，不是“首行最新”。其 `每股经营性现金流（元）` 不能映射总经营现金流，且没有等价的本次三项金额合同。选择它也不能安全保留首选顺序和既有字段语义。

## 5. 原样证据与唯一下一叶

在 DSA `tests/`、`docs/` 的文本引用搜索只找到 `tests/test_fundamental_adapter.py` 使用 abstract；`tests/fixtures` 中没有名称含 financial/abstract/sina 的样本。人工测试 `test_fundamental_adapter.py:76–123` 构造单行 `股票代码/报告期/营业总收入/归母净利润/经营活动产生的现金流量净额`，与来源表方向不同，不能作为原样 fixture。本次未找到可用原样来源 fixture，不声称全磁盘不存在。

唯一下一叶提案：`M3-r05-abstract-raw-contract-capture`，只核实 `stock_financial_abstract` 对一个明确 CN STOCK（建议与官方示例和本地默认一致的 `600004`）的原样合同。该叶须另行登记资源和真实来源调用预算后才可采集；本轮没有派发、授权或执行采集。它不采集 analysis 或全部财务 bundle。

该叶必须保留：发行包版本/源散列、请求精确参数及采集时间、完整 `report_list` 键顺序、每期未经改名的 `item_title/item_value` 和上游现有单位/元数据字段、响应现有的代码/名称/市场身份字段、转换后的完整列名/dtype/`选项+指标` 组合与缺失值。上游没给单位、身份或时间字段时如实记缺失，不添加伪字段。原始 JSON 与库转换表应能对应，禁止仅摘抄几个值后叫原样表；原样文件位置和散列须登记。

单样本也不能自行证明单位：需单独引用可核对的官方单位说明/响应元数据；若仍没有单位或身份自证，则继续 `needs_split`，不要推出 ready 源码叶。只有补齐后才可冻结最新合法报告期列、唯一指标组合、数值有限性、重复期/冲突拒绝和当前研究输出映射，再由父级确定单 endpoint helper、测试和调用接缝的准确独占源码 write set。本次不确定该 write set、不实施。

## 6. 自查与交还

只新增本文件；主 Task、Spec、能力 SSOT、源码、测试、依赖和 Git 索引均未修改。没有 Provider 调用、业务 job、AI、数据库、部署、安装、测试或 build，无后台进程；公开官方页面只读访问不等于来源准入。既有失败预算未重置，无新增真实请求预算。

静态核对了引用文件、源码行段、安装包版本、源散列和中文说明；本文件新增后检查尾部空白与段落。结论为发现完成、实施 `needs_split`，写权交还父级；G0、目标运行时与 AC20 的真实准入均保持待验证。
