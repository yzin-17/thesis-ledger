# 市场数据 V2 当前架构

本文是 ThesisLedger 主仓市场数据读取、路由、事实存储和消费边界的当前 Architecture SSOT。产品行为以相关 Spec 为准，实施状态以对应 Task 为准，Provider 原始适配和 Effective Policy 运行细节仍由 `daily-stock-analysis` 仓库维护。

相关入口：

- [RouteTarget V2 Spec](../specs/2026-09-16-market-data-route-target-v2.md)
- [BarSeries 与缓存 V2 Spec](../specs/2026-09-16-market-bar-series-cache-v2.md)
- [消费者一致性 V2 Spec](../specs/2026-09-16-market-data-consumer-consistency-v2.md)
- [Provider 路由与可靠性领域说明](../domain/2026-09-16-provider-routing-and-reliability.md)
- [三仓版本与兼容矩阵](version-matrix.md)

## 三仓职责

| 仓库 | 当前职责 | 不承担的职责 |
| --- | --- | --- |
| `daily-stock-analysis` | Provider manifest、source-pinned runtime、Effective Policy、Provider 配置/凭证/健康/熔断、真实上游访问与 Data/Control Contract 实现 | 不读取 ThesisLedger PostgreSQL 的业务事实，不决定 Portfolio/Risk/Backtest 的产品 acceptance |
| `thesis-ledger` | Desired Policy、RouteTarget V2 消费、BarSeries 来源事实与 coverage、统一 Reader、产品缓存、point-in-time/complete/interactive acceptance、公开 `/api/v2/market` 和业务消费者 | 不隐藏 Provider fallback，不保存 Provider 原始运行实现，不让业务模块直接绕过 Reader 读取行情表 |
| `thesis-ledger-infra` | Compose、镜像、Secret/Token 注入、持久卷、部署顺序与跨仓运行时兼容 | 不拥有市场数据领域语义或 Provider 选择算法 |

## RouteTarget V2

路由不再只有 Provider ID，而是以精确 RouteTarget 表达 `providerId + upstreamSource`。Desired Policy 由 ThesisLedger 持久化，DSA 对目标逐一校验并生成 Effective Policy。

关键不变量：

- 同一能力最多使用显式声明的有序 targets；
- Provider 内部不得再做隐藏 source fallback；
- provenance 必须返回实际 `providerId`、`upstreamSource`、route index/revision 等可复核信息；
- target 不支持指定 asset/adjustment 时可以跳过到下一个显式 target，但不能换成未声明 source；
- Provider/Source 当前网络不可用时返回结构化 unavailable，不能把 fixture、静态默认值或其他来源伪装成成功。

## BarSeries V2 来源事实

旧 `MarketBar` / `MarketStorageService` / 公开 V1 detail 适配已经退出当前架构。来源事实使用 BarSeries V2 模型：

- PostgreSQL：`MarketBarSeriesFact` 保存来源事实，`MarketBarSeriesCoverage` 保存覆盖、freshness 和 Provider revision；
- 唯一事实身份包含 `symbol + timeframe + timestamp + adjustment + providerId + upstreamSource`；
- 不同 Provider、Source、复权口径或 timeframe 不覆盖彼此；
- `limit` 只影响返回切片，不改变事实身份；
- Redis/内存只保存可丢弃的派生视图和 single-flight 状态，丢失后可从 PostgreSQL 来源事实或真实 Provider 重建；
- 公开响应使用输入 fingerprint 描述当前返回序列，指标缓存必须绑定实际计算输入 fingerprint 与 engine version。

## 统一 MarketBarReader

Server 的市场数据消费者统一通过 `MarketBarReader`，不允许 feature 直接查询行情事实表或调用 DSA bars 绕过 Reader。Reader 根据消费目的使用三种 acceptance：

- `interactive`：面向页面/估值预览，允许在明确质量语义下返回当前可展示数据；
- `complete`：面向 Risk、正式校准等需要已完成事实的消费者，遇到 incomplete/unknown 时 fail-closed；
- `point-in-time`：面向 Backtest/Snapshot，只允许读取 `availableAt <= asOf` 的事实，避免未来信息泄漏。

请求窗口先规范化，再按 coverage/freshness 判断 PostgreSQL、Redis 或远端获取；并发通过进程内 single-flight 与受控 Redis lock 合并。缓存命中不能改变 provenance，也不能把 stale/incomplete 伪装成 fresh/complete。

## 消费者边界

- Risk：只接受满足 `complete` acceptance 且不晚于评估时刻的事实；
- Performance / Portfolio：交互预估可以使用 interactive 语义，正式收盘校准使用 complete；
- Backtest V2：按 point-in-time 构建 Snapshot，并冻结实际 RouteTarget、Provider revision 与 fingerprint；finalized Snapshot 重放不重新取在线行情；
- Automation：通过 Reader/领域服务消费，不直接拥有第二套行情缓存；
- Desktop/API Client：直接消费 V2 payload，不重新构造旧 V1 market detail shape。

`scripts/check-boundaries.mjs` 负责阻止非 Market feature 直接读取旧行情表或绕过 Reader。

## 公开接口与兼容

当前产品读取入口位于 `/api/v2/market/*`。旧公开 `/api/v1/market/*` 读取适配已经移除；如果调用者仍依赖旧 wire shape，应显式迁移客户端，而不是在 Server 内长期双写/双返回。

Control/Data Contract 的 major version 与发布兼容关系仍以 [version-matrix.md](version-matrix.md) 为准；DSA 原生 V1 namespace 若仍有独立消费者，不等于 ThesisLedger 产品侧需要继续暴露旧 Market API。

## Freshness、缓存与时间语义

- `completionStatus`、`availableAt`、`fetchedAt`、`freshUntil` 和 coverage 都是事实/视图的一部分，不能只用请求时间推断；
- 交易中、收盘后和已完成历史可以使用不同复核窗口；具体实现由 BarSeries V2 规则和版本化测试约束；
- Reader 返回窗口切片后重新计算当前切片 fingerprint，不能沿用更大缓存窗口的 fingerprint；
- 指标计算可以使用更长预热输入，但公开显示 fingerprint 与实际计算 input fingerprint 必须区分，不能把显示切片冒充完整计算输入；
- calendar revision、RouteTarget/policy revision、Provider revision 或来源事实变化时，依赖它们的可重建视图必须失效或重新计算。

## 当前开放门禁

以下是当前运行环境/验收状态，不改变上述架构边界：

- RouteTarget V2 的 Tencent 主路径已通过；AkShare/EastMoney 真实备用源仍受当前上游断连影响，必须继续 fail-closed，不得隐藏切换；
- Consumer Consistency V2 已完成代码迁移和当前 Docker 切换，但最终真实消费者集成/再次受保护清理仍按其 Task 的 G1 记录；
- BarSeries 与缓存 V2 的当前 Phase 已完成，历史实施正文进入 archive，不再作为 active task。

外部 Provider 恢复或失败是部署数据可用性，不应重新引入旧 `MarketBar`、V1 公开适配或隐藏 fallback。
