# S07 预检修订失效验证

## 本轮结果

当前未提交工作区新增 5 项执行行情预检回归：修改策略内容或初始资金后，原请求摘要失效，在读取行情前返回 `invalid-input` 且不返回修订凭据；读取过程中 Desired、Effective、Catalog 任一修订变化均返回 `blocked` 和重新预检建议。

生产代码已有相应拒绝逻辑，本轮未修改生产行为。创建入口的既有组合测试同时核对缺失或篡改准备凭据、实际 Reader 修订变化、目标变化和控制面不可用，拒绝非法创建；合法路径仍使用实际 Snapshot Builder 和离线 Runner。

## 验证证据

- `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-preflight-v3-execution.test.ts`：14 项通过。日志：`/private/tmp/goal-s07-revision-20260927.log`。
- `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-preflight-diagnostics.test.ts test/backtest/backtest-run-preparation.test.ts test/backtest/v3-create-retry-integration.test.ts`：37 项通过，包含实际 HTTP 准备路由和创建拒绝边界。日志：`/private/tmp/goal-s07-boundaries-20260927.log`。
- `rtk proxy pnpm --filter @thesis-ledger/server exec tsc --noEmit`：通过。日志：`/private/tmp/goal-s07-types-20260927.log`。

## 证据边界与后续

本轮证明执行行情预检及创建边界的本地失效行为。行情、控制面和数据库端口使用测试替身，不证明真实 Provider、PostgreSQL、队列或目标 Docker。没有外部请求、部署、回测任务或 AI 调用。

S07 父项继续开放：执行行情配置准备明确不代表日历、证券事实、独立信号、基准、公司行动等全部依赖已就绪。后续应按 Spec §9 的用途矩阵核对全依赖诊断及 API 消费，并保留 S04/S05 和真实运行态验收依赖。已有外部卡点的重试预算不因本轮验证而重置。
