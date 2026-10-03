# R05.3 Yahoo 季度同比日期核验

## 原问题与修复

旧 `YfinanceFundamentalAdapter._yoy_from_row` 将季度 DataFrame 的第 5 列固定视为去年同期。缺失某一季度时，第 5 列可能属于更早或不同报告期，仍产生看似确定的同比。新增缺去年同日、同期位于非第 5 列、重复同期、非日期列及通过现有研究适配器回退的合成测试；其中四条在旧实现上失败，缺期样本错误地把 `2026-03-31` 与 `2024-12-31` 相比得出 100%。

现按有效列日期找唯一最新报告日及上一年同月同日；重复或无效日期、缺去年同期、无有效分母均不从报表生成同比。适配器保留原 `.info` 增长率回退与未知状态，不用相邻季度作为同比。此检查仅确认报告期，不推导发布时刻或历史可见性。

## 本地验证

- `.venv/bin/python -m pytest -q tests/test_yfinance_financial_period.py tests/test_yfinance_fundamental_adapter.py tests/test_fundamental_context.py`：44 passed、2 个既有依赖弃用警告；新文件 10 项含前一叶期间对齐与本叶同比反例。
- `.venv/bin/flake8 data_provider/yfinance_fundamental_adapter.py tests/test_yfinance_financial_period.py` 和两文件 `py_compile` 退出 0；`git diff --check` 退出 0。

## 未完成

这是 US AAPL 形状的合成字段合同；yfinance 底层响应证券身份、真实财报报告期、币种、发布/修订时刻与访问条款尚未采集或确认。R05.3/4、G0-R、严格 PIT 与全文 AC01–AC20 继续开放，不能以本地同比验证代替真实准入。
