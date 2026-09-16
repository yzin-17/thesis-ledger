# 市场数据消费者一致性 V2 实施任务

对应 Spec：[市场数据消费者一致性 V2 Spec](../specs/2026-09-16-market-data-consumer-consistency-v2.md)

> 状态：T1–T5 已完成；当前 Docker 已切换到新结构与新代码，G1 等待真实行情与性能门禁收尾

## 任务

- [x] T1：迁移 Risk 与绩效读取语义
  - 覆盖验收标准：AC1、AC2
  - 依赖：`market-bar-series-cache-v2` T3 的 Reader 契约已验证。
  - 涉及范围：Strategy Risk、Performance/valuation 读取面；移除 MarketBar 直读并保持现有业务口径。
  - 完成条件：Risk complete fail-closed，绩效预估 interactive，正式校准 complete。
  - 验证方式：Server 风险/绩效定向测试与缺失、stale、incomplete 场景。
  - 当前证据：Strategy Risk 仅通过 `MarketBarReader` 的 `complete` acceptance，并按 evaluatedAt 过滤；绩效预估保留 quote 行为，正式收盘校准通过 Reader `complete`；相关定向测试通过。

- [x] T2：迁移 Backtest V2 point-in-time snapshot
  - 覆盖验收标准：AC3
  - 依赖：T1；Reader 支持 `availableAt <= asOf`。
  - 涉及范围：Backtest bars 读取、snapshot provenance/fingerprint 和确定性重放。
  - 完成条件：历史回测不读取未来可用数据，冻结快照可重复重放，策略切换不改变既有快照。
  - 验证方式：Backtest 定向和 snapshot replay 测试。
  - 当前证据：Backtest V2 bars 通过 Reader `point-in-time`，传入 `asOf` 并写入实际 RouteTarget、策略 revision、provider revision 和 fingerprint；snapshot builder 定向测试通过。

- [x] T3：维护 Portfolio/Automation 单向边界并固化依赖门禁
  - 覆盖验收标准：AC4、AC5
  - 依赖：T1、T2；Market reader contract 已冻结。
  - 涉及范围：跨 feature imports、`scripts/check-boundaries.mjs` 和非视觉客户端 adapter；不改变 Catalog/Asset identity。
  - 完成条件：禁止直读 MarketBar/绕过 Reader 的依赖模式，合法单向依赖通过门禁。
  - 验证方式：边界脚本和受影响包 typecheck。
  - 当前证据：边界脚本已阻止非 Market feature 直读 MarketBar 或绕过 Reader 调用 bars；当前 boundary gate 与 Server typecheck 通过。

- [x] T4：实现受保护的开发行情清理模式
  - 覆盖验收标准：AC7
  - 依赖：T1–T3；消费者已不再依赖旧 `MarketBar`。
  - 涉及范围：行情/覆盖事实、限定前缀 Redis 状态、BacktestJob 与本地 snapshot、PortfolioSnapshot、AccountValuationPoint、RiskEvent 与风险运行状态；保留账户、交易、持仓、策略、风险规则、StrategyRiskApplication 及其配置审计。
  - 完成条件：默认仅预检；execute 仅在 development、数据丢失开关、实际数据库/owner 和 scope confirmation 全部精确匹配时运行；保留 Journal 时安全解除其 RiskEvent 可选引用；禁止清 volume、`FLUSHDB` 或越界删除目录。
  - 验证方式：脚本契约测试、错误目标/owner/确认拒绝测试、隔离数据库事务测试和临时 snapshot/Redis namespace 测试。真实执行前仍须重新向用户展示目标并取得当次明确确认。
  - 当前证据：默认模式只读取实际 database/current_user、目标表计数、解析后的 snapshot root 和精确 Redis 前缀；执行路径要求 development、`MARKET_CLEANUP_ALLOW_DATA_LOSS=true` 及 database/owner/root 精确确认，并以事务顺序解除 JournalEntry 风险关联后清理限定表。定向安全测试 4/4 通过；未执行真实删除。

- [x] T5：备份保留事实、重建开发库并恢复业务数据图
  - 覆盖验收标准：AC8
  - 依赖：T4 的清理/保留范围已冻结；用户已授权重建 `thesis-ledger-dev/thesis_ledger` 并要求恢复账户、交易与持仓。
  - 涉及范围：完整灾备、隔离恢复演练、排除计划清理对象的数据包、infra `DEV_DATABASE_MODE=rebuild`、保留事实恢复与引用完整性核对；不创建生产升级路径，不恢复旧行情或衍生快照。
  - 完成条件：完整 dump checksum 和隔离恢复通过；重建达到当前 migration head；3 个账户、4 笔交易、2 个持仓以及必要 Asset、LedgerEvent、现金、成本策略和交易子事实恢复；计划清理对象为空；完整灾备保留到 G1 验收结束。
  - 验证方式：`pg_dump`/`pg_restore --list`、隔离数据库恢复计数、重建后关键表精确计数、外键完整性、migration matrix 与 Server 启动检查。
  - 当前证据：静默停止 Server/Worker 后生成完整灾备 `/private/tmp/thesis-ledger-pre-market-v2-final-20260916.dump`，SHA-256 为 `cf5e51370d64538e1ab3454c240e046f52e4a6abff35f4a49ca822fa17faed82`，并在隔离数据库完整恢复；保留事实数据包 SHA-256 为 `1e706ce84c70edd7adfef61eb7b337ea3b5a7d470a370609a144d91b8a53f5e2`。开发库通过 `DEV_DATABASE_MODE=rebuild` 到达 `20260916100000_remove_legacy_market_bar`，共 65 张表；手动恢复后为 Account 3、Trade 4、Position 2、LedgerEvent 10、TradeEntryLeg 2、TradeBaselineComponent 5、TradeEvidenceSource 9、CashBalance 1、CashSettlement 2、AutomationJob 5、AutomationRun 460。通用外键孤儿扫描为 0；BacktestJob、PortfolioSnapshot、AccountValuationPoint、RiskEvent、MarketBarSeriesFact、MarketBarSeriesCoverage 均为 0，旧 MarketBar/BackfillJob 表不存在。完整灾备继续保留到 G1 结束。

