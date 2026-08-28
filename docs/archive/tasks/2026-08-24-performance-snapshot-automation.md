# 收益分析 Snapshot 自动化入口实施任务（历史基线）

对应历史规格：[`../specs/2026-08-24-performance-snapshot-automation.md`](../specs/2026-08-24-performance-snapshot-automation.md)

状态：已被 [`投资组合快照系统实施任务`](../../tasks/2026-08-28-portfolio-snapshot-system.md) 取代

本文件保留原始任务拆分，不再作为当前实施入口。

## 历史任务清单

- T1：在“数据与自动化”页面增加收益快照配置入口。
- T2：支持任务名称、保存频率、时区、启用状态和 Snapshot 范围。
- T3：保存后刷新任务列表，展示下一次运行和最近运行结果。
- T4：在收益分析无历史数据时提供设置自动快照的引导。
- T5：提供立即创建 Snapshot，并保留 partial / 缺失标的状态。
- T6：补充创建、编辑、启停、失败重试和 Query 刷新的测试。
- T7：进行宽屏、窄屏、键盘操作和实际定时任务运行验收。

## 归档结论

上述目标已经被 2026-08-28 的 Portfolio Snapshot System 重新收敛并作为当前 SSOT。新开发不得继续在本任务追加范围；需要修改 Snapshot 行为时更新当前 Snapshot Spec/Task。
