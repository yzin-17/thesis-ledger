# 历史文档归档

- [策略风险自动监控](tasks/2026-11-13-strategy-risk-automatic-monitoring.md)：策略应用自动评估、逐条缺数诊断、双端展示与本地快更完成，见[验收](evidence/2026-11-13-strategy-risk-automatic-monitoring.md)。

- [AI 策略交叉方向修复](tasks/2026-11-12-strategy-cross-direction.md)：生成主语与方向校验、v2 与冻结对照回测、历史摘要保留；方向修正后仍频繁交叉且收益更差，见[验收](evidence/2026-11-12-strategy-cross-direction.md)。

- [竞技场单模型参赛](tasks/2026-11-12-arena-single-model.md)：两版契约、隔离生命周期和研究、两端四宽度及正式快更通过，见[验收](../evidence/2026-11-12-arena-single-model.md)。

- [竞技场创建就地校验](tasks/2026-11-12-arena-inline-validation.md)：字段／分组提示、首错定位、修正及请求失败恢复，两端四宽度通过，见[验收](../evidence/2026-11-12-arena-inline-validation.md)。

- [自主比赛可选研究步骤与时限](tasks/2026-11-12-arena-unlimited-research.md)：研究由模型最终决策结束、独立续约与中止、两端四宽度及正式快更通过，见[验收](../evidence/2026-11-12-arena-unlimited-research.md)。

- [自主比赛可选单次上限与配置默认值](tasks/2026-11-12-arena-optional-request-limits.md)：全部配置分类、单次无限与有限总预算联动、两端四宽度及正式快更通过，见[验收](../evidence/2026-11-12-arena-optional-request-limits.md)。

- [自主比赛可选总预算](tasks/2026-11-12-arena-optional-budgets.md)：空白不限额、有限维度事务保护、两端页面及正式快更通过，见[验收](../evidence/2026-11-12-arena-optional-budgets.md)。

- [自主比赛可选日期与持续运行](tasks/2026-11-12-arena-optional-dates.md)：空日期、跨年执行、手动结束、两端消费及本地快更通过，见[验收](../evidence/2026-11-12-arena-optional-dates.md)。

- [提供方健康记录统一](tasks/2026-11-12-provider-health-records.md)：旧记录转换 2 条、删除 1 条，当前契约、真实 API 全分页及四宽页面读取通过，见[验收记录](evidence/2026-11-12-provider-health-records.md)。

- [竞技场界面一致性巡检](tasks/2026-11-12-arena-ui-consistency.md)：列表、两个创建入口、全部详情页签及周报统一，见[验收](../evidence/2026-11-12-arena-ui-consistency.md)。

- [竞技场比赛内记录导航](tasks/2026-11-12-arena-inline-round-navigation.md)：日频详情统一决策与成交，日期／模型筛选、旧链接和四宽度消费通过，见[验收](../evidence/2026-11-12-arena-inline-round-navigation.md)。

- [竞技场 Desktop 界面重设计](tasks/2026-11-12-arena-desktop-experience.md)：日频／自主详情、轮次与创建流程、四宽度浏览器及真实历史只读消费通过；[证据](../evidence/2026-11-12-arena-desktop-experience.md)与父级真实来源、原生验收分开。

- [基础行情结果缓存](tasks/2026-11-11-market-base-result-cache.md)：60秒普通交互缓存、目标Server及实际Desktop四宽通过，见[完成证据](../evidence/2026-11-12-market-base-result-cache-completion.md)；现行Spec保留。

- [AI 实验原地失败重试](tasks/2026-11-12-experiment-manual-retry.md)：原身份、失败审计、累计预算与未知结果明确恢复；隔离状态机、四宽浏览器及正式运行态通过，见[验收记录](evidence/2026-11-12-experiment-manual-retry.md)。

- [AI 实验自动完成](tasks/2026-11-12-automatic-experiment-completion.md)：全部有效候选自动测试并揭示，最终人工采纳；隔离 PostgreSQL、四宽浏览器及真实等待实验接续通过，见[验收记录](evidence/2026-11-12-automatic-experiment-completion.md)。

- [日期组件显示一致性任务](tasks/2026-11-11-date-input-consistency.md)及[验收证据](evidence/2026-11-11-date-input-consistency.md)：统一日期输入与选中态，现行合同保留在规格和 UI 指南中。

- [回测标的走势](tasks/2026-11-11-backtest-instrument-chart.md)：冻结标的收盘价、双轴与联动读数，沪港真实样本及四宽浏览器通过，见[验收记录](evidence/2026-11-11-backtest-instrument-chart.md)。

- [实验候选的具体策略差异](tasks/2026-11-11-experiment-candidate-diff.md)：冻结版本只读投影与可读具体值，见[验收记录](evidence/2026-11-11-experiment-candidate-diff.md)。

- [能力首次使用与自动验证](tasks/2026-11-11-capability-first-use-verification.md)：未知可尝试、真实成功后保存；苹果与腾讯正式请求、服务重启及四宽真实页面通过，[证据](../evidence/2026-11-11-capability-first-use-verification.md)保留实际范围与既有广回归差异。

- [港美股后复权回测准备修复](tasks/2026-11-11-overseas-hfq-backtest.md)：富途研究通路与覆盖错误修复，两个标的原窗口通过取数校验；[证据](../evidence/2026-11-11-overseas-hfq-backtest.md)保留未重跑任务及当日未开市的边界。

- 策略收益研究双价格输入的[归档任务](tasks/2026-11-11-backtest-return-research.md)、[首次实施证据](evidence/2026-11-11-backtest-return-research.md)和[价格对切换验收](evidence/2026-11-11-backtest-price-pair-recovery.md)分别保留实际检查范围及共同上游可用性边界。

- 回测日线来源适用性：[规格](specs/2026-11-11-backtest-source-compatibility.md)、[任务](tasks/2026-11-11-backtest-source-compatibility.md)及[完整窗口证据](../evidence/2026-11-11-backtest-source-compatibility.md)。

