# 投资复盘工作台（统一 Trade Projection）Spec

## 背景与问题

投资复盘最初以 `CompletedTrade` JSON 和 Ledger→候选的临时拼装为基础。现在系统已经具备统一的 Trade Projection：LedgerEvent 是唯一经济事实源，Position、Trade 和 Cash 是可重建读取模型，Trade 还包含 Entry Leg、Baseline Component、Close Slice、公司行动、分红归属和证据指纹。

原投资复盘任务中的产品目标仍然成立，但其中“Journal 直接从 Ledger 组装已平仓交易”和“每次 SELL 就是一笔完整交易”的前提已经失效。新的复盘工作台必须消费统一 Trade Projection，并明确完整交易周期与单次减仓行为的差异。

## 目标

- 让 Journal 只消费统一 Trade Projection，不重复实现交易生命周期、成本分配或基线对账。
- 同时支持完整 Trade 周期复盘和单次 Close Slice 减仓复盘。
- 在默认页面提供账户、模式、交易筛选、事实核对和中文确定性结果，不要求用户输入 JSON。
- 清晰表达真实成交、Baseline、计划、Journal 和投影版本的证据来源。
- 周期统计只使用符合资格的完整 Trade；Close Slice 统计独立，不放大交易次数和胜率。
- 让确定性结果、AI 解读和复盘快照彼此解耦，并保留可审计的对象级证据指纹。
- 对数值精度、未知开仓时间、时间窗口和统计资格建立统一可执行契约，避免 Desktop/Server 各自推断。

## 非目标

- 本 Spec 不重新实现成交录入、账本修正、Baseline 对账或 Trade Projection；这些由交易系统及其子 Spec 负责。
- 不实现订单、撤单、券商同步、CSV 导入、做空、期权、期货或 Trade 人工合并/拆分。
- 不把 Position 直接当作 Trade，也不把当前持仓观察伪造成买入成交。
- 不按相同标的、相近日期或相似价格自动猜测 TradePlan 关联。
- 不自动修改 LedgerEvent、TradePlan、JournalEntry、AI 输出或用户复盘正文。
- AI 不创建交易事实、Baseline 对账建议或买卖信号。
- 高级 JSON 不作为新的正式复盘对象类型，不进入正式候选、周期统计或正式 Review Snapshot。

## 现状与约束

- LedgerEvent 是唯一经济事实源；Trade Projection、Position 和 Cash 必须基于同一账户当前有效事件集合重建。
- Trade 以 `accountId + accountMode + Asset.symbol` 隔离，生命周期为 `ACTIVE | ENDED`，退出进度为 `NONE | PARTIAL | FULL`。
- `TRADE_CYCLE` 表示数量从零变为正数再回到零或由余额观察结束的一段生命周期；`CLOSE_SLICE` 表示一次有效 SELL 及其成本分配结果。
- `SELL_EXECUTION`、`BALANCE_OBSERVATION` 和 `UNKNOWN` 是不同的结束证据。余额观察结束不等于真实卖出。
- Trade 的数量、价格、成本、费用和收益使用十进制字符串；新的 Journal 确定性分析主链路必须使用十进制字符串 DTO，旧 `CompletedTrade<number>` 仅作为 legacy adapter 保留。
- Baseline Observation 不是成交事实。来源时间或开仓边界未知时，必须保留未知状态，不得把服务端记录时间、`earliestEvidenceAt` 或其他观测时间冒充真实入场时间。
- TradePlan 默认关联完整 Trade，Close Slice 继承所属 TradePlan；关联必须来自显式 `tradeId` 或明确事件证据。
- 投影整体代数由 `projectionGeneration` 和 `projectionFingerprint` 标识；单个复盘对象另有 `evidenceFingerprint`，用于判断与该对象相关的事实是否变化。
- 实际账户和影子账户共享算法但不共享事实、查询、缓存、统计或复盘上下文。
- Desktop 请求读取使用 TanStack Query，确定性分析和 AI 解读使用独立 mutation，界面优先复用现有 shadcn 组件和原子类。

## 领域对象与复盘粒度

### 成交事实、交易周期和持仓

- 成交事实是已经确认发生的一次 BUY/SELL，属于 Ledger 的不可变事实。
- Trade 是多个成交和公司行动组成的持有生命周期，是只读投影。
- Position 只表达账户当前资产数量和成本状态，不提供历史开仓或退出语义。

