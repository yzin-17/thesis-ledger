# 研究详情与投资复盘阅读布局验证

## 范围与基线

日期：2026-11-14。基线为当前含大量未提交修改的本地工作区；没有重置、暂存、提交、推送、Docker 操作、业务库写入或真实 Provider 请求。

需求与当前状态分别由 [Spec](../specs/2026-11-14-research-journal-reading.md)、[Task](../tasks/2026-11-14-research-journal-reading.md) 维护。

## 实际入口与实现

- 实际路由 `apps/desktop/src/app/routes.tsx` 的投资复盘入口为 `journal/review/JournalReviewWorkspace`，单笔仍使用 Sheet，周期仍在外层页签中。没有将旧版 `JournalDashboard` 当作实际入口。
- 研究抽屉和完整阅读经 `AiResearchDetailView` 中同一个 `ResearchDetailBody` 进入 `ResearchSavedReport`。成功可读 V2 正文先展示结论、风险、缺口及关键依据，再展示背景和次级工具。短标题优先使用已加载目录名称与研究类型，无法识别时回退代码或短问题。
- 论点可按需展开其理由与绑定材料，材料继续使用原有惰性证据查询。全部字段和原始材料保留在按需入口。只对展示层完全相同的结论、理由去重，不判断近义文本是否等价，不改写保存内容。
- 比较和复核维持原有请求、选择、历史与重试流程，移至正文之后，入口缩为按钮与辅助文字。比较先列证据、输入等变化，具体字段按需展开前后原文，布局使用 `md:grid-cols-2`；表述变化和数值／状态等字段变化分别计数，不推断结论反转。
- 单笔结果使用项目、计划、实际、偏差同行对照，直接展示缺失依据；实际收益另列，反事实单独标明假设含义。分析后的详细事实折叠，模型运行信息后置。开始、重新开始、保存及错误恢复的 controller 未更改。
- 周期通过新增 `JournalPeriodResult` 共用双列统计表，分别展示合格数、观测、排除和时间未知。双零简明说明不可计算指标，单零保留另一组结果。指标直接消费冻结值和状态，未重新计算业务指标。
- 两类快照复用对应结果组件；单笔保留已知过期状态，旧快照显示保存时刻并保留原始记录。周期快照样本下钻只读取保存的候选事实，不查询当前对象或重算结果。周期合同没有当前过期判定字段，未补造过期结论。

## 本轮写入范围

研究源码：`ResearchSavedReport.tsx`、`ResearchInferenceSections.tsx`、`ResearchComparison.tsx`、`ResearchComparisonResult.tsx`、`ResearchObservations.tsx`、`ResearchEvidenceRead.tsx`、`use-research-workbench.ts`。

复盘源码位于 `apps/desktop/src/features/journal/review/`：`JournalObjectReview.tsx`、`JournalFactSummary.tsx`、`JournalMetricTable.tsx`、新增 `JournalPeriodResult.tsx`、`JournalPeriodReview.tsx`、`JournalSnapshotDetail.tsx`、`JournalPeriodSnapshotDetail.tsx`、`JournalAiResult.tsx`、`JournalAiRunPanel.tsx`、`JournalSavedAiExplanation.tsx`、`JournalReviewWorkspace.tsx`、`JournalCandidateBrowser.tsx`、`JournalSnapshotHistory.tsx`。

测试：新增 `test/journal-reading-layout.test.tsx`；更新 `test/research-reports-v2.test.tsx`、`test/research-comparison.ui.test.tsx`、`test/journal-formal-review.ui.test.tsx`、`test/journal-period-interaction.ui.test.tsx`、`test/journal-snapshot-interaction.ui.test.tsx` 及 `src/features/journal/review/JournalPeriodReview.test.tsx`。另新增本主题 Spec、Task 和本证据文件。上述多数源码本来已有未提交修改，本轮是在其基础上增量调整。

## 定向验证

以下命令在当前工作区执行，使用已有及受控样本，不访问真实模型。

```sh
pnpm --filter @thesis-ledger/desktop exec vitest run \
  test/research-reports-v2.test.tsx \
  test/research-comparison.ui.test.tsx \
  test/research-observations.ui.test.tsx \
  test/research-comparison-display.test.ts \
  test/research-account-mode.ui.test.tsx \
  test/research-query-isolation.ui.test.tsx \
  test/journal-object-interaction.ui.test.tsx \
  test/journal-period-interaction.ui.test.tsx \
  test/journal-snapshot-interaction.ui.test.tsx \
  test/journal-formal-review.ui.test.tsx \
  test/journal-candidates-interaction.ui.test.tsx \
  test/journal-reading-layout.test.tsx \
  test/journal-review.ui.test.tsx \
  src/features/journal/review/JournalAiResult.test.tsx \
  src/features/journal/review/JournalPeriodReview.test.tsx --reporter=dot
```

