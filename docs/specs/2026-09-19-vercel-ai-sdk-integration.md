# AI 接入层迁移至 Vercel AI SDK

| 项目 | 内容 |
| --- | --- |
| 文档类型 | Spec |
| 创建日期 | 2026-09-19 |
| 状态 | 实施中；T0–T13、G0、G0.1 与 G2 已完成，T13 的浏览器/目标运行态重新验收待执行 |
| 适用仓库 | `yzin-17/thesis-ledger` |
| 任务标识 | `2026-09-19-vercel-ai-sdk-integration` |
| 对应任务 | [实施任务](../tasks/2026-09-19-vercel-ai-sdk-integration.md) |
| 主要执行面 | NestJS Server / 现有后台执行器与 Worker |
| 关联需求 | 策略中心体验优化、AI 策略生成、研究助手 |
| 交付边界 | 本文保留已完成实施证据并定义当前纠偏要求；T13 的本地实现与定向验证已记录，历史 G2 证据不自动证明统一流程的浏览器/运行态 |

## 1. 决策摘要

采用 **Vercel AI SDK Core** 作为服务端模型调用基础设施，服务端依赖收敛为 `ai` 与官方 `@ai-sdk/openai`、`@ai-sdk/anthropic`、`@ai-sdk/openai-compatible`。页面配置三种上游格式；Chat Completions 额外显式选择“通用兼容”或“OpenAI 原生”，服务端据此确定 Provider 实现。base URL 只决定请求地址，不按域名自动切换 SDK。OpenRouter 可继续作为通用 Chat Completions 服务使用，但不作为默认服务商、接口格式或专用依赖。保留项目自己的 `AiProvider` 接口、Provider 注册与配置、`AiRun`、`OptimizationAttempt`、预算、工具审计和业务校验。

本次不是将 `fetch` 改成一个 SDK 函数后继续沿用原有错误处理，而是完成以下闭环：

> 配置与能力检查 → 预算预留与执行权确认 → 单次 SDK 调用 → 完整消费流 → 提取诊断与用量 → 生成契约校验 → 业务校验 → 幂等落库与预算对账。

必须遵守的边界：

- SDK 不接管实验编排、重试授权、候选采纳和回测；业务模块不依赖 SDK 的 Provider 响应格式。
- 默认关闭 SDK 请求重试、流内重试和模型自修复；一次底层调用不得隐式变成多次模型请求。
- HTTP 200、收到部分正文或局部 JSON 可解析，都不等于候选生成成功。
- 生成失败、外部结果未知、用量未知、费用未知是不同维度，不能相互替代。
- 已保存的合法候选优先复用；后续回测失败不触发重新生成。
- 不因本次迁移放宽策略 Schema、数据指纹、工具权限或免费预算约束。

**成功标准不是上游永不失败，而是接入层行为可验证、失败可解释、预算不被绕过、成功结果不会被重复生成。**

## 2. 背景与核验基线

### 2.1 来源与当前状态

本 Spec 由用户提供的同名初稿、2026-09-19 当前工作树只读核查及本轮逐项确认的设计决策合并形成。仓库已有大量未提交修改；以当前工作树为实施基线，保留既有超时、提示词、策略中心和研究助手修复。下载目录初稿只作为来源，不是并行维护的需求源。

2026-09-20 用户根据实际 Provider 编辑器补充并纠正：切换到 AI 时不得重建 Drawer 或丢失名称；新建 AI Provider 不预填 OpenRouter URL、模型或厂商选项；页面配置的是截图所示三种上游格式，而不是直接把三种格式当作 Vercel SDK adapter。进一步核对 Vercel Provider 能力后确认：Provider 实现必须由显式配置确定，不按 base URL 隐式切换；本轮只覆盖策略生成与研究助手需要的语言模型能力，不扩展为 Embedding、Image、Audio 或 Video 平台。随后确认普通 Provider 与 AI Provider 应进入同一个编辑流程，类型可以在同一草稿中双向切换，底层专用接口只作为编辑器内部 Adapter。

| 当前代码区域 | 已核实事实与本轮增量 |
| --- | --- |
| `ai/contracts.ts`、`provider-adapters.ts` | 仍为项目 Promise 接口与手写请求；本地已保留响应读取超时，但未知 usage 仍会投影为零；新增完整性与诊断契约 |
| `ai/provider-registry.ts` | 研究 fallback 有独立 30 秒超时并捕获任意异常；需要白名单、总期限及逐请求记录 |
| `ai/ai-run.service.ts`、`ai-run-recovery.ts` | 研究任务已有领取、租约和执行次数，但无本 Spec 的任务预算/绝对期限；过期可自动重排；成功/失败提交缺少完整领取代次条件 |
| `ai/ai-research.executor.ts` | 工具先执行，再生成研究结果；保留该模式，新增任务取消和安全恢复 |
| `ai/ai-provider.service.ts` | 已有 JSON 配置、凭证保护和连接测试；最小 JSON 测试不证明业务 Schema 或流式兼容性 |
| `strategy-optimization` | 已有严格路由、步骤预留、缓存与未知结果不重放；实际费用超额时对账可能拒写，需分离事实结算与后续调度门禁 |
| discovery 与回测消费 | 当前模型返回完整策略；成本可影响回测。本轮改为精简生成 DTO，固定成本来自已有隐藏 seed 快照，保留 Runner 的既有合并规则 |
| Desktop 研究重试 | 新建 AiRun 并关联原 ID，但上下文未完整预填；本轮补原上下文预填、确认与失效引用校验 |
| 数据与展示 | AiRun 已有 modelMetadata、checkpoint、executionAttempt；汇总和详情仍直接使用数值，需要完整性消费改造 |

关联边界：[策略中心 Spec](2026-09-17-strategy-center-ux-consolidation.md)、[策略中心历史 Task](../archive/tasks/2026-09-17-strategy-center-ux-consolidation.md)、[策略风险与优化 Spec](2026-09-09-strategy-risk-ai-optimization.md)。本轮不改写关联任务既有结论；归档 Task 仅提供历史证据，不作为本轮需求源。

### 2.2 本轮术语与证据边界

- **上游格式**：用户配置的远端 HTTP 协议，固定为 `chat-completions`、`responses`、`anthropic-messages`。
- **Chat 实现**：仅当上游格式为 `chat-completions` 时有效的显式配置，固定为 `compatible` 或 `openai-native`；它不根据域名变化。
- **SDK Provider 实现**：服务端由上游格式和 Chat 实现确定的 Vercel Provider 包及模型工厂。它是执行事实，不作为可任意组合的厂商格式；OpenRouter 通过通用兼容实现接入。
- **接入就绪**：指定模型、上游格式、Chat 实现、SDK Provider 实现、配置、生成模式及契约具备能力声明和对应本地 adapter 契约测试证据，可以进入调用。能力声明可来自可信目录或显式人工声明；这不代表真实业务验收通过。
- **真实业务验收通过**：在指定版本与路由上，受控真实请求得到可追溯合法结果，只证明当次覆盖的契约。
- **生成成功**：完整生成结果通过校验并保存；实验是否可继续还取决于预算、取消与其他门禁。候选含义沿用 [领域术语](../../CONTEXT.md)，生成完成不等于评估通过或采纳。
- **AI 调用费用**：上游模型调用的已报告、估算或未知消耗；**策略交易成本**：策略/回测中的佣金、滑点假设，两者不混用。
- **再次生成**：用户确认后创建新任务与新预算，重新收集证据；不是重置旧请求或精确复现旧上下文数据。

