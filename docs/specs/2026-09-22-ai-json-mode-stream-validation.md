# AI 输出模式与完整流验收（第一阶段）

| 项目 | 内容 |
| --- | --- |
| 任务标识 | `2026-09-22-ai-json-mode-stream-validation` |
| 状态 | 实施中；实现与验证状态见对应 Task |
| 对应任务 | [实施任务](../tasks/2026-09-22-ai-json-mode-stream-validation.md) |
| 基线 | `7d9771942a92b744a51a9fb0fa525582dcc45039` 的完整文件，而非该提交的 diff |

## 1. 目标与现有边界

在现有 Vercel AI SDK 接入层上新增真正的 API JSON Mode，并修正完整流之后发生校验错误时已报告用量丢失的问题。不替换 SDK、不重建任务状态机、不更改预算授权、不开放任意 JSON 修复或自动重试。

本文增量修订 [SDK 接入 Spec](2026-09-19-vercel-ai-sdk-integration.md) 的生成模式及流验收部分；其余调用、契约、权限、冻结配置、未知结果与预算约束继续有效。

长期方向为 Schema 结构化输出优先、API JSON Mode 兼容、文本 JSON 兜底。本阶段只交付三种明确的执行方式；不把缺少能力证据的模型自动切到新方式，不声称已经完成自动能力选择。

## 2. 输出方式与兼容

| 持久化值 | 行为 |
| --- | --- |
| `native_schema` | 保留 `Output.object({ schema })`，由 SDK 传输 Schema 并校验完整结果 |
| `json_mode` | 新增 `Output.json()`；上游只约束 JSON 语法，完整结果仍按业务生成 Schema 校验 |
| `json_validated` | 保留历史文本生成语义；界面称“文本 JSON（应用校验）”，仍兼容已有整段 JSON 代码围栏 |

不得将旧 `json_validated` 原地解释成 JSON Mode，不改写历史任务或默认配置。三种模式均不允许未验收内容进入正式结果；JSON Mode 不保证字段、引用或业务规则正确。`native_schema` 的完整生成 Schema 已由 SDK 校验，应用不再次执行同一 Zod transform；原有业务校验仍继续执行。

本阶段 JSON Mode 仅支持现有 Chat Completions 与 Responses 适配路径。Anthropic Messages 不得静默把无 Schema JSON 请求降为普通文本；该组合必须在出站前被拒绝，readiness 不得报告已有 adapter 契约证据。其他服务是否支持对应请求参数，仍需用途验证，不能按域名或模型名推断。

沿用现有业务提示对 JSON 及结果结构的说明。JSON Mode 预检要求消息明确提到 JSON；这只检查必要调用条件，不声称自动证明提示充分。适配器不得在调用方完成预算预留之后追加 Schema 或提示词，避免增加未被预留的输入 Token。生成 Schema 仍是本地最终校验事实源；从 Schema 统一生成各业务提示不属于本阶段交付。

## 3. 流式与验收

传输与输出模式保持正交：支持的三种方式均可使用一次性或流式生成。流由服务端完整消费，前端继续使用现有后台任务与最终结果界面。

完整流验收顺序：消费事件及尾帧 → 保留可取得的用量/结束信息 → 检查终止原因 → 取得完整输出 → 生成契约校验 → 原有业务校验与幂等保存。不得因局部 JSON 可解析而提前提交，也不得为每个片段重复执行完整业务校验。

必须保留已观察到的用量：完整输出是非法 JSON、字段无效或 SDK 输出解析失败，不应把已报告用量退化为 unknown；缺失用量仍保持 unknown，不能补零。输出 Promise 的拒绝需要被消费，不能产生未处理拒绝。截断/拒答优先于内容解析成功，不能接受 `finishReason=length` 的合法 JSON。

错误/用量/结果元数据的归一化仍属于 AI 适配层。提取 helper 时保留原 `AiSdkGenerationError` 导出位置及同一类实例，不影响研究和策略执行的 `instanceof` 检查。

## 4. 本次非目标

本 PR 不实现自动能力探测、自动模式决策、模式失败后的重试、前端逐字预览、Agent 工具循环、费用模型重建或其他 Provider 安全/健康问题。自动决策必须在可信能力记录、冻结有效模式和成本授权闭环建立后另行设计；不能作为本 PR 已交付功能。

本次也不修改用途探针与正式任务的传输配置差异，不把新适配器测试当成两条业务链路的真实运行验收。

## 5. 验收

- AC1：原有两个模式兼容；新增 `json_mode` 能经过共享配置 Schema。
- AC2：Chat 的真实出站请求为 `response_format: { type: 'json_object' }`；Responses 的格式字段由锁定 SDK 正确映射；不误发 JSON Schema。
- AC3：JSON Mode 一次性和流式生成均执行本地生成 Schema 校验。
- AC4：分片不完整 JSON 可以正常累积；读取独立 usage 尾帧；一次调用不隐式重试。
- AC5：非法 JSON、无效字段、截断等失败保留已经报告的 Token；未知量不补零。
- AC6：Anthropic + JSON Mode 在发送前失败，不改变已保存模式，不伪造就绪证据。
- AC7：界面清楚区分文本 JSON、API JSON Mode 与接口结构化能力；不要求用户为已有连接重新配置。
- AC8：验证报告分别记录静态检查、定向测试、包级构建、CI 和真实 Provider 验收，未执行项不标为通过。

## 6. 发布与回滚

先部署能识别 `json_mode` 的共享契约与服务端，再启用新版客户端选项。已有 `json_validated` 和 `native_schema` 路由维持原值；新方式由用户明确选择，不批量转换配置，不升级数据库或依赖。

回滚至不识别 `json_mode` 的旧版本之前，必须暂停新 AI 任务并处理在途/未结算请求，显式检查数据库及环境配置中的 `executionRoutes` 和 `modelDefaults`。使用新模式的配置须由管理员改回经验证的旧模式或移除，不能直接部署旧版让解析器丢弃路由。历史审计事实不应重新解释或抹去。

现有 `assessAiSdkRollbackReadiness` 只检查任务/请求结算事实，不能替代上述输出模式配置兼容检查。回滚检查通过也不代表旧版支持新配置。

## 7. 技术依据

- 锁定 `ai@7.0.107` 的 `packages/ai/src/generate-text/output.ts`：`Output.json()` 的 responseFormat 为无 schema 的 `type: 'json'`，完整结果仍需要应用生成契约验收。
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)：区分 JSON Mode 与 Schema 约束，支持流式，要求处理不完整结果。
- [AI SDK Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)：SDK 输出策略和完整/部分结果的边界。
