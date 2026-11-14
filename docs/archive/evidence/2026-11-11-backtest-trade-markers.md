# 回测图表买卖点验收记录

日期：2026-11-11。对应[展示合同](../../specs/2026-11-11-backtest-trade-markers.md)与[已完成任务](../tasks/2026-11-11-backtest-trade-markers.md)。

## 结果与边界

当前工作区的 Desktop 权益图已显示冻结模拟成交的买卖箭头，沿用详情页方向和涨跌配色。悬停、点击锁定、键盘逐点查看均可读取对应的原始成交时间、数量、价格；研究数量和价格复用共享十进制展示。多笔同点同方向聚合，读数最多三笔，其余指向“交易与订单”。

成交投影只定位到同一显示日期内成交之后的已有权益点，不添加权益记录，不推断交易日或市场会话，不修改执行事实。图表与读数的层级已隔离，读数不会被画布、箭头或坐标标签遮挡。主题与序列绘制由独立模块拥有，Hook 保留资源生命周期和交互，未提高复杂度阈值或增加忽略项。

本次验证使用当前未提交工作区的相关源文件，不代表镜像或生产发布。真实回测只读；浏览器拦截业务写请求，未创建任务、重跑回测、修改历史结果或调用远程 Provider。

## 写集

- `apps/desktop/src/features/strategy/backtest-trade-markers.model.ts`：成交时间投影、同点分组和原始值保留。
- `apps/desktop/src/features/strategy/strategy-backtest-chart.model.ts`：将成交投影加入图表模型。
- `apps/desktop/src/features/strategy/backtest-chart-paint.ts`：图表主题、权益/回撤序列和成交箭头绘制。
- `apps/desktop/src/features/strategy/useStrategyBacktestChart.ts`：标记资源、按标记标识命中的指针时间、配色更新和清理。
- `apps/desktop/src/features/strategy/BacktestChartTrades.tsx`：图例与成交读数。
- `apps/desktop/src/features/strategy/StrategyBacktestEquityChart.tsx`：集成读数、说明与局部层级。
- `apps/desktop/test/backtest-trade-markers.test.ts`、`apps/desktop/test/unified-backtest-ratio-chart.ui.test.tsx`：投影、资源和交互验证。
- `apps/desktop/src/features/strategy/BacktestRunSettings.tsx`：仅为已有递归 `cashText` 补充 `string` 返回类型，解除包级类型检查错误，不改变运行行为。

## 代码验证

在 `apps/desktop` 执行：

```sh
pnpm exec vitest run test/backtest-trade-markers.test.ts test/unified-backtest-ratio-chart.ui.test.tsx test/strategy-backtest-chart.test.ts test/strategy-backtest-detail.test.ts test/unified-backtest-ratio.ui.test.tsx
pnpm exec tsc -p tsconfig.json --noEmit
```

最终结果：5 个文件、64 项测试通过，类型检查通过。测试覆盖精确时间、盘中到收盘、分钟间隔、时区跨午夜、夏令时、日期缺口、无效时间/方向、空成交、原始精度不变、同点买卖分组、标记标识优先于临近横轴时间、配色更新、任务替换和卸载清理。原比例、回撤、区间及导出测试继续通过。

在仓库根执行：

```sh
pnpm exec eslint apps/desktop/src/features/strategy/backtest-trade-markers.model.ts apps/desktop/src/features/strategy/useStrategyBacktestChart.ts apps/desktop/src/features/strategy/BacktestChartTrades.tsx apps/desktop/src/features/strategy/StrategyBacktestEquityChart.tsx apps/desktop/src/features/strategy/strategy-backtest-chart.model.ts apps/desktop/src/features/strategy/backtest-chart-paint.ts --rule 'complexity:[warn,20]' --rule 'max-lines-per-function:[warn,{max:220,skipBlankLines:true,skipComments:true}]'
pnpm exec node scripts/check-boundaries.mjs
pnpm exec node scripts/check-file-size-guardrails.mjs
git diff --check
```

局部 ESLint 与复杂度检查无错误、无告警，依赖边界和空白检查通过。文件尺寸检查成功返回，保留六项其他文件的既有告警；该次未提供比较基线，不能据此扩大声明为全仓历史债务无增长。本次图表文件和新增文件均未超出检查阈值。

## 真实浏览器验证

环境：当前源码提供的 `http://localhost:5173`，Microsoft Edge。脚本 `/tmp/backtest-trade-markers-qa.cjs`，结果和截图 `/tmp/backtest-trade-markers-qa/`。临时材料用于复核，关键断言保存在本文。

| 样本 | 冻结成交 | 已映射成交 | 未映射 | 宽度 |
| --- | ---: | ---: | ---: | --- |
| AAPL.US，任务 `fbea6dae-1084-466d-b0b8-05ab28c36ed3` | 69 | 69 | 0 | 1440、1024、768、390 |
| 00700.HK，任务 `c740afea-31e9-484a-87a8-5d03b4b359f5` | 61 | 61 | 0 | 1440、1024、768、390 |

八组真实页面均验证了实际画布中的买卖颜色像素、原始成交时间及数量读数、键盘锁定和横向边界。AAPL 缩放后可见权益时点由 252 减为 190，港股由 247 减为 187；平移、重置后恢复完整区间，未增加或移除原始权益点。

另在实际箭头绘制位置验证鼠标悬停和点击锁定，读数与冻结成交时间、数量、价格匹配，锁定前后成交内容一致。深色主题与反向涨跌配色重新绘制通过。

## 受控输入与清理

- 切换到另一任务并以受控响应提供空成交，旧箭头、旧成交读数清理；画布中的买卖颜色像素均归零。
- 390 宽度下，同一权益点提供六笔成交，聚合为买、卖两个标记；读数列三笔及其余三笔提示，宽 332 像素、高 255 像素，保持在图表边界内。
- 最终浏览器结果没有页面异常和越界写请求。受控响应只存在于隔离浏览器上下文。

## 修正与复核

首次类型检查暴露既有递归函数返回类型缺失，补充注解后通过。局部检查发现标的字段的默认对象字符串化风险和 Hook 函数长度告警，分别通过明确文本类型、按绘制职责提取模块解决。

截图复核发现画布层级高于旧读数，通过局部隔离和读数层级修复后重验。浏览器脚本早期使用错误的重置按钮名称，以及在密集重叠标记中按像素颜色预设命中方向，曾导致脚本失败；改为实际按钮名称，并按原生命中后的冻结成交内容验证，最终通过。未通过降低页面或数据验收要求处理这些失败。

## 验收映射

AC1：两条真实回测全部成交已映射，方向/分组由模型及组件测试验证。AC2：六项投影测试与原始数据不变断言通过。AC3：组件资源、真实指针、主题配色、任务替换及受控密集读数通过。AC4：八组真实宽度检查、缩放平移与重置通过。

最终一致性审查通过，无本任务未完成项。未创建提交，未执行 Docker 同步或镜像构建。
