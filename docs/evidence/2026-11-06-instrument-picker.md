# 标的代码搜索与公共组件：盘点及验证

关联：[Task](../tasks/2026-11-06-instrument-picker.md)、[Spec](../specs/2026-11-06-instrument-picker.md)。本记录只描述本次选择组件，不替代 Drawer 专项验收。

## 组件与数据边界

Desktop Market 所有的 `InstrumentSearchCombobox` 负责 Base UI 键盘、名称/代码列表、portal、状态和清除；`InstrumentSymbolField` 负责本地目录请求、防抖和候选限制；`InstrumentOptionField` 只筛选调用方已持有的列表，不扩大到全目录。Portfolio 包装层保留持仓确认、手工补录与冻结编辑，Research 包装层保留目录 ID 合同。

Mobile 的 `market/InstrumentPicker` 作为公共请求与选择实现，支持受控值、标签、市场、类型、predicate 和用途；`InstrumentSymbolField` 复用该实现，限定持仓集合使用 `InstrumentOptionField`。查询由 TanStack Query 持有并传取消信号，改变搜索词时旧结果立即失效。选择目录不会隐式执行成交、计划保存、持仓创建或远程补名。

## Desktop 入口清单

| 入口 / 文件（apps/desktop/src/features 下） | 处理及保留约束 |
| --- | --- |
| portfolio/PortfolioPositionFields → InstrumentCombobox | 共用搜索展示；账户基金与证券过滤、确认流程、目录缺失的手工补录保持；编辑已存在持仓的代码仍冻结。 |
| account-data/AccountDataExecutionSheet → InstrumentCombobox | 复用相同组件；已有成交的代码冻结与确认流程保持。 |
| account-data/AccountDataRecurringFundInvestments | 基金代码接入目录字段；只给出 OF / MUTUAL_FUND，编辑计划仍禁止改代码。 |
| import/ImportDraftReviewRow | 标准代码可搜索并选入；冻结/忙碌状态不可改，不改其他精度字段。 |
| import/ScreenshotImportSections | 识别行代码可搜索与选择；人工修订和原提交验证保持。 |
| ai/ResearchInstrumentPicker → ResearchDraftFields | 共用目录字段，只接受支持的股票、ETF、指数、场外基金；不确认持仓，提交目录 ID。 |
| ai/ResearchDraftFields | 实际持仓限当前账户返回集合，支持本地名称/代码搜索。 |
| ai/NewResearchSheet | 旧研究入口的实际持仓同样搜索当前账户集合，保留重试上下文重选标记。 |
| strategy/StrategyV2Summary | 执行标的共用目录字段；限制当前市场和资产类型，原 Schema 更新仍同步 execution signal source。 |
| strategy/StrategyExperimentCreatePage | 探索标的共用目录字段；限制已选市场/资产类型，保留原准备与提交状态。 |
| strategy/StrategyOptimizationExperimentPanel | 旧探索入口同样接入；保留原市场与资产类型约束。 |
| strategy-authoring/AuthoringConfirmation | 独立搜索及结果选择收敛至目录字段；仍根据目录对象显式投影 market/assetType/ID。 |
| model-arena/ArenaSetup | 建赛标的池共用目录字段，仍使用 arenaChoice 验证及 arenaMerge 处理选入。 |
| watchlist/WatchlistDialogs | 添加自选共用目录字段，仍使用 watchlistInstrumentSchema 与原 add 回调。 |
| portfolio/PortfolioTradeInstrumentFilter | 搜索服务端完整交易标的集合，保留全部标的及账户/模式切换清除行为；不查询目录扩充选项。 |
| risk/RiskRuleEditorSheet | 搜索已导入持仓集合，共用限定选项字段；账户与规则类型限制保持，不引入新目录标的。 |
| journal/ReviewCandidateList | 标的筛选支持目录建议，保留原筛选回调。 |
| journal/ManualReviewForm | 手动复盘标的可搜索选择，原代码与时间校验保持。 |
| journal/review/JournalReviewWorkspace | 复盘筛选可搜索选择，仍需原应用筛选操作。 |
| market-data/MarketNewsSheet | 股票新闻代码可搜索选择，限制原 SH/SZ/BJ/US 股票范围。 |
| market-data/SecurityStaticInfoPanel | 只给出 HK/US 及当前选择的股票或 ETF 类型。 |
| market-data/MarketReferenceSheet | 根据资料范围限制目录类型；ETF 期权合约清单的输入仍为 ETF 标的，而非期权合约。 |

