# 需求与验收规格

- [三仓取消 pnpm 版本绑定](2026-11-14-unpinned-pnpm.md)：本地使用已安装版本，CI 与镜像浮动安装，保留依赖锁文件。

- [竞技场条件委托与成交保护](2026-11-13-arena-contingent-orders.md)。从真实模型订单核对成交激活、部分成交与退出归属。

- [策略风险规则自动监控与缺数说明](2026-11-13-strategy-risk-automatic-monitoring.md)：策略应用自动评估、后台窗口限频及逐条缺数诊断。

- [策略定义统一与双向编辑](2026-11-13-strategy-definition-authoring.md)。协议、编辑与 AI 意图一致性。

- [AI 策略交叉方向一致性](2026-11-12-strategy-cross-direction.md)：生成主语与方向、明确说明校验、历史保留及冻结回测对照。

- [实验期末持仓、可比结果与候选采纳](2026-11-12-experiment-result-adoption.md)：期末市值、执行期比较、实际指标与完成候选采纳。

- [富途港美股不复权研究参考](2026-11-12-futu-raw-research-reference.md)：复用已核验身份与日历，保留严格请求及真实份额边界。

- [竞技场 Desktop 界面与交互](2026-11-12-arena-desktop-experience.md)：比赛实体标题、收益与账户分区、历史轮次、创建预算及真实只读消费边界。

- [AI 实验原地失败重试](2026-11-12-experiment-manual-retry.md)：原身份追加重试，保留历史和累计用量，未知结果由人工明确恢复。

- [失败行情口径有限复核](2026-11-12-provider-failed-recheck.md)：10点一次性预算、精确绑定、会话门禁及失败事实保留。

- [AI 实验自动完成](2026-11-12-automatic-experiment-completion.md)：全部有效候选自动完成封存测试并统一展示结果，最终由用户审阅采纳。

- [自主交易竞技场与独立观战入口](2026-11-12-autonomous-model-arena.md)：模型自主预约、模拟委托、共同估值及两端独立收益观战。

- [实验候选预热与失败归因](2026-11-12-experiment-candidate-warmup-failure.md)：两套价格覆盖候选预算，旧窗口生成前阻断，候选执行失败保留具体原因。

- [AI 实验标的名称展示](2026-11-12-experiment-instrument-display.md)：列表与详情批量投影当前目录名称，两端消费并保留历史名称和输入。

- [准备结果披露两套行情来源](2026-11-12-prepared-price-source-disclosure.md)：普通回测与实验准备直接披露各自冻结提供方和主备索引。

- [双价格研究按各自路由选择来源](2026-11-12-independent-research-price-sources.md)：后复权与原价分别选源、冻结与追溯，复用各自输入。

- [实验 Token 累计预算支持零值不限额](2026-11-12-unlimited-token-budget.md)：输入和输出累计预算、实际结算与模型单次限制的边界。

- [AI 调用次数支持零值不限额](2026-11-12-unlimited-ai-call-budget.md)：次数原样传递、原子累计与其他预算保持生效。

- [AI 实验统一策略收益研究](2026-11-11-experiment-price-research.md)：复用后复权研究与原价参考，确认旧版本转换并保留历史实验。

- [日期组件显示一致性](2026-11-11-date-input-consistency.md)：统一聚焦回显、文本编辑、原值校验与面板选中态。

- [实验创建前校验与错误反馈](2026-11-11-experiment-create-validation.md)：预算范围同步、回测次数零值不限额、字段错误与同提交意图恢复。

- [AI 实验执行设置与历史数据方式](2026-11-11-experiment-execution-settings.md)：自动生成模拟成交规则、继承策略费用与历史可见性说明。

- [回测图表的标的走势](2026-11-11-backtest-instrument-chart.md)：冻结收盘价、独立价格轴和联动时点。

- [实验候选的具体策略差异](2026-11-11-experiment-candidate-diff.md)：冻结版本对比、具体值与可读规则展示。

- [能力首次使用与自动验证](2026-11-11-capability-first-use-verification.md)：一次真实完整调用成功后保存验证结果。

- [港美股后复权回测准备](2026-11-11-overseas-hfq-backtest.md)：富途研究身份、日历及覆盖错误语义。

- [基础行情60秒结果缓存](2026-11-11-market-base-result-cache.md)：股票／ETF普通交互短缓存、原始观察时点、控制代次及刷新隔离。

- [开发库显式不备份增列升级](2026-11-12-development-upgrade-without-backup.md)：精确开发目标、唯一迁移摘要、空结构演练及旧列摘要核验；默认仍备份。

- [策略收益研究的双价格输入](2026-11-11-backtest-return-research.md)：默认后复权研究、实际价格条件及模拟资金语义。

- [业务流程内选择证券与港美股票支持](2026-11-10-instrument-selection-workflow.md)

- [标的详情内自动展示证券资料](2026-11-10-instrument-detail-security-info.md)

- [权限检查限频暂停与接续](2026-11-10-provider-access-rate-limit.md)

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

- [资料正文快照与版本差异](2026-11-10-rule-monitor-snapshots.md)

- [权限检查长期保留与凭证底部操作](2026-11-10-provider-access-retention.md)

- [内部导航整页刷新排查与修复](2026-11-09-internal-navigation.md)

- [收费资料检查执行时间归属](2026-11-09-rule-monitor-schedule.md)

- [数据源统一身份与逐功能权限](2026-11-09-provider-functional-access.md)

- [规则监测版本查看与统一自动化记录](2026-11-09-rule-monitor-automation.md)

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

- [实验重试的冻结行情重新校验](2026-11-12-experiment-retry-catalog-revalidation.md)：目录更新后确认原来源准入、原实验重试预检和普通按钮颜色。
