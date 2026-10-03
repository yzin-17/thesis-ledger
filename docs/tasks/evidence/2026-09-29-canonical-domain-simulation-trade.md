# 领域交易类型收敛

## 变更

调用反查确认 Domain 的 `BacktestResultV2` 只有定义、无生产调用，已删除。仍由当前交易归集与分析消费的 `BacktestTradeV2` 改名为 `SimulationTrade`，避免与现存独立引擎的 `BacktestTrade` 导出重名；交易经济字段未改变。领域文件头注释同步说明其当前结构类型职责。

## 验证

- 定向 `pnpm exec vitest run test/backtest-trades.test.ts test/backtest-analytics-v2.test.ts test/backtest-v2.test.ts`：16 项通过。
- Domain `pnpm test`：313 项通过；`pnpm run build` 通过。首次使用 `BacktestTrade` 命名时构建发现与既有导出重名，改为 `SimulationTrade` 后重新构建通过。
- Schemas、Server、Desktop、API Client `pnpm run typecheck` 通过；`node scripts/check-boundaries.mjs`、受影响文件 Prettier 与主仓 `git diff --check` 通过。

## 边界

验证对象是当前未提交工作区；此叶只移除无调用结果类型并收敛现行交易类型名称，不改变成交或分析算法。旧命名文件及其他当前领域合同仍待 C01/C03 清查，目标 Worker、隔离数据库、Docker 和真实回测未在本叶验收。
