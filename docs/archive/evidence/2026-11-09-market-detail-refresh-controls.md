# 行情详情同步刷新与图标操作验证

日期：2026-11-09。对应[规格](../../specs/2026-11-09-minute-chart-auto-refresh.md)与[结案任务](../tasks/2026-11-09-market-detail-refresh-controls.md)。

## 实现与输入范围

基线为共享未提交工作区，保留其他任务改动，本轮未创建提交。新增 `MarketDetailRefreshControls.tsx`，复用共享 `RefreshIconButton` 和 Button，在标题栏提供手动刷新及默认关闭的自动刷新图标。自动开关由详情查询 hook 的局部状态持有，每次打开详情为关闭状态，关闭后不再轮询会话或行情。

`useMarketDetailQuery.ts` 通过 TanStack Query 调度服务端会话检查和最新行情读取。自动刷新复用 `useMarketChartLatestBoundary.ts` 的最新请求及生命周期，请求同时包含 `quote`、`bars` 和三个指标能力，等待同一响应完成后合并。报价会话检查只用于准许自动刷新，不提前替换页面报价；实时价及涨跌幅继续由现有 QuoteSection 投影。最新请求保持不复权、当前周期、窗口大小和指标参数，并携带 `refresh: true`。

历史扩窗的计算锚点保持其历史输入用途，最新请求不受旧锚点约束，原有视图与历史点保留。刷新函数返回完成 Promise 供查询调度等待；界面的手动回调显式处理异步返回值。`useMarketChartLatestRefresh.ts` 的跨周期读取也包含报价。`MarketDetailDialog.tsx`、Content、行情 notice 与 section 收敛重复全量刷新入口，保留分段错误及重试。已有 notices 的独立消费者仍可使用共享刷新图标。

写集还包括本主题行为测试、详情既有断言、`apps/desktop/scripts/check-minute-auto-refresh.cjs`、对应浏览器固定样本及本主题文档。没有修改 Server、接口、数据库、依赖清单、行情路由或原生工程。

## 验证结果

| 验证         | 命令及结果                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 行情详情回归 | `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail`：49 个文件、241 项通过。统计包含共享工作区现有测试，不将它们全归为本轮新增。 |
| 编译与构建   | `pnpm --filter @thesis-ledger/desktop build`：类型检查与 Vite build 通过；既有大分包提示保留。                                                                 |
| 定向 lint    | `pnpm exec eslint` 后接刷新控件、详情查询、行为测试、Dialog、Content、Sections、notices 与两个 latest hook：通过。                                             |
| 模块边界     | `pnpm exec node scripts/check-boundaries.mjs`：通过。                                                                                                          |
| 文件尺寸     | `pnpm exec node scripts/check-file-size-guardrails.mjs`：通过，6 项其他存量文件警告。                                                                          |
| 差异卫生     | `git diff --check` 检查本轮涉及的现有详情文件：通过。                                                                                                          |

新增及调整的行为验证包含：默认关闭、关闭时无定时请求、开启后的同轮价格/涨跌幅/曲线更新、再次关闭后停止、历史扩窗后仍发送无旧锚点的最新请求、会话未知/闭市/错误暂停及恢复、后台与卸载清理、读取失败保留旧报价与曲线、作用域切换后拒绝迟到响应。原手动最新检查、指标与分段重试断言同时回归。

实施中修正了 optional 回调的类型、异步回调的显式处理及对应 mock/请求能力断言。自动读取使用已有最新请求后，失败状态由图表的最新请求错误区域承接，浏览器检查相应验证该实际错误入口；最终测试、构建与 lint 均通过。

## 四宽浏览器

从 `apps/desktop` 运行 `pnpm exec vite --config test/minute-auto-refresh.vite.config.mjs`；从仓库根目录运行：

```sh
PLAYWRIGHT_MODULE=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/apps/dsa-web/node_modules/playwright \
MINUTE_REFRESH_CHROMIUM_EXECUTABLE='/tmp/minute-refresh-chromium/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
MINUTE_REFRESH_QA_OUTPUT=/tmp/market-refresh-controls-qa \
pnpm exec node apps/desktop/scripts/check-minute-auto-refresh.cjs
```

1440、1024、768、390 宽度全部通过。每个宽度检查默认 `aria-pressed=false`、唯一手动刷新图标、关闭时无轮询、手动同步更新价格/涨跌幅、键盘开启自动刷新、等待期间报价及原 canvas 保留、图表单加载圈、完成后价格及涨跌幅一起更新、请求包含报价、开关关闭停更、闭市/未知暂停、开盘恢复、错误保留与恢复、日线暂停、切回分钟恢复、Escape 关闭及重新打开默认关闭。页面和弹窗均无横向溢出，无 `pageerror`。

浏览器使用真实组件、QueryClient、图表和刷新生命周期，行情读取为受控输入，Playwright clock 推进盘中时间。已人工查看桌面及窄屏截图。临时截图和机器结果位于 `/tmp/market-refresh-controls-qa/`，本记录保留长期可读的验证断言与结论。

## 真实本地页面

宿主已有 `http://localhost:5173` Vite 服务直接读取当前源码。本轮为 Desktop 源码变化，无 Server 或容器输入变化，未重复执行 Docker 更新。

通过独立浏览器上下文打开 `/watchlist` 的招商银行 `600036.SH` 并选择 1 分钟，确认标题栏只有一个“刷新行情”图标，自动开关初始 `aria-pressed=false`；实时价 `¥43.01`、涨跌幅 `+0.30%`、前收 `¥42.88` 正常显示。开启后取得真实 `include=quote` 响应，服务端 `marketSession.state=closed`；开关状态为开启，可手动关闭；Escape 关闭详情成功，无页面异常。截图为 `/tmp/market-refresh-controls-runtime.png`。

首次真实检查遇到历史扩窗锚点阻止会话检查，等待响应超时；已通过上述最新读取路径修复，并完成定向测试、四宽浏览器及真实页面重验。真实核对发生于北京时间 18:13 左右，已收盘；自然盘中 Provider 连续更新未实测，同步更新由受控盘中输入证明，不作为外部行情实时可用性认证。

## 最终一致性

AC1–AC5 均有实现及对应本地、受控浏览器和真实休市页面证据。当前开关默认值、图标操作、报价同步、历史扩窗、失败恢复、服务端日历及可见性边界一致。保留既有业务逻辑、精度及历史数据，没有本轮未完成门禁或延期事项。
