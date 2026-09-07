# 自动估值快照入口实施任务

对应 Spec：[`../specs/2026-09-07-automatic-snapshot-entry.md`](../specs/2026-09-07-automatic-snapshot-entry.md)

状态：已完成，待归档

## 任务

- [x] T1：移除收益分析的手动快照入口
  - 覆盖验收标准：AC1、AC3
  - 依赖：无
  - 涉及范围：`apps/desktop/src/features/performance/PerformanceDashboard.tsx`、`PerformanceSections.tsx`、`performance.mutations.ts`、`performance.api.ts` 及 `apps/desktop/test/performance-ui.test.tsx`。
  - 完成条件：页面不再渲染拍摄按钮；只服务于该按钮的 Desktop 状态和请求代码被删除；服务端自动化工作流保持不变。
  - 验证方式：Desktop performance UI 目标测试、Desktop typecheck、静态搜索确认无残留手动入口文案和调用。
  - 验证证据：`pnpm exec vitest run test/performance-ui.test.tsx test/providers-automation-ui.test.tsx`：30 项通过；`pnpm typecheck`：通过；`apps/desktop/src` 静态搜索无手动入口文案、回调、mutation、请求函数或输入类型残留。

- [x] T2：创建并验证当前环境的定时快照任务
  - 覆盖验收标准：AC2、AC3
  - 依赖：无
  - 涉及范围：通过现有 `POST /automations` 创建当前环境配置；通过 `GET /automations` 和既有自动化页面验证展示。
  - 完成条件：存在且仅新增一条名为“每日估值快照”的启用任务，类型为 `snapshot`，cron 为 `0 16 * * 1-5`，时区为 `Asia/Shanghai`；既有任务不变。
  - 验证方式：创建前后读取任务列表；运行 Server 自动化运行时目标测试；读取任务的 `nextRunAt`。
  - 验证证据：创建前 `GET /automations` 无 `snapshot` 任务；通过现有创建接口新增任务 `7b72db09-5642-423f-89c6-20cb9c790030`；创建后接口返回且仅返回一条 `snapshot` 任务，启用、cron 与时区符合要求，`nextRunAt=2026-09-08T08:00:00.000Z`；既有现金任务保持不变；Server `automation-runtime.test.ts` 27 项通过。

- [x] T3：完成回归与一致性 Review
  - 覆盖验收标准：AC1、AC2、AC3、AC4
  - 依赖：T1、T2
  - 涉及范围：变更文件格式检查、Desktop/Server 目标回归、当前 dev 栈只读验收、Spec/Task 同步。
  - 完成条件：全部验收标准有当前代码或运行态证据，未把手动入口残留在其他调用层，未修改已有快照与自动化历史。
  - 验证方式：目标测试、typecheck、`git diff --check`、API 查询和最终一致性 Review。
  - 验证证据：变更文件 Prettier 检查通过；`git diff --check` 通过；Desktop 30 项与 Server 27 项目标测试通过；Desktop typecheck 通过；运行态 API 验证通过。应用内浏览器对 `localhost`/`127.0.0.1` 均返回客户端拦截，未取得浏览器目检证据，不将 API 验证表述为浏览器验收。

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

- 结论：Ready。AC1–AC4 已由当前代码、目标测试、类型检查和运行态任务查询覆盖；任务可归档。
- 发现的问题：无。
- 遗留风险：应用内浏览器阻止访问本地地址，未取得浏览器目检证据；当前任务是环境级持久化配置，新建数据库不会自动包含该任务。
- 验证命令与结果：Desktop 目标测试 30 项通过、Desktop typecheck 通过、Server 自动化运行时目标测试 27 项通过、Prettier 与 `git diff --check` 通过、dev API 任务查询通过。
