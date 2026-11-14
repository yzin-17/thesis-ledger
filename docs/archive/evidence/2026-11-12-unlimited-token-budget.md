# 实验 Token 零值预算验证记录

日期：2026-11-12。对应[规格](../../specs/2026-11-12-unlimited-token-budget.md)与[任务](../tasks/2026-11-12-unlimited-token-budget.md)。

## 实现与断言

- AC1：Schemas 的输入、输出 Token 边界支持显式整数 0，默认值与正数范围保持原样。创建合同测试验证零值原样解析、负数、小数、字符串、空值和无穷值拒绝。
- AC2：Desktop 两个入口区分空输入和零值；Mobile 的 JSON 预算复用合同，说明同步。原子准入、`reconcileTokenUsage` 及 `StrategyOptimizationAiSettlementStore` 三处均正确跳过零值比较，统计更新始终保留。历史缺少字段的校正行为未被当作显式零值放开。
- AC3：输出不限额时使用 20000 Token 作为单次账务预估，继续执行费用预留和实际结算；该预估不作为 SDK 单次输出参数下发。不传零值，也不从累计 Token 预算派生单次上限，模型及 Provider 配置继续生效。有限输出仍沿用原来的单次预算参数。
- AC4：次数、费用、时长和轮数保持独立；隔离样本覆盖次数和费用拒绝、取消及过期等既有门禁，有限 Token 并发只允许剩余额度内的申请成功，实际超额继续阻断后续任务。

## 验证结果

全部命令在主仓通过 RTK 执行，原始日志留在本机 `/tmp/token-zero-*`，不作为源码提交。

| 范围 | 命令或入口 | 结果 |
| --- | --- | --- |
| 公共创建合同 | `pnpm --filter @thesis-ledger/schemas exec vitest run test/strategy-optimization.test.ts` | 20 测试通过 |
| 表单与恢复 | `pnpm --filter @thesis-ledger/desktop exec vitest run test/experiment-budget.test.tsx test/market-experiment-recovery.ui.test.tsx` | 23 测试通过 |
| SDK 结算与真实本地 HTTP | Server Vitest 的 `unlimited-token-settlement.test.ts`、`strategy-optimization-sdk-executor.integration.test.ts` | 16 测试通过；不限输出不含 `max_tokens` 或 `max_completion_tokens`，有限输出保留参数；使用本机确定性 Provider，无外部模型调用 |
| PostgreSQL 原子准入与校正 | `pnpm exec node scripts/test-unlimited-backtest-budget-postgres.mjs` | 16 测试通过；维护入口自动创建并清理隔离资源 |
| 受控浏览器 | `PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright pnpm exec node apps/desktop/scripts/check-experiment-create-validation.cjs` | Edge 的 1440、1024、768、390 宽度通过；四项次数/Token 均为 0，Token 空值阻止请求，失败同幂等键重试成功，无页面错误和横向溢出 |

隔离 PostgreSQL 并发预留累计输入 12000000、输出 4000000 Token，实际校正后为输入 13000000、输出 5000000，零值预算允许继续累计。有限输入/输出预算并发只有一个请求成功，实际超额会被捕获。SDK 结算测试分别覆盖单侧有限、双侧无限、有限未超额及费用超额，并核对结算仍更新用量。

浏览器创建和准备 POST 被受控拦截，真实自动成交设置解析不调用模型；真实用户实验创建为 0。截图和回执位于本机 `/tmp/experiment-create-validation-qa`，已查看 390 宽截图，两个 Token 字段的零值及说明正确显示。

Schemas、Server、Desktop 构建通过；Desktop、Mobile 类型检查通过。受影响预算、SDK 源码与测试 ESLint、边界、workspace 依赖门禁和 `git diff --check` 通过。尺寸门禁保留 6 个既有警告。Mobile 仅改说明文字，无原生工程或依赖变更，未声称原生设备验收。

## 部署与运行态

执行目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，正式入口为 `PATH=/Users/yzin/.volta/tools/image/node/26.13.0/bin:$PATH ./scripts/sync-code.sh thesis-ledger`，通过 RTK 执行，退出码 0。兼容性预检通过，Server 和 Backtest Worker 健康；镜像 ID 保持不变，未执行数据库结构或外部卷变更。快更位于容器可写层，不代表镜像已重建。

独立只读核对容器实际包解析：预算合同返回 `maxInputTokens: 0`、`maxOutputTokens: 0`；编译后的原子准入 SQL 包含两个 Token 零值分支。容器健康状态正常，未用健康状态替代上述语义验收。

## 最终一致性审查

通过。核对了合同、两个桌面创建入口、Mobile、SDK 请求参数、预留、两种结算及有限预算之间的连接。未把零值当成零额度或默认值，未跳过统计，未放宽其他预算；默认值、正数范围、历史记录和模型配置保持原样。规格与既有预算合同说明已同步，任务全范围完成并归档，没有延期、真实模型调用、用户实验创建或提交推送。
