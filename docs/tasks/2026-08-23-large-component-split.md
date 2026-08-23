# 巨型组件拆分与请求层统一实施任务

对应规格：[`../specs/2026-08-23-large-component-split.md`](../specs/2026-08-23-large-component-split.md)

## 执行约束

- 开始每个阶段前重新读取本规格和本任务文档。
- 保持现有 API、路由、DOM 语义、文案、样式和业务行为；不修改后端契约。
- 保留当前 RiskCenter 规则删除、审计 Dialog 和成功后局部更新行为。
- 不使用 destructive git 操作，不覆盖用户已有修改；删除 `legacy-pages.tsx` 前先确认所有引用已经迁移。
- 所有新增或修改的说明性文档使用中文。

## 任务清单

- [x] T1：创建 shared 请求、Query key 约定和跨领域状态展示原语
  - 涉及范围：`apps/desktop/src/features/shared/`
  - 完成条件：提供可注入 request client 的统一请求入口；DataState/空态/指标原语可被领域复用；不引入领域依赖。
  - 验证方式：`refactor-contract.test.ts` 覆盖 load state 和 request client；desktop typecheck 通过。

- [x] T2：拆分 portfolio、import、onboarding 并迁移组合相关请求
  - 涉及范围：portfolio、import、onboarding feature；账户/持仓/现金/标的搜索/导入/onboarding Query 与 Mutation。
  - 完成条件：组合与录入页面可独立导入；表单 dirty/confirmDiscard、标的搜索竞态、导入失败保留草稿、onboarding 状态保持不变。
  - 验证方式：Portfolio/Instrument/Import/Onboarding UI contract、7 项请求契约测试、desktop typecheck 通过；截图上传保留 multipart body。

- [x] T3：拆分 providers、risk、performance 并迁移请求状态
  - 涉及范围：Provider 配置/健康历史、RiskCenter、绩效页面及其 API/Query/Mutation。
  - 完成条件：健康历史兼容数组和分页响应；Provider credential/test/save 语义、Risk 删除/审计/测试/扫描、绩效 stale/error 状态保持不变。
  - 验证方式：健康历史分页/数组兼容、Risk mode、Performance mode/account、cache invalidation API 契约与 UI contract 通过。

- [x] T4：拆分 strategy、ai、journal 并迁移请求状态
  - 涉及范围：策略回测、AI 运行、Journal 分析页面及其 API/Query/Mutation。
  - 完成条件：策略任务轮询/运行/取消、AI 历史与提交、Journal 分析结果和失败语义保持不变；页面不直接调用 `fetch`。
  - 验证方式：Strategy/AI payload、AI 历史错误、Journal 单笔/行为分析成功与失败语义测试通过；Query/Mutation 模块和页面请求扫描通过，页面未发现直接 `fetch`。

- [x] T5：拆分 Market Detail 与 Mobile App
  - 涉及范围：`apps/desktop/src/features/market-detail/`、`apps/mobile/src/`。
  - 完成条件：Market Detail section、状态原语和 Query 编排分离；局部重试/unsupported/stale 语义不变；Mobile store、主题、模式、导航和 refresh race 不变。
  - 验证方式：Market Detail 11 项现有测试、移动端 7 项测试、desktop/mobile typecheck/build 通过。

- [x] T6：迁移 routes、导出和测试并删除 legacy-pages
  - 涉及范围：`apps/desktop/src/app/routes.tsx`、`apps/desktop/src/ui/App.tsx`、desktop tests 及旧文件。
  - 完成条件：无 `features/legacy-pages` 引用；领域入口直接导出；旧文件删除；既有 RiskCenter 工作行为仍在新文件中。
  - 验证方式：`rg` 无旧路径引用，`legacy-pages.tsx` 已删除；desktop 31 项测试和 UI contract 通过。

