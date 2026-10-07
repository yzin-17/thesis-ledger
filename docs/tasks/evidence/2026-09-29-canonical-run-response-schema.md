# 当前 Run 响应 Schema 收敛

## 变更

`packages/schemas/src/backtest-v2.ts` 不再导出可解析 `mode='V2'` 的 Run 响应 Schema 与类型。当前 `backtestRunResponseSchemaV3` 直接定义状态、阶段和 `mode='V3'`，不从旧响应 Schema 扩展。状态与阶段的共用值改为当前通用名称；现行结果的经济字段及其 V3 扩展未在本叶改变。`backtest-disclosure.test.ts` 改为验证旧 Run 响应被拒绝，当前失败响应保留错误摘要。

## 验证

- 定向：`pnpm exec vitest run test/backtest-disclosure.test.ts test/backtest-v2.test.ts`，19 项通过。
- Schemas 全包：`pnpm test`，563 项通过；`pnpm run typecheck`、`pnpm run build` 通过。
- 下游类型检查：Server、Desktop、API Client 的 `pnpm run typecheck` 均通过；`node scripts/check-boundaries.mjs` 通过。
- 调用反查：旧 Run 响应、状态及阶段 Schema/类型标识在 `apps`、`packages`、`scripts` 无剩余引用；主仓 `git diff --check` 通过。

## 证据边界

验证对象是当前未提交工作区中的 Schema 与下游源码。此叶没有执行目标 HTTP、旧持久化记录读取、真实客户端、Worker、隔离 PostgreSQL 或 Docker 验收。结果 Schema 仍以旧编号基础字段构成当前 V3 格式，需在 C03/C04 的独立叶核对；C02、C03、U01、D02、D03 与多来源业务门禁保持未勾选。
