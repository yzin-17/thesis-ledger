# E01-N3 并行离线执行证据

## 有界执行包

启动依赖：已完成 N1 冻结、计划及 Domain 输入适配，并消费当前研究可见性合同。共享 Spec、主 Task 和 handoff 只读。

本轮写集：Domain 截止时间规则及专属测试；Backtest 独立 NAV 冻结输入事件适配、纯离线经济编排及专属测试；本证据文件。公共 Schema、准备服务/API、Prisma、Run Repository、Worker、Market/DSA Reader 不在写集。

验收：截止前/等于/截止后；微秒可见性；预热禁止交易；独立处理日期确认、可卖和现金结算；费用、份额、现金、同基金基准；冻结重放和期末待处理。先定向，再适用包级、类型、构建、边界检查。保留全部既有未提交改动，不提交或部署。

## 首次离线包的公共合同阻塞（历史）

后续已完成独立 NAV 公开结果合同、结果读取校验和现行 Runner `runNav` 接线，见 [结果与 Runner 证据](2026-10-01-n3-nav-result-runner.md)。本节保留首次执行时的停止依据；Worker 投递/领取/提交和消费面仍待汇合。

当前 `packages/schemas/src/backtest-v2.ts` 的 `backtestResultSchemaV3` 强制要求 `executionPriceProtocol` 和场内 `actualSources`。NAV 冻结输入不包含这些合同，不能合法生成现行公开结果。需公共 Schema 负责人提供 NAV 判别结果合同，再由 Worker 汇合；本轮不伪造 Bar 协议，不勾选整个 N3/N4。

`packages/schemas/src/backtest-data.ts` 的 `backtestSnapshotActualSourceV3Schema` 还明确拒绝 `routeKey.kind !== 'bar'`，NAV 的 `FUND_NAV_HISTORY` 数据路由不能直接投影进去。该公共合同阻塞创建投递、公开结果校验和 Worker 成功提交，本轮没有修改公共 Schema。

## 实现与文件

| 文件 | 责任 |
| --- | --- |
| `packages/domain/src/nav-simulation-rules.ts` | 截止前使用当日估值，等于及之后使用下一处理日；下一处理日缺失时不回退当日 |
| `packages/domain/test/nav-cutoff-boundary.test.ts` | 截止前一微秒、等于、后一微秒、周末及缺日期回归 |
| `apps/server/src/backtest/backtest-nav-offline-events.ts` | 冻结分段选择、截止、微秒事件时间/执行日期校验、独立确认/可卖/现金日期编排 |
| `apps/server/src/backtest/backtest-nav-offline.ts` | `runNavOfflineV3` 显式申请执行及 `replayNavOfflineEvents` 离线事件重放 |
| `apps/server/src/backtest/backtest-nav-offline-strategy.ts` | `runNavOfflineStrategyV3` 冻结策略日频信号、指标、cross 历史、风险与 sizing 到申请 |
| `apps/server/src/backtest/backtest-nav-offline-valuation.ts` | 已确认成交、交易投影、期末现金/份额估值及同基金基准 |
| `apps/server/test/backtest/backtest-nav-offline.test.ts` | 真实 Parquet 冻结读回后的专属正负例 |

事件队列按微秒时刻、阶段和稳定事件 ID 排序。生成 NAV 事件前调用 N1 的 `pricingFactAt`；信号和指标只接收微秒可见的事实子集。预热只更新指标与 cross 历史，不申请交易或提前消耗 entry edge；非处理日也不申请。日频策略使用冻结 `dailyValuationTime` 决策，截止后申请按下一处理日估值。

确认以模型指定处理日期零点为下界，再等待实际 NAV 可见时刻；可卖和赎回再投资日期从实际确认日期计数。这里只使用冻结的处理日期，不查询或虚构交易时段。金额、申赎费用、确认份额和预期结算金额由既有 `CnNavSimulation` 决定，编排层消费内核确认结果。模型分段按申请时刻固定，不在结算时重新选段。

所有事件只执行到冻结期末估值时刻；`through` 不能超过期末或 `dataAsOf`。期末仍未定价、未确认或未结算的申请保留在 `pendingRequests`，不提前消费尾部资金。研究模式保留 `research-assumption` 与 `strictPit=false` 披露。结果携带经济输出的现行 `deterministicResultChecksum`，它不是公开 V3 结果 Schema 的验收凭据。

经济核验：初始现金 10000、申购本金 100、NAV 1.25，申购费 1、确认 80 份；赎回 10 份，费用 0.13、净回款 12.37；最终持仓 70、已结算现金 9911.37、权益 9998.87。同基金期末 NAV 改为 2 的配对冻结样本，基准收益为 0.6，持有 80 份的权益为 10059。严格和研究 T+1/T+2 均验证冻结重放；同一毫秒内未来净值、费用后现金不足、未可卖份额、预热申请、重复事件、时刻错配和超期重放均被拒绝。

## 验证记录

验证基线为 2026-10-01 当前共享未提交工作区。本叶没有提交、重置、清理或部署，未改共享 Spec、主 Task 或 handoff。并行 N2/E03 等写集在包级验证期间继续变化。

