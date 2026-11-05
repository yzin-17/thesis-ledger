# G3 两字符正文的实际参数核对

对应原[Spec](../../specs/2026-10-18-research-evidence-evolution.md) G3-RSP14和[Task](../2026-10-18-research-evidence-evolution.md) G3-D31。核对对象是[D30](2026-10-25-g3-upstream-trace-acceptance.md)的 `gen-1792927272-omeYVrkNHMa82RzHGRp6`，本轮无模型调用、部署、配置或业务数据修改，余5次冻结。

## 原请求实际值

以下来自已捕获的HTTP请求JSON，紧凑序列化为22517字节，SHA-256=`0e5a2a2762f96beea508486f4fa248105713249f202e942b8b1834745e1b6d1f`，与D30派发诊断完全相同。“未发送”表示键不存在，不是显式发送null。

| 参数 | 实际发送 |
| --- | --- |
| `stop` | 未发送 |
| `max_tokens` | `20000`；没有另发`max_completion_tokens`或`max_output_tokens` |
| `reasoning` | 未发送 |
| `reasoning_effort`／`include_reasoning` | 均未发送 |
| `thinking_token_budget`／`chat_template_kwargs` | 均未发送 |
| `response_format` | `type=json_schema`、`json_schema.name=response`、`strict=true` |
| Schema | Draft-07，8671字节，SHA-256=`a187946ebc719e5cf3797a2bab282c3564b721a28127bcd6ca3b9aa79b73ec34` |
| `provider` | `require_parameters=true` |
| `debug` | 未发送，因此没有该次OpenRouter转发体回显 |

SDK输入为`native_schema/stream`、`maxOutputTokens=20000`、`maxRetries=0`，totalMs=299962、firstChunkMs=30000、chunkMs=30000。实际包`@ai-sdk/openai-compatible@3.0.53`的`getArgs`将`maxOutputTokens`映射到`max_tokens`，将未定义的`stopSequences`映射为未序列化的`stop`；原请求体只有model、max_tokens、response_format、messages、stream、stream_options和provider七个顶层键，没有额外参数注入。

两条消息分别为system／user，没有assistant预填充；消息中未发现`<think>`／`</think>`、`<|im_end|>`、`<|endoftext|>`等检查项。SDK前独立提取、脱敏SSE重组和SDK文本均为同样的2字节 `{"`。请求约118秒后完整EOF／DONE，错误链为JSON解析失败；不是本地timeout或取消收敛。

## 官方默认与端点声明

[Nvidia NIM 2.0.13文档](https://docs.nvidia.com/nim/large-language-models/2.0.13/get-started/advanced/get-started-nemotron-3.5-super-vl.html#control-reasoning)说明此模型默认开启推理，省略effort时使用完整推理。本次本地没有覆盖推理设置，且上游自报10103个reasoning token，确认实际有推理；OpenRouter最终转发的具体effort仍不可见，不能把NIM文档当作托管端点版本证明。

12:19:49 UTC读取的[OpenRouter免费端点元数据](https://openrouter.ai/api/v1/models/nvidia/nemotron-3.5-super-vl%3Afree/endpoints)对应Nvidia／canonical `nvidia/nemotron-3.5-super-vl-20261015:free`，声明支持reasoning、include_reasoning、max_tokens、response_format和structured_outputs，`max_completion_tokens=131072`。这是调查时的能力声明，不是D30转发到Nvidia的请求记录。

本次原响应completion=10106、reasoning=10103，低于本地请求20000；两个终止帧的`finish_reason`和`native_finish_reason`均为stop，没有`stop_reason`字段。因此没有证据支持“本地20k限额用尽”或“客户端显式停止序列截断”。同样，支持结构化输出的声明和HTTP200不能证明该次严格解码实际生效。

## 离线Schema与转换检查

原Schema通过Draft-07元Schema检查；使用现有`ajv@8.20.0/ajv-formats@3.0.1`，项目完整generation样例通过，未发现Schema整体无解。原fixture SHA-256=`8b6f4357e7d357a94b21938e5578c4aa354574eab0638ee20eb0987c7dbd676c`。SDK输入的独立Zod快照是Draft2020-12，wire是SDK生成的Draft-07，不能把两种快照的摘要差异直接认作报文丢失。

Ajv额外严格检查指出`numericClaims.items.oneOf[1].properties.operands`为缺少长度边界的2项tuple；在保留该警告的语义验证中，原Schema和完整样例有效。该Ajv检查选项没有修改应用校验或原Schema，和Provider的`strict=true`不是同一开关。

| operands长度 | 原wire JSON Schema接受 | 业务Zod接受 |
| --- | --- | --- |
| 0 | 是 | 否 |
| 1 | 是 | 否 |
| 2 | 是 | 是 |
| 3 | 是 | 否 |

这确认了一个独立的序列化语义缺口，由G3-D32登记：native Schema约束比业务Zod宽。它不会使Schema无解，不能解释D30只有两字符，也不能回填D25未知字段原因；本轮未修补Schema或放宽业务规则。

## 候选机制与证据缺口

找到[vLLM问题37362](https://github.com/vllm-project/vllm/issues/37362)：报告者使用vLLM 0.17.2rc1、离线`LLM.generate`、Nemotron 3 Nano 30B、Guidance后端及`nemotron_v3`推理解析器；推理与JSON约束同时启用时，可见输出只有`{`。这是相似症状的候选机制。该issue因过期自动关闭、state_reason=not_planned，评论仅有机器人通知，没有已证实修复信息。

该报告恰好生成8192个token，等于其max_tokens=8192；本次是10106／20000且native_finish_reason=stop，终止情况也不同。本次为Super VL托管Chat Completions，尚无Nvidia实际服务版本、结构化后端或推理解析器配置，不能将该离线Nano报告当作本次根因。

目前定位到的最早异常边界仍是OpenRouter→本地HTTP：完整流中的最终content只有 `{"`，之后SDK正常报告JSON无效。真正触发上游stop的内部原因未确认。确证缺少以下数据：

1. OpenRouter实际转发给Nvidia的请求，尤其stop、有效max_tokens、reasoning／effort及response_format是否保留或改写。
2. Nvidia原始终止详情：EOS／stop token／stop sequence、内部token或时间限额、原始stop_reason。
3. 当次服务版本、JSON约束后端与推理解析器配置。

定位标识为OpenRouter请求`req-1792927272-aBdyMvGLxZ3hvtCdC7Wq`、Nvidia请求`chatcmpl-d85ebf57-e2fe-4f6a-b0a2-3ecc419c5778`、generation ID如上。控制台该次I/O日志未启用；本次wire也没有[OpenRouter转发请求回显选项](https://openrouter.ai/docs/api_reference/overview)，不能从现有元数据补造上述字段。可先按这些标识向服务方核对历史数据，不必先消耗模型次数；本轮未向外发送消息。

## 可复核证明

[私有参数与离线证明](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/g3-d31-20261025/parameter-proof.json)保存字段存在性、原请求摘要、Schema验证、tuple反例、两帧终止信息和只读端点元数据。执行入口为同目录`parameter-audit.mjs`，只允许读取原捕获及公开端点GET，不发模型请求。46项执行源码指纹与D30保持；原模型、Schema、推理默认和V2关闭状态不变，余5次冻结，无stage／commit。
