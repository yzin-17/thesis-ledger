# DSA Contract V1 兼容说明

本文记录 Data Contract V1 与 Control Contract V1 的能力级兼容边界和验证规则。三仓发布版本、镜像和数据库基线以 [三仓版本与兼容矩阵](version-matrix.md) 为准，避免在两份文档中重复维护版本号。

## Data Contract V1 能力

| 能力          | V1 状态 | 数据边界                                                               |
| ------------- | ------- | ---------------------------------------------------------------------- |
| Quote         | 支持    | 统一 Quote V1，携带 `provider`、`marketTime`、`fetchedAt` 和 freshness |
| Bars          | 仅 `1d` | `1m` 返回 `unsupported_capability`                                     |
| MA/MACD/RSI   | 支持    | 使用日线输入和 DSA `engineVersion`                                     |
| ATR           | 不支持  | 返回 `unsupported_capability`，主系统页面保留不可用状态                |
| Chip 摘要     | 支持    | `averageCost`、`profitRatio`、`range70`、`range90`、`concentration`    |
| Chip 完整分布 | 可选    | 没有可靠 `buckets`/`mainPeak` 时省略，不伪造                           |

## Control Contract V1 能力

- Control API 使用独立的 Control Token 和 `consumer=thesis-ledger` namespace，不复用 Data Contract Token 或 DSA 管理员 session。
- Provider registry、Desired/Effective Policy、health、Catalog Job 和 ACK 通过 Control Contract 暴露；DSA ProviderConfig、凭证和运行状态不进入 ThesisLedger 领域模型。
- `CHIP_SUMMARY` 是显式 Capability；Indicator 只从已路由的 `DAILY_BAR` 输入派生，不触发 native Provider manager 的隐藏调用。
- 发生 unsupported、unavailable、stale、fallback 或 circuit-open 时，Contract 必须保留结构化状态和 provenance，不能用零值或缓存伪装实时 Provider。

## 统一回测 V2 接缝

DSA 只提供带来源和时间语义的市场事实及 capability，不拥有 `DataSnapshot`、Artifact、`SimulationEvent`、`SimulationLedger` 或 `BacktestResult`。统一回测 V2 的接缝固定为：

```text
DSA 市场事实 → ThesisLedger DataSnapshot → Simulation Event Engine → SimulationLedger → BacktestResult
```

- 资产身份使用主仓已经确认的 `Asset.symbol`；金额、价格、数量和费用跨 Contract 使用规范十进制字符串，进入领域计算后使用 Decimal 类型。
- 事实分别携带 `occurredAt` 与 `availableAt`；DSA 不替 Server 决定 Snapshot 的 `dataAsOf`、warmup、派生周期或最终冻结范围。
- 回测结果元数据使用 `source=BACKTEST`，但该值不加入真实账户的 `LedgerEventV2` 联合，也不成为 `actual/shadow` 账户模式。
- DSA 不接收模拟现金、持仓、订单、成交或账户投影；Server 不把回测结果写入真实 Ledger、Portfolio、Journal 或 AI Review。
- 当前 Data Contract V1 的 `Bars` 仍只有 `1d`；`1m`、HK/US Calendar、Instrument Facts、FX、公司行动和 CN NAV capability 必须按统一回测 V2 T2 验证后才能声明可用。

完整行为与任务依赖见 [`统一回测系统 V2 Spec`](../specs/2026-08-28-unified-backtest-v2.md) 和 [`统一回测系统 V2 实施任务`](../tasks/2026-08-28-unified-backtest-v2.md)。

### T13 第一阶段门禁

主仓保留两个可离线复现的门禁：`scripts/backtest-v2-t13-gate.mjs` 校验跨仓共享 fixture 的支持矩阵与非目标 NAV 边界；`scripts/backtest-v2-isolation-audit.mjs` 校验回测/Simulation 源码没有真实账户事实域 import。两者只证明契约和源码隔离，不宣称真实 DSA Provider 或账户数据库运行态通过。性能输入、结果摘要和未完成运行态验收记录在 [`统一回测 V2 T13 性能与功能基线`](../benchmarks/2026-09-09-unified-backtest-v2-t13.md)。

## 发布与验证规则

1. DSA Fork tag 必须包含上游版本和 Fork 修订号，镜像 label 必须记录两个 commit。
2. 主仓 Stub Contract Test 在无外网环境运行，保证客户端和 Schema 的确定性回归。
3. `thesis-ledger-infra` 使用同一份黑盒 Contract Test 指向真实 DSA Contract；fixture mode 只作为确定性阻断门槛。
4. 在线 Provider smoke test 只在定时或手工任务中运行，不阻断确定性发布；在线结果必须记录实际 Provider、fallback 和外部错误边界。
5. 镜像发布后把实际 GHCR digest 补入 `thesis-ledger-infra/.env`，生产部署只引用该 digest。