- [证券业务选择流程](tasks/2026-11-10-instrument-selection-workflow.md)：独立目录入口收敛，港美股票自动关联、原生币种及四宽业务表单通过；[证据](evidence/2026-11-10-instrument-selection-workflow.md)区分受控写入与真实只读检查。

- [标的确认状态](tasks/2026-11-10-instrument-confirmation-state.md)：持久化状态、两端反馈和缓存已统一，受控转换与四宽真实只读验收通过；[证据](evidence/2026-11-10-instrument-confirmation-state.md)包含快更入口和镜像边界。

- [标的详情证券资料](tasks/2026-11-10-instrument-detail-security-info.md)：独立表单并入共用详情，四宽界面验收通过；[证据](evidence/2026-11-10-instrument-detail-security-info.md)分别记录受控成功与真实来源路由未配置。

- [权限检查限频暂停与接续](tasks/2026-11-10-provider-access-rate-limit.md)：首次限频暂停、60秒冷却及部分补查完成，126项后端、18项界面、四宽浏览器及完整镜像验收通过，详见[证据](../evidence/2026-11-10-provider-access-rate-limit.md)。

- [权限检查长期保留与凭证底部操作](tasks/2026-11-10-provider-access-retention.md)：当前结果长期保存、同草稿保存复用及底部移除操作完成，完整 DSA 镜像与四宽实际页面通过，详见[验收记录](../evidence/2026-11-10-provider-access-retention.md)。

- [内部导航整页刷新排查](tasks/2026-11-09-internal-navigation.md)：复盘共用入口统一应用路由，86项定向测试、构建及四宽导航通过；[验证记录](evidence/2026-11-09-internal-navigation.md)区分静态清单、受控输入与真实只读边界。

- [收费资料检查执行时间](tasks/2026-11-09-rule-monitor-schedule.md)：规则页创建默认24小时任务、自动化编辑仅时间，持久计划、增量保留、接口成本登记与四宽实际页面通过；[验收记录](evidence/2026-11-09-rule-monitor-schedule.md)分列真实只读、受控写入及镜像/代码层边界。

- [数据源统一身份与逐功能权限](tasks/2026-11-09-provider-functional-access.md)：TickFlow 统一来源、逐能力凭证门禁及通用权限展示完成，当前规格保留，详见[证据](../evidence/2026-11-09-provider-functional-access.md)。

- [收费资料检查操作一致性](tasks/2026-11-09-rule-monitor-controls.md)：统一启停、原位编辑与立即运行，36项定向回归、构建及四宽浏览器通过；[证据](evidence/2026-11-09-rule-monitor-controls.md)保留受控写入和用户当前配置边界。

- [规则监测版本查看与统一自动化记录](tasks/2026-11-09-rule-monitor-automation.md)：版本侧边详情、统一任务历史及逐次失败原因已接入，定向验证、正式代码同步和四宽实际页面通过；[验收记录](evidence/2026-11-09-rule-monitor-automation.md)保留旧历史缺口及运行边界。

- [删除 NVIDIA 官方新闻数据源](tasks/2026-11-09-remove-nvidia-news.md)：来源、当前政策与页面已清理，定向测试及真实浏览器通过，运行态范围见[证据](evidence/2026-11-09-remove-nvidia-news.md)。

- [富途与 HiThink 筹码账号核查](tasks/2026-11-09-chip-provider-expansion.md)：当前 Key／OpenD 条件核查完成；HiThink 筹码拒绝外部读取、富途 REST 缺独立认证，用户暂不新增认证，因此未触发新来源接入，详见[DSA 证据](../../../daily-stock-analysis/docs/evidence/2026-11-09-chip-provider-accounts.md)。

- 2026-11-08 [行情日期区间](tasks/2026-11-08-chart-date-ranges.md)：七类区间、自定义日期、按需历史、四宽和真实基金三年读取已验收；[验证记录](evidence/2026-11-08-chart-date-ranges.md)保留来源覆盖及本地运行边界。

- 2026-11-07 [已保存策略回测入口](tasks/2026-11-07-saved-strategy-backtest.md)：自动复用策略与市场规则、直接提交及高级选项分组已验收；[验证记录](evidence/2026-11-07-saved-strategy-backtest.md)区分受控成功与当前真实规则来源阻塞。

- 2026-11-07 [风险权重按规则校验](tasks/2026-11-07-risk-weight-validation.md)：真实比例、规则输入检查及扫描中文反馈已验收；[验证记录](evidence/2026-11-07-risk-weight-validation.md)保留 1670 项 Desktop 测试、正式快更及四宽运行态边界。

- 2026-11-07 [全接口按成本限流](tasks/2026-11-07-api-cost-rate-limits.md)：328 项操作分类、可信主体和独立预算、6240 次受控 HTTP、四宽真实浏览及维护同步验收完成；[验证记录](evidence/2026-11-07-api-cost-rate-limits.md)。

- 2026-11-07 [策略读取限流修复](tasks/2026-11-07-strategy-read-rate-limit.md)：读取分类、有界恢复、维护入口同步与四宽实际页面验收完成；[验证记录](evidence/2026-11-07-strategy-read-rate-limit.md)。

- 2026-11-07 [风险通知提供方多选](tasks/2026-11-07-risk-notification-providers.md)：持久化多选、最高优先级默认、独立投递与历史兼容、保留数据升级及四宽实际页面验收完成；[验证记录](evidence/2026-11-07-risk-notification-providers.md)。

- [Desktop 列表表头统一](tasks/2026-11-07-desktop-table-headers.md)：34 处表头共用展示合同，1652 项测试、构建及四宽双主题浏览器通过；[验收记录](evidence/2026-11-07-desktop-table-headers.md)区分真实读取与受控快照。

- [自选日内分时](tasks/2026-11-07-watchlist-intraday-line.md)：复用分钟行情、缺口断线及简要区间读数；[验收记录](evidence/2026-11-07-watchlist-intraday-line.md)区分 26 项测试、四宽 40 场景与真实分钟来源状态。

- [自选图表与行情信息密度](tasks/2026-11-07-watchlist-chart-density.md)：默认日 K 线、日内区间参考价图形及精简来源提示；[验收记录](evidence/2026-11-07-watchlist-chart-density.md)保留 36 项定向测试、四宽 40 场景与真实页面结果。

