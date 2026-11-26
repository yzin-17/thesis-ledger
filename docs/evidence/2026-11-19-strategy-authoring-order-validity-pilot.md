# 已有买单有效期的局部修改离线试点

2026-11-19，建议进入仅限 `day`／`two-bars` 的真实模型对照，待另行授权。两个方向均能用一次明确的期限替换重建真实合格定义，保留其他每个字段。相对当前 v5，完整请求体少约 89.5%，最终 JSON 内容少 96.0%～96.4%。新输出由人工构造，模型能否从原话选中正确的单、实际 token 和耗时仍待验证。[设计评审](../reviews/2026-11-18-strategy-generation-redesign.md) · [活动 Task](../archive/tasks/2026-11-15-backtest-trade-plans.md)

## 真实基线与单字段验证

两份历史操作均为修订 1、修改范围 `execution`，基线含建仓 `buy`、普通退出 `exit` 和止损 `stop`。试点保留原用户消息，包括完整基线、三张单、原意图、需求 ID 和章节选择。短合同由测试专用系统消息说明，只能提出一个有效期变更或返回 `unsupported`。人工输入包含目标 ID、需求 ID 和要应用的期限。组装函数仅接收操作快照、当前修订及短响应；验收预期只供测试断言使用。[试点组装](../../apps/server/test/strategy-authoring/order-validity-pilot.fixture.ts)

| 场景 | 真实合格回执目录（均位于 `var/acceptance/`） | 唯一差异 | 输出对照 |
| --- | --- | --- | --- |
| day | `backtest-daily-orders-remaining20-20261118/schema-modification` 第 3 次请求 | buy 从两根有效改为 DAY | 与原始输出定义及保存回执的完整配置逐字段一致 |
| two-bars | `whole-order-model-20261118/modify` 第 2 次请求 | buy 从 DAY 改为两根有效 | 与原始输出定义及保存回执的完整配置逐字段一致 |

两侧都按 ID 定位到 `execution.orders.0.validity`。在输出副本上把这一项恢复为原值后，与输入基线严格深度相等，原操作快照也保持相同。退出单仍为 DAY，止损仍按原父单与激活条件持续至持仓结束，价格、指令、顺序、交易计划及元数据均保留。当前 v5 操作 Schema 也能把两份历史完整响应解析为各自原回执中的结果。

组装后的提案复用可编辑委托顺序检查和正式局部修改校验，得到的整章 `differences` 与历史成功回执相等。变更定位单独记到 ID 和字段。需求关联沿用快照已有路径，并将本次修改关联到 `execution`。两份快照的初始路径为空；试点未复刻 v5 模型对整条自然语言所列的全部覆盖路径。构造样本验证已有入场、退出及执行路径可原样保留。本轮验证截至待审核提案，保存和 Worker 采用旧合格配置的回执。[正式局部修改校验](../../apps/server/src/strategy-authoring/authoring-modification.ts) · [v5 合格矩阵](2026-11-18-backtest-whole-order-and-native-recheck.md#最终实测矩阵)

反例覆盖目标不存在、误指退出单或保护单、错章节、零根／非整数期限、额外字段、无变化、错误需求 ID、修订过期及编辑历史旧顺序。均被拒绝。`unsupported` 不产生提案。在独立对照中把买单及其父单引用同步改名后，试点能按新 ID 定位。[定向测试](../../apps/server/test/strategy-authoring/order-validity-pilot.test.ts)

## 完整请求及输出字节

按同一 OpenAI-compatible 流式 SDK 调用路径序列化，内存 fetch 拦截完整 HTTP JSON body。三种方式使用相同的模型、8,192 输出上限、流式及 usage 选项；除消息和输出格式外，请求体其余字段深度相等。下表按 UTF-8 计数。格式列是含完整 Schema、名称和 strict 标记的 `response_format`；总计还包含其余请求字段与 JSON 外壳，每行 168 字节。输出为紧凑序列化后的最终 JSON 对象，排除推理文本、SSE 分帧及 HTTP 头。

| 场景 | 请求与输出来源 | 消息 | 含 Schema 的格式 | 完整请求体 | 最终 JSON |
| --- | --- | ---: | ---: | ---: | ---: |
| day | 历史 v5 重建／真实输出 | 25,763 | 13,583 | 39,514 | 2,408 |
| day | 当前 v5 重建／复用真实输出 | 26,770 | 12,150 | 39,088 | 2,408 |
| day | 试点／人工短输出 | 3,074 | 880 | 4,122 | 87 |
| two-bars | 历史 v5 重建／真实输出 | 26,619 | 12,172 | 38,959 | 2,444 |
| two-bars | 当前 v5 重建／复用真实输出 | 26,775 | 12,172 | 39,115 | 2,444 |
| two-bars | 试点／人工短输出 | 3,057 | 880 | 4,105 | 97 |

历史 wire 只记录了出站模型、完整输出格式、各消息的字节和哈希。这里用原消息和出站格式重建历史请求体，并逐项核对原 wire 摘要。当前 v5 行使用当前正式提示与操作投影。试点行原样保留用户消息，节省来自缩短系统说明和原生输出 Schema。历史 Provider 报告 day 的输入／输出为 5,599／4,824 tokens，two-bars 为 5,779／4,527 tokens；本轮短输出没有实际模型用量。

## 验证与下一步

两份真实基线及构造边界的三项试点测试通过，原局部修改七项测试通过。Server 类型检查、两份测试文件的 ESLint 与格式检查通过。试点出站 Draft-7 使用已有固定版 llama.cpp 转换器离线转换成功，根规则有变更与无法处理两个分支。试点代码只在 Server 测试目录；正式 v5 路由、模型、额度及保存流程沿用原实现。

若获授权，优先将同两份冻结输入各交给短合同做一次首次业务生成，以已有 v5 回执为参照。记录是否选中正确 ID 和期限、是否误拒、完整定义是否一致、实际 token 与耗时；格式探针单列。两侧均正确后再用实际输出验证隔离确认、保存与冻结回放。当前结论支持此项对照，扩大到其他修改类型仍须独立证据。

在仓库根目录执行的主要命令如下。试点回执与 Schema 保存在本轮隔离目录，包含每个请求体与结果定义的 SHA-256。

```sh
receipt_dir="$PWD/var/acceptance/order-validity-pilot-20261119-h2lrcs"
rtk proxy env BACKTEST_DAILY_ORDER_CAPTURE_ROOT="$PWD/var/acceptance" ORDER_VALIDITY_PILOT_EVIDENCE="$receipt_dir" pnpm --filter @thesis-ledger/server exec vitest run test/strategy-authoring/order-validity-pilot.test.ts test/strategy-authoring/authoring-modification.test.ts
rtk proxy pnpm --filter @thesis-ledger/server typecheck
rtk proxy pnpm exec eslint apps/server/test/strategy-authoring/order-validity-pilot.{fixture,test}.ts
rtk proxy pnpm exec prettier --check apps/server/test/strategy-authoring/order-validity-pilot.{fixture,test}.ts
rtk proxy python3 var/acceptance/backtest-daily-orders-native-append-refs-20261118/converter.py "$receipt_dir/pilot-schema.json" > "$receipt_dir/pilot.gbnf"
```

真实模型调用、部署、提交、推送均为零，ATR 未重跑。