## Mobile 入口清单

| 入口 / 文件（apps/mobile/src/features 下） | 处理及保留约束 |
| --- | --- |
| market/MarketScreen | 已复用公共 InstrumentPicker，浏览用途不确认持仓。 |
| account-baselines/BaselineScreen | 已复用公共 InstrumentPicker，持仓确认及选择回调保持。 |
| executions/ExecutionEditor | 已复用公共 InstrumentPicker，新建才选标的，旧记录冻结保持。 |
| recurring-plans/PlanEditor | 公共 Picker 增加 OF / MUTUAL_FUND 候选限制；原基金校验和确认保持。 |
| research-submit/ResearchObjects | 独立研究复用公共 Picker，实际持仓新增限定集合本地搜索，账户与支持类型限制保持。 |
| strategy-authoring/AuthoringConfirmationFields | 已复用公共 Picker，原明确校验和投影继续执行。 |
| model-arena/ArenaSetupScreen | 已复用公共 Picker，原建赛选择契约保持。 |
| watchlist/WatchlistScreen | 已复用公共 Picker，自选用途不确认持仓并继续校验 schema。 |
| market-static/MarketStaticScreen | 代码字段共用 Picker，限制港美和当前证券类型。 |
| market-reference/MarketReferenceScreen | 按资料范围限制类型；保留代码校验及手工合约输入。 |
| import-review/DraftReviewRows | 每行标准代码共用 Picker，冻结与提交原样保留。 |
| strategy-editor/StrategyEditorScreen | 执行代码共用 Picker，限定当前市场和资产类型。 |
| strategy-risk/StrategyRiskCreateScreen | 风险应用标的共用 Picker，保留原预览与校验。 |
| risk-rules/RiskRuleForm | 在已有规则持仓集合中增加本地搜索，不扩充为全目录。 |
| portfolio/TradesScreen | 标的代码筛选共用 Picker，原应用筛选操作保持。 |
| risk-events/RiskEventsScreen | 风险标的筛选共用 Picker，原列表查询保持。 |
| strategy-risk/StrategyRiskScreen | 风险应用筛选共用 Picker，原筛选操作保持。 |
| journal-trade/JournalScreen | 复盘标的筛选共用 Picker，保留原读取范围。 |
| journal-period/JournalPeriodScreen | 区间复盘代码共用 Picker，保留已编辑与提交验证。 |

## 明确保留及来源限制

- Desktop `InstrumentCatalogPanel` 与 Mobile `MarketCatalogScreen` 已有代码/名称搜索和真实结果列表，属于目录管理（含同步/确认），保留其专门职责。
- 公告、资料历史、策略名称的混合全文搜索已经返回可选的业务结果，不替换为仅标的选择，避免丢失标题/资料类型搜索。
- 回测代码从所选策略版本读取、旧成交和计划冻结代码、只读行情详情及历史结果不新增编辑能力。
- 高级策略/探索 JSON 仍是完整 Schema 编辑器，不能用单个标的选择器替代；正常执行标的字段已接入公共组件。
- 现有 Instrument 目录不覆盖期货/期权合约。接续阶段已通过既有市场资料页补充合约搜索选择，见下文“衍生品接续”；不创建虚假的目录条目，也不将本页来源清单扩大为完整合约总目录。

## 验证记录（持续更新）

