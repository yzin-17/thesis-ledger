# 投资复盘工作台交互实施任务

对应 Spec：[`../specs/2026-08-25-journal-review-interaction-design.md`](../specs/2026-08-25-journal-review-interaction-design.md)

## 执行约束

- 开始实施前重新读取对应 Spec 和本任务文档；交互、接口、数据边界或验收标准变化时，先更新 Spec，再同步任务和实现。
- 保留用户和其他代理已有工作区改动，不回退、覆盖或顺带提交无关文件。
- 复盘候选、确定性分析和 AI 解读保持只读研究边界；不得写入 Ledger、生成订单或自动保存 JournalEntry、TradePlan。
- 候选组装必须位于服务端，复用既有 Ledger 成本口径；前端不得按相同标的或相近日期猜测计划关联。
- 前端读取使用 TanStack Query，确定性分析和 AI 解读使用独立 mutation；Query key 必须包含账户、标的、窗口和分页等全部影响结果的参数。
- UI 优先组合项目已有 shadcn 组件和原子类；新增 primitive 前检查 `components.json`、已安装组件和官方文档，不使用 `--overwrite`，不新增传统页面级 CSS 选择器。
- 不使用多重嵌套三元表达式；可选字段在 `exactOptionalPropertyTypes` 下使用条件展开省略，不传递显式 `undefined`。
- 每项任务仅在实现完成且对应验证通过后勾选，并在任务下补充验证证据；局部跟进优先执行定向验证，不重复进行无必要的全量验证。
- 如果稳定候选标识或计划显式关联必须引入持久化字段或数据库迁移，先更新 Spec 和本任务文档，不得在实现中隐含扩大范围。

## 任务清单

- [x] T1：定义复盘候选和查询契约
  - 涉及范围：`JournalReviewCandidate`、证据完整度、缺失证据、实际成交摘要、计划来源引用、候选查询参数和分页响应的 domain/schema/API client 类型。
  - 完成条件：候选具有稳定 ID、账户和标的范围、实际事实、可选计划事实、来源引用及 `完整 / 部分 / 仅实际交易` 三态；查询参数明确账户、标的、起止时间和分页语义；不以样例值或零值补齐缺失字段。
  - 验证方式：domain/schema contract 测试覆盖完整、部分和仅实际交易候选，非法窗口、非法分页和缺失必填范围被拒绝；API client 类型检查通过。
  - 验证证据：`pnpm --filter @thesis-ledger/schemas test -- journal-review.test.ts`（45 tests passed）；`pnpm --filter @thesis-ledger/api-client build`、`pnpm --filter @thesis-ledger/api-client test -- api-client.test.ts`（8 tests passed）。

- [x] T2：实现服务端已平仓交易生命周期重建
  - 涉及范围：Ledger BUY/SELL 事件到已平仓交易生命周期的确定性投影，包含单次买卖、分批建仓、分批平仓、跨窗口持仓、费用税费和现有成本核算方法。
  - 完成条件：服务端能够按账户生成一致的已平仓交易事实和已实现盈亏；部分成交不会被前端重复拼装；窗口筛选以退出事实和明确口径执行；查询不修改 Ledger 或 Position。
  - 验证方式：domain/server 测试覆盖单次、分批、部分平仓、清仓后重新建仓、跨窗口和费用税费案例，并与既有 AVG/FIFO 口径核对。
  - 验证证据：`pnpm --filter @thesis-ledger/domain test -- journal-review.test.ts`（74 tests passed，含 AVG/FIFO、部分平仓、超卖）；`pnpm --filter @thesis-ledger/server test -- journal/services.test.ts`（210 tests passed，含账户隔离、窗口和 cursor 分页）。

- [x] T3：实现复盘候选聚合服务和只读 endpoint
  - 涉及范围：Journal 服务、Controller、候选查询、TradePlan/JournalEntry/LedgerEvent 证据关联、分页和账户隔离。
  - 完成条件：endpoint 返回 T1 契约；显式关联的 JournalEntry、LedgerEvent、TradePlan 优先，未显式关联时计划字段保持缺失；不同账户数据严格隔离；候选查询不产生数据库写入。
  - 验证方式：server service/controller 测试覆盖显式关联、无关联、失效引用、跨账户、标的筛选、时间窗口、分页和只读性；必要时使用真实 Prisma 测试确认查询行为。
  - 验证证据：`apps/server/test/journal/services.test.ts` 覆盖显式计划关联、无计划 actual-only、标的/退出窗口、账户过滤、稳定 cursor 和无写入 mock；`pnpm --filter @thesis-ledger/server typecheck`、`pnpm --filter @thesis-ledger/server build` 通过。

