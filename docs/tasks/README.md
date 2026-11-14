# 当前实施任务

- [竞技场条件委托与成交保护](2026-11-13-arena-contingent-orders.md)。按整笔成交保护、部分成交和分批规则分期验收。


- [策略定义统一与双向编辑](2026-11-13-strategy-definition-authoring.md)。双端编辑、AI 确认与历史回放的联合实施入口。











- [实验重试冻结校验修复](2026-11-12-experiment-retry-catalog-revalidation.md)：代码与真实冻结复验通过；一次原实验重试确认模型地址连接失败，保留候选完整执行验收缺口。

- [开发库不备份升级](2026-11-12-development-upgrade-without-backup.md)：本地与隔离验证完成；仅保留不备份分支真实目标执行缺口，原增列已由并行默认升级完成，不重复执行。

- [自主交易竞技场](2026-11-12-autonomous-model-arena.md)：自主交易、独立入口、收益曲线与三市场验收。


最近核对：2026-11-05。此页只维护阅读顺序、任务入口与接续条件；任务的具体状态、授权及证据以各 Task 为准。原阶段汇报已保存在[历史摘录](../archive/reviews/2026-11-05-task-index-history.md)。

<a id="priority-policy"></a>

## 优先级与执行规则

先修资金、风险和回测正确性，再推进数据基础与最小研究链，之后补研究闭环，最后评估条件性增强。P0～P3 是排期层级；缺陷严重程度与任务是否已具备执行条件分别判断。

执行时按有效授权、已满足的依赖、排期和写集选择下一叶。外部条件未变时不重复请求，不通过改路由、购买权限或降低门槛解阻塞。各任务已有数据保护、调用次数和费用边界继续有效。

<a id="priority-p0"></a>

## P0：现有正确性修复



- [Tushare 权限真实检查与消费修正](2026-11-10-tushare-access-live.md)：时间契约兼容修正及当前账号真实检查。









- [收益趋势粒度与读取反馈](2026-11-06-performance-trend-feedback.md)：代码与受控浏览器验收完成，目标运行态更新状态见 Task。

桌面展示与编辑一致性修复及补充窄屏复核已完成，见[归档任务](../archive/tasks/2026-11-05-desktop-presentation-consistency.md)。后台风险估值、指标可见性及收益/目标保存修复已完成并[归档](../archive/README.md)，其产品规格继续有效。历史运行证据不能替代新增场景的验收。

<a id="priority-p1"></a>

## P1：数据基础与核心验收

[11月12日上午失败口径复核](2026-11-12-provider-failed-recheck.md)独立记录追加授权、逐口径结果与停止边界，不并入原四批统计。

基础行情60秒缓存已完成，见[归档任务](../archive/tasks/2026-11-11-market-base-result-cache.md)及[现行合同](../specs/2026-11-11-market-base-result-cache.md)。[精确推荐与盘中采样](2026-11-10-routing-recommendation-and-intraday-probe.md)的美股报告已交付、原计划已删除；来源失败及覆盖边界仍以原证据为准。

| 唯一任务入口 | 当前验收状态 |
| --- | --- |
| [多来源分钟与小时行情接入](2026-11-07-market-intraday-sources.md) | 策略 192 生效，七家来源及中港美 30 条原生周期路由已补齐；外部阻塞和既有全仓门禁保留，见 Task。 |
| [统一数据能力适配层](2026-10-09-unified-data-capability-adapter.md) | H07-K37-event-batches / H07-K37e-live：Tushare 真实现金正向消费；当前账号权限和原准入条件未满足，保留未通过记录，条件不变不重试。RQData 后续范围由 TODO 持有。 |
| [单只基金盘中估值](2026-11-04-fund-intraday-valuation.md) | G2.2已通过：11-06真实分钟与同日正式净值误差完成，保持39.93%低覆盖；任务按原要求保留，见[最终证据](../evidence/2026-11-06-fund-same-day-error.md)。 |

