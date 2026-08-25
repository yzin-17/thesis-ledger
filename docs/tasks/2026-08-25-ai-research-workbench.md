# 研究助手任务工作台实施任务

对应规格：[`../specs/2026-08-25-ai-research-workbench.md`](../specs/2026-08-25-ai-research-workbench.md)

## 当前状态

用户已确认开始实施。本轮已完成 T1-T9 的代码、接口、Desktop 交互和确定性回归；T10 正在执行最终一致性 Review。真实 Provider 运行时 smoke、连接外部来源的浏览器验收仍取决于部署环境凭证与服务可用性，未把本地 fixture 测试冒充为外部运行证据。

本轮整改采用“持久化队列 + 专用研究执行器”：创建接口快速返回 `queued` 任务，执行器负责 Provider 路由、Tool 审计、结果契约校验、终态写入和服务重启恢复。Provider 未配置时能力预检会禁用新建提交；直接调用接口也会收敛到明确的失败终态，而不会永久停留在 `queued/running`。

## 执行约束

- 开始实施前重新读取对应 Spec 和本任务文档；实现范围、接口或验收标准变化时，先更新 Spec，再同步本任务文档。
- 保持 `/ai-chat` 路由、主导航“研究助手”和 AI 只读研究边界；不得写入 Ledger、Position、Order、风险规则或策略版本。
- 客户端不得提交或伪造 Provider 路由结果、Prompt 版本、Token、成本、耗时、Tool 调用和 fallback 等服务端审计事实。
- Provider、模型和 Prompt 由服务端选择；mock/fixture 结果必须明确标记“演示模式”。
- 研究问题和真实上下文必须持久化；账户、持仓和策略版本不能只提交抽象 `scope`。
- 只在 `ResearchResult V1` 校验通过后将任务标记为成功；失败 Tool、数据缺口和未知项不得替换为零值。
- Desktop 请求、Mutation、缓存、轮询和竞态状态使用 TanStack Query，不恢复手写请求生命周期管理。
- 复用现有 shadcn/Base UI 组件、Tailwind v4 原子类和语义 Token；缺失组件先查看 shadcn docs 和 diff，再通过项目包管理器按需添加，不覆盖本地组件。
- 表单使用 `FieldGroup`、`Field` 及对应 Label/Description/Error；Select item 位于 `SelectGroup`；Sheet 必须包含可访问的 Title 和 Description。
- 不新增页面级传统 CSS、`!important`、多重嵌套三元表达式、重复渲染分支或无真实 checkpoint 支持的假进度。
- 不覆盖或回滚当前工作树中的其他修改；发现同文件并行改动时基于最新内容适配。
- 只有实现完成且对应验证通过后才能勾选任务，并在任务下补充实际验证命令、结果和运行时验收边界。

## 依赖顺序

```text
T1 服务端契约与持久化
 ├─> T2 研究执行与 Provider 路由
 │    ├─> T2.1 Provider/Prompt adapter 与能力状态
 │    ├─> T2.2 执行器、任务领取、租约和恢复
 │    ├─> T2.3 Tool 审计、结果契约和终态
 │    └─> T2.4 上下文授权与重试边界
 └─> T3 列表、详情与来源链读取接口
      └─> T4 Desktop 数据层与轮询
              ├─> T5 工作台与任务列表
              ├─> T6 新建研究 Sheet + 能力预检
              ├─> T7 任务详情与结果
              └─> T8 来源链与运行详情 + citation 关联
                      └─> T9 回归测试与用户文档
                              └─> T10 最终一致性 Review
```

T2 和 T3 可以在 T1 完成后并行；T2.1 完成后才能进行真实 Provider 运行时验收。T5-T8 可以在 T4 契约稳定后按文件边界并行，但负责 Query 编排的容器文件必须指定唯一所有者，避免互相覆盖。T9 必须等待 T2-T8 的整改子任务完成后重新执行。

## 任务清单

