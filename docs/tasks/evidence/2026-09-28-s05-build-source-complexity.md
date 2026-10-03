# S05 构建编排与来源封装复杂度证据

状态：`worker_done`。本叶仅完成本地职责拆分与定向验证，整体验收由父级协调者负责。

## 范围与输入

- 唯一任务：`S05-build-source-complexity-0928`；合同依据为主 Spec §10 的公共入口、错误顺序、读写次数、准备选择 fence、冻结证据与严格 PIT 失败关闭要求。
- 独占修改 `backtest-snapshot-v3-builder.ts`、`backtest-snapshot-v3-source.ts`，新增同目录 `backtest-snapshot-v3-artifact-writer.ts`、`backtest-snapshot-v3-source-evidence.ts`；测试及其他源码只读。
- 派发时已有大量 dirty WIP，两个原文件均尚未跟踪。全程未 reset、stage、commit、clean，也未撤销其他所有者的改动。
- 已读取项目 `AGENTS.md`、全局 RTK/Codex 规则与 `codex-cost`；本叶未创建子代理。当前工具列表没有 Context Mode 工具，使用 RTK 并限制搜索/命令输出。

## 职责与行为一致性

- 构建入口继续负责清单准入、既有终态身份核对、Reader 请求、来源核验、准备选择 fence、历史门禁、依赖收集、开始构建、finalize 与异常清理。
- 局部 `assertExecutionWindowMatchesProtocol` 仅承接原位置的冻结窗口核对与价格协议核对，两项错误的文案、先后和短路条件保留。
- `writeBacktestSnapshotV3Artifacts` 承接顺序写入阶段：元数据 → 可选执行模型 → Bar → 窗口证据 → 可选价格绑定 → 各依赖原顺序。每项仍逐项 `await`，不存在批量并发或提前请求后续写入。策略及已解析 RunConfig 由入口传入，保留异步读取前捕获的策略引用；两次写入阶段 RunConfig parse 仍在原对应位置。
- `beforeFinalize`、finalize、结果 contentHash 核验和删除未完成 Run 的 `catch` 均留在入口原有 `try` 范围；写入失败不会继续 finalize，删除失败仍被吞掉后重新抛出原错误。
- 来源入口仍按用途 → selected → 请求/响应相关性 → 固定目标 → 计划范围 → selected 目标 → 持久化证据的顺序拒绝。`reader_contract_invalid` 仍只包围请求/响应 parse；计划 RouteKey parse 仍位于该 catch 之外。公共参数、返回类型、错误类、错误码及文案保持。
- `snapshotSourceEvidenceMatchesV3` 只提取原证据对象构造和原顺序的短路核对；`encodeSnapshotSourceEvidenceV3` 只提取标量编码。完整多窗口 response、coverage、coverageProof、来源价格事实、单位及真实 fetchedAt 仍按原 canonical 编码冻结；没有重新计算或截断完整响应哈希。
- 没有更改 Market/DSA 适配边界、公共 index、严格 PIT 资格、raw 和旧路径。新增 helper 均属于 `backtest`，没有增加通用 shared/utils。

## 复杂度和尺寸

使用当前锁定 ESLint 对 owned 四文件分别执行规则，严格门禁为复杂度 20、有效函数长度 220、`no-nested-ternary:error`、`--max-warnings=0`；无阈值或 ignore 修改。另以阈值 0 的诊断输出统计全部函数，诊断警告仅用于度量。

| 文件 | 物理行数前后 | 关键函数复杂度前后 | 最长有效函数行数前后 | 当前函数数 |
| --- | --- | --- | --- | --- |
| builder | 388 → 375 | 主编排 27 → 20 | 149 → 116 | 17 |
| source | 184 → 128 | 来源入口 25 → 18 | 126 → 68 | 4 |
| artifact-writer | 新增 67 | 最高 5 | 54 | 2 |
| source-evidence | 新增 115 | 最高 5 | 49 | 2 |

构建清单、既有快照身份、Bar 行映射等既有函数未承担新增职责。两个原超限文件均缩小；新模块按顺序持久化和来源证据绑定/编码的职责划分。

## 源码摘要

