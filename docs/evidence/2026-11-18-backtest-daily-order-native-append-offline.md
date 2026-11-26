# 原生日线委托附加保护生成的离线修复验证

## 结论与边界

对应 [T04d.6b](../archive/tasks/2026-11-15-backtest-trade-plans.md) 和 [AC21 生成合同](../specs/2026-11-15-backtest-trade-plans.md#日线委托撮合与部分成交合同)。本轮完成最小代码修复和定向离线验证，**T04d.6b 保持未完成**。没有真实模型调用、Provider 写入、业务数据写入、部署、暂存、提交或推送。

原生 Draft-7 的可编辑 `execution.orders` 最外层改为单个 `items.anyOf`，五种角色通过本地 `$ref` 复用；保留 `minItems: 2`，`allOf` 中继续使用元组 `items` 和 `additionalItems` 约束首项建仓、次项普通退出、后续阶段／保护。扁平数组格式保持。文本 2020-12 投影和文本解析行为保持。

正式原生输出在原始 `schema.safeParse` 成功后，按原生投影标出的可编辑槽位校验顺序。错误直接拒绝，成功值沿用原始解析结果及一次解包；冻结历史元组不进入新增校验。持久化合同、父单引用、激活规则、订单类型及业务依赖校验保持。

三入口构造矩阵和真实捕获回归通过；精简角色 Schema 的离线转换证明附加逗号和保护分支可达。目标 LM Studio 的具体构建、完整业务 Schema 解码和实际生成结果仍未实测，不能据此宣布目标运行时根因已全部确认或保护生成已通过。

## 现场与写集

仓库为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`；接手时 `main@1ed418780d1970e8380955453667edc2fed4b126`，762 条既有工作区变更。复用共享 checkout，保留全部既有修改。接手状态及本次修改文件的原字节备份位于 `/tmp/thesis-ledger-t04d6b-before-20261118.status` 和 `/tmp/thesis-ledger-t04d6b-before-20261118/`。

本轮写集：

- `apps/server/src/ai/ai-generation-order-slots.ts`：原生开放角色分支和 `allOf` 位置约束，五分支引用复用。
- `apps/server/src/ai/ai-generation-order-validation.ts`：只读取生成投影和原始输入，沿正式输出包装定位可编辑委托，不遍历表达式 AST；不排序或修改委托。
- `apps/server/src/ai/ai-native-strategy-schema.ts`：在三个策略用途的原生 `validate` 中接入顺序校验。
- `apps/server/test/backtest/daily-order-generation-contract.test.ts`：对齐原生 `anyOf`／`allOf` 断言，继续核对文本投影。
- `apps/server/test/backtest/daily-order-native-append.test.ts`：三入口矩阵、历史冻结和两轮真实捕获离线回归。
- 当前 Spec、Task 和本报告。未修改通用持久化 Schema、业务提示、v5、路由、模型参数、费用、额度或 ATR 样本。

正式入口核对：发现由 `prepareOptimizationGeneration` 使用 `aiGenerationContracts.strategyDiscovery`；编写和局部修改由 `authoring-attempt.ts` 调用 `authoringOperationSchema(operation)`，分别保留确认值和范围外精确冻结。三个原生用途都进入 `generationOutput`，非流式和流式 adapter 均使用它；SDK 的完整输出解析调用所提供的 `validate`。本轮直接调用实际 `generationOutput(...).parseCompleteOutput` 验证此路径，没有模拟 `validate` 或调用网络。成功解包与后续 `parseGenerationOutput` 的原值一致。

## 构造样本：标准 Schema 与应用入口

从三入口的正式 `generationOutput(...).responseFormat` 取得 Schema，使用现有 ESLint 依赖中的 Ajv 6.15.0 校验 Draft-7；应用入口使用相同 Output 对象的完整输出解析。三个入口各十种构造输入，共 30 行；冻结兼容另测。

| 构造输入 | 标准 Schema | 应用生成入口 |
| --- | --- | --- |
| 合法 `[entry,exit]` | 三入口接受 | 三入口接受 |
| 合法 `[entry,exit,stopLoss]`，激活 `fullFill` | 三入口接受 | 三入口接受 |
| 合法 `[entry,exit,stage,stopLoss]`，具名减仓阶段 | 三入口接受 | 三入口接受 |
| 合法三单附属 `takeProfit`／`limit` | 三入口接受 | 三入口接受 |
| 前两项倒置 | 三入口拒绝 | 三入口拒绝 |
| 第三项重复 `entry`，使用不同模板 id | 三入口拒绝 | 三入口拒绝 |
| 附属保护缺 `parent` | 三入口拒绝 | 三入口拒绝 |
| 父单引用不存在 | 三入口接受 | 三入口按原业务校验拒绝 |
| 激活方式错误 | 三入口拒绝 | 三入口拒绝 |
| 止损错误使用 `market` | 三入口拒绝 | 三入口拒绝 |

修改入口的四单样本使用已有阶段的冻结基线，修改范围仍为 `execution`；没有通过同时改写 `tradePlan` 绕过范围限制。反转首两项的样本能通过原通用 Zod 和持久化合同，但经正式原生入口拒绝，证明新增校验实际执行。相同输入在文本 JSON 和文本校验模式仍沿用原解析行为。

范围外历史兼容样本为 `[entry,stopLoss,exit]`：选择只修改 `tradePlan`，标准 Schema 和实际原生入口均接受，输出 `execution` 与基线深比较完全相同。擅自换成 `[entry,exit,stopLoss]` 则被标准和应用入口拒绝。

构造输入与真实捕获分别标为 `source: constructed`／`source: capture`。原始捕获没有作为构造样本重写。

## 真实捕获回归

只读遍历 `backtest-daily-orders-contract-*` 与 `backtest-daily-orders-slots-*` 两轮的三入口、八个位置，共 48 个业务位置：46 份完整 JSON、2 份原始截断事实。截断不补成配置。标准和应用入口结果如下，均为本次离线校验数量，**不代表意图、装配、保存或实际生成验收通过**。

| 捕获轮次／入口 | 完整 JSON | 标准 Schema 接受 | 应用生成入口接受 |
| --- | ---: | ---: | ---: |
| contract／发现 | 8 | 0 | 0 |
| contract／编写 | 7 | 4 | 1 |
| contract／修改 | 8 | 8 | 8 |
| slots／发现 | 8 | 4 | 2 |
| slots／编写 | 7 | 7 | 7 |
| slots／修改 | 8 | 8 | 8 |

当前 slots 的 23 份完整输出逐份与当时发送 Schema 的标准校验结果相同；19 份通过标准 Schema、17 份通过生成入口。完整输出仍只有两张模板，漏保护的配置不会因本轮结构修复被重标为合格意图。

旧 contract 修改入口八份配置仍通过，其中 `full-fill` 的原始合格三单继续通过。旧 contract 发现／编写 `two-bars` 的 `[entry,stopLoss,exit]` 虽可通过原通用 Zod，当前可编辑生成入口明确拒绝；旧回执与当时成功／失败分类保持原值。这两份都已被上一轮固定槽位标准 Schema 拒绝，本轮补齐应用入口的一致性。

重点样本 `backtest-daily-orders-slots-modification-b-20261117/full-fill-input.json` 的结构化基线已有第三张 `stopLoss`，`parent.activation=eachFill`。同目录 `wire-output-3-1.json` 的 `intentCheck` 要求改为 `fullFill`，原始 `orders` 却只有建仓和普通退出。它仍能通过结构与生成入口，但缺少所需保护，沿用原意图验收失败。没有解析 `intentCheck` 补单。

旧证据原字节校验保持原报告值，算法为按仓库相对路径排序，将路径、NUL、原字节依次送入 SHA256：

| 范围 | 文件数 | 聚合 SHA256 |
| --- | ---: | --- |
| contract 六目录 JSON | 211 | `d101a1442d0d56afce6fee01a1d8bc41ab639b745e9ca6556ca5c0b2b57463a7` |
| slots 六目录 JSON | 196 | `0545c5c22d86667d8024637d9527f832bf1a437f3fb97685c82f79db55800e14` |

## 离线 grammar 转换

转换器为上游 [llama.cpp 的固定提交 `6569fa868d43592f805530e595950570f9f5e404`](https://github.com/ggml-org/llama.cpp/blob/6569fa868d43592f805530e595950570f9f5e404/examples/json_schema_to_grammar.py)，文件 SHA256 为 `8a810d400da0fe9b4312d54cc3cf4a8ca94869fd874c997894e5dc7ea6e55bfd`。源码准备阶段只下载该 Python 文件并读取提交信息；未安装依赖。转换执行时使用本地副本，不允许远程 `$ref`，无模型或网络调用。

输入范围明确为**精简角色 Schema**：从当前 full-fill 的实际旧 wire，以及三入口正式新 Schema，提取数组 `items`、`additionalItems`、`allOf`、长度及角色常量，保留本地 `$ref`；订单对象收缩为角色字符串。省略价格表达式、父单、期限和其他业务字段。此验证证明该转换器在此数组形状上的语法可达性，不证明目标 LM Studio 的运行时版本或完整 Schema 兼容性。父单等业务断言由上节完整 Schema 与应用入口验证。

四次转换均退出 0，转换器 stderr 为空。以下为实际根规则：

```text
旧实际 wire 的角色投影：
root ::= "[" space tuple-0 "," space tuple-1 "]" space

三个新正式 Schema 的角色投影：
root ::= "[" space item ("," space item)+ "]" space
```

旧根规则只可达 `entry` 和 `exit`，第二项后直接闭合。新根规则可重复继续分隔项，第二项后的逗号可达；从 `root` 遍历引用可达五个角色，包括 `stage`、`stopLoss`、`takeProfit`。离线脚本对根规则的重复、逗号和角色可达性进行断言，未声称执行完整 GBNF 推理或实际解码。该转换器不据这里的 `allOf` 强制槽位顺序，因此正式应用入口的拒绝校验是必要部分。

角色输入、四份 `.gbnf`、转换器副本、`check-grammar.py` 和 `grammar-receipt.json` 位于新的 `var/acceptance/backtest-daily-orders-native-append-refs-20261118/`，没有覆盖旧目录。

## 引用复用与原生输入预算

五个角色分支分别使用本地定义，在最外层 `anyOf` 与 `allOf` 内复用；已有 `$ref` 继续复用。没有内联展开递归表达式。

按当前 slots 捕获逐份计算序列化原生 Schema 的 UTF-8 字节数：发现 18,667 → 18,989（+322）；编写 21,554 → 21,879（+325）；可编辑委托修改增加 322，修改 `tradePlan` 且冻结 `execution` 的 close 样本 17,259 → 17,259（+0）。这些是 Schema 字节数，不是分词结果或目标模型预算实测。

正式 `generationInputBytes` 继续计入消息及完整原生 response format；预算算法、额度、模型参数与业务消息未改变。文本 27,708／16,000 的原失败保持，不由本轮通过替代。

## 实际命令与结果

以下命令均在上述仓库执行，使用本机 RTK 及既有依赖，未安装依赖。

```sh
rtk proxy env npm_config_registry=https://registry.npmmirror.com BACKTEST_DAILY_ORDER_CAPTURE_ROOT=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance BACKTEST_DAILY_APPEND_EVIDENCE_DIR=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance/backtest-daily-orders-native-append-refs-20261118 pnpm --filter @thesis-ledger/server exec vitest run test/backtest/daily-order-native-append.test.ts test/backtest/daily-order-generation-contract.test.ts test/ai/ai-native-strategy-schema.test.ts test/ai/ai-generation-output.test.ts test/ai/ai-generation-schema-references.test.ts test/ai/ai-generation-finished-output.test.ts

rtk proxy env npm_config_registry=https://registry.npmmirror.com BACKTEST_DAILY_ORDER_CAPTURE_ROOT=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance pnpm --filter @thesis-ledger/server exec vitest run test/backtest/daily-order-native-append.test.ts

rtk proxy python3 var/acceptance/backtest-daily-orders-native-append-refs-20261118/check-grammar.py var/acceptance/backtest-daily-orders-native-append-refs-20261118/converter.py

rtk proxy env npm_config_registry=https://registry.npmmirror.com pnpm --filter @thesis-ledger/server typecheck

rtk proxy env npm_config_registry=https://registry.npmmirror.com pnpm exec eslint apps/server/src/ai/ai-generation-order-slots.ts apps/server/src/ai/ai-generation-order-validation.ts apps/server/src/ai/ai-native-strategy-schema.ts apps/server/test/backtest/daily-order-generation-contract.test.ts apps/server/test/backtest/daily-order-native-append.test.ts
```

- 六文件定向测试：**41／41 通过**，含三入口 30 行矩阵、冻结兼容和 48 位置捕获回归；没有跳过捕获测试。随后将重复建仓反例精确置于第三项，单文件 **5／5 通过**；最终收敛顺序检查的包装路径遍历后，去掉第一条命令的 BACKTEST_DAILY_APPEND_EVIDENCE_DIR 再运行同一六文件集合，**41／41 通过**。
- 旧 `daily-order-generation-captures.test.ts` 在本轮期间另测 **24／24 通过**；最终引用复用后的 48 位置已由新测试覆盖，没有修改其旧预期。
- grammar：四个精简角色输入全部转换成功并通过可达性断言。
- Server 类型检查、五个受影响 TypeScript 文件 lint：退出 0。未运行全仓测试、构建、浏览器、Worker 或目标运行态。
- 初次类型检查发现本轮新增 JSON Schema 类型收窄和 SDK usage 测试上下文类型缺失，已修复后通过。初次测试暴露构造四单越过冻结计划范围，以及旧捕获顺序不能沿用通用 Zod 成功预期；修正测试基线与预期并保留原始捕获。grammar 检查最初将重复写法限定为 `{1,}`，实际转换器生成 `+`，修正为等价重复表达后通过。这些属于本轮本地检查过程，不改变旧业务回执。

早期未完成测试的本轮新目录 `backtest-daily-orders-native-append-offline-20261118`、中间验证目录 `backtest-daily-orders-native-append-verified-20261118` 保留；最终 Schema／矩阵／grammar 依据为 `backtest-daily-orders-native-append-refs-20261118`，第三项反例的最终位置以测试源码及最终 41／41 结果为准，矩阵结论一致。

## 一致性 Review 与接续

本轮修复范围通过离线一致性 Review：原生开放分支、标准顺序约束、正式应用拒绝、父单及订单类型限制、范围外历史兼容、文本既有行为和引用预算均有对应证据。Spec 的稳定合同已同步，Task 的原 T04d.6b 仍未勾选；旧记录和未完成门禁保留。未新增 TODO 或归档，也未提交 Git。

后续须另行授权实际模型与部署。本轮不能替代实际成对生成、保存、冻结执行、中文或目标运行态验收。获准后首选修改入口 `full-fill`：必须实际生成第三张止损单且 `parent.activation=fullFill`；随后修改入口 `close`：只要求收盘保护时应保持两张委托，不额外生成触价止损。其余成对覆盖继续按原 Task 执行。

正则穿透、原 ATR 编写失败、真实分钟来源、T04d.5c 剩余冻结执行矩阵、T04d.7 完整消费、T04d.8 目标运行态及文本预算失败，沿用原记录，未扩大本轮范围。