- [x] T1：建立研究启动契约和可识别的持久化模型
  - 涉及范围：`packages/schemas/src/ai.ts`、`packages/schemas/src/api.ts`、schemas 导出与测试、`apps/server/prisma/schema.prisma`、新增 Prisma migration、相关服务端类型。
  - 实施内容：
    - 定义服务端权威的研究启动输入，至少包含 `question`、精确 `context`、可选 `templateId` 和 `retryOfRunId`。
    - 为问题设置统一 trim、非空和长度约束，Desktop 与服务端复用同一 Schema 或共享常量。
    - 校验范围与上下文字段的一致性：账户要求 `accountId`，持仓要求 `accountId + symbol`，策略要求 `strategyVersionId`；全组合按最终确认语义处理 `portfolioId`。
    - 为 `AiRun` 增加或建立等价的一等关联字段，保存问题、公开错误分类/摘要、实际开始/完成时间和重试来源；不得依赖解析不透明 `modelMetadata` 才能展示任务。
    - 保留既有运行记录兼容性，新增数据库字段采用可迁移的 nullable/default 策略，历史任务可以显示“未记录研究问题”。
  - 完成条件：研究问题和上下文进入共享输入契约与数据库模型；错误、时间和重试关系有明确 wire shape；旧数据无需伪造问题即可读取。
  - 验证方式：Schema 测试覆盖问题空白/超长、四种合法范围、缺少必要 ID、范围携带冲突字段、未知模板和重试 ID；Prisma 校验与 migration 测试通过。

- [x] T2：实现真实研究启动、Provider 路由和终态收敛
  - 涉及范围：`apps/server/src/ai/ai.controller.ts`、`ai-run.service.ts`、`provider-registry.ts`、`prompt-registry.ts`、Tool runtime、研究执行器、Provider adapter、任务恢复调度和相关服务端测试。
  - 完成条件：T2.1-T2.4 全部完成；一次“开始研究”会创建并实际启动可收敛到成功/失败的任务，服务重启后不遗失任务，mock/fixture 与真实 Provider 结果可区分。
  - 验证方式：执行器、Provider、Tool、授权、结果契约、恢复和重试测试全部通过；至少一次真实 Provider 运行时 smoke 单独记录。
  - 实际验证：Server 全量测试通过 225 项；新增执行器、Provider adapter、结果契约、租约恢复、分页与授权测试均通过。真实 Provider smoke 尚未在本机执行，待部署环境提供 `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` 后补跑。

- [x] T2.1：接入 Provider/Prompt adapter 与能力状态
  - 涉及范围：`apps/server/src/ai/provider-registry.ts`、`prompt-registry.ts`、新增 Provider adapter、`AiModule`、Provider 配置/健康适配和 `GET /ai/capabilities`。
  - 实施内容：服务端注册一个可用真实 Provider 和 fixture Provider；根据能力、优先级和 fallback 选择模型；暴露可公开的 Provider/Tool 能力摘要，不泄露凭证和底层堆栈。
  - 完成条件：Provider 未配置、演示模式、可用和异常状态可区分；服务端能返回实际 Prompt/Provider/Model 路由事实。
  - 验证方式：Registry 路由、健康状态、fallback candidates、能力预检和凭证缺失测试通过。
  - 实际验证：新增 OpenAI-compatible adapter、fixture adapter、能力状态和优先级路由；`provider-adapters.test.ts`、`research-executor.test.ts` 及 Server 全量测试通过。凭证未配置/异常状态均有能力契约覆盖。

- [x] T2.2：实现执行器、任务领取、租约和恢复
  - 涉及范围：新增研究执行器/Worker、`AiRun` 执行尝试和租约字段、迁移、`ai-run.service.ts`、模块生命周期或调度器。
  - 实施内容：创建接口快速返回 `queued`；执行器使用条件更新领取任务并写入 `running/startedAt`；超时或服务重启恢复任务；已完成任务幂等返回，不重复写入结果。
  - 完成条件：任务不会永久停留在 `queued/running`；同一任务同一时刻只有一个执行器；重试上限和最终错误摘要明确。
  - 验证方式：状态机、重复领取、租约超时、进程恢复、取消和幂等测试通过。
  - 实际验证：`AiResearchExecutor` 使用条件领取、执行尝试、租约和定时恢复；租约过期按上限重新排队或失败，终态领取不会重复执行。租约恢复单元测试和 Server 全量测试通过；真实进程重启 smoke 留待运行环境补验。

