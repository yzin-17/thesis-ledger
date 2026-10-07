# R05.2 当前研究估值消费接线

## 行为边界

DSA `get_fundamental_context` 的 CN 股票路径现经 `data_provider/fundamental_valuation.py` 编排：先保留原 `get_realtime_quote`，避免改变股息率价格与其他实时报价用途；预算有剩余时，股票估值再使用最多 1.5 秒的 `RPT_VALUEANALYSIS_DET` 原响应读取器，内部不重试。成功只把最新 PE(TTM)、PB(MRQ)、元市值、原文完整证券身份与交易日期、本次观察时刻映射到研究估值块；`source_available_at=null`、`historical_visibility_verified=false`、状态 `partial`。读取失败则沿原报价估值回退，来源链及错误分别保留；ETF、海外分支不请求该读取器。

原响应读取器追加流式总截止时间检查。已捕获的 `300766` 原文仍只做离线复放，没有新增真实 Provider 请求。完整分页与内容指纹仅证明读取完整性，不证明提供者逐日版本或历史发布时刻。通用报价回退仍是原有当前研究语义，不属于 R05.2 来源准入。

## 本地验证

- `.venv/bin/python -m pytest -q tests/test_fundamental_valuation.py tests/test_fundamental_context.py tests/test_capital_flow_request_scope_context.py tests/test_eastmoney_stock_valuation_reader.py tests/test_data_tools_get_stock_info.py tests/test_fundamental_adapter.py tests/test_tw_institution_report_wiring.py`：68 passed、2 个既有依赖弃用警告。新增用例覆盖来源成功/失败、ETF/无效显式市场不调用、前缀显式市场不丢失、预算耗尽、完整上下文保留报价计算的 10% 股息率，以及流式总截止时间。
- 新生产/测试文件与资金流相邻测试的完整 flake8 退出 0；`base.py` 与 `test_fundamental_context.py` 的 `E9,F63,F7,F82` 关键集退出 0。旧 `test_fundamental_context.py` 完整 flake8 仍有既存 E123 对齐告警，不为本叶批量格式化。
- `.venv/bin/python -m py_compile` 覆盖三份生产文件及两份新测试，退出 0；DSA `git diff --check` 退出 0。`base.py` 当前 3,746 行，HEAD 为 3,774 行，本叶提取后未增加大文件规模。

## 尚未验证

没有对新消费者执行真实东财/AKShare、目标 Docker、浏览器或独立历史 PIT；前一叶单样本只能证明 `300766.SZ` 当次原响应。DSA 先前官方完整离线门禁在一次重试后仍被隔离副本的相邻 Schemas 路径阻断，本叶不第三次按同一前提重跑。来源发布日期/修订与其它证券覆盖仍缺，R05.2、G0-M 和全文 AC01–AC20 不关闭。