上述新增能力均为目标设计；本次文档生成不构成实现、构建、Docker、浏览器或真实 Provider 验收证据。

## 3. 范围

### 3.1 本轮必须完成

迁移共享 AI 接入层，并接通**策略优化/探索生成**和**研究助手**两条已知生产调用链。流由服务端消费，前端仍使用现有任务查询与最终结果接口。

同时交付：依赖兼容性、路由就绪配置、生成契约、完整流、超时/取消、错误映射、逐请求计量、研究任务执行策略、预算对账、fallback 收紧，以及已有配置/详情/再次生成界面的必要改造。先完成策略链路的本地闭环验收，再接研究链路；共同依赖与两条链路属于同一接入契约，真实门禁分开记录。

### 3.2 明确不做

不引入 TanStack AI、LangChain 或新的 AI 网关；不要求迁往 Vercel；不迁移前端到 `useChat`；不增加 Agent 自主工具循环、客户端工具、MCP、RAG、向量库或多智能体。

不重建队列、任务状态机或审计系统；不修改 DSA Contract V1、回测 Runner、冻结数据规则、交易规则或策略库采纳流程；不开发聊天历史持久化与浏览器断线续传。

**本轮不新增策略优化的自动重试或自动换模型。** 先保留现有“失败终止 / 未知结果禁止自动重放”的安全语义；对研究助手已存在的 fallback 进行限次、限错误类型和逐请求记录，不再对任意异常盲目切换。

## 4. 依赖与版本策略

### 4.1 选型与版本验证

服务端接入模块使用 `ai`、`@ai-sdk/openai-compatible`、`@ai-sdk/openai` 与 `@ai-sdk/anthropic`，保留现有 Zod；完成兼容迁移后移除 `@openrouter/ai-sdk-provider`。通过显式 Provider 对象调用，不隐式经过 Vercel Gateway。

选取已发布、相互兼容的稳定组合，精确锁定 manifest 与 lockfile；主线 manifest 和文档仅作参考，不作为已发布或已安装证据。[S1] [S2] T0 保留原依赖核验历史，T12.2 必须针对新增官方 Provider 包与移除 OpenRouter 专用包重新核验 Node、实际安装 Zod、SDK、开发/CI/Server/Worker 运行时，记录导出、请求形态、构建与 peer dependency 结果。不忽略冲突，不通过类型断言掩盖不兼容，不从主线直接安装。

### 4.2 SDK 能力映射

以锁定版本验证 `streamText`、`Output.object`、错误事件、`maxRetries`、取消、超时及 telemetry。[S3] [S4] 若缺少细分超时，仅在接入模块补窄计时器映射，不重写 SSE。HTTP 契约测试必须使用选定的真实 adapter 包。

SDK 导入限于 AI 接入模块及对应测试；领域、策略 Schema、公共 API DTO 不依赖 SDK 类型。模块依赖与 `scripts/check-boundaries.mjs` 同步维护；不混用不同大版本示例中的工具、Schema 或 telemetry API。

## 5. 目标架构与职责

```text
策略优化候选服务                    研究助手执行器
  │ 冻结配置、预算、步骤锁             │ 工具审计、证据收集、研究任务锁
  └──────────────────┬───────────────┘
                     ↓
       项目 AiProvider 接口 / ProviderRegistry
          路由约束、生成契约、调用上下文
                     ↓
             SDK-backed Provider
       请求映射、完整流消费、错误与元数据归一化
                     ↓
          Vercel AI SDK Core + Provider 包
                     ↓
       OpenAI / Anthropic / OpenRouter 等已配置兼容服务
```

| 责任 | 归属 |
| --- | --- |
| Provider 原始协议、SSE 分片、标准生成能力 | SDK 及其 Provider 包 |
| 配置映射、错误分类、流完整性、诊断白名单 | 项目接入模块 |
| 是否调用、调用预算、步骤执行权、恢复授权 | 现有业务编排层 |
| 策略语义、授权参数、证据引用、候选采纳 | 现有领域服务与 Schema |
| 密钥存储与配置更新 | 现有 Provider 管理链路 |

SDK 类型不得扩散到 `packages/domain`、策略 Schema 或公共 API DTO。允许接入模块内部使用 `LanguageModel` 等 SDK 类型；公共业务接口保持项目所有。

`AiProvider.complete()` 可以继续返回 Promise，但实现内部完整消费流。调用方不得通过“返回 Promise”误判底层仍是非流式 HTTP 请求。

## 6. 配置、路由与能力

### 6.1 配置保存与冻结

保留 Provider ID、models、base URL、密钥、enabled、priority、health、timeout、价格、推理配置及数据库/环境变量优先级。新增用户可配置的 `upstreamFormat`（`chat-completions / responses / anthropic-messages`）与条件字段 `chatImplementation`（`compatible / openai-native`）；后者仅在 Chat Completions 下允许存在，默认 `compatible`。`adapter` 不再由 Desktop 选择或写入新配置。按模型保存的执行配置继续包含生成模式、能力声明及来源/时间/版本、允许的上游端点范围、首输出/间隔覆盖值、价格来源及免费依据。复用现有 Provider JSON 配置；API、环境读取和 Desktop 编辑器使用同一显式契约。

上游格式、Chat 实现与 SDK Provider 的确定规则固定如下：

| 上游格式 | Chat 实现 | Vercel SDK Provider 与显式入口 |
| --- | --- | --- |
| `chat-completions` | `compatible` | `@ai-sdk/openai-compatible` 的 `chatModel()`；用于兼容服务、中转服务、本地服务及 OpenRouter |
| `chat-completions` | `openai-native` | `@ai-sdk/openai` 的 `chat()`；用于需要 OpenAI 原生 Chat 参数的连接 |
| `responses` | 不适用 | `@ai-sdk/openai` 的 `responses()` |
| `anthropic-messages` | 不适用 | `@ai-sdk/anthropic` 的 `messages()` |

新建 AI Provider 默认选择 `chat-completions + compatible`，但 base URL、模型列表与厂商信息为空，不预填 OpenRouter。界面中 Chat Completions 与 Anthropic Messages 的说明使用“需支持对应接口”，表示上游必须提供相应 HTTP endpoint，不表示 ThesisLedger 的执行路由或 Vercel AI SDK 会自动创建网关路由。普通 Provider 与 AI Provider 共用一个编辑器、一个草稿协调器和一个类型选择器；类型可在未提交草稿中双向切换。切换保留名称、启用状态和优先级，清理目标类型不适用的专属字段，并使连接测试、模型目录和最小生成结果失效。保存/测试由协调器按最终类型选择专用接口，不能因 UI 统一而把 AI 字段提交到普通接口。base URL 可用于校验、提示或推荐配置，但不得改变已保存的上游格式、Chat 实现或实际 Provider 包。

数据库来源的 Provider 允许通过该统一编辑器改变最终类型：普通目标类型由普通配置接口保存，AI 目标类型由 AI 配置接口保存；同名记录按目标类型更新并替换不再适用的 `settings`，空凭证继续遵循既有“保留已配置凭证”语义。环境来源配置不得被静默覆盖；切换后接管必须重新提交目标类型凭证，仍保持部署配置只读边界。

