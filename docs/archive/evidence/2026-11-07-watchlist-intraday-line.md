# 自选日内分时验收

日期：2026-11-07。关联[现行规格 AC2](../../specs/2026-11-07-watchlist-chart-density.md)与[完成任务](../tasks/2026-11-07-watchlist-intraday-line.md)。

## 当前实现

自选表格的日内分时列组合 `WatchlistTrend(period="1m")` 与简要高低、今开、前收和振幅读数。分钟数据使用现有图表选项预检及分钟行情 API，按市场当地最近交易日筛选，按真实时间间隔绘线，缺分钟及午休处断开。基金显示“净值无分时数据”。日线及来源提示继续使用既有实现。

查询键包含相同的根、标的和周期；同标的同周期的两个展示入口消费同一缓存。刷新、请求取消、行可见性、后台暂停和来源周期由同一组件负责，表格统一等待相关查询。分钟来源未配置或不可用时直接说明原因，无有效来源不发分钟柱请求。字段展示使用共享格式化，不修改原始价格或历史数据。

## 定向验证

使用 `rtk proxy pnpm --filter @thesis-ledger/desktop exec vitest run`，执行 `src/features/watchlist/watchlist-trend.test.ts`、`WatchlistTrend.test.tsx`、`watchlist-source-cadence.test.ts` 与 `test/watchlist-number-display.test.tsx`、`test/watchlist.ui.test.tsx`，5 文件 26 项通过。

覆盖市场当地日期、分钟缺口与平盘，日线/分钟各自参数，分钟来源未配置时的预检与零分钟柱读取，后台暂停、失败保留图形及卸载取消；高低/今开/前收/振幅包含极小值、零、最大有限值、缺值和原始对象不变，原有自选详情、菜单及刷新入口继续通过。既有 Base UI 测试仍有 React `act` 提示，结果均通过。

- `pnpm --filter @thesis-ledger/desktop build`：通过，包含 TypeScript；保留既有大 chunk 提示。
- 修改的表格、分时、区间读数及数值/浏览器 TSX 夹具定向 ESLint：通过。
- `git diff --check`：通过。
- 依赖方向复用已有自选组件，删除区间读数中的绘图依赖，未增加跨 feature 依赖。

## 四宽受控浏览器

复用 `test/browser-watchlist-number.html` 与 `scripts/check-watchlist-number-display.cjs`。普通样本含 20 根日 K 线和 240 个固定分钟点，涵盖完整上午/下午时段、午休及两个缺分钟，实际 SVG 生成 4 段分时路径；其他报价样本校验明确的分钟来源原因。基金不发分钟请求。

运行本机 Playwright 与 Microsoft Edge，`WATCHLIST_NUMBER_QA_BASE_URL=http://127.0.0.1:5173`、`WATCHLIST_NUMBER_QA_PLATFORMS=desktop`、`WATCHLIST_NUMBER_QA_OUTPUT=/tmp/watchlist-intraday-qa`；命令沿用上一轮脚本。浏览器禁止 API 与外部请求，使用固定缓存和真实 DOM/SVG/控件。

1440、1024、768、390 各 10 场景全部通过，共 `cases=40, errors=0, requests=0`。验证日 K 与分时同时绘制、分时段数、精确区间读数、详情/菜单/刷新保留原行、来源信息聚焦与 Escape、提示四边视口约束，以及容器滚动和页面无横向溢出。目视核对桌面及 390 分时曲线。

## 真实页面与来源边界

真实 `/watchlist` 默认日线，20 根真实日 K 线及来源信息提示可用，日线接口 HTTP 200。`510300.SH` 分钟选项返回 `none.available=false`、`reason=route_not_configured`；日内分时列如实显示“未配置分钟行情来源”，不生成分时轨迹。

真实验收仅放行 GET 与原有 `POST /watchlist/prices` 批量读取，拦截业务变更；业务写入 0，页面异常 0。分钟图形用受控样本验证，当前真实来源限制独立记录；本轮未配置或启用 Provider，不将固定样本当作真实分钟数据。

截图与结果保存在本机 `/tmp/watchlist-intraday-qa/`，含四宽样本图、`results.json`、`real-results.json` 和真实页面截图。长期保留本记录、脚本和固定夹具，不提交生成截图或大日志。未提交、推送或操作 Docker。

## 最终一致性审查

当前分时契约、实际写集与上述证据一致；展示、查询边界、精度与原入口均已核对。来源配置独立于本次界面交付，真实状态直接呈现。历史验收保留其当轮输入，现行规格指向本次分时任务。
