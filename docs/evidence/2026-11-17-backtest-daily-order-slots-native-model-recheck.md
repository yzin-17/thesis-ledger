# 日线委托固定槽位后的原生模型定向验收

## 范围与执行边界

对应 [Task T04d.6b](../archive/tasks/2026-11-15-backtest-trade-plans.md)，在[两项最小修复](2026-11-17-backtest-daily-order-minimal-generation-fixes.md)后验证发现、编写、修改的四组成对意图。三个合同保持 v5／原生模式，复用原八个无字段名自然语言位置；每个位置只生成一次。失败不追加提示或抽样，正则穿透另留待查，不处理 ATR 样本，不重跑其他能力矩阵。

本轮六批已结束，30 次真实请求含六次私有格式探针和 24 次业务生成，无传输重试、无未知结果。发现 0／8、编写 2／8、修改 3／8 完整通过；仅修改的限价／市价一组成对通过。T04d.6b 仍未通过。使用六个新的 `backtest-daily-orders-slots-<入口>-<a或b>-20261117` 目录，不覆盖旧证据。真实 Provider 只读；六批设置与上一轮深比较相同，结束时从真实库只读重查仍相同。

## 成对结果

| 入口 | 完整通过 | 完整成对通过 | 其余结果 |
| --- | --- | --- | --- |
| 发现 | 0／8 | 0／4 | 四份违反实际原生 Schema，两份原生通过但生成 Zod 依赖校验拒绝，一份实际装配拒绝，一份合法结构误选 |
| 编写 | 2／8 | 0／4 | 一份价格坐标校验拒绝，四份合法结构漏附属保护，一份输出截断 |
| 修改 | 3／8 | 1／4 | 五份合法结构漏附属保护 |

| 位置 | 发现 | 编写 | 修改 |
| --- | --- | --- | --- |
| `limit` | 入场常量违反已发送的十进制 pattern | 委托价格来源坐标不符合本次研究执行要求 | 通过 |
| `market` | 擅加 MA 入场／退出，漏平仓等待 | 通过 | 通过 |
| `touch` | 擅加缺依赖的阶段，生成 Zod 拒绝 | 缺附属止损 | 缺附属止损 |
| `close` | 指标缺 period，实际装配拒绝 | 通过 | 通过 |
| `each-fill` | 多处非规范数值及空委托价格，原生 Schema 拒绝 | 缺附属止损，并擅加 9% 收盘保护 | 缺附属止损 |
| `full-fill` | 多处非规范数值及空委托价格，原生 Schema 拒绝 | 缺附属止损 | 缺附属止损 |
| `day` | 非规范数值，原生 Schema 拒绝 | 缺附属止损 | 缺附属止损 |
| `two-bars` | 擅加缺依赖的阶段，生成 Zod 拒绝 | 原 8,192 token 上限、length，无最终 JSON | 缺附属止损 |

23 份完整 JSON 全部只有 `entry`、`exit` 两张模板。要求附属保护的 15 个位置均未通过：14 份完整输出没有第三张保护模板，一份截断。十份合法结构偏离意图的分类描述输出与需求的关系，不能据此断言根因都是模型自行误选。原生 Schema 的 `additionalItems` 在目标解码器中的处理是否影响附加模板生成，本轮未另作后端探针或内部日志调查，原因尚未查明。不能从所有输出有两个必需模板，就宣布父子保护已在实际模型入口跑通。

所有不合格配置均未进入本轮保存、撮合或回放。原始配置、原始错误、原始 intentCheck／reason 及有合法配置时的中文保留；代码没有据说明补单、删规则、转换价格口径或修复来源。

## 原生约束与实际入口的分层核对

零调用复核遍历六批原始输入、adapter 请求、出站 wire 和输出，结果写入 `var/acceptance/backtest-daily-orders-slots-review-20261117/receipt.json`：

- 24 份业务自然语言意图与上一轮逐份相同；实际出站消息内容哈希与本次准备消息逐份相同。
- 三个合同实际请求均为 v5／`native_schema`，实际 wire 均为 `strict: true`，原生 Schema 与当前正式 `generationOutput` 逐份深比较相同。实际发送模板槽位与 `additionalItems`，不携带 contains；不是只核对源码预期。
- 23 份完整 JSON 中，19 份通过实际原生 draft-7 Schema，17 份通过生成 Zod。使用已安装的 Ajv 校验实际出站 Schema，没有增加依赖。
- 四份原生不通过均为已发送 pattern 被输出违反。正则穿透只记录事实，仍另留待查；没有改正则、改路由或补提示。
- 两份原生通过而生成 Zod 拒绝，为本轮发现 `touch`／`two-bars` 擅加阶段但缺少依赖。原始错误为“ATR 阶段必须声明冻结入场 ATR”；仅保留本轮委托样本的拒绝，不调查或处理原 ATR 失败样本。
- 两份通过生成合同但被实际入口拒绝：发现 `close` 的指标参数不完整，编写 `limit` 的委托价格坐标不符。原生结构通过不等于可保存、可冻结执行。
- 十份合法结构误选：发现 `market`，编写 `touch`／`each-fill`／`full-fill`／`day`，修改 `touch`／`each-fill`／`full-fill`／`day`／`two-bars`。逐份保留从配置计算出的 intentIssues，不解析摘要来修复配置。
- 一份截断为编写 `two-bars`：`fact.code=output_truncated`，原诊断 `finishReason=length`、`jsonStatus=missing`，无最终 JSON；未提高额度或重试。原诊断对象保持原值。

