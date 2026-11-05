# 现金页面布局优化验收记录

本记录保存基础现金页批次的输入与证据；定期入账的当前分组和截图见[定期入账验收](2026-11-05-recurring-cash-layout.md)。

## 范围与结论

本记录仅验收本地 Desktop/Web 现金页面的展示改动。现行行为依据[规格](../specs/2026-11-05-cash-page-layout.md)，实施状态由[任务](../archive/tasks/2026-11-05-cash-page-layout.md)维护。真实组件使用固定数据渲染，并加载本次生产构建的 CSS；这不是连接目标 API 的业务端到端验收，也不证明目标 Docker 已更新。

## 实现核对

- `AccountDataCashSections.tsx`：突出原币余额；单币种且同本位币时去掉重复合计；可靠多币种合计和缺汇率提示保留。数据完整度移到可用现金旁并明确为现金数据。
- 应收、应付保留原有计数和按币种汇总；空待结算缩为一行，有记录继续展示名称、代码、日期、方向、金额和备注。
- 流水使用紧凑日期列及右对齐金额，币种靠近金额；结算状态移到分组说明；默认五条及查看全部／收起仍使用原状态和事件处理。
- `AccountDataRecurringCashDeposits.tsx`：统一标题层级、去掉外层重复边框和说明，将空待确认合并到分组标题行；计划及历史操作保留，弹窗代码不变。
- 无新增依赖、全局 CSS、请求、服务端字段或金额算法。两个组件从本次修改前的 678／662 行缩至 675／658 行。
- 与 `/tmp/thesis-ledger-cash-layout-20261105/` 中本次修改前副本比较：现金读模型、汇总与格式化函数逐字一致，定期入账表单及提交部分逐字一致；权限、查询和刷新代码未改变。

## 自动验证

执行目录默认是 `apps/desktop`，日志保存在 `/tmp/thesis-ledger-cash-layout-20261105/`。npm registry 使用工作区要求的 `https://registry.npmmirror.com`。

| 检查             | 命令及结果                                                                                                                                                                                                                                                                                      | 输入范围                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 现金定向回归     | `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run test/account-data.cash.test.tsx test/account-data.ui.test.tsx src/features/account-data/AccountDataRecurringCashDeposits.test.tsx src/features/account-data/AccountDataCashSections.test.tsx --reporter=dot`：4 文件、46 项通过 | 两个目标组件、现金契约、页面读取及交互          |
| 最后测试文件调整 | `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/features/account-data/AccountDataCashSections.test.tsx --reporter=dot`：6 项通过                                                                                                                                            | 新增展示回归；调整异步测试刷新方式以满足 ESLint |
| 类型与构建       | `pnpm run build`：通过；其后 `pnpm run typecheck`：通过                                                                                                                                                                                                                                         | Desktop 与其工作区依赖；最终展示代码与测试      |
| 定向 ESLint      | 仓库根目录 `pnpm exec eslint apps/desktop/src/features/account-data/AccountDataCashSections.tsx apps/desktop/src/features/account-data/AccountDataRecurringCashDeposits.tsx apps/desktop/src/features/account-data/AccountDataCashSections.test.tsx`：通过                                      | 本次三个源码／测试文件                          |
| 模块边界         | 仓库根目录 `pnpm exec node scripts/check-boundaries.mjs`：`Import boundaries: OK`                                                                                                                                                                                                               | 当前工作区源码                                  |
| 格式             | 三个目标文件 `pnpm exec prettier --check`：通过                                                                                                                                                                                                                                                 | 本次源码与测试                                  |

构建保留已有大 chunk 提示。新增测试覆盖：单币种去重、多币种可靠折算、缺汇率、单一外币本位币合计、非空待结算名称／备注、流水实际展开收起、加载及首次失败重试。原定期入账回归继续覆盖新建、确认、跳过、关闭保护和失败重试。

## 全量回归的限制

`NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --reporter=dot`：217 文件中 213 通过、4 失败；1249 项中 1245 通过、4 失败。失败来自本次未修改的代码，不将全量测试记为通过：

| 测试                                          | 失败内容                                              |
| --------------------------------------------- | ----------------------------------------------------- |
| `test/list-frame.contract.test.tsx`           | `RuleSourceMonitorPanel.tsx` 的原生表格边框所有权声明 |
| `test/sticky-table-actions.contract.test.tsx` | 同一规则监测表格的操作列声明                          |
| `test/market-data-provider-ui.test.tsx`       | 测试预期 3 个一级页签，当前渲染 4 个                  |
| `test/ui-contract.test.tsx`                   | `reference-start`／`reference-end` 使用原生日期输入   |

