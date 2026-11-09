# 自动刷新开关可操作性修复

日期：2026-11-09。对应[当前规格](../specs/2026-11-09-minute-chart-auto-refresh.md)。

## 原因与修复

`MarketDetailRefreshControls.tsx` 曾以 `disabled={!minute}` 约束整个自动刷新按钮，日线下无法开启，在分钟周期开启后切回日线也无法关闭。本轮移除该控件禁用条件；开关在所有周期均可操作，非分钟周期的中文提示说明切换分钟周期后盘中同步行情。默认关闭、服务端会话、后台暂停和真实轮询条件保持不变。

`apps/desktop/scripts/check-minute-auto-refresh.cjs` 增加日线中关闭、开启及中文提示检查，并确认开启日线偏好不会产生分钟行情轮询；切回分钟周期后恢复同步更新。规格原位维护现行行为。本轮属于局部交互修复，没有修改接口、数据库、依赖或 Docker 运行态。

## 验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail/MarketDetailDialog.test.tsx src/features/market-detail/useMarketDetailQuery.test.tsx`：19 项通过。
- `pnpm --filter @thesis-ledger/desktop build`：类型检查与构建通过，保留既有大分包提示。
- `pnpm exec eslint apps/desktop/src/features/market-detail/MarketDetailRefreshControls.tsx`：通过。
- 使用同目录既有 `minute-auto-refresh.vite.config.mjs` 和浏览器脚本，1440、1024、768、390 四宽全部通过。覆盖日线开关、默认关闭、手动刷新、分钟同轮报价和曲线更新、闭市/未知暂停及恢复、失败恢复和关闭清理。结果位于 `/tmp/market-refresh-toggle-qa/`。
- 真实宿主页面 `http://localhost:5173/watchlist` 打开招商银行日线，记录：初始 `aria-pressed=false` 且可点击；点击后为 `true` 且仍可点击；再次点击为 `false`；Escape 关闭成功。该核对不提交或改写业务数据，也不认证当前休市期间的自然盘中数据更新。

当前共享工作区未提交修改已保留。本轮没有创建提交或新增延期事项。
