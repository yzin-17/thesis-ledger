# Drawer 可见性验收记录

## 当前结论

Desktop 全部 36 个文件、39 个 SheetContent 调用已逐一挂载实际业务组件验收。61 个代表场景 × 5 种视口组合，共 **305 组通过、0 失败**；包含 **2920 次实际键盘聚焦**，按实际计算出的 3px/4px 外环检查裁切边界。这里只声明列出的受控状态，不扩大到所有业务条件和真实提交链。

视口：1440 / 1024 / 768 / 390 宽 × 560 高，以及 1440 × 900。另检查真实自选页的 1440 / 1024 / 768 / 390 × 900，验证共享 Tabs 的下划线、键盘切换和页面宽度。

## 复现与修复

用户原始附件在本执行线程未返回可查看像素；父线程已核实箭头指向“新建基金定投”的焦点环裁切。首轮用实际业务组件回放旧滚动样式，输入框到左右裁切边界均为 0px；修复后为 4px。已查看桌面和窄屏实际截图。

本轮修复均使用既有组件与原子类，未修改请求、业务校验、原始数值或提交精度：

1. 两个基金定投侧栏、研究详情、策略编辑状态、策略风险应用，共 5 个缺少留白的正文容器复用已有 SheetBody。
2. 共享 SheetBody 与既有手工留白正文补齐 8px scroll-padding；整体滚动侧栏增加视口高度约束、默认滚动与滚动安全距离。
3. 账户管理列表、截图导入嵌套滚动区补齐四周 4px 留白。严格按 4px 按钮焦点环检查时，这两个入口原来均在滚动边缘裁切。
4. 共享横向 TabsList 的滚动视口增加 4px 留白，并用负外边距及对应高度补偿，维持原控件高度和有效分组间距。已核对 19 个包含 TabsList 的 feature 文件；Drawer 中 AI 提供方和策略编辑的页签原来会裁掉上下及首项左侧外环。真实自选页四种宽度复验通过。
5. 策略编辑的长保存错误移入正文滚动区。原来在 390 × 560 下错误说明固定占位，把正文挤到只剩约 49px；现在错误、表单和 JSON 均可滚动查看，底部操作保持可达。

## 全部业务调用覆盖

下表均已进行实际组件浏览器验收，不再只依赖源码检查。单个调用的代表条件列于最后一栏。

