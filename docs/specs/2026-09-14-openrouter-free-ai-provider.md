# 前端可配置 AI Provider 与 OpenRouter 接入 Spec

> 任务标识：`openrouter-free-ai-provider`
> 日期：2026-09-14
> 状态：已完成；前端配置、动态 Registry、真实 OpenRouter 连接与目标 Compose/浏览器验收均已通过。2026-09-15 已补充 OpenRouter reasoning/响应变体兼容与 Provider 页面查询刷新范围修复。
> 对应任务：[2026-09-14-openrouter-free-ai-provider](../archive/tasks/2026-09-14-openrouter-free-ai-provider.md)

## 背景与问题

ThesisLedger Server 已有 OpenAI-compatible AI Provider 适配器，策略优化和 AI 研究通过运行中的 `AiProviderRegistry` 选择 Provider/Model。此前实现只把 `thesis-ledger-infra/.env` 中的 `AI_*` 配置透传给 Server，并在 Server 启动时注册 Provider；Desktop `/providers` 页面虽然允许选择 `ai` 类型，但它保存的 `ProviderConfig` 不会进入 `AiProviderRegistry`，连接测试也只支持通知 Webhook。

因此部署级 OpenRouter 可以工作，但“用户从前端新增、修改、测试、启停和切换 AI Provider”的原始产品要求没有完成。本 Spec 保留 `.env` 作为兼容的部署引导路径，并补齐数据库、Server 运行时与 Desktop 页面之间的产品闭环。

## 2026-09-15 回归修复

- 已确认 OpenRouter reasoning 模型在小 token 预算下可能只返回 reasoning，或通过合法的 content parts/Responses envelope 返回文本；连接测试显式关闭 reasoning，适配器兼容这些响应形态，并继续拒绝空内容、非 JSON 和非对象结果。
- 已确认 Provider 页面连接测试原先失效 `providerKeys.root`，同时 handler 对全部查询执行 `load()`，导致自动化、诊断和通知失败查询被无关刷新；现改为按 Provider 摘要、健康历史和 AI 能力的实际副作用定向失效，草稿测试不刷新页面查询。

## 目标

- 用户可在 Desktop Provider 页面配置 OpenAI-compatible AI Provider，包括 Provider ID、API Base URL、API Key、模型列表、能力、优先级、超时和可选费用元数据。
- Server 提供 AI Provider 查询、创建/更新、删除、连接测试和启停接口；保存、删除或启停后立即原子刷新 `AiProviderRegistry`，不要求重启。
- API Key 只在保存或测试请求中进入 Server，使用现有 `CREDENTIAL_ENCRYPTION_KEY` 加密后持久化；查询、日志、错误和审计响应不回显密钥。
- 策略优化和 AI 研究读取同一个动态 Registry；能力查询能看到当前启用的 Provider/Model。
- 记录配置更新时间、配置来源、最近连接测试状态、时间、延迟和脱敏失败码，复用现有 Provider 健康历史作为运行审计证据。
- OpenRouter 继续复用现有 OpenAI-compatible 适配器，不新增专属协议实现。

## 非目标

- 不把 LLM 调用移入普通 `backtest-worker`，不改变确定性回测执行、队列生命周期或市场数据 Provider。
- 不实现付费额度充值、模型目录自动同步、模型质量评分或跨 Provider 自动选价。
- 不保证免费模型的长期可用性、速率、上下文容量或响应质量；真实可用性由目标运行时门禁证明。
- 不在本次引入用户/租户权限模型；当前部署没有可用于记录操作者身份的认证主体。
- 配置功能验收不向第三方发送用户的真实组合、账户或策略数据；此类业务请求必须由用户另行明确授权。

## 现状与约束

- `apps/server/src/ai/provider-adapters.ts` 已实现 OpenAI-compatible `/chat/completions`、Bearer 鉴权、结构化响应、usage 与实际模型解析。
- `ProviderConfig` 已具备 `settings`、`encryptedCredentials`、`capabilities`、`priority`、`health` 和 `updatedAt`，无需为本功能修改数据库 Schema。
- `ProviderHealth` 与 `ProviderHealthCheck` 已能记录最近状态和历史检查；AI 连接测试应复用该边界。
- `ProviderConfigService` 拥有通用 Provider 凭证加密/解密和持久化；AI 模块只能单向消费其稳定服务契约，`providers/**` 不得反向依赖 `ai/**`。
- Desktop 使用 TanStack Query 管理 Provider 查询和 mutation；表单继续复用现有 shadcn/Base UI 组件与原子类。
- API Key 无法在浏览器完全“不出现”：用户输入和提交时浏览器必然短暂持有明文。安全要求是 Server 不向浏览器回传已保存密钥，前端不持久缓存或记录密钥，Server 加密落库且所有错误脱敏。