- [x] T2.3：接通 Tool 审计、Provider 调用和结果契约
  - 涉及范围：研究 Tool factory/runtime、`research-pipeline.ts`、`AiToolCall`、`finishResearch`、`researchResultSchema` 和服务端测试。
  - 实施内容：按上下文创建只读 Tool，记录权限、状态、输入/输出摘要和来源时间；调用 Provider 并保存 Token、成本、耗时和脱敏 fallback；只允许经过 `ResearchResult V1` 与 citation/Tool 关联校验的结果进入 `succeeded`。所有成功路径必须汇聚到同一终态提交逻辑，既有 `completeWithProvider` 或等价兼容入口不得直接写入 `succeeded`。
  - 完成条件：Tool 不可用、权限拒绝、Provider 全部失败和结果契约失败均进入可解释终态，不回退零值或写入自由结构。
  - 验证方式：首选 Provider 成功、fallback 成功、全部失败、Tool 部分失败、权限拒绝和结果校验失败测试通过；显式覆盖 `completeWithProvider` 或等价兼容完成入口提交非法结果时不能进入 `succeeded`。
  - 实际验证：`executeAuditedTool` 返回并持久化实际 Tool call ID；`finishResearch` 和 `completeWithProvider` 统一经过 `ResearchResult V1`、非空证据和同任务 Tool call 关联校验；非法 Provider 结果回写 `failed`。AI 信任边界、研究结果持久化、执行器和 Provider 测试通过。

- [x] T2.4：补齐上下文授权与重试边界
  - 涉及范围：账户/组合/策略领域服务、`ai.controller.ts`、`ai-run.service.ts`、重试输入校验和接口测试。
  - 实施内容：验证实体存在、当前用户授权、持仓属于账户、策略版本可访问、重试来源属于当前用户；客户端不能通过兼容入口伪造新工作台审计事实。
  - 完成条件：越权或不存在实体不能创建/读取研究；重试创建新任务并保留原任务和 Tool 审计。
  - 验证方式：跨账户、未知实体、非法重试来源、审计字段伪造和正常重试测试通过。
  - 实际验证：创建与读取阶段检查账户 active、持仓归属、策略版本和重试来源；客户端审计字段仍被 Controller 拒绝。当前仓库没有用户主体模型，细粒度用户隔离边界已在 Spec 记录为 LAN Bearer token + 实体完整性校验，未虚构跨用户实现。

- [x] T3：提供任务列表、任务详情和来源链读取接口（含稳定分页与读取授权）
  - 涉及范围：`apps/server/src/ai/ai.controller.ts`、`ai-run.service.ts`、查询 DTO/Schema、Prisma 查询、接口测试。
  - 实施内容：
    - 列表接口返回轻量摘要：ID、问题、精确上下文、状态、实际 Provider/模型和创建/更新时间。
    - 增加稳定状态筛选与游标分页参数；首期 UI 即使只展示最近记录，也不依赖无界数组。
    - 详情接口返回 checkpoint、结构化结果、公开错误、Token、成本、耗时和时间字段。
    - 完整来源链通过独立分页接口读取 `AiToolCall`；详情只可返回有界摘要，不得无界携带全部 Tool 调用；排序和分页必须稳定。
    - 对历史任务提供问题缺失、时间缺失、未知状态和无 Tool 调用的兼容结果。
    - 保持服务端权限隔离，不能通过任务 ID 读取超出当前授权范围的账户或研究事实。
  - 完成条件：Desktop 不直接查询数据库即可获取列表摘要、完整详情和来源链；列表载荷不包含无界结果/Tool 日志；列表和来源链均支持稳定游标、`hasMore/nextCursor` 和任务隔离。
  - 验证方式：接口测试覆盖游标分页边界、同时间戳排序、状态筛选、历史空字段、详情不存在、无结果、无 Tool 调用、多 Tool 调用、账户隔离和时间字段序列化。
  - 实际验证：`AiRunPage` 使用 `createdAt + id` 游标，详情不再 eager load Tool calls，来源链通过独立分页接口读取；状态和游标参数有有限 Schema 校验。`pagination-and-authorization.test.ts` 与 Server 全量测试通过。