| 文件                                                                                                                                  | 调用数 | 实际覆盖                           |
| ------------------------------------------------------------------------------------------------------------------------------------- | -----: | ---------------------------------- |
| [AccountDataAuditSheets.tsx](../../../apps/desktop/src/features/account-data/AccountDataAuditSheets.tsx)                                 |      2 | 修正链成功/失败、作废、恢复        |
| [AccountDataCashDepositSheet.tsx](../../../apps/desktop/src/features/account-data/AccountDataCashDepositSheet.tsx)                       |      1 | 现金入账                           |
| [AccountDataCashObservationSheet.tsx](../../../apps/desktop/src/features/account-data/AccountDataCashObservationSheet.tsx)               |      1 | 现金快照及受控 503 后输入保留      |
| [AccountDataCashTransferCorrectionSheet.tsx](../../../apps/desktop/src/features/account-data/AccountDataCashTransferCorrectionSheet.tsx) |      1 | 划转更正、作废、恢复               |
| [AccountDataCashTransferSheet.tsx](../../../apps/desktop/src/features/account-data/AccountDataCashTransferSheet.tsx)                     |      1 | 现金划转                           |
| [AccountDataExecutionSheet.tsx](../../../apps/desktop/src/features/account-data/AccountDataExecutionSheet.tsx)                           |      1 | 新建、更正成交及新增费用           |
| [AccountDataPage.tsx](../../../apps/desktop/src/features/account-data/AccountDataPage.tsx)                                               |      1 | 管理账户长列表、内联创建账户       |
| [AccountDataReconciliationSheet.tsx](../../../apps/desktop/src/features/account-data/AccountDataReconciliationSheet.tsx)                 |      1 | 候选选择与确认原因                 |
| [AccountDataRecurringCashDeposits.tsx](../../../apps/desktop/src/features/account-data/AccountDataRecurringCashDeposits.tsx)             |      2 | 创建、编辑计划；确认、跳过到期实例 |
| [AccountDataRecurringFundInvestments.tsx](../../../apps/desktop/src/features/account-data/AccountDataRecurringFundInvestments.tsx)       |      2 | 创建、编辑计划；确认、跳过到期实例 |
| [AiResearchDetailView.tsx](../../../apps/desktop/src/features/ai/AiResearchDetailView.tsx)                                               |      1 | 读取失败、长报告及展开运行详情     |
| [EvidenceChainSheet.tsx](../../../apps/desktop/src/features/ai/EvidenceChainSheet.tsx)                                                   |      1 | 长来源链与 Tool 审计失败           |
| [NewResearchSheet.tsx](../../../apps/desktop/src/features/ai/NewResearchSheet.tsx)                                                       |      1 | 新建研究长问题及能力读取失败       |
| [ResearchSubmissionSheet.tsx](../../../apps/desktop/src/features/ai/ResearchSubmissionSheet.tsx)                                         |      1 | 提交面板及能力读取失败             |
| [ImportDraftReviewSheet.tsx](../../../apps/desktop/src/features/import/ImportDraftReviewSheet.tsx)                                       |      1 | 读取失败、12 行高精度草稿审核      |
| [ImportReview.tsx](../../../apps/desktop/src/features/import/ImportReview.tsx)                                                           |      1 | 截图导入、历史读取失败             |
| [AdvancedJsonSheet.tsx](../../../apps/desktop/src/features/journal/AdvancedJsonSheet.tsx)                                                |      1 | 高级 JSON 编辑                     |
| [EvidenceEditorSheet.tsx](../../../apps/desktop/src/features/journal/EvidenceEditorSheet.tsx)                                            |      1 | 补充复盘证据                       |
| [JournalReviewResults.tsx](../../../apps/desktop/src/features/journal/JournalReviewResults.tsx)                                          |      1 | 80 项原始证据                      |
| [JournalDraftSheet.tsx](../../../apps/desktop/src/features/journal/review/JournalDraftSheet.tsx)                                         |      1 | 本次分析草稿                       |
| [JournalLegacyJsonReview.tsx](../../../apps/desktop/src/features/journal/review/JournalLegacyJsonReview.tsx)                             |      1 | 旧 JSON 兼容分析                   |
| [LocalHistoryDocumentsSheet.tsx](../../../apps/desktop/src/features/market-data/LocalHistoryDocumentsSheet.tsx)                          |      1 | 资料列表及搜索                     |
| [MarketNewsSheet.tsx](../../../apps/desktop/src/features/market-data/MarketNewsSheet.tsx)                                                |      1 | 新闻搜索                           |
| [MarketReferenceSheet.tsx](../../../apps/desktop/src/features/market-data/MarketReferenceSheet.tsx)                                      |      1 | 市场资料类型、标的和日期控件       |
| [ProviderCredentialsSheet.tsx](../../../apps/desktop/src/features/market-data/ProviderCredentialsSheet.tsx)                              |      1 | 凭据字段及操作区                   |
| [ProviderExactChecksSheet.tsx](../../../apps/desktop/src/features/market-data/ProviderExactChecksSheet.tsx)                              |      1 | 来源读取检查及不可用状态           |
| [MarketDetailReading.tsx](../../../apps/desktop/src/features/market-detail/MarketDetailReading.tsx)                                      |      1 | 底部相关资讯面板                   |
| [PortfolioAccountManagement.tsx](../../../apps/desktop/src/features/portfolio/PortfolioAccountManagement.tsx)                            |      1 | 创建、编辑账户；账户管理长列表     |
| [PortfolioManagementSections.tsx](../../../apps/desktop/src/features/portfolio/PortfolioManagementSections.tsx)                          |      1 | 创建、编辑持仓；现金余额分支       |
| [PortfolioTradeOpeningBoundarySheet.tsx](../../../apps/desktop/src/features/portfolio/PortfolioTradeOpeningBoundarySheet.tsx)            |      1 | 建仓时间、补录依据及操作区         |
| [AutomationEditorSheet.tsx](../../../apps/desktop/src/features/providers/AutomationEditorSheet.tsx)                                      |      1 | 类型、定时与启用设置               |
| [ProviderEditorSheet.tsx](../../../apps/desktop/src/features/providers/ProviderEditorSheet.tsx)                                          |      1 | AI 多模型、通知提供方              |
| [RiskRuleEditorSheet.tsx](../../../apps/desktop/src/features/risk/RiskRuleEditorSheet.tsx)                                               |      1 | 创建、编辑风险规则                 |
| [StrategyEditorPage.tsx](../../../apps/desktop/src/features/strategy/StrategyEditorPage.tsx)                                             |      1 | 加载、版本缺失状态                 |
| [StrategyEditorSheet.tsx](../../../apps/desktop/src/features/strategy/StrategyEditorSheet.tsx)                                           |      1 | 常用配置、超高 JSON、长保存错误    |
| [StrategyRiskApplicationPage.tsx](../../../apps/desktop/src/features/strategy/StrategyRiskApplicationPage.tsx)                           |      1 | 来源版本、读取失败、预览入口       |

