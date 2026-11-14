# 日期组件一致性验收

日期：2026-11-11。工作区：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`，未提交源码。对应[规格](../../specs/2026-11-11-date-input-consistency.md)与[归档任务](../tasks/2026-11-11-date-input-consistency.md)。

## 排查结论与覆盖范围

截图原因已经在共享 `DateInput` 中确认：失焦时用透明原生输入叠加格式化文本，聚焦后移除文本并露出浏览器原生日期分段，显示随浏览器语言变化。另有共享 Calendar 的已选日期采用 ghost 按钮，悬停颜色与月份按钮不同；全局表格行悬停样式影响日历整行。

扫描当前 `apps`、`packages` 源码，排除 `release`、`dist`、`node_modules`、原生构建产物和历史验收副本。Desktop 当前业务有 21 个文件、37 个 DateInput 声明入口；只有 DateSelectionPanel 使用共享 Calendar，没有其他日期面板旁路。

| 领域 | 文件与入口数 | 已核对消费者 |
| --- | --- | --- |
| 账户数据 | 7 / 10 | CashDepositSheet、CashObservationSheet、CashTransferCorrectionSheet、CashTransferSheet、ExecutionSheet、RecurringCashDeposits、RecurringFundInvestments |
| 复盘 | 4 / 7 | JournalDashboard、ManualReviewForm、ReviewCandidateList、JournalWindowTimeInput |
| 行情资料 | 3 / 5 | MarketNewsTimeRangeField、MarketReferenceContractField、MarketReferenceSheet |
| 行情图 | 1 / 2 | ChartCustomRangeDialog |
| 持仓 | 2 / 2 | PortfolioPositionFields、PortfolioTradeOpeningBoundarySheet |
| 策略与回测 | 4 / 11 | BacktestSetupDialog、NavBacktestSetupSections、StrategyExperimentDateFields、StrategyOptimizationExperimentPanel |

Mobile 的日期字段位于账户基线、回测设置、现金观察、划转、成交、复盘区间、行情图、新闻、行情资料、收益、建仓和定期计划等入口，使用共享移动 Field/TextInput；没有 DOM 日期控件或独立原生 DatePicker，保持其 React Native 运行时实现。日期范围仍由业务组合两字段并拥有其包含/排除、时区和校验语义。面板内原生 `time` 编辑器继续承担时分秒及 step 编辑，不作为另一套日期组件。

## 实现与参考依据

参考 [Ant Design DatePicker 官方文档](https://ant.design/components/date-picker)：统一格式化输入、日期面板、清除、日期时间确认以及选中/今天/悬停状态的分工。通过锁定的 `pnpm exec shadcn info --json`、`docs calendar popover input-group` 确认当前项目为 Base UI、Tailwind v4、lucide，并阅读对应官方文档。继续组合现有组件，无依赖或锁文件变更；没有把 Ant Design 安装进项目。远程源码页面读取未成功，参考结论以官方交互和 API 文档为依据。

- 可见编辑器始终使用文本输入，格式与聚焦无关；原生控件以不可见、不可 Tab 聚焦的方式保留表单原值与原生约束。原值 ref 聚焦时转交可见输入。
- `use-date-input-editor.ts` 拥有草稿、格式校验、原值变更与重置；非法草稿阻止原生表单提交。受控更新、日期选择及清除复用原值链路；不触发时区转换或精度舍入。
- 原始日期时间保留 `T`、秒和毫秒，展示仅把 `T` 换为空格。外层 Field 的名称与内部编辑字段隔离，同名表单值不重复。
- 日期与月份都消费共享 Button 的已选变体；今天以边框标识。日历单元格使用透明背景覆盖通用表格悬停背景，未增加 CSS 选择器或 `!important`。
- 点击文本打开面板时保留文本编辑焦点；图标打开时允许面板取得焦点。日期面板展开或草稿非法时，Escape 消费当前层事件，防止关闭外层 Drawer/Dialog。实际浏览器发现此问题后已修复，并增加对应断言。
- `scripts/date-input-boundaries.mjs` 纳入新增辅助模块，禁止透明原生日期输入切换聚焦格式；原 DateInput 消费门禁与业务依赖方向继续有效。

## 验证结果

命令均从仓库根目录执行，另有注明时除外。执行时使用 RTK；工具内部环境通过实际 pnpm 路径运行。宿主 `node` 的 Volta shim 无法解析项目 Node 范围，验证改由 `pnpm exec node` 调用已有 Node，未安装或改动工具链。

| 检查 | 实际命令或过程 | 结果与边界 |
| --- | --- | --- |
| 定向回归 | 在 `apps/desktop` 执行 `pnpm exec vitest run test/date-input.test.tsx test/ui-contract.test.tsx test/account-data.ui.test.tsx src/features/account-data/AccountDataRecurringCashDeposits.test.tsx --reporter=dot` | 最终 58/58；覆盖受控/非受控、文本输入、格式、非法草稿、重置、范围/步长、禁用/只读、ref、精度、原值提交及失败重试 |
| 类型与产物 | `pnpm --filter @thesis-ledger/desktop typecheck`；稳定源码后 `pnpm --filter @thesis-ledger/desktop build` | 均通过；已有大 chunk 提示保留，未修改阈值 |
| 依赖边界 | `pnpm exec node scripts/check-boundaries.mjs`；`pnpm exec node --test scripts/date-input-boundaries.test.mjs` | 通过；专项 2/2 |
| ESLint | 对本次修改的 Desktop 组件和测试执行 `pnpm exec eslint <对应文件>` | 通过；原值 setter 保留属性描述符调用，解决了抽离 helper 后的 unbound-method 检查 |
| 文件尺寸 | `pnpm exec node scripts/check-file-size-guardrails.mjs` | 通过，报告 6 项既有警告；未提供 ratchet 基线，不能声称强制比对过存量增长 |
| 实际浏览器 | `PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright DATE_INPUT_QA_CHROMIUM='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' pnpm exec node apps/desktop/scripts/check-date-input-consistency.cjs` | Microsoft Edge，真实 Vite 页面；27 个隔离样本场景及 4 个真实复盘页面场景通过，无页面异常、无业务写请求 |

浏览器样本在 1440、1024、768、390 宽度，分别覆盖明暗主题和页面、Drawer、Dialog，共 24 组；另有 390×420 短窗口的三种承载面。检查日期/月选中颜色、悬停文字、邻近单元格背景、键盘选择、文本输入保留焦点、标签不打开面板、Escape 层级、边界与横向溢出；实际提交包含原始 `T` 与毫秒。真实 `/journal` 页面只聚焦、开关日期面板、检查回显及截图，不修改值。截图与机器结果位于 `/tmp/date-input-consistency-qa/`，包括 `results.json`、`page-light-1440.png`、`dialog-dark-390.png` 与 `journal-field-*.png`；这些临时文件不是唯一验收依据，本报告保存实际断言与结果。

## 全量回归边界

执行一次 `pnpm --filter @thesis-ledger/desktop test --reporter=json --outputFile=/tmp/date-input-desktop-full.json`，初次结果为 1957/1970，13 项失败。两项与本次展示合同直接相关：`account-data.ui.test.tsx` 读取实现内占位字符串、`AccountDataRecurringCashDeposits.test.tsx` 将可见文本误当原生提交值。已分别改为实际输出断言、区分可见空格与原值 `T`，最终定向 58/58；失败重试的实际业务 payload 断言保留。

其余 11 项分布如下，未在本次范围内修复，不宣称全包通过；没有第二次全包执行。它们涉及本次未修改的业务合同或模拟输入，归属依据是失败断言与调用链检查，不声称执行过改动前的全包基线。

| 文件 | 失败数 | 当前失败内容 |
| --- | --- | --- |
| `experiment-discovery-instrument.test.tsx` | 4 | 创建实验调用未发生；受控准备对象未包含当前要求的价格研究与执行协议 |
| `market-experiment-recovery.ui.test.tsx` | 1 | 未进入预期的创建失败提示 |
| `optimization-execution-model.ui.test.tsx` | 1 | 执行模型请求未发生，读取 mock.calls 失败 |
| `optimization-preparation.test.tsx` | 2 | 价格研究准备合同与旧复权文案断言不一致 |
| `provider-exact-checks-sheet.test.tsx` | 1 | 精确能力检查成功提示未满足断言 |
| `routing-capability-options.test.ts` | 1 | 账号权限路由选项与空结果预期不一致 |
| `watchlist-source-cadence.test.ts` | 1 | 报价刷新频率返回 60 秒，与空值预期不一致 |

## 最终写集与结论

2026-11-12 占位文案调整：日期、月份和日期时间的默认空值占位统一为“请选择日期”；输入格式继续用于校验错误说明。定向执行 `date-input.test.tsx`、`ui-contract.test.tsx`、`account-data.ui.test.tsx`，48/48 通过；实际浏览器在 1440、1024、768、390 宽度逐一清空三类受控样本，空值占位及聚焦检查全部通过。同步当前规格和 UI 指南，业务数据未修改。

源码为 `apps/desktop/src/components/ui/{date-input.tsx,use-date-input-editor.ts,calendar.tsx,date-selection-panel.tsx}`；测试为 `apps/desktop/test/{date-input.test.tsx,ui-contract.test.tsx,account-data.ui.test.tsx}`、`apps/desktop/src/features/account-data/AccountDataRecurringCashDeposits.test.tsx`；浏览器入口为 `apps/desktop/scripts/check-date-input-consistency.cjs`；门禁为 `scripts/date-input-boundaries{,.test}.mjs`。文档同步本主题规格/任务/证据、既有日期规格、UI 指南及文档索引。

本次日期组件范围验收通过。未运行 Docker 更新、未改数据库、未提交或推送；构建产物仍由既有忽略规则管理。实际验收覆盖 Desktop Chromium；未声称 Safari、Firefox 或原生 App 手工验收。
