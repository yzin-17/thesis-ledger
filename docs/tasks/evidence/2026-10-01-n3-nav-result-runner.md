# N3 净值结果与 Runner 离线汇合证据

关联 [规格](../../specs/2026-10-01-n3-nav-result-runner.md)、[实施任务](../../archive/tasks/2026-10-01-n3-nav-result-runner.md) 与 [此前离线经济证据](2026-10-01-parallel-n3-nav-offline.md)。日期：2026-10-01。

## 结论与边界

R01 公开 NAV 结果合同与 R02 现行 Runner 的离线 NAV 能力已完成。消费 N1 冻结输入即可执行，不依赖 N2 准备、持久化 Run 或数据库。公开合同、结果投影、读取校验、精确产物引用和离线取消均已验证。

R03 的本叶定向、Schemas 包级、独立类型/编译、样式/复杂度和边界通过；Server 全包类型/构建最终被 N2 新 Controller 的类型错误阻断，保留未完成状态。未投递业务 Run，未修改 N2、Prisma、Worker 或客户端，未部署或提交。共享主 Spec/Task/handoff 保持只读，整个 N3/N4 未勾选。

## 变更文件

| 文件 | 内容 |
| --- | --- |
| `packages/schemas/src/backtest-nav-result-v3.ts` | `backtestNavResultV3Schema`、`BacktestNavResultV3`、统一执行结果读取 `backtestExecutionResultV3Schema` 与对应联合类型 |
| `packages/schemas/src/index.ts` | 追加独立合同导出 |
| `packages/schemas/test/backtest-nav-result-v3.test.ts` | 9 项公开合同正负例 |
| `apps/server/src/backtest/backtest-nav-result-v3.ts` | 日频权益/回撤/指标与基准投影；冻结身份、来源、模型、定价及结果校验和守卫 |
| `apps/server/src/backtest/backtest-nav-v3-runner.ts` | `LocalNavSnapshotV3Runner`、`BacktestNavV3RunnerInput` 与 `BacktestNavV3Runner`；真实 Store replay、完整 Snapshot/Artifact 核验及取消 |
| `apps/server/src/backtest/backtest-v3-runner.ts` | 现行 `LocalSnapshotV3Runner`/V2 提供 `runNav` 与 `navId`，可显式注入 NAV Store；缺能力时拒绝 |
| `apps/server/src/backtest/backtest-nav-offline-strategy.ts` | 输出逐日估值与申请原因，保留 risk 成交原因 |
| `apps/server/src/backtest/backtest-nav-offline-signals.ts` | 微秒可见事实、信号/指标输入及按 CN 本地确认日期计数的持仓周期；按职责提取以保持复杂度约束 |
| `apps/server/test/backtest/backtest-nav-v3-runner.test.ts` | 15 项真实 Parquet、公开结果、取消、错误引用、篡改和期末边界验证 |

## 结果语义与安全约束

NAV 结果显式携带 `inputKind=nav`、V3 版本、Run/策略/Snapshot 身份、冻结时点、CN/CNY 执行基金、申赎模型与摘要、精确 NAV 来源、可见性和研究披露、请求状态、待处理 ID、现金/份额、成交费用、交易、逐日权益/回撤/指标与同基金基准。

结果 Schema 拒绝 Bar 来源、场内价格协议、错误模型身份、未来微秒事实、预热申请、错配研究规则、缺确认经济结果和不一致的申请/成交/费用。期末 pending 与诊断不声明完整执行；研究模式明确 `strictPit=false`，严格发布时间模式仍要求独立来源 PIT 准入。`backtestExecutionResultV3Schema` 接受新 NAV 与现行场内结果；现有场内 `backtestResultSchemaV3` 未改写，现有场内 API/客户端迁移属于 Worker 汇合后的消费面。

`projectNavResultV3` 复用现行 Domain 分析内核，使用实际逐日权益和最终期末状态。结束日不是基金估值日时也追加真实期末估值点，不延伸到期末之后；持仓周期使用 CN 本地确认日期，避免 UTC 字符串日期跨日造成提前计数。成交保留信号或风险原因。

`verifyNavResultV3` 复核完整冻结身份、运行日期、来源、可见性、模型内容摘要和现行确定性结果校验和，并重新查询每条已定价申请对应的冻结可见 NAV。改写价格并重新计算校验和仍被拒绝。该校验和是现行结果一致性机制，不作为来源 PIT 准入证明。

