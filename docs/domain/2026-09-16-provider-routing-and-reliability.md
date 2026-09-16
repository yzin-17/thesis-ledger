# Provider 路由与数据可靠性

本文统一 Provider 选择、RouteTarget、fallback、健康、freshness、来源事实和 point-in-time 语义，作为当前 Provider 领域 SSOT。旧 `provider-selection` 与 `provider-reliability` 文档已经归档。

当前架构入口见 [`../architecture/2026-09-16-market-data-v2.md`](../architecture/2026-09-16-market-data-v2.md)。Provider 适配器、原始凭证、Effective Policy 运行实现属于 `daily-stock-analysis` 仓库；本文只定义 ThesisLedger 消费侧领域不变量。

## RouteTarget 与选择语义

业务层不直接依赖具体 Provider SDK。市场数据路由以能力、资产类型和显式 RouteTarget 选择数据源；RouteTarget 至少区分 `providerId` 与 `upstreamSource`。

不变量：

- fallback 只能沿 Desired/Effective Policy 中明确声明的 target 顺序进行；
- Provider 内部不得隐藏切换到未声明 source；
- 返回结果必须携带实际 Provider/Source provenance，不使用 `CACHE` 等伪 Provider 表示缓存命中；
- capability 不支持、凭证缺失、熔断、限流、网络故障和上游缺失必须保持可解释状态；
- target 当前不可用时可以 fail-closed，不得用 fixture、静态默认值或另一来源冒充真实成功；
- 专业 Provider 的额度、授权和成本必须显式配置，未知状态保持 `unknown`，不能静默切换到更昂贵来源。

## Provider 配置与凭证

Provider 配置可以包含能力、启停状态、settings、credentials reference、quota/cost 和 source manifest。原始凭证只保存在 DSA 自有加密存储中；ThesisLedger 和客户端只消费 write-only 配置状态与可解释结果，不回显 secret。

连通性/草稿测试与正式保存必须区分：测试不能把草稿凭证持久化或改变正式健康状态。凭证、OAuth、SDK 令牌刷新等运行实现由 DSA 负责，主仓只持有 Control Contract 和产品侧状态。

## 健康、预算与故障

健康、限流、熔断和请求预算以 `provider + capability + asset/source/symbol` 等实际运行维度记录，不能把某个 source 的故障扩散成整个 Provider 的无差别失败。

- 成功、超时、上游错误、权限不足、quota exhausted、circuit open 等状态要结构化区分；
- 重试必须受请求预算约束，不能由 Server 和 DSA 多层叠加形成重复上游请求；
- 并发相同请求应通过 single-flight / lock 合并，等待者优先重读缓存或结果，不盲目重新访问 Provider；
- 外部 Provider 当前断连是数据可用性问题，不授权恢复隐藏 fallback 或放宽 provenance。

具体健康阈值属于实现策略，可以演进；“失败必须可解释、不能伪造成功”是长期领域不变量。

## BarSeries 来源事实与缓存

当前市场历史事实不再以旧 `MarketBar` 模型为 SSOT，而是使用 BarSeries V2：

- PostgreSQL 的来源事实身份包含 `symbol + timeframe + timestamp + adjustment + providerId + upstreamSource`；
- coverage/freshness 与事实分开记录，`limit` 只影响切片；
- Redis/内存缓存是可丢弃视图，不能覆盖来源 provenance；
- 同一 Provider 不同 source、不同复权口径或不同 timeframe 的事实互不覆盖；
- `completionStatus` 与 `availableAt` 用于表达事实完成度和可得时间，不能仅凭“数据库里有一行”认定可用于所有消费场景。

Quote/Fund NAV 仍可以使用 fresh/last-valid 等产品缓存，但 stale 必须显式标记；历史 bars 不得从最新 Quote/NAV 伪造。

## 消费 acceptance

不同消费者对同一来源事实有不同 acceptance，但不能各自实现第二套路由或缓存：

- `interactive`：用于页面和实时估值预览，可以返回可解释的当前数据；
- `complete`：用于 Risk、正式校准等必须依赖完成事实的场景，遇到 incomplete/unknown fail-closed；
- `point-in-time`：用于 Backtest/Snapshot，只能读取决策时点已经可得的事实。

消费者必须继续传递数据来源、时间、完整性和 fallback 状态，不能把 partial/stale/unavailable 压平为“有数值即可”。

## Point-in-time 与研究数据

Financial、Announcement、公司行动、市场规则等研究事实必须记录 `publishedAt` / `availableAt` 或等价可得时间。回测和 AI 只能读取决策时点已经公开/可得的数据；“现在能查到的最新值”不能回填到历史时点。

专业 Provider 可以用于更长分钟历史、财务、公告或规则覆盖，但其价值不能改变上述 PIT 约束。授权、历史深度或修订标识不足时，应返回缺口并阻止依赖它的严格运行。

## 质量与可观测性

每次数据读取至少应能回答：

- 实际使用了哪个 Provider/Source；
- 数据何时产生、何时抓取、何时可得；
- 是否命中缓存、是否 stale、是否完成；
- 是否发生显式 fallback，为什么；
- 当前结果覆盖哪些时间范围，是否还有更早数据；
- 严格消费者为什么接受或拒绝了这份数据。

日志与 Review 可以记录这些状态，但不得包含原始凭证、敏感响应或真实账户秘密。
