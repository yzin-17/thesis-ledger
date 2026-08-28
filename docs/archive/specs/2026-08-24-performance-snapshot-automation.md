# 收益分析 Snapshot 自动化入口（历史基线）

- 日期：2026-08-24
- 状态：已被 [`投资组合快照系统 Spec`](../../specs/2026-08-28-portfolio-snapshot-system.md) 取代
- 适用范围：`apps/desktop`、Automation Job、Portfolio Snapshot

当前实现入口改用 [`投资组合快照系统 Spec`](../../specs/2026-08-28-portfolio-snapshot-system.md) 及其对应任务；本文件保留原始交互需求和历史上下文，不再作为实施 SSOT。

## 背景

收益分析依赖 Portfolio Snapshot 计算历史曲线、TTWROR 和 XIRR。该历史方案主要解决 Desktop 缺少 Snapshot 自动化配置入口的问题：用户需要能够创建、编辑、启停 Snapshot Automation Job，并在收益分析无历史 Snapshot 时得到明确引导。

## 历史目标

1. 让用户无需直接调用 API 即可创建、编辑和启停 Snapshot 自动化任务。
2. 在收益分析没有历史 Snapshot 时提供明确的配置入口和数据状态说明。
3. 保留手动创建 Snapshot 的能力，并诚实表达 partial、缺失行情和失败状态。
4. 保持当时 Snapshot API 与 Automation Scheduler 兼容，不重新定义收益计算口径。

## 历史边界

- Automation Job 使用 `snapshot` 类型和既有 Scheduler，不创建第二套调度模型。
- Snapshot 的实际/影子、账户范围需要显式表达，Desktop 不隐式猜测。
- 行情不完整或任务失败时保留 partial、缺失标的和失败原因，不伪造完整收益数据。
- 收益分析无 Snapshot 时应引导用户配置自动快照或手动创建 Snapshot。

这些目标已经被 2026-08-28 的投资组合快照系统吸收并扩展；后续实现、接口和验收只以新 Spec/Task 为准。

对应历史任务：[`../tasks/2026-08-24-performance-snapshot-automation.md`](../tasks/2026-08-24-performance-snapshot-automation.md)。
