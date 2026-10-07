# 159516.SZ HiThink 量额与拆分价格坐标交叉核对

## 官方合同与独立单位依据

核对 HiThink 官方仓库 `HiThink-Tech/Financial-API` 的固定提交 `3bca7805a4127ece8d81961917e740d2effac6ec`。[ETF 历史 REST 文档](https://github.com/HiThink-Tech/Financial-API/blob/3bca7805a4127ece8d81961917e740d2effac6ec/docs/api/fund/fund-market.md#market-historical)明确接口固定前复权、`adjust:null`、最长五年及 `volume`、`turnover` 字段，但两字段只描述为“成交量”“成交额”，没有数值单位；[MCP 工具文档](https://github.com/HiThink-Tech/Financial-API/blob/3bca7805a4127ece8d81961917e740d2effac6ec/docs/mcp/fund/get_fund_market_historical.md)、Python 客户端和 CLI 静态能力 Schema 也未补充单位。股票日线另有股/CNY 定义，不自动适用于 ETF。

[深交所新一代交易系统 FAQ](https://www.szse.cn/www/marketServices/technicalservice/introduce/P020180328467244590967.pdf)第 14 问把基金成交量的交易所单位写为“份”、成交金额写为“元”。这定义交易所原生数据单位，不能单独证明 HiThink API 未进行缩放。

继续自查 [HiThink 在线 ETF REST 字段表](https://fuyao.aicubes.cn/docs/api-reference/fund-market/) 与 [ETF MCP 工具页](https://fuyao.aicubes.cn/docs/mcp/tools/get_fund_market_historical/)：前者对历史 `volume`/`turnover` 仍只写“成交量”“成交额”，后者把返回项称为 `PriceBarItem`，但指回同一 ETF REST 字段表，未声明两字段单位。[HiThink 股票行情字段表](https://fuyao.aicubes.cn/docs/api-reference/prices/)与市场库 Schema 说明股票量额口径，不能把股票的字段说明当作 ETF 历史接口的正式单位合同。故原短窗推断和准入结论不变；没有再次调用目标 HiThink 数据接口。

## 新的精确短窗观测

为核对 7 月拆分价格坐标，对既有 68 日证据之外的精确短窗 `159516.SZ`、`2026-07-08..2026-07-13`、`1d/qfq` 发起 **1 次** HiThink 只读请求、0 重试；请求 Key 仅从用户指定的 `~/.zshrc` 在进程内读取并作为请求头使用，没有输出或落盘。DSA 适配器确认 4/4 个独立 XSHG 交易日、无缺失/越界/重复，响应指纹 `cc72302a5e27778cbc4f44bd6386be2e2692d95aa9e2447de264dc0d35d762c7`。没有保留原始响应，适配器字段单位仍为 `unknown`。

与[此前 AKShare/EastMoney 同标的、同四日的未复权和后复权原始观测](2026-09-28-cont-m21-159516-three-basis-split-window.md)逐日对比：

| 日期 | HiThink 前复权开/收 | 公开源未复权开/收 | HiThink 成交量 ÷ 公开源成交量 | HiThink 成交额与公开源差额（元） |
| --- | --- | --- | ---: | ---: |
| 2026-07-08 | 0.870 / 0.884 | 1.740 / 1.768 | 100 | +25.571 |
| 2026-07-09 | 0.903 / 0.973 | 1.805 / 1.945 | 100 | -47.678 |
| 2026-07-10 | 0.973 / 0.905 | 0.973 / 0.905 | 100 | +2.552 |
| 2026-07-13 | 0.873 / 0.865 | 0.873 / 0.865 | 100 | -6.512 |

四日成交量比例均精确为 100；HiThink 成交额均等于公开源金额按百元取整后的值。与深交所原生“份/元”定义相符，若公开源成交量按手计，**推断** HiThink 这四日 `volume` 为份、`turnover` 为人民币元。HiThink 开/收价在 07-10 除权前约为未复权价格的二分之一（保留三位小数），除权日及之后与未复权价格相同；与[管理人 1:2 拆分公告](2026-09-28-cont-m22-159516-splits.md)的登记、除权日期相符。此观察说明本短窗前复权价格已反映 7 月拆分，普通归一化回测不能再把该拆分重复施加在这组价格上。

## 准入边界

官方 HiThink ETF 接口没有正式单位说明，上述单位是四日跨源和交易所规范的实测推断，不是服务商承诺。此前公开源 `qfq` 两次失败，故没有同窗双源前复权逐字段证明；此处只比较已返回的开、收与未复权数据。四日观察不证明全 68 日量额映射、全部分红/拆分算法、供应商复权锚点、历史修订或精确来源资格。既有 68 日响应未保留原文，不能从此短窗补造其逐行价格证据。目标能力仍 `not_admitted`，`G0-H-target`、`G-Deploy-159516` 和 `G-Run` 维持未通过。

## 2026-09-28 官方资料复查与独立取数边界

按用户要求继续自行查找服务商说明。复查 [HiThink 官方仓库当前 ETF 历史 REST 字段表](https://github.com/HiThink-Tech/Financial-API/blob/main/docs/api/fund/fund-market.md#场内基金历史日线行情)及[在线字段表](https://fuyao.aicubes.cn/docs/api-reference/fund-market/)：两者均说明 `open_price` 等四价为前复权，但 `volume` 和 `turnover` 仍仅为“成交量”“成交额”，没有“份/元”或缩放规则。当前文档示例的量额与价格数量级相容，不能代替字段合同；股票及全市场导出所写的股/原始货币单位属于不同接口，不能外推到 ETF 历史。没有找到服务商对该 ETF endpoint 的正式单位承诺。

公开仓库的[用户缺失数据报告 #84](https://github.com/HiThink-Tech/Financial-API/issues/84)提到其所取 2026 年 ETF 日 K 存在缺行，[用户复权质疑 #76](https://github.com/HiThink-Tech/Financial-API/issues/76)针对一只股票的预计算价格。这两项均为用户报告，既未证明 159516.SZ 的 68 日窗口存在同类错误，也不能替代逐日核验；准入仍须以本标的、本窗口响应及独立来源对账为准。

尝试用公开的[深交所基金行情入口](https://fund.szse.cn/marketdata/trade/index.html)核对目标逐日序列，页面交互超时，未取得可验证的行。另对 EastMoney 原始价全 68 日发起一次限定 30 秒的独立请求，连接在代理阶段失败，未取得数据；与此前前复权请求的代理阻断属同一前提，不按原前提继续重试。该阶段未重新请求 HiThink、未写准入行或发起目标 Run。随后改用另一条独立行情路径完成同窗对账，结果见下节；正式单位与来源修订证据仍须按 Spec 的原有准入标准补齐。

## 2026-09-28 同窗 68 日独立行情对账

发现此前未使用的 AKShare `fund_etf_hist_sina`，其实现直取 Sina 的 `sz159516` 历史日线，并在解码后保留原始数值字段。使用 `akshare 1.18.94` 对保守窗口 `2026-04-30..2026-08-09` 只读取得 68 日，Sina 归一化逐行 SHA-256 为 `2ef04c541b7fdc0a4146c6129c076dc7472b1e795ac6156628c06afb0ad3f59e`，两次读取的规范化摘要一致。随后使用用户已授权环境 Key 对同一窗口请求 HiThink ETF 历史接口一次，凭据只在进程环境和请求头中使用，未输出或落盘；适配器原始 HTTP 响应 SHA-256 为 `1622f24d66254434fa545618d63ffcd7426c36558a6097bb3aea3269cf27bc41`。该响应指纹可能包含上游请求 ID 或响应时间，不能仅凭不同请求的指纹变化断言 Bar 修订。

独立 `exchange_calendars 4.13.2` XSHG 日历在该窗口有 68 个交易日。HiThink 适配器逐日覆盖校验通过；Sina 同为 68 日，两个日期集合完全一致，彼此缺行均为 0。Sina 四价在 07-10 拆分时发生相应跳变，并与已有 EastMoney 原始价短窗相同，因此本次将其作为**实测未复权坐标**对照，而非引述 Sina 的正式复权合同。逐日比较所有 OHLC：拆分前 47 日 `HiThink qfq × 2` 对该坐标的最大绝对差为 `0.001000000000000112`，拆分后 21 日四价最大差为 0。逐日比较量额原始数值：成交量只有 1 日完全相等，但 68 日最大绝对差为 50；成交额最大绝对差也为 50，平均绝对差为约 25.88。数量级和舍入幅度支持此前“HiThink 量为份、额为人民币元”的推断，且不再仅限拆分四日。

Sina 数据与 HiThink 经不同站点和取数路径的交叉核对证明本窗口的日期和数值坐标高度一致；尚未证明两者的底层数据源独立，也没有提供 HiThink ETF endpoint 的正式单位合同、前复权算法版本或历史修订可见性。[AKShare 官方基金文档](https://github.com/akfamily/akshare/blob/main/docs/data/fund/fund_public.md)将 `fund_etf_hist_sina` 的历史 `volume` 注为“手”，但同页实时 ETF 列表的量额标为“股/元”；当前安装的历史函数实际还解码出文档未列的 `amount`。这些标注不能消除本窗口近同值量额所显示的单位歧义，也不能将数值接近误写为两源正式单位承诺。DSA 适配器的 `volume_unit`、`turnover_unit` 继续为 `unknown`，目标精确路由保持 `not_admitted`；`G0-H-target`、`G-Deploy-159516`、`G-Run` 不因本次对账勾选。
