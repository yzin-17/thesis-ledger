# 策略发现消息体积核查与原生去重实施证据

后续合同对齐及独立发现目标修复见[独立报告](2026-11-17-backtest-daily-order-generation-contract.md)，其后的 24 份授权实际生成见[复验证据](2026-11-17-backtest-daily-order-native-model-recheck.md)。本文的原模型捕获、Schema 相等复核及 23,694 字节测量属于原去重基线。后续投影曾测得 25,475 字节，超过当时 16,000 字节的门槛。具名合同结果见[本轮复测](#具名策略发现合同复测)。各轮结果均对应各自的输入与验收标准。

核查及实施时间：2026-11-17，Asia/Shanghai。关联 [Task](../archive/tasks/2026-11-15-backtest-trade-plans.md)、[规格](../specs/2026-11-15-backtest-trade-plans.md)及[精简方案](../reviews/2026-11-17-strategy-discovery-message-compaction.md)。前半部分记录最初只读核查及内存对照；后半部分记录用户确认后的源码实施和独立验收，两者的调用及修改范围分别陈述。共享 `main` 的 HEAD 为 `1ed418780d1970e8380955453667edc2fed4b126`；工作区已有大量修改，以下结果以当前工作区和已安装依赖为准，不视为该提交的干净基线。三个合同保持 v5，真实原生路由、模型和参数保持，未保存 Provider，未同步目标运行态，也未处理 ATR 失败样本。

## 测量口径与历史失败

入口为 `strategyOptimizationPrompt`，沿用 `strategy-optimization-prompt-contract.test.ts` 的发现固定样本：`600519.SH`、日线、`balanced`、至少一笔平仓、第一轮、无历史候选，使用 `createNormalizedRunConfig()` 与 `createDiscoverySeed(scope)`，仅以内存桩返回空的历史候选。完整消息采用测试原式 `Buffer.byteLength(JSON.stringify(messages), 'utf8')` 计数。

此前 `/tmp/backtest-daily-generation-prompt-tests.log` 保留 `expected 24287 to be less than 16000`，当时两文件九例中八例通过、一例失败。本轮没有重跑该测试，也没有改写日志或将失败标为通过。当前工作区已将发现可选执行分支收窄为新增日线委托结构，重新静态计数为 **23,694** 字节；24,287 是先前输入的测量，不是当前值。

对照仅在内存中从当前发现 Zod 对象去掉新增 `execution` 字段，重新生成引用投影，并删除 `BACKTEST_DAILY_ORDER_PROMPT`。得到 **20,307** 字节；差额 **3,387** 字节属于当前新增委托部分。该对照不是改造前提交或某一历史请求，不能据此判定某次历史提交单独引入了全部超额。

## 既有部分为何超过门槛

下表按消息 JSON 序列化后的贡献分解，因此 Schema 内部引号的转义计入字节数；各行可直接相加。

| 去掉新增委托后的组成 | 字节 |
| --- | ---: |
| 完整 JSON Schema 文本，含外层消息转义 | 14,632 |
| Schema 返回格式指令及标记 | 222 |
| 交叉方向说明 | 405 |
| 交易计划能力字典及示例 | 2,828 |
| 既有 ATR 参数格式说明 | 201 |
| 其他系统指令、合同引用及研究口径 | 1,658 |
| 用户消息，含序列化转义 | 300 |
| 消息数组、角色及字段包装 | 61 |
| 合计 | 20,307 |

Schema JSON 原文为 **12,710** 字节，消息内转义另占 **1,922** 字节。用户消息原文仅 **262** 字节，固定样本无历史候选，因此本次超额不能归因于长研究目标或历史结果累积。

现有合同已经包含阶段、预算、初始及追踪保护、启用条件、亏损暂停、月末和每日波动率等能力。`generatedTradePlanSchema` 将普通计划、风险预算、月末调仓和每日波动率表达为四个严格分支，公共属性有引用复用，但各分支仍须表达可用字段、必填项及组合约束。再叠加能力字典、结构示例和需求忠实性说明，现有部分已超过 16,000；不是只新增了一个委托字段才发生超额。

附加内存诊断：同时去掉现有 `tradePlan` 字段及其两个字典后为 **8,755** 字节，相差 **11,552** 字节；该差额包括交易计划 Schema、仅由它引用的定义、字典及转义，不能相加为单个字段的原文大小，也不代表建议删掉该能力。现有 Schema 的注解类键在内存诊断中占 **1,983** 原文字节；只删除注解仍不能单独解决超额。以上删除均未写回文件。

规格最初记录的 15,132 字节属于早期计划合同；后续证据已记录保护分支扩展曾达到 19,179，再以投影和说明去重恢复门槛。当前扩展合同、说明和当时输入不同，不能继续拿早期通过结果证明当前消息仍低于门槛。参见原证据“新保护额外规则的来源与生成合同修正”。本轮不处理或重放任何 ATR 失败样本。

## 原生模式的完整 Schema 传递链

1. `strategy-optimization-prompt.ts` 的 `outputInstructions` 仅判断 `useSdkContract`，没有接收实际生成模式；发现使用 `buildGenerationSchemaPrompt(schema, 'ref')`，因此原生和文本模式都会在系统消息内带完整 Schema。
2. `strategy-optimization-candidate.service.ts` 先构建消息，再解析实际路由；`useSdkContract: true` 不等同于文本模式。只有实际模式为 `json_validated` 时调用 `assertGenerationSchemaPrompt`。
3. `generationOutput('native_schema', ...)` 使用 `Output.object`，经 `nativeStrategySchema` 保留完整字段、组合和最终 Zod 校验。已安装 AI SDK 为 `7.0.107`。
4. 已安装 `@ai-sdk/openai-compatible@3.0.53` 把输出 Schema 写入 `response_format.json_schema.schema`；`createGenerationModel` 在原生模式设置 `supportsStructuredOutputs: true`。协议和现有预检不要求再向消息文本加入同一完整 Schema。

因此重复来自业务提示装配没有区分模式，不是原生传输所必需。Schema 中的字段说明仍随原生参数传递；业务语义字典与本次目标继续放在消息内。

## 纯离线请求序列化对照

在 `apps/server` 目录用 `node --import tsx --input-type=module` 导入上述实际入口，分别构造原消息和建议消息。建议消息只把 `buildGenerationSchemaPrompt` 的完整片段替换为“只输出满足指定输出合同的 JSON 对象。”，其余合同引用、系统业务说明、用户消息保持相同。使用 `validateGenerationRequest`、`generationOutput`、`createGenerationModel` 和 SDK 的 `doGenerate`，注入只在内存返回固定响应的 `httpClient`，不连接任何地址、不读取凭证；返回内容不作为模型生成配置或业务执行验收。

| 核对项 | 原消息 | 建议消息 |
| --- | ---: | ---: |
| `JSON.stringify(messages)` | 23,694 | 6,602 |
| 原生参数中的完整 Schema | 15,059 | 15,059 |
| SDK 序列化请求体 | 38,897 | 21,805 |
| 消息内 `OUTPUT_JSON_SCHEMA:` | 有 | 无 |
| `response_format.type` | `json_schema` | `json_schema` |

两份 `response_format` 的 SHA-256 完全一致：`3c1b996412e5f3e176852df27ec52e4b65230153c70e85159416ce2ac685a65d`。原生预检均通过；同一建议消息改用 `json_validated` 时仍以 `configuration_invalid` 拒绝。共两次内存传输桩调用，网络／模型调用均为零，没有运行测试套件。

这证明消息去重可保留原生请求的完整输出合同，不证明 LMStudio 对精简输入的业务理解已通过。实际生成、原样保存、执行／回放和中文仍归 T04d.6～8，不用本次离线结果替代。

## 预算与尚未通过项

`OptimizationRunService.conservativeInputTokenReservation(messages)` 当前直接使用消息 JSON 字节数，没有单独计入原生参数中的 Schema。若实施去重，不能只把估算从 23,694 降到 6,602；需沿用当前保守估算口径并计入原生输出 Schema。输入／输出额度、费用规则和期限不因此调整，最终用量仍按上游实际回执。

16,000 门槛保持原值。上述 6,602 是内存方案测量，不是生产测试已通过。当前完整文本消息仍超额；文本 JSON 校验模式的完整 Schema 要求也保持，不能通过删除该分支检查或让文本分支不受测来制造通过。

## 用户确认后的实施与定向验证

用户随后明确授权按方案实施、预算计入原生 Schema，并继续 T04d 新委托的成对模型、执行／回放和中文验收。源码修改如下：

- `strategy-optimization-candidate.service.ts` 在消息准备前解析并冻结当前执行路由，预算、缓存身份和 SDK 共用该快照；保留历史步骤的幂等及结果未知禁重发行为。
- `strategy-optimization-prompt.ts` 接收实际模式；原生发现只保留 JSON 返回要求与合同引用，所有业务字典和用户上下文保持；未显式传入模式的既有调用保持原完整文本合同。参数优化、编写和修改消息未去重。
- `ai-generation-output.ts` 新增 `generationInputBytes`，使用与 SDK 相同的原生输出格式计入完整 Schema 字节；文本模式保持消息计数。实际发现准备函数返回消息和完整输入预留，替换原仅计消息的 RunService 方法；没有增加额度、费用、期限或合同版本。
- 固定测试分别断言模式、完整原生字段与递归定义、原用户消息、原输出额度、实际 SDK 请求、预检和输入预留。文本消息仍运行原 16,000 断言，不改成跳过或预期失败。

验证记录：

| 范围 | 结果与日志 |
| --- | --- |
| 初轮原生／生成定向 | 旧测试错误要求原生 draft-7 使用 `$defs`，一例失败；修正为检查 `$defs`／`definitions` 的实际定义，未改变合同。原日志 `/tmp/backtest-daily-native-dedup-focused.log` 保留 |
| 八份新委托固定 Worker／回放／中文 | 八例通过，`/tmp/backtest-daily-model-fixed.log` |
| 新委托编写／限定范围修改固定合同 | 新 Schema 构建后，市价基线没有声明同一研究来源，导致限价修改夹具引用未知来源；修正独立夹具从创建起显式声明研究坐标，未修补模型输出或放宽业务校验。失败 `/tmp/backtest-daily-native-current-contracts.log` 保留 |
| 当前原生消息与八份固定合同／Worker | 两文件 23 例通过、文本已知失败一例未在此批执行；`/tmp/backtest-daily-native-current-contracts-fixed.log` |
| 文本消息原门槛 | 独立运行一例失败，`/tmp/backtest-daily-text-budget-known-failure.log`；这例仍留在完整测试文件中，不宣称全文件绿色 |
| 当前 Server 类型 | 通过，`/tmp/backtest-daily-native-model-server-types-current.log`；早期夹具联合类型错误日志保留 |
| 范围 lint | 通过，`/tmp/backtest-daily-native-dedup-lint-fixed.log`；初轮未使用 import／显式 any 已修正，原日志保留 |
| 构建与边界 | Domain／Schemas 构建通过，`/tmp/backtest-daily-native-current-{domain,schemas}-build.log`；边界通过，`/tmp/backtest-daily-native-boundaries.log` |

定向命令为 `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/daily-order-model.test.ts test/strategy-optimization/strategy-optimization-prompt-contract.test.ts -t '^(?!.*已知未通过)'`；文本门槛另以同文件 `-t '已知未通过'` 单独执行并明确失败。固定样本与文本失败均单列，不将模型或功能验收提前标记通过。

新增 `daily-order-model-postgres.integration.test.ts` 通过原有维护包装的 `BACKTEST_PLAN_SCENARIO=daily-orders` 分支执行。八份无字段名意图分为限价／市价、触价固定价格／收盘百分比保护、每次／全成激活、当天／两根有效四组；触价与收盘组分别明确本次模拟价格 9 和首笔价下方 10%，不声称两者具有同一数值距离。编写／修改使用实际操作投影、确认与范围校验。发现沿用正式消息装配及输出合同，再附加受控自然语言实验输入；生产发现 API 当前没有该自由文本字段，因此该项不冒充发现 UI／API 自由文本能力。所有有效模型配置仍逐份原样保存、重读、冻结和回放，错误配置／输出及原始传输分别保留。

## 实际模型首批与消费面进展

发现首批执行目录为 `thesis-ledger-infra`，命令为 `BACKTEST_PLAN_ENTRY=discovery BACKTEST_PLAN_SCENARIO=daily-orders node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance/backtest-daily-orders-discovery-native-20261117`；包装保持真实模型、参数和原生路由，只读真实 Provider，创建专属 tmpfs PostgreSQL 并运行 53 份迁移，结束后删除本次容器。

首批分组过大，在隔离测试既有 900,000 毫秒总时限内未完成。原生格式探针通过，随后 `limit`、`market`、`touch`、`close`、`each-fill`、`full-fill` 六份原始输出全部被最终 Schema 拒绝；没有保存可执行策略。错误包括数值常量写成布尔字符串、阶段没有对应委托、普通退出附带父单或持仓有效期等；这是新委托生成的结构错误，固定样本证明合同可表达需求，不能归为执行偏离。完整请求、出站 Schema、响应及错误分别保存在上述私有目录。

已捕获八份请求与七份响应：一次格式探针、六次已知业务失败，以及 `day` 的一次在途请求。`day` 没有完整响应回执，保留为结果未知，不自动重试；`two-bars` 未启动。原始超时保存在 `/tmp/backtest-daily-orders-discovery-native-20261117.log`，未伪造汇总成功回执。只读检查确认本次隔离测试容器已清理。后续验收按小批运行，并在每次调用前为原单次期限及清理留出窗口；不提高模型单次期限或隔离脚本的总时限。

编写及修改随后按四份一批完成，仍使用原期限；下表记录完整结果。模式、合同和参数继续保持原值。

消费面同时修正版本摘要、委托修改预览及研究版本确认中的旧统一市价说明，读取实际完整配置；双端回测设置继续显式携带模拟额度。Desktop 版本摘要八例通过，`/tmp/backtest-daily-chinese-summary-tests.log`；双端类型通过，`/tmp/backtest-daily-chinese-{desktop,mobile}-types-fixed.log`。阶段重命名现在同步委托引用，原标识缺失时不误认不存在的引用；三例及 Domain 构建通过，`/tmp/backtest-daily-stage-editor-{tests,build}.log`。这不属于模型输出修补。

固定 `each-fill`／`full-fill` 两份配置原样记录在 `var/acceptance/backtest-daily-orders-fixed-browser-20261117`，模型调用为零。通过已有浏览器宿主验证 Desktop 摘要、实际版本详情与 Mobile Web 版本页的 1440／1024／768／390 四宽，共 24 张页面；逐条核对完整中文，切换版本页页签后仍存在，未溢出或出现页面错误。命令为 `BACKTEST_PLAN_CASES=each-fill,full-fill node scripts/local-runtime/backtest-trade-plan-browser.mjs var/acceptance/backtest-daily-orders-fixed-browser-20261117 var/acceptance/backtest-daily-orders-fixed-browser-20261117/pages`，日志 `/tmp/backtest-daily-orders-fixed-browser.log`。窄屏版本页已目视检查。此为固定配置的消费验证，不冒充实际模型或原生真机验收。

## 三入口实际模型结果

五批目录均位于 `var/acceptance/`，日志为 `/tmp/<目录名>.log`。每批一次原生格式探针，之后每个新业务输入仅调用一次，未对失败输出补字段、删规则或重试。

| 目录 | 新业务调用 | 结果 |
| --- | ---: | --- |
| `backtest-daily-orders-discovery-native-20261117` | 7 | 六份 Schema 拒绝；`day` 一份无完整响应、结果未知 |
| `backtest-daily-orders-authoring-native-a-20261117` | 4 | `market` 通过；`limit`、`touch`、`close` 被 Schema 拒绝 |
| `backtest-daily-orders-authoring-native-b-20261117` | 4 | `each-fill`、`full-fill`、`day` 被 Schema 拒绝；`two-bars` 输出截断 |
| `backtest-daily-orders-modification-native-a-20261117` | 4 | `limit`、`close` 通过；`market` 选错合法结构；`touch` 被最终入口以无实际变化拒绝 |
| `backtest-daily-orders-modification-native-b-20261117` | 4 | `each-fill`、`full-fill`、`day`、`two-bars` 全部通过，两组完整成对通过 |

共 **28 次适配器请求、28 次 HTTP 请求、27 份完整响应**，其中五次格式探针、23 次业务调用。发现的 `two-bars` 与原 `each-fill` 的完整自然语言输入相同：`daily-order-model-reuse.test.ts` 将当前正式装配的消息及原生 Schema 与 `request-6.json`／`wire-6-1.json` 逐项比对相等，生成 `reuse-two-bars.json`。因此第 24 个语义位置复用原失败，新增调用为零，不把别名样本当作第二次成功。日志 `/tmp/backtest-daily-orders-discovery-identical-input.log` 一例通过。

当前合同与原始出站、配置中文、成对结果的零调用复核为 `daily-order-model-review.test.ts`，最终回执 `var/acceptance/backtest-daily-orders-native-review-current-20261117/receipt.json`，日志 `/tmp/backtest-daily-orders-native-review-current.log`。24 个语义位置为：七份通过、十三份 Schema 拒绝（包含一份同输入复用）、一份输出截断、一份合法结构误选、一份最终入口拒绝、一份结果未知。发现与编写均未形成完整通过的一组；修改仅激活及有效期两组完整通过。不拼接不同输入或不同入口凑成通过组。

七份通过配置均经实际编写／修改校验、正式创建服务原样保存、重读精确相等、冻结 Worker、完整重复回放及配置中文。另一份修改 `market` 原始配置也是合法、已原样保存执行，但它把所需的两根有效日线市价委托改成旧 `market`／`DAY` 整笔路径；这是模型选错合法结构，不是执行引擎偏差。`touch` 原始合法输出仍为止损 8，未按输入改成 9，最终服务以“建议没有实际变化”拒绝，保留其原始配置和中文，但没有创建可执行版本。非法／截断／未知输出没有进入 Worker。固定八份可接受配置已经证明需求可表达，不用这些模型失败反推 Schema 缺能力。

所有批次只读捕获的 Provider settings 深比较相等，逐份当前原生 Schema 与原始出站参数相等，模式均为 `native_schema`、合同均为 v5、实际模型与已配置模型一致。实际请求与响应、原始错误、未完成状态保留。发现的人工自然语言实验边界仍如前述，不能证明生产 API 已支持自由文本发现。

验收数值比较新增 `DecimalValue.compareTo`，允许 `0.30`／`0.3`、`9.0000`／`9` 的等值表示；模型原文不改。固定测试新增一例验证等值小数不被误判为意图错误；没有按摘要修复配置。

## 实际全成配置的补充执行与回放

修改入口已通过的 `full-fill.json` 在上限 100 的原行情中仅部分成交后到期，因此保护保持未激活。另以同一原始配置、独立行情和显式模拟上限 **50,000 研究单位／根** 检查父单一次全部成交。`daily-order-model-complete.test.ts` 验证父单仅一笔成交，保护在父单成交当根建立、最早可参与同根区间，随后下一有效行情卖出全部父单成交量；冻结 Worker 两次完整结果相同，配置前后相同，新增模型调用为零。

成功证据在 `backtest-daily-orders-modification-native-b-20261117/full-fill-complete.json` 及同目录 `full-fill-complete-snapshot-cap50000/`，日志 `/tmp/backtest-daily-orders-actual-full-fill-complete-cap50000.log` 一例通过。首次补测错误地用 10,000 上限，而该快照初始资金为一百万、父单目标超过此上限，订单部分成交后到期；这是验收行情／额度设置问题，原失败日志 `/tmp/backtest-daily-orders-actual-full-fill-complete.log` 与 `full-fill-complete-snapshot/` 均保留，未改模型配置或扩大原调用额度。

## 订单结果与当前中文消费

新增独立 `backtest-daily-order-result-display.ts`，直接从持久化订单事实生成状态、累计成交／余量、价格／有效期、父单、激活和最早撮合中文。Desktop 与 Mobile Web 的实际结果入口接入搜索、状态筛选及分页；Desktop 抽取原有分页表格复用。行情序号明确是包含预热的冻结第几根，不在缺少映射时猜日期；实际成交时间继续由原成交列表持有。Domain 两例覆盖 27 股父单只成交 10、退出 4 后保护 6，以及全成保护在父单未全成时保持零／结束；输入不变。

旧 `market`／`DAY` 中文补充“当日有效；市价委托按现有整笔撮合规则成交或拒绝”，使修改前后能够看出两根日线委托被改掉。原捕获中文保留，当前回读另存；零调用复核只允许该一份旧市价样本增加这一行，其余配置当前回读与原捕获完全一致。配置合同、提示和引擎均未因此修改。

四宽页面累计 **84 张**，全部按当前配置逐条比对中文、无溢出／页面错误。来源分别为：固定配置摘要／版本 24 张和结果 16 张；实际编写 `market` 摘要／版本 12 张和结果 8 张；实际修改按量／全成前后预览 16 张；实际误选旧市价的修改前后预览 8 张。结果页另验证搜索无结果及清空；修改页验证受控采用／放弃，不向真实业务提交。页面目录为对应批次的 `pages/`、`order-pages/`、`proposal-pages/` 及 `market-current-readback-pages/`。日志为 `/tmp/backtest-daily-orders-{fixed-browser,result-browser,authoring-market-browser,market-result-browser,actual-proposal-browser,legacy-current-proposal-browser}.log`。窄屏版本、结果及修改预览已目视检查；这不是原生真机或已部署目标页面验收。

## 最终定向复核与剩余门禁

- Domain 构建 `/tmp/backtest-daily-native-final-domain-build.log` 通过；回读、结果、引用编辑三文件八例通过，日志 `/tmp/backtest-daily-native-final-domain-tests-fixed.log`。首轮新增回读测试误用缺 sizing 的局部夹具，原失败日志保留，修正独立夹具后通过。
- Desktop 原详情分页抽取的相关九例通过，`/tmp/backtest-daily-native-final-detail-tests.log`；双端结果新源码的类型通过，`/tmp/backtest-daily-result-{desktop,mobile}-types-final.log`。Mobile 模拟额度意图一例通过，`/tmp/backtest-daily-mobile-matching-intent-current.log`；首次命令误收集发布归档副本的失败日志保留，没有改归档。
- 当前 Server 类型通过，`/tmp/backtest-daily-native-final-server-types-fixed.log`；新增零调用复用测试的 AST 类型断言先失败后修正，原日志保留。范围 lint 最终退出 0，`/tmp/backtest-daily-native-final-lint-clean.log`；初轮路径错误及表格抽取后未用 import 的错误保留。原生移动包 Flow 解析提示未作为本次业务失败或消除既有工程警告。
- 最后一次类型断言调整的单文件 lint 通过，`/tmp/backtest-daily-native-final-reuse-lint.log`；当前导入边界通过，`/tmp/backtest-daily-native-final-boundaries.log`。`git diff --check` 对本轮受影响的已跟踪入口和文档通过；本轮自有浏览器宿主已停止，隔离 Provider 验收容器已清理。
- 原生消息门槛、完整 Schema 预算和 SDK 定向结果沿用本证据前述输入；文本完整消息 23,694 的 16,000 门槛仍失败，没有重跑无关能力或提高阈值。

T04d.6b 仍未通过全部入口和四组成对覆盖；T04d.5c 的冻结费用／公司行动等剩余执行矩阵、T04d.7 的模拟额度控件／研究确认完整页面、T04d.8 的新增目标运行态仍未验完。没有以七份成功替代这些门禁，也没有部署或修改真实策略。历史失败、其他工作区修改和 ATR 未完成项保留。

## 具名策略发现合同复测

2026-11-24，使用当前工作树的 `strategy-discovery-generation-v1`，通过 `prepareOptimizationGeneration` 重跑同一固定样本。原 16,000 字节断言重现失败，收到 23,186 字节。两种模式分别计量。

| 模式 | 完整消息 | 消息内嵌 Schema | 独立输出格式 | 输入预算预留 |
| --- | ---: | ---: | ---: | ---: |
| 文本 JSON 校验 | 23,186 | 21,485 | 无 | 23,186 |
| 原生 Schema | 10,574 | 无 | 49,956 | 60,530 |

文本 YAML 展开后与去除说明性注解的 JSON 投影逐项一致，含 39 项共享定义。该 JSON 投影以紧凑 JSON 表示为 44,832 字节，嵌入后的 YAML 为 21,485 字节，约占完整文本消息的 93%。其余指令、请求及序列化开销合计 1,701 字节。按用户确认，文本固定样本上限调整为 24,576 字节（24 KiB），余量 1,390 字节。原生固定消息上限为 16,000 字节。运行时按每次实际装配的输入及实验预算计算预留和费用，最后使用现行 Schema 校验输出。

共享 Schema 构建通过。用 `pnpm --filter @thesis-ledger/server exec vitest run` 核对 `strategy-optimization-prompt-contract`、`strategy-optimization-budget`、`ai-generation-schema-prompt`、`ai-generation-output` 和 `strategy-optimization-sdk-executor.integration`，五组 45 项全部通过。证据来自固定样本和本地 HTTP 桩。
