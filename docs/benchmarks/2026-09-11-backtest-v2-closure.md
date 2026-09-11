# 统一回测 V2 收敛验收记录

日期：2026-09-11

关联任务：

- [`统一回测系统 V2 实施任务`](../tasks/2026-08-28-unified-backtest-v2.md)
- [`回测执行规则与研究假设实施任务`](../tasks/2026-09-10-backtest-historical-execution-rule-facts.md)

## 1. 本轮目标

本轮针对此前反复阻塞的三项责任收敛：

1. DSA T2 补齐 CN 股票历史上市、退市与停牌事实来源，禁止用静态 `tradable` 或缺失 K 线猜测历史状态。
2. 复核 T3.1 的 Snapshot 冻结边界，确认关键事实与研究模型分离、模型/来源进入 Artifact 与内容哈希、finalized Snapshot 重放不重新取数。
3. 将 V2 T13 的目标矩阵从少数代表场景扩展为 CN/HK/US Stock/ETF 六种目标周期与 CN NAV 日频的完整确定性回归，并把“产品/引擎完成”与“部署 Provider 当前可用性”分开。

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

DSA 定向 GitHub Actions 已通过：py_compile、选定 flake8、既有 V2 dependency tests、新历史状态 tests 与 `git diff --check`。该改动已通过 squash PR 合入 DSA `yzin` 分支。

## 3. T3.1 冻结边界复核

现有 Snapshot 实现已经具备以下闭环，不再重复建设第二套冻结逻辑：

- `start/end/executionStart/executionEnd` 由 Server 按实际 warmup/运行区间传给 DSA；
- `executionModel` 作为独立 Artifact 冻结，并与 RunConfig、Manifest 相互校验；
- 模型数值或来源变化会改变内容哈希，相同输入哈希稳定；
- Provider 标的身份、币种与 Calendar 时区仍必须和模型一致；
- `historicalTradability` 等 critical fact unavailable 时，即使存在模型也不能冻结；
- 只有 execution instrument 的完整显式研究模型可以替代 `executionRules` model assumption；
- finalized Snapshot 重放不访问在线 Provider；缺失/篡改模型 Artifact 会拒绝重放；旧 V1 Snapshot 不自动补研究假设。

本轮 DSA T2 补上这条链路此前缺失的 critical fact 来源，因此不需要放宽 Snapshot 门禁。

## 4. T13 完整目标矩阵

新增 Schema 回归覆盖以下 36 个 Exchange 组合：

- 市场：CN、HK、US；
- 资产：Stock、ETF；
- 周期：`1d`、`60m`、`30m`、`15m`、`5m`、`1m`。

并额外验证：

- CN NAV 仅支持 `1d`；
- HK/US NAV 与分钟 NAV 保持拒绝；
- capability 契约可表达 36 个 Exchange capability + CN/HK/US 三个 NAV capability，共 39 项；
- FX 覆盖 HKD/CNY、USD/CNY；
- 公司行动契约覆盖 `SPLIT` 与 `REVERSE_SPLIT`；
- CN NAV dependency 保持 supported 事实结构；
- 既有 Exchange/CN NAV Runner、三市场派生分钟聚合、FX 估值、公司行动、Snapshot/Result checksum、隔离、retry/replay 与故障测试继续作为运行时实现证据。

新的目标矩阵不把真实 DSA 当前未接入的数据源改写成支持。真实环境仍必须通过 capability 如实给出 `supported / unavailable / unsupported`。

## 5. 完成口径

V2 现在明确区分两层：

### 产品/引擎交付

完成条件是目标矩阵可表达并有确定性回归，Snapshot/Runner/SimulationLedger/Result、隔离、重放、错误语义、迁移和性能门禁均有证据。该层本轮完成，T13 可以关闭。

### 部署数据可用性

DSA 根据 Provider 配置、凭证、网络、历史区间和健康状态动态报告 capability。某个部署中的 HK/US、ETF、FX、拆并股、分钟或 NAV 数据返回 `unavailable` 时：

- 不得冒充 `supported`；
- 必须携带 Provider/范围/原因并 fail closed；
- 只阻止依赖该事实的运行；
- 不把已经完成的 V2 产品/引擎任务重新标记为未完成。

因此，固定 `600519.SH` 日频闭环不再被错误扩张成“所有 Provider 都已在线”，同时第三方服务临时不可用也不会让 V2 任务永久无法完成。后续新增真实 Provider 覆盖属于数据能力增强，单独迭代。
