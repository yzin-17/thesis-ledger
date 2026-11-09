# 自选筛选与涨跌配色验收

日期：2026-11-07。对应[现行展示合同](../../specs/2026-11-07-watchlist-chart-density.md)的 AC1、AC4。

## 改动范围

移除 Desktop 自选顶部的日线／分时选择器及其页面状态，走势列沿用日线默认值，右侧日内分时继续展示。市场、类型、分组及详情入口保留。

涨跌幅与涨跌额复用 `marketToneForValue`、`marketToneClass` 和全局市场颜色变量；方向根据原始报价相对有效前收确定，平盘、净值与缺报价保持中性色。涨跌额使用 `text-inherit`，覆盖既有基础层 `td span` 的辅助文字色。排查范围包括共享配色、表格基础样式及行情详情既有消费者；共享配色已具备所需语义，因此仅调整自选消费者，未修改原始值、格式化或其他页面。

## 验证结果

命令从主仓执行，均使用 `rtk proxy`；pnpm 使用工作区配置的镜像源。

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/watchlist.ui.test.tsx test/watchlist-number-display.test.tsx test/market-color.test.ts src/features/watchlist/WatchlistTrend.test.tsx`：4 文件、22 项通过；保留既有 Base UI 的 `act` 提示。
- `pnpm --filter @thesis-ledger/desktop build`：TypeScript 与生产构建通过，保留既有大 chunk 提示。
- 对页面、表格及自选交互测试执行定向 ESLint：通过。`git diff --check`：通过。
- 复用 `scripts/check-watchlist-number-display.cjs`，新增两项数值实际计算颜色与市场变量一致的断言。Microsoft Edge／Playwright、`http://127.0.0.1:5173`、`WATCHLIST_NUMBER_QA_PLATFORMS=desktop`，1440、1024、768、390 各 10 场景，共 40 场景通过，页面异常及外部/API 请求均为 0。覆盖涨跌、平盘、极小值、缺值、菜单、提示、刷新保留原行与容器滚动。
- 真实 `/watchlist` 四宽检查通过：日线选择器已移除，两项筛选可用，打开后可按 Escape 关闭；日 K 线保留，`−1.69%` 与 `−0.071` 均为市场下跌色，页面无横向溢出。目视核对 1440 与 390 截图。仅放行 GET 与只读 `POST /watchlist/prices`，业务写入及页面异常均为 0。

浏览器结果及截图位于本机 `/tmp/watchlist-color-qa/`。当前真实分钟来源仍未配置，原有原因提示保留；受控分钟轨迹不作为真实来源证据。本轮通过开发服务器验证，未操作 Docker、数据库或原生工程，未提交或推送；保留工作区既有未提交改动。
