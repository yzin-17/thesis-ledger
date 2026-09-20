# AI 接入层迁移至 Vercel AI SDK 实施任务

> 任务标识：`2026-09-19-vercel-ai-sdk-integration`
> 创建日期：2026-09-19
> 对应 Spec：[AI 接入层迁移至 Vercel AI SDK](../specs/2026-09-19-vercel-ai-sdk-integration.md)
> 状态：实施中；T0–T11、G0 已完成，G1 因真实上游连续限流阻塞，G2 待执行。

## 1. 执行边界

- 规划阶段只生成文档；2026-09-19 已开始实施，当前已完成 T0–T11 与 G0。策略生成和 Research Assistant 已切换到 SDK 请求事实链路，目标 Docker 已更新并完成受控故障与兼容回滚验收；G1 已发起真实上游请求，但触发连续 3 次同类限流停止条件，未取得合法结果；浏览器验收尚未执行。
- 保留当前工作树已有修改；实施前记录提交、相关未提交 diff 与配置指纹，不拿远端旧实现覆盖本地。
- Spec 是行为与验收事实源，本 Task 维护交付、依赖和证据。按状态持久化、执行面、消费面、部署验收拆分；先 T5 策略本地闭环，再 T6 研究链路。
- 每项任务自带定向验证；G0–G2 不接收缺失核心实现。真实免费模型受限不阻断其他已就绪的本地任务。
- 当前方案使用既有 JSON、checkpoint、executionAttempt 及步骤绑定，不新增数据库表列。若 T2 证明必须改结构，先修订 Spec/Task 并增加独立结构任务，维护新增 migration、matrix、raw-owned inventory、打包输入和结构门禁；不改历史 migration，不隐式重建开发库。

## 2. 实施任务

- [x] T0：核对基线、调用清单与锁定发布版本。
  - 覆盖验收：AC24、AC28、AC39。
  - 依赖：无。
  - 范围：Server/workspace manifest、lockfile、开发/CI/Server/Worker Node；所有生成、连接测试、探针、fallback、计量消费入口。
  - 交付与完成条件：精确锁定已发布兼容版本；最小导入/build 无 peer 冲突。记录相关 dirty diff、配置优先级和旧协议特例，不从 main 或 @types/node 推断运行能力。
  - 验证方式：版本查询、实际导入/构建与调用点清单；不访问真实模型。连接测试可能含二次生成，必须列入 T4。
  - 实现状态：已完成。Server 精确锁定 `ai@7.0.95`、`@openrouter/ai-sdk-provider@3.0.0` 与 `@ai-sdk/openai-compatible@3.0.45`；lockfile 解析为 `zod@4.4.3`、`@ai-sdk/provider@4.0.11`、`@ai-sdk/provider-utils@5.0.37`。未采用发布仅约一天且会触发供应链年龄豁免的 `ai@7.0.106`，仓库未保留该豁免。
  - 运行时基线：开发机 `Node v24.18.0`、`pnpm 11.9.0`；CI 为 Node 24；Server build/runtime 镜像均为 `node:24-alpine`，同一镜像中的 Server 与 backtest Worker 共用 Node 24。锁定 SDK 要求 Node `>=22`，OpenRouter adapter 要求 `ai ^7.0.0` 与 `zod ^3.25.76 || ^4.1.8`，当前组合满足。
  - 调用清单：研究旧服务入口 `AiRunService.runResearch` 与后台 `AiResearchExecutor.execute` 均经 `completeWithFallback`；参数优化与 discovery 共用 `StrategyOptimizationCandidateService.generateProposal` 且严格选择 Provider/Model；`runProviderConnectionTest` 直接生成最小 JSON，推理模型分支最多可能发出三次探针，T4 必须消除其隐式二次/三次生成语义。计量写入由 `AiRunService.finishResearch`、候选服务的 AiRun 更新以及 `StrategyOptimizationRunService.reconcileTokens/reconcileCost` 消费，汇总入口为 `AiRunService.usageSummary`。
  - 配置与旧协议：数据库同名配置覆盖环境配置，数据库禁用项也抑制同名环境 Provider；环境内 `AI_PROVIDER_CONFIGS_JSON` 优先装配，旧的 `AI_PROVIDER_ID/AI_BASE_URL/AI_API_KEY/AI_MODEL` 仅补充未占用 ID，fixture 仅在显式开关或测试环境加入。旧 adapter 固定调用 `/chat/completions`，同时兼容 fenced JSON、Responses envelope 和缺失 usage 置零；这些特例只能在 T3 明确保留为独立兼容配置或删除，不能无界猜测协议。
  - 基线与污染边界：实施起点为 `8648d006895e175913db33d52e1f198fe534c96d`（`main`）。目标相关范围在实施前已有 38 个修改文件和 7 个未跟踪文件，含 `contracts.ts`、`provider-adapters.ts`、策略优化、Schema/api-client 与 Desktop；本任务不覆盖这些改动。配置源码指纹为 `config.ts d46f9e54…`、`provider-adapters.ts 68a0fdec…`、`ai-provider.service.ts ffa6a80d…`、infra compose `d4cd9455…`。
  - 定向验证：通过；`rtk pnpm install --frozen-lockfile`；在 `apps/server` 实际导入 `generateText`、`streamText`、`Output`、`createOpenRouter`、`createOpenAICompatible`；`rtk pnpm --filter @thesis-ledger/server build`。证据只证明依赖、peer、Node 与当前脏工作树可构建，不证明 adapter 已迁移、真实 Provider 可用或容器已更新。

- [x] T1：建立项目自有生成与执行契约。
  - 覆盖验收：AC01、AC11–AC14、AC24、AC30、AC33–AC38。
  - 依赖：T0。
  - 范围：ai/contracts.ts、所属业务生成 Schema、共享 API 类型及 api-client；SDK 类型只留在接入模块。
  - 交付与完成条件：三类版本化生成契约、错误/计量、声明/就绪、冻结研究策略、请求/结算修订、读模型、再次生成确认字段都有唯一所有者和共享样例。精简 discovery 与白名单归一化遵守 Spec §7。
  - 验证方式：Schema、序列化与兼容投影测试，包含 null/partial/legacy_unknown、估算/币种、固定字段拒绝、引用补全边界；禁止客户端预算覆盖或伪造 ready。
  - 实现状态：已完成。`packages/schemas/src/ai-execution.ts` 统一拥有三类生成契约版本、项目错误分类、结果确定性、Token/费用完整性、请求生命周期、计量/结算修订、研究冻结策略、能力声明、本地 adapter 证据、接入就绪、真实验收、执行/汇总读模型与再次生成预填；SDK 类型未进入共享包。api-client 只复用并导出项目自有类型。
  - 业务契约：参数优化继续复用严格 changes 契约；discovery 新增只允许 `name/description/series/entry/exit/sizing/risk` 的精简生成 DTO，固定标的、周期、执行、成本及 SignalSource ID 不可由模型提交；研究生成 DTO 不允许模型提交 Provider、context、版本或审计时间，只允许通过 toolCallId/sourceId 进入后续确定性引用补全。冻结 seed 的交易成本来源及零成本假设另有读模型。
  - 安全与兼容：研究默认策略固定为 300 秒、2 次、100000/20000 Token、`maxCost: "0"`；付费策略必须同时具备正金额、币种和 Provider/模型范围。Token 用 `reported/partial/unknown` 与 nullable 值表达，历史读模型另有 `legacy_unknown`；费用区分 known/estimated/unknown 和币种/来源。客户端研究创建 Schema 仍严格拒绝预算及 `ready` 字段；再次生成确认字段已进入共享契约，但强制来源状态与访问权校验留给 T8，未提前破坏现有入口。
  - 定向验证：通过；共享契约 28 项定向测试覆盖 null/partial/legacy_unknown、估算/币种、请求修订连续性、发送授权、默认/付费策略、声明/就绪/真实验收分层、固定字段拒绝、引用边界、再次生成预填与客户端伪造；`strategy-optimization-discovery.test.ts` 7 项通过，包含 `benchmark:null` 白名单归一化。`@thesis-ledger/schemas` 全量 22 文件/207 项通过并完成 typecheck/build；api-client 18 项、typecheck/build 与 Server build 通过。
  - 仓库门禁：`scripts/check-boundaries.mjs`、`scripts/check-workspace-dependencies.mjs`、文件尺寸门禁与 `git diff --check` 通过。改动文件定向 ESLint 无 error；`strategy-optimization.ts` 保留已有 complexity 21 warning。全仓复杂度入口仍被 `apps/mobile/node_modules/react-native/index.js` 的 Flow 语法解析基线问题阻塞，未记为通过，也未修改该无关依赖。
  - 证据边界：只证明共享契约及兼容投影可供后续实现消费；尚未证明 JSON 事务原子性、SDK 流、Provider 就绪计算、业务链路或真实请求。

