# 日线委托合同修复后的原生模型定向复验

## 范围与输入

对应 [Task T04d.6b](../archive/tasks/2026-11-15-backtest-trade-plans.md)；复用[订单合同修复](2026-11-17-backtest-daily-order-generation-contract.md)后的源码，保持三个策略用途均为 v5、`native_schema`。本轮仅验证发现、编写、修改的四组成对意图，不追加业务提示、改模型参数、部署或处理原 ATR 失败样本。模型为真实 lmstudio 的 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，配置费率为零。

八个位置为 `limit`／`market`、`touch`／`close`、`each-fill`／`full-fill`、`day`／`two-bars`；沿用既有无字段名自然语言。独立发现目标为 `minClosedTrades: 0`，生产默认值未改。发现使用正式消息准备与合同，再由验收夹具追加自然语言意图；生产发现 API 没有对应自由文本字段。编写与修改使用实际操作消息、Schema 和最终入口校验，修改额外检查允许范围。每个预定位置生成一次，不因失败追加提示或抽样。发现的 `each-fill` 与 `two-bars` 实际消息相同，本轮按两个预定成对位置分别调用、保留两次结果；两者不能作为不同输入的因果对照。

合法配置经正式创建服务写入专属临时 PostgreSQL、原样重读，使用冻结行情和日历执行实际 Worker，两次完整运行比较回放结果，并逐份记录配置生成的中文及成交明细。此层不等于目标容器部署或真实队列生命周期验收。非法配置保留原始输出，不补订单、不修 JSON 后执行。

## 执行入口与资源

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。

```sh
BACKTEST_PLAN_ENTRY=<入口> BACKTEST_PLAN_SCENARIO=daily-orders BACKTEST_PLAN_CASES=<四个位置> node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs <独立目录>
```

按入口串行执行，首组位置为 `limit,market,touch,close`，第二组为 `each-fill,full-fill,day,two-bars`。每批只读真实 Provider，使用私有资格探针；正式路由和资格零写入。维护入口创建本次 tmpfs PostgreSQL，执行 53 份迁移，核对库名及 owner，结束后删除本次测试容器。原生 Schema 预算、发现输出 16,384、编写／修改输出 8,192、既有调用时限保持原值。

## 当前结果

本轮完成六批、30 次真实 HTTP 请求：六次私有资格探针和 24 次业务生成，无传输重试、无未知结果；三个用途及全部业务请求保持 v5／原生模式。23 份业务输出有完整 JSON，一份编写输出因原 8,192 token 上限截断。六批 Provider 设置深比较相同，未写真实路由、资格、Provider 或历史策略。

| 入口 | 完整通过 | 完整成对通过 | 未通过 |
| --- | --- | --- | --- |
| 发现 | 0／8 | 0／4 | 七份 Schema／最终合同拒绝；一份合法结构误选，冻结价格证据拒绝执行 |
| 编写 | 2／8 | 0／4 | 五份 Schema／最终合同拒绝；一份截断 |
| 修改 | 8／8 | 4／4 | 无 |

| 位置 | 发现 | 编写 | 修改 |
| --- | --- | --- | --- |
| `limit` | 十进制常量非法、缺普通退出模板 | `length`，8,192 输出 token，无最终 JSON | 通过 |
| `market` | 十进制常量非法、缺普通退出模板 | 通过 | 通过 |
| `touch` | 擅加阶段、零价格、缺普通退出模板 | 单腿止损误设 OCO 组 | 通过 |
| `close` | 擅加阶段、价格非法、缺普通退出模板 | 普通退出的委托价格为零 | 通过 |
| `each-fill` | 十进制常量非法、擅加阶段、缺普通退出模板 | 单腿止损误设 OCO 组 | 通过 |
| `full-fill` | 缺普通退出模板 | 委托价格引用未声明的 `low` 字段 | 通过 |
| `day` | 十进制常量及阶段阈值非法，擅加阶段 | 缺普通退出模板 | 通过 |
| `two-bars` | 合法结构误选；冻结前置证据不兼容 | 通过 | 通过 |

### 请求、原生约束与失败分类

24 份业务请求的输入消息与 adapter 请求逐份相同，消息内容哈希与实际出站捕获逐份相同；实际传输均为 `strict: true`，合同版本均为 v5。独立使用已安装的 Ajv 6.15.0，直接以每次出站的 draft-07 Schema 校验对应原始输出：23 份完整业务 JSON 中 15 份通过、八份不通过。不是仅对源码或预期 Schema 作推断。

