# 实验期末结果与采纳验证记录

本次实施已验收归档；以下结果保留当次输入和运行环境边界。

## 基线与范围

用户确认保留下一交易日开盘执行，采用期末持仓市值结算，修复一致性误判和测试结果展示，并允许全部完成候选采纳。当前规格与[实施任务](../tasks/2026-11-12-experiment-result-adoption.md)分别维护合同和状态。

真实实验 `71bbc0a2-89ae-48eb-938f-0b7e534aecb2` 的封存范围为 2026-08-14～2026-11-11。基线 Run `67943f4a-01f1-4099-8552-f37e6104f40d`，两个候选 Run 分别为 `47c60fd0-839e-4c41-aeda-bc4b6087e9e9`、`a31fb0c0-cfed-41f1-b2c1-5cdae2bf7853`。修复前只读对比：参与比较的差异只有 `instrumentFacts/HK-00700.HK.parquet` 的 `historicalTradabilityWindows`。基线含 74 日、候选含 100 日；裁剪为实际测试期后，62 日证据完全一致，来源事实也一致。原始候选 1 实际 3 笔平仓、收益 -4.683470958%；候选 2 买入后未平仓、收益 -0.695150001%，无平仓指标导致旧结果 partial。

## 实施边界

- Domain 无平仓指标仍返回 `NO_CLOSED_TRADES`，不再因此降低整体数据完整性；估值和持仓原逻辑保持，不增加或改写成交。
- Server 仅在最后估值时点把 `DAY_EXPIRED` 的公开结果投影为 `BACKTEST_WINDOW_ENDED`，中间时点和缺乏边界证据时保持原错误。原始模拟拒绝事件不改写。Runner 标识更新为 `thesis-ledger-v3-local-runner-v4`。
- 比较 helper 解析并校验嵌套交易证据，复用 schemas 的裁剪函数，仅改变比较视图。完整冻结产物与哈希保持。
- 评价不合格或真实指纹冲突时，保留实际数值但移除评分。旧汇总通过受当前 Run 读取合同约束的批量读取补充真实指标，保留原状态和历史原因，不写数据库；缺失、错版本或损坏 Run 不补值，也不把占位零当事实输出。
- 共享 schemas、Server 受理及事务、Desktop 两个入口和 Mobile 统一按评估终态决定采纳；收益、评分不作保存门槛。未完成、未揭示、结构、哈希、来源、幂等、重复采纳和当前版本校验保留。
- 从零实验其他候选可继续发布同一策略的后续版本，使用实际当前版本确认；第一版采纳不会永久阻断其余候选。

## 已完成的检查

