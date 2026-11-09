# 行情日期区间验收记录

日期：2026-11-08；对应[现行规格](../../specs/2026-11-08-chart-date-ranges.md)与[归档任务](../tasks/2026-11-08-chart-date-ranges.md)。

## 实现范围

基金净值和股票、ETF 行情图统一提供今日、一周、一月、半年、一年、三年、自定义区间，默认一月。起止日期使用公共 `DateInput`，包含首尾日期，校验日期顺序及未来日期，取消保留已应用范围。分钟点按市场日期筛选，基金今日保留盘中估值路径。

基金复用现有历史接口，通过共享 API 客户端和 TanStack Query 按需读取，最长请求上限三千六百五十条；覆盖所选范围的近期缓存可复用。净值按日期合并，较新抓取值优先，未改写账本、原始净值或冻结记录。K 线沿用历史窗口和三千根上限，按起始日期及周期估算所需条数。

读取失败、空区间、覆盖不足分别反馈。读取期间保留原曲线，区间成功扩充后重新应用视口。基金继续保留累计盈亏的共享时间轴。窄屏通过图表柱间距配置显示完整长区间，保持原行情周期。

## 定向与包级验证

| 检查 | 输入与结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/api-client build` | 新历史读取方法及公共类型编译通过 |
| API 客户端 `pnpm exec vitest run test/fund-valuation.test.ts` | 4 项通过；覆盖完整代码、响应身份、日期、条数及取消信号 |
| Desktop `pnpm exec vitest run src/features/market-detail` | 42 个文件、189 项通过；包含日期日历、月份边界、美国跨 UTC 日期、偏好迁移、历史扩窗、账户隔离、基金与盘中图回归；既有测试夹具有非阻断的 `act` 提示 |
| Desktop `pnpm build` | 最终代码类型检查与 Vite 构建通过；保留现有大包体提示，未提高门槛 |
| `node scripts/check-boundaries.mjs` | 通过；自定义日期消费公共 `DateInput` |
| `pnpm guardrails:complexity` | 8 组、3303 个文件 lint 通过，文件尺寸门禁通过；脚本报告六项写集外的历史大文件警告，并提示这些历史项没有有效基线，不能据此证明其规模回退 |
| `git diff --check` | 通过 |

## 受控实际浏览器

环境：本机 Vite `http://localhost:5173`，Microsoft Edge，Playwright 1.65.0，Node 26.13.0。测试夹具与生产组件使用同一实现，所有受控 API 请求均为读取。

- `apps/desktop/scripts/check-chart-date-ranges.cjs`：1440、1024、768、390 全部通过。两类图表的七个选项、三年补读、自定义日期顺序与未来日期校验、取消、日历弹层边界、全屏 Esc 层级、今日切换、原画布保留及页面无横向溢出均有断言。1440 额外验证空区间仅展示一次，以及失败、保留数据和显式重试。
- `apps/desktop/scripts/check-fund-nav-trades.cjs`：四个宽度全部通过。验证买卖标记真实绘制、鼠标点击、键盘展开、精确成交详情、嵌套关闭、刷新失败恢复、账户及实际/模拟模式隔离。
- 输出位于 `/tmp/codex-market-range-qa/date-ranges/` 与 `/tmp/codex-market-range-qa/date-ranges-trades/`。截图、浏览器结果和构建日志属于本地验证产物，不纳入 Git。

执行入口如下；浏览器运行库由本地临时目录提供，未修改项目依赖或锁文件：

```sh
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright CHART_RANGE_CHROMIUM_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' CHART_RANGE_QA_OUTPUT=/tmp/codex-market-range-qa/date-ranges /Users/yzin/.volta/tools/image/node/26.13.0/bin/node apps/desktop/scripts/check-chart-date-ranges.cjs
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright FUND_NAV_TRADES_CHROMIUM_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' FUND_NAV_TRADES_QA_OUTPUT=/tmp/codex-market-range-qa/date-ranges-trades /Users/yzin/.volta/tools/image/node/26.13.0/bin/node apps/desktop/scripts/check-fund-nav-trades.cjs
```

## 真实页面与来源边界

从收益分析的组合概览打开真实持仓基金华夏成长混合 `000001.OF`，七个区间选项正常显示。选择三年后，既有基金历史接口返回 HTTP 200，共 730 条净值，首日为 2023-11-06，末日为 2026-11-06，图中成交标记及持仓上下文保留。真实页面只读取数据，未提交交易、更正或账户修改。

此证据证明该基金的三年实际读取，以及受控的长历史和异常路径；不外推为所有市场、所有来源和所有自定义日期均有完整历史。来源不提供的区间继续明确提示。未更新 Docker 镜像或发布，验收对象为当前源码与本机开发页面。

## 最终一致性核对

AC1–AC4 全部通过。共享日期合同、偏好迁移、两种消费图表、读取上限、错误与空状态、文档状态及验证边界一致。保留工作区既有修改，没有新增待办、数据库结构变更或受保护数据写入；本轮未提交 Git。

## 同日工具栏统一

基金净值与股票、ETF 行情复用相同的区间、视图分组与视图操作组件。“回到最新”在前、“重置”在后，统一按钮边框、尺寸及组内间距；今日估值入口的区间下拉框也复用同一区间分组。保留各图原有重置及回到最新逻辑。

最终验证：净值图与工具栏定向测试九项、Desktop `tsc -b`、变更文件 ESLint 及 `git diff --check` 通过。实际浏览器覆盖 1440、1024、768、390，断言基金与 K 线按钮计算样式相同、顺序一致；切至一周后“回到最新”保留一周，“重置”恢复一月，无横向溢出或浏览器错误。已目视核对窄屏分组换行，截图与结果位于 `/tmp/codex-market-range-qa/chart-toolbar-unified/`。仅本机开发页面与受控样本，未部署或改写真实数据。
