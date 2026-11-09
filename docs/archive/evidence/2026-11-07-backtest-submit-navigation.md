# 回测提交后的任务页导航验收

日期：2026-11-07。对应[普通回测规格](../../specs/2026-11-07-saved-strategy-backtest.md)。本次为已授权入口的局部交互修复，不调整数据准入、策略或任务生命周期。

## 修改与范围

自动提交成功后原先仅关闭弹窗，绕过了既有准备提交分支的导航。本次由 `BacktestSetupDialog` 通知 `StrategyDashboard`，统一进入 `/strategy/jobs`；服务端拒绝提交时保留弹窗和配置，不触发成功导航。

失败分支回归同时发现 `BacktestPricePreparation` 的提交错误将 `FieldError` 直接放在 `FieldGroup` 内，缺少 Base UI 所需的 `Field` 上下文并导致页面崩溃。已按既有契约补齐 `Field invalid`。检查共享 `Field` 实现及同类自动提交消费者后，`OptimizationPricePreparation` 的同一问题同步修复；净值入口未使用该错误结构，保留原实现。无布局样式变更。

## 验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/saved-strategy-backtest.ui.test.tsx test/position-strategy-recovery.ui.test.tsx test/strategy-center-ui.test.tsx`：27 项通过，包含成功通知、失败不通知及失败文案恢复。
- `pnpm --filter @thesis-ledger/desktop exec vitest run test/backtest-preparation.test.tsx src/features/strategy/strategy.ui.test.tsx`：24 项通过。
- Desktop 构建、五个修改文件 ESLint、`git diff --check` 通过。未重复执行此前通过的全量测试；本次结论仅覆盖上述输入。
- 实际浏览器分别以 1440、1024、768、390 宽度使用截图策略和真实模型解析：四次受控失败均保留弹窗、URL 和错误提示，随后四次受控成功均关闭弹窗并跳转 `/strategy/jobs`，共 8 组检查通过。无横向溢出、页面错误及实际业务写入。已人工检查桌面和窄屏任务页截图。
- 通过 infra 的 `./scripts/sync-code.sh thesis-ledger` 正式快更，兼容性预检及服务健康检查通过；镜像保持不变。本轮为容器可写层更新，重建后需重新同步或构建镜像。

本机证据：`/tmp/backtest-submit-navigation-tests.log`、`/tmp/backtest-submit-navigation-related.log`、`/tmp/backtest-submit-navigation-build.log`、`/tmp/backtest-submit-navigation-eslint.log`、`/tmp/backtest-submit-navigation-sync.log`，浏览器结果及截图位于 `/tmp/backtest-submit-navigation-browser/`。

真实业务数据仅读取，8 次提交请求均被浏览器拦截，未创建实际回测。共享工作区其他变更不计入本次通过结论。验收完成，无未决项。
