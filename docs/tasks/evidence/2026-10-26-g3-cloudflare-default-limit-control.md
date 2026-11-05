# G3 Cloudflare 上游默认输出上限对照

关联：[研究演进 Task](../2026-10-18-research-evidence-evolution.md)（G3-D38）、[D37 原参数对照](2026-10-26-g3-cloudflare-control.md)。

## 结果与调用边界

用户先选择“使用上游默认上限”，随后明确要求“再验证一次”。本轮使用最后 1 次授权，对 `@cf/zai-org/glm-4.7-flash` 发送唯一请求；SDK 输入不传 `maxOutputTokens`，实际 HTTP 不含 `max_tokens` 或 `max_completion_tokens`。保持 D37 的材料、严格 Schema、流式协议、stop 缺省、reasoning 缺省及零重试。

结果仍失败：HTTP 200／`text/event-stream`，但响应原始 body 为 0 字节，在 2,954 ms 后 EOF；没有任何 SSE payload、`finish_reason` 或 `[DONE]`。SDK 报 `transport_unknown`／phase=`stream`，摘要为 `Response stream ended without a finish reason.`。已停止，没有补发；本轮 1/1，余量为 0。

本次为宿主同版 SDK 的冻结输入诊断，没有启用 Cloudflare Provider、改变默认配置或执行新的正式研究任务。V2 始终关闭，没有生成业务报告。G3 正向验收仍未通过；本轮没有部署或容器重建。

## 请求与响应事实

| 项目 | 实际值 |
| --- | --- |
| 请求模型 | `@cf/zai-org/glm-4.7-flash` |
| 响应模型／generation ID | 未返回，不能从空 body 确认实际执行模型或推理是否完成 |
| trace | `07650e63-9006-47e4-a853-61fb7819dc57` |
| 本地开始／结束 | `2026-10-26T13:57:53.116Z`／`13:57:56.070Z` |
| 实际请求体 | 22,469 字节；SHA-256 `f8f0358bd6005e3d7cbefa59ef6b8faa6072876c28ba93d5e6ca1537fa4075af` |
| 输出上限 | SDK 与实际 HTTP 均省略；上游默认数值未知 |
| 其他请求字段 | 相对 D37 仅删除 `max_tokens`；材料及 `response_format` 摘要完全一致 |
| HTTP／传输 | 200；`text/event-stream`；EOF，未截断；没有触发超时或取消 |
| 原始 body | 0 字节；SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| SSE | 0 条 payload；无结束原因、无 DONE、无结构化上游错误帧 |
| 用量 | 没有返回 token／Neurons 用量，状态为未知，不能填 0 |
| SDK | `transport_unknown`；响应流无结束原因；该错误未保存 `sdkOutputText`，不虚构 SDK 文本摘要 |
| trace 捕获 | complete、issues=0、9 份产物、完整性反读通过；捕获完整不表示上游 SSE 完整 |
| Cloudflare audit ID | `01a17880-e336-79c8-9632-9c95b4a0f59b` |
| Cloudflare ray | `a509f90a4d24453c-LAX` |

[实际请求及响应证明](../../../.recovery-artifacts/g3-d38-default-limit-20261026/response-proof.json)同时确认 SDK 输入与实际 HTTP 没有输出上限字段。将实际 HTTP 200 空 SSE body 在禁用网络的环境中送入同版 SDK，复现相同错误码和错误摘要；受控回放 1 次、外部模型调用 0。原始 HTTP body 已经为空，当前证据不支持“SDK 丢掉了返回正文”。

## 与 D37 的对比及根因边界

| 层次 | D37：`max_tokens=20000` | D38：使用上游默认上限 |
| --- | --- | --- |
| HTTP | 200，SSE | 200，SSE |
| 原始 body | 644 字节 | 0 字节 |
| SSE payload | 两条重复终止／用量帧 | 0 条 |
| stop／DONE | 均存在 | 均不存在 |
| assistant 正文 | 0 字节 | 0 字节 |
| SDK 结果 | `schema_invalid / empty` | `transport_unknown / stream` |
| 用量 | 输入 3,842／输出 0／21.131 Neurons | 未返回 |

