# 现行指标缓存命名空间隔离

## 修改

Server 当前指标计算使用 V3 BarSeries 指纹、`dsa-indicator-v3` 引擎及 V3 响应合同，但 Redis 读写前缀仍为 `market-indicators-v2:`。现改为 `market-indicators-v3:`，使旧缓存不参与当前读取。受控行情清理入口保留旧前缀并新增 V3 前缀，供显式清理时处理两代数据；本次没有执行清理。

## 验证

- 定向缓存测试确认旧键存在时现行读取仍查询 V3 键，写入只用 V3 键。
- `pnpm --filter @thesis-ledger/server exec vitest run test/market/market-indicator-cache-version.test.ts test/platform/market-data-cleanup.test.ts test/platform/database-structure.test.ts test/platform/database-upgrade-plan.test.ts`：4 文件、28 项通过。后两文件同时核对新增 migration 的动态 head 和增量升级计划。
- `pnpm --filter @thesis-ledger/server typecheck`：通过。
- `pnpm --filter @thesis-ledger/server build`：通过；同时使用当前 Schema 生成了 Prisma Client。

目标 Redis 中旧缓存的实际数量和目标 HTTP 指标计算尚未核验；C01、E02、D03 仍按完整范围开放。