### 两级复盘对象

| 对象 | 复盘用途 | 统计资格 |
| --- | --- | --- |
| `TRADE_CYCLE` | 完整交易的计划偏差、持有周期、完整盈亏和周期行为 | 按统一统计资格规则判断；默认周期统计只使用 `statisticsEligible=true` 的对象 |
| `CLOSE_SLICE` | 一次减仓的退出价格、数量、成本分配、费用和执行行为 | 独立统计，不计入完整 Trade 的交易次数、胜率或完整持有周期 |

ACTIVE Trade 可以复盘已经发生的 Close Slice，但不能伪造完整退出结果。Baseline 或未知结束证据的 Trade 只能展示有证据支持的事实，依赖真实开仓、退出或完整成本的指标显示“证据不足”。

### 稳定对象标识

复盘对象 ID 必须由 Server/domain 统一生成，Desktop 不得自行拼接或推断：

```text
TRADE_CYCLE:<tradeId>
CLOSE_SLICE:<closeSliceId>
```

候选、确定性分析、快照、AI 输入和深链跳转均使用同一个 `reviewObjectId`。

## 已确认的数据契约

### 数值精度

新的确定性分析 DTO 使用十进制字符串作为权威数值格式，不再让 Trade Projection → Journal 主链路依赖 JavaScript `number`。

必须满足：

- Trade Projection 中的数量、价格、成本、费用、收益和 FX 相关金额原样以 decimal string 进入 Journal domain。
- 算法层显式定义 decimal 运算、舍入位数和展示位数；展示层四舍五入不得反向改变事实。
- 旧 `CompletedTrade<number>` 仅保留在 legacy adapter 或兼容测试中，不得作为新候选和新快照的主契约。
- 无法安全适配旧快照或旧 JSON 时返回明确兼容状态，不伪造 `0`、`NaN` 或近似事实。
- 快照保存原始 decimal string 输入和确定性输出，不依赖前端格式化后的字符串回写。

### 未知 `openedAt`

`TRADE_CYCLE.openedAt` 允许为空。

当 `openedAt=null` 时：

- Trade Cycle 仍然可以作为正式复盘对象存在。
- 不依赖开仓时间的事实与指标仍可展示或计算。
- 持有天数、开仓时机偏差等依赖真实入场边界的指标返回“证据不足”。
- 不允许使用 `earliestEvidenceAt`、Baseline 记录时间或服务端创建时间替代真实 `openedAt`。
- 是否进入某项统计由统一统计资格规则决定；未知 `openedAt` 不等于整笔交易所有指标都无效。

### 对象级证据指纹与快照过期

候选与快照同时保留：

```ts
projection: {
  ledgerRevision: string;
  projectionGeneration: string;
  projectionFingerprint: string;
  evidenceFingerprint: string;
}
```

语义：

- `projectionGeneration`：用于分页、缓存和同一查询批次的一致性判断。
- `projectionFingerprint`：表示账户/模式下整体 Trade Projection 状态。
- `evidenceFingerprint`：仅覆盖当前 `reviewObjectId` 实际依赖的 LedgerEvent、Trade/Close Slice、公司行动、成本分配、FX 证据及显式计划关联。

快照是否进入 `STALE` 主要比较 `reviewObjectId + evidenceFingerprint`。无关标的、无关 Trade 或不参与当前对象计算的事实变化，不得仅因账户级 `projectionFingerprint` 变化而把快照标记为过期。

### 时间窗口

周期查询统一使用半开区间：

```text
[start, end)
```

筛选口径：

- `TRADE_CYCLE`：按 `effectiveClosedAt` 落入窗口；只有真实 SELL 结束时可进入默认完整周期统计。
- `CLOSE_SLICE`：按该 Slice 的 `executedAt` 落入窗口。
- ACTIVE Trade 本身不按“当前时间”伪造完成时间，但其中已发生的 Close Slice 可按 Slice 时间进入窗口。
- `BALANCE_OBSERVATION` 或未知结束证据可以出现在样本说明中，但不得作为真实 SELL 完整交易进入默认周期统计。

API 的 `start`、`end` 使用带时区的 ISO 8601 时间；Server 负责统一比较，Desktop 不自行按本地日期重新解释边界。

### 统计资格