- [基金净值账户成交标记](tasks/2026-11-07-fund-nav-trade-markers.md)：净值日期买卖点、精确成交明细、当前账户隔离完成；[验收记录](evidence/2026-11-07-fund-nav-trade-markers.md)保留 54 项定向测试、四宽实际浏览器及只读真实接口证据。

本轮目录及归档依据见[三仓整理记录](reviews/2026-11-05-three-repository-documentation.md)；已结案报告见 [reviews/](reviews/)，被替代合同见 [specs/](specs/)，完成任务见 [tasks/](tasks/)。当前执行以[任务索引](../tasks/README.md)为准。

- 2026-11-07 [风险阈值精度](tasks/2026-11-07-risk-threshold-precision.md)完成比例单位合同、两端原值提交及非零摘要；Domain 499、Desktop 1389、Mobile 193 项、构建、门禁与四宽 16 组浏览器通过，[当轮共享集成证据](evidence/2026-11-07-risk-threshold-precision.md)保留当轮输入与验证范围。
- 2026-11-07 [日期选择统一](tasks/2026-11-06-desktop-date-selection.md)和 [Drawer 可见性](tasks/2026-11-06-drawer-visibility.md)完成最终一致性复核：核心日期摘要及 Sheet/Tabs 编译语义保持，复用原浏览器证据；新增日期消费者和当前 1377 项完整包验证已纳入。[日期证据](evidence/2026-11-06-desktop-date-selection.md)、[Drawer 证据](evidence/2026-11-06-drawer-visibility.md)随闭合任务归档，现行展示规格保留。
- 2026-11-07 [配置目标精度](tasks/2026-11-07-allocation-target-precision.md)完成 Domain 单位投影及两端提交修复，Domain 496、Desktop 1377、Mobile 188 项测试、构建与四宽浏览器通过；[共享集成证据](evidence/2026-11-07-allocation-target-precision.md)保留原始往返回归及当轮集成结论。
- 2026-11-07 [导航草稿快照保护](tasks/2026-11-07-navigation-draft-snapshots.md)完成 14 个登记入口及路由确认归属，稳定输入 1363 项测试、构建、门禁和四宽 12 组浏览器通过；[共享集成证据](evidence/2026-11-07-navigation-draft-snapshots.md)保留当轮验收。
- 2026-11-07 [草稿关闭保护](tasks/2026-11-07-draft-close-races.md)完成共享 Hook、20 处调用与 AST 门禁，稳定输入 1352 项测试、构建及四宽浏览器通过；[当轮证据](evidence/2026-11-07-draft-close-races.md)归档，后续集成由导航保护记录承接。业务写入及运行态未扩大。
- 2026-11-07 [Desktop 测试存储隔离](tasks/2026-11-07-desktop-test-storage.md)完成普通测试入口修复及 Node 24/26 回归，保留[原始失败与验证边界](evidence/2026-11-07-desktop-test-storage.md)；现行规格继续维护配置合同。

- 2026-11-06 [桌面端间距与字号](tasks/2026-11-06-desktop-style-tokens.md)已完成，见[样式与浏览器验收](evidence/2026-11-06-desktop-style-tokens.md)。

- 2026-11-05 [桌面展示与编辑一致性修复](tasks/2026-11-05-desktop-presentation-consistency.md)完成五处修复与同类页面排查；保留原始精度及业务逻辑，最终隔离1280项测试、构建和适用门禁通过，38组页面尺寸检查与九表前后摘要一致。[现行规格](../specs/2026-11-05-desktop-presentation-consistency.md)保留，[验证记录](evidence/2026-11-05-desktop-presentation-consistency.md)区分实际页面、受控提交及其他任务的并发检查差异；未提交或发布。