发现的 `each-fill` 与 `two-bars` 实际消息相同，SHA256 同为 `283a1eb6b8bb332af184114e3fadb66db1f5e1300516274446f05330d1215318`。两者分别占预定激活与有效期矩阵位置，各调用一次，不以这两次结果作不同输入的因果对照。发现仍使用正式消息准备／合同后附加受控自然语言；生产发现 API 没有该自由文本字段，本轮不冒充该 API 的验收。

当前标准 Schema 的静态能力及旧合格三模板配置离线对照沿用[最小修复证据](2026-11-17-backtest-daily-order-minimal-generation-fixes.md)，没有重跑固定样本全套。未发现本轮需求必须新增交易含义才能表达的证据；目标原生模式附加模板尚未生成，不能单凭静态表达能力排除生成投影／解码兼容问题，也不能把失败归为撮合引擎偏差。

## 合格配置的保存、执行、回放与中文

只有五份意图合格配置进入正式 `StrategyCreationService`，写入本批专属 PostgreSQL 后原样重读；两次实际冻结 Worker 结果完全相同，两次纯执行结果也相同。逐份只读复核五份结果的 completeness 均为 complete，无 intentIssues／executionIssues；修改实际差异仅限授权的 execution 或 tradePlan。

| 合格配置 | 实际冻结成交 | 中文关键点 |
| --- | --- | --- |
| 修改 `limit` | 5 月 19、20 日各买 100，价格均为 9.5 | 以信号日最低价限价，两根有效、可跨夜 |
| 编写／修改 `market` | 同两日各买 100，价格均为 10.01 | 后续开盘市价，买单两根有效 |
| 编写／修改 `close` | 5 月 19 日买 100；5 月 21 日卖 100，卖价 8.4915 | 首笔实际成交价下方 10%，收盘判断，后续开盘退出；买单仅当天有效 |

数量为本次独立回测研究单位，每根显式模拟额度为 100，不等于实际股数。触发线不等于成交价；开盘跳空、配置滑点和费用仍按冻结规则处理。本轮没有合格附属保护配置，因此没有新增逐次／全成父子撮合通过证据，也未启动新的全成补测。原父子撮合及全成补测证据保留在[上一轮报告](2026-11-17-backtest-daily-order-native-model-recheck.md)，不重标为本轮模型通过。

五份新配置分别在桌面摘要、版本详情和移动页面的 1440／1024／768／390 四宽检查，共 **60 张页面通过**；当前回读与生成时回读相同，无页面错误或溢出。已目视核对收盘保护移动窄屏。页面仅使用受控 GET 和本轮原配置，没有真实业务提交；此证据不替代目标部署或原生真机。

错误配置的中文也保留可核对差异：发现市价侧实际写成 MA 上穿／下穿 0，中文如实呈现；编写逐次侧写成“实际入场成交价下方 9%”，与要求的固定触发价 9 不同。没有把通用撮合政策文案或模型摘要当作已配置保护模板。

## 命令、批次与退出结果

正式入口在 `thesis-ledger-infra` 执行：

```sh
BACKTEST_PLAN_ENTRY=<discovery|authoring|authoring-modification> BACKTEST_PLAN_SCENARIO=daily-orders BACKTEST_PLAN_CASES=<四个位置> node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs ../thesis-ledger/var/acceptance/<新目录>
```

第一组为 `limit,market,touch,close`，第二组为 `each-fill,full-fill,day,two-bars`。维护入口及模型原额度、时限不变；每批独立私有资格探针不写真实路由或资格，测试库结束后清理。业务提示、合同及价格表达式源码未追加修改；本次只将验收工具的意图检查放在保存／执行前，并增加当前批次的只读参数及失败分层复核。

| 新目录／日志中段 | 入口 | 位置组 | 正式维护入口退出码 |
| --- | --- | --- | --- |
| `discovery-a` | discovery | 第一组 | 1：无完整通过 |
| `authoring-a` | authoring | 第一组 | 1：两份通过、两份失败 |
| `modification-a` | authoring-modification | 第一组 | 1：三份通过、一份失败 |
| `discovery-b` | discovery | 第二组 | 1：四份失败 |
| `authoring-b` | authoring | 第二组 | 1：四份失败 |
| `modification-b` | authoring-modification | 第二组 | 1：四份失败 |

目录前缀为 `var/acceptance/backtest-daily-orders-slots-`、后缀为 `-20261117`；日志前缀为 `/tmp/backtest-daily-orders-slots-`、后缀为 `-20261117.log`。每批五次请求，一私有探针、四业务；新请求、实际 Schema、消息哈希、原始输出、校验事实和适用的配置／冻结结果均用 `wx` 保留。每批维护入口创建 tmpfs 临时 PostgreSQL，执行 53 份迁移并核对专属库／owner，结束时删除本次容器。

