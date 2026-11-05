# AI 配置协议、用途与默认停顿验收

## 结论与授权

本次在现有免费 OpenRouter/free、原认证和费用上限 0 内继续前四项任务，调用次数按用户本轮“不限”授权，每个样本仍冻结有限次数，禁止自动重试或格式回退。下述 10 次协议/用途探针均通过公开 `/api/v1/ai/providers/test`，只测试草稿，没有保存协议草稿或创建业务报告。Anthropic 流式原生 Schema 的失败及未知费用保留，失败后没有继续该分支。

本机停顿验收真实模型调用 0 次、费用 0，只使用本机假上游和维护入口创建的独立 PostgreSQL。目标真实上游的停顿/完整期限条件不能由该隔离结果代收。

## 协议切换的兼容扩展修复

原配置包含 `openrouter-v1`，草稿切换至其他协议时，测试运行时、验证计划及持久化仍无条件继承旧扩展。本次统一 `resolveCompatibilityProfile`：最终选择仍为兼容 Chat Completions 时保留省略的扩展，切换 Responses、OpenAI 原生 Chat 或 Anthropic 时不继承；显式不合法组合仍由原 Schema 拒绝。凭据与地址变化的保护保持。

- 两个定向文件 14 项通过，覆盖三类切换、重新验证、原兼容配置保留及失败停止。
- 维护入口 `scripts/test-ai-provider-postgres.mjs test/ai/ai-provider-profile-postgres.integration.test.ts`：1 项通过、无跳过；真实 PostgreSQL/HTTP 与假 SDK 验证 Responses 保存、新服务读取、复用旧成功证明零调用恢复，以及密文和两个空对象保持。
- Server 类型、写集 ESLint、构建和边界通过；首次类型检查因可选字段的 undefined 类型声明失败，修正后通过，原失败日志保留。
- 经 infra `./scripts/sync-code.sh thesis-ledger` 同步，Server / Worker 沿用原镜像；同步前无活跃业务任务，配置与旧审计保持。本次是可写层同步，不是镜像发布。

## 目标实际探针

| 样本与传输 | requestId | 实际模型 | 输入/输出 Token | 费用事实与结果 |
| --- | --- | --- | --- | --- |
| Responses 非流式连接 | a834dab3-1d21-4b73-b02e-e60d7fe5d56d | liquid/lfm-2.5-2.6b:free | 21/101 | healthy；配置估算 0 USD |
| Responses 流式研究 V2、JSON Mode | 7597e917-e184-49d5-8b8b-044bc9023c2a | dots-studio/dots-3-note-preview:free | 177/360 | healthy；配置估算 0 USD |
| 兼容 Chat 非流式 JSON Mode | eaa5046a-b45d-4653-94cc-536ae7ce20ad | nvidia/nemotron-3.5-super-vl:free | 27/38 | healthy；上游实报 0 USD |
| Responses 非流式 JSON Mode | d851d254-8369-4f5a-b6a0-13d362919c9a | dots-studio/dots-3-note-preview:free | 24/29 | healthy；配置估算 0 USD |
| Responses 流式研究 V2、原生 Schema | 483ff1b8-48b0-4a3c-870e-746329d5eae8 | nvidia/nemotron-3.5-lightning:free | 243/1127 | healthy；配置估算 0 USD |
| OpenAI 原生 Chat 流式研究 V2、原生 Schema | 347b74a9-b428-4668-8da5-7abfbfa9214d | cohere/north-mini-code:free | 161/254 | healthy；配置估算 0 USD |
| Anthropic Messages 非流式连接 | d43ce7e9-d310-438a-ae40-355ade2eec2c | dots-studio/dots-3-note-preview:free | 24/36 | healthy；配置估算 0 USD |
| Anthropic Messages 流式研究 V2、原生 Schema | faed7150-f8d7-4c27-be46-116584836ad9 | cohere/north-mini-code:free | 2933/206 | down / schema_invalid；实际费用未知，停止分支 |
| 策略编写生成 V2、兼容 Chat 流式 JSON Mode | 3f602aae-9681-460c-94a0-5eef3c53cd14 | nvidia/nemotron-3-ultra-550b-a55b:free | 417/445 | healthy；上游实报 0 USD |
| 策略编写修改 V2、兼容 Chat 流式 JSON Mode | 7b1d4b24-1ea5-41cf-90ce-36d4fdefbe80 | nvidia/nemotron-3-ultra-550b-a55b:free | 417/384 | healthy；上游实报 0 USD |

