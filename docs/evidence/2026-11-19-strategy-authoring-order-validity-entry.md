# 已有买单有效期正式局部修改入口验收

2026-11-19，复用两份真实模型首答，经当前 Server 的正式局部修改、确认与保存 API，并用原冻结产物执行 Worker。两个方向均通过。T04d 原有 24／24 继续按原批次计数。[上轮真实模型回执](2026-11-19-strategy-authoring-order-validity-model-recheck.md) · [Task](../archive/tasks/2026-11-15-backtest-trade-plans.md) · [Spec](../specs/2026-11-15-backtest-trade-plans.md)

## 两个方向的结果

| 真实响应 | 确认页对应的唯一定义差异 | 原冻结行情下的实际成交 | 完整结果校验值 |
| --- | --- | --- | --- |
| day | 建仓单 `buy` 从两根改为当天 | 5 月 19 日买入 100 份，第二日无买入 | `633620e5cabf5339` |
| two-bars | 建仓单 `buy` 从当天改为两根 | 5 月 19 日和 20 日各买入 100 份 | `0b74741371f64882` |

完整定义均与上一轮合格回执深度相等。普通退出单的 DAY、附属止损的父单及激活方式、价格、仓位、费用和其他规则全部按原定义保存。数据库重读后的定义通过原快照的策略哈希检查。Worker 直接重放原目录内的 manifest 和 Parquet，逐字段比对完整结果，中文回读也相等。

## 正式入口与取证方式

桌面和移动端修改范围新增“买单有效期”。提交时冻结 `entryOrderValidity`，使用已通过验证的原生修改路由，操作记录标记 `authoring-order-validity-v1`。模型、额度及 Provider 配置沿用所选路由。系统提示、短输出 Schema、完整基线、需求 ID 和意图与真实对照相同。操作修订由当前草稿产生。本轮隔离 API 中为 2，历史请求为 1。原“委托计划”及其他修改范围继续生成完整 v5 提案。[范围与短合同](../../packages/schemas/src/strategy-authoring-modification.ts) · [提交入口](../../apps/server/src/strategy-authoring/authoring-submit.service.ts) · [短响应应用](../../apps/server/src/strategy-authoring/authoring-order-validity.ts)

局部修改限一个已理解需求及符合原生槽位约束的已有日线建仓单。服务端核对需求和模板 ID，只接受当天或正整数根。一次操作只有一次生成机会。`unsupported`、多写字段、错单、错需求、非法期限、空改以及确认委托与基线冲突均拒绝。负例为本地构造。两份历史 v5 完整配置继续充当对照。[定向回归](../../apps/server/test/strategy-authoring/order-validity-pilot.test.ts)

隔离 PostgreSQL 和 Redis 中创建同标的目录记录，以本地 HTTP 流逐字返回归档的短响应。单独用受控完整输出建立并确认原策略基线，使草稿具有真实的生成操作和来源关系。首次直接导入基线的试跑在保存时收到 409，原因是缺少已应用的生成操作。本轮保留了这个保存条件。[正式保存的来源检查](../../apps/server/src/strategy-authoring/authoring-provenance.repository.ts)

每侧核对了待确认时修订及定义均未变化、此时保存返回 409、过期确认返回 409、重复确认只产生修订 3，以及按相同审核哈希重复保存返回同一版本。两个来源快照分别保留各自的生成及修改操作 ID。每个修改操作只请求一次本地受控响应，真实模型调用为零。[隔离验收用例](../../apps/server/test/strategy-authoring/order-validity-replay.cases.ts)

## 回执与命令

原始短响应、原始请求和冻结快照在 `var/acceptance/order-validity-pilot-live-20261119-133724/`。原操作分别来自 `backtest-daily-orders-remaining20-20261118/schema-modification/day-input.json` 和 `whole-order-model-20261118/modify/two-bars-input.json`。本次隔离回执在 `var/acceptance/order-validity-entry-20261119-wsCSi5/`，其中 `verified/` 保存最终复核的操作、提案、版本、审核哈希与回放校验值，`pages/` 保存 16 张确认页截图。临时数据库和队列在测试结束时清理。

以下命令在主仓执行。重放输出目录中的 JSON 采用独占创建，复跑时使用新的空目录。

```sh
rtk proxy pnpm --filter @thesis-ledger/schemas build
rtk proxy env BACKTEST_DAILY_ORDER_CAPTURE_ROOT="$PWD/var/acceptance" pnpm --filter @thesis-ledger/server exec vitest run test/strategy-authoring/order-validity-pilot.test.ts test/strategy-authoring/authoring-modification.test.ts test/strategy-authoring/authoring-prompt.test.ts test/strategy-authoring/authoring-attempt.test.ts
rtk proxy pnpm --filter @thesis-ledger/desktop exec vitest run test/authoring-workflow.ui.test.tsx
rtk proxy pnpm --filter @thesis-ledger/server typecheck
rtk proxy pnpm --filter @thesis-ledger/mobile --filter @thesis-ledger/desktop typecheck
rtk proxy env AUTHORING_WITH_REDIS=1 BACKTEST_DAILY_ORDER_CAPTURE_ROOT="$PWD/var/acceptance" ORDER_VALIDITY_REPLAY_DIR="$PWD/var/acceptance/order-validity-entry-20261119-wsCSi5/verified" node scripts/test-journal-review-postgres.mjs test/strategy-authoring/authoring-execution.integration.test.ts -t '已有买单有效期真实回执'
rtk proxy pnpm --filter @thesis-ledger/desktop exec vite --config test/backtest-trade-plan.vite.config.mjs --host 127.0.0.1 --port 5219 --strictPort
rtk proxy env BACKTEST_PLAN_BROWSER_ORIGIN=http://127.0.0.1:5219 BACKTEST_PLAN_CASES=day,two-bars BACKTEST_PLAN_RULE_REVIEW=1 BACKTEST_PLAN_PROPOSALS=1 node scripts/local-runtime/backtest-trade-plan-browser.mjs var/acceptance/order-validity-entry-20261119-wsCSi5 var/acceptance/order-validity-entry-20261119-wsCSi5/pages
rtk proxy node --check scripts/local-runtime/backtest-trade-plan-browser.mjs
```

Server 定向测试 19 项、桌面交互测试 6 项通过。正式隔离集成用例覆盖两个方向。Schema 构建及 Server、Desktop、Mobile 类型检查通过。受影响 TypeScript 文件经 ESLint 验证，跨包检查使用 `NODE_OPTIONS=--max-old-space-size=10000`。浏览器用桌面和 React Native Web 确认组件，在 1440、1024、768、390 四种宽度核对修改范围选择、原规则与建议规则、确认和放弃操作、横向溢出。业务落库和 Worker 的证据来自独立 API 集成验收。

本轮验收限当前源码与归档模型首答。该次验收时目标容器和原生手机端尚未部署此版本。随后已完成[Server／Worker 目标镜像验收](2026-11-19-strategy-authoring-order-validity-target.md)。ATR 沿用原记录，未提交或推送。
