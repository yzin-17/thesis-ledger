# T04e.2 富途一分钟预热窗口与首小时订单边界

2026-11-19，AC12 的分钟来源和本地 Worker 模拟执行通过。标的是 `600000.SH`，来源为富途 OpenD，取价为未复权一分钟，预热窗口为 10 月 17 日至 11 月 2 日，订单只在 11 月 2 日评估。现有查询未见相关公告，经用户确认，11 月 2 日按无现金分红、无拆并股记账。[任务](../archive/tasks/2026-11-15-backtest-trade-plans.md) · [AC12 规格](../specs/2026-11-15-backtest-trade-plans.md) · [上一轮单日回执](2026-11-19-backtest-session-futu-minute-live.md)

## 真实来源和冻结输入

- 富途 Python SDK `10.8.6808`，一次静态资料读取，三次历史 K 线请求。每页实收 1,000、1,000、651 行；前两页带续页游标，第三页结束。SDK 合并响应摘要为 `0dbcbae20290d6058b0df0280da8a3b098ee353822ef96b7dc7433d583fc5f88`。实际观察时间为北京时间 11 月 19 日 01:02:00。
- 有行情的日期为 10 月 19～23 日、26～30 日及 11 月 2 日。逐日比对来源行与冻结日历，11 天各有一个 09:30 竞价点和 240 根连续交易分钟。正式 DSA 行情入口以 SDK 原始响应离线重放，每天保留 09:31～11:30、13:01～15:00 的全部结束标签。逐根核对时间、开高低收、成交量及成交额共 2,640 根。11 月 2 日全部 241 行与旧单日回执逐行相同。成交量使用原始股数。
- 经 `MarketWindowEvidenceV3Repository.record/findFrozen` 冻结、重开两次，完整响应相同。证据行的数据库端口使用隔离文件，完整响应摘要为 `bd61f27e5578b3dc28455b0f2795e808e9ad587bf2fbe511e26e4c8b00ab5095`。执行、信号和基准所用的同一行情输入指纹为 `9fd768f7a1b8560c0ed182fda65d49a8aa32429de6feb0d061fdfe2002da7eaf`。研究时钟为固定快照，`dataAsOf=2026-11-18T17:02:01.953Z`。

## 预检与修复

| 本地正式入口 | 输入与结果 |
| --- | --- |
| 策略准备 | 两条策略使用完整请求窗口及 `observed-bars-only`，均返回 `prepared`，执行行情预检为 `ready`。旧单日窗口的覆盖不足回执保留。 |
| 联合预检、冻结配置复用 | 修复前，联合预检以日线能力描述分钟路由，两侧均返回 `invalid-input / requirements.0.capability`。修正能力后，预检读取仍因省略周期而选择了日线的缺行情假设。两条入口现从执行路由取能力，共用的执行预检把周期传给读取选项。修复后两侧联合预检均为 `ready`，冻结配置重建的凭据均通过实际创建守卫。 |
| 真实公司行动路由缺失对照 | 开发 DSA 控制库只读核对，修订 202，149 条生效路由；该分钟键首选富途。沪深股票 `CASH_DISTRIBUTION` 和 `SPLIT_EVENT` 的期望路由、生效路由及准入记录均为零。将这两个生效路由的空结果代入同一隔离预检，返回 `blocked / DATA_UNAVAILABLE`，两项均为 `not_admitted`。未向公司行动来源发请求。 |

联合预检成功样本及 Worker 使用真实冻结行情、研究日历及标的身份回执，采用显式研究执行模型。隔离控制修订为 1，公司行动使用 `fixture-actions/fixture-events` 的已覆盖空事件样本。该样本验证订单边界，不能证明当天实际没有公司行动。开发环境全真实依赖就绪仍缺上述两类覆盖。

## Worker 订单与重复回放