旧配置中的 `adapter=openrouter` 与 `adapter=openai-compatible` 只在数据库/环境配置读取边界兼容映射为 `chat-completions + compatible`；新建与更新 API 不再接受客户端直接指定 adapter。旧 OpenRouter 配置若实际保存了厂商扩展字段，服务端同时保留只读迁移标记 `compatibilityExtensionProfile=openrouter-v1`，用于约束后述白名单转换；该标记不选择 Provider、不对新客户端开放，也不能因编辑名称、地址或模型而丢失。缺少显式新字段的旧配置只按旧 adapter 字段迁移；URL 和显示名称不得参与运行语义推断，不自动改写已保存密钥或模型列表。保留受信代理、本地服务及自定义 baseUrl 访问策略；不接受请求方任意传入目标 URL。

移除 OpenRouter 专用包前，必须逐项处理当前已使用的差异：`reasoningEffort` 通过锁定版本确认的 compatible provider options 映射；仅带受控 `openrouter-v1` 迁移标记的旧配置可将 `provider.only`、`provider.require_parameters` 等路由约束通过 `transformRequestBody` 白名单转换；usage/cost 仅可通过 `metadataExtractor` 归一化为“已报告、估算、未知”。新建通用兼容连接不因 URL 自动获得厂商扩展。无法证明等价的旧配置标记为“待迁移、不可执行”，不得静默丢弃字段、放宽路由或把未知费用写为零。迁移只覆盖项目已经使用的必要能力，不复制 OpenRouter adapter 的完整插件、图片、视频或其他厂商能力。

Vercel Provider 包负责生成协议，不自动提供统一模型目录。现有“从接口获取”继续作为独立管理能力：Chat Completions/Responses 默认使用 Bearer 鉴权访问受控 base URL 的 `/models`；Anthropic Messages 使用对应的 API Key/版本头。端点没有模型目录能力时明确返回不可用并允许手动填写模型，不得静默改用另一种上游格式或据此判定生成 adapter 不可用。

Provider 验证结果拆分保存为“模型目录获取”“最小生成”“业务结构化生成”三类；任一结果不得冒充另外两类。模型目录失败不阻止手动填写模型，最小生成成功不授予结构化输出或业务 Schema 能力。修改 base URL、上游格式、Chat 实现或模型后使相关验证证据过期；较早发起的异步结果不得覆盖新配置状态。

任务创建时冻结有效预算策略和候选路由配置；执行时再次检查就绪、启用、权限和撤销状态。热更新不替换在途请求的模型/模式/参数；显式停用或能力撤销阻断尚未发送的请求，包括已冻结的 fallback。凭证仅保留受控引用及版本/指纹，不复制明文到任务 JSON。

### 6.2 接入就绪门禁

就绪证据按上游格式、Chat 实现、确定的 SDK Provider、模型、端点/路由配置指纹、生成模式和生成契约版本绑定，由服务端计算，不接受客户端直接提交 `ready: true` 或 adapter 覆盖。要求同时具备：

1. 覆盖所用参数的能力声明。可信目录记录来源版本；人工声明记录声明者/来源、时间、配置版本，并显示“人工声明，未完成真实业务验证”。
2. 锁定 SDK/adapter/契约对应的本地 HTTP/SSE 契约测试证据。证据随版本发布，由受控发布输入登记，不允许页面伪造测试通过。
3. 有效配置、健康/启用状态、预算与允许路由条件满足当前调用。

已有连接测试只证明连接能力，不自动授予结构化能力或免费资格。接入就绪、真实验证、运行健康分别保存，不把一次 Schema 验证失败直接计为整个 Provider 离线。

切换上游格式或 Chat 实现后，业务链路立即停用未就绪路由；允许先保存待配置记录，正常业务不得发出请求。展示具体原因与设置入口。配置/模型/Schema/上游格式/Chat 实现/Provider 包的相关指纹变化后重新计算就绪；说明文案、价格等变化不伪造新能力证据，价格变更仍重新检查预算授权。

真实请求若明确证明某参数或模式不受支持，撤销受影响组合的就绪状态，阻断后续请求；其他组合保留。更正声明或相关配置、重新满足契约检查后才能恢复。偶发非法 JSON 属于输出失败，不据此永久判定不支持模式。

### 6.3 生成模式

| 模式 | 行为 |
| --- | --- |
| `native_schema` | 策略首选；传输 Schema、严格选项和本地校验共同约束；各 Provider 只发送已声明且经实际出站测试验证的参数，兼容服务的额外约束必须来自受控白名单映射 |
| `json_validated` | 必须提前显式选择；使用端点声明支持的 JSON 或文本路径，完整接收后做相同的本地验收；不发送不支持的原生 Schema 参数 |

不在失败后自动切模式、删除参数再调用或换模型。原生模式的能力不按模型名称猜测；兼容服务的路由约束也属于冻结配置的一部分。[S5] 不将随机 `openrouter/free` 设为默认可靠路由。

### 6.4 推理、价格与免费依据

沿用 reasoningEffort 的用户选择，记录 requested/effective；`max` 等档位必须有明确 adapter/模型映射，否则发送前阻断。不全局强制 high/none。推理可能消耗输出预算；隐藏推理不代表关闭推理，不保存原始推理文本。[S7]

请求输出上限受模型限制、冻结请求配置及剩余预算共同限制；剩余额度无法支持契约时发送前终止，不自行扩预算或删上下文。

免费资格需要可核对的可信价格目录证据，或受控本地服务的明确免计费声明，覆盖实际允许的路由。普通兼容端点仅手填零单价不足以取得免费资格。币种未知不假定 CNY/USD；免费授权证据与上游是否报告零账单分开保存。

## 7. 生成契约与完整流消费

### 7.1 三类契约

契约由所属业务定义，经项目自有接口传入通用 AI 接入模块；接入层不反向 import 策略编排层。可复用领域子结构来自现有 Schema，避免复制可独立漂移的策略 DSL。

| 契约 | 模型返回与装配 |
| --- | --- |
| 参数优化 | 保留现有 changes、reason、evidenceRefs；继续校验授权参数、范围及最终策略 |
| 策略探索 | 精简 DTO：`{ strategy: { name, description?, series, entry, exit, sizing, risk }, reason, evidenceRefs }`；由服务端装配完整 discovery proposal |
| 研究助手 | 从 ResearchResult V1 提取模型负责的正文、证据、风险、未知项等字段；可信 Provider、context、版本与审计时间由服务端装配 |

探索装配使用实验创建时已有隐藏 seed 的冻结快照：固定 schemaVersion、执行标的、主周期、execution、cost，以及唯一信号源的 ID/asset/timeframe；模型仅提供该信号源的 series。entry/exit 中的引用必须指向固定 ID 及已声明 series。名称和说明继续由模型生成；不得新增外部标的、信号源或突破现有 AST/策略空间约束。

模型额外提供固定字段应拒绝，不能静默覆盖；`benchmark: null` 仅适用下一节的传输兼容白名单。最终完整对象继续通过 StrategySchemaV2、discovery 空间及引用校验后持久化。Prompt 同步改为精简 DTO，不再要求复制完整策略。已保存旧版本的完整 proposal 按其版本复用，不拿新 DTO 重新解释或重新生成。

策略交易成本取冻结 seed（目前默认佣金/滑点为零），详情明确其来源及假设；零值不代表真实交易免费。本轮不新增实验成本编辑器，不修改 Runner 对 strategy.cost 与 runConfig.executionModel 的既有覆盖/合并规则，不将 AI 费用写入策略 cost。

