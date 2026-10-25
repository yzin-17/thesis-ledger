# G3-D33：固定 Nvidia 模型并关闭推理的单次对照

日期：2026-10-25。对应[规格 RSP16](../../specs/2026-10-18-research-evidence-evolution.md)与[原任务 G3-D33](../2026-10-18-research-evidence-evolution.md)。基线为[D30](2026-10-25-g3-upstream-trace-acceptance.md)，参数依据见[D31](2026-10-25-g3-request-parameter-audit.md)。

## 结论与停止状态

独立授权的 **1 次请求已实际派发，无重试，余 4 次冻结**。指定模型和关闭推理均得到请求记录及 OpenRouter 生成记录支持，费用为 0。客户端诊断失败：HTTP 200 后，SDK 未在 30 秒内收到首个语义输出 chunk，报 `TimeoutError: First chunk timeout of 30000ms exceeded`，随后响应读取中断。本地 trace 没有收到正文、usage 帧或结束帧。

用户随后从 OpenRouter 控制台粘贴了同一 generation 的完整正文，补齐上游输出证据。离线检查确认：合法 JSON、当次 wire JSON Schema 通过，业务 Zod 因 `nextSteps[1].claimId` 引用失效条件而非断言被拒绝；同版本 SDK 合成流探针返回 `schema_invalid`，外部调用 0。本次上游两字符现象没有重现，但正文仍不是业务可接受结果；没有把控制台补证回填成原 trace 已收到的响应。

只读查询该 generation 的结果显示，上游记录最终为 `stop`、`cancelled=false`，原生输出 2,155 token、推理 0 token、生成耗时及 latency 均为 45,445 ms、`total_cost=0`。这与客户端在 30 秒首 chunk 超时后停止读取是两个层面的事实：本次本地错误来自 SDK 超时；上游记录没有将该生成标为取消或错误。元数据没有正文，不能用 token 数推定内容有效。

V2 全程关闭，未临时开启，也未部署或重建。未修改默认配置或业务数据；本次为宿主诊断回放，不创建 AiRun 或研究报告。

## 请求控制与执行环境

复用 D30 已冻结的 messages 和 Schema，经相同编译版本的 `AiSdkGenerationAdapter` 及独立 HTTP trace 发送。在原生 fetch 之前，对完整 JSON 请求体进行深比较；仅允许 `model` 固定和新增 `reasoning` 两处变化。单次文件锁、发送计数与 `redirect=error` 防止重复派发或跟随重定向。

| 项目 | D30 基线 | 本次实际请求 |
| --- | --- | --- |
| 请求模型 | `openrouter/free`，实际为 Nvidia Nemotron 3.5 Super VL | `nvidia/nemotron-3.5-super-vl-20261015:free` |
| 实际模型／Provider | Nvidia Nemotron 3.5 Super VL／Nvidia | generation 元数据确认上述 canonical 模型／Nvidia |
| `stop` | 未发送 | 未发送 |
| `max_tokens` | `20000` | `20000` |
| `reasoning` | 未发送 | `{"enabled":false}` |
| `response_format` | `json_schema`、`name=response`、`strict=true` | 整个对象逐字段相同 |
| messages／其余 JSON 字段 | D30 原冻结输入 | 逐字段相同 |
| 首 chunk／chunk 超时 | 30,000／30,000 ms | 保持 30,000／30,000 ms |
| SDK 总超时 | 299,962 ms，为原执行预算剩余值 | 300,000 ms，独立诊断总预算；未触及 |

本次 wire 请求 22,574 字节，SHA-256 为 `731cefc28a710ca4553a45bc0e046fa00c8175defff3cc2c5ad73490380d109f`。messages SHA-256 为 `f8c9768fcd99c143bf9fada332a5c02006304c6c6049b76774b07e38827d43d4`；完整 `response_format` SHA-256 为 `5dc11c1172ea082b7b9baad824e519217517d5bf3cd6f0387f3430d440713548`，均与冻结基线相同。Schema 本体仍为 8,671 字节，SHA-256 为 `a187946ebc719e5cf3797a2bab282c3564b721a28127bcd6ca3b9aa79b73ec34`；没有在对照中修复 D32。