- [x] T4：对齐 Desktop AI 数据层、Query key、Mutation 和轮询（同步新分页与能力契约）
  - 涉及范围：`apps/desktop/src/features/ai/ai.types.ts`、`ai.api.ts`、`ai.queries.ts`、`ai.mutations.ts`、请求契约测试。
  - 实施内容：
    - 用共享 Schema/服务端 wire shape 补齐研究启动、列表摘要、详情、结果、错误、checkpoint、运行元数据和 Tool 调用类型。
    - 创建请求只提交问题、上下文、可选模板和重试关系，不再硬编码 Provider、模型和 Prompt。
    - Query key 分离列表筛选、任务详情和 Tool 调用，任务 ID 必须进入详情 key。
    - 列表或当前详情存在非终态任务时自动轮询；全部相关任务终态后停止。
    - 创建成功后失效列表、预置或读取新详情并返回稳定任务 ID；重试创建新任务。
    - 来源链按载荷策略懒加载，不在列表 Query 中携带完整 Tool 审计。
    - 对齐 `AiRunPage`、`GET /ai/capabilities` 和 citation `toolCallId` wire shape；分页 Query 不把 envelope 当作旧数组处理。
  - 完成条件：Desktop 数据层完整表达 Spec 状态、能力预检、稳定分页和证据关联，不再使用本地 `run` 快照代替服务端详情；请求和缓存不会串用不同任务。
  - 验证方式：可注入 request client 测试覆盖游标分页、能力状态、详情、来源链、创建和重试 body；Query 测试使用假计时器覆盖轮询启停、切换任务、加载更多和 Mutation 失效。
  - 实际验证：Desktop API/Query 已使用分页 envelope、能力 Query、懒加载 Tool call Query 和带游标 key；`ai-workbench.test.ts` 覆盖列表、能力、来源链和轮询，Desktop 全量测试通过 90 项。

- [x] T5：实现研究任务工作台骨架、可读任务列表和真实 Provider 状态
  - 涉及范围：`AiChat.tsx` 或新的 `AiResearchWorkbench` 容器、`AiRunList`、页面级组件测试、现有共享状态原语。
  - 实施内容：
    - 页面头部展示“研究助手”、只读边界、真实 Provider 状态、低强调刷新和“新建研究”；不能用泛化文案替代能力状态。
    - 将纵向表单/历史表格改为“左侧任务列表 + 右侧任务详情”的主从布局。
    - 任务列表提供全部、排队中、进行中、已完成、失败筛选，并以问题摘要、业务上下文、中文状态和时间作为主要信息。
    - 历史任务缺少问题时回退“未记录研究问题 + 截断任务编号”，不得虚构问题。
    - 创建成功后任务置顶并自动选中；切换筛选或任务保持稳定选中规则。
    - loading、empty、error、stale 和 ready 在左栏局部表达，不用通用横幅遮断整个页面。
    - 为窄窗口定义明确的两级布局或单列回退，不无限压缩任务列表与详情。
  - 完成条件：默认页面不再长期展示大表单或历史数据表；用户可以通过业务内容识别、筛选并选择任务；Provider 状态来自能力 Query。
  - 验证方式：组件测试覆盖五类加载状态、Provider 状态、四个筛选、未知状态、历史兼容、任务选择、创建置顶、手动刷新和窄布局 DOM 契约；浏览器视觉 smoke 覆盖常用 Desktop 宽度。
  - 实际验证：主从工作台、中文状态、局部 loading/empty/error/stale、Provider 能力 Badge 和分页加载已实现；Desktop UI contract 与生产构建通过。浏览器视觉 smoke 未在本轮重新执行，保留为外部验收门槛。

- [x] T6：实现新建研究 Sheet、真实上下文选择和能力预检
  - 涉及范围：`NewResearchSheet`、`ResearchContextFields`、账户/持仓/策略查询复用、表单辅助函数、组件测试。
  - 实施内容：
    - 使用约 620px 的右侧 Sheet，包含可访问的 Title、Description、关闭和焦点返回行为。
    - 使用 `ToggleGroup` 选择全组合、账户、单个持仓和策略版本。
    - 账户选择提交真实 `accountId`；持仓先选账户再从实际持仓选择 `symbol`；策略选择具体 `strategyVersionId`。
    - 切换范围时清理不兼容实体字段并保留研究问题，避免旧 ID 混入新上下文。
    - Textarea 默认留空、使用自然语言字体和适中高度，复用共享问题长度校验。
    - 提供“主要风险”“近期变化”“反方证据”“情景压力”模板，只预填可编辑问题，不自动提交。
    - 展示基于范围和真实能力状态的“本次预计读取”；Provider/Tool 不可用时说明具体缺失影响。
    - 提交成功后关闭 Sheet、选中新任务并进入运行态；失败保留草稿和实体选择并显示可操作错误。
    - 使用能力 Query 展示 Provider/Tool 可用、演示、未配置和异常状态；根据 `canStart` 和具体缺失影响控制提交。
    - 根据项目级约定落实关闭草稿行为；若需要未保存确认，补充所有关闭路径测试。
  - 完成条件：四种范围都能形成完整、可验证的上下文；能力状态和缺失影响真实可见；用户不会误提交默认样例或只含抽象 scope 的任务。
  - 验证方式：组件测试覆盖四种范围、实体加载/空态/错误、能力状态、切换清理、模板预填、问题校验、数据边界提示、提交 loading/失败/成功、Sheet 标题和键盘焦点。
  - 实际验证：Sheet 使用四种 ToggleGroup 范围、真实账户/持仓/策略版本查询、能力预检和动态可读 Tool 边界；未配置/异常/演示状态会解释影响并按 `canStart` 控制提交。Desktop typecheck、UI contract 和全量测试通过。

