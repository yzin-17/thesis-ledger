# 组合范围估值快照（聚合快照）Spec

日期：2026-09-07　状态：已定案（2026-09-07 用户确认候选 A），实施中
任务文档：[`../tasks/2026-09-07-portfolio-aggregate-snapshot.md`](../archive/tasks/2026-09-07-portfolio-aggregate-snapshot.md)
来源：自动化配置台实施验收（[`2026-09-05-automation-console-design.md`](2026-09-05-automation-console-design.md) 未决问题第三条）中发现的缺口，按用户要求立项跟踪。

## 背景与问题

估值快照的捕获链路（收益页「立即拍一个估值快照」按钮与 close-snapshots 工作流）按账户逐个拍摄，快照行带有 `accountId`。而收益页默认「全部账户」视图的组合资产曲线，按既有读模型语义只读取 `accountId` 为空的聚合快照（`performanceSnapshotWhere` 的 `{ accountId: null }` 分支）。结果：逐账户拍摄不会点亮组合视图的曲线——用户拍完快照后默认视图仍显示「暂无收益历史」，只有选择具体账户才能看到数据点（2026-09-06 实测确认）。

单账户曲线行为不受影响；问题仅存在于组合范围的可见性。

## 目标

- 收益页默认组合视图的资产曲线能被快照捕获点亮：一键快照与调度 close-snapshots 路径按定案产出组合范围可见的数据。
- 不回退单账户曲线与影子/实际数据模式的既有行为。

## 非目标

- 不修改收益历史读模型的查询语义（`performanceSnapshotWhere` 保持不变，除非定案明确选择候选 C）。
- 不做历史逐账户快照的回填补聚合。
- 不改变单账户快照的捕获语义与 payload 结构。

## 现状与约束

- `performance.capture(accountId?, capturedAt, mode, options)` 已支持 `accountId` 为空的组合聚合捕获（payload `accountScopePolicy: 'investment-only-v1'`），即服务端能力已存在，缺的是触发与契约。
- `POST /automations/workflows/close-snapshots` 请求契约当前为 `{ accountIds: string[], capturedAt }`，无模式字段；账户数据模式由服务端按账户记录推断（2026-09-06 T8 修复）。
- 组合聚合快照的模式（actual/shadow）与 fxMerge/baseCurrency 语义需要与页面展示一致，否则读模型仍会按 `snapshotMode` 过滤掉。

## 设计方案

**未决（Blocking）——以下候选仅为记录，定案前不得实施：**

- 候选 A（工作流扩展）：`close-snapshots` 契约扩展（如增加 `mode` 或 `includePortfolio`），逐账户拍摄后追加一次该模式的组合聚合捕获；一键快照与调度路径共用。
- 候选 B（仅调度路径）：调度 close-snapshots 任务追加组合聚合捕获，手动一键快照维持逐账户（默认视图点亮依赖调度）。
- 候选 C（读模型改造）：组合视图改为在查询端聚合逐账户快照，不新增写入；影响收益历史读模型，影响面最大。

## 对外行为或接口变化

定案为候选 A 的最小形态：**不扩展请求契约**（`{ accountIds, capturedAt }` 不变）。工作流在逐账户拍摄后，按请求内出现的数据模式各追加一次组合聚合快照（`capture(undefined, capturedAt, mode)`，组合 investment-only 口径，fx/baseCurrency 取 capture 默认值）；契约与桌面端零改动。

## 数据、状态或兼容性影响

- 每次捕获按出现的数据模式新增 1..2 条 `accountId = null` 的组合聚合 `PortfolioSnapshot` 行；既有逐账户快照与历史数据不受影响，桌面端零改动。
- 候选 C：无新增写入，但组合曲线的历史可见性取决于逐账户快照的存在时点。

## 测试策略

- 服务端：workflow/service 目标测试覆盖聚合捕获的触发条件、模式与参数传递（沿用 `test/automation-runtime.test.ts` 内存假件模式）。
- 桌面端：一键快照 mutation/请求契约测试（`test/performance-ui.test.tsx` 模式）。
- dev 栈实测：一键快照后默认组合视图曲线出现数据点，单账户视图回归。

## 风险与备选方案

- 组合聚合与逐账户快照并存可能造成同收益指标两套口径；需在定案时明确组合曲线唯一数据源。
- 候选 C 改读模型会影响全部组合范围查询，回归面大，需谨慎评估。

## 未决问题

### Blocking

无（2026-09-07 定案）：
1. 采用候选 A（工作流追加组合聚合捕获），契约不变；
2. 模式范围 = 请求内账户出现的数据模式集合，每种模式各一份组合聚合快照；
3. fx/baseCurrency 取 `performance.capture` 默认值（组合曲线按快照回放，不依赖捕获时的 fx 选项）。

### Non-blocking

无。

## 验收标准（已冻结）

- AC1：收益页默认「全部账户」视图在快照捕获后，组合资产曲线出现数据点（无需选择具体账户）。
- AC2：单账户曲线与影子/实际模式过滤行为与现状一致；未知账户 id 仍被跳过。
- AC3：调度 close-snapshots 路径与手动一键快照共用同一工作流，均按定案产出组合聚合快照。
- AC4：服务端与桌面端测试全绿，dev 栈实测组合曲线点亮。
