# G3 Cloudflare 单次对照记录

关联：[研究演进 Task](../2026-10-18-research-evidence-evolution.md)（G3-D37）。

> 后续 D38 已按用户“使用上游默认上限”及“再验证一次”授权执行：实际请求省略输出上限，HTTP200 后原始 body 为 0 字节，没有 SSE 结束帧，SDK 报响应流无结束原因。唯一请求后停止，当前余量为 0；详见[D38 回执](2026-10-26-g3-cloudflare-default-limit-control.md)。下文 D37 的“余 1 次”是该轮结束时的历史余额。

## 当前状态与授权边界

用户要求使用 Cloudflare 验证 G3，并明确确认账户为“Workers Free（超额拒绝，不产生付费超额）”。本次唯一 `@cf/zai-org/glm-4.7-flash` 请求已执行，失败后停止，没有补发；消耗 1/1，余 1 次冻结。复用 D36 冻结材料及严格 Schema；使用此前已保存三款模型中的第一款，不改变目标配置。

结果为 HTTP 200、完整 SSE／stop／DONE，但上游正文为 0 字节、报告输出 token 为 0；SDK 原样收到空文本并报 `schema_invalid / empty`。本次没有复现 Nvidia 的两个字符，而是未获得任何正文，G3 正向仍未通过。

后续沿 trace 查到相关的已知兼容问题：Cloudflare 官方维护的客户端针对 GLM-4.7-Flash 明确记录 `max_tokens` 会导致空内容，厂商实测 3/3，并在发送前移除此字段；D37 实际请求恰好包含 `max_tokens=20000`。D37 结束时尚无同账户调整字段后的在线因果对照；后续 D38 已按用户选择省略字段并执行一次，仍失败，不能将该字段认定为唯一根因或写成修复验收通过。

Cloudflare Provider 当前停用且没有已验证研究用途；因此本次为同一 SDK 的冻结输入对照及只读业务校验重放，不自动启用 Provider、保存用途、修改默认研究设置或创建新的业务报告。V2 始终保持关闭，不部署、不写业务数据，不 stage／commit，保留原 WIP 与验收包。即使对照输出通过，也不替代正式 G3 报告、引用、历史与 Web 消费验收。

## 已完成的准备

- 从 D36 完整 trace 读取原 SDK 输入和实际 HTTP 请求。保持原 messages 字节、严格 `response_format`／Schema、`max_tokens=20000`、无 `stop`、无显式 `reasoning`、stream=true 和 SDK 重试 0。连接及模型改为 Cloudflare，通用协议不发送 OpenRouter 专属 `provider` 参数。
- 离线受控 SSE 通过当前真实 SDK 与 V2 Schema，外部模型调用为 0；请求 guard 拒绝参数漂移及第二次派发。准备阶段发现数据库 JSONB 的对象键序与原消息字符串不同，已改为对重建材料做语义一致性校验；实际待发 HTTP messages 仍逐字节等于原 trace，不重建或改写原消息。
- 当前默认 `openrouter/free`／设置修订 `5`、V2=false、capabilities 的 `canCreate=false`、pending=0。22 张保护表及环境、容器基线已保存。
- 宿主与目标双角色的实际 Server／Schemas／domain／shared 完整编译目录逐文件一致，分别为 2,058／582／243／3 个文件（含声明、映射及历史编译文件）；没有按源码投影丢弃实际包内容。初检沿用旧镜像过滤方式，误报历史编译文件为额外项，失败记录保留；修正清单读取方式后双方完整目录一致，未修改或忽略运行文件。宿主 Node 为 24.18.0，两个目标角色为 24.21.0；本次 SDK 对照在宿主执行，记录该环境差异，不冒充容器内正式任务。

## 零费用边界

