# S05 稳定输入构建与本地门禁证据

## 终态与范围

`S05-window-local-gates-0928 / blocked / needs_split`。Server build、模块边界、workspace 依赖和普通 owned ESLint 已通过；本批两个 Schema 函数复杂度分别为 66 与 27，超过实际阈值 20，需新的有界语义拆分任务。本叶不修复源码，不关闭本地集成门禁。协调者明确要求将本批新增复杂度视为当前缺口，即使仓库脚本配置为 warning，也不能接受为完成。

依据：[主 Spec](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md) §6、AC12/AC15 与 [主 Task](../2026-09-25-multi-source-adjustment-aware-backtest.md) §12.8。工作区为 `main / fe0e871e37a09964f7a113b82e7d09f6d4d95f7e` 的既有脏工作区。本叶仅写本文、`/private/tmp/s05-window-local-gates-0928-*` 日志及快照；Server build 产生可重建的 dist。无 source/test/config/lockfile/台账修改，无 stage、commit、reset 或 clean。全部命令已结束，构建及静态门禁执行资源已释放，本 dispatch 关闭后不得复用。

RTK、Codex 规则已读，Shell 均经 RTK。Context Mode 工具发现不可用，日志存入临时文件，仅回传结果和警告。

## 输入核验与证据复用

[前一稳定集成证据](2026-09-28-s05-window-local-integration.md) 的 15 个 owned 文件逐项核对，仅 parser 测试源码按 [测试类型修复证据](2026-09-28-s05-parser-test-types.md) 更新为 `d88815e37606ff60c815464b28190d3e50df5563e7cce0a2dae26c1e0ac87548`，其余全部匹配。前后 checkpoint 没有 owned 输入漂移。重新用当前 TypeScript 的 `transpileModule`、ES2022/ESNext、关闭 sourceMap/inlineSourceMap 核对 parser 测试编译输出，SHA-256 仍为 `810c06c566539b374412d9abefb5b60e4219e2521a59050109f07d68da791e77`，与修复前后证据一致。

因此复用 Schemas 全包 42 文件/433 项通过、Schemas typecheck、已刷新且稳定的 Schemas build，以及 Server 全包 222 文件通过/23 文件跳过、1624 项通过/81 项跳过。复用修复后 Server typecheck 与 parser 精确定向 75 通过/1 条条件公开输入跳过；真实公开输入的既有 76 通过证据仍适用，见 [parser 证据](2026-09-28-s05-calendar-package-parser.md)。未重复全包测试、typecheck、Schemas build 或真实输入探针。

80 条 Server skip 为显式真实 PostgreSQL、Worker、备份/升级容器及 DSA 日历端点，另 1 条为未设置 `S05_CALENDAR_PUBLIC_INPUT_DIRECTORY` 的公开材料探针。skip 不计通过；修复叶意外重复全包的范围偏差仍按其证据记录，不另相加。

## 本次实际检查

| 检查 | 命令与输入 | 结果 |
| --- | --- | --- |
| Server build | `rtk proxy pnpm --filter @thesis-ledger/server build`，当前 Server 全构建输入及已刷新依赖 dist | 退出 0，`nest build` 完成 |
| 模块边界与架构契约规则 | `node scripts/check-boundaries.mjs`，当前仓库源码 | 退出 0，`Import boundaries: OK` |
| workspace 依赖 | `node scripts/check-workspace-dependencies.mjs` | 退出 0，8 packages 图通过 |
| 普通 owned ESLint | `pnpm exec eslint <下表15文件> --max-warnings=0` | 退出 0，无警告 |
| owned complexity | `pnpm exec eslint <下表15文件> --rule 'no-nested-ternary:warn' --rule 'complexity:[warn,20]' --rule 'max-lines-per-function:[warn,{max:220,skipBlankLines:true,skipComments:true}]'` | 退出 0，但 2 项当前复杂度缺口，不能据此完成 |
| 文件尺寸 | `node scripts/check-file-size-guardrails.mjs` | 退出 0，13 项无有效 baseline 警告；不能作为全仓 ratchet 强制通过证据 |
| 空白与文档链接 | owned 15 文件、主 Spec/Task、当前日期 S05 证据及 DSA 能力文档直接检查 | 无尾空白/缺结尾换行；75 个相对文件链接存在 |
| 全工作区 whitespace | `git diff --check` | 本次退出 0；没有修复或清理任何 WIP |

