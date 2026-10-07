# 三仓版本与兼容矩阵

本页解释 ThesisLedger、DSA Fork 与基础设施之间的发布组合。机器可检查的版本号和门禁要求以相邻 infra 的 `compatibility.json` 为准；Compose、镜像和卷的操作细节以该仓说明为准。DSA 的[当前专属路由说明](../../../daily-stock-analysis/docs/thesis-ledger-contract-v1.md)记录具体请求合同。

现行模块、公开 API 和消费者归属见[当前运行链](canonical-runtime.md)。2026-10-02 的最终验证接续历史部署记录，具体输入、快更可写层与业务验收见[Canonical 收口证据](../tasks/evidence/2026-10-02-canonical-final-completion.md)；下文较早失败不代表本次目标状态。

| 组件 | 当前源码合同 | 阻断门禁 |
| --- | --- | --- |
| ThesisLedger | `0.1.0`；当前 Market、Backtest Run 与 Ledger 公共入口 | 定向及包级测试、`pnpm contract:test`、目标 HTTP 与客户端 |
| DSA Data | V3；`/api/v3/thesis-ledger/*`；独立 Data Token | DSA 离线测试、对应能力的配置/准入、协议与正向业务 smoke |
| DSA Control | V3；`/api/v3/thesis-ledger/control/*`；独立 Control Token | 握手/策略/目录/修订测试、目标配置与撤销 |
| DSA Fork release | `v3.28.0-thesisledger.1` 命名约定 | 不可变镜像摘要、与主仓相同的当前合同 |
| `@thesis-ledger/schemas` | `0.1.0`；当前共享 Schema 与不可变证据格式 | Schema 测试、类型与构建、跨运行时解析 |
| PostgreSQL | 主仓全部顺序 migration 和 raw-owned 表共同定义动态 head | `pnpm migration:matrix`、隔离升级、目标结构和权限检查 |
| Infrastructure | `compatibility.json` schemaVersion 2；Data/Control 均为 V3 | `node scripts/check-compatibility.mjs`、官方更新入口及目标服务健康 |

## 兼容规则

### V3 源码增量与发布基线

2026-10-03 的共同价格基线按[多源 Spec §1.1](../specs/2026-09-25-multi-source-adjustment-aware-backtest.md#11-2026-10-03-共同能力基线)执行：HiThink ETF qfq 与腾讯 ETF none/qfq/hfq 不再以人工窗口准入为前置，日级状态自动整理；同口径整窗备用支持图表和固定快照归一化价格研究。协议仍为 V3，无依赖、数据库或镜像格式变化。目标使用官方 `sync-code.sh` 同步，真实 Server/Worker 与重放结果见[验收记录](../tasks/evidence/2026-10-03-common-price-baseline.md)；本轮未发布新镜像。

当前 DSA ThesisLedger 专属 Data/Control 只有 V3 可调用路由，主仓 Server 和客户端按同一合同消费。DSA 原生 `/api/v1` 仍服务其自身功能；它不构成 ThesisLedger 旧合同读取能力。`RunConfigV3`、V3 Snapshot 与结果格式需要按自己的不可变标识校验，旧 Run/产物不得在当前执行路径中被解码或回放。NAV 基金和 Ledger 当前经济能力的正向接线仍归[单一现行链路替换 Task](../tasks/2026-09-29-thesis-ledger-canonical-runtime-replacement.md)，不能因旧入口删除而当作验收完成。

2026-09-27 的保留数据升级和 2026-09-28 的 `BIGINT` 结构升级各有当时目标证据，见[数据库升级任务](../archive/tasks/2026-09-27-preserve-data-database-upgrade.md)与[目录修复证据](../tasks/evidence/2026-09-28-cont-159516-catalog-revision-bigint.md)。这些结果不声明 2026-09-29 的后续迁移已进入目标环境；当前结构 head 必须从实际 migration 输入重新派生。

2026-09-29 的官方 `update.sh all` 在 DSA 镜像完成后，于主仓镜像构建时耗尽宿主磁盘，数据库准备和服务启动未发生；见[失败边界](../tasks/evidence/2026-09-29-canonical-update-all-disk-blocked.md)。因此当前源码的目标 G-Deploy、真实来源、Worker、UI 和 AI 业务验收保持开放。`sync-code.sh` 更新位于容器可写层，不能当作镜像发布证据。

### 通用规则

- 开发数据库显式重建与正式保留数据升级分开验收；默认更新保留数据，不隐式清库或删除卷。
- 业务模块依赖当前 ThesisLedger 合同和单向 Adapter，不反向依赖 DSA 实现细节。
- DSA 上游同步须通过当前 V3 协议和正向业务检查；协议通过不代表特定来源有权限、完整覆盖或历史可见性。
- Contract version、Capability、Schema、Token 或来源修订不匹配时阻断发布，不做隐式降级。
- AI 研究结果须通过自身结构化结果合同校验后写入 `AiRun.result`；Portfolio、Ledger 与其他用户事实保持独立。
- PostgreSQL 业务任务状态是事实源；队列只负责投递与执行，晚到结果不得覆盖新的 attempt。

## 必要检查

```bash
pnpm contract:test
pnpm migration:matrix
pnpm provider:failover
```

运行三仓目标栈时，先在 infra 执行 `node scripts/check-compatibility.mjs`，再按变更选择官方 `sync-code.sh` 或 `update.sh`。`bash scripts/market-v3-contract-test.sh` 只验协议；`./scripts/contract-test.sh` 追加真实 Data 正向读取。两者之外还须核对数据库 head/权限、Server/Worker/DSA 实际版本、Run 生命周期和目标客户端，具体门禁见[多来源回测 Task](../tasks/2026-09-25-multi-source-adjustment-aware-backtest.md)。
