# 停用 Ledger V1 Schema 清理

## 变更

生产调用反查确认 `packages/schemas/src/ledger.ts` 的 V1 事件解析器和事件类型只有包导出与对应旧合同测试引用，已删除文件、导出及仅验证旧输入的 15 项测试。现行业务使用的 Ledger 事件与命令合同位于独立的 `ledger-v2.ts`，本叶没有改动其经济字段或命令行为。

## 验证

- `rg 'ledgerEventSchemaV1|LedgerEventV1|ledgerEventTypes' apps packages scripts` 无剩余源码引用。
- `pnpm exec vitest run test/contracts.test.ts`：20 项通过；Schemas `pnpm test`：548 项通过；`pnpm run build` 通过。
- Server、Desktop、API Client `pnpm run typecheck`、`node scripts/check-boundaries.mjs` 与主仓 `git diff --check` 通过。
- `contracts.test.ts` 整文件 Prettier 检查失败，差异位于本叶未修改的报价、FX、详情等既有测试区段；未为本叶改写其余在途内容。受影响 Schema 源文件检查通过。

## 边界

验证对象是当前未提交工作区。此叶只删除无调用的旧 V1 解析入口，未完成 Ledger 当前合同的持久化/投影盘点、隔离 PostgreSQL、目标运行态与真实经济验收；C01/C03/E03/D02/D03 继续未勾选。