另以共享组件挂载 20 项长表单，覆盖独立正文滚动、整体滚动、底部面板，以及长错误和 invalid 外环。

## 检查方法与数据边界

- 逐项用键盘和程序聚焦可见输入、按钮、链接、选择器及开关。排除隐藏提交 input、不可聚焦容器和 disabled 控件；记录 activeElement、focus-visible、实际 box-shadow 半径。
- 找到实际承载外环的输入组合或按钮，再沿 overflow 祖先检查四向边界。body 的滚动锁布局盒不作为裁切视口，实际 popup 视口另行检查。未以“没有横向溢出”替代焦点环或碰撞证据。
- 独立滚动正文与同层底栏检查 bottom/top 不相交；实际末项、取消及关闭均可到达。正文滚入时检查外环安全距离。
- 高于视口的 JSON/文本编辑框不要求一次全部显示；5 组超高编辑框分别量取顶部、底部可达性，并始终检查左右外环。
- 现金快照提交请求被浏览器拦截为 503，验证报错后原金额保留；导入、凭据、研究和策略测试均未向真实服务提交。305 组中共拦截 119 次 API 请求（109 GET、10 POST），POST 为 5 次合成账户现金快照和 5 次新闻读取，没有真实数据写入。
- 两个最终矩阵使用独立浏览器上下文。生产源码在验收前后 SHA-256 摘要一致；摘要位于 `/tmp/drawer-inputs-before.json`、`/tmp/drawer-inputs-after.json`。矩阵结束后仅对 Sheet/Tabs 做 Prettier 换行整理；编译后的 JavaScript token 序列完全一致，并补跑 5 项契约/样式检查通过，日志 `/tmp/drawer-final-contract.log`。

## 可重复运行

入口：[check-all-drawers.cjs](../../../apps/desktop/scripts/check-all-drawers.cjs)。测试页面：[browser-drawer-visibility.html](../../../apps/desktop/test/browser-drawer-visibility.html)，固定输入按账户、内容、配置分组，位于同目录 `browser-drawer-*-cases.tsx` 与 `browser-drawer-samples.ts`。使用项目已有本地 Vite 服务，运行器拦截全部 `/api/` 请求。

```sh
PLAYWRIGHT_MODULE=/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright \
DRAWER_CHROMIUM_EXECUTABLE=/Users/yzin/.cache/puppeteer/chrome-headless-shell/mac_arm-156.0.8078.47/chrome-headless-shell-mac-arm64/chrome-headless-shell \
DRAWER_QA_HEIGHTS=560 \
/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
apps/desktop/scripts/check-all-drawers.cjs
```

标准桌面补验使用 `DRAWER_QA_WIDTHS=1440 DRAWER_QA_HEIGHTS=900`。`DRAWER_QA_CASES` 可指定逗号分隔的场景；`DRAWER_QA_BASE_URL`、`DRAWER_QA_OUTPUT` 可分别指定服务与输出目录。Playwright 和浏览器由宿主已有运行时提供，未新增项目运行时依赖。

最终结果分批保存在：

| 输出目录                          | 场景数 | 聚焦次数 | 结果 |
| --------------------------------- | -----: | -------: | ---- |
| `/tmp/drawer-all-final-short`     |    236 |     2292 | 通过 |
| `/tmp/drawer-all-final-tall`      |     59 |      573 | 通过 |
| `/tmp/drawer-final-derived-short` |      8 |       44 | 通过 |
| `/tmp/drawer-final-derived-tall`  |      2 |       11 | 通过 |

