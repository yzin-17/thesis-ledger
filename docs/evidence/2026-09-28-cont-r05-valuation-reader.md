# R05.2 东财股票估值原响应读取器

## 范围与输入

本叶只增加 DSA `data_provider/eastmoney_stock_valuation_reader.py` 与 `tests/test_eastmoney_stock_valuation_reader.py`，不改变现有研究消费者。原响应依据为[前一叶单样本采集](2026-09-28-cont-r05-valuation-raw-contract.md)：安装版 AKShare 1.18.94 `stock_value_em` 使用东财 `RPT_VALUEANALYSIS_DET`；`300766` 响应的证券身份为 `300766.SZ`、1 页 1,824 行。官方[估值接口说明](https://akshare.akfamily.xyz/data/stock/stock.html)把总/流通市值列为元，但没有给出该表的原发布时刻或历史修订合同。

## 实施与验证

- 新读取器使用固定 endpoint/报告名、显式代码过滤、总预算、单页 8 MiB 与最多 10 页上限；不跟随重定向，也不在内部重试。只有全页读完且 `count/pages`、每页行数、原文 `SECURITY_CODE`/`SECUCODE`、市场代码、严格倒序且唯一的交易日期全部一致时才返回。
- 输出仅含最新交易日对应的 PE(TTM)、PB(MRQ)、总/流通市值元值、原文交易日期及本次 `observedAt`；`sourceAvailableAt` 为 `null`，`historicalVisibilityVerified=false`。页摘要是读取完整性指纹，不是提供者发布修订版本。
- `pytest -q tests/test_eastmoney_stock_valuation_reader.py`：12 passed；首次收集因测试 lambda 重名失败，修正后唯一一次重跑通过。覆盖显式/裸代码、跨页身份及市场漂移、分页不全/漂移、日期重排、无效数值、超时和固定请求参数。
- 对此前捕获的原响应离线调用读取器：`300766.SZ`、`2026-09-24`、1,824 行/1 页、分页完整；PE `-613.53083398`、PB `5.43660591`、总市值 `8546332239.05` 元、流通市值 `7748709022.7` 元。未向来源再次发请求。
- `.venv/bin/flake8 data_provider/eastmoney_stock_valuation_reader.py tests/test_eastmoney_stock_valuation_reader.py` 退出 0；新增生产文件 186 行、测试 161 行，没有扩大既有超阈值文件。

## 未完成边界

这是本地读取合同，不证明其他证券、来源延迟、不同分页样本、披露时刻或历史修订。现有 `get_fundamental_context` 仍由通用报价填估值且复用报价价格计算股息率；接线必须单独处理预算、来源回退与 `partial` 状态。严格 PIT、G0-M、目标容器和全文 AC01–AC20 未准入。
