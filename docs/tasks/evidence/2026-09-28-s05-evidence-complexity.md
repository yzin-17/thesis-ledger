# S05 历史证据校验复杂度收敛证据

## 终态与范围

`S05-evidence-complexity-0928 / worker_done`。本叶按领域职责拆分两个新增超限函数，全部指定局部门禁通过，源码未提交。主仓仍为 `main / fe0e871e37a09964f7a113b82e7d09f6d4d95f7e` 的既有脏工作区，未 stage、commit、reset、clean，也未修改只读测试、导出入口、配置、依赖、Spec 或主 Task。

依据：[主 Spec](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md) §6、[主 Task](../2026-09-25-multi-source-adjustment-aware-backtest.md) 的本叶边界和[前一门禁检查点](2026-09-28-s05-window-local-gates.md)。精确原缺口为历史窗口 `superRefine` 复杂度 66，以及旧 v1 `bindMarketPitReconstructionProofV3` 复杂度 27；后者不是 v2 refinement。执行前源码摘要分别为 `1c941c3d872d52f12775ce32b039d64e6c1ed6ac302f47674aa389367ba38eb2`、`4bec6991ce80445d676332aa399bee43e4ab8bed5eb3813c0d0e385a6770ede8`。

RTK、Codex、项目规则与 `spec-driven-workflow` 实施指引已读。Context Mode 工具发现不可用，Shell 经 RTK，原始日志保存在 `/private/tmp/s05-evidence-complexity-0928-*`，仅回传失败详情与结果摘要。所有验证命令已结束，测试、类型与构建资源已释放。

## 语义职责与不变量

| 源码 | 本次职责 |
| --- | --- |
| `market-pit-historical-evidence-v1.ts` | 原字段 schema、字节／Bar／日期预算及 preprocess 保留；通过未 refinement 的基础对象推导既有类型，再编排身份、日历和逐 Bar 校验 |
| `market-pit-historical-references-v1.ts` | 全局身份唯一性、原文获取与编码／字节预算、制品发布及文件路径、日历发布／场所／标的／制品引用、来源见证及同窗摘要 |
| `market-pit-calendar-structure-v1.ts` | 日历获取时点、连续日期、逐日发布引用、开闭市及全部时段、线性日期和有效后继索引 |
| `market-pit-historical-bar-bindings-v1.ts` | Bar 严格递增、来源身份和响应摘要、交易日在日历范围内、日历明确收盘／下一开盘、决策窗口及修订声明时点 |
| `market-pit-reconstruction-v3.ts` | 保留 v1／v2 schemas、联合清单和 binder API；v1 binder 按原顺序调用范围、价格口径、归档和截点检查 |
| `market-pit-reconstruction-manifest-validation-v3.ts` | 提取 v1 必要条件的精确范围／实际目标、Bar 归档对应、实际事实冻结截点三个检查；价格口径解析留在原入口 |

没有通用工具层、日期工具替代、机械单条件 helper、阈值调整或忽略规则。所有时间比较沿用 `Date.parse`、原字段精度与原条件；保留 `closedAt <= decisionAt < nextOpenedAt`、最后 Bar 后继、完整时段、缺失引用的失败及 `continue` 边界。日历日期及后继仍是线性索引，未使用相邻输入 Bar 推断有效交易日。

自查确认：原历史字段 schema、制品空 `rawBase64` 规则、非空发布原文、全部资源预处理器源码字节相同；37 条中文错误文案集合相同；既有公开导出名称和 binder 输入／返回签名保留。历史窗口仍按身份→原文→制品→逐日历→见证→逐 Bar 顺序发出无路径 custom issue，原 `validateProof` 的带路径 issue 未改。v1 binder 保留 `invalid-proof`→`scope-mismatch`→`price-basis-mismatch`→`bar-archive-mismatch`→`future-fact` 的先后边界，v2 必要条件、可晚于截点的未来后继开盘及联合 binder 的 `availableAt` 等值检查未改。新模块只通过 type-only import 消费既有类型；owned ESLint 的循环依赖规则和两层 typecheck 均通过，未增加运行时类型循环。

## 实际门禁

先运行严格 owned ESLint 与现有两份定向测试，通过后才运行 Schemas 全包／typecheck；其通过后刷新 Schemas build，随后执行 Server typecheck。