其他定向检查：

| 命令／过程 | 结果 |
| --- | --- |
| `BACKTEST_DAILY_CURRENT_CAPTURE_PREFIX=backtest-daily-orders-slots BACKTEST_DAILY_CURRENT_REVIEW_DIR=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance/backtest-daily-orders-slots-review-20261117 pnpm --filter @thesis-ledger/server exec vitest run test/backtest/daily-order-model-current-review.test.ts` | 一例零模型调用复核通过，涵盖 24 份输入、30 请求／30 响应／30 HTTP、当前 Schema、消息、模型、额度、结果和中文；日志 `/tmp/backtest-daily-orders-slots-review-20261117.log` |
| `pnpm --filter @thesis-ledger/server typecheck` | 退出 0；日志 `/tmp/backtest-daily-orders-slots-final-types-20261117.log` |
| 本次两个验收测试文件的 `pnpm exec eslint` | 退出 0；日志 `/tmp/backtest-daily-orders-slots-final-lint-20261117.log` |
| `BACKTEST_PLAN_CASES=<合格位置> node scripts/local-runtime/backtest-trade-plan-browser.mjs <本批目录> <本批目录>/pages` | 编写 a 的 market／close、修改 a 的 limit／market／close 共 60 页通过；四次脚本均退出 0，未选择不合格配置 |

浏览器日志为 `/tmp/backtest-daily-orders-slots-{authoring-a-browser-market,authoring-a-browser-close,modification-a-browser-orders,modification-a-browser-close}-20261117.log`。宿主使用既有 `apps/desktop/test/backtest-trade-plan.vite.config.mjs`，日志 `/tmp/backtest-daily-orders-slots-browser-host-20261117.log`；验收后仅终止本次启动的 Vite，宿主按 SIGTERM 退出 143，端口 5197 已无监听。只读检查没有残留 `ledger-ai-provider-test-*` 容器。

## 原始证据、源码与剩余项

共享 `main`，HEAD 为 `1ed418780d1970e8380955453667edc2fed4b126`，开始时 760 条脏状态记录；未重置、暂存或提交。旧六批 211 份 JSON 聚合 SHA256 仍为 `d101a1442d0d56afce6fee01a1d8bc41ab639b745e9ca6556ca5c0b2b57463a7`，更早三目录递归 111 份仍为 `7fc0cabafde7801788ba94188a154ffa7d90799ff76ab01a81ca79e609b4e3cc`。本轮六个新目录的 196 份 JSON（不含独立汇总目录）为 `0545c5c22d86667d8024637d9527f832bf1a437f3fb97685c82f79db55800e14`。算法均为按仓库相对路径排序，将路径、NUL、原字节依次输入 SHA256；旧 108 顶层与 111 递归计数不混用。

以下源码指纹前后相同，既有修复和业务提示没有变化：

| 文件 | SHA256 |
| --- | --- |
| `apps/server/src/strategy-authoring/authoring-prompt.ts` | `ebb78f6f2cb9c8164ade3a906f482272d2a9225cef872c453c1c6376cc35060f` |
| `apps/server/src/strategy-optimization/strategy-optimization-discovery.ts` | `7f7bb8b0b8cbb61ac52ccfeb6f028645488d82dee15c4dce879ed47a70a3b2e9` |
| `packages/domain/src/backtest-daily-order-prompt.ts` | `9fb35e66903c76c58f106ec7c7a61ac238521ab80d6222da1546eb14b3fc1ffc` |
| `apps/server/src/ai/ai-generation-order-slots.ts` | `6e1aa1af3a1f8afbcb66e9c4aceb801337ac380733d0a43c0722f77319e09224` |
| `packages/schemas/src/backtest-expression.ts` | `b0226c546de7c6c38210f9088540ce91ff408aec9d347de962c0cc3b79b1b55c` |
| `packages/schemas/src/backtest-daily-orders.ts` | `560d28d9d53f74eace29658d6d147893f2b3c7c20ba320e3c7b2e5bfa97f5eb6` |

实际模型仍为 lmstudio 的 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，配置费率为零；六批 Provider settings 及结束时真实只读结果深比较相同，三个策略用途保持 v5／原生，其他用途、参数和资格保持原值。Provider／历史策略写入为零，没有目标同步。

一致性复核：本轮实际生成结果与本地 84 项静态／固定证据分开，未把合法但漏保护的结构计为通过，也未将旧修改 8／8 的成功改写为当前结果。T04d.6b 仍缺附属保护实际生成及完整成对覆盖；附加项生成原因待查，正则穿透另留待查。文本消息 27,708／16,000 的原失败、T04d.5c 剩余执行矩阵、T04d.7 完整消费、T04d.8 目标运行态及其余原未完成项均保留；不处理原 ATR 失败或扩充合同／提示来制造完成。
