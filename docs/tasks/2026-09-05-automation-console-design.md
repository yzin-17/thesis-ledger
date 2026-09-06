# 自动化配置台实施任务

关联 Spec：[`../specs/2026-09-05-automation-console-design.md`](../specs/2026-09-05-automation-console-design.md)

## 实施任务

- [x] T1：服务端任务编辑与删除端点
  - 覆盖验收标准：AC3、AC4
  - 依赖：无
  - 涉及范围：`packages/schemas/src/automation.ts`、`apps/server/src/automation/automation.service.ts`、`apps/server/src/automation/automation.controller.ts`、`apps/server/test/automation-runtime.test.ts`。
  - 完成条件：
    - `packages/schemas/src/automation.ts` 新增 `automationJobUpdateSchema`：`name`（min 1）/ `cron`（min 5）/ `timezone` / `enabled` 全部 optional，不含 `type`；
    - `AutomationService.update(id, input)`：任务不存在 → `NotFoundException('任务不存在')`；仅更新 schema 中提供的字段；`cron` 或 `timezone` **实际变化**时按生效值调 `nextCronOccurrence` 重算 `nextRunAt`（值未变不触碰 `nextRunAt`）；croner 抛错 → `BadRequestException('cron 表达式无效')`；
    - `AutomationService.delete(id)`：任务不存在 → 404；`automationRun.findFirst({ where: { jobId } })` 存在 → `ConflictException('已有运行历史，请改用停用')`；否则物理删除任务行；先查后删窗口内的 Prisma 外键冲突（P2003）同样映射 409；
    - Controller 新增 `PATCH /automations/:id` 与 `DELETE /automations/:id`；既有 `PATCH /automations/:id/enabled` 保持不变。
  - 验证方式：`pnpm exec vitest run test/automation-runtime.test.ts test/automation/services.test.ts test/http-validation.test.ts`（`apps/server`）+ `pnpm typecheck`（`apps/server`）；测试断言：update 仅传 cron 时按新 cron 重算、cron 未变不重算、非法 cron → 400、delete 有历史 409 且任务未删、delete 无历史物理删除、P2003 → 409、未知 id → 404。
  - 验证证据：
    - `pnpm exec vitest run test/automation-runtime.test.ts test/automation/services.test.ts test/http-validation.test.ts`（`apps/server`）：34 项通过（含新增 update/delete 7 项；非法 cron 用例验证 croner 对「not a cron」抛错并映射 400）。
    - `pnpm typecheck`（`apps/server`）：通过。
    - 实现注记：cron 值未变化时该字段仍随 patch 原值写回，但 `nextRunAt` 不重算——断言按「data 含同值 cron、不含 nextRunAt」修正，契约不变。

- [x] T2：服务端立即执行端点
  - 覆盖验收标准：AC2
  - 依赖：T1（同文件 controller/service，顺序编辑避免冲突）
  - 涉及范围：`apps/server/src/automation/automation.controller.ts`（构造器注入 `AutomationRuntimeHandlers`）、`apps/server/src/automation/automation.service.ts`（如需辅助方法）、`apps/server/test/automation-runtime.test.ts`、`apps/server/test/http-validation.test.ts`。
  - 完成条件：
    - 新增 `POST /automations/:id/run`：查询任务（不存在 → 404），按 `type` 取 `handlers.for(type)`，直调 `service.execute(job.id, handler)`；
    - 有意不经过 `executeScheduled`：不停用检查、不交易日检查（休市日也能执行）；照常走 Redis 锁、`AutomationRun` 记录与 retryPolicy 重试；
    - 锁占用 → 返回既有 `{ skipped: true, reason: '任务已有实例运行' }`；
    - 执行失败：在端点层把非 `HttpException` 错误转换为携带原始 message 的 `HttpException`（如 `InternalServerErrorException(error.message)`）——全局过滤器会把裸错误改写为 500 通用文案「服务暂时不可用」，直接抛出会导致前端拿不到原因；不调用失败通知 helper。
  - 验证方式：server 目标测试断言：停用任务 run-now 成功且写入 succeeded 的 `AutomationRun`；休市日 snapshot 任务 run-now 不跳过；调度路径 `executeScheduled` 对停用任务仍返回 skipped（回归）；未知 id → 404；handler 抛错时响应携带原始错误 message。
  - 验证证据：
    - `pnpm exec vitest run test/automation-runtime.test.ts`（`apps/server`）：22 项通过（新增手动执行 3 项 + 控制器 2 项；`http-validation.test.ts` 中既有控制器构造点同步补第 4 个参数）。
    - `pnpm typecheck`（`apps/server`）：通过。