- [x] T7：执行结构、质量和运行回归验证
  - 涉及范围：所有受影响 Desktop/Mobile 文件与文档。
  - 完成条件：文件大小、函数行数/复杂度、格式、typecheck、test、build 和 guardrail 均有证据；浏览器 smoke 缺口单独记录。
  - 验证方式：初始拆分阶段的 Desktop/Mobile/API Client typecheck、test、build 已通过；本轮 Review 修复的复验记录见下方 R1-R8。

## Review 修复任务

针对未提交代码的 Spec/Standards Review 重新打开以下任务；所有任务均在对应验证完成后勾选。

- [x] R1：Risk 审计 Query 按 `ruleId` 实际请求，保留 loading、error、cache 和 Dialog 语义，并补充 Query/API 行为测试。
- [x] R2：Performance allocation key 同时包含 positions 与 targets，并在 layers/targets 刷新后再刷新依赖数据；补充 key 隔离测试。
- [x] R3：Strategy bars 通过 TanStack Mutation 生命周期请求；HTTP 非 OK 回退空 bars，网络异常阻止回测排队，取消路径保留刷新与 busy 清理，并补充网络/HTTP/排队/轮询/取消测试。
- [x] R4：Portfolio 标的搜索贯通 Query `signal` 到 API request，保留 `es-toolkit` debounce 与竞态保护，并补充 AbortSignal 行为测试。
- [x] R5：清除 shared 层领域 DTO/辅助函数与 `legacy-shared` 引用；shared 仅保留请求、Query key 和无业务语义状态原语。
- [x] R6：按职责拆分受影响页面和 action handler；受影响 Desktop 文件目标 `complexity<=20`、`max-lines-per-function<=220`、`no-nested-ternary` 均无告警，文件大小 guardrail 无告警。
- [x] R7：受影响 SelectItem 全部置于 SelectGroup；条件 className 使用 `cn()`；未新增 CSS、路由、文案或 API 契约。
- [x] R8：补充 Strategy/AI/Journal 与组合 Query 状态的真正行为测试，修复 Journal 失败保留结果语义，并完成最终一致性 Review、格式检查和差异检查。

### Review 修复验证证据

- `pnpm --dir apps/desktop test`：7 个测试文件、42 个测试通过；新增 AI 历史错误与 loading/error/stale/empty/ready 状态、Journal 单笔/行为分析成功与失败、结果保留、Strategy 取消和混合 Query loading/error 行为测试。
- `pnpm --dir apps/desktop typecheck`、`pnpm --dir apps/desktop build`：通过；生产构建仅保留既有单 chunk 大于 500 kB 提示。
- `pnpm --dir apps/mobile typecheck`、`pnpm --dir apps/mobile test`、`pnpm --dir apps/mobile build`：通过，移动端 7 个测试通过。
- `pnpm --dir packages/api-client test`、`pnpm --dir packages/api-client build`：通过，API Client 7 个测试通过。
- `pnpm exec eslint apps/desktop/src/features --rule 'complexity:["warn",20]' --rule 'max-lines-per-function:["warn",220]' --rule 'no-nested-ternary:warn'`：受影响 feature 文件 0 error/0 warning；输出中的 4 条 warning 均来自未改动的历史 `market-data` 模块。
- 受影响文件 `pnpm exec prettier --check ...`：所有列入检查的受影响文件均通过。
- `node scripts/check-file-size-guardrails.mjs`：无告警。
- `git diff --check`：通过；`rg` 检查旧 `legacy-pages`/`legacy-shared` 引用为空。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 实现未超出 Spec 声明的范围
- [x] 测试与文档已同步更新
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：Review 修复已完成；Risk 审计、Performance allocation、Strategy bars 运行/取消、Portfolio 搜索竞态、AI/Journal 状态与结果保留和 shared 边界均与 Spec 对齐，受影响文件目标复杂度告警已清零。
- 发现的问题：全仓库 guardrail 仍会报告未改动历史模块的 warning-only 复杂度告警；本任务未扩大范围修改这些历史模块。
- 遗留风险：尚未在真实浏览器、移动设备或在线 Provider 环境执行运行时 smoke；桌面生产构建保留既有的单 chunk 大于 500 kB 提示。