结果：15 文件、106 项通过。其后仅在研究比较与快照测试各增加一项，重跑以下两文件，18 项通过；其他输入未变，复用已通过证据，当前覆盖合计 108 项。

```sh
pnpm --filter @thesis-ledger/desktop exec vitest run \
  test/research-comparison.ui.test.tsx \
  test/journal-snapshot-interaction.ui.test.tsx --reporter=dot
```

核心断言：正文先于工具；风险、缺口先于依据；表述差异不标为观点反转；比较原文默认收起；单笔计划实际同行；反事实独立；缺计划保持证据不足；双零、单零、零值、不适用和缺失依据分别表达；时间未知与排除分开；旧快照保存时刻、已知过期状态及原始字段保留；周期样本下钻保持冻结输入。既有测试同时覆盖每轮 AI 重新生成、保存时绑定本轮成功任务、晚响应、模式隔离与失败恢复。

`journal-review.ui.test.tsx` 是旧版消费者的额外回归，不作为实际路由验收依据。实际工作台由 `journal-candidates-interaction.ui.test.tsx` 覆盖，单笔、周期、快照由对应现行组件测试覆盖。

## 类型、构建及静态检查

- 通过：`pnpm --filter @thesis-ledger/desktop build`，包含 `tsc --noEmit` 与 Vite 生产构建；最后一次源码变更之后通过。后续只修改测试和文档，无需重复构建。
- 通过：对上方列明的 20 个修改源码执行 `pnpm exec eslint <文件列表>`。
- 通过：`node scripts/check-boundaries.mjs`，输出 `Import boundaries: OK`。未修改跨 feature 依赖或门禁规则。
- 通过：本轮相关路径的 `git diff --check`。整仓检查发现其他工作已有空白问题，保留原样，不计入本轮局部通过结论。
- 构建提示仍包含大 chunk 警告；没有因此修改拆包或阈值。Node 的既有 `localStorage` 实验性警告未导致验证失败。

## 原始失败与修正

- 第一轮定向测试的失败来自原文案、双表结构和原始字段隐藏方式的旧断言。按新合同调整断言后通过，没有删除生命周期或错误恢复检查。
- 新增测试最初位于 `src` 并引用外部测试夹具，构建报 `TS6059`；移至 `test/journal-reading-layout.test.tsx`，同时将持有天数样本改为数字后，定向测试和构建通过。
- 首次类型检查发现周期固定指标不能使用任意字符串索引，已按该组的指标键类型读取；之后构建通过。

## 实际浏览器验收：阻塞

已启动本地 Vite 验证入口 `http://127.0.0.1:5188/`。浏览器工具的实际结果如下：

1. 浏览器清单返回 `The browser access host is unavailable`。
2. 选择 `/Applications/Microsoft Edge.app` 返回 `Computer Use was not approved to use Microsoft Edge`。
3. 尝试内置浏览器打开研究受控入口，仍返回 `The browser access host is unavailable`。

已通过会话异步问题请求启用权限。没有绕过工具权限使用其他浏览器控制方式。上述属于工具访问受阻，不是自动审批对 Shell 升权的拒绝。

**尚未执行**：1440、1024、768、390 下的研究抽屉／完整阅读、单笔、周期、两种快照的实际视觉与交互检查，包括横向溢出、长文本、焦点、展开、取消、返回和窄屏前后原文上下布局。组件测试与生产构建不替代这些检查；没有本轮浏览器截图、目标 Electron 或真实服务验收证据。

权限恢复后应先核对当前受控浏览器入口的 API 响应与现行合同，再执行上述矩阵；旧浏览器夹具的历史响应和截图不能直接作为本轮通过证据。

## 一致性复核

本轮源码、定向验证、Spec 和 Task 的范围一致；文档相对链接检查无缺失，局部 diff 空白检查通过。T1—T4 仅表示本地实现与测试完成，AC6 的真实浏览器部分仍由未勾选的 T5 持有，没有转入 TODO 或归档，也没有将整体标记为完成。原有单笔抽屉、周期外层页面、显式保存及冻结历史语义保留。Vite 的本轮进程为 PID `84501`，监听 `127.0.0.1:5188`，可供权限恢复后复验；没有测试进程或子代理仍在运行。