| 文件 | 派发前 SHA-256 | 完成后 SHA-256 |
| --- | --- | --- |
| builder | `db3d8b3ffad963c753b04b1b5634ef1a9c190462f0db3296404db123f29c5d70` | `5880fccabc621cc81e5b6d0476f67034dde05c3b1fd51a93a61603cd8b0296c5` |
| source | `298a0620a0c7cf581fb4376535a0e7a3b1922b0428d95254fc24447446f22af7` | `f88b44ffce4d01f16640a59e8695f61797a16bd5e07971a80c57dbe3a53bdd8b` |
| artifact-writer | 不存在 | `30341d4fe91bfe723985632b9d55471db73e397242d0294330a4090d12e101a9` |
| source-evidence | 不存在 | `87da26e547b007ed2a9f09d199b0d3e89065c0d11ad2a24884aa6bdfc6b32569` |

## 验证命令与结果

最终源码状态执行以下精确定向命令，实际发现 13 个文件、68 项测试，全部通过、无跳过；仅本地临时快照和测试 mock，不调用真实数据库或 Provider。

```sh
rtk proxy pnpm --filter @thesis-ledger/server exec vitest run --cache=false \
  test/backtest/backtest-snapshot-v3-source.test.ts \
  test/backtest/v3-snapshot-builder.test.ts \
  test/backtest/v3-complete-snapshot.test.ts \
  test/backtest/v3-multi-window-snapshot.test.ts \
  test/backtest/v3-reconstruction-freeze-guard.test.ts \
  test/backtest/v3-strict-snapshot-replay-guard.test.ts \
  test/backtest/v3-split-mapping-snapshot.test.ts \
  test/backtest/v3-field-units-snapshot.test.ts \
  test/backtest/v3-create-retry-integration.test.ts \
  test/backtest/v2-snapshot-builder.test.ts \
  test/backtest/legacy-snapshot-version-boundary.test.ts \
  test/backtest/legacy-exchange-snapshot-replay.test.ts \
  test/backtest/legacy-nav-snapshot-replay.test.ts
```

此前同一组分两批执行：8 文件/24 项、5 文件/44 项通过；策略引用自审修正后，以上合并命令刷新为最终 68 项证据，最终耗时 9.70 秒。

已阅读既有来源和构建测试的断言：单次 Reader 读取、单次必要依赖读取、不调用未声明事件、固定目标与完整窗口拒绝、canonical 编码、缺失/篡改 Artifact 拒绝；关联测试覆盖准备选择过期、finalize 前路由/策略变化清理、严格历史证据在开始构建前拒绝、完整多窗口/单位冻结以及旧 V2/NAV/raw 路径。未增加实现镜像测试。

对下列 owned 四文件执行普通 ESLint 与严格 ESLint，均 exit 0、零警告；Prettier 检查及 `git diff --check` 通过。

因 owned 文件均未跟踪，额外逐文件执行 `rtk proxy git diff --no-index --check /dev/null <文件>`，包含本证据共五文件均无空白错误输出；其 exit 1 表示与空文件存在内容差异，不代表空白检查失败。完成时复算四份源码摘要与上表一致。

```sh
rtk proxy pnpm exec eslint \
  apps/server/src/backtest/backtest-snapshot-v3-builder.ts \
  apps/server/src/backtest/backtest-snapshot-v3-source.ts \
  apps/server/src/backtest/backtest-snapshot-v3-artifact-writer.ts \
  apps/server/src/backtest/backtest-snapshot-v3-source-evidence.ts \
  --max-warnings=0

rtk proxy pnpm exec eslint \
  apps/server/src/backtest/backtest-snapshot-v3-builder.ts \
  apps/server/src/backtest/backtest-snapshot-v3-source.ts \
  apps/server/src/backtest/backtest-snapshot-v3-artifact-writer.ts \
  apps/server/src/backtest/backtest-snapshot-v3-source-evidence.ts \
  --max-warnings=0 --rule 'no-nested-ternary:error' \
  --rule 'complexity:[error,20]' \
  --rule 'max-lines-per-function:[error,{max:220,skipBlankLines:true,skipComments:true}]'
```

中间一次严格检查在仅提取写入阶段后报告 builder 23，随后将原冻结窗口与协议核对按准入职责提取，最终为 20。没有重试失败的相同输入或放宽规则。

## 资源与后续门禁

- 全部测试、ESLint、Prettier 命令已结束，没有本叶后台进程或保留的测试服务。Vitest 禁用缓存，临时快照按既有 afterEach/finally 清理。
- 未运行全包测试、typecheck、build、数据库、I01、真实 Provider、Docker 或部署；其他叶的源码存在并行写入，包级和仓库门禁由独立集成叶在最终输入稳定后执行。
- 本证据在 owned 源码、公共合同、消费依赖或测试输入变化后须按影响范围刷新；本叶通过不授予严格 PIT 最终资格或真实业务验收。