所有表中命令均由 `rtk proxy` 执行，Python 调度器只负责保存原始输出和最终摘要。普通 ESLint 使用 `eslint.config.mjs` 的现有规则；complexity 参数来自 `package.json` 的 `guardrails:complexity` 原脚本。原脚本自身使用 warning 且不带 `--max-warnings=0`。首次把普通 lint 与 complexity 合并并保留 `--max-warnings=0` 时退出 1，随后为区分实际门禁语义，拆成上述两条命令；没有降低规则阈值、改变配置或忽略文件。这不是代码失败重试，两次命令检查目标不同。协调者明确要求当前新增超阈值复杂度必须修复。

普通 lint/complexity 仅覆盖本批 owned 15 文件，没有声称全仓 ESLint 通过。`contract:test` 会重新生成 Prisma 并 build/test 多包，且 `contract:smoke` 使用真实运行时，故没有执行。Schemas 与 Server 合同测试在已通过全包中复用；静态契约检查使用真实 boundary/dependency 脚本，不额外虚构独立合同检查命令。

原始日志统一为 `/private/tmp/s05-window-local-gates-0928-{server-build,boundaries,workspace,size,owned-eslint,owned-lint,owned-complexity,whole-diff-check}.log`，输入快照为同前缀 `inputs.json`。

## 精确缺口与新叶提案

- `packages/schemas/src/market-pit-historical-evidence-v1.ts:181:35`：`marketPitHistoricalDecisionWindowV3Schema` 的 `.superRefine((value, context) => ...)` 回调复杂度 66，阈值 20。
- `packages/schemas/src/market-pit-reconstruction-v3.ts:166:38`：`bindMarketPitReconstructionProofV3` 箭头函数复杂度 27，阈值 20。

建议新的有界任务仅拥有这两个 Schema 源码及对应测试/证据，按身份与引用、日历连续性与后继、见证和逐 Bar 时点/输入绑定等语义职责提取校验 helper；保留现有拒绝分支、时间精度、资源上限、错误 reason、行为合同及线性处理边界。不得提高阈值、ignore、关闭 guardrail 或机械分割语句。新叶先定向 Schema 回归与 complexity，再执行受其输入变化影响的类型/build；本次下游 build 证据须按新输入判断是否重跑。最终独立 review 与台账归父级。

13 项尺寸警告涉及 JournalDashboard、PerformanceSections、StrategyEditorSheet、StrategySections、ai-provider.service、journal.service、baseline-import.service、risk-context.service、strategy-optimization.service、ai-provider-ui.test、refactor-contract.test、ai-provider-management.test、baseline-import.service.test；精确路径/行数见 size 日志。本批 Store 293→274 行，parser 三模块 214/109/134 行，validation 47 行、pit guard 13 行，均保留既有收敛；尺寸不替代复杂度。

## DSA 文档与部署入口准备

[DSA 能力目录](../../../../daily-stock-analysis/docs/thesis-ledger-source-capabilities.md) 当前表含 117 行唯一 ID，其中 116 个固定 ID 及 `R07.8/{sourceId}` 模板；当前证据链接可解析。仅核对状态摘要与链接，没有进行全部 M3 endpoint/准入审计，也不关闭 AC20/F02。

只读检查相邻 infra `scripts/sync-code.sh` 的 target、运行容器前置、镜像引用一致性、Server/workspace manifest 与 Prisma Schema/migration/raw-owned 输入兼容性检查。本批未改 manifest、migration、运行时依赖或 Dockerfile，按本批输入范围，后续最小目标应为 `./scripts/sync-code.sh thesis-ledger`，覆盖 Server 与 backtest-worker。工作区 `apps/server/prisma/schema.prisma` 有既有 WIP diff，不能把“本批未改结构”解释成当前容器结构一定一致；必须由后续实际兼容性预检核对。容器不存在/未运行、依赖或结构不匹配、预检拒绝时改用 `./scripts/update.sh thesis-ledger`，不得绕过。没有执行 Docker CLI、容器状态探针、同步、构建镜像或部署。

