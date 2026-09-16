# 行情图表周期聚合 Spec（5 日 / 周 / 月 / 年）

> 任务标识：market-chart-period-aggregation
> 日期：2026-09-16
> 状态：规划完成，待父级确认后从 T1 开始实施；分钟线属于延期项，统一见 [`../TODO.md`](../TODO.md)
> 对应任务：[行情图表周期聚合实施任务](../tasks/2026-09-16-market-chart-period-aggregation.md)
> 评审修订：补充显式评估时刻及周期结束判定；仅修订规格，不表示周期功能已经实现。

## 背景与问题

`MarketDetailCharts` 目前只有日线一种周期：区间组是「全部已加载 / 1月 / 3月 / 6月 / 1年」，图形组只切换 K 线/收盘线，工具栏没有周期选择。用户实际需要的「5 日线、周线、月线、年线」这一类频率切换无法表达。

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
- 窗口与预热约束：详情单次最多 90 条（`limits.bars`）。指标计算输入上限 365 条，与 Reader 的 3650 条规范化事实获取上限不同；分别校验聚合所需基础事实量及聚合后送入指标计算的点数。
- 图表侧的指纹与分页语义已冻结：`2026-09-10` Spec AC4 要求按「共同日期的逐日 inputFingerprint」判断可比；Desktop 已按「页 = 一次详情响应」的粒度构建 ChartPoint 并按日期合并（`market-chart-model.ts` 的 `mergeChartPoints`、`market-chart-types.ts` 的 `chartPageFromResponse`）。周期切换必须沿用这套页内可比语义。
- 场外基金不参与证券周期：`market-detail.service.ts:56-58` 的 `FUND_CAPABILITIES` 只有 NAV，且净值日期不是交易日。

## 设计方案

### 周期定义与桶边界

周期标识使用 `5d | 1w | 1mo | 1y`，全部基于 `1d` 事实派生。周/月/年桶边界不随请求窗口变化，`5d` 使用显式窗口锚点：

| 周期 | 桶边界 | 桶内取值 |
| --- | --- | --- |
| `5d` | 以可视区间末根 bar 所在交易日为锚，向前每 5 个交易日一桶 | open=首日 open，high=桶内最高，low=桶内最低，close=末日 close，volume/amount=求和 |
| `1w` | 以 `Asia/Shanghai` 周一为起点，与 `2026-09-07-portfolio-valuation-series.md:84` 的周口径一致 | 同上 |
| `1mo` | `Asia/Shanghai` 自然月 | 同上 |
| `1y` | `Asia/Shanghai` 自然年 | 同上 |

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

- `timeframe` 枚举扩展为 `1m | 1d | 5d | 1w | 1mo | 1y`，同时新增「基础/派生」标识（沿用 `dataTimeframeKindSchema` 的 `base | derived` 命名）。
- `/api/v2/market/:symbol/detail` 增加 `timeframe` 查询参数，默认 `1d`；detail 端点不得再写死日线。`barsLimit` 语义改为「所选周期的 bar 条数」，`navLimit` 不受影响。
- 指标分段继续用 `IndicatorResultV2`：其 `points` 的日期是所选周期的桶末交易日，`parameters` 不变。公开 `inputFingerprint` 与显示 BarSeries 对齐；预热参与计算时，以可选 `calculationInput` 保留完整计算序列指纹、实际起止和点数。DSA 原始响应先按完整输入校验，再进行显示投影，不把显示指纹冒充计算指纹。
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
- BarSeries V2 与 IndicatorResult V2 的字段除周期枚举与派生标识外不新增必填字段；旧字段保留。
- 派生周期不改变 `limits.bars` 的数值约束（仍是单次 90 条），改变的是这 90 条代表哪个周期。
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
