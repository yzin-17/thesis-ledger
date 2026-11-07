# 需求与验收规格

- [文本型比例的无损展示](2026-11-07-decimal-ratio-display.md)
- [收益、组合与风险比例读数统一](2026-11-07-financial-ratio-consumers.md)
本目录维护需求目标、范围、行为、兼容约束和验收标准。长期系统事实、领域规则和 ADR 由[长期设计](../design/README.md)维护，执行状态由 Task 持有。

## 生命周期

Spec 按自身适用性独立判断归档：不再作为当前需求合同、且执行范围与验收已有明确收口或承接时，进入 `archive/specs/`；仍有效的需求合同继续保留。稳定设计的持续维护不依赖实施 Task 是否归档。

## 查阅入口

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
