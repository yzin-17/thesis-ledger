# DSA 行情能力审计

审计基线为上游提交 `831ada5370123551e5cb4fc099208dd70e892e22`。

## 结论

| 能力                      | 上游现状                                                                        | Investment OS 处理                             |
| ------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------- |
| A 股、ETF、港美股历史行情 | `data_provider` 已有 AkShare、EFinance、Tushare、YFinance 等 Fetcher 与优先级链 | 通过 Quote/Bar Adapter 薄封装并补 provenance   |
| 实时报价                  | 多来源、超时和熔断逻辑已存在                                                    | 不透传原始响应；按内部 Quote V1 校验           |
| 财务与新闻                | Fundamental Adapter、搜索和 Intelligence 路径已存在                             | V0.6 Tool 化；关键字段必须带来源和时点         |
| 指标                      | 分析流水线已有均线、MACD、RSI 等输入                                            | 增加稳定 Indicator V1 API；ATR 纳入同一结构    |
| 筹码                      | AkShare/Tushare 支持平均成本、获利比例、70/90 区间和集中度                      | 映射 ChipDistribution V1；不把零值当作有效结果 |
| 交易日历和长期落库        | 不是 Investment OS 的可靠事实边界                                               | 主仓维护 Calendar、Bar Store、完整性与质量问题 |

## API 边界

上游 FastAPI 已按 `/api/v1` 暴露 `stocks`、`analysis`、`backtest`、`portfolio`、`alerts`、`agent` 等路由，但这些响应不是 Investment OS 客户端契约。正式 Fork 需要增加窄接口或 Adapter，将 Quote、Bar、Indicator 与 Chip 映射到 `packages/schemas`。

## 运行验证（2026-08-01）

在 Fork 提交 `831ada5370123551e5cb4fc099208dd70e892e22` 的自有镜像中执行：

| 标的                  | 调用                                                     | 结果                                                    |
| --------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| A 股 `600519`         | `GET /api/v1/stocks/600519/quote`                        | `200`，返回贵州茅台实时价格、涨跌、成交量和更新时间     |
| ETF `510300`          | `GET /api/v1/stocks/510300/quote`                        | `200`，返回沪深 300 ETF 行情字段                        |
| 基金候选 `110022`     | `GET /api/v1/stocks/110022/quote`                        | `404 not_found`，DSA 当前股票行情路由明确不提供基金报价 |
| A 股历史行情 `600519` | `GET /api/v1/stocks/600519/history?period=daily&limit=5` | `200`，返回日线 OHLCV 与涨跌幅                          |

基金的 `404` 是实际能力边界而非测试桩；Investment OS 不把该路由误标为基金行情，后续如需基金能力应新增明确的 Fund Adapter。因此 T013 的审计、复用边界和“需补 API”结论已完成。
