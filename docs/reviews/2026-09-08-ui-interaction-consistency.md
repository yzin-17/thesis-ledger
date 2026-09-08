# 全站 UI 与交互检查记录

对应[规格](../specs/2026-09-08-ui-interaction-consistency.md)与[任务](../tasks/2026-09-08-ui-interaction-consistency.md)。

## 基线

2026-09-08，实际连接本地开发页面，1440×900、浅色主题。九个一级页面已访问并读取实际 DOM；策略页面已查看截图，策略编辑与账户管理侧栏已打开，回测任务空状态已检查。未进行真实账本写入、通知发送或凭证修改。

| 页面 | 当前状态 | 后续运行验证 |
| --- | --- | --- |
| 投资组合 | 有持仓，金额充当主标题 | 详情、交易、模式及异常状态 |
| 账户数据 | 有账户、成交为空，无英文副标题 | 所有表单与保存恢复 |
| 风险中心 | 有规则和事件 | 规则编辑、事件、通知与失败恢复 |
| 收益分析 | 有估值、趋势为空，副标题为中文 | 目标与范围切换 |
| 策略实验 | 策略与回测为空，编辑可打开 | 编辑关闭保护、回测结果需测试数据 |
| 投资复盘 | 无已平仓候选 | 手动与周期表单、证据、结果需测试数据 |
| 研究助手 | 任务为空、研究数据源未配置 | 新建表单、证据与结果需受控数据 |
| 数据与自动化 | 通知数据源和健康历史可读 | 编辑、自动化及诊断 |
| 市场数据 | 目录和配置可读 | 筛选、同步与异常反馈 |
| 移动端 | 源码入口两页，未运行 | 设备或模拟器验收 |

## 问题清单

| 编号 | 优先级 | 观察 | 处理方向 |
| --- | --- | --- | --- |
| UI1 | 中 | 一级页头英文缺失、中文名称不同、字号间距各自实现 | 共享页头与统一命名 |
| UI2 | 中 | 页头底线不一致，线型 Tab 伸展到整行 | 页头留白、内容宽度 Tab 与单条分隔线 |
| UI3 | 中 | 静态卡片默认同时带阴影和 ring，其他面板使用边框 | 静态容器单层语义边框 |
| UI4 | 中 | 侧栏宽度从 440px 至 900px，各自限制视口 | 语义尺寸档位与统一视口上限 |
| UI5 | 中 | 页头说明包含实现术语，影响快速识别用途 | 简洁用途说明，详情保留必要语义 |

## 次级入口清单

下表由当前源码提取，尚未实际验证的入口保持“待验证”。这份基线清单完成不等于全部运行验收完成。