- Desktop 新增 `test/instrument-symbol-field.ui.test.tsx`：首轮 5/5 通过（限制及规范提交、晚到与取消、失败重试、禁用、限定持仓）。后续移动重试按钮及展示收口需重跑。
- Mobile `test/parity/instrument-picker.test.tsx` 与 `watchlist.test.tsx`：7/7 通过；后续禁用态微调需重跑。
- Desktop 首轮定向回归：AI 12、风险 25、目录恢复 1、搜索反馈 2、自选 3，共 43 项通过。交易模式测试在收集阶段被并发日期组件缺失 popover 阻塞，未算通过。
- 后续共享工作区依赖安装期间，`@base-ui/react`、日期组件及 ESLint 插件短暂缺失；未由本任务改依赖或重装、未覆盖并发安装。后续结果以末轮检查为准。
- 浏览器初次启动被沙箱 MachPort 限制阻止；已获工具权限重试，但 fixture 因共享依赖缺失未加载。实际四宽度验收未通过前不标完成。

## 最终结果与证据

### 定向测试及构建

- Desktop 最新相关回归 42/42 通过：`src/features/strategy/strategy.v2.test.tsx`、`test/portfolio-account-filter.ui.test.tsx`、`test/research-form-v2.ui.test.tsx`、`src/features/ai/NewResearchSheet.test.tsx`、`test/research-account-mode.ui.test.tsx`、`test/instrument-symbol-field.ui.test.tsx`。明确验证独立研究提交目录 ID、不确认资产、现有持仓选择与模拟账户范围。
- Mobile 新增目录测试 3 项与自选 5 项，8/8 通过；覆盖受控代码、市场类型限制、晚到结果、失败重试与不确认持仓。
- 两端 `tsc -p tsconfig.json --noEmit` 通过；Desktop `vite build` 通过（现有大 chunk 提示保留），Mobile `tsc -p tsconfig.json` 构建通过。未改原生依赖或工程；不将此结论扩大为真实 Android/iOS 设备验收。
- 公共组件、搜索 hook 及 Portfolio / Research 包装层的定向 ESLint 通过；新增文件 Prettier 与修改文件 `git diff --check` 通过。
- `scripts/check-boundaries.mjs` 增加 Market 选择组件不得反向依赖业务消费者的规则，`node --check` 通过。由于包级全量仍有独立失败，本轮未越级运行全仓边界、尺寸及 lint 门禁。

### 完整包级测试及剩余失败

Desktop 末轮 **1324 passed / 3 failed**（231 个测试文件）。三个失败不经过本次代码输入改动：

1. `test/account-data-investments-navigation.ui.test.tsx:265`：测试读取首个 details 的 open 状态，当前页面首个 details 已展开；本任务仅修改该页面编辑表单里的标的字段，不修改列表 details。
2. `test/ui-contract.test.tsx:168`：期望“启用风险规则与后台扫描”，当前 FirstRunOnboarding 输出“启用风险规则”；本任务未修改该组件或此断言。
3. `src/features/market-detail/MarketDetailDialog.latest.integration.test.tsx`：`FundDailyComparison.tsx:26` 对样本缺失的 estimatedNav 调用 toFixed；本任务未修改此组件或估值合同。

Mobile 全量 **179 passed / 1 failed**（46 个测试文件）：`test/parity/batch4-ui.test.tsx:28` 找不到“查看 本轮草稿 · 版本 1”按钮；该策略列表及测试不在本任务写集。

命令从各客户端目录运行（本机 Volta 缺 Node 24，使用现有 Node 26.13.0）：

```sh
PATH=/Users/yzin/.volta/tools/image/node/26.13.0/bin:$PATH NODE_OPTIONS=--no-experimental-webstorage ../../node_modules/.bin/vitest run --maxWorkers=2
PATH=/Users/yzin/.volta/tools/image/node/26.13.0/bin:$PATH ../../node_modules/.bin/vitest run --dir test --maxWorkers=2
```

第一条对应 Desktop，第二条对应 Mobile。`--no-experimental-webstorage` 避免 Node 26 的未配置全局 WebStorage 遮住 JSDOM 存储；未修改仓库测试配置，也未屏蔽应用的存储失败测试。首轮默认 Node 26 全量因该环境问题产生额外失败，末轮结果以上述命令为准。包级未全部通过，Task 保持活动，不执行 Docker 更新或声称目标容器已同步。

### 实际浏览器

