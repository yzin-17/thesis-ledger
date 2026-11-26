# 美股盘中来源与采样消费者验收

关联：[自主竞技场任务 G03](../tasks/2026-11-12-autonomous-model-arena.md#部署与独立验收)、[采样模拟政策 v1](../specs/2026-11-12-autonomous-model-arena.md#采样模拟政策-v1)。

北京时间 2026-11-24 02:23（美东 11-23 13:23），AAPL 股票与 SPY ETF 沿现有富途路由各读取一次，取得当次开放会话内的实时报价。两笔原始回执复用于目标编译产物，`MarketLiveExecutionReader` 的 `sampled-v1` 及 `LiveResearchTools.quote` 均返回执行输入可用。本批完成美股盘中输入与研究报价消费者验收；没有真实模型、比赛委托或成交。

## 范围与实际入口

- 写入仅限本证据及私有目录 `.recovery-artifacts/arena-us-intraday-20261124-once/`；不修改业务源码、Task、Spec 或旧证据。
- 宿主执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`，使用 `/Users/yzin/.volta/tools/image/node/24.22.2/bin/node`。
- 源码入口：`market-session-reader.ts`、`market-period-calendar-reader.ts`、`market-live-execution-reader.ts`、`market-sampled-live-execution.ts`、`live-research-tools.ts`、`live-research-quote.ts`；实际导入目标容器 `/app/apps/server/dist/src/` 中对应编译模块。
- 目标读取通过已有 `DsaClient` 的真实 HTTP，调用次数固定为一；全局出站拦截只允许既有 DSA origin 的 GET 日历、有效策略及报价，不允许其他地址、方法或重定向。读取意图先以独占创建方式写入，已有意图禁止再次执行。
- 复用已取得的官方日历和两笔 Schema 校验后的原始报价，在内存端口装配目标编译消费者；此阶段关闭全部 HTTP 出站。研究入口的证券身份解析端口由本次已核验的符号、市场、资产类型装配，未再次访问目录或业务数据库。

目标消费者命令由宿主 `spawnSync` 启动，标准输入为私有验收脚本；没有复制文件进容器：

```sh
docker exec -i -w /app/apps/server thesis-ledger-dev-thesis-ledger-1 \
  node --input-type=module - \
  < .recovery-artifacts/arena-us-intraday-20261124-once/capture-target.mjs
```

实际执行的上述命令退出 0，完整标准输出和错误输出分别保存于私有目录 `target-stdout.log`、`target-stderr.log`。原始回执另保存为 `receipt.json`。本批只执行一次，没有自动重试。

## 正式会话与当前路由

`MarketSessionReader` 经目标 DSA 日历 HTTP 返回 `state=open`、`tradingDayState=open`、日期 `2026-11-23`、时区 `America/New_York`。当前时段为 UTC 14:30—21:00，即美东 09:30—16:00；核对时刻为 UTC `18:23:41.270`。日历修订为 `market-period-calendar-v1:a759bbaaa60454dd94308f7d7ed9cfc0ca2f3a8b7b6f412d3acaa3afa540c451`。日历覆盖 2026-11-09 至 2026-12-07，未靠宿主时区或手写开市时刻认定开市。

有效策略修订 `202`。US／STOCK 与 US／ETF 的 `REALTIME_QUOTE` 均启用，首选目标为 `futu/futu`、`routeIndex=0`、`eligible=true`。两笔回执实际均为 `futu/futu`、`fallbackUsed=false`；备用 yfinance 未被使用。读取前后有效策略的全部实质字段一致，仅排除接口每次生成的 `appliedAt`。

## 两笔真实盘中报价

| 字段 | AAPL.US | SPY.US |
| --- | --- | --- |
| 资产类型 | STOCK | ETF |
| 价格 | 350.215 USD | 724.82 USD |
| 来源时刻（UTC） | 2026-11-23 18:23:40 | 2026-11-23 18:23:39 |
| 抓取时刻（UTC） | 18:23:41.684171 | 18:23:42.282571 |
| 新鲜度 | live，非 stale | live，非 stale |
| 交易所 | US_NASDAQ | US_AMEX |
| 来源证券 ID | 205189 | 202805 |
| 交易状态／证券状态 | normal／NORMAL | normal／NORMAL |
| 退市标识 | false | false |
| 每单位股数／成交量单位 | 1／share | 1／share |
| 采样模拟价位 | 0.01 USD | 0.01 USD |
| 执行输入 | available | available |
| 研究报价执行状态 | available | available |

两笔来源时钟均落在当次正式开放时段，读取时延分别约 1.68 秒和 3.28 秒；消费者的 60 秒报价期限检查通过，`liveQuoteDiagnostics=[]`，买卖阻断均为 `null`。执行事实的市场、资产类型、证券 ID、交易所、未退市、交易状态、来源时刻及观察时刻完整，事实时钟与报价一致。成交额币种仍为 `unknown`，没有将其写成美元；该字段不参与本次价格执行输入判定。

`0.01` 是现行采样政策的模拟价位，不能据此认证交易所委托规则。AAPL 的真实最后成交价保留 `350.215`，没有改写来源价格。本批未提交委托，未以这笔快照证明任何价位舍入或实际成交结果。

## 消费者与政策口径

两例沿正式 `MarketLiveExecutionReader.read` 的 `sampled-v1` 分支取得：`status=available`、`lot=1`、`tick=0.01`，可卖日期及卖出资金可投资日期均为 `2026-11-23`。该结果是当前输入投影，账户扣款、占用与成交后的业务行为继续复用既有隔离证据，本批没有新建账户或比赛。

随后经正式 `LiveResearchTools.execute` 的 `{name:'quote',symbol}` 请求消费同笔回执，返回原始价格、币种、来源、时钟和 `execution.status=available`。工具消费者的 quote 端口及执行 reader 端口共用已保存的真实响应，没有再次访问富途。此证据证明工具代码能消费真实盘中输入；不证明真实模型曾选择或调用该工具，也不代表生产 Nest／Redis 报价缓存的完整 HTTP 用户流程验收。

采样政策下仅使用已冻结配置费用，不额外叠加公共法定收费，不模拟每日价格边界，公司行动覆盖不完整按既定无事件假设处理。本批没有持仓的跨日事件请求；没有消费旧完整执行规则、FINRA 目录或 ETF 历史归档，未将旧严格路径的缺失改写为通过。原回执中没有 `executionRules`，采样分支依然可用。

## 调用与只读保护

真实 HTTP 请求合计 5 次，均 200：有效策略 2、日历 1、行情 2。行情分别为：

```text
GET /api/v3/thesis-ledger/market/quote?symbol=AAPL.US&assetType=STOCK
GET /api/v3/thesis-ledger/market/quote?symbol=SPY.US&assetType=ETF
```

外层 DSA 行情请求为每标的一次、每次一尝试。既有富途报价适配器内部每个 quote 固定执行一次 `get_stock_basicinfo` 核验身份、一次 `get_market_snapshot` 取得快照；因此 SDK 操作口径为静态身份 2 次、行情快照 2 次。没有额外交易状态、规则或资格请求，未发生重试或备用来源读取。消费者复用阶段 `forbiddenAttempts=0`。

保护快照在实读前后各执行一次已有只读入口：

```sh
/Users/yzin/.volta/tools/image/node/24.22.2/bin/node \
  .recovery-artifacts/arena-maintenance-20261123/runtime-snapshot.mjs
docker exec -i thesis-ledger-dev-dsa-1 python - \
  < .recovery-artifacts/arena-sampled-deployment-20261123/source-control-read.py
```

PostgreSQL 使用 `default_transaction_read_only=on`，DSA SQLite 使用 `mode=ro` 与 `query_only=ON`。前后保护对账通过：

- 11 张模型调用及比赛相关表的行数和完整行摘要一致；资格日志保持 115 条。
- 原队列 `paused=true`、原维护归属一致、`active=0`、旧待办 `waiting=1`；其余队列状态一致。
- 来源策略、Provider 配置及路由准入控制表的计数、摘要一致。
- 真实模型调用 0，资格探针 0，比赛及委托操作 0，部署／同步／重启 0。

保护回执为私有目录内的 `guard-before.json`、`guard-after.json`、`source-control-before.json`、`source-control-after.json` 和 `guard-comparison.json`。保护对账退出 0。

## G03 状态建议

美股盘中来源时钟、USD、身份、正常交易状态、股数单位及 `sampled-v1` 执行 reader、研究报价消费者断言已通过，可将该有限范围回写 G03。旧严格执行资格、真实模型主动调用报价工具、真实比赛盘中委托成交及完整历史追平维持各自原状态，不能因本批成功合并为通过。旧休市来源、旧失败事实及未变化证据继续保留。
