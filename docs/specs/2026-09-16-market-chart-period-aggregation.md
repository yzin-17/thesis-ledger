# 行情图表周期聚合 Spec（5 日 / 周 / 月 / 年）

> 任务标识：market-chart-period-aggregation
> 日期：2026-09-16
> 状态：T1～T6、G1、P1、R1 全部完成，AC1–AC11 已验收。本文保留为现行产品契约，分钟线属于延期项，统一见 [`../TODO.md`](../TODO.md)。
> 对应任务：[已完成的行情图表周期聚合实施任务](../archive/tasks/2026-09-16-market-chart-period-aggregation.md)
> 历史评审修订：2026-09-16 补充显式评估时刻及周期结束判定；最终验证与证据边界见[R1 Review](../tasks/evidence/2026-10-06-market-period-r1-final-review.md)。

## 背景与问题

立项时 `MarketDetailCharts` 只有日线一种周期：区间组是「全部已加载 / 1月 / 3月 / 6月 / 1年」，图形组只切换 K 线/收盘线，工具栏没有周期选择。用户需要的「5 日线、周线、月线、年线」这一类频率切换当时无法表达。

这不是漏做的功能，而是被显式排除的：`docs/specs/2026-09-10-market-chart-indicator-integration.md:22` 写明「未实现的周线、月线和分钟线不显示为可用选项」，T5 完成条件也是「范围仅展示实际 1d 覆盖」。当时排除的理由是数据源与契约只声明日线。现在需要把「能不能做」变成「按什么口径做」：日线事实已经足够，周/月/年线是从日线确定性派生的聚合序列，缺的是契约、口径与预热语义，而不是新 Provider。

## 目标

- 让证券行情图表支持 `5d / 1w / 1mo / 1y` 四种派生周期，与既有「区间」正交：区间决定看多长，周期决定每根 bar 覆盖多久。
- 派生周期由 Server/Domain 按交易日历确定性聚合日线事实，不新增 Provider、不新增行情数据源，不在 Desktop 重算。
- 派生结果必须可辨认：provenance 标 `derived`、provider 记为 Server、带聚合规则版本，不得伪装成 Provider 原生周期。
- 指标（MA/MACD/RSI）继续由 DSA 在「所选周期的序列」上计算，不在主仓重写公式；预热不足按周期声明，不补零、不用最近值。
- 契约向后兼容：默认仍是 `1d`，不传 `timeframe` 的旧调用行为不变。
- 周期偏好按标的全局复用，覆盖不足时按真实声明裁剪并解释，不显示不可用周期。
- 分钟线不在本 Spec 实施范围；已明确的后续能力与前置条件统一由 [`../TODO.md`](../TODO.md) 的 `market-chart-minute-period` 管理。

## 非目标

- 不实现分钟线、tick 或盘中任意周期；后续范围统一见 [`../TODO.md`](../TODO.md)。
- 不新增 Provider、不改变 RouteTarget V2 主备语义、不改变 `1d` 事实的采集与复核窗口。
- 不为派生周期新增 PostgreSQL 事实表或 migration：派生序列是可重算的视图，不是来源事实。
- 不在 Desktop、不在 API Client 做聚合或指标计算，不引入第二套公式。
- 不改变交易标记、成本线、风险线、区间测量等既有非目标。
- 不修复分页锚点既有缺陷（`/detail` 未接收 `calculationAnchor`、`loadEarlier` 传序列末尾日期）；该独立后续项已迁入 [`../TODO.md`](../TODO.md) 的 `market-detail-pagination-anchor`。

## 现状与约束

### 主仓已确认事实

以下行号对应立项基线 `b69077e`，后续定位以符号为准。

