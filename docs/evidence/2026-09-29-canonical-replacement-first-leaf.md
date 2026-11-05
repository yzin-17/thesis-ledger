# 单一现行链路替换：首叶执行证据

> 日期：2026-09-29；范围：回测 Run 创建入口与策略优化调用方。整体替换任务仍在实施中。

## 已核实的调用与存储边界

| 边界 | 当前证据 | 后续义务 |
| --- | --- | --- |
| 公开回测入口 | `apps/server/src/backtest/backtest.controller.ts` 同时暴露 `jobs` 与 `runs`，`BacktestService.queue` 仍写旧 Job；`runs` 进入 `BacktestV2RunService`。Desktop `features/strategy/strategy.api.ts` 仍调用 `jobs`。 | 收敛队列、领取、取消、重试和读取；迁移 Desktop 后旧记录在执行前拒绝。 |
| 当前 Run 创建 | `backtest-v3-run-lifecycle.ts` 使用 `contractVersion: 3`、完整 Snapshot 与准备戳，但数据库 `mode` 仍写 `V2`，且策略版本仍以 `schemaVersion=2` 表达。`backtestRunResponseSchemaV3` 也继承要求 `mode='V2'` 的 V2 响应 Schema，目前没有调用方。 | 统一持久化模式、响应和策略合同，再移除 V2 执行分派。 |
| Market/客户端 | Server 公开 `api/v2/market`、`api/v2/market-data`；Desktop、API Client 与 Server→DSA 仍引用旧路径。 | 列出每个调用方并成对替换路由与缓存键。 |
| DSA | `api/app.py` 同时挂载 ThesisLedger `/api/v1`、`/api/v2`、`/api/v3`，另有 DSA 通用 `/api/v1`；`api/thesis_ledger.py` 的三个 router 均有可达端点。 | 只替换 ThesisLedger 专属路由，保留 DSA 自身通用 API。 |
| Schema/Domain | `packages/schemas/src/index.ts` 仍导出 `backtest-v2`、`ledger-v2`，Domain 也导出同名模块；现行 V3 类型部分定义于 `backtest-v2.ts`。 | 按概念所有权拆分后收敛导出，不能按文件名直接删除。 |
| 持久化 | `apps/server/prisma/schema.prisma` 包含 `BacktestJob`、`StrategyVersion`、`LedgerEvent`、Market Fact/Coverage 与 V3 Window Evidence。 | 确认新旧写入与读取条件，数据库结构变更走隔离验证。 |
| 部署门禁 | 相邻 infra 通过 `sync-code.sh`/`update.sh` 更新；`scripts/check-boundaries.mjs` 约束模块依赖。 | 最终输入稳定后用官方入口更新目标运行态并核验。 |

上述是已定位的主干，不代表 C01 全量库存完成。

当前 Run 的 `mode` 下一叶必须成组修改：`backtest-v3-run-lifecycle.ts` 的成功/失败写入、`backtest-run-attempt.ts` 的领取/成功/失败/取消 CAS、`backtest-v3-run-execution.ts` 的冻结身份检查、`backtest.service.ts` 的 Worker 分派/取消、`backtest-v2-run.ts` 的重试条件、`backtest-execution-owner.ts` 与 `backtest-queue.reconciler.ts` 的重试预算读取，以及 API Client 的响应 Schema。只改数据库写入值会使任务无法领取或使客户端拒绝响应。

## 本叶变更

- `BacktestV2RunService.createRun` 只委托当前 `BacktestV3RunLifecycle.create`，移除旧 V2 Run 创建、不可用持久化和构造旧 Snapshot 的分支。旧合同在查库/写库/构造快照前返回 `UNSUPPORTED_CONTRACT_VERSION`。
- 策略优化遇到旧 RunConfig 时明确拒绝，不再试图创建旧 Run；现行配置路径继续使用准备戳及现行创建入口。
- API Client 的 `backtests.createRun` 只接受 `BacktestRunCreateV3`，不再导出旧 `BacktestRunCreateV2`；读取/取消/重试响应仍使用旧命名的 Schema，需在合同叶收敛。
- 现行 Run 幂等查询只接受当前 RunConfig，删除同一查询函数中的 V2 配置解析分支；旧记录仍作为冲突处理，不在创建时回读为现行 Run。执行侧的 `persistedContractVersion` 仍识别旧记录，须在 C02/C04 清理。
- 为旧合同拒绝加入定向断言；删除只验证旧 V2 Run 创建成功的测试文件。旧执行和旧记录读取测试暂保留，因为对应代码尚可达。

## 验证结果与限制

- `rtk pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v3-create-retry-integration.test.ts`：19/19 通过。
- `rtk pnpm --filter @thesis-ledger/server exec vitest run test/strategy-optimization/strategy-optimization-versioned-run.test.ts`：3/3 通过。
- `rtk pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v2-run-lifecycle.test.ts`：4/4 通过。该组只证明现存旧执行代码的当前行为，不是现行链路完成证据。
- Server 首次包级 `pnpm --filter @thesis-ledger/server test`：231 文件通过、25 文件跳过、1 文件失败；唯一失败是 V3 生命周期测试仍断言旧合同需与幂等键冲突。改为入口直接返回 `UNSUPPORTED_CONTRACT_VERSION` 后，该文件定向 8/8 通过。复核包级：232 文件、1822 测试通过，25 文件、91 测试跳过；PostgreSQL 集成测试不在此门禁内执行。
- `pnpm --filter @thesis-ledger/server typecheck`：通过。`rtk pnpm --filter ... typecheck` 曾因 RTK 将 filter 误判为不支持而退出 1，直接包级命令确认无类型错误。
- `rtk pnpm --filter @thesis-ledger/api-client exec vitest run test/backtest-v3-transport.test.ts`：7/7 通过；API Client 包级测试 36/36、typecheck 通过；Desktop typecheck 通过。Desktop 交互和真实运行态尚未验证。
- `pnpm --filter @thesis-ledger/api-client build` 与 `pnpm --filter @thesis-ledger/server build` 均通过。生成输出仅用于本地包验证，不作为目标容器已更新的证据。
- 幂等查询收敛后，Server 三个相关文件定向 36/36 通过，Server typecheck 通过；最新代码再次运行 Server 包级测试，232 文件、1822 测试通过，25 文件、91 测试跳过。
- 改动的 Server 源码与测试 Prettier 检查通过，`git diff --check` 通过。API Client 文件的 Prettier 检查仍报既有 Market 图表方法排版差异；本叶只修改回测创建类型，未对该文件做整文件格式化。
- 旧 `v2-run.test.ts` 在创建入口收紧后 3/3 按预期失败，因其断言旧 Run 可创建而删除。未运行隔离数据库或目标 Docker；当前容器仍是前一轮同步的代码，不含本叶变更。