- 2026-11-01 [AI配置、模型用途与测试后保存](tasks/2026-09-21-ai-provider-model-usage-configuration.md)当前Web/目标服务范围完成最终Review并归档，配置/迁移/并发/精确测试/三类真实SDK业务/取消/交付期限证据复用。用户明确将[实际正费用验收](../TODO.md#ai-provider-positive-cost-acceptance)转为后续范围，未计通过，费用上限0及原配置/账目保持；Electron不计本轮交付。[完整范围与复核](../evidence/2026-11-01-ai-fee-deferral-and-closeout.md)。

- 2026-11-01 [来源即时启停与凭据配置](tasks/2026-09-14-market-provider-credentials.md)完成AC1～AC7及最终Review，当前获准范围的配置/加密/OAuth基础/目标Docker与Web/在线证据按原输入复用；关键Control和Alpha Vantage源码摘要与已验收版本相同。本次模型、来源和通知动作均0；Longbridge仍由TODO持有，Tushare现金正向消费保留原Task。[最终复核](../evidence/2026-11-01-provider-credentials-final-review.md)分列成功、范围外受限和延期，不扩大来源资格。

- 2026-11-01 [全站UI与交互统一](tasks/2026-09-08-ui-interaction-consistency.md)的T2～T6/T8及原AC自身条件完成，原矩阵/恢复/原生证据复用，T19/工作台依赖已过；补齐完整阅读两行标题与V2完整问题，最终Web三视口双主题及长问题可读。[最终证据](../evidence/2026-10-31-research-comparison-and-ui-closeout.md)保留检查器裁切误报、运行环境修正和数据保护；研究T13c/G4b经济价格、非零费用及实际通知等原领域条件不代收。

- 2026-10-31 [历史数据按需获取](tasks/2026-10-09-history-data-on-demand.md)最后的L3-V摘牌正向消费通过：原600112窗口新准备/快照、目标Worker、Web/实际下载及同引擎两次断网重放完成；临时主备已恢复，旧数据保护通过，模型调用0次、费用0。[完整证据](../evidence/2026-10-31-history-demand-l3v.md)保留历史来源失败、跨引擎比较边界及本机校验修正记录；[现行Spec](../specs/2026-10-09-history-data-on-demand.md)保持原合同。

- 2026-10-31 [AI SDK与输出模式](tasks/2026-09-19-vercel-ai-sdk-integration.md)按原48项AC、JSON Mode12项及G0/G0.1/G1/G2完成；[最终逐项评审](reviews/2026-10-31-ai-sdk-final-ac-review.md)明确四条本地适配器合同与三类真实业务范围。[费用拒绝及真实Cloudflare交付期限](tasks/2026-10-31-ai-provider-live-fault-acceptance.md)同步完成，5次模型、估算0 USD、原配置/业务/旧审计保持；[完整证据](../evidence/2026-10-31-ai-provider-live-fault-acceptance.md)保留失败与边界。现行Spec保留，配置Task的实际非零费用及其他组合资格没有代收。

- 2026-10-31 [Web至手机端功能迁移](tasks/2026-10-22-web-mobile-feature-parity.md)当前约定范围完成；Android/iOS独立G0～G6、G7与最终Review通过，CI6四项首次成功、零artifact。保留[现行Spec](../specs/2026-10-22-web-mobile-feature-parity.md)和[最终审查](reviews/2026-10-30-web-mobile-parity-final-review.md)；Longbridge/通知Provider实源仍由TODO承接，原树和独立WIP保留。

- 2026-10-31 [研究工作台](tasks/2026-08-25-ai-research-workbench.md)及[实源故障/准备截止验收](tasks/2026-10-31-research-source-fault-acceptance.md)全部门禁通过；复用原Provider/Web、真实新闻成功研究及目标在途重启，补齐V2实源交付中断、完整30秒准备截止、Cloudflare单次部分报告及引用反读。主配置/默认、业务和审计保持，所属隔离资源已清理。[完整证据](../evidence/2026-10-31-research-source-fault-acceptance.md)和[现行Spec](../specs/2026-08-25-ai-research-workbench.md)保留；其他AI费用/协议/期限矩阵仍由各自现行任务持有。

- 2026-10-26 [Provider 模型目录通用配置](tasks/2026-10-26-provider-model-catalog-configuration.md)完成共享合同、通用执行器、前端手动规则及正式快更；实际前端临时规则读取 39 个模型，取消后未保存，Server／Worker 及 188 个实际 Schema 模块一致。配置及原数据保持，既有定时作业独立新增 3 条快照的关联证据保留。[现行 Spec](../specs/2026-10-26-provider-model-catalog-configuration.md)与[完整证据](../evidence/2026-10-26-provider-model-catalog-configuration.md)保留，模型调用为 0，目标规则由用户在前端手动保存。

- 2026-10-26 [Cloudflare 模型目录适配](tasks/2026-10-26-cloudflare-model-catalog.md)完成当时的原生目录、正式快更、目标 API 与实际前端验收；39 个 Workers AI 文本候选、三个原选择及配置数据保全通过。[历史 Spec](specs/2026-10-26-cloudflare-model-catalog.md)与[完整证据](../evidence/2026-10-26-cloudflare-model-catalog.md)保留，模型调用为 0，研究 G3 仍按原边界处理。现行实现与验收见[通用目录配置任务](tasks/2026-10-26-provider-model-catalog-configuration.md)。

- 2026-10-23 [研报长期按需读取](tasks/2026-10-23-research-report-on-demand.md)完成日期可选的 v2 合同、标准错误投影与来源空日期字段兼容、保留数据完整更新及目标无日期单页验收；采集 201、2 条/来源总数 772，新旧历史 200，旧快照摘要不变。原来源启停、20 条路由、11 张受保护业务表与挂载保持，用户确认的预期修改保留。[现行 Spec](../specs/2026-10-23-research-report-on-demand.md)与[完整证据](../evidence/2026-10-23-research-report-on-demand.md)保留，当前按需读取不再依赖首次 24 小时验收记录。

- 2026-10-23 [研报最小元数据](tasks/2026-10-23-research-report-metadata.md)完成单标单页采证、限定范围首次准入、单条路由、真实采集、引用/本地历史及同一 Server 重启留存；用户确认的并发账户新增保留，原数据、凭据及原路由保护通过。[现行 Spec](../specs/2026-10-23-research-report-metadata.md)与[完整证据](../evidence/2026-10-23-research-report-metadata.md)保留，模型研究与全历史边界保持。

- 2026-10-22 [财联社与见闻市场快讯](tasks/2026-10-22-market-flash-news-dg3.md)完成；独立市场快讯合同、两家 DSA/Docker/Market/Web 与原数据保全通过，原个股新闻和研究 G3 边界保持；其他模块已入后续 TODO。
- 2026-10-22 [Yahoo 新闻接入与 DG3 扩展](tasks/2026-10-22-yahoo-news-dg3.md)完成；NVDA.US 的 Yahoo V3/Market/Web、零尝试拒绝与保全通过，原 NVIDIA 作为备用，HiThink/AKShare 和研究边界保持。
- 2026-10-22 [HiThink 新闻接入与 Yahoo 验证](tasks/2026-10-22-hithink-yahoo-news.md)完成；HiThink 目标 V3/Market/Web 与保全通过，Yahoo Search 的宿主/目标样本验证通过，原来源和研究边界保留。

- 2026-10-22 [现有来源新闻接入](tasks/2026-10-22-existing-source-news.md)复用已启用 AKShare，完成 A 股样本、目标 V3/Market/Web、精确准入及原数据保护；原 NVIDIA 证据继续复用。

- 2026-10-22 [免费官方新闻与 DG3 接入](tasks/2026-10-22-free-news-dg3.md)和 [DSA 纯数据服务](../../../daily-stock-analysis/docs/archive/tasks/2026-10-18-data-only-service.md)完成全部适用叶并归档；单发行方实源、实际 Web 与原数据保全通过，研究 G3 的模型及发布条件保持。

- 2026-10-22 [账户与持仓录入](tasks/2026-08-18-position-entry-account-model.md#最终一致性-review)完成 T12/T13 与现行九项 AC 的最终核对，复用已有账户、基金、草稿/对账及原生证据，通过后归档；[现行 Spec](../specs/2026-08-18-position-entry-account-model.md)保留，原数据与审计不变。
- 2026-10-21 三份 P0 正确性任务全部目标/Web 条件完成：[风险估值](tasks/2026-10-18-risk-valuation-correctness.md)、[指标可用性](tasks/2026-10-18-indicator-availability-correctness.md)、[收益正确性](tasks/2026-10-18-performance-correctness.md)；现行 Spec 保留，不重跑未变输入。
- 2026-10-21 [组合快照与走势](tasks/2026-08-28-portfolio-snapshot-system.md)、[基金复权](tasks/2026-10-21-fund-adjusted-returns.md)及[规则精确时钟](tasks/2026-10-21-trade-rule-evidence-clock.md)完成对应独立条件；合格权威规则生产、未开放账户入口和其他原领域门禁继续由各自父 Task 持有。
- 2026-10-21 AI 非生成差集完成：[显式价格迁移](tasks/2026-10-21-ai-provider-pricing-migration.md)、[冻结历史保留](tasks/2026-10-21-ai-provider-history-preservation.md)、[混合模型与认证方式](tasks/2026-10-21-ai-controlled-config-web.md)、[带凭证类型转换](tasks/2026-10-21-ai-credential-type-conversion.md)、[默认引用原子清除](tasks/2026-10-21-ai-default-lifecycle-target.md)。原配置 T2.5 收口，真实认证/生成/费用和业务仍暂停。
- 2026-10-21 [Automation 真实行情组合](tasks/2026-10-21-automation-market-consumer.md)与[RouteTarget 主源冷态](tasks/2026-10-21-route-cold-primary.md)完成；共同消费者 G1 关闭，故障备用仍按原暂停保留。所有专属账户归零停用，原数据保留。

本目录保存仍有审计、迁移或历史决策价值，但不再作为当前实现依据的文档。

| 目录                             | 内容                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [`specs/`](specs/)               | 旧版 Investment OS / Provider 规格、已完成架构改进，以及被当前 Snapshot / Trade Projection 等方案取代的历史规格 |
| [`tasks/`](tasks/)               | 已完成任务、旧阶段任务、历史迁移、被取代的任务，以及已经关闭当前运行时验收的专项任务                            |
| [`reviews/`](reviews/)           | 历史一致性 Review、一次性 closure/发布执行记录和被新版复核取代的 Review                                         |
| [`architecture/`](specs/) | 被当前架构 SSOT 取代的实现说明、DSA 详细历史审计和旧 Traceability                                               |
| [`domain/`](specs/)             | 被合并或取代的领域说明和一次性 Domain Model 审计                                                                |

归档文档可以被历史 Review 引用，但不能作为新实现的需求、接口或运行状态真源。若要删除归档内容，必须先确认 Git 历史或外部证据已满足保留要求。

近期归档包括：

- 2026-10-20 [页面一致性与交互恢复](tasks/2026-10-19-ui-consistency-and-interaction-recovery.md)：R1～R20、V1～V6、C1～C3、G1～G3 的 Web 实施与独立验收完成；当前任务正文 17→16。[现行 Spec](../specs/2026-10-19-ui-consistency-and-interaction-recovery.md)与[最终记录](reviews/2026-10-19-ui-consistency-and-density-audit.md#web-recovery-20261020)保留，真实模型、新闻和领域实源门禁仍由原任务持有；旧路径只保留兼容跳转。

- 2026-10-20 [AI 服务统一页面配置](tasks/2026-10-19-ai-provider-database-only.md)：本地、同一目标镜像保留副本及获准临时配置的目标 Web 保存/删除还原均通过，原配置、默认、密文和业务数据保持。当前 Task 正文 18→17；[现行 Spec](../specs/2026-10-19-ai-provider-database-only.md)保留，其他 AI 真实用途门禁继续归原 Task 且暂停。[分层证据](../evidence/2026-10-19-ai-provider-database-only.md#2026-10-20-获准目标-web-保存与最终复核)保留原路径，旧 Task 路径只保留兼容跳转。

- 2026-10-17 [Scheduler 执行租约](tasks/2026-09-05-automation-execution-lease-hardening.md)：当前镜像内专用执行进程的 SIGKILL、租约恢复、双实例竞争、旧 owner fencing 和 unknown-outcome 不重放通过，当前 Task 正文 13→12。现行 Spec 保留，Cash 的真实处理器补期结果共用[一份证据](../evidence/2026-10-16-cash-runtime-acceptance.md#10-17-scheduler-进程与现金补期恢复)，外部通知继续开放。

- 2026-10-17 [图表交互与更新](tasks/2026-09-10-market-chart-indicator-integration.md)：跨日重开、V3 整窗乱序隔离、在途去重、失败恢复、同日修订和真实截止日期降级已补齐，当前 Task 正文 14→13。现行指标/更新 Spec 保留；稳定盘中日线继续留在原 TODO，不新增跳转文件。见[逐项证据](../evidence/2026-10-16-market-detail-chart-acceptance.md#10-17-图表更新与截止日期补验)。

- 2026-10-17 [富途研究能力](tasks/2026-10-08-futu-openapi-full-integration.md)：报价/图表、历史 1m 与首批腾讯/苹果 qfq 研究冻结已完成；正式重建后的 22 份输入及两份快照各两次断网重放通过，最后的镜像条件关闭。当前 Task 正文 15→14，无新增跳转文件；[Spec](../specs/2026-10-08-futu-openapi-full-integration.md)保留现行合同，[最终证据](../evidence/2026-10-15-futu-minute-integration.md#2026-10-17-研究镜像固化与重建后复验)保留失败、范围与数据保护边界。

- 2026-10-16 [行情详情读模型](tasks/2026-08-21-market-detail-read-model.md)及四份子 Ticket：完整资产/状态、Network、失败恢复、取消、宽窄屏与一致性通过；修复窄屏裁切、报价币种/精度与净值 ISO 日期崩溃。[现行 Spec](../specs/2026-08-21-market-detail-read-model.md)继续保留；实源、受控样本和后继图表/分钟范围分别记账。

- 2026-10-16 [账户永久删除](tasks/2026-09-14-permanent-account-deletion.md)：三端具名确认、失败保留、真实删除、防重及空态分层验收通过，仅删除用户当次确认的三个空测试账户；原有账户与历史数据保持。[现行合同](../specs/2026-09-14-permanent-account-deletion.md)继续保留。

- 2026-10-15 第七轮三份大 Task 精简：[实施与完整性记录](tasks/2026-10-14-docs-large-document-cleanup.md#第七轮三份大-task-精简)。统一适配层删除已有历史承载的 193 条完成摘要；历史按需的阶段定义补存原历史，当前只留摘牌正向条件；[研究助手完整原文](tasks/2026-08-25-ai-research-workbench-history.md)与 23 项 AC 映射按需追溯。三份当前正文 99,330 → 21,160 字节；18 个当前任务入口及未通过验收保留。

- 2026-10-15 第六轮证据状态与验收接续：[实施与验证记录](tasks/2026-10-14-docs-large-document-cleanup.md#第六轮证据状态纠正与验收接续)。T17 后继数据库、Portfolio 已完成修复及当前 CI/Android 状态纠正；目录聚合和策略实验一致性分别交给现行交易、策略风险/AI Task 后归档。当前正文 20 → 18，原合同、未通过条件与历史原文保留，没有新增兼容文件。

- 2026-10-15 第五轮 Task 精简与合并：[实施与验证记录](tasks/2026-10-14-docs-large-document-cleanup.md#第五轮task-精简与合并)。三份大 Task 和指标 Task 的完成日志保留为历史记录；六份同域 Task 由四个现有入口承接，全部原合同与未通过条件保留。当前正文 26 → 20，兼容 Task 14 → 6；15 个只需文档导航的跳转文件在改为直接归档链接后删除。测试输入、脚本和邻仓仍需的兼容路径继续保留。

- 2026-10-15 当前 Task 承接：[实施与验证记录](tasks/2026-10-14-docs-large-document-cleanup.md#第四轮当前-task-承接)。7 份父任务或同域验收记录由现有 Mobile、投资组合、现金任务承接后归档，验收仍开放。各原 Spec、未通过条件及历史证据保留；没有增加新的当前 Task 文件。

- 2026-10-14 第三轮入口清理：[实施与验证记录](tasks/2026-10-14-docs-large-document-cleanup.md#第三轮跳转与历史入口清理)。34 份历史 Review 和 8 份旧 Spec 退出当前正文；删除 47 个无实际引用跳转，两份反向跳转由真实归档正文替换。仍被原始证据、测试输入和邻仓引用的兼容入口保留，当前合同和未通过验收继续由原 Spec/Task 管理。

- 2026-10-14 第二轮巨型文档与重复证据精简：[实施与验证记录](tasks/2026-10-14-docs-large-document-cleanup.md)。三份 Task 的详细执行历史及六份一次性报告按原主题保留；来源专属约束仍是现行合同，按需查阅附页。S05 原件迁出 Markdown 正文，解码字节与原摘要一致；相同 Android XML 只保留规范副本。未通过验收继续留在当前 Task。

- 2026-10-14 当前入口治理：[实施与验证记录](tasks/2026-10-14-docs-current-entry-cleanup.md)。16 份历史 Task 退出当前执行入口：09-25 多源、Docker 更新、自动化历史分页、两份 AI 配置移除、ETF 内部备用、七份 09-27 修复、交易主任务、旧历史规则、缓存与路由。ETF 旧备用及旧历史规则 Spec 一并归档，其余 Spec 保留；取消、跳过与未验证记录不改为通过。原始证据保持原路径与字节。

- 每手股数独立路由：[已完成任务](tasks/2026-10-08-security-lot-size-routing.md)，当前选择富途的真实股数、模型冻结及页面/下载通过；[现行Spec](../specs/2026-10-08-security-lot-size-routing.md)保留，[验收证据](../evidence/2026-10-08-security-lot-size-live-acceptance.md)区分长桥未配置与开发同步边界。

- 多源扩展、历史规则与P6：[多源任务](tasks/2026-10-03-multi-source-remaining-acceptance.md) · [历史规则任务](tasks/2026-10-06-historical-rules-primary-backup.md) · [P6任务](tasks/2026-10-07-p6-market-state-expansion.md)。基础报价/普通研究、M31、用户选定状态/市场、港美实际股数与精简镜像/恢复范围完成；[现行P6 Spec](../specs/2026-10-07-p6-market-state-expansion.md)保留，最终证据见[港股与当前版本核验](../evidence/2026-10-08-p6-hk-share-window-acceptance.md)。取消项不记作通过，港股每手历史变更未核验。

- 自然语言策略编写：[完整任务](tasks/2026-09-18-natural-language-strategy-authoring.md)、[可信身份与会话](tasks/2026-10-05-strategy-identity.md)、[执行与调用事实](tasks/2026-10-05-authoring-execution.md)均完成各自门禁；[现行 Spec](../specs/2026-09-18-natural-language-strategy-authoring.md)保留，详见[最终对账](../evidence/2026-10-06-authoring-completion.md)与[浏览器证据](../evidence/2026-10-06-authoring-browser.md)。

- 行情图表周期聚合：[已完成任务](tasks/2026-09-16-market-chart-period-aggregation.md)，完整 AC1–AC11 与 T1～T6/G1/P1/R1 已通过；[现行 Spec](../specs/2026-09-16-market-chart-period-aggregation.md)保留，分层证据见[R1 最终 Review](../evidence/2026-10-06-market-period-r1-final-review.md)。

- 投资复盘：[原任务](tasks/2026-08-28-journal-review-trade-projection.md)、[契约子任务](tasks/2026-10-04-journal-review-contracts.md)、[收口任务](tasks/2026-10-05-journal-review-completion.md)；完整 AC1—AC16 与本轮 Web／真实模型／目标恢复／远端 CI 已通过，见[最终 Review](reviews/2026-10-05-journal-review-completion.md)。现行产品与契约 Spec 保留。

- [基金定投计划](tasks/2026-09-08-recurring-fund-investment.md)与[日期精度成本策略修复](tasks/2026-10-04-ledger-date-cost-boundary.md)：全部实施及分层运行时验收完成，Spec 继续保留当前契约；
- `2026-09-17-strategy-center-ux-consolidation`：T00—T16 与 G1—G3 已完成，最终一致性 Review 通过；Spec 继续保留为当前产品与交互契约；
- `2026-08-28-unified-backtest-v2`、`2026-09-10-backtest-historical-execution-rule-facts`、`2026-09-11-backtest-v2-closure-follow-up`：V2 产品/引擎交付与收敛任务已经完成；历史规则后继由已完成的[主备任务](tasks/2026-10-06-historical-rules-primary-backup.md)和[P6 任务](tasks/2026-10-07-p6-market-state-expansion.md)承接，未选定扩展不作为当前重做入口；
- `2026-09-14-portfolio-valuation-demand-guard`：当前功能和运行态门禁已经完成；明确延期的 batch/catalog、FX、LedgerEvent 与 realized PnL 优化转入 `docs/TODO.md`；
- `2026-09-16-market-bar-series-cache-v2`：BarSeries Fact/Coverage、Reader、缓存和当前 Docker 门禁已经完成；原 V2 设计保留历史依据，当前架构由 [Canonical](../design/canonical-runtime.md)维护；
- `2026-09-11-backtest-v2-closure.md`：一次性收敛验收记录从 `benchmarks/` 归档到 `archive/reviews/`；
- `2026-08-18-market-data-provider-v1-2-implementation.md`：旧 Market Data v1.2 实施说明被 Market Data V2 Architecture 取代；
- `2026-08-18-provider-selection.md` 与 `2026-08-18-provider-reliability.md`：旧 Provider 领域说明合并为 V2 `provider-routing-and-reliability`。

更早的归档批次还包括：

- `2026-08-24-performance-snapshot-automation` Spec/Task：已由 `2026-08-28-portfolio-snapshot-system` 取代；
- `2026-08-28-architecture-guardrails-hardening` Spec/Task：实现和 PR #22 已完成；
- `2026-09-02-fresh-database-baseline` Spec/Task：实现、真实 fresh-volume 切换和最终一致性 Review 已完成；
- `2026-08-25-journal-review-interaction-design` Spec/Task：已由统一 Trade Projection 的 Journal 方案接管当前契约；
- `2026-09-01-docker-build-cache-retry` Task：静态/替身验证及真实 `update.sh` 运行时验收均已完成，Spec 继续保留为当前行为说明；
- `2026-08-28-unified-backtest-trade-integration-review.md`：已被同日复核版 Review 取代；
- `2026-08-18-v1-release-checklist.md`：V1 一次性发布执行记录，当前 Operations 只保留可复用 checklist；
- `2026-08-18-spec-traceability.md`：记录 V0.x/V1 历史追踪，不再作为当前 Spec 状态 SSOT。

归档主题文档使用 `YYYY-MM-DD-<topic>.md` 命名。归档意味着退出当前实现入口，不意味着删除历史证据。当前导航直接链接实际正文；只为原始证据、测试输入或邻仓仍需要的路径保留短跳转，已无实际引用的跳转删除。归档记录里的原执行路径仅说明当时输入，不自动产生长期维持旧路径的义务。

- [风险十进制边界实施](tasks/2026-11-07-risk-decimal-boundaries.md)：有限数值输入、精确成本比较与新事件摘要验收完成；[当轮集成证据](evidence/2026-11-07-risk-decimal-boundaries.md)随任务归档，后续由双端比例记录承接。
- [风险阈值精度证据](evidence/2026-11-07-risk-threshold-precision.md)：两端原值提交、下溢拒绝与浏览器记录，最新包级结果由上述集成证据承接。

- [优化参数精确步长](tasks/2026-11-07-optimization-step-precision.md)：长小数授权偏差、非正步长和候选前置拦截完成；[验证记录](evidence/2026-11-07-optimization-step-precision.md)保留完整包、Node 24 和构建证据。

- [数值输入原生表单行为](tasks/2026-11-07-decimal-form-reset.md)：原生重置、取消时序及外置表单验收完成；[当轮集成证据](evidence/2026-11-07-decimal-form-reset.md)随任务归档，后续由双端比例记录承接。

- [双端只读比例展示](tasks/2026-11-07-ratio-percent-display.md)：共享合同、两个首批消费与四宽 36 组真实组件完成；Domain 565、Desktop 1415、Mobile 206 项通过，[当轮共享证据](evidence/2026-11-07-ratio-percent-display.md)保留当轮输入与验证范围。

- [收益、组合与风险比例读数](tasks/2026-11-07-financial-ratio-consumers.md)：七个消费者与无效合计提示完成，Desktop 1448 项及四宽 28 组通过，[当轮共享证据](evidence/2026-11-07-financial-ratio-consumers.md)保留当轮输入与验证范围。

- [文本型比例展示](tasks/2026-11-07-decimal-ratio-display.md)：Domain 614、Desktop 1459、Mobile 210 项及四宽 32 组实际组件通过；[当轮集成证据](evidence/2026-11-07-decimal-ratio-display.md)保留当轮输入与验证范围。已被替代的两轮比例集成证据随闭合 Task 保留于归档。

- [统一回测比例展示](tasks/2026-11-07-backtest-ratio-consistency.md)：列表、详情、基准状态和真实图表统一；1496 项、构建、门禁与四宽 28 组通过，[集成证据](evidence/2026-11-07-backtest-ratio-consistency.md)保留当轮输入与验证范围。

- [策略摘要三位比例](tasks/2026-11-07-strategy-summary-ratio.md)：保留三位、千分位及原始定义，Domain 631、Desktop 1504、Mobile 210 项与四宽 36 组通过；[当轮集成证据](evidence/2026-11-07-strategy-summary-ratio.md)保留当轮输入与验证范围，前两轮闭合证据随任务归档。

- [自选数值非零展示](tasks/2026-11-07-watchlist-number-display.md)：报价、净值、涨跌额与振幅完成；Domain 653、Desktop 1515、Mobile 210 项及四宽 80 组通过，[当轮集成证据](evidence/2026-11-07-watchlist-number-display.md)保留当轮输入与验证范围，上一轮策略摘要证据随闭合任务归档。

- [行情详情比例与百分数值](tasks/2026-11-07-market-percent-units.md)：七条消费路径、Domain 678、Desktop 1559、Mobile 210 项及四宽 24 组通过，[当轮集成证据](evidence/2026-11-07-market-percent-units.md)保留当轮输入与验证范围；上一轮自选数值证据随闭合任务归档。

- [行情数字事实读数](tasks/2026-11-07-market-number-readouts.md)：Domain 714、Desktop 1602、Mobile 210 项及四宽 132 场景通过；[当轮证据](evidence/2026-11-07-market-number-readouts.md)保留精度、图形与受控输入边界。

- [基金收盘估算误差精确展示](tasks/2026-11-07-fund-daily-decimal-display.md)：Domain 767、Desktop 1614、Mobile 222 项，112 个每日误差场景与 32 组双端比例回归通过；[共享集成证据](../evidence/2026-11-07-fund-daily-decimal-display.md)继续供活动任务使用。

- [Desktop 页面按需加载](tasks/2026-11-07-desktop-deferred-pages.md)：入口静态闭包减少 57.41%、默认收益页实际脚本减少 42.68%；Desktop 1620 项、构建、门禁和 32 个基线/当前生产浏览器场景通过，[当轮 Desktop 证据](evidence/2026-11-07-desktop-deferred-pages.md)保留加载与包体积验收。

- [Desktop 公共导航图标与间距](tasks/2026-11-07-desktop-navigation-density.md)：19×2 图标和 800 宽标签缺失修复，9 宽 153 次检查、Desktop 1620 项、构建与门禁通过；[当轮 Desktop 证据](evidence/2026-11-07-desktop-navigation-density.md)保留九宽导航测量。

- [持仓账户列与单项操作宽度](tasks/2026-11-07-portfolio-account-column.md)：窄屏普通账户由 5 行恢复为 1 行，行高降至 56.64px；两轮四宽各 20 场景、Desktop 1620 项、构建和门禁通过；[当轮 Desktop 证据](evidence/2026-11-07-portfolio-account-column.md)保留账户列测量与交互，最新包级输入由[刷新验收](../evidence/2026-11-07-arena-detail-refresh.md)持有。

- [自然语言策略编写流程展示](tasks/2026-11-07-authoring-workflow-ui.md)：三阶段、结果应用、草稿操作与实际定义层级；25 项定向测试、1635 项 Desktop 回归及五宽浏览器验收，详见[证据](../evidence/2026-11-07-authoring-workflow-ui.md)。

- [竞技场与周报详情刷新反馈](tasks/2026-11-07-arena-detail-refresh.md)：相关请求等待、保留旧结果和刷新入口已验收；冻结 Desktop 1629 项、Mobile 231 项及 100 个基线/当前浏览器场景通过。[本轮验收证据](../evidence/2026-11-07-arena-detail-refresh.md)继续供活动任务使用，并单独保存主工作区并行差异。

- [普通回测研究默认规则](tasks/2026-11-07-backtest-research-defaults.md)：用户确认的研究假设已接通，截图区间真实模型解析可用，四宽 24 组检查通过；[验收证据](evidence/2026-11-07-backtest-research-defaults.md)区分模型准备、真实准入和受控提交。

- [回测提交后的任务页导航](evidence/2026-11-07-backtest-submit-navigation.md)：提交成功进入回测任务，失败保留配置并支持重试；51 项定向验证及四宽浏览器通过。

- [回测准备失败任务](tasks/2026-11-08-backtest-preparation-failure-jobs.md)：准备及预检失败进入任务列表与详情；已有阻塞记录只读原请求后幂等关联，四宽 12 组验证通过，详见[验收证据](evidence/2026-11-08-backtest-preparation-failure-jobs.md)。

- [策略版本关联记录](tasks/2026-11-08-strategy-version-records.md)：两个页签直接显示当前版本的回测与实验，1697 项 Desktop 测试及四宽 28 组检查通过，见[验收证据](evidence/2026-11-08-strategy-version-records.md)。

- [基金净值参考与测量](tasks/2026-11-08-fund-nav-reference-measurement.md)：成本可见性、双点蒙层、取消与账户隔离完成，四宽浏览器及真实持仓通过，详见[验收记录](evidence/2026-11-08-fund-nav-reference-measurement.md)。

- [行情常用选项](tasks/2026-11-08-common-chart-choices.md)：周期四项、区间三项直接显示，其余使用更多菜单；197 项测试及两套四宽浏览器验收通过，详见[验收记录](evidence/2026-11-08-common-chart-choices.md)。

- [行情工具栏加载稳定性](tasks/2026-11-08-chart-toolbar-stability.md)：周期能力分批返回时保持分组位置和行数，两套四宽浏览器通过，详见[验收记录](evidence/2026-11-08-chart-toolbar-stability.md)。

- [行情参考工具区布局](evidence/2026-11-08-chart-reference-tools.md)：模型与测量共用展开区，图表前统一留白；197 项回归及四宽实际浏览器通过。

- [行情图标说明](tasks/2026-11-08-chart-info-tips.md)：共享提示用于账户与行情，199 项回归及四宽浏览器通过，详见[验收记录](evidence/2026-11-08-chart-info-tips.md)。

- [MACD 图层遮挡](tasks/2026-11-08-macd-series-layering.md)：柱体置于 DIF、DEA 下方；197 项回归、四宽原生画布及副图恢复验证通过，详见[验收记录](evidence/2026-11-08-macd-series-layering.md)。

- [统一市场开闭市状态](tasks/2026-11-09-unified-market-session.md)：报价、基金、调度、后台报价、风险与采样接入同一日历，项目规则及边界门禁落地，详见[验收记录](evidence/2026-11-09-unified-market-session.md)。

- [严格校验与对象投影排查](tasks/2026-11-09-schema-projection-audit.md)：330 个生产校验调用及关联消费路径排查，修复复盘请求及三个多窗口消费者，详见[验收记录](evidence/2026-11-09-schema-projection-audit.md)。

- [模型筛选选中态](evidence/2026-11-09-arena-model-selection.md)：共享单选组、模型请求与点位同步、四宽浏览器验证，以及实际零成交和筹码来源未配置的核对。
