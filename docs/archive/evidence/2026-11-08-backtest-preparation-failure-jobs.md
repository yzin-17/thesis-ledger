# 回测准备失败任务验收

日期：2026-11-08。对应[规格](../../specs/2026-11-08-backtest-preparation-failure-jobs.md)与[任务](../tasks/2026-11-08-backtest-preparation-failure-jobs.md)。以下结论仅覆盖本轮输入，共享工作区的其他修改保持。

## 实现与数据边界

Backtest 拥有独立的 `preparation-failure` 输入合同和失败任务投影；提交协调层在原提交的状态及 attempt 条件下，以事务完成幂等任务登记和回执关联。普通阻塞、异常及准备中断均登记失败终态；已有普通阻塞记录只消费保存的请求及诊断，不调用准备或行情来源。创建回执不确定的恢复链保持原行为。

任务保存原请求，`status=failed`、`stage=preparation-failed`、`errorCode=PREPARATION_FAILED`；正式 RunConfig、快照及结果为空，执行 attempt 为零。读取门禁只允许这种严格失败终态进入列表与详情，运行及执行重试入口拒绝。详情保留诊断及原始资金文本，通过原策略入口重新创建；不克隆未完成的正式运行配置。顶部普通已交付收据退出展示，净值与优化确认保留；交付后使任务列表缓存失效。

持久化异常先保留阻塞结果，原子关联失败会回滚；恢复读取事务内保存的诊断，避免旧内存对象覆盖已落盘信息。无数据库结构或来源政策变更。

## 分层验证

| 层级 | 输入及命令 | 结果 |
| --- | --- | --- |
| Server 定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/preparation-failure-read.test.ts test/backtest/lifecycle-preparation-v3.test.ts test/backtest/v3-run-lifecycle.test.ts test/strategy-optimization/continuous-execution.test.ts` | 19 项通过；补充不可执行断言后读取组 2 项再次通过 |
| 隔离 PostgreSQL | `node scripts/test-ai-provider-postgres.mjs test/strategy-optimization/preparation-failure-postgres.integration.test.ts test/strategy-optimization/strategy-submission-postgres.integration.test.ts` | 2 项复合场景通过，覆盖并发、重复、旧阻塞、中断、异常、授权拒绝、事务回滚、已落盘诊断恢复及原净值提交链 |
| Desktop 定向 | `pnpm --filter @thesis-ledger/desktop exec vitest run test/backtest-preparation-failure.ui.test.tsx test/strategy-backtest-detail.test.ts test/backtest-preparation.test.tsx test/saved-strategy-backtest.ui.test.tsx src/features/strategy/strategy.ui.test.tsx` | 40 项通过，含高精度资金文本和顶部收据归属 |
| Schemas 包级 | `pnpm --filter @thesis-ledger/schemas test` | 1489 项通过、3 项既有跳过 |
| Desktop 包级 | `pnpm --filter @thesis-ledger/desktop test` | 1693 项通过 |
| 构建与静态 | Schemas、Server、Desktop 构建；修改文件 ESLint；`node scripts/check-boundaries.mjs`；`git diff --check` | 通过；正式快更再次构建最终输入，Desktop 仍有既有产物体积提示 |

隔离数据库使用仓库维护脚本，专属 `ai_provider_concurrency_fixture`、`fixture_owner` 和临时容器；无真实来源请求。授权拒绝场景的受控 warning 为预期结果，不代表目标运行态故障。

## 目标运行态

通过 infra 的 `./scripts/sync-code.sh thesis-ledger` 正式快更，兼容性预检、构建及 Server／Worker 健康检查通过。最终日志 `/tmp/preparation-failure-sync-final.log`；本次为容器可写层更新，镜像保持原 ID，重建后需重新同步或构建镜像。

截图提交 `4475cbf5-551f-4c29-b77f-80e4cb45955c` 已关联且只关联一个任务 `26ac1c17-e23d-4de0-88a8-e4acf0347f2e`。只读数据库核对确认：任务失败、阶段为准备与预检、执行 attempt=0、无快照及结果；原始请求和诊断与提交记录逐字段一致。实际行情阻塞原因仍如实保留，没有重新获取行情或执行回测。

浏览器使用真实页面和实际失败任务，所有非 GET 请求均阻断。1440、1024、768、390 四宽验证失败筛选列表、任务详情、原策略导航，共 12 组通过：顶部不重复显示提交，详情显示完整检查区间及诊断，无“重试执行”或“再次运行”误导操作，无横向溢出及页面错误，实际业务请求写入为零。截图与结果位于 `/tmp/preparation-failure-browser/`。

本机其他日志：`/tmp/preparation-failure-server-tests.log`、`/tmp/preparation-failure-final-read.log`、`/tmp/preparation-failure-postgres.log`、`/tmp/preparation-failure-desktop-tests.log`、`/tmp/preparation-failure-desktop-suite.log`、`/tmp/preparation-failure-schema-tests.log`、`/tmp/preparation-failure-eslint.log`、`/tmp/preparation-failure-final-eslint.log`、`/tmp/preparation-failure-recovery-eslint.log`、`/tmp/preparation-failure-boundaries.log`。

范围内验收完成；没有执行数据源选源新方案、真实回测、策略或账本改写、提交或推送。原阻塞提交的派生失败任务登记属于本次用户明确要求。