研究传输 Schema 保留既有确定性引用补全所需的可选字段；只能用本次真实工具结果补全缺失引用，不能替换模型伪造的 ID。最终校验及来源归属检查在装配后执行。

`Output.object({ schema })` 校验生成形状，不能代替上述业务校验。[S4] 传输 Schema 和领域 Schema 的差异、转换版本与测试样例一同登记。

### 7.2 窄归一化

保留已经确认的无语义差异兼容，例如本地记录中的首版 `benchmark: null` → 未提供。此类规则必须是显式白名单、带测试、记录版本。

需要先归一化的字段，应在传输 Schema 中明确允许该表达；不能先被 SDK Schema 拒绝，再声称后面的归一化会生效。

禁止猜测修改 `risk` 对象/数组、indicator 输入、仓位公式、买卖条件、数值单位和费率。不要将模型输出的任意代码作为策略执行。本轮不增加额外模型调用来自动修 JSON。

### 7.3 流消费规则

由执行器持有完整流生命周期，不能只调用 `streamText()` 而不消费，也不能只监听正文而遗漏错误与最终 usage。

必须同时处理：请求前异常、非成功 HTTP 响应、HTTP 200 中的错误体或流内错误、生成中断、结束原因、最终结构化结果和诊断元数据。SDK 的 `onError` 不能只是写日志后继续走成功路径。[S3] [S4]

部分兼容服务会发送 SSE 心跳；最终 usage 也可能位于独立尾帧，并重复 `finish_reason`。不能在第一次看到结束原因后提前断开或把计量尾帧当作第二次完成。OpenRouter 作为代表性兼容服务保留该契约样例。[S6]

成功交付候选必须满足：

1. 获得 SDK/Provider 对应的完整结束证据，不存在未处理的流内错误或取消。
2. 输出非空，结束原因不是截断、拒绝或未处理的工具调用。
3. 最终生成契约通过，完成白名单归一化后领域校验通过。
4. 当前执行器仍持有步骤提交权限，结果成功持久化。

部分 JSON、局部对象和仅 reasoning 输出只可用于内存中的进度判断，不能保存为正式候选或已完成研究结果。即使截断前的 JSON 恰好可解析，`finish_reason: length` 也不能冒充完整生成。

用量缺失不必把已完整生成的结果伪装成失败，但必须保留 `usageStatus` 和预算预留；是否允许实验继续，交给既有预算/费用规则判断。

## 8. 超时、取消与资源释放

### 8.1 统一超时语义

删除或替换共享链路中的孤立 30 秒时限，包括适配器、`completeWithFallback()` 和业务调用上限。保留用户显式配置，不通过 SDK 默认值覆盖。

建议初始策略如下，属于本项目的工程起点，需按真实任务分布验证，并非 Provider SLA：

| 时限 | 初始值/来源 | 语义 |
| --- | --- | --- |
| 整次 Provider 请求 | 现有 `timeoutMs`；未配置时 120 秒 | 从出站生成请求开始到完整接收与收尾；受任务绝对 deadline 约束 |
| 首个有效模型输出 | 默认 90 秒，并受总期限截断 | 正文或有效推理增量；不以 HTTP headers、空增量或 SSE 心跳充数 |
| 相邻有效输出间隔 | 默认 45 秒，并受总期限截断 | 有输出后长期不再推进 |
| 整个业务任务 | 策略沿用实验期限及既有暂停语义；研究使用新增冻结策略，默认创建起 300 秒 | 排队、工具收集、fallback、领取恢复不重置期限；截止后禁止新的生成/下游执行，允许完成必要的事实保存与资源清理 |

当前 SDK 提供对应的 `totalMs`、`firstChunkMs`、`chunkMs` 等控制；具体语义由锁定版本测试确认。[S3] 隐藏推理或不发送推理增量的模型可能长时间没有可见事件，应允许按模型覆盖首输出期限，而不是虚构进度。

记录 `timeToFirstEvent` 与 `timeToFirstText` 的区别。拿不到传输心跳时就不记录该指标，不为监测心跳重新实现 SSE 解析。

### 8.2 取消与租约

将用户取消、任务 deadline、请求 timeout 和 Worker 停机组合为统一取消信号，保留最先触发原因。用户取消不得触发 fallback。

前端关闭页面不取消已提交的后台实验；只有正式取消操作或服务端截止条件能取消它。Worker 停机应停止接收新任务、取消在途请求并尽力保存结果确定性与计量状态。

研究任务的总期限由本轮新增，不能把租约时长或执行器 startedAt 当作总期限。排队已耗尽期限时直接收敛，不再调用模型。工具执行信号也必须与任务信号组合，不能只有局部工具超时。

任务租约续期独立于模型内容进度。失去租约立即停止提交结果并尽力取消请求；不能因为模型持续输出就无条件认定仍拥有任务。所有计时器、监听器、reader 与并发槽位必须在结束、错误、取消路径释放。

Abort 代表本地停止等待，不保证上游停止生成或计费；不同 Provider 的取消支持不同。[S6] 不得因此将费用记为 0。

## 9. 错误分类与恢复规则

### 9.1 分类结果

接入层输出项目定义的错误信息，而不是让调用方匹配自由文本。包含 `code`、`phase`、脱敏 summary、结果确定性以及已获得的诊断/计量；可恢复性只描述证据，不授权 SDK 自行重试。

下列名称为本次设计的逻辑错误码；优先映射到已有错误契约，必要时增量扩展。

| 错误 | 典型场景 | 策略优化 | 研究助手已有 fallback |
| --- | --- | --- | --- |
| `configuration_invalid` / `capability_unsupported` | 本地参数、路由或能力不匹配，尚未发送 | 已知本地失败，不发送 | 可在发送前选择已配置的兼容候选，必须记录原因 |
| `authentication_failed` / `permission_denied` | 401/403 或账户授权问题 | 终止 | 不因凭证错误自动换路由掩盖配置问题 |
| `payment_required` | 额度不足 | 终止 | 终止，不自动切到付费路由 |
| `provider_rejected` | 明确限流/无容量拒绝，且没有生成开始证据 | 已知失败；本轮仍不自动重试 | 仅允许有限的、同模型且符合配置的 fallback |
| `transport_unknown` | 响应体超时、连接复位、断流、EOF 不完整 | `unknown_outcome`，禁止自动重放 | 不自动 fallback |
| `provider_stream_error` | 流内明确错误 | 生成失败；费用另行判断 | 不自动 fallback |
| `output_truncated` / `empty_output` / `refused` | 输出截断、仅空白、模型拒绝 | 已知生成未达标，不产候选 | 不自动 fallback |
| `schema_invalid` / `business_invalid` | 完整结果不满足约束 | 已知失败，保留已报告用量 | 不自动用另一次生成覆盖失败 |
| `cancelled` | 用户取消或明确任务停止 | 保留现有取消/步骤语义，外部计量可未知 | 不 fallback |
| `persistence_failed` | 完整结果已到达但提交失败 | 优先恢复保存，不重新生成 | 同样优先保存已有结果 |

**不能仅根据“拿到了 HTTP status”或 `error.isRetryable` 决定外部结果确定性。** 例如 502/504 不保证上游未开始生成；只有足够证据证明拒绝发生在生成前，才归入允许 fallback 的拒绝类，否则保守处理。[S6]