- [x] T3：调度失败通知
  - 覆盖验收标准：AC5
  - 依赖：T1（同文件 `automation.service.ts`；与 T2 在 T1 完成后可并行）
  - 涉及范围：新文件 `apps/server/src/automation/automation-notification.ts`、`apps/server/src/automation/automation.service.ts`（注入 `NotificationService`、catch 接线）、`apps/server/src/automation/automation.module.ts`（imports 增加 `NotificationsModule`）、`apps/server/test/automation-runtime.test.ts`。
  - 完成条件：
    - 新 helper `enqueueAutomationFailureNotification`，照 `apps/server/src/risk/risk-notification.ts` 的 `enqueueRiskNotificationIfNeeded` 模式（构建 subject/message/policy 并入队）；
    - subject：`{ type: 'automation-run', id: <失败运行 id>, dedupKey: 'automation-failure:<jobId>' }`；失败运行 id 在 `executeScheduled` 的 catch 内查询该任务最近一次 `automationRun` 解析（正常失败路径即本次失败运行），任务无任何运行记录时回退 `jobId`；traceId 取该运行记录（缺失回退 `jobId`）；
    - message：severity `error`，标题区分自动化失败，正文含任务名称与错误摘要；
    - policy 沿用现有冷却默认：`{ cooldownMinutes: 30, maxAttempts: 3 }`；
    - 接线位置：`executeScheduled` 的 catch 内、更新 `lastRunAt`/`nextRunAt` 之后、rethrow 之前；helper 内部 try/catch：入队异常仅用 `StructuredLogger` 记 warn，绝不影响失败状态记录与原始错误 rethrow；
    - 手动 run-now 直调 `service.execute`，不经过该接线，天然不通知。
  - 验证方式：server 目标测试断言：调度执行失败 → 通知入队收到正确 subject type / dedupKey / severity / 含任务名的正文；helper 入队异常时 `executeScheduled` 仍抛出原始错误；手动 `execute` 抛错不触发通知入队。
  - 验证证据：
    - `pnpm exec vitest run test/automation-runtime.test.ts test/automation/services.test.ts test/http-validation.test.ts test/notification-runtime.test.ts`（`apps/server`）：62 项通过（新增失败通知 4 项：调度失败入队、手动不入队、入队异常不掩盖原始错误、无运行记录回退）。
    - `pnpm typecheck`（`apps/server`）：通过；`pnpm build`（`apps/server`）：通过。