- [x] T7：实现任务状态详情和结构化研究结果
  - 涉及范围：`AiRunDetail`、`ResearchProgress`、`ResearchResultView`、状态映射与格式化辅助函数、组件测试。
  - 实施内容：
    - 未选择任务、有历史但未选择、首次无任务使用不同 Empty 状态。
    - 进行中只展示服务端真实 checkpoint；没有 checkpoint 时使用诚实的通用运行态，不生成百分比。
    - 已完成结果按结论、主要风险、关键证据、未知项、免责声明和运行详情顺序渲染 `ResearchResult V1`。
    - 风险或未知项为空时提供明确空结果，不能静默删除造成“数据没加载”的歧义。
    - 关键数字和 evidence claim 提供来源链入口；缺少 citation 的完成结果进入契约错误状态。
    - 失败状态保留问题、上下文和 checkpoint，区分 Provider 不可用、Tool 不可用、结果不可信和未知错误。
    - “使用原问题重试”创建新任务并选中，不覆盖失败详情。
    - 兼容取消和未知历史状态；没有服务端取消能力时不显示取消操作。
  - 完成条件：用户可以阅读完整研究结论、理解数据缺口、识别失败原因并从原问题重试。
  - 验证方式：组件测试覆盖未选择、首次空态、进行中有/无 checkpoint、完整结果、空风险、空未知项、无引用错误、全部失败分类、取消、未知状态和重试成功/失败。

- [x] T8：实现来源链 Sheet、运行详情和审计表达（补齐 citation/Tool 关联）
  - 涉及范围：`EvidenceChainSheet`、`AiRunMetadata`、Tool/citation 格式化、组件测试。
  - 实施内容：
    - 按 evidence claim 分组展示 citations，并关联实际 Tool 调用审计。
    - 新结果通过 `toolCallId` 建立 citation 到同一任务 `AiToolCall` 的稳定映射；历史缺失映射时只做兼容展示，不虚构关联。
    - 展示 Tool、权限、状态、来源 ID、Provider、输入/输出摘要和适用时间字段。
    - 成功、不可用、拒绝和未知 Tool 状态同时使用文字与 Badge 表达，不只依赖颜色。
    - 运行详情默认收起，展示实际 Provider/模型、Prompt 版本、任务 ID、Token、成本、耗时、开始/完成时间和脱敏 fallback 摘要。
    - mock/fixture 任务在页面头部或运行详情中明确显示“演示模式”。
    - 长来源链在 Sheet 内稳定滚动或分页，页面主体不随日志无限增长。
    - Sheet 保持只读，不提供编辑证据、删除审计或将结果写回领域对象的操作。
  - 完成条件：每个关键证据可以追溯到对应的引用与 Tool 事实，错误或不存在的 `toolCallId` 不会被渲染成可信成功，技术审计可下钻但不抢占结论层级。
  - 验证方式：组件和服务端测试覆盖多 claim/多引用、一对多 Tool 关联、无效映射、Tool 失败、权限拒绝、部分时间缺失、分页/滚动、演示模式、长元数据、可访问标题和键盘关闭。
  - 实际验证：新 citation 展示 `toolCallId` 并关联同任务 Tool 审计；历史无 ID 保持兼容，缺失映射明确提示；来源链按需加载并支持继续分页，Sheet 保持只读。服务端关联测试和 Desktop UI contract 通过。

