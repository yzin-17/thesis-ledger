# J8.2 键盘与窄屏验收

对应[收口任务 J8.2](../2026-10-05-journal-review-completion.md)，核对完整规格 AC8、AC15 的键盘与布局断言。结论：通过。真实内置浏览器的实际操作、焦点与布局读数以及 21 张截图共同支持本叶结论。

## 环境与证据边界

- 时间：2026-10-05；地址：`http://localhost:5173/test/browser-journal-review.html`。沿用 J8.1 的 Vite 服务及 Codex 内置浏览器，没有再次出现保存权限拒绝。
- 页面直接挂载正式复盘工作台、候选、单笔、周期、历史及草稿 Sheet。固定请求输入在页面内处理；这是正式组件在真实浏览器中的交互及布局证据。快照保存在固定页内，本轮没有访问业务服务或发起 AI 研究任务。
- 视口依次设置为 `1280 × 900` 和 `390 × 844`。普通页面保留 11px 垂直滚动条，可用宽度分别为 1269px、379px；Sheet 或下拉弹出时滚动锁定，可用宽度可恢复为请求宽度。验收结束已恢复默认视口，保留页面和服务供后续任务使用。
- 代码基线为未提交工作区，`HEAD=514abeebfe57bac0c16271439d8b777ff3b02a9f`。本叶只修改生产文件 `apps/desktop/src/features/journal/review/JournalReviewWorkspace.tsx` 的三个面板焦点样式及本叶文档；该文件修复后 SHA-256 为 `733a28c5a5e5b0dc4b23724cada7f278305ddde23d4a5d387bf8a4060fdfbaa5`。
- [截图目录](j82-browser-2026-10-05/)包含 21 张 JPEG，总计 2,784,174 字节；全页截图用于正文和布局，视口截图用于焦点、下拉及滚动后的操作栏。

## 实际操作与结果

