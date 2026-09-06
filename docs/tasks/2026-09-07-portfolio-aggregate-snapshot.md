# 组合范围估值快照实施任务

关联 Spec：[`../specs/2026-09-07-portfolio-aggregate-snapshot.md`](../specs/2026-09-07-portfolio-aggregate-snapshot.md)

## 状态

**阻塞**：Spec 存在未决 Blocking 问题（聚合快照捕获方案三选一及模式/fx 语义），T1 定案前不得实施任何任务。

## 实施任务

- [ ] T1：定案组合聚合快照捕获设计
  - 覆盖验收标准：解除全部阻塞（AC1–AC4 草案随之冻结）
  - 依赖：无（用户/产品决策）
  - 涉及范围：仅文档——修订 [`../specs/2026-09-07-portfolio-aggregate-snapshot.md`](../specs/2026-09-07-portfolio-aggregate-snapshot.md)：在候选 A/B/C 中定案、确定聚合快照的模式范围与 fx/baseCurrency 语义、冻结验收标准，并同步修订自动化配置台 Spec（`2026-09-05-automation-console-design.md`）未决问题第三条的状态链接。
  - 完成条件：Spec 无 Blocking 问题；验收标准从草案转为冻结；本任务勾选并在验证证据中记录定案结论。
  - 验证方式：Spec 修订后按 planning preflight 复查（Spec 覆盖、占位扫描、依赖、跨任务一致性）。

- [ ] T2：服务端聚合快照捕获实施
  - 覆盖验收标准：AC1（草案）、AC3（草案，若定案含调度路径）
  - 依赖：T1
  - 涉及范围：以 T1 冻结的 Spec 为准；预期落在 `apps/server/src/automation/workflow-runner.service.ts`（或定案指定的捕获入口）与 `apps/server/test/automation-runtime.test.ts`；若定案为候选 C 则为读模型查询侧。
  - 完成条件：按定案产出组合范围可见的快照数据；既有逐账户捕获、影子/实际模式过滤与 T8 的账户模式推断行为不变。
  - 验证方式：目标测试（内存假件断言聚合捕获的触发、模式与参数）+ `pnpm typecheck` + 服务端全量测试。

- [ ] T3：桌面端契约接线（如定案需要请求契约变化）
  - 覆盖验收标准：AC1（草案）
  - 依赖：T1、T2
  - 涉及范围：`apps/desktop/src/features/performance/`（api/mutation 按定案契约调整）、`apps/desktop/test/performance-ui.test.tsx`；若定案为候选 B/C（无桌面契约变化）则本任务取消并在验证证据中记录。
  - 完成条件：一键快照请求符合冻结契约；失败与成功反馈语义保持。
  - 验证方式：目标测试 + `pnpm typecheck`。

- [ ] T4：dev 栈重建与验收实测
  - 覆盖验收标准：AC1–AC4（以冻结版为准）
  - 依赖：T2、T3
  - 涉及范围：`../thesis-ledger-infra` dev 栈重建、浏览器目检、两端全量测试。
  - 完成条件：一键快照后默认「全部账户」组合视图曲线出现数据点；单账户与影子/实际模式行为回归无变化；两端测试与门禁全绿。
  - 验证方式：实测记录（截图）+ 全量测试输出；完成后按归档规则评估本任务与父任务（`2026-09-05-automation-console-design.md`）的归档。

## Planning Review

- 草案验收标准与任务的映射在 T1 定案后冻结；当前 T2–T4 的完成条件刻意以「T1 冻结的 Spec」为边界，避免在未定案时预设实现契约。
- 阻塞记录：Spec Blocking 1–3 未决，属 planning blocker；本任务目录保留直至定案与实施完成。
- 无占位描述：所有「以定案为准」的表述均指向唯一事实源（Spec 修订），不要求实施者猜测。
- 结论：**Blocked**（等待 T1 定案；定案前不得实施 T2–T4）。