| 文件 | 入口 | 基线状态 |
| --- | --- | --- |
| `apps/desktop/src/features/account-data/AccountDataAuditSheets.tsx:79` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataAuditSheets.tsx:384` | `<SheetContent side="right" className="w-[440px] max-w-[calc(100%-16px)] p-6">` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataCashDepositSheet.tsx:112` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataCashObservationSheet.tsx:116` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataCashTransferCorrectionSheet.tsx:104` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataCashTransferSheet.tsx:117` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataExecutionSheet.tsx:291` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataPage.tsx:422` | `{!isCashAccount && <TabsTrigger value="positions">持仓</TabsTrigger>}` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataPage.tsx:423` | `{!isCashAccount && <TabsTrigger value="transactions">成交记录</TabsTrigger>}` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataPage.tsx:424` | `<TabsTrigger value="cash">现金</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataPage.tsx:572` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataPage.tsx:598` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataReconciliationSheet.tsx:98` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataRecurringCashDeposits.tsx:425` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/account-data/AccountDataRecurringCashDeposits.tsx:548` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/ai/AiRunList.tsx:78` | `<TabsTrigger key={item.value} value={item.value} className="shrink-0 px-2 text-xs">` | 待验证 |
| `apps/desktop/src/features/ai/EvidenceChainSheet.tsx:130` | `<SheetContent side="right" className="w-[min(100vw,42rem)] overflow-y-auto">` | 待验证 |
| `apps/desktop/src/features/ai/NewResearchSheet.tsx:244` | `<SheetContent side="right" className="w-[min(100vw,38.75rem)] overflow-y-auto">` | 待验证 |
| `apps/desktop/src/features/import/ImportReview.tsx:333` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/journal/AdvancedJsonSheet.tsx:61` | `<SheetContent className="w-[min(100vw,48rem)] overflow-y-auto">` | 待验证 |
| `apps/desktop/src/features/journal/EvidenceEditorSheet.tsx:89` | `<SheetContent className="w-[min(100vw,32rem)] overflow-y-auto">` | 待验证 |
| `apps/desktop/src/features/journal/JournalDashboard.tsx:637` | `<TabsTrigger value="single">单笔复盘</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/journal/JournalDashboard.tsx:638` | `<TabsTrigger value="period">周期复盘</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/journal/JournalReviewResults.tsx:172` | `<SheetContent className="w-[min(100vw,48rem)] overflow-y-auto">` | 待验证 |
| `apps/desktop/src/features/market-detail/MarketDetailDialog.tsx:260` | `<DialogContent` | 待验证 |
| `apps/desktop/src/features/portfolio/PortfolioDashboard.tsx:141` | `<TabsTrigger value="overview">组合概览</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/portfolio/PortfolioDashboard.tsx:142` | `<TabsTrigger value="trades">交易</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/portfolio/PortfolioManagementSections.tsx:191` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/portfolio/PortfolioManagementSections.tsx:498` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/portfolio/PortfolioTradeDetailSheet.tsx:367` | `<SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">` | 待验证 |
| `apps/desktop/src/features/providers/AutomationEditorSheet.tsx:80` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/providers/ProviderEditorSheet.tsx:60` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/providers/ProviderSettings.tsx:206` | `<TabsTrigger value="providers">数据源</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/providers/ProviderSettings.tsx:207` | `<TabsTrigger value="automation">自动化</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/providers/ProviderSettings.tsx:208` | `<TabsTrigger value="diagnostics">诊断</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/risk/RiskCenter.tsx:258` | `<TabsTrigger value="overview">总览</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/risk/RiskCenter.tsx:259` | `<TabsTrigger value="rules">规则</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/risk/RiskCenter.tsx:260` | `<TabsTrigger value="events">事件</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/risk/RiskCenter.tsx:261` | `<TabsTrigger value="notifications">通知</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/risk/RiskRuleEditorSheet.tsx:361` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/risk/RiskSections.tsx:317` | `<DialogContent className="max-h-[calc(100dvh-64px)] overflow-auto sm:max-w-lg">` | 待验证 |
| `apps/desktop/src/features/strategy/StrategyDashboard.tsx:144` | `<TabsTrigger value="library">策略库</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/strategy/StrategyDashboard.tsx:145` | `<TabsTrigger value="jobs">` | 待验证 |
| `apps/desktop/src/features/strategy/StrategyEditorSheet.tsx:419` | `<SheetContent` | 待验证 |
| `apps/desktop/src/features/strategy/StrategyEditorSheet.tsx:437` | `<TabsTrigger value="common">常用配置</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/strategy/StrategyEditorSheet.tsx:438` | `<TabsTrigger value="advanced">高级 JSON</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/strategy/StrategySections.tsx:502` | `<DialogContent className="max-h-[calc(100dvh-64px)] overflow-y-auto sm:max-w-lg">` | 待验证 |
| `apps/desktop/src/features/strategy/StrategySections.tsx:655` | `<DialogContent className="max-h-[calc(100dvh-48px)] overflow-y-auto sm:max-w-4xl">` | 待验证 |
| `apps/desktop/src/features/strategy/StrategySections.tsx:671` | `<TabsTrigger value="summary">摘要</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/strategy/StrategySections.tsx:672` | `<TabsTrigger value="equity">权益数据</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/strategy/StrategySections.tsx:673` | `<TabsTrigger value="trades">交易明细</TabsTrigger>` | 待验证 |
| `apps/desktop/src/features/strategy/StrategySections.tsx:674` | `<TabsTrigger value="repro">复现信息</TabsTrigger>` | 待验证 |

## 验证边界

空策略、无已平仓交易、研究数据源未配置限制部分真实结果入口。受控测试和真实环境证据分别记录。全量异常状态及原生验证未完成；这些项目不影响已确认视觉差异的修复，但仍属于最终验收要求。


## 实施结果（2026-09-08）

### 已实施的统一规则

- 九个桌面一级页面共用 `PageHeader`，保留装饰性英文副标题；中文主标题与导航名称一致。桌面标题 32px，窄窗口 28px；英文 12px、字重 600、字距 0.16em。说明与操作区按相同间距排列。
- 投资组合总资产移入指标组；市场数据指标复用同一指标组件，区分零值与缺失数据。账户加载、失败和空状态保留同一页头。
- 线型 Tab 采用内容宽度的选项和单条底线，窄窗口可横向滚动；静态 Card 使用单层边框，Empty 默认实线。移除已无调用方的旧页头样式，保留有效的表单和业务布局样式。
- Sheet 调用方迁移到紧凑、表单、详情三个尺寸：480、640、960px，最大宽度为视口减 16px；统一侧栏标题层级。浮层继续复用现有 Base UI 焦点管理。
- 策略、数据源、自动化、现金入账／转账／快照、研究问题、复盘 JSON／证据、风险规则、收益目标的用户主动关闭接入草稿保护。保存中阻止相应关闭与重复提交；保存成功后的所属功能关闭保持直接完成。该保护未覆盖整页刷新或路由离开。
- 自动化保存与运行等待列表失效刷新；策略区分写入失败与写入成功后刷新失败，避免误导用户重复创建。
- 收益目标在没有配置数据或估值不可用时，新增分类仍显示可编辑字段，中文分类名与权重校验正常。
- 移动端两页分别显示 `PORTFOLIO / 投资组合` 与 `RISK CENTER / 风险事件`，统一标题层级、刷新用语与圆角。
- 回测设置、信号编辑和目标草稿校验从大文件中按职责提取，原有策略导出入口保持兼容。

### 当前浏览器证据

| 范围 | 结果 | 证据边界 |
| --- | --- | --- |
| 九个一级页面，浅色 1440×900 与 1024px 宽 | 已访问并保存截图 | 截图位于 `/tmp/ui-consistency-evidence/`，文件为“页面中文名-宽度.png”；是本轮本地临时证据 |
| 九个一级页面，390×844 | 未出现页面级横向溢出 | 实际 DOM 测量；局部表格与 Tab 保留横向滚动 |
| 九个一级页面，深色 1440×900 | 标题颜色与页面宽度检查通过 | 已查看账户深色截图；不等于所有浮层均完成深色截图验收 |
| 策略普通字段编辑后关闭 | 出现放弃确认；继续编辑保留草稿；放弃后恢复入口焦点 | 未提交策略或执行回测 |
| 数据源与自动化新建草稿 | 修改名称后取消出现统一提醒 | 未输入凭证、保存任务或发送通知 |
| 现金快照 | 输入金额后取消出现提醒；继续编辑保留金额 | 未写入现金账本 |
| 研究问题 | 输入问题后关闭出现提醒；继续编辑保留问题 | 能力预检失败时开始研究禁用；未调用模型 |
| 风险规则 | 已打开现有规则；无修改取消正常 | 修改后的保存与失败恢复未实测 |
| 收益目标 | 新增股票分类可见中文名称；输入 100 后合计校验通过；取消有草稿提醒 | 未持久化测试目标 |
| 服务不可用 | 后续访问收益、策略、自动化、研究均显示读取失败或重试入口 | 本地 3000 端口在验证中途停止监听，数据相关后续流程受阻 |

以上结果补充前面的源码入口基线。未逐项访问的详情、审计、结果页、首次账户写入、真实保存失败恢复、路由离开保护和所有异常状态组合仍未验收；不得据一级页面访问记录推定这些项目通过。

### 自动化与工程检查

| 检查 | 结果 |
| --- | --- |
| 桌面测试 | 23 个测试文件，170 项通过；新增策略刷新反馈与目标草稿校验测试 |
| 桌面类型检查及生产构建 | 通过；仍有既有大包体积提示 |
| 移动端类型检查及测试 | 7 项通过 |
| 边界检查 | 通过 |
| 无障碍静态检查 | 13 项通过；修正检查脚本引用的旧目录，不以静态结果替代键盘实测 |
| 文件尺寸门禁 | 使用 `GUARDRAIL_BASE_REF=HEAD` 通过，保留 8 项未增长的存量警告 |
| 修改文件 ESLint | 退出码 0，无规则错误；移动端导入解析器仍输出 React Native Flow 解析诊断，不将其视为原生运行通过 |
| `git diff --check` | 通过 |

### iOS 原生检查

使用 iPhone 17 Pro、iOS 26.5 模拟器，Debug 原生编译通过。为恢复缺失的 Pods，执行依赖安装；`Podfile.lock` 只同步 ExpoModulesCore 与 Podfile 两处校验值，依赖版本未变化。

安装启动后，应用在进入页面前被动态链接器终止：`ExpoModulesCore.framework` 引用的 `facebook::react::Sealable` 构造符号无法从 `React.framework` 解析（`__ZN8facebook5react8SealableC2Ev`）。因此原生编译通过、移动端运行验收阻塞是两个独立结论。没有将桌面截图或类型检查作为移动端页面验收证据。本主题未升级 React Native／Expo 来绕过该问题。

### 一致性审查结论

共享视觉规则和上述交互迁移已实现；运行验收尚不完整，T1 至 T8 保持未勾选。主要限制为本地服务停止、原生动态库不匹配，以及回测／复盘／研究结果所需数据缺失；其余尚未遍历的次级入口明确保留为待验证。现有工作区中的策略执行一致性修改被保留，未提交、未部署，也未进行真实账本写入。


## Drawer 专项复查与修复（2026-09-08，用户截图反馈后）

上一轮只统一了侧栏宽度与标题字号，仍有旧页头间距、正文额外内边距和 `form-card` 外框。此次按当前源码逐项检查全部 25 个 `SheetContent` 调用点及其内嵌内容，完成兼容迁移。

| 范围 | 调用点数 | 处理结果 |
| --- | --- | --- |
| 账户数据 | 12 | 修正链、作废／恢复、现金入账、现金快照、现金划转与更正、录入成交、导入草稿、账户管理、持仓对账、定期计划及本期确认均使用统一标题区；移除额外标题／正文顶距 |
| 投资组合 | 3 | 独立账户表单、持仓／现金表单、交易详情统一；内嵌账户表单去除整块外框和页面级 4px 顶距 |
| 研究助手 | 2 | 新建研究与来源链移除重复正文水平内边距；来源块的静态虚线改为实线 |
| 投资复盘 | 3 | 高级 JSON、证据编辑、结果原文共享标题和操作区；保留原文数据块边界 |
| 截图导入 | 1 | 移除标题区旧布局和根容器 gap-0；上传区保留独立功能边界 |
| 数据与自动化 | 2 | 数据源表单移除整块外框；数据源和任务统一标题与操作区 |
| 风险中心 | 1 | 规则表单统一标题、正文和底部间隔 |
| 策略实验 | 1 | 移除标题底线和重复内边距，保留 Tab 的导航分隔线 |

### 最终规则

- 外侧留白 24px；标题至说明 8px；标题区至正文可见内容 24px。标题区不使用分隔线，标题与说明不继承浏览器默认 margin。
- 普通表单不套整块装饰外框。控件保留自身边界；独立数据、原文、审计及上传模块根据用途保留边界。静态内容不使用暗示拖放的虚线。
- 底部操作区使用单条顶线与 16px 上内边距，按钮靠右并允许换行。可滚动输入区预留焦点描边空间。
- 带返回按钮的账户标题区允许收缩；390px 窄屏说明可换行。

### 本轮浏览器结果

实际打开并测量 12 种侧栏：账户设置、创建账户、录入成交、记录现金快照、账户间划转、记录持仓快照、新建策略、新建数据源、新建自动化任务、新建风险规则、新建研究、高级 JSON。测量确认外侧 24px、标题说明 8px、正文间隔 24px，且没有旧整块表单外框。

创建账户和录入成交均查看了最终截图，并在深色、390×844 窄屏复验。窄屏初次检查发现账户说明无法收缩，修复后无水平溢出。证据位于 `/tmp/drawer-consistency/create-account.png`、`execution.png` 和 `measurements.json`；测量文件同时保留复查过程中发现的问题与修复后的记录。

其余数据依赖的审计、对账、交易／研究结果、定期入账和导入入口已完成源码检查及共享组件迁移，未伪称逐个完成实际业务流程。没有创建测试账户、写入成交或现金、发送通知。

### 回归与防回退

新增 `drawer-layout-contract.test.tsx`，遍历全部 feature 的 Sheet 标题，要求其直接使用共享 `SheetHeader`，禁止标题局部边框／内边距和旧 `form-card` 外框；检查共享 Footer 的边框与换行规则。既有定期入账测试改为验证使用共享 Footer，不再绑定旧的局部 p-4 样式。

最终结果：24 个测试文件、172 项测试通过；桌面类型检查与构建、修改文件 ESLint、边界检查、13 项无障碍静态检查通过；使用 HEAD 基线的文件尺寸门禁通过，保留 8 项未增长存量警告。构建仍有既有包体积提示。原有全站任务的业务验收状态不因本次视觉复查提前勾选。

## 表格操作列与策略库展示专项（2026-09-08）

Desktop 全部语义表格已完成源码盘点。策略库、回测任务、投资组合持仓、交易、持仓快照、交易详情、账户账本、Provider、自动化任务和收益配置的真实行级操作／调整列统一使用 `StickyTableActionHeader` 与 `StickyTableActionCell`；表头和单元格均固定在右侧，使用不透明背景、左边界和独立层级。风险事件、通知记录、估值趋势、Provider 健康历史、回测结果等纯只读表格不新增固定列。

策略库同步修复三处展示问题：描述已包含首个标的时不再重复拼接，版本数据时点使用中文本地时间，已完成回测使用次要状态 Badge。策略名称和描述设置最大宽度并省略显示，完整内容保留在 `title` 中。

浏览器在 800×900 视口复验策略、投资组合、Provider 和收益分析。策略表格可视宽度 686px、内容宽度 959px，操作表头与单元格右边界均为 778px，与滚动容器右边界一致；投资组合和 Provider 的可用数据表操作列同样固定在右侧，收益配置的“调整”列使用相同 sticky 语义。账户页当前无成交行，运行态没有表格可测，使用源码审计和契约测试补充证据；风险中心当前表格只读，未增加操作列。

新增操作列静态门禁，遍历 Desktop feature 的 TSX，禁止“操作／调整”回退为普通 `<th>`，并验证共享表头和单元格的固定位置、背景与边界契约。最终执行 Desktop 26 个测试文件、184 项测试全部通过，Desktop 类型检查与 `git diff --check` 通过。T9 的实现与专项证据已完成，但其依赖的全站 T2 和最终 T8 尚未完成，因此不提前勾选任务。

## 日期时间展示专项（2026-09-08）

### 审计范围与结论

对 `apps/desktop/src` 全量搜索日期构造、国际化格式化和时间字段，命中 59 个源码路径。按用户可见展示逐项复核后，发现并修复三类原始 ISO 泄漏：

| 状态 | 范围 | 结论 |
| --- | --- | --- |
| 已修复 | 策略实验：策略库、回测设置、回测结果 | Schema／结果数据时点统一显示中文本地时间；任务返回的带时间日期区间、权益和交易日期统一为 `YYYY-MM-DD`。 |
| 已修复 | 研究助手：来源链 | 观察、市场、可用和抓取时间统一通过共享 formatter 展示。 |
| 已正常 | 账户数据、风险中心、收益分析、投资组合、数据与自动化、市场详情、截图导入、投资复盘、研究运行列表／详情 | 原有页面已使用 `Intl` 或 feature formatter 显示本地时间，无 `T`／`Z` 原样输出；本轮未为形式统一而改动其业务文案或精度。 |
| 合理排除 | `date`／`month`／`datetime-local` 表单值、业务日期区间、API 参数与响应映射、JSON／高级编辑器、导出和日志 | 前三类保留 `YYYY-MM-DD`、`YYYY-MM` 或控件本地值；机器可读载体不属于 UI 展示，未修改存储或传输格式。 |

新增 `apps/desktop/src/lib/date-display.ts`：`formatDateTime` 面向用户可见时点，格式为中文本地时间并对缺失／无效值返回调用方占位；`formatDateOnly` 仅用于把带时间值收敛为业务日期。两者均保留原本就是纯日期或月份的值，避免时区换日和表单语义回归。

### 自动化与浏览器证据

- `date-display-contract.test.ts` 覆盖 ISO 到本地时间、纯日期／月份保留、无效占位和关键 JSX 不直接插入时间字段；策略和研究现有 UI 测试覆盖相关入口。
- Desktop 全测试：27 个测试文件、186 项通过；Desktop 类型检查通过；`git diff --check` 通过。
- 浏览器（`localhost:5173`）：
  - 策略实验策略库、回测设置截图：`2026-09-08T09:31:12.039Z` 显示为 `2026/09/08 17:31:12`，无 `T`／`Z`。
  - 回测结果：数据时点为 `2026/09/08 17:31:12`；原先含时间的区间显示为 `2025-09-08 至 2026-09-08`。
  - 投资组合：数据时点显示为本地时间；数据与自动化：Provider 健康检查时间显示为本地时间；风险中心：数据时点、风险数据更新时间及事件时间均显示为本地时间。

本专项完成 T10／AC12，不改变原全站视觉与交互任务中仍待验收的范围，也未提交或部署。

## 研究助手首屏与主从交互专项（2026-09-08）

### 问题与处理

原首屏同时在标题区、任务列表和详情区提供三个同义创建入口，任务列表与标题区各有一个刷新入口；“查看问题模板”实际仍直接打开空白新建侧栏。左侧筛选在常用桌面宽度出现不必要的横向滚动条，Provider 未配置状态只有标签，没有就近恢复动作。

本轮将确认无历史任务的“全部”范围收敛为单一工作区级引导，只保留一个“新建研究”主操作，并展示三个共享问题模板。模板与新建侧栏读取同一份定义，点击后预填问题但不自动提交；标题区在首次空状态隐藏重复创建按钮，任务存在、筛选非“全部”或读取失败时恢复。刷新统一到共享页头按钮；Provider 未配置、Provider 异常和能力检查失败均提供进入“数据与自动化”的明确入口。

任务主从布局继续保留，但列表栏在常用桌面宽度使用 17rem／19rem 两级宽度，筛选间距收紧；列表、详情、骨架、请求失败和筛选为空分别呈现，不再把首次读取失败渲染成创建引导。研究接口、查询键、只读边界和任务结果结构未修改。

### 浏览器与自动化证据

- 1440×900 浅色和深色：首屏只有一个“新建研究”按钮，三个模板完整可见，页面无水平溢出；Provider 配置入口的目标为 `/providers`。
- 1024×768：首次引导保持双栏，主说明区与模板区分别约为 382px 和 306px，页面无水平溢出。
- 390×844：首次引导改为单栏，页面、引导和模板卡片均使用 358px 可用宽度，无水平溢出。
- 点击“主要风险”模板后，新建侧栏问题为预期完整文案，Provider 未配置时开始按钮保持禁用；关闭后焦点返回该模板入口。
- Desktop 全测试 29 个文件、203 项通过，其中研究助手 UI 契约测试 7 项；Desktop 类型检查、生产构建、修改文件 ESLint、13 项无障碍静态检查与 `git diff --check` 通过。生产构建仅保留既有大分块提示。

当前服务没有研究任务，因此未用真实任务复验列表行、详情结果和各筛选结果的浏览器视觉；对应状态已由源码审计和 UI 契约测试覆盖，T11 保持未勾选，不把静态证据替代为真实数据验收。没有创建研究任务、修改账本、提交或部署。
