# G3 Cloudflare Qwen 单变量模型对照

关联：[研究演进 Task](../2026-10-18-research-evidence-evolution.md)（G3-D40、D32）、[D39 网关日志](2026-10-26-g3-cloudflare-gateway-logs.md)。

## 实际结果

用户要求“换个模型试试”，本轮新增单次授权，使用现有 Cloudflare 配置中的 `@cf/qwen/qwen3.8-27b`。实际请求相对 D39 只更换 `model`：材料、严格 `response_format`／Schema、stream、stop 与 reasoning 缺省、上游默认输出上限、网关及正文日志头全部保持。没有添加 `max_tokens` 或 `max_completion_tokens`，没有保存新的默认模型或启用 Provider。

唯一请求返回 HTTP 400／错误码 8006，明确拒绝 `response_format` 中的 Schema 方言：

```text
Unsupported JSON Schema at
/properties/numericClaims/items/oneOf/1/properties/operands:
'items' must be a boolean or an object, not an array.
For tuple validation, use 'prefixItems' instead (JSON Schema Draft 2020-12).
```

这确认了本次 Qwen 请求在结构化输出 Schema 校验阶段被拒绝，未生成研究对象。它不是本轮再次出现 EngineCore 500 的证据；此前 GLM 内部错误是否由同一 Schema 触发，仍未证明。失败后已停止，新增授权 1/1 已用完，余量 0。

## 请求、网关与客户端核对

| 项目 | 实际事实 |
| --- | --- |
| 请求及网关绑定模型 | `@cf/qwen/qwen3.8-27b`；错误响应没有生成模型回显或 generation ID |
| trace | `00cc546d-0d68-4477-930c-9507acd56eff`，完整捕获、issues=0，9 份产物反读通过 |
| 网关日志 ID | `01a178dc-c33b-72f9-b3d6-d4c1b2eb7451`；响应头与日志 API 一致 |
| 上游错误 request ID | `e25d31be-2968-4b9c-8c9f-6176034708d8` |
| 时间 | `2026-10-26T15:38:14.569Z` 至 `15:38:16.878Z`，本地 2,309 ms；网关记录为北京时间 23:38:16，自身耗时 253 ms |
| 请求体 | 22,464 字节；SHA-256 `7fb18766acaa95a2a88a9719344b22552a55bcfa53e1b26da1a841e6c45b3816` |
| 单变量核对 | 去除两轮的 `model` 后，请求体逐字段完全相同；messages 与 response_format 摘要保持 |
| 输出上限 | SDK 与实际 HTTP 均省略，继续使用上游默认值 |
| 网关 | 复用 `default`，认证／正文日志保持，未命中缓存，无权限或网关设置变更 |
| 网关原始错误 | `AiError`，`internalCode=8006`、`httpCode=400`，完整 description 指向 operands 的 tuple 写法 |
| 客户端 | HTTP 400，400 字节 JSON body，EOF、未截断；`errors[0].code=8006`，message 与网关原文相同 |
| SDK | `Bad Request`；本次私有控制的错误事实仍为 `transport_unknown / stream`，完整细节由 trace 与网关保留 |
| 用量 | 网关 token 计数均为 0、cost 为 0、usage_metadata=null；SDK 用量未知，不补填 Neurons 消耗或实际账单 |

[响应分层证明](../../../.recovery-artifacts/g3-d40-qwen-control-20261026/response-proof.json)确认：HTTP body 与网关保存的错误一致；将实际 HTTP 400 JSON 在禁网环境送入同版 SDK，复现相同错误码及摘要，外部模型请求为 0。该错误已在 SDK 之前返回，不能将它解释为模型生成了不合法的研究 JSON。

控制台记录位于 [AI Gateway → default → 日志](https://dash.cloudflare.com/ea51977afbc61283e74585ba9cbf4630/ai/ai-gateway/gateways/default/logs/ai-gateway-logs)，选择 **2026-10-26 23:38:16** 的 Qwen 记录，查看“详细信息 → 响应”。本轮只读 API 已反读完整原文，未修改用户当前浏览页面。

## 已确定的 Schema 问题与修复边界

本次 wire Schema 明确声明 `http://json-schema.org/draft-07/schema#`，拒绝位置的值只有 `type` 与 `items`，其中 `items` 是含两个字段 Schema 的数组，未提供 `prefixItems`。业务所有权位于 `packages/schemas/src/research-result-v2.ts:65`：`operands` 是两个 `fieldValue` 的 Zod tuple。

Draft-07 的 tuple 数组写法不能直接当作对方接受的 Draft 2020-12 输入；新版使用 `prefixItems` 描述按位置校验。[JSON Schema 官方数组说明](https://json-schema.org/understanding-json-schema/reference/array#tupleValidation)与本次上游明确错误一致。此前 D37 的 Draft-07 离线 Schema 验证通过，只证明原方言可验证，不能替代供应商运行时对另一方言的兼容验收。

该位置也关联已登记的 D32：当前 wire Schema 缺少 tuple 的精确长度约束，而业务 Zod 要求恰好两个操作数。因此后续应按通用 Schema 序列化契约修复方言及约束一致性，保留既有业务语义；不能仅机械改名或删除约束后宣告通过，也不应新增 Cloudflare 专属 Server 适配。本轮没有改应用、SDK、业务 Schema 或默认配置，没有继续调用模型。

## 保护、预算与验收范围

使用用户此前确认的 Workers Free 边界，模型目录与[官方模型页](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/)核对完成；没有升级、充值或转用付费套餐。沿用既有 Token 和网关权限，本轮无新增授权范围。

[保护反读](../../../.recovery-artifacts/g3-d40-qwen-control-20261026/protection-proof.json)通过：原 22 张表、旧 AI／工具记录、DSA、应用 Provider／默认值、环境、容器及挂载不变；V2=false、canCreate=false、pending=0。三仓 HEAD、空暂存区及 2,348 项既有 WIP 状态与已捕获文件摘要保持。仅增加私有诊断包及本轮验收文档，没有 stage／commit 或部署。

- [x] 仅更换模型的离线请求核对与实际控制脚本预检。
- [x] 唯一派发、失败停止、网关及客户端 HTTP 400 原文核对。
- [x] 实际错误离线回放、原数据／配置／V2／WIP 保护反读。
- [ ] 通用 Schema 方言与 tuple 约束修复，及后续实际模型验收。
- [ ] 合法研究对象和正式 G3 报告／引用／历史／Web 正向消费。

私有原始记录位于 `.recovery-artifacts/g3-d40-qwen-control-20261026/`。本轮新增授权 1 次已用，SDK 重试 0，无后续模型派发。
