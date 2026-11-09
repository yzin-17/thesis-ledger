# 自选列内来源与时间验收

日期：2026-11-07。对应[现行规格 AC3](../../specs/2026-11-07-watchlist-chart-density.md)。

## 当前布局

报价或净值的来源、行情时间、快照与刷新状态位于价格/净值列下方；日线与分时的来源和截止时间分别位于对应图表下方。表格共六列，价格列采用适合完整时间的宽度，表格最小宽度为 56rem。窄屏保持单份 DOM：名称与涨跌位于首行，价格及其元数据位于下一行，随后排列日线和分时。

`WatchlistSource` 通过可组合 `className` 适应桌面右对齐与窄屏左对齐；读取时间、来源周期和请求间隔仍在原信息提示中，必要状态继续直接显示。未改变行情请求、原始价格或来源配置。

## 验证

- `rtk proxy pnpm --filter @thesis-ledger/desktop exec vitest run src/features/watchlist/WatchlistTrend.test.tsx test/watchlist-number-display.test.tsx test/watchlist.ui.test.tsx`：3 文件 19 项通过，覆盖原请求/取消、数值精度及自选交互。既有 Base UI 测试保留 React `act` 提示。
- `rtk proxy pnpm --filter @thesis-ledger/desktop build`：类型检查与构建通过，保留既有大 chunk 提示。
- 修改的 `WatchlistTable.tsx`、`WatchlistSource.tsx` 定向 ESLint 通过，`git diff --check` 通过。
- 复用 `check-watchlist-number-display.cjs`，设置 `WATCHLIST_NUMBER_QA_PLATFORMS=desktop`、本机 Playwright/Microsoft Edge 与 `http://127.0.0.1:5173`；1440、1024、768、390 各 10 场景，共 40 场景通过，页面异常和外部/API 请求均为 0。

浏览器断言六列结构、来源提示位于价格单元格、原价文本与元数据无裁切、日 K 及分时正常绘制、信息提示聚焦/Escape/四边边界、原名称/菜单/刷新操作、窄屏无页面溢出和必要的表内滚动。样本原值前后相同。目视核对 390 样本和 1440 真实页面。

## 真实页面

真实 `/watchlist` 六列布局与来源信息提示通过。20 根真实日 K 线及其来源日期正常；报价来源与行情时间位于价格下方。当前 `510300.SH` 分钟来源的 `route_not_configured` 状态按原样显示。只放行 GET 与已有 `POST /watchlist/prices` 批量读取，业务写入和页面异常均为 0。

临时结果与截图位于 `/tmp/watchlist-source-placement-qa/`。本轮为局部布局调整，现行规格原位更新；保留本会话已有改动与历史验收记录，未提交、推送或操作 Docker，不扩大为全仓通过结论。
