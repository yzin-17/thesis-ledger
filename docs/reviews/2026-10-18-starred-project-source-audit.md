# 收藏项目实现级核查结果与反例

> 核查日期：2026-10-18；任务：研究增强 T0R。覆盖状态与旧问题对账见[主清单](2026-10-18-starred-project-implementation-coverage.md)。
> 本文保存逐项目源码比较和本次新增反例；不维护修复完成状态。13 个范围内项目的既定参考点已形成处理决定，REF05 按用户要求排除。

## 1. 核查口径与固定版本

本轮使用 GitHub 固定提交的实际函数与测试、本地未提交源码及原 Task 证据。12 个仓库的递归树均未截断；目录检索用于定位，只有已读函数/测试进入结论。以下源码链接为可复查定位，不表示逐行审计链接覆盖的全部文件。未运行外部项目整体应用、SDK、模型、Docker 或数据库；所列外部测试是代码阅读证据，不写成测试通过。

主仓 HEAD `da002744bd317b7754832c6ac41d169bcf005e27`、DSA HEAD `dd26571509e842ab230c393f5f339911ea98425d`、infra HEAD `3f661df1deb3de894755dcc66e584abb4165d014`，加本轮开始的工作区修改；开始时分别有 421/38/23 条未提交路径。仅 HEAD 不能重现这些未提交输入。

| 编号 | 项目 | 固定源码基线 |
| --- | --- | --- |
| REF01 | HiThink-Tech/Financial-API | `@hithink-tech/hithink-finance-cli@0.1.13`；gitHead `81748bcfd20ef520b440250690d4f41a65bcae69a` |
| REF02 | simonlin1212/a-stock-data | `29b07d2e37005b9fd568bca1262f6e572b5f9407` |
| REF03 | HKUDS/Vibe-Trading | `9d646f228732f01634bbd119793257b1754014a9` |
| REF04 | refraction-ray/xalpha | `a0727129e08140eea017a8f21294041ab53ca1d6` |
| REF06 | akfamily/akquant | `d9fd9d7565df93f04af0d3a6d8ad8cacd8a7b3dd` |
| REF07 | ghostfolio/ghostfolio | `e880216151df621d44f4a0f841c1180a0f41864f` |
| REF08 | microsoft/qlib | `54355232463878d2eebb91fe0ee5fa7fa1f5976c` |
| REF09 | microsoft/RD-Agent | `484776c211e4fbbeef03e0ec00d6bbee7362a4f4` |
| REF10 | fasiondog/hikyuu | `d8e7b5787be3650a9f989eb4216b19caeeb08279` |
| REF11 | vnpy/vnpy | `c6e231caf32b7fc97e6459817fff66458cf7e7c4` |
| REF12 | ZhuLinsen/daily_stock_analysis | `7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32` |
| REF13 | myhhub/stock | `b6e0ca2268cfbadd02f5ed052159c187b6670231` |
| REF14 | GrayJS/alpha-arena | `043761eba6929b5c4b2229cd7a96b0c267b114ff` |