离线 SDK 探针通过完整 generation 样例，外部模型请求为 0；`stop` 和限额漂移反例均被拒绝。46 项执行源码及宿主编译产物匹配 D30，SDK 为 `ai@7.0.107`、`@ai-sdk/openai-compatible@3.0.53`、`@ai-sdk/provider-utils@5.0.45`、`zod@4.4.3`。宿主 Node 为 24.18.0，目标为 24.21.0；该补丁版本与宿主网络执行环境差异保留为对照限制，不能把本次当作目标 Worker 的业务验收。

发出前及准备阶段均只读核对 canonical 免费端点：当时仅 Nvidia，prompt／completion 价格均为 0，声明支持 `reasoning`、`max_tokens`、`response_format` 和 `structured_outputs`，最大输出 131,072 token。端点声明不证明内部约束解码实现。

## 本地 trace 与上游记录

| 身份 | 值 |
| --- | --- |
| 独立诊断 run | `a4c1a658-3ab4-4f95-9cb9-b96835443ed2`，未写入业务库 |
| trace | `7a98b353-fe89-4112-b91c-58fdec8b6170`，attempt 1 |
| generation | `gen-1792932035-WFlQDdUAzt4J9NXx36mU` |
| trace 开始／结束 | `2026-10-25T12:40:34.403Z`／`2026-10-25T12:41:05.913Z`，相差 31,510 ms |
| 本地结果 | `failed`／`cancelled`；`captureStatus=incomplete`，issue=`response_read_error` |

HTTP 状态为 200，`content-type=text/event-stream`。读取中断前观察到 1,775 字节，wire 摘要为 `6af66fb300147ba9e17d6a555fe0cb4ad84b3072f159170d34ded676ebf99499`；保存的解析摘要为 `payloads=[]`、`invalidJson=0`、`done=false`，assistant 正文 0 字节，未提取到 SSE 模型、generation 或错误 payload。generation ID 来自响应头 `x-generation-id`。未触发产物大小截断，但网络响应确实未读完；两者不混同。

原错误链为 `AiSdkGenerationError → AiSdkGenerationError → AbortError`，消息均指向 30 秒首 chunk 超时。应用 `timeoutFor` 将 `firstChunkMs` 原样交给 SDK；安装版本的 `stream-text.ts` 在 Provider 流开始后设置计时，只在首个语义输出 chunk 到来时清除，因此 HTTP 头和未形成语义输出的数据不能解除该超时。本次没有发生 JSON 解析或 Zod 校验失败，尚未取得可供验证的正文。

请求结束后只读调用 `GET /api/v1/generation?id=gen-1792932035-WFlQDdUAzt4J9NXx36mU`，HTTP 200；没有新增模型请求。生成记录于 `2026-10-25T12:46:25.090Z` 反读：

| 上游字段 | 值 |
| --- | --- |
| `model` | `nvidia/nemotron-3.5-super-vl-20261015:free` |
| `provider_name` | `Nvidia` |
| `created_at` | `2026-10-25T12:40:34.886Z` |
| `streamed`／`cancelled` | `true`／`false` |
| `finish_reason`／`native_finish_reason` | `stop`／`stop` |
| `generation_time`／`latency` | `45445`／`45445` ms |
| `native_tokens_prompt`／`native_tokens_completion` | `5601`／`2155` |
| `native_tokens_reasoning` | `0` |
| `tokens_prompt`／`tokens_completion` | `3262`／`1590`，与原生计数口径分开 |
| `total_cost`／`usage` | `0`／`0` |