<a id="priority-p2"></a>

## P2：研究闭环

- 策略收益研究的双价格输入已[结案归档](../archive/tasks/2026-11-11-backtest-return-research.md)，含原任务完整窗口和成对备用读取验收。

| 唯一任务入口 | 当前验收状态 |
| --- | --- |
| [数据供给与研究增强](2026-10-18-research-evidence-evolution.md) | T13c / G4b.3已通过：原窗口合格实源、固定锚点、正向API/浏览器与旧事实保全完成；原价格门槛保持，任务保留，见[最终证据](../evidence/2026-11-06-research-economic-price-qualification.md)。 |

<a id="priority-p3"></a>

[新研究到期复核](2026-11-06-research-scheduled-observations.md)和[风险规则后台扫描](2026-11-06-risk-monitoring-schedule.md)负责一次操作后的服务端接续，分别验收。[回测与优化连续提交](2026-11-06-strategy-prepared-submission.md)与[每日基金估算误差](2026-11-06-fund-daily-estimate-error.md)继续承接策略和基金流程。

## P3：条件性增强

阶段化执行已完成评估和决策，保留单链，不实施生产三阶段；T16a/T16b/G5 未触发、本轮不适用。当前没有独立 P3 执行叶，原实验事实与证据仍由[研究任务](2026-10-18-research-evidence-evolution.md)及其 Spec 保存。

## 已规划的产品实施顺序

[自选与共享标的详情](2026-11-05-watchlist-foundation.md) → [多模型模拟交易竞技场](2026-11-05-model-arena.md) → [模型每周复盘](2026-11-05-arena-weekly-review.md)。三组已接入本地应用。竞技场可直接从目录建赛，周报消费同一比赛的冻结事实。各阶段见对应 Task 与[本地验证记录](../evidence/2026-11-06-watchlist-arena-weekly-local.md)。

<a id="cross-repository-priority"></a>

## 跨仓与下一次实施入口

| 仓库 | 接续入口 |
| --- | --- |
| DSA | [文档入口](../../../daily-stock-analysis/docs/README.md)：基础行情缓存生产者、前置门禁及腾讯修复已完成并归档；其他活动任务、研究及来源权限门禁由对应 Task 负责。 |
| infra | [文档入口](../../../thesis-ledger-infra/docs/README.md)：既有任务已完成并归档，更新与恢复规则由当前规格和操作指南维护。 |

本索引不授予部署、Provider、模型、数据写入或通知操作权限。

<a id="应该打开哪些文档"></a>
<a id="仍需实现或核对实现"></a>
<a id="实现已有验收或承接核对仍开放"></a>
<a id="含外部条件暂缺的任务"></a>

## 阅读与状态维护

修改前读对应 Task、适用 Spec 和最新证据；只在需要追溯时打开历史记录。只有全部范围完成且最终一致性核对通过，Task 才可移入归档。明确延期但尚未立项的实现见[TODO](../TODO.md)，当前验收缺口继续留在活动任务中。

<a id="verified-source-baseline"></a>

## 可复用的源码验证

证据按其输入、日期和验证层级复用；目录移动不改变证据适用性。当前证据入口由各 Task 持有，不按旧成功清单重新运行全套测试或部署。

## 历史记录与兼容入口

已完成任务见[归档](../archive/README.md)，原 Task 文件名和锚点保留在归档正文。原目录不保留任务跳转壳；原导航与阶段记录见[历史摘录](../archive/reviews/2026-11-05-task-index-history.md)。

- [标的代码搜索与公共组件](2026-11-06-instrument-picker.md)




- [自然语言策略编写流程展示](../archive/tasks/2026-11-07-authoring-workflow-ui.md)：三阶段展示、恢复菜单与审核保护已完成；五宽浏览器与分层证据见归档任务。

- [普通回测研究默认规则](../archive/tasks/2026-11-07-backtest-research-defaults.md)：默认模型、截图标的真实解析、四宽受控提交已验收。
