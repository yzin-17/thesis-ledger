# 核心模块使用说明

## Account、Position 与截图导入

进入“录入持仓”后，已有账户先选择账户，主页面展示当前持仓和现金余额；点击“截图导入”后在右侧 Sheet 中完成来源选择、截图上传、草稿审核、提交和回滚，Sheet 内账户跟随外层账户并锁定。点击“账户管理”可进入独立的账户管理页，已有账户列表为主体，点击右上角“创建账户”后在右侧 Sheet 中填写表单，列表为空时会自动打开该 Sheet。Account 只描述名称、机构、类型、实际/影子模式、币种和状态，不保存本次录入来源。

手动录入页的主内容区展示“持仓”列表和“现金余额”，进入页面时录入 Sheet 默认关闭；点击“+ 添加持仓”、持仓行“编辑”或现金“编辑”后，在右侧录入 Sheet 中保存当前值。证券/基金账户的现金余额可以独立保存，现金通过独立的当前余额 Adjustment 维护。证券账户承载股票和交易所 ETF，基金账户承载 .OF 场外基金，现金账户只承载现金。数量填为零或使用“清空持仓”会写入归零 Adjustment，停用账户前必须清空持仓和现金；持仓列表会显示最近一次手动、截图或迁移来源。账户列表中的“录入持仓”只会自动选中对应账户，录入 Sheet 仍保持关闭。

截图只生成 Import Draft；来源可以是支付宝、同花顺、券商、银行、基金平台或未知。审核时处理低置信度、歧义匹配、重复代码和数值警告后才能提交。截图中的现金字段被忽略，未提交的行不改变现有持仓；草稿会检查 Ledger 基线，已提交导入可从历史中回滚。

## Provider 与行情

Quote、Bar、Indicator 和 Chip 使用统一契约。场外基金使用独立的 Fund NAV Contract，代码为 `000001.OF` 形式，估值使用单位净值和净值日期，不把基金截图净值写入官方缓存。接入 Provider Registry 的路由可按能力配置优先级和 fallback；当前主行情链路仍通过 DSA Contract 取数，保存 Provider 配置不会自动切换该链路。`stale` 表示数据陈旧，`partial` 表示结果不完整；两者都不能用于无提示的完整回测或组合结论。

### Provider 填写教程

进入“数据与自动化”页，在“新增或更新 Provider”中填写以下字段：

| 字段     | 填写方式                                                                                                          | 示例                 |
| -------- | ----------------------------------------------------------------------------------------------------------------- | -------------------- |
| 名称     | Provider 的稳定唯一标识。更新已有配置时必须填写原名称；换一个名称会创建新的配置。建议使用小写英文、数字和短横线。 | `dsa-fork`、`feishu` |
| 类型     | 选择 Provider 的用途：通知、行情、AI 或图像。                                                                     | 行情                 |
| 能力     | 展开下拉框后多选能力；至少选择一项，并且必须与实际 Provider Plugin 声明的能力一致。                               | 报价、日线           |
| 凭证引用 | 填写部署环境或 Provider Plugin 约定的凭证引用。提交后输入框会清空，列表只显示“已配置/未配置”。                    | `provider-dsa-token` |

当前下拉选项包括 `notification`、`quote`、`bars-1d`、`bars-1m`、`indicator`、`chip`、`financials`、`news`、`announcements`、`chat` 和 `vision`。请选择与实际 Provider Plugin 一致的能力，不要为了通过保存而勾选无关能力；如果 Adapter 使用未列出的自定义能力，需要先扩展页面选项和对应契约。

新增行情 Provider 的最小示例：

```text
名称：dsa-fork
类型：行情
能力：选择“报价”和“日线”（提交值为 `quote`、`bars-1d`）
凭证引用：按部署环境的 Secret 引用填写；如果由服务端环境变量提供，可留空
```

更新已有 Provider 时，使用同一个名称重新保存即可。能力、类型会更新；凭证引用留空时不会清除已有凭证。新建配置默认启用、优先级为 `1`；需要调整优先级时，在下方 Provider 列表中修改数字并离开输入框，系统会自动保存。在已接入 Provider Registry 的路由中，优先级数字越小越优先，多个 Provider 声明同一能力时按优先级参与路由和 fallback。

