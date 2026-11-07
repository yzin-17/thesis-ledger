# 从用户入口到业务结果的自动化检查

检查日期为 2026-11-06。检查对象是当前 Desktop 路由、Mobile 五个一级入口对应的业务流程，以及它们调用的 Server、Worker、定时任务和 DSA 资料准备入口。按用户目的分组，同一流程的按钮、筛选项和 63 类参考资料不逐个计数。以下判断区分源码接线、目标库当前状态和已有真实样本。本次只读检查，没有重新发起行情、研究、模型、通知、交易或比赛，也没有重演全部界面。

后续四项的实施结果与验证范围见[自动接续验收](../evidence/2026-11-07-user-workflow-continuity.md)。下表记录实施前的状态。

## 需要优先处理的接续点

| 优先顺序 | 从用户角度看到的问题 | 建议的完成条件 |
| --- | --- | --- |
| 1．研究到期复核 | 提交研究时行情和新闻会自动准备，但过了 5 或 20 个交易日还要回报告点“按需复核”。缺少对应标的和窗口的合格经济价格时，这次真实样本还靠维护脚本取证和入库。 | 一次提交后，关闭客户端仍可在到期后看到复核结果或具体缺料原因。复用合格资料，同一论点和窗口幂等处理。新增来源读取须符合费用约束，费用未核实的 HiThink 不作无人值守补取。 |
| 2．风险规则到后台扫描 | 桌面引导按“存在已启用规则”判断风险步骤。当前库中没有风险扫描任务，即使此时打开一条规则，也没有这项定时扫描来接手。 | 在同一处显示规则、扫描排程、最近实际扫描结果和通知条件。用户一次明确选择启用监控后再安排扫描；未启用也能一眼看出。 |
| 3．回测与优化的准备步骤 | 常规回测、基金净值回测和优化实验把准备输入与创建任务拆成独立操作。后台会准备适用的公告，但准备成功后仍由人发起下一步。 | 同一入口处理准备和提交；仅在价格口径、研究假设、封存范围或费用需要决定时展示确认。测试覆盖准备期间关页、重入、重复提交和来源变化。 |
| 4．基金分钟估算到每日误差 | 已接入的基金在交易时段会自动采样。披露日期缺失时，目前只有已登记的基金季度参考可供匹配；当天最后有效点与正式净值的误差也由专题验收单独生成。 | 对支持的基金和报告期维护可验证披露；后台固定最后有效点，在同日正式净值到达后保存可追溯误差。净值未出、缺证明、覆盖偏低分别展示。 |

## 按业务入口核对

