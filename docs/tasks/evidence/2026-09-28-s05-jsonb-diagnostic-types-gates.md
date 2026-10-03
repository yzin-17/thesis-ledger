# S05 JSONB 诊断类型与剩余本地门禁证据

## 结论

`S05-jsonb-diagnostic-types-gates-0928 / blocked / needs_split`。仅修复诊断测试的 `databaseUrl!` 类型收窄；安全条件、SQL、环境开关与执行行为保持一致。默认无数据库定向、Server typecheck/build、边界与依赖图通过；严格复杂度和 Prettier 失败，不能签发完成。全部本轮命令已结束，无遗留进程。只写授权测试和本文，未 stage、commit、reset、clean 或修改其他源码。

## 输入身份与行为复用

HEAD：`fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`。开始 50 项输入与前轮快照完全一致；结束仅诊断测试源码变化。诊断测试从 `d389552cccc260bde9c8eb8f9a0c4413426a57dccb30c5eb664e3cad099d3b2c` 变为 `22493726cbf8164d9a14addbf56b7063b0e31e95fd586dc09889473733490766`。

使用已安装 TypeScript 的 `transpileModule`（ES2022/ESNext）与 esbuild 0.28.1 的 `transformSync`（loader ts、target es2022、format esm）分别核对修复前后代码；两组输出字节完全一致。TypeScript SHA-256：`91a860110329e373cdedc66c623c6ed111b2832da4ca78be4a32076514a7ef20`；esbuild SHA-256：`f97789adbccfb9654cc2820a0344198de14032de1853f1d331b02fc91c6ac25f`。首轮通过 Vite 路径定位 esbuild 失败（模块未暴露），随后直接使用 pnpm 已安装 esbuild 包；这不是源码检查失败。

因此复用 [前轮全包证据](2026-09-28-s05-final-local-regression.md)：Server 226 文件通过、24 文件跳过，1736 项通过、88 项跳过。没有重跑全包。Schemas 451 项、typecheck/build、真实公开原包联合 82 项及 DSA 87 项的输入未变化，继续复用协调者确认的稳定证据。跳过不计通过；真实数据库、Provider、I01 新诊断、Worker、Docker、浏览器均未执行。

## 实际命令与结果

以下命令均通过 `rtk proxy` 执行，日志前缀为 `/private/tmp/s05-jsonb-types-gates-`。普通与严格 ESLint、Prettier 使用 `owned.json` 的 49 个 TS 文件；清单从前轮 50 项输入中过滤 TS，并核对当前 S05 证据路径，没有额外遗漏路径。

| 检查 | 实际命令 | 结果 |
| --- | --- | --- |
| 默认诊断 | `env -u DIAG_DATABASE_URL -u DIAG_DATABASE_NAME pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/market/market-window-jsonb-roundtrip-diagnostic.test.ts` | exit 0；1 文件、1 pass、1 skip；672ms；数据库分支未执行 |
| Server 类型 | `pnpm --filter @thesis-ledger/server typecheck` | exit 0，tsc --noEmit |
| Server 构建 | `pnpm --filter @thesis-ledger/server build` | exit 0，nest build |
| 边界 | `node scripts/check-boundaries.mjs` | exit 0，Import boundaries OK |
| 依赖图 | `node scripts/check-workspace-dependencies.mjs` | exit 0，8 packages |
| 严格 lint | `pnpm exec eslint <49 TS> --max-warnings=0 --rule 'no-nested-ternary:error' --rule 'complexity:[error,20]' --rule 'max-lines-per-function:[error,{{max:220,skipBlankLines:true,skipComments:true}}]'` | exit 1；7 errors、0 warnings |
| 普通 lint | `pnpm exec eslint <49 TS> --max-warnings=0` | exit 0 |
| 格式 | `pnpm exec prettier --check <49 TS>` | exit 1；16 文件失败 |
| 真实尺寸 | `GUARDRAIL_BASE_REF=fe0e871e37a09964f7a113b82e7d09f6d4d95f7e node scripts/check-file-size-guardrails.mjs` | exit 0；13 legacy warnings，ratchet passed；使用真实 HEAD 基线 |
| 空白 | `git diff --check` | exit 0 |
| 文档路径 | Python/Node 检查当前日期 S05 证据换行、尾空白与相对/绝对 Markdown 文件链接，识别行号后缀 | 18 文件、36 链接、0 错误；初次未剥离 :行号产生6个假阳性，修正解析后全部存在 |