`providerResponded: boolean` 不再承担所有状态语义。至少分别保留：请求是否发起、流/响应是否完整、生成是否合格、用量是否完整、费用依据是否成立。

### 9.2 唯一重试责任

SDK 设置 `maxRetries: 0`，关闭 Provider 包内部额外重试；不传启用流恢复的配置，`onError` 不返回重试指令。当前主线中，`streamRetries: 0` 仍允许回调请求一次重试，因此不能仅检查数字为 0。[S3]

策略优化继续服从现有 `OptimizationAttempt` 规则：成功缓存可复用，失败不自动再试，未知结果禁止自动重放。人工再次生成使用正式新建入口与新幂等标识，不允许脚本重置历史终态。研究旧请求保持未知、未确认预留不释放；新任务使用独立预算，用户确认可能重复计费的风险。

研究助手保留同模型多 Provider 的配置能力，但将原来的“任何异常都 fallback”收紧为第 9.1 节白名单；单个逻辑生成默认最多 2 次出站请求（首次 + 1 次允许的 fallback），并服从更小的任务预算。尊重有效 `Retry-After`，等待超过剩余总期限则终止。每次请求使用独立 request ID，先落记录再调用。

禁止 SDK 自动重试、应用 fallback、BullMQ 重投递三层相乘。队列重投递必须先检查已保存的步骤/请求状态，不能直接重进 Provider。

## 10. 计量、预算与持久化

### 10.1 计量语义

在项目接口中增量引入以下语义，不将其直接等同于某个 SDK 字段：

| 字段组 | 必须表达的内容 |
| --- | --- |
| 结果 | 完整/不完整、结束原因、生成契约版本 |
| 用量 | input/output token 的已报告值或未知；`reported / partial / unknown` |
| 费用 | 金额、币种、来源与版本；`known / estimated / unknown` |
| 路由 | 请求 Provider/模型、实际模型、上游 Provider（有报告时）、配置版本 |
| 诊断 | request ID、Provider generation ID、失败阶段、各时间点 |

未知 token 在新接入契约中使用 `null` 或等价的显式未知类型。已有数据库整数列或旧 API 必须保留兼容数值时，附加完整性标记；所有预算、汇总与展示读取必须同时消费该标记。禁止将兼容占位 0 当成已确认无消耗。

Provider 实际返回的费用，与根据冻结单价推算的费用必须区分；后者不能冒充真实账单。币种未知不假定为 CNY 或 USD，不合并不同币种的金额。既有金额表示与精度规则不因 SDK 的 number 字段而降级。

### 10.2 预算规则

策略实验继续使用既有预算；研究任务新增服务端统一策略，在创建时冻结，不增加每次任务预算表单。配置入口为服务端 `AI_RESEARCH_POLICY_JSON`（新增），未配置时采用以下默认值；配置必须由服务端校验，不接受创建请求任意覆盖。

| 研究任务策略 | 默认值与规则 |
| --- | --- |
| maxAiCalls | 2，首次与最多一次白名单 fallback 共用 |
| maxInputTokens / maxOutputTokens | 100000 / 20000，按任务累计，fallback 不重置 |
| maxDurationSeconds | 300，从 createdAt 计算绝对 deadline |
| maxCost | 字符串 `"0"`，默认只允许具备免费依据的路由 |
| 币种与付费路由 | 免费模式不猜币种；显式开启付费必须同时配置正金额上限、币种、允许的 Provider/模型范围 |
| 每次输出预留 | 默认按累计输出上限除以最大请求数分配，再与模型/剩余限制取小值；自定义有效请求上限随策略冻结 |

每次出站生成前，以请求 ID 原子预留调用次数、输入/输出 Token 和可核算费用。输入预留沿用可解释的保守估计，不声称它等于 Provider 分词结果。取消、过期、失去执行权或路由被撤销时不得发送。

- 已发送失败请求计入次数；Schema 拒绝、超时或取消不免计量。未发送且有确定证据的请求释放其预留。
- 未知用量保留对应预留，部分已知只结算有证据的部分；不填确定的零消耗。已有完整合法结果可保存，全部剩余预算门禁仍满足时允许后续步骤继续。
- Token 完整且有冻结单价/币种时，允许估算费用参与预算，标记 estimated；获得上游实际金额时按差额幂等更新，不重复全额扣款。
- 实际费用/Token 超过预留或总上限时，先持久化真实消耗及合法结果，再标记 budget_exceeded 并停止后续模型与回测调度。预留上限是调用前门禁，不是拒绝记录已发生消耗的条件。
- 预算违规不把合法结果改写成生成失败；生成步骤可成功，实验沿预算耗尽路径终止，查询同时表达结果可读与后续停止。研究已生成结果仍可查看，并显示预算违规。
- 不可核算费用且无法依据预留与价格证明后续授权时，保留结果与未知状态并停止后续；不能用上述“有余额继续”规则跨过费用门禁。
- 原策略 `maxCost: "0"`、`acknowledgeUnknownCost` 和费用不完整约束保持；新增研究付费策略不能扩大策略实验授权。

按 request ID 记录“预留、已报告、估算、未确认”各部分，兼容累计数字不能覆盖事实。应用记录自己的出站请求和不确定发送窗口；不宣称逐次审计 OpenRouter 内部尝试，不配置策略跨模型备用列表。

### 10.3 存储位置与兼容

复用 AiRun.modelMetadata.sdkExecution 的版本化 JSON 区、checkpoint、OptimizationAttempt 和 Provider 配置 JSON。本设计不新增表/列；AiRun 的 executionAttempt 作为领取代次，与任务 ID、状态及租约共同构成写入条件。策略提交还校验 OptimizationAttempt ID、所绑定 aiRunId 和运行状态。跨表领取/提交在同一事务中核对受影响行数。

sdkExecution 保存契约/配置版本、冻结策略与 deadline、有限 requestAttempts、汇总完整性和 continuationBlockedReason。每条请求保存独立 requestId、序号、预留、发送状态、结果/流确定性、计量、计量修订及已结算修订。保留已有优化关联元数据，不用整个 modelMetadata 覆写方式丢失其他事实。

请求数组只保存小型结构化记录，不存提示词、原始响应、推理或 Token 流。JSON 更新须在持有执行权、锁定目标行的事务中进行；研究最多两条请求，不允许后台重排把数组重新初始化。

旧数值字段投影为已报告的兼容合计，并同时返回完整性。历史记录没有新标记时为 legacy_unknown，不批量宣称已核对。所有预算、API 汇总、详情和客户端必须消费完整性；多币种不汇总成一个金额，估算不冒充账单。

### 10.4 请求状态、提交与恢复

请求生命周期：

```text
prepared（已有预留，尚未授权发送）
  → dispatching（持久化发送授权，再调用 Provider）
  → completed（完整响应事实）或 unknown（无法确认外部结果）
  → 保存校验结果与计量修订、幂等结算
```

只有当前持有领取代次者能将 prepared 改为 dispatching。持久化 dispatching 与真正发送之间不能构成跨系统原子事务：此窗口崩溃按未知处理，保留预留，不能猜测未发送并重放。可观测发送次数与保守占用次数分别表达，maxAiCalls 约束两者的安全上界。

