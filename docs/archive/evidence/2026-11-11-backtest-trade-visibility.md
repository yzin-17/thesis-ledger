# 回测买卖点显示控制验收

日期：2026-11-11。对应[当前展示合同](../../specs/2026-11-11-backtest-trade-markers.md)的 AC3、AC4。

## 行为

图表工具栏使用共享 Switch 提供“显示买卖点”，默认开启；无可显示成交时禁用。关闭后清除箭头和成交读数，重新开启恢复；选择只保存在当前图表实例中，保持原始结果、图表窗口和锁定的权益时点。买入、卖出图例不再单独展示，权益和回撤图例保留。

## 代码验证

在 `apps/desktop` 执行 `pnpm exec vitest run test/unified-backtest-ratio-chart.ui.test.tsx test/backtest-trade-markers.test.ts test/strategy-backtest-chart.test.ts`：25 项通过。组件验证了默认状态、隐藏与恢复、锁定权益读数保留、窗口不重置和空成交禁用；jsdom 使用仓库既有的 `PointerEvent` 兼容方式。

`pnpm exec tsc -p tsconfig.json --noEmit` 通过。对 `StrategyBacktestEquityChart.tsx`、`BacktestChartTrades.tsx` 执行 ESLint，额外启用复杂度 20 与函数 220 行限制，通过且无告警。`git diff --check` 通过。

## 浏览器验证

当前源码的 `http://localhost:5173` 与 Microsoft Edge；真实 AAPL 任务 `fbea6dae-1084-466d-b0b8-05ab28c36ed3` 只读。脚本 `/tmp/backtest-trade-visibility-qa.cjs`，结果和截图 `/tmp/backtest-trade-visibility-qa/`。

- 1440、1024、768、390 宽度均验证默认开启，单击说明文字不切换，鼠标关闭、空格键恢复可用。
- 关闭后，实际画布中的买卖颜色像素均归零，成交读数隐藏；恢复后重新出现标记和成交读数。
- 缩放后的权益时点范围、锁定的权益时点保持不变，切换涨跌配色不会在关闭状态重新显示标记。
- 四种宽度均无页面横向溢出；受控空成交响应下开关禁用。
- 无页面异常、业务写请求；受控响应只存在于隔离浏览器上下文，未修改真实结果。

本次为现有展示控制的小范围增量，更新当前 Spec；初版实施归档保持历史记录。未提交、未部署。
