# Server 稳定输入包级门禁证据

日期：2026-09-28。任务：`CONT-Server-stable-gates`。状态：`worker_done`，Server 本批稳定源码的本地全包、类型、构建与静态门禁通过；等待协调者最终一致性 Review。

## 范围与资源

依据主 [Task §12.9](../2026-09-25-multi-source-adjustment-aware-backtest.md)，复用 [S05 门禁](2026-09-28-s05-precision-regression-gates.md) 的实际入口与摘要算法，不复用其旧 1747 项测试结果。已读取 RTK、Codex、项目/工作区 AGENTS 与既有实施指导；Context Mode 未暴露，使用 `rtk proxy`、临时完整日志及有界统计。执行前已确认 Server `test=vitest run`、`typecheck=tsc -p tsconfig.json --noEmit`、`build=nest build`，没有误调用工作区全量脚本。

唯一新增文档为本文；唯一构建资源为 `apps/server/dist`；验证辅助、日志与输入清单位于 `/private/tmp/cont-server-stable-*`。源码、测试、manifest、锁文件与 Schemas dist 始终只读，无源文件格式化、生产修复、暂存、提交、reset、子代理或数据库/Provider/AI/目标请求。相邻 DSA 的 worker 不影响本叶输入。Server build 仅一次；没有 Schemas 或工作区全包 build/test。

HEAD 起终均为 `fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`。主仓起终工作区状态统计均为 156 项 tracked 变化、391 项 untracked；完整 WIP 保留。门禁不是以这些变化数量证明内容一致，而是使用下节逐文件原字节摘要。

## 稳定输入

输入先记录开始快照，再有序执行全包→类型→构建→限定静态→仓库门禁，最后记录结束快照。算法为仓库相对路径排序后逐文件更新 UTF-8 路径 + NUL + 原始字节 + NUL；逐文件另保留原字节 SHA-256。

- 主源码/配置 889 项：Server `src/test/prisma`；Schemas `src/test/fixtures`；domain/shared 源码；实际存在的 root/package/锁/workspace/tsconfig/Vitest/setup/Nest、ESLint、Prettier 配置与门禁脚本。开始及结束 SHA 均为 `0a1fa6d3577a4451221fa348fff92c41d455c8ed20892ce02e45a29fe80fe744`，零漂移。清单位于 `/private/tmp/cont-server-stable-source-start.json` 和 `source-end.json`。这是起终原快照排除依赖 dist 后的子集；生成时逐条确认当前原字节仍等于原始快照的单文件 SHA，未用事后新内容冒充开始输入。
- 实际测试/类型所消费的依赖产物一起登记为 1237 项：在上述范围加入 Schemas/domain/shared 等既有依赖 dist，开始及结束 SHA 均为 `5540c75375a09d52e3636c798095b0626e9b5bcd4c8cc79e6ea1d87fad967765`，零漂移。清单位于 `/private/tmp/cont-server-stable-start.json` 和 `end.json`。本叶 Server dist 始终排除在输入之外。
- 限定 lint/格式后以及仓库门禁前另登记普通 TS/TSX 与 package 清单，涵盖 `apps/packages/services/scripts` 及实际三份门禁脚本，排除依赖、dist、发布/native 构建产物和生成目录，共 1283 项。门禁前后 SHA 均为 `a78ec39584936ead79bdb088dfb744738cfe49f1dd25222e489f24e1cbc9a35a`；清单位于 `/private/tmp/cont-server-stable-gate-start.json` 与 `gate-end.json`。该清单不声称包括 native 工程输入，本叶没有 native 配置变更或 native 验收。

上述全部快照排除 docs、日志、本叶临时输入清单与 Server dist，记录包括未跟踪源码。运行时 Node 为 `v24.18.0`；包管理器及工具依赖由实际 `package.json` 和 `pnpm-lock.yaml` 绑定。Schemas 本批共享合同 [546 项全包、typecheck/build](2026-09-28-cont-m26-identity-wire.md) 的源码/产物摘要与当前快照一致，不重复执行，也不与 Server 结果相加。

## 实际检查

执行目录均为主仓。辅助 runner `/private/tmp/cont-server-stable-runner.mjs` 使用结构化参数调用下列实际命令，所有命令/环境差异/退出码/耗时记录于 `/private/tmp/cont-server-stable-results.json`。每项必需检查退出 0 后才升级；本叶无业务失败、源码修复或失败重试。

