# 当前回测结果 Schema 边界

## 变更

`packages/schemas/src/backtest-v2.ts` 不再导出可解析 `schemaVersion='2'` 的结果 Schema、类型和无版本别名。当前 V3 结果直接组合其仍需使用的经济字段，并继续要求 Snapshot 格式、价格协议、实际来源和指纹；现有唯一执行来源及口径一致性校验保持。测试将成交、回撤和披露断言移到当前结果，并增加旧结果版本拒绝。

## 验证

- 定向 `pnpm exec vitest run test/backtest-disclosure.test.ts test/backtest-v2.test.ts`：19 项通过。
- Schemas `pnpm test`：563 项通过；`pnpm run build` 通过。
- Server、Desktop、API Client 的 `pnpm run typecheck` 均通过；`node scripts/check-boundaries.mjs`、主仓 `git diff --check` 通过。
- 受影响源码及披露测试的 Prettier 检查通过；`backtest-v2.test.ts` 仍有一处与本叶无关的既有格式差异，未进行整文件改写。
- 生产源码与测试中已无 Schemas 的 `backtestResultSchemaV2`、`BacktestResultV2` 或旧结果别名引用。随后反查确认 Domain 自有 `BacktestResultV2` 也无调用方，已在[领域交易类型收敛](2026-09-29-canonical-domain-simulation-trade.md)中删除；现行执行核心使用的原 `BacktestTradeV2` 已按领域语义收敛。

## 边界

验证对象是当前未提交工作区。未执行隔离 PostgreSQL、目标 Worker/Docker、真实 Provider、Desktop 交互或经济结果重放；此叶不证明 C03/C04/E01/D02 完成，多来源回测 AC01–AC20 的验收状态不变。
