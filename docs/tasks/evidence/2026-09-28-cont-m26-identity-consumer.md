# Tushare 身份原文消费实施证据

日期：2026-09-28。任务：`M26-b2-identity-consumer`。状态：`worker_done`，仅 Server 在线选择与离线冻结消费本地叶完成。M26、M2、S05 qualification 与真实来源验收保持开放。

## 依据与写入边界

依据主 [Spec §4](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md)、主 [Task §12.9](../2026-09-25-multi-source-adjustment-aware-backtest.md) 执行包及 [共享合同证据](2026-09-28-cont-m26-identity-wire.md)。已读取 RTK、Codex、工作区/项目 AGENTS、`spec-driven-workflow` 实施指导与 `recommend`。Context Mode 未暴露，使用 RTK 与限定输出。当前 Server 实际依赖 `es-toolkit 1.51.0` 的运行时出口没有 hash/SHA/UTF/byte 候选，摘要计算和字节计数沿用 Node 原生 `createHash`、`Buffer.byteLength`，没有新增依赖或通用工具函数。

HEAD：`fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`；保留大量脏 WIP。新增专属验证器、两份测试和共享 fixture 消费辅助；既有 selector 和 SnapshotEvents 只增加验证器 import/call。协调者在首轮格式失败后另行授权 selector 的唯一纯格式修复，主 Task 已记录；没有逻辑重构、撤回 WIP、暂存或提交。Schemas、dist、Store、既有 RQData/EastMoney/split 实现与测试均只读。

独占源码/测试写集共六份，见下节摘要表；文档唯一写集为本文。其他 worker 的 DSA/docs 产出未修改，没有创建子代理。全部命令已结束，没有后台验证进程；本叶写权交回协调者。

## 已交付行为与证据层

`verifyTushareFundIdentityV3` 仅要求精确 `data/CN/ETF/CASH_DISTRIBUTION`、`tushare/tushare` tuple 的独立 `tushareIdentityEvidence`；其他 tuple 没有该证据时原路径继续，携带此证据时由共享合同拒绝借用。实际 UTF-8 原字节最多 1 MiB，重新计算 SHA-256 后复用共享 validator 核验准入引用/摘要、全部映射范围、选中映射、独立分红币种及精确时间。原文不排序、不规范化，末尾换行保留；不调用当前时钟。

实际 `selectMarketEventV3` 在 exchange 成功后调用验证器；篡改原文返回 `invalid_response`，仅读取原选中来源一次，即使测试中有第二个 ready/eligible 来源也不重试、不切源。正常观测保留原字节和 `coverage.complete=false`。

实际 `validateSnapshotEventsV3` 重验 frozen exchange。测试通过真实 Parquet 写入、全新 `LocalSnapshotStore` 读取后，重新校验原字节；读回 bundle 与原 bundle 相等，重验投影及 evidence 与原结果相等。`Date.now` 抛错时仍成功，源码没有读取当前时钟。原文篡改、摘要篡改、缺证据、准入摘要错配、范围越界、独立币种错配、微秒精确到期均拒绝。范围/币种反例重算摘要并同步合成覆盖引用，确保没有因旧引用提前拒绝；微秒反例保持请求与响应冻结截点一致，只有 `fetchedAt == validUntil` 的精确上界使其失效。到期前的原观测仍可重放，不按今天时间否定旧有效观测。

共享 golden 原文字节为 746，摘要 `6968df31478e972147503480e2e7c8e6438c7e7260e9200f0f27edbf3ef0d840`，直接从 `packages/schemas/fixtures/market-tushare-identity-v3.synthetic.json` 消费，没有平行 fixture 合同。该 golden 使用中文 `.example.test` URL、synthetic 修订和不完整覆盖。测试中 `coverage=true` 只验证既有完整冻结路径，不证明真实 `fund_div` 历史完整性；原 golden 的 `coverage=false` 明确拒绝冻结。分拆现金与 RQData split 组合只验证既有组合机制，不授予 Tushare split 能力。