恢复 prepared 必须确认旧领取已失效并原子取得新代次；旧执行器随后无法取得发送授权。dispatching/unknown 不自动再次调用；completed 且合法 checkpoint 已保存时仅恢复提交。历史 running 研究任务缺少新版发送证据时保守收敛为未知，不沿原三次过期重排路径重进 Provider。

完整接收后，即使生成 Schema 不合法也先保留已获得计量。当前拥有执行权者在事务中写入响应/校验事实、计量差额与幂等修订，随后发布合法结果、步骤状态及后续门禁。对已发生消耗的超额检查不在事务内抛错回滚事实；以返回的 budget_exceeded 状态阻止后续调度。重复回调/提交/计量修订不能重复增减预算。

业务结果提交检查领取代次、状态、取消和租约；旧执行器的成功、失败、续租及 JSON 更新都不能覆盖新所有者或终态。失去执行权后停止业务写入并尽力取消，未能可靠记录的外部消耗保留为未知，不假装归零。

数据库暂时不可用时，仅对同一内存结果或已持久化合法 checkpoint 有限重试保存；工程默认最多 3 次，保存窗口为首次尝试起 10 秒，不重新生成或延长业务 deadline。若进程在持久化前死亡且无可靠 checkpoint，标记未知，不承诺上游 exactly-once。取消/业务 deadline 后仍允许现任所有者在受控事务中保存计量事实；不得借收尾继续模型、工具或回测工作。

已保存候选后回测失败，复用候选并检查冻结输入后恢复下游；不放宽 Data Artifact 门禁。

## 11. 两条调用链的接入要求

### 11.1 策略优化与探索

复用现有严格 Provider 路由、步骤 claim、预算预留、成功提案缓存与候选去重。将生成契约传入 Provider 层，以结构化结果替代原始正文猜测。

必须验证参数优化和 discovery 两种模式；保留已有 `benchmark: null` 兼容及仍适用的 Prompt 语义约束，输出形状按第 7.1 节更新。接入证据不替代完整回测证据；回测可比性、封存与采纳继续遵守关联 Spec。

### 11.2 研究助手执行与再次生成

研究任务使用第 10 节新增的冻结策略、领取代次和请求记录。保留“服务端工具先执行、生成研究结果”的模式及工具权限、审计、account/mode 隔离。证据已收集后不向 SDK 声明可执行工具，不机械转换 tools:string[]，不引入自主工具循环。

保留 ResearchResult V1 与确定性引用补全；验证 toolCallId、sourceId 和上下文归属，拒绝伪造或跨账户证据。Prompt、Schema 与实际输入快照版本一致。

沿用 POST /ai/runs 与 retryOfRunId 关联新任务；失败研究任务的“再次生成”预填原 question、context 和可用模板，用户可以检查/修改后确认。服务端校验来源确为可访问的失败研究任务、原任务关联及新的上下文权限；引用删除、失效或无权限时阻止提交并提示，不静默改成 portfolio。失效引用可由用户明确重新选择后再提交。

外部结果未知时，表单明确提示旧请求可能已生成或计费、旧预留不返还，并要求显式风险确认；服务端校验该确认，不只靠按钮文案。新任务关联来源 ID，使用当前冻结策略/路由并重新执行工具取证，不复用旧证据冒充最新资料。普通失败不附加未知计费警告。

### 11.3 API 与既有界面消费

AiProvider 配置/列表 API 增量提供上游格式、条件性 Chat 实现、模型执行配置、声明来源、就绪状态/阻断原因与三类独立验证状态；内部 Provider 包名只作为服务端诊断事实，不成为客户端可写字段。设置页沿用现有编辑与保存流程，增加上述配置及恢复入口；连接测试结果保持独立标记，不自动切换就绪。

AiRun 列表/详情提供版本化执行摘要：冻结预算及 deadline、生成/计量状态、请求摘要、结果可读性和后续停止原因。usage 汇总提供已报告部分、未知/历史未核对数量、估算状态及按币种分组费用。旧数字只作为兼容投影；中文界面不将部分合计显示为确定总额。

必要界面改造属于本轮：Provider 就绪与配置、研究再次生成上下文/风险确认、研究与策略详情的未知/估算/超预算说明、发现策略交易成本来源。保持当前布局和查询交互，不增加每次研究的预算表单或新的聊天界面；请求、缓存及竞态沿用 TanStack Query。

### 11.4 Fixture 与兼容 Provider

保留 `FixtureAiProvider` 作为确定性测试实现，并符合新的结果完整性契约；继续明确标记 fixture。禁止真实调用失败后自动切 fixture，也不得以 fixture 通过替代真实 Provider 验收。

对现有 OpenAI-compatible 端点通过 `@ai-sdk/openai-compatible` 验证，不继续在主路径保留“任意接口返回任意 envelope 都尝试猜测”的兼容逻辑。不符合所声明协议的返回应明确报协议错误或通过独立、经过测试的兼容配置处理。

## 12. 诊断与安全

默认保留：业务运行 ID、步骤 ID、请求序号、SDK/adapter 版本、请求与实际模型、配置版本、Schema/Prompt 版本、HTTP status、content-type、白名单请求标识、结束原因、时间统计、用量与费用完整性、脱敏错误码和限长摘要。

允许从底层异常中提取白名单网络原因，例如连接复位、socket 关闭、DNS 失败和 timeout；不能仅留下 `fetch failed`。拿不到字段时留空，不能猜测上游是否执行。

默认禁止记录 API Key、Authorization、Cookie、完整提示词、账户敏感数据、完整 Provider body、原始推理文本及每个 token。上游错误文本也可能回显输入，须脱敏、截断并限制长度；不要将完整异常对象直接交给日志系统。

SDK telemetry 的输入与输出记录必须显式关闭，并以测试确认不会因 SDK 默认值变化而泄露内容。[S3] 已有合法业务结果存储不等同于全量诊断日志，可继续按现有访问控制保存。

本轮不增加收费观测平台。诊断依托既有数据库与日志；需要短期原始响应调试时，另行显式开启受限、限时的运维方案，不作为默认行为。

## 13. 交付顺序与责任边界

对应 [Task](../tasks/2026-09-19-vercel-ai-sdk-integration.md) 是实施范围、依赖和证据的唯一事实源。

顺序为：基线/版本 → 项目契约 → 状态持久化与 SDK/路由 → 策略本地纵向闭环 → 研究执行闭环 → API 与界面消费 → 部署与独立真实门禁。共享契约、状态存储、执行器、消费端分别有可验收交付，不能由最后一个门禁兜底实现。

本轮不将研究助手新增的期限、预算或防重放描述为既有能力；不将 JSON/fixture/静态测试当作真实 Provider 证据。所有实施任务初始未完成。

## 14. 验收标准

### 14.1 自动化验收矩阵

SDK mock 用于确定性结果测试；本地 HTTP/SSE 服务用于真实 Provider adapter 的请求形态与流解析测试。只有 mock 而没有经过实际 adapter 的 HTTP 测试，不足以验证本次迁移。[S8]