两份固定策略只改变允许触发的精确分钟。共同条件为持仓为空、收盘高于当日累计 VWAP、从开市起经过的分钟数小于等于 60。VWAP 按已完成分钟的收盘价乘成交量累计。两侧价格条件都成立。

| 11 月 2 日决策时刻（北京时间） | 已过分钟 | 收盘价 | 累计 VWAP | 首小时 | 冻结 Worker 结果 |
| --- | ---: | ---: | ---: | --- | --- |
| 10:30 | 60 | 10.16 | 10.10318928913266417953 | 内 | 下一可撮合分钟 10:31，以 10.18 买入 24,500 股，零拒单 |
| 10:31 | 61 | 10.18 | 10.10457691622251141817 | 外 | 零成交，零拒单 |

正式 `DsaSnapshotBuilder.buildV3` 为每侧写本地快照及 Parquet。冻结后行情读取被禁止，`LocalSnapshotV3Runner.run` 对每侧运行两次，分别深比较完整结果。对应结果校验值为 `5a3eab2420f6dc4d`、`1b020ea9c9dbdbc0`。Worker 的结果完整性仍为 `partial`，保留真实停复牌不可用、原始公司行动基准不支持等披露。此处验收时钟和订单，不据此比较策略收益。

## 命令与回执

私有目录为 `var/acceptance/t04e-minute-600000-warmup-20261119-DxA0Af/`。实读记录在 `started.json`、`events.jsonl` 和 `result.json`；`coverage-check.json` 保存逐日核对。`joint-red.log`、`joint-after.log` 保留两次定位结果。`source-policy.json` 和 `joint-missing-events.json` 保存独立阻断对照。两侧的 `preparation-*.json`、`joint-60/61.json`、`configured-*.json`、`snapshot-60/61/` 及 `worker-*.json` 保存准备、联合预检、创建凭据、快照和回放结果。

```sh
# 在 ThesisLedger 根目录设置回执目录
A="$PWD/var/acceptance/t04e-minute-600000-warmup-20261119-DxA0Af"
# 在 daily-stock-analysis 根目录执行。probe.py 用独占标记保护已经完成的实读
rtk proxy env PYTHONPATH=. .venv/bin/python "$A/probe.py"
rtk proxy env PYTHONPATH=. .venv/bin/python -m pytest -q "$A/test_capture.py" --tb=short
# 在 ThesisLedger 根目录执行
rtk proxy python3 "$A/verify-days.py"
rtk proxy pnpm exec vitest run -c "$A/vitest.config.mts" "$A/replay.test.ts"
rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/backtest/session-preparation.test.ts test/backtest/backtest-run-preflight.test.ts test/backtest/backtest-configured-run.test.ts test/backtest/backtest-preflight-v3-execution.test.ts
rtk proxy pnpm --filter @thesis-ledger/server typecheck
rtk proxy pnpm exec eslint apps/server/src/backtest/backtest-configured-run.service.ts apps/server/src/backtest/backtest-run-preflight.service.ts apps/server/src/backtest/backtest-preflight-v3-execution.ts apps/server/test/backtest/session-preparation.test.ts
```

DSA 正式 HTTP 入口重放 1 例、真实窗口两侧回放 2 例、Server 定向 4 文件 53 例通过，Server 类型检查及上述 4 文件 lint 通过。沿用前次 DSA 七文件 133 例回执。此次没有重跑 ATR、部署、提交、推送或修改真实来源配置。

## 全真实联合预检的公司行动核查

2026-11-19 只读复核。两条正式诊断的事件生效窗口都是 **2026-11-02 当天**。10 月 17 日开始的预热只扩大行情范围。按现有证据，浦发银行当天的现金分红和拆并股情况均为未知。