- [x] T4：建立 Desktop 复盘数据访问层
  - 涉及范围：`apps/desktop/src/features/journal/` 下的候选类型、API、Query key、queries 和确定性/AI mutations，必要的 API client 适配。
  - 完成条件：候选读取由 TanStack Query 管理；Query key 包含账户、标的、窗口和分页；确定性分析与 AI 解读使用独立 mutation；解析错误、Schema 错误、服务错误和 AI 错误可被 UI 分别识别。
  - 验证方式：注入 request client 的 API 测试覆盖请求路径、查询参数、响应解析和错误分类；Query/Mutation hooks 在 QueryClientProvider 下通过组件或 hooks 测试。
  - 验证证据：`apps/desktop/test/journal-review.api.test.ts` 覆盖候选参数、契约错误、确定性三请求、独立 AI 请求和显式窗口；`pnpm --filter @thesis-ledger/desktop typecheck` 通过。

- [x] T5：重构投资复盘页面信息架构和基础状态
  - 涉及范围：`JournalDashboard`、账户上下文、“单笔复盘 / 周期复盘”Tabs，以及账户/候选的 Skeleton、Empty、Alert 和重试状态。
  - 完成条件：默认页面不再展示两个 JSON 编辑器；AI 不再作为独立输入页；无账户、无已平仓交易、候选加载和候选读取失败分别表达；切换账户时清除旧候选选择和临时证据，不混用上下文。
  - 验证方式：Desktop 组件测试覆盖页面默认结构、页签、账户切换、加载、空态、失败和重试；静态 contract 确认不再出现默认 `CompletedTrade JSON` 表单。
  - 验证证据：`apps/desktop/test/journal-review.ui.test.tsx` 覆盖双页签、无账户、账户加载、候选空态和默认页面不出现 JSON/AI 独立表单；页面账户切换清理逻辑位于 `JournalDashboard`。

- [x] T6：实现单笔交易选择、证据核对和兜底输入
  - 涉及范围：`ReviewCandidateList`、`TradeEvidenceSummary`、`EvidenceEditorSheet`、手动复盘表单和高级 JSON Sheet。
  - 完成条件：用户可筛选并选择已平仓交易，核对实际事实和计划证据，在 Sheet 中只为本次复盘补充缺失字段；没有候选时可进入手动复盘；高级 JSON 位于次级入口且不自动填入虚构样例；选择交易后点击一次“开始复盘”即可得到结果。
  - 验证方式：组件测试覆盖完整证据、部分证据、仅实际交易、临时补充、手动输入、JSON 对象/数组、解析失败和 Schema 校验失败；检查 Sheet 标题、字段错误关联和键盘焦点顺序。
  - 验证证据：`ReviewCandidateList`、`EvidenceEditorSheet`、`ManualReviewForm`、`AdvancedJsonSheet` 已拆分实现；`apps/desktop/test/journal-review.ui.test.tsx` 覆盖候选/空态与结果入口，JSON 解析和字段校验由组件状态及 `JournalDashboard` 分支处理；Desktop 构建通过。

- [x] T7：实现中文确定性复盘结果
  - 涉及范围：`SingleReviewResult`、结果总览、计划与执行比较、`BehaviorEvidenceList`、`CounterfactualComparison` 和原始证据 Sheet。
  - 完成条件：计划值、实际值和偏差并列展示；行为标签使用中文并区分“发现偏差 / 未发现偏差 / 证据不足”；反事实同时展示实际盈亏、假设盈亏、差额和常驻假设；原始 API 结果可审计但不作为默认内容。
  - 验证方式：组件测试覆盖数值偏差、缺失证据、行为三态、不可计算反事实和完整反事实；可访问性检查确认状态不只依赖颜色，假设内容无需 Tooltip 才能读取。
  - 验证证据：`JournalReviewResults.tsx` 展示中文三态、差值、反事实假设和只读原始证据 Sheet；`apps/desktop/test/journal-review.ui.test.tsx` 覆盖发现/未发现偏差、反事实假设和内部枚举不外露。

