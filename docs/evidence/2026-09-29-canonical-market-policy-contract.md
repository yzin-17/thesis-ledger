# Market Policy 单一合同接线证据

> 2026-09-29；本证据只覆盖本地源码与包级验证，不代表目标 Docker、数据库或业务验收。

## 本叶变更

- Server `MarketControlService` 只接受 `contractVersion=3`。旧请求在查库前返回 400；旧策略存储在读取、回滚或保存前返回 409，不执行目录请求或隐式转换。
- 新数据库种子使用空的精确路由列表。策略存储只写 `storageVersion=3` 与 `routes`；删除旧 V2 矩阵、双格式分派、旧控制推送、旧路由保留字段和 V2 对基重推。策略保存、重试、回滚、移除 Provider 均走同一精确路由合同；生效投影修订过期时重走目录门禁。
- Desktop 路由面板与工作流只处理当前策略。HTTP 策略读取、保存、重试和移除 Provider 响应会校验当前合同，旧响应明确报错；Onboarding 依据同修订的生效投影及可用报价目标判断配置状态。
- DSA 的 ThesisLedger 策略写入 HTTP 入口只接受 V3，Server DSA Client 删除无调用方的 V1/V2 策略写入方法。DSA 旧策略存储、V2 生效策略读取及其余旧数据接口仍可达；其他 Market/Backtest/Ledger 消费者尚未完成全量收敛。本叶不勾选 E02、E04 或 U01。
- `DsaMarketBarPolicyPort` 仍调用 `effectiveControlPolicyV2()`，其 `MarketBarReader.read()` 仍被 Market Controller、Risk、Performance 和 Automation 调用；Server 当前策略切换后，这条路径尚不能完成真实数据读取。必须先将这些消费者迁到当前精确路由 Reader，再移除 DSA 的旧控制分派并部署；本地包级通过不覆盖该运行时缺口。

## 验证

| 层级 | 命令或观察 | 结果 |
| --- | --- | --- |
| Desktop 定向 | `pnpm exec vitest run test/market-data-provider-ui.test.tsx test/ui-contract.test.tsx` | 30 项通过 |
| Desktop 包级 | `pnpm test`、`pnpm typecheck`、`pnpm build` | 508 项通过，类型与构建通过 |
| Server 定向 | 策略 3 文件及 `test/integration/dsa.client.test.ts`、`test/market-bar-series-v2.test.ts` | 51 项通过；后两者保留的 V2 Reader 行为显示仍有现行消费者待迁移 |
| Server 包级 | `pnpm exec vitest run --silent`、`pnpm typecheck`、`pnpm build` | 当前输入 1760 项通过、91 项跳过；类型与构建通过 |
| DSA 定向 | `.venv/bin/python -m pytest -q tests/test_thesis_ledger_control.py tests/test_thesis_ledger_control_v3.py tests/test_thesis_ledger_market_v2.py tests/test_thesis_ledger_data_gateway.py` | 39 项通过；官方隔离 `offline-tests` 尚未重跑 |
| 目标容器 | `docker ps` | 无运行中的目标容器；当前源码未部署 |

## 待处理

开发数据库仍有命名卷，现有策略若采用旧包装会按预期返回 409。部署前须核对实际数据库名、owner、结构 head 和需要保留的其他数据；若使用开发重建，必须走相邻 infra 的显式入口及精确目标确认。当前没有执行数据库清理、容器更新或真实客户端验收。继续清点并迁移旧 `MarketBarReader.read()` 的所有实际消费者，再处理 DSA 生效策略与数据读取旧分派、缓存和完整 C01 库存。M1/M2/M3 与 AC01–AC20 状态仍以关联 Task 为准。