- [x] T2：落实领取、请求事实与幂等预算结算。
  - 覆盖验收：AC13、AC14、AC16、AC21–AC23、AC31–AC33、AC38。
  - 依赖：T1。
  - 范围：AI 所有的 AiRun JSON/checkpoint 与 executionAttempt；策略模块所有的 OptimizationAttempt 绑定及预算账户，单向协作。
  - 交付与完成条件：prepared→dispatching 原子授权；JSON 事务更新保留其他元数据；未知预留不释放。旧领取不能发送/续租/终态写入。实际超额仍保存事实及合法结果，再阻断后续；估算转实际仅结算差额。
  - 验证方式：隔离 PostgreSQL 竞争与故障测试：双领取、迟到、发送授权后崩溃、事务失败、重复回调/修订、超额、部分计量、历史记录及 JSON 并发。mock 不算事务证据。
  - 实现状态：已完成。AI 模块新增 `AiExecutionStateStore`，在锁定 `AiRun` 的事务内初始化并增量维护 `modelMetadata.sdkExecution`，通过 `executionAttempt`、运行状态与租约共同约束请求准备、prepared→dispatching 授权、续租、unknown 收敛和终态写入；请求修订冲突失败、相同修订重复提交幂等返回，其他 `modelMetadata` 字段不被覆盖。策略模块新增 `StrategyOptimizationAiSettlementStore`，单向消费 AI 事务 participant，并继续拥有 `OptimizationAttempt` 绑定和 `OptimizationExperiment` 预算账户。
  - 结算语义：首次结算从已预留值向实际值只更新差额；部分或未知字段继续保留对应预留，不按 0 释放。实际 Token/费用超过预留或总预算时，先在同一事务保存真实计量、合法结果、checkpoint 与成功提案，再写入 `budget_exceeded` 阻断后续；费用无法证明授权且没有可保留估算时写入 `cost_unknown`。重复回调不重复增减预算，participant 后段失败会回滚预算、AiRun 和步骤终态的全部写入。
  - 隔离 PostgreSQL 证据：专用无卷 PostgreSQL 16 应用当前全部 13 条 migration 后，`ai-execution-state-postgres.integration.test.ts` 7/7 通过，覆盖双领取、双发送授权、旧领取发送/续租/终态拒绝、授权后崩溃转 unknown、未知预留、JSON 并发与历史元数据保留、部分计量、估算转实际差额、实际超额但结果可读、实际费用币种不一致时保留冻结估算并阻断、重复回调、冲突修订和 participant 后段故障事务回滚。该容器未连接目标开发库，并在验证结束后删除。
  - 包级与门禁：Server 全量 114 个文件/719 项测试通过，12 个需显式环境的集成文件共 40 项保持跳过；Server build、定向 ESLint、import boundaries、workspace dependency graph、文件尺寸 ratchet 与 `git diff --check` 通过。文件尺寸入口仅报告 13 个既有超阈值 warning；T2 新文件未越线。T5/T6 尚未把两条业务执行链切换到该 Store，本项证据只证明 T2 持久化和事务原语，不提前宣称 SDK 或业务链路验收。

- [x] T3：实现 SDK 单请求与完整流适配。
  - 覆盖验收：AC01–AC10、AC12–AC15、AC20、AC21、AC26、AC28、AC29、AC35。
  - 依赖：T1。
  - 范围：AI 接入模块、OpenRouter/实际通用兼容 adapter、错误映射、fixture。
  - 交付与完成条件：显式两种模式、细分超时与取消组合、尾帧/错误/usage 提取；SDK/Provider/回调不隐式重试；不提前接受 JSON/length；遥测输入输出关闭，错误与资源释放均受控。
  - 验证方式：SDK mock 加本地 HTTP/SSE 经过真实 adapter 包；断言请求形态/次数、推理进度/心跳、尾帧、HTTP 200 error、EOF、拒绝、截断、坏 Schema、未知计量与脱敏。
  - 实现状态：已完成。AI 模块新增 `AiSdkGenerationAdapter`，只暴露项目自有请求、结果与错误类型；按配置选择锁定版本的 OpenRouter 或 OpenAI-compatible adapter，显式区分 `native_schema` 与 `json_validated`，并统一关闭 SDK 遥测输入/输出记录、SDK 重试和流重试。单请求在完整结果返回后校验结束原因与 Schema；流请求完整消费 reasoning/text/error/abort 和最终 output、usage、响应元数据，未从 SSE 注释伪造业务心跳。
  - 生命周期与事实：组合调用方取消信号与 SDK 的 total/first-chunk/chunk timeout；`length`、拒绝、HTTP 错误、HTTP 200 error、提前 EOF 和取消均进入项目错误分类。兼容 adapter 自定义 usage 转换，保留缺失 token 为 null/partial 而不是 SDK 默认的 0；失败后已观察到的 usage 继续随错误返回。错误摘要裁剪并脱敏 Authorization/API key，OpenRouter 的 Provider cost 只在实际元数据存在时记录。
  - 定向验证：SDK boundary mock 1/1 与真实 adapter 的本地 HTTP/SSE 13/13 通过；覆盖两种请求形态、OpenRouter reasoning、`provider.require_parameters=true` 与允许上游参数、请求次数为 1、完整流和 usage-only 尾帧、reasoning 进度、SSE 注释、三类 timeout、调用方取消、HTTP 401 脱敏、HTTP 200 error、EOF、拒绝、截断、坏 Schema、失败计量、部分/未知 usage 和不支持能力的请求前拒绝。定向 ESLint 与 Server build 通过。
  - 包级与门禁：Server 全量 116 个文件/733 项测试通过，12 个需显式环境的集成文件共 40 项保持跳过；import boundaries、workspace dependency graph、文件尺寸 ratchet 与 `git diff --check` 通过。文件尺寸入口仅报告 13 个既有超阈值 warning。该证据不等于 Provider 接入就绪、真实 Provider 验收或业务链路切换；这些分别留给 T4、G1 与 T5/T6。