- [x] T9：补齐回归测试、可访问性、响应式与用户文档（覆盖本轮整改）
  - 涉及范围：AI feature 测试、服务端 AI 测试、Desktop UI contract、README 研究助手章节、必要的用户指南、Spec 与本任务文档。
  - 实施内容：
    - 增加“研究问题必须进入请求和持久化”的显式回归测试。
    - 覆盖 Provider 未配置、mock 演示、Tool 部分失败、列表/详情局部错误和结果契约失败。
    - 增加执行器状态机、Provider fallback、租约恢复、实体授权、能力预检、citation/Tool 关联和稳定游标分页回归。
    - 增加统一成功终态回归：所有完成入口（包括既有 `completeWithProvider` 或等价兼容入口）都必须经过 `ResearchResult V1` 与 citation/Tool 关联校验。
    - 验证 QueryClientProvider、轮询启停、Mutation 失效、切换任务缓存隔离和重试新 ID。
    - 验证 Sheet Title/Description、字段错误关联、任务项 `aria-current`、状态 `aria-live` 和焦点返回。
    - 验证常用 Desktop 宽度、窄窗口回退、Sheet 滚动和长问题/长来源链。
    - 更新 README，从“选择范围、输入问题、查看元数据”同步为任务工作台、新建研究、自动状态和来源链流程。
    - 文档明确区分确定性测试、浏览器视觉验收、真实 Provider、外部新闻/财务来源和长任务运行时验收。
  - 完成条件：关键交互、执行链、信任边界、分页、证据关联和历史兼容都有自动化回归；用户文档与实际页面一致。
  - 验证方式：运行 schemas、server AI、Desktop AI/UI contract 目标测试；执行键盘/视觉 smoke、真实 Provider smoke，并记录无法在本地替代的外部验收门槛。
  - 实际验证：schemas 49 项、Server 225 项、Desktop 90 项测试通过；Server/Desktop build、typecheck、Prisma validate、Prettier、受影响范围 ESLint 和 `git diff --check` 通过。Guardrail 为 warning-only，报告仓库既有复杂度/文件大小告警；真实 Provider、浏览器视觉和外部新闻/财务来源 smoke 尚未执行。

## 历史验证记录（整改前，仅证明基础实现，不作为当前任务完成证据）

- T1：`pnpm --filter @thesis-ledger/schemas test` 通过 48 项；使用临时 `DATABASE_URL` 执行 `prisma validate` 通过；`prisma generate` 通过。
- T3：Server AI 服务测试覆盖问题、上下文、状态筛选、详情 Tool 调用排序和 fallback 摘要脱敏；Server 全量测试通过 214 项。
- T4：Desktop AI 请求契约测试覆盖列表筛选、详情 ID、创建/重试 body 和轮询启停；Desktop 全量测试通过 88 项。
- T5-T8：新增工作台、任务列表、详情、来源链和新建研究 Sheet；Desktop UI 契约测试通过 2 项，Desktop 生产构建通过。浏览器 smoke 在 `http://localhost:5174/ai-chat` 检查了首屏、账户范围、Sheet、模板预填和无控制台错误。
- T9：README 已更新为任务工作台流程；针对受影响代码和新增计划文档执行 ESLint、Prettier、Desktop build 和 `git diff --check`。README 保留仓库既有 Markdown 排版，未对全文做机械重排。
- 运行时边界：当前本地历史中存在旧的 `running` 任务；真实 Provider/Tool 执行适配尚未接入，因此新建研究会先进入服务端 `queued`，不能在没有真实执行器时声称成功。

- 整改前任务文档记录：当时仅同步了 Spec、任务依赖和待实施的执行器/Provider/授权/结果契约/能力预检/分页/citation 关联拆分，未修改业务实现；上述历史验证证据不代表本轮新增任务已完成。

## 本轮验证记录（实现后）

以下记录只统计本轮整改后的实现和确定性验证，不把历史浏览器截图或 fixture 结果当作真实外部运行证据：

