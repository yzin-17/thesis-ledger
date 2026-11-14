# 既有 12 项 lint 错误修复验证

日期：2026-11-12。范围为上轮实验采纳修复报告中遗留的 12 个错误；不调用模型、不改动真实业务数据，不执行部署、服务重启或数据库操作。

## 原始错误与修复

首次复查 `pnpm guardrails:complexity` 在 Desktop 分组返回 12 个错误、194 条告警。错误来自普通 ESLint 规则，并非复杂度规则阈值超限：

| 位置 | 错误数 | 修复 |
| --- | ---: | --- |
| `provider-account-access.ts` | 1 | 删除未参与判断的 `_requiresCheck` 参数，并移除各调用处的无效第四实参；访问状态、过期及配置版本判断保持原有结果 |
| `StrategyBacktestDetailSections.tsx` | 1 | 删除未使用的 `formatDateOnly` 导入 |
| `use-strategy-submission.test.tsx` | 10 | 同步操作改用同步 `act`；准备与清理回调相应使用同步形式，异步推进计时器及原断言保留 |

未修改 ESLint 规则、忽略列表或复杂度阈值。

首次错误报告只包含最先失败的 Desktop 分组。清除这 12 项后，完整检查进一步发现 Server 的 `market.controller.ts` 中还有一个未使用的本地 `IndicatorName` 类型声明；本轮一并删除，未改变接口或运行行为。

## 本轮写集

- `apps/desktop/src/features/market-data/provider-account-access.ts`
- `apps/desktop/src/features/market-data/ProviderExactChecksSheet.tsx`
- `apps/desktop/src/features/market-data/account-level.test.tsx`
- `apps/desktop/src/features/market-data/market-data-routes-v3.ts`
- `apps/desktop/src/features/market-data/routing-source-choices.ts`
- `apps/desktop/src/features/market-data/routing-recommendation-selection.ts`
- `apps/desktop/src/features/strategy/StrategyBacktestDetailSections.tsx`
- `apps/desktop/src/features/strategy/use-strategy-submission.test.tsx`
- `apps/server/src/market/market.controller.ts`

工作区已有大量未提交改动。本轮逐处修改上述文件，保留既有功能及其他任务改动；未创建提交。

## 验证

- 上述 8 个文件定向 `pnpm exec eslint`：退出码 0。
- `pnpm --filter @thesis-ledger/desktop test src/features/strategy/use-strategy-submission.test.tsx src/features/market-data/account-level.test.tsx test/provider-account-access.test.tsx test/backtest-benchmark-availability.test.tsx test/routing-recommendation.test.ts test/routing-source-choices.test.ts`：6 文件、45 项通过，覆盖提交等待、确认、失败恢复、请求标识复用、账户访问状态、路由选择及回测展示。
- `pnpm --filter @thesis-ledger/desktop build`：通过，包含 TypeScript 检查与 Vite 构建。日志：`/tmp/thesis-ledger-lint-fix-desktop-build.log`。
- Server Controller 定向 ESLint 及 `pnpm --filter @thesis-ledger/server test test/market/market-indicator-window.test.ts`：通过，12 项测试。行情与指标计算均使用固定样本和替身服务，HTTP 验证只访问测试进程的本地接口。
- `git diff --check`：通过。
- 全仓复杂度门禁：`NODE_OPTIONS=--max-old-space-size=8192 pnpm guardrails:complexity` 退出码 0，8 个分组、3737 个文件全部完成，0 错误；保留 526 条复杂度告警。其后的文件尺寸门禁通过，保留 5 条存量告警。完整日志：`/tmp/thesis-ledger-guardrails-complete.log`。

中间两次全仓检查均已通过 Desktop，随后在 Mobile 的 `StrategyRiskCreateScreen.tsx` 遇到并发修改中的未使用变量及类型解析错误。该文件不属于本轮写集；尝试编辑时发现原文已由其他工作更新，补丁未应用。本轮未写入 Mobile 源码。更新后的该文件定向 lint 和 Mobile typecheck 均通过，随后重新运行完整门禁。

后续完整检查在 Server 分组因 Node 默认约 4GB 堆内存耗尽而以 `SIGABRT` 中止。宿主内存为 24GiB，随后仅为检查进程临时设置 `NODE_OPTIONS=--max-old-space-size=8192`，不改写项目配置；该次检查定位到上述未使用类型，修复后重新运行。

这些修改不改变页面布局或交互表现，未进行新的视觉验收；浏览器验证不用于证明 lint 清理。测试仅使用本地受控输入，没有模型、Provider 或真实业务写请求。

## 最终核对

原 12 个错误及继续检查发现的 1 个 Server 错误均已清除。相关 57 项测试、Desktop 构建、全仓复杂度与尺寸门禁通过；本轮未扩大到告警清理。保留共享工作区的既有改动，未执行模型调用、真实业务数据操作、部署、重启、提交或推送。