- 周期枚举只有日线与分钟：`packages/schemas/src/market.ts:79/134/160`（bar、indicator、inputProvenance）与 `packages/schemas/src/market-bar-series-v2.ts:8`（`BarSeriesIdentityV2`）均为 `z.enum(['1m', '1d'])`。
- 详情端点写死日线：`apps/server/src/market/market-v2.controller.ts:232-243` 的 `detail()` 没有 `timeframe` 查询参数，`:286` 直接传 `timeframe: '1d'`；独立 bars/indicator 路由才有 `query.timeframe ?? '1d'`（`:145`）。
- Reader 只按日线能力取路由：`apps/server/src/market/market-bar-reader.ts:345` 读 `effective.routeStatus.DAILY_BAR`，读方与 capability 都不含周期维度。
- 服务端详情能力矩阵把 bars 与指标绑定在 `DAILY_BAR`：`apps/server/src/market/market-detail.service.ts:64-67`。
- 指标端点已是「给定 points 的纯计算」：`packages/schemas/src/market-bar-series-v2.ts:111-137` 的 `indicatorCalculateRequestV2Schema` 只要求 `identity + inputFingerprint + points + requests`，`market-v2.controller.ts:172-198` 的 `calculate()` 直接消费 Reader 返回的序列。因此聚合后的周期序列可以直接交给 DSA 计算。
- 指标缓存键已含输入口径：`market-v2.controller.ts:177` 为 `${series.inputFingerprint}:${engineVersion}:${requests}`，而 fingerprint 由 `identity + points` 决定，周期不同即天然隔离。
- 事实身份含 timeframe：`docs/specs/2026-09-16-market-bar-series-cache-v2.md:15` 规定事实唯一身份为 `symbol + timeframe + timestamp + adjustment + providerId + upstreamSource`，且该 Spec 明确 PostgreSQL 只保存来源事实、Redis 保存可丢弃视图。
- 主仓已有派生周期先例与命名法：`apps/server/src/market/backtest-bar-aggregation.service.ts:20-46` 用 `kind: 'derived'`、`provider: 'thesis-ledger-server'`、`providerRevision: 'server-aggregation-v2'`、reason「由 Server 从冻结 1m Bar 按市场 Session 确定性派生」，且「calendar fact 不可用时派生能力降级为 unavailable」；schema 侧 `packages/schemas/src/backtest-data.ts:10` 有 `dataTimeframeKindSchema = z.enum(['base','derived'])`。
- 窗口与预热约束：本节保留立项基线记录，现行参数以 T1.3/T3 冻结合同和下文「对外行为或接口变化」为准。`limits.bars` 表示本次请求条数，90 是 Desktop 常用窗口，不是现行详情硬上限；派生基础事实与指标计算各自使用 3650 点预算，不能把两层预算合并。
- 图表侧的指纹与分页语义已冻结：`2026-09-10` Spec AC4 要求按「共同日期的逐日 inputFingerprint」判断可比；Desktop 已按「页 = 一次详情响应」的粒度构建 ChartPoint 并按日期合并（`market-chart-model.ts` 的 `mergeChartPoints`、`market-chart-types.ts` 的 `chartPageFromResponse`）。周期切换必须沿用这套页内可比语义。
- 场外基金不参与证券周期：`market-detail.service.ts:56-58` 的 `FUND_CAPABILITIES` 只有 NAV，且净值日期不是交易日。

## 设计方案

### 周期定义与桶边界

周期标识使用 `5d | 1w | 1mo | 1y`，全部基于 `1d` 事实派生。周/月/年桶边界不随请求窗口变化，`5d` 使用显式窗口锚点：

| 周期  | 桶边界                                                                                       | 桶内取值                                                                          |
| ----- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `5d`  | 以可视区间末根 bar 所在交易日为锚，向前每 5 个交易日一桶                                     | open=首日 open，high=桶内最高，low=桶内最低，close=末日 close，volume/amount=求和 |
| `1w`  | 以 `Asia/Shanghai` 周一为起点，与 `2026-09-07-portfolio-valuation-series.md:84` 的周口径一致 | 同上                                                                              |
| `1mo` | `Asia/Shanghai` 自然月                                                                       | 同上                                                                              |
| `1y`  | `Asia/Shanghai` 自然年                                                                       | 同上                                                                              |

规则：

1. 桶内缺少交易日的日期不参与数值计算，不把停牌日补成零；桶内完全无有效日线时该桶不产生 bar，日期轴保留缺口。没有日线不等于已有停牌证据，完成状态另按下节判定。
2. 派生 bar 的 `completionStatus` 同时检查周期结束与覆盖完整性，不能仅取已收到日线的最弱状态。`availableAt` 保留实际来源及必要完成证据的可得时刻。
3. 复权口径必须一致：派生只在桶内所有日线的 `adjustment` 相同且与请求一致时进行，混合口径 fail-closed。
4. `5d` 的锚点跟随可视区间末端，因此同一标的在不同窗口下的最后一根 `5d` bar 可能不同；其余周期不依赖窗口。

### 周期完成状态与评估时刻

聚合纯函数显式接收 UTC `evaluationAsOf`；调用方只传入该时刻已经可得的日线和版本化日历/覆盖证据。`5d` 另传冻结的交易日锚点。函数不得读取 `Date.now()`、系统时钟或隐式请求上下文。

使用该市场的 calendar fact、Session 时区和半日市安排，求出整个桶最后一个计划交易 Session 的 `bucketEndAt`。它不是已有日线的最大时间，也不能被请求 `end` 提前裁短。周/月/年检查整个周期，`5d` 检查锚点确定的五个交易日。

