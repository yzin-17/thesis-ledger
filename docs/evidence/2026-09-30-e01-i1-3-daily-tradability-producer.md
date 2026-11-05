# E01-I1.3：DSA 日级证据生产

## 结果

已准入 HiThink ETF 精确日线路由接通内部稀疏解析，保留原响应字节 SHA-256、真实采集时间、日历和上市事实。独立分类函数对每个预期交易日生成已观测交易或缺 Bar 不可交易假设，`instrument-facts` 返回 `historicalTradability`，共享 Schema 保留并校验该字段。缺元数据的其他来源不可用。

## 验证

- DSA：`.venv/bin/python -m pytest -q --disable-warnings -p no:cacheprovider tests/test_thesis_ledger_daily_tradability.py tests/test_thesis_ledger_v2_tradability.py tests/test_thesis_ledger_v2_dependencies.py tests/test_thesis_ledger_hithink_credential_admission_runtime.py tests/test_thesis_ledger_hithink_etf.py tests/test_thesis_ledger_market_v3.py tests/test_thesis_ledger_market_v3_admission_runtime.py`，122/122 通过。
- Schemas：`pnpm --filter @thesis-ledger/schemas test`，554/554 通过；`typecheck`、`build` 通过。
- 集成夹具通过实际准入运行时、HiThink 解析和依赖响应，覆盖缺一天及全部日期缺 Bar；源探针形状的 `159515.SZ` 三日夹具得到交易/缺 Bar/交易三种日期结果。
- 负例包括未核实分页、缺原响应字节、零量/异常/重复 Bar、缺失日期不一致、未知修订、缺日历/上市证据，以及证据晚于冻结时点。默认 Market 价格窗口的缺日拒绝保持。

## 边界与后续

本次为本地源码和夹具验收，未同步目标 Docker、未重新执行真实 Provider 探针或目标 Run。Server 尚未传入精确日线来源参数、核验该字段或冻结它；I1.4 继续承担这些工作，I1.5 承担 Runner 消费，I1.6 承担目标验收。当前采集与日历的保守可见时间不建立严格历史 PIT 资格。
