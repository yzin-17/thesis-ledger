# 延期实现 TODO

本文只记录**已经明确要在后续迭代实现、但当前不属于任何 active Spec/Task 完成条件**的事项。它不是当前任务清单，也不能用于把当前未完成的实现、运行时验收或外部门禁延期掉。

治理规则：

- 当前已经承诺实施或仍属于验收条件的事项，继续留在 `docs/tasks/` / `docs/reviews/`，不得迁入 TODO。
- 已经存在正式后续 Spec/Task 的事项，直接由该 Spec/Task 承接，不在 TODO 重复维护。
- TODO 只保留延期范围、来源、前置条件和重新立项触发条件；一旦启动实施，先创建成对 Spec/Task，再从本文移除对应条目。
- 普通“非目标”不自动进入 TODO；只有文档明确写明“后续实现 / 后续版本 / 另行立项 / 已确认后续范围”的事项才进入本文。

## 当前 TODO

| ID | 延期范围 | 来源 | 重新立项前置条件 / 触发条件 |
| --- | --- | --- | --- |
| `astock-research-consensus` | 研报一致预期与 EPS 的独立数据合同；最小列表、稳定引用、历史及日期可选的[长期按需读取](archive/tasks/2026-10-23-research-report-on-demand.md)已完成归档 | [模块盘点](reviews/2026-10-22-astock-data-module-followups.md) | 真实消费目标、预测期间、币种/单位、来源使用范围及历史可见性明确后单独立项，不并入已验收的最小元数据合同 |
| `astock-financial-index-reference` | P2：新浪三表、估值历史、申万行业变更及中证/国证成分权重，分能力实施 | [模块盘点](reviews/2026-10-22-astock-data-module-followups.md) | 真实消费者、会计单位、报告期与披露/生效时间明确；复用旧解析，禁止当前成分或数据期反填历史可见性 |
| `astock-macro-rates-calendar` | P2：官方宏观、收益率/FR/FDR/LPR 与宏观日历 | [模块盘点](reviews/2026-10-22-astock-data-module-followups.md) | 选定首个指标及消费者，核实发布时区、频率、修订和请求预算后独立立项 |
| `astock-etf-capital-events` | P2：ETF 份额、两融/股东事实，以及业绩/调研等结构事件，逐项拆分 | [模块盘点](reviews/2026-10-22-astock-data-module-followups.md) | 先确定消费目标、单位、事件状态与历史/当前窗口；不重复已验收分红、拆分和筹码 |
| `astock-news-qna-expansion` | P2：东财全球快讯、央视节目元数据与沪深公司问答，按独立来源推进 | [模块盘点](reviews/2026-10-22-astock-data-module-followups.md)；复用既有新闻探测 | 选定首个市场/元数据切片并具备来源条件；复用 `NEWS_FEED` 或另建问答合同，不推断个股关联，不重复财联社/见闻当前验收 |
| `astock-market-signal-facts` | P2：题材、板块、资金流、龙虎榜、涨停/异动事实 | [模块盘点](reviews/2026-10-22-astock-data-module-followups.md) | 消费者及计算/时间口径明确后按单一事实立项；不直接迁入组合评分或策略结论 |
| `astock-ticks-derivatives-expansion` | P3：逐笔/全市场盘后包、期货、ETF 期权及可转债，按品类分别立项 | [模块盘点](reviews/2026-10-22-astock-data-module-followups.md) | 批量消费者/请求预算或相应资产、单位、会话、换月和生命周期模型具备；通用分钟继续由既有条目承接 |
| <a id="rqdata-live-consumption"></a>`rqdata-live-consumption` | RQData 原 `H07-K37c-live` 的真实账号正向读取与消费验收；用户于 2026-10-21 明确延期，已从当前适配层验收范围转出，实源尚未通过 | [范围决定](specs/2026-10-09-unified-data-capability-adapter.md#source-scope-20261021)；[原责任项与证据](tasks/2026-10-09-unified-data-capability-adapter.md#rqdata-deferred) | 用户明确恢复且合法账号、目标接口权限及原身份/准入输入具备后，建立成对 Spec/Task，承接原真实读取与消费断言 |
| `market-chart-minute-period` | 富途当前历史 1m 子集以外的通用分钟能力：其他周期/来源/市场、相应 Session/午休与分页窗口、尾 bar/指标预热，以及尚未立项的盘中刷新和增量更新 | [周期 Spec](specs/2026-09-16-market-chart-period-aggregation.md)；[指标完成记录](archive/tasks/2026-09-10-market-chart-indicator-integration.md) | 确有新增需求且能力/授权/预算明确后独立立项。[富途已完成任务](archive/tasks/2026-10-08-futu-openapi-full-integration.md) FAPI-M1～M4 已交付 1m、none、正常时段、完整分页、标准合同/缓存和产品验收，不在此重复登记 |
| `market-chart-intraday-daily-bar` | 稳定交付股票与 ETF 的盘中日线快照（非分钟线）：在完整窗口和最新端正确选择真实当日 `incomplete` bar，验证跨源复权、价格、成交量单位与指标输入可比性，并处理上游临时故障、请求预算及收盘状态转换。当前图表路径的盘中日线尚未通过可用性验收；单次备用源成功不代表稳定支持 | [图表更新 Spec](specs/2026-09-17-market-chart-refresh.md)；[T4/G1 完成记录](archive/tasks/2026-09-10-market-chart-indicator-integration.md#chart-refresh-acceptance)（2026-09-28 盘中核查与降级分支） | 核实目标 Provider 的盘中覆盖、频率限制或配额、时间戳与字段语义后单独立项；至少以真实 ETF 和股票目标验证同日两次快照、`incomplete → complete`、故障退避及浏览器展示。10-17 已完成无当日 bar 的真实截止日期降级；该结果不关闭本条稳定盘中能力 |
| `market-detail-pagination-anchor` | 为现行 `/api/market/:symbol/detail` 明确接收并消费 `calculationAnchor`；核对历史加载与指标计算锚点的一致性。当前 `loadEarlier` 通过增加 `barsLimit` 扩窗，旧“传序列末尾日期”不再是现行行为 | [周期 Spec](specs/2026-09-16-market-chart-period-aggregation.md)；`apps/server/src/market/market.controller.ts`；`apps/desktop/src/features/market-detail/MarketDetailDialog.tsx` | 扩展真正分页/游标或出现可复现锚点问题时独立立项，验证完整/扩窗输入与指标锚点，不重复修复已退役的尾日参数路径 |
| `market-chart-trading-overlays` | 行情图表交易标记、成本线、风险线与区间测量等交易叠加层 | [指标完成记录](archive/tasks/2026-09-10-market-chart-indicator-integration.md) | 产品交互与数据来源明确后单独立项；不得夹带进周期、指标或分页任务 |
| `backtest-market-rules-expansion` | 扩展已验收切片以外、尚未立项的市场/资产与历史规则覆盖，以及其他客户收费适用性和所需可复核来源材料 | [历史来源调查](archive/tasks/2026-09-16-backtest-real-historical-market-rules.md)为历史来源；现行已交付范围见[主备 Spec](specs/2026-10-06-historical-rules-primary-backup.md)与[P6 Spec](specs/2026-10-07-p6-market-state-expansion.md) | 出现超出现行完成范围的明确需求后按市场/能力立项；已完成主备、公共费用、选定港美和券商成本不重复登记，取消的严格 PIT/全历史追补不恢复 |
| `market-batch-catalog` | 为真正需要批量行情的消费者建立显式 batch/catalog 边界，禁止从单标 Quote 路径恢复 universe/full-market fallback | `archive/tasks/2026-09-14-portfolio-valuation-demand-guard.md` | 出现独立批量消费场景并能定义请求预算、缓存和 Provider 责任边界 |
| `portfolio-valuation-followups` | FX、LedgerEvent 与 realized PnL 相关的组合估值/性能优化 | `archive/tasks/2026-09-14-portfolio-valuation-demand-guard.md` | 有独立性能证据或产品需求证明当前链路需要优化；分别立项，不回填进已完成的估值保护任务 |
| `ai-provider-probe-route-parameters` | 用途探针已消费首输出与输出间隔配置；路由级 `reasoningEffort` 尚未注入受控验证，需要评估该参数与正式执行及验证指纹的一致性 | `tasks/2026-09-21-ai-provider-model-usage-configuration.md`（2026-09-23 复核记录） | 产品确认用途验证必须覆盖指定推理强度时独立立项 |
| `ai-generation-contract-semantic-refinements` | 评估当前生成合同中不能由 JSON Schema 表达的 decimal 正值、比例上限和跨字段语义，明确可结构化的约束与应用侧校验。entry/exit 已为表达式 AST，all/any 条件已有 `.min(1)`，不沿用旧数组/单一 `superRefine` 描述 | [用途配置 Task](tasks/2026-09-21-ai-provider-model-usage-configuration.md)；`packages/schemas/src/ai-execution.ts`、`backtest-strategy.ts`、`monetary-values.ts` | 反复出现合法结构但非法语义输出，或需要上游保证更多语义时立项；同步当前契约版本、路由和冻结兼容影响 |
| `ai-provider-json-text-error-classification` | `json_validated` 空内容仍由 `parseGenerationOutput` 抛普通 `Error`，不能进入适配器的结构校验错误分支，可能落为 `transport_unknown`；修正失败类型与阶段，保留真实外部结果 | `apps/server/src/ai/ai-generation-output.ts`；`apps/server/src/ai/ai-sdk-generation.adapter.ts` | 出现空内容被当传输问题排查，或需要按 `schema_invalid` 统计输出质量时立项；本条更新源码定位，不代表已经修复 |
| `ai-provider-json-validated-prompt-guard` | 为新增 `json_validated` 调用评估统一字段指令或守卫，避免调用点遗漏当前输出契约。研究字段指令已由[正式研究输出 Spec](specs/2026-10-05-research-json-prompt-contract.md)及其完成任务交付，不重复实现 | [用途配置 Task](tasks/2026-09-21-ai-provider-model-usage-configuration.md)；`apps/server/src/ai/ai-generation-output.ts` | 新增尚未消费共享字段指令的调用点，或再次发生漏 JSON 指令导致的业务生成失败时独立立项 |
| `historical-rule-update-monitoring` | 按需要监测历史收费/规则来源更新，沿既有来源与版本记录处理变化 | [历史规则主备 Spec](specs/2026-10-06-historical-rules-primary-backup.md#9-实施顺序与任务拆分)的“更新监测按需要后续补充” | 需要自动发现规则更新时再立项；不作为已完成 P1～P5 的前置，也不重复公告每日更新和现行缓存代次失效 |

## 不属于 TODO 的当前门禁

以下类型即使受外部条件影响，也仍属于**当前任务完成条件**，不得迁入本文：

- 原共同价格与多源扩展已收尾，取消范围见[现行决定](specs/2026-10-03-multi-source-remaining-acceptance.md#scope-cancellation-20261008)；统一适配层的 Tushare 正向条件仍归[当前 Task](tasks/2026-10-09-unified-data-capability-adapter.md)，不新增开户、采购或重复探测动作。RQData 已按明确范围决定列入上方 TODO；
- Market Provider 的当前凭证/在线验收以[来源配置 Task](tasks/2026-09-14-market-provider-credentials.md)为准，区分有效义务与 Tushare 等来源的范围性跳过；
- Desktop / Mobile / Browser / Simulator 的当前产品运行态验收；
- 已实现功能的 Docker、Worker、PostgreSQL、Redis 或真实 Provider smoke；
- 当前 Task 明确列出的用户确认或受保护数据清理门禁。