- [x] T4：建立配置、接入就绪与能力撤销门禁。
  - 覆盖验收：AC15、AC19、AC20、AC24、AC28、AC34、AC35。
  - 依赖：T1、T3。
  - 范围：AiProviderService、Registry、AI 专用配置/连接测试 API 和环境读取；不修改 DSA Provider 系统。
  - 交付与完成条件：就绪由声明、发布版本本地契约证据及配置指纹计算；未就绪阻断，人工声明与真实验收分离。免费需依据，付费需授权；明确失配仅撤销受影响组合。热更新不替换在途参数，撤销阻断下一次发送。
  - 验证方式：API/registry/HTTP 测试：伪造 ready、指纹变化、旧配置、代理、免费证据、health=down 排除、混合就绪模型；连接测试不得隐式再生成或授予 Schema 能力，就绪检查不发真实请求。
  - 实现状态：已完成。AI Provider 配置新增显式 `adapter` 与按模型/模式/生成契约保存的 `executionRoutes`，包含能力声明、允许上游、超时覆盖和结构化免费依据；数据库 JSON 与 `AI_PROVIDER_CONFIGS_JSON` 复用同一输入结构。旧配置只对 `openrouter.ai` 子域和 `api.openai.com` 做严格主机推导，自建代理必须显式选 adapter。管理输入为 strict Schema，不接受 `ready`、adapter 契约证据或真实验收结果。
  - 就绪与证据：服务端用精确锁定的 `ai@7.0.95`、OpenRouter adapter `3.0.0`、OpenAI-compatible adapter `3.0.45` 生成受控发布证据，并按 Provider、端点、凭证指纹、adapter、模型、模式、契约、声明、允许上游、超时与免费依据计算配置指纹。Registry 的 `strictReady` 在发送前重新检查启用、health、路由、声明、发布证据、免费证据或业务付费授权及撤销；管理 API 只返回计算结果，凭证指纹不进入公开快照。人工声明、`liveValidation:not_run` 与运行健康保持分层。
  - 撤销与热更新：明确能力失配通过数据库配置 JSON 持久化到当前配置指纹，只阻断匹配的模型、模式和契约；重复撤销幂等。已返回的在途执行快照不被 Registry 热更新改写，下一次领取使用新快照；端点或凭证等配置变化产生新指纹，旧撤销不污染更正后的组合。设置归一化、路由快照、撤销持久化与运行 Provider 装配已从既有 `AiProviderService` 提取，主服务保持 600 行阈值以内。
  - 连接测试：探针固定为单次请求；对必须推理的模型预先给出安全输出预算，reasoning-only、空内容或非法对象直接失败，不再隐式发出第二或第三次生成。连接成功/失败只更新健康事实，不授予结构化能力、免费资格、adapter 证据或真实业务验收；就绪读取本身不发网络请求。
  - 验证证据：T4 定向 36 项通过，覆盖伪造 ready/证据、锁定版本一致性、配置指纹、旧配置严格推导、自建代理、允许上游、免费/付费、health=down、混合模型、环境配置、单请求连接测试、无能力授予、热更新、定点撤销、API 只读计算及敏感指纹裁剪。共享 Schema 全量 22 文件/207 项通过；Server 全量 117 个文件/746 项通过，12 个需显式环境的集成文件共 40 项保持跳过；Server build、定向 ESLint、import boundaries、workspace dependency graph、文件尺寸 ratchet 与 `git diff --check` 通过，文件尺寸仅保留 13 个既有 warning。T5/T6 尚未消费 `strictReady` 与撤销入口，真实 Provider 验收仍留给 G1。

- [x] T5：完成参数优化与探索的本地纵向闭环。
  - 覆盖验收：AC01、AC11–AC16、AC19、AC21–AC23、AC27、AC31、AC32、AC36、AC38。
  - 依赖：T2、T3、T4。
  - 范围：策略候选编排、Prompt、精简 discovery 装配、预算、缓存；不改 Runner、冻结数据和采纳规则。
  - 交付与完成条件：两模式均贯通严格路由→完整接收→领域校验→结果/计量保存→查询。固定字段和成本取 seed 快照；series 可探索且引用合法。旧 proposal 按版本复用；超额候选可读但不继续回测或生成。
  - 验证方式：真实业务服务＋本地 Provider HTTP＋隔离 PostgreSQL；验证取消、保存失败、未知/失败重投、回测失败缓存与请求数。此验收不代表真实上游或原策略 G2 全流程通过。
  - 实现状态：候选编排已切换到 `strictReadyContract` 的单一 ready route，领取前冻结 adapter、模式、生成契约与配置指纹，领取后的热更不改写在途快照。参数优化保留严格 changes 契约；discovery 只让模型输出 `name/description/series/entry/exit/sizing/risk`，服务端从 seed 装配 `schemaVersion`、SignalSource ID/标的/周期、execution 与 cost，并拒绝越权字段、错误 source ID 及未声明 series。
  - 事实与恢复：每次 SDK 请求经 `prepared → dispatching → completed/unknown`，Provider 返回的 Token/费用与合法结果在同一事务中结算；免费路由只接受结构化 `freeEvidenceRef`。传输结果未知、保存失败或旧 Worker 失去执行权均不会自动重放 Provider；完整缓存仅在同契约/同配置指纹且 Schema 合法时复用，并保留 `budget_exceeded/cost_unknown` 阻断事实。超额时先保存结果与计量，然后直接停止候选创建、回测和后续生成。
  - SDK 兼容修正：本地业务纵向发现 AI SDK v7 不接受 `messages` 中的 `system` 角色，共享 adapter 已将其稳定映射到 `instructions`，其他消息保持原顺序；回归证明 OpenAI-compatible 请求仍仅发送一次。
  - 定向与隔离验收：本地 HTTP/SSE 与领域定向 31 项通过，覆盖两种模式、精简装配、单请求、非法输出、传输未知、保存失败、缓存指纹和超额下游阻断。专用 `thesis_ledger_t05` 隔离 PostgreSQL 按顺序应用当前 13 条 migration 后 10 项通过：其中业务纵向 2 项真实经 Registry、SDK adapter、本地 HTTP、候选服务、事实 Store 与 PostgreSQL，验证参数/discovery 持久化、回测失败后缓存零新请求、配置变更拒绝旧缓存和取消后零新请求；事实库 8 项覆盖超额先保存、免费依据、币种不一致、冲突修订回滚、旧领取与授权后崩溃。
  - 包级与门禁：Server 全量 120 个文件/758 项测试通过，13 个需显式环境的集成文件共 43 项在普通全量入口保持跳过；Server build、定向 ESLint、import boundaries、workspace dependency graph、文件尺寸 ratchet 与 `git diff --check` 通过。候选服务拆出 Prompt 和 SDK 缓存职责后降至 598 行，策略编排服务保持在本轮前的 933 行；文件尺寸入口仅保留 12 个存量 warning。真实上游 Provider 与原策略全流程仍留给 G1/G2，本项不越界声称通过。