## 设计方案

### 配置模型

数据库中 `ProviderConfig.type = "ai"` 表示产品级 AI Provider。非敏感设置写入 `settings`：

```ts
type AiProviderSettings = {
  baseUrl: string;
  models: string[];
  timeoutMs?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  costCurrency?: string;
  pricingVersion?: string;
};
```

`name` 是 Registry 中稳定的 Provider ID；API Key 写入 `encryptedCredentials`。查询只返回 `credentialConfigured`，不得返回密文或明文。模型去空白、去重且至少一个；URL、超时、费用和能力在 Server 使用共享 Schema 校验，不能只依赖前端校验。

### 配置来源与优先级

- 数据库记录是产品级配置，`source = "database"`，可由页面管理。
- `AI_PROVIDER_CONFIGS_JSON` 与单 Provider `AI_*` 继续作为部署级兼容来源，`source = "environment"`；环境来源不得向客户端暴露密钥。
- 相同 Provider ID 存在数据库记录时，由数据库记录覆盖环境来源；数据库记录被停用时同名环境 Provider 也被屏蔽，确保页面“停用”立即生效。
- 删除数据库记录后，同名环境来源可以重新出现；API/UI 必须显示其部署来源和只读性质，避免把它误认成未删除的数据库记录。

### Server 接口

AI 模块提供独立接口，避免通用 Provider 端点继续产生“已保存但未接入 Registry”的假成功：

- `GET /ai/providers`：返回数据库与部署来源的脱敏摘要、模型、能力、状态和审计摘要。
- `POST /ai/providers`：创建或更新数据库 AI Provider；保留未重新输入的已有密钥。
- `POST /ai/providers/test`：使用草稿配置执行受控、低 token 的结构化连接测试，不持久化草稿。
- `POST /ai/providers/:name/test`：使用已保存配置测试并记录健康历史。
- `PATCH /ai/providers/:name/enabled`：启停数据库配置并刷新 Registry。
- `DELETE /ai/providers/:name`：删除数据库配置并刷新 Registry；删除部署来源时拒绝并给出明确错误。

通用 `/providers/config` 查询可继续承载通知 Provider；Desktop 对 `ai` 类型必须使用上述专用接口。Server 对通过通用保存端点提交的 `type = "ai"` 请求应拒绝并指向专用接口，防止形成第二条不刷新 Registry 的写入路径。

### 动态 Registry

Server 启动时从环境来源和数据库来源构建完整快照。每次成功创建、更新、启停或删除后，先从持久化事实重新构建下一份 Provider Map，验证通过后一次性替换当前快照；构建失败时保留旧 Registry 并返回失败，不得留下部分刷新状态。

策略优化和 AI 研究继续注入同一个 `AiProviderRegistry` 实例。普通回测 Worker 不加载 `AiModule`，本功能不向其扩散 API Key 或 LLM 依赖。

### 连接测试、状态与审计

- 连接测试调用草稿或已保存 Provider 的第一个模型，要求返回一个最小 JSON 对象，并限制输出 token 和超时。
- Provider 返回的错误先脱敏和截断，再作为 UI 消息或 `errorCode` 记录；不得记录请求 Authorization、API Key 或完整第三方响应。
- 已保存配置测试写入 `ProviderHealth`/`ProviderHealthCheck`，并同步 `ProviderConfig.health`；草稿测试不写持久化健康历史。
- 查询返回 `updatedAt`、`source`、最近 `health`、`checkedAt`、`latencyMs`、`errorCode`；无认证主体时不伪造操作者审计。

### Desktop 表单

当类型为 `ai` 时显示专用字段：API Base URL、模型列表、API Key、超时和可选费用元数据；默认能力为 `chat`。编辑已保存配置时不回显 API Key，留空保存继续使用已有密钥。连接测试、启停、删除和保存均使用 TanStack Query mutation，并在成功后刷新 Provider 列表及策略优化能力查询。

部署来源记录显示“部署配置”，不提供删除/启停假操作；用户可通过新建同名数据库配置接管，但必须重新输入 API Key。

## 对外行为或接口变化