Server 构建产物 `apps/server/dist`：1905 文件；按排序相对路径、NUL、每文件 SHA-256、换行联合摘要：`32a98b36d05213e02f8bbdb725f9777eb1fa5f8dbb4f9059d2385e66066018ee`。构建修改可重建 dist；不代表安装或部署验收。

## 必须继续解决的失败

严格 ESLint 失败属于稳定的本批验证输入，均不是本叶引入；本叶没有写权，保持失败事实交还协调者拆分：

| 文件（apps/server/src/backtest/） | 位置与失败 |
| --- | --- |
| backtest-snapshot-v3-builder.ts | 243:43，complexity 27 |
| backtest-snapshot-v3-completeness.ts | 54:9，complexity 31 |
| backtest-snapshot-v3-dependencies.ts | 449:3，complexity 35 |
| backtest-snapshot-v3-dependency-validation.ts | 48:31，complexity 21 |
| backtest-snapshot-v3-execution-evidence.ts | 51:52，247 行；55:18，complexity 86 |
| backtest-snapshot-v3-source.ts | 55:38，complexity 25 |

Prettier 失败 16 文件：上述6文件，以及 backtest-reconstruction-preflight-v3.ts、backtest-snapshot-v3-calendar-alignment.ts、backtest-snapshot-v3-dependency-collector.ts、backtest-snapshot-v3-dependency-error.ts、backtest-snapshot-v3-events.ts、backtest-snapshot-v3-multi-window.ts、market/market-pit-reconstruction.repository.ts、test/backtest/backtest-reconstruction-preflight-v3.test.ts、test/backtest/v3-snapshot-builder.test.ts、test/market/market-pit-reconstruction.repository.test.ts（源码默认前缀 apps/server/src/backtest/，另列完整子路径者按 apps/server/ 解析）。诊断测试自身格式通过。没有宽泛格式化、阈值放宽或 ignore。

尺寸门禁本次通过，无当前增长失败；13 项遗留告警包含 AI Provider WIP 的 service 和两个测试，均为低于基线的收敛（1161/1189、865/890、1275/1363）。不能把这些基线已核验的告警误报为新增失败，也没有使用无 HEAD 的警告模式。

## 范围与资源结束

严格门禁失败后没有进入更高层运行时验证；仅完成同层独立静态门禁与证据收尾。部署未执行，本批涉及 DSA 与 Server，前证据的 thesis-ledger 单目标不能沿用为本批部署选择；部署目标由另叶按实际 all 范围决定。本叶不选择或执行部署。本会话完成交付即关闭，不复用。

开始与结束快照：`/private/tmp/s05-jsonb-types-gates-start.json`、`/private/tmp/s05-jsonb-types-gates-end.json`；49 TS 清单：`/private/tmp/s05-jsonb-types-gates-owned.json`。原始检查日志包括 diagnostic、typecheck、build、boundaries、dependencies、strict、lint、prettier、size、diff。Context Mode 工具发现为空，采用 RTK 与有界摘要。

