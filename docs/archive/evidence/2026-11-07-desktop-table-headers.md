# Desktop 列表表头统一验收

日期：2026-11-07。对应[现行规格](../../specs/2026-11-07-desktop-table-headers.md)与[完成任务](../tasks/2026-11-07-desktop-table-headers.md)。

## 结果与范围

AC1～AC4 通过。Desktop 全部源码核对发现 24 个业务组件文件、34 处表头声明，均已使用共享 `TableHeader`／`TableHead`；原本已使用共享组件的消费者直接继承统一值。固定操作列表头也复用 `TableHead`。排序按钮保留当前列强调与排序方向，数值对齐、列宽和响应式隐藏保持原语义。

新增 AST 契约扫描整个 Desktop `src`，共享表格组件之外不得自行声明原生 `thead`／`th`，消费者不得重复指定表头背景、内边距、字号和字重。全源码补充搜索未发现独立 `role="table"`／`role="columnheader"` 实现。Mobile 未使用 HTML 表头；`SecurityStaticInfoPanel` 属于无列标题的键值资料，不增加表头。卡片、分区标题和空状态不强制转换为列标题。

## 全量源码清单

| 组件 | 表头声明数 |
| --- | ---: |
| [RuleSourceMonitorPanel.tsx](../../../apps/desktop/src/features/market-data/RuleSourceMonitorPanel.tsx) | 1 |
| [MarketReferenceResult.tsx](../../../apps/desktop/src/features/market-data/MarketReferenceResult.tsx) | 1 |
| [ProviderSettingsSections.tsx](../../../apps/desktop/src/features/providers/ProviderSettingsSections.tsx) | 4 |
| [AiRunList.tsx](../../../apps/desktop/src/features/ai/AiRunList.tsx) | 1 |
| [ArenaPage.tsx](../../../apps/desktop/src/features/model-arena/ArenaPage.tsx) | 1 |
| [PortfolioOverview.tsx](../../../apps/desktop/src/features/portfolio/PortfolioOverview.tsx) | 1 |
| [PortfolioTradeDetailSections.tsx](../../../apps/desktop/src/features/portfolio/PortfolioTradeDetailSections.tsx) | 3 |
| [PortfolioPositionObservation.tsx](../../../apps/desktop/src/features/portfolio/PortfolioPositionObservation.tsx) | 1 |
| [PortfolioTradeView.tsx](../../../apps/desktop/src/features/portfolio/PortfolioTradeView.tsx) | 1 |
| [PerformanceSections.tsx](../../../apps/desktop/src/features/performance/PerformanceSections.tsx) | 1 |
| [AccountDataSections.tsx](../../../apps/desktop/src/features/account-data/AccountDataSections.tsx) | 1 |
| [RiskSections.tsx](../../../apps/desktop/src/features/risk/RiskSections.tsx) | 2 |
| [WatchlistTable.tsx](../../../apps/desktop/src/features/watchlist/WatchlistTable.tsx) | 1 |
| [StrategyBacktestJobsPage.tsx](../../../apps/desktop/src/features/strategy/StrategyBacktestJobsPage.tsx) | 1 |
| [StrategyBacktestDetailSections.tsx](../../../apps/desktop/src/features/strategy/StrategyBacktestDetailSections.tsx) | 1 |
| [NavBacktestJobs.tsx](../../../apps/desktop/src/features/strategy/NavBacktestJobs.tsx) | 1 |
| [StrategyExperimentDetailPage.tsx](../../../apps/desktop/src/features/strategy/StrategyExperimentDetailPage.tsx) | 1 |
| [StrategyLibraryPages.tsx](../../../apps/desktop/src/features/strategy/StrategyLibraryPages.tsx) | 2 |
| [NavBacktestResult.tsx](../../../apps/desktop/src/features/strategy/NavBacktestResult.tsx) | 2 |
| [StrategyExperimentListPage.tsx](../../../apps/desktop/src/features/strategy/StrategyExperimentListPage.tsx) | 1 |
| [StrategySections.tsx](../../../apps/desktop/src/features/strategy/StrategySections.tsx) | 2 |
| [JournalMetricTable.tsx](../../../apps/desktop/src/features/journal/review/JournalMetricTable.tsx) | 1 |
| [JournalSourceFacts.tsx](../../../apps/desktop/src/features/journal/review/JournalSourceFacts.tsx) | 2 |
| [JournalCandidateBrowser.tsx](../../../apps/desktop/src/features/journal/review/JournalCandidateBrowser.tsx) | 1 |

