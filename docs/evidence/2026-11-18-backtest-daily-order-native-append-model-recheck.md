# 原生附加保护修复后的目标模型定向复验

## 授权与范围

2026-11-18 用户明确授权两批定向实测：修改入口先 `full-fill`，再 `close`。每批最多一次私有格式探针和一次业务生成，总计最多四次请求；沿用现有模型、参数、原生 v5 路由及额度。通过正式维护脚本创建和清理隔离测试库，真实 Provider 与历史数据只读；没有部署、提交或推送授权。

源码基线及离线验证见[上一轮报告](2026-11-18-backtest-daily-order-native-append-offline.md)。本轮前核对八个相关文件 SHA256 与该轮最终回执完全一致，复用 41 项定向测试、类型检查及 lint 结果。

## 完整 Schema 离线补查

使用上一轮固定提交的上游 Python 转换器，对三入口完整业务 Schema 直接转换，三个输入均退出 1、无 grammar 产物：转换器不支持现有数值正则中的 `(?:...)`。没有移除或放宽正则，没有修改转换器。原始 stderr、Schema 哈希和退出状态存于 `var/acceptance/backtest-daily-orders-native-append-full-20261118/`。

这属于该固定版本转换器的完整 Schema 兼容性失败，不能据此判定目标 LM Studio 具有相同故障。上一轮精简角色转换仅证明数组形状与附属角色可达，结论保持；正则问题继续由原记录持有。

实际补查命令等价为：

```sh
rtk proxy python3 var/acceptance/backtest-daily-orders-native-append-refs-20261118/converter.py var/acceptance/backtest-daily-orders-native-append-refs-20261118/<discovery|authoring|modification>-schema.json
```

实际执行通过 Python `subprocess.run` 逐份调用以上参数，分别保存 stdout／stderr，单份超时 30 秒。

## 实测检查点

规划预检通过：沿用 `scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs` 与正式 infra 维护锁；范围限定上述两个位置。每批执行原始输出、正式生成入口、修改范围、意图、隔离保存、冻结 Worker、回放一致性和中文读回检查。失败原样记录，不解析意图文本补单，不额外抽样。

当前状态：两批均已结束并通过，共四次请求，无追加抽样、无残留隔离容器。漏附属保护的修改入口定向复验通过；T04d.6b 的完整三入口成对矩阵仍未完成。


实际执行命令（目录为相邻 `thesis-ledger-infra`，先 full-fill 后 close，两条均退出 0）：

```sh
rtk proxy env npm_config_registry=https://registry.npmmirror.com BACKTEST_PLAN_ENTRY=authoring-modification BACKTEST_PLAN_SCENARIO=daily-orders BACKTEST_PLAN_CASES=full-fill node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs ../thesis-ledger/var/acceptance/backtest-daily-orders-append-modification-full-fill-20261118

rtk proxy env npm_config_registry=https://registry.npmmirror.com BACKTEST_PLAN_ENTRY=authoring-modification BACKTEST_PLAN_SCENARIO=daily-orders BACKTEST_PLAN_CASES=close node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs ../thesis-ledger/var/acceptance/backtest-daily-orders-append-modification-close-20261118
```

命令输出分别重定向至 `/tmp/backtest-daily-orders-append-modification-full-fill-20261118.log` 和 `/tmp/backtest-daily-orders-append-modification-close-20261118.log`。原始请求与响应由脚本以 `wx` 写入各自新目录。

## 目标模型实际结果

模型为 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，入口为 `strategy_authoring_modification`／`authoring-modification-v5`，模式为 `native_schema`。每批两次请求，包括一私有格式探针和一业务请求；每次只有一次实际 wire 记录，没有传输重试。模型及请求参数、业务消息、额度和 Provider settings 与对应上一轮捕获逐项相等。

| 场景 | 原始模型输出 | 标准 Schema | 正式生成及修改入口 | 隔离保存、冻结执行、回放 |
| --- | --- | --- | --- | --- |
| `full-fill` | `[entry,exit,stopLoss]`；第三张为 `stopMarket`，父单 `buy`，`activation=fullFill` | 通过 | 通过；仅修改 `execution`，范围外字段原样保持 | 通过；原值保存，回放完全一致 |
| `close` | `[entry,exit]`；收盘保护为 10%，无触价止损模板 | 通过 | 通过；仅修改 `tradePlan`，`execution` 精确冻结 | 通过；原值保存，回放完全一致 |

两份均为真实捕获。`full-fill` 输入第三张原为 `eachFill`，本轮响应保留第三张并改成 `fullFill`，直接覆盖上一轮丢单复现位置。`close` 响应的比例原文是 `0.10`，与 10% 数值等价，原文保持。离线复核脚本首次错误地要求字符串恰为 `0.1`，修正为数值比较后通过；没有改写模型输出，也没有重新调用模型。

两批各执行 53 份迁移到专属临时 PostgreSQL，库名为 `ai_provider_concurrency_fixture`、owner 为 `fixture_owner`。full-fill 定向集成测试 1／1 通过、测试耗时 114.451 秒；close 1／1 通过、测试耗时 147.249 秒。维护入口均退出 0，脚本完成后清理临时库容器。

实际冻结成交：full-fill 在 5 月 19 日买入 100、5 月 20 日再买入 100；close 在 5 月 19 日买入 100、5 月 21 日卖出 100。这验证既有部分成交与收盘退出样本；不将 full-fill 未触发卖出的样本冒充新的全部成交后激活覆盖。中文读回已生成，full-fill 包含“全部成交”，本轮没有进行页面或目标部署验收。

