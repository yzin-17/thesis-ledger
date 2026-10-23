# 投资复盘工作区布局任务

规格：[投资复盘工作区布局](../specs/2026-10-24-investment-journal-layout.md)。证据：[验收记录](../reviews/2026-10-24-investment-journal-layout.md)。

## 当前状态

实施中。范围限于复盘工作区和候选时间筛选，保留工作区内既有未提交改动。

## 可独立验证的任务

- [ ] J1：整理账户、标的、标签页和高级入口布局。写入范围为 `JournalReviewWorkspace.tsx`、`JournalAccountSelector.tsx`、`JournalLegacyJsonReview.tsx`；验证账户、筛选、标签页及高级入口交互，对应 AC-01、AC-04、AC-05。
- [ ] J2：提取候选时间筛选面板并收敛结果空状态。写入范围为 `JournalCandidateBrowser.tsx`、`JournalCandidateWindowFilter.tsx`、`JournalReviewFeedback.tsx` 和相关候选测试；验证时间边界、错误保留、应用后关闭和分页不变量，对应 AC-02、AC-03、AC-04。
- [ ] J3：完成定向回归、包级静态检查和三种宽度的固定输入浏览器检查。只给既有浏览器夹具增加无调试工具栏的布局入口，记录前后截图、视觉评审和未验证边界，对应 AC-01 至 AC-06。

## 验证与停止条件

先运行改动边界的定向交互测试，再执行 desktop 类型检查，最后检查固定输入的真实浏览器。已通过且输入未改变的检查不重复运行。全部验收通过后完成一致性评审；出现业务契约变更、真实外部调用或部署需求时保留边界并记录缺口。