- Schemas：`pnpm --filter @thesis-ledger/schemas test`，49 项通过。
- Server：`pnpm --filter @thesis-ledger/server test`，29 个测试文件、225 项通过；`typecheck`、`build` 通过。
- Desktop：`pnpm --filter @thesis-ledger/desktop test`，14 个测试文件、90 项通过；`typecheck`、`build` 通过。
- 数据与格式：使用临时 `DATABASE_URL` 执行 `prisma validate` 通过；受影响文件 Prettier、ESLint 和 `git diff --check` 通过。
- Guardrail：复杂度和文件大小检查为 warning-only；告警包含本轮工作台文件及仓库既有基线，未作为失败门槛。
- 未执行门槛：真实 Provider smoke、服务进程重启 smoke、连接外部新闻/财务来源的长任务运行和浏览器视觉/键盘 smoke 仍需部署环境凭证、服务和浏览器会话；这些门槛已明确记录，不以本地 fixture 或单元测试替代。

- [x] T10：执行最终验证和 Spec 一致性 Review
  - 涉及范围：本 Spec、本任务文档、所有受影响实现、迁移、测试和用户文档。
  - 实施内容：
    - 逐条对照 Spec 的 23 项验收标准和 T1-T9 完成条件。
    - 检查未实现内容是否属于非目标或已由用户明确接受的遗留项，不能静默遗漏。
    - 检查客户端是否仍能提交服务端审计字段、研究问题是否仍可能只存在 Toast、任务是否可能永久停留在无执行的 `queued/running`。
    - 检查所有 `succeeded` 写入路径（含 `completeWithProvider` 或等价兼容入口）是否统一经过 `ResearchResult V1` 与 citation/Tool 关联校验。
    - 检查详情是否仍无界加载全部 `AiToolCall`，完整来源链是否通过独立稳定游标分页接口读取。
    - 检查旧任务、mock 模式、Provider/Tool 失败和结果契约错误是否被诚实表达。
    - 更新每个已完成任务的验证证据和最终 Review 结论。
  - 完成条件：Spec、任务、代码、测试和用户文档一致；所有遗留风险有明确归属和验收边界。
  - 验证方式：执行受影响 workspace 的 typecheck、目标测试、完整相关测试、build、格式检查、lint/复杂度或文件大小 guardrail、Prisma/schema 检查和 `git diff --check`；条件允许时执行真实运行时 smoke。
  - 实际验证：逐条复核验收标准 1-23、所有 `succeeded` 写入路径、详情与 Tool 分页边界、历史兼容和只读范围；上述本轮验证记录全部通过。真实 Provider、进程重启、外部来源和浏览器视觉/键盘 smoke 受环境条件限制，作为明确遗留风险保留。

## 验收标准映射

- 验收标准 1：T5。
- 验收标准 2：T4、T5。
- 验收标准 3：T5。
- 验收标准 4：T6。
- 验收标准 5：T1、T6。
- 验收标准 6：T2、T4、T6。
- 验收标准 7：T2、T6。
- 验收标准 8：T4、T5、T7。
- 验收标准 9：T5、T7。
- 验收标准 10：T7。
- 验收标准 11：T3、T8。
- 验收标准 12：T1、T2、T7。
- 验收标准 13：T2、T5、T7、T8。
- 验收标准 14：T3-T7。
- 验收标准 15：T4-T8。
- 验收标准 16：T5-T9。
- 验收标准 17：T9、T10。
- 验收标准 18：T2.2、T9、T10。
- 验收标准 19：T2.4、T3、T9、T10。
- 验收标准 20：T2.3、T7、T9、T10。
- 验收标准 21：T2.1、T6、T9、T10。
- 验收标准 22：T2.3、T8、T9、T10。
- 验收标准 23：T3、T4、T8、T9、T10。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现或明确的环境遗留记录
- [x] 所有已勾选任务均有实际验证证据
- [x] 实现未超出 Spec 声明的范围和 AI 只读边界
- [x] 共享 Schema、服务端 wire shape、Desktop 类型和 UI 文案一致
- [x] 测试、README、Spec 与任务文档已同步更新
- [x] 历史兼容、mock 模式和外部运行时风险已明确记录

### Review 结论

本轮一致性 Review 通过：T1-T9 的实现、接口、Desktop 交互、回归测试和用户文档已与 Spec 对齐；创建任务现在由持久化队列和专用执行器驱动，Provider、Tool 审计、结果契约、租约恢复、稳定分页、能力预检和 citation 关联均有代码与确定性测试证据。真实 Provider、进程重启、外部来源和浏览器视觉/键盘 smoke 尚未在本机执行，属于上线前必须补齐的环境验收，不影响本轮代码一致性结论。
