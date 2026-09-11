# 统一回测 V2 收敛补充 Spec

日期：2026-09-11

关联：[`统一回测系统 V2`](2026-08-28-unified-backtest-v2.md)、[`回测执行规则与研究假设`](2026-09-10-backtest-historical-execution-rule-facts.md)

## 目标

消除“局部能力未验收导致整个回测任务长期无法收敛”的状态混淆，同时不降低回测正确性门禁。

本补充只明确三点：

1. 历史上市/停牌属于不可由研究模型替代的 critical fact；必须由可证明 Provider 覆盖。
2. executionRules 中费用、价格限制和结算等允许由完整、显式、已冻结的研究模型替代 Provider model assumption，但不得改写 Provider 原始状态。
3. T13 必须分别记录离线契约矩阵和真实 Provider/Runtime 证据；fixture/Schema 成功不能冒充真实数据源支持。

## 历史可交易性

CN Stock 第一版事实源使用 DSA 已有 BaoStock 能力：

- 证券基础信息证明上市/退市边界；
- 交易日历确定请求区间应存在的交易会话；
- `tradestatus` 明确证明每个交易会话是否停牌；
- 只有预期交易会话全部存在合法状态时 coverage 才完整；
- 缺行、解析失败或 Provider 异常均返回 unavailable，不从缺失行情推断停牌；
- 明确停牌属于已知不可交易状态，当前阻止整个运行，后续若引入逐日 tradability 再另行放宽到事件级撮合拒绝。

## Snapshot

Snapshot Builder 继续遵守既有边界：

- critical fact unavailable 必须失败；
- 研究模型只能替代 executionRules model assumption；
- 模型、来源、假设和实际数据都必须冻结并进入内容哈希；
- replay 只读 finalized Artifact，不重新访问 Provider；
- 旧 Snapshot 不自动补模型。

## T13 分层验收

### 契约层

必须自动覆盖 CN/HK/US × Stock/ETF × `1d/60m/30m/15m/5m/1m`，以及 CN NAV `1d`；HK/US NAV 保持明确 unsupported。FX、公司行动和 NAV 依赖契约必须能表达目标事实。

### Provider/Runtime 层

只有实际 Provider 能在所需区间提供完整事实，且 Server/Worker 真实运行、重放、隔离和故障门禁通过时，才可标记真实能力完成。`unavailable` 是合法且安全的结果，但不能计作能力已实现。

## 非目标

- 不通过静态常量伪造 HK/US/ETF 历史事实；
- 不为完成 T13 把 unavailable 改成 supported；
- 不以单一 `600519.SH` 日频运行代表全部矩阵；
- 不重建第二套 Snapshot/Runner。
