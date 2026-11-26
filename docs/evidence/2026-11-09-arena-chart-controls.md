# 模型点位下拉框与空心箭头验证

对应[规格](../specs/2026-11-09-arena-chart-controls.md)及[归档任务](../archive/tasks/2026-11-09-arena-chart-controls.md)。本任务的应用写集在 Desktop，使用目标竞技场只读接口和冻结行情。

## 已实现行为

- 比赛和模型分别复用已安装的 Base UI Select，当前回显与选项共用标签；全部模型显示中文，长名称在触发器截断、选项内换行。两个下拉框右侧仅显示“模拟成交 N 笔 · 查看明细”，点击共享 Popover 查看记录和原报告链接；弹层限制视口宽度，列表限高并内部滚动，窄屏控件按可用宽度换行。保留图表日期筛选，空日期显示零笔与空状态，可点击“查看全部”恢复；切换比赛重置模型筛选。
- 模拟买卖点使用连续的空心箭头轮廓，内部透明。买入向上、卖出向下，与普通成交共用 `--color-market-up` / `--color-market-down`；底部常驻同色“买（模）”或“卖（模）”。文字在边缘避让，悬浮文字与箭头均可查看模型详情；普通成交标记、参考线和测量行为保持原样。
- 已读取项目锁定的 `lightweight-charts@5.2.1` 实际 `SeriesMarkers` 实现，模拟箭头按相同的 K 线间距范围及奇偶像素规则计算尺寸，并内缩半个描边宽度，令外轮廓与真实成交标记等大。验证间距 6/18/40 时分别为 10/14/26 像素；命中范围随尺寸更新。后续库版本升级需复核该尺寸合同。
- 同一绘图桶和方向的模型成交合并为一个标记，悬浮提示逐笔保留真实日期、完整模型名、数量和原始价格。常态不绘制模型文字；离开、切换副图或坐标改变时清除提示。明细弹层中的报告链接保持原路由和返回位置，模型名由悬浮标题与可访问名称承接。
- 标记资源归价格 Series 管理；更新视图只刷新绘图坐标，不改变价格轴范围；释放时取消鼠标订阅。没有增加已有大型图表组件的职责，也没有新增传统 CSS 选择器。

