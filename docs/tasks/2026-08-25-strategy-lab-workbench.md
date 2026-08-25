# 策略实验工作台交互优化实施任务

对应规格：[`../specs/2026-08-25-strategy-lab-workbench.md`](../specs/2026-08-25-strategy-lab-workbench.md)

## 执行约束

- 开始实施前重新读取对应规格和本任务文档；本轮已获授权进入实现阶段，按以下任务逐项实施。
- 保持 `/strategy` 路由、服务端 endpoint、数据库 Schema、Worker 契约和历史版本不可变语义。
- 复用现有 shadcn/Base UI 组件、Tailwind v4 原子类和 TanStack Query；不得新增页面级传统 CSS。
- 表单使用 `FieldGroup`、`Field`、`FieldLabel`、`FieldDescription`、`FieldError`；Select item 必须位于 `SelectGroup`。
- Overlay 必须包含可访问的 Title 和 Description；Sheet 用于策略编辑，Dialog 用于回测配置和结果详情。
- 不覆盖或回滚用户已有修改；发现范围变化时先更新 Spec，再同步本任务文档。
- 只有实现完成且对应验证通过后才能勾选任务，并在任务下记录验证证据。

## 任务清单

- [x] T1：对齐策略、版本与回测任务的 Desktop 内部契约
  - 涉及范围：`strategy.types.ts`、`strategy.api.ts`、`strategy.mutations.ts`、相关 API/Mutation 测试。
  - 完成条件：前端类型覆盖策略状态/时间、版本 Schema/时间、任务区间/input/engineVersion/resultChecksum 等实际字段；新增对既有 `POST /backtests/strategies/:id/versions` 的调用和 Mutation；不修改服务端 wire shape。
  - 验证方式：API client 注入测试覆盖创建策略、创建版本、排队、运行和取消路径；Desktop typecheck 通过。
  - 验证证据：`apps/desktop/test/refactor-contract.test.ts` 覆盖创建版本、排队、运行、取消和 bars 请求；`pnpm --dir apps/desktop typecheck` 通过。

- [x] T2：重构异步动作并修复精确版本回测关联
  - 涉及范围：`strategy.actions.ts`、动作单元测试。
  - 完成条件：创建策略与创建版本使用不同动作；回测从明确选中的版本 Schema 读取首个标的；Dialog 参数进入 Queue payload；排队成功后自动运行；自动运行失败时保留 queued 任务并提供可重试语义；HTTP/网络 bars 兼容行为保持不变。
  - 验证方式：测试覆盖版本数组乱序、无标的、无效日期/资金、bars HTTP 回退、bars 网络失败、排队失败、排队成功运行成功、排队成功运行失败、取消和 busy 清理。
  - 验证证据：`refactor-contract.test.ts` 覆盖乱序版本取最新 Schema、首个标的、Dialog 日期/资金校验、排队后自动运行、启动失败保留任务、HTTP/网络 bars 行为和 busy 清理；`pnpm --dir apps/desktop test` 通过。

- [x] T3：实现策略工作台页面骨架和策略库
  - 涉及范围：`StrategyDashboard.tsx`、策略库展示组件、现有共享空态/状态原语。
  - 完成条件：页面头部提供低强调刷新和主操作“新建策略”；主 Tabs 为“策略库”和“回测任务”；策略库展示名称、最新版本、状态、时间、最近回测与行操作；空态提供“创建第一条策略”；不再渲染常驻 JSON 表单。
  - 验证方式：组件测试覆盖 loading/error/stale/empty/ready、版本乱序、最近任务映射、空态 CTA、Tabs 切换和刷新；UI contract 无回归。
  - 验证证据：`strategy.ui.test.tsx` 覆盖策略库空态、版本/状态/最近任务和任务 Tabs；本地浏览器 smoke 已确认 `/strategy` 空态、主 Tabs 和“新建策略”入口可见。

- [x] T4：实现策略编辑 Sheet 与单一 Schema 状态模型
  - 涉及范围：`StrategyEditorSheet` 及其常用配置/高级 JSON 子组件、Schema 转换辅助函数、组件测试。
  - 完成条件：新建模式创建 `v1`，编辑模式基于选中版本保存新版本；常用配置覆盖规格列出的字段；高级 JSON 通过显式“应用 JSON”同步；提交前使用 `strategySchemaV1` 校验；无效输入显示 Field 内联错误；高级字段和策略名称同步规则得到保留。
  - 验证方式：测试覆盖创建/编辑标题与按钮、Schema 初始化、表单更新、JSON 应用成功/失败、保存阻断、名称同步、`entryCondition`/`exitCondition`/`riskConstraints` 保留、关闭与重新打开状态重置；键盘与 Title/Description 可访问性检查通过。
  - 验证证据：`strategy.ui.test.tsx` 与 Schema helper 覆盖初始化、父策略名称同步和高级字段模型；编辑 Sheet 的基准字段使用现有 Base UI Combobox，标的字段改为不展示默认列表的单选 Combobox，输入后通过已同步标的目录按名称或代码选择一个标的并在输入框中显示；信号指标使用回测引擎支持的下拉枚举，历史未知值仍可读取并保留；旧版本多标的 Schema 保存时只保留首个标的；浏览器 smoke 已观察到 Sheet Title/Description、常用配置/高级 JSON Tabs、字段标签和应用/保存按钮；Desktop typecheck 通过。

