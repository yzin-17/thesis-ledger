# ThesisLedger 与 DSA 兼容矩阵

## 当前版本关系

| 组件                | 版本/标识                   | 说明                                   |
| ------------------- | --------------------------- | -------------------------------------- |
| ThesisLedger 主系统 | `0.1.0`                     | 活动产品版本                           |
| DSA Fork 上游基线   | `v3.28.0`                   | 上游代码基线                           |
| DSA Fork 发布格式   | `v3.28.0-thesisledger.1`    | 上游版本加 Fork 修订号，首次发布待授权 |
| HTTP Contract       | `thesis-ledger-contract-v1` | 主系统依赖的稳定边界                   |
| 生产镜像            | GHCR digest                 | 必须记录 digest，不使用 floating tag   |

## Contract V1 能力

| 能力          | V1 状态 | 数据边界                                                         |
| ------------- | ------- | ---------------------------------------------------------------- |
| Quote         | 支持    | 统一 Quote V1，携带 provider、marketTime、fetchedAt 和 freshness |
| Bars          | 仅 `1d` | `1m` 返回 `unsupported_capability`                               |
| MA/MACD/RSI   | 支持    | 使用日线输入和 DSA engineVersion                                 |
| ATR           | 不支持  | 返回 `unsupported_capability`，主系统页面保留不可用状态          |
| Chip 摘要     | 支持    | averageCost、profitRatio、range70、range90、concentration        |
| Chip 完整分布 | 可选    | 没有可靠 buckets/mainPeak 时省略，不伪造                         |

## 发布与验证

1. DSA Fork tag 必须包含上游版本和 Fork 修订号，并在镜像 label 中记录两个 commit。
2. 主仓 Stub Contract Test 在无外网环境运行，保证客户端和 Schema 的确定性回归。
3. `thesis-ledger-infra` 使用同一份黑盒 Contract Test 指向真实 DSA Contract；fixture mode 为阻断门槛。
4. 在线 Provider smoke test 只在定时或手工任务中运行，不阻断确定性发布。
5. 镜像发布后把实际 GHCR digest 补入 `thesis-ledger-infra/.env`，生产部署只引用该 digest。