执行目录均为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`，命令使用项目 pnpm。

| 范围 | 命令或检查 | 实际结果 |
| --- | --- | --- |
| Domain 包 | `pnpm --filter @thesis-ledger/domain test` | 77 文件，825 项通过 |
| Schemas 包 | `pnpm --filter @thesis-ledger/schemas test` | 145 文件，1581 项通过；包含 JSON 新增／删除字段差异的传输回归 |
| Server 定向与实验领域 | `pnpm --filter @thesis-ledger/server test test/backtest/v3-window-end.test.ts test/backtest/v3-frozen-comparison.test.ts test/backtest/comparable-tradability.test.ts test/backtest/v3-runner.test.ts test/backtest/v3-run-execution.test.ts test/backtest/v3-research-execution.test.ts test/strategy-optimization` | 44 文件，221 项通过；16 文件／64 项按环境跳过 |
| 隔离真实 PostgreSQL | `COMPLETED_ADOPTION_POSTGRES=1 pnpm --filter @thesis-ledger/server test test/strategy-optimization/completed-adoption.postgres.integration.test.ts` | 4 项通过；每种终态均实际发布 v1、同键重放、拒绝同候选重复采纳，再采纳第二候选为 v2，并复核原键仍找回 v1；AI 表为零 |
| Desktop 定向 | `pnpm --filter @thesis-ledger/desktop test src/features/strategy/strategy-experiment-detail.model.test.ts test/strategy-experiment-detail.test.ts test/strategy-experiment-rename.recovery.ui.test.tsx`；另执行 `test/strategy-experiment-candidate-diff.test.tsx` | 4 个独立文件共 26 项通过 |
| 类型与构建 | Domain、schemas、Server、Desktop build；Server、Desktop、Mobile typecheck | 均通过；正式快更仍须通过运行态验收 |
| 定向 ESLint | 修改的 18 份生产代码，`--format json` 复核 | 退出 0，无文件诊断；React Native 依赖 Flow 解析向 stderr 输出三条提示，未改或关闭规则 |
| 依赖边界与文件尺寸 | `scripts/check-boundaries.mjs`、`scripts/check-file-size-guardrails.mjs` | 通过；尺寸检查保留 5 项既有警告，未提供 Git 基线，不扩大为全工作区无增长证明 |
| 差异卫生 | `git diff --check` | 通过 |

隔离 PostgreSQL 使用仓库 `nav-postgres.integration-harness.ts`，唯一名称与标签、完整迁移链、应用角色及 finally 清理，不连接真实应用数据库。没有在真实实验执行采纳。

开发期首轮验证发现新增案例缺少 fixture 的实际策略摘要，补齐后通过；旧 Runner 测试仍断言末尾 `DAY_EXPIRED`，按新公开合同更新，原始模拟事件测试保持。Desktop 两项旧资格断言按新合同更新。Domain 类型构建发现可空 reason，保持未知原因仍判 partial 后修正。工作区并行新增 Arena 导出曾导致 Server 类型检查使用旧构建产物，重建相应包后通过，没有修改该并行领域源码。

## 运行态与页面

从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 使用 `./scripts/sync-code.sh thesis-ledger`，无附加环境参数。首次因已有正式更新锁退出 1，未移除锁或绕过入口。独立文档和包级检查完成后锁释放，正式快更退出 0。页面验收发现 JSON 差异兼容问题后，补齐定向与包级验证，再以同一入口同步新增合同，最终退出 0。Server、Worker 均 healthy；镜像 ID 保持、数据库结构和外部卷未改，是可写层快更，不是镜像发布。

独立核对两容器与宿主的九份编译文件：Backtest 的比较 helper、运行服务、Runner，实验结果事实投影、采纳事务、实验服务，Domain analytics，以及 schemas 读取策略和实验合同。全部 SHA-256 一致，按有序路径和摘要集合计算的组合摘要均为 `3754ccc7a97de4789de5d40a0889fec54025d7b378dd6ec19fda63ddace84f1c`。首次核对误用宿主的 `packages/*` 路径，未得到证据；按运行态实际包解析路径纠正后通过。

### 原冻结输入的离线验证

在运行容器内只读加载原三个 Run，使用正式 `BacktestRunService.comparableDataFingerprint` 与新 Runner 计算，不创建 Run、不提交计算结果。覆盖 `globalThis.fetch` 为立即报错并计数，实际为零次；运行后逐条核对原 `result`、`resultChecksum`、`snapshotManifest` 均不变。

三个新的执行期比较指纹均为 `2b2892a25681c7f03564fbe9e07ceaa1c1a6e4ebb023619fae0b0d74cc7add18`，确认原误判解除。新计算结果如下，原存储结果保持历史值：

| Run | 新计算完整性 | 平仓／成交数 | 收益 | 期末 HKD 资产 | 期末信号 |
| --- | --- | --- | --- | --- | --- |
| 基线 | complete | 30／61 | +2.800823951% | 102800.823950774… | 卖出待执行，`BACKTEST_WINDOW_ENDED` |
| 候选 1 | complete | 3／6 | -4.683470958% | 95316.529041771… | 无 |
| 候选 2 | complete | 0／1 | -0.695150001% | 99304.849999052… | 卖出待执行，`BACKTEST_WINDOW_ENDED` |

新计算没有增加成交，估值末日仍为 2026-11-11。候选 2 的新完整性为 complete；原冻结结果里的 partial 不改写，读取投影保留其 `resultCompleteness` 并解释期末持仓，不能把新计算冒充原运行结果。

### 真实页面和审阅

原实验 `compare` 实际 HTTP 200，两个候选的测试收益、回撤和平仓数由原冻结 Run 返回；候选 1 显示测试 3 笔、-4.68%，候选 2 显示测试 0 笔、-0.70% 及期末持仓说明。两者均有“审阅并采纳”。旧评价状态与原原因明确标为历史评价，不拦截保存。

真实页面在 `http://localhost:5173/strategy/experiments/71bbc0a2-89ae-48eb-938f-0b7e534aecb2`，使用 `/tmp/verify-experiment-result-adoption.cjs` 检查 1440、1024、768、390 宽度。每种宽度均检查两个候选入口、实际指标、两个审阅上下文、确认按钮可用、键盘聚焦、取消、两页签切换、差异展开与收起、无页面横向溢出；拦截全部非 GET 请求，实际写请求为零。截图与结果在 `/tmp/experiment-result-adoption-qa`，包括 `results.json`；代表桌面和窄屏截图已视觉检查，后修正模型名及评价文字换行，最终四宽重验通过。

首次浏览器核验使用了不存在的实验 h1，后来按实际页面按钮定位；服务端上下文 HTTP 200 仍无法打开审阅，实查为 `before/after` 的 undefined 字段在 JSON 中省略，而 Zod 4 旧合同要求两侧存在。新增／删除字段改为允许缺少一侧、仍拒绝双侧缺失；真实上下文和隔离事务均验证 JSON 往返。另收敛了相关审阅和候选差异的线框分组，保留原交互。补充 ESLint 发现旧 `String(unknown)` 问题，改用字符串原值及 JSON 值显示后通过。

### 真实业务保护

正式同步和浏览器核验前后，按稳定行 JSON 顺序计算以下表的数量与 MD5，全部一致：

| 表 | 前后行数 | 前后内容摘要 |
| --- | --- | --- |
| Strategy | 119 | `c6399415dbdcf0c183e3934bde0275a7` |
| StrategyVersion | 150 | `1beb5a16747b0d874c010e43cdc93da5` |
| BacktestJob | 151 | `e84f9849000dc4737971040448b2e63c` |
| OptimizationExperiment | 19 | `8e3d16589393d48750b02eb230c7ee58` |
| OptimizationCandidate | 14 | `7674ef16e20208237ca713022cfad3e7` |
| OptimizationAttempt | 23 | `86a8979249479bf958ba4fb3a4de52b3` |
| OptimizationAdoption | 1 | `8d7644bd3e3240faff115126926309cb` |
| AiRun | 41 | `744719f5b11ca31d540492f088b1d469` |

没有新增模型调用、真实采纳或回测任务，也没有改写原实验和冻结事实。独立隔离数据库中的采纳记录已随测试容器清理。

## 最终审查

AC1～AC5 均有对应本地、隔离数据库和真实运行态证据。共享规则同步覆盖 Desktop 两个入口及 Mobile；本轮没有原生依赖或工程变更，Mobile 仅声明类型检查和共享合同覆盖，不声明原生设备验收。依赖方向保持；没有新增边界旁路，既有门禁通过。未执行全仓全部领域测试或生产镜像构建，未提交、未推送。

回滚时只撤回本专题源码增量，再使用正式 `sync-code.sh thesis-ledger`；新建的比较和事实读取模块有明确 Backtest／StrategyOptimization 所有权。不回滚或删除业务表，不覆盖其他工作区任务的修改。本专题无未决实施或新增延期事项。