- [x] T4：桌面端任务管理闭环（编辑器 + 页面接线 + 中文化）
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC7
  - 依赖：T1、T2（消费其端点契约）
  - 接口契约：
    - Consumes T1：`PATCH /automations/:id`（部分字段；400/404 语义）、`DELETE /automations/:id`（409 文案「已有运行历史，请改用停用」原样透出）；
    - Consumes T2：`POST /automations/:id/run`（成功 `{ skipped, output }`；锁占用 skipped；错误 message 透传）；
    - Consumes 既有：`POST /automations`、`GET /automations`、`GET /automations/history`。
  - 涉及范围：`apps/desktop/src/features/providers/` 下 `providers.api.ts`、`providers.mutations.ts`、`providers.types.ts`、`providers.actions.ts`、`providers.automation-actions.ts`、新 `AutomationEditorSheet.tsx`、`ProviderSettings.tsx`、`ProviderSettingsSections.tsx`；新 `apps/desktop/test/providers-automation-ui.test.tsx`。
  - 完成条件：
    - api（沿用 `requestDesktopJson` 模式）：`createAutomationJob`（客户端 `crypto.randomUUID()` + 默认 retry `{ maxAttempts: 3, backoffMs: 1000 }`、`lockTtlMs: 300000`、`timezone: 'Asia/Shanghai'`、`enabled: true`）、`updateAutomationJob`（PATCH，仅提交变更字段）、`deleteAutomationJob`（DELETE）、`runAutomationJob`（POST run）；`AutomationJob` 类型补充 `cron`、`timezone` 字段；
    - mutations：失效策略 create/update → `providerKeys.jobs()`；run → `providerKeys.jobs()` + `providerKeys.jobHistory()`；delete → `providerKeys.jobs()`；onError toast 经 `ThesisLedgerApiError.payload.message` 展示服务端 message（含 409 文案）；run 返回 skipped 时以提示 toast 展示 reason；
    - 编辑器 `AutomationEditorSheet`：Sheet + form 骨架照 `ProviderEditorSheet`；字段：名称（创建默认 = 类型中文名，类型切换时仅在名称仍为默认值时跟随）、任务类型 Select（7 种中文名，编辑模式禁用）、执行时间预设 Select（两个预设 + 自定义 → cron 文本输入）、启用开关（Switch）；编辑模式预填当前值（cron 命中预设选中预设，否则回填自定义）；创建提交 POST、编辑提交 PATCH（仅变更字段）；
    - 页面接线：自动化任务表标题行「新建任务」按钮；操作列扩展为启停（现有）/ 编辑 / 立即运行（忙碌态）/ 删除（`useConfirmDialog` destructive 确认）；market 类任务表头注明「休市日自动跳过」；
    - 文案中文化（`providers.types.ts`，`Record<string,string> + 其他（x）兜底` 模式）：任务类型 7 种、运行状态 running 运行中 / succeeded 成功 / failed 失败、健康状态 healthy 健康 / degraded 降级 / down 宕机、通知投递状态 pending 待投递 / retrying 重试中 / delivered 已送达 / failed 失败、错误码 `notification_provider_unconfigured:*` → 通知 Provider 未配置、数据质量级别 info 提示 / warning 警告 / error 错误；
    - 运行历史「任务」列：`ProviderHistoryTables` 接收 `jobs` prop，`jobId → job.name` 解析，查不到回退 jobId 前 8 位；健康历史状态列同步中文化。
  - 验证方式：`pnpm exec vitest run test/providers-automation-ui.test.tsx test/ui-contract.test.tsx`（`apps/desktop`）+ `pnpm typecheck` + 变更文件 ESLint + build。
  - 验证证据：
    - `pnpm exec vitest run test/providers-automation-ui.test.tsx test/ui-contract.test.tsx test/refactor-contract.test.ts`（`apps/desktop`）：53 项通过（新增标签映射、草稿/载荷契约、编辑器源码契约、表格渲染、历史任务名解析、页面接线渲染）。
    - `pnpm exec vitest run`（`apps/desktop` 全量）：157 项全部通过。
    - `pnpm typecheck`、`pnpm build`、变更文件 ESLint、`node scripts/check-file-size-guardrails.mjs`（ratchet passed）：均通过。
    - 实测修正：编辑器「启用」开关初版用无样式的 default Switch 变体且未渲染 SwitchThumb，实际渲染为 0×0 不可见（浏览器目检发现）；已改为与其他页面一致的 `variant="risk"` + `SwitchThumb`，修正后 `test/providers-automation-ui.test.tsx` 与桌面全量 157 项复测通过、浏览器目检可见。