- [x] T6：完成研究任务执行策略、生成与安全恢复。
  - 覆盖验收：AC01、AC13–AC19、AC21–AC23、AC25、AC29–AC32、AC38。
  - 依赖：T2、T3、T4、T5 本地验收。
  - 范围：AiRun 创建快照、AiResearchExecutor、工具信号、研究 fallback 和 lease recovery；不引入新 Worker/队列。
  - 交付与完成条件：新增 AI_RESEARCH_POLICY_JSON 默认/校验；创建起绝对期限与累计预算约束全链路。保留工具先执行/引用审计；最多一次拒绝类 fallback。历史无发送证据及未知请求不盲目重排；领取代次约束全部写入。
  - 验证方式：研究业务＋本地 HTTP＋隔离 PostgreSQL：排队过期零请求、Retry-After、额度、同模型 fallback、未知有余额/无余额、停机/取消、旧 Worker 续租与晚到、伪造和跨账户引用。
  - 创建与路由快照：复用 T1 的 `research-policy-v1` 契约，新增 `AI_RESEARCH_POLICY_JSON` 严格解析与默认免费策略；付费策略必须同时限定正金额、币种和 Provider/模型范围。`startResearch` 从 `createdAt` 计算绝对 deadline，并冻结策略、同模型候选路由、adapter/mode 与配置指纹，不复制凭证明文；执行前仍重新检查 ready、预算授权和撤销状态。
  - 执行与安全边界：`AiResearchExecutor` 已停止调用旧 `completeWithFallback`，工具仍由服务端先执行并写审计，模型侧不声明可执行 Tool。每个 SDK 请求依次落 `prepared → dispatching → completed/unknown`，请求预留、实际 Token/费用、合法结果和终态通过领取代次约束保存；伪造或跨任务 Tool call/source 引用在业务校验阶段拒绝。续租、未知标记、完成结算和失败终态均绑定 `executionAttempt`，失租或旧 Worker 晚到不能覆盖新所有者。
  - fallback、期限与恢复：单任务最多两次出站，仅 `provider_rejected + rejected_before_generation` 可在相同模型、冻结白名单和剩余累计预算内 fallback 一次；认证、权限、付费、断流、传输未知、Schema/业务非法、取消和保存失败均不 fallback。有效 `Retry-After` 纳入创建起绝对期限，等待超过剩余期限时终止。恢复只重新排队未发送的 `prepared` 或已确认生成前拒绝且仍有 fallback 额度的任务；`dispatching/unknown` 及缺少现代发送证据的历史 Research 直接保守收敛为 `research_unknown_outcome`。
  - 定向与隔离验收：本地 HTTP/SSE 和研究执行定向 36 项通过，其中研究业务纵向 5 项覆盖明确拒绝的单次 fallback、两条独立请求事实、`Retry-After` 超期限、断流不 fallback、取消与排队过期零请求；Executor/策略/服务测试覆盖冻结路由、工具先执行、实际引用及伪造/跨任务引用拒绝。专用 `thesis_ledger_t05` 隔离 PostgreSQL 14 项通过：1 项真实贯通 Registry 结果、SDK、本地 HTTP、事实 Store 与 AiRun 原子终态，4 项覆盖 prepared 新代次恢复、拒绝类 fallback 恢复、dispatching unknown、历史无证据和旧 Worker 晚到，另 9 项复用共享事实库的并发、幂等、累计 fallback 计量、超额与费用边界。
  - 包级与门禁：共享 Schema 全量 22 文件/207 项通过；Server 全量 122 个文件/768 项通过，15 个需显式环境的集成文件共 49 项在普通全量入口保持跳过；Server/Schema build、定向 ESLint、import boundaries、workspace dependency graph、文件尺寸 ratchet 与 `git diff --check` 通过。`ai-run.service.ts` 从本轮开始时的 618 行收敛到 617 行，文件尺寸入口仅报告 13 个既有 warning。真实上游 Provider、容器和浏览器验收仍留给 G0–G2，本项不越界声称通过。

- [x] T7：提供完整性与费用的服务端读模型。
  - 覆盖验收：AC14、AC19、AC24、AC26、AC30–AC33、AC36。
  - 依赖：T1、T2。
  - 范围：AiRun 列表/详情/usage、优化详情、共享 API；保留已有查询与分类规则。
  - 交付与完成条件：已报告部分、未知/历史数量、估算/实际、多币种、冻结策略、后续停止及交易成本来源可读取；兼容数字不冒充总额，诊断按权限裁剪。
  - 验证方式：读模型/API 契约测试，使用 T2 的真实结构样例覆盖历史、部分合计、多币种、超额、未知预留和敏感字段裁剪。
  - 实现状态：已完成。共享契约新增脱敏的 `AiExecutionReadModel`，公开冻结研究策略、绝对 deadline、生成/计量状态、有限请求摘要和 `continuationBlockedReason`；请求摘要保留预留、最新 usage、known/estimated/unknown 费用及允许的 request ID/阶段事实，但不返回配置指纹、原始错误摘要、提示词或凭证字段。AiRun 普通列表/详情和 Research 列表/详情统一返回 `execution` 与 `usageCompleteness`；没有合法新版事实的记录明确标为 `legacy_unknown`，既有数值列只保留兼容展示语义。
  - 汇总与费用：`/ai/runs/usage/summary` 不再把历史默认 `0` 当成已确认总量，改为返回已报告 Token 部分、partial/unknown/legacy_unknown 数量、未知费用任务数、未确认 Token 预留，以及按币种拆分的实际、估算和未确认预留金额。多币种不合并，未知费用不假定币种。优化详情的 attempt 只保留费用分类白名单和脱敏执行摘要，不再返回原始 `modelMetadata`；实验详情同时返回 `tradingCost`，区分正式基线策略与服务端 discovery seed 来源，并明确零佣金/零滑点只是回测假设。
  - 模块边界：新增 `ai-execution-read-model.ts` 与 `strategy-optimization-read-model.ts` 承担投影、汇总和成本来源解析；`ai-run.service.ts` 从 T7 开始前的 617 行收敛到 609 行，`strategy-optimization-read.service.ts` 收敛到 579 行，未继续放大存量大文件。
  - 验证证据：新增读模型 3 项，加上 AiRun、Research 查询和优化读服务共 19 项定向测试通过，覆盖历史占位不计总额、partial、unknown 预留、known/estimated、多币种、冻结策略、停止原因、敏感字段裁剪与 discovery seed 成本来源。共享 Schema 全量 22 文件/207 项通过；Server 全量 123 文件/772 项通过，15 个需显式环境的集成文件共 49 项在普通入口保持跳过；Schema/Server/Desktop typecheck，Schema/Server/Desktop build，定向 ESLint/Prettier、import boundaries、workspace dependency graph、文件尺寸 ratchet 与 `git diff --check` 通过。Desktop 本轮只同步共享 API 类型，结果页实际消费仍属于 T10。
  - 未验证边界：尝试复用 T5/T6 的 `127.0.0.1:55437/thesis_ledger_t05` 隔离库时 Docker daemon 已停止，三个 PostgreSQL suite 在初始化阶段因数据库不可达而未执行，14 项全部保持跳过；没有把该尝试记为通过，也未擅自新建或清理容器。T7 的读模型/API 契约由 T2 已验证的持久化结构样例和本轮纯投影测试闭合；当前 Docker、目标运行态、浏览器及真实 Provider 仍由 G0–G2 验收。

