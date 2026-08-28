# 投资日志、交易复盘与行为分析

## 事实边界

`TradePlan` 是交易前计划事实，包含方向、计划价格和时间、目标仓位、止损/止盈、预期持有期及理由；它不会改变 Ledger 或 Portfolio。`JournalEntry` 保存用户复盘、理由、标签和引用关系，也不是资产事实源。

真实成交、现金和公司行动的唯一经济事实源是 `LedgerEventV2`。Journal 不再直接从 Ledger 重建“交易”，而是消费统一 Trade Projection：

```text
LedgerEventV2
    ↓
Trade Projection
    ↓
TRADE_CYCLE / CLOSE_SLICE
    ↓
Journal deterministic review
    ↓
optional AI explanation
```

`Position` 只表达当前持仓，不提供完整交易生命周期语义；Baseline Observation 也不是买入成交。实际账户与影子账户共享算法但事实、查询、缓存、统计和复盘上下文必须隔离。

## 两级复盘对象

- `TRADE_CYCLE`：从数量由零转正到回到零，或被明确余额观察结束的一段完整持有生命周期。用于计划偏差、完整盈亏、持有周期和符合资格的胜率/交易次数统计。
- `CLOSE_SLICE`：一次有效 SELL 及其成本、费用和收益分配。用于减仓和退出行为复盘，不计入完整 Trade 的交易次数或胜率。

ACTIVE Trade 可以复盘已经发生的 Close Slice，但不能伪造完整退出结果。Baseline、未知开仓时间、余额观察结束或缺失计划等证据不足场景必须保留明确状态，不用默认值补齐。

新的 Journal 主链路使用 Trade Projection 提供的 decimal string 数值、`projectionGeneration`、`projectionFingerprint` 和对象级 `evidenceFingerprint`。旧 `CompletedTrade<number>` 只允许作为 legacy adapter 或历史兼容测试，不再作为当前候选和快照的权威契约。

## 计划与证据关联

TradePlan 默认关联完整 Trade；Close Slice 继承所属 Trade 的计划语境。关联必须来自显式 `tradeId` 或明确 Ledger 事件证据，不按相同标的、相近日期或相似价格自动猜测。

计划触发 RiskRule 时仍必须通过显式操作确认；生成规则后修改计划不会静默修改已创建规则。Journal 可以引用 Trade、TradePlan、RiskEvent、StrategyVersion 和相关证据，但不能反向修改这些事实。

## 确定性复盘与行为分析

计划偏差、实际盈亏、持有周期、止损执行、减仓行为、交易频率和其他行为指标应由确定性事实计算。缺少必要事实时返回 `insufficient data` / 证据不足，不由 AI 猜测。

周期统计默认只使用 `statisticsEligible=true` 的完整 `TRADE_CYCLE`；Close Slice 统计独立展示，避免部分减仓放大交易次数、胜率或完整持有周期。

Counterfactual Replay 必须明确区分真实收益与假设收益，并保存假设条件。复盘快照保存对象级证据和投影指纹；相关事实变化后旧结果应标记 stale，无关账户 Generation 变化不得使对象误过期。

## AI 边界

AI 只能解释已经计算完成的确定性结果和可追溯来源，不得新增交易事实、心理诊断、Baseline 对账建议或自动买卖信号。AI Provider 不可用时，确定性复盘结果仍应可读取和保存。

当前产品与契约细节以 [`../specs/2026-08-28-journal-review-trade-projection.md`](../specs/2026-08-28-journal-review-trade-projection.md) 为准；Trade 生命周期、成本和迁移边界以交易系统主 Spec 及其子 Spec 为准。