- [x] T5：Provider 页头部与刷新对齐
  - 覆盖验收标准：AC8
  - 依赖：T4（同文件 `ProviderSettings.tsx`）
  - 涉及范围：`apps/desktop/src/features/providers/ProviderSettings.tsx`、`apps/desktop/test/providers-automation-ui.test.tsx`。
  - 完成条件：`.entry-page-heading`（无样式定义）替换为其他模块通用的 `header.page-header` + `.page-header-actions` 结构；右上角「新增或更新 Provider」主按钮 + ghost 图标刷新按钮（28px 同高、muted 色、hover 浅灰底、18px `RefreshCw`、刷新中旋转并禁用，点击重取 Provider 页全部查询——沿用页面既有 `load()`，与失效 `providerKeys` 根键语义等价）；模块间隙保持 `.panel` 分隔线风格；样式用现有原子类与既有公共 class 组合，不新增页面级样式。
  - 验证方式：ui-contract 断言 page-header 结构、刷新按钮变体与刷新中禁用态；桌面端目标测试 + `pnpm typecheck`。
  - 验证证据：
    - `pnpm exec vitest run test/providers-automation-ui.test.tsx test/ui-contract.test.tsx`（`apps/desktop`）：31 项通过（新增 page-header 结构 / ghost 变体 / `size-[18px]` + animate-spin / `disabled={providerRefreshing}` 源码合同断言；刷新中状态取 `providerQueries` 任一 `isFetching`）。
    - `pnpm typecheck`（`apps/desktop`）：通过；变更文件 ESLint：通过。

- [x] T6：收益页一键估值快照
  - 覆盖验收标准：AC6
  - 依赖：无（`POST /automations/workflows/close-snapshots` 已存在，schema 要求 `accountIds` 为 UUID 数组、`capturedAt` 为带时区的 ISO 时间）
  - 涉及范围：`apps/desktop/src/features/performance/` 下 `performance.api.ts`（新增 `captureCloseSnapshots`）、`performance.mutations.ts`（新增 `useCaptureCloseSnapshotsMutation`，成功后失效 `performanceKeys.root`）、`performance.types.ts`、`PerformanceDashboard.tsx`、`PerformanceSections.tsx`；`apps/desktop/test/performance-ui.test.tsx`。
  - 完成条件：空状态（「暂无收益历史」区块）新增「立即拍一个估值快照」按钮；点击调用 `POST /automations/workflows/close-snapshots`，body `{ accountIds: <当前模式 active 账户 id 列表>, capturedAt: new Date().toISOString() }`；当前模式无账户时按钮禁用（title 提示「当前模式暂无可拍摄账户」）；成功后失效 performance 查询键根并 toast 反馈；失败 toast 展示错误 message；「完成数据配置」按钮保留。
  - 验证方式：`pnpm exec vitest run test/performance-ui.test.tsx`（`apps/desktop`）+ `pnpm typecheck`（`apps/desktop`）；断言：空状态按钮渲染、api 请求体契约、无账户禁用。
  - 验证证据：
    - `pnpm exec vitest run test/performance-ui.test.tsx`（`apps/desktop`）：14 项通过（新增一键快照 3 项：按钮渲染与完成配置并存、忙碌/禁用态、api 路径与请求体契约）。
    - `pnpm typecheck`（`apps/desktop`）：通过；`pnpm build`：通过；变更文件 ESLint：通过。

