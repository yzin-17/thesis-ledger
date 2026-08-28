# Trade Projection 与收益读取模型子 Spec

上位 Spec：[`2026-08-26-trade-execution-ledger-system.md`](2026-08-26-trade-execution-ledger-system.md)

依赖：[`交易账本写入与修正协议`](2026-08-26-trade-ledger-write-correction.md)、[`历史基线、导入与对账`](2026-08-26-trade-baseline-import-reconciliation.md)

## 背景与问题

现有 Position 只表达当前状态，Journal 的交易候选又按每次 SELL 独立计算，无法统一回答一轮交易如何建仓、减仓、结束以及每次退出使用了哪些成本来源。

## 目标

- 从统一有效 LedgerEvent 生成完整 Trade 生命周期和 Close Slice。
- 保持 Position、Trade 和 Cash 在公司行动、历史补录和修正后一致。
- 支持移动加权平均成本法与先进先出成本法的可审计分配。
- 分离原币事实、本位币折算、价差收益和投资收入。
- 为列表、详情、Journal 和统计提供同一物化读取模型。

## 非目标

- Trade 直接写入、人工合并或拆分。
- 做空、融资融券、证券转入转出。
- 订单、委托和待确认成交。
- 在核心 Trade 中保存当前行情或未实现收益。

## 现状与约束

- Trade 按 `accountId + Asset.symbol` 隔离，不跨账户合并。
- 实际账户和影子账户共享算法但事实性质、查询和统计隔离。
- Position 已处理 BONUS、SPLIT、MERGE，Trade 必须消费同一事件。
- 所有数量与金额使用十进制类型，接口使用字符串。

## 设计方案

### 生命周期与状态维度

- 数量由 0 变为正时创建新 Trade。
- 数量保持正数期间的 BUY、公司行动、分红和部分 SELL 属于同一 Trade。
- 数量回到 0 时结束 Trade；之后新 BUY 创建新周期。
- 生命周期使用 `ACTIVE | ENDED`。
- 退出进度使用 `NONE | PARTIAL | FULL`。
- 结束证据使用 `SELL_EXECUTION | BALANCE_OBSERVATION | UNKNOWN`。
- 已发生部分 SELL 后再次 BUY，退出进度仍为 PARTIAL。

### 物化实体

```text
TradeProjection
├─ TradeEntryLeg
├─ TradeBaselineComponent
├─ TradeCorporateActionAdjustment
├─ TradeCloseSlice
│  └─ TradeCloseAllocation
└─ TradeDividendAttribution
```

Trade Projection 保存账户、symbol、账户模式、生命周期、退出进度、结束证据、开仓/结束时间、数量汇总、原币收益、策略版本、证据状态、算法版本、Projection Generation 和输入指纹。

- Entry Leg 只引用真实 BUY factId/eventId。
- Baseline Component 保存观察事实、剩余数量、来源平均成本和口径。
- Close Slice 一一对应有效 SELL 事实，并保存 SELL 的退出价格、原币种、数量和成本分配结果。
- Close Allocation 指向 Entry Leg 或 Baseline Component，并保存消耗数量、原始成本和分配费用。
- 公司行动记录原始 factId 和数量/单位成本变化。
- 分红归属保存独立投资收入，不并入价差收益。

### 成本策略

账户成本策略使用不可变 Revision：方法、生效时间、原因和操作者。Trade 在开仓时引用当时有效策略，整个周期不切换。

- 移动加权平均成本法维护统一成本池，但按各来源剩余数量占比生成 Close Allocation。
- 先进先出成本法依次消耗最早 Entry Leg 或 Baseline Component。
- 公司行动同比例调整未消耗来源数量和单位成本。
- 送股不增加总成本；拆股/合股使用 `fromUnits / toUnits`。
- 同一资产后续 Baseline 是新的余额检查点：已知成交只解释一次，未解释的 Baseline 剩余数量按检查点差额维护；当检查点提供成本时，未解释剩余成本按“观察总成本减已知成交剩余成本”重估，不把绝对观察值再次累加。

T8 的纯领域引擎先建立 Entry Leg、Baseline Component 到 Close Slice 的来源引用和数量消耗；为保持输出确定性，来源消耗暂按投影输入顺序记录，但这不是成本策略，也不代表 FIFO 结果。T8 不选择 AVG/FIFO，也不计算费用、毛收益或净收益；这些守恒规则由 T9 在同一投影结构上补齐。

### 收益与费用