费用结论来自该生成记录，不来自正文缺失时的 SDK usage。SDK 自身 usage 仍为 unknown；没有业务持久化估价。

## 控制台正文补证与离线校验

用户粘贴的 OpenRouter prompt、completion 及 generation data 明确归属于 `gen-1792932035-WFlQDdUAzt4J9NXx36mU`，与本地响应头及只读 API 一致；控制台另给出 request ID `req-1792932035-QN6naLpDFkBvgq7RaNlx`、Provider 响应 ID `chatcmpl-003cc789-9696-42ae-8b7c-65d84cffe9f4`、Nvidia 状态 200。没有额外读取或生成请求。

completion 原样内容保存在私有 `console-completion.json`；本地排版产物 6,359 字节，SHA-256 为 `e4cb10f6f9206205b596fcc7dcd6a17ea7455b4cdb2b3796f19f43e0941ef33a`，规范 JSON 摘要为 `3df08d362c435941308184be9a206a93089a4a1a98e5ba1ff673383f12ef1ffb`。这些是粘贴内容的本地摘要，不能当作原 SSE／wire 字节摘要。未独立保存并重算用户粘贴 prompt；本次发送输入的逐字段一致性仍由派发时门禁证明。

`console-proof.mjs` 在 `2026-10-25T12:57:53.083Z` 完成离线核验，结果保存在 `console-proof.json`：

| 校验层 | 结果 |
| --- | --- |
| JSON 语法 | 通过，完整对象，不再是 D30 的 `{"` |
| 当次实际发送的 Draft-07 JSON Schema | Ajv 8.20.0／ajv-formats 3.0.1 通过；完整既有样例正向对照通过；保留原 D32 tuple 警告 |
| 同版本业务 `researchGenerationV2Contract.schema` | 拒绝；唯一报告问题为“研究动作引用不存在的断言” |
| 对应字段 | `nextSteps[1].claimId = "ic-price-baseline-missing"`；该 id 仅存在于 `invalidationConditions`，不在 `claims` |
| 同版本 SDK 离线合成 SSE | 拒绝，`AiSdkGenerationError`／`schema_invalid`／`phase=validation`，诊断分类 `no_object` |
| 外部请求与原证据 | 外部模型 0，业务写入 0；46 项源码与原 trace manifest 摘要未变，原 captureStatus 仍为 incomplete，余 4 次冻结 |

离线 SDK 探针将这份 JSON 包装为立即完整返回的合成 SSE，仅验证同版本解析／校验行为；合成流的 token 值为测试占位，不能代作真实 usage、时序或网络回放。本次实际在线错误保持 `cancelled`／首 chunk 超时，没有将其追认成在线已发生的 `schema_invalid`。

该引用关系由业务 Zod 的 `superRefine` 检查；当次 JSON Schema 未表达动态 `claims` id 的成员关系。因此，正文通过 JSON Schema、却未通过 Zod 的事实不证明 Provider 违反结构化输出约束，也不归入 D32 的 tuple 长度序列化缺口。

内容另有人工复核问题：`(1335-1318.49)/1318.49×100 ≈ 1.252190005%`，保留两位小数应为 `1.25%`，而 rationale 写作 `1.26%`；另一处 `1.252%` 为合理近似。派生涨幅只出现在自由文本，`numericClaims` 仅登记 `/price=1335`，没有对应 derived 项；两条 `price-direction` 的 `tradingDays=5` 也只由当日现价／前收关系解释，不能据此核验五个交易日方向。这些属于内容与合同表达风险，不冒充当前代码已自动拒绝的额外错误；现有数字校验明确不保证验证全部自由文本。

## 对照判读与剩余缺口

已证实本次发出了 `reasoning.enabled=false`，上游记录推理 token 从 D30 的 10,103 降为 0，原生输入仍为 5,601，完成 token 从 10,106 变为 2,155。实际模型、输入、严格输出合同和 20,000 上限按控制保持。

