# Provider 与数据可靠性

## 路由与状态

业务层只调用 MarketDataProvider 能力，不直接调用具体数据源。Provider Registry 按 capability 和 priority 路由；批量请求保留完整 universe，主源缺失的标的继续走备用源，并返回 `missing`、`complete` 与 `fallbackChain`。

每次 Provider 检查记录延迟、连续失败次数和最近时间。成功且延迟不超过 3 秒为 `healthy`，成功但延迟较高或短暂失败为 `degraded`，连续三次失败为 `down`；恢复成功后失败计数清零。健康记录进入 `ProviderHealth`，管理接口为 `/api/v1/providers/health`。

请求层支持 timeout、指数退避重试、窗口限流与 Circuit Breaker。熔断打开后跳过故障 Provider，冷却后允许半开探测。Webhook、行情源和凭证都不把密钥写入日志或客户端。

## Freshness、落库与质量问题

Quote、Bar、Indicator 和 Chip 使用 `marketTime`、`fetchedAt`、年龄和 `staleReason` 描述新鲜度。Quote 的最后有效值可以作为明确标记为 stale 的回退，不能覆盖最后有效缓存。

日线和分钟 Bar 均按 `symbol + timeframe + timestamp + provider` 幂等 upsert 到 `MarketBar`，写入前先保证 `Asset` 存在。回填按时间范围执行；增量同步从已保存的最新时间继续，并过滤已落库数据。非法或同步失败的数据写入 `DataQualityIssue`，用户可查询、确认和标记 resolved。

免费 Provider 可能存在延迟、缺失、修订、限流和复权口径差异。回测、收益和风控必须携带数据来源、时间和完整性状态，不得把 partial 结果当作完整历史。