- 日历或桶结束边界不可确定时，不声明派生能力可用；有数值但存在无法解释的过去交易日缺失、未知日线状态或覆盖证据缺口时，状态为 `unknown`，不得当作停牌后声称完整。
- 边界及已到期输入可确认，但 `evaluationAsOf < bucketEndAt` 时为 `incomplete`，即使所有已到达日线均为 `complete`。已到期输入仍有 `incomplete` 时也为 `incomplete`。
- 只有 `evaluationAsOf >= bucketEndAt`，且每个应有交易日均有完整日线，或有在评估时刻已可得的版本化停牌/无交易证据解释缺失，才能输出 `complete`。单纯数组缺项不能作为无交易证据。
- `availableAt` 取实际使用日线及必要证据可得时刻的最大值；`complete` 的可得时刻还不得早于 `bucketEndAt`。不通过填写未来 `availableAt` 提前宣称完成；输入证据晚于评估时刻必须拒绝或降级。
- 同一输入、calendar revision、规则版本、锚点和 `evaluationAsOf` 必须逐字段可回放。不同评估时刻可以使尾桶从未完成变为完成，不得复用同一完成结论。

例如正常交易周周二收盘后，周一、周二日线虽均完成，本周周线仍为 `incomplete`；只有该周最后计划 Session 结束且覆盖证据齐全，才能变为 `complete`。月线、年线同理。

### 派生位置与 provenance 口径

- 聚合实现为 Domain 纯函数（与 `aggregateMinuteBars` 同级），入参是日线数组 + 交易日历/必要覆盖证据 + 周期 + `evaluationAsOf` + 可选 `5d` 锚点，输出派生 bar 数组；不得依赖隐式当前时间。
- Server 在 Reader 之上声明派生能力：仅当 `DAILY_BAR` 对应该资产类型为 `supported` 且该市场 calendar fact 可用时，才声明派生周期可用；否则以 `unavailable`/`unsupported` 加 reason 返回，文案遵循既有派生惯例。
- 派生序列的 provenance 使用 `provider: 'thesis-ledger-server'`、`providerRevision: <聚合规则版本>`、`kind: derived`（对外字段名以 T1 冻结为准），并携带基础日线的 `providerId / upstreamSource / providerRevision` 作为「派生自谁」的引用。UI 来源区必须同时可见「派生」与基础来源。
- 派生序列不写入事实表；Redis 视图 key 包含 `symbol + 周期 + adjustment + 基础段 identity/fingerprint + 规则版本 + calendar revision + 锚点`。基础日线或 calendar revision 变化必须失效或重算。
- 完成状态缓存还必须绑定 `evaluationAsOf`；允许只缓存与时间无关的数值聚合、每次返回前按显式时刻重新判定状态。不得跨过 `bucketEndAt` 后直接复用旧结论；派生 fingerprint 必须反映完成状态与 `availableAt`，指标缓存随实际输入变化。
- 聚合函数与规则版本必须可测可回放：同一输入 + 同一 calendar revision + 同一规则版本 + 同一评估时刻/锚点，输出逐字段稳定。

### 契约扩展

#### 2026-10-04 现行链与字段冻结

立项时的 V2 文件已由当前 `market-bar-series.ts`、`market.controller.ts` 和 Route/Data/Chart V3 替代；本主题不得重建旧入口或回退现行价格口径协议。Provider 的 Route/Data/Chart V3 来源事实仍为 `1m / 1d`，派生周期是 Server 展示序列；完整展示周期枚举独立命名为 `marketTimeframeSchema`，由后续 API 接入叶消费。

T1.1 冻结 `market-period-aggregation-v1` 规则及以下契约（定义见 `packages/schemas/src/market-period.ts`，领域结构见 `packages/domain/src/market-period-types.ts`）：