- [x] T7：dev 栈重建与验收实测
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC5、AC6、AC7、AC8、AC9
  - 依赖：T1、T2、T3、T4、T5、T6
  - 涉及范围：本地 dev 栈（`../thesis-ledger-infra` 下 `docker compose --env-file .env -f compose.yml -f compose.dev.yml up --build -d` + `pnpm --filter @thesis-ledger/desktop dev`）、两端全量测试。
  - 完成条件：按 Spec 验收标准逐条实测并记录证据；两端 `pnpm test` 与 `pnpm typecheck` 全量通过（AC9）。
  - 验证证据：
    - 服务端 API 实测（重建后的 dev 栈，`/api/v1`）：创建 provider-health 任务 `nextRunAt = 2026-09-06T20:00Z` 与 cron `0 4 * * 1-5`（周一 04:00 +08）一致（AC1 服务端语义）；PATCH cron 后 `nextRunAt` 重算为 `21:00Z`（AC4）；停用任务 `POST /automations/:id/run` 返回 `{ skipped: false }` 并写入 succeeded 运行（AC2）；有历史删除返回 409「已有运行历史，请改用停用」、无历史删除 200（AC3）。验收用临时任务与孤儿快照行已通过 psql 清理。
    - AC6 服务端链路：对影子账户调用 close-snapshots 后 `payload.mode = shadow`，`GET /performance/history?mode=shadow&accountId=…` 出现 1 个数据点。
    - UI 实测（vite dev + 浏览器目检截图）：Provider 页为标准 `page-header`（主按钮 + ghost 刷新按钮）（AC8）；自动化任务面板显示中文类型「定期入账生成」、操作列 停用/编辑/立即运行/删除、「新建任务」入口与「休市日自动跳过」注记，健康历史显示「健康」（AC7）；新建任务编辑器字段、预设与「启用」开关渲染正常（AC4/AC1 入口）；收益页空状态点击「立即拍一个估值快照」出现成功 toast，选择同花顺账户后资产走势出现首点 `2026/9/7 00:26:12 · ¥1,473.00`（AC6）。
    - AC9：服务端全量 392 项、桌面端全量 157 项全部通过；两端 typecheck、build、ESLint、`check-boundaries`、`check-workspace-dependencies` 通过。
    - 证据边界：AC5 未实机验证（需要已配置可投递的飞书 Provider 并制造调度失败场景），以 T3 的目标测试证据为准。
    - 实测数据说明：按钮点击为实际账户（同花顺/支付宝/现金）各写入 1 条估值快照（功能正常输出，构成收益曲线首点）；影子 test 账户留存 1 条 0 值快照。如不需要可直接删除对应 `PortfolioSnapshot` 行。
    - 环境事件：实测期间 Docker Desktop VM 磁盘写满导致存储层只读（构建失败、容器日志不可读）；清理 27.5GB 构建缓存并重启 Docker Desktop 后恢复，栈重建成功。

- [x] T8：修复收盘快照工作流的账户数据模式（实施中发现的缺陷）
  - 覆盖验收标准：AC6
  - 依赖：无（T7 实测中发现；与 T1–T6 无耦合）
  - 涉及范围：`apps/server/src/automation/workflow-runner.service.ts`（注入 `PrismaService`）、`apps/server/test/automation-runtime.test.ts`。
  - 完成条件：`closeSnapshots` 按账户自身的 `mode` 调用 `performance.capture`（原实现未传 mode，恒用默认 `actual`，导致影子账户快照被 history 的 mode 过滤排除，违背 Spec 决策 5「模拟模式拍影子账户」）；请求中账户不存在的 id 跳过，不产生孤儿快照行。
  - 验证方式：目标测试断言按账户模式分发捕获、未知账户跳过；影子账户实测。
  - 验证证据：
    - `pnpm exec vitest run test/automation-runtime.test.ts`（`apps/server`）：27 项通过（新增 closeSnapshots 模式分发 1 项）。
    - `pnpm typecheck`、`pnpm build`、ESLint：通过；服务端全量 392 项通过。
    - 实测：修复重建后对影子账户 close-snapshots 返回 `payload.mode = shadow`，影子收益历史出现数据点；修复前写入的 1 条孤儿快照行已清理。

## Planning Review

