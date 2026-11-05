# R06.20 龙虎榜历史 Consumer 核对

## 现存路径

DSA `AkshareFundamentalAdapter.get_dragon_tiger_flag(stock_code, lookback_days=20)` 依次尝试三个 AKShare 函数，并用进程当前时间计算近 20 日结果。`DataFetcherManager.get_dragon_tiger_context(stock_code, budget_seconds)` 将其包装为基本面块；`get_fundamental_context(stock_code, budget_seconds)` 在 CN 非 ETF 当前研究聚合中调用，均没有目标历史日期或 `dataAsOf` 入参。当前调用方为 `src/core/pipeline.py` 分析流程、`src/agent/tools/data_tools.py` 的 `get_stock_info`、`src/services/screening_service.py` 的 DSA 基本面读取。Server 回测源码未发现 `dragon_tiger`/龙虎榜块消费。

第一次按候选和字段检索 DSA、Server 消费点；第二次逐一核对 Manager 两个函数签名及上述三处调用，结论相同。这里只证明当前工作树不存在 R06.20 所要求的单一现存**历史** Consumer，不能推断未来不需要该能力，也不把当前研究入口冒充历史入口。

## 阻塞与处理

现有 `latest_date` 是候选表解析的日期，本机近 20 日窗口不是回测决策时点，也没有来源披露/当时可见时刻合同。按 Task 的停止条件，R06.20 历史 Consumer 选择记 `blocked`，R06.21–23 历史适配跳过；保留当前基本面路径原样，不增加来源请求或新 Consumer。后继须先定义明确的历史用途、事件与披露日期及单一消费入口，再逐 endpoint 验证 P02/G0-M。没有生产代码、真实 Provider、Docker 或测试执行，本证据不授予回测事件资格。