非流式 JSON Mode 使用公开模型最小生成测试：`testKind=generation`、`mode=json_mode`、不选择业务 purpose，沿用内置最小 Schema，传输为 single；不能代收正式业务合同。流式用途使用明确 purpose 和对应 V2 合同的受控实例；不能代收真实策略编写业务。

协议地址事先参照官方 [Responses 文档](https://openrouter.ai/docs/api/api-reference/responses/create-responses)和 [Anthropic Messages 文档](https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-messages)核对；上述结论来自实际 SDK/公开 API 结果，文档本身不构成运行验收。实际模型别名只记录本请求返回值，不保证后续路由至同一模型。

## 默认停顿的完整墙钟隔离验收

新增 `ai-provider-stall-postgres.integration.test.ts`，三个独立 Provider 在同一所属测试环境并行运行，均使用公开计划/test-and-save、真实 SDK、HTTP/SSE 和 PostgreSQL。Provider 非流式 `timeoutMs=3000`；流式沿用默认首输出 120000ms、输出间隔 60000ms、操作预算 600000ms、收尾 5000ms，没有假时钟或缩短策略。

| 假上游行为 | 实际经过时间 | Provider 历史错误码 |
| --- | --- | --- |
| HTTP 200 headers 已到，正文持续为空 | 120039.5ms | provider_first_output_timeout |
| 每秒 SSE 心跳，没有有效模型输出 | 120036.8ms | provider_first_output_timeout |
| 先发送一段有效文本，再持续停顿 | 60069.6ms | provider_output_idle_timeout |

三项均返回 400、上游断开；总共三条请求，每操作第二用途均未发送，无回退/重试/保存。每项 pending/failed 审计保留未知用量；原三份隔离配置、默认修订 7、两个空对象、AiRun/Tool 数量保持。第一轮已经观测准确时长，但断言遗漏外层 `provider_` 前缀而失败；修正测试断言后完整重验通过，没有修改应用错误语义。

维护入口带 `AI_PROVIDER_WALL_CLOCK_TEST=1`、`AI_PROVIDER_TEST_TIMEOUT_MS=300000` 执行该单文件，1 项通过、无跳过。外层等待参数只限制隔离测试进程。此前完整 595.049 秒的[共享操作期限](2026-10-30-ai-provider-deadline-isolated.md)、[隔离取消](2026-10-30-ai-provider-cancel-isolated.md)及[目标取消](2026-10-31-ai-provider-target-cancel.md)继续按输入复用。

## 恢复与证据

2026-10-31 01:00:05 北京时间，通过公开 validation-plan 确认原配置 `pending=[]`、`maxCalls=0`，再经普通保存恢复原兼容 Chat 配置；仅分析和研究保持原 native_schema/auto 启用，其余四用途恢复原禁用及原模式，两个空对象仍实际存在。五份 Provider 业务摘要及密文均与本轮基线完全相同，四份其他配置连更新时间也未变；OpenRouter 更新时间属于本次正常保存，不回写旧时间或旧健康状态。

执行包 `.recovery-artifacts/first-four-acceptance-20261030T134208Z` 保留各 `*-scope.json`、`*-dispatch.json`、`*-response.json`、`profile-*`、`stall-*`、`read-fixes-sync-*`、`restore-original-*` 和 `final-provider-protection-verdict.json`。T6 的真实非零结算、目标真实上游停顿/完整期限及 Anthropic 用途正向仍未通过；当前授权不允许制造非零账单。