首次使用 Node 26 默认 Web Storage 环境运行时另有 localStorage 相关失败；关闭实验性 Web Storage 后消除该环境干扰，保留上述四项真实失败。没有为通过测试修改其他模块或测试期望。

## 浏览器验证方式

使用已安装的 Microsoft Edge，`CHROME_PATH=/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`。仅使用 taste skill 自带脚本；每次一个独立无界面浏览器，脚本关闭自己的进程。没有修改 skill 的检查器或资源。

固定数据覆盖基本余额和三条流水、一个计划；补充多币种缺汇率、非空待结算／待确认、长金额和首次读取失败。渲染使用真实 `CashSection` 及其子组件，QueryClient 缓存预置固定数据，未连接 API。临时渲染入口已移出仓库。

预览容器使用与应用一致的原子类，额外加一个无样式 `.wrap` 标记供检查器识别；不把它加入产品代码。截图未包含应用外壳，因此不将这些证据扩大为全站布局验收。

基础场景在 1440、1024、820、768、390 宽度逐张检查。五个宽度均 `overflowX: false`，无浏览器错误；余额、空状态、流水金额及操作入口没有横向溢出。布局检查器的营销页假设按下表处理。

## taste 检查器结果与适用性

`consistency.mjs` 使用五个宽度，记录 **52 FAIL、20 WARN**，原始结果见临时目录的 `preview/.taste-skill/consistency-basic/report.json`。不能将整个检查器结果写成通过。所有 FAIL 的类别及数量如下：

| 检查项                                                   | 数量        | 本页处理依据                                                                                                                 |
| -------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `text-only`、`no-visual`                                 | 3、2        | 此处是现金业务界面本身，原币金额与流水是真实 UI 内容；不增加营销图或渲染效果                                                 |
| `copy-headline`、`one-heading`                           | 1、4        | 预览是应用中的现金分区，保留现有 h2／h3 层级，不新造营销 h1                                                                  |
| `copy-actions`                                           | 5           | 检查器将整页视为 Hero；现金入账、划转、新建计划分别属于现有业务操作，按用户要求保留                                          |
| `hero-screen`、`section-height`、`section-air`           | 4、4、3     | 工作页按内容自适应，允许滚动，不按营销页强制每区一屏或规定留白比例                                                           |
| `one-section`                                            | 3           | 总览是有背景的余额分组，保留业务层级；不改成营销页面独立全屏色带                                                             |
| `container-edges`、`row-lines`、`split-pair`、`off-grid` | 11、6、2、4 | 检查器要求单一十二列营销网格；本页使用余额主次比例、内边距、固定日期列、右对齐金额和状态标签。已逐张核对外侧边缘及数据列一致 |

`layout/check.mjs` 同样报告 `edge-left`、`screen-short`、`hero-fold`：分别来自流水列内部对齐和营销页整屏要求。五个宽度均无横向溢出。首次直接检查因缺少 `.wrap` 返回不完整结构；添加预览容器标记后完成全部尺寸检查，不修改检查脚本。

相关通用检查 `spill`、`off-viewport`、`overlap-text`、`cut-text`、`contrast`、`text-contrast`、`button-contrast` 均通过。`font-load` 对现有系统字体 `SF Pro Text` 报警；保留项目的系统字体回退。`centre-axis`、`stranded-action` 和 `fold-cut` 属于右侧状态／操作区及可滚动列表场景，保留原有交互布局，不视为运行态验收通过的替代证据。

## 截图与性能

`perf.mjs` 对 1440 和 390 两个宽度分别运行 3 次：**0 FAIL、0 WARN**，两者 CLS 均为 0，断链请求 0。固定数据页面无客户端 JavaScript，结果只描述该布局预览的资源与稳定性，不代表完整应用的启动或交互性能。

五个基础宽度及多币种／待结算／待确认、长金额、首次失败场景均使用 `shoot.mjs` 生成完整截图并逐张复核；未发现遮挡或横向溢出。首次失败无缓存时仅显示原有失败与重试入口，待确认存在时保留确认／跳过及逾期提示。

完整截图、检查器结果、日志与源码 SHA-256 清单保存在本地 `/Users/yzin/.codex/visualizations/2026/11/05/01a1aa9f-a6f8-7631-95a5-5d400a1dc132/cash-page/`。桌面预览为 `basic-1440.png`，窄屏为 `basic-390.png`，多状态为 `pending-390.png`、`large-390.png`、`error-390.png`。这些生成产物未加入 Git。临时渲染源码与原始日志目录为 `/tmp/thesis-ledger-cash-layout-20261105/`。

## 最终边界

没有提交、推送、部署、Docker 操作、数据库写入或外部 Provider 调用；保留工作区其他既有改动。不存在新增资产、照片、价格、地址或营销内容。代码与固定数据的布局验收不代表目标服务已加载新页面。
