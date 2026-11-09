# 需求与验收规格

- [分钟行情盘中自动刷新](2026-11-09-minute-chart-auto-refresh.md)

- [行情图日期区间与自定义日期](2026-11-08-chart-date-ranges.md)

- [已保存策略直接配置回测](2026-11-07-saved-strategy-backtest.md)

- [风险权重按规则校验与扫描反馈](2026-11-07-risk-weight-validation.md)

- [全接口按成本限流](2026-11-07-api-cost-rate-limits.md)

- [Desktop 列表表头统一](2026-11-07-desktop-table-headers.md)

- [文本型比例的无损展示](2026-11-07-decimal-ratio-display.md)
- [收益、组合与风险比例读数统一](2026-11-07-financial-ratio-consumers.md)
本目录维护需求目标、范围、行为、兼容约束和验收标准。长期系统事实、领域规则和 ADR 由[长期设计](../design/README.md)维护，执行状态由 Task 持有。

## 生命周期

Spec 按自身适用性独立判断归档：不再作为当前需求合同、且执行范围与验收已有明确收口或承接时，进入 `archive/specs/`；仍有效的需求合同继续保留。稳定设计的持续维护不依赖实施 Task 是否归档。

## 查阅入口

- [策略读取请求的限流分类与恢复](2026-11-07-strategy-read-rate-limit.md)

- [风险通知提供方多选](2026-11-07-risk-notification-providers.md)

- [多来源分钟与小时行情接入](2026-11-07-market-intraday-sources.md)

- [自选图表与行情信息密度](2026-11-07-watchlist-chart-density.md)

- [基金净值曲线的账户成交标记](2026-11-07-fund-nav-trade-markers.md)

- [双端比例展示的精度与非零语义](2026-11-07-ratio-percent-display.md)

- [数值输入的原生表单重置与归属](2026-11-07-decimal-form-reset.md)

- [优化参数授权步长的精确校验](2026-11-07-optimization-step-precision.md)

- [风险有限数值的十进制计算与事件摘要](2026-11-07-risk-decimal-boundaries.md)

- [风险百分比阈值的原值与展示](2026-11-07-risk-threshold-precision.md)

- [配置目标展示与提交精度](2026-11-07-allocation-target-precision.md)
- [导航确认的草稿快照保护](2026-11-07-navigation-draft-snapshots.md)
- [草稿关闭确认的异步竞态保护](2026-11-07-draft-close-races.md)
- [Desktop 测试存储环境隔离](2026-11-07-desktop-test-storage.md)
- [桌面端日期选择统一](2026-11-06-desktop-date-selection.md)
- [收益趋势粒度与读取反馈](2026-11-06-performance-trend-feedback.md)
- [活动任务](../tasks/README.md)：从当前执行入口读取对应 Spec。
- [统一数据能力适配层](2026-10-09-unified-data-capability-adapter.md)
- [研究比较与复核](2026-10-18-research-evidence-evolution.md)
- [基金盘中估值](2026-11-04-fund-intraday-valuation.md)
- [桌面端间距与字号](2026-11-06-desktop-style-tokens.md)
- [桌面展示与编辑一致性](2026-11-05-desktop-presentation-consistency.md)
- [自选与共享标的详情](2026-11-05-watchlist-foundation.md)
- [多模型模拟交易竞技场](2026-11-05-model-arena.md)
- [模型每周复盘](2026-11-05-arena-weekly-review.md)
- 其他主题按日期和文件名查阅；历史合同见 [archive/specs/](../archive/specs/)。

- [Drawer 内容与焦点可见性](2026-11-06-drawer-visibility.md)

- [标的代码搜索与公共组件](2026-11-06-instrument-picker.md)

- [统一回测列表、详情与图表的比例展示](2026-11-07-backtest-ratio-consistency.md)

- [策略定义摘要的三位文本比例](2026-11-07-strategy-summary-ratio.md)

- [自选价格与日内区间的非零展示](2026-11-07-watchlist-number-display.md)

- [行情详情比例与百分数值](2026-11-07-market-percent-units.md)：单位、符号与详情读数。

- [行情数字事实读数](2026-11-07-market-number-readouts.md)：价格、净值、图表与测量精度。

- [基金收盘估算误差的精确展示](2026-11-07-fund-daily-decimal-display.md)：原始十进制、两端差额与非零读数。

- [Desktop 页面代码按需加载](2026-11-07-desktop-deferred-pages.md)：入口体积、加载反馈与导航身份。

- [Desktop 公共导航图标与间距](2026-11-07-desktop-navigation-density.md)：图标尺寸、原子间距和窄屏滚动。

- [持仓账户列的可读性与密度](2026-11-07-portfolio-account-column.md)：名称阅读宽度、固定操作与容器滚动。

- [竞技场与周报详情的刷新反馈](2026-11-07-arena-detail-refresh.md)：保留结果、聚合查询与单个加载提示。

- [普通回测研究默认规则](2026-11-07-backtest-research-defaults.md)：继承策略成本、直接披露简化假设并保留真实数据准入。

- [回测准备失败纳入任务记录](2026-11-08-backtest-preparation-failure-jobs.md)：独立失败终态、原请求与诊断、幂等关联及不可执行语义。

- [策略版本关联回测与实验记录](2026-11-08-strategy-version-records.md)：精确版本查询、分页、创建参数及刷新隔离。

- [基金净值成本参考与区间测量](2026-11-08-fund-nav-reference-measurement.md)：当前持仓成本右轴参考、完整图高测量与账户隔离。

- [行情周期与区间的常用选项](2026-11-08-common-chart-choices.md)：常用栏、更多菜单及中文选中回显。

- [行情参考说明图标提示](2026-11-08-chart-info-tips.md)：共享 InfoTip、静态说明收敛及键盘层级。

- [MACD 图层遮挡修复](2026-11-08-macd-series-layering.md)：原生序列顺序、折线可见性与复用验证。

- [行情时效与缓存回退原因](2026-11-09-quote-stale-reasons.md)：明确阈值、刷新根因、双时钟与客户端诊断展示。

- [休市快照与共享交易时段判定](2026-11-09-market-closed-snapshot.md)：真实日历、最近交易时段、共享休市语义与独立时点行。

- [模型点位首次点击与图表实例稳定](2026-11-09-model-overlay-first-click.md)：空结果主动反馈、开关状态与原生图表保留。

- [统一市场开闭市状态与日历消费](2026-11-09-unified-market-session.md)：共享状态、基金估值、调度、采样、风险和后台报价复用。

- [严格校验与数据投影排查](2026-11-09-schema-projection-audit.md)：完整对象误用子集 Schema 的排查、修复与完整行情证据边界。