复核项目锁定的 `shadcn@4.16.1`、`components.json` 和现有组件后组合使用。执行过 `pnpm exec shadcn info --json` 与 `pnpm exec shadcn docs select tooltip`，并读取[Select 官方用法](https://ui.shadcn.com/docs/components/base/select)。绘图采用[Lightweight Charts Series primitive](https://tradingview.github.io/lightweight-charts/docs/plugins/series-primitives)，因为自定义空心轮廓与标记命中应随原生 Series 坐标更新；悬浮信息在原生画布中绘制，没有引入新的 HTML 浮层组件或依赖。

## 验证结果

实际 Node 使用 `/Users/yzin/.volta/tools/image/node/26.13.0/bin/node`，所有 Shell 入口经 `rtk proxy`。

- 成交明细收纳后执行 `node ../../node_modules/vitest/vitest.mjs run src/features/model-arena/ArenaPriceLayer.test.tsx`：7 项通过。使用真实 Popover 验证 50 笔记录只保留一个工具栏入口、明细完整且限高滚动、原始长小数、Escape 关闭及焦点返回、空日期零笔与恢复全部、原报告路径、筛选与图表实例保持。修改的三个源码/测试文件定向 ESLint 通过。本次未修改标记或共享资源，沿用下列对应测试证据。
- 已执行项目锁定版本的 `pnpm exec shadcn docs popover` 并读取[Popover 官方组合示例](https://ui.shadcn.com/docs/components/base/popover)，直接复用现有组件，无依赖或共享组件变更。
- 成交明细收纳后的 `pnpm --filter @thesis-ledger/desktop build`：类型检查与构建通过，Vite 构建用时 2.87 秒，保留既有大产物提示。本次未重复尝试已连续超时的浏览器控制连接，四宽弹层布局与真实滚动效果仍待 C3 验收。

- 在 `apps/desktop` 执行 `node ../../node_modules/vitest/vitest.mjs run src/features/model-arena/ArenaPriceLayer.test.tsx src/features/market-detail/market-arena-marker-primitive.test.ts src/features/market-detail/market-trading-overlay-resources.test.ts src/features/model-arena/arena-price-points.test.ts`：四文件、23 项通过。覆盖真实 Select 交互、中文回显、比赛切换重置筛选、图表节点/缩放保留、成交信息位于控件组且在图表之前、原报告跳转、普通成交资源释放、空心轮廓/方向/颜色与真实标记尺寸一致、同桶合并、底部文字及边缘避让、悬浮显隐、真实日期与精度、视口外隐藏及平移后的命中刷新。
- 最后扩大箭头边缘命中范围后，单独复验 `market-arena-marker-primitive.test.ts` 的 8 项通过；其余 15 项输入及被验证路径不受影响，沿用该轮结果。
- 六个相关源码/测试文件定向 ESLint，`--max-warnings=0`：通过；本次文字变更的两文件再次检查通过。测试 Canvas mock 补充准确参数类型后，消除 `no-unsafe-return`，不关闭规则。
- `pnpm --filter @thesis-ledger/desktop build`：类型检查与生产构建通过；早期初次类型检查发现 OHLC 联合类型需要显式收窄，以及测试回调/模拟函数返回类型过窄，均已修正。保留现有大产物分包提示，没有调整告警阈值。
- 当前 `localhost:5173` Vite 服务已实际返回新的两个 Select 和空心箭头模块，没有重启服务或执行 Docker 同步。本项只证明开发服务提供了新代码。
- 实际浏览器：本轮调用连接清单读取仍超时，停止重复尝试。尺寸与信息布局更新后再次做一次有界连接检查，仍超时。尚未取得四种宽度的实际新界面截图，未完成真实页面的悬浮、周期/缩放和报告跳转验收；用户截图仅用作需求参照。

## 写集与边界

`ArenaPriceLayer.tsx` 及其测试、新增 `ArenaPointDetails.tsx`、`market-trading-overlay-resources.ts` 及其测试、新增 `market-arena-marker-primitive.ts` 及其测试，以及本 Spec/Task/证据。成交明细本次仅变更前三个文件与对应文档；已检查共享资源的股票/ETF 和基金净值消费者，基金不提供模型点位，不会分配新增标记资源。原有未提交修改保留，未提交 Git 变更。

## 2026-11-22 实际浏览器收尾

- 浏览器定位到交叉线事件可在坐标重算后、画布重绘前到达，此时原实现清除了文字的命中区，悬浮提示可能立即消失。用同一文字宽度在布局阶段重算命中区，画布采用相同边界。窄屏右边缘的买卖文字保持完整，箭头仍锚定原价格和交易日。移出视口的点位不绘制。对照样本继续验证箭头尺寸、买卖方向及颜色。
- 390 宽长比赛名原先把标的弹窗内的图表撑宽，已将交易点位区域的网格限制在可用宽度。受控 50 笔样本通过两方向箭头、长名称、窄屏视口、弹层内滚动、零笔日期及查看全部。组件回归覆盖重复日期、精度、退出弹层及清除筛选。
- 当前应用用 Playwright Chromium 通过四宽的[招商银行真实回放](2026-11-09-cmb-historical-arena-replay.md#2026-11-22-实际浏览器验收)。主仓根目录执行 `node .recovery-artifacts/arena-closeout-20261122/desktop.mjs` 退出 0。回执及截图位于同目录的 `cmb-final-verified.log`、`cmb-*-detail.png`、`cmb-*-hover.png`、`cmb-*-round.png` 和 `controlled-390-long-list.png`。最终四文件定向 29 项、修改文件 ESLint、Desktop 类型／构建及仓库边界与依赖门禁通过。C3 完成。
