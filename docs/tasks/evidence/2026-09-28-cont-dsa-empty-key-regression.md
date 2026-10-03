# DSA 空 API key 回归断言证据

日期：2026-09-28。任务：`CONT-DSA-empty-key-regression`；依据主 Task §12.9。本叶状态：`worker_done`。

## 范围与基线

- DSA HEAD：`f497b6dad0e5519bbbcce1e51a2889d2c2634009`；主仓 HEAD：`fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`。两仓其他并行 WIP 保留，未暂存、提交、回退或整理。
- DSA 仅修改 `tests/test_alphavantage_fetcher.py`、`tests/test_finnhub_fetcher.py` 的 `test_init_without_key`；主仓仅新增本文。生产抓取器、配置及其他测试只读。
- 两个生产抓取器均用 `(api_key or "").strip()` 将缺失 key 规范化为 `''`；`_fetch_raw_data` 在来源 HTTP 前以空 key 抛出 `DataFetchError`。本轮未改变此行为。

## 输入摘要与复现

| 输入文件 | 修改前 SHA-256 | 修改后 SHA-256 |
| --- | --- | --- |
| `tests/test_alphavantage_fetcher.py` | `27df72eeec2e258e4a7d1618180ee54d8d973f8f730f925f7bbbd10fe00b1100` | `6382aecfee8111da126ffe93644da8ef8757dac5f055b5e6a7a52ef88c3733b1` |
| `tests/test_finnhub_fetcher.py` | `38e262750fee00a3e68dba486d57e93bbf2330b31db28dc32d78454ea6ddcd21` | `1f20cd52d06bd673bfc1789a9bb441b7a0bb90b55e2afedb521f24acd0d0064a` |
| `data_provider/alphavantage_fetcher.py`（只读） | `208ba16d166f545587ce58c0f2b50c9f467523d6a67bec4cd6de472b0cd7ef27` | 相同 |
| `data_provider/finnhub_fetcher.py`（只读） | `16e35c942ea84854e3e909ea2722407dfe22a5a91b654acb31ee7b246cd48aec` | 相同 |

修复前用 DSA `.venv/bin/python -m pytest -q` 执行以下两个精确 nodeid，结果 **2 failed**；两项均是旧断言 `assertIsNone(f._api_key)` 遇到实际 `''`，没有来源请求：

```text
tests/test_alphavantage_fetcher.py::TestAlphaVantageFetcherInit::test_init_without_key
tests/test_finnhub_fetcher.py::TestFinnhubFetcherInit::test_init_without_key
```

修复后两用例断言空串，并在同一缺 key 实例上调用 `_fetch_raw_data`：预期 `DataFetchError` 含 `API key not configured`，且对应 `requests.get` mock 的 `assert_not_called()` 成立。这验证了当前空 key 合同及该入口零来源 HTTP 调用。

## 限定验证

| 检查 | 结果 |
| --- | --- |
| `.venv/bin/python -m pytest -q` 加上述两个精确 nodeid | **2 passed，2 warnings**。 |
| `.venv/bin/python -m pytest -q tests/test_alphavantage_fetcher.py tests/test_finnhub_fetcher.py` | **31 passed，2 warnings**。 |
| `.venv/bin/flake8 tests/test_alphavantage_fetcher.py tests/test_finnhub_fetcher.py` | 通过。 |
| `.venv/bin/python -m py_compile tests/test_alphavantage_fetcher.py tests/test_finnhub_fetcher.py` | 通过。 |
| `git diff --check -- tests/test_alphavantage_fetcher.py tests/test_finnhub_fetcher.py` | 通过。 |

两条 warning 均来自已安装 FastAPI/Starlette 依赖的弃用提示。未执行第三次 DSA 全包、真实网络或 Provider/账号、Docker/目标运行态；旧完整离线门禁的失败统计不因本叶局部通过而改写。本证据只关闭上述两条无 key 旧断言。