前两批包含 59 个场景，后两批补齐现金余额和编辑账户分支；总计 61 个场景 × 5 种视口。每个目录有 `results.json`，窄屏截图保存在对应目录。随后将作废、划转样例对齐当前事件合同，并在模块加载时用 ledgerEventEnvelopeSchema 校验；这 4 个入口在全部 5 种视口额外 20 组复核通过，结果位于 `/tmp/drawer-dto-final-short` 与 `/tmp/drawer-dto-final-tall`。同场景、同视口用最新记录替换后仍为 305 个唯一组合、2920 次聚焦；合并只读汇总 `/tmp/drawer-all-final-results.json` 同时保留 325 次原始执行的来源指针。真实自选页只读检查日志 `/tmp/drawer-tabs-watchlist.log`，业务写入 0；未将真实页面截图上传到 Library。

## 当前测试与门禁

- 最终格式检查及 `git diff --check` 通过。
- Drawer 契约、成交失败恢复、账户保存定向测试：25 项通过，日志 `/tmp/drawer-rings-tests.log`。
- Tabs 相关、样式 token、自选、AI 提供方、策略库定向测试：27 项通过，日志 `/tmp/drawer-tabs-tests.log`。
- `pnpm --filter @thesis-ledger/desktop typecheck` 通过，日志 `/tmp/drawer-final-typecheck.log`。该输入范围与最终浏览器矩阵一致。
- 最新 `pnpm --filter @thesis-ledger/desktop test`：221 个文件通过、11 个失败，1278 项通过、52 项失败。Drawer 契约、成交恢复、账户保存、自选及凭据测试均通过。剩余失败集中于 localStorage/清理钩子、研究提交存储模拟、行情样例缺少 toFixed 值、onboarding 旧文案断言；这些未修改的范围没有被本次修复覆盖。日志 `/tmp/drawer-final-desktop-tests.log`。
- 按逐级验证规则，整包测试失败后未继续运行 build、仓库全量门禁或 Docker 更新；未提交 Git。

## 早期结果与失败归属

最初 96 组受控浏览器、752 次输入聚焦通过，另有旧布局 0px 留白回放；原始材料仍在 `/tmp/drawer-visibility-qa`。初次定向测试 21 项通过，见 `/tmp/drawer-directed-tests.log`。这一阶段没有完整覆盖 4px 按钮、嵌套页签及所有入口，因此随后扩大范围，不能用早期结果替代当前 305 组结论。

中途并行日期组件接入时，缺少 react-day-picker、随后共享依赖目录暂时无法解析 @base-ui/react，导致补验 404/500 和测试收集失败；现已恢复。旧日志 `/tmp/drawer-typecheck-current.log`、`/tmp/drawer-error-browser.log`、`/tmp/drawer-directed-final.log` 保留。期间 pnpm exec 自动安装因无 TTY 拒绝清理 modules，未放宽门禁或重装共享依赖。

初次剩余入口 smoke 中，现金账户类型与路由参数等固定输入错误、将不可聚焦容器视为控件、body 滚动锁边界误判均已修正。实际发现的滚动距离、按钮、页签、嵌套滚动和长错误问题由上述代码修复；过程日志 `/tmp/drawer-all-smoke*`、`/tmp/drawer-all-strict*`、`/tmp/drawer-nested-recheck*` 保留，最终批次没有用忽略失败清单扩大通过结论。

## 未覆盖边界

全部 Drawer 调用及表内代表状态已覆盖；未穷举每种业务数据组合，也未执行真实凭据、模型、导入提交或账本写入。系统软键盘、200% 缩放、Electron 原生窗口以及 Docker 静态资源运行态不在本次验收结果中。

## 最终一致性复核（2026-11-07）

当前 SheetContent 盘点仍为 36 个文件、39 处直接调用（/tmp/goal-drawer-final-consumers.json）。用原格式等价脚本重新比较当前 Sheet/Tabs 与矩阵之后保存的编译 token，完全一致；未改变焦点留白、滚动距离、页签或弹层布局合同。

原 305 个唯一组合、2920 次聚焦结果及失败列表已读取复核，失败为 0。旧矩阵的全源码摘要之后，其他任务确有业务内容和关闭保护改动；旧矩阵继续表示当时列出的输入及状态，不将其扩大为所有后续业务条件的全覆盖。共享布局的编译语义保持，后续关闭和导航交互由各自规格及四宽实际浏览器独立验收。

当前完整 Desktop 239 文件 / 1377 项、构建和适用仓库门禁通过，见[最新共享集成证据](2026-11-07-allocation-target-precision.md#包检查与门禁)。早期包级失败已收敛，原始日志保留。规格原范围与必要验收完成，本任务不持有未决义务；不扩大为原生窗口、软键盘或目标 Docker 运行态通过结论。
