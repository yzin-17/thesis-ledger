# 组合估值走势 Spec

- 状态：已批准，实施中
- 类型：新能力
- 对应任务：[`../tasks/2026-09-07-portfolio-valuation-series.md`](../tasks/2026-09-07-portfolio-valuation-series.md)
- 上游契约：[`2026-08-28-portfolio-snapshot-system.md`](2026-08-28-portfolio-snapshot-system.md)

## 背景与问题

当前收益走势图读取原始快照数组，每条记录都是一个点，横坐标又按数组下标等距分布。它不能表达真实时间间隔、分钟/小时粒度、周期重采样、快照修订或数据质量，也没有光标坐标提示。

分钟和小时走势需要独立的估值读模型。股票和 ETF 可以使用分钟行情；场外基金没有真实盘中 NAV，需要根据最近披露持仓形成明确标记的估算值。

## 目标

1. 提供账户与投资组合统一的估值时序接口。
2. 支持独立的查看区间与采样粒度，以及服务端重采样。
3. 以真实时间间隔绘图，避免事件快照造成重复打点。
4. 从上线后持续沉淀分钟数据，不用当前持仓倒推虚假的历史分钟线。
5. 基于基金披露持仓估算盘中 NAV，并暴露覆盖率和证据。
6. 提供鼠标、键盘和触屏可访问的十字光标与坐标 Tooltip。

## 非目标

- 不承诺回补上线前的分钟或小时走势。
- 不把估算 NAV 表述为基金公司正式净值。
- 不把已披露持仓归一到 100%。
- 不把独立现金账户纳入投资组合。
- 不提供超过 2,000 点的单次响应。

## 现状与约束

- MarketBar 当前支持 `1m` 和 `1d`；小时线可由分钟线聚合。
- 场外基金当前只有 NAV 与 NAV 历史，DSA 和 ThesisLedger 都没有基金披露持仓契约。
- 投资账户持仓和现金是估值事实；组合只聚合启用且模式相同的投资账户。
- 日级以上优先使用 Snapshot V2 当前有效日终版本；分钟级基础点由盘中任务写入。

## 设计方案

### 1. DSA 基金持仓能力

DSA 增加 `FUND_HOLDINGS` capability 和 `/api/v1/thesis-ledger/market/fund-holdings`：

```ts
interface FundHoldingsEvidence {
  fundSymbol: string;
  reportPeriod: string;
  disclosureDate: string;
  provider: string;
  fetchedAt: string;
  evidenceVersion: string;
  holdings: Array<{ symbol: string; name: string; weight: number }>;
}
```

权重使用 0 到 1，保持 Provider 实际披露比例。Provider 路由、健康检查、缓存、fallback 和错误码复用既有 ThesisLedger capability 体系。

### 2. 基金盘中估算

以最近正式 NAV 及其日期为锚：

```text
estimatedNav(t) = anchorNav × [1 + Σ(weightᵢ × adjustedReturnᵢ(anchor, t))]
```

- 使用复权后的底层证券价格；
- 未披露仓位、现金、停牌和缺价持仓按零变动处理；
- `disclosureCoverage` 为披露权重之和；
- `pricedCoverage` 为本次成功定价持仓权重之和；
- 没有持仓证据时沿用锚点 NAV，并返回 `LOW_COVERAGE`；
- 披露日期晚于估值时间的证据不得用于回放；
- 正式 NAV 到达后由 Snapshot 校准链替代日终估算点。

### 3. 基础估值点

`AccountValuationPoint` 按账户、模式和分钟时点持久化：账户与模式、时点、计价币种、市场价值、现金、总值、估值口径、两类覆盖率、数据质量、证据、来源快照和创建时间。唯一键为 `accountId + mode + at + baseCurrency`。重复采样执行 upsert 相同事实，不产生重复点。组合查询按时点、币种和账户范围聚合，不持久化第二份组合分钟数据。

### 4. 查询接口

`GET /performance/series` 参数：`scope=account|portfolio`、account scope 必填 `accountId`、`range=1D|5D|1M|3M|YTD|1Y|5Y|ALL`、`interval=1min|1h|1d|1w|1mo|1y`、`mode=actual|shadow` 和 `baseCurrency`。

