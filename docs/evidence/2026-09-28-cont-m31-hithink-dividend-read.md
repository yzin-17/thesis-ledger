# M31-b1：HiThink 基金分红单标有界读取

> 后续真实探针补充：`510300.SH` 两次响应均成功、14 条且计数一致；`progress="2"` 的生产语义仍未知，详见[真实字段差异](2026-09-28-cont-m31-live-progress-drift.md)。本文件中的 76 项为探针前本地基线；当前相邻回归为 77 项。

## 实现与合同

- DSA 新增 `data_provider/hithink_fund_dividend_reader.py` 与 `tests/test_hithink_fund_dividend_reader.py`。仅请求官方 `GET /api/fund/corporate-actions/dividends`，参数为一个完整 `thscode`；API Key 只进入 `X-api-key` 请求头，不进输出或错误。
- 一次请求、禁止重定向、不隐式重试；流式响应默认最多 1 MiB、2000 条，硬上限 4 MiB、5000 条。HTTP 和业务错误映射为脱敏稳定码；JSON 非 UTF-8、重复键、非法结构、返回计数冲突均失败关闭。
- 返回原始 `item[]`、响应字节 SHA-256、实际观测时间与服务端时间戳。`dividend_count` 缺失时不宣称传输计数已核对；即使匹配，`historyComplete` 仍为 `false`。本叶不连接 V3 事件入口、不读取真实账号、不生成历史事件覆盖证明。

## 验证

- DSA `.venv/bin/python -m pytest -q tests/test_hithink_fund_dividend_reader.py tests/test_hithink_fund_dividends.py tests/test_eastmoney_fund_dividends.py tests/test_tushare_fund_dividends.py`：76 passed，其中 M31 新增 31 项；包含读取结果交给标准化器后仍保持不完整覆盖的接缝断言。
- DSA `.venv/bin/python -m flake8 data_provider/hithink_fund_dividend_reader.py data_provider/hithink_fund_dividends.py tests/test_hithink_fund_dividend_reader.py tests/test_hithink_fund_dividends.py`：通过。
- DSA `.venv/bin/python -m py_compile data_provider/hithink_fund_dividend_reader.py data_provider/hithink_fund_dividends.py`：通过。

## 剩余

M31-b2 需把读取与标准化接到精确事件来源，核验目标身份、币种、真实权限、历史覆盖、准入及冻结消费；G0-H/G-M2-Events 仍负责真实响应和独立公告验收。HiThink ETF 日线量额单位尚未签发，目标普通回测路由仍拒绝。