- [x] T8：完善用户再次生成的确认闭环。
  - 覆盖验收：AC16、AC18、AC25、AC37。
  - 依赖：T1、T6、T7。
  - 范围：POST /ai/runs 的 retryOfRunId/风险确认，Desktop 既有表单与 api-client；一个新建确认行为的纵向交付。
  - 交付与完成条件：预填 question/context/template；服务端校验来源类型/状态/访问权。失效引用不静默回退，允许用户显式重新选择。未知需服务端风险确认；新任务新预算/新证据，旧事实和预留不变；表单提交中禁用重复点击，不自动重试创建请求。
  - 验证方式：API 与表单交互测试，覆盖账户/持仓/策略版本、删除/越权引用、正常失败与未知提示区别及提交竞态；浏览器门禁为 G2。
  - 实现状态：已完成。新增 `GET /ai/runs/:id/retry-prefill`，服务端在预填和创建时分别校验来源存在、研究任务类型、失败/未知终态、问题及上下文引用；未知结果要求独立风险确认，失效引用要求用户显式重选，禁止引用的上下文保持阻断。创建仍产生全新的策略、deadline、路由与执行事实，来源任务不被修改。
  - Desktop 行为：`NewResearchSheet` 通过 TanStack Query 获取服务端预填，只在用户确认后应用；普通失败与未知结果分别提示，未知结果另有风险开关。上下文缺失时必须重选，禁止/读取失败时不可提交；创建 mutation 显式关闭自动重试并在提交期间禁用重复点击。
  - 模块边界：再次生成校验提取到 `ai-research-retry.ts`，运行服务的公开类型提取到 `ai-run.types.ts`；`ai-run.service.ts` 收敛到 592 行，未继续放大存量服务。
  - 验证证据与边界：共享 Schema 22 文件/207 项、Server 123 文件/773 项、Desktop 66 文件/442 项通过；Schema、Server、Desktop 生产构建通过。实际浏览器交互仍由 G2 验收，不以组件测试替代。

- [x] T9：接入 Provider 配置与就绪界面。
  - 覆盖验收：AC20、AC24、AC34、AC35。
  - 依赖：T4。
  - 范围：既有 Provider 编辑器/列表，复用 shadcn/ui、原子类与 TanStack Query。
  - 交付与完成条件：可设置 adapter/模型模式、声明来源及相关参数/免费依据；明确就绪阻断与恢复入口。允许保存未就绪配置；连接健康、接入就绪、真实验收独立回显，中文标签一致。
  - 验证方式：组件/API 交互回归；实施前按 shadcn skill 核对已安装组件和文档。真实就绪阻断由 T4/G2 验证，不以截图代替。
  - 实现状态：已完成。既有 Provider 编辑器可维护 adapter、执行模型、`json_validated`/`native_schema` 模式、契约版本、声明来源/引用/版本/声明人、首包与空闲超时、允许的上游及免费依据；服务端摘要同时返回配置声明和实际评估结果，因此未就绪配置可以保存而不会被伪装成可执行路由。
  - 状态回显：列表独立显示连接健康、接入就绪和真实验收，阻断原因、恢复入口及枚举标签统一使用中文；凭证仍保持只写，不进入摘要、测试或 UI 回显。
  - 验证证据与边界：Provider API、输入往返、未就绪保存及三类状态独立回显已包含在 Server 773 项和 Desktop 442 项通过证据中；已复用项目现有 shadcn/ui 组件与原子类。真实 Provider 就绪及目标浏览器行为仍由 G1/G2 验收。

- [x] T10：让结果页面消费计量与预算事实。
  - 覆盖验收：AC14、AC19、AC30–AC33、AC36。
  - 依赖：T7。
  - 范围：研究/策略现有详情、Token/费用合计、研究策略及交易成本来源；不增加聊天流或任务预算表单。
  - 交付与完成条件：未知不显示为确定零值；估算不称实付；超预算不隐藏合法结果；不同币种分开。AI 费用和 seed 交易成本分开，零交易成本标明假设。
  - 验证方式：共享 API 样例驱动的组件回归：零与未知、历史未核对、估算/实际、超额和成本来源。保持布局/查询/权限；实际消费归 G2。
  - 实现状态：已完成。研究详情与策略实验详情统一消费脱敏执行事实，展示用量完整性、实际/估算/未知费用、未确认预留、冻结策略、绝对 deadline、生成结果和继续阻断原因；历史零占位显示为“历史未核对”，估算明确标为非实付，多币种分开，`budget_exceeded` 不隐藏已经合法落库的结果。
  - 成本边界：优化详情将 AI 费用与基线策略/discovery seed 的交易成本来源分开；零佣金、零滑点明确标注为回测假设，不再把缺失 Token、时长或费用渲染成确定零值。
  - 验证证据与边界：新增执行事实显示回归并更新研究/策略样例，Desktop 66 文件/442 项及生产构建通过；实际目标运行态、浏览器展示与真实 Provider 消费仍由 G1/G2 验收。
  - 共享工作树门禁：import boundaries、workspace dependency graph、定向 ESLint/Prettier 与 `git diff --check` 通过。本轮涉及的 `ai-run.service.ts` 已回到尺寸阈值内；仓库级文件尺寸门禁仍被不属于 T8–T10 修改范围的 5 个既有工作树增量阻断，因此未声称总门禁通过，也没有越界修改这些文件。复杂度门禁未在低层尺寸门禁失败后继续运行。