| 用例 | 步骤与实际结果 | 截图 |
| --- | --- | --- |
| J82-01 桌面主流程 Tab | 从复盘账户开始，依次 Tab 到标的筛选、应用筛选、当前复盘标签、面板、候选起点、终点、应用窗口、选择对象；Enter 选择对象。账户和输入显示 2px 焦点轮廓，按钮显示 3px 轮廓。面板最初缺少可见焦点，修复后三个面板均为蓝色实线 2px。通过。 | [候选选择焦点](j82-browser-2026-10-05/01-desktop-tab-focus.jpg)、[单笔面板修复后](j82-browser-2026-10-05/04-desktop-panel-focus.jpg) |
| J82-02 桌面模式与查询 | 用右方向键移动到周期标签，再 Enter 激活；Tab 依次到面板、统计窗口、周期起点、终点和分析按钮。继续以方向键及 Enter 激活历史，Tab 到面板、保存起点、终点、查询按钮。当前标签参与 Tab，方向键移动焦点后须 Enter 激活；没有跳入隐藏面板。通过。 | [周期面板](j82-browser-2026-10-05/05-desktop-period-focus.jpg)、[历史面板](j82-browser-2026-10-05/06-desktop-history-focus.jpg) |
| J82-03 桌面 Sheet | 对草稿按钮按 Enter，初始焦点为计划入场价；Tab 依次到退出价、止损价、持有天数、说明、取消、使用原计划、应用草稿、关闭，再回到入场价。焦点保持在 Sheet 内且轮廓可见。Escape 关闭后焦点返回“核对与补充本次草稿”，保持可见轮廓。通过。 | [Sheet 字段焦点](j82-browser-2026-10-05/02-desktop-sheet-focus.jpg)、[Escape 恢复](j82-browser-2026-10-05/03-desktop-escape-restore.jpg) |
| J82-04 标签点击 | 保持持有天数输入焦点，分别点击入场价、退出价、止损价、草稿说明标签，焦点仍在持有天数；保持止损价焦点再点击持有天数标签，焦点仍在止损价。页面上保持候选终点焦点点击候选起点及标的标签，焦点不迁移；周期终点焦点下点击统计窗口及起点标签、历史终点焦点下点击保存起点标签，结果相同。点击账户说明后账户未聚焦且 `aria-expanded=false`。直接操作输入和下拉仍正常。通过。 | [Sheet](j82-browser-2026-10-05/02-desktop-sheet-focus.jpg)、[窄屏账户实际展开](j82-browser-2026-10-05/18-narrow-account-options.jpg)；标签断言另由实际焦点读数记录支持 |
| J82-05 桌面正文 | 选择明确关联原计划，选择对象并开始复盘；真实成交、原计划、指标表、证据正文及草稿/保存入口可读。周期自定义分析和展开样本、历史正文在桌面复验。三种正文均无页面横向溢出，工作台保持纵向滚动。通过。 | [单笔](j82-browser-2026-10-05/07-desktop-analysis.jpg)、[周期](j82-browser-2026-10-05/20-desktop-period-body.jpg)、[历史](j82-browser-2026-10-05/21-desktop-history.jpg) |
| J82-06 390px 单笔与表格 | 将同一原计划及确定性结果切到 390px；候选、来源、事实、计划、结果和说明可读，主要按钮换行后可操作。真实退出表容器宽 297px、内容宽 373px；在表格内实际横向滚动，`scrollLeft` 从 0 到 76.5px，右侧净收益可读，文档宽仍为 379px。入场表宽 297px、内容宽 334px，同样由表格自身容器承载。通过。 | [单笔全页](j82-browser-2026-10-05/08-narrow-single-analysis.jpg)、[表格滚动后](j82-browser-2026-10-05/13-narrow-trade-scroll.jpg) |
| J82-07 390px Sheet 与长草稿 | Enter 打开 Sheet，初始焦点在入场价；填写 35 次重复中文说明，逐个 Tab 到所有字段及三个页尾动作，聚焦自动滚动使动作保持在视口内。稳定后的末尾 Tab 回到入场价，入场价 Shift+Tab 回到关闭按钮。Sheet 高 844px，长草稿时内容高 1250px，使用内部纵向滚动；没有横向溢出。Escape 关闭且恢复草稿按钮焦点，未应用的长草稿未进入保存结果。通过。 | [Sheet 初始状态](j82-browser-2026-10-05/09-narrow-sheet-top.jpg)、[Sheet 键盘状态](j82-browser-2026-10-05/10-narrow-sheet-keyboard.jpg)、[滚动后的操作栏](j82-browser-2026-10-05/12-narrow-sheet-footer.jpg)、[焦点恢复](j82-browser-2026-10-05/11-narrow-escape-restore.jpg) |
| J82-08 390px 保存与历史 | 在固定页按 Enter 显式保存，切换历史后按 Enter 读取该条快照；列表长标题换行，确定性结果、成交、原计划及保存时草稿可读。原始 JSON 保持折叠，列表和正文均可纵向滚动，无文档横向溢出。通过。 | [历史列表](j82-browser-2026-10-05/14-narrow-history.jpg)、[历史正文](j82-browser-2026-10-05/15-narrow-history-detail.jpg) |
| J82-09 390px 周期与操作入口 | 选择混合样本、自定义 `[2026-01-01T00:00:00Z, 2026-02-01T00:00:00Z)` 并分析；完整周期和减仓独立呈现 4/2 USD，证据不足说明换行可读。展开两个样本详情，Tab 可到折叠入口、完整周期样本、减仓折叠入口、减仓样本，均有焦点。减仓样本 Enter 后定位单笔对象；草稿和开始复盘按钮可由 Tab 依次到达。AI 操作入口与配置链接可见，本轮没有执行付费动作。通过。 | [周期结果](j82-browser-2026-10-05/16-narrow-period-analysis.jpg)、[展开样本全页](j82-browser-2026-10-05/17-narrow-period-samples.jpg)、[正文与样本焦点](j82-browser-2026-10-05/19-narrow-period-body.jpg) |
| J82-10 390px 账户下拉 | 按 Enter 打开账户下拉，两个中文账户标签完整可读，弹出层没有横向溢出；Escape 关闭后焦点恢复账户触发器，2px 蓝色轮廓可见。通过。 | [账户下拉](j82-browser-2026-10-05/18-narrow-account-options.jpg) |