前置身份/币种真实性审核、当前准入撤销与适配/凭据修订复核属于 DSA 生产入口后继。没有账号、Provider、网络、数据库、目标 Docker、浏览器或 AI 调用，没有实际上游覆盖或 PIT/S05 qualification 证据。Server 全包与 dist build 留给全部源码稳定后的唯一验证所有者。

## 检查命令与最终结果

执行目录为主仓，命令均使用项目现有依赖；成功后的输入为下节最终摘要。本叶首轮两文件 12 项通过，关联八文件 48 项通过。自审修正合成覆盖引用和微秒反例后重新执行同层验证；唯一格式修复后最终再次完成下表检查，没有抬高门禁或构建 Server。

| 实际命令 | 最终结果 |
| --- | --- |
| `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/market/market-tushare-identity-v3.test.ts test/backtest/backtest-tushare-identity-replay-v3.test.ts test/market/market-event-selector-v3.test.ts test/backtest/backtest-event-observations-v3.test.ts test/market/market-rqdata-identity-v3.test.ts test/backtest/backtest-rqdata-identity-replay-v3.test.ts test/market/market-split-mapping-v3.test.ts test/backtest/v3-split-mapping-snapshot.test.ts` | 8 文件、48 passed；本叶 12、既有回归 36。 |
| `rtk proxy pnpm --filter @thesis-ledger/server typecheck` | 退出码 0；没有 build。 |
| `rtk proxy pnpm exec eslint apps/server/src/market/market-tushare-identity-v3.ts apps/server/src/market/market-event-selector-v3.ts apps/server/src/backtest/backtest-snapshot-v3-events.ts apps/server/test/market/tushare-event-fixtures.ts apps/server/test/market/market-tushare-identity-v3.test.ts apps/server/test/backtest/backtest-tushare-identity-replay-v3.test.ts --max-warnings=0` | 退出码 0，无 warning。 |
| `rtk proxy pnpm exec eslint apps/server/src/market/market-tushare-identity-v3.ts apps/server/src/market/market-event-selector-v3.ts apps/server/src/backtest/backtest-snapshot-v3-events.ts apps/server/test/market/tushare-event-fixtures.ts apps/server/test/market/market-tushare-identity-v3.test.ts apps/server/test/backtest/backtest-tushare-identity-replay-v3.test.ts --max-warnings=0 --rule 'complexity:[warn,20]' --rule 'max-lines-per-function:[warn,{max:220,skipBlankLines:true,skipComments:true}]'` | 退出码 0；complexity 20 / 函数 220。 |
| `rtk proxy pnpm exec prettier --check apps/server/src/market/market-tushare-identity-v3.ts apps/server/src/market/market-event-selector-v3.ts apps/server/src/backtest/backtest-snapshot-v3-events.ts apps/server/test/market/tushare-event-fixtures.ts apps/server/test/market/market-tushare-identity-v3.test.ts apps/server/test/backtest/backtest-tushare-identity-replay-v3.test.ts` | 最终全部通过。首轮仅既有 selector 失败，见下段唯一修复记录。 |
| `rtk proxy node scripts/check-boundaries.mjs` | Import boundaries: OK；新增消费方向与既有 RQData/split 相同，未新增非法依赖模式。 |
| `rtk proxy node scripts/check-workspace-dependencies.mjs` | Workspace dependency graph: OK，8 包。 |
| `rtk git diff --check -- apps/server/src/market/market-event-selector-v3.ts apps/server/src/backtest/backtest-snapshot-v3-events.ts` | 退出码 0；新文件另直接检查尾随空白，无问题。 |

