# 定期入账分组与布局验收

## 验收范围

按[现金页面规格](../../specs/2026-11-05-cash-page-layout.md)的 AC4–AC6，调整 Desktop/Web 的定期入账展示。当前状态由[实施任务](../tasks/2026-11-05-cash-page-layout.md)维护。

## 页面组织

- 标题旁显示已读取的空待确认状态；有待确认记录时，使用独立待办区域，保留确认、跳过及逾期提示。
- 入账计划和入账历史分别使用已有 Card；容器宽度达到 48rem 时并排，较窄时上下排列。标题、计数、名称、状态、金额与时间分层展示。
- 计划金额位于记录右侧，周期与下次时间位于名称下方；已结束计划继续显示，已结束状态不渲染没有可执行项目的菜单。
- 历史记录显示计划名、已确认／已跳过状态、期次、实际金额和到账时间；已跳过记录保留恢复待确认操作。
- 加载和失败状态保留，未读取的数据不展示为已知零条；原有读取失败与重试提示继续使用。
- 仅使用项目原子类、容器查询和现有 Card、Badge、Empty；无新增 CSS、依赖或请求。

## 行为与静态验证

执行前副本及日志位于 `/tmp/thesis-ledger-recurring-layout-20261105/`。对比确认：操作状态与回调部分逐字一致，`PlanEditorSheet` 之后的表单、提交及草稿保护代码逐字一致。金额格式化与实际金额回退表达式保持原语义。

| 检查           | 输入与命令                                                                                                                                                                                                                                                                                   | 结果                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 定向回归       | `apps/desktop`：`NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run test/account-data.cash.test.tsx test/account-data.ui.test.tsx src/features/account-data/AccountDataRecurringCashDeposits.test.tsx src/features/account-data/AccountDataCashSections.test.tsx --reporter=dot` | 4 文件、46 项通过           |
| 类型与生产构建 | `apps/desktop`：`pnpm run build`                                                                                                                                                                                                                                                             | 通过，保留现有大 chunk 提示 |
| 定向 ESLint    | 仓库根目录：`pnpm exec eslint apps/desktop/src/features/account-data/AccountDataRecurringCashDeposits.tsx`                                                                                                                                                                                   | 通过                        |
| 模块边界       | 仓库根目录：`pnpm exec node scripts/check-boundaries.mjs`                                                                                                                                                                                                                                    | 通过                        |
| 格式与差异     | 目标源码通过 `prettier --check`；最终文档检查链接与 `git diff --check`                                                                                                                                                                                                                       | 通过                        |

npm registry 使用工作区约定的 `https://registry.npmmirror.com`。本次没有改变金额读模型、API、其他现金展示文件；相应基础证据复用[现金页验收记录](2026-11-05-cash-page-layout.md)。没有重复全量前端测试，不改变该记录中四项其他模块失败的结论。

## 浏览器场景

使用真实 `RecurringCashDeposits`、预置 QueryClient 数据以及本次生产构建的 CSS，通过 taste skill 自带脚本调用已安装的无界面 Microsoft Edge。每次运行只使用一个浏览器，不修改 skill 脚本。临时渲染入口已移出仓库，预览不连接 API。

- 基础场景：一条已结束计划，每月 1 日、计划金额 110 元；一条 2026 年 10 月的已确认历史，实际入账 100 元。
- 补充场景：启用与已结束计划并存、待确认及逾期提醒、已确认和已跳过历史、恢复入口。
- 空数据：计划与历史分别展示空状态，标题旁保留无待确认说明。
- 宽度：1440、960、390；宽屏还将额外减少预览高度，以便直接查看整个分区。

`layout/check.mjs` 在 1440×900、960×720、390×844 下均记录 `overflowX: false`。逐张核对：计划与历史在宽容器中并排，在 390 下堆叠；标题、金额与状态可读，当前分区操作可达。

检查器报告 `screen-short`／`hero-fold`，原因是应用分区按内容高度展示，保留滚动页面，不使用营销页整屏 Hero。1440 和 960 下还报告 `edge-left`／`edge-right`：分别来自 Card 内容内边距、右对齐金额及标题旁状态；已核对两个 Card 外缘和内部行的对齐。390 下无边缘类报告。没有更改检查器或产品布局来迎合营销网格要求，整体检查器退出码仍为 1，不记为全部通过。

完整截图已逐张复核：一条已结束计划与已确认历史在宽屏并排；非空待办在计划及历史之前，确认／跳过入口可达；已跳过记录可恢复；空数据独立说明，无遮挡和横向溢出。

截图、原始检查器结果、相关日志与当前源码 SHA-256 保存在本地 `/Users/yzin/.codex/visualizations/2026/11/05/01a1aa9f-a6f8-7631-95a5-5d400a1dc132/cash-page/recurring/`。`basic-960.png` 为按附图数据生成的分区预览；`basic-390.png` 为窄屏；`multiple-960.png`／`multiple-390.png` 覆盖多记录和待办；`empty-390.png` 覆盖空数据。图片均为固定数据预览，未纳入 Git。

## 执行边界

本次仅修改本地页面，未提交、推送、部署或更新 Docker，未写入数据库或调用外部 Provider。固定数据截图不证明目标服务已加载新代码。
