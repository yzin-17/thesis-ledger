# 组合范围估值快照实施任务

关联 Spec：[`../specs/2026-09-07-portfolio-aggregate-snapshot.md`](../../specs/2026-09-07-portfolio-aggregate-snapshot.md)

## 状态

**已完成**（2026-09-07 定案候选 A 并实施；T3 按定案无桌面改动，取消并记录）。

## 实施任务

- [x] T1：定案组合聚合快照捕获设计
  - 覆盖验收标准：解除全部阻塞（AC1–AC4 草案随之冻结）
  - 依赖：无（用户/产品决策）
  - 涉及范围：仅文档——修订 [`../specs/2026-09-07-portfolio-aggregate-snapshot.md`](../../specs/2026-09-07-portfolio-aggregate-snapshot.md)：在候选 A/B/C 中定案、确定聚合快照的模式范围与 fx/baseCurrency 语义、冻结验收标准，并同步修订自动化配置台 Spec（`2026-09-05-automation-console-design.md`）未决问题第三条的状态链接。
  - 完成条件：Spec 无 Blocking 问题；验收标准从草案转为冻结；本任务勾选并在验证证据中记录定案结论。
  - 验证方式：Spec 修订后按 planning preflight 复查（Spec 覆盖、占位扫描、依赖、跨任务一致性）。
  - 验证证据：2026-09-07 用户确认候选 A；Spec 已修订冻结（定案写入「未决问题」「验收标准」），planning preflight 复查通过。

- [x] T2：服务端聚合快照捕获实施
  - 覆盖验收标准：AC1（草案）、AC3（草案，若定案含调度路径）
  - 依赖：T1
  - 涉及范围：以 T1 冻结的 Spec 为准；预期落在 `apps/server/src/automation/workflow-runner.service.ts`（或定案指定的捕获入口）与 `apps/server/test/automation-runtime.test.ts`；若定案为候选 C 则为读模型查询侧。
  - 完成条件：按定案产出组合范围可见的快照数据；既有逐账户捕获、影子/实际模式过滤与 T8 的账户模式推断行为不变。
  - 验证方式：目标测试（内存假件断言聚合捕获的触发、模式与参数）+ `pnpm typecheck` + 服务端全量测试。
  - 验证证据：`pnpm exec vitest run test/automation-runtime.test.ts`：27 项通过（closeSnapshots 用例断言 4 次捕获：两账户各一 + 每模式一份组合聚合）；服务端全量 48 文件 392 项通过、typecheck 0 错误、ESLint 通过。实现：`workflow-runner.service.ts` closeSnapshots 按请求内出现的数据模式各追加一次 `capture(undefined, capturedAt, mode)`。

- [x] T3：桌面端契约接线（定案 A 契约不变，任务取消并记录）
  - 覆盖验收标准：AC1（草案）
  - 依赖：T1、T2
  - 涉及范围：`apps/desktop/src/features/performance/`（api/mutation 按定案契约调整）、`apps/desktop/test/performance-ui.test.tsx`；若定案为候选 B/C（无桌面契约变化）则本任务取消并在验证证据中记录。
  - 完成条件：一键快照请求符合冻结契约；失败与成功反馈语义保持。
  - 验证方式：目标测试 + `pnpm typecheck`。
  - 验证证据：定案 A 契约不变，桌面端零改动——`test/performance-ui.test.tsx` 既有请求契约用例继续通过（桌面全量 159 项）。

- [x] T4：dev 栈重建与验收实测
  - 覆盖验收标准：AC1–AC4（以冻结版为准）
  - 依赖：T2、T3
  - 涉及范围：`../thesis-ledger-infra` dev 栈重建、浏览器目检、两端全量测试。
  - 完成条件：一键快照后默认「全部账户」组合视图曲线出现数据点；单账户与影子/实际模式行为回归无变化；两端测试与门禁全绿。
  - 验证方式：实测记录（截图）+ 全量测试输出；完成后按归档规则评估本任务与父任务（`2026-09-05-automation-console-design.md`）的归档。
  - 验证证据：dev 栈重建后 API 实测：close-snapshots（3 个实际账户）返回 4 条快照，第 4 条 `accountId=null`/`payload.mode=actual`；`GET /performance/history?mode=actual` 出现组合数据点 ¥1,473.00；单账户视图回归正常（同花顺 5 点）。浏览器目检：默认「全部账户」视图资产走势渲染首点、空状态消失。

## Planning Review

- 草案验收标准与任务的映射在 T1 定案后冻结；当前 T2–T4 的完成条件刻意以「T1 冻结的 Spec」为边界，避免在未定案时预设实现契约。
- 阻塞记录：Spec Blocking 1–3 未决，属 planning blocker；本任务目录保留直至定案与实施完成。
- 无占位描述：所有「以定案为准」的表述均指向唯一事实源（Spec 修订），不要求实施者猜测。
- 结论：实施前为 Blocked；2026-09-07 用户定案候选 A 后解除，T1–T4 全部完成（T3 因契约不变取消）。

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

- 结论：T1、T2、T4 完成，T3 按定案（契约不变）取消并记录。AC1–AC4 全部满足：组合曲线在默认「全部账户」视图点亮（API 与浏览器双重验证），单账户与模式过滤回归无变化，调度与手动路径共用工作流自动获得聚合快照，测试全绿。
- 发现的问题：无。
- 遗留风险：组合聚合快照以 `performance.capture` 默认 fx 口径生成（fxMerge 默认开），页面默认视图关闭汇率合并时按 native 口径回放——当前单币种（CNY）环境两者数值一致，多币种组合如出现口径差异需再评估。
- 验证命令与结果：`pnpm exec vitest run`（apps/server）：48 文件 392 项通过（含 closeSnapshots 聚合用例）；（apps/desktop）：21 文件 159 项通过；typecheck、ESLint 通过；dev 栈重建后 API 实测与浏览器目检（含截图）。
- 提交状态：未提交（未获提交授权），保留在工作区。
