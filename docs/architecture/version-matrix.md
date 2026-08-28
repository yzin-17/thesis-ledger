# 三仓版本与兼容矩阵

本文是 ThesisLedger、DSA Fork 与运行时基础设施之间的发布级版本兼容 SSOT。Data/Control Contract V1 的能力明细和验证规则见 [DSA Contract V1 兼容说明](2026-08-18-thesis-ledger-dsa-compatibility.md)；infra 的部署清单和 Compose 细节仍以 `thesis-ledger-infra` 为准。

| 组件                     | 当前基线                            | 兼容边界                                       | 阻断门禁                               |
| ------------------------ | ----------------------------------- | ---------------------------------------------- | -------------------------------------- |
| ThesisLedger             | `0.1.0`                             | 产品/API release                               | `pnpm contract:test`                   |
| DSA Data Contract        | `V1`                                | `/api/v1/thesis-ledger`                        | capability + black-box contract smoke  |
| DSA Control Contract     | `V1`                                | handshake、Provider Policy、Catalog control    | control contract smoke                 |
| DSA Fork release         | `v3.28.0-thesisledger.1` convention | upstream version + ThesisLedger patch revision | immutable GHCR digest + contract smoke |
| `@thesis-ledger/schemas` | `0.1.0`                             | versioned shared contracts                     | schema tests                           |
| PostgreSQL schema        | migration controlled                | ordered Prisma migrations                      | `pnpm migration:matrix`                |
| Infrastructure           | immutable image digests             | Compose + persistent volume contract           | infra compatibility + contract tests   |

## 兼容规则

- 业务模块依赖 ThesisLedger Contract 和 Adapter，不依赖 DSA 实现细节。
- DSA 上游同步只有在 Data/Control Contract V1 黑盒套件继续通过时才允许合入。
- Contract version、Capability、Schema 或 Control Token 不匹配时阻断发布，不做静默兼容降级。
- 研究输出只有通过结构化 `ResearchResult V1` 校验后才写入 `AiRun.result`；Portfolio、Ledger 和其他用户事实保持独立。
- 现有异步模型继续作为权威：`AutomationJob`/`AutomationRun` 用于计划任务，`BacktestJob` 用于回测，`AiRun` 用于 AI 执行。除非现有模型无法满足新的隔离需求，否则不引入第二套队列抽象。

## 必要检查

```bash
pnpm contract:test
pnpm migration:matrix
pnpm provider:failover
```

运行三仓栈时，使用 `thesis-ledger-infra/scripts/contract-test.sh`，同时检查 ThesisLedger facade 和 DSA Contract endpoint。具体命令和部署环境以 infra 仓库为准。