- 纯计算入参为 `timeframe`、`adjustment`、`priceBasisFingerprint`、`evaluationAsOf`、`calendar`、`bars`、`noTradingEvidence` 与仅 `5d` 必填的 `anchorTradingDate`。价格口径指纹由调用方对完整来源价格口径生成，不能只比较复权枚举。
- 日历 fact 含 `market / timezone / revision / availableAt / coverageStart / coverageEnd / sessions`；覆盖区间是全部计划 Session 集合的完整性声明，不能由实际日线日期推断。每个 Session 含交易日及 UTC 起止时间，支持分段 Session、半日市及市场时区。周/月/年按 Session 开始时刻的 `Asia/Shanghai` 日期分桶；输出交易日保持市场日历日期。
- 日线显式携带 `tradingDate / adjustment / priceBasisFingerprint` 和现行 BarPoint 字段。仅接受评估时刻已可得的日线与日历，未来证据直接拒绝。重复日线只允许逐字段完全相同的重复；同一交易日的冲突日线拒绝，不选择任意一条。
- 停牌/无交易证据必须绑定 `tradingDate / revision / availableAt / evidenceRef / reason`，其中 `reason` 为 `suspended | no-trading`。调用方负责核验来源并绑定本次证券、日历和基础窗口；纯函数不把数组缺项解释为停牌。
- 输出每根派生 bar 保留 `bucketStartDate / bucketEndDate / bucketEndAt / expectedTradingDates / observedTradingDates / explainedTradingDates / missingTradingDates`；时间戳取桶末计划 Session 结束时刻，不取已有日线的末时刻。缺完整桶日历或不足五个计划交易日时拒绝，不能缩短桶后声称完整。
- 派生来源为 `kind: derived / provider: thesis-ledger-server / providerRevision: market-period-aggregation-v1`；展示序列 `provenance.baseSources` 保留 `providerId / upstreamSource / providerRevision / inputFingerprint / priceBasisFingerprint`。派生上下文携带日历 revision、评估时刻、覆盖证据和锚点，供 T3 纳入指纹/缓存；不为 Server 制造 RouteTarget。
- 旧 BarSeries、指标、来源事实合同保持原行为。新派生展示合同使用独立 `marketPeriodBarSeriesSchema`；T1.2 将公共 API 的请求/响应接到该合同并实现结构化降级，T1.3 负责 DSA 的周期指标兼容，不以 T1.1 的验证宣称这些消费端已完成。

- 公开展示周期使用 `1m | 1d | 5d | 1w | 1mo | 1y`；原生事实 identity 仍仅接受 `1m / 1d`。展示联合合同区分原生和派生序列，派生 `provenance.kind=derived`，不扩大 Provider 来源能力。
- 现行 `/api/market/:symbol/detail` 接受 `timeframe` 查询参数，默认 `1d`；detail 端点按请求选择原生或派生消费。`barsLimit` 表示「所选周期的 bar 条数」，`navLimit` 不受影响。
- 指标分段继续使用现行 `MarketIndicatorResult`：其 `points.timestamp` 与所选周期 BarSeries 的完整桶结束 Session 对齐，`parameters` 不变。公开 `inputFingerprint` 与显示 BarSeries 对齐；预热参与计算时，以可选 `calculationInput` 保留完整计算序列指纹、实际起止和点数。DSA 原始响应先按完整输入校验，再进行显示投影，不把显示指纹冒充计算指纹。
- 未声明或不支持的周期返回结构化错误（`unsupported`/`unavailable` + reason），不静默回退到 `1d`。
- 基金：`MUTUAL_FUND` 的 `timeframe` 只接受 `1d` 语义（NAV 序列），请求派生周期返回 `unsupported`。

### 预热、窗口与指标可得性

- 每周期声明自己的预热需求：`MA60` 需要 60 个该周期 bar；`MACD(12,26,9)` 需要 26 + 9 个。可见窗口 90 个周期 bar 对应的日线输入量按周期换算（`1w` 约 5 倍、`1mo` 约 21 倍、`1y` 约 245 倍）。
- 「可见窗口 + 预热窗口」换算后的日线量必须落在基础事实获取上限内，聚合后送入 DSA 的周期点数另按计算上限校验；超限返回可解释的参数错误，不得截断预热后给出伪值。`1y` 上 `MA60/MACD` 在多数标的不可满足，因此**按周期声明可计算的指标集合**，UI 只展示真实可得指标，缺预热显示空值。
- 派生窗口的日线输入不足时，只返回可满足的桶，不向前补造 bar；`coverage.actualStart/actualEnd` 表达真实覆盖。显示起点前的预热参与计算后才裁剪显示点，不能把服务端漏取预热当作历史确实不足。

### 分页与覆盖

- `hasMoreBefore` 按所选周期的桶边界判断：日线还有更早数据但不足以构成一个完整桶时，不得声称还有更多。
- 分页沿用既有 start/end/limit + 页锚点机制；每次分页请求必须携带周期，且只合并同周期的响应；跨周期的页不得混入同一个 ChartPoint 集合。
- 周期切换时清空当前视口与分页页集合，按新周期重新请求，不保留上一周期的 bars；切换不得改变实时概览（quote、持仓、成本、盈亏）。

### Desktop 交互

