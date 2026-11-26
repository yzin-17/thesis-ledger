# 空交易计划修复与冻结回测证据

关联[规格](../../specs/2026-11-15-empty-trade-plan.md)与[任务](../tasks/2026-11-15-empty-trade-plan.md)。

## 根因与修复

原 `exchangeSizing` 直接把 `strategy.tradePlan` 对象作为分支条件。没有计划时按下一可执行 K 线开盘价计算数量，有计划时按信号日收盘价计算；即使只有 `stages=[]` 也会切换分支。Domain 执行器和中文说明也使用对象存在判断，导致空壳配置被当作已启用计划。

新增 Domain 的 `activeBacktestTradePlan` 统一业务判定：仅含 version／evaluation／空 stages 的计划返回未启用；包含阶段或其他显式功能配置的计划保留原对象。Server 仓位与计划输入、Domain 执行器及中文说明复用该判断。保存定义保持原样，不从历史版本删除空计划。

## 本地验证

- Domain 包测试：93 文件、905 项通过，包含新增空计划判定与执行等价测试、既有计划与中文说明测试。原定向命令的包脚本实际执行了完整 Domain 测试，按实际覆盖记录，不重复运行。
- Server 定向：`pnpm --filter @thesis-ledger/server exec vitest run test/backtest/empty-trade-plan.test.ts test/backtest/trade-plan-worker.test.ts test/backtest/trade-plan-model-evaluation.test.ts`，3 文件、4 项通过。
- 新冻结 Runner 样本在收盘 10、下一开盘 20 的跳空中，以 50% 权益、开盘价 20 定数量；空计划／无计划的全部成交、权益、指标、回撤、拒单与警告一致，重复冻结回放一致。冻结后行情读者会抛错，执行通过本地快照完成。
- Domain build、Server build 通过；本次 9 个 TypeScript 源码／测试文件 ESLint 通过，无警告。
- import boundaries、workspace dependency graph（8 packages）、file-size guardrails 均通过；新增冻结核验脚本语法通过。

## 部署与实际验收状态

从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行正式 `./scripts/sync-code.sh thesis-ledger`，最初两次退出码 1：部署锁由另一实际验收任务持有，未执行应用更新。只读核对 PID 23475 的进程为 `run-backtest-trade-plan-acceptance.mjs` 的 volatility-target／authoring-modification 验收；未删除锁、终止进程或绕过正式入口。

确认锁释放后，第三次正式入口取得锁并开始构建，但 Server build 被并行新增的 `volatility-analysis-model.integration.test.ts` 拦截，调用参数缺少 apiKey／timeout，退出码 1。此前本任务 Server build 已通过，该失败对应随后出现的共享工作区输入变化，未更新目标容器。

并行任务先补齐 timeout。本任务尝试补齐 apiKey 时初用 undefined，不符合必填 string 合同，构建仍失败；核对生产调用后确认应复用 `runtime.apiKey`，此时并行任务已保存相同修正，保留其最终代码，不触发新的模型调用。随后一次本地补建遇到 `ENOTEMPTY: dist/test/market`，没有手删构建目录或据此认定业务错误；确认无持锁任务和构建进程后，再次从正式快更入口构建。此过程的类型与产物错误不记为空计划语义测试失败。

最终正式快更在 2026-11-15 19:50（Asia/Shanghai）退出 0：完成 workspace／Server 构建和两端产物同步，Server／Worker 均健康，镜像 ID 保持不变，未执行数据库结构或卷变更。输出在会话压缩时未直接可见，后从原始工具回执恢复退出码及成功日志，并通过下述独立运行态核验确认，未重复部署。

容器 Domain 使用 pnpm 部署目录，通过 `require.resolve('@thesis-ledger/domain')` 定位。首次只读检查假设 `/app/packages/domain/dist/index.js`，返回模块不存在；修改核验脚本的路径解析后再执行。该路径错误没有产生业务写入。报告以逻辑模块路径标识摘要，读取实际安装路径；四个模块在 Server、Worker、宿主机构建之间完全相同：