控制台补证确认本次上游生成了完整 JSON，两字符现象在这一次没有重现；这支持继续核查推理与结构化生成的兼容性，但单次对照、模型路由固定及宿主环境差异仍不足以证明 D30 的具体根因，也不能区分 Nvidia 内部停止、约束解码与 OpenRouter 转发／映射。业务 Zod 引用错误依然阻止报告接受。D31 的上游转发及内部终止原因仍未知，D32 的 tuple 约束缺口保持原待办。

SDK 首 chunk 超时是本次在线诊断失败的已知直接原因；上游为何在客户端期限内没有给出语义输出尚不确定。控制台补证与离线解析不替代完整在线接收／业务成功验收。未调整超时、未改 Schema 或生成正文、未重新取样；后续在线验收若需要新的真实请求，必须另获授权，当前余 4 次继续冻结。

## 保全与可复核输入

只读前后审计确认：22 张受保护表及全部旧行摘要一致，AiRun 仍为 10、AiToolCall 仍为 110，原提交数与旧 AI 记录保持；Provider、路由、DSA 控制及准入、环境、容器身份与挂载均保持。Server 明确 `AI_RESEARCH_V2_WRITES_ENABLED=false`，Worker 沿用原容器且该变量未配置，无临时策略；`capabilities` HTTP 200／`canCreate=false`，pending=0。原默认 `openrouter / openrouter/free`、修订 5 不变。

私有 trace 的 9 份产物合计 82,047 字节经 `AiTraceFileStore.read` 反读并核对长度／摘要；manifest SHA-256 为 `f6678854e3f3097104a7a32704b2d6b9f243afd9f3a4dafa18229b39343eeacf`。这只证明现存文件完整性，响应捕获仍为 incomplete，未执行容器重建验收。业务节点均 skipped，未冒充业务执行成功。

私有目录为 `.recovery-artifacts/g3-d33-20261025/`，保留原锁和验收包。核验输入包括 `plan.json`、`dispatched.json`、`outcome.json`、`generation-metadata.json`、`endpoint-live-preflight.json`、`module-proof.json`、`before.json`／`after.json`、`protection-proof.json`、`before-workspace-proof.json`／`closed-workspace-proof.json` 及 `ai-traces/<trace>/<diagnostic-run>/attempt-1/trace.json`。原派发脚本与 46 项执行源码摘要再次核对未变；后验检查使用独立脚本，没有修改原发送机制或再次调用它。

核验命令：

```text
node --check .recovery-artifacts/g3-d33-20261025/postflight.mjs
node .recovery-artifacts/g3-d33-20261025/postflight.mjs metadata
node .recovery-artifacts/g3-d33-20261025/postflight.mjs protection
node .recovery-artifacts/g3-d33-20261025/workspace-proof.mjs closed
node --check .recovery-artifacts/g3-d33-20261025/console-proof.mjs
node .recovery-artifacts/g3-d33-20261025/console-proof.mjs
```

离线与实际派发命令的原始回执另存私有验收包；单次锁已占用，不能为复核而重复派发。三仓 HEAD、配置文件摘要和空暂存区核对，保留既有 WIP 与并行验收包；未 stage、commit、push 或清理。

收尾 WIP 快照时间为 `2026-10-25T12:49:37.074Z`：主仓／infra／DSA 分别 1,557／113／8,470 项，均无丢失文件、暂存项为 0，HEAD 与配置摘要保持。infra 与 DSA 的既有 WIP 字节未变；主仓新增本回执并更新配套 Spec／Task，同时观察到并行移动端发布工作对 `.github/workflows/mobile-release-prepare.yml`、`.gitignore`、`apps/mobile/config/signing.env.example`、`scripts/mobile-release.mjs`、`scripts/mobile-release/cli.test.mjs` 的变化，均保留，未由本任务回滚或覆盖。不能将整个并行工作区声称为逐字节未变。