- 工具栏新增「周期」语义组，与「区间」「图形」「指标」「视图」并列；周期组只包含真实声明支持的周期，未声明不显示。
- 周期与区间正交：周期切换保留区间偏好，区间切换保留周期偏好；两者都进入请求 key、缓存失效与乱序保护。
- 周期偏好按标的全局复用（与 `chartMode`、`visibleMA`、`activePane`、RSI/MACD 参数同级）；不支持或未声明的周期回退 `1d` 并提示。
- 周期切换后：右轴仍只保留主价格末值；读数分组、缺值「—」、稳定槽位、拖动分页、回到最新/重置语义全部不变；可视区间涨跌幅按所选周期首末有效收盘计算。
- 数据口径区必须显示当前周期与「派生」来源，使「这是聚合出来的周线」对用户可见。

## 对外行为或接口变化

- `timeframe` 在 bars/indicators/detail 三个入口统一可用，默认 `1d`；旧客户端不传该参数时行为与现在一致。
- 原生 BarSeries、指标及省略周期的 SDK 返回类型保持原合同；派生请求使用独立展示合同，明确携带来源、聚合上下文与覆盖证明，不向原生事实合同增加派生必填字段。
- 详情和周期能力入口的显式 `barsLimit` 为 1～3000，`navLimit` 保持 1～90；独立 bars/指标的显式 `limit` 为 1～3650。默认值分别见 T3.3/T3.3b，Desktop 初始非年度窗口为 90、年度为 2。`limits.bars` 回显请求窗口，不表示已取得的实际点数。
- 聚合基础日线与「可见点 + 预热点」分别不得超过 3650；日历总跨度最多 20000 个自然日、展示未来计划最多 366 日。接口参数上限不保证实际窗口预算或来源能力可用，不能截断预热以满足请求。
- 错误语义沿用现有分段状态：`unsupported` 表示该资产类型或该周期不提供，`unavailable` 表示暂时取不到，`empty` 表示覆盖为空。

## 数据、状态或兼容性影响

- 不新增 Prisma 模型或 migration，不修改日线事实的写入、复核窗口与 provenance。
- Redis 增加派生视图 key（可按前缀清理），丢失可从日线事实 + calendar 重建。
- 交易日历 revision 变化必须使派生视图失效；该规则需要与 `market-bar-series-cache-v2` 的视图失效路径一致。
- 指标缓存按周期天然隔离（fingerprint 含 period 序列），旧日线缓存不受影响。

## 测试策略

### 关键可观察行为

- 聚合 golden test 覆盖：跨月/跨年周、半日市、停牌缺失交易日、桶内 `incomplete`、桶内混合 `adjustment`（fail-closed）、`5d` 锚点随窗口移动。
- 完成状态测试覆盖：周二已到达日线均完整但周线未结束；当前月/年尾桶未结束；最后计划 Session 结束前、恰好结束、结束后；可信停牌证据与无解释缺口；证据晚于评估时刻；固定 `evaluationAsOf` 回放不受机器时钟影响。
- 契约测试覆盖：枚举校验、未声明周期报错、默认 `1d` 兼容、detail 不再写死日线。
- Server 测试覆盖：派生能力只在 calendar fact 可用时声明、Redis 视图失效、周期进入缓存 key、跨周期页不得合并、`hasMoreBefore` 桶边界、跨过 `bucketEndAt` 后重新判定完成状态。
- DSA 契约测试覆盖：以周期序列为输入的指标计算、预热不足返回 null、超上限参数错误。
- Desktop 测试覆盖：周期组只渲染可用周期、周期与区间偏好正交、切换清空页集合、读数与右轴语义不回归。

### 测试层级与证据边界

Schema/Domain 测试证明聚合与枚举；Server 测试证明声明、窗口与缓存语义；DSA 测试证明指标在周期序列上的计算；Desktop 测试证明交互与偏好。确定性 fixture 不证明交易所日历完整性，也不证明在线 Provider 可用性。真实运行态必须在浏览器中检查 Network 中的 `timeframe`、派生来源文案、周期切换后的读数与分页，并记录代码 revision 与 Contract 版本。

## 风险与备选方案

- **桶边界歧义**：`5d` 锚点跟随窗口、`1w` 依赖时区与周起点。处理方式是把边界写成规则版本并纳入 fingerprint，任何边界变化都产生新的规则版本，不静默改变历史展示。
- **派生被误读为原生事实**：来源区与 provenance 必须同时暴露「派生」与基础来源，且派生结果不写入事实表，避免污染 `1d` 事实与消费者一致性口径。
- **预热不足导致视觉断层**：宁可在 1 年线上少给指标，也不得用不足输入算出伪 MACD；按周期声明指标集合。
- **客户端聚合诱惑**：Desktop 已有日线数据，看似可以直接在本地分桶。明确禁止：那会造成第三处计算实现、与 Server provenance 脱节，并让分页/指纹语义失效。
- **备选方案**：若父级不接受枚举扩展，退路是只在 UI 层提供「视图缩放」而非真实周期切换——但这不满足用户诉求，且与「不伪造周期」冲突，故不作为推荐方案。

