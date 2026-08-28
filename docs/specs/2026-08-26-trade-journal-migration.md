# Trade 与 Journal 统一及迁移子 Spec

上位 Spec：[`2026-08-26-trade-execution-ledger-system.md`](2026-08-26-trade-execution-ledger-system.md)

依赖：[`Trade Projection 与收益读取模型`](2026-08-26-trade-projection-read-model.md)、[`交易与成交记录产品界面`](2026-08-26-trade-product-experience.md)

## 背景与问题

当前 Journal 使用独立的 Ledger→CompletedTrade 投影，并按每次 SELL 生成候选。新 Trade Projection 将完整周期与 Close Slice 分层，如果直接替换会改变候选 ID、交易次数、胜率和既有 Journal 关联。

## 目标

- 让 Journal 只消费统一 Trade Projection。
- 同时支持减仓复盘和完整交易周期复盘。
- 保留旧复盘快照并识别相关投影是否过期。
- 确定性迁移既有按 SELL 生成的候选，歧义项不自动猜测。

## 非目标

- 自动修改用户旧复盘正文或 AI 输出。
- 将 Close Slice 混入完整 Trade 胜率。
- 按相同标的和相近日期猜测 TradePlan 关联。
- 长期保留旧 Journal 交易拼装实现。

## 现状与约束

- 现有候选包含 entry/exit LedgerEvent IDs，可用于按退出 SELL 映射。
- JournalEntry、TradePlan 和 AI Review 是持久化用户成果，不能随投影重建静默改写。
- AI 只能解释确定性事实，不得创建交易或改变对账。

## 设计方案

### 两级复盘对象

- `TRADE_CYCLE`：完整 Trade 周期。默认周期统计、胜率、盈亏比和持有周期使用此对象。
- `CLOSE_SLICE`：一次 SELL 形成的减仓行为。用于退出价格、减仓规模、成本分配和执行偏差复盘；退出价格必须直接来自对应 SELL 事实。

Trade 生命周期未结束时可以复盘已有 Close Slice；只有符合统计资格的完整 Trade 才进入默认完整交易统计。

余额观察结束或基线证据不完整的 Trade 可以受限复盘：只展示有证据支持的事实，依赖真实开仓、平仓或完整成本的指标返回证据不足。

### TradePlan 关联

- TradePlan 默认关联完整 Trade，而非某个 Close Slice。
- 长期引用保存明确账本事实集合和当时 Trade Projection 指纹，不仅保存 Trade ID。
- Close Slice 继承所属 TradePlan，用于比较本次退出与整轮计划。
- 没有显式关联时不得按 symbol 和日期自动猜测计划。

### Journal/AI 快照与过期判断

每次确定性复盘和 AI Review 保存：

- `reviewObjectType` 和对象当前 ID。
- 相关 `factId/eventId` 集合。
- 账户 Ledger Revision。
- Trade Projection Version、Projection Fingerprint。
- FX Evidence Version 与折算指纹。
- 当时确定性输入与输出快照。

只有相关输入指纹变化时标记 `STALE`；账户内无关资产成交不使结果过期。旧结果保留可读，不自动覆盖。

### 旧候选迁移

- 以旧候选的 SELL LedgerEvent ID 查找新 Close Slice。
- 唯一匹配：迁移为 CLOSE_SLICE 引用，保留旧候选 ID 作为 legacy reference。
- 无匹配或多匹配：保留旧快照，标记 `LEGACY_REVIEW_NEEDS_CONFIRMATION`。
- 不把多个旧 SELL 候选自动合并到一个完整 Trade Review。
- 用户可从 legacy 详情查看当前证据解析结果并显式确认新关联。

### 周期统计

- 交易次数、胜率、盈亏比和完整持有周期只使用符合资格的 TRADE_CYCLE。
- Close Slice 提供减仓次数、减仓胜率、退出价格偏差和成本分配等独立指标。
- 实际账户与影子账户、不同账户、不同本位币口径默认不混算。
- 本位币统计要求 FX Conversion View 完整；不完整时保留原币分组结果并说明缺失。

### 切换流程

1. 新 Trade Projection 影子运行，旧 Journal 继续服务。
2. 生成旧候选→Close Slice 映射报告和周期统计差异报告。
3. 迁移缺陷、算法缺陷清零，歧义项全部进入 legacy 明细。
4. Journal 查询切换到新 Trade/Close Slice API。
5. 新写入只保存统一引用和快照。
6. 删除旧 `projectCompletedTrades` 消费路径及重复测试 fixture。

## 对外行为或接口变化

- Journal Candidate 增加 `reviewObjectType`、证据引用、投影指纹、统计资格和排除原因。
- 单笔复盘入口可接收 Trade 或 Close Slice，但必须明确对象类型。
- 周期 API 默认使用完整 Trade；减仓统计使用独立字段组。
- 旧复盘详情返回 legacy 状态和当前证据解析结果。

## 数据、状态或兼容性影响

- 现有 Journal/AI 结果保留，不因投影切换重算或删除。
- 唯一 SELL 映射新增 Close Slice 引用；歧义记录等待人工确认。
- 切换完成后删除旧交易候选投影代码，不提供兼容重导出。

## 风险与备选方案

- 新旧交易粒度不同会改变统计数字；界面必须分别展示完整交易和减仓执行口径。
- 历史补录会使旧复盘过期；保留旧快照并仅在唯一证据匹配时重定向。
- 影子差异可能来自旧算法缺陷或新口径变化；必须分类，不以数值相同作为唯一切换条件。

## 未决问题

无。

## 验收标准

1. Journal 不再直接从 Ledger 拼装交易。
2. Trade Cycle 与 Close Slice 复盘对象明确且不可混淆。
3. 默认周期统计只使用符合资格的完整 Trade。
4. Close Slice 统计独立，不放大完整交易次数。
5. TradePlan 只通过显式证据关联，Close Slice 正确继承。
6. 相关指纹变化才使旧结果过期。
7. 旧候选按 SELL ID 唯一映射，歧义项不自动猜测。
8. AI 失败或旧结果过期不清空确定性快照。
9. 影子差异完成分类后才能切换 Journal。
10. 切换完成后旧投影路径被删除。
