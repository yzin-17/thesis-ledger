# 行情周期与视口验收记录

日期：2026-11-08；[规格](../../specs/2026-11-08-chart-period-viewport.md)；[任务](../tasks/2026-11-08-chart-period-viewport.md)。

## 原因及实现

1. `MarketDetailDialogView` 的 key 包含周期，导致切换时卸载整个详情。改为按标的保持实例；请求窗口同步按标的、周期和复权隔离，避免年度首帧先发 90 根请求。目标周期成功前保留旧图，切换请求仅包含行情及技术指标，报价、资讯页签及滚动不清空。
2. 图表视口与数据绘制处于同一个 effect，边界状态及操作触发重绘后会写回旧的整日范围，造成缩放失效与回跳。提取原生视口控制器，提交前读取实时小数逻辑范围；数据提交按日期锚点迁移，缩放和平移单独执行一次；移除手工 ResizeObserver 对旧视口的恢复。
3. 周期变化不再展示整块详情刷新提示，数据区统一显示共享加载圈。取消旧范围的最新端请求和重试状态，迟到结果仍受请求代次及实际行情范围校验；有效缓存切回不依赖旧响应代次表。

## 静态和组件验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail`：46 个文件、203 项通过。新增控制器覆盖重复提交、小数缩放、原生临时视口、前插、追加、最新端跟随、周期及显式重置；窗口测试覆盖周期、标的与复权隔离。
- `pnpm --filter @thesis-ledger/desktop test` 首轮：272 个文件通过、1 个文件失败；1718 项通过、5 项失败。失败文件 `test/market-percent-units.ui.test.tsx` 的报价样本横跨 7–11 月，默认一月仅剩一个价格，因此其完整起止比值断言失效。将该测试的日期调整至 11 月 5–7 日，数值和精度断言保持不变。
- `pnpm --filter @thesis-ledger/desktop exec vitest run test/market-percent-units.ui.test.tsx src/features/market-detail/useMarketChartRequestWindow.test.tsx`：38 项通过。复用其余未变输入的已通过结果，不声称修改后重跑了整个测试包。
- `pnpm --filter @thesis-ledger/desktop build`：类型检查及 Vite 构建通过；构建仍有既有大 chunk 提示。
- 修改源码与测试的 ESLint、`git diff --check`、`scripts/check-boundaries.mjs` 通过；文件尺寸检查通过，其他存量文件保留 6 个无基线告警，本次文件未超过文件尺寸阈值。与 HEAD 比较，详情函数复杂度从 31 降至 29，有效行数从 257 降至 251；原生图表函数从 618 降至 537 行，数据 effect 从 313 降至 263 行且不再超过复杂度 20。剩余函数行数及详情复杂度告警属于存量债务，未提高阈值或增加忽略。

## 真实浏览器与输入边界

使用本地 Vite（`http://localhost:5173`）、Microsoft Edge 和 Playwright，在 1440、1024、768、390 宽度执行。业务页面及原生图表是真实实现；报价与日、周、月、年行情为合成样本，经 `marketDisplayDetailResponseSchema` 校验，仅替换行情读取边界；资料请求使用受控失败，不读写账户事实。

`check-chart-period-viewport.cjs` 与 `browser-chart-period-viewport.tsx` 验证：

- 详情、报价节点与原生 canvas 在日→周→月→日→周→年→日之间保持同一 DOM 实例，读取期间只有一个图表加载圈，旧图和滚动位置保留。
- 桌面资讯栏保持展开，公告页签保持选中；窄屏保持底部资讯入口。
- 人为延迟周线响应，先完成月线，再返回旧周线，月线未被覆盖；日线缓存立即恢复。
- 连续五次放大均改变可见日期跨度，原生鼠标拖动有效；随后连续 30 帧的日期范围一致，没有来回跳动。
- 最新端探测仍在读取时切换周期，旧探测不锁死新周期的最新端操作，迟到结果不覆盖目标周期。只在触发探测时偏移受控 `Date.now` 以跨过已有冷却，不改变业务冷却规则。
- 年线首个读取为 2 根且无历史锚点；普通周期为 90 根。四宽无文档横向溢出或页面脚本异常。

原始结果与截图：`/tmp/chart-period-qa/results.json`、`/tmp/chart-period-qa/period-{1440,1024,768,390}.png`。

## 相关回归

- `check-chart-date-ranges.cjs` 四宽通过：常用及更多区间、自定义日期、取消、未来日期拒绝、长历史、原生 canvas 保持、今日视图及全屏；结果 `/tmp/chart-date-ranges-qa/results.json`。
- `check-macd-layering.cjs` 四宽、每宽五阶段通过：初始、刷新、副图切回、全屏、退出全屏。正负柱区域 DIF、DEA 折线采样覆盖率均为 100%；结果 `/tmp/macd-layering-qa/results.json`。
- 两个回归脚本首次并行执行出现浏览器滚动定位超时；分别单独重跑后均通过，未修改产品逻辑或放宽断言。新周期脚本调试期间还纠正了 API 拦截范围、缺少指标分段的样本以及 fresh cache 不会重复读取的预期。

## 验收结论

AC1–AC5 在上述输入边界内通过。未执行 Docker 同步、镜像更新、提交或发布；这些浏览器结果不替代真实 Provider、行情覆盖及部署验收。