## 未决问题

### Blocking

无。周期集合、桶边界、派生位置、完成状态判定、指标可得性规则与兼容策略均已确定；字段命名与规则版本号由 T1 在代码盘点后冻结，但不得改变本节的边界与不变量。

### Non-blocking

- `5d` 是否作为「周期」还是「区间快捷项」存在产品歧义；本 Spec 按周期处理，理由是它改变每根 bar 的覆盖时长。
- `1y` 周期在指标不可得时是否仍提供图表（只画 K 线/收盘线与成交量）；默认提供，具体投影由 T3 决定。
- 是否需要在 `docs/adr/` 记录「派生周期不进事实表」这一决策；如父级要求长期固化，另开 ADR。

## 验收标准

- AC1：`5d / 1w / 1mo / 1y` 四种周期按固定规则从日线事实聚合；同一输入 + 同一 calendar revision + 同一规则版本 + 同一 `evaluationAsOf`/锚点输出逐字段稳定。周期未结束不得输出 `complete`，未解释覆盖缺失不得当作停牌事实。
- AC2：派生周期只在基础 `1d` 能力可用且该市场 calendar fact 可用时声明；provenance 明确标 `derived`、Server provider 与规则版本，并携带基础来源；不伪装为 Provider 原生周期。
- AC3：契约向后兼容：默认 `1d`；未声明周期返回结构化 `unsupported`/`unavailable`，不静默回退。
- AC4：指标按所选周期序列由 DSA 计算，参数不变；预热不足返回空值；`1y` 等不可满足的指标按周期声明而非补值。
- AC5：`barsLimit` 表示所选周期条数；「可见窗口 + 预热窗口」分别满足基础事实获取及指标计算上限；`hasMoreBefore` 按桶边界判断。
- AC6：Desktop 提供独立「周期」语义组，只显示真实可用的周期；周期与区间偏好正交且跨标的复用；未支持周期回退 `1d` 并提示。
- AC7：周期切换不改变实时概览（quote、持仓数量、成本、盈亏）；可视区间涨跌幅、读数分组、右轴末值、稳定槽位与分页交互不回归。
- AC8：图表口径区显示当前周期与「派生」来源；基金（`MUTUAL_FUND`）不提供派生周期，NAV 语义不变。
- AC9：跨周期分页响应不得合并进同一 ChartPoint 集合；周期进入请求 key 与乱序保护。
- AC10：Schema/Domain/Server/DSA/Desktop 定向测试、typecheck/build/lint 与边界脚本通过；浏览器真实运行态完成周期切换、Network、读数与分页验收并记录 revision。
- AC11：周期切换在 500 点负载下不产生 >200ms 主线程长任务，且切换只请求新周期窗口，不在客户端整段拉取并本地聚合。

## 延期事项

分钟线/盘中周期与 Market Detail 分页锚点修复都已经从本 Spec 的未来方案正文拆出，统一由 [`../TODO.md`](../TODO.md) 管理。本 Spec 不再维护这些延期事项的实现细节；正式启动时另建成对 Spec/Task。

## T1.2 公开请求接入阶段（历史）

以下记录 T1.2 在 T3 成功装配前的拒绝边界；现行派生成功路径、分段降级和能力声明由 T3.3/T3.3b 定义，不将本阶段的「尚未装配」解释为当前状态。

公开展示请求接受 `1m | 1d | 5d | 1w | 1mo | 1y`，省略周期仍按 `1d`。来源 identity/Route/Data 不因此声明原生派生周期。T1.2 先接入 bars、indicators、detail 的请求传输：派生周期在 T3/T4 就绪前返回稳定结构化 HTTP 错误，绝不以日线作为成功响应。

非法周期返回 400/`market_timeframe_invalid`；基金或不支持的资产请求派生返回 422/`market_period_asset_unsupported`；股票/ETF 尚未装配派生返回 503/`market_period_unavailable`。错误携带请求周期及原因；不得调用原始行情 Reader、指标计算或非行情详情作为静默替代。有效日线和省略周期保持原成功协议；本叶不提供派生成功序列、不扩大来源能力或修改图表界面。

请求解析从存量大 Controller 提取到 Market 所属请求 helper，保持同 feature 依赖；SDK 的行情请求传输集中到独立客户端模块，避免继续增加公共 index 的职责。T3 接入成功序列时再消费独立派生展示合同及来源指纹。