| 编号 | 场景 | 必须满足的结果 |
| --- | --- | --- |
| AC01 | 原生结构化正常返回 | 最终对象通过生成与领域校验；只发一次请求 |
| AC02 | HTTP 200、响应体读取超时 | 保留 timeout 阶段，不能误报缺少 content |
| AC03 | headers 已到、正文未到 | 首输出时限生效；HTTP 200 不被视为成功 |
| AC04 | SSE 心跳持续但无有效输出 | 不被心跳无限延长；总期限与首输出期限仍生效 |
| AC05 | 有效推理增量先到，正文后到 | 不因尚无正文误判无进度；不保存推理文本 |
| AC06 | 正文/推理流中断、异常 EOF | 不生成候选；记录不完整/未知外部结果 |
| AC07 | HTTP 200 中的显式 error 事件 | 失败被业务层感知；不能只在 onError 打日志 |
| AC08 | 最终 usage 尾帧与重复 finish_reason | 完整读到尾帧，只提交与对账一次 |
| AC09 | 空白、仅 reasoning、refusal、length | 不作为可用候选或研究成功结果 |
| AC10 | 部分 JSON 或截断前恰好可解析 | 不接受为完整结果 |
| AC11 | `risk` / `sizing` / indicator 结构错误 | 严格拒绝，不猜测修改业务语义 |
| AC12 | 白名单 `benchmark:null` 归一化 | 传输 Schema 可接受；归一化后领域 Schema 仍严格 |
| AC13 | Schema 失败但 usage 已报告 | 计量被保留，调用预算照常消耗 |
| AC14 | usage 全缺失或部分缺失 | 显式完整性，未确认预算不释放，不能显示确定的 0 消耗 |
| AC15 | SDK 默认重试/流恢复路径 | HTTP 计数证明 `maxAiCalls:1` 只生成一次；回调也不能要求重试 |
| AC16 | 策略步骤及研究请求恢复 | 失败/unknown 不自动再生成；已保存结果复用；历史研究租约过期不盲目重放 |
| AC17 | 研究助手允许的拒绝类 fallback | 同模型、允许路由、最多一次 fallback；两次请求分别留痕 |
| AC18 | 研究助手断流、超时或取消 | 不 fallback、不重置任务总期限 |
| AC19 | 零费用预算与路由变化 | 不进入收费或未获授权的未知费用路由 |
| AC20 | 参数能力不支持 | 未就绪发送前阻断；真实明确失配撤销受影响组合；不静默丢参数、换模型或降级 |
| AC21 | 任务取消、Worker 停机、租约丢失 | 取消向下传播；释放资源；旧 Worker 不能提交 |
| AC22 | 结果到达后数据库写入失败 | 优先重试保存；无可靠 checkpoint 时不猜测恢复成功 |
| AC23 | 对账中途崩溃与重复回调 | request ID 幂等标记防止重复增减预算 |
| AC24 | 配置热更新与旧配置启动 | 在途参数保持冻结；旧配置优先级/密钥保留；未就绪阻断，相关指纹改变重新计算就绪 |
| AC25 | 研究引用和权限 | 不接受伪造 toolCallId / 跨账户证据；不新增自主工具执行 |
| AC26 | 脱敏与 telemetry | 日志和持久化诊断中没有密钥、完整提示词或原始推理 |
| AC27 | 回测失败 | 已保存合法候选不被重新生成；Data Artifact 门禁保持 |
| AC28 | Fixture / 通用兼容 Provider | 各自契约通过；真实失败不会切换 fixture |
| AC29 | 队列等待、fallback、慢尾帧 | 不重置绝对 deadline；结束或取消后无计时器/流资源泄漏 |
| AC30 | 研究执行策略 | 默认 300 秒、2 请求、累计 100000/20000 Token、零费用；创建时冻结，排队与恢复不重置；付费需金额/币种/路由配置 |
| AC31 | 超额事实结算 | 实际用量/金额超预留或上限仍幂等保存；合法结果可读；后续模型/回测停止；事务重试不丢账 |
| AC32 | 未知用量且有剩余额度 | 保留预留与完整性，预算/费用授权仍满足时可继续；不足或不可证明授权时阻断 |
| AC33 | 估算、实际费用与汇总 | 冻结单价估算有来源，实际金额按差额对账；历史/部分合计不冒充完整总额，多币种分组；API 与 UI 一致 |
| AC34 | 接入就绪与能力声明 | 可信目录或有来源的人工声明加实际 adapter 本地契约证据；与连接健康及真实验收分离；UI 可解释并更正配置 |
| AC35 | 两种生成模式 | 显式 json_validated 发送受支持路径且本地严格验收；native_schema 失败不降级；就绪证据按模式/契约匹配 |
| AC36 | discovery 精简契约 | 仅接受约定可变字段；固定源 ID/标的/周期/执行规则与 seed 成本由服务端装配；series 可探索且引用有效；旧完整结果按版本复用 |
| AC37 | 再次生成 | 新 ID、新预算；原问题/上下文/模板预填并确认，失效或越权引用阻断；未知结果需服务端风险确认，旧事实与预留不变 |
| AC38 | 发送窗口与领取竞争 | prepared 与 dispatching 转换原子；发送授权后崩溃按未知；旧领取不能发送/续租/终态写入；请求数组和其他元数据不被覆盖 |
| AC39 | 分阶段切换、部署与回滚 | 两链路独立本地验收；同一稳定输入完整更新 Docker；未就绪无 legacy 绕行；回滚保留新事实与门禁 |
| AC40 | 受控真实验证 | 三类各有完整合法结果，总出站不超过 10 次，仅有依据免费路由；同类外部错误连续 3 次停止；未完成保持阻塞 |
| AC41 | 新建时切换为 AI | 保持同一个 Drawer 和已输入名称，不通过关闭后重开另一个编辑器切换 |
| AC42 | 新建 AI Provider 默认值 | base URL、模型列表和厂商信息为空；不预填 OpenRouter URL、模型或厂商选项 |
| AC43 | 上游格式与 Vercel Provider | 页面只显示三种上游格式；Chat 下显式选择通用兼容或 OpenAI 原生；服务端不按 base URL 改变 Provider 实现；四条显式调用路径均有本地 HTTP 契约测试 |
| AC44 | OpenRouter 兼容迁移 | 旧配置的只读扩展标记可追溯且不由 URL 产生；移除专用包后，已使用的 reasoning、路由约束及 usage/cost 均有白名单映射和出站证据；不能等价迁移时阻断执行，不静默放宽或填零 |
| AC45 | 分层验证 | 模型目录、最小生成、业务结构化生成分别保存结果；模型目录失败允许手动填写，任一成功不冒充另一类能力通过 |
| AC46 | 编辑状态与验证竞态 | 切换格式或修改地址、模型时保留名称和不冲突字段、使相关验证过期；旧异步结果不能覆盖新草稿状态 |
| AC47 | Provider 类型统一编辑流程 | 普通与 AI 共用同一个编辑器、草稿协调器和类型选择器；类型可双向切换；名称、启用状态和优先级保留；类型专属字段不泄漏到目标接口 |
| AC48 | Provider 类型转换保存 | 数据库来源的同名 Provider 可按最终类型保存并更新；目标类型接口校验自己的字段和凭证；环境来源配置切换后必须重新提交凭证，不静默覆盖部署配置 |

### 14.2 真实调用验证

真实验证必须使用执行环境中的正式配置和与实际业务等价的完整提示词，不能只请求 `{"ok":true}`。记录当次源码/配置/Schema/SDK 版本，以及请求与实际模型。

至少覆盖参数优化、策略探索和研究助手三类，每类取得 1 个可追溯的完整合法结果；另用代表性输入做一个**总生成请求不超过 10 次**的受控样本批次。三类验证计入该总上限，不额外隐藏探针或重试。

