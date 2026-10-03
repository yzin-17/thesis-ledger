# 回测依赖事实路由收敛

## 改动与调用核对

- Server 唯二仍调用的 DSA V2 回测依赖方法是 Calendar 与 Instrument Facts。它们现通过 `/api/v3/thesis-ledger/backtest/calendar` 和 `/api/v3/thesis-ledger/backtest/instrument-facts` 获取响应；共享 Schema 与 DSA 返回均固定 `version: 3`，旧版本拒绝。
- DSA 旧 V2 公司行动路由已删除，当前公司行动仍由 V3 事件输入冻结 Snapshot。旧 Calendar、Instrument Facts 与公司行动三个 URL 的 404 断言通过。
- 交易日历发布时点、执行规则覆盖、历史可交易性缺失原因和公司行动策略可见性校验未放宽。旧 V2 Capabilities 与 Bars 路由暂存，另叶清理。

## 验证与范围

- Schemas 定向 10 项、完整 563 项及构建通过；Server 类型检查、回测定向 28 项（另 1 项集成测试按配置跳过）、完整 1687 项通过且 81 项跳过；边界门禁通过。
- DSA 依赖定向 23 项与合同定向 16 项通过；官方离线全量 7601 项通过、1 项跳过、4 项未选。新增旧路由 404 测试在全量启动后写入，并在定向复验通过。Python 编译通过。flake8 全文件运行报告 7 处既有错误；删除路由引入的空行错误已修复，最终改动 `git diff --check` 通过。
- PostgreSQL、目标 Docker、真实 Provider 与端到端业务门禁未因本叶执行，C03/E01/E04/D02/D03 保持未勾选。