请注意，Provider 表单管理飞书 Webhook 和 AI Provider 配置，不再依赖对应的服务端环境变量；行情链路仍使用 `DSA_BASE_URL` 与 `THESIS_LEDGER_DSA_TOKEN`。真实密钥不要写入文档、截图、日志或 Git；生产环境应使用环境变量或 Secret Manager。详细边界见 [环境变量与 Secret](../engineering/2026-08-18-environment-and-secrets.md)。

保存后可以在 Provider 列表中确认能力、优先级、启用状态和凭证配置状态，再点击“连通性测试”。健康历史同时包含手动测试、定时检查和实际通知投递结果，页面刷新或修改配置不会主动探测 Provider。页面提示“已排队”只表示测试任务已提交；最终结果应结合健康状态和健康历史判断。`unknown` 表示没有足够的健康结果，`degraded` 表示响应变慢或发生短暂失败，`down` 表示连续失败，不应仅凭“凭证已配置”判断 Provider 可用。

## Risk 与通知

Portfolio、Risk、Performance 和 AI 默认读取实际账户；Desktop 与 Mobile 可以切换到影子范围，结果显示“模拟”。RiskRule 负责确定性判断，RiskEvent 保存阈值、触发值、数据时点和范围。影子 RiskEvent 默认不发送通知。Notification 只负责路由、静默时段、去重、重试和送达记录，不重新计算风险。提醒不是交易执行保证。

完整规则语义、数据不足处理和通知治理见 [风控与通知说明](../domain/2026-08-18-risk-and-notifications.md)。

Provider 状态、行情落库和数据质量问题见 [Provider 与数据可靠性](../domain/2026-08-18-provider-reliability.md)；Ledger、持仓投影和收益口径见 [Ledger 与收益计算](../domain/2026-08-18-ledger-and-performance.md)。

专业 Provider 的能力路由、PIT 财务、额度和授权选择见 [数据源选择与专业 Provider](../domain/2026-08-18-provider-selection.md)。

## Strategy 与 Backtest

策略使用版本化 Schema，固定 Universe、信号、止损/止盈、仓位、执行、成本、约束和 Benchmark。A 股回测处理 T+1、涨跌停、停牌、最小交易单位、手续费、印花税和滑点。结果必须区分样本内/样本外，并记录 PIT 和 survivorship limitation。

完整契约、偏差防护、数据完整度和可复现元数据见 [策略与回测](../domain/2026-08-18-strategy-and-backtest.md)。

## AI Research

AI 只能调用获准的只读或研究 Tool。关键数字必须能追溯到 Tool citation；Tool 失败会显示 unavailable，不会用零值代替。AI 不得写 Ledger、Position 或 Order，也不得输出自动交易指令。

Provider、Prompt 版本、Agent 分工、Tool 权限和 provenance 规则见 [AI 研究与 Agent 边界](../domain/2026-08-18-ai-research.md)。

## Automation

自动化任务包含 cron、timezone、重试策略、锁 TTL、nextRunAt 和执行历史。盘前、盘中、收盘和日报应复用手动 API 的 Market、Portfolio、Risk 和 Report 逻辑。

日志、交易计划、确定性行为指标和反事实回放见 [投资日志与行为分析](../domain/2026-08-18-journal-and-behavior.md)。

### 投资复盘工作台

Desktop 的“投资复盘”先选择账户，再从 Ledger 的已平仓交易中选择单笔交易或明确的 7 天、30 天、自定义窗口。单笔交易会先展示实际成交、已关联计划和证据完整度；缺少计划事实时仍可计算实际结果，但相关结论会标记为“证据不足”。“补充证据”只参与当前复盘，不会写回 Ledger、TradePlan 或 JournalEntry。

“周期复盘”使用用户选择的起止时间，并在结果中保留窗口内交易样本。确定性计划偏差、行为三态和反事实结果完成后，用户可以单独触发 AI 解读；AI 只解释已计算事实，Provider 不可用不会清空确定性结果。

手动复盘和“高级 JSON”是没有候选交易或需要审计外部数据时的次级入口。JSON 仅用于当前只读复盘，不会自动创建订单或保存记录。

自动化调度、交易日跳过、日报链路和失败排查见 [自动化与日报运维](../domain/2026-08-18-automation.md)。

备份、恢复、Secret 扫描和发布门禁见 [发布、备份与恢复](../operations/2026-08-18-release-and-recovery.md)；领域关系与需求追踪见 [Domain Model 总览](../domain/2026-08-18-domain-model.md)、[Domain Model 历史审计](../archive/domain/2026-08-18-domain-audit.md) 和 [Spec Traceability](../architecture/2026-08-18-spec-traceability.md)。
