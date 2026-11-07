# 桌面端日期选择盘点与验收

Spec：[日期选择合同](../../specs/2026-11-06-desktop-date-selection.md)；当前状态由 [Task](../tasks/2026-11-06-desktop-date-selection.md) 持有。验证日期：2026-11-06 UTC；本机测试日志采用 UTC+8，部分时间显示为 11 月 7 日凌晨。

## 问题与修复边界

用户截图是“新建基金定投”的开始月份原生弹层。此前公共 DateInput 只覆盖收起态，展开后调用浏览器 `showPicker()`，无法使用应用的选中态、主题和层级。

本次保留全部业务调用，通过 DateInput 组合共享 InputGroup、Popover、Calendar 和月份面板。月份、日期及日期时间均打开应用面板；键盘聚焦仍可直接编辑原生输入的年月日和时间片段，Alt+↓、Enter、空格、F4 打开应用面板。Escape 关闭当前弹层后返回输入；Drawer 的下一次 Escape 才关闭 Drawer。

日期时间显示保留全部已有秒和毫秒；选择新日期仅替换日期部分，不新增 UTC 转换。真实表单继续提交原生 date、month、datetime-local 字符串，范围规则及 Journal 的 UTC 转换由原业务负责。面板的年份、时间字段隔离外层 Base UI Field，避免重复 id、名称继承及表单重复字段。

没有新增 CSS 选择器或 `!important`；日历清除继承的数据表格单元格边框和内边距使用原子类。新增 `react-day-picker@10.0.2`，其 date-fns 与时区包保留为传递依赖；没有改写已有 Button。公共组件不依赖业务特性或请求。

## 全仓入口清单

检查 `apps/desktop/src` 的日期类型、DateInput 调用、Journal 包装器与范围筛选。共 18 个业务源码文件、32 处直接 JSX 调用；其中实验日期映射生成 4 个输入，Journal 包装器被 3 个消费者各调用 2 次。将这两种复用展开后约为 40 个日期字段定义，实际同时展示数取决于路由和条件。

以下路径均相对 `apps/desktop/src/features/`：

| 业务入口                                                  | 直接调用数 | 保留的语义                                           |
| --------------------------------------------------------- | ---------: | ---------------------------------------------------- |
| `account-data/AccountDataCashDepositSheet.tsx`            |          1 | 实际入账本地日期时间                                 |
| `account-data/AccountDataCashObservationSheet.tsx`        |          1 | 观察时间及当前时间上限                               |
| `account-data/AccountDataCashTransferSheet.tsx`           |          1 | 划转发生时间                                         |
| `account-data/AccountDataCashTransferCorrectionSheet.tsx` |          1 | 更正后的发生时间                                     |
| `account-data/AccountDataExecutionSheet.tsx`              |          2 | 按时间精度切换日期/日期时间；结算时间                |
| `account-data/AccountDataRecurringCashDeposits.tsx`       |          2 | 计划开始月份；实际确认时间                           |
| `account-data/AccountDataRecurringFundInvestments.tsx`    |          2 | 开始月份；成交日期                                   |
| `portfolio/PortfolioPositionFields.tsx`                   |          1 | 初始快照的实际观察时间                               |
| `portfolio/PortfolioTradeOpeningBoundarySheet.tsx`        |          1 | 开仓边界时间、分钟步长、上限及只读状态               |
| `market-data/MarketReferenceSheet.tsx`                    |          2 | 资料查询的起止日期                                   |
| `strategy/BacktestSetupDialog.tsx`                        |          2 | 回测起止日期                                         |
| `strategy/NavBacktestSetupSections.tsx`                   |          4 | 净值回测及研究预热区间                               |
| `strategy/StrategyExperimentDateFields.tsx`               |          1 | 映射生成开发集、验证集和封存测试的 4 个日期          |
| `strategy/StrategyOptimizationExperimentPanel.tsx`        |          4 | 优化实验的连续区间                                   |
| `journal/JournalDashboard.tsx`                            |          2 | 复盘起止日期时间                                     |
| `journal/ManualReviewForm.tsx`                            |          2 | 手工复盘时间窗口                                     |
| `journal/ReviewCandidateList.tsx`                         |          2 | 候选列表起止日期                                     |
| `journal/review/JournalWindowTimeInput.tsx`               |          1 | `step="any"`、UTC 与本地时间转换；供下面三个入口复用 |

Journal 派生入口：`JournalCandidateWindowFilter.tsx`、`JournalPeriodReview.tsx`、`JournalSnapshotHistory.tsx`，各 2 个时间输入。没有将起止输入合并为另一种范围值，也没有修改历史快照或查询参数。图表区间预设、回测周期等枚举选择保留原控件；它们不接受任意日期。Mobile 原生工程不在本次 Desktop 日期控件范围内。

