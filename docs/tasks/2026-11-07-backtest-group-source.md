# 回测分组来源修复

对应 [Spec](../specs/2026-11-07-backtest-group-source.md)。仅修改 StrategyOptimizationReadService 未关联任务的来源投影及回归测试，保留其他工作区修改。

- [x] 定向测试与正式响应契约验证
- [x] Server 包测试、构建及相关门禁
- [x] 通过 infra 正式入口更新当前运行态
- [x] 实际 API 分页与浏览器只读验收

根因：实际 API 返回 200，但第 10 条记录 source.version=0 导致 strategyBacktestGroupPageSchema 拒绝整页。内部种子无 runRefs 关联，不应伪装成正式 existing 来源。

- [x] 实际浏览器发现的筛选栏断点、长名称列宽与窄屏弹层位置局部修复；23 项前端定向测试、build、lint 及四种宽度验证通过

最新结果见 [验收记录](../evidence/2026-11-07-backtest-group-source.md)。回测读取故障已修复并同步到当前开发运行态，无本任务剩余阻塞。未启用的集成测试及镜像正式更新不扩大为已验收。
