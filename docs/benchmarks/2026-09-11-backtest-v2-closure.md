# 统一回测 V2 收敛验收记录

日期：2026-09-11

关联任务：

- [`统一回测系统 V2 实施任务`](../tasks/2026-08-28-unified-backtest-v2.md)
- [`回测执行规则与研究假设实施任务`](../tasks/2026-09-10-backtest-historical-execution-rule-facts.md)

## 1. 本轮目标

本轮针对此前反复阻塞的三项责任收敛：

1. DSA T2 补齐 CN 股票历史上市、退市与停牌事实来源，禁止用静态 `tradable` 或缺失 K 线猜测历史状态。
2. 复核 T3.1 的 Snapshot 冻结边界，确认关键事实与研究模型分离、模型/来源进入 Artifact 与内容哈希、finalized Snapshot 重放不重新取数。
3. 将 V2 T13 的离线目标矩阵从少数代表场景扩展为 CN/HK/US Stock/ETF 六种目标周期与 CN NAV 日频的完整 Schema/Contract 回归；真实 Provider 支持状态仍按事实报告，不将 `unavailable` 改写为 `supported`。

## 2. T2 历史可交易性

DSA 新增独立历史可交易性 Provider：

- `query_stock_basic` 提供上市/退市边界；
- `query_trade_dates` 提供请求区间应存在的交易会话；
- `query_history_k_data_plus(..., fields="date,tradestatus", adjustflag="3")` 提供逐会话明确状态；
- 只有每个应有交易会话都存在合法 `tradestatus` 时 coverage 才完整；
- `tradestatus=0` 明确识别为停牌并保持 `criticalFact` 阻塞；
- Provider 行缺失只表示覆盖不完整，不能解释为停牌；
- 历史状态完整且区间内均可交易时，顶层 instrument-facts 可为 `supported`，但原始 `executionRules` 继续保持 `unavailable/modelAssumption`。

因此，完整研究模型只能替代费用、价格限制与结算等显式模型假设，不能替代上市/停牌等关键事实。无研究模型的运行仍会由现有 `requireFrozenExecutionRules` 门禁失败。

## 3. T3.1 冻结边界复核

现有 Snapshot 实现已经具备以下闭环，不再重复建设第二套冻结逻辑：

- `start/end/executionStart/executionEnd` 由 Server 按实际 warmup/运行区间传给 DSA；
- `executionModel` 作为独立 Artifact 冻结，并与 RunConfig、Manifest 相互校验；
- 模型数值或来源变化会改变内容哈希，相同输入哈希稳定；
- Provider 标的身份、币种与 Calendar 时区仍必须和模型一致；
- `historicalTradability` 等 critical fact unavailable 时，即使存在模型也不能冻结；
- 只有 execution instrument 的完整显式研究模型可以替代 `executionRules` model assumption；
- finalized Snapshot 重放不访问在线 Provider；缺失/篡改模型 Artifact 会拒绝重放；旧 V1 Snapshot 不自动补研究假设。

本轮 DSA T2 正好补上这条链路此前缺失的 critical fact 来源，因此不需要放宽 Snapshot 门禁。

## 4. T13 离线目标矩阵

新增 Schema 回归覆盖以下 36 个 Exchange 组合：

- 市场：CN、HK、US；
- 资产：Stock、ETF；
- 周期：`1d`、`60m`、`30m`、`15m`、`5m`、`1m`。

并额外验证：

- CN NAV 仅支持 `1d`；
- HK/US NAV 与分钟 NAV 保持拒绝；
- capability 契约可表达 36 个 Exchange capability + CN/HK/US 三个 NAV capability，共 39 项；
- FX 至少覆盖 HKD/CNY、USD/CNY；
- 公司行动契约覆盖 `SPLIT` 与 `REVERSE_SPLIT`；
- CN NAV dependency 保持 supported 事实结构。

这属于完整**契约/离线矩阵验收**，不会把真实 DSA 当前未接入的数据源改写成支持。真实 Provider、Docker Worker 与跨市场实际运行仍必须由 live gate 如实给出 supported/unavailable。

## 5. 验收口径

任务完成状态必须区分三层：

- **契约完成**：Schema、类型、错误语义与 capability 矩阵可以表达目标范围；
- **实现完成**：Provider/Snapshot/Runner 对对应能力有真实实现；
- **真实验收完成**：在真实 DSA/Server/Worker 上使用目标 Provider 成功运行并通过重放、隔离与故障门禁。

不得因为某一层通过就自动把下一层标记为完成。尤其不得以固定 `600519.SH` 日频闭环代表 ETF、NAV、FX、拆并股、HK/US 或分钟周期全部真实可用。