## 定向测试与门禁

下列命令中的 `node` 使用可用的 Codex Node 运行时；执行时从仓库根目录或注明的 Desktop 目录运行，日志只保存失败和统计。对应最终源码包含 Field 身份隔离、原值精度和焦点修复。

| 检查                     | 命令或输入范围                                                                                                             | 最后结果                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 日期、账户表单与实验字段 | Desktop：`vitest run test/date-input.test.tsx test/account-data.ui.test.tsx test/strategy-experiment-date-fields.test.tsx` | 24 项通过                                                            |
| 公共日期合同             | Desktop：`vitest run test/ui-contract.test.tsx -t 'shared date\|native date'`                                              | 2 项通过，其余 17 项不在此定向范围                                   |
| 日期边界规则             | `node --test scripts/date-input-boundaries.test.mjs`                                                                       | 2 项通过                                                             |
| 类型                     | 更新本地 Schemas/API Client 构建产物后，`tsc -p apps/desktop/tsconfig.json --noEmit`                                       | 通过                                                                 |
| 前端产物                 | Desktop：`vite build`，配合上述类型检查                                                                                    | 通过；仍有既有大 chunk 提示                                          |
| ESLint                   | 新增/修改的 4 个 UI 源文件、类型契约、日期单测及浏览器 fixture                                                             | 通过                                                                 |
| 依赖边界                 | `node scripts/check-boundaries.mjs`                                                                                        | 通过；新增日期控件禁止反向业务依赖、原生日期弹层和直接日期输入的门禁 |
| 依赖清单                 | `node scripts/check-workspace-dependencies.mjs`                                                                            | 通过（8 packages）                                                   |
| 可访问性与响应式静态检查 | `node scripts/check-accessibility.mjs`                                                                                     | 13 项通过                                                            |
| 文件尺寸                 | `node scripts/check-file-size-guardrails.mjs`                                                                              | 通过；6 个既有大文件警告，未提供历史基线，不能据此扩大 ratchet 结论  |
| 工作区差异               | 本主题已有跟踪文件的 `git diff --check`                                                                                    | 通过                                                                 |

新增日期单测覆盖：受控月份选择与清除、required、min/max、原生键盘编辑、非受控默认值及 form reset、ref、禁用/只读、聚焦和开关面板不产生变化、秒/毫秒保留、日期时间步长及越界恢复、外层 Field 身份隔离。

## 真实浏览器

独立 Vite 端口 `5175` 与无头 Chromium，避免占用其他任务的页面导航。浏览器 fixture 为 `apps/desktop/test/browser-date-selection.html` 和同名 TSX；使用真实共享组件和生产样式，不访问真实业务写接口。

- 页面、Drawer、Dialog 各在 1440、1024、768、390 宽度、900 高度检查月份、日期、日期时间，共 12 组界面组合。
- 验证点击标签不激活控件、主输入打开面板、月份/日期选择、原生键盘编辑、Alt+↓、Escape、焦点返回、只读/禁用、表单实际提交字符串和精度。
- 检查页面无横向溢出、面板处于视口内、中心命中实际面板，验证嵌套 Drawer/Dialog 的层级和可点击性。
- 在 390×560、390×360 的 Drawer 中复验全部 3 类输入，面板内部可滚动到清除或完成按钮。
- 390 宽度复验深色月份、日期面板。人工查看了受控页面、Drawer、短窗口、深色及真实基金定投截图。
- 浏览器结果：12 组常规界面 + 2 组短窗口通过；独立深色检查通过；没有页面异常。结果文件 `/tmp/date-browser-results.json`，脚本 `/tmp/date-selection-browser.cjs`。

真实数据页面只读验收：从已有实际基金账户打开“新建基金定投”，在四种代表宽度展开开始月份、核对面板边界、Escape 和焦点，再取消 Drawer。所有业务请求限定 GET，未发送写请求、未创建计划。结果文件 `/tmp/date-real-browser-results.json`，脚本 `/tmp/date-real-browser.cjs`。截图仅用于内部检查，未上传或作为用户文件发布。

## 全量测试的边界与剩余失败

桌面包全量测试执行过一次：223 个文件通过、7 个文件失败；1310 项通过、14 项失败（1324 项）。该轮在随后新增 Field 身份隔离回归用例之前；最终 26 项定向测试已复验，不将旧全量统计宣称为最终全绿。