## T1.3 派生指标输入与 DSA 能力合同

当前 DSA 指标计算会按 identity/points 重算旧数值指纹，不能将包含完整聚合上下文的摘要直接冒充该指纹。派生请求使用独立 `market-period-indicator-v1` 合同；原生日线/分钟计算请求继续使用现行 Contract V3 和原指纹。

派生 `periodContext` 固定为 `protocol / aggregationFingerprint / pointFingerprint`：聚合摘要来自 T3 对完整 `canonicalMarketPeriodEncoding` 的 SHA-256，计算点摘要复用现行 identity/points 编码，最终 `inputFingerprint` 为 `["market-period-indicator-v1", aggregationFingerprint, pointFingerprint]` 紧凑 JSON 的 SHA-256。DSA 重算实际点摘要与最终绑定摘要，拒绝不一致；不在 DSA 重算交易日历或来源事实，不将数值摘要冒充聚合元数据摘要。T3/T4 对聚合摘要、计算窗口与可见窗口承担所有权。

四种派生周期仅接受 STOCK/ETF，计算点数 1～3650，参数保持现行 2～200。独立 `/api/v3/thesis-ledger/market/indicators/capabilities` 声明四周期的 provided-points 计算能力、上限及与 Server 一致的预热规则：MA 为 `max(period,60)-1`，MACD 为 `slow+signal`，RSI 为 `max(short,mid,long)+1`。能力声明不证明真实历史数据充足；T3 核验实际预热与来源覆盖，T4 在给定周期点上计算并保留不足预热的空值，尤其年度指标不能补值。

本叶不改变 Data V3 capabilities 握手、原始来源 timeframes、Provider 路由或指标公式；通过同一脱敏 JSON payload 的主仓 Schema/编码测试与 DSA 实际计算测试证明跨运行时兼容。真实聚合装配和公开成功响应仍由 T3/T4 承担。

## T3 分阶段装配与日历事实边界

T3 拆为日历读取/投影、窗口/预热/缓存、公开消费三个叶，保留原能力声明、覆盖、上限、完成状态与分页义务。T3.1 只建立真实日历入口，不提前声明公开派生周期可用。

T3.1 由 Market 所有的读取服务单向消费既有 DSA 日历协议及 Domain 冻结日历适配，不 import Server Backtest 编排。首批仅接受 CN/Asia/Shanghai 的显式事实；响应必须 supported、覆盖 complete，响应覆盖及唯一日历 range 均覆盖请求，Provider/revision 一致，事实 availableAt 不晚于显式 evaluationAsOf。空事实、冲突事实、未来事实、错市场/时区、无完整覆盖、非法或重复假日/覆盖项、重叠或倒序 Session 必须降级。

逐日 Session 来自该事实声明的常规交易周、假日与逐日覆盖，保留半日市和显式无 Session 日；不使用内置节假日表或最新完整交易日推断覆盖。当前事实模型不表达周末开市，遇到此类覆盖应明确降级。投影仅使用 CN 固定 UTC+08 时区模型，最大请求跨度 20000 个自然日，避免无界展开；独立展示入口的未来计划最多 366 日，与回测结算的 104 日预算分别校验。日历 revision 使用原 Provider/revision、可用时刻、完整范围、假日和全部 Session/覆盖项的规范编码摘要，不能仅按包版本缓存。

T3.1 的本地测试及实际 DSA 日历请求分别记账；真实日历不可用时维持结构化拒绝。T3.2 必须另外完成实际基础窗口和预热获取、口径绑定、聚合指纹与缓存；T3.3 再接三端点成功响应及能力声明，不能以日历投影通过替代完整 T3。

年线装配预检发现既有 `/backtest/calendar` 的未来 104 日预算属于回测结算，不能承担年初的完整年度计划读取。因此 T3.1b 建立独立 `/market/calendar` 展示入口：复用相同的版本化事实信封和实际来源，未来范围最多 366 个自然日、总跨度最多 20000 日；开始日期不晚于显式评估日期，实际包覆盖及可用时刻继续约束成功。Server 周期展示改用该入口；回测 104 日预算保持原义务。接口只是获取已登记的计划日历，不采集未来行情或提升来源能力。

