# S05 依赖与完整性复杂度收敛证据

## 范围与状态

- 叶任务：`S05-dependency-complexity-0928`；执行状态：`worker_done`，待父级稳定输入集成与最终验收。
- 依据：`docs/specs/2026-09-25-multi-source-adjustment-aware-backtest.md` §10 的原阈值及行为保持要求。
- 写入范围只有下表七个 Backtest 源码及本证据。既有 dirty WIP、公共导出入口、collector、测试、Spec/Task 和兄弟负责的 builder/source/execution-evidence 均未修改；未 stage、commit、reset、clean。
- Context Mode 工具未暴露，长输出通过 shell 内过滤和 `/tmp` 数据文件汇总；源码编辑与格式修正使用原生 `apply_patch`。

## 基线与最终内容摘要

摘要均为文件完整字节的 SHA-256；新 helper 基线为不存在。最终源码摘要对应下述最后一次测试与静态检查。

| 文件（均在 `apps/server/src/backtest/`） | 修改前行数 | 修改后行数 | 修改前 SHA-256 | 修改后 SHA-256 |
| --- | ---: | ---: | --- | --- |
| `backtest-snapshot-v3-dependencies.ts` | 598 | 291 | `4440a7f8319a797ed6ccffb0438f2ebb4003fdfc9f90a24f9c82301240904763` | `cd7f95170230a6d3bd35034e4e2be1cba1d3a83ffff52dda4e4ccf34ea3bd204` |
| `backtest-snapshot-v3-dependency-validation.ts` | 124 | 108 | `ae7dcdd6f000adcd4c07a80ffbd6a3565d5bb675c2691f15d2ad764bc1233569` | `77f1536e3a3f0aeafd42ef9e298294e5f44752301fe3b7b3ea8b3d8b781d7416` |
| `backtest-snapshot-v3-completeness.ts` | 158 | 97 | `aed00ca88020dd7248e84390729d1d91e263ace9223190ac80bf0e56f28304a0` | `30f50c451dc9794f2453555a7fb0b8c002a6f2c4ec277cffcceb32e883683768` |
| `backtest-snapshot-v3-dependency-instrument-identity.ts` | 新增 | 58 | 无 | `478cd2333b32909854cdcc5304c9b5e865c5a35cc4c50796c542c90586f118f7` |
| `backtest-snapshot-v3-dependency-response-checks.ts` | 新增 | 319 | 无 | `a797adcc86a0f0389979de19d40d861d9fa2374147f02acd03b442117615b8d8` |
| `backtest-snapshot-v3-completeness-checks.ts` | 新增 | 121 | 无 | `719f8c0069569a4593dea3aa8934eca08f436b7106637d8446d2449c0f3a080e` |
| `backtest-snapshot-v3-dependency-artifact-checks.ts` | 新增 | 38 | 无 | `2f04c74992e83d25e5edd666bd403fd343932a2b262fc4548f604ae1f1b7ce16` |

## 职责拆分与行为保持

1. `dependency-instrument-identity` 拥有依赖标的身份解析，保留市场、资产类型、路径及控制字符拒绝规则和同样错误文本；依赖请求分组、排序和去重仍由原文件编排。
2. `dependency-response-checks` 拥有响应合同、覆盖范围、事实身份/时间及事实行序列化。按 Calendar、标的历史事实、公司行动三种合同拆分逐事实检查；原公共 `validateSnapshotDependencyResponseV3` 仍通过原模块导出，参数、返回对象和同步异常不变。
3. `dependency-artifact-checks` 拥有冻结 Artifact 唯一性索引及 canonical JSON 解析；离线校验仍依次建立计划、检查重复 key、核对 Artifact 集合、证据行集合、逐请求身份与请求原文、响应原文、事件或事实证明，再核验公司行动计划。
4. `completeness-checks` 拥有完整快照的来源绑定阶段及最终 Artifact/执行事实兼容性阶段。原完整性入口仍先检查 complete 标签、metadata、严格 Schema、行情版本和结算日历，再检查计划与绑定、非价格证明、日历对齐、Provider 版本，最后执行集合和规则重验。绑定常量与构造器继续经原模块导出。

所有提取都是原有同步检查的语义迁移，条件表达式和各阶段顺序保持；逐事实错误仍按原遍历顺序抛出。公司行动按原事件窗口筛选，完整原响应、canonical 证明及空数据 sentinel 保持。没有新增或删除网络、数据库、Artifact 存储读写；未修改准备选择 fence、Market 原始证据、严格 PIT 资格或冻结格式。辅助模块仅依赖 Backtest 内原接缝与原 Schemas 类型，没有新增跨 feature 依赖或通用 shared/utils。

## 复杂度与有效函数长度

修改前 ESLint 在三个入口分别报告复杂度 35、21、31；原有效长度 220 规则未报告告警。以下最终指标由 ESLint API 临时度量规则收集，生产配置、阈值与 ignore 没有改动；严格门禁仍使用复杂度 20、有效长度 220、零警告。有效长度跳过空行与注释。

