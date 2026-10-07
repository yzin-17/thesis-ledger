# E01 执行面收口

## 有界执行包

遵循 Canonical Spec/Task，接续 C01/C02/C03/C04 与 I1/N1–N4 完成证据。保留三仓未提交修改。本轮只收敛 Server/Worker 执行接线与旧 Runner 算法分派，不扩大 Market、Provider 或客户端整体迁移范围。

实际调用矩阵：Controller → BacktestService → BacktestRunService → runBacktestAttempt；Processor 经 prepareBacktestExecution 调用同一链路。场内 Snapshot Builder/Store → 场内 Runner → runExchangeVertical → Domain 场内经济核心；NAV preparation/create/freeze → BacktestNavRunExecution → LocalNavSnapshotV3Runner → NAV 离线经济内核。两种资产共享当前持久化状态机，按冻结资产合同分工。

剩余问题：场内 Runner 基类默认 instant-v1，生产 Server/Worker 注入其日期对齐子类；基类保留旧重放算法选择和未在生产配置的 NAV 转发。Benchmark 同时保留瞬时和日期对齐分支。BacktestService 的当前 Run 依赖仍命名为 v2Runs。

计划写集：场内 Runner、Benchmark/对齐 helper、Server/Processor Module、BacktestService、直接消费这些接口的测试与目标验收脚本；按当前语义删除旧分支及冗余 NAV 转发。保留 `thesis-ledger-v3-local-runner-v2` 和日期对齐 convention 字符串，以免现有当前冻结结果身份变化。旧 Run/Snapshot 不新增兼容读回。

验收顺序：Runner/Benchmark/NAV、时序/费用/公司行动与状态机定向 → Server 包级、类型/build、边界/复杂度 → 隔离 PostgreSQL/真实 Worker/NAV → 官方快更 → 目标冻结重放、HTTP 与原记录摘要不变。未变化的真实来源/浏览器证据复用 I1/N4。

## 实施结果

- 场内只有 `LocalSnapshotV3Runner` 一个实现；Server 和 Processor Module 注入同一类。删除子类、instant-v1 参数与分派、旧瞬时基准算法，以及场内类中的 NAV 转发。保留生产引擎标识与日期对齐 convention；日期对齐仍逐条核验 decisionAt，微秒未来可见性拒绝没有放宽。
- NAV 仍由既有独立 Runner、Store 与经济内核负责。NAV 测试直接调用真实生产使用的 NAV Runner，移除未配置转发器的专属测试。
- 删除无生产消费者的 `backtest-v2-execution.ts` 再导出入口；四个经济回归直接消费场内执行模块。`backtest-v2-execution-exchange.ts` 与 `backtest-v2-execution-shared.ts` 仍拥有现行经济编排及冻结事实 helper，存在实际场内/NAV消费者，保留其职责，不凭名称删除。
- `BacktestService` 的依赖改为 `runs`，各操作继续委托同一 RunService/attempt 状态机。Snapshot Builder 只构造当前场内冻结输入；NAV 使用自身冻结来源。没有新增第二套状态机或旧资产 fallback。
- 边界门禁新增场内 Runner 不得依赖 NAV 编排规则，并禁止再次 import 已删除的旧执行聚合入口。当前证据的内部版本字符串保留。

## 验证结果

| 层级 | 输入与命令 | 结果 |
| --- | --- | --- |
| 定向经济/执行 | Runner、Benchmark、NAV Runner、Run execution、稀疏状态/基准、场内执行/权益/指标/仓位 | 10文件66项通过 |
| 最终定向复验 | 当前 Benchmark、恢复/预算/取消/CAS、拆分映射、单位合同与日历 HTTP | 7文件47项通过；1个未启用 HTTP 环境用例跳过，隔离实际 Worker 另行验收 |
| Server 包级 | `pnpm --filter @thesis-ledger/server test` | 247文件2011项通过；30文件110项环境门控跳过，不计通过 |
| 类型与构建 | Server typecheck/build | 通过 |
| 模块门禁 | `node scripts/check-boundaries.mjs`、`node scripts/backtest-v2-isolation-audit.mjs` | 边界通过；157文件隔离审计通过 |
| 代码质量 | 修改生产模块 ESLint、Runner/Benchmark/helper 复杂度20与函数长度220检查 | ESLint通过；Runner/helper无警告。Benchmark保留既有复杂度债务24/27，删除分支后未增加职责或文件规模，没有提高阈值或忽略规则 |
| 场内隔离运行态 | `C02_POSTGRES_ISOLATED=1 C04_WORKER_ISOLATED=1` 执行 v3-postgres-isolation 与 v3-worker-runtime | 2文件5场景通过：完整迁移、幂等/并发/CAS、冻结重试、真实生产 Worker/BullMQ、离线重放与真实账户账本不变 |

真实 Provider/业务边界继续复用 I1.6 与 N4，受控 DSA/隔离测试不替代这些来源证据。当前源码改动没有改变结构、依赖和冻结证据格式，目标更新选用官方 `sync-code.sh thesis-ledger`，镜像发布仍归 D01/D02/D03。

NAV 追加隔离验收：`E01_N3_POSTGRES=1 pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-nav-worker-postgres.integration.test.ts`，3场景通过：实际 Queue/Worker 重复投递进入公开成功终态、PostgreSQL 取消标记拦截晚到 NAV 结果、可重试故障三次尝试后 failed。场内与 NAV 合计8个隔离运行态场景通过。

最终源码反查：Server src/test 无双 Runner 类、基准算法参数、瞬时对齐分派、旧执行聚合 import 或 v2Runs 依赖。Market 中 `market-pit-evidence-instant-v1` 是时间精度证据工具，不属于已删除的基准算法分派。现行 Exchange/shared 模块与 NAV 所有权已按真实消费者对账。

## 目标验收及收口

官方 `./scripts/sync-code.sh thesis-ledger` 兼容性预检、构建、可写层同步及健康等待通过。`node scripts/c04-target-acceptance.mjs` 新增单一 Runner/无 NAV 转发检查与 Runner、Benchmark、对齐 helper、Server/Processor Module 一致性核对，最终通过：

- Server/Worker 共26个模块与本地当前编译产物逐字节一致，检查实际入口目录 `/app/apps/server/dist/src`；旧 Runner 子类与场内 NAV 转发均不存在。
- 1条场内和6条 NAV 当前成功记录完整物理重放，结果校验和与已持久化值相同；当前 API 响应严格解析、列表可见。场内 checksum 仍为 `733135b633176f64`，NAV 六条分别为 `e0a6ec6408921692`、`466917da7b8c572b`、`3c8e6809057cd276`、`05ba89ea99d1872b`、`6446975b5a5b338e`、`92f694dbabe2afbf`。
- 35条旧 Run 单项均409且不进入当前列表；篡改与严格 PIT 伪造证据继续拒绝。HTTP 遇429按 Retry-After 等待56/60秒，随后完成真实响应核验，429不计入合同拒绝。
- 目标 BacktestJob 43行，完整摘要前后均为 `459bf78cc2db44b8a984f6524df11698`。未创建新业务 Run、修改原记录或调用外部 Provider。

镜像仍为 `sha256:ed7f1174ba5e6d2bfe944cc4aa7166afe2c2c435feaffaf56e9651866c9896a3`；快更不代表镜像发布。本轮 E01 及其一致性对账完成，保留 E02/E04、U01/U02、D01/D02/D03 和关联多来源业务门禁。下一阶段为 E04-a 与 E02 Data 生产/读取配对，见[剩余顺序](2026-10-02-canonical-remaining-order.md)。
