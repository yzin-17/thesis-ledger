# 回测执行服务单链路收敛证据

> 2026-09-29；对应[单一现行链路替换任务](../2026-09-29-thesis-ledger-canonical-runtime-replacement.md)。本记录只证明当前源码和本地测试，不代表目标容器或真实来源验收。

## 修改与边界

- `BacktestService` 删除旧 `jobs` 查询、本地 V1 Worker 与 V1 回测执行；公开 `runs` 读取和操作先核对完整现行持久化合同。策略新建及版本创建只接受当前策略 Schema，旧策略不能新增版本；列表只返回当前 Schema 记录。
- 执行服务改为 `BacktestRunService`，只执行、重试、比较 `mode='V3'` 且 `contractVersion=3`、`schemaVersion='3'` 的 Run。`runBacktestAttempt` 在写入前再次核对合同，全部领取、成功、失败及取消 CAS 固定匹配 `mode='V3'`。
- Server 与 Worker 模块只注册当前 Runner。`DsaSnapshotBuilder` 删除旧 V2 快照构建方法，只委托当前冻结构建器；删除不再注册的 V2 本地快照 Runner 和对应旧回放测试。当前 Runner 仍复用交易所执行经济核心及部分旧命名辅助函数；这些能力尚需按 C01 清单核对所有权，不能按文件名直接删除。
- 删除只检验旧 Run 执行、旧快照构建、旧快照 Runner 与旧比较指纹的测试。当前执行、快照完整性、冻结窗口比较及生命周期测试仍运行；旧格式的读写能力不再由删除的测试认定为产品需求。NAV 经济能力是否有当前 Run 消费尚待 C01 逐项确认。

## 本地验证

| 层级 | 命令 | 结果 |
| --- | --- | --- |
| 定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v3-run-execution.test.ts test/backtest/v3-run-lifecycle.test.ts test/backtest/v3-create-retry-integration.test.ts test/backtest/current-run-boundary.test.ts --reporter=dot` | 4 文件、51 项通过。 |
| Server 包级 | `pnpm --filter @thesis-ledger/server test --reporter=dot` | 226 文件通过、25 文件跳过；1782 项通过、91 项跳过。 |
| 类型与构建 | `pnpm --filter @thesis-ledger/server typecheck`；`pnpm --filter @thesis-ledger/server build` | 均通过。 |
| 架构与差异 | `node scripts/check-boundaries.mjs`；`git diff --check -- apps/server/src/backtest apps/server/test/backtest` | 均通过。 |

## 未完成门禁

- C01 尚未逐项核实 Market、Ledger、DSA、API Client、Desktop、其他 Server 消费者及缓存键；旧命名的执行经济核心可能仍承载当前 Runner 或 NAV 业务能力。
- C02/E01 的目标 PostgreSQL、实际 Worker、取消/重试故障恢复以及同源容器部署尚未验收。本轮代码未通过官方 infra 入口部署；目标容器此前未运行。
- M1/M2/M3、AC01–AC20 和真实 Provider/严格 PIT/界面/AI 门禁仍由原任务跟踪，不由本地测试自动勾选。