`statisticsEligibility` 必须由 domain/server 统一判断，Desktop 只展示结果，不重新实现资格逻辑。

候选至少提供：

```ts
statisticsEligibility: {
  eligible: boolean;
  reasons: StatisticsExclusionReason[];
}
```

`StatisticsExclusionReason` 至少包含：

```text
ACTIVE_TRADE
NON_SELL_ENDING
UNKNOWN_OPENED_AT
ESTIMATED_COST
COST_CONFLICT
FX_MISSING
EVIDENCE_INCOMPLETE
STALE_PROJECTION
LEGACY_UNCONFIRMED
```

规则：

- 默认完整周期交易次数、胜率和完整周期行为只统计 `TRADE_CYCLE` 且 `eligible=true` 的对象。
- Close Slice 使用独立统计口径。
- 某些 exclusion reason 只影响依赖该事实的指标，不要求所有指标都隐藏；结果层必须保留“可计算指标”和“证据不足指标”的区分。
- Desktop 不得通过是否显示某个字段来反推统计资格。

## 设计方案

### 候选读取模型

Journal 候选由 Trade Projection 详情、显式 TradePlan、Journal 证据和复盘快照编排得到，至少包含：

- `id`、`reviewObjectId`、`reviewObjectType`、`tradeId`、可选 `closeSliceId`；
- `accountId`、`accountMode`、`symbol`、生命周期和复盘状态；
- 实际入场/退出事实、数量、退出价格、已实现收益和成本估算状态；
- `evidenceCompleteness`、`missingEvidence`、`statisticsEligibility`；
- 计划事实及 `planId`，仅在显式关联存在时提供；
- `projection`，包含 Ledger Revision、Projection Generation、Projection Fingerprint、Evidence Fingerprint、事实 ID、事件 ID 和 FX 证据版本；
- `sources`，包含 Entry/Exit 事件、JournalEntry 和 TradePlan 的来源引用。

候选列表必须能表达 `CURRENT`、`STALE` 和 `LEGACY_REVIEW_NEEDS_CONFIRMATION`。旧 Journal 候选以 SELL 事实 ID 唯一映射到 Close Slice；无匹配或多匹配时保留旧快照并要求人工确认。

### 高级 JSON 兼容边界

现有“高级 JSON”仅作为开发、调试和历史兼容入口保留：

- 不进入正式 `review-candidates`。
- 不创建 `TRADE_CYCLE`、`CLOSE_SLICE` 或第三种正式 ReviewObject。
- 不进入默认周期统计。
- 不保存为正式 Review Snapshot。
- 不写入 Ledger、TradePlan 或 JournalEntry。
- 如后续需要支持“外部交易复盘”，必须另立 Spec，不在本任务隐式扩展。

### 单笔复盘

1. 用户选择账户和实际/影子模式。
2. 页面查询候选，默认同时显示可复盘的完整 Trade 和 Close Slice，并标明对象类型。
3. 用户选择对象后核对实际事实、计划事实、Baseline 和证据完整度。
4. 用户可在 Sheet 中补充仅本次分析使用的字段；不得回写 TradePlan 或 JournalEntry。
5. “开始复盘”只触发计划与实际、行为指标和反事实等确定性分析。
6. 确定性结果成功后，用户可单独触发 AI 解读。
7. 用户显式保存复盘快照时，系统保存输入、输出、事实集合、对象级证据指纹、投影版本和 FX 证据；保存快照不写入 Ledger 或用户 JournalEntry。

### 周期复盘

- 提供最近 7 天、最近 30 天和自定义窗口，查询请求显式携带 `start`、`end`、账户、模式和分页信息。
- 时间边界严格遵循 `[start, end)`。
- 默认周期指标只使用 `statisticsEligibility.eligible=true` 的 `TRADE_CYCLE`。
- Close Slice 以独立指标展示减仓次数、退出价格偏差和减仓行为，不混入完整周期胜率。
- 余额观察结束、基线估算、成本冲突、FX 缺失、未知时间或投影过期对象保留在样本说明中，但不被静默计入不符合资格的统计。
- 点击重点交易可以进入对应账户、模式和 `reviewObjectId` 的单笔上下文。

### 结果与 AI