原始业务响应 SHA256：

- full-fill：`83b7bfcf55c1b8138264785ebcbbc6643a16c784958c034d436164088308345e`
- close：`0ff5654e4ceb04f839c024ea6d4f1b1fc7b9420416293a8c7c719068ad8cc68d`

## 独立复核与数据保护

在主仓执行：

```sh
rtk proxy node var/acceptance/backtest-daily-orders-append-review-20261118/review.mjs

rtk proxy docker --context desktop-linux exec thesis-ledger-dev-postgres-1 psql -XAtq -U thesis_ledger -d thesis_ledger -c "SELECT to_jsonb(p)-'encryptedCredentials' FROM \"ProviderConfig\" p WHERE name='lmstudio'"

rtk proxy docker --context desktop-linux ps -a --filter name=ledger-ai-provider-test- --format '{{.Names}}'
```

复核脚本用现有 Ajv 6.15.0 对实际 wire 中的完整 Draft-7 校验原始响应；同时断言真实请求数、生成配置原值保存、修改范围外冻结、父单与激活、收盘保护、应用回执和回放结果，退出 0。Provider 查询输出保存为私有 `provider-after.json`，与两批开始时完整去凭证行深比较相等；剩余测试容器查询为空。复核结果、数据保护断言位于 `var/acceptance/backtest-daily-orders-append-review-20261118/receipt.json` 和 `preservation.json`。

本轮未修改生产代码或测试代码，五个相关源码／测试文件哈希与上一轮最终离线验证一致，因此复用 41／41、类型检查及 lint 结果。新增本报告并更新现有 Task；没有修改历史回执。真实 Provider 和历史策略写入为零，未部署、暂存、提交或推送。

## 前两批复核结论

本轮两个授权位置通过：完整业务 Schema 已被目标服务用于真实生成，原生数组第三张及 `fullFill` 的实际输出得到确认，收盘保护保持两单。该结果补足修改入口的定向实际生成证据；目标 LM Studio 的具体构建号仍未识别，不能将旧上游 Python 转换器的正则失败等同于目标解码器失败。

T04d.6b 继续保持未完成：发现／编写和其他成对位置尚未使用本次修复重验；本轮两个位置分属不同成对组，不能合并成一组成对通过。后续模型调用须另行授权，本轮四次请求授权已用完。正则穿透、原 ATR 失败、文本预算、T04d.5c／7／8 及其他原缺口保持既有责任与记录。

## 修改入口成对补验

2026-11-18 用户追加授权同一批执行 `each-fill` 和 `touch`，请求上限为 3。正式入口按夹具顺序执行了一次私有格式探针、一次 touch、一次 each-fill，分别对应 wire 1、2、3，每次各有一份请求与原始响应。维护入口退出 0，单个集成测试覆盖两个业务场景，耗时 200.53 秒。执行目录为相邻的 `thesis-ledger-infra`。

```sh
rtk proxy env npm_config_registry=https://registry.npmmirror.com BACKTEST_PLAN_ENTRY=authoring-modification BACKTEST_PLAN_SCENARIO=daily-orders BACKTEST_PLAN_CASES=each-fill,touch node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs ../thesis-ledger/var/acceptance/backtest-daily-orders-append-modification-each-fill-touch-20261118 > /tmp/backtest-daily-orders-append-modification-each-fill-touch-20261118.log 2>&1
```

| 修改场景 | 原始输出的保护单 | 冻结样本成交 | 已有目标模型对照 |
| --- | --- | --- | --- |
| each-fill | 第三张 stopLoss 引用 buy，激活为 eachFill，触发价 9 | 5 月 19 日以 9.5 买 100，5 月 20 日以 8.4915 卖 100 | full-fill 的第三张激活为 fullFill，同一部分成交场景 5 月 20 日继续买 100 |
| touch | 第三张 stopLoss 为 stopMarket，固定触发价 9，随父单每次成交启用 | 5 月 19 日以 10.01 买 100，5 月 20 日以 8.4915 卖 100 | close 仅两张模板，收盘判断后于 5 月 21 日卖 100 |

使用主仓命令 `rtk proxy node var/acceptance/backtest-daily-orders-append-modification-each-fill-touch-20261118/review.cjs` 对照实际 wire 和正式回执。两份原始响应都通过出站 Draft-7，角色顺序均为 entry、exit、stopLoss，保护期限为 position。正式修改入口接受原值，execution 范围外字段逐项相等。两份配置均通过隔离保存、冻结执行和完整回放，中文读回含“每次成交后按量保护”。原始响应、完整规则及成交可在同目录的 `wire-output-2-1.json`、`wire-output-3-1.json` 和 `review.json` 复核。

两份业务请求的消息、模型、合同、输出额度和 Provider 设置均与 11 月 17 日相应捕获相符。回执记录真实 Provider 与历史数据写入均为零，结束后只读查询确认去凭证 Provider 行与批前深比较相同，隔离测试容器已清理。五份相关源码及测试哈希与离线验收回执一致。

修复后修改入口现有两组成对通过，分别为按量／全成和触价／收盘。本批使用全部 3 次授权，与前两批合计 7 次请求。T04d.6b 保持未完成，发现、编写以及修改入口其余成对位置仍需按任务记录验收。
