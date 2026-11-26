# T04e.2 富途一分钟来源核对与首小时边界验收

2026-11-18 至 19 日核对富途 `600000.SH` 在 2026-11-02 一个交易日的已有响应。时间标签和当天连续时段覆盖通过，分页实收页数及成交量口径缺证。T04e.2 保持未完成，真实来源尚未接通正式回测或完成冻结回放。本轮没有上游请求、ATR 重跑或部署。

## 输入与逐日覆盖

来源及上游均为 `futu`，沪市股票，原生 `1m`、常规时段、`Asia/Shanghai`；该分钟适配器只接受 `none` 复权参数。从 DSA 持久化卷按原有内容地址只读导出。[原始采集记录](2026-11-13-arena-historical-sources.md)

| 输入 | 可核对的身份 |
| --- | --- |
| 分钟归档 | `arena-history/0ef07ccf6f70f91ba624a9ba14b8eb2b517795c0edca9e7e9817519780ed47df.json`，字节 SHA-256 与文件名一致，策略修订 199 |
| SDK 合并后的行情表 | 回执内 `responseSha256=12980381d559881e0b45b679e86bd735fb64b027088e2925fc70f725cfb024e5`；观察于北京时间 2026-11-13 00:25:06 |
| 独立交易日历 | `.recovery-artifacts/arena-real-execution-20261116-final/calendar.json`，SHA-256 `f08d9fc4252d38349ad9dd0977396d3c86aa5fc08c695b51793a2e88a2029aa8`；修订 `exchange-calendars-4.13.2-release-evidence-v1`，覆盖 10-27 至 11-24，含目标日 |

回执明确标注 `interval-end`。按冻结日历构造 09:31～11:30、13:01～15:00 的逐分钟结束时刻，并与原始有序时间戳逐项比对。窗口内 1／1 个交易日、240／240 根连续交易分钟，缺失与重复均为零。另有一条 09:30 竞价记录，原样保留；会话时钟将其标为 `OUTSIDE_SESSION`。241 行均标为已完成且收盘与成交量数值有效。采集发生于交易日之后，回执不能证明盘中逐根实时到达。

## 来源资格与正式入口

- 富途当前读取器在 SDK 成功且下一页游标为空时返回合并表。分钟归档保存了合并表摘要，没有保存实际页数及绑定请求起止日期的分页凭据。复核持久化卷内同一标的同一日的另两份分钟归档，三份表摘要一致，均没有分页字段。241 行少于单页上限 1000，仍无法据此还原实际请求次数。当天时段覆盖已独立核实，但正式逐日证明仍缺该请求的传输证据。
- 三份响应均声明 `fieldUnits.volume=unknown`、`fieldUnits.amount=unknown`。累计 VWAP 使用收盘价和成交量；金额单位不影响本项。现存材料不能证明成交量单位及其与数量坐标的兼容关系。
- 在 DSA 工作树离线调用正式请求校验器 `api.thesis_ledger._market_data_v3_request`。固定上述元组与单日窗口的基础请求通过，只增加 `tradabilityMode=observed-bars-only` 即返回 `422 invalid_response`。这是请求解析处的结果，未发送 HTTP 或读取上游。当前该校验器只接受日线的缺日模式。来源证据符合合同后，才可为合格分钟绑定接通此入口并冻结真实输入。

## 第 60／61 分钟

| 验证对象 | 第 60 分钟 | 第 61 分钟 |
| --- | --- | --- |
| 真实标签与正式 Domain 会话时钟 | 10:30，收盘 10.16，原始量 604300，`withinFirstHour=true` | 10:31，收盘 10.18，原始量 871778，`withinFirstHour=false` |
| 独立构造的冻结 Worker 样本 | 首次收盘突破累计 VWAP，严格后续 10:31 开盘买入 1 笔 | 首次突破推迟一分钟，零成交 |

构造样本沿用既有模拟行情及单位声明。两侧使用相同的空仓、首小时和价格条件，突破前各分钟收盘均为 100，首次突破为 200；分别冻结，分别运行两次并比较完整结果。该文件原有第 31／32 分钟反例也通过，共 4／4。真实回执本轮只验证时间边界，尚无该标的的正式成交或 Worker 回放回执。

## 复核命令与结果

在 ThesisLedger 根目录执行；DSA 的请求验证使用其本地 Python 环境。本地验收目录保留原始分钟、日历副本、核对脚本、结构化结果及测试日志。

```sh
A="$PWD/var/acceptance/t04e-minute-600000-20261118-2nvwer"
rtk proxy node "$A/audit.mjs"
(cd ../daily-stock-analysis && rtk proxy env PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=. .venv/bin/python "$A/check_request.py")
(cd apps/server && rtk proxy ../../node_modules/.bin/vitest run test/backtest/session-minute-counterexample.test.ts)
rtk proxy node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit
rtk proxy node_modules/.bin/eslint apps/server/test/backtest/session-minute-counterexample.test.ts
```

来源核对断言、请求校验正反例、定向测试、Server 类型检查及单文件 ESLint 均通过。下一步先在同一元组取得可绑定到请求的实收页数、结束状态及有依据的成交量单位／数量坐标；再投影连续交易时段与逐日证明，用正式入口冻结并重复回放。