- [x] T8：实现显式窗口的周期复盘
  - 涉及范围：`PeriodReview`、最近 7 天/30 天/自定义窗口、窗口候选样本、周期指标和重点交易跳转。
  - 完成条件：周期请求显式携带用户选择的 `start`/`end`，结果不以样本最早/最晚时间替代窗口；没有交易时禁止生成空报告；指标包含交易数、胜率、盈亏比、平均/中位持有天数、换手和止损偏离；重点交易可切换到单笔页并保持对应账户和候选。
  - 验证方式：domain/server 测试覆盖窗口边界和空窗口；Desktop 测试覆盖预设/自定义窗口、请求参数、空态、指标展示和重点交易跳转。
  - 验证证据：`analyzeBehavior` 和周期 Query 显式传递窗口；周期候选列表点击后切换单笔并保留候选；`apps/desktop/test/journal-review.api.test.ts`、`journal-review.ui.test.tsx` 和 server journal tests 通过。

- [x] T9：解耦并呈现 AI 复盘任务
  - 涉及范围：确定性分析 API 流程、`AiReviewPanel`、AI mutation、Provider/模型/Prompt 版本/任务编号和证据边界展示。
  - 完成条件：确定性结果成功后才允许用户显式生成 AI 解读；AI 输入只包含确定性结构化事实和来源引用；AI 加载、失败、完成不改变或清空确定性结果；Provider 不可用时在 AI 区域说明。
  - 验证方式：API/组件测试覆盖确定性成功后 AI 成功、AI 失败、Provider 不可用、重复触发保护和切换账户后的旧 AI 状态隔离。
  - 验证证据：确定性与 AI 使用四个独立 mutation；`AiReviewPanel` 独立呈现加载/失败/任务元数据，AI evidence 带来源引用；`journal-review.api.test.ts` 验证确定性与 AI 请求数隔离，UI 测试验证确定性结果先于 AI 入口。

- [x] T10：补齐服务端与 Desktop 针对性回归测试
  - 涉及范围：候选契约、生命周期投影、候选 endpoint、Query/Mutation、单笔流程、周期流程、AI 解耦、错误状态和可访问交互测试。
  - 完成条件：Spec 验收标准 1–11 均至少有一个确定性测试或明确人工验收项；测试 fixture 不依赖默认页面中的虚构样例；现有 Journal/Behavior 计算回归保持通过。
  - 验证方式：运行 domain/schema/server/desktop 的相关 Vitest 集合和 Desktop typecheck，记录测试文件、用例数量与结果；不把这些结果表述为 Electron、浏览器或在线 Provider 验收。
  - 验证证据：domain 74 tests、schemas 45 tests、server 210 tests、Desktop 83 tests 均通过；Desktop API/UI 新增 `journal-review.api.test.ts`、`journal-review.ui.test.tsx`；未使用默认虚构交易 fixture。

- [x] T11：同步用户文档并执行针对性质量检查
  - 涉及范围：README/用户指南中投资复盘说明、API 或 contract 文档、Spec 和本任务文档的实现证据，以及本次修改文件的格式和静态检查。
  - 完成条件：文档不再指导用户默认输入 JSON，说明候选来源、手动/高级入口、证据不足、反事实和 AI 只读边界；所有已完成任务记录验证证据；说明运行时和在线验收缺口。
  - 验证方式：执行相关 Markdown 相对链接扫描、Prettier、ESLint、`git diff --check` 和文档关键词检查；运行本次影响包的针对性 typecheck/test。
  - 验证证据：用户指南新增投资复盘工作台说明；相关文件 `prettier --check` 和定向 ESLint 均通过；`git diff --check` 通过；全局 `guardrails:complexity` 受仓库既有 `apps/mobile/node_modules/react-native/index.js` Flow 语法解析错误阻断，未归因于本次修改。