- [公共组件四宽度结果](2026-11-06-instrument-picker/component-browser.json)：1440 / 1024 / 768 / 390 全部通过。验证键盘选入规范代码、中文市场标签、完整焦点环、popup 边界、清除后继续输入、空结果、失败重试、限定持仓搜索及取消；页面无横向溢出、无 JS 错误。
- [实际定投组件四宽度结果及真实目录读取](2026-11-06-instrument-picker/business-browser.json)：使用仓库 `test/browser-drawer-visibility.html?case=fund` 中实际 `RecurringFundInvestments`；四宽度验证候选选择、取消、已有计划的代码禁用。隔离样本只拦截本次目录结果；另一次只读搜索本机真实目录并选择 OF 基金成功。所有业务写入被拦截，记录中只有 GET。
- 真实目录读取与隔离计划表单分别记录；不声称创建了真实计划，也不声称完整共享工作区所有业务流程已通过。
- 实际定投组件截图：[1440](2026-11-06-instrument-picker/fund-create-1440.png)、[1024](2026-11-06-instrument-picker/fund-create-1024.png)、[768](2026-11-06-instrument-picker/fund-create-768.png)、[390](2026-11-06-instrument-picker/fund-create-390.png)。

浏览器过程还暴露并修复了纯静态测试不易发现的两个问题：Base UI 关闭时的自动输入清理不能覆盖用户原值；清除/重试按钮消失前必须把焦点留回输入，避免 Sheet 焦点管理关闭新列表。空状态使用标准 ComboboxEmpty 注册，嵌套 Escape 只关闭当前搜索，再次 Escape 才遵循原 Drawer 关闭行为。

## 衍生品接续：根因、实现与实源验证（2026-11-07）

### 根因及所有权

- DSA `src/services/thesis_ledger_catalog.py` 的 `_akshare_catalog` / `_efinance_catalog` 只构建 STOCK、ETF、MUTUAL_FUND；`_normalize_frame` 针对六位数字代码，未提供期货或期权目录 loader。
- Server `market/instruments/instrument-search.service.ts` 只搜索本地 Instrument；普通符号投影拼接 `canonicalCode.market`。资料入口合同则要求 `CU2611` / `RB0` 或八位期权原码，不能把普通目录后缀直接套用。
- Catalog 全量同步会把不在新一代快照的旧 Instrument 置为 inactive。临时把资料合约塞进股票目录，会在下次股票/基金同步时失效；本轮没有这样做，也没有修改数据库、DSA ingestion、持仓确认或可交易资产范围。

### 在现有授权内实施的最小闭环

- 新增 `packages/api-client/src/market-reference-contracts.ts`：稳定的 Market Reference 消费投影，读取真实资料行的代码、来源产品名、交易所/交易日、ETF/近月/认购认沽信息。代码大写以适配既有资料输入合同；不补造世纪、名称、Instrument ID 或市场后缀。
- Desktop 与 Mobile 的 `MarketReferenceCodeField` / `MarketReferenceContractField` 复用现有公共选择呈现，普通证券继续使用 InstrumentSymbolField，衍生品从来源资料页选择。
- 期货：明确选择现有五所之一及交易日，再读取合约页。期权：先从公共目录搜索选择受支持的沪市 ETF，再读取该 ETF 当前近月清单。
- 每次 20 条、12 秒请求预算，翻页必须显式操作。搜索仅在当前已读取页内按来源名称、代码或元数据过滤；不自动遍历全部页面/月份/来源。
- 条件变化立即清除旧候选并取消旧请求；来源失败不被解释为空目录，手工原码保留。成功、失败与刷新由 TanStack Query 管理。关闭搜索再展开保留搜索条件，选中后可重新浏览当前页。

### 权限与实源证据

[只读准入核对](2026-11-06-instrument-picker/derivative-policy-preflight.json)：本轮读取时 policy revision 189，enabled / applied，既有期货日行情、期权清单路由为 ready。未改任何路由、凭据或权限。

经既有 `/api/market-data/reference` 读取：