响应包含 `points`、`availableIntervals`、`range`、`interval`、`currency` 和整体数据质量。每个 point 至少包含 `at`、`value`、`currency`、`valuationBasis`、`disclosureCoverage`、`pricedCoverage`、`dataQuality`、`sourceSnapshotId`。

服务端最多返回 2,000 点，按真实 UTC 时间升序。`1h/1d/1w/1mo/1y` 取每个自然桶内最后一个有效点；日级以上从 Snapshot V2 当前有效 DAILY_CLOSE 槽位读取。周以 Asia/Shanghai 周一开始，月和年按该时区自然边界。

| 区间 | 默认粒度 | 可用粒度 |
| --- | --- | --- |
| 1D | 1min | 1min、1h |
| 5D | 1h | 1min、1h、1d |
| 1M | 1d | 1h、1d、1w |
| 3M | 1d | 1h、1d、1w、1mo |
| YTD | 1d | 1d、1w、1mo |
| 1Y | 1d | 1d、1w、1mo |
| 5Y | 1mo | 1w、1mo、1y |
| ALL | 1mo | 1mo、1y |

shadow 在缺少分钟投影数据时不开放 `1min/1h`，以 `availableIntervals` 为准。

### 5. Desktop 交互

- 区间和粒度使用两个独立控件；不可用粒度禁用。
- 切换区间后如果当前粒度不可用，自动切换到默认粒度。
- SVG 横坐标按 `at` 的真实时间比例计算，不再按数组索引等距排列。
- 稀疏周期显示所有点；分钟和小时只显示当前激活点。
- 图表命中层吸附最近点，显示横向与纵向十字线。
- Tooltip 显示完整时间、资产总值、币种、估算/正式、披露覆盖率、可定价覆盖率和质量说明。
- 图表可聚焦；左右键逐点移动，Escape 关闭；触屏点击选择最近点。
- 加载、空数据、部分估值、数据延迟使用直接且可操作的中文说明。

## 数据、状态与兼容性影响

- 分钟历史只从功能启用后沉淀；旧图表可在迁移期间回退到日级 Snapshot。
- 正式 Snapshot 替代同日估算版后，日级走势图只返回一个当前点。
- 走势查询使用 TanStack Query 管理缓存、加载、错误和竞态。

## 测试策略

- DSA 契约和 Provider 测试覆盖权重、空数据、重复证券、证据版本和真实样本。
- 估值测试覆盖部分披露不放大、缺价持平、披露时点限制和正式 NAV 校准。
- Server 集成测试覆盖账户/组合聚合、周期边界、真实时间顺序、2,000 点限制和修订去重。
- Desktop 测试覆盖区间/粒度联动、鼠标吸附、键盘、触屏、Tooltip 字段及空/错误状态。
- 浏览器验收覆盖宽窄屏、密集点、跨日数据和十字光标。

## 风险与备选方案

- 基金披露通常滞后且不完整；覆盖率必须始终可见，不能用估算冒充实时正式净值。
- 高频采样会增加写入量；基础点按账户存储并设置查询上限，后续保留策略另立运维决策。
- Provider 真实样本受外部网络影响；未获得样本证据时任务保持未完成并记录外部阻塞。

## 未决问题

### Blocking

无。

### Non-blocking

无。

## 验收标准

- AC1：DSA 能以稳定契约返回基金披露持仓、覆盖率所需权重和证据版本。
- AC2：基金估算只使用真实披露权重，未披露或缺价部分不被放大，并明确标记估算质量。
- AC3：分钟估值点幂等持久化，组合值按账户和币种安全聚合。
- AC4：series API 支持规定区间与粒度、真实时间排序、服务端重采样和 2,000 点上限。
- AC5：日级以上只消费 Snapshot 当前有效 DAILY_CLOSE 版本，同一估值日不重复打点。
- AC6：Desktop 区间和粒度独立选择，并正确处理不可用组合。
- AC7：鼠标、键盘和触屏均可读取横纵坐标、估值状态、覆盖率和质量说明。
- AC8：上线前历史分钟线不被伪造，数据不足时显示明确状态。
- AC9：真实基金披露样本完成 Provider 与估算误差验收；缺少外部证据时明确记录阻塞。