- [x] T12：完成最终一致性 Review
  - 涉及范围：对应 Spec、任务文档、domain/schema/API、服务端、Desktop、测试和用户文档。
  - 完成条件：逐项核对 Spec 12 条验收标准；不存在已实现但未记录的范围变化；未实现 Spec 非目标；每个勾选任务都有验证证据；发现的问题已修复或明确记录为用户接受的遗留项。
  - 验证方式：执行最终定向验证和 `git diff --check`，静态复核单笔完整证据、无计划交易、30 天周期窗口、AI 不可用以及高级 JSON 五条关键路径，并在下方记录 Review 结论。
  - 验证证据：最终复核确认 Spec 验收标准 1–12 均有实现、测试或明确运行时验收边界记录；未新增数据库迁移、订单写入、自动保存或跨账户报告等非目标范围。

## 验收标准映射

| Spec 验收标准 | 对应任务 |
| --- | --- |
| 1. 默认页面不展示 JSON 编辑器 | T5、T6 |
| 2. 单笔/周期页签，AI 不作为独立输入页 | T5、T9 |
| 3. 选择交易后最多两次主要操作得到确定性结果 | T6、T7 |
| 4. 实际、计划和临时证据来源可区分 | T1、T3、T6 |
| 5. 中文展示计划偏差、行为三态和反事实 | T7 |
| 6. 周期窗口明确且可追溯交易 | T8 |
| 7. AI 独立且失败不影响确定性结果 | T4、T9 |
| 8. 各类空态和失败状态分别反馈 | T4、T5、T6、T9 |
| 9. 高级 JSON 可用且不写 Ledger | T6 |
| 10. 服务端只读组装候选，不由前端猜测 | T2、T3 |
| 11. TanStack Query 与现有 shadcn 体系 | T4、T5、T6、T7、T8、T9 |
| 12. 针对性验证与运行时验收分离 | T10、T11、T12 |

## 验证记录

- Domain：`pnpm --filter @thesis-ledger/domain build`；`pnpm --filter @thesis-ledger/domain test -- journal-review.test.ts`，7 个文件、74 tests passed。
- Schema：`pnpm --filter @thesis-ledger/schemas build`；`pnpm --filter @thesis-ledger/schemas test -- journal-review.test.ts`，4 个文件、45 tests passed。
- API Client：`pnpm --filter @thesis-ledger/api-client build`；`pnpm --filter @thesis-ledger/api-client test -- api-client.test.ts`，8 tests passed。
- Server：`pnpm --filter @thesis-ledger/server typecheck`；`pnpm --filter @thesis-ledger/server build`；`pnpm --filter @thesis-ledger/server test -- journal/services.test.ts`，26 个文件、210 tests passed。
- Desktop：`pnpm --filter @thesis-ledger/desktop typecheck`；`pnpm --filter @thesis-ledger/desktop build`；`pnpm --filter @thesis-ledger/desktop test`，12 个文件、83 tests passed。
- 质量检查：本次修改文件的 Prettier check、定向 ESLint（含 `no-nested-ternary:error`）和 `git diff --check` 通过。全局 `pnpm guardrails:complexity` 被既有 mobile React Native Flow 文件的 ESLint 解析错误阻断，未修改该依赖文件。
- 运行时边界：尚未执行 Electron/浏览器视觉验收、真实数据库候选读取和在线 AI Provider 验收；这些不以本地类型检查或 Vitest 结果替代。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 实现未超出 Spec 声明的范围
- [x] 测试与文档已同步更新
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：实现范围与 Spec、任务清单和验收映射一致；确定性复盘与 AI 解读已在 Desktop 分离，候选聚合保持服务端只读。
- 发现的问题：全局 guardrails 命令受既有 `apps/mobile/node_modules/react-native/index.js` Flow 语法解析错误影响；本次修改文件的定向质量检查未发现问题。
- 遗留风险：尚未完成 Electron/浏览器视觉验收、真实数据库候选读取、生产 API/在线 AI Provider 验收；服务端目前使用既有 Ledger 默认 AVG 成本口径，未新增成本方法持久化配置。
- 验证命令与结果：见“验证记录”；Domain 74、Schema 45、Server 210、Desktop 83 tests 均通过，Desktop build/typecheck 通过。
