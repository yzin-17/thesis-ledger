# M33：事件依赖与原始记账的精确时间边界

## 问题与修复

V3 事件依赖计划和原始记账使用 `Date.parse` 比较 `availableAt`、公告 `announcedAt`、`dataAsOf` 与冻结开盘。它只保留毫秒；例如事实 `...000002Z` 晚于截点 `...000001Z`，两者却会比较为相等。因此同一毫秒内晚到的事件可能通过计划检查，原始记账也可能把晚于开盘的事实入账。

现改用共享的 `compareMarketPitEvidenceInstantStringsV1` 比较完整小数秒和时区。无效时间继续失败关闭。原始记账对同日多个冻结开盘也按完整时间选最早者；事件原始 `occurredAt`、`availableAt` 均未改写。只调整 V3 事件消费路径，不改变 V2 历史快照的版本语义。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/backtest/backtest-event-accounting-v3.test.ts test/backtest/backtest-dependency-plan.test.ts` | 2 文件、18 项通过；覆盖同毫秒晚于开盘、晚于 `dataAsOf`、公告晚于截点与最早开盘选择 |
| `pnpm --filter @thesis-ledger/server typecheck`、`pnpm --filter @thesis-ledger/server build` | 通过 |
| 对四个涉及文件执行 ESLint、Prettier check | 通过；仅对两个小型涉及文件执行了局部格式修正 |
| `node scripts/check-boundaries.mjs`、`git diff --check` | 通过 |
| infra `./scripts/sync-code.sh thesis-ledger` | 兼容性预检通过；Server 与 Backtest Worker 均 healthy；两个变更模块的编译 JS 在宿主、Server、Worker 的 SHA-256 逐项相同 |
| 目标 Server/Worker 编译模块受控执行 | 两端各一次：同毫秒晚于冻结开盘的事实返回 `DATA_UNAVAILABLE`，开盘之前的事实接受；两端均退出 0。使用合成日历与合成事件，不代表真实来源验收 |

## 边界

本次 `sync-code.sh` 只更新目标容器可写层；Server 与 Worker 镜像 ID 仍为 `sha256:82037ac5d35693827d679fc9d8b9341fc52cf13116f28a7095a38660b9a31f9b`，容器重建会恢复镜像内旧代码。未进行真实 HiThink 准入、159516 普通回测、真实事件来源或完整 M33 验收；相关门禁保持开放。