- [x] T11：准备切换、协议清理和兼容回滚输入。
  - 覆盖验收：AC15、AC24、AC28、AC39。
  - 依赖：T5、T6、T7、T8、T9、T10。
  - 范围：装配/启动切换、重复协议清理、发布配置及操作说明；本任务不完成部署。
  - 交付与完成条件：首次发送前固定实现，切换后的未就绪路由无 legacy 绕行。两链路本地验收后清理手写重复生成协议；准备能读取新版事实并保留防重放/就绪门禁的回滚输入与在途处理步骤。
  - 验证方式：启动/配置/依赖边界与生产打包检查；同一持久化样例验证兼容目标。不具备兼容条件时回滚保持任务停用，不能恢复盲重试或零占位语义。
  - 切换状态：已完成源码与发布输入准备。策略候选服务强制注入 `StrategyOptimizationSdkExecutor`，未装配时明确失败，不再回退 `provider.complete`；研究链路继续只调用 `AiResearchSdkExecution`。远程 `OpenAiCompatibleProvider` 的手写 `/chat/completions` 生成实现、`completeWithFallback` 和旧 `AiRunService.completeWithProvider` 已删除，Provider 连接测试也改为复用 `AiSdkGenerationAdapter`，因此未就绪或失败后不存在 legacy 再请求。
  - 发布配置：`AI_GENERATION_RUNTIME` 固定只接受 `sdk`；新增 `AI_RESEARCH_EXECUTION_ENABLED`，并让既有 `STRATEGY_AI_OPTIMIZATION_ENABLED` 同时控制自动恢复调度。相邻 infra 的 Compose、`.env.example` 和 AI Provider 契约测试已同步透传固定运行时、两项停领开关、研究策略及显式 fixture 配置；没有读取或修改真实 `.env` 和凭证。
  - 回滚输入：新增只读 `pnpm --filter @thesis-ledger/server ai:rollback-check`，同时解析 legacy 与 `sdk-execution-v1`，列出在途 AiRun/OptimizationAttempt、未结算 SDK request、损坏的新事实及需要继续防重放的 unknown outcome。只有无阻断时返回 `ready`；否则返回 `keep_tasks_disabled` 并以退出码 2 阻断恢复。完整切换、停领、更新和回滚步骤见 `docs/operations/2026-09-19-ai-sdk-cutover-and-rollback.md`。
  - 验证证据：回滚样例覆盖 legacy/new facts、unknown 防重放、在途和损坏事实；停领开关、SDK 单次连接探针、无远程 `complete` 协议及策略 SDK 执行器均有回归。Server 全量 124 文件/767 项通过，15 个需显式环境的集成文件共 49 项保持跳过；Server 生产构建、定向 ESLint/Prettier、import boundaries、workspace dependency graph、主仓/infra `git diff --check` 和 infra Compose AI Provider 契约通过。仓库级文件尺寸门禁仍为 T10 已记录的 5 个既有工作树增量阻断；T11 未新增尺寸违规，`strategy-optimization.service.ts` 恢复到本轮开始前的行数，未声称总门禁通过。
  - T11 完成时的未验证边界：回滚预检尚未连接当前 Docker 数据库，目标镜像更新、在途阻断、故障注入和回滚演练当时仍属于 G0；这些边界已在后续 G0 证据中补齐。真实 Provider 和浏览器消费仍分别属于 G1、G2，未以本地样例、构建或 Compose 渲染替代。

T1 的契约与共享样例通过后才是下游契约就绪点；消费者不得独立发明不一致的 mock。契约修改需同步消费者并标记失效证据。T2 的 AI 请求事实与策略预算保持明确所有权，调整依赖方向时维护 `scripts/check-boundaries.mjs`；不创建无所有权的通用工具目录。

## 3. 独立运行态门禁

- [x] G0：目标 Docker、状态竞争与回滚验收。
  - 覆盖验收：AC16、AC21–AC24、AC29、AC31、AC38、AC39 的目标运行态断言。
  - 依赖：T11；第 5 节低成本验证通过。
  - 责任与入口：部署集成；相邻 infra 的 `./scripts/update.sh thesis-ledger`。新增 Server 运行时依赖必须完整更新，不使用 sync-code、直接 compose build/up 或 docker cp。
  - 场景：稳定源码/启动输入构建一次，核对 Server/相关 Worker/静态资源版本；在同一镜像与环境使用受控本地 Provider 注入停机、失租、迟到、保存崩溃、超额、重复结算、恢复和未就绪阻断；执行兼容回滚演练。
  - 证据与放行：源码/配置指纹、镜像/容器、请求数、任务/预算前后事实、错误码与恢复结果完整。健康检查不等于业务通过，失败保持未完成；不为每个故障重复构建。
  - 目标更新（2026-09-20）：源码基线 `8648d006895e` 加当前未提交工作树，使用相邻 infra 的 `AI_RESEARCH_EXECUTION_ENABLED=false STRATEGY_AI_OPTIMIZATION_ENABLED=false ./scripts/update.sh thesis-ledger` 完整构建并更新一次；未使用 `sync-code.sh`、直接 Compose build/up 或 `docker cp`。目标镜像为 `sha256:5d35dc97b365e84f3047811b82569f09a3adfc1ff09ff7c2fc3d543ad6a7a6a9`，Server 容器为 `5da57651d48e9c1dedcc887d8538421e55387de7e6fd3717a2c66a651959b1b1`；运行时为 `sdk`，研究与策略优化继续停领。健康接口报告版本 `0.1.0`、Schema `20260918153000_strategy_optimization_adoption_context`，Server、backtest-worker、PostgreSQL、Redis、DSA 均为 healthy；目标 Compose 不托管 Desktop 静态资源，因此本门禁没有可核对的静态资源版本。健康结果仅作为部署事实，不单独承担业务验收。
  - 目标数据库与故障证据：通过只绑定 `127.0.0.1:55432` 的临时转发连接当前目标 PostgreSQL，运行 8 个定向文件共 46 项断言。研究/共享状态 5 文件 39 项通过，覆盖旧领取拒绝、发送窗口崩溃转 unknown、迟到结果阻断、恢复、用量修订、超额后合法结果保存、重复结算幂等、未就绪阻断、取消/超时及本地 HTTP 流错误；超额样例把实际 `12/5` 个输入/输出 Token 和 `1.5 USD` 保存到任务与预算账户，再以 `budget_exceeded` 阻断后续，重复提交返回幂等且不重复累计。策略 3 文件 7 项通过，覆盖参数优化与 discovery 的单请求本地 HTTP、超额后停止、保存失败和连接中断转 unknown、恢复时复用已成功步骤且不重复 Provider/AiRun/Candidate；各故障场景均断言请求数为 1。策略三文件首次并行运行时，reconciler 看见同批另外两个文件创建的临时实验而报告 `scheduled: 3`；清理完成后单独重跑该恢复用例通过，目标库最终 `eligible_experiments=0`，未把并行污染误记为产品通过。
  - 回滚演练：目标数据库初始预检为 `ready`。插入一条带合法 `sdk-execution-v1`、`dispatching` 请求的可识别临时在途事实后，目标镜像内 CLI 以退出码 2 返回 `keep_tasks_disabled`，阻断项为 `active_ai_runs` 和 `unsettled_sdk_requests`；删除且仅删除该临时事实后恢复 `ready`。重启同一镜像模拟兼容恢复启动，容器再次 healthy，两个停领开关仍为 `false`，预检仍为 `ready`；历史 6 个 unknown run 与 6 个 unknown attempt 的防重放清单前后不变。临时事实和临时转发容器均已清理。
  - 放行边界：G0 通过；它证明当前目标 Docker、受控本地 Provider/目标数据库竞态与兼容回滚输入，不证明真实上游 Provider、免费路由、浏览器交互或长期稳定性。G1/G2 开始前需显式恢复对应执行开关并继续使用标准部署入口，不能把本次停领状态当作业务可用。