- 新增 `/ai/providers` 管理接口。
- `/providers` 页面保存 AI Provider 后，运行中的策略优化能力列表立即反映新的 Provider/Model。
- 既有 `/ai/runs/capabilities`、策略优化 API 和回测 API 契约不变。
- 通知 Provider 的现有通用编辑、连接测试和凭证保留行为不变。

## 数据、状态或兼容性影响

- 不新增 migration；复用现有 `ProviderConfig`、`ProviderHealth` 和 `ProviderHealthCheck`。
- `.env` 配置保留为部署兼容路径，但不再作为唯一产品入口。
- 已存在但缺少合法 AI `settings` 的 `type = "ai"` 记录不进入 Registry，并在管理查询中返回配置失败状态；Server 不因单条坏记录整体无法启动。
- Registry 只包含启用且配置完整的 Provider；停用和删除不会中断已经发出的第三方请求，但影响后续路由。

## 测试策略

### 关键可观察行为

- 页面创建 OpenRouter 后，查询结果不含 Key，Registry/策略优化能力立即包含配置的 Provider/Model。
- 修改模型、停用、重新启用和删除均无需重启，并按配置来源优先级生效。
- 草稿和已保存连接测试能区分成功、鉴权失败、超时和配置错误，且错误中没有 API Key。
- 通知 Provider 原有保存/测试行为和普通回测 Worker 依赖边界不变。

### 测试层级与证据边界

1. Server 单元/集成：Schema、加密保留、CRUD、来源合并、Registry 原子替换、健康审计和错误脱敏。
2. Desktop 组件/交互：AI 专用字段、编辑不回显 Key、请求契约、启停/删除确认和错误状态。
3. 包级与仓库门禁：Server/Desktop 定向测试、TypeScript、边界检查；不以全量成功日志替代定向断言。
4. 目标运行时：当前 Server 镜像与数据库中，通过页面保存并脱敏回读 OpenRouter 配置，完成一次真实结构化连接测试，确认动态能力列表与健康审计同步；实际组合、账户或策略研究请求因会向第三方传输用户业务数据，不作为配置功能的默认验收动作。

## 风险与备选方案

- 免费模型和限流会变化；连接测试成功只证明测试时刻的第一个模型可用，不证明长期 SLA。
- 动态刷新与正在执行的请求存在时间边界；采用快照替换，使已取得 Provider 实例的请求完成，后续请求使用新快照。
- 若现有通用 Provider 页面职责继续扩大，可后续拆分独立 AI Provider 区域；本次先在现有页面内提供类型专用表单和操作，不做无关页面重构。

## 未决问题

### Blocking

无。

### Non-blocking

- OpenRouter 免费模型默认值可继续使用当前已验证的 `nvidia/nemotron-3-super-120b-a12b:free`，但页面允许用户改为其他具体模型；真实可用性由运行时响应决定。
- 当前无用户身份系统，配置审计只记录更新时间、配置来源和连接测试历史；操作者身份审计不在本次伪实现。

## 验收标准

- AC1：Desktop 可以创建和编辑 AI Provider 的 Base URL、模型、能力、优先级、超时、API Key 和可选费用元数据，查询/编辑时不回显已保存 Key。
- AC2：Server 提供 AI Provider 查询、创建/更新、草稿测试、已保存测试、启停和删除接口；非法配置在 Server 端被拒绝且错误脱敏。
- AC3：AI Provider API Key 使用现有 AES-256-GCM 凭证机制加密持久化，响应、日志、测试证据和健康历史均不包含明文或密文。
- AC4：创建、修改、启停和删除数据库 AI Provider 后，运行中的 `AiProviderRegistry` 与策略优化能力查询无需重启即反映结果；刷新失败不留下部分 Registry。
- AC5：数据库与环境来源优先级、停用屏蔽和删除后环境来源重新出现的行为可观察且有自动化覆盖；部署来源在页面明确标识且不可被假删除。
- AC6：已保存连接测试写入最近状态及历史检查，管理查询能返回更新时间、来源、状态、检查时间、延迟和脱敏错误码。
- AC7：通知 Provider 和普通回测 Worker 的既有行为与依赖边界不变。
- AC8：目标 Compose/数据库/浏览器使用真实 OpenRouter Key 完成“页面保存 → 脱敏回读 → 动态能力刷新 → 结构化连接测试 → 健康审计”闭环；未执行前不得宣称产品功能达到真实运行时验收。实际组合、账户或策略研究请求仅在用户明确授权向第三方发送相应业务数据后执行。
