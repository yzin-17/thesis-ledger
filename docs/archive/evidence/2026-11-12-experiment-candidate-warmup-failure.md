# 实验候选预热与失败归因验证记录

后续清理说明：本文保留当时执行事实；专用 `--candidate-warmup` 命令及其复算程序已按用户要求移除，当前不再作为维护入口。必要的预热与失败留存回归测试继续保留。

## 已核对事实

2026-11-12（Asia/Shanghai）只读查询目标 API 与 PostgreSQL：

- 实验 `6e95c53a-f9a1-4c06-ac5a-cf6963bd36c0`，原实验 `f2120385-11f7-40b2-9ce5-d59279fcf209` 的副本；两个 AI 请求均成功，格式已接受。
- 开发 Run `3a90094d-595c-4b63-9b4e-a28af9fe2531`、`59cafab0-e59c-4089-9608-ac727623967f` 均为 `failed / DATA_UNAVAILABLE`，原价请求窗口分别从 2025-07-05、2025-09-23 至 2026-05-14。
- 原价父窗口身份 `1a5b4371819005d2bef096d438b6c779efa064cd4d14050ccf194f42a8508acb`，从 2025-10-31 开始；候选无法向前扩展冻结窗口。基线开发与验证 Run 均成功。
- 两个候选数据库状态仍为 `evaluating`，`runRefs`、`metrics` 均为空，实验终态为 `no_valid_candidate`。模型 Attempt 仍为成功；评估异常不能反向改写模型调用事实。
- API 返回 `HISTORICAL_REVEAL_UNKNOWN`；本次保留既有封存读取策略。原价失败发生在冻结窗口派生阶段，不能据此判定远端 Provider 返回错误。

## 实施与验证

准备流程在裁剪基线前保留执行父窗口，原价参考按父窗口读取；候选评估提取为独立 helper，切分完成立即提交，异常保存失败 Run 和原因，使用 `evaluating` 条件防止覆盖终态。模型成功记录保持原语义；移除评估后对模型 Attempt 的空操作调用。回测执行异常立即停止后续轮次，成功 Run 的无效摘要仍沿用原验证流程。

- 定向：`pnpm --filter @thesis-ledger/server exec vitest run test/backtest/price-research-warmup.test.ts test/backtest/price-research-subwindow.test.ts test/backtest/price-research-pair.test.ts test/strategy-optimization/strategy-optimization-candidate-evaluation.test.ts test/strategy-optimization/strategy-optimization-continuation.test.ts`，5 文件 18 项通过。覆盖 MA20／MA60、三段、独立来源、实际冻结派生与两次离线重放、超预算拒绝、开发／验证失败、终态覆盖拒绝及后续轮次停止。
- 回归：`test/strategy-optimization/strategy-optimization-evaluation.test.ts`、`strategy-optimization-proposal-stage.test.ts`，`test/backtest/price-research-snapshot.test.ts`、`backtest-configured-run.test.ts`、`v3-captured-research-preparation.test.ts`，`test/market/market-frozen-window-reader-v3.test.ts`，6 文件 48 项通过。其输入后续未变化。
- `pnpm --filter @thesis-ledger/server build`、本次源码／测试 ESLint、`node scripts/check-boundaries.mjs`、`node scripts/check-file-size-guardrails.mjs` 通过。尺寸检查有 6 个存量警告；本次修改的超阈值实验服务由 884 行缩至 878 行。没有新增跨 feature 依赖或旁路模式，边界脚本无需新增规则。
- 额外 `pnpm guardrails:complexity` 失败：Desktop 14 个 ESLint 错误，位于本次未修改的 `provider-account-access.ts`、`StrategyBacktestDetailSections.tsx`、`StrategyExperimentCandidateDiff.tsx`、`StrategyExperimentDetailSections.tsx`、`use-strategy-submission.test.tsx`，分别为未使用变量、对象默认字符串化和无 await。保持归属，不扩大为全仓通过。
- 新测试首轮暴露了测试期望遗漏既有错误前缀、投影后的 sourceId 变化；短窗口结果因统计指标不足可为 `partial`，现分别核对完整输入与离线结果一致性，不把行情准备成功等同于候选绩效通过。扩大测试窗口时补齐 `dataAsOf`；Server 首轮构建暴露新测试元组与索引可空类型，修复后构建通过。

运行态验收使用维护入口 `scripts/local-runtime/verify-price-research-live.mjs --candidate-warmup --run-id <候选开发任务> --output <绝对路径>`；只读原实验与候选，重新准备受控行情，开发／验证在临时快照内计算，不运行封存测试。失败留存在同连接 `pg_temp` 临时表内验证，事务提交自动删除。业务摘要新增覆盖 `OptimizationCandidate`。

## 最终补充验证

旧实验的克隆保留原 `runConfig`，仅修复新准备流程仍可能再次消耗模型调用后失败。因此在 Backtest 公开预算检查中验证两套冻结父窗口，实验在基线执行和候选生成前调用；旧配置不足时明确提示重新准备新建，原冻结事实不自动替换。对应单元断言及真实旧配置阻断均通过。

