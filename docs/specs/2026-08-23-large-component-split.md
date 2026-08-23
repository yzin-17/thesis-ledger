# 巨型组件拆分与请求层统一规格

## 背景与问题

Desktop 的 `apps/desktop/src/features/legacy-pages.tsx` 约 6210 行，集中承载组合、账户与持仓录入、导入、Provider、风险、绩效、策略、AI、Journal 和首次运行引导等多个领域。文件内部包含多个超过函数行数与复杂度阈值的页面，导致请求状态、表单状态、领域类型和展示结构相互耦合。

`apps/desktop/src/features/market-detail/MarketDetailDialog.tsx` 将行情分段展示、状态原语和 Query 编排集中在一个文件；`apps/mobile/src/App.tsx` 将移动端页面、导航交互和整套样式集中在一个入口。现有代码已经有 TanStack Query、共享 API Client、Portfolio/Market Data feature 目录，但旧页面仍大量直接 `fetch` 并手工维护加载、错误和竞态状态。

## 目标

- 删除 `legacy-pages.tsx`，按领域建立可独立理解和测试的 Desktop feature 入口。
- 将 Desktop 读取请求迁移到 `useQuery`，写操作迁移到 `useMutation`，保持现有 API、路由、DOM 语义和用户可见行为。
- 抽取跨领域的请求错误处理、Query key 约定和无业务语义的状态展示原语。
- 拆分 Market Detail 的分段展示与 Query 编排，并拆分 Mobile 的页面、通用展示和样式模块。
- 保留现有 Provider credential helper、健康历史兼容解析、Portfolio 表格、Import/Account/Position 表单、RiskCenter 审计/删除和 Mobile store 刷新竞态行为。

## 非目标

- 不修改后端 endpoint、响应 wire shape、数据库 Schema 或 `@thesis-ledger/api-client` 的公开方法集合。
- 不新增 Mobile React Query，不改变 `MobileReadOnlyStore` 的数据流和刷新竞态。
- 不新增页面文案、布局、路由、业务规则或 Provider 能力。
- 不在本任务中把所有 API response 纳入共享 package schema；feature API 继续复用现有 `request<T>()`。

## 现状与约束

- `legacy-pages.tsx` 当前包含 `InstrumentCombobox`、`StrategyDashboard`、`AiChat`、`JournalDashboard`、`ProviderSettings`、`PerformanceDashboard`、`RiskCenter`、`ScreenshotImportReview`、`ImportReview`、`PortfolioDashboard`、`PortfolioManagement`、`FirstRunOnboarding` 和共享状态展示组件。
- `portfolio.types.ts`、`portfolio.api.ts`、`portfolio.queries.ts` 与 `market-data` feature 已提供可复用模式，新增模块应遵守现有 `.js` 导入后缀、TanStack Query 和项目样式约定。
- Query key 必须包含影响结果的模式、账户、页码、任务 ID、标的等参数；Mutation 成功后必须精确更新或失效相关 query。
- 当前 RiskCenter 的规则删除、审计 Dialog 和成功后局部更新行为必须保留。
- 不得覆盖、回滚或静默删除既有用户修改；本任务涉及的旧文件删除必须在所有引用迁移后执行。

## 设计方案

### 共享基础层

在 `apps/desktop/src/features/shared/` 提供：

- 基于现有 `getDesktopApiClient().request<T>()` 的 `requestDesktopJson<T>()`，统一相对 API 路径和错误传播，并允许注入 request client 供测试使用。
- Query key 命名约定；领域仍维护自己的 key 工厂，避免共享模块依赖业务类型。
- `DataStateBanner`、空态、指标等没有领域语义的展示原语。

共享层不承载页面业务、领域 DTO 或通用万能 hook。

### 领域拆分

- `portfolio`：组合、账户/持仓管理、标的选择器，复用并扩展现有 Portfolio 类型、API 和 Query。
- `import`：手动/截图导入、导入 DTO/API/Query/Mutation 和旧路径重定向。
- `onboarding`：首次运行 UI 及 Provider/Risk/Market Data 聚合状态 Query。
- `providers`、`risk`、`performance`、`strategy`、`ai`、`journal`：各自维护 types、API、queries、mutations 和局部组件。
- `market-detail`：保留 Dialog 编排器，拆出 Quote/Bars/Indicator/Chip/Fund NAV sections、状态标题、指标原语和 Query hook。