焦点读数来自实际 `document.activeElement`、`:focus-visible` 及计算样式；布局读数来自当前文档和可见滚动容器。Sheet 的循环在焦点守卫完成转移后再次读取，稳定焦点没有停留在隐藏守卫或背景。没有使用程序直接设置焦点替代键盘操作。

## 页面布局读数

| 视口 / 页面 | 文档可用宽度 | 文档内容宽度 | 内容高度 | 结论 |
| --- | --- | --- | --- | --- |
| 1280 × 900 / 单笔结果 | 1269 | 1269 | 2843 | 纵向滚动，无横向溢出 |
| 1280 × 900 / 周期展开样本 | 1269 | 1269 | 2158 | 纵向滚动，无横向溢出 |
| 1280 × 900 / 历史正文 | 1269 | 1269 | 2544 | 纵向滚动，无横向溢出 |
| 390 × 844 / 单笔结果 | 379 | 379 | 4467 | 表格局部横向滚动，页面无横向溢出 |
| 390 × 844 / 历史列表 | 379 | 379 | 1599 | 长标题换行，无横向溢出 |
| 390 × 844 / 历史正文 | 379 | 379 | 4044 | 正文可读，无横向溢出 |
| 390 × 844 / 周期展开样本 | 379 | 379 | 2844 | 说明及入口换行，无横向溢出 |
| 390 × 844 / Sheet | 390 | 379 | 4467（背景） | Sheet 自身宽 374px、高 844px；内部可滚动，无横向溢出 |

## 发现与修复

三个正式 `TabsContent` 本身参与 Tab 顺序，但原 `outline-none` 使焦点位置不可见。只在复盘工作台现有面板组合 `focus-visible:outline-2`、`focus-visible:outline-offset-2`、`focus-visible:outline-solid`、`focus-visible:outline-ring`，保留既有 DOM、模式切换、请求和业务行为。第一次只设宽度和颜色时仍继承 `outline-style:none`；补齐实线样式后，三个面板分别在真实浏览器复验并截图。

未新增 CSS 选择器或 `!important`，未修改共享 Tabs、Sheet 或标签组件。固定输入和确定性逻辑未变；J8.1 的状态断言继续有效，受影响的面板焦点与布局以本叶新证据为准。

## 定向验证与收口

2026-10-05 20:47 起，在 `apps/desktop` 执行：

- `pnpm exec vitest run test/journal-object-interaction.ui.test.tsx test/journal-candidates-interaction.ui.test.tsx test/journal-period-interaction.ui.test.tsx test/journal-snapshot-interaction.ui.test.tsx`：4 文件、24 项通过。候选局部状态用例输出一次 React `act` 提示，测试无失败；没有为焦点样式编写镜像式断言。
- `pnpm typecheck`：通过，生产源码无类型错误。
- `pnpm exec eslint src/features/journal/review/JournalReviewWorkspace.tsx` 与同文件 Prettier 检查：通过。

仓库根执行 `node scripts/check-boundaries.mjs`、`GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`、`git diff --check`，并检查本叶文档格式和本地链接。边界、尺寸 ratchet 及文档检查通过；尺寸检查保留 9 个未增长的存量警告。未重跑未受影响的数据库升级、目标恢复、完整构建或远端 CI。

本叶仅关闭 J8.2，Task 与 Review 已同步。J8.3 的既有真实报告消费与刷新恢复、J8.4 当前提交的远端 CI、J8.5 完整 AC 对账保持未完成；原 T4—T7 和收口任务尚未归档。工作区改动保持未提交。