## 结束输入 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| `/private/tmp/goal-s05-reconstruction-guards-target-20260928.py` | `79862d10316a89832248862be1833507f62835ab21af7a62e1bf568edc364cf2` |
| `apps/server/src/backtest/backtest-reconstruction-preflight-v3.ts` | `b67b7e3975cf17a62322865159d45d8d9c1a46a369a2ab78a049bd193d3640ed` |
| `apps/server/src/backtest/backtest-snapshot-v3-builder.ts` | `db3d8b3ffad963c753b04b1b5634ef1a9c190462f0db3296404db123f29c5d70` |
| `apps/server/src/backtest/backtest-snapshot-v3-calendar-alignment.ts` | `4f9a10022d837ccff46160bea9bb858316d7cb1c484fc16f7d9f07c0ecd50864` |
| `apps/server/src/backtest/backtest-snapshot-v3-comparable-data.ts` | `6a141184de532babe4eb58884e73e30dcbc06aae90688e7eb3b106d191341213` |
| `apps/server/src/backtest/backtest-snapshot-v3-completeness.ts` | `aed00ca88020dd7248e84390729d1d91e263ace9223190ac80bf0e56f28304a0` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependencies.ts` | `4440a7f8319a797ed6ccffb0438f2ebb4003fdfc9f90a24f9c82301240904763` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-collector.ts` | `8817abea7cddea732854c384472a9653ad1163725757559c8bbb1e2568a38364` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-error.ts` | `85410b83d5531a94777eb13d2b0aeaeb696f65271693e0d7f070324e4b765b21` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-validation.ts` | `ae7dcdd6f000adcd4c07a80ffbd6a3565d5bb675c2691f15d2ad764bc1233569` |
| `apps/server/src/backtest/backtest-snapshot-v3-events.ts` | `f095727ca53892cf444e22aedd71ad14f4f69dce9db6c959e49150bc8bff5194` |
| `apps/server/src/backtest/backtest-snapshot-v3-execution-evidence.ts` | `2791c1e488f9d543da2fd537bba1a06d893b8972c6386efafba2bd6eacbe8948` |
| `apps/server/src/backtest/backtest-snapshot-v3-input-plan.ts` | `2823ecd2345589cf806a9e602a153579fcd532f2f6efc34577a206ef4de840c4` |
| `apps/server/src/backtest/backtest-snapshot-v3-multi-window.ts` | `d2fe0c82c560453a2da794b9d2da93bedfca658754a01e3e7cf7666de9661bbb` |
| `apps/server/src/backtest/backtest-snapshot-v3-pit-guard.ts` | `0c6237f00fe7a68ccd4146700a4c2e3a4684ba716d6ace4d5f069dd098b71f3e` |
| `apps/server/src/backtest/backtest-snapshot-v3-source.ts` | `298a0620a0c7cf581fb4376535a0e7a3b1922b0428d95254fc24447446f22af7` |
| `apps/server/src/backtest/backtest-snapshot-v3-store.ts` | `c4638dd8369c17bc9144465f732b52737edc649fb3d87a076501019326f17eed` |
| `apps/server/src/backtest/backtest-snapshot-v3-validation.ts` | `1648301ecdae856dfadcb1b4bf43c3331a2d7d6b3570fd02b5de3d4e2afdf17c` |
| `apps/server/src/market/market-pit-calendar-package-projection-v1.ts` | `7337c2f2cb5053bf020218a4347fd86535f7b23a7fe4ed25df7761c7b2534965` |
| `apps/server/src/market/market-pit-calendar-package-source-v1.ts` | `efed42b9895ecf4e1fc89e9c0415f1771c013365f7bdc59b4000781fe4b35d2a` |
| `apps/server/src/market/market-pit-calendar-package-v1.ts` | `0330d5a5325f77924f2c8ac3f79e3d1f1bbe1b9bab746756b1d3b72fd7c479dd` |
| `apps/server/src/market/market-pit-decision-window-calendar-v3.ts` | `95515601c3f632abf4f3be1a1d54dd14b23379b663d368ed63b8f10824788d86` |
| `apps/server/src/market/market-pit-decision-window-source-v3.ts` | `36acd8543ff4af119d63a9e2130463fbe9871e72e21070431a3ec55e0f20effd` |
| `apps/server/src/market/market-pit-decision-window-v3.ts` | `b45bd76f660fcd25690c0ed003543a8639dce0df8b83e4ad4d4fb369af5181e2` |
| `apps/server/src/market/market-pit-evidence-instant-v1.ts` | `e6fe936cfcd90ec6bf17bc9905903f80792f94cefb0c0dcad4c05a16c7768f76` |
| `apps/server/src/market/market-pit-reconstruction-content-v3.ts` | `e831152a1338ce7633a6c8163670b144e663585f9e5e5e0c295c7eab6bb7f768` |
| `apps/server/src/market/market-pit-reconstruction.repository.ts` | `f02186f0f8da7b1cd6d7c991cd362a0d0e8e0819c1cbea71614348e7dc37948f` |
| `apps/server/src/market/market-pit-source-capture-v1.ts` | `990ad6aa7b590049c1aa23cf72544b4653a257a97691d65e0562d178b00e6abb` |
| `apps/server/test/backtest/backtest-reconstruction-preflight-v3.test.ts` | `d543161362b73f2541e77c1be4fc06567fbc10d47a4b6d12dd0d22c171213017` |
| `apps/server/test/backtest/v3-snapshot-builder.test.ts` | `98acfbf4947b91e346bff3acb694b9024b3d3951717c52b44ce6df90cd4963d3` |
| `apps/server/test/backtest/v3-strict-snapshot-replay-guard.test.ts` | `baab4b00eba7b3eed2f739156a59b1a624c0595e13baf60bbbceddc4e1c389df` |
| `apps/server/test/market/market-pit-calendar-package-projection-v1.test.ts` | `0e43110ef42282f07914074046d5362fd88fb85b27e8466a460f7cfe1c2f8118` |
| `apps/server/test/market/market-pit-calendar-package-source-v1.test.ts` | `5924569e0a32aa901678335aa92b4da0b1cb2439376edf80b810f03bf400bebc` |
| `apps/server/test/market/market-pit-calendar-package-v1.test.ts` | `d88815e37606ff60c815464b28190d3e50df5563e7cce0a2dae26c1e0ac87548` |
| `apps/server/test/market/market-pit-calendar-schema-interoperability.test.ts` | `d4311e5f17e691f43bf52c51dcd64bfaf0ece40c28daa9e75a6e616a26477449` |
| `apps/server/test/market/market-pit-decision-window-v3.test.ts` | `a6e57d79bbddc0b5d53fefcacbc7e0097b85769e4c1756708fe1c8af1c604a4c` |
| `apps/server/test/market/market-pit-reconstruction-content-v2.test.ts` | `4ded0b45e66cee1649aac37247698e9088892bd0c218e132fdd028c7a6d90aea` |
| `apps/server/test/market/market-pit-reconstruction.repository.test.ts` | `815fe692236057683db1bb453e612d2709a8651322d2df84299fa2615ec51ac9` |
| `apps/server/test/market/market-pit-source-capture-v1.test.ts` | `796cd574036a77cfddab88d3bec61dbc2b57b08371777956a3006ec5339cb2c7` |
| `apps/server/test/market/market-window-jsonb-roundtrip-diagnostic.test.ts` | `22493726cbf8164d9a14addbf56b7063b0e31e95fd586dc09889473733490766` |
| `packages/schemas/src/index.ts` | `d64c164fb5afadecfba89cb17945a871f6256aeadcd0af5e2dcd3469efc5da01` |
| `packages/schemas/src/market-pit-calendar-structure-v1.ts` | `413c3feb7b1d5434671956b7e9834442de9915c479025cd27554fee41b783c5b` |
| `packages/schemas/src/market-pit-historical-bar-bindings-v1.ts` | `f5f3d201c8965811149a17a245d91472f28e34c447d1db876193d17305db0970` |
| `packages/schemas/src/market-pit-historical-evidence-v1.ts` | `ad61c28930ae4b5275a2e3e2d21f7870f9f0986afc23a589f6320a560c3d87a8` |
| `packages/schemas/src/market-pit-historical-references-v1.ts` | `7ee43020f6503f865fed0bbca57044eb20bc41daaba4d394df40cf2cac6cf986` |
| `packages/schemas/src/market-pit-reconstruction-manifest-validation-v3.ts` | `d6f380dc35ac13664d6c05f28f063b430f6d1def2fd4a84076c5493c8cb69321` |
| `packages/schemas/src/market-pit-reconstruction-v3.ts` | `da1d8521a9e64877d578633cbea9274f3e6ba5dcaa0b0e8282f55bf086bf3022` |
| `packages/schemas/test/market-pit-calendar-timezone-v1.test.ts` | `f785c6f5f12967aba15ee3640da8c36733c6ef4b1ea0ea13f16ddc18234a9ea5` |
| `packages/schemas/test/market-pit-historical-evidence-v1.test.ts` | `0e663e71666ec27cb29652fc6c0fa08967ed63c39df77bb0e6a512acb8855832` |
| `packages/schemas/test/market-pit-reconstruction-v3.test.ts` | `e60112a2fa836ac57c1b4345ad4cd917b514638432a884c70224affb5d61de61` |
