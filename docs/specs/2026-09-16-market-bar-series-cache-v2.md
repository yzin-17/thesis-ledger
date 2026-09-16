# 市场 BarSeries 与缓存 V2 Spec

> 任务标识：market-bar-series-cache-v2
> 日期：2026-09-16
> 状态：Phase 2 本地契约/代码里程碑实现中；隔离数据库、Redis 和运行态门禁未完成
> 对应任务：[市场 BarSeries 与缓存 V2 实施任务](../tasks/2026-09-16-market-bar-series-cache-v2.md)

## 背景与问题

当前 bars cache 的 freshness 主要由固定 TTL 和请求窗口决定，不能区分交易中、收盘后、已完成历史和复权历史；缓存也没有稳定的 RouteTarget、策略 revision 和输入指纹，可能把旧来源或旧策略视为当前数据。

## 目标

- PostgreSQL 保存来源事实，Redis 保存可丢弃的热点视图、锁和目标级运行状态。
- 事实唯一身份为 `symbol + timeframe + timestamp + adjustment + providerId + upstreamSource`；当前策略视图引用事实，不复制历史 bars。
- `limit` 只裁剪返回窗口，不进入事实段身份；策略/Provider/source/calendar revision 与输入指纹用于视图一致性。
- Market Detail、独立 bars 和指标入口统一经过 `MarketBarReader`，指标缓存绑定 `inputFingerprint + engineVersion + parameters`。
- 收盘后和历史数据使用交易日历驱动的新鲜度，避免每次详情请求重复访问慢 Provider。开发行情清理不属于本 Phase，迁移到消费者一致性 Phase 3。

## 非目标

- 不改变 RouteTarget V2 的主备语义；不实现 Risk、Performance、Backtest 消费者迁移。
- 不为复权数据假设永久不变；复权历史必须按 adjustment 和整段复核窗口隔离。
- 不删除交易、账户或策略事实，不用开发重建替代正式升级。

## 设计方案

`MarketBarReader.read` 只暴露 `interactive`、`complete`、`point-in-time` 三种 acceptance，内部负责当前策略读取、事实查询、目标执行、交易日历判断、单飞锁、写入和切片。来源事实的 freshness 与策略视图 freshness 分开保存，策略 revision 变化只使视图重新选择，不重写事实。

默认复核规则为：交易中或尾 bar 未完成 5 分钟；收盘后未确认完成 15 分钟；已完成历史至下一交易日开盘；复权历史 7 天整段复核；不复权历史 30 天复核。任何 `unknown`、不完整覆盖或 provenance 不一致均不得升级为 complete。

## 对外行为或接口变化

BarSeries V2 返回 identity、points、coverage、provenance、`inputFingerprint`；每个 point 返回 `completionStatus` 和 `availableAt`。缓存命中仍返回实际来源和 `servedFromCache`，不以缓存命中隐藏 Provider provenance。

兼容清理证据：Server 旧 detail helper 只保留 quote/chip/fund NAV 等非 bars 能力；API client 直接返回 `MarketDetailResponseV2`，不再生成 V1 bars/indicator 详情对象；Desktop 使用 `MarketChartBar` 和 `MarketChartIndicator` 作为展示连接模型，未改变图表布局或交互。V1 bar/indicator schema 暂保留给 DSA adapter 与 Server 内部旧指标测试等仍存在的合法调用。

## 数据、状态或兼容性影响

新增行情事实/覆盖记录和必要索引；旧 bars 不自动迁移为 V2 事实，必须按已确认来源重采集或明确不可用。Redis 丢失后可从 PostgreSQL 恢复。开发清理只允许在显式确认、核对数据库 owner 和停止消费者后清理行情及衍生快照。

## 测试策略

覆盖事实唯一性、策略切换、limit 复用、adjustment 隔离、交易日历 TTL、尾 bar 完成状态、并发单飞、fingerprint、历史覆盖和三种 acceptance。数据库隔离测试不能替代当前 Docker 运行态。

## 验收标准

- AC1：来源事实唯一身份和视图/事实分离成立。
- AC2：不同 limit 复用同一事实段，策略/source/adjustment 不串用。
- AC3：交易中、收盘后、完成历史和复权历史使用规定刷新策略。
- AC4：Market Detail、独立 bars/indicator 统一经过 Reader，缓存 provenance 完整。
- AC5：并发请求单飞且指标输入 fingerprint 稳定。
- AC6：隔离 PostgreSQL/Redis 与当前 Docker 运行态验证通过；本 Phase 不执行行情清理，历史迁移和生产升级保持独立门禁。
