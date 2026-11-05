# G3 Cloudflare 网关日志与上游引擎错误核对

关联：[研究演进 Task](../2026-10-18-research-evidence-evolution.md)（G3-D39）、[D38 上游默认上限对照](2026-10-26-g3-cloudflare-default-limit-control.md)。

## 本轮结果

用户要求先查官方文档，打通控制台返回日志后重新请求。本轮新增授权 1 次，已发送唯一 `@cf/zai-org/glm-4.7-flash` 请求并失败停止，余量 0。未发送 `max_tokens` 或 `max_completion_tokens`，请求正文与 D38 完全相同；本次只增加网关及日志请求头。

已从同一条 Cloudflare 控制台记录及日志 API 取得实际上游错误：`InternalServerError`，内部错误码 `500`，错误正文为：

> EngineCore encountered an issue. See stack trace (above) for the root cause.

客户端实际收到 HTTP 200、两条重复的空 stop／用量帧及 DONE，未收到该错误。SDK 随后因空正文无法解析对象而失败。本次明确了 Cloudflare 保存的上游响应已存在引擎错误，且该错误未出现在客户端实际 SSE 中；不能将空输出归因为 SDK 丢失生成正文。具体是哪一段 Cloudflare 转换路径未透传错误、引擎内部为何异常，仍缺少内部堆栈证明。

G3 合法研究对象及正式报告／引用／历史／Web 正向验收仍未通过。本次是宿主同版 SDK 诊断，没有启用 Cloudflare Provider、部署应用或新建正式研究任务。

## 官方文档与实际日志入口