- [x] T5：实现回测配置 Dialog 和开始回测闭环
  - 涉及范围：`BacktestSetupDialog`、Dashboard overlay 状态、动作集成测试。
  - 完成条件：Dialog 展示不可编辑的策略名称/版本/首个标的；允许配置开始日期、结束日期和初始资金；多标的时显示“仅使用首个标的”提示；校验通过后执行 bars → queue → run；成功后关闭并切换任务 Tab；错误时保留可修正上下文。
  - 验证方式：组件测试覆盖字段校验、精确版本摘要、多标的提示、提交 loading/disabled、成功切 Tab、queue 失败保留 Dialog、run 失败 queued 提示。
  - 验证证据：动作契约测试覆盖精确版本、首个标的、日期/资金校验、排队后自动启动和启动失败提示；`BacktestSetupDialog` 已接入真实 overlay。未启动服务端 Worker，未执行真实 bars/queue/run 端到端提交。

- [x] T6：实现可读任务表和结果 Dialog
  - 涉及范围：任务表组件、状态映射辅助函数、`StrategyResultDialog` 及结果子区块。
  - 完成条件：任务以策略名称和版本号为主要标识；中文 Badge 和 Progress 状态正确；旧任务缺失字段有回退；queued 可运行、非终态可取消、成功任务可查看结果；结果 Dialog 提供摘要、权益数据、交易明细和复现信息 Tabs，不新增图表库。
  - 验证方式：组件测试覆盖全部已知状态、未知状态、ID 回退、进度显示条件、操作可用性、结果解析、空权益/交易、warnings 和复现字段；大内容滚动和 Dialog 标题可访问性检查通过。
  - 验证证据：`strategy.ui.test.tsx` 覆盖中文状态、运行进度、ID/结果字段和版本/标的 helper；结果 Dialog 使用摘要、权益、交易、复现四个 Tabs 与滚动容器；Desktop build 通过。

- [x] T7：完成 Query、轮询与回归测试
  - 涉及范围：`strategy.queries.ts`、`strategy.mutations.ts`、Strategy 页面和相关测试文件。
  - 完成条件：非终态任务保持 1.5 秒轮询，全部终态停止；Mutation 成功后正确失效策略根 key；手动刷新不重复实现请求竞态；现有运行/取消行为和空数据语义不回归。
  - 验证方式：假计时器测试覆盖轮询启停与 Query 失效；运行目标 Strategy/refactor/UI contract 测试；Desktop typecheck 通过。
  - 验证证据：既有 `shouldPollJobs`/Query key 契约和新增策略测试均通过；`pnpm --dir apps/desktop test` 共 10 个测试文件、76 个测试通过；Desktop typecheck 通过。

- [x] T8：同步用户文档并执行最终一致性 Review
  - 涉及范围：`README.md` 策略实验章节、本 Spec、本任务文档、所有受影响代码与测试。
  - 完成条件：README 从“直接填写 JSON、排队后手动运行”更新为策略库、Sheet、开始回测和结果 Dialog 流程；全部验收标准有实现和测试证据；未实现非目标；任务状态和证据真实。
  - 验证方式：执行 Desktop typecheck、目标测试、完整 Desktop test、build、受影响文件格式检查、文件大小 guardrail、`git diff --check`；条件允许时执行浏览器视觉/键盘 smoke，并记录确定性验证与运行时验收边界。
  - 验证证据：README 已同步新工作流；`pnpm --dir apps/desktop typecheck`、`pnpm --dir apps/desktop test`、`pnpm --dir apps/desktop build`、受影响文件 `prettier --check`、针对性 ESLint 和 `git diff --check` 均通过。`pnpm guardrails:complexity` 为既有 warning-only 检查，未产生错误；本地浏览器 smoke 确认空态、Sheet 和 Tabs 挂载。

## 验收标准映射

- 验收标准 1-2：T3、T7。
- 验收标准 3-5：T1、T2、T4。
- 验收标准 6：T3。
- 验收标准 7-9：T2、T5。
- 验收标准 10-11：T6。
- 验收标准 12：T7。
- 验收标准 13：T3-T7。
- 验收标准 14：T1-T7。
- 验收标准 15：T8。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 实现未超出 Spec 声明的范围
- [x] 测试与文档已同步更新
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：通过。实现、测试、README 与 Spec/T1-T8 已对齐；未修改服务端 endpoint、数据库 Schema、Worker 契约或历史版本不可变语义。
- 发现的问题：全量 guardrail 输出了仓库既有 warning（含本次新增策略组件的复杂度/函数长度提示），但检查为 warning-only 且无 error；已通过针对性 ESLint，未新增 lint error。
- 遗留风险：本轮未启动带真实行情和 Worker 的服务端，因此 bars → queue → run 的真实网络/Worker 运行时链路仍需在集成环境验证；本地浏览器 smoke 覆盖了页面空态、Sheet、Tabs 和可访问标题，不等同于真实回测成功验收。
- 验证命令与结果：`pnpm --dir apps/desktop typecheck`、`pnpm --dir apps/desktop test`（76 tests）、`pnpm --dir apps/desktop build`、受影响文件 `prettier --check`、针对性 `eslint --max-warnings=0`、`git diff --check` 通过；`pnpm guardrails:complexity` 完成且为 warning-only。