| 顺序 | 实际命令 | 结果 |
| --- | --- | --- |
| 全包 | `rtk proxy env -u DIAG_DATABASE_URL -u DIAG_DATABASE_NAME -u S05_CALENDAR_PUBLIC_INPUT_DIRECTORY pnpm --filter @thesis-ledger/server exec vitest run --cache=false` | 228 文件通过、24 文件跳过；1769 项通过、88 项跳过，总 1857；runner 37.772s，Vitest 37.03s。 |
| 类型 | `rtk proxy pnpm --filter @thesis-ledger/server typecheck` | exit 0，8.632s。 |
| 唯一构建 | `rtk proxy pnpm --filter @thesis-ledger/server build` | exit 0，13.227s；只构建 Server。 |
| 普通 ESLint | `rtk proxy pnpm exec eslint <下表13份TS> --max-warnings=0` | exit 0，零 warning，6.197s。 |
| strict ESLint | 同一实际 13 TS 命令追加 `--rule no-nested-ternary:error --rule 'complexity:[error,20]' --rule 'max-lines-per-function:[error,{max:220,skipBlankLines:true,skipComments:true}]'` | exit 0，零 warning，5.507s；没有放宽阈值。 |
| 格式 | `rtk proxy pnpm exec prettier --check <下表13份TS> packages/schemas/fixtures/market-tushare-identity-v3.synthetic.json` | exit 0，14 文件全部通过，0.510s；只检查。 |
| 边界 | `rtk proxy node scripts/check-boundaries.mjs` | exit 0，Import boundaries: OK，1.246s。 |
| 依赖 | `rtk proxy node scripts/check-workspace-dependencies.mjs` | exit 0，8 包，OK，0.045s。 |
| 真实 HEAD 尺寸 ratchet | `rtk proxy env GUARDRAIL_BASE_REF=fe0e871e37a09964f7a113b82e7d09f6d4d95f7e node scripts/check-file-size-guardrails.mjs`；实际 runner 将该环境键直接传给 `rtk proxy node scripts/check-file-size-guardrails.mjs` | exit 0，13 legacy warnings，ratchet passed，0.473s；实际基线有效，不是无基线 warning-only 模式。 |
| 限定空白 | `rtk proxy git diff --check -- <下表13份TS> packages/schemas/fixtures/market-tushare-identity-v3.synthetic.json` | exit 0，0.017s；另外逐 14 份文件检查 `[ \t]+$`，含未跟踪文件，无尾随空白。 |

完整成功日志保留于 `/private/tmp/cont-server-stable-{test,typecheck,build,eslint,strict-eslint,prettier,boundaries,dependencies,size,diff}.log`。第一次全包输出 reducer 对 `durationMs` 的宽匹配包含部分合成测试日志；已将临时 reducer 收紧至统计/错误行，没有因此重跑全包或修改生产源码。准备期一次不存在的 shell glob 查询失败，随后使用精确文件名定位条件；不是门禁失败，没有升级或源码修复。

## 跳过与依赖覆盖

88 项 skip 由实际全包日志逐文件统计确认，清单位于 `/private/tmp/cont-server-stable-skips.json`：数据库/Worker/队列/真实 HTTP 发布/备份集成条件 80 项，JSONB 真实数据库诊断 1 项，未配置公开原文目录 7 项。24 文件整体跳过；另外两个通过文件各有 1 项条件 skip，因此日志中有 skip 的文件为 26 份。实际源码确认条件分别包括隔离 database/Redis、备份 container、真实日历发布 origin/token、`DIAG_DATABASE_URL` 与 `S05_CALENDAR_PUBLIC_INPUT_DIRECTORY`。没有配置或调用这些外部条件，没有把 skip 记为通过，合成业务/内存数据库不替代真实验收。

按协调者追加要求执行轻量消费扫描：

```sh
rtk proxy rg -l 'MarketEventResponseV3|marketEventExchangeV3Schema|marketEventResponseV3Schema' apps packages services --glob '!dist/**' --glob '!**/dist/**' --glob '!**/node_modules/**' --glob '*.ts' --glob '*.tsx'
```

18 份匹配均在 Server 或 Schemas：Server DSA client/事件接缝、市场验证器/selector、SnapshotEvents 与相关测试；Schemas event wire 与相关测试。API-client、Desktop、mobile、domain 没有直接消费这些新增 shape。完整路径和命令在 `/private/tmp/cont-server-stable-dependency-scan.json`。因此本叶没有新增其他包的 typecheck 义务或盲跑整个 workspace；Schema index/type 出口已由前述共享合同的全包/type/build 覆盖。

## 限定静态输入清单

下列 13 TS 是实际 lint/strict/格式参数集合，主快照起终逐项相等；不以 tracked-only 列表遗漏新文件。