Cloudflare 第一方客户端记录的 GLM-4.7-Flash `max_tokens` 空内容问题仍是相关兼容性证据；本次省略字段后依然失败，不能将其认定为唯一原因，也不能宣告参数修复已验收。两次响应形态不同：本次连结束和用量帧都没有。供应商内部执行、上游默认输出上限的具体数值、严格结构化输出与流式组合的运行情况仍未取得内部日志证明。没有将这些未知事项改写为超时、额度耗尽、SDK 丢内容或模型完成生成的结论。

原 Nvidia 两字符问题与正式 G3 报告／引用／历史／Web 消费义务保持未完成；此宿主诊断不替代目标容器正式任务、持久化或重建验收。

## 费用、数据和 WIP 保护

费用边界沿用用户确认的 Workers Free：超额拒绝，不产生付费超额；本轮没有扩大权限或修改套餐。未取得账单金额及本次 Neurons 用量，不把零付费边界写成零资源消耗。

[保护反读](../../../.recovery-artifacts/g3-d38-default-limit-20261026/protection-proof.json)确认：调用后 22 张表、旧 AI／工具记录、DSA 数据、Provider 配置、默认 `openrouter/free`／修订 5、环境、容器及挂载保持；V2=false、canCreate=false。三仓 HEAD 与空暂存区保持，调用前保存的 2,346 项既有 WIP 状态及已捕获文件摘要未变。随后仅更新本轮验收文档及私有验收包，没有 stage／commit。

保护初检曾将 Worker 未显式设置开关误认为未关闭；生产策略只在值为 `true` 时启用，实际 Server 显式 `false`、Worker 缺省为关闭，修正诊断断言后再派发，没有改环境。调用后初检另将 Provider 只读接口每次计算的 `readiness.evaluatedAt` 视为配置变化；数据库配置摘要未变，按具体路径核对九个即时评估时间差异后，其余 API 字段逐项相同。原失败日志保留，未忽略其他配置字段或修改冻结控制脚本。

私有记录目录为 `.recovery-artifacts/g3-d38-default-limit-20261026/`，包含授权、唯一调用锁、实际请求、完整 trace、响应及离线回放证明、调用前后数据基线和保护证明。原 D37 与字段改名候选继续保留；本轮无自动重试，当前没有剩余调用授权。

## 控制台用量核对

用户反馈控制台只看到 18:45 的记录后，只读核对了当前 Edge 中的 Workers AI 用量页。账户与实际配置的 Cloudflare Account ID 相同；页面显示今日及该模型用量均为 21.13 Neurons。图表该点展开后为北京时间 18:45–19:00 区间，原来“过去 24 小时”视图已恢复。这是用量汇总，不提供逐条 HTTP 请求计数。

D37 实际开始时间为北京时间 18:52:39，处于上述区间，上游报告 21.131 Neurons 与界面两位小数一致。D38 实际开始时间为北京时间 21:57:53，响应头 Date 为 `Mon, 26 Oct 2026 13:57:55 GMT`，与本地时间相符；取得 Cloudflare audit ID 及 ray，但没有 generation ID、模型标识、token 或 Neurons 回执。因而本轮能确认一次 HTTP 派发及 Cloudflare 入口响应，不能确认请求实际进入模型推理执行，也不能声称控制台已有新增推理记录。

“已用 1 次授权”按外部派发尝试计数，不代表模型已执行一次；当前余量仍为 0。没有因控制台缺少新用量而补发请求，也未将未知用量填为零。[控制台与 trace 对照证明](../../../.recovery-artifacts/g3-d38-default-limit-20261026/console-usage-proof.json)保留；本次核对新增模型请求为 0。

- [x] 用户授权、使用上游默认上限、实际请求字段及唯一派发核对。
- [x] HTTP 空响应、SDK 错误、trace 完整性和实际响应离线回放。
- [x] 配置、数据、V2、运行态及原 WIP 保护反读。
- [ ] 合法研究对象及正式 G3 报告／引用／历史／Web 正向验收。