- Spec 的 AC1–AC9 均映射到具体任务：AC1 → T4、T7；AC2 → T2、T4、T7；AC3 → T1、T4、T7；AC4 → T1、T4、T7；AC5 → T3、T7；AC6 → T6、T7、T8；AC7 → T4、T7；AC8 → T5、T7；AC9 → T1–T4、T6 的测试与 T7 全量；无孤立验收标准，任务未引入 Spec 之外的范围（T8 为实施中发现的、满足 Spec 决策 5 所必需的服务端缺陷修复）。
- 未发现占位标记或未定义契约：cron 预设值、创建默认值（retry/lockTtl/timezone/enabled）、通知 policy、7 种类型与各状态中文文案、409 文案均已固化，无需实施者猜测。
- 依赖核查：T2、T3 依赖 T1 是同文件顺序编辑的安全约束；T4 依赖 T1、T2 是真实端点契约依赖；T5 依赖 T4 为同文件约束；T6 无依赖，可与 T1–T5 并行；T7 依赖全部任务；T8 无依赖。无人为串行化（T2 与 T3 在 T1 后可并行）。
- 跨任务契约：T4 消费 T1/T2 的三个端点契约（含 409 文案与错误 message 透传语义）；T6 消费 close-snapshots 契约（T8 修正其服务端语义，请求契约不变）。
- 无 Blocking 问题；Non-blocking 默认假设已记录在 Spec（失败通知冷却参数 30min/3 次；收益页无账户时禁用一键快照按钮；组合范围曲线的既有读模型边界）。
- 结论：Ready with non-blocking assumptions（实施前）；实施后见「最终一致性 Review」。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证；如已获提交授权，已形成合理 commit，否则已记录提交状态或建议边界
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：T1–T8 全部完成。AC1–AC9 均有自动化测试证据；AC5 已于 2026-09-07 补充实机验证（见文末附节），其余 AC 均有实机证据。
- 发现的问题（均已在实施中修复）：
  1. `closeSnapshots` 工作流未传账户数据模式，影子账户快照恒被标记为 actual 且被收益历史过滤（见 T8，浏览器与 API 实测发现）；
  2. 编辑器「启用」开关使用无样式 Switch 变体导致 0×0 不可见（见 T4 证据，浏览器目检发现）；
  3. `AutomationService` 注入 `NotificationService` 误用 `import type` 导致 Nest DI 元数据缺失、容器启动失败（改为与 risk/cash-plans 一致的值导入后恢复）。
- 遗留风险：
  - 收益页默认「全部账户」视图的组合曲线只读 `accountId` 为空的聚合快照，逐账户拍摄不会点亮该视图（单账户视图正常）；已记入 Spec 未决问题 Non-blocking，并立项为独立后续任务：见 [`2026-09-07-portfolio-aggregate-snapshot.md`](2026-09-07-portfolio-aggregate-snapshot.md)（当前 Blocked，待设计定案）。
  - 实测为实际账户写入 3 条估值快照、影子 test 账户写入 1 条 0 值快照（功能正常输出，可按需删除 `PortfolioSnapshot` 行）。
- 验证命令与结果：`pnpm exec vitest run`（apps/server）：48 文件 392 项全部通过；`pnpm exec vitest run`（apps/desktop）：21 文件 157 项全部通过；两端 `pnpm typecheck`、`pnpm build`；变更文件 ESLint；`node scripts/check-boundaries.mjs`（OK）；`node scripts/check-workspace-dependencies.mjs`（OK）；`node scripts/check-file-size-guardrails.mjs`（ratchet passed）；dev 栈重建后 API 实测与浏览器目检（含截图）。
- 提交状态：未提交（未获提交授权），全部修改保留在工作区；建议 commit 边界：服务端（T1+T2+T3+T8：schema/端点/通知/工作流修复与其测试）与桌面端（T4+T5+T6：任务管理闭环/头部对齐/一键快照与其测试）各一个 commit。
- 环境说明：桌面 dev server（localhost:5173）为本轮验证启动，仍在后台运行；dev 栈镜像已含全部服务端修复。