| 检查 | 命令／输入 | 结果 |
| --- | --- | --- |
| 严格 owned ESLint | `pnpm exec eslint <上述6个源码> --rule 'complexity:[error,20]' --rule 'max-lines-per-function:[error,{max:220,skipBlankLines:true,skipComments:true}]' --max-warnings=0` | 退出 0，零警告，保留现有 ESLint 类型及 import 规则 |
| 精确定向 | `pnpm --filter @thesis-ledger/schemas exec vitest run test/market-pit-historical-evidence-v1.test.ts test/market-pit-reconstruction-v3.test.ts --cache=false` | 2 文件／66 项通过，无 skip |
| Schemas 全包 | `pnpm --filter @thesis-ledger/schemas exec vitest run --cache=false` | 42 文件／433 项通过，无 skip |
| Schemas typecheck | `pnpm --filter @thesis-ledger/schemas typecheck` | 退出 0 |
| Schemas build | `pnpm --filter @thesis-ledger/schemas build` | 退出 0，dist 已刷新，6 个运行时模块及声明可供下游消费 |
| Server typecheck | `pnpm --filter @thesis-ledger/server typecheck` | 退出 0 |
| 格式 | `pnpm exec prettier --check <上述6个源码>` | 退出 0 |
| 空白与链接 | 6 个源码和本证据直接检查，并执行 owned `git diff --check` | 无尾空白／缺结尾换行，6 个相对链接存在，diff check 退出 0 |

复杂度值使用独立 ESLint JSON 测量（`complexity:[warn,0]`，只用于枚举实际数值；严格通过仍以上表 error/20/零警告为准），不是放宽门禁或失败重试。

| 文件 | 行数 | 函数数 | 最大复杂度 |
| --- | --- | --- | --- |
| 历史证据入口 | 335→208 | 9 | 19；refinement 66→2 |
| 重建入口 | 250→216 | 13 | 17；旧 v1 binder 27→7 |
| 日历结构 | 69 | 6 | 12 |
| 历史引用 | 96 | 14 | 6 |
| 逐 Bar 绑定 | 65 | 2 | 13 |
| 清单必要条件 | 68 | 5 | 18 |

总计 49 个函数，最大复杂度 19；`max-lines-per-function` 同口径独立测量最大 43 行，阈值为 220。项目文件尺寸脚本只匹配 Desktop feature `.tsx`、Server `.service.ts` 和测试，owned Schema `.ts` 不在其文件规则内；本叶不将全仓已有的无 baseline 警告冒充通过，两个入口文件均缩小。没有运行全仓静态门禁、Server 全包测试／build、Docker、DB、Provider、浏览器或其他高层验证。

## 证据适用性与就绪输出

13 个只读入口／Schema 测试／Server parser／旧严格 guard 输入摘要与前一门禁表逐项一致，且从本叶检查快照到最终快照没有漂移；6 个 owned 源码在通过检查后也无漂移。Schema 字段、错误边界及现有 66 项测试足以覆盖此次行为保持拆分，未改测试或构造新的证据语料。

[parser 类型修复](2026-09-28-s05-parser-test-types.md)、[真实原包解析](2026-09-28-s05-calendar-package-parser.md)与[旧严格 guard](2026-09-28-s05-old-strict-v3-guard.md)的未改源码、测试及当时输入事实仍可作为其对应范围的历史证据；它们的实际原包身份、parser 测试 JS、guard 行为实现没有变化。本叶改了 Schema 运行时，因此前一 Schema build、依赖其 dist 的 Server build／全包回归及最终集成证据不能直接当作当前输入上的新通过；已重新执行的 Schemas 全包、typecheck、build 和 Server typecheck以上表为准，未重复 Server 定向或真实输入探针。后续独立集成叶须判断并刷新受影响的下游证据。

结构与必要条件仍不授予历史真实性、来源／场所准入或最终 PIT 资格，目标运行时和业务验收保持开放。主 Task、全局最终 review 与新集成门禁归协调者，本叶不关闭完整 S05。

日志后缀：`owned-eslint.log`、`directed.log`、`schemas-full.log`、`schemas-typecheck.log`、`schemas-build.log`、`server-typecheck.log`；测量为 `complexity-measure.log`／`complexity.json`、`function-size-measure.log`；执行前源码为 `before.json`，稳定输入为 `inputs.json`／`final-inputs.json`。

## 最终源码身份

| 文件 | SHA-256 |
| --- | --- |
| `packages/schemas/src/market-pit-historical-evidence-v1.ts` | `ad61c28930ae4b5275a2e3e2d21f7870f9f0986afc23a589f6320a560c3d87a8` |
| `packages/schemas/src/market-pit-reconstruction-v3.ts` | `da1d8521a9e64877d578633cbea9274f3e6ba5dcaa0b0e8282f55bf086bf3022` |
| `packages/schemas/src/market-pit-calendar-structure-v1.ts` | `52485af5389883db5cebc934023f6fd8205c466a04cbcd3076029b2abc97f49a` |
| `packages/schemas/src/market-pit-historical-references-v1.ts` | `7ee43020f6503f865fed0bbca57044eb20bc41daaba4d394df40cf2cac6cf986` |
| `packages/schemas/src/market-pit-historical-bar-bindings-v1.ts` | `f5f3d201c8965811149a17a245d91472f28e34c447d1db876193d17305db0970` |
| `packages/schemas/src/market-pit-reconstruction-manifest-validation-v3.ts` | `d6f380dc35ac13664d6c05f28f063b430f6d1def2fd4a84076c5493c8cb69321` |