| 路径 | SHA-256 |
| --- | --- |
| `apps/server/src/market/market-tushare-identity-v3.ts` | `026847f13377a7744461c3e33cab054aee6fcd212d896f9bc698210ebdfd9f8f` |
| `apps/server/src/market/market-event-selector-v3.ts` | `544eed9808056677a4a0ce54a1a5ef24c63994c268d19ab25a7baf0c27dc557f` |
| `apps/server/src/backtest/backtest-snapshot-v3-events.ts` | `575f3b252b8e87f2455d30bbc60e4679149edfce2ad06bbde2cf6fb46b5b5e31` |
| `apps/server/test/market/tushare-event-fixtures.ts` | `fb054ae7d2a44a4969ae9db5fc5ee8dedfb819a8aab521ccf7fa69ae15d6a834` |
| `apps/server/test/market/market-tushare-identity-v3.test.ts` | `8f578414fb79651571685e66d9c1cff71dc60262159af67f42a5798b36f3f7af` |
| `apps/server/test/backtest/backtest-tushare-identity-replay-v3.test.ts` | `0dd499ccf283d52d9accf4e3a46194b23a51ae9b7d3875a6b3cb6988e99c33aa` |
| `apps/server/src/market/market-pit-reconstruction-content-v3.ts` | `486fc042e6aa5bca6723c7c4c43a1a0a8d84fdfcf1f5bea5ac6067ea87d1b4ea` |
| `apps/server/src/market/market-pit-reconstruction-content-clock-v3.ts` | `3e243a08088f87366a8cc2196f716338097f3150bacb9687ee22745743f31ec2` |
| `apps/server/test/market/market-pit-reconstruction-content-v2.test.ts` | `cb3af5f9874655092647fa898ca04377abd950c9355fd93c07eba9051d7343df` |
| `packages/schemas/src/market-tushare-identity-v3.ts` | `6a0c4c806098e2bf446fb80ba7cd0960829a8d9777476e805ecd5e2df662ca6f` |
| `packages/schemas/src/market-event-wire-v3.ts` | `f43ce11897a84044df4550ad8f9ff575d7ff3fee9af29034cfbfcd751c6134e7` |
| `packages/schemas/src/index.ts` | `c2f14362bdb1e786e4f52f93ccd29bee17e17a481d0205e8f41a38695350f4e1` |
| `packages/schemas/test/market-tushare-identity-v3.test.ts` | `0fb066a58c3cb8cc9b51071c9dfd385a73aae2cdf8f12f992cf5147365a9faa3` |

另一个格式输入 golden 的 SHA 为 `0298618600ce99007e75da74b31344a0f6fa21933631e70f26231e9d5f2d2148`，也在开始/结束主快照内。

## 构建产物与交还

实际 `apps/server/dist` 共 1950 文件，按相同路径 + NUL + 原字节 + NUL 算法聚合 SHA-256 为 `0fc94c7d100a5bcf3a0df692b39b64ed6f6680b543e68e3d7305c0c8039365c4`。完整逐文件 SHA/字节数清单位于 `/private/tmp/cont-server-stable-dist.json`，可供后继目标同步逐项比较。本地构建不证明镜像、容器或部署一致。

| 关键构建文件 | SHA-256 |
| --- | --- |
| `apps/server/dist/src/market/market-tushare-identity-v3.js` | `fa65ef50090263a7cb3cd809fe624bfc7344becabf56ff4b99758d1edeaa5013` |
| `apps/server/dist/src/market/market-event-selector-v3.js` | `a4e407d85ba204e3334f1ce55733fbe6c520b159f44294118b5c3c99573cb85c` |
| `apps/server/dist/src/backtest/backtest-snapshot-v3-events.js` | `1c9aa35cbfb25ce26c6692c4c5865b7877d67e028375aa81dcd088697050de48` |
| `apps/server/dist/src/market/market-pit-reconstruction-content-v3.js` | `0fd51b50a1f487610683bde1426638c756163a53307860cb9f83872eb1f88a61` |
| `apps/server/dist/src/market/market-pit-reconstruction-content-clock-v3.js` | `35dd5ae9ef2da412704965d163c2a6b21e8f4251a7d69d45d610d08637b38ab6` |

本叶没有真实来源、公开原包重新认证、数据库、Worker、HTTP、AI、业务任务、浏览器或目标部署结果，不关闭 M26/M2/M3、S05 qualification、AC20 或整体验收。目标同步仍等待 DSA 生产叶的低层门禁与协调者释放。

全部命令已结束，没有后台进程或保留端口，Server dist 与门禁资源交还协调者。后续源码/配置/依赖输入变化会使受影响结果失效；docs 更新不改变上述检查输入。本叶停止写入，不自行开始下一任务。
