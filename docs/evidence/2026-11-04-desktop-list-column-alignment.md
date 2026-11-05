# 桌面列表列对齐排查与验证

日期：2026-11-04。范围为桌面 Web 源码与本地生产构建预览。

## 规则与根因

文字、日期、版本、来源和状态左对齐，独立数字列右对齐，操作列与内部按钮组右对齐。占位内容沿用列方向。

原生表格的 `th`、`td` 曾默认右对齐，但块级 flex 状态组从左侧开始排列；共享 Table 的表头默认靠左，内容继承原生右对齐。另有提供方表头居中而内容靠左、账户操作组居中等问题。本次统一默认值，逐列补齐数字声明，并修正按钮组。实验候选比较中的基线收益曾误用固定操作单元格，现收益回到普通数字列，真正的操作固定在末列。

## 完整盘点

AST 盘点共 25 个表格相关文件、33 处 `table`/`Table` 声明，其中共享容器 1 处、业务声明 32 处。复用的详情容器、动态列和抽取行继续向消费端展开核对；以下覆盖全部声明。

路径均相对 `apps/desktop/src/`。

| 文件 | 检查结论 |
| --- | --- |
| `components/ui/table.tsx` | 共享表头和内容均默认左对齐，显式数字类可以同时覆盖。 |
| `features/account-data/AccountDataSections.tsx` | 事实、时间、来源、状态靠左，金额/数量靠右；抽取的 TransactionRow 操作组靠右。 |
| `features/ai/AiRunList.tsx` | 问题、对象、来源、状态、时间均左对齐；操作右对齐；响应式隐藏列的头身条件一致。 |
| `features/journal/review/JournalCandidateBrowser.tsx` | 标的、状态、资格靠左，选择操作靠右。 |
| `features/journal/review/JournalMetricTable.tsx` | 指标与说明靠左，值靠右。 |
| `features/journal/review/JournalSourceFacts.tsx` | 两张事实表时间靠左，数量、价格、费用与净收益靠右；计划卡片保持原样。 |
| `features/market-data/MarketReferenceResult.tsx` | 动态列按同一 format 定义，数字头身靠右，文本与日期靠左；缺失值保持列方向。 |
| `features/market-data/SecurityStaticInfoPanel.tsx` | 无表头的属性/值表默认靠左，不把混合属性值强制当作数字列。 |
| `features/performance/PerformanceSections.tsx` | 配置类别靠左，金额与权重靠右，权重条和编辑输入本身靠右，调整列靠右。存量大文件仍为 929 行。 |
| `features/performance/PerformanceTrendSection.tsx` | 时间、口径、覆盖说明、质量靠左，资产总值靠右。 |
| `features/portfolio/PortfolioOverview.tsx` | 标的、账户、状态靠左，数量/价格/市值/收益靠右；排序按钮与数字表头同向。 |
| `features/portfolio/PortfolioPositionObservation.tsx` | 标的、类型、来源、状态靠左，市值与盈亏靠右，纵向操作组靠右。 |
| `features/portfolio/PortfolioTradeDetailSections.tsx` | 三个详情分支：建仓明细、基线批次、退出明细的数字头身靠右；日期、币种、批次标识与范围靠左，退出操作靠右。 |
| `features/portfolio/PortfolioTradeView.tsx` | 截图中的状态表头和标签组均靠左，数量与净实现盈亏靠右，操作靠右。 |
| `features/providers/ProviderSettingsSections.tsx` | 提供方、自动化、健康历史、复用历史表逐项核对；文字与状态靠左，优先级、延迟靠右，输入本身及操作靠右。 |
| `features/risk/RiskSections.tsx` | 事件、级别、模式、版本、时间、通知状态靠左，尝试次数靠右。抽取 RiskEventRows 同步核对。 |
| `features/strategy/NavBacktestJobs.tsx` | 基金、状态组、区间及时间靠左，操作靠右。 |
| `features/strategy/NavBacktestResult.tsx` | 权益表与申赎表：金额/净值/数量/费用靠右，时间/状态/说明靠左。 |
| `features/strategy/StrategyBacktestDetailSections.tsx` | 四个复用明细表通过同一 numericColumns 声明驱动头身；数量、价格靠右，其他靠左。 |
| `features/strategy/StrategyBacktestEquityDetails.tsx` | 时间靠左，权益、现金、市值、回撤靠右；保留原成对声明。 |
| `features/strategy/StrategyBacktestJobsPage.tsx` | 任务、区间、状态进度、结果摘要靠左，静态窄操作列靠右；分组行一致。 |
| `features/strategy/StrategyExperimentDetailPage.tsx` | 候选、变更、资格靠左，收益、回撤、笔数靠右；基线与候选操作均固定在末列，操作组靠右。 |
| `features/strategy/StrategyExperimentListPage.tsx` | 名称、状态、进展、时间靠左，操作靠右；编辑状态不改变列方向。 |
| `features/strategy/StrategyLibraryPages.tsx` | 策略库与版本记录均文字/时间靠左，静态窄操作列靠右。 |
| `features/strategy/StrategySections.tsx` | 原策略表和任务表的文字、版本、状态、进度、时间靠左，操作组靠右。 |

