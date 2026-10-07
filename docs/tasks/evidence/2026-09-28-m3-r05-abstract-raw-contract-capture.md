# M3 R05 原响应合同采集

日期：2026-09-28（Asia/Shanghai）。任务：`M3-r05-abstract-raw-contract-capture-0928`。发现执行 `worker_done`，完整实施合同仍为 `needs_split`。

## 结论与边界

唯一公开请求成功，固定 AKShare 1.18.94 的 `stock_financial_abstract("600004")` 源码已使用相同原文离线重放。原响应有 98 个报告期，每期 88 个原始条目；SDK 完整表为 80 行、100 列。响应含币种与报告期级 `publish_date`，但没有股票代码、名称或市场的响应身份自证，也没有明确金额倍率、百分数/小数单位合同。`item_precision=f2/p2` 是原样显示编码，缺少其定义，不能据此冻结单位。因此下一源码实施叶尚未 ready。

只完成本接口、单个官方示例的当前合同发现；没有证明其他股票/市场覆盖、历史版本档案、PIT、全财报 coverage、G0-M 或 AC20 准入。不得把本机 UTC 采集时间记为 `sourceAvailableAt`，也不得把原样 `publish_date` 无定义地升级为历史可见时间。

## 固定输入与请求记录

前置 [单接口合同发现](2026-09-28-m3-r05-single-endpoint-contract.md) SHA256 为 `52b0a9717a9d3c5f419fe745f882e800d71d98448c1dc150ca65591acc75d026`，起终一致。DSA 安装包版本起终均为 1.18.94；安装源码 `stock_fundamental/stock_finance_sina.py` 起终 SHA256 均为 `e84c993cf6e74a521047c79072abf1bd1ae0a984b4713f3b30982edce663a7b7`。`requirements.txt` 仍只有 `akshare>=1.12.0`，此证据不证明目标 Docker 版本。主仓/DSA 初始状态分别为 539/160 条变更，均保留。

请求 URL 由固定源码 AST 提取：`https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022`；参数为 `paperCode=sh600004`、`source=gjzb`、`type=0`、`page=1`、`num=1000`，未改 prefix、接口或目标。HTTP 200，`Content-Type=application/json; charset=utf-8`，来源业务状态 `result.status.code=0`。

- 开始 UTC：`2026-09-27T19:47:44.340603+00:00`。
- 收到响应 UTC：`2026-09-27T19:47:44.786559+00:00`。
- 原文完成 UTC：`2026-09-27T19:47:44.879817+00:00`。
- 采集及首轮重放结束 UTC：`2026-09-27T19:47:45.145002+00:00`。
- 已使用真实 HTTP 请求 **1/1**，重试 **0**；拒绝重定向，Session 禁用环境代理，HTTPAdapter 重试为 0；显式连接/读取 timeout 为 8/20 秒，SIGALRM 总时限 30 秒，响应上限 8 MiB。原文为 requests 解码内容编码后的完整响应实体 bytes，未重序列化。

采集脚本只保留唯一 `session.get` 调用点，已有采集记录时拒绝再执行。两次 SDK 转换均为离线重放，不是额外公开请求；`requests.Session.request` 与 socket connect 在离线阶段被禁止。

## 原样结构与元数据

完整 98 个 `report_list` 键的插入顺序保存在 [合同摘要](/private/tmp/m3-r05-abstract-contract-0928/contract-summary.json) 的 `report_keys_in_order`；本地绝对路径为 `/private/tmp/m3-r05-abstract-contract-0928/contract-summary.json`。本样本从 `20260630` 到 `20001231` 按日期降序，键无重复；不能把样本顺序升级为接口保证。全部每期原样 `item_title/item_value` 及其他字段保存在 `/private/tmp/m3-r05-abstract-contract-0928/report-items.json`，与原文解析后的 `report_list` 完整相等。

顶层只有 `result`；其内为 `status` 和 `data`。`data` 内为 `report_count`、`report_date`、`report_list`。`report_date` 条目含 `date_value/date_description/date_type`，提供报告期标签（例如最新 `20260630/2026半年报/2`），没有公告时间解释。

每期键顺序均为 `rType/rCurrency/data_source/is_audit/publish_date/is_exist_yoy/data`。98 期的 `rType=合并期末`、`rCurrency=CNY`、`data_source=其他`、`is_audit=未审计`；`is_exist_yoy` 为 94 个 true、4 个 false。`publish_date` 均非空，最新期原值 `20260827`；这是来源原字段事实，格式/含义、历史修订和真实可见时间未获得独立定义。

每个原条目实际包含 `item_display/item_display_type/item_field/item_group_no/item_number/item_precision/item_source/item_title/item_tongbi/item_value`。没有 unit、代码、名称、市场或修订版本字段；唯一 `code` 是 `result.status.code`，不能视为证券身份。币种 CNY 有响应证明，金额倍率仍无明确说明；`item_precision` 编码、字段标识或数值数量级不能替代单位证明。

## 完整转换表与字段接缝