## 2026-09-07 代码评审修复与 AC5 实机验证

两轴代码评审（Standards/Spec）的修复记录（评审时点工作区另含更早任务的未提交改动，已按组区分归属）：

- 文档更正：本 Spec 状态头改为「已实施完成」（消除与任务文档的 SSOT 矛盾）；决策 3 澄清为「接口层四项均支持，UI 仅暴露名称/cron/启用」；T5 完成条件措辞对齐实际实现（刷新沿用 `load()` 重取，与失效根键语义等价）。
- AC7 按 Spec 字面修正：「休市日自动跳过」从面板描述移入「类型」列表头（`类型（market 类休市日自动跳过）`）。
- 去重与类型化：ghost 刷新按钮抽为 `features/shared/RefreshIconButton`（Provider/市场/组合/风险四页共用）；providers 三个 mutation 的失效逻辑与三处错误 toast 各抽本地 helper；risk.mutations 四处相同的 onSuccess 失效抽 `invalidateRulesOnSuccess`；`AutomationJobDraft.schedulePreset` 类型化为 `AutomationSchedulePreset` 联合类型，`AUTOMATION_CUSTOM_CRON` 更名 `AUTOMATION_SCHEDULE_CUSTOM`（名实一致）。
- 跨任务判断题修复（用户确认后执行）：
  - 风险事件数值标签改为服务端下发语义标识：domain 各规则调用点在 `metadata.valueMetric` 写入新增的 `RiskEventMetric` 类型，桌面 `riskEventValueLabel` 优先读该标识、存量事件保留 inputs 探测兜底；chip-ratio 既有 `metadata.metric`（筹码维度名）与新键不冲突。
  - market-control 的 stale revision 识别改用错误码：DSA 远端本就以 `STALE_REVISION` 为错误码返回，`dsa.client` 新增 `'stale-revision'` DsaError code 保留该语义（原先被折叠进 `control-rejected`），`isStaleRevisionError` 由 message 文本匹配改为 `code === 'stale-revision'`，`syncState` 判定同步涵盖新码；原『早于当前』文本匹配删除（对本地 ConflictException 本就不可达——`safeError` 会抹除非 DsaError 文案）。
- 附带发现并修复：「收益指标中文化」早期改动把 domain XIRR 报错文案改为「资金加权收益率…」但未同步 `apps/server/test/performance-correctness.test.ts` 断言；domain 重建后用例失败，已按其意图补齐断言（该组归属确认仍待用户）。
- 评审遗留（待用户指认归属后补登记，当前未修）：risk 归档/恢复、market-control STALE_REVISION rebase 机制本身、收益指标中文化、组合页 ghost 刷新、`newProviderDraft` 默认名改动、`automation-runtime.service.ts` 行为新增（risk-evaluation 模拟组合后台扫描、daily-digest actual 过滤）——以上均无 Spec 记录。
- AC5 实机验证（用户确认方案后执行）：暂停 DSA 容器 + 创建每分钟 `market-sync` 任务 → 调度连续失败（'DSA 不可用'），`NotificationDelivery` 仅 1 条 `automation-run`/error/delivered（dedupKey `automation-failure:{jobId}:{runId}`，第二次失败被 30 分钟冷却抑制未重复入队）；手动 run-now 返回 500 + 原始 message 且投递数不变（手动路径不通知）；删除该任务返回 409；测试任务/运行记录/投递记录经 psql 清理，DSA 已恢复、栈健康。验收边界关闭。
- 修复后验证：`pnpm exec vitest run`（apps/server）：48 文件 392 项通过；（apps/desktop）：21 文件 159 项通过（含新增 valueMetric 标签与冷却外自动化回归）；domain 包 98 项通过；两端 typecheck、变更文件 ESLint、`check-boundaries.mjs` 通过。提交状态仍为未提交。
