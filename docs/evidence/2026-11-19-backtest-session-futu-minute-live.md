# T04e.2 富途真实单日复读、行情窗口冻结及策略预检

2026-11-19，富途 `600000.SH` 在 2026-11-02 的未复权一分钟来源通过时间标签、实收分页、量纲与逐日覆盖核对。已接本地正式 DSA 行情入口，并在 Server 冻结、重新打开该行情窗口。完整策略准备仍缺此前的预热窗口，T04e.2 保持未完成。[旧归档核对及构造行情 Worker 边界](2026-11-19-backtest-session-futu-minute-source-audit.md)

## 本次真实采集

本机 OpenD，Python SDK `10.8.6808`，北京时间 00:36:09。调用带单次预算保护：一次 `get_stock_basicinfo`、一次 `request_history_kline`，均成功，收到 241 行，下一页游标为空。实收 1 页；查询范围及实际页数保存在新回执。11 月 13 日旧采集的页数仍未知。本次 241 行与旧归档逐行相同，SDK 行情表摘要均为 `12980381d559881e0b45b679e86bd735fb64b027088e2925fc70f725cfb024e5`。本次包含请求及观察时刻的响应文件 SHA-256 为 `fd2f7dace4060ab38145b1de6668b9de39bfc88009fb62e4fab85768b1e02429`。

富途历史 K 线字段表明确将股票成交量计为股。核对 Python SDK 历史 K 线解码器与本地适配器，SDK 取高精度量或原生量，本地保留原值。本次 `AuType.NONE` 且数量没有复权或手股换算，据此在沪深股票未复权 1m 绑定声明 `share/original`。金额单位保留未知。SDK 日期标签及游标按其接口合同核对，Web API 与 OpenD 各自使用的分页协议独立。[历史 K 线字段](https://open.futunn.com/zh-cn/api/quote/basic-data/history-kline)；[OpenD Python 历史 K 线](https://openapi.futunn.com/futu-api-doc/quote/request-history-kline.html)

## 正式入口与回放

- 在隔离控制库配置精确路由，以原样保存的 SDK 读取器输出替代传输，调用本地正式 `POST /api/v3/thesis-ledger/market/bars`。除真实授权采集外均离线。HTTP 200，`observed-bars-only` 返回 `interval-end`、240 根连续交易分钟、1 个 `observed-traded` 日期和请求级分页证明。竞价点保存在原始 241 行中。日历、上市信息、量纲和实际观察时间进入正式响应，未将 11 月 19 日的观察时间回填到交易日。
- 用正式 `MarketWindowEvidenceV3Repository.record/findFrozen` 写入并两次重开完整响应，本地文件替代数据库存储端口。重开校验与完整响应深比较均通过；冻结内容摘要为 `49d72b8a3a2c9123825ca17cc7823d7c63a5756cd034bf7649948c46a124bd5d`。两次重读使用独立冻结日历，经过正式区间投影和固定快照研究时钟重新累计。实际行情边界如下。

| 北京时间 | 已完成分钟 | 收盘 | 累计 VWAP | 首小时 |
| --- | ---: | ---: | ---: | --- |
| 10:30 | 60 | 10.16 | 10.10318928913266417953 | 内 |
| 10:31 | 61 | 10.18 | 10.10457691622251141817 | 外 |

- 在同一标的上以当日累计均价、空仓及精确分钟条件调用正式 `prepareBacktestRunConfigV3`，采用显式研究执行模型、未复权原始份额记账和固定快照。正式读取参数为 `warmup.minimumSessions=1`、`start=2026-10-17`、`end=2026-11-02`，取价规划为 1 个预热期加日历缓冲。隔离读取端只供应已冻结的单日窗口；精确范围不匹配，正式准备返回 `blocked / insufficient-coverage / DATA_UNAVAILABLE`，缺 `coverageProof.completeRequestedWindow`。DSA 的比赛分钟归档内，同源同标的只查到 11 月 2 日。此层未创建策略快照或订单。先前构造行情的 60／61 成交边界回执继续有效。
- 下一步需同一来源覆盖正式预热请求的回执，再继续策略冻结及 Worker 重放。原始份额记账还会独立检查现金分红、拆股和合股的事件覆盖；本次在取价阶段已停止，未验证该后续依赖。单日授权已用完，未重跑 ATR、部署或修改真实控制库。

## 改动与验证

DSA 修改富途历史读取、分钟绑定与内部标准结果、分钟执行及历史归档，保存实际页数和请求区间；精确行情请求、研究日历及分钟窗口投影核对完整时段。日线沿用既有校验。已登记分钟专属反例，覆盖两页、缺分钟、重复、全天零量、错误分页范围、未结束或缺失分页、其他资产和来源。

私有回执位于 ThesisLedger 的 `var/acceptance/t04e-minute-600000-20261119-live/`。其中 `started.json`、`events.jsonl`、`result.json` 为实读；`request.json`、`response.json`、`frozen-row.bin`、`window-replay.json` 和 `preparation.json` 为隔离重放。以下为本次命令；单次读取脚本有已执行标记。

```sh
# 从 ThesisLedger 根目录确定回执位置
A="$PWD/var/acceptance/t04e-minute-600000-20261119-live"
# 在 daily-stock-analysis 根目录执行
rtk proxy env PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=. .venv/bin/python "$A/probe.py"
rtk proxy env PYTHONPATH=. .venv/bin/python -m pytest -q "$A/test_capture.py" --tb=short
rtk proxy .venv/bin/python -m pytest -q tests/test_futu_observed_minute_window.py tests/test_futu_minute.py tests/test_arena_history_source.py tests/test_thesis_ledger_futu_minute_capability_path.py tests/test_thesis_ledger_futu_capability_path.py tests/test_thesis_ledger_daily_tradability.py tests/test_thesis_ledger_multi_window_api.py --tb=short
# 在 ThesisLedger 根目录执行
rtk proxy node_modules/.bin/vitest run --config "$A/vitest.config.mts" "$A/replay.test.ts"
```

DSA 七个定向文件 **133 例通过**，另有真实捕获 HTTP 重放 1 例通过；Server 冻结、重开、边界及预检阻止断言 1 例通过。DSA 定向 Flake8 致命错误／未定义名检查通过。保留 pytest 现有框架弃用及收集警告。
