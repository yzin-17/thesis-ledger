# DSA yfinance TTM 测试时钟修复证据

## 范围与输入

- 源码仅修改 `daily-stock-analysis/tests/test_yfinance_fundamental_adapter.py`；生产适配器未修改。
- 测试文件修改前 SHA-256：`874955ae676e3edeeb04a490fbe92719f96f389ecdc7611ae8e31d1bd40e3b00`。
- 生产适配器 `data_provider/yfinance_fundamental_adapter.py` SHA-256：`4fdb44dd07b211b381050f93c43b86dad56cbc9ff5e06a09f41707dd74841a4b`。
- 测试文件修改后 SHA-256：`00edc9c75a3bad8029300f68e76e84272ea7ff2eb7e80899090c9dce5e6ab745`。

## 原问题与修复

2026-09-28 的真实日期使 `2025-08-11` 派息落在 365 日 TTM 窗口外。原有两个离线用例仍预期 4 次，但实际均为 3 次。首次使用系统 `python -m pytest` 因系统解释器未安装 pytest 退出；随后使用仓库 `.venv/bin/python` 执行原两个 nodeid，结果为 `2 failed`，均在 `ttm_event_count` 的 `3 != 4` 断言处失败。

测试内仅局部固定适配器使用的 pandas 观察时刻为纽约时间 `2026-08-11 00:00:00`，此时 `2025-08-11` 事件恰好处于 365 日包含边界；原有 4 次、现金股息 `1.05` 与收益率 `0.5%` 断言保留。新增纽约时间 `2026-08-11 00:01:00` 的反例，验证刚过边界时仅 3 次、现金股息 `0.79`，历史事件列表仍有 4 条。两个原用例及反例均检查 `earnings.dividend:yfinance` 来源字段。测试固定的是局部依赖调用，没有调整系统时钟或生产 365 日逻辑。另删除原用例中未使用的 `income_df`，使本文件 lint 通过。

## 验证

命令均在 `daily-stock-analysis` 根目录执行，所有命令已结束，无保留的测试、lint 或编译会话。

| 命令 | 结果 |
| --- | --- |
| `rtk .venv/bin/python -m pytest -q tests/test_yfinance_fundamental_adapter.py::TestYfinanceFundamentalAdapter::test_populates_growth_earnings_dividend_boards_for_us_stock tests/test_yfinance_fundamental_adapter.py::TestYfinanceFundamentalAdapter::test_dividends_parsed_from_single_column_dataframe`（修改前） | `2 failed`；两个原断言均为 `3 != 4` |
| 上述两个 nodeid 加新增边界 nodeid（首次修复后） | `3 passed` |
| `rtk .venv/bin/python -m pytest -q tests/test_yfinance_fundamental_adapter.py`（最终修改后） | `13 passed, 2 warnings`；警告来自依赖包弃用提示 |
| `rtk .venv/bin/flake8 tests/test_yfinance_fundamental_adapter.py` | 退出码 0 |
| `rtk .venv/bin/python -m py_compile tests/test_yfinance_fundamental_adapter.py` | 退出码 0 |
| `rtk git diff --check -- tests/test_yfinance_fundamental_adapter.py` | 退出码 0 |

未运行全仓测试、真实 Provider、账号或目标运行态验证；本次仅修复离线测试时钟稳定性。