- 八份原生 Schema 不通过：发现七份及编写 `day`。包括十进制 `pattern`、必需模板的 `contains` 等已明确发送的约束未被输出满足。HTTP 正常返回并不证明原生约束已约束住该输出；SDK 保持拒绝。本轮未检查模型服务端的内部约束实现，不推断具体后端原因。
- 四份通过原生结构但未通过最终合同：编写 `touch`／`each-fill` 的 OCO 配对、`close` 的正价格、`full-fill` 的来源字段引用。原生投影没有完整承载这些交叉引用／细化约束，最终 Zod 保留并执行检查。这四份不是最终合同中的合法交易计划，也未被修补后送入执行。
- 一份截断：编写 `limit`，终止原因 `length`、8,192 输出 token、缺最终 JSON。未提高额度或重试。
- 一份合法结构误选：发现 `two-bars`。模型把“仅空仓入场”改成均线上穿 100，增加均线下穿普通退出和收盘百分比保护，限价／触价保护价格也改成均线；中文逐项显示这些原配置。配置已通过正式创建服务保存和重读，但冻结前置检查因绝对价格规则缺少可核验转换证据而拒绝，未进入 Worker 撮合。原收据的粗分类 `execution_or_persistence_failed` 和 `phase: execution` 保留；本报告细分为意图误选与冻结前置阻塞，不记为引擎成交偏差。

未发现本轮意图在现有合同中无法表达的新证据；定向固定样本的 72 例证据沿用前次报告，不重跑。完整通过的十份配置未观察到执行偏差；被拒或冻结前置阻塞的输出不能作为引擎行为验收。发现目标零笔已进入真实请求，但发现仍未通过；这些样本不能证明原目标与模型擅加规则之间的因果。

## 执行、回放及中文

十份通过配置均在专属 PostgreSQL 原样保存、重读，冻结 Worker 结果两次一致，纯执行结果重复一致，`intentIssues`／`executionIssues` 为空；修改的实际差异仅为允许的 `execution` 或 `tradePlan`。以下用修改入口四组完整成对结果列明事实，数量为本次回测研究单位，显式模拟额度为每根 100：

| 成对意图 | 实际成交／订单结果 | 配置中文的区别 |
| --- | --- | --- |
| 限价／市价 | 均在 5 月 19、20 日各买 100；限价分别为 9.5，市价分别为 10.01 | 限价读取信号日最低价；市价在后续开盘撮合 |
| 触价／收盘保护 | 均先买 100；触价侧 5 月 20 日卖 100，收盘侧 5 月 21 日卖 100，卖价均为 8.4915 | 触发价 9、逐次成交后按量保护；首笔成交价下方 10%、后续开盘退出 |
| 逐次／全成激活 | 逐次侧买 100 后在 5 月 20 日卖 100；全成侧只分两日各买 100，余单到期且不启用保护 | “每次成交后按量保护”与“全部成交后才启用；部分成交后撤余单不启用”分别出现 |
| 当天／两根有效 | 当天侧仅 5 月 19 日买 100；两根侧 5 月 19、20 日各买 100 | “激活当根结束到期，不跨夜”与“含激活根两根交易日线，可跨夜”；保护均持续本轮持仓 |

触发价 9 与实际卖价不同：样本后续开盘跳空至 8.5，成交含原配置滑点。全成样本的额度 100 仅检验未全成时不激活；另以**本次新生成的原配置**和独立行情、显式每根 50,000 研究单位上限，运行现有补测：

```sh
BACKTEST_DAILY_COMPLETE_CAPTURE_DIR=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance/backtest-daily-orders-contract-modification-b-20261117 pnpm --filter @thesis-ledger/server exec vitest run test/backtest/daily-order-model-complete.test.ts
```

一例通过，日志 `/tmp/backtest-daily-orders-contract-full-fill-complete-20261117.log`。父单开盘一次全成，在同根建立等量保护，最早可参与同根后续区间，下一有效行情全部卖出；父子累计成交数量相同，Worker 完整回放一致、配置未变、模型新调用为零。原始结果为该批 `full-fill-complete.json`、`full-fill-complete-attempt-cap50000.json` 及 `full-fill-complete-snapshot-cap50000/`。

通过的十份配置及发现误选的一份配置，均以实际原样配置加载桌面摘要、版本详情和移动页面，检查 1440／1024／768／390 四宽。最终 **132 张页面**逐条中文一致、无溢出或页面错误；版本详情切换页签后仍保留说明。生成时中文与当前回读相同；窄屏市价与全成保护页面已目视检查。修改按允许范围保留旧名称／描述，中文交易说明从实际结构生成，未按旧描述猜执行。非法输出没有可确认的合法配置中文，保留其原始 JSON 和拒绝路径。

