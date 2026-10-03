# R05.2 估值单接口原响应合同

日期：2026-09-28（Asia/Shanghai）。本叶 `CONT-R05.2-valuation-raw-contract` 完成来源事实采集；R05.2 消费与真实准入仍未完成。

## 选择与预算

候选固定为本机 AKShare **1.18.94** 的 `stock_value_em(symbol="300766")`，安装源码 SHA-256 为 `440f38d9d91e0a1484a12df237d7e21b14b7783cd88de51dae95db9ed7b2cd96`。源码调用 EastMoney HTTPS `datacenter-web.eastmoney.com/api/data/v1/get`，筛选 `SECURITY_CODE="300766"`、报表 `RPT_VALUEANALYSIS_DET`，按 `TRADE_DATE` 降序请求第 1 页、每页 5000 行。该接口与当前研究上下文复用的 `stock_zh_a_spot_em` 实时报价是不同数据表；没有静默替换已冻结来源身份。

预算固定同一 endpoint/参数最多 2 次、仅失败后 1 次重试。实际只请求 **1 次、0 重试**：UTC `2026-09-28T02:19:45.049821` 开始，HTTP 200，`2026-09-28T02:19:45.363176` 完整获取。请求无账号或凭据，30 秒总时限、8 MiB 原文上限、禁跳转、HTTPAdapter 0 自动重试。原文保存在 `/private/tmp/m3-r05-valuation-contract-0928/response.raw`，**1,052,388 字节**，SHA-256 `93d52c85222257fe45f5974366c96622f9cd89cf8c96eea17a8f2616295634d2`；采集脚本 SHA-256 `d2260772f19366c2377f3515f6b86a13efc14279f3a53b390b011c55375d710c`。不再发第二次请求。

## 原响应与离线重放

- `result.count=1824`、`pages=1`、`data.length=1824`；每行 `SECURITY_CODE=300766`、`SECUCODE=300766.SZ`，`TRADE_MARKET` 同一原码。`TRADE_DATE` 1824 个互异值，原页从 `2026-09-24 00:00:00` 降至 `2019-03-25 00:00:00`。这些是单个样本和此次请求的事实，不外推其他证券或未来分页完整性。
- 原字段含 `TRADE_DATE`、`SECURITY_CODE`、`SECUCODE`、`TRADE_MARKET`、`PE_TTM`、`PE_LAR`、`PB_MRQ`、`TOTAL_MARKET_CAP`、`NOTLIMITED_MARKETCAP_A`；这五个数值目标在本样本无 null。顶层只有 `code/message/result/success/version`，`result` 只有 `count/data/pages`，行中无披露公开时刻、观察修订或可证明历史可见时间的字段。顶层 `version` 不得冒充逐日数据修订。
- 禁止网络的本地回放调用安装版 SDK 转换 1 次，得到 **1824×13** 表、日期 `2019-03-25..2026-09-24`。生成 CSV 路径 `/private/tmp/m3-r05-valuation-contract-0928/sdk-table.csv`，278,802 字节，SHA-256 `8c95aa636c1fd7b75bc8e7d9b4b244e33a3642c08d7f64a805e61f38babf75b0`。SDK 表丢弃原代码、场所和其他元数据，只凭表格本身不能再验证响应身份。
- [AKShare 官方股票接口文档](https://akshare.akfamily.xyz/data/stock/stock.html)说明 `stock_value_em` 逐证券历史数据、交易日期、PE/PB 字段，以及总/流通市值为“元”；文档没有给出逐行披露时间或历史修订合同。公开样本支持字段与金额单位，不证明特定数据在过去某个决策时刻已可见。

## 实施与准入边界

现有 `get_fundamental_context` 从通用实时行情取估值，`as_of` 为本机处理时刻；`AkshareFetcher` 的东财实时行没有来源时间，且经包装后的六位代码不足以重新验证原响应场所。不能把该入口标记为 R05.2 已接入历史估值，也不能把此次捕获完成时刻或 `TRADE_DATE` 自动写成 `sourceAvailableAt`。

下一实施叶须在**原响应**层逐页核对代码、完整 `SECUCODE`、场所、严格日期唯一性及页数/总数；按官方单位映射当前研究用 PE/PB/市值，并向既有消费者明确暴露交易日期和来源身份。缺发布/修订时只能标为当前研究的部分证据，严格 PIT 与 G0-M 保持失败关闭。实际多证券/分页、目标运行态及延迟仍需独立验证。