- [ ] G1：三类真实免费模型验收。
  - 覆盖验收：AC01、AC19、AC25、AC28、AC36、AC40 的真实接入断言。
  - 依赖：G0；正式路由满足接入就绪、免费依据、允许列表与凭证前提。
  - 责任与入口：Provider 业务集成；参数优化、discovery、研究助手各使用业务等价完整提示词，分别取得一个可追溯合法结果。
  - 预算与停止：总费用零，三类共用不超过 10 次生成的账本，探针/手动连接测试/fallback 均计入。额度耗尽或同类外部错误连续 3 次立即停止，不切付费、不另起账本。就绪检查本身不需要额外真实探针。
  - 证据与放行：逐次记录业务/request ID、源码/SDK/配置/Schema 版本、请求/实际模型、首输出/总耗时、完整率、Schema 合法率、错误分布、用量/费用未知占比及每个合法结果的请求数。三类分别记录；外部阻塞保持未通过，少量样本不证明长期 SLA 或整个回测闭环。
  - 执行结果（2026-09-20）：外部阻塞，保持未通过。使用 OpenRouter 官方模型目录 `catalog-fetched-2026-09-20T07:25:44.730Z` 作为免费与能力依据，参数优化、discovery、research 三条合同路由在发起前均为 `ready`；配置指纹分别为 `ed2177a5…`、`2a1f752e…`、`f0503f69…`。目标运行态通过标准 `./scripts/update.sh thesis-ledger` 更新，研究/优化执行开关为 `true`、fixture 为 `false`，镜像摘要为 `sha256:6063993e5e9300c756c70fdc582ffd32d62973d977fa7bf6ea079b177c578401`。
  - 运行前缺陷与修复：首个参数优化实验 `76688267-5b80-4c51-ac83-c313ff07c5e9` 在 Provider 发送前因完整免费证据 URL 超过 `AiCostFacts.source` 的 120 字符上限而失败，`requests=[]`，不计入真实生成账本。优化执行路径已与研究路径一致地截断 `free_evidence:` 来源，并增加超长引用、`maxCost=0`、单请求回归。`rtk pnpm --filter @thesis-ledger/server test -- strategy-optimization-sdk-executor.integration.test.ts` 实际运行 Server 全套，124 个文件、768 项通过，15 个文件共49 项按环境跳过；`rtk pnpm --filter @thesis-ledger/server build` 通过。
  - 真实请求账本：共 6/10 次，全部属于参数优化完整业务提示词，每个实验 `maxAiCalls=1`、`maxCost=0`，没有连接测试、隐藏重试或付费 fallback。依次为：

    | # | 业务实验 / request ID | 请求模型 | 结果 | 总耗时 | 用量 / 费用事实 |
    | --- | --- | --- | --- | --- | --- |
    | 1 | `271fe760…` / `03552d70…` | `qwen/qwen3.8-27b:free` | `provider_rejected`，生成前限流 | 1341 ms | 用量未知；请求费用金额未知，具有目录免费依据；AiRun 累计 `0` |
    | 2 | `eef8647b…` / `6bbcbed5…` | `nvidia/nemotron-3.5-lightning:free` | Provider 已返回，`schema_invalid` | 4549 ms | 用量未知；请求费用金额未知，具有目录免费依据；AiRun 累计 `0` |
    | 3 | `504e5979…` / `61f0b5ce…` | `deepseek/deepseek-v4-flash-0731:free` | 上游报告免费版不可用，`unknown_outcome` | 1168 ms | 用量与请求费用均未知；AiRun 累计 `0` |
    | 4 | `55a1f3bf…` / `bf7a12ba…` | `qwen/qwen3.8-27b:free` | `provider_rejected`，生成前限流 | 1190 ms | 用量未知；请求费用金额未知，具有目录免费依据；AiRun 累计 `0` |
    | 5 | `a07fd0df…` / `50058903…` | `z-ai/glm-5.2:free` | `provider_rejected`，生成前限流，`retryAfterMs=5000` | 1242 ms | 用量未知；请求费用金额未知，具有目录免费依据；AiRun 累计 `0` |
    | 6 | `b42fa4a3…` / `2268c37b…` | `google/gemma-4-31b-it:free` | `provider_rejected`，生成前限流 | 1118 ms | 用量未知；请求费用金额未知，具有目录免费依据；AiRun 累计 `0` |

  - 指标与停止结论：参数优化完整结果率 1/6（仅表示 Provider 返回了可解析 JSON），Schema 合法率 0/6，合法结果 0；用量未知 6/6，请求费用金额未知 6/6，但 5 条已结算请求均携带可追溯的官方目录免费依据，AiRun 累计费用为 `0`。第 4–6 次为连续 3 次同类上游限流，已按硬规则立即停止；未再请求 discovery/research，不将剩余 4 次额度视为可绕过停止条件的新账本。所有请求均未产生 checkpoint，实际模型与首输出耗时不可得；未达到三类各一个可追溯合法结果的放行条件。

- [ ] G2：真实浏览器消费与再次生成验收。
  - 覆盖验收：AC14、AC20、AC24、AC30、AC31、AC33–AC37 的用户流程。
  - 依赖：G0；T7–T10 契约/组件验证通过。G1 的外部阻塞不妨碍以受控路由验证 UI 自身行为。
  - 责任与入口：客户端集成；目标运行态中的 Provider 配置→就绪/阻断、计量详情、研究限额、成本来源、上下文预填/失效引用、未知风险确认。
  - 请求边界：错误/计量场景用隔离受控路由并明确 fixture 证据；真实结果复用 G1。若浏览器触发真实生成，纳入 G1 同一账本，不为截图发未记账请求。
  - 证据与放行：操作路径、截图和 API 状态、请求次数及 Console/Network 错误；仅布局正常不能证明权限、计量或真实 Provider 行为。

## 4. 验收责任映射

AC01–AC29 保留初稿稳定编号，AC30–AC40 对应本轮新增决策。下表所有验证均待实施；最终 Review 只审查覆盖，不继承缺失实现。

| 验收断言 | 实现责任 | 本地验证 / 必要运行态门禁 |
| --- | --- | --- |
| AC01 正常生成 | T1、T3、T5、T6 | 三类本地纵向；G1 |
| AC02–AC07 超时、进度、中断、错误 | T3 | 实际 adapter HTTP/SSE |
| AC08–AC10 尾帧、结束原因、截断 | T3 | 流测试；T5/T6 不发布非法结果 |
| AC11 策略结构/语义 | T1、T5 | Schema、策略纵向 |
| AC12 窄归一化 | T1、T3、T5 | 传输→归一化→严格领域校验 |
| AC13 失败保留计量 | T2、T3、T5、T6 | HTTP＋数据库集成 |
| AC14 未知/部分用量 | T2、T3、T5、T6、T7、T10 | 数据/读模型/组件；G2 |
| AC15 无隐藏请求 | T3、T4、T5、T6、T11 | HTTP 次数、连接测试、装配 |
| AC16 恢复与缓存 | T2、T5、T6；T8 仅显式新任务 | PostgreSQL/重投；G0 |
| AC17 拒绝类 fallback | T6 | 同模型、两条记录、限额与 Retry-After |
| AC18 研究取消/超时 | T6、T8 | 无 fallback、来源状态与新建确认 |
| AC19 费用/路由授权 | T4、T5、T6、T7、T10 | 预算/路由/消费；G1、G2 |
| AC20 能力不支持 | T3、T4、T9 | 请求形态/撤销；G2 |
| AC21 取消/失租/旧执行器 | T2、T3、T5、T6 | 竞争/信号；G0 |
| AC22 保存失败 | T2、T5、T6 | 故障/有限重试；G0 |
| AC23 对账幂等 | T2、T5、T6 | 修订/重复回调/崩溃；G0 |
| AC24 配置冻结/兼容 | T0、T1、T4、T7、T9、T11 | 配置/API/装配；G0、G2 |
| AC25 权限/引用 | T6、T8 | 实际工具审计、API；G1 |
| AC26 脱敏 | T3、T7 | 日志/遥测/存储/API 白名单 |
| AC27 候选复用 | T5 | 回测失败编排，原门禁保持 |
| AC28 fixture/兼容 adapter | T0、T3、T4、T11 | 包/HTTP/装配；G1 已测路由 |
| AC29 deadline/释放 | T3、T6 | 流/假时钟/排队/工具；G0 |
| AC30 研究策略 | T1、T6、T7、T10 | 默认/配置/冻结/API；G2 |
| AC31 超额事实 | T2、T5、T6、T7、T10 | 事务/结果可读/调度停止；G0、G2 |
| AC32 未知后的门禁 | T2、T5、T6、T7、T10 | 有余额/不足/不可核算费用 |
| AC33 估算/历史/币种 | T1、T2、T7、T10 | 差额对账/汇总；G2 |
| AC34 声明与就绪 | T1、T4、T9 | 发布证据、人工声明、伪造拒绝；G2 |
| AC35 显式兼容模式 | T1、T3、T4、T9 | 两模式请求/校验；G2 配置 |
| AC36 精简探索 | T1、T5、T7、T10 | seed/series/固定字段/旧结果；G1、G2 |
| AC37 再次生成 | T1、T8 | API/表单/提交竞态；G2 |
| AC38 发送与领取竞争 | T1、T2、T5、T6 | PostgreSQL 竞争/发送窗口；G0 |
| AC39 发布/回滚 | T0、T11 | 版本/边界；G0 |
| AC40 真实样本与预算 | G1 | 共用账本，不以 mock 替代 |