T3.2a 先在完整日历输入上规划桶：可见窗口以和请求日期区间相交且已经开始的桶为候选，取末尾指定条数；预热从其前面的同周期桶获取。计算点预算按请求条数加既有预热规则校验，基础预算按实际所选桶的计划交易日数校验，不能用固定倍率冒充实际交易日。若日历历史确实不足，保留实际桶数及预热不足信息，不补造；若所选桶本身缺完整日历覆盖，明确拒绝。基础读取结束日不晚于显式评估的市场日期或请求结束日，但当前桶的结束时刻仍取完整计划，允许保留未完成桶。Domain 提供既有桶算法的稳定计划投影，Server 拥有可见/预热窗口及预算，不在 Server 复制周/月/年/5d 算法。

### T3.3 公开消费分阶段接入

公开接入的本地启动前置为已验证的 T3.2b2.1/T3.2c1/T3.2c2；真实来源成功和目标故障验收继续由 T3.2b2.2/T3.2c3 保留。先接 bars 与独立指标，再接详情的分段降级与实际能力声明，最后执行目标 HTTP 验收；这三个阶段全部通过前不关闭 T3.3。

公开派生请求复用原生请求的标的、口径、日期及 interactive 校验，基础来源 identity 仍为 1d。Server 规划日历探测范围，周/月/年边界复用 Domain；范围包含完整尾桶及完整预热桶，不以请求起点裁掉预热。5d 锚点只能取显式结束日前实际日历中的最后计划交易日；探测范围不足时有界扩大，仍不足则拒绝，不把探测截断当作来源历史不足。评估时刻与来源取得后的重新规划沿用 T3.2b2.1。

省略 limit 时，派生 bars/指标默认 90 个周期点，年度默认 10 个；显式 limit 保持 1～3650。日历范围超过 20000 日或完整基础窗口超过 3650 个计划日线点时，返回 400/market_period_window_invalid 并携带实际原因。日历或来源不可得返回 503/market_period_unavailable；不支持的资产/市场返回 422。独立年度指标超过预算时不缩短预热；后续详情阶段必须保持独立 bars 可得性，指标分段单独降级。默认值和预算是窗口政策，不代表真实来源覆盖或能力可用。

T3.2b1 的纯视图装配仅接受 STOCK/ETF 的现行 1d 序列及 interactive-chart 口径上下文，重算原日线点摘要，完整 sourcePriceBasis 经 Schema 规范解析后参与摘要。基础绑定同时包含证券/复权、现行输入、来源身份/revision、acquisitionFingerprint 和实际点；原始来源身份保持原生，不伪造派生 Provider 周期。显示/计算窗口分别对子集聚合编码和点编码生成 T1.3 的上下文与最终指纹，DSA 计算输入与公开显示序列因此可分别校验。缺日没有可信无交易证据时保持 unknown，不填零；空输入保持空。公开 hasMoreBefore 必须有实际更早聚合点，或基础来源确有更早事实且日历存在可规划的更早桶，不能仅凭日历计划推断数据存在。

### T3.3b 详情联合消费与周期能力

新展示详情合同允许根 barSeries 与 bars 分段为原生或派生序列，指标继续绑定显示序列指纹，并保留 calculationInput。既有原生详情 Schema/类型保持原生约束；SDK 省略周期或明确 1m/1d 时仍返回原生类型，派生或动态周期请求消费展示联合合同。派生根序列与 bars 分段必须一致，不得混入日线或另一周期。

派生详情由 Market 的独立编排服务负责。先按完整日历分别预检请求指标的实际预热/基础预算；不合格指标单独 unavailable，其余指标与 bars 共享一次真实基础获取和同一显示视图。DSA 故障保留 bars，来源失败不重试或静默回退。参数错误继续为 400，不以分段降级吞掉非法日期或指标参数。基金/不支持市场的派生详情继续 422；非行情详情沿既有服务消费。

详情省略 barsLimit 时保留既有 30 点默认值，年度使用 10 点；这与独立 bars/指标及周期能力入口的 90/年度10 默认值分别声明。显式 barsLimit 继续复用详情入口的参数上限。

周期能力使用独立 /api/market/:symbol/period-options 和 market-period-options-v1 合同，不扩展严格原生 chart-options。请求指定口径、可选窗口/条数及指标参数；省略条数时四周期使用公开请求的 90/年度10 默认值。每周期及每指标独立执行真实日历计划、完整桶及双层预算，并在实际基础窗口上核验选定 DAILY_BAR 价格口径的现行路由能力。只有日历与该口径均就绪才 available；响应保留评估时刻、基础窗口、计划日线点数和日历 revision，不发起行情或模型调用。年度 bars 可以 available 而 MA/MACD/RSI 因实际预算 unavailable，不能截断预热。

此 available 表示本次日历/路由/预算前置就绪，不证明实际证券历史足够、来源持续可用或目标新代码已部署。能力、实际来源与目标成功链路分层留证；Desktop 周期 UI 属于后续 T5。
