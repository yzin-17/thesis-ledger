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

- [x] T4：将 Provider 缺失与动作通知结果提升到主操作上下文
  - 覆盖验收标准：AC6
  - 依赖：T3
  - 涉及范围：风险中心全局提示、立即执行与人工测试 Toast、扫描结果类型、交互测试。
  - 完成条件：实际模式未配置 Provider 时所有页签可见配置提示；扫描反馈区分已配置、未配置、状态未知和模拟模式；人工测试明确为不发送通知的规则试算。
  - 实现要点：
    - 新增 `NotificationProviderNotice`，渲染在 `<Tabs>` 之外，因此全部页签均可见；模拟模式与已配置时不渲染，不重复警告。
    - 组件额外接收 `routingState`，路由仍在确认时不渲染横幅，避免把加载中误报为“状态暂不可用”（修复验证过程中发现的缺陷）。
    - `RiskNotificationTable` 不再内嵌 Provider 缺失/未知提示，`onConfigure` 上移到风险中心并跳转到 `/providers`。
    - 抽离 `riskActionFeedback(action, mode, notificationAvailability, triggeredCount)`，统一表达扫描与人工测试的通知结果语义；模拟模式判断先于 Provider 缺失判断，避免用 Provider 警告掩盖模式语义。
    - 新增 `RiskScanResult` 类型并用于 `scanRisk` 与 `useScanRiskMutation`，扫描 Toast 按实际写入的事件数反馈（与 `POST /risk/scan` 返回的 `{ traceId, scanId, results }` 一致）。
  - 验证方式：Desktop 目标测试、typecheck、build、ESLint、Prettier。
  - 验证证据：
    - `pnpm exec vitest run test/risk-center-interaction.test.tsx test/ui-contract.test.tsx`（`apps/desktop`）：33 项通过（T3 为 28 项，新增 5 项覆盖全局提示、加载态与剩余反馈分支）。
    - `pnpm typecheck`（`apps/desktop`）：通过。
    - `pnpm build`（`apps/desktop`）：通过；保留既有大 chunk 警告。
    - 变更文件 ESLint 与 Prettier：通过。
    - `pnpm exec vitest run`（`apps/desktop` 全量）：135 项通过，1 项失败为与本次改动无关的既有失败（见 Review 结论的遗留风险）。

## Planning Review

- Spec 的 AC1–AC6 均映射到具体任务，无孤立验收标准。
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

- 结论：T1–T4 全部完成。
- 发现的问题：验证过程中发现全局提示在路由查询 `isPending` 期间会短暂显示“通知 Provider 状态暂不可用”，把加载中误报为不可用；已通过让 `NotificationProviderNotice` 接收 `routingState` 并在加载态不渲染修复，并补充对应测试。除此之外无其他问题。
- 遗留风险：
  - 未执行真实飞书 Webhook 投递和浏览器人工视觉验收；当前仅实现飞书适配器，其他通知 Provider 不会形成路由。
  - 操作列表头 `<th>` 为 `text-right`，而 `PortfolioPositionObservation.tsx` 的操作列改为单行 `flex gap-1` 后按钮左对齐；列宽按内容自适应（约 180px，大于声明的 `w-40`）。已与用户确认保留新样式，未在本 Spec 内处理，建议作为独立的视觉对齐项跟进。
- 验证命令与结果：Server 53 项目标测试、Desktop 33 项目标测试、Desktop 全量 136 项全部通过（无失败）、两端 typecheck/build、变更文件 ESLint 与 Prettier、边界门禁、`git diff --check` 均通过。
- 附带修复（与本 Spec 无关的既有测试失败）：`test/account-data.ui.test.tsx` 断言 `flex flex-wrap justify-end gap-1` 自 `8deaa77` 起与实现漂移（该 commit 的 Spec 将「不重构其他资产页面」列为非目标）。已按用户确认保留新的单行布局，将断言更新为 `flex gap-1` 并注释说明；全量测试由此从 135 通过 / 1 失败变为 136 项全部通过。
- 提交状态：未提交，保留工作区现有修改。

## 2026-09-04 后续修订：渠道识别从名称改为凭证形态

- 起因：用户将通知 Provider 命名为「飞书」（中文）后，连接测试报「尚未接入连接测试插件」且通知不会投递——原实现对渠道按名称别名（feishu/feishu-webhook/lark/lark-webhook）识别，任意命名即失效。用户确认原则：**渠道识别只依据凭证输入，不使用名称等内置标识**。
- 改动：
  - `feishu-webhook-security.ts` 新增非抛出的 `detectFeishuWebhookUrl(credential): URL | null`，作为渠道识别的唯一依据。
  - `provider-config.service.ts` 连接测试：通知类型按凭证形态识别并执行飞书连通性测试；凭证形态不符时提示填写 `https://open.feishu.cn/open-apis/bot/v2/hook/...` 形式地址；非通知类型（如 tushare 行情）维持「尚未接入连接测试插件」，避免误导用户改凭证。
  - `notification.service.ts` `configuredRoutes`：路由同样只按凭证形态识别（与连接测试保持一致，否则会出现「测试成功但不投递」的新陷阱）；`resolveProvider` 的渠道匹配不再经过名称归一化，历史投递记录的 `channel` 恒为 `feishu`，行为兼容。
  - 桌面端 `providerCredentialLabel` 移除名称别名分支（桌面端看不到凭证，无法判断渠道，只按类型显示 `Webhook / Token`）。
  - `provider-health.service.ts` 的名称归一化保留，仅用于健康记录键的历史兼容，不参与渠道识别。
- 测试：`notification-runtime.test.ts` 新增「渠道按凭证形态识别，Provider 名称不影响路由」（名称「飞书」+ 有效 Webhook 正常路由）与「凭证不是受支持 Webhook 时即使名称命中别名也不形成路由」；`providers/services.test.ts` 新增连接测试三分支（有效凭证 healthy / 通知类型凭证不符 untested / 非通知类型 untested）。
- 验证：Server 目标测试 77 项通过（8 文件）、Desktop 全量 136 项通过、两端 typecheck、变更文件 ESLint 与 Prettier、边界门禁、`git diff --check` 均通过。
- 附注：Desktop 全量在本轮曾出现 2 例 `ui-contract` 5s 超时（全源码扫描类 I/O 测试），当时文件系统较平时慢约 20 倍；以 `--testTimeout=60000` 复跑 15/15 与全量 136/136 通过，确认非回归。
- 提交状态：仍未提交，并入工作区现有修改。