| 用户目的 | 正常操作和系统接手的位置 | 实际边界与依据 |
| --- | --- | --- |
| 首次使用、账户、成交、划转、基线对账 | 创建账户、录入事实由用户发起。账本根据已有事实生成对账候选；确认交易归属、修订及写账保留人工决定。 | 桌面首次使用引导汇总账户、持仓、来源和规则；风险步骤缺少实际排程检查。[引导状态](../../apps/desktop/src/features/onboarding/onboarding.api.ts)、[基线对账](../../apps/server/src/ledger/baseline-reconciliation.service.ts)、[手机操作说明](../guides/2026-10-25-mobile-client.md) |
| 截图导入、审核与提交 | Mobile 上传得到草稿，审核和入账是另一动作。 | 两端上传请求的 extracted 均为空，正常上传处理器直接调用 createDraft。服务里有可接识别器的方法，不能据此推断普通上传会调用它。[移动上传](../../apps/mobile/src/platform/files/picked-file.ts)、[上传处理](../../apps/server/src/imports/import.controller.ts)、[桌面审核入口](../../apps/desktop/src/features/import/ImportDraftReviewList.tsx) |
| 标的搜索、自选、标的详情 | Server 启动和定期检查目录；首次搜索空目录会合并到同一同步任务，限时等待。自选列表按已有项目取报价或基金净值；详情可带标的进入调研。 | 设置中的“同步目录”是可选操作。当前库目录第 30 代、35,575 个活跃标的。来源故障时仍可能需稍后重试。[目录就绪服务](../../apps/server/src/market/catalog-readiness.service.ts)、[自选价格](../../apps/server/src/watchlist/watchlist-prices.ts)、[详情中的研究入口](../../apps/desktop/src/features/market-detail/InstrumentReading.tsx) |
| 查看组合、收益、快照 | 打开相关页面按账户取组合估值；持仓自动读报价或基金净值。盘中采样、收盘估算与正式快照校准各有独立任务。 | 当前三个任务均启用。缺价格显示部分估值；组合正式快照校准与单基金误差属于不同结果。[组合取价](../../apps/server/src/portfolio/portfolio-position-valuation.ts)、[定时任务处理器](../../apps/server/src/automation/automation-runtime.service.ts) |
| 单基金有效分钟、披露、收盘误差 | 采样处理覆盖相应持仓基金，依赖有效披露和有时效的价格。来源已有可用披露日期时直接核对；缺日期才使用匹配参考。 | 当前 DSA 登记 161725.OF 的 2026-Q2 和 000001.OF 的 2026-Q3。000001.OF 的 11-06 样本有 233 个有效分钟，最终估算 0.9905325019837131、正式净值 0.978，覆盖 39.93%。误差文件出自当晚验收；持续采样与每日自动留存误差需分别验收。[披露登记](../../../daily-stock-analysis/data_provider/fund_disclosure_reference.py)、[同日误差证据](../evidence/2026-11-06-fund-same-day-error.md) |
| 定期资金、基金定投 | 设置计划后，现有 09:00 任务生成到期发生项。确认实际入金或成交再入账，也可跳过。 | 今日两类任务均有成功记录；任务成功只代表已运行，发生项取决于是否有计划到期。[资金计划](../../apps/server/src/cash-plans/recurring-cash-deposit.service.ts)、[基金定投真实验收](../evidence/2026-10-04-recurring-fund-runtime.md) |
| 发起调研、取得报告 | 两端“准备并提交研究”都会走同一服务：解析研究范围，按对象和模板读股票报价或基金净值、新闻和已有业务资料，冻结后派发。必需材料不可用时在模型调用前停止。 | 这一步无需先逛资讯或行情页。后台只准备该模板所需资料；不承诺遍历所有参考数据。[研究提交](../../apps/server/src/research/research-submission.service.ts)、[手机提交](../../apps/mobile/src/features/research-submit/ResearchSubmitScreen.tsx) |
| 研究比较、方向复核 | 比较已存报告是读取操作；价格方向复核要显式提交。事件无发生窗口的读者优先找精确匹配证书，正常入口没有调用维护发布脚本。 | 600519.SH 原 5 日窗口有真实正向结果；证书取得和发布、到期触发均未普遍自动化。缺料保留原价格门槛。[复核按钮](../../apps/desktop/src/features/ai/use-research-observation.ts)、[证书读者](../../apps/server/src/market/market-event-free-reader.ts)、[真实验收](../evidence/2026-11-06-research-economic-price-qualification.md) |
| 资讯、公告、参考数据、规则变更 | 独立资讯和参考资料页按用户指定条件查询，公告库展示已收录内容；调研的新闻消费有自己的调用链。规则资料监测可配置定期检查。 | 公告检索不会自动补齐所有历史材料。适用的境内股票固定快照回测有独立公告准备入口。定期规则检查需选来源并启用；变更采纳保留审核。[公告准备](../../apps/server/src/market/market-announcement-preparation.service.ts)、[参考资料范围](../guides/market-reference.md)、[规则监测](../guides/market-chart-and-rule-monitor.md) |
| 自然语言编写策略 | 描述、分析、澄清、生成和采纳草稿分别有入口；已有自动保存和服务端执行。保存策略后由用户选择是否回测。 | 策略含义、采纳版本、运行资金和日期需要用户决定。分析、生成和修改可能是不同模型调用，不应隐式串联。[编写表单](../../apps/desktop/src/features/strategy-authoring/AuthoringEditorForms.tsx)、[澄清与回测选择](../../apps/desktop/src/features/strategy-authoring/AuthoringClarification.tsx) |
| 普通回测、净值回测 | 显式准备并核对输入，再提交运行；满足条件后 Server 自动入队，Worker 执行，通常无需第三次点“运行”。 | 常规和净值路径分别检查；当前库保存 84 个成功、15 个失败的回测，不能据历史数量推定所有路径成功。[普通回测准备](../../apps/desktop/src/features/strategy/BacktestPricePreparation.tsx)、[净值回测双按钮](../../apps/desktop/src/features/strategy/NavBacktestSetupSections.tsx)、[普通入队](../../apps/server/src/backtest/backtest-v3-run-lifecycle.ts)、[净值入队](../../apps/server/src/backtest/backtest-nav-run.service.ts) |
| 优化、封存测试集、采纳候选 | 先准备实验配置，再创建实验；开发与验证随后执行，选定候选、揭示测试集与采纳保留独立决定。 | 真实样本验证过 1 次模型与 6 次回测。它不能证明所有探索调用都能产出候选。[准备](../../apps/desktop/src/features/strategy/OptimizationPricePreparation.tsx)、[实验创建](../../apps/desktop/src/features/strategy/StrategyOptimizationExperimentPanel.tsx)、[真实样本](../evidence/2026-10-31-optimization-g1-and-cost.md) |
| 风险规则、后台扫描、事件通知 | 风险扫描处理器会准备估值上下文、评估规则；已入队的通知有独立投递器。后台扫描需要已启用的扫描任务。 | 目标库风险规则共 7 条，其中启用且未归档为 0，风险扫描任务为 0。历史已送达通知有 2 条，不能推出当前规则在受监控。引导应该明确下一次扫描。[调度器](../../apps/server/src/automation/automation.scheduler.ts)、[扫描处理](../../apps/server/src/automation/automation-runtime.service.ts)、[通知投递](../../apps/server/src/notifications/notification.dispatcher.ts) |
| 交易与周期复盘 | 选择对象或窗口，开始复盘会读取账本事实并计算。保存复盘快照和请求 AI 解读都是显式操作。 | 若目标是留存，当前要再点“保存复盘快照”，可提供“分析并保存”。AI 解读涉及模型，应继续由用户发起。[工作台说明](../guides/2026-10-04-journal-review.md)、[AI 解读入口](../../apps/desktop/src/features/journal/review/JournalAiRunPanel.tsx) |
| 模型比赛、开轮、成交与周报 | 选标的与模型、建立草稿、确认预算启动；随后轮次 Worker 准备行情，决策与开盘执行器处理到期事项，周报 Worker 发现到期周。 | 当前 2 场草稿、1 场暂停，1 条已排程发生项，周报为 0。即时回放有真实模型结果，但到下一开盘成交、自然周结案仍待前向验收。保持用户暂停决定。[开轮](../../apps/server/src/model-arena/arena-round-worker.ts)、[周报](../../apps/server/src/model-arena/arena-week-worker.ts)、[目标证据](../evidence/2026-11-06-watchlist-arena-target.md) |
| 来源设置、健康、诊断、日报与备份 | 凭据、授权、来源选择、预算由用户配置。来源健康另有定时器。完整性检查、问题处理是独立管理动作；日报、备份、行情同步等按实际任务开关运行。 | 当前两条日报均停用，任务表未配置备份或行情同步。报告和自选取价直接使用业务读者，不以这几项为前置条件。[健康检查](../../apps/server/src/providers/provider-health.scheduler.ts)、[任务处理器](../../apps/server/src/automation/automation-runtime.service.ts)、[诊断入口](../../apps/server/src/integrity/integrity.controller.ts) |

## 运行态核对与复验标准

北京时间 23:22 在目标开发 PostgreSQL 的只读事务中核对 AutomationJob 与每项最近的 AutomationRun。启用项共五个：盘中分钟估值（最近 14:59）、收盘估算（16:00）、正式快照校准（06:30）、基金定投和定期资金发生项（均 09:00）。最近一次运行在库中均为 succeeded。业务结果需看估值点、正式净值、发生项或通知送达记录本身。其余两条日报已停用。竞技场与标的目录使用各自的后台执行器，不能仅从 AutomationJob 表判断。

后续复验应从两端正常业务入口触发一次，记下请求身份和预期结果，关闭页面后检查服务端是否继续；到期再打开时直接读同一结果。对每类流程分别验证成功、资料不足、用户明确暂停及重复提交。凡涉及资金入账、费用未知的来源、启动模型、封存测试集或发布策略，保留真正改变结果或授权范围的决定。上述优先顺序是产品改进建议，本次未改变任何任务开关或价格门槛。