合计 34 处。这里只统计声明位置，实际运行时的行数和展开状态不影响计数。

## 验证

- `pnpm --filter @thesis-ledger/desktop test`：259 个文件、1652 项全部通过（15:03 执行，日志 `/tmp/table-header-desktop-tests.log`）。后续只增加受控浏览器入口、整理检查脚本及扩大 AST 扫描范围；最终 AST 定向测试重新通过，未继续修改生产组件。
- `pnpm --filter @thesis-ledger/desktop build`：类型检查及生产构建退出 0；保留既有大资源分包提示，日志 `/tmp/table-header-build.log`。
- 修改的生产组件和契约测试 ESLint 通过；新增受控入口及最终 AST 测试 ESLint 通过。日志 `/tmp/table-header-lint.log`、`/tmp/table-header-final-lint.log`。
- `pnpm exec node scripts/check-boundaries.mjs`：`Import boundaries: OK`。`git diff --check` 通过。
- 最终 AST 定向测试：`pnpm --filter @thesis-ledger/desktop exec vitest run test/table-headers.contract.test.tsx` 通过，日志 `/tmp/table-header-final-contract.log`。

## 浏览器与数据边界

本机 Edge、开发服务器 `http://127.0.0.1:5173`，宽度 1440／1024／768／390，浅色及深色各覆盖一次。共 80 组：9 个真实页面入口 × 四宽 × 双主题 = 72 个页面状态；共享表格、固定操作列和复盘指标抽屉受控入口共 8 组。未把所有 34 处声明都称为真实有数据页面验收。

真实页面入口为收益分析的当前持仓、账户持仓快照、账户成交记录、Provider、策略库、AI 实验、风险事件、通知、自选。为保持各宽度使用相同事实，API 每个请求键首次只读获取，后续导航复用本次取得的响应快照；共 33 个首次请求，均无失败状态。允许自选报价的只读 `POST /watchlist/prices`，其余非 GET 业务动作全部拦截；最终没有被尝试的业务写请求，没有页面脚本异常。未执行模型、回测、通知或 Provider 配置动作。

真实空的回测任务入口另行核对，维持原空状态。窄屏自选保留隐藏表头及卡片语义；策略列表保留既有列隐藏断点。实际可见的表头均检查字号、字重、背景、文字颜色、内边距与高度；页面横向溢出为 0。持仓排序三次切换验证 `aria-sort`；受控列表横向滚动后操作列表头位置偏移小于 1px，背景与普通表头一致、左分隔线为 1px，选择操作仍有效。详情抽屉使用实际 `JournalMetricTable`，检查同一表头合同、弹层边界、Escape 关闭及焦点返回。

| 主题 | 背景 | 文字颜色 | 字号／字重 | 内边距／高度 |
| --- | --- | --- | --- | --- |
| 浅色 | `rgb(247, 247, 248)` | `rgb(111, 116, 128)` | 12px／500 | 8px 12px／40px |
| 深色 | `rgb(20, 24, 28)` | `rgb(138, 149, 162)` | 12px／500 | 8px 12px／40px |

截图中的当前持仓与账户持仓快照已逐项实测一致。人工查看 1440 浅色持仓、1024 深色快照与 390 详情抽屉，边界和文字正常。原始矩阵与 24 张截图位于本机临时目录 `/tmp/desktop-table-headers-qa/`（`matrix.json`、`light-1440-holdings.png` 等）；临时文件不作为仓库长期事实源，源码清单、断言与复现脚本保存在仓库。

复现入口为 `apps/desktop/scripts/check-table-headers.cjs` 和 `apps/desktop/test/browser-table-headers.html`。脚本接受 `PLAYWRIGHT_MODULE`、`BROWSER_EXECUTABLE`、`TABLE_QA_URL`、`TABLE_QA_OUTPUT`；本次使用本机已安装的 Playwright 与 Edge，未新增依赖。初轮脚本的焦点检查方法、持续事件流等待方式不适用，修正后执行完整矩阵；中间失败不计为验收通过。

## 最终一致性审查

通过。任务、规格、源码、指南与证据的范围一致；全部验收断言有对应结果。生产组件变更仅涉及表头和排序标题样式，原有工作区变更保留。未更新 Docker 运行态、提交或发布；本次界面范围无数据库、Server 或原生编译门禁。