| 文件 | 文件内最大函数复杂度（含回调） | 文件内最大有效函数长度 |
| --- | ---: | ---: |
| `backtest-snapshot-v3-dependencies.ts` | 10 | 92 |
| `backtest-snapshot-v3-dependency-validation.ts` | 19 | 75 |
| `backtest-snapshot-v3-completeness.ts` | 11 | 50 |
| `backtest-snapshot-v3-dependency-instrument-identity.ts` | 13 | 35 |
| `backtest-snapshot-v3-dependency-response-checks.ts` | 12 | 63 |
| `backtest-snapshot-v3-completeness-checks.ts` | 12 | 55 |
| `backtest-snapshot-v3-dependency-artifact-checks.ts` | 4 | 16 |

| 原入口 / 新阶段函数 | 最终复杂度 | 最终有效长度 |
| --- | ---: | ---: |
| `validateSnapshotDependencyArtifactsV3` | 19 | 75 |
| `validateCompleteSnapshotInputsV3` | 11 | 50 |
| `validateCalendarResponseFacts` | 12 | 32 |
| `validateInstrumentResponseFacts` | 11 | 34 |
| `validateCorporateActionResponseFacts` | 5 | 18 |
| `validateSnapshotDependencyResponseV3` | 10 | 47 |
| `validateCompleteSnapshotSourceBindingsV3` | 10 | 35 |
| `validateCompleteSnapshotExecutionFactsV3` | 12 | 55 |

三个原文件均缩短；新增 helper 最大 319 行。最大函数复杂度 19、最大有效函数长度 92，全部在原阈值内。

## 最终定向验证

以下命令均在主仓执行，进程均以 exit 0 结束。最后一次测试发现与指定范围一致：6 文件 / 31 测试通过；没有新增 mirror tests。

```sh
pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/backtest/backtest-snapshot-v3-dependencies.test.ts test/backtest/backtest-preflight-v3-dependencies.test.ts test/backtest/v3-complete-snapshot.test.ts test/backtest/v3-split-mapping-snapshot.test.ts test/backtest/backtest-rqdata-identity-replay-v3.test.ts test/backtest/v3-strict-snapshot-replay-guard.test.ts
```

覆盖已有依赖请求与范围拒绝、Provider 缺失或未来事实、版本/证明/事实行篡改、完整快照断网离线重放、事件映射篡改和覆盖不完整、RQData 身份原文、旧 STRICT V3 终态拒绝与原字节保持。最终一次运行耗时 5.97 秒。

普通 ESLint、原阈值严格 ESLint、Prettier 检查与定向 diff 检查命令如下；均通过，ESLint 零错误、零警告。

```sh
pnpm exec eslint apps/server/src/backtest/backtest-snapshot-v3-dependencies.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-validation.ts apps/server/src/backtest/backtest-snapshot-v3-completeness.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-instrument-identity.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-response-checks.ts apps/server/src/backtest/backtest-snapshot-v3-completeness-checks.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-artifact-checks.ts --max-warnings=0
pnpm exec eslint apps/server/src/backtest/backtest-snapshot-v3-dependencies.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-validation.ts apps/server/src/backtest/backtest-snapshot-v3-completeness.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-instrument-identity.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-response-checks.ts apps/server/src/backtest/backtest-snapshot-v3-completeness-checks.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-artifact-checks.ts --max-warnings=0 --rule 'no-nested-ternary:error' --rule 'complexity:[error,20]' --rule 'max-lines-per-function:[error,{max:220,skipBlankLines:true,skipComments:true}]'
pnpm exec prettier apps/server/src/backtest/backtest-snapshot-v3-dependencies.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-validation.ts apps/server/src/backtest/backtest-snapshot-v3-completeness.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-instrument-identity.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-response-checks.ts apps/server/src/backtest/backtest-snapshot-v3-completeness-checks.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-artifact-checks.ts --check
git diff --check -- apps/server/src/backtest/backtest-snapshot-v3-dependencies.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-validation.ts apps/server/src/backtest/backtest-snapshot-v3-completeness.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-instrument-identity.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-response-checks.ts apps/server/src/backtest/backtest-snapshot-v3-completeness-checks.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-artifact-checks.ts
```

首轮静态检查发现完整性文件的一条未使用 import，已删除；最终检查针对上述摘要重新执行。未修改测试与 runner 配置，未出现 broad test discovery。

## 验证边界与交接

本叶未执行包级测试、typecheck、build、仓库边界/依赖/文件尺寸门禁、Docker、数据库、Provider、I01 诊断、部署或业务任务写入；它们不计为通过。并行兄弟负责的源码不属于本叶稳定输入承诺，包级与仓库最终门禁由父级在所有叶停止写入后统一执行。

本叶所有 shell、测试、格式及 lint 命令均已结束；没有留下后台任务或服务，已停止源码写入。现有定向覆盖未发现必须扩展测试的缺口；最终集成验收仍由父级负责。