- `grossRealizedPnl`：卖出价与不含费用买入价格之间的价差。
- `netRealizedPnl`：毛收益减本次分配的买入费用、卖出费用和税费。
- `realizedNetReturnRate`：净收益除以本次已卖出数量对应的买入成本和买入费用。
- 基线成本口径未知时相关结果标记 `ESTIMATED`，不冒充完整真实成交结果。
- 中间计算保持数据库精度；每个 Trade 完全平仓时，最后 Close Slice 承接剩余舍入尾差。
- T9 在原币边界拒绝跨币种相加：费用明细继续按原始币种保存，非成交币种费用标记 `FEE_CURRENCY_MISMATCH`；买入来源与卖出币种不一致时标记 `TRADE_CURRENCY_MISMATCH`，原币收益结果不可用，留待 FX Conversion View 处理。

### 证据模型

证据拆为三个维度：

- `evidenceSources`：实际成交、Baseline、公司行动、观察等来源集合。
- `completeness`：`COMPLETE | PARTIAL | CONFLICTED`。
- `issues`：缺少开仓边界、成本口径未知、未知平仓、汇率缺失、数量冲突等稳定错误码。

Baseline 尚未完整解释时 `openedAt` 为空，另存 `earliestEvidenceAt`。余额观察为 0 时 Trade 可以 ENDED，但没有真实 `closedAt`、退出价格和价差收益。

### 原币、Cash 与 FX

- 核心 Trade 只保存原币金额。
- Cash 按账户和币种分别物化，包含已结算余额和待结算应收/应付。
- T10 首阶段在账本写入事务内，以账户下一代 `Projection Generation` 原子替换 Position、Trade 及其子表、Cash 余额和待结算明细；Position 的数量与成本由当前 ACTIVE Trade 的剩余来源汇总得到。
- V2 事件带有未来 `settledAt` 时，在该时点前进入待结算应收/应付；没有 `settledAt` 的现金变动按已结算处理。待结算状态随下一次投影重建重新计算，不在本阶段引入独立结算事实。
- Account.currency 是账户本位币。
- FX Conversion View 按每笔现金流经济发生日汇率折算，保存汇率来源、版本和完整度。
- 汇率缺失不阻止核心投影，本位币结果标记不可用或部分可用。

### Projection Generation、指纹与稳定引用

- 每个账户维护 Trade Projection Generation；任何 Trade 输入变化时增加。
- Trade ID 基于账户、symbol、周期起点 factId 和算法主版本确定性生成。
- 输入指纹包含有效 fact payload、成本策略 Revision 和核心算法版本；折算指纹另含 FX 证据版本。
- Journal 长期引用保存账本事实集合、Ledger Revision、Projection Version 和指纹，不把 Trade ID 当永久身份。
- 旧 ID 无效时按引用事实寻找当前唯一 Trade；歧义时不自动映射。

### 统计资格

默认完整交易统计只纳入：

- 生命周期为 ENDED。
- 结束证据为真实 SELL。
- 成本足以计算已实现净收益。
- 账户模式与当前统计模式一致。

其他 Trade 可以受限复盘，但返回 `excludedReasons`。Close Slice 的退出执行统计与完整 Trade 胜率分开。

## 对外行为或接口变化

- 新增 Trade 列表、详情、Close Slice、Close Allocation 和证据接口。
- 列表游标携带账户 Projection Generation；Generation 变化时返回刷新错误。
- 全部账户列表只并列查询各账户 Trade，不跨账户重组周期。
- 公共金额、数量和比率使用十进制字符串。

## 数据、状态或兼容性影响

- 新增可重建 Trade 物化表及索引。
- 现有 Position 与 Journal 投影在影子阶段继续保留用于比较。
- 现有账户创建移动加权平均成本法初始 Revision。
- 切换完成后删除 Journal 中旧交易拼装路径。

## 风险与备选方案

- 查询时临时重建无法稳定分页，因此第一阶段直接使用物化读取模型。
- Trade ID 会受历史补录影响，通过账本证据和指纹处理，不引入独立 Trade 身份事实表。
- 基线估算可能污染正式统计，因此使用资格规则默认排除。

## 未决问题

无。

## 验收标准

1. 分批买入、部分卖出、再次加仓和重新开仓划分确定。
2. Position 数量与 ACTIVE Trade 剩余数量始终一致。
3. 移动平均与先进先出 Close Allocation 可追溯且守恒。
4. 公司行动后数量和单位成本正确，且不制造交易收益。
5. 毛收益、净收益、分红收入和本位币折算互不混淆。
6. 基线与未知平仓正确表达证据不足。
7. 实际/影子、账户和币种不混算。
8. 相同输入和版本重复构建得到相同投影及指纹。
9. 旧 Trade 引用只有唯一事实匹配时才重定向。
10. 默认统计排除观察结束和成本不足的 Trade。