## 5. 验证入口与成本控制

先在本任务拥有的文件范围运行定向 Vitest；具体文件由实施时新增/修改的测试清单决定并记录命令。现有 `test/ai`、`test/strategy-optimization` 负责 HTTP/SSE、PostgreSQL 和业务生命周期测试；Desktop 和共享包分别运行对应定向测试，不能只检查测试文件存在。

定向通过后执行受影响包的测试及 typecheck/build。Server 入口：

```bash
rtk pnpm --filter @thesis-ledger/server test
rtk pnpm --filter @thesis-ledger/server typecheck
rtk pnpm --filter @thesis-ledger/server build
```

共享 Schema/api-client/Desktop 按 T0 清单验证。再执行修改范围的 ESLint/格式、模块与工作区依赖、复杂度 ratchet 检查：

```bash
rtk node scripts/check-boundaries.mjs
rtk node scripts/check-workspace-dependencies.mjs
rtk pnpm guardrails:complexity
rtk git diff --check
```

不提升阈值或增加 ignore 掩盖既有大文件增长；新增职责按所有权提取。工具函数选型遵循 recommend skill，界面遵循 shadcn skill。定向数据集成使用隔离 PostgreSQL，跳过不得计为通过；如批准新增结构任务，静态 Prisma validate 显式提供占位 DATABASE_URL，结构验收包括隔离与目标运行态。

进入 G0 前源码/启动输入稳定；完整更新脚本按预计窗口等待，不高频轮询。构建一次、复用环境；高成本检查的输入未变不重复运行，无关基线错误单独记录，不借机重构。

实施证据逐任务记录：日期、精确命令/入口、输入文件/版本范围、通过/失败/跳过原因与证据路径。共用证据只存一处，其余引用。G1 维护一个总请求账本。

| 当前证据层 | 结果 |
| --- | --- |
| 文档规划 | Spec/Task 已生成，静态核验记录见第 6 节 |
| 定向/包级/仓库代码门禁 | T0–T11 的定向、包级、Server 全量、build、边界、workspace dependency 与 diff 证据已记录；仓库级文件尺寸门禁仍被 5 个既有工作树增量阻断，未伪装为全门禁通过 |
| PostgreSQL/Docker/恢复 | G0 通过：目标镜像一次完整更新；目标 PostgreSQL 46 项受控竞态/故障断言；在途阻断、清理后放行及同镜像重启回滚演练通过，执行开关保持关闭 |
| 真实 Provider/浏览器 | G1 已执行并因连续 3 次上游限流按规则停止，6/10 次账本无合法结果，保持未通过；G2 未执行 |

## 6. 规划前置 Review

- 结论：可实施；从 T0 核验实际版本、环境及完整调用清单开始，不代表生产发布已就绪。
- 产品/语义 Blocking：无。研究期限/预算、防重放与就绪被列为新增交付；没有误称既有能力。
- 依赖：T1 提供共享契约；T2/T3 各有独立验证；T5 是早期纵向闭环；T6 随后接通；G0–G2 不反向成为前置实施任务的完成条件。
- 覆盖：保留 AC01–AC29，新增 AC30–AC40；每项有实现和对应证据层，真实门禁不承接核心实现。
- 环境前提：稳定依赖组合、免费路由/凭证、Docker、浏览器待实施核验；外部失败保留门禁未完成，不改为 fixture 通过。
- 文档核验：配对/导航链接、40 项 AC、任务编号/依赖、中文说明及空白检查；结果只属于文档证据。
- 本轮证据（2026-09-19）：只读 Python 文档检查通过，40 项 AC 连续且映射完整，12 个实施任务与 3 个门禁无未知依赖或循环，链接均可解析，无未决占位或错误完成勾选。限定四份本轮文档的 `rtk git diff --check` 通过；两个新增未跟踪文件另行逐行检查空白。Prettier 的 `--file-info` 返回 ignored，未将其空跑计为格式验收。
- TODO/归档：没有新延期承诺，不改 TODO，不归档本任务，不修改其他任务完成状态。

## 7. 最终一致性 Review

- [ ] Spec 全部验收断言有实现与足够证据。
- [x] 所有已勾选任务满足自身完成条件，证据与当前输入一致。
- [ ] PostgreSQL、Docker、真实 Provider、浏览器与回滚必要门禁通过。
- [x] 生成、计量、预算、取消/领取、配置与再次生成在已完成的本地及目标数据库消费者中一致。
- [x] 40 项 AC 没有被宽泛最终门禁掩盖，当前义务没有转为后续。
- [x] 工作树既有修改保留，范围、复杂度和模块边界满足要求；既有文件尺寸门禁阻断继续单独记录。
- [ ] 文档、配置、测试与实际状态一致，fixture/build 未冒充真实验收。
- [ ] 当前实现说明及导航按实际结果更新；全部完成后才允许归档。

### Review 结论

- 实现结论：T0–T11 已完成；G0 目标 Docker、状态竞争与兼容回滚验收通过。G1 已执行但因真实上游连续限流按规则停止，保持未通过；G2 真实浏览器验收待执行。
- 必要门禁：G0 已通过；G1 在 6/10 次账本时触发连续 3 次同类外部限流停止条件，三类均未取得合法结果；G2 未执行。当前研究与优化执行开关为 `true`、fixture 为 `false`，这仅是 G1 运行条件，不能声称真实 Provider 可用。
- 证据：manifest/lockfile、实际导入、共享契约、状态事务、SDK 适配、本地 HTTP、目标 PostgreSQL、目标镜像与兼容回滚证据已记录；G1 新增了 6 次真实免费路由请求及外部失败证据，尚无三类合法结果或浏览器验收证据。
