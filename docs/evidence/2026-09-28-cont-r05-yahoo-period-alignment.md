# R05.3 Yahoo 财务期间对齐

## 来源与问题

本机安装 yfinance 1.7.0。其官方文档分别将 [`quarterly_income_stmt`](https://ranaroussi.github.io/yfinance/reference/api/yfinance.Ticker.quarterly_income_stmt.html) 与 [`quarterly_cashflow`](https://ranaroussi.github.io/yfinance/reference/api/yfinance.Ticker.quarterly_cashflow.html) 定义为 DataFrame 属性；[`get_info`](https://ranaroussi.github.io/yfinance/reference/api/yfinance.Ticker.get_info.html) 是独立字典入口。文档未给本叶使用的 `.info` 财务汇总字段统一期间、原披露时刻或修订合同，不能从字段名推定历史可见性。

现有 `YfinanceFundamentalAdapter` 先取季度利润表首列日期，却直接取现金流首列；现金流错期时还可能回填 `.info.operatingCashflow`，并把币种本身视为非空财报。先写 4 个合成反例，均在旧实现上失败，证明错期取值、仅币种误报和期间标签缺失。

## 本地修复与验证

- 季度利润表只接受可排序日期列；利润与现金流数值必须来自同一有效报告日期，重复或缺失同日期列不映射。缺一项不以 `.info` 汇总补齐季度记录，`info.returnOnEquity` 不挂到季度财报行。
- 无可映射季度数值时，独立取 `.info` 汇总，`period_basis=info_aggregate_period_unknown`、`report_date=null`；有效季度记录标 `quarterly_statement`。两者均明确 `source_available_at=null`。只有币种或其他非数值元数据时不生成 `financial_report`。
- 新增测试补充季度日期列但无可映射数值的回退，以及现有 `get_fundamental_context('AAPL')` 的离线消费；`tests/test_yfinance_financial_period.py` 共 6 项。与既有 Yahoo 适配器及上下文组合：`pytest -q tests/test_yfinance_financial_period.py tests/test_yfinance_fundamental_adapter.py tests/test_fundamental_context.py`，40 passed、2 个既有依赖弃用警告。
- `.venv/bin/flake8 data_provider/yfinance_fundamental_adapter.py tests/test_yfinance_financial_period.py` 与两文件 `py_compile` 退出 0。完整 lint 首次发现该适配器原有未使用 `timedelta` 导入，限本文件移除后通过；`git diff --check` 退出 0。

## 未完成

这只证明 US AAPL 合成季度/汇总映射及既有研究 Consumer 的本地保真，HK 路径仅继承原相邻测试，不等于 US/HK 真实数据准入。未调用 Yahoo、未确认其底层 endpoint/访问条款、真实响应证券身份、财务币种、公告/修订时间或目标运行。季度末是报告期而非披露时刻；R05.3/4、G0-R、严格 PIT 和全文 AC01–AC20 继续开放。