| 失败文件                                                                | 项数 | 现场失败内容                                           |
| ----------------------------------------------------------------------- | ---: | ------------------------------------------------------ |
| `account-data-investments-navigation.ui.test.tsx`                       |    1 | 已结束定投计划默认展开与旧的收起预期不一致             |
| `portfolio-account-filter.ui.test.tsx`                                  |    2 | 并行标的选择器的文案/查询选项预期                      |
| `research-form-v2.ui.test.tsx`                                          |    4 | 标的回显及按钮预期                                     |
| `ui-contract.test.tsx`                                                  |    1 | 风险引导已改为“启用风险规则”，旧测试仍要求“与后台扫描” |
| `features/ai/NewResearchSheet.test.tsx`                                 |    2 | 旧标的回显格式预期                                     |
| `features/market-detail/MarketDetailDialog.latest.integration.test.tsx` |    1 | 基金详情样本的 `toFixed` 输入缺失                      |
| `features/strategy/strategy.v2.test.tsx`                                |    3 | 新增标的查询组件缺少测试 QueryClientProvider           |

这些失败未涉及日期断言，文件由其他并行任务修改或持有；未为日期工作改写其业务逻辑或测试。全量复验仍由当前 Task 持有，待相关任务收口。未逐一人工遍历所有业务表单、全部编辑更正入口及其他浏览器引擎；这些入口已完成代码覆盖盘点，共享契约由定向测试和代表性浏览器组合验证。

## 依赖安装恢复与工具限制

shadcn CLI 预览提示会触及已有 Button，因此读取官方 registry 源码后只新增并适配 Calendar/Popover，保留本地 Button。初始安装超时并引发无关 Electron 依赖的重新下载，过程中共享 Base UI 链接暂时不可用；已停止本任务的安装进程，收窄锁文件到一个直接依赖和三个新增包记录，再以离线 frozen install 恢复。最终安装命令成功，`@base-ui/react`、DayPicker、date-fns 和传递依赖均可解析；没有持续安装进程，其他任务可恢复复验。锁文件仅新增日期依赖记录，没有保留无关依赖升级/去重。

一条包含直接读取 `.npmrc` 的诊断被自动审批拒绝，原因是可能暴露凭据；命令未执行，之后只用进程和公开地址检查，无相关剩余阻塞。

按 recommend skill 核对实际 `es-toolkit@1.51.0`：相关导出只有 isDate 类型判断、pad 字符串填充及计时工具，没有适用于本地日历字符串和时间精度保留的专门函数。已核对导出、声明和 pad 源码，并对照官方 [pad 文档](https://es-toolkit.dev/reference/string/pad.html)与 [isDate 文档](https://es-toolkit.dev/reference/predicate/isDate.html)；pad 负责双侧补齐，isDate 仅判断对象类型。本次仅在日期面板内使用 Date 的本地年月日和原生 `String.padStart`，不新增通用工具库或进行浮点/UTC 转换。shadcn 官方参考：[Input](https://ui.shadcn.com/docs/components/base/input)、[Date Picker](https://ui.shadcn.com/docs/components/base/date-picker)、[Calendar](https://ui.shadcn.com/docs/components/base/calendar)、[Popover](https://base-ui.com/react/components/popover)。

新增 UI 通过复杂度上限 20、函数长度上限 220 的定向 ESLint 检查。专用 5175 预览进程在验收后已停止，共享 5173 服务未停止。

未执行 Docker 操作、未更新镜像或目标容器、未提交 Git。浏览器验收对应宿主机当前源码与现有只读 API，不能作为 Docker 发布证据。

## 最终一致性复核（2026-11-07）

当前重新盘点为 19 个业务源码文件、33 处直接 DateInput 调用；新增 MarketReferenceContractField 的合约清单交易日，沿用 date 原始字符串，日期变化只重置已提交的清单条件，不触发读取或时区转换。该消费者的定向和四宽实际 Drawer 验收由[标的选择证据](../../evidence/2026-11-06-instrument-picker.md)持有；原 18 文件 / 32 调用统计保留其历史范围。

DateInput、类型定义、Calendar、日期面板及 Popover 五个核心源码的 SHA-256 与随后 Drawer 完整矩阵输入一致（/tmp/goal-date-final-core-inputs.json）；原受控浏览器 14 组、真实只读页面 4 组原始结果均无失败或业务写入。因此复用其面板、短窗口、焦点、键盘和原始提交证据，不重复请求真实来源。

当前完整 Desktop 239 文件 / 1377 项、构建及适用仓库门禁通过，见[最新共享集成证据](2026-11-07-allocation-target-precision.md#包检查与门禁)。四项规格验收均完成，原全量失败保留历史记录；本任务不持有未决义务。当前消费清单为 /tmp/goal-date-final-consumers.json，源码输入稳定，不扩大为 Docker 发布结论。