- 结果必须并列展示计划值、实际值、偏差、证据来源和口径。
- 行为结果使用“发现偏差”“未发现偏差”“证据不足”三态；内部枚举不得直接作为主标签。
- 反事实同时展示实际值、假设值、差额和常驻假设；不可计算时说明缺少事实。
- AI 输入只包含确定性 Trade/Close Slice 事实、来源引用和确定性结果，显示 Provider、模型、Prompt 版本和任务编号。
- AI 加载或失败不得清空确定性结果；快照过期也不得覆盖旧结果。
- AI 不负责判断 Trade 生命周期、统计资格、成本分配或快照是否过期。

### 状态与异常

- 无账户、无 Trade、无可复盘对象、候选读取失败、确定性分析失败、证据不足、AI 失败和快照过期分别反馈。
- 投影世代变化使游标失效时要求刷新，不静默拼接旧页和新页。
- 切换账户或实际/影子模式时清除不属于新上下文的候选、证据草稿和分析结果。
- 仅有当前 Position 或 Baseline 时显示“历史证据不足”，不生成虚构成交。
- legacy 对象未确认前不得进入正式统计或覆盖既有历史快照。

## 对外行为或接口变化

### 候选

```text
GET /journal/review-candidates
```

接收：

- `accountId`
- `mode`（语义为账户模式）
- 可选 `symbol`
- `start`
- `end`
- `cursor`
- `limit`

返回 Trade Cycle、Close Slice、legacy、统计资格和投影/证据指纹状态。

### 快照

```text
POST /journal/review-snapshots
GET /journal/review-snapshots
GET /journal/review-snapshots/:id
```

约束：

- POST 只保存用户显式提交的正式复盘快照。
- 快照必须引用 `reviewObjectType`、`reviewObjectId`、当前事实集合、`evidenceFingerprint`、投影版本和 FX 证据。
- 列表查询支持按账户、模式、`reviewObjectId` 和时间筛选。
- 详情接口返回历史输入、确定性结果、AI 元数据、保存时证据与当前过期状态。
- 快照读取不得触发重算、Ledger 写入或自动覆盖。

### 其他

- 单笔复盘入口必须携带 `reviewObjectType + reviewObjectId`；周期复盘默认使用完整 Trade。
- Trade 列表和详情保持只读；更正成交跳转到账户数据的事实入口。
- Desktop/Server 对统计资格、对象 ID、时间边界和 STALE 判断使用同一 domain/schema 契约。

## 数据、状态或兼容性影响

- Journal 不再维护 Ledger→CompletedTrade 的独立交易拼装路径。
- 旧按 SELL 生成的候选不自动合并为完整 Trade；唯一映射为 Close Slice，歧义进入 legacy。
- 复盘快照保留旧输入/输出和事实引用；相关 `evidenceFingerprint` 变化只标记相关快照过期，不静默重算用户成果。
- 旧 `CompletedTrade<number>` 和高级 JSON 仅保留历史兼容能力，不作为新主链路。
- 交易录入、持仓校准和现金观察由账户数据产品负责；Journal 只消费其已确认结果。

## 测试策略

### 关键可观察行为

- Trade Cycle 与 Close Slice 粒度、生命周期、稳定 ID、统计资格和来源引用正确。
- ACTIVE、BALANCE_OBSERVATION、Baseline 估算、成本冲突、FX 缺失和未知时间不会被伪装成完整交易。
- 显式 TradePlan、旧候选唯一映射和歧义 legacy 行为稳定。
- decimal string 分析、舍入边界和 legacy number 适配可重复验证。
- `openedAt=null` 不会被其他时间替代，且只影响依赖真实开仓时间的指标。
- `[start, end)`、`effectiveClosedAt` 和 Close Slice `executedAt` 的窗口行为一致。
- 无关标的事实变化不会使当前对象快照 STALE；相关证据变化会更新 `evidenceFingerprint` 并正确标记。
- 账户/模式切换、投影世代、快照过期和分页刷新不泄漏旧上下文。
- 确定性结果与 AI 任务独立，AI 失败不影响确定性结果。
- 高级 JSON 不进入正式候选、统计或 Snapshot。

### 优先测试层级

1. domain/schema：对象类型、稳定 ID、资格规则、decimal、未知时间、窗口和 evidenceFingerprint。
2. server：TradeQueryService 编排、计划关联、legacy、快照读取/保存、分页和只读边界。
3. Desktop：Query/mutation、状态矩阵、键盘与 Sheet 交互、账户/模式切换。
4. 本地运行态：API 响应、Compose 健康、浏览器视觉和响应式布局；与离线测试分开记录。

