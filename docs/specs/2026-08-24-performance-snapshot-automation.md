# 收益分析 Snapshot 自动化入口

- 日期：2026-08-24
- 状态：待实现
- 适用范围：`apps/desktop`、Automation Job、Portfolio Snapshot

## 背景

收益分析依赖 Portfolio Snapshot 计算历史曲线、TTWROR 和 XIRR。当前服务端已经支持手动调用 Snapshot 接口，也支持通过 `snapshot` 类型的 Automation Job 定时生成，但 Desktop 仍缺少创建和编辑该任务的用户入口。

当前“数据与自动化”页面只能查看已有任务并启用或停用；任务列表为空时，用户无法从界面配置 Snapshot 保存频率，也无法从收益分析空状态完成引导。

## 目标

1. 让用户无需直接调用 API，即可创建、编辑、启停 Snapshot 自动化任务。
2. 在收益分析没有历史 Snapshot 时提供明确的配置入口和数据状态说明。
3. 保留手动创建 Snapshot 的能力，并诚实表达 partial、缺失行情和失败状态。
4. 保持现有 Snapshot API 与 Automation Scheduler 兼容，不重新设计 Snapshot 计算口径。

## 非目标

- 不修改 TTWROR、XIRR、成本、现金或 Snapshot 的计算公式。
- 不在本次工作中重构 Automation Scheduler。
- 不把缺失行情按零值写入或伪造完整收益数据。
- 不修改现有手动 Snapshot API 的兼容行为。

## 产品范围

### 1. 数据与自动化入口

在“数据与自动化”页面提供“收益快照”配置卡片或创建任务 Sheet：

- 任务类型固定为 `snapshot`；
- 支持任务名称、保存频率、时区和启用状态；
- 支持明确 Snapshot 生成范围：实际/影子模式，以及全部账户或指定账户；
- 保存成功后刷新任务列表，展示启用状态、下一次运行时间和最近一次运行结果；
- 已有 Snapshot 任务可以继续编辑、启停和查看最近运行状态。

### 2. 收益分析入口

收益分析没有可用历史 Snapshot 时：

- 不显示伪造的收益结果；
- 提供“设置自动快照”入口并跳转到“数据与自动化”；
- 展示最近 Snapshot 时间；没有 Snapshot 时明确说明尚未生成历史数据。

### 3. 手动 Snapshot

提供“立即创建 Snapshot”操作：

- 成功后刷新依赖 Snapshot 的收益数据；
- 行情不完整时保留 partial 状态和缺失标的说明；
- 失败时显示可理解的失败原因和重试入口，不把失败当成成功数据。

## 数据与边界

- Automation Job 继续使用现有 `snapshot` 类型和 Scheduler，不创建第二套调度模型。
- Snapshot 的实际/影子、账户范围必须由任务配置显式表达，不能由 Desktop 隐式猜测。
- 页面读取、创建、编辑、启停和立即运行应继续使用现有 Query/Mutation 与服务端接口边界。
- Snapshot 数据质量仍以服务端事实为准；Desktop 不依据记录是否存在自行推断完整性。

## 测试与运行时验收

至少覆盖：

- 创建、编辑和启停 Snapshot Automation Job；
- 空任务列表与已有任务状态；
- 收益分析无 Snapshot 的引导；
- 手动创建成功、失败和 partial；
- 保存后的 Query 刷新与最近运行状态；
- 宽屏、窄屏和键盘交互；
- 至少一次实际定时任务运行验收。

## 验收标准

1. 新用户无需调用 API，即可在 Desktop 配置并启用 Snapshot 自动保存。
2. 收益分析页面能够明确显示最近 Snapshot 时间；没有 Snapshot 时能引导用户完成配置。
3. 用户可以手动立即创建 Snapshot；行情不完整时页面保留 partial 和缺失标的说明。
4. 任务失败不会伪造收益数据，页面显示失败原因和可重试入口。
5. 现有手动 Snapshot API 和 Automation Scheduler 行为保持兼容。
6. 创建、编辑、启停、失败重试和实际定时运行均有对应验证证据。

对应实施任务：[`../tasks/2026-08-24-performance-snapshot-automation.md`](../tasks/2026-08-24-performance-snapshot-automation.md)。