HiThink 原仓当前 404；发布包由 npm 镜像取得，元数据指向原仓，并以登记的 SHA-512 integrity 校验内容。包 SHA-256 为 `0e3deecc7e210c0027fbf96cbc6d3ef7451108bcc37b867a4395332fd5ae51f27`。这是明确版本的替代源码证据，不是当前仓库或私有供应商端的完整审计；未取得随包发布的供应商端测试。[发布元数据](https://registry.npmmirror.com/@hithink-tech%2fhithink-finance-cli/0.1.13)。

## 2. 逐项目实现比较

<a id="ref01"></a>
### REF01 · HiThink-Tech/Financial-API：已有连接与财务、估值、分类能力不是同一件事

**源码与测试定位：** [dist/infrastructure/fuyao/client.js:1–190](https://cdn.jsdelivr.net/npm/@hithink-tech/hithink-finance-cli@0.1.13/dist/infrastructure/fuyao/client.js)；[dist/infrastructure/fuyao/pagination.js:1–43](https://cdn.jsdelivr.net/npm/@hithink-tech/hithink-finance-cli@0.1.13/dist/infrastructure/fuyao/pagination.js)；[dist/application/use-cases/remote-query.js:1–66](https://cdn.jsdelivr.net/npm/@hithink-tech/hithink-finance-cli@0.1.13/dist/application/use-cases/remote-query.js)；[dist/contracts/remote-capabilities.js:1–520](https://cdn.jsdelivr.net/npm/@hithink-tech/hithink-finance-cli@0.1.13/dist/contracts/remote-capabilities.js)。

**本地入口：** [daily-stock-analysis/data_provider/thesis_ledger_sources/hithink.py](../../../daily-stock-analysis/data_provider/thesis_ledger_sources/hithink.py)。

**实际差异：** 原 GitHub 仓库本轮返回 404，改用 @hithink-tech 发布的 hithink-finance-cli@0.1.13 可读 JavaScript 实现；包元数据指向原仓，记录 gitHead 并校验 SHA-512 完整性。这只证明该发布版本，不能声称已取得当前不可访问的仓库树或供应商私有服务实现。实际代码区分远端能力定义、请求执行与分页；paginate() 要求页数/行数上限或流式输出，返回 items/truncated/pages。财务、估值与成分能力有独立定义，本地 HiThink 生产绑定仍为日线、快照与基金现金事件。

**处理决定：** 保留现有 HiThink 绑定；财务三表/指标、估值与指数分类是新增能力候选，不是已有接口失效。采用分页的显式截断表达，不因 CLI 宣称某能力就登记账户可用。该发布包未包含足以复用的供应商端测试与历史单位/披露证明，真实端点资格仍独立验收。

**最小反例/消费条件：** 相同报告期的单季/年初累计、元/万元、修订披露分别建样例；达到 maxRows 时必须显示截断；价格请求成功后财务权限拒绝不能显示整家健康可用；未知分母不输出零估值。

**归属：** DSA D0 保全当前绑定；新增财务等由来源能力合同另定范围，ThesisLedger 只消费标准数据。

<a id="ref02"></a>
### REF02 · simonlin1212/a-stock-data：复用端点校验方法，不复制隐式换源与不完整结果

**源码与测试定位：** [SKILL.md:969–1040](https://github.com/simonlin1212/a-stock-data/blob/29b07d2e37005b9fd568bca1262f6e572b5f9407/SKILL.md#L969-L1040)；[SKILL.md:1217–1390](https://github.com/simonlin1212/a-stock-data/blob/29b07d2e37005b9fd568bca1262f6e572b5f9407/SKILL.md#L1217-L1390)；[SKILL.md:1932–1967](https://github.com/simonlin1212/a-stock-data/blob/29b07d2e37005b9fd568bca1262f6e572b5f9407/SKILL.md#L1932-L1967)；[SKILL.md:3113–3142](https://github.com/simonlin1212/a-stock-data/blob/29b07d2e37005b9fd568bca1262f6e572b5f9407/SKILL.md#L3113-L3142)；[SKILL.md:3840–4094](https://github.com/simonlin1212/a-stock-data/blob/29b07d2e37005b9fd568bca1262f6e572b5f9407/SKILL.md#L3840-L4094)；[SKILL.md:5142–5241](https://github.com/simonlin1212/a-stock-data/blob/29b07d2e37005b9fd568bca1262f6e572b5f9407/SKILL.md#L5142-L5241)；[SKILL.md:5606–5707](https://github.com/simonlin1212/a-stock-data/blob/29b07d2e37005b9fd568bca1262f6e572b5f9407/SKILL.md#L5606-L5707)；[SKILL.md:6553–6756](https://github.com/simonlin1212/a-stock-data/blob/29b07d2e37005b9fd568bca1262f6e572b5f9407/SKILL.md#L6553-L6756)；[SKILL.md:7010–7076](https://github.com/simonlin1212/a-stock-data/blob/29b07d2e37005b9fd568bca1262f6e572b5f9407/SKILL.md#L7010-L7076)；[tests/test_valuation.py:1–82](https://github.com/simonlin1212/a-stock-data/blob/29b07d2e37005b9fd568bca1262f6e572b5f9407/tests/test_valuation.py#L1-L82)；[tests/test_v310_sources.py:1–469](https://github.com/simonlin1212/a-stock-data/blob/29b07d2e37005b9fd568bca1262f6e572b5f9407/tests/test_v310_sources.py#L1-L469)。

**本地入口：** [daily-stock-analysis/data_provider/tencent_native_daily.py](../../../daily-stock-analysis/data_provider/tencent_native_daily.py)；[daily-stock-analysis/data_provider/thesis_ledger_sources/tencent.py](../../../daily-stock-analysis/data_provider/thesis_ledger_sources/tencent.py)；[daily-stock-analysis/src/services/thesis_ledger_capability_sources.py](../../../daily-stock-analysis/src/services/thesis_ledger_capability_sources.py)。

**实际差异：** 读取了 Skill 内嵌的真实 Python 实现及测试，不仅是 README。严格东财分页检查 count/pages 漂移、空中间页与短非末页；但 max_rows 截断后单纯返回列表的路径不能直接当作完整历史。腾讯读取使用 fqkline/get 与多个同源域名，本地使用 newfqkline/get，二者的身份、列宽、量额合同不能套用。上游量单位测试实际覆盖 688981/588000/600519/000001，没有提供 689 的同端点证明。财报函数按报告期返回字符串列，行业文件给的是变更生效日，宏观解析给的是数据期；这些都不自动证明历史披露时点。研报、事件、指数成分的筛选和稳定身份校验可借鉴。

**处理决定：** 保留本地精确路由、逐年证据与未知语义，IR08 结论仍为同端点单位待证。采用字段/分页/响应身份的反例方法；多个包装器或域名不算独立供应商。财务、研报、宏观、行业与指数数据均为独立能力候选，不批量接入 87 个接口。

**最小反例/消费条件：** 空年份与中途断页必须区分；同一天重复行、分页总数漂移、非预期标的要拒绝。财务负 EPS 不生成虚假的 PE 消化年数；事件计划/实施/未知状态保留原值；当前指数成分不得反填历史；688/689 转换只有同一接口原文证据才可定案。

**归属：** DSA 来源适配合同；新闻相关样例交 N1/N2，当前真实来源资格继续归原 Task，不借本审查启动探针。

<a id="ref03"></a>
### REF03 · HKUDS/Vibe-Trading：证据要绑定实际工具输出，假设与评价记录要分层

**源码与测试定位：** [agent/src/hypotheses/registry.py:1–320](https://github.com/HKUDS/Vibe-Trading/blob/9d646f228732f01634bbd119793257b1754014a9/agent/src/hypotheses/registry.py#L1-L320)；[agent/src/scheduled_research/store.py:1–291](https://github.com/HKUDS/Vibe-Trading/blob/9d646f228732f01634bbd119793257b1754014a9/agent/src/scheduled_research/store.py#L1-L291)；[agent/src/scheduled_research/executor.py:1–420](https://github.com/HKUDS/Vibe-Trading/blob/9d646f228732f01634bbd119793257b1754014a9/agent/src/scheduled_research/executor.py#L1-L420)；[agent/src/agent/grounding/evidence.py:195–277](https://github.com/HKUDS/Vibe-Trading/blob/9d646f228732f01634bbd119793257b1754014a9/agent/src/agent/grounding/evidence.py#L195-L277)；[agent/src/agent/grounding/evidence.py:637–700](https://github.com/HKUDS/Vibe-Trading/blob/9d646f228732f01634bbd119793257b1754014a9/agent/src/agent/grounding/evidence.py#L637-L700)；[agent/src/agent/grounding/evidence.py:815–1124](https://github.com/HKUDS/Vibe-Trading/blob/9d646f228732f01634bbd119793257b1754014a9/agent/src/agent/grounding/evidence.py#L815-L1124)；[agent/src/agent/context_budget.py:125–203](https://github.com/HKUDS/Vibe-Trading/blob/9d646f228732f01634bbd119793257b1754014a9/agent/src/agent/context_budget.py#L125-L203)；[agent/backtest/loaders/sec_edgar_client.py:1–210](https://github.com/HKUDS/Vibe-Trading/blob/9d646f228732f01634bbd119793257b1754014a9/agent/backtest/loaders/sec_edgar_client.py#L1-L210)；[agent/backtest/loaders/sec_frames.py:1–128](https://github.com/HKUDS/Vibe-Trading/blob/9d646f228732f01634bbd119793257b1754014a9/agent/backtest/loaders/sec_frames.py#L1-L128)；[agent/tests/test_hypothesis_registry.py:31–153](https://github.com/HKUDS/Vibe-Trading/blob/9d646f228732f01634bbd119793257b1754014a9/agent/tests/test_hypothesis_registry.py#L31-L153)；[agent/tests/test_grounding_operand_evidence.py:34–110](https://github.com/HKUDS/Vibe-Trading/blob/9d646f228732f01634bbd119793257b1754014a9/agent/tests/test_grounding_operand_evidence.py#L34-L110)；[agent/tests/test_sec_edgar_client.py:72–188](https://github.com/HKUDS/Vibe-Trading/blob/9d646f228732f01634bbd119793257b1754014a9/agent/tests/test_sec_edgar_client.py#L72-L188)。

**本地入口：** [thesis-ledger/apps/server/src/ai/ai-frozen-research.ts](../../apps/server/src/ai/ai-frozen-research.ts)；[thesis-ledger/apps/server/src/ai/ai-research.executor.ts](../../apps/server/src/ai/ai-research.executor.ts)；[thesis-ledger/apps/server/test/ai/research-executor.test.ts](../../apps/server/test/ai/research-executor.test.ts)。

**实际差异：** 假设注册、运行引用、失败状态和证据约束有实际代码。Grounding 区分引擎输出与模型自己写的文件，校验实际调用、路径、清单指纹、字段、时间、币种与已观察操作数；仅有成功信封不等于产生了可引用事实。文件 store 的原子替换不能代替多进程唯一约束，源码明确依赖单写者。上下文预算计入工具 Schema，并以实际 usage 修正估计。SEC 代码处理市场后缀/股份类别与 CIK；SEC frames 用 start/end 区分单季、累计和时点，不能只按 end 去重。

**处理决定：** 采用证据成功/有效性的分层和假设—反证—观察结构，延续本地冻结结果与 AiRun 持久化，不引入 JSON 文件状态机或宿主机任意工具。SEC 是新的数据候选；13F 不以公司财报解析替代，也不视为实时仓位。Vibe 的字段级可验证数字方法可用于结构化事实，但不承诺机器验证任意自然语言结论。

**最小反例/消费条件：** 同 run 的伪造文件、其他 run 的指标、未观察分母、伪造 toolCallId 均不能变成证据；工具调用成功但返回空/unknown 时不可计有效覆盖。相同 end 的季度和九个月累计不得合并；没有 start 的坏日期不能仅凭字段缺失当成合格时点事实。

**归属：** T3/T5/T6 证据与产物，T9 有效覆盖，T15a 预算；SEC 另走 DSA 能力合同。

<a id="ref04"></a>
### REF04 · refraction-ray/xalpha：批次费用有增量价值，穿透与估算不能丢分母和时点

**源码与测试定位：** [xalpha/multiple.py:215–380](https://github.com/refraction-ray/xalpha/blob/a0727129e08140eea017a8f21294041ab53ca1d6/xalpha/multiple.py#L215-L380)；[xalpha/info.py:800–1300](https://github.com/refraction-ray/xalpha/blob/a0727129e08140eea017a8f21294041ab53ca1d6/xalpha/info.py#L800-L1300)；[xalpha/remain.py:1–97](https://github.com/refraction-ray/xalpha/blob/a0727129e08140eea017a8f21294041ab53ca1d6/xalpha/remain.py#L1-L97)；[xalpha/realtime.py:1–205](https://github.com/refraction-ray/xalpha/blob/a0727129e08140eea017a8f21294041ab53ca1d6/xalpha/realtime.py#L1-L205)；[xalpha/toolbox.py:1069–1105](https://github.com/refraction-ray/xalpha/blob/a0727129e08140eea017a8f21294041ab53ca1d6/xalpha/toolbox.py#L1069-L1105)；[xalpha/toolbox.py:1413–1537](https://github.com/refraction-ray/xalpha/blob/a0727129e08140eea017a8f21294041ab53ca1d6/xalpha/toolbox.py#L1413-L1537)；[xalpha/toolbox.py:1549–1904](https://github.com/refraction-ray/xalpha/blob/a0727129e08140eea017a8f21294041ab53ca1d6/xalpha/toolbox.py#L1549-L1904)。

**本地入口：** [daily-stock-analysis/data_provider/eastmoney_holdings_projection.py](../../../daily-stock-analysis/data_provider/eastmoney_holdings_projection.py)；[daily-stock-analysis/src/services/thesis_ledger_holding_rows.py](../../../daily-stock-analysis/src/services/thesis_ledger_holding_rows.py)；[thesis-ledger/apps/server/src/market/market-fund-reader.ts](../../apps/server/src/market/market-fund-reader.ts)；[thesis-ledger/apps/server/src/performance/performance-valuation-series.service.ts](../../apps/server/src/performance/performance-valuation-series.service.ts)；[thesis-ledger/packages/domain/src/nav-simulation.ts](../../packages/domain/src/nav-simulation.ts)。

**实际差异：** multiple.get_stock_holdings 合并直接和间接持仓后，以已识别股票市值重新计算 ratio；该比例不是完整基金或组合净值分母，不能用于声称完整穿透。缺行业、联接基金与报告期默认推测也有启发式。remain/info 的日期批次和分段赎回费可参考，但缺费率时补默认表、超额卖出自动缩量不能照搬。旧 realtime 会把估算写入净值价表；QDIIPredict 另有 T0/T1、海外市场/汇率逻辑，并明确对象不能过夜，部分市场/币种回退为猜测，不能当正式 NAV。

**处理决定：** 本地持仓百分比除以 100、报告期/重复行/合计校验及估算 coverage 保留；未知披露时间会阻止当前估值推断，这是有效保护。基金重叠穿透是新产品候选；批次费用仅在明确承诺真实费用时扩展，IR07 不是统一费率研究模型的现行 bug。

**最小反例/消费条件：** 仅披露 30% 持仓且已知部分上涨 10%，不能通过重归一将整个基金上涨写成 10%；直接持股与两基金重复股票要合并贡献而不丢原分母。原始权重和剩余未知单列；跨两批不同持有天数赎回分别计费；QDII 外盘/FX 尚未齐备时估算与正式值严格分开。

**归属：** Portfolio/基金产品与 NAV 执行模型；DSA 只提供披露事实与正式/估算身份，不移植基金账户系统。

<a id="ref06"></a>
### REF06 · akfamily/akquant：采用分项回归，不以另一个引擎的曲线作为真值

**源码与测试定位：** [tests/golden/strategies/stock_t1.py:1–54](https://github.com/akfamily/akquant/blob/d9fd9d7565df93f04af0d3a6d8ad8cacd8a7b3dd/tests/golden/strategies/stock_t1.py#L1-L54)；[tests/golden/strategies/order_cancel.py:1–98](https://github.com/akfamily/akquant/blob/d9fd9d7565df93f04af0d3a6d8ad8cacd8a7b3dd/tests/golden/strategies/order_cancel.py#L1-L98)；[tests/golden/runner.py:95–236](https://github.com/akfamily/akquant/blob/d9fd9d7565df93f04af0d3a6d8ad8cacd8a7b3dd/tests/golden/runner.py#L95-L236)；[src/portfolio.rs:1–230](https://github.com/akfamily/akquant/blob/d9fd9d7565df93f04af0d3a6d8ad8cacd8a7b3dd/src/portfolio.rs#L1-L230)；[src/market/corporate_action.rs:1–197](https://github.com/akfamily/akquant/blob/d9fd9d7565df93f04af0d3a6d8ad8cacd8a7b3dd/src/market/corporate_action.rs#L1-L197)；[src/market/fee_override.rs:1–116](https://github.com/akfamily/akquant/blob/d9fd9d7565df93f04af0d3a6d8ad8cacd8a7b3dd/src/market/fee_override.rs#L1-L116)。

**本地入口：** [thesis-ledger/packages/domain/src/simulation-ledger.ts](../../packages/domain/src/simulation-ledger.ts)；[thesis-ledger/packages/domain/src/backtest-exchange.ts](../../packages/domain/src/backtest-exchange.ts)；[thesis-ledger/packages/domain/src/backtest-execution-model.ts](../../packages/domain/src/backtest-execution-model.ts)；[thesis-ledger/packages/domain/test/simulation-ledger.test.ts](../../packages/domain/test/simulation-ledger.test.ts)；[thesis-ledger/packages/domain/test/backtest-public-fee-calculation.test.ts](../../packages/domain/test/backtest-public-fee-calculation.test.ts)。

**实际差异：** Golden 策略确实涉及 T+1 和撤单，runner 比较曲线、费用/收益指标、成交数量及订单状态分布，而不是只测成功退出。组合使用 Decimal 与可用份额；费用覆盖以 Option 区分未指定和显式零值。公司行动按日期对当时仓位修改的机制较简单，不能替代本地登记资格、应收/支付、实际/归一化经济口径。余弦相似度对整体缩放不敏感，其他指标虽能补捉部分错误，仍不是逐时点守恒证明。

**处理决定：** 借鉴固定输入和订单/交易/费用分项比较。保留本地已存在的 settled/unsettled、幂等公司行动、独立现金守恒与实际股数费用回归，不重新换引擎或重复登记已有 T+1 功能。

**最小反例/消费条件：** 同日买入不可卖、部分成交后取消只释放剩余预留、重复分红只入账一次、拆股不重复调整价格、费用显式 0 与未提供不同；逐时点现金+资产变化必须解释，不只看最终收益或曲线形状。

**归属：** 现行回测/SimulationLedger/费用合同；T9 仅复用评估方法，不拥有撮合修复。

<a id="ref07"></a>
### REF07 · ghostfolio/ghostfolio：先识别实际计算口径，不能拿 ROI 替换 TTWROR/XIRR

**源码与测试定位：** [apps/api/src/app/portfolio/calculator/portfolio-calculator.factory.ts:1–120](https://github.com/ghostfolio/ghostfolio/blob/e880216151df621d44f4a0f841c1180a0f41864f/apps/api/src/app/portfolio/calculator/portfolio-calculator.factory.ts#L1-L120)；[apps/api/src/app/portfolio/calculator/twr/portfolio-calculator.ts:1–40](https://github.com/ghostfolio/ghostfolio/blob/e880216151df621d44f4a0f841c1180a0f41864f/apps/api/src/app/portfolio/calculator/twr/portfolio-calculator.ts#L1-L40)；[apps/api/src/app/portfolio/calculator/mwr/portfolio-calculator.ts:1–40](https://github.com/ghostfolio/ghostfolio/blob/e880216151df621d44f4a0f841c1180a0f41864f/apps/api/src/app/portfolio/calculator/mwr/portfolio-calculator.ts#L1-L40)；[apps/api/src/app/portfolio/calculator/roi/portfolio-calculator.ts:1–280](https://github.com/ghostfolio/ghostfolio/blob/e880216151df621d44f4a0f841c1180a0f41864f/apps/api/src/app/portfolio/calculator/roi/portfolio-calculator.ts#L1-L280)；[apps/api/src/app/portfolio/calculator/roai/portfolio-calculator.ts:1–290](https://github.com/ghostfolio/ghostfolio/blob/e880216151df621d44f4a0f841c1180a0f41864f/apps/api/src/app/portfolio/calculator/roai/portfolio-calculator.ts#L1-L290)；[apps/api/src/services/exchange-rate-data/exchange-rate-data.service.ts:93–125](https://github.com/ghostfolio/ghostfolio/blob/e880216151df621d44f4a0f841c1180a0f41864f/apps/api/src/services/exchange-rate-data/exchange-rate-data.service.ts#L93-L125)；[apps/api/src/services/exchange-rate-data/exchange-rate-data.service.ts:245–310](https://github.com/ghostfolio/ghostfolio/blob/e880216151df621d44f4a0f841c1180a0f41864f/apps/api/src/services/exchange-rate-data/exchange-rate-data.service.ts#L245-L310)；[apps/api/src/app/portfolio/calculator/roai/portfolio-calculator-stock-split.spec.ts:82–220](https://github.com/ghostfolio/ghostfolio/blob/e880216151df621d44f4a0f841c1180a0f41864f/apps/api/src/app/portfolio/calculator/roai/portfolio-calculator-stock-split.spec.ts#L82-L220)；[apps/api/src/app/portfolio/calculator/roai/portfolio-calculator-msft-buy-from-two-data-sources.spec.ts:100–173](https://github.com/ghostfolio/ghostfolio/blob/e880216151df621d44f4a0f841c1180a0f41864f/apps/api/src/app/portfolio/calculator/roai/portfolio-calculator-msft-buy-from-two-data-sources.spec.ts#L100-L173)。

**本地入口：** [thesis-ledger/packages/domain/src/performance.ts](../../packages/domain/src/performance.ts)；[thesis-ledger/apps/server/src/performance/performance-analysis.service.ts](../../apps/server/src/performance/performance-analysis.service.ts)；[thesis-ledger/apps/server/src/performance/performance-target.service.ts](../../apps/server/src/performance/performance-target.service.ts)；[thesis-ledger/apps/server/src/performance/performance-snapshot-inputs.ts](../../apps/server/src/performance/performance-snapshot-inputs.ts)。

**实际差异：** factory 实际区分 ROI/ROAI/TWR/MWR；固定提交下 TWR/MWR 仍是未实现占位，ROI/ROAI 有不同的投入分母和持有期口径，不能作为本地时间/资金加权收益的直接答案。测试覆盖拆股、反向拆股、费用、币种及同代码不同源保持来源身份。汇率序列有默认 1/回填路径，toCurrency 缺汇率时记录日志并返回原金额；这些回退不能移入本地历史估值。

**处理决定：** 采纳拆股/币种/来源的明确对照案例和用户可解释状态，不移植占位收益类或静默汇率回退。IR01 按本地修复复用原验收，IR03～IR06 仍由本地直接调用链/反例判断，而非宣称 Ghostfolio 已提供正确替代算法。AGPL-3.0 代码复用另核授权，不直接复制实现。

**最小反例/消费条件：** 分红/拆股和费用逐项守恒；本位币变更仅改变单位表达，不改变真实经济结果；缺历史 FX 不借未来汇率填充。先入金再上涨、极亏损 XIRR、目标遗漏类别和保存失败分别进入现有 IR03～IR06。

**归属：** Performance/Portfolio 原领域；本研究计划不承担目标保存或收益算法重构。

<a id="ref08"></a>
### REF08 · microsoft/qlib：借鉴时间切分与拟合边界，不继承数据集的隐含假设

**源码与测试定位：** [qlib/data/dataset/processor.py:1–419](https://github.com/microsoft/qlib/blob/54355232463878d2eebb91fe0ee5fa7fa1f5976c/qlib/data/dataset/processor.py#L1-L419)；[qlib/data/dataset/handler.py:470–785](https://github.com/microsoft/qlib/blob/54355232463878d2eebb91fe0ee5fa7fa1f5976c/qlib/data/dataset/handler.py#L470-L785)；[qlib/data/pit.py:1–72](https://github.com/microsoft/qlib/blob/54355232463878d2eebb91fe0ee5fa7fa1f5976c/qlib/data/pit.py#L1-L72)；[qlib/data/cache.py:1–230](https://github.com/microsoft/qlib/blob/54355232463878d2eebb91fe0ee5fa7fa1f5976c/qlib/data/cache.py#L1-L230)；[tests/data_mid_layer_tests/test_processor.py:14–71](https://github.com/microsoft/qlib/blob/54355232463878d2eebb91fe0ee5fa7fa1f5976c/tests/data_mid_layer_tests/test_processor.py#L14-L71)；[tests/test_pit.py:33–48](https://github.com/microsoft/qlib/blob/54355232463878d2eebb91fe0ee5fa7fa1f5976c/tests/test_pit.py#L33-L48)；[tests/test_pit.py:92–148](https://github.com/microsoft/qlib/blob/54355232463878d2eebb91fe0ee5fa7fa1f5976c/tests/test_pit.py#L92-L148)。

**本地入口：** [thesis-ledger/packages/domain/src/backtest-observation-clock.ts](../../packages/domain/src/backtest-observation-clock.ts)；[thesis-ledger/packages/domain/src/backtest-series.ts](../../packages/domain/src/backtest-series.ts)；[thesis-ledger/packages/domain/src/backtest-indicators.ts](../../packages/domain/src/backtest-indicators.ts)；[thesis-ledger/apps/server/src/strategy-optimization/strategy-optimization-model-feedback.ts](../../apps/server/src/strategy-optimization/strategy-optimization-model-feedback.ts)；[thesis-ledger/apps/server/test/strategy-optimization/strategy-optimization-model-feedback.test.ts](../../apps/server/test/strategy-optimization/strategy-optimization-model-feedback.test.ts)。

**实际差异：** 处理器 fit_start_time/fit_end_time 与数据集切分是不同边界；handler 区分共享、推理、学习处理器。PIT 操作按可见日期展开报告期值，但测试中的缺披露时间归一化也会采用预设日期，因此安装 Qlib 不能自动获得可信历史披露。其缓存运行在自身数据 URI/表达式命名空间，不含本地全部来源/路由/复权修订。对本地递归指标的时钟闭包核对复现 IR09/IR10；现有优化反馈则已有测试证明封存 test/未来元数据不进入模型消息。

**处理决定：** 不引入尚无需求的因子训练框架；保留当前 holdout 隔离、冻结价格与来源身份。采用“加入晚到或未来资料不应改变过去可见值”的反例，修复指标时钟问题；不能复制 Fillna(0) 到市场事实或将报告期末当披露时间。严格全历史 PIT/幸存者补库仍是已取消或另定范围，不恢复旧任务。

**最小反例/消费条件：** 训练拟合只使用训练窗；改变 holdout 不改变生成候选的输入。相同财报期晚披露不能提前可见；同窗口换来源/复权/预处理版本必须换缓存身份；递归 RSI 种子虽离开滚动窗，仍参与状态就必须传播其时钟。

**归属：** IR09/IR10 归回测指标内核；T9/T13/T15a 采用时间/评价隔离原则；DSA 不增加训练服务。

<a id="ref09"></a>
### REF09 · microsoft/RD-Agent：实验谱系可以学，代码执行与模型裁判不能直接搬入

**源码与测试定位：** [rdagent/components/workflow/rd_loop.py:1–241](https://github.com/microsoft/RD-Agent/blob/484776c211e4fbbeef03e0ec00d6bbee7362a4f4/rdagent/components/workflow/rd_loop.py#L1-L241)；[rdagent/scenarios/qlib/developer/feedback.py:1–186](https://github.com/microsoft/RD-Agent/blob/484776c211e4fbbeef03e0ec00d6bbee7362a4f4/rdagent/scenarios/qlib/developer/feedback.py#L1-L186)；[rdagent/utils/env.py:1–900](https://github.com/microsoft/RD-Agent/blob/484776c211e4fbbeef03e0ec00d6bbee7362a4f4/rdagent/utils/env.py#L1-L900)；[test/utils/test_env.py:41–140](https://github.com/microsoft/RD-Agent/blob/484776c211e4fbbeef03e0ec00d6bbee7362a4f4/test/utils/test_env.py#L41-L140)。

**本地入口：** [thesis-ledger/apps/server/src/strategy-optimization/strategy-optimization-parameters.ts](../../apps/server/src/strategy-optimization/strategy-optimization-parameters.ts)；[thesis-ledger/apps/server/src/strategy-optimization/strategy-optimization-evaluation.ts](../../apps/server/src/strategy-optimization/strategy-optimization-evaluation.ts)；[thesis-ledger/apps/server/src/strategy-optimization/strategy-optimization-model-feedback.ts](../../apps/server/src/strategy-optimization/strategy-optimization-model-feedback.ts)；[thesis-ledger/apps/server/src/ai/ai-execution-state.store.ts](../../apps/server/src/ai/ai-execution-state.store.ts)。

**实际差异：** 实际循环组织假设、实现、运行与反馈，环境支持超时和内存限制；LocalEnv 运行宿主命令，Docker 也有工作目录/数据卷与可配置出站条件，不能把“使用容器”当作安全隔离已成立。反馈中的 LLM decision 不是可复现的自动经济准入。所读 Model feedback 路径对同一消息调用两次模型，第一次结果被后续调用取代，是不应移植的重复费用行为。本地优化约束参数描述符与 AST，并过滤封存数据，不执行模型任意生成的 Python。

**处理决定：** 采用输入/代码/评价/反馈谱系与有界失败记录；不直接接入宿主代码运行器，不把模型自评当自动采纳。T15a 使用受控驱动，T15b 单独获准对照，已有 AiRun attempt/预算/终态仍为唯一执行事实。

**最小反例/消费条件：** 失败重试保留实际已耗费用，不能只统计成功实验；同一提交不重复计样本。超时/取消不遗留子进程，不挂载个人秘密或可写业务库；真正需要代码研究时必须另定隔离和出站合同，不能在本次引入。

**归属：** T9/T15a/T15b；生产阶段依旧受原激活与恢复门禁约束。

<a id="ref10"></a>
### REF10 · fasiondog/hikyuu：区分算法定义差异与真实的状态、时钟丢失

**源码与测试定位：** [hikyuu_cpp/hikyuu/indicator/imp/IEma.cpp:1–106](https://github.com/fasiondog/hikyuu/blob/d8e7b5787be3650a9f989eb4216b19caeeb08279/hikyuu_cpp/hikyuu/indicator/imp/IEma.cpp#L1-L106)；[hikyuu_cpp/hikyuu/indicator/imp/IAtr.cpp:1–116](https://github.com/fasiondog/hikyuu/blob/d8e7b5787be3650a9f989eb4216b19caeeb08279/hikyuu_cpp/hikyuu/indicator/imp/IAtr.cpp#L1-L116)；[hikyuu_cpp/hikyuu/indicator/imp/IMacd.cpp:39–148](https://github.com/fasiondog/hikyuu/blob/d8e7b5787be3650a9f989eb4216b19caeeb08279/hikyuu_cpp/hikyuu/indicator/imp/IMacd.cpp#L39-L148)；[hikyuu_cpp/hikyuu/indicator/crt/RSI.cpp:17–36](https://github.com/fasiondog/hikyuu/blob/d8e7b5787be3650a9f989eb4216b19caeeb08279/hikyuu_cpp/hikyuu/indicator/crt/RSI.cpp#L17-L36)；[hikyuu_cpp/unit_test/hikyuu/indicator/test_EMA.cpp:28–130](https://github.com/fasiondog/hikyuu/blob/d8e7b5787be3650a9f989eb4216b19caeeb08279/hikyuu_cpp/unit_test/hikyuu/indicator/test_EMA.cpp#L28-L130)。

**补充定位：** [IMa.cpp](https://github.com/fasiondog/hikyuu/blob/d8e7b5787be3650a9f989eb4216b19caeeb08279/hikyuu_cpp/hikyuu/indicator/imp/IMa.cpp)、[IAlign.cpp](https://github.com/fasiondog/hikyuu/blob/d8e7b5787be3650a9f989eb4216b19caeeb08279/hikyuu_cpp/hikyuu/indicator/imp/IAlign.cpp)。

**本地入口：** [thesis-ledger/packages/domain/src/backtest-indicators.ts](../../packages/domain/src/backtest-indicators.ts)；[thesis-ledger/packages/domain/src/backtest-series.ts](../../packages/domain/src/backtest-series.ts)；[thesis-ledger/apps/server/src/backtest/backtest-adjusted-indicators.ts](../../apps/server/src/backtest/backtest-adjusted-indicators.ts)；[daily-stock-analysis/src/services/technical_indicator_series.py](../../../daily-stock-analysis/src/services/technical_indicator_series.py)；[thesis-ledger/packages/schemas/src/strategy-authoring-definition.ts](../../packages/schemas/src/strategy-authoring-definition.ts)。

**实际差异：** MA 的有效窗口/discard 与 ALIGN 的日期匹配、fill_null/回填分支也已核对；对齐只能处理位置，不能证明缺失日有可见事实。EMA 首个有效值种子/缺值保留、RSI 使用 EMA 平滑及零分母处理，与本地 SMA 种子/Wilder 平滑约定不同；MACD 动态测试按前缀一致性校验，而不是把只有 DIF 的输出误当完整 EMA 状态。ATR 需要当前 high/low 和上一 close。本地与图表路径的种子、预热和柱状图缩放需要记录方法版本，不能因数值不同就统一替换。真正错误是本地 RSI 递归依赖的时钟被截窗、ATR 丢上一 close 时钟及 unavailable 状态，已在实际纯函数中复现。

**处理决定：** 保留算法版本/参数/输入/锚点身份，采纳批量与同锚点前缀/增量一致性测试，不更换指标引擎。IR09/IR10 需聚焦修复。自然语言编写入口已有 ATR/VWAP 的 close+OHLCV 要求，不能将纯函数 close-only 宽容行为直接升级为所有生产入口都可提交的缺陷。

**最小反例/消费条件：** 晚到种子离开 period 窗后仍不能提前发布递归值；ATR1 使用晚到上一 close 时不能标当前可见；status=unavailable 但仍留 OHLC 的点不能复活。EMA 同输入传播 Jan10 时钟作为正对照；缺值后重置/延续和不同算法种子另按版本比对。

**归属：** 现行回测指标/图表合同；不把本地指标内核修复藏进 DSA 删除任务。

<a id="ref11"></a>
### REF11 · vnpy/vnpy：Datafeed 接口、增量量与资源生命周期有参考价值

**源码与测试定位：** [vnpy/trader/datafeed.py:1–74](https://github.com/vnpy/vnpy/blob/c6e231caf32b7fc97e6459817fff66458cf7e7c4/vnpy/trader/datafeed.py#L1-L74)；[vnpy/event/engine.py:35–147](https://github.com/vnpy/vnpy/blob/c6e231caf32b7fc97e6459817fff66458cf7e7c4/vnpy/event/engine.py#L35-L147)；[vnpy/trader/utility.py:1–360](https://github.com/vnpy/vnpy/blob/c6e231caf32b7fc97e6459817fff66458cf7e7c4/vnpy/trader/utility.py#L1-L360)；[tests/test_data_services.py:9–63](https://github.com/vnpy/vnpy/blob/c6e231caf32b7fc97e6459817fff66458cf7e7c4/tests/test_data_services.py#L9-L63)。

**本地入口：** [daily-stock-analysis/src/services/thesis_ledger_capability_sources.py](../../../daily-stock-analysis/src/services/thesis_ledger_capability_sources.py)；[daily-stock-analysis/data_provider/thesis_ledger_sources/futu.py](../../../daily-stock-analysis/data_provider/thesis_ledger_sources/futu.py)；[daily-stock-analysis/data_provider/thesis_ledger_sources/longbridge.py](../../../daily-stock-analysis/data_provider/thesis_ledger_sources/longbridge.py)；[thesis-ledger/packages/domain/src/market-period-aggregation.ts](../../packages/domain/src/market-period-aggregation.ts)。

**实际差异：** Datafeed 动态加载与请求/返回对象可复用为接口设计思路，但缺插件退回 BaseDatafeed/空结果会模糊配置错误与真空数据。BarGenerator 把累计量差值转增量，负差做保护；按分钟/小时的基础聚合不等于具备市场 session、午休/DST 和最终 bar 完成证据。EventEngine 是内存队列与线程，停止 join；处理器抛错没有逐处理器故障隔离，不是可持久恢复的任务系统。

**处理决定：** 保留本地精确查询声明、错误分类、总预算、查询进程释放与周期日历；学习明确的累计/增量字段及关闭责任，不移植内存队列替代 PostgreSQL/Worker，不加入券商下单网关或未经立项的订阅。

**最小反例/消费条件：** 累计量重置、重复/乱序 tick 不得写负成交量；尾 bar flush 不能冒充 complete；午休与美国 DST 按已支持市场合同测试。单标查询超时/取消要释放会话，缺 SDK 不能返回 available 空列表；未声明订阅必须零订阅尝试。

**归属：** DSA D0/D3b 的保全与关闭；现行周期/富途范围的原证据复用，新增分钟/订阅另定范围。

<a id="ref12"></a>
### REF12 · ZhuLinsen/daily_stock_analysis：复用报告与评估思路，继续剥离数据和产品执行

**源码与测试定位：** [src/services/research_artifact_service.py:18–116](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/src/services/research_artifact_service.py#L18-L116)；[src/services/research_artifact_service.py:291–355](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/src/services/research_artifact_service.py#L291-L355)；[evals/agent_trajectory/metrics.py:177–350](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/evals/agent_trajectory/metrics.py#L177-L350)；[evals/agent_trajectory/metrics.py:376–503](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/evals/agent_trajectory/metrics.py#L376-L503)；[src/services/history_comparison_service.py:67–132](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/src/services/history_comparison_service.py#L67-L132)；[src/services/decision_signal_outcome_service.py:374–464](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/src/services/decision_signal_outcome_service.py#L374-L464)；[src/core/etf_rotation.py:79–113](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/src/core/etf_rotation.py#L79-L113)；[src/core/etf_rotation.py:167–276](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/src/core/etf_rotation.py#L167-L276)；[src/services/portfolio_risk_service.py:282–387](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/src/services/portfolio_risk_service.py#L282-L387)；[apps/dsa-web/src/components/watchlist/watchlistRowState.ts:1–10](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/apps/dsa-web/src/components/watchlist/watchlistRowState.ts#L1-L10)；[apps/dsa-web/src/pages/DataCenterPage.tsx:53–95](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/apps/dsa-web/src/pages/DataCenterPage.tsx#L53-L95)；[apps/dsa-web/src/pages/__tests__/DataCenterPage.test.tsx:117–178](https://github.com/ZhuLinsen/daily_stock_analysis/blob/7a21cd76952c7fe44a7fc5a6113a5b2b8a16bb32/apps/dsa-web/src/pages/__tests__/DataCenterPage.test.tsx#L117-L178)。

**本地入口：** [thesis-ledger/apps/server/src/ai/tool-factory.ts](../../apps/server/src/ai/tool-factory.ts)；[thesis-ledger/apps/server/src/ai/ai-research.executor.ts](../../apps/server/src/ai/ai-research.executor.ts)；[thesis-ledger/apps/server/src/automation/automation-runtime.service.ts](../../apps/server/src/automation/automation-runtime.service.ts)；[daily-stock-analysis/src/services/thesis_ledger_provider_runtime.py](../../../daily-stock-analysis/src/services/thesis_ledger_provider_runtime.py)。

**实际差异：** 复核了原报告/变化/轨迹/观察的固定提交；产物仍是读时投影，confidence 从情绪分数转换，不是校准概率。轨迹 used_tools 包括出现过的调用，出现与有效证据不能混用；失败、重试、缓存和阶段统计可借鉴。历史比较按代码近期结果筛选，不具备本地完整账户模式/模板/输入可比性。ETF 轮动显式信号与下一日执行，采用有限 ffill 和统一成本假设，不是实际份额/公司行动通用引擎。自选 helper 排除 unknown/loading/activeTask，数据中心有 generation 竞态及冷启动 unknown 测试。风险服务转换币种并输出分类覆盖，但其产品逻辑不能直接搬到纯数据服务。

**处理决定：** 维持已立项的新闻→冻结→本地 AI→报告→比较/观察，吸收明确状态和轨迹测试。有效证据覆盖与调用覆盖分开；保留 IR02 对本地后台扫描的独立修复要求。DSA 原生 Agent/页面/通知/组合不接入 TL 产品；共享 FX、配置、公告和指标须先保全。

**最小反例/消费条件：** 数据中心失败不能显示空库健康；在途旧响应不覆盖新对象；已生成报告不等于行情/观点已更新。fail→success→success 只有一次重试，但重复计费全部披露；未生成最终回答的工具轨迹不能充当完整执行。ETF停牌/缺价不能因前向填充获得真实可成交资格。

**归属：** 已存在的 D0/T0/T3/T5/T9/T10/T13/T15a；D0 全量删除闭包和真实纯数据启动仍未完成，本次不替代其验收。

<a id="ref13"></a>
### REF13 · myhhub/stock：策略名字和前向收益统计不能代替正式策略语义

**源码与测试定位：** [instock/core/strategy/turtle_trade.py:1–37](https://github.com/myhhub/stock/blob/b6e0ca2268cfbadd02f5ed052159c187b6670231/instock/core/strategy/turtle_trade.py#L1-L37)；[instock/core/strategy/breakthrough_platform.py:1–49](https://github.com/myhhub/stock/blob/b6e0ca2268cfbadd02f5ed052159c187b6670231/instock/core/strategy/breakthrough_platform.py#L1-L49)；[instock/core/strategy/low_atr.py:1–63](https://github.com/myhhub/stock/blob/b6e0ca2268cfbadd02f5ed052159c187b6670231/instock/core/strategy/low_atr.py#L1-L63)；[instock/job/strategy_data_daily_job.py:1–94](https://github.com/myhhub/stock/blob/b6e0ca2268cfbadd02f5ed052159c187b6670231/instock/job/strategy_data_daily_job.py#L1-L94)；[instock/core/backtest/rate_stats.py:1–50](https://github.com/myhhub/stock/blob/b6e0ca2268cfbadd02f5ed052159c187b6670231/instock/core/backtest/rate_stats.py#L1-L50)；[instock/job/backtest_data_daily_job.py:1–103](https://github.com/myhhub/stock/blob/b6e0ca2268cfbadd02f5ed052159c187b6670231/instock/job/backtest_data_daily_job.py#L1-L103)。

**本地入口：** [thesis-ledger/packages/schemas/src/backtest-strategy.ts](../../packages/schemas/src/backtest-strategy.ts)；[thesis-ledger/packages/domain/src/backtest-indicators.ts](../../packages/domain/src/backtest-indicators.ts)；[thesis-ledger/packages/domain/src/backtest-simulation-evaluator.ts](../../packages/domain/src/backtest-simulation-evaluator.ts)；[thesis-ledger/apps/server/src/strategy-optimization/strategy-optimization-parameters.ts](../../apps/server/src/strategy-optimization/strategy-optimization-parameters.ts)。

**实际差异：** 读取三个有重叠的筛选实现与筛选/回测 job。turtle 的窗口包含当前 bar 并允许等于最大值，不等于严格突破前 N 日最高；platform 对 MA 缺值填零；名为 low_atr 的逻辑实际使用日涨跌幅绝对值均值，不是 OHLC True Range。筛选函数 false 与异常/缺值不能形成完整三态说明。rate_stats 是命中日后的前向价格收益，不是带成交、费用、滑点和可卖数量的回测。所查树未见这些规则对应的独立单元测试入口，不把这一点说成已运行测试失败。

**处理决定：** 仅将规则意图作为策略模板候选，翻译为本地 AST 后固定窗口排除/包含、阈值、单位、预热及信号/执行时点。保持手工/AI 草稿/回测/风险同一策略定义，不移植筛选 job 或把同名函数直接映射成本地指标。

**最小反例/消费条件：** 平台价格相等是否算突破须明确；历史不足返回 unknown，不因 fillna(0) 触发；改变未来 bar 不改变过去信号；同一规则在草稿与正式策略重放一致。没有批量消费合同不恢复单标 API 的全市场 fallback。

**归属：** 策略库及策略表达式合同；新模板需另定范围，暂不引入第二套选股与统计服务。

<a id="ref14"></a>
### REF14 · GrayJS/alpha-arena：只保留比较界面思路，不采用其金融和数据实现

**源码与测试定位：** [backend/src/scheduler/tasks.ts:1–138](https://github.com/GrayJS/alpha-arena/blob/043761eba6929b5c4b2229cd7a96b0c267b114ff/backend/src/scheduler/tasks.ts#L1-L138)；[backend/src/services/ai/BaseAIService.ts:1–121](https://github.com/GrayJS/alpha-arena/blob/043761eba6929b5c4b2229cd7a96b0c267b114ff/backend/src/services/ai/BaseAIService.ts#L1-L121)；[backend/src/services/dataSource.ts:1–191](https://github.com/GrayJS/alpha-arena/blob/043761eba6929b5c4b2229cd7a96b0c267b114ff/backend/src/services/dataSource.ts#L1-L191)；[backend/src/services/tradeCalculator.ts:1–97](https://github.com/GrayJS/alpha-arena/blob/043761eba6929b5c4b2229cd7a96b0c267b114ff/backend/src/services/tradeCalculator.ts#L1-L97)；[backend/src/controllers/LeaderboardController.ts:1–193](https://github.com/GrayJS/alpha-arena/blob/043761eba6929b5c4b2229cd7a96b0c267b114ff/backend/src/controllers/LeaderboardController.ts#L1-L193)。

**本地入口：** [thesis-ledger/apps/server/src/strategy-optimization/strategy-optimization-evaluation.ts](../../apps/server/src/strategy-optimization/strategy-optimization-evaluation.ts)；[thesis-ledger/apps/server/src/strategy-optimization/strategy-optimization-model-feedback.ts](../../apps/server/src/strategy-optimization/strategy-optimization-model-feedback.ts)；[thesis-ledger/apps/server/src/ai/ai-execution-state.store.ts](../../apps/server/src/ai/ai-execution-state.store.ts)。

**实际差异：** 源码没有建立同一冻结输入与共同观察窗口的完整比较合同。榜单按各模型自己的曲线区间算指标，无数据可回为单位净值/零指标；Sharpe 把日收益均值直接减年化无风险率后再乘 sqrt(252)，周期不一致。Tushare items 原数组行被后续按 .open/.close 对象字段读取并以 ||0 回退，代码还打印来源 token；这些都不应移植。调度中有估值占位逻辑，AI 失败返回 null 不能证明持久终态与真实费用处理。固定树没有识别到常规许可证文件，GitHub license 元数据为空，复制授权未建立。

**处理决定：** 大幅收窄此前推荐：仅参考多模型对照的信息组织，不接其数据适配、排行榜计算、调度/交易系统或代码。沿用本地封存评价集、不可用指标、费用台账与单一终态；源码缺陷是上游不适用依据，不当作本地同类 bug。

**最小反例/消费条件：** 没有成绩不等于 0% 收益或 0 Sharpe；年化无风险率必须先转换到同频。相同条件的模型失败也进入失败率/成本分母；起始日、资金和数据窗口不一致时标不可比。真实字段数组必须按 fields 映射，任何凭据都不得输出日志。

**归属：** T9/T15a 的固定评价协议与 UI 选择性借鉴；不引入实时交易或追加模型调用。

<a id="indicator-findings"></a>
## 3. 新确认的指标内核缺陷

### IR09 · P1：RSI 递归状态的可见时钟被截断

定位：[backtest-indicators.ts](../../packages/domain/src/backtest-indicators.ts) 的 `rsi()`（约 145–175 行）：涨跌平均值持续递归，但输出时钟只合并最后 `period+1` 个原始点。更早的种子仍影响数值，其 `availableAt/researchClock` 却可能被丢掉。

隔离运行原函数：RSI period=2，Jan1～Jan5 收盘 `[100,90,91,92,93]`；Jan1 点到 Jan10 才可用，其余点当日可用。Jan5 输出 `41.17647058823529411765`，可见时间却为 Jan5；只把尚未可用的首点改为 1000，Jan5 值变成 `0.7633587786259541987`，仍通过 `alignSeriesAt(..., Jan5)`。因此不是单纯标签误差：尚不可见的输入实际改变了可见输出。正确处理需在递归状态重置前保留完整依赖时钟，或在每个评价时点只使用真实可见输入。

### IR10 · P1：ATR 丢失上一收盘价时钟，并复活不可用输入

同一文件 `trueRange()/atr()`（约 177–205 行）存在两个独立反例：其一，上一 close=100 到 Jan10 才可见，当日 high=12/low=10/close=11 在 Jan2 可见，ATR1 得到 90 并在 Jan2 被接受；实际使用了尚未可见的上一 close。其二，输入标记 `status=unavailable` 但仍携带 OHLC 时，TR 从字段重新取值，ATR1 输出 2 且标 `available`。需要同时验证当前高低收、上一收盘的可用状态与依赖时钟，不能只改字段标签。

**调用范围与不应扩大之处：** 当前 [V3 Runner](../../apps/server/src/backtest/backtest-v3-runner.ts) 仍调用 `runExchangeVertical`；其指标助手 [backtest-adjusted-indicators.ts](../../apps/server/src/backtest/backtest-adjusted-indicators.ts) 经 `indicatorSeriesFor()` 使用本内核，缓存中按最终评价时点构造指标后再逐 tick 对齐，不能依靠文件名含 v2 就认为代码已退役。源码调用链已确认，追加的原 Server 指标助手隔离执行也复现相同三个场景（RSI 窗延至 Jan10、观察 Jan5）；本轮没有新建真实 V3 Run，不能声称所有普通单调时钟行情都会触发或历史结果已经受污染。NAV 的 [navOfflineSignalInputs](../../apps/server/src/backtest/backtest-nav-offline-signals.ts) 先按评价时点过滤可见净值，是另一层保护；不把场内反例泛化成所有 NAV 路径有漏洞。

**正对照和撤销升级：** 同样输入的 EMA Jan5 输出携带 Jan10 可见时钟，Jan5 对齐保持 unavailable。纯函数 ATR 仅给 scalar close 也能产生数值，但[自然语言策略合同](../../packages/schemas/src/strategy-authoring-definition.ts) 已要求场内 close+OHLCV；此探索结果不计独立已证生产缺陷。不同 RSI 平滑、EMA 种子或 MACD 缩放属于方法版本差异，不计上述 P1。

**修复归属与最小出口：** IR09/IR10 由 ThesisLedger Domain 指标内核及 Server 回测消费共同承接，沿现行[经济/价格合同](../specs/2026-09-25-multi-source-adjustment-aware-backtest.md)和[指标合同](../specs/2026-09-10-market-chart-indicator-integration.md)先形成聚焦修复叶。必须验证普通时钟不回归、晚到/不可用输入、递归重置、研究时钟、已有调整口径和真实消费门禁；算法变化按原冻结/引擎版本兼容合同处理，不重写历史 Run。T0R 完成不等于这些修复完成，也不重开已归档的无关 UI/来源任务。

<a id="reproduction"></a>
## 4. 本次运行证据与交付边界

执行命令：`node /tmp/tl-ref-audit-20261018-2vehvan8/repro-indicators.cjs`，退出 0。脚本先把 4 个未改动的本地 TypeScript 纯模块转译后，通过显式允许列表运行；随后加入原 Server 指标助手，并从原文件准确提取 key/分派声明，复现同一组消费者场景；没有加载 SDK、启动应用、请求网络、访问数据库或操作容器。它是定向隔离反例，不是原仓全量测试、类型检查或目标运行验收。三个缺陷场景在纯函数层与 Server 指标助手层均成功触发，两层各有一个 EMA 正对照；仍只计三个独立场景、两个缺陷类别。另一个 scalar-ATR 探索场景不计生产缺陷。

| 实際运行输入 | SHA-256 |
| --- | --- |
| `packages/domain/src/backtest-indicators.ts` | `efa71ca55fb995bd93ffea64fa5588cd23322da56d5b3703531f9bdda0986c5b` |
| `packages/domain/src/decimal.ts` | `dff6757eaef971afae52ff536e2816b133f8f9015a0aa2b407bfd431d11e5dbc` |
| `packages/domain/src/backtest-observation-clock.ts` | `aad4512342a37c5ecd6d472eacc546989fadf9c118ce763ab3d8676fc64e49db` |
| `packages/domain/src/backtest-series.ts` | `365370d36fd6938f747ba13f2ec2a4f8c14688bf9714d63e97905bd68d40d278` |
| `packages/domain/src/backtest-simulation-evaluator.ts` | `77cc0326914af76cd908f97ce12e51cd13666093956a56cb479aeee80d11305d` |
| `apps/server/src/backtest/backtest-v2-execution-shared.ts` | `d682339730ce53fa0e369f9691d8fb2d9835660257ad28e078cc0bf46aa04e66` |
| `apps/server/src/backtest/backtest-adjusted-indicators.ts` | `e555f0c2956588c0b7bae24e499deb176f250d59eb2ea851ad33dc8510f4fb14` |

审查输入、已读路径与范围、包元数据、原始反例结果及复跑脚本保存在本机临时审查目录 `/tmp/tl-ref-audit-20261018-2vehvan8`，并提供会话交付包；临时目录可能被系统清理，本文已经保存核心反例、版本与处理决定。下载或列出源码不计已审文件；不依赖临时文件作为唯一长期领域合同。

所有 REF 已从“待实现级比较”收敛为已核查的具体采用/不适用/新能力决定；IR08 的真实接口单位、HiThink 账号能力和其他来源/模型权限仍是独立未知事实，不将它们改成成功，也不为完成核查而调用供应商。现有 IR01～IR08 状态只在[主清单](2026-10-18-starred-project-implementation-coverage.md#local-findings)维护。新增 IR09/IR10 仍未修复。

本轮仅更新 Review 与相关 Spec/Task、导航；不合并上游，不安装上述框架，不修改业务代码、依赖、来源启停、模型预算、数据库、镜像、Git 分支或提交。没有接入 free-stockdb。

文档核对：8 份变更文档的 176 处本地链接/锚点、14 项覆盖行、13 项源码结果及任务编号通过；95 处外部源码/发布包链接按固定树路径或发布元数据核对，不声称逐个在线重开成功。两仓各 27 个叶的显式依赖条款保持，只有 T0R 从未完成改为完成。所有已快照的非文档源码指纹及三仓文档范围之外 Git 状态保持不变；`git diff --check` 通过。
