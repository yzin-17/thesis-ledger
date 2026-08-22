# DSA Contract V1 兼容说明

本文记录 Data Contract V1 与 Control Contract V1 的能力级兼容边界和验证规则。三仓发布版本、镜像和数据库基线以 [三仓版本与兼容矩阵](version-matrix.md) 为准，避免在两份文档中重复维护版本号。

## Data Contract V1 能力

| 能力 | V1 状态 | 数据边界 |
| --- | --- | --- |
| Quote | 支持 | 统一 Quote V1，携带 `provider`、`marketTime`、`fetchedAt` 和 freshness |
| Bars | 仅 `1d` | `1m` 返回 `unsupported_capability` |
| MA/MACD/RSI | 支持 | 使用日线输入和 DSA `engineVersion` |
| ATR | 不支持 | 返回 `unsupported_capability`，主系统页面保留不可用状态 |
| Chip 摘要 | 支持 | `averageCost`、`profitRatio`、`range70`、`range90`、`concentration` |
| Chip 完整分布 | 可选 | 没有可靠 `buckets`/`mainPeak` 时省略，不伪造 |

## Control Contract V1 能力

- Control API 使用独立的 Control Token 和 `consumer=thesis-ledger` namespace，不复用 Data Contract Token 或 DSA 管理员 session。
- Provider registry、Desired/Effective Policy、health、Catalog Job 和 ACK 通过 Control Contract 暴露；DSA ProviderConfig、凭证和运行状态不进入 ThesisLedger 领域模型。
- `CHIP_SUMMARY` 是显式 Capability；Indicator 只从已路由的 `DAILY_BAR` 输入派生，不触发 native Provider manager 的隐藏调用。
- 发生 unsupported、unavailable、stale、fallback 或 circuit-open 时，Contract 必须保留结构化状态和 provenance，不能用零值或缓存伪装实时 Provider。

## 发布与验证规则

1. DSA Fork tag 必须包含上游版本和 Fork 修订号，镜像 label 必须记录两个 commit。
2. 主仓 Stub Contract Test 在无外网环境运行，保证客户端和 Schema 的确定性回归。
3. `thesis-ledger-infra` 使用同一份黑盒 Contract Test 指向真实 DSA Contract；fixture mode 只作为确定性阻断门槛。
4. 在线 Provider smoke test 只在定时或手工任务中运行，不阻断确定性发布；在线结果必须记录实际 Provider、fallback 和外部错误边界。
5. 镜像发布后把实际 GHCR digest 补入 `thesis-ledger-infra/.env`，生产部署只引用该 digest。
