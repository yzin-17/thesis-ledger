# R06.1 / R06.2 Efinance/EastMoney 市场宽度合同

日期：2026-09-28。范围：为现有 `MarketAnalyzer → DataFetcherManager.get_market_stats` 选择一个单一 CN 市场宽度来源，并收紧当前 Efinance/EastMoney 快照身份；不新增大盘平台，不发真实行情请求。

## 选择

R06.1 选择：

- Provider 包装：Efinance 0.5.9
- 实际上游：EastMoney
- 当前静态底层：`http://push2.eastmoney.com/api/qt/clist/get`
- Consumer：现有 `MarketAnalyzer` 经 `DataFetcherManager.get_market_stats`
- 能力：CN STOCK 当前市场宽度
- 本叶验收字段：`up_count/down_count/flat_count/limit_up_count/limit_down_count`

现有 `total_amount` 字段继续兼容返回，但本叶不把它纳入能力通过条件，因为金额单位/完整覆盖尚未由独立来源证据固定。

## 安全合同

`EfinanceFetcher._calc_market_stats` 现在要求全市场快照同时具有代码、名称、最新价、昨收和成交额列；代码经现有 A 股规范化后必须是唯一六位 ASCII 数字。缺身份列、坏代码或重复代码整体拒绝，避免重复行把上涨/下跌/涨停/跌停家数重复计数。

成功结果增加：
- `source=efinance/eastmoney:get_realtime_quotes(stock)`
- `contract=cn-stock-breadth-v1`
- `observed_at`：本次全市场缓存抓取时刻的 UTC ISO 时间
- `source_available_at=null`
- `historical_visibility_verified=false`

`observed_at` 是本地抓取观察时刻，不是 EastMoney 的发布/可见时间；不会进入历史 PIT 语义。

## 红绿与验证

专属离线测试修前 **2 failed / 1 passed**：
1. 成功统计缺少实际 source/时间语义；
2. 同一股票重复行会被重复计数；
3. 缺代码列原实现已经失败关闭。

修复后专属 **3 passed / 0 failed**。`test_market_strategy.py`、`test_tickflow_market_review_fallback.py` 与专属测试合计 **21 passed / 0 failed**，证明现有 MarketAnalyzer 与 TickFlow→普通 fetcher 回退消费不受新增元数据影响。

修改文件 critical flake8、`py_compile`、`git diff --check` 均通过。涨跌停比例/四舍五入算法及 `total_amount` 兼容计算没有改变。

## 保留门禁

本轮关闭本地 R06.1 来源/字段组选择和 R06.2 Efinance adapter 消费合同。没有证明：
- EastMoney 源端快照时间或发布时间；
- 全市场连续覆盖、交易阶段语义；
- 成交额单位；
- 真实 HTTP 传输、许可或目标运行；
- G0-M 在线准入。

因此该能力只属于当前研究市场宽度，本地通过不等于历史市场统计或真实来源在线。