Cloudflare 官方说明 GLM-4.7-Flash 可在 Workers Free 使用；每日有 10,000 Neurons 免费额度，Workers Paid 超出该额度后计费。[免费模型范围](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/)、[计价规则](https://developers.cloudflare.com/workers-ai/platform/pricing/)

当前凭据只读访问账户订阅接口返回 HTTP 403／错误码 10000，不能据此判断 Workers Free／Paid 或剩余额度；这不是模型推理接口的失败。用户随后确认 Workers Free，才执行本次唯一请求。零付费依据为用户确认的套餐边界；上游另报告消耗 21.131 Neurons，不能把免费额度消耗说成未消耗资源，也没有读取到账单金额。

`20000` 是原请求的输出 token 预算，并非 Neurons。Cloudflare 当前计价表列出该模型每百万输入／输出 token 分别折算 5,500／36,400 Neurons；20,000 个实际输出 token 约为 728 Neurons，另加输入。D37 的 3,842 个输入 token 按输入率计算为 21.131 Neurons，与实际报告一致。省略输出上限不改变每日 Neurons 额度；上游默认输出上限的具体值尚未确认，不把上下文容量当作默认输出值。[官方换算表](https://developers.cloudflare.com/workers-ai/platform/pricing/)

## 实际请求与上游响应

| 项目 | 实际值与来源 |
| --- | --- |
| 模型 | `@cf/zai-org/glm-4.7-flash`，响应模型与请求一致 |
| trace | `bf0343bc-cb28-46e8-a3b2-7bc91676da78`，完整捕获、无 issue |
| 上游 ID | `id-1793011960354` |
| 本地开始／结束 | `2026-10-26T10:52:39.313Z`／`10:52:44.116Z`，耗时 4,803 ms |
| 实际 HTTP | 200，`text/event-stream`，EOF，644 字节，未截断 |
| SSE | 两条相同的终止／用量帧及 DONE；`delta={}`、`finish_reason=stop` |
| 上游用量 | 输入 3,842、输出 0、Neurons 21.131；两条重复帧按一次累计值记账，不相加 |
| 正文 | 独立组装／保存正文／SDK 文本均为 0 字节；SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| SDK 结果 | `schema_invalid`，phase=`validation`、jsonStatus=`empty`、finishReason=`stop` |
| 请求参数 | `max_tokens=20000`，无 `stop`／显式 `reasoning`，严格 `json_schema` 保持 |
| 超时／重试 | 总／首输出／空闲均为 299,910 ms，SDK 重试 0，native fetch 1 次；没有触发超时或取消 |

上游响应的关键内容如下，第二条相同帧省略：

```json
{
  "model": "@cf/zai-org/glm-4.7-flash",
  "choices": [{ "index": 0, "delta": {}, "finish_reason": "stop" }],
  "usage": {
    "prompt_tokens": 3842,
    "completion_tokens": 0,
    "total_tokens": 3842,
    "neurons": 21.131
  }
}
```

[响应分层核对](../../../.recovery-artifacts/g3-d37-20261026/response-proof.json)确认：原始帧未提供正文，上游没有 error 帧，三方文本完全相同。将保存的实际 SSE payload 在禁止网络的环境中输入同一 SDK，仍得到 `schema_invalid / empty`，新增模型调用 0。因此本次空文本在 HTTP 响应边界已经存在，不能归因为 SDK 丢弃正文或超时。

[离线 Schema 核对](../../../.recovery-artifacts/g3-d37-20261026/schema-proof.json)使用实际同摘要的 Draft-07 Schema：AJV 可验证 Schema 本身，已知有效样例同时通过 wire Schema 与业务 Zod。AJV 另给出 `numericClaims` 派生项 `operands` 元组边界的 strict 告警，原样记录；不能将它当作本次空输出原因已确证。该结果不证明 Cloudflare 的结构化输出实现支持全部约束，也没有确定供应商内部为何立即 stop。与 D36 使用不同 Provider／模型、通用扩展及宿主环境，不能据此确诊 Nvidia 两字符的内部原因。

## 保护反读与验收结论

[最终保护记录](../../../.recovery-artifacts/g3-d37-20261026/protection-proof.json)通过：22 张表及旧 AI／工具记录整体不变，没有创建新的 AiRun、报告或业务结果；Provider、原三款模型、凭据、默认 `openrouter/free`／修订 5、环境、容器和挂载保持。V2=false、capabilities 的 canCreate=false。三仓 HEAD 保持、暂存数均为 0，主仓 1,153 个非文档既有 WIP 摘要反读未变，未 stage／commit。

首次保护脚本直接比较容器 JSON，因 Docker 返回的挂载数组顺序不同而失败；原失败日志保留。后续按 destination 排序并逐项比较，挂载值及其他容器字段完全一致，没有忽略字段、改变挂载或重启容器。11 份 trace 产物完整性反读通过；本次没有部署或容器重建验收，不替代此前 D30／D36 的重建证据。

- [x] Workers Free 边界确认、冻结输入 guard、唯一请求及失败停止。
- [x] HTTP、SSE、保存文本与 SDK 空输出分层核对，实际响应离线重放与 Schema 独立验证。
- [x] 配置、数据、默认值、运行态、调用预算及 WIP 保护反读。
- [ ] 合法研究对象及正式 G3 报告／引用／历史／Web 正向消费；本次没有生成正文。

私有原始记录保存在 `.recovery-artifacts/g3-d37-20261026/`，包含套餐确认、`plan.json`、离线与模块预检、`ai-traces/`、响应和 Schema 证明、调用锁及最终保护记录。D37 失败后本轮没有追加模型调用；该轮结束时余 1 次冻结，后续 D38 另获一次授权并已用完。

## 继续定位：输出上限参数映射

这部分为用户要求继续查因后的只读核对，没有追加模型请求或修改 Server／Provider 配置。

| 核对层 | 证据 | 可确认的事实 |
| --- | --- | --- |
| 本次实际 HTTP | `dispatched.json`、完整请求体及响应证明 | 发送 `max_tokens=20000`，没有 `max_completion_tokens`；返回正文 0 字节、输出 0 token |
| 本地 SDK | 已安装 `@ai-sdk/openai-compatible 3.0.53` 的 `src/chat/openai-compatible-chat-language-model.ts:275` | `maxOutputTokens` 固定序列化为 `max_tokens`；不是 trace 丢字段 |
| 第一方已知问题 | [Cloudflare 官方客户端源码第 230—235 行](https://github.com/cloudflare/langchain-cloudflare/blob/main/libs/langchain-cloudflare/langchain_cloudflare/chat_models.py#L230) | 维护者明确注明 GLM-4.7-Flash 携带 `max_tokens` 会得到空内容，已实测 3/3；配置将该字段列为不支持并移除 |
| 第一方发送路径 | [同文件第 945—1000 行](https://github.com/cloudflare/langchain-cloudflare/blob/main/libs/langchain-cloudflare/langchain_cloudflare/chat_models.py#L945)及流式调用点 | 参数过滤先于两种 REST payload 构造，流式调用也执行过滤；不是仅 native run 路径上的提示 |
| 本账户实时接口合同 | 模型 Schema 只读 GET 200，`live-model-schema.json` | `max_tokens` 仍被列为可选但已弃用，推荐 `max_completion_tokens`；两者均不在必填项里 |
| 供应商侧审计读取 | `origin-audit-read.json` | 根据 trace 的 audit ID 及 15 秒时间窗口只读查询，返回 403／10000；没有扩大 Token 权限，也未取得内部执行日志 |

因此，已找到本次请求命中的第一方已知参数问题，不再仅停留在“上游为空”的层级。实时 JSON Schema 的类型检查仍接受弃用字段，不能用“请求通过 Schema”反证该运行时兼容问题不存在。[第一方证据及源码摘要](../../../.recovery-artifacts/g3-d37-20261026/official-compatibility-evidence.json)保留；不将其推广为 Nvidia 或 D20 的根因已确定。

此前 JSON Mode 通用文档提到不支持流式，而实时 GLM 接口合同列出 `stream`，第一方客户端也有流式路径。该文档差异保留为兼容性线索，不单独用来确认本次空输出原因。GLM 实时合同还显示默认开启 thinking；D37 没有显式 reasoning 字段，不等于已关闭推理。

### D38 对照准备与后续结果

用户选择“使用上游默认上限”后，D38 候选从 SDK 输入起省略 `maxOutputTokens`，实际 HTTP 不含 `max_tokens` 或 `max_completion_tokens`，其余字段与 D37 相同，包括材料、严格 Schema、stream、stop 缺省及 reasoning 缺省。准备阶段离线完整 SDK／受控 SSE 通过，序列化请求为 22,469 字节，外部模型调用为 0。随后用户明确要求“再验证一次”，授权最后 1 次实际调用；没有增加 Server 适配或修改 Provider 默认配置。候选与实际调用证明位于 `.recovery-artifacts/g3-d38-default-limit-20261026/`，原改名候选独立保留。

此前只将 `max_tokens:20000` 改名为 `max_completion_tokens:20000` 的方案及离线证明保存在 `.recovery-artifacts/g3-d37-20261026/candidate-token-field-*` 和 `.recovery-artifacts/g3-d38-token-field-20261026/`，本次没有执行。使用上游默认上限的对照具有独立 trace 身份和一次性锁，SDK 重试为 0；派发依据用户新的“再验证一次”授权，没有复用 D37 的授权。

D38 唯一实际请求已执行，HTTP200 后原始 body 为 0 字节、没有 SSE payload／结束原因／DONE，SDK 报 `transport_unknown`，实际响应离线回放得到相同错误。失败后停止，本轮 1/1，当前余额 0；V2 保持关闭，数据、配置及原 WIP 保护通过。移除上限仍失败，不能将 `max_tokens` 认定为唯一根因；完整边界见[D38 回执](2026-10-26-g3-cloudflare-default-limit-control.md)。

### 输出上限字段的来源

`20000` 来自原 G3 冻结业务策略的 `maxOutputTokens`，不是 SDK 或 Cloudflare 要求的必填值；SDK 只是将业务值映射成 HTTP 字段。Cloudflare 实时合同允许省略这两个字段，省略后按上游默认限制生成。两种字段名表示同类的完成输出上限，不应同时发送。

本次按用户选择执行“删除字段”的对照，输出上限由上游默认值决定，不能声称仍在验证同一请求级 20,000 上限。只调整私有诊断请求；业务默认预算、数据及目标配置保持，本次在线对照仍失败，没有修复验收通过的结论。