Runner 读取完整 NAV/context Parquet 和原文关联，输入 Snapshot 两个摘要必须匹配 manifest；ArtifactRefs 必须包含且仅包含这两个完整引用，键、Artifact ID、摘要、格式、压缩和尺寸逐项一致。缺项、重复、额外项、改 ID、错路径与物理篡改都拒绝。执行前、读回后和结果发布前检查 AbortSignal；这只证明离线停止，不证明持久化取消/晚到结果安全。

## 验证

基线为当前共享工作区，全部改动由本对话保持在工作区，没有提交。并行 N2 文件在执行过程中继续变化。

| 检查 | 命令/范围 | 最后结果 |
| --- | --- | --- |
| Schemas 定向 | `pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-nav-result-v3.test.ts` | 9/9 通过 |
| Schemas 包级 | `pnpm --filter @thesis-ledger/schemas test` | 最终 49 文件、586/586 通过；日志 `/private/tmp/thesis-ledger-n3-result-schemas-final.log` |
| Schemas 类型/构建 | `pnpm --filter @thesis-ledger/schemas typecheck`、`build` | 通过；最终 Schema 源码更新后 build 再次通过 |
| Runner/离线/场内定向 | Server 的 `backtest-nav-v3-runner`、`backtest-nav-offline`、`v3-runner` 三文件，最后使用 `--maxWorkers=2` | 15 + 15 + 6 = 36/36 通过；新 Runner 额外边界修复后单文件再次 15/15 通过 |
| 独立类型/编译 | `pnpm --filter @thesis-ledger/server exec tsc -p /private/tmp/thesis-ledger-n3-result-runner-tsconfig.json --outDir /private/tmp/thesis-ledger-n3-result-runner-build` | 最终通过；包括现行 Runner、NAV Runner、专属与离线测试及真实传递依赖，没有 mock 或替换类型 |
| Server 常规类型/构建 | `pnpm --filter @thesis-ledger/server typecheck`、`build` | 中间基线均通过；最终均失败：`backtest-nav-run.controller.ts:14` 的 UUID `version: 'all'` 不属于项目安装类型允许的 `'3' / '4' / '5' / '7'` |
| Server 全包回归 | 全包 `test` | 本轮最终未执行：常规类型/构建仍失败，按验证分层停止高成本门禁；前次执行证据不冒充当前全包通过 |
| 样式/复杂度 | 本叶 TS 文件 ESLint、Prettier；实现额外使用 complexity=20、max-lines-per-function=220 | 通过；无阈值、ignore 或共享配置修改 |
| 仓库边界 | `node scripts/check-boundaries.mjs`、`git diff --check` | 通过；依赖继续由 Backtest 单向消费 Schemas/Domain，没有新增跨 feature 方向 |
| 真实运行态 | Provider、Docker、API 创建、Worker 领取/终态、客户端 | 未执行，仍归 N2.5/6、N3 Worker 与 N4 |

并行类型错误的所有权是 N2 新增的 Run Controller，本轮未修改。公共集成负责人修复后需重跑 Server 常规类型、构建和全包回归；不能以本叶独立编译代替这些门禁。

## N2.5 与 Worker 汇合接缝

1. 当前 N2 持久化的 NAV Run 和已冻结 manifest 可作为 `BacktestNavV3RunnerInput`。引用必须从业务记录的完整 manifest 构造，并在 Worker 领取后复核当前 attempt、Snapshot/准备身份。
2. Worker 可显式构造 `new LocalSnapshotV3RunnerV2(exchangeStore, navStore)` 并对 NAV 调用 `runNav(input, signal)`，或直接使用 `LocalNavSnapshotV3Runner`。NAV 结果的 engineVersion 使用 `navId`，不能使用场内 `id`。默认未注入 NAV Store 的实例不会自动开放能力。
3. Worker 结果提交前调用 `verifyNavResultV3(result, frozen)`；保存和读取 NAV 结果使用 `backtestNavResultV3Schema`，统一消费使用 `backtestExecutionResultV3Schema`。当前 Run 详情、队列能力开关及客户端的 NAV 结果消费需在该汇合叶明确接线。
4. 状态/attempt 原子提交、取消确认、晚到结果拒绝、重试收敛、Worker 领取到终态及真实 Run 验收仍由汇合叶实现；本轮没有启用投递。全包类型/构建先收敛，之后再执行这些更高成本验收。

## 最终复核

独立结果合同与现行 Runner NAV 能力均已实现并验证。当前剩余阻塞为 N2 写集中的公共类型错误及后续 Worker/消费面汇合；未把独立离线成功等同于整个 N3 完成，未继续其他 backlog。
