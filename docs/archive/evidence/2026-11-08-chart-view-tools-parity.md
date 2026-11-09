# 行情视图工具与模型点位验收

日期：2026-11-08；[规格](../../specs/2026-11-08-chart-view-tools-parity.md)；[任务](../tasks/2026-11-08-chart-view-tools-parity.md)。

## 问题与实现

- 股票视图包含全屏、缩放和平移，基金历史净值只组合了回到最新和重置，今日估值没有完整视图组。现在三处使用同一个 `MarketChartViewActions`，统一顺序和样式，并复用全屏容器、焦点恢复及逻辑视口控制器。ETF 与股票共用 `MarketPriceChart`。
- 基金历史图与今日估值的原生画布分别负责自己的创建、数据、事件及资源释放；全屏容器中的画布实际挂载后初始化。跨全屏保留父层视口快照、成本参考、测量和成交选择状态。历史净值与累计盈亏共同构成日期轴，在任何系列清理或更新前采集视口，前插盈亏历史后按日期锚点迁移。
- 模型入口原先要求 `timeframe === '1d'`，周线因此不可见。现在日、5 日、周、月、年使用完整日期桶请求和绘图坐标映射。原始模拟事实的 `day`、价格、数量与链接保持不变，只附加本地 `key`；点击聚合 K 线按 key 筛选桶内明细。分钟保留禁用入口和图标说明；图层关闭时不读取比赛。

## 静态与组件验证

- 定向基金、视口、交易资源和点位映射首轮 24 项通过；调整原生逻辑范围 mock 后验证实际生命周期。
- `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail src/features/model-arena/arena-price-points.test.ts test/market-percent-units.ui.test.tsx`：48 个文件、246 项通过。之后新增一项聚合模型标记资源断言，资源文件 3 项通过。
- `pnpm --filter @thesis-ledger/desktop test`：274 个文件、1730 项全部通过，覆盖上述新增断言的最终版本。
- `pnpm --filter @thesis-ledger/desktop build`：类型检查和 Vite 构建通过，保留既有大 chunk 提示。浏览器样本最终补充成交后另跑 `tsc --noEmit -p tsconfig.json`。
- 修改源码与测试的 ESLint、`scripts/check-boundaries.mjs` 和 `git diff --check` 通过。尺寸检查保留其他文件的 6 个既有无基线告警；没有提高阈值或增加忽略。新画布及读数组件按资源生命周期和展示职责拆分，股票与基金原组合组件规模下降。

## 四宽真实浏览器

在本地 Vite 与 Microsoft Edge 上，通过 Playwright 检查 1440、1024、768、390。页面、控件、原生 Lightweight Charts 及 canvas 是实际实现；行情、净值、盈亏和比赛均为受控样本，模型读取边界替换为本地 fixture。原生库的测试包装仅采集创建实例与标记参数，不改变图表方法。未读写真实业务事实。

`check-chart-view-tools.cjs`：

- 股票、基金历史和今日估值视图组的七个按钮名称及顺序完全一致。
- 基金连续缩放、前后平移、回到最新、重置实际改变逻辑范围；双轴下前插盈亏记录，原有日期窗口与小数缩放保持。
- 基金历史和今日估值进入及退出全屏前后，逻辑范围误差小于 0.001；全屏入口恢复焦点，成本参考保持启用，测量完成后 Esc 清除结果且全屏保持，再退出全屏。全屏内点击真实绘制的成交箭头打开精确成交详情，Esc 先关闭成交详情并保留全屏。
- 周线图层未开启前没有模型读取；开启后完整请求第一个周桶起点，周内 11 月 4 日事实绘制到 11 月 6 日周 K 线，原生 canvas 实际绘制模型文字。点击周 K 线只保留桶内事实明细，原始日期和价格不变。
- 分钟周期保留禁用模型入口，说明可点击和取消；回到周线后保留图层选择。无页面脚本异常和横向溢出。

结果和截图：`/tmp/chart-view-tools-qa/results.json`、`/tmp/chart-view-tools-qa/tools-{1440,1024,768,390}.png`。已人工查看窄屏截图，视图组可读，控件在容器内换行。

## 相关回归

- `check-fund-nav-references.cjs` 四宽通过：成本线、全高蒙层、测量取消、成交标记优先级与精确详情、账户及模式隔离、无额外读取和横向溢出。结果 `/tmp/fund-nav-reference-qa/results.json`。
- `check-macd-layering.cjs` 四宽各五阶段通过：初始、刷新、副图切回、全屏和退出全屏。正负柱区域的 DIF、DEA 采样覆盖率均为 100%。结果 `/tmp/macd-layering-qa/results.json`。
- `check-chart-date-ranges.cjs` 四宽通过：常用区间、长历史、自定义日期、取消、日期校验、今日视图和全屏内日期弹层。结果 `/tmp/chart-date-ranges-qa/results.json`。

## 调试记录与边界

初次浏览器脚本未等待原生时间轴下一帧，并把快速两次测量点击当作普通点击；已等待渲染及避开原生双击手势，保持产品断言。今日估值全屏首次暴露 Portal 延迟挂载时原生 effect 过早执行的问题，已将原生资源移至独立画布组件，待实际挂载后创建，并重新完成四宽验证。

这些结果验证受控输入下的 Desktop 行为。没有执行 Docker 同步、镜像构建、提交或发布，不据此声称真实比赛、Provider 数据或运行容器已更新。
