# 策略发现 v5 原生十进制正则离线验收

2026-11-19，四份失败原文均被当次实际发出的 Draft-7 Schema 和当前正式 SDK 入口拒绝。同场景四份已有合格输出全部通过，应用解析结果与历史成功回执一致。非法值首次可见于上游返回的完整 JSON，应用在生成校验阶段已经拦截。复用 11 月 18 日的原生十进制投影，本轮没有修改生产代码。

## 逐份重放

失败样本来自 11 月 17 日的发现入口。通过请求序号、合同、模式、消息摘要和错误回执的 requestId 配对出站请求与返回。四份请求均实际发送 `strategy-discovery-v5`、`native_schema`、`strict: true`。从各自 `response-N.json` 的 SDK 错误原因中提取完整响应文本，UTF-8 SHA-256 与原诊断一致，解析结果与 `wire-output-N-1.json` 深度相等。四份诊断均为 `finishReason=stop`、`jsonStatus=valid`。

| 场景 | 失败原文内违反 pattern 的字段（相对 strategy） | 失败原文在历史 Schema／当前 Schema／当前 adapter | 同场景合法输出在这三层 |
| --- | --- | --- | --- |
| limit | `entry.right.value` 为空串 | 拒绝／拒绝／拒绝 | 通过／通过／通过 |
| each-fill | `entry.right.value`、`exit.right.value`、`sizing.percent`、`tradePlan.stages[0].trigger.value`、同一阶段的 `action.fraction`、`execution.orders[1].order.price.value` 均为空串 | 拒绝／拒绝／拒绝 | 通过／通过／通过 |
| full-fill | `entry.right.value` 与 `exit.right.value` 为 `159516.SZ`，`execution.orders[1].order.price.value` 为空串 | 拒绝／拒绝／拒绝 | 通过／通过／通过 |
| day | `entry.right.value` 与 `exit.right.value` 为 `159516.SZ` | 拒绝／拒绝／拒绝 | 通过／通过／通过 |

标准校验用 Ajv 分别编译每个样本自己的出站 Schema 和当前 `generationOutput` 的 Schema。旧、新标准校验对四份坏样本报告的非法数值路径逐份相同，共 12 处，按输出字段去重。正式 `AiSdkGenerationAdapter.generate` 使用内存 HTTP 客户端回送响应，核对它发出的严格原生格式与当前投影相同。四份原始失败与四次重放都得到 `schema_invalid / validation / complete`，历史失败止于生成阶段。合法对照复用 11 月 18 日同场景已保存、冻结回放通过的原始输出，本轮重放 SDK 的返回值与其历史 `response-N.json.output` 深度相等。

另以合格 full-fill 配置构造三个单字段反例，每次从原件复制。分别把普通退出比较常量从 `"1"` 改为 `"159516.SZ"`、投入比例从 `"0.3"` 改为空串、第三张单的止损价从 `"9"` 改为空串。原件通过；三份反例在各自字段触发 Ajv 的 `pattern` 错误，均被 Zod 与正式 `parseCompleteOutput` 拒绝。

## 层级结论

- **出站合同与原始返回。** 四个历史请求都带有一般十进制、正十进制和比例的约束。模型服务返回的字符串已违反这些约束，历史 Zod／SDK 校验没有让坏配置进入保存。当前投影和正式入口对四个场景均符合预期。
- **离线转换。** 对同一份历史完整 Schema，用本地固定提交 `6569fa868d43592f805530e595950570f9f5e404` 的 llama.cpp Python 转换器重放。原件因非捕获组中不支持的 `?` 退出 1。仅将三处十进制 pattern 按已有规则从非捕获组和 `\d` 改为捕获组和 `[0-9]`，其余字段保留原值，转换退出 0。当前完整 Schema 转换也退出 0，两份成功结果均包含对应三种数值的 GBNF 规则。当前发现 Schema 与四份合法对照的历史出站 Schema 哈希相同。11 月 18 日的修复对这一转换器有效。[既有修复记录](2026-11-18-backtest-daily-order-remaining-matrix.md)
- **目标 LM Studio。** 旧回执能确定目标服务返回了不合约的值。回执中缺少当时运行时构建号、实际启用的 grammar 和解码日志，因此无法判定目标是否使用同一转换器、是否转换报错或是否回退。后续四份真实合法输出证明这些配置生成过，无法单独证明目标的解码约束始终生效。

## 复核入口

工作区为共享 `main@1ed418780d19`。失败原件在 `var/acceptance/backtest-daily-orders-slots-discovery-{a,b}-20261117/`，对应 a/2、b/2、b/3、b/4。合法对照在 `var/acceptance/whole-order-model-20261118/`，依次为 discovery-a/2、discovery-sizing/2、discovery-sizing/3、discovery-validity/2。序号对应各目录的 `wire-N-1.json` 与 `wire-output-N-1.json`。

历史失败出站 Schema 的 SHA-256 为 `aa5ef90d366c721fcf9331a8ddf9f487a5b97180206a923a3d40d70546c87cb9`，当前为 `9143d6e4217897e88876eaa2665eb85e0442d631ba460612d7fd4978e7991d67`，均按 `JSON.stringify(schema)` 计。逐份文件哈希、字段与错误保存在本轮目录的 `replay.json`，转换退出码和规则见 `grammar-result.json`，原始转换错误见 `historical-conversion.stderr`。

```sh
replay_dir=var/acceptance/discovery-native-decimal-replay-20261119-dZYx6v
rtk proxy pnpm exec vitest run --config "$replay_dir/vitest.config.mts" "$replay_dir/replay.test.ts"
rtk proxy python3 "$replay_dir/grammar.py"
rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-native-strategy-schema.test.ts -t '原生十进制 grammar'
```

定向重放两项通过，含八份真实回执和三份构造反例；已有十进制回归一项通过。模型调用、部署、提交、推送均为零，ATR 未重跑。
