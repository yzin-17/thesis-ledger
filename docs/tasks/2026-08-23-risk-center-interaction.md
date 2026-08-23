# 风险中心 AB 组合交互实施任务

对应规格：[`../specs/2026-08-23-risk-center-interaction.md`](../specs/2026-08-23-risk-center-interaction.md)

## 执行约束

- 保留其他代理和用户已有改动，不执行回退或提交 commit。
- 保持现有 Risk API、Query key、规则版本和事件/通知数据语义。
- 说明性文档使用中文；样式优先现有原子类和 shadcn 组件，不新增传统 CSS。
- 已确认的表单/确认交互若缺少本地 shadcn primitive，允许在 `apps/desktop/src/components/ui/` 新增最小可访问 `ToggleGroup`、`Field`、`AlertDialog` wrapper；不得使用 `--overwrite`。
- 仅做 Desktop 风险中心定向验证，不把 typecheck/Vitest 当作浏览器或在线服务验收。

## 任务清单

- [x] T1：完成风险页面状态与模式上下文对齐
  - 复用 routes 层 `portfolioMode` 与 `portfolio`，移除 RiskCenter 本地模式状态；保留规则全局查询，事件按当前模式查询。

- [x] T2：拆分总览、规则工作台、事件和通知页签
  - 总览承载摘要、扫描、数据状态和更新时间；规则页采用左侧列表/右侧详情；事件和通知保留事实字段、中文状态和空态。

- [x] T3：实现共用规则编辑 Sheet
  - 新建/编辑复用同一编辑器，按 scope/kind 显示目标字段，处理百分比到 decimal 转换、内联校验、自然语言预览和立即启用。

- [x] T4：完善规则详情治理与测试结果
  - 详情支持人工测试结果、启停、编辑、审计和归档确认；移除 `window.confirm`，归档文案明确保留历史。

- [x] T5：补充风险针对性测试并维护文档证据
  - 覆盖规则输入转换/校验、模式查询隔离、扫描上下文、归档确认和关键静态 UI contract。

- [x] T6：执行定向验证与最终一致性 Review
  - 执行 desktop typecheck、风险相关 Vitest、`git diff --check`；检查 Spec、任务状态和实现边界一致，记录运行时验收缺口。
- [x] T7：落实 Review 反馈并补齐可访问交互
  - 使用 Field/FieldGroup 组织规则表单、使用 AlertDialog 承载归档确认；抽取事件行展示，补齐事件模式、审计快照和通知状态语义，并允许已停用规则继续归档。
- [x] T8：落实第二轮 Review 的共享组件与测试结果生命周期修正
  - 指标卡复用 Button 的共享 metric/tone variant，AlertDialog 关闭图标补齐 `data-icon`；总览复用完整 RiskEventTable，人工测试结果提升到 RiskCenter 并按规则版本匹配。
- [x] T9：完成最终 Standards 类型与异步处理收尾
  - 表单提交使用 `void` 包装异步处理，移除无用类型导入；规则类型拆分为已知 kind 与可兼容服务端未知 kind 的可读类型，避免冗余联合。
- [x] T10：处理最终 Spec Review 的 target、空组合和共享 Switch 边界
  - 编辑已有证券/账户规则切换组合范围时由 FieldError 阻止提交；RiskCenter 使用 portfolio 请求状态区分 loading/empty/ready；恢复 Switch 默认行为，仅保留风险语义 variant，并补充对应测试。
- [x] T11：统一跨页面模式入口
  - 投资组合、收益分析和风险中心在页面标题栏右上角复用共享 `PortfolioModeSwitch`，移除各页面重复的按钮组/ToggleGroup。
- [x] T12：统一模式状态与验证
  - 收益分析复用路由层 `portfolioMode`，补充共享 Switch 与页面 header contract 测试，并完成定向 typecheck、Vitest、ESLint、Prettier 和浏览器预览验证。
- [x] T13：按确认方案升级模式控件视觉
  - 共享 `PortfolioModeSwitch` 改为带页面口径标签的单层胶囊式 Switch；三页统一显示模拟模式提示，投资组合的加载、空组合和失败状态不丢失上下文。

## 验证记录