另外核对 `StickyTableActions.tsx` 默认值、`StrategyExperimentDetailSections.tsx` 的链接组组合能力及各列表空态。未发现其他 `role="table"`/`role="grid"` 实现；无表头的卡片列表不改变展示结构。

## 自动化验证

- 首轮 7 个定向测试文件 58/58 通过，覆盖组合、交易、共享固定列、提供方、收益、复盘与净值回测。
- 扩展样本采集测试首轮 119/120，通过更新账户操作组由居中改为靠右的旧断言后，相关 4 文件 28/28 通过。动态市场列回归 1/1 通过。版本时间列的旧右对齐断言同步改为与表头一致的左对齐。
- 最终命令：`NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --reporter=json --outputFile=/tmp/list-alignment-full-final.json`，工作目录 `apps/desktop`。结果 **1181/1182**，本次相关用例通过。
- 剩余失败是既有 `test/ui-contract.test.tsx` 的日期控件统一检查：`MarketReferenceSheet.tsx` 的 `reference-start`、`reference-end` 仍使用原生日期 Input。本次未改动该文件，不声称全量测试通过。上次刷新任务中不稳定的研究回显用例在本次全量运行通过。
- `pnpm build`（`apps/desktop`）通过 TypeScript 和 Vite 构建。构建遇到行情历史分页锚点的 unknown 类型，增加字符串检查后通过；相关行情测试亦包含在全量运行中，不改变有效字符串锚点行为。
- 修改文件的 ESLint、`pnpm exec node scripts/check-boundaries.mjs` 与定向 `git diff --check` 通过。

## 真实浏览器验证

使用 Chrome、当前生产构建 CSS 和本地 `vite preview`，桌面宽度 1440px、窄屏宽度 390px。验证不仅比较 `text-align`，还比较表头/内容列边界、对应侧内边距，以及块级 flex 组中子内容的实际边缘。

- 42 组真实组件测试样本中的 47 张表格，共 55 行可比较内容：方向、列边界、内边距、内部 flex 对齐问题均为 0。覆盖有值、缺失值、空态、错误态、可编辑数字与多行操作。
- 补充市场资料动态列真实组件样本，验证日期、收益率和 null 占位同列对齐，宽窄屏与滚动后问题均为 0。样本仅在浏览器文档中渲染，没有写入业务数据。
- 实际页面覆盖组合概览、交易、账户、收益、风险、策略库、回测任务、实验、复盘、研究、数据与自动化、市场，共 12 个页面/页签状态。宽窄屏与横向滚动后均无列对齐问题，页面水平溢出为 0，控制台错误为 0。没有数据的默认页由实际组件样本补充，不能把空表当作有数据验收。
- 实际详情补充：交易建仓/退出明细各 1 行；回测已平仓交易 7 行、成交 14 行（委托与拒单为空态）；实验比较基线与候选共 2 行；账户事件 1 行。三种视口/滚动状态均无对齐问题。
- 没有现成数据的基线批次等分支以源码成对声明及类型/测试核对，不宣称已有真实业务行；策略列表可能出现已有读取错误提示，不影响当前可见比较数据的布局检查，不据此声明后端或来源健康。

一次性浏览器与测试原始记录位于 `/tmp/list-alignment-browser/`、`/tmp/list-alignment-*.json`；截图已人工查看交易、提供方、实验候选及窄屏交易。临时测试采集文件已移除。

本次未执行业务保存、回测运行、研究生成、通知或来源配置变更；未更新 Docker、安装包或镜像，未提交或推送。