| 来源条件 | 第 1 页 | 第 2 页 | 本次来源总记录 |
| --- | --- | --- | --- |
| 510050.SH 当前近月 ETF 期权 | 20 条 | 4 条 | 24 条 |
| 上期所 2026-11-06 期货日行情 | 20 条 | 20 条 | 238 条 |

第 1 页观察到期权 `10012637`、期货 `cu2611` / 产品“铜”，选择结果分别为 `10012637`、`CU2611`，未加股票市场后缀。来源消费响应作为固定测试样本保存在 `packages/api-client/test/fixtures/reference-contracts/`，不是完整目录或原始 HTTP 字节留存。

[实际 Drawer 四宽度及实源选择](2026-11-06-instrument-picker/derivative-browser.json)：1440 / 1024 / 768 / 390 全部通过，覆盖真实业务组件中的本页搜索、选择、两类清单显式分页、失败保值与横向边界；另分别实源读取一期货页、一近月期权页并选入成功。只有本地目录 GET 和既有资料读取 POST，无业务写入、无 JS 错误。截图等待浮层动画结束后保存：[1440](2026-11-06-instrument-picker/contracts-1440.png)、[1024](2026-11-06-instrument-picker/contracts-1024.png)、[768](2026-11-06-instrument-picker/contracts-768.png)、[390](2026-11-06-instrument-picker/contracts-390.png)。

### 仍缺失的范围及后续最小方案

1. 当前提供的是所选来源、日期和页面的真实候选，不是完整且可按名称全局检索的持久化衍生品目录。
2. 日行情文件没有 RB0 等连续/主力系列目录；不能仅根据品种字符串拼造连续代码。最小后续方案是新增并核验明确返回连续合约及名称/映射的目录能力，再接入独立合约发现合同。
3. 郑商所来源可能给出 TA611 等三位年月，而现有查询合同要求两位年份加两位月份。当前排除这类无法可靠关联的候选，不猜测世纪；需建立有来源见证的交易所代码→查询代码映射后再开放。
4. 当前没有大商所日行情资料入口；本轮不新增未经核验的 adapter 或路由。
5. ETF 期权清单只覆盖既有四只沪市 ETF 的当前近月；不包含深市 ETF、其他月份、商品或股指期权全目录。扩充需要对应来源发现、分页/过期语义、权限及响应身份验收。
6. 若后续做持久化完整合约目录，必须独立管理来源、交易所、原码/规范码、到期与 generation，不能混入股票/基金快照的 inactive 扫描。本轮方案不改变资产支持范围或宣称实时可交易。

### 接续验证结果

- 新增投影单测 3/3、Desktop 合约组件 3/3、Mobile 合约组件 3/3 通过；另普通标的回归 Desktop 6/6、Mobile 3/3 通过。覆盖真实样本、手工原值、非法 ETF 阻断、条件变更/取消、失败重试、显式分页及关闭重开搜索条件。
- API Client 全量 **208/208** 通过（40 文件），构建通过。
- 两端 typecheck/build、定向 ESLint、Prettier、diff whitespace 检查通过。新共享投影及消费者的依赖规则同步到 check-boundaries，脚本语法检查通过。
- 最近完整 Desktop 为 **1327 passed / 3 failed**（232 文件）；Mobile 为 **183 passed / 1 failed**（48 文件）。随后观察到定投列表测试由并行任务更新，再定向复核原失败集合。
- 最终稳定输入复核：Desktop 原失败相关 37 项中 **35 passed / 2 failed**；Mobile 原策略批次 **10 passed / 1 failed**。期间相关测试和业务源文件的摘要均未变化，见[稳定性记录](2026-11-06-instrument-picker/residual-stability.json)。定投列表 9/9 已通过，不归功于本次选择组件。
- 剩余三项：FirstRunOnboarding“启用风险规则与后台扫描”文案断言；FundDailyComparison 样本缺失 estimatedNav；Mobile 策略库“查看 本轮草稿 · 版本 1”按钮断言。均不经过本任务输入控件，没有修改这些独立组件或放宽断言来消除失败。
- 由于上述包级失败仍存在，本轮继续保留仓库全量门禁及 Docker 运行态同步未完成状态，不将隔离样本或实源读取扩大为全仓/生产通过。
