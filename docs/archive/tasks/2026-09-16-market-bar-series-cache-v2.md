# 市场 BarSeries 与缓存 V2 实施任务

对应 Spec：[市场 BarSeries 与缓存 V2 Spec](../specs/2026-09-16-market-bar-series-cache-v2.md)

> 状态：T1–T3 与 G1 已完成；隔离存储、当前 Docker 和缓存性能门禁通过

## 任务

- [x] T1：建立来源事实、覆盖记录和 BarSeries V2 存储契约
  - 覆盖验收标准：AC1、AC2
  - 依赖：`market-data-route-target-v2` T1/T2 已验证。
  - 涉及范围：Schema、Prisma migration、MarketBarReader 的事实 identity；不迁移旧行情、不清理数据。
  - 完成条件：同一来源事实可幂等写入，不同 source/provider/adjustment 不冲突，limit 只影响切片。
  - 验证方式：Schema 定向测试、隔离 PostgreSQL migration/读写测试。
  - 当前证据：BarSeries schema、OHLC/时间序列约束和跨运行时 golden vector 定向测试通过；事实覆盖按连续窗口单调合并，非连续窗口保持读穿；Prisma validate 与 migration matrix 通过。旧 MarketBar 不迁移，新增 migration `20260916100000_remove_legacy_market_bar` 仅删除旧表；当前结构为 65 张表。同一 timestamp 写入两个 adjustment 和两个 RouteTarget 共保留 3 条独立事实，幂等 upsert 更新原事实而不增行。

- [x] T2：实现交易日历 freshness、Redis 视图、锁和指标输入指纹
  - 覆盖验收标准：AC3、AC5
  - 依赖：T1；交易日历事实可用。
  - 涉及范围：TTL 状态机、Redis singleflight、coverage/fingerprint 和指标缓存 key；不迁移消费者。
  - 完成条件：四类 freshness 规则、并发单飞和指纹绑定可独立验证。
  - 验证方式：时间冻结测试、Redis 隔离测试、并发测试。
  - 当前证据：Reader/calendar 本地测试通过，包含主源事实、缓存状态、canonical acquisition limit、覆盖边界、point-in-time 和 freshness 分支；未知或未完成尾 bar 按交易中 5 分钟、收盘后 15 分钟处理，只有完成历史进入 7/30 天复核。指标缓存绑定 fingerprint、实际 engineVersion 和规范化参数。隔离 Redis 验证热点 key、NX 锁互斥及限定 key 的 `UNLINK`，并发 singleflight 有定向测试覆盖。

- [x] T3：统一 Market Detail、独立 bars/indicator 入口到 Reader
  - 覆盖验收标准：AC4、AC5
  - 依赖：T1、T2；RouteTarget provenance 可读取。
  - 涉及范围：Server Market reader/endpoint adapter；不改 Desktop 视觉和 Phase 3 消费者。
  - 完成条件：同一请求只读取一次行情事实，指标不再独立触发重复 bars 请求，V2 provenance 完整。
  - 验证方式：Server 定向测试、契约互操作测试。
  - 当前证据：V2 controller、Reader 和 DsaClient 已接入；detail 只读取一次 BarSeries，再调用纯批量指标接口，指标使用 DSA 实际 engineVersion 和 fingerprint 缓存键。旧 MarketStorageService、MarketBar cache、storage/backfill controller 已删除，Automation closeSync 改用 Reader；API client 直接透传 `MarketDetailResponseV2`，Desktop 只通过命名展示模型读取 V2 series/result，伪 V1 bars/indicator 详情适配已删除。运行态发现并修复 Server 空参数与 DSA 默认参数的集合漂移；Server 全套 648 项测试、typecheck/build 通过。最终 detail 的 bars、MA、MACD、RSI 均为 ready 并共享同一 fingerprint；DSA 日志只有一次 bars GET 和一次纯指标 POST，第二次 detail 热命中不再访问 DSA。

- [x] G1：隔离存储/Redis 与目标 Docker 门禁
  - 覆盖验收标准：AC6
  - 依赖：T1–T3。
  - 涉及范围：隔离数据库、Redis、`./scripts/update.sh all` 运行态和性能阈值；行情及衍生快照清理由 Phase 3 负责，不在本任务执行。
  - 完成条件：隔离库、Redis、当前 Docker 和性能阈值均有证据。
  - 验证方式：按项目验证阶梯和 infra 更新入口执行。
  - 当前证据：隔离 PostgreSQL 与 Redis 已通过；开发库位于 `20260916100000_remove_legacy_market_bar`，当前 DSA、Server 与 Backtest Worker 健康。真实 Tencent 冷请求 1.356s（≤5s）；30 次热命中 p95 25.50ms（≤250ms）；相同路由切换到新策略 revision 后，旧 Redis/内存视图不命中，PostgreSQL 来源事实读穿 59ms（≤500ms），并按新 revision 返回 37 点切片。Market Detail 首次完整请求 3.987s，热请求 39.53ms。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / 事实身份与分离 | T1 | T1 |
| AC2 / limit、策略、source、adjustment 隔离 | T1、T2 | T1/T2 |
| AC3 / freshness 状态机 | T2 | T2 |
| AC4 / Reader 统一入口和 provenance | T3 | T3 |
| AC5 / singleflight 与 fingerprint | T2、T3 | T2/T3 |
| AC6 / 隔离库与 Docker 运行态 | G1 | G1 |

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [x] 必要数据库、Redis 与 Docker 门禁均已通过；本 Phase 按范围不执行清理
- [x] 依赖与契约就绪证据无循环
- [x] 数据、时间、错误和 provenance 语义一致
- [x] 未把开发清理当成生产升级

### Review 结论

- 结论：T1–T3、隔离 PostgreSQL/Redis、当前 Docker、端到端 Reader/detail 和本 Phase 性能阈值均通过。
- 尚未通过的必要门禁：本 Phase 无；AkShare/EastMoney 真实备用成功属于 RouteTarget G1，受保护清理与消费链属于 Phase 3。