| 核查对象 | 查到的证据 | 对本次预检的结论 |
| --- | --- | --- |
| 当前代码和开发 DSA 容器 | 两边分别枚举 `iter_event_adapters()`，均有 10 个 Event V3 绑定，资产全部为沪深 ETF。开发库 SQLite 以只读方式打开，政策修订 202；两个股票事件键的期望路由、生效路由、准入记录均为 0。 | 股票事件缺适配和准入，仅启用现有来源无法解决。 |
| 上交所历史公告归档 | 核对 `historical_event_coverage/proof.json`、原目录采集回执和已加载来源的资产约束。日期覆盖 11 月 2 日，证券仅有 510300.SH、588000.SH，读取器按证券和窗口检查范围。 | 两只 ETF 的无事件证明无法用于 600000.SH。[原验收](2026-11-16-arena-official-event-coverage.md) |
| 其他历史实读 | HiThink 的完整股票事件流回执属于 600519.SH。11 月 2 日在其已核对窗口内，标的不匹配。富途 600000.SH 的回执是静态资料和分钟行情，没有除权事件响应。 | 均无法证明目标股票当天的事件情况。[股票事件流原验收](2026-11-06-research-economic-price-qualification.md) |
| 公告缓存、私有回执和历史任务 | 开发 DSA 公告缓存的 JSON 中核对了 120 个证券标识字段，目标匹配 0。ThesisLedger 的 `.recovery-artifacts/` 和 `var/acceptance/` 中按标的检索 JSON、JSONL、原始响应和 CSV，交叉核对事件及目录字段，命中的是旧阻断诊断和参考资料中的标的名称。PostgreSQL 只读事务中有 28 条回测任务与该日重叠，其快照清单含 600000.SH 的为 0。 | 已查材料中没有可复用的目标股票完整事件回执。 |

本轮复用原联合预检阻断回执，保留真实分钟和受控公司行动的 Worker 结果。全真实回放待补两项股票证据。下一步拟只读采集上交所该证券公告目录，按原文核对分红登记、除息、发放及拆并股生效日期，并追踪更正。目录完整性、证券身份、公告披露与实际采集时刻分别留证。资料核实后仍须验证股票事件绑定；真实路由启用单独授权。

### 600000 股票公告目录实读

2026-11-19 在本次授权内计入 **2 次目录请求、0 份公告原文**。目录查询使用冻结上市资料中的 1999-11-10 作为起日，以冻结时点所在北京时间日期 2026-11-19 作为止日。完整性检查停在首页。

| 请求 | 实收结果 |
| --- | --- |
| 上交所上市公司公告页面，指定 `productId=600000` | TLS 握手超时，未取得页面。 |
| 上交所 `queryCompanyBulletinNew.do`，同一证券、上述日期、请求第 1 页 | HTTP 200，549 字节。回显 `productId=600000` 和起止日期，但 `SECURITY_CODE`、`START_DATE`、`END_DATE` 为空。请求页长 1,000，响应页长 10，`total=0`、`pageCount=null`，两个结果数组均为空。 |

这次响应没有给出可核对的公告清单或分页总数，无法确认股票目录覆盖范围。依照遇缺页停止的约定，未重试或请求公告原文。11 月 2 日现金分红及拆并股仍为未知，沿用原全真实联合预检阻断和已有分钟回放。

隔离回执目录为 `var/acceptance/t04e-sse-600000-20261119-TGoPPB/`，包括两个请求及其结果、首页原始字节和 `audit.json`。离线校验已核对请求计数、目标代码、空数组、缺失页数及首页 SHA-256 `d88f29c7097ef7bba7bec90e9a457ba2f90d42969419515d25915c65d34bfbd4`。

### 本次回测的公司行动取值

用户确认按已查公告决定本次回测输入。现有材料和目录响应均未见 600000.SH 涉及 2026-11-02 的相关公告，因此当天现金分红和拆并股均取空。该取值与已冻结的两份 Worker 回放一致，直接复用第 60 分钟一笔成交、第 61 分钟零成交的回执，公告核查结案。原始目录响应及股票事件路由缺失的预检诊断按实保留。