## 验收边界

收到协调者复杂度修复要求后停止继续扩展检查；已完成的低成本文档/空白检查在此保留。未执行全仓 complexity/ESLint、全 `contract:test`、Desktop、DSA build、浏览器、网络、Provider/AI、业务数据库、Docker 或故障注入。本叶无更高成本运行进程。

固定版本及摘要登记的可信日历包映射只投影经认证的 `CN/XSHG/Asia/Shanghai` 2026 常规日历；它不是证券场所绑定，不能替代 XSHE 或 `159516.SZ` 的证据。结构 v2 与旧严格 V3 拒绝保护不授予最终 PIT 资格，完整依赖 ready、真实窗口绑定、冻结与同验证器离线成功门禁仍开放。此次没有离线正向成功证据。

## 最终 owned 输入身份

| 文件 | SHA-256 |
| --- | --- |
| `packages/schemas/src/market-pit-historical-evidence-v1.ts` | `1c941c3d872d52f12775ce32b039d64e6c1ed6ac302f47674aa389367ba38eb2` |
| `packages/schemas/src/market-pit-reconstruction-v3.ts` | `4bec6991ce80445d676332aa399bee43e4ab8bed5eb3813c0d0e385a6770ede8` |
| `packages/schemas/src/index.ts` | `d64c164fb5afadecfba89cb17945a871f6256aeadcd0af5e2dcd3469efc5da01` |
| `packages/schemas/test/market-pit-historical-evidence-v1.test.ts` | `0e663e71666ec27cb29652fc6c0fa08967ed63c39df77bb0e6a512acb8855832` |
| `packages/schemas/test/market-pit-reconstruction-v3.test.ts` | `e60112a2fa836ac57c1b4345ad4cd917b514638432a884c70224affb5d61de61` |
| `apps/server/src/market/market-pit-calendar-package-v1.ts` | `0330d5a5325f77924f2c8ac3f79e3d1f1bbe1b9bab746756b1d3b72fd7c479dd` |
| `apps/server/test/market/market-pit-calendar-package-v1.test.ts` | `d88815e37606ff60c815464b28190d3e50df5563e7cce0a2dae26c1e0ac87548` |
| `apps/server/src/market/market-pit-calendar-package-source-v1.ts` | `efed42b9895ecf4e1fc89e9c0415f1771c013365f7bdc59b4000781fe4b35d2a` |
| `apps/server/test/market/market-pit-calendar-package-source-v1.test.ts` | `5924569e0a32aa901678335aa92b4da0b1cb2439376edf80b810f03bf400bebc` |
| `apps/server/src/market/market-pit-calendar-package-projection-v1.ts` | `7337c2f2cb5053bf020218a4347fd86535f7b23a7fe4ed25df7761c7b2534965` |
| `apps/server/test/market/market-pit-calendar-package-projection-v1.test.ts` | `0e43110ef42282f07914074046d5362fd88fb85b27e8466a460f7cfe1c2f8118` |
| `apps/server/src/backtest/backtest-snapshot-v3-store.ts` | `c4638dd8369c17bc9144465f732b52737edc649fb3d87a076501019326f17eed` |
| `apps/server/src/backtest/backtest-snapshot-v3-validation.ts` | `1648301ecdae856dfadcb1b4bf43c3331a2d7d6b3570fd02b5de3d4e2afdf17c` |
| `apps/server/src/backtest/backtest-snapshot-v3-pit-guard.ts` | `0c6237f00fe7a68ccd4146700a4c2e3a4684ba716d6ace4d5f069dd098b71f3e` |
| `apps/server/test/backtest/v3-strict-snapshot-replay-guard.test.ts` | `baab4b00eba7b3eed2f739156a59b1a624c0595e13baf60bbbceddc4e1c389df` |