- `pnpm --dir apps/desktop typecheck`：通过。
- `pnpm --dir apps/desktop test -- risk-center-interaction.test.tsx refactor-contract.test.ts`：通过；Vitest 实际运行 8 个相关 Desktop 测试文件、49 个测试，全部通过。
- `pnpm exec eslint apps/desktop/src/features/risk/RiskRuleEditorSheet.tsx apps/desktop/src/features/risk/risk.types.ts apps/desktop/src/features/risk/risk.format.ts apps/desktop/src/features/risk/RiskCenter.tsx apps/desktop/src/features/risk/RiskOverview.tsx apps/desktop/src/features/risk/RiskSections.tsx apps/desktop/src/features/risk/RiskRuleWorkbench.tsx apps/desktop/src/components/ui/button.tsx apps/desktop/src/components/ui/alert-dialog.tsx apps/desktop/test/risk-center-interaction.test.tsx --max-warnings=0`：通过。
- `pnpm exec eslint apps/desktop/src/app/routes.tsx apps/desktop/src/components/ui/switch.tsx apps/desktop/src/features/risk/RiskOverview.tsx apps/desktop/src/features/risk/RiskCenter.tsx apps/desktop/src/features/risk/RiskRuleEditorSheet.tsx apps/desktop/src/features/risk/risk.types.ts apps/desktop/test/risk-center-interaction.test.tsx --max-warnings=0`：通过。
- `pnpm exec prettier --write ...`：本任务涉及的风险 feature、routes、ToggleGroup、测试和文档已格式化。
- `pnpm exec prettier --check ...`：风险中心相关实现、共享 primitive、测试和文档格式检查通过。
- `pnpm --dir apps/desktop test -- risk-center-interaction.test.tsx refactor-contract.test.ts`：跨页面模式 Switch contract 纳入后，8 个文件、50 个测试全部通过。
- 浏览器预览：投资组合、收益分析和风险中心均在页面标题栏右上显示“实际 / 模拟” Switch；切换投资组合模式后仍可在空/无数据状态切回，未执行业务写入操作。
- 浏览器预览：三页均显示页面口径 + 胶囊式实际/模拟 Switch；模拟模式提示在投资组合、收益分析和风险中心可见，跨页导航后 `aria-checked` 保持为 `true`，未执行业务写入操作。
- shadcn CLI 的 `info/docs toggle-group` 以及 `docs field alert-dialog` 均因当前环境无法解析 registry DNS（`ENOTFOUND`）未能读取远端文档；已核对项目 `components.json`、`packageManager`、alias、icon library 和现有 Base UI 版本，并基于当前 `@base-ui/react` 实现最小可访问 ToggleGroup、Field、AlertDialog wrapper，未使用 `--overwrite`。

## 最终一致性 Review

- [x] Spec 中的页面层级、模式边界、规则编辑、治理、事件/通知和验证要求均有对应实现。
- [x] 任务状态与已执行验证一致；未引入服务端 endpoint/schema 或手写 fetch。
- [x] 本次修改仅涉及风险 feature、routes、已确认交互所需的 ToggleGroup/Field/AlertDialog primitive 与 Button 语义 variant、风险测试和本任务文档。
- [x] Review 反馈已处理：表单字段具备 `data-invalid`/`aria-invalid`，归档使用 AlertDialog，事件行共用且支持 limit，事件模式不再回退伪造，审计展示 actor/before/after，通知包含 delivered/retrying/未知状态，已停用规则仍可归档。
- [x] 第二轮 Review 反馈已处理：指标卡使用共享 Button variant，AlertDialog 图标符合 `data-icon` 约定，总览与事件页共用 RiskEventTable，人工测试结果由 RiskCenter 持有并在规则版本变更后失效。
- [x] 最终 Standards 反馈已处理：表单 `onSubmit` 不直接接收 Promise，类型导入无未使用项，`RiskRuleKind` 不再与 `string` 形成冗余联合。
- [x] 最终 Spec 反馈已处理：target 无法清理时阻止不安全 scope 转换，空组合不再被视为加载中，theme-toggle 不受风险 Switch 样式影响。
- [x] 用户后续反馈已处理：跨页面模式入口统一为共享 Switch，收益分析复用路由层 `portfolioMode`，投资组合的加载/错误/空组合状态仍保留右上模式入口。
- [x] 用户确认方案已处理：模式控件改为单层胶囊式视觉，补充页面口径标签和共享模拟模式提示，并覆盖投资组合所有请求状态。
- [x] 未执行浏览器、Electron、在线 Provider 或真实通知验收；这些由主代理后续 Review/运行环境确认。

### 结论

AB 组合交互及 Review 修正已完成代码实现与定向确定性验证。剩余风险仅为浏览器视觉、Electron 生命周期和在线服务能力未在本任务中验证，以及远端 shadcn 文档因 registry DNS 不可用未读取。