本轮真实验证总费用上限固定为零，只使用具有第 6.4 节依据的免费路由；执行前固定模型允许列表及每次预算，不为验收调用付费模型。能力就绪检查本身不隐式发起真实生成；手动连接测试或真实能力探针一旦发出生成请求也计入本轮 10 次账本。超出上限或同一外部错误连续出现 3 次立即停止，记录外部阻塞，不继续换模型碰运气。

报告样本数、首轮完整率、Schema 合法率、首输出与总耗时、错误分布、用量/费用未知占比和每个合法结果的实际请求次数。只有 10 个以内样本时不宣称已证明长期 SLA，也不以“连续成功一次”证明稳定性。

**工程测试通过、真实 Provider 接入通过、完整策略回测闭环通过是三个不同结论。** 外部限流导致真实验证未完成时，相关验收保持未通过/外部阻塞；候选生成合法但回测数据不一致时，不否定已验证的 SDK 传输，也不能勾选整个策略闭环。

### 14.3 分层验证

按定向测试 → 包级测试及 typecheck/build → 仓库门禁 → 隔离数据库/目标 Docker/真实 Provider/浏览器逐级执行。数据层定向集成可使用隔离 PostgreSQL，不能用 mock 证明事务/领取竞争；跳过不算通过。

具体命令、任务覆盖、输入范围和最后结果维护在 Task。改了共享 Schema 或客户端时验证对应包；修改运行时 package manifest 必须走完整 Docker 更新。只读文档核验不触发构建、部署、真实生成或现有数据变更。

## 15. 上线、回滚与完成定义

策略先完成本地闭环，再完成研究链路；实际目标运行态在主要源码与启动输入稳定后统一更新一次。引入 Server 运行时依赖，必须使用相邻 infra 的 `./scripts/update.sh thesis-ledger`，不能以 sync-code、直接 compose build/up、docker cp 替代。复用同一镜像执行故障场景，记录输入版本与真实容器状态。

切换以业务链路为单位，首次发送前固定实现并记录版本；切换后的未就绪路由立即停用，不绕行 legacy。没有会增加生成次数的 shadow 双跑或失败后 legacy 再请求。两条链路本地契约/集成通过后清理重复手写协议，真实验收仍是独立完成门禁。

发布前停止新领取，处理在途取消/租约，保留未知请求与预算。回滚目标必须能读取新版计量并维持未就绪阻断、防重放与超额事实规则；不满足时先保持任务停用并使用兼容读取修复版本，不能直接恢复旧盲重试/零占位逻辑。回滚演练验证历史结果、请求记录和冻结配置不被重置。

完成必须同时满足：可复现依赖、自动化断言、两条链路持久化闭环、API/界面消费、真实 Docker 与浏览器证据、三类真实合法结果及可执行回滚。任何外部条件缺失保留对应门禁未完成，不用部分结果替代整个功能验收。

### 15.1 未决问题与实施前提

- 阻塞性产品/语义问题：无，本轮设计访谈已确认。
- 明确默认：研究统一策略见第 10.2 节；有限保存重试见第 10.4 节；不新增数据库表列，使用既有 JSON 与领取代次。若现有存储无法满足原子约束，必须先修订 Spec/Task 并独立安排结构升级，不能暗中扩大范围。
- 实施前提：T0 仍需验证实际发布版本、安装环境、完整消费者清单；真实免费路由/凭证/网络、目标 Docker 与浏览器属于待核验环境条件，不是已完成事实。
- 主要风险：免费模型可用性和 Schema 支持变化；能力声明可能与真实端点不一致；旧研究任务无发送证据只能保守未知；配置的零交易成本不代表现实费用。以上均有阻断/标记与独立验收规则，不改变成功标准。

## 16. 非目标与后续边界

策略自动重试、通用对账平台、服务商原生后台任务、聊天流式 UI、断线恢复和交易成本配置编辑器均不在本轮承诺内。本轮已包含的再次生成入口、研究期限/预算/恢复、必要界面及真实验收不能移入后续项。

当前没有新确认的延期实施项，不新增 TODO。将来若明确立项后续工作，按 [文档指南](../DOCUMENTATION-GUIDE.md) 建立对应 Spec/Task 或正式 TODO 索引。

## 17. 参考与来源

项目事实来自本轮当前工作树核查，未将下载初稿中的远端 main 或历史运行记录当作当前部署证据。下列官方文档为原方案及本轮评审核对的参考；其 main 内容会更新，实际发布版本与能力由 T0/T3 的版本化证据确认。

### 项目基线

- [AiProvider 契约](../../apps/server/src/ai/contracts.ts)、[适配器](../../apps/server/src/ai/provider-adapters.ts)、[路由](../../apps/server/src/ai/provider-registry.ts)。
- [研究执行器](../../apps/server/src/ai/ai-research.executor.ts)、[任务服务](../../apps/server/src/ai/ai-run.service.ts)、[租约恢复](../../apps/server/src/ai/ai-run-recovery.ts)。
- [候选服务](../../apps/server/src/strategy-optimization/strategy-optimization-candidate.service.ts)、[预算服务](../../apps/server/src/strategy-optimization/strategy-optimization-run.service.ts)、[discovery](../../apps/server/src/strategy-optimization/strategy-optimization-discovery.ts)。

### 官方文档与源码

[S1]: https://github.com/vercel/ai/blob/main/packages/ai/package.json
[S2]: https://github.com/OpenRouterTeam/ai-sdk-provider/blob/main/package.json
[S3]: https://github.com/vercel/ai/blob/main/content/docs/07-reference/01-ai-sdk-core/02-stream-text.mdx
[S4]: https://github.com/vercel/ai/blob/main/content/docs/03-ai-sdk-core/10-generating-structured-data.mdx
[S5]: https://openrouter.ai/docs/guides/features/structured-outputs
[S6]: https://openrouter.ai/docs/api_reference/streaming
[S7]: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
[S8]: https://github.com/vercel/ai/blob/main/content/docs/03-ai-sdk-core/55-testing.mdx
[S9]: https://openrouter.ai/docs/guides/community/vercel-ai-sdk
[S10]: https://ai-sdk.dev/providers/ai-sdk-providers/openai
[S11]: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
[S12]: https://ai-sdk.dev/providers/openai-compatible-providers

| 引用 | 主题 |
| --- | --- |
| [S1] | Vercel AI SDK Core 的依赖、Node、Zod 约束 |
| [S2] | 当前 OpenRouter 专用 adapter 的历史依赖与迁移输入，不是目标依赖 |
| [S3] | 流、超时、重试、取消及 telemetry；以锁定版本为准 |
| [S4] | `Output.object`、生成契约与结构化流 |
| [S5] | OpenRouter 端点级结构化能力和严格模式限制 |
| [S6] | 心跳、usage 尾帧、流内错误及取消边界 |
| [S7] | 推理 token 与预算关系 |
| [S8] | mock provider 与流测试工具 |
| [S9] | OpenRouter 专用 adapter 的历史行为对照，用于验证兼容迁移，不作为目标选型 |
| [S10] | OpenAI Provider 的 `chat()` / `responses()` 能力与自定义 base URL |
| [S11] | Anthropic Provider 的 Messages API、`messages()` 与鉴权能力 |
| [S12] | OpenAI Compatible Provider 的 Chat Completions、Provider options 与元数据扩展 |