首格式失败诊断使用 `rtk proxy node --input-type=module -e` 调用 `prettier.resolveConfig`、`prettier.check`，先从原文移除本叶新增 import/call：原 87 行和当时 89 行均 `false`。协调者授权后执行 `rtk proxy pnpm exec prettier --write apps/server/src/market/market-event-selector-v3.ts`，89→105 行；这是该失败的唯一修复重试。初始按 `getChildren` 包含标点的 AST 摘要不同，因为 Prettier 增加括号/格式；随后以实际捕获原文重新拼接并先核对原始 SHA-256 `9e428c32991772a4a6bc84a06b6174d65aeb6ef5ed09cbefdf14df3eeab979d4`，用 TypeScript `forEachChild` 递归保留 kind、标识符/字符串/数值文本，忽略位置及括号表达式包装，格式前后语义 AST 摘要均为 `725405f3421bbdfa09b8e05d6183915014edb3cf721343d3a055d0f609605e9c`，确认纯格式。

限定尺寸/空白检查由 `rtk proxy node --input-type=module -e` 执行：`git rev-parse --verify HEAD^{commit}` 核对有效基线；逐六份 owned 文件以 `split(/\r?\n/u).length` 计数、SHA-256 和尾随空白检查。所有源文件远低于 600、测试远低于实际 800 门限；既有 selector 87→89 是两行接线，89→105 为上述已授权格式，Snapshot 127→129 为两行接线，没有扩张任何存量大文件。这里只声明本叶限定尺寸通过，未运行或声明工作区全量 ratchet 通过。边界/依赖检查通过后只有格式变动，不涉及依赖输入；最终 lint、类型、格式和定向已重跑。

## 最终输入摘要

下表为最终测试与静态检查的稳定输入，含文件末尾空行；本文不纳入源码输入摘要。

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `apps/server/src/market/market-tushare-identity-v3.ts` | 20 | `026847f13377a7744461c3e33cab054aee6fcd212d896f9bc698210ebdfd9f8f` |
| `apps/server/src/market/market-event-selector-v3.ts` | 105 | `544eed9808056677a4a0ce54a1a5ef24c63994c268d19ab25a7baf0c27dc557f` |
| `apps/server/src/backtest/backtest-snapshot-v3-events.ts` | 129 | `575f3b252b8e87f2455d30bbc60e4679149edfce2ad06bbde2cf6fb46b5b5e31` |
| `apps/server/test/market/tushare-event-fixtures.ts` | 38 | `fb054ae7d2a44a4969ae9db5fc5ee8dedfb819a8aab521ccf7fa69ae15d6a834` |
| `apps/server/test/market/market-tushare-identity-v3.test.ts` | 140 | `8f578414fb79651571685e66d9c1cff71dc60262159af67f42a5798b36f3f7af` |
| `apps/server/test/backtest/backtest-tushare-identity-replay-v3.test.ts` | 161 | `0dd499ccf283d52d9accf4e3a46194b23a51ae9b7d3875a6b3cb6988e99c33aa` |
| `packages/schemas/src/market-tushare-identity-v3.ts`（只读） | 249 | `6a0c4c806098e2bf446fb80ba7cd0960829a8d9777476e805ecd5e2df662ca6f` |
| `packages/schemas/dist/market-tushare-identity-v3.js`（只读） | 189 | `e45899f2dfbcb90caf20b161c927b81d33dfa78cdbff9b4363318cfaf12ada5a` |
| `packages/schemas/fixtures/market-tushare-identity-v3.synthetic.json`（只读） | 104 | `0298618600ce99007e75da74b31344a0f6fa21933631e70f26231e9d5f2d2148` |

## 交接

本叶自审：实际入口接线、精确 tuple、原字节大小/摘要、独立币种和全部范围、精确时间与旧来源兼容均有实现及本地反例；没有以合成证据提升覆盖、准入或 S05 资格。后继由 DSA 生产叶处理入场前/返回前真实性和当前修订，唯一最终验证所有者处理 Server 全包与 dist。协调者负责主台账及最终一致性 Review。所有进程已结束，写权交回，不自行开始后续任务。
