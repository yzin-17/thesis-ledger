# DSA 上游能力参考与 ThesisLedger 接入评估

核查日期：2026-10-18（Asia/Shanghai）。本轮只读检查当前源码与公开上游，未同步代码、修改配置、启动模型分析或发送通知。本文记录能力价值、版本差异与建议，不作为实施 Task 或运行验收。

## 1. 结论

**有参考价值，最值得借鉴的是结构化研究产物、报告变化追踪、决策复盘和 Agent 轨迹评估。** DSA 的原生股票分析与多 Agent 流程也有参考价值，适合研究其上下文组织、任务分工和结果表达。

当前确定的实施方向是 DSA 只承担数据供给，ThesisLedger 在现有模型配置、费用授权、工具审计、结果保存与通知模块上完善研究能力。设计与任务状态以[实施方案](../specs/2026-10-18-research-evidence-evolution.md)和[优先级任务](../tasks/2026-10-18-research-evidence-evolution.md)为准，本文继续保存上游能力与成熟度证据。

上游本次查询到的最新发布为 **v3.33.0，发布于 2026-10-15**；最新 `main` 为 **`7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32`，提交于 2026-10-17**。最新提交撤回了 API Route 与 Opper 两项误合入集成，不能将它们计为当前可用的新功能。[发布记录](https://github.com/ZhuLinsen/daily_stock_analysis/releases/tag/v3.33.0)、[最新提交](https://github.com/ZhuLinsen/daily_stock_analysis/commit/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32)

## 2. 比较基线

| 项目 | 核对结果 |
| --- | --- |
| 正式上游 | `ZhuLinsen/daily_stock_analysis`，默认分支 `main` |
| 本地 Fork | `yzin-17/daily_stock_analysis`，当前分支 `yzin` |
| 本地 HEAD | `dd26571509e842ab230c393f5f339911ea98425d` |
| 本地与已保存上游引用的共同基线 | `ed848da6f0fc1080e1a61a1799b9c7d510a3eaca`，2026-08-05 |
| 本地已保存的 `upstream/main` | `1168e316269baa38752a8901331a4d7aa8b1fd07`，2026-09-13；这个引用的日期不代表当前分支已合入到该日 |
| 本次远端 `main` | `7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32` |
| 上游提交差异 | 共同基线之后有 102 个提交；这是提交数量，不是新增功能数量，也不证明每项内容在 Fork 中都缺失 |
| 本地工作区 | 核查开始时有 37 条未提交路径，主要涉及数据适配与测试；本轮保持原状 |

通过远端分支查询、GitHub 发布记录、固定提交下的源码与文档交叉核对。没有对当前分支执行 pull、merge、rebase 或 reset。新增能力还逐项检查了本地文件与关键入口，避免仅根据版本号判断。[上游提交比较](https://github.com/ZhuLinsen/daily_stock_analysis/compare/ed848da6f0fc1080e1a61a1799b9c7d510a3eaca...7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32)

## 3. 四类原生能力的参考价值

### 3.1 股票 AI 分析：借鉴研究流程和表达，按统一输入评估结果

DSA 将行情、技术指标、新闻等材料组织为单标的分析上下文，再生成结论、风险和操作解释。这对 ThesisLedger 有两个直接价值：

- 帮助研究助手形成更稳定的单标的研究模板，例如观点、依据、反证、观察条件与未知项。
- 帮助用户先看到重点，再逐层查看数据、来源和分析过程，而不是先读一整篇长报告。

本地 Fork 已有 `StockAnalysisPipeline`，所以这部分主要是尚未被 ThesisLedger 消费的既有能力，不应整体标为上游最近才新增。[本地分析流水线](../../../daily-stock-analysis/src/core/pipeline.py)

**建议做法：** 先选同一批单标的研究问题，冻结相同的可用数据、研究时间和预算，对比 ThesisLedger 与 DSA 的输出。评价引用是否正确、是否保留未知、是否回答问题，以及调用成本和失败行为，再决定是否引入某个分析阶段。

**需要保留的边界：** DSA 原生分析有自己的 `DataFetcherManager` 优先级与回退机制；ThesisLedger 数据服务使用另一套显式路由和准入规则。若直接调用原生分析，其自行取得的数据不自动成为符合 ThesisLedger 路由、历史可得性或冻结要求的证据。模型给出的方向和评分也应作为观点处理。[本地专用执行器](../../../daily-stock-analysis/src/services/thesis_ledger_provider_runtime.py)

### 3.2 Agent 编排：分工和故障处理值得学，多 Agent 的收益需要验证

上游当前编排包含技术、情报、风险、决策阶段，支持不同深度：`quick` 为技术与决策，`standard` 增加情报，`full` 增加风险，`specialist` 还可按 Skill 插入专家阶段。单 Agent 与多 Agent 机制本地已经存在。[上游阶段构造](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/src/agent/orchestrator.py#L876)

值得借鉴的是阶段职责、剩余预算、超时、非关键阶段降级、关键阶段失败和结果汇总。ThesisLedger 可以先在现有执行框架内加入明确的反证或风险检查步骤，观察其增益，再决定是否拆成多个模型调用。

**本轮更值得优先吸收的新增内容是轨迹评估。** 上游现在能检查期望工具是否出现、重复调用、失败和重试、步数，以及多 Agent 阶段完成、失败、跳过和局部/累计步数。ThesisLedger 已有 Tool call 审计，可在现有记录上增加类似评估层，无需先替换执行器。[轨迹评估实现](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/evals/agent_trajectory/metrics.py)

上游当前评估是报告工具，指标违规不会直接使运行失败，也没有成为 CI 阻断门禁；纯指标计算可以离线执行，但运行真实 Agent 的评估入口会调用已配置的工具和模型。本轮没有执行这些调用。[评估边界](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/docs/agent-trajectory-eval.md)

### 3.3 原生分析报告：结构化产物的价值高于复制报告页面

上游新增 `ResearchArtifact`，把一份研究表示为：研究对象、观点、证据、失效条件、下一步动作、数据质量，并关联来源报告。最有价值的补充是 **“在什么情况下需要重新评估这个观点”**，它能连接研究、自选、风险提醒和后续复盘。[产物 Schema](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/api/v1/schemas/research_artifact.py)

ThesisLedger 已有结构化研究结果、引用校验和持久化，因此建议扩展现有结果契约：补充明确的观察期限、失效条件和可解释的下一步动作，不另建一套互不关联的报告系统。[现有结果校验](../../apps/server/src/ai/ai-research.executor.ts)、[现有结果保存](../../apps/server/src/ai/ai-execution-state.store.ts)

需要特别注意上游现阶段的实现边界：

- 当前 Stock Profile API 从已有历史详情动态构建产物；在报告生成时冻结并持久化完整 `structured_report` 仍是后续范围。
- 证据 `as_of` 只取显式来源时间；不能把报告创建时间或抓取时间替代为行情观测时间。
- 每份产物至少有一条失效条件，但条件可由默认规则生成，不等于每条条件都有独立、充分的原始证据。
- 文档中的 `confidence` 由情绪评分转换，不能直接解释成经过统计校准的成功概率。

因此，应借鉴字段与产品流程，同时沿用 ThesisLedger 已有的冻结、来源引用及历史事实约束。[产物实现与限制](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/docs/research-artifact.md)

### 3.4 报告历史：从“查旧报告”发展到“解释观点变化”

DSA 已有历史列表、详情、Markdown、新闻材料、运行诊断和流程读取；本地还已有 `history_comparison_service.py`，会提取同一标的近期信号变化，并排除当前记录。这些基础能力不是本轮上游才新增。[本地历史比较](../../../daily-stock-analysis/src/services/history_comparison_service.py)、[上游历史接口](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/api/v1/endpoints/history.py)

对 ThesisLedger 更有价值的方向是：同一研究对象前后两次报告，观点、风险、证据和未知项分别发生了什么变化，变化是否由新数据、模型、提示词或研究范围造成。这是建议扩展的产品能力；上游文档中的完整 `ResearchArtifact` 观点/证据差异比较也仍属于后续接入方向，不能把它描述成已完整交付。

最近新增的决策信号复盘则已经有明确入口：`GET /api/v1/decision-signals/stocks/{stock_code}/review`。它聚合样本数量、命中率、常见未命中原因和置信度调整方向；Agent Memory 可以将摘要作为独立上下文段使用。[复盘接口](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/api/v1/endpoints/decision_signals.py#L328)

这适合参考为“研究建议事后评估”。但它评估的是决策信号结果，不能替代 ThesisLedger 基于真实成交的投资复盘。样本不足、无法评估比例高或数据质量弱时，上游保持 `observe`，不将结果当作买卖强度信号；历史反馈也只能使用研究当时已经形成的信息。[聚合与降级规则](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/src/services/decision_signal_outcome_service.py#L374)

## 4. 相对本地基线，上游有哪些值得关注的新增内容

以下按当前上游代码和发布记录归纳。基础分析、单/多 Agent、普通历史报告和历史信号比较本地已有，未计入“从无到有”的新增项。[v3.33.0 与 v3.32.0 更新记录](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/docs/CHANGELOG.md)

| 新增或增强 | 上游当前状态 | 本地核对及 ThesisLedger 价值 |
| --- | --- | --- |
| 结构化研究产物与个股聚合资料 | v3.32.0 已加入产物契约及 Stock Profile API，可组合部分可用资料 | 本地缺少产物 Schema、构建服务和 Profile 服务；适合扩展现有研究结果与标的研究页面 |
| 决策信号复盘、Agent 记忆反馈 | v3.33.0 提供只读复盘聚合，并在记忆启用时注入 | 本地已有普通 Agent Memory，但未发现新 `/review` 入口和 `get_decision_signal_review`；适合建议质量评估 |
| Agent 轨迹评估 | v3.32.0 增加最小评估入口，v3.33.0 增加多阶段轨迹 | 本地缺少 `evals/agent_trajectory/` 的指标入口及阶段快照；适合复用 ThesisLedger 工具审计进行评估 |
| 服务端保存权威讨论对象 | v3.33.0 支持刷新、重开、会话切换与 Bot/Web 间恢复；加强同名、别名和跨市场识别 | 本地缺少新的 `chat_object_decision.py`；若未来加入多轮研究，可借鉴对象确认、状态版本及迟到响应防覆盖 |
| 自选股“变化 / 状态 / 下一步” | v3.33.0 已进入 Web 首页；依据今天是否分析、任务状态和报告可用性展示 | 本地缺少新状态 helper；直接关联体验评审 F01/F02，帮助用户知道下一步该做什么 |
| 组合风险与暴露看板 | v3.33.0 汇总集中度、回撤、止损、AI 信号、价格质量、市场及币种暴露 | 基础组合与风险本地已有；值得借鉴聚合展示及缺价、旧汇率、分类不全时的状态处理，关联 E05/E08/E16 |
| 只读数据中心 | v3.33.0 展示来源能力、数据集质量和运行时优先级 | 本地缺少 DataCenterPage 和对应服务；ThesisLedger 已有控制面，可借鉴展示方式，避免再建一套配置事实源 |
| 选股解释与证据追踪 | v3.33.0 增加 Why Selected / Why Now、来源与质量状态、新闻事件及条件检查接口 | 可参考研究证据解释、真实零值与缺失区分；不能把“被选入”直接当作投资建议或已验证事实 |
| 规则化 ETF 双动量轮动 | v3.33.0 提供独立 CLI、调仓信号、扣成本回测、年度对比和参数检查，不调用 LLM | 本地缺少 `src/core/etf_rotation.py`；适合作为策略模板和测试用例参考，接入时仍使用 ThesisLedger 的执行与数据契约 |
| FXMacroData、妙想及模型渠道补充 | 新增只读宏观工具、筹码/资金流补充来源，以及 Requesty、Modelflare 配置改善 | 本地缺少 FXMacroData 工具文件；属于可选扩展，进入 ThesisLedger 仍需单独登记能力、凭据与准入 |
| 确定性 Web 意图解析基础模块 | v3.33.0 已有模块和测试，但尚未接入 Web SSE 执行入口 | 本地缺少新 resolver；可研究消歧与确认设计，不能按“开箱即用的完整多意图执行”排期 |
| 运行与数据质量修复 | 包括调度重复派发、超时部分结果、日线日期/缓存时效、基本面解析及科创板成交量单位 | 升级时应逐项核对受影响的来源及旧数据，不能因上游修复存在就宣称本地生产消费已修复 |

### 4.1 对当前体验评审最直接有帮助的两处

**自选股状态行：** 当前“变化”主要表示分析报告是否更新，并不是实时价格变化或观点语义变化；未知状态先提示确认，正在执行的任务不计为待分析。可以借鉴这种清晰、保守的状态表达，后续再结合 ThesisLedger 的研究结果扩展。[自选股状态说明](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/docs/watchlist-next-action.md)

**风险与暴露看板：** 上游明确处理了缺价、汇率过期、行业覆盖不足和快照读取失败，避免把未知显示成正常、零风险或空组合。这与体验评审中的估值完整度、风险空状态问题高度相关，适合参考其反例和验收场景。[看板与质量边界](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/docs/portfolio-risk-exposure-dashboard.md)

对应原评审见[用户体验优化文档](2026-10-14-user-experience-optimization.md)。其中全局实际/模拟模式 R01 仍由 ThesisLedger 账户上下文决定；可以借鉴上游会话状态版本与对象确认的机制，但不能让模型自行改变账户模式。

### 4.2 ETF 轮动的可参考部分与限制

可参考的部分包括调仓信号与成交时间分离、相对/绝对动量筛选、换仓缓冲、交易成本，以及缺价、历史不足、防守资产不可买入时的明确处理。

当前上游实现限定于合格的前复权 A 股 ETF 数据路径，信号在调仓日收盘后形成，下一交易日收盘执行。它是一套独立规则回测，不能直接视为适用于所有市场、现金分红口径或所有交易约束的通用引擎。建议移植策略规则和反例测试时，映射到 ThesisLedger 既有策略、快照和执行模型。[ETF 轮动规则与数据边界](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/docs/etf-rotation.md)

## 5. 哪些内容应优先吸收

| 建议顺序 | 内容 | 可独立验证的交付目标 |
| --- | --- | --- |
| 第一批 | 研究失效条件、观察期限、数据质量与可读下一步 | 同一份研究结果在列表、详情和后续复盘中保持同一含义；缺失证据保持未知 |
| 第一批 | 工具轨迹评估 | 用已有 Tool call 审计计算缺失工具、重复调用、失败和预算消耗；先建立基准，再决定门禁阈值 |
| 第一批 | 自选状态与风险质量展示 | 验证有数据、缺价、旧汇率、请求失败、无报告和任务进行中等状态，复用原体验评审验收 |
| 第二批 | 同对象历史报告变化与研究建议复盘 | 区分观点变化、输入变化和模型变化；信号评估与真实交易复盘分别统计 |
| 第二批 | 对象确认与跨页面/多轮上下文 | 明确账户模式、账户和标的归属；旧响应不覆盖新选择，刷新和恢复结果一致 |
| 第三批 | ThesisLedger 阶段化深度研究 | 与现有研究链路使用一致的输入、预算和评价集，证明质量或覆盖增益后再激活 |
| 按具体需求 | ETF 轮动、新宏观工具或新来源 | 单独验证策略语义、数据能力、来源许可与目标运行环境，不因同步代码自动启用 |

以上保留能力价值的分组；当前实施顺序、依赖和验收以[配套 Task](../tasks/2026-10-18-research-evidence-evolution.md)为准。本轮仍为文档规划，未开始代码实施。

## 6. 当前职责划分与实施入口

DSA 保留正式数据合同、来源治理、新闻检索、原件和数据任务。ThesisLedger 拥有研究对象、模型与预算、冻结证据、结构化产物、历史和复核。完整职责及移除范围分别由两组规格维护：

- [DSA 纯数据服务规格](../../../daily-stock-analysis/docs/specs/2026-10-18-data-only-service.md)与[任务](../../../daily-stock-analysis/docs/tasks/2026-10-18-data-only-service.md)：独立运行、新闻生产合同、产品代码移除、数据留存与部署。
- [ThesisLedger 研究增强规格](../specs/2026-10-18-research-evidence-evolution.md)与[任务](../tasks/2026-10-18-research-evidence-evolution.md)：数据消费、研究产物、模式隔离、历史、复核与轨迹评估。

当前运行源码仍通过 `/api/v3/thesis-ledger/*` 消费 DSA 数据与控制能力。两组规格描述未来改造，尚未改变这一运行状态。[当前 DSA 客户端](../../apps/server/src/integration/dsa/dsa.client.ts)、[当前研究执行器](../../apps/server/src/ai/ai-research.executor.ts)

## 7. 成熟度与验证说明

- 已核对最新发布、远端 `main`、共同基线、本地关键文件，以及结构化产物、Agent 阶段、轨迹指标、决策复盘接口和记忆注入的上游实现。
- 前述功能状态来自代码和文档检查，不代表已经在本地启动上游最新版本、运行全部测试或完成浏览器验收。
- 多 Agent、模型渠道、宏观工具和 ETF 轮动未执行实源调用。当前环境的可用性和费用不在本轮验证结论内。
- 上游结构化产物完整冻结、观点语义差异比较，以及新意图解析器的 Web SSE 接入仍有明确后续范围；未将它们算作完整可消费能力。
- 上游轨迹评估目前是报告工具；不能以“已有评估目录”声称质量门禁已经建立。
- API Route 与 Opper 集成已被最新提交撤回。当前可用功能以固定提交的最终树为准。
- 上游核查与后续实施规划均只修改说明文档，没有改动应用代码、Git 分支或目标运行态。