页面组件只组合 Query/Mutation 与展示组件；表单草稿、Sheet/Dialog 开关、当前选择和 dirty 状态继续保留在 UI 层。

### 请求与状态迁移

- 策略/任务、AI 历史、Provider 配置与健康历史、绩效摘要、风险规则/事件/通知、账户/持仓/导入草稿和 onboarding 状态使用 `useQuery`。
- 创建/更新/删除、测试、任务运行/取消、AI/Journal 分析、导入提交、账户/持仓/现金保存使用 `useMutation`。
- Query 错误继续由现有 banner/toast 呈现；已有数据时保留 stale 语义。
- 任务轮询、Provider 健康历史分页、Market Detail 局部重试和 Portfolio dirty/confirmDiscard 逻辑不被简化。
- 迁移后的 API 模块使用现有 `getDesktopApiClient().request<T>()`，不修改服务端契约。

### 移动端拆分

将 `MobileApp` 拆成编排器、`PortfolioScreen`、`RiskScreen`、`StatusBanner`/`Metric`、样式工厂和相关类型模块。保留 `MobileReadOnlyStore`、主题/模式切换、导航状态和刷新顺序保护。

### 导出与迁移顺序

按以下顺序执行：shared 基础与类型出口 → portfolio/import/onboarding → providers/risk/performance → strategy/ai/journal → market-detail/mobile → routes、测试、导出迁移 → 删除 `legacy-pages.tsx`。

`app/routes.tsx` 和测试直接引用领域入口；`ui/App.tsx` 移除旧页面 re-export，但保留现有 App 兼容出口（若仍被内部入口使用）。

## 对外行为或接口变化

- 仓库内不再提供 `features/legacy-pages` 导入路径；所有仓库内引用迁移到领域入口。
- 页面组件的运行时 props、URL、API 路径、请求 payload 和响应解释保持不变。
- 新增的 shared request helper 与领域 Query/Mutation hooks 属于 Desktop 内部模块，不扩展服务端或共享 API Client 契约。
- Mobile 的 `MobileApp` 外部导出语义保持不变。

## 数据、状态或兼容性影响

- Query cache 将替代页面级 `loadSequence` 和手工读取状态；旧响应不会覆盖新 Query key 对应的数据。
- Mutation 成功后通过 cache update/invalidate 更新 UI；失败时保留既有表单草稿或已显示结果。
- Provider 健康历史继续兼容旧数组和分页响应；credential 测试证据继续决定保存凭证语义。
- Portfolio、Risk、Import 和 Market Detail 的现有状态文案、空态、陈旧态、失败态和局部重试保持不变。

## 风险与备选方案

- 领域迁移范围大，风险集中在导入/持仓表单 dirty 状态、Provider 分页和 RiskCenter cache 更新；按阶段迁移并逐阶段 typecheck/test。
- 若共享展示原语造成领域耦合，只保留请求错误处理和 Query 约定，将业务展示留在领域目录。
- 若某个复杂写操作不适合立即拆成多个 Mutation，先保留单一领域 Mutation API，但页面不得直接调用 `fetch`。
- 运行时 API/浏览器不可用时，以确定性 API/Query/UI 测试、typecheck 和 build 作为阻断证据，并单独记录浏览器验收缺口。

## 未决问题

无。实现不得重新引入兼容 barrel、后端 schema 扩展或 Mobile Query 层，除非先更新本规格与任务文档。

## 验收标准

1. `legacy-pages.tsx` 被删除，routes、`ui/App.tsx` 和测试无旧路径引用。
2. Desktop feature 文件不超过 800 行；新页面函数尽量不超过 220 行，目标复杂度告警清零。
3. Desktop 页面不直接调用 `fetch`；读取使用 Query，写操作使用 Mutation，Query key 参数完整且 Mutation 更新/失效范围正确。
4. Provider、Risk、Portfolio、Import、Market Detail 现有 UI contract 和当前 RiskCenter 行为通过回归测试。
5. Strategy、AI、Journal 的加载、错误、轮询/取消或分析结果行为有对应测试覆盖。
6. Mobile `MobileApp` 拆分后现有 store、主题、模式、导航和刷新竞态测试通过。
7. Desktop/mobile typecheck、测试、构建、格式检查、目标 ESLint 复杂度/函数长度检查和文件大小 guardrail 通过。

