# 自选分时午休分割线验收

规格：[图表密度 AC2](../specs/2026-11-07-watchlist-chart-density.md)。状态：[W3](../tasks/2026-11-07-market-intraday-sources.md#自选午休分割线)。日期：2026-11-08。

## 实现与范围

用户希望以分割线代替午休的空白间隔。自选迷你图现在把已知午休时段压缩为 4 个 SVG 坐标单位的窄间隔，在中间绘制主题辅助色的细竖虚线；上午、下午的价格线仍分别绘制，不补造午休行情。内地市场按上海时区的 11:30–13:00、香港按香港时区的 12:00–13:00 识别；仅有同一交易日的上午与下午数据同时出现时显示分割线。美股无此午休处理。普通缺失分钟继续断线并保留实际时间间距。

几何投影从 `watchlist-trend.ts` 提取到 `watchlist-trend-geometry.ts`，数据选择与价格原值不变；`WatchlistTrend.tsx` 复用同一 SVG 添加分割线，沿用现有按钮、表格、主题原子类和图表尺寸。检索原几何函数的全部消费者，仅此共享迷你图使用，所有自选股票/ETF 分时同步生效；基金净值和日 K 线不显示午休标记。详情 Lightweight Charts 为独立实现，本次保留其交互和图表行为。

未修改查询键、API、行情来源、尾盘覆盖、账本或自选业务记录。仅 Desktop 源码变化，目标 Vite 页面直接消费当前源码，无 Server/DSA 或 Docker 状态变更。

## 本地检查

- 三个定向文件 13 项通过；新增几何回归覆盖内地三交易所、香港、美国、普通缺分钟、单个时段、跨日、UTC 输入、平盘、空集合、单点及原始输入不变。
- `pnpm --filter @thesis-ledger/desktop test`：268 文件、1704 项全部通过。整包过程保留既有 React `act` 警告，不把告警描述为新增失败。
- `pnpm --filter @thesis-ledger/desktop build`：类型检查和 Vite 构建通过；保留现有大 chunk 提示。
- 修改文件 ESLint、`check-boundaries.mjs`、`check-file-size-guardrails.mjs` 通过；尺寸门禁保留 6 个既有警告。未增加跨模块依赖或供应商特判，无边界门禁例外。

命令日志在 `/tmp/watchlist-lunch-{tests,desktop-tests,build,lint,boundaries,sizes}.log`。首次几何测试的稀疏样本还包含普通缺分钟，正确产生额外断线；改为连续的午休前后四点后通过，未改变保留缺分钟的生产逻辑。

## 实际页面

复用[分时修复验收](2026-11-08-watchlist-intraday-fix.md)的 510300.SH 真实响应及原自选条目，进入当前 `http://127.0.0.1:5173/watchlist`。浏览器路由仅提供已有分钟能力/数据响应，其余 API 阻断，未重新调用任何行情来源。报价和日线的隔离网络错误不代表这些功能的新验证结果。

Microsoft Edge 在 1440、1024、768、390 四宽分别检查浅色主题/上海设备时区，以及深色主题/洛杉矶设备时区，共 8 个场景通过：

- 239 个真实分钟点、两条价格路径不变；只显示一条午间休市分割线，午休大块空白消失。
- 分割线始终位于上午最后一点与下午第一点之间，两点横向间隔小于 5 个 SVG 坐标单位；线条采用主题辅助色、`2 2` 虚线，无硬编码明暗色。
- 普通断线、来源、截止时间保留原有行为；午休定位不随设备时区改变。本次未修改截止时间原有的设备时区格式化。
- 无页面横向溢出或脚本异常；点击分时可打开原条目的详情，Esc 可关闭。

记录在 `/tmp/watchlist-intraday-fix/lunch-browser.json`、`lunch-dark-browser.json`，截图为同目录的 `lunch-watchlist-{1440,1024,768,390}.png` 和 `lunch-dark-watchlist-{1440,1024,768,390}.png`。已目视检查窄屏浅色与桌面深色截图；临时工件可能由系统清理，关键结论在本文保留。

## 审查结论

W3 完成：用户要求、AC2、几何投影、实际 SVG 与主题/屏宽证据一致。香港和美国的规则由定向样本验证，本轮真实浏览器行情仅为 510300.SH；未据此扩大为其他来源实读验收。保留其他工作区修改，未提交 Git。

## 曲线配色统一

用户要求与详情颜色一致。对照详情 `MarketPriceLightweightChart` 的收盘价 `LineSeries` 与 `MarketNavChart`，均使用 `--chart-1`；自选 `WatchlistTrend` 的分时/净值 SVG 改用 `text-chart-1`，移除按首尾涨跌决定曲线颜色的局部判断。`WatchlistCandles` 的日 K 线和中性午休分割线保持。只调整颜色，不新增接口或行情读取。定向 13 项、修改文件 ESLint 和 Desktop 类型检查/构建通过。复用同一真实响应在四宽浅色及四宽深色页面验证，所有分时路径的实际计算颜色均等于 `--chart-1` 解析值；午休分割线、数据点数和详情导航保持。记录为 `/tmp/watchlist-intraday-fix/color-browser.json`、`color-dark-browser.json`；未重复 Provider 读取。此前 1704 项整包结果对应午休几何实现，本次仅颜色调整按定向、构建与浏览器验证，不重复整包测试。