[官方日志文档](https://developers.cloudflare.com/ai-gateway/observability/logging/)说明：控制台入口为 AI Gateway 的日志页，支持保存 prompt、response、模型、状态及用量；请求级 `cf-aig-collect-log` 控制记录，`cf-aig-collect-log-payload` 控制原始请求和响应正文。

[官方入门文档](https://developers.cloudflare.com/ai-gateway/get-started/)及[Workers AI 接入文档](https://developers.cloudflare.com/ai-gateway/usage/providers/workersai/)要求 Workers AI 网关请求携带 `cf-aig-gateway-id`。`default` 在第一次已认证请求时可自动创建；[网关默认配置](https://developers.cloudflare.com/ai-gateway/configuration/manage-gateway/)为认证开启、日志开启、缓存关闭和 Standard billing。

本次实际请求头如下，仅用于私有诊断，没有写入应用 Provider 默认配置：

```text
cf-aig-gateway-id: default
cf-aig-collect-log: true
cf-aig-collect-log-payload: true
```

实际控制台路径为 [AI Gateway → default → 日志](https://dash.cloudflare.com/ea51977afbc61283e74585ba9cbf4630/ai/ai-gateway/gateways/default/logs/ai-gateway-logs)，打开北京时间 **2026-10-26 22:56:44** 的记录，进入“详细信息 → 响应”。响应面板可直接查看上述引擎错误。列表的“成功”对应外层 HTTP 200，不能替代响应正文及业务成功判断。

本账户首次创建网关晚于 2026-09-24，日志采用 Workers Logs；当前控制台显示免费套餐每天 200K events。官方当前说明 Workers Free 日志保留 3 天，实际日志需及时取回保存。[日志计价与保留期](https://developers.cloudflare.com/ai-gateway/reference/pricing/)、[Workers Logs 当前规则](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#pricing)

## 权限及资源变更

初次只读网关列表查询返回 403／10000，模型请求尚未派发。现有 Token 原来具有 `AI Gateway Run`、`Workers AI Edit`、`Workers AI Read`。用户明确授权“允许，仅当前账户”后，在控制台为现有 `stock` Token 增加 `AI Gateway Read`、`AI Gateway Edit`，保留原权限、凭据、到期及 IP 条件，资源精确限定为原有当前账户。原 Key 随后读取网关列表返回 200；没有轮转 Key、修改 `.zshrc` 或改应用加密凭据。

此次唯一请求自动创建 `default` 网关。API 反读确认认证和日志开启、缓存 TTL 为 0、日志分类关闭，Workers AI billing mode 为 `postpaid`，对应文档的 Standard billing。没有升级套餐、充值、配置 Unified billing 或新增 Server 专属适配。

权限授权、控制台摘要及保存后五项权限截图保存在 `.recovery-artifacts/g3-d39-gateway-logs-20261026/`；该外部权限及网关资源变更为本轮已授权的日志前置，应用 Provider 配置保持原值。

## 各层请求和返回证据

| 层次 | 实际事实 |
| --- | --- |
| 本地 trace | `208c0d17-1284-47e1-b2ac-f30047d7e6ca`，完整捕获、issues=0，native fetch=1 |
| 网关日志 ID | `01a178b6-b5c9-770b-b573-19c6505e1483`；响应头、日志 API 及控制台记录一致 |
| 上游生成 ID | `id-1793026604725` |
| 时间 | 本地 `2026-10-26T14:56:41.138Z` 至 `14:56:45.162Z`，4,024 ms；网关记录创建于 `14:56:44.869Z`，网关自身耗时 367 ms |
| 模型 | 请求、网关及实际 SSE 均为 `@cf/zai-org/glm-4.7-flash`；日志 provider=`workers-ai`，未命中缓存 |
| 客户端请求 | 22,469 字节；SHA-256 `f8f0358bd6005e3d7cbefa59ef6b8faa6072876c28ba93d5e6ca1537fa4075af`，与 D38 完全相同 |
| 输出上限及其他参数 | SDK 与 HTTP 均无输出上限；stop／显式 reasoning 缺省，原严格 Schema／材料／stream 保持 |
| 网关上游请求 | `request_head_complete=true`，22,433 字节；除模型由网关单独绑定外，正文各字段与客户端一致，仍无输出上限 |
| 网关上游响应 | `response_head_complete=true`，801 字节；`error.type=InternalServerError`、`error.code=500`，`response=""`；第一条 native streamed_data 含同一错误 |
| 客户端 HTTP／SSE | HTTP 200，644 字节，EOF、未截断；两条相同 `delta={}`／stop／usage 帧及 DONE，无 error 帧，assistant 正文 0 字节 |
| SDK | `No object generated: could not parse the response.`；本次私有控制的错误事实为 `transport_unknown / stream`，reported 输入 3,842／输出 0 |
| 上游用量 | 网关及客户端一致：输入 3,842、输出 0、21.131 Neurons；重复累计帧只记一次 |

日志 API 的 `request`／`response` 字符串为空，但完整 payload 位于 `request_head`／`response_head`，二者 complete 标记均为 true。不能只读空字符串字段就宣告未保存正文。本轮按[官方日志详情 API](https://developers.cloudflare.com/api/resources/ai_gateway/subresources/logs/methods/get/)只读取回，并与控制台响应面板交叉核对。

[响应分层证明](../../../.recovery-artifacts/g3-d39-gateway-logs-20261026/response-proof.json)进一步确认：网关保存的 native 响应包含 EngineCore 500，但 SDK 之前的实际客户端 SSE 已不包含该错误；在禁网环境重放实际 SSE，同版 SDK 复现相同解析错误，新增模型请求 0。不能以网关外层 success=true、HTTP200 或 stop 将此轮标记为研究生成成功，也不能把本轮结论回填成 D37、D38 或 Nvidia 历史请求的确定根因。

## 费用与保护反读

费用边界沿用用户确认的 Workers Free，GLM-4.7-Flash 固定使用该账户的免费额度。日志展示名义用量价格约 `0.000232441 USD`，等于 21.131 Neurons 的公开单位定价；这不是实际账单扣款证明，本轮没有读取到账单。没有升级、充值、启用付费模型或新增日志付费功能。

[保护证明](../../../.recovery-artifacts/g3-d39-gateway-logs-20261026/protection-proof.json)通过：原 22 张表、旧 AI／工具记录、DSA 数据、应用 Provider／默认值、环境、容器及挂载不变；V2=false、canCreate=false、pending=0。三仓 HEAD、空暂存区及 2,347 项原 WIP 状态和已捕获文件摘要保持。本轮只新增私有诊断包、授权的 Cloudflare 网关前置及验收文档，没有 stage／commit。

- [x] 官方文档、仅当前账户权限授权及原 Key 网关 200 预检。
- [x] 无输出上限候选、带日志头的实际控制脚本离线预检及唯一派发。
- [x] 控制台与日志 API 取回原文，关联同一日志 ID，取得 EngineCore 500 及跨层错误未透传证据。
- [x] 实际客户端 SSE 离线回放、数据／配置／V2／WIP 保护反读。
- [ ] 引擎内部触发原因与修复验收；合法研究对象及正式 G3 正向消费。

当前新增授权 1 次已用完，没有自动重试或后续模型调用。控制台保留在本次请求的详细响应处；截图及原始记录位于 `.recovery-artifacts/g3-d39-gateway-logs-20261026/`。