- [x] T6：清理因历史兼容与不可重建假设累积的行情复杂度
  - 覆盖验收标准：AC4、AC5、AC8
  - 依赖：T1–T5；开发库已具备可恢复的重建路径。
  - 涉及范围：旧行情存储、公开 V1 适配、策略结构迁移和 DSA Effective Policy 投影；不删除仍有独立消费者的 DSA 原生 V1 契约，也不改写已冻结的 Backtest 快照。
  - 完成条件：删除只为旧表或旧 wire shape 服务的双写/转换路径；旧 `ProviderId[]` 策略 fail-closed；V2 状态恢复不再散落重复兼容分支。
  - 验证方式：源码依赖搜索、Schema/migration 门禁、公开 endpoint、Control/DSA 契约测试及当前数据库结构检查。
  - 当前证据：已删除 `MarketBarCache`、`MarketStorageService`、旧 `MarketController`、Prisma `MarketBar`/`BackfillJob` 及公开 V1 detail adapter；客户端直接消费 V2。旧 Provider 数组不再运行时自动迁移，只在重建前执行过一次精确数据准备。DSA 把 apply/recompute、Provider 配置变更、健康更新和 policy projection 的 V1/V2 状态重建收敛到统一 helper，并保持 V2 `requestId` envelope；相关契约测试 27 项通过。保留的 DSA 原生 V1 与 Backtest 冻结快照是仍有明确所有权的产品边界，不属于“因不敢重建数据库而保留”的兼容层。

- [ ] G1：消费者集成与当前 Docker 运行态门禁
  - 覆盖验收标准：AC6
  - 依赖：T1–T5；Phase 1/2 代码已进入同一运行版本且保留事实已恢复。
  - 涉及范围：Risk、Performance、Backtest、Portfolio、Automation 真实调用链；不替代单元和边界测试。
  - 完成条件：目标 Docker 版本、迁移状态、路由和 acceptance 证据一致；未通过项保留阻塞说明。
  - 验证方式：按验证阶梯执行定向测试、包级检查、仓库门禁和 infra `./scripts/update.sh all`。
  - 当前证据：Server 全套 648 项测试、typecheck/build、仓库边界门禁、隔离 PostgreSQL migration/事实读写与隔离 Redis 均通过；`./scripts/update.sh all` 已在当前 65 表结构上启动 DSA、Server 与 Backtest Worker，三者健康。启动时发现并修复 `DsaSnapshotBuilder` 的 `MarketBarReader` token 被 type-only/结构类型擦除问题，新增显式注入 token 回归测试。最终数据库仍为 Account 3、Trade 4、Position 2、LedgerEvent 10，旧行情表不存在；运行态 smoke 随后新生成 BacktestJob 8、PortfolioSnapshot 3、AccountValuationPoint 1，不能把重建后瞬时为 0 误报为当前为 0。再次删除这些衍生产物必须按 T4 重新展示精确目标并取得新确认，因此 G1 保持未完成。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / Risk complete fail-closed | T1 | T1 |
| AC2 / 绩效 acceptance | T1 | T1 |
| AC3 / Backtest point-in-time/freeze | T2 | T2 |
| AC4 / 单向消费者边界 | T3 | T3；G1 |
| AC5 / 禁止绕过 Reader | T3 | T3 |
| AC6 / 跨模块与运行态 | T1、T2、T3 | G1 |
| AC7 / 受保护的开发清理 | T4 | T4；真实执行前用户确认 |
| AC8 / 全库重建前备份与保留事实恢复 | T5、T6 | T5、T6；G1 |

## 最终一致性 Review

- [ ] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [ ] 消费者集成、边界和 Docker 门禁均已通过
- [x] 本地 acceptance、point-in-time、错误和冻结语义一致
- [x] 单元测试、隔离存储与运行态证据边界已明确区分

### Review 结论

- 结论：T1–T6 已完成，开发库在当前 migration head 上恢复了用户要求保留的业务事实，当前 Docker、Tencent 主源、缓存性能与 Market Detail 消费链通过；G1 保留外部备用源和再次清理确认两项开放门禁。
- 尚未通过的必要门禁：AkShare/EastMoney 真实备用源成功；若要求当前衍生产物重新归零，还需按 T4 对重建后 smoke 新生成的 8 个 BacktestJob、3 个 PortfolioSnapshot、1 个 AccountValuationPoint 取得当次明确清理确认。