浏览器使用现有 `apps/desktop/test/backtest-trade-plan.vite.config.mjs` 及 `scripts/local-runtime/backtest-trade-plan-browser.mjs`，每次 `BACKTEST_PLAN_CASES` 仅选择本批已捕获的合法配置。首次启动误用普通 Vite 配置，移动虚拟模块 404；保留失败日志、当时八张页面及读回文件，切换现有专用配置后重新验证通过，八张不计入 132 张成功页。此为受控 GET 数据下的实际页面，不代表目标部署或原生设备验收；本轮浏览器宿主已关闭。

## 批次、路径及退出结果

各目录前缀为 `var/acceptance/backtest-daily-orders-contract-`，后缀为 `-20261117`；对应日志前缀为 `/tmp/backtest-daily-orders-contract-`、后缀为 `-20261117.log`。每批五个请求：一探针、四业务。每次请求、原生 Schema、出站消息哈希、输出、校验事实、配置、中文及适用的冻结结果均保留，写文件采用 `wx`，不覆盖旧文件。

| 目录／日志中段 | `BACKTEST_PLAN_ENTRY` | 位置组 | 正式维护入口退出码 |
| --- | --- | --- | --- |
| `discovery-a` | `discovery` | 第一组 | 1：四份失败 |
| `authoring-a` | `authoring` | 第一组 | 1：一份通过、三份失败 |
| `modification-a` | `authoring-modification` | 第一组 | 0：四份通过 |
| `discovery-b` | `discovery` | 第二组 | 1：四份失败 |
| `authoring-b` | `authoring` | 第二组 | 1：一份通过、三份失败 |
| `modification-b` | `authoring-modification` | 第二组 | 0：四份通过 |

最终页面目录为各批 `pages/`，另有编写第一批 `pages-configured/`、修改第一批 `pages-close/`、修改第二批 `pages-two-bars/`。对应成功浏览器日志为 `/tmp/backtest-daily-orders-contract-{authoring-a-browser-configured,authoring-b-browser,modification-a-browser,modification-a-browser-close,modification-b-browser,modification-b-browser-two-bars,discovery-b-browser}-20261117.log`，七次均退出 0。首次宿主及浏览器失败日志为 `/tmp/backtest-daily-orders-contract-{browser-host,authoring-a-browser}-20261117.log`，成功专用宿主日志为 `/tmp/backtest-daily-orders-contract-browser-host-configured-20261117.log`。

## 原始证据保护

本轮使用新的 `backtest-daily-orders-contract-<入口>-<批次>-20261117` 私有目录，不覆盖原生成目录。开始前，原发现及两批编写目录顶层共 108 份 JSON，加上既有快照和两份页面读回共 111 份；以仓库相对路径、零字节分隔及文件内容排序聚合的 SHA-256 为 `7fc0cabafde7801788ba94188a154ffa7d90799ff76ab01a81ca79e609b4e3cc`。本轮递归指纹与前次顶层文件指纹分别记录。

业务提示源码开始指纹：

| 文件 | SHA-256 |
| --- | --- |
| `apps/server/src/strategy-authoring/authoring-prompt.ts` | `ebb78f6f2cb9c8164ade3a906f482272d2a9225cef872c453c1c6376cc35060f` |
| `apps/server/src/strategy-optimization/strategy-optimization-discovery.ts` | `7f7bb8b0b8cbb61ac52ccfeb6f028645488d82dee15c4dce879ed47a70a3b2e9` |
| `packages/domain/src/backtest-daily-order-prompt.ts` | `9fb35e66903c76c58f106ec7c7a61ac238521ab80d6222da1546eb14b3fc1ffc` |

结束后复核，111 份原 JSON 的递归聚合指纹及上述三份业务提示指纹均与开始时相同。本轮只修改 Task 和证据说明；未改业务源码、追加提示或修改模型参数。六批临时库均由正式入口清理，结束时只读查询无残留 `ledger-ai-provider-test-*` 容器。

文本完整消息的 25,475／16,000 未通过项、原未知及截断、原 ATR 失败均继续保留，本轮不重跑对应验收。T04d.6b 的发现／编写成对生成、T04d.5c 执行矩阵、T04d.7 完整消费及 T04d.8 目标运行态仍未完成，Task 保持活动；不因本轮验收而修改合同或继续抽样。
