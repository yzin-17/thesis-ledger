# 自选图表与行情信息密度验收

日期：2026-11-07。关联[现行规格](../../specs/2026-11-07-watchlist-chart-density.md)与[完成任务](../tasks/2026-11-07-watchlist-chart-density.md)。

## 实际改动

自选默认日线；交易所证券以近 20 个交易日的原始开高低收生成日 K 线，保留前复权、分时切换、分钟缺口及基金净值曲线。图表继续受行可见性、页面前后台和来源周期控制，查询管理沿用 TanStack Query。

日内图以高低区间、现价箭头与圆点、今开空心点和前收虚线呈现。坐标范围包含今开与前收，区间外参考价如实绘制；平盘使用中央位置。原金融格式化及原始业务值保留，净值和缺报价仅显示一条具体原因。

行情与来源栏直接展示来源、行情/净值日期、休市快照及非官方收盘价、陈旧/未知时间、刷新失败或冷却沿用状态。读取时间、来源周期及请求间隔进入信息提示，可鼠标悬停、点击、聚焦打开，Escape 关闭。页上报价检查说明压缩为简短状态。

新增 `WatchlistCandles`、`WatchlistSource`，表格仅组合各展示职责。样式使用原子类和既有市场颜色；未新增 CSS。真实页面发现走势来源回退为内部 `hithink`，在共享 `dataSourceDisplay` 补齐同花顺中文标签。静态排查其全部消费者：自选走势与来源、来源精确检查、路由与策略状态、行情详情；清单配置仍由现有函数解析，相关 11 项来源 UI 测试通过。

## 定向测试与静态检查

命令均从主仓使用 `rtk proxy` 执行。

`pnpm --filter @thesis-ledger/desktop exec vitest run` 加以下文件，共 6 文件、36 项通过：

- `src/features/watchlist/watchlist-trend.test.ts`
- `src/features/watchlist/WatchlistTrend.test.tsx`
- `src/features/watchlist/watchlist-source-cadence.test.ts`
- `test/watchlist-number-display.test.tsx`
- `test/watchlist.ui.test.tsx`
- `test/market-data-provider-ui.test.tsx`

覆盖日线近 20 条真实 OHLC 与原值保留、日线/分时请求参数、可见行加载、后台暂停、失败保留图形及取消；净值、极小非零、最大有限值、极宽区间、零、平盘、缺失今开及区间外前收均无非法坐标。原有自选选择、菜单和刷新回归通过。既有 Base UI 测试仍有 React `act` 提示，结果均通过。

- `pnpm --filter @thesis-ledger/desktop build`：最终输入通过，包含 TypeScript 检查及生产构建；保留既有大 chunk 提示。
- 修改源码、共享来源标签及数值/浏览器 TSX 夹具的定向 ESLint：10 文件通过。
- `pnpm exec node scripts/check-boundaries.mjs`：`Import boundaries: OK`。随后来源函数仅增加显示标签，无新增依赖。
- `git diff --check`：通过。

## 四宽受控实际浏览器

复用 `test/browser-watchlist-number.html` 与 `scripts/check-watchlist-number-display.cjs`，普通样本提供 20 条固定 OHLC，其余样本保留原数值边界；浏览器禁止任何 API 或外部请求，原始样本前后相同。使用真实 DOM/SVG 与 Base UI 控件。

本轮环境：本机 Playwright、Microsoft Edge、开发服务器 `http://127.0.0.1:5173`。命令为 `pnpm --filter @thesis-ledger/desktop exec node scripts/check-watchlist-number-display.cjs`，设置 `PLAYWRIGHT_MODULE`、`WATCHLIST_NUMBER_CHROMIUM_EXECUTABLE`、`WATCHLIST_NUMBER_QA_BASE_URL`、`WATCHLIST_NUMBER_QA_PLATFORMS=desktop`、`WATCHLIST_NUMBER_QA_OUTPUT=/tmp/watchlist-chart-density-qa`。

| 宽度 | 样本数 | 图形与价格精度 | 提示与入口 | 页面溢出/异常 |
| ---- | ------ | -------------- | ---------- | ------------- |
| 1440 | 10     | 通过           | 通过       | 无            |
| 1024 | 10     | 通过           | 通过       | 无            |
| 768  | 10     | 通过           | 通过       | 无            |
| 390  | 10     | 通过           | 通过       | 无            |

40 场景最终结果：`cases=40, errors=0, requests=0`。日线实际包含 20 根蜡烛，日内区间与文字数值匹配；提示键盘打开、Escape 关闭，左右及上下边界均在视口；名称打开原详情入口，操作菜单取消并还焦；刷新保留原行且结果区加载圈收敛；平板表格在自身容器横向滚动，窄屏沿用卡片排列。

实际浏览器发现并修正两处样式问题：Button 默认图标尺寸使新 SVG 缩小，已按既有图表约定使用显式尺寸；历史 `td span` 块级规则使标签与数字换行，已用局部 `inline` 原子类修正。原数值测试及浏览器断言按新的图形与缺值展示合同调整，最终重新完成全 40 场景。目视核对普通样本 1440、390 与真实页面。

临时截图、结果及失败诊断位于 `/tmp/watchlist-chart-density-qa/`，脚本成功后清除旧失败产物。仓库保留可重复脚本、固定样本和本记录，不提交生成截图或大日志。

## 真实页面只读验收

真实 `/watchlist` 页面默认选择“日线”，日线详情接口 HTTP 200，实际显示 20 根 K 线。报价数值、完整行情时间与休市快照状态可直接阅读；来源信息提示显示真实读取时间、日线检查周期及 10 分钟请求间隔。补齐同花顺中文标签后重新验收通过。

真实验证允许 GET 及现有 `POST /watchlist/prices` 批量读取，拦截其他业务写入；业务写入数 0，页面异常数 0。最初的验收拦截误将此只读 POST 归为写入，导致读取信息暂缺，已按客户端合同修正验收规则后通过，业务代码与数据未因此改写。结果保存为本机 `real-results.json`、`real-page.png`、`real-source-info.png`。

前端使用当前开发服务器更新，无 Docker、镜像、数据库或原生工程变更。本轮未提交或推送，不将上述定向检查扩大为全仓测试或正式发布结论。

## 最终一致性审查

AC1 由模型、两周期查询与真实日线覆盖；AC2 由数值边界、图形及原值测试覆盖；AC3 由必要状态断言、提示交互和真实时间核对覆盖；AC4 由四宽 40 场景与原入口回归覆盖。无未决义务或延期实现，现行规格继续维护行为合同。