完整列序为 `选项`、`指标`、98 个原报告期键；所有列名及 dtype、80 个 `选项+指标` 组合、逐列缺失计数均登记于 `contract-summary.json`，无摘抄表冒充完整表。`选项/指标` dtype 为 `str`，报告期列均为 `float64`。7840 个数值单元格中有限值 7491、NaN 349、无穷值 0；不补零。组合重复数 0，列重复数 0，按指标标题单独计重复参与行 20，因此选择时必须带类别。

当前输出可关注的真实组合为：

| 输出语义 | 样本原样组合 | 单位/语义剩余约束 |
| --- | --- | --- |
| 营业总收入 | `常用指标/营业总收入` | CNY 已证明，倍率未证明 |
| 归母净利润 | `常用指标/归母净利润` | CNY 已证明，倍率未证明 |
| 经营现金流量净额 | `常用指标/经营现金流量净额` | CNY 已证明，倍率未证明；不得用每股现金流代替 |
| ROE | `常用指标/净资产收益率(ROE)` | 原 `item_precision=p2`，比例单位定义仍缺 |
| 毛利率 | `常用指标/毛利率` | 原 `item_precision=p2`，比例单位定义仍缺 |
| 营收增长率 | `成长能力/营业总收入增长率` | 原 `item_precision=p2`，同比/累计合同仍须定义 |
| 归母净利润增长率 | `成长能力/归属母公司净利润增长率` | 原 `item_precision=p2`，同比/累计合同仍须定义 |

`成长能力` 还含与 `常用指标` 同标题的 `归母净利润/营业总收入/净利润/扣非净利润`，其 `item_value` 仍为金额，另有 `item_tongbi`。不得因为类别为成长能力就把金额行当增长率。SDK 不保留 `item_tongbi`、币种或 `publish_date`，仅提取 `item_value` 并 numeric coercion。原文的空字符串与 null 也包含分类标题/结束行，不能把它们全部计作输出缺失；输出缺失以完整 SDK 表统计为准。

## 产物登记

以下产物全部位于独占 `/private/tmp/m3-r05-abstract-contract-0928/`，属于真实采集或离线转换运行产物，不是源码 fixture。该临时路径需要父级在后续取用前核对散列与保留性；本叶不复制到未授权目录。

| 文件 | bytes | SHA256 |
| --- | ---: | --- |
| `response.raw` | 2277455 | `90d1cc950e46f993523e34aa1199bc153894d941fb09c0c8abe9012481282513` |
| `report-items.json` | 3028290 | `76adb04e1aa9ca80a2cc77c1c3bb61accb2079614602830e912fcbf4eba5b8b3` |
| `sdk-table.pkl` | 71549 | `f426e18a346b00c7b4b1be356d508b3b34415d80ffa6fee4d0d2ecd6881d3e70` |
| `sdk-table.csv` | 76384 | `bc7fd31aeab945e82fc76e631b0bdb97771d7a9e2125d602bbc776164e8d1af4` |
| `contract-summary.json` | 74657 | `c233560c0c7f8c73d12b666ce476223b63689ce654b16a0585ac3ebb9c1ce0ab` |
| `capture-record.json` | 1964 | `6f0930d77c93b28f599899a7c415cc74e3f5888df3244c8c2e9585616caaf856` |
| `capture.py` | 7033 | `9d07c3cb3f7b387814918d3bff1237d0fdf46ed20e03044f79f19eda56ed99ee` |
| `verify.py` | 4121 | `7243291fe26f100e16b7f84f50d8c643f7f84f72016c67a67d87ecddad13bb2a` |
| `verification.json` | 3496 | `94c1294f8b2cc0ad92197229acda74b60a531e8fa07d90906ca415913444285f` |

## 验证与交还

`capture.py` AST 解析和唯一 live 调用点检查通过；固定 DSA `.venv/bin/python` 执行一次采集。随后执行 `verify.py`，断网重放得到的 DataFrame 与 pickle 精确相等，CSV 的列序/组合相等、数值逐格近似相等且 NaN 同位；摘要 columns/dtypes/pairs/missing 和原报告期顺序匹配。所有登记产物 SHA/size、前置证据 SHA、固定源码 SHA 和 SDK 版本起终匹配。两个脚本无额外网络请求或安装步骤。

本叶只新增此证据文档和上述独占临时脚本/产物，未改 DSA/主仓源码、测试、Spec、主 Task、能力 SSOT、依赖或索引；未执行全包测试、build、Server 检查、业务 job、Provider/AI、数据库或部署。Context Mode 工具未提供，使用 RTK proxy 派生有限摘要，不将完整原文或转换表输出到父级上下文。全部进程已退出、Session 已关闭，无后台任务，写权交还。

准确下一叶只能是单位定义与响应身份自证的窄证据发现，由父级另行分配来源和预算；当前 1/1 预算已耗尽，禁止在本叶补查其他来源或重试。即使后续单位/身份补齐，`publish_date` 的语义与修订合同仍需单独核定才能讨论 PIT；最新报告期选择/helper 实施尚未 ready。
