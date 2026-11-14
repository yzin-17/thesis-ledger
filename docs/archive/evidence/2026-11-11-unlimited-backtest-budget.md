# 回测次数零值不限额验收

## 结果与边界

回测次数上限支持显式整数 `0`，表示不限制单次实验的累计回测次数。正数继续使用原有 2–100 范围和计划最低次数；默认仍为 20。Desktop 新建页及旧实验面板共用字段提示，Mobile 现有预算 JSON 旁说明零值语义。空表单不转换为不限额，修正输入后清除旧字段错误。历史记录没有改写。

公共合同、创建前计划校验与 Server 原子预算准入共同识别 `0`。准入仅跳过回测次数上限比较，仍在同一个原子更新中累计实际次数；其他预算、时长、取消、实验轮数和终态条件保持原合同。读取入口展示实际次数，没有发现把次数除以预算上限的额外消费者。

## 定向验证

- schemas：`test/strategy-optimization.test.ts`，18 项通过。覆盖 `0` 创建、有限预算计划下限、负数、小数、1、101 拒绝，以及 AI 调用预算仍拒绝零值。
- Desktop：`test/experiment-budget.test.tsx`、`test/market-experiment-recovery.ui.test.tsx`、`test/strategy-optimization-form.test.ts`，26 项通过。覆盖输入范围、明确零值、空输入拒绝和失败重试。清除旧错误的调整后重跑受影响两个文件，19 项通过。
- Server：`test/strategy-optimization/strategy-optimization-cost-boundary.test.ts`、`test/strategy-optimization/strategy-optimization-versioned-run.test.ts`，9 项通过。
- 以上分别通过 `pnpm --filter <包名> exec vitest run <文件>` 执行。
- schemas、Server、Desktop 构建通过，Mobile TypeScript 校验通过。未变更原生依赖或工程，不声明执行 Native compile。Desktop 保留既有大分包提示。
- 定向 ESLint 退出 0；Mobile 依赖的 React Native Flow 源码产生解析日志，不将退出成功解释为该依赖已由 TypeScript parser 完整校验。边界、workspace 依赖、`git diff --check` 通过；尺寸门禁退出 0，保留 6 项既有超限警告。

## 隔离 PostgreSQL

正式可重复入口：

```sh
pnpm exec node scripts/test-unlimited-backtest-budget-postgres.mjs
```

该入口执行专属集成测试，复用仓库维护的 `startIsolatedNavPostgres`：使用本机现有 PostgreSQL 17 镜像、唯一容器名和标签、随机本机端口及临时存储，安装完整当前迁移并验证角色与数据库身份，完成后清理自身资源。没有连接目标业务数据库或创建真实实验。

8 项真实 PostgreSQL 测试通过：

- `0` 额度下两次并发申请各 150 次，原子累计结果为 300。
- 有限 2 次额度在已用 1 次时并发申请，只允许一个请求成功，最终计数 2。
- 不限回测时，AI 次数、输入 Token、输出 Token、费用超额仍拒绝，失败不增加回测计数。
- 取消与超时仍拒绝回测准入。

测试资源已清理；独立 Docker 只读状态中没有残留测试容器。日志：`/tmp/unlimited-backtest-budget-postgres.log`。

## 浏览器

```sh
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright pnpm exec node apps/desktop/scripts/check-experiment-create-validation.cjs
```

在真实应用向导中使用已有只读策略与实际本地成交设置接口，行情准备和创建响应采用受控拦截。1440、1024、768、390 四宽均通过：超限输入拦截、空输入拦截、改为 `0` 后清除旧错误、公共创建请求校验、零值原样发送、503 后同完整 body 重试及成功确认后导航。横向溢出为 0，没有页面异常或未预期写请求。

受控创建 POST 中 `budget.maxBacktestRuns` 均为数值 `0`。没有将拦截成功响应计为真实实验创建，也没有调用 AI。已目视检查 390 宽度的字段提示和聚焦截图；截图与结果位于 `/tmp/experiment-create-validation-qa/`，最终日志为 `/tmp/unlimited-backtest-budget-browser-final.log`。

## 本地运行态与最终检查

执行目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，使用正式 `./scripts/sync-code.sh thesis-ledger`，通过已安装 Node 26 路径启动。退出 0，Server、Worker 健康；镜像 ID 不变，没有数据库结构或外部卷变化。只读容器核对公共合同接受 `0` 与有限预算、拒绝其他预算零值，并检查实际运行产物含零值分支。Desktop 通过本机 Vite 验证当前源码；本次没有重新打包安装版客户端。

日志：`/tmp/unlimited-backtest-budget-sync.log`。快更只更新容器可写层，不作为镜像更新或生产发布证据。

最终按当前 Spec 核对公共合同、表单数值、请求内容、后台原子准入、计数、其他限制及消费者，验收范围完整。没有提交或推送，也没有创建真实业务实验。
