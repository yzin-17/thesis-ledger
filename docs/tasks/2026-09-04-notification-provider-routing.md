# 通知 Provider 路由与交互任务

关联 Spec：[`../specs/2026-09-04-notification-provider-routing.md`](../specs/2026-09-04-notification-provider-routing.md)

## 实施任务

- [x] T1：将通知入队改为 Provider 配置驱动
  - 覆盖验收标准：AC1、AC2、AC5
  - 依赖：无
  - 涉及范围：通知策略契约、Provider 路由解析、投递记录、路由摘要接口。
  - 完成条件：业务策略不含固定渠道；仅可投递 Provider 形成路由；同渠道按优先级选择一个 Provider。
  - 验证方式：通知服务目标测试、Server typecheck。
  - 验证证据：
    - `pnpm exec vitest run test/notification-runtime.test.ts test/notifications/services.test.ts test/cash-plans/recurring-cash-deposit.service.test.ts test/portfolio/services.test.ts test/automation/services.test.ts test/http-validation.test.ts`（`apps/server`）：53 项通过。
    - `pnpm typecheck`（`apps/server`）：通过。
    - `pnpm build`（`apps/server`）：通过。
    - `node scripts/check-boundaries.mjs`：通过。

- [x] T2：修正定期入账通知排队状态
  - 覆盖验收标准：AC2、AC5
  - 依赖：T1
  - 涉及范围：定期入账物化返回值与服务测试。
  - 完成条件：空入队结果与异常均返回 `notificationQueued = false`，有投递结果时返回 `true`，业务实例不回滚。
  - 验证方式：定期入账服务目标测试。
  - 验证证据：
    - 定期入账目标测试覆盖异常、空入队结果和真实投递结果，包含在 Server 53 项目标测试中并通过。

- [x] T3：优化风险中心通知 Provider 交互
  - 覆盖验收标准：AC3、AC4、AC5
  - 依赖：T1
  - 涉及范围：Desktop 通知 API/Query、风险通知页、组件测试。
  - 完成条件：已配置时展示实际 Provider；未配置时说明不会外发并可进入配置页；查询失败时显示未知状态。
  - 验证方式：Desktop 目标测试、typecheck、build。
  - 验证证据：
    - `pnpm exec vitest run test/risk-center-interaction.test.tsx test/ui-contract.test.tsx`（`apps/desktop`）：28 项通过。
    - `pnpm typecheck`（`apps/desktop`）：通过。
    - `pnpm build`（`apps/desktop`）：通过；保留既有大 chunk 警告。
    - 变更文件 ESLint：通过。

## Planning Review

- Spec 的 AC1–AC5 均映射到具体任务，无孤立验收标准。
- 未发现占位标记、模糊描述或未定义实现契约。
- T2、T3 依赖 T1 的路由语义与接口；二者可在 T1 后独立实施。
- 无 Blocking 问题；Non-blocking 默认仅影响未来新增通知适配器。
- 结论：Ready with non-blocking assumptions。

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

- 结论：Ready，T1–T3 已完成，AC1–AC5 均有实现与验证证据。
- 发现的问题：无。
- 遗留风险：未执行真实飞书 Webhook 投递和浏览器人工视觉验收；当前仅实现飞书适配器，其他通知 Provider 不会形成路由。
- 验证命令与结果：Server 53 项目标测试、Desktop 28 项目标测试、两端 typecheck/build、变更文件 ESLint、边界门禁、Prettier 与 `git diff --check` 均通过。
- 提交状态：未提交，保留工作区现有修改。