最终定向命令在上述五个文件基础上包含 `test/backtest/backtest-configured-run.test.ts`，6 文件 28 项通过。`pnpm --filter @thesis-ledger/server exec vitest run test/strategy-optimization` 为 37 文件、177 项通过，14 文件、51 项 PostgreSQL 测试因未指定隔离环境跳过。两组数字有重叠，不相加作为独立测试总数。最终构建和新增路径 ESLint 通过；既有回归输入未改变时复用结果。

维护脚本 `node --check` 通过。脚本仅接受已失败实验的候选开发 Run，在读取模式、容器归属、业务摘要、冻结读取、临时表及清理边界上都有运行断言；真实数据库临时表验证通过，不代表隔离数据库全套测试已执行。

## 运行态同步与构建干扰

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，无额外行为参数。首轮快更成功；审查后保留成功 Run 无效摘要的原迭代语义，并增加旧预算配置检查，需要更新产物。

中途两次正式入口失败：一次构建清理 `dist/test/ai` 时 `ENOTEMPTY`，一次构建退出成功但缺少 Server／Worker 入口。独立进程检查发现另一个 `scripts/test-journal-review-postgres.mjs test/strategy-authoring/authoring-postgres.integration.test.ts` 同时构建本仓 `dist`；没有清理其文件或终止其进程。等待该构建完成后再次执行同一正式快更入口，最终退出 0，Server／Worker 健康。没有放宽门禁或直接操作容器。

最终宿主及两个容器的四个产物 SHA-256 一致：

| 产物（`apps/server/dist/src/` 下） | SHA-256 |
| --- | --- |
| `backtest/backtest-run-preparation.js` | `1f4b6d601486090f8a9a69a611386b4e963f1332aa37b2f4f6960cff2e68c2f9` |
| `backtest/backtest-configured-run.service.js` | `30c2316549711c19fbb605f1b68ef93f009f4ab21df962648fea71c09b8d02f9` |
| `strategy-optimization/strategy-optimization-candidate-evaluation.js` | `1676ab70e015f5432afa753f42b7cd7985ff468f6f3375a9e8dbdfef7d8809d8` |
| `strategy-optimization/strategy-optimization.service.js` | `a2cd383f3d669f028b39e43850752a100f07d99c93c8765cb239a3f116816105` |

镜像保持不变，为容器可写层快更；未执行数据库结构或外部卷变更。

## 原候选的受控复算

最终命令（从主仓执行）退出 0：

```sh
node scripts/local-runtime/verify-price-research-live.mjs --run-id 3a90094d-595c-4b63-9b4e-a28af9fe2531 --candidate-warmup --output /tmp/experiment-candidate-warmup-final-20261112.json
```

真实路由修订 199，只采集两套价格父窗口；两者均从 2025-07-05 开始。候选阶段所有价格读取均带冻结引用，四段均完成快照构建、计算和两次一致的离线重放。没有运行封存测试。

| 原候选 | 切分 | 预热开始 | 权益点 | 原有评估规则结果 |
| --- | --- | --- | --- | --- |
| 1 | 开发 | 2025-07-05 | 117 | `partial / invalid`，无闭合交易 |
| 1 | 验证 | 2026-01-01 | 63 | `partial / invalid`，无闭合交易 |
| 2 | 开发 | 2025-09-23 | 117 | `complete / valid`，4 次闭合交易 |
| 2 | 验证 | 2026-03-22 | 63 | `complete / valid`，3 次闭合交易 |

候选 2 通过的是现有有效性规则，不代表收益优秀或新正式实验已经成功。候选 1 的无效摘要继续按原评估规则处理，不误当回测执行异常而阻断后续迭代。报告保留上市日期未知、公共收费源不可用及 3 项可选状态失败等既有警告；没有把未知补为正常。

真实 PostgreSQL 连接私有临时表分别注入开发／验证失败，均保存失败 Run 和具体原因，候选收敛 `invalid`；验证失败还保留已完成开发结果。旧配置预算不足在生成前阻断，新配置预算检查通过。

`businessStateUnchanged=true`；11 张业务表（包括候选）前后摘要一致，未创建 BacktestJob、未保存研究版本、未创建实验、未调用 AI。最初一次复算报告位于 `/tmp/experiment-candidate-warmup-20261112.json`，后续因增加旧预算门禁及明确核验候选有效性执行最终复验；当前结论以最终报告为准。

## 验收结论与写集

AC1—AC4、AC3a 通过。修改范围为 Backtest 准备／配置检查、实验 Run／候选评估／编排及错误契约、相关测试、维护核验入口与本组文档。维护指南和规格导航已同步，任务及本记录归档；当前规格保留。

本次没有修改界面或原生配置，浏览器四宽及 Native compile 不适用。未恢复真实实验，未执行封存测试或完整 AI 链路，不声称整个工作区通过。原业务记录、当前路由和其他未提交修改保留；未提交 Git 或推送。
