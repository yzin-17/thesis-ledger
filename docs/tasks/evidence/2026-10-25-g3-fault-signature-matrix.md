# G3 D20 故障特征的本地对照

日期：2026-10-25。对应[原 Task 的 G3-D22](../2026-10-18-research-evidence-evolution.md)与[原 Spec 的 G3-RSP1～RSP5](../../specs/2026-10-18-research-evidence-evolution.md)。完整安全观测、依赖入口及输入 SHA-256 见[机器回执](2026-10-25-g3-fault-signature-matrix.json)。

本轮完成离线路径核对与固定响应对照，没有发现足以支持业务补丁的本地缺陷。HTTP 非成功 JSON 错误能解释 D20 的全部已知错误特征，但同文案的 fetch 拒绝也能匹配；因此没有确诊 D20 的实际 HTTP 状态或根因。标准 SSE error 在当前有效观察链中先计 1 帧，与 D20 的 0 帧不同。现有 D21 足以区分本轮固定场景，不新增生产诊断或敏感留存。

本轮真实模型调用 **0**、部署 **0**、目标配置写入 **0**、业务写入 **0**、运行中业务 API 读取 **0**。剩余最多 8 次真实调用继续冻结。G3-D8／D20／D21b 和正式 G3 保持未完成；目标最后一次 V2=false／数据保护／capabilities 502 仅作为[历史记录](2026-10-25-g3-http-response-local.md#d20同体零网络核对与运行态只读预检)，本轮没有重新核实目标状态。

## 输入与可比范围

- D20：submission `1ff23ce0-d87f-4c34-97b3-9b7905c7c8bd`、run `238c6c7e-54f7-4f46-9fc6-c7ffb0188a81`、request `7c00b7bd-963d-4ef0-8588-22c5d3b49d39`。从[原正式回执](2026-10-25-g3-formal-free-sdk-recovery.json)读取既有安全事实，未恢复旧日志或读取冻结业务材料。
- 实际安装版本：`ai 7.0.107`、`@ai-sdk/openai-compatible 3.0.53`、`zod 4.4.3`，与 D20 的运行诊断一致。读取了已安装 SDK 源码与其运行入口；未修改 node_modules。回执同时记录依赖入口和所读 SDK 源码的 SHA-256。
- D20 预检路由记录为 `openai-compatible-chat`／`openrouter-v1`／`native_schema`／`research-generation-v2`；实际请求诊断为 stream、严格 json_schema、require_parameters、20000 max_tokens、include_usage，未显式 reasoning。当前适配器文件与 D20 sourceHashes 完全相同；模型构建文件已因 D21 响应观察接线变化，不能宣称当前全部代码与 D20 逐字相同。D20 保存的请求事实没有逐请求 adapter 字段，不能用预检记录补造该字段。
- D20 的 provider 诊断非 null，说明当时构造了兼容层运行诊断；这仍不单独证明每个观察回调在目标中接线正确。当前模型工厂将诊断传入 metadataExtractor，固定 B 样本证实当前接线生效。D20 的 SDK 版本记录也不等同于已取得当时全部依赖文件的字节指纹。
- 本轮开始时，两份被修改测试的 SHA-256 与 D21 原表完全一致，分别为 `8a38df692c9d83414371902dca592998e945eeac4709d859440b35aa6bb88515`、`97e6cfc68d565ebe4bd68cc7ad9b8be906f827f0dfd96fd81ca402bfe5e8c79b`。原表其余源码、Schema、单测及边界脚本输入保持匹配；两份集成测试的新指纹另存，不覆盖旧证据。
- 固定样本沿用真实 SDK、兼容层、应用适配器和本地 HTTP 服务；E／F1 只替换 fetch 返回／拒绝边界，解析与错误处理链未 mock。每个样本分别运行无诊断的旧合同与 research V2，比较请求／错误／用量语义；两次生成各自 fetch=1，属于两个测试对照，不是重试。所有允许发出的 HTTP 请求仅匹配临时本机端口，模拟 fetch 未匹配地址直接失败。
- 测试传入 `z.strictObject({ answer: z.string() })`，用于错误路径对照，不是完整 V2 报告 Schema 验收。D20 完整冻结材料的 11 份完整性证据及零网络重建按既有输入复用：22,517 字节、SHA-256 `0beccf88684d2b4817f3143e0e391815b5936d8627af89cf8169ead3b723fb8b`；本轮没有重复重建。D19 的 22,542 字节成功直连不是同体对照，也没有作为 SDK 因果证据。

## 错误路径与观测字段的来源

下列行号以本轮未修改的生产源码及实际安装 SDK 为准。SDK 路径均相对于其包内 `src/`。

| 字段／路径                             | 实际来源与顺序                                                                                                                                                                                                                                                                     | 不能证明什么                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `phase`、最终 `code`／`externalResult` | `ai-sdk-generation.adapter.ts:270～305` 消费 SDK 流；SDK error part／onError 进入 streamError 后使用 `errorFact(..., 'stream', true)`。若迭代直接抛错，外层 `:244～251` 使用 request。                                                                                             | stream 不证明有 SSE；request 不证明没有收到 HTTP。它们是应用控制流位置。                                                           |
| HTTP 非成功响应                        | provider-utils `post-to-api.ts` 在 response.ok=false 时调用失败处理器；`response-handler.ts` 读取 JSON 错误并生成 APICallError，保留 message、真实 statusCode、headers／body 等 SDK 内存信息。`ai/stream-text.ts:3163～3177` 把初始调用异常放进 error part，故 A 最终仍为 stream。 | HTTP 拒绝不是只会进入 request；SDK 内存中的 headers／body 没有因此进入本轮生产诊断。                                               |
| 标准 SSE error                         | compatible `chat/openai-compatible-chat-language-model.ts:572～588` 先检查解析 success；成功后同步 processChunk(rawValue)，再转发 error。项目 `ai-sdk-generation-model.ts:27～40` 同步调用 observeProviderChunk。                                                                  | 当前链路中，已成功识别的标准 error 应先计帧；但不能把此条件直接推广为 D20 一定是 HTTP 错误。                                       |
| SSE 解析／合同失败                     | provider-utils `parse-json-event-stream.ts:18～30` 先解析事件 JSON 并校验 SDK Schema；compatible `:573～576` 对失败直接发 error，跳过 processChunk。无效 JSON 为 JSONParseError；有效 JSON 不合事件合同为 TypeValidationError。                                                    | 0 兼容层帧不表示原始响应／SSE 数据为 0，也不等同于报告正文 JSON 有错。                                                             |
| SDK 的错误对象                         | `ai/generate-text/stream-language-model-call.ts:461～465` 调用 `prompt/normalize-stream-provider-error.ts`。标准 error 被包装为 StreamProviderError，保留 message／code，并可从 400～599 的 code 推导 statusCode；已有 Error 实例保持。                                            | **B 的 SDK statusCode=502 是等价状态，实际 HTTP=200。** 不得把 error.code 或 SDK 推导的 statusCode 当作实际 HTTP 状态。            |
| 应用错误映射                           | `ai-sdk-generation-facts.ts:14～83` 只读取 statusCode／status，保留经现有脱敏和 500 字符限长的 summary；特定鉴权／权限／配额等状态另映射，其余已发送错误仍 transport_unknown／unknown。E2 的 Error.code=401 不被应用当作 HTTP 401。                                                | transport_unknown 不是网络故障确诊；更细的诊断分类不改变外部生成结果或费用。                                                       |
| 两层内容与兼容层帧                     | `ai-generation-stream-diagnostics.ts:79～128` 的 provider 计数来自成功解析后的 rawValue；sdk 计数来自应用观察到的 text-delta／reasoning-delta。                                                                                                                                    | provider frames 不是原始 SSE 事件数；sdk 正文为 0 不排除收过错误或无法识别的事件。                                                 |
| `httpResponse`、SSE 统计及错误 origin  | `ai-generation-http-request-diagnostics.ts:178～195` 在 fetch promise 返回 Response 后调用旁观器；`ai-generation-http-response-diagnostics.ts:33～180` 同步旁观下游实际读取的字节，识别 HTTP 正文或 SSE error。错误的数值 code／安全 category 来自有界 `error` 和 `metadata.raw`。 | Response 缺省只表示该观察边界没有得到 Response；不证明上游没收到请求或费用为 0。bodyBytes 是实际旁观到的字节，不能推算未读取部分。 |
| bodyComplete／bodyTruncated            | 正常读取到 EOF 才 flush 并标记 bodyComplete；超过诊断暂存边界标记 bodyTruncated。F1 读取失败与 F2 正常 EOF 分别展示两种结果。                                                                                                                                                      | bodyComplete=true 不证明 SSE 有 DONE 或模型正常结束；bodyTruncated=false 不证明网络没有中断。                                      |
| 快照与持久化                           | `ai-generation-diagnostics.ts:27～28` 在外层 catch 中截取快照，随后 `ai-generation-failure-diagnostics.ts:110～134` 附加诊断。B 的同步计帧发生在 error part 之前，固定对照没有复现早快照把帧清零的现象；生产 Store JSON 往返仍用原测试。                                           | 本地通过不是目标 PostgreSQL、发布或重建验收；也不能证明 D20 从未发生其他接线或时序差异。                                           |

SDK 内存错误链只在合成测试中提取 name 与数值字段，写入同名 JSON；不保留 cause 对象、stack、data、请求或响应原文，也没有新增生产留存字段。

## 故障特征对照

A～F 的最终 code 均为 `transport_unknown`、externalResult 均为 `unknown`；provider／SDK 正文与推理的 chunks、characters 全部为 0，用量全部 unknown／null。每次生成的实际 fetch 和请求诊断 attempts 均为 1，所有样本的三个包版本均如上。下表的 summary 展示关键前缀；同名 JSON 保留当前应用的合成样本脱敏 summary。

| 固定场景                                                    | 实际错误组合                                                                          | 与 D20 一致之处                                             | 不一致之处                                          | 支持／削弱的假设                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A：HTTP 502 JSON，message=Provider returned error           | stream；相同 summary；兼容层 0 帧                                                     | 四个最终错误字段、帧数、两层内容、用量和 fetch 次数全部匹配 | 新样本已知 HTTP=502；D20 未观测该字段，不能比较     | 支持“非成功 HTTP 错误经 SDK 流出口传播”可以解释现象；不能确定 D20 就是 502         |
| B：HTTP 200，合法标准 SSE error＋DONE                       | stream；相同 summary；兼容层 1 帧                                                     | 最终错误字段、内容、用量及次数匹配                          | D20 为 0 帧                                         | 在观察器接线相同且生效的前提下削弱“单一标准 SSE error”                             |
| C：HTTP 200，SSE 事件 JSON 无效                             | stream；JSON parsing failed；0 帧                                                     | 代码、阶段、外部结果、0 帧及内容匹配                        | summary 不同                                        | 0 帧可以来自解析失败；当前固定纯语法错误不能解释 D20 文案                          |
| D：HTTP 200，JSON 有效但 choices 类型不合 SDK 事件合同      | stream；Type validation failed；0 帧                                                  | 同 C 的匹配字段                                             | summary 不同，raw invalidJsonEvents=0               | 保留 SDK 事件合同拒绝路径；不能与 C 或报告正文校验混为一谈                         |
| E：Response 前 fetch 拒绝 TypeError(fetch failed)           | stream；fetch failed；0 帧                                                            | 除 summary 外的已知错误／计数匹配                           | summary 不同                                        | 削弱这一普通 fetch 拒绝样本直接解释 D20 的说法                                     |
| E2：Response 前 Error(Provider returned error)，附 code=401 | stream；相同 summary；0 帧                                                            | D20 全部已知错误／计数匹配                                  | 没有可与 D20 比较的 HTTP 事实；该文案由测试人为指定 | 证明仅凭现有组合不能排除边界异常；不证明真实 fetch 曾这样报错，也不把 code 当 HTTP |
| F1：收到 HTTP 200 后，17 字节未完成事件的 body 读取失败     | request；Failed to process successful response；0 帧                                  | transport_unknown、unknown、内容／次数匹配                  | 阶段和 summary 不同                                 | 削弱当前 SDK 普通 body 读取失败直接解释 D20 的说法                                 |
| F2：HTTP 200，在同一未完成事件处正常 EOF                    | stream；Response stream ended without a finish reason.；0 帧                          | 除 summary 外的错误／计数匹配                               | summary 不同；bodyComplete=true 但 SSE 未结束       | 证明正常字节 EOF 与正常模型结束不同；没有把断流统称为 JSON 错误                    |
| 原 HTTP 401 对照                                            | authentication_failed／stream／rejected_before_generation；Invalid API key [REDACTED] | 内容和次数匹配                                              | 代码／summary／外部结果不同                         | 保留原鉴权映射，D21 接线未改变该语义                                               |

| 场景     | httpResponse 状态／类型／字节数 | SSE events／invalidJsonEvents／done／incompleteEvent | bodyComplete／bodyTruncated | error origin／数值 code／安全分类                    |
| -------- | ------------------------------- | ---------------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| A        | 502／json／137                  | null                                                 | true／false                 | http_body／502／provider_error                       |
| B        | 200／sse／159                   | 2／0／true／false                                    | true／false                 | sse_error／502／provider_error                       |
| C        | 200／sse／23                    | 2／1／true／false                                    | true／false                 | null                                                 |
| D        | 200／sse／49                    | 2／0／true／false                                    | true／false                 | null                                                 |
| E        | 不存在                          | 不存在                                               | 不存在                      | 不存在                                               |
| E2       | 不存在                          | 不存在                                               | 不存在                      | 不存在；仅原 Error.code=401，status／statusCode 为空 |
| F1       | 200／sse／17                    | 0／0／false／true                                    | false／false                | null；SDK APICallError.statusCode=200                |
| F2       | 200／sse／17                    | 0／0／false／true                                    | true／false                 | null                                                 |
| 401 对照 | 401／json／69                   | null                                                 | true／false                 | http_body／401／authentication                       |

全部 SSE 样本 oversizeEvents=0，响应数=1／省略数=0。A／B 的 upstream.overloaded 仅来自人为 metadata.raw，不是 D20 曾过载的证据。B 的 SDK 错误链为 AI_StreamProviderError，C 为 AI_JSONParseError→SyntaxError，D 为 AI_TypeValidationError→ZodError；各来源及数值字段见机器回执。

原失败诊断集成测试和流诊断测试另覆盖“事件合同合法，但模型正文 JSON 不合法”和“正文 JSON 合法，但 answer 字段不合简化输出 Schema”：两者进入 schema_invalid／validation／complete，且已有内容摘要。该 complete 是既有错误合同的外部结果语义，不能由此确认真实费用。它们与 C／D 的 stream／transport_unknown 是不同层次，也不替代完整 V2 报告验收。

## 候选排序、反证与修复判断

1. **优先候选：非成功 HTTP JSON 错误经流出口传播。** A 完全匹配已观测字段，且源码解释了为何阶段仍是 stream。反证是获准新响应实际为 HTTP 200 或观察边界没有 Response；即使未来 A 型响应出现，也只确定那次请求，不能补造 D20 的 HTTP 状态。不能从合成 502 缩窄到 D20 必然 502。
2. **仍可能：fetch 边界抛出同文案异常。** E2 是明确反例，防止仅凭错误组合排除该路径；它没有真实发生证据，排序低于有标准 HTTP 错误处理依据的 A。普通 E 文案不同。实际 Response 已被 D21 观察到将推翻该次请求的“Response 前拒绝”。
3. **受条件削弱：已成功解析的标准 SSE error。** B 会先计帧；D20 的 0 帧不支持该标准单一过程。只有核实当时观察器确实接线生效，才可进一步排除；当前离线实验不替代 D20 旧构建字节证据。
4. **较弱候选：纯 SSE 语法／事件合同错误、普通读流失败或 EOF。** C／D／F 都有可辨别的不同文案，F1 阶段也不同。混合事件、最后错误覆盖或不同包装仍需实际证据，不以本矩阵穷尽所有可能。
5. **目前无支持：报告正文 JSON／V2 校验导致 D20。** 现有该层反例已出现正文并进入 validation，D20 是无正文的 stream 错误。不能仅凭 result=null 指向 JSON 语法、strict Schema、推理或具体免费模型。

**没有发现固定反例证明的本地业务缺陷，未实施生产代码、错误映射或 SDK 补丁。** “修复前失败／修复后通过／撤去补丁再次失败”不适用。全部设计内错误都是成功验证的负例；没有删除或放宽原断言、提高超时来消除未预期失败。没有改变结果、外部结果、用量、结算、默认模型、推理默认、严格 Schema、预算、重试或备用路线。

本轮实际解决的是错误路径的证据缺口：固定了 HTTP 错误与标准 SSE error 的帧差异，分开三层 JSON／Schema 问题，证明 SDK 等价状态不等于 HTTP 状态，并为下一次响应建立可执行的分类断言。没有声称正式生成问题或上游故障已经解决。

## 修改、验证与保留边界

| 修改文件                                                                    | 作用                                                                                                                                                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/test/ai/ai-http-response-diagnostics.integration.test.ts`      | 在原框架补齐 A～F 及必要子分支；先观察后固定错误、层计数、响应事实、SDK 包装与每次 fetch 断言；旧合同／V2 的错误和用量保持比较。仅测试开关 G3_FAULT_MATRIX=1 时输出合成安全矩阵。 |
| `apps/server/test/ai/ai-generation-failure-diagnostics.integration.test.ts` | 为既有报告解析失败／生产 Store JSON 往返加精确本机地址阻断和单次 fetch 断言，原结算与保护断言保留。                                                                               |
| 原 Spec／Task                                                               | 补充 RSP5 和 D22；更新当前状态、局部完成与正式未完成边界。                                                                                                                        |
| 原 `2026-10-25-g3-http-response-local.md`                                   | 只增加 D22 后续入口，原部署／目标核查继续保留历史时点边界。                                                                                                                       |
| 本文及同名 JSON                                                             | 保存路径、固定样本观测、输入指纹、验证和后续方案。                                                                                                                                |

按定向测试→类型→定向规范执行，最终结果如下。命令均在主仓目录通过既有宿主 Shell／Volta 环境执行，未安装、升级或重装依赖。

- 初次特征观察：`G3_FAULT_MATRIX=1 rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-http-response-diagnostics.integration.test.ts --reporter=verbose`，9 项通过；此前没有预写“D20 对应某行”。随后才固化实际错误组合。
- 受影响回归：相同 Vitest 入口运行原四组指定测试及 `ai-generation-stream-diagnostics.test.ts`、`ai-generation-failure-diagnostics.test.ts`，6 文件、40 项通过。覆盖成功、正文／推理隔离、取消传播、无重试、错误语义、脱敏、限长、旧合同及生产 Store JSON 反读。
- 最后补充 SDK 数值字段来源断言后，按最终指纹仅重跑变更的 HTTP 响应集成测试，9 项通过；其余五文件 31 项输入未变，复用上条结果。
- `rtk proxy pnpm --filter @thesis-ledger/server typecheck` 最终退出 0；定向 ESLint、Prettier check 退出 0。ESLint 通过 API 同时读取本轮开始前的精确测试副本和当前文件，复杂度上限 20：矩阵文件无告警，原失败诊断测试的存量 26→26，没有新增复杂度告警；两份文件均低于 800 行阈值。
- 请求仍最多 1 KiB、运行 8 KiB、失败 12 KiB、响应 2 KiB；没有修改 Schema 或扩大生产留存。现有超长／脱敏／取消／旧记录断言通过。
- 未重跑未变的全仓测试、已知跨层边界阻塞、生产构建或镜像。没有访问目标 PostgreSQL、capabilities、Provider、行情／新闻，未进行浏览器／Electron／移动端或远程 CI 验收；这些结果没有标成通过。
- 最终一致性核对：30 个源码／测试／既有回执／SDK 输入指纹全部匹配机器回执；77 个本地文件链接无缺失，新增引用的 D20 历史锚点存在。D22 及其三个局部叶完成，D8／D20／D21b 均保持未勾选；证据不含合成秘密标记或凭据样例。

工具异常单独记账：Context Mode 子进程找不到 rg／pnpm，相关命令未启动，首次测试命令没有执行测试；一次探索误用点号测试文件名。核实既有宿主入口及目录清单后改用可用路径，未改包管理环境。没有未预期测试断言失败，未据此归责 SDK。大输出已过滤，只保存合成安全字段与统计。

## 下一次真实响应需要回答的问题

**唯一核心问题：在确认 D21 观察器及当前依赖已经进入目标后，新正式请求若再失败，Provider returned error 究竟来自哪个 HTTP／SSE 边界？** 不要求新提交匹配 D20 摘要，不用不受控线上两次结果判断 SDK 补丁因果。

以下只是下一阶段方案，本轮不执行，也不恢复冻结调用：

1. 由原移动端任务解除三条跨层引用，再取得边界门禁通过；另在获准范围内核查原 capabilities 502 的实际目标／中间代理路径。不能把这两个前置当成 Provider 根因，也不能用豁免代替修复。
2. 核对实际待部署源码／构建／SDK 包输入、research V2 路由和 D21 请求／响应／流／模型绑定模块。只走 infra 正式入口，选择最小 thesis-ledger 目标：符合代码快更条件且兼容预检通过才用 sync-code.sh；环境、依赖或运行时条件要求完整更新时用 update.sh，不放宽快更门禁。快更不证明镜像持久化；正式发布与重建反读仍保留。
3. 明确新增授权为最多一次正式模型请求、总费用 0 元，不能把余 8 次当自动重试额度。用途验证与直连同样计模型调用；不得先另发探针。调用前核对免费定价／既有预算约束、实际配置、全局关闭基线和 canCreate，并准备官方关闭入口、参数及原数据／旧 AI／17 表原行／来源／20 路由／环境／挂载保护对照；普通更新继续保留数据。
4. 新提交走正常业务准备和冻结，核对本次冻结输入与最终序列化请求一致，记录本次新摘要；不改旧失败任务，不直接写库重放。D20 同体离线重建仍只认 D20 原指纹。模型标识 openrouter/free 不保证与 D20 或 D19 路由到同一实际模型。
5. 请求后只读取已授权的安全字段：本次 request／run／submission、请求摘要／attempts、包版本、code／phase／summary／externalResult、httpResponse.status／contentType／bodyBytes、SSE 统计、bodyComplete／bodyTruncated、error.origin／code／category／有界 upstream 分类、两层帧／正文／推理计数、实际模型／结束原因／用量／费用在存在时的事实。缺失保持未知，不保存原始 Prompt、正文、推理、凭据或错误全文。

| 一次请求的实际结果                      | 处理方式                                                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 非成功 HTTP＋http_body 错误，0 帧       | 归入 A 路径，依据安全上游分类确定那次失败的边界；仍不补造 D20 原响应。结果失败／unknown 用量费用照实保留，不自动重试。                                                       |
| HTTP 200＋sse_error，兼容层已计帧       | 归入标准上游流错误；实际 HTTP 状态与 SDK 等价状态分别解释。先停止发送，不能靠换模型／参数制造通过。                                                                          |
| HTTP 200＋原始事件但 0 兼容层帧         | 结合 invalidJsonEvents、oversizeEvents、DONE／不完整事件及已有错误类别区分语法、SDK 合同或未完成事件。只在足够证据支持时构造新的本地反例；证据不足就记录缺口，不盲改解析器。 |
| 已确认观察器生效，但没有 httpResponse   | 仅归入观察边界未得到 Response；不推断上游未生成或费用为 0。停止继续请求。                                                                                                    |
| bodyComplete=false，或 EOF 但无正常结束 | 区分读取失败与协议未完成；保持 unknown 外部结果／费用，不因状态分类更细改为未生成。                                                                                          |
| 正式成功                                | 继续同一正式产物的完整 V2、全部引用归属／历史、发布及重建后反读；单次成功不能证明 D20 根因。缺少实际费用时仍未知。                                                           |

首次真实失败后立即停止一切进一步模型发送，但官方安全关闭及数据保护核对必须完成；成功分支最终也恢复关闭 V2 并核对原保护。只有原正式报告、引用／历史、发布反读和关闭保全全部验收后才可完成 G3。

已确定的是本地路径和可重复的场景差异；A／E2 仍只是 D20 候选解释。本轮使下一次响应能按预先验证的字段分支定位，避免再次猜因后上线试错。D20 实际 HTTP／原响应、实际模型／结束原因／用量／费用，以及未来上游是否恢复，仍必须依赖获准的真实响应和正式业务验收，不能由合成矩阵补齐。
