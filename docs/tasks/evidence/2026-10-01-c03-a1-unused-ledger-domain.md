# C03-a.1 旧 Ledger 领域导出清理证据

> 所属任务：[Canonical Task](../2026-09-29-thesis-ledger-canonical-runtime-replacement.md) C03；合同依据：[Canonical Spec](../../specs/2026-09-29-thesis-ledger-canonical-runtime-replacement.md) §3，以及 [C01 库存](2026-10-01-parallel-c01-runtime-inventory.md)。
> 用户已确认进入 C03-a；共享主 Task、Spec、handoff 继续只读。状态由本文件提供给主线汇合，不自动勾选 C03 父项。

## 执行包与粒度核对

C03-a 拆为三个独立结果：a.1 无消费者旧 Ledger 导出；a.2 旧 RunConfig decoder/别名及共享类型解耦；a.3 旧 runBacktest 与同文件现行 runExchangeSimulation 职责收敛。后两项需要分别保持现行经济测试及依赖合同，本轮只实施 a.1。

- 结果：公共 Domain 不再导出无信封判别、number 金额的旧 LedgerEvent/投影算法；现行 Decimal 账本、交易和 NAV/SimulationLedger 能力保持可验证。
- 写集：删除 `packages/domain/src/ledger.ts`；从 `packages/domain/src/index.ts` 去掉该再导出；删除旧算法专属测试；将原测试文件内证券代码标准化用例原样保留到 `packages/domain/test/symbol.test.ts`；本证据文件。
- 启动依据：2026-10-01 19:58:37 +08:00，在 apps/packages/services/scripts 的1422个源码/测试输入核对六个旧导出。具名import仅命中旧 `packages/domain/test/ledger.test.ts`，没有生产消费者；同名 Server projectFifo 是模块内函数，projectCashBalances 是现行现金投影，不属于删除对象。
- 保留输入：当前 `ledger-v2.ts`、trade-projection、trade-costs、SimulationLedger、NAV、Server/Import/Portfolio、Schema/migration、客户端与所有并发WIP；不按V2文件名删除。
- 验证：先证券代码及现行账本/交易/模拟/NAV定向回归，再 Domain 全包、类型/build；下游 Server/API Client/Desktop 类型；最后限定格式/lint、边界及依赖门禁、差分核对。
- 停止条件：本叶完成或出现非本叶失败/跨写集依赖。a.2/a.3 与父C03状态保持开放，不自动实施。

## 改动与验证记录

执行完成（2026-10-01 20:02:11 +08:00）。本叶删除242行旧领域实现和7项旧算法测试；原9项证券代码标准化用例原样转入symbol.test.ts。index.ts仅删除旧Ledger再导出一行，保留开始时已有的5行新增导出。当前ledger-v2、Server投影和SimulationLedger源码未修改。

| 验证 | 命令／断言 | 结果 |
| --- | --- | --- |
| 定向回归 | `rtk proxy pnpm --filter @thesis-ledger/domain exec vitest run test/symbol.test.ts test/trade-projection.test.ts test/trade-costs.test.ts test/simulation-ledger.test.ts test/nav-simulation.test.ts` | 5文件52项通过；涵盖证券代码、现行交易成本/投影、SimulationLedger、NAV经济能力 |
| Domain全包 | `rtk proxy pnpm --filter @thesis-ledger/domain test` | 39文件317项通过；总数相对此前324减少7项旧算法专属测试，当前经济测试未删除 |
| Domain类型／构建 | Domain `typecheck`、`build` | 均通过 |
| 下游类型 | Server、API Client、Desktop各包 `typecheck` | 均通过 |
| 公共导出 | 导入 `packages/domain/dist/index.js`，断言projectAverageCost/projectFifo/projectCashBalance不再导出，SimulationLedger继续存在 | 通过；旧类型声明随旧源模块及再导出移除，包类型检查通过 |
| 限定静态门禁 | index.ts、symbol.test.ts的ESLint；两文件及本证据的Prettier | 通过；没有全仓格式化 |
| 仓库边界／依赖 | `rtk proxy node scripts/check-boundaries.mjs`；`check-workspace-dependencies.mjs` | 通过；8包依赖图通过，不涉及跨feature依赖方向改变，无需新增边界规则 |
| 差分与输入 | 限定git diff --check；逐文件比对1422个初始输入；index/证券代码用例原文比对 | 通过；初始集合中本叶之外0变化，两个旧文件删除和index单行移除符合写集，证券代码用例保持原文 |

没有运行或宣称Docker、目标HTTP、Provider、浏览器、Electron或数据库验收。本叶删除的是无生产消费者的纯Domain旧导出，不改变持久化或运行协议；这些目标门禁仍归Canonical对应阶段。没有暂存、提交、清理生成目录或覆盖并发WIP。

## 后续叶与停止点

- **C03-a.1：本地完成。** 主线可引用本证据汇合；共享Task/Spec/handoff未写入，C03/C03-a父组不自动勾选。
- **C03-a.2：旧RunConfig解码合同收口。** 先将现行共享经济字段/校验及Server `backtest-v2-execution-shared.ts` 的RunConfig类型从旧解码器依赖中分离；当前Schema的validateStrategyRunConfig仍引用该类型。再移除runConfigSchemaV2、无版本alias/type，并迁移仍验证现行经济行为的Schemas/Server受控fixtures，保留当前创建拒绝旧输入的负例。该结果需独立Schema/Server定向及包级验收，不能删除整个backtest-v2文件或现行策略AST2。
- **C03-a.3：旧回测入口收口。** `backtest-engine.ts` 中runBacktest及旧BacktestBar/Strategy结果与当前runExchangeSimulation同文件；先逐helper确认所有权，删除仅旧入口调用的simulateAStockExecution及旧专属用例，保留现行场内/NAV、费用/公司行动/基准golden，独立Domain与Server执行回归。

本叶在a.1完成后停止，a.2/a.3需以各自执行包接续；未实施C02/C04/E02/E04/U01/U02或整个backlog。