| 层级 | 命令/输入 | 最后结果 |
| --- | --- | --- |
| Domain 定向 | `pnpm --filter @thesis-ledger/domain exec vitest run test/nav-cutoff-boundary.test.ts test/nav-simulation.test.ts` | 15/15 通过 |
| Domain 包级 | `pnpm --filter @thesis-ledger/domain test` | 39 文件、324/324 通过 |
| Domain 类型/构建 | `pnpm --filter @thesis-ledger/domain typecheck`、`build` | 通过 |
| NAV 定向 | Server 的 `backtest-nav-offline`、`backtest-nav-domain-input`、`backtest-nav-snapshot-store`、`backtest-nav-input-plan` 四文件 | 最终 71/71 通过，其中本叶 15 项 |
| 本叶类型/编译 | `pnpm --filter @thesis-ledger/server exec tsc -p /private/tmp/thesis-ledger-n3-offline-tsconfig.json --outDir /private/tmp/thesis-ledger-n3-build` | 最终通过；包含离线入口、策略入口、专属测试及真实传递依赖，未替换或 mock 类型；排除并行准备/API/Repository 的其他入口 |
| Server 常规类型 | `pnpm --filter @thesis-ledger/server typecheck` | 最终阻塞：N2 新增 `NavBacktestPreparationUncheckedCreateInput`/`navBacktestPreparation` 尚无对应生成类型，准备 HTTP 测试的 `receipt` 合同也正在变化；此前 E03 测试类型阻塞已不再出现 |
| Server 常规构建 | `pnpm --filter @thesis-ledger/server build` | 未执行：沿用完整 tsconfig，会受上述公共类型门禁阻塞；本叶独立编译不替代常规包构建 |
| Server 包级 | `pnpm --filter @thesis-ledger/server test` | 较早基线 1923 通过、90 跳过；最终重跑 1918 通过、6 失败、90 跳过，另有一个文件导入失败。本叶四个 NAV 文件仍全部通过 |
| 超时隔离复核 | `vitest run test/backtest/v3-frozen-comparison.test.ts test/backtest/v3-research-execution.test.ts test/backtest/v3-runner.test.ts test/backtest/v3-sparse-tradability-runner.test.ts --maxWorkers=2` | 通过；保留最终全包失败记录，不将定向复核冒充全包通过 |
| 静态 | 本叶七个 TS 文件 ESLint；四个新实现额外启用 complexity=20、max-lines-per-function=220；Prettier | 通过；按事件校验职责提取后复杂度通过，无阈值或 ignore 变更 |
| 仓库边界 | `node scripts/check-boundaries.mjs`、`git diff --check` | 通过；Backtest 单向消费 Domain，现有门禁已覆盖，未新增跨 feature 依赖 |
| 目标运行态 | Docker、真实 Provider、API 创建、Worker 领取/终态、客户端 | 未执行，归 N2.5/6、N3 Worker 汇合和 N4 |

最后一次 Server 全包失败分组：准备 HTTP 断言 400/200 不符；新增 NAV migration 后数据库结构测试仍断言旧 head；Ledger 测试导入期间 `.prisma/client/default` 缺失；四个场内回归测试达到 5000ms 超时。前两组由 N2 写集维护，Prisma 生成和全包类型/构建由公共集成负责人收敛；四个超时文件在降低并发的独立复核中通过。本叶未修改这些文件、生成 Prisma 或提高超时阈值。

日志保存在 `/private/tmp/thesis-ledger-n3-domain-tests.log`、`/private/tmp/thesis-ledger-n3-server-tests.log`、`/private/tmp/thesis-ledger-n3-server-tests-final.log` 和 `/private/tmp/thesis-ledger-n3-timeout-recheck.log`。临时配置/编译产物不纳入仓库。

## N2.5 与 Worker 汇合合同

1. N2.5 持久化 NAV 专属配置、准备证据及精确 Snapshot 引用；不能把 NAV 配置交给现有仅接受场内 `RunConfigV3` 的创建/执行路径。当前 NAV Store 冻结读回提供 `{ manifest, context }`，其中策略、配置、模型、原文、事实和摘要必须由既有校验通过。
2. Worker 新 NAV 分支先调用 `LocalNavSnapshotStore.replay(runId)` 并核对业务记录的 runId、Snapshot contentHash 及 NAV/context Artifact 引用，再把读回结果传给 `runNavOfflineStrategyV3(frozen, signal)`。Reader、联网、准备和重新采集不进入离线执行函数。
3. 公共结果负责人先建立 NAV 可判别结果合同：支持 NAV 精确来源、可见性披露、费用/成交、估值及基准、期末 pending、模型/来源/结果摘要，并维护客户端消费。当前函数返回独立离线经济输出，不能直接赋给 `BacktestResultV3` 或现有 `BacktestV3Runner` 接口。
4. Worker 继续独立拥有投递、领取、attempt 原子提交、取消确认和晚到结果拒绝；传递 AbortSignal 只证明离线执行能停止，不证明数据库取消或终态安全。待公共合同就绪后进行领取到终态与断网重放验收。
5. 当前策略入口逐个日频决策时刻重放已产生的申请，作为确定性离线实现；大窗口 Worker 性能尚未验收。Worker 汇合需验证自己的资源预算，不能仅凭本轮受控样本认定运行态容量。

## 首次离线包的状态与停止点（历史）

本轮离线实现和专属验证完成；公共 NAV 结果合同、常规 Server 包级/类型/构建收敛、Worker 集成与目标运行态仍未完成。N3/N4 保持未勾选。后续由公共集成负责人先收敛 N2.5/Prisma 与结果合同，再实施 Worker 有界汇合；本轮到此停止，不推进其他 backlog。