## 风险与备选方案

- decimal DTO 会扩大部分 Journal domain/schema 和旧快照适配范围，但可避免新主链路继续积累 JavaScript `number` 精度债务。
- Trade Cycle 与 Close Slice 的统计粒度不同，旧报告数字不可直接与新报告比较，必须显示口径和迁移状态。
- 历史 Baseline 缺少真实开仓边界，过度追求完整持有天数会制造伪精度；默认优先证据完整性。
- 若 `evidenceFingerprint` 计算范围过宽，会产生不必要的 STALE；若范围过窄，则可能漏掉真正影响结果的事实，因此必须通过对象级依赖测试固定算法。
- 物化投影重建或事实修正可能改变 `projectionFingerprint`；只有与当前对象相关的 `evidenceFingerprint` 变化才应直接导致快照过期。

## 已确认决策

1. 新 Journal 确定性分析主链路迁移到 decimal string DTO；旧 `CompletedTrade<number>` 只作为 legacy adapter。
2. `Trade.openedAt` 允许为空；保留 Trade Cycle，对依赖真实开仓边界的指标返回证据不足，不使用其他时间补齐。
3. Snapshot STALE 使用对象级 `evidenceFingerprint` 判断，账户级投影变化不自动使无关对象过期。
4. 高级 JSON 仅保留开发/调试/历史兼容能力，不属于正式 ReviewObject。
5. 周期查询统一使用 `[start, end)`；Trade Cycle 按 `effectiveClosedAt`，Close Slice 按 `executedAt`。
6. `statisticsEligibility` 由 domain/server 统一计算，Desktop 不自行推断。
7. 正式 Snapshot 必须支持保存、列表和详情读取。

## 验收标准

- AC1：Journal 候选和详情只消费统一 Trade Projection，不再从 Ledger 独立拼装交易生命周期。
- AC2：页面和 API 明确区分 `TRADE_CYCLE` 与 `CLOSE_SLICE`，两者的统计资格和复盘用途不混淆。
- AC3：ACTIVE、Baseline、余额观察结束、成本估算、未知时间和证据冲突均保留明确状态，不生成虚构成交或完整收益。
- AC4：候选查询按账户、模式、标的、`[start,end)`、游标和投影世代隔离，旧游标不会静默复用。
- AC5：TradePlan、Journal 和旧候选只通过显式事实关联；唯一 SELL 映射到 Close Slice，歧义进入 legacy 确认。
- AC6：Trade 的 decimal string 事实进入新的 Journal 分析 DTO；舍入、legacy number 适配和不可安全转换行为有明确契约并通过测试。
- AC7：`openedAt` 可为空，系统不使用观测时间伪造开仓时间；仅依赖真实开仓边界的指标降级为证据不足。
- AC8：默认单笔复盘不展示大段 JSON；用户可以核对实际/计划/Baseline 证据，补充字段只影响本次分析。
- AC9：周期统计只使用符合资格的完整 Trade，Close Slice 指标独立，窗口边界显式可追溯。
- AC10：`statisticsEligibility` 由 domain/server 输出明确 reasons，Desktop 不重复计算资格。
- AC11：确定性结果以中文展示计划偏差、行为三态、反事实假设和证据不足；不可计算时不伪造数值。
- AC12：复盘快照显式保存事实集合、投影版本和 `evidenceFingerprint`；只有相关证据变化标记 `STALE`，无关事实变化不影响当前快照。
- AC13：正式 Snapshot 支持显式保存、按对象查询历史和查看详情；读取历史快照不自动重算或覆盖。
- AC14：AI 只能在确定性结果成功后显式触发，失败、过期或 Provider 不可用不清空确定性结果。
- AC15：无账户、无对象、读取失败、分析失败、证据不足、legacy 和 AI 失败分别反馈；离线测试、浏览器验收和真实 Provider 验收分开记录。
- AC16：高级 JSON 不进入正式候选、周期统计或正式 Snapshot，不形成第三种 ReviewObject。

## 实施门槛

上述关键契约已确认，可开始实施。

实施时必须先完成 T1 的 schema/domain 契约冻结，再进入候选编排、分析适配和 UI；不得在 Desktop 或 Server 局部实现中重新选择数值、时间、统计资格或 STALE 语义。
