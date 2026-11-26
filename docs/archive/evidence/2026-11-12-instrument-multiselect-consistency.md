# 标的多选入口排查与验收记录

## 范围与结论

本轮检查 Desktop/Mobile 全部标的选择组件的消费者，以及标的集合、标的池、目录搜索和集合编辑字段。确认真正的标的多选集合编辑入口共四处，均已统一为输入框内标签回显。

| 端与入口 | 组件与处理 |
| --- | --- |
| Desktop 自主比赛创建 | `ArenaLiveSetup` 使用既有 `InstrumentMultiSelect` / `ComboboxChips` |
| Desktop 日频比赛创建 | `ArenaSetup` 使用同一多选组件 |
| Mobile 自主比赛创建 | `ArenaLiveSetupScreen` 使用 `InstrumentPicker.selection` 和共享 `MultiSelectField` |
| Mobile 日频比赛创建 | `ArenaSetupScreen` 使用相同多选契约，包含分组名称回显 |

研究、策略执行、策略起草确认、复盘筛选、行情、定投、持仓和交易表单为单标的输入；选择后的值须继续作为该表单的唯一标的。自选添加选择一项即提交并关闭，属于逐条入库。导入行的批量勾选选择的是待处理记录；只读标的集合没有输入行为。模型、来源与指标多选不属于标的多选。这些入口均保留现有业务语义。

## 实现与边界

Mobile 继续使用原目录查询和竞态处理，新增可选多选契约及原生 `MultiSelectField`。名称与完整市场代码来自本次目录结果或既有自选分组，不为补名增加请求。成功添加清空搜索并保持焦点，拒绝添加时保留文字和集合；已选结果显示取消选择，支持标签移除。原标的数量、启用状态、类型、市场和草稿数据仍由原流程约束。

原生组件未配置 Tailwind/className，使用与现有原生字段一致的 `StyleSheet`、字号、间距和主题色；输入的边界及整体聚焦反馈属于交互语义。未新增普通内容分区描边。Android/iOS 依赖、工程和构建配置均未变更。

`scripts/check-boundaries.mjs` 补充 Desktop 多选组件的目录所有权，以及 Mobile 目录组件不得反向依赖竞技场消费者的约束。

## 验证结果

| 检查 | 输入范围与结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/mobile exec vitest run test/parity/instrument-multiselect.test.tsx test/parity/instrument-picker.test.tsx test/parity/watchlist.test.tsx test/parity/instrument-confirmation-state.test.tsx` | 4 个文件、14 项通过；覆盖连续添加、框内回显、焦点、已选取消、业务拒绝、目录失败重试、单选与持仓确认隔离 |
| `pnpm --filter @thesis-ledger/mobile exec vitest run --dir test/parity` | 受共享测试宿主影响的 49 个文件、187 项通过 |
| `pnpm --filter @thesis-ledger/mobile typecheck` | 最终源码通过 |
| 定向 `pnpm exec eslint --format json` | 本轮 7 个 Mobile 源码和测试文件：0 错误、0 警告；默认文本格式额外输出上游 React Native Flow 解析诊断，退出码仍为 0 |
| `node scripts/check-boundaries.mjs` | 通过 |
| `PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright node scripts/local-runtime/browser/instruments/instrument-multiselect-mobile.regression.mjs` | 两处 Mobile 实际组件，各在 1440、1024、768、390 宽度通过；连续添加、长名称换行、焦点、已选搜索/取消、再次选择、移除、分组导入及切换市场清空通过；无页面错误、无业务写请求、无页面横向溢出 |
| Desktop 既有证据复用 | 本会话 `arena-live-browser.mjs` 已通过四档宽度的框内回显、连续选择、已选搜索、取消/恢复和移除；Desktop 组件及两处消费者本轮未改，无需重跑 |
| 差异检查 | 本轮文件 `git diff --check` 通过 |

浏览器宿主从 `apps/desktop` 运行 `pnpm exec vite --config test/arena-live.vite.config.mjs --host 127.0.0.1`，使用 5188 端口；仅本轮启动的宿主在验收后关闭。截图位于 `/tmp/instrument-multiselect-mobile-qa/`。

## 过程与证据限制

最初定向测试暴露测试宿主缺少原生组件映射，已按现有做法接入 `react-native-web`；新增测试也改为为每个请求生成独立 Response，修复重复消费响应体。类型检查发现可选布尔属性显式传入 undefined，已规范为 Boolean。浏览器检查发现内部输入存在额外的默认聚焦轮廓，已将聚焦反馈统一到外层输入边界后重新验收。

本轮 Mobile 浏览器运行实际 React Native 组件的 Web 渲染，接口为受控 GET 样本；不是原生设备实测或原生编译证据。未更改原生依赖和构建配置，未启动原生编译。未调用真实 Provider、未创建比赛或持仓、未更新 Docker，未创建 Git 提交。

## 最终一致性结论

AC01–AC05 在本轮声明的客户端与浏览器验收范围内通过。两端共有四处多选入口；保留入口、跨端实现、目录所有权、失败语义和受控证据范围一致，无当前范围未完成事项。

[规格](../../specs/2026-11-12-instrument-multiselect-consistency.md) · [归档任务](../tasks/2026-11-12-instrument-multiselect-consistency.md)