| 模块 | SHA-256 |
| --- | --- |
| Domain `backtest-trade-plan-contract.js` | `248ff94a1af3aeaff4284178ab20e666c19caec7fa2d93c52a60e3d10f0dd7d4` |
| Domain `backtest-engine.js` | `742b6689047b916a2ef10f4703cd82956fcdf1215434aa6ae8376feaac226ee2` |
| Server `backtest-exchange-sizing.js` | `7323d37d9965386c0e01116ac10e1afdaad19a99a37ba3fff103bdbd7c4e8e11` |
| Server `backtest-trade-plan-execution.js` | `3b54ff11f9193a5de963c791891c1f8e698b3f6b9e6477219682c89df71c25d1` |

两端独立执行空计划得到未启用，配置 initialStop 的计划得到启用。快更只更新容器可写层，不作为镜像发布证据。

## 同一冻结行情的正式回测

业务核验入口为 `scripts/local-runtime/empty-trade-plan-replay.mjs`。实际命令：

```sh
rtk proxy node scripts/local-runtime/empty-trade-plan-replay.mjs --receipt /tmp/empty-trade-plan-replay-20261115.json --apply
```

脚本退出 0，正式预检 ready 后提交并等待新任务成功。本轮仅新增一个回测，未调用 AI、重新冻结或修改策略；报告权限 0600，SHA-256 为 `c504c47436d212c4d95c3ee5fc75682f779eed26071c70d421990b42ac972c3a`。

| 核验项 | 结果 |
| --- | --- |
| 原策略／版本 | `55f66224-9c77-4773-99c0-630850b47a7d`／v3 `893ddc7e-1e8e-4f4d-a4a5-6668d340b097`；定义保留空 stages |
| 原回测 | `9c7efea9-9242-494b-8bec-cef825ed4b1d`，保持成功及原结果 |
| 新回测 | `becd48cb-c24a-4a63-8096-3cc873ec82a5`，succeeded |
| 完整 RunConfig | 深度比较相等；历史区间、资金、dataAsOf、冻结窗口及执行协议均未变 |
| 冻结执行行情 | 282 对 282，逐字段比较：0 行差异，0 缺失，0 新增 |
| 可比数据指纹 | 同为 `8bd11e820a65fd17839451ff6dc5c707866268e020124e6392d9872df5c136cb` |
| 成交 | 29 笔：15 买、14 卖；23 笔信号成交与 6 笔风险退出逐笔验证 |
| 交叉方向 | 价格上穿 EMA20 买入、下穿卖出；全部在下一可执行日开盘成交 |
| 风险退出 | 4 笔达到 3% 固定止损，2 笔达到 10 周期持仓上限；卖出均有持仓 |
| 旧记录保护 | 原策略、6 个版本、12 个回测、关联实验／候选／尝试／AiRun 及两次 AI 编写操作前后摘要相同 |

首笔于 2025-12-15 09:30（Asia/Hong_Kong）以同一后复权模拟开盘价 `3386.532691239` 成交。旧空计划按信号收盘价分配数量 `14.5316061499479360249324635437491171433251`；修复后按 `50000 / 3386.532691239` 得到 `14.7643636009628932589476864763894591124568`，与无计划路径一致。这是后复权模拟数量，不能解读为实际港股交易手数。

新增回测净收益率为 `-17.512659878895377982%`，期末研究权益 `HKD 82487.340121104622017644408206911306671843658180293842`；旧 v3 保留 `-17.6660046229%`。新结果的全部成交日期、方向、数量、价格和退出原因与原无空计划 v2 回测 `ec5dd526-7083-4697-980a-3c209ca91dce` 一致。末尾仍持仓，已平仓 14 笔；数量差异消除不表示策略盈利或保证未来收益。

## 最终复核

AC1—AC4 均通过。修复覆盖统一判断、仓位、执行输入、运行时与中文说明，保留有效计划行为和历史定义；只在原版本下追加回测记录。两端真实代码、正式业务结果与本地冻结样本分层记录，构建及路径失败事实保留。未执行其他并行模型验收，不将本轮结果扩展为全仓或其他模型验收通过。
