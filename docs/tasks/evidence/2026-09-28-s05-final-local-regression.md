# S05 最终本地稳定回归证据

## 结论

`S05-final-local-regression-0928 / blocked`。Server 全包通过，但新增 JSONB 诊断测试使 Server 类型检查失败。本轮只验证，未修改源码、测试、配置或其他草稿，未 stage、commit、清理 WIP。所有本轮启动的进程均已结束。

## 输入与复用

主仓 HEAD 为 `fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`；开始及结束 dirty 条目均为 527，结束前登记的 50 项输入均无漂移。DSA HEAD 为 `f497b6dad0e5519bbbcce1e51a2889d2c2634009`，infra HEAD 为 `9a1f03756afe6831875fa2434619af6500307b00`。

最新时区证据登记的 9 项 SHA 全部一致；复杂度修复证据其余 5 项一致，旧日历结构摘要已由最新时区证据替代。复用 Schemas 43 文件、451 项无 skip、typecheck/build 通过证据，不重复执行。此前真实公开输入联合 82 项无 skip 属于单独证据；本轮默认全包没有公开输入目录，相关 7 项跳过，不能将默认全包替代真实输入门禁。DSA 组合 87 项及 lint 按协调者已确认稳定证据复用，未重跑。

## 实际检查

| 检查 | 命令 | 最后结果 |
| --- | --- | --- |
| JSONB 默认定向 | `env -u DIAG_DATABASE_URL -u DIAG_DATABASE_NAME pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/market/market-window-jsonb-roundtrip-diagnostic.test.ts` | exit 0；1 文件，1 通过、1 跳过；918ms；数据库分支未执行 |
| Server 全包 | `env -u DIAG_DATABASE_URL -u DIAG_DATABASE_NAME -u S05_CALENDAR_PUBLIC_INPUT_DIRECTORY pnpm --filter @thesis-ledger/server exec vitest run --cache=false` | exit 0；226 文件通过、24 文件跳过；1736 项通过、88 项跳过，总 1824；46.58s |
| Server 类型 | `pnpm --filter @thesis-ledger/server typecheck` | exit 2；TS2375，见下方 |

定向结果没有重复累计到全包统计。全包的 88 项 skip 包含 PostgreSQL/Worker 等环境门禁、公开日历输入 7 项以及 JSONB 诊断数据库分支 1 项；skip 不算通过。

失败位于 `apps/server/test/market/market-window-jsonb-roundtrip-diagnostic.test.ts:165:54`：`new PrismaClient({ datasources: { db: { url: databaseUrl } } })` 中 `url` 类型为 `string | undefined`，不能赋值给启用 `exactOptionalPropertyTypes` 的 `Datasource`。本轮未重试或修复。

## 停止点与未执行门禁

类型检查失败后停止 Server build、boundaries、workspace dependencies、owned 严格 ESLint/complexity、Prettier、diff check、真实函数与尺寸 ratchet。没有将历史 13 条无基线 warnings 标记为当前通过。实际尺寸入口为 `scripts/check-file-size-guardrails.mjs`，后续必须提供可验证的 `GUARDRAIL_BASE_REF=fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`；函数入口在 `guardrails:complexity` 脚本的 ESLint `max-lines-per-function` 规则中。不能签发 worker_done。

未执行 DB、Provider、新 I01 诊断、Docker 更新、浏览器或真实 Worker 门禁；I01 合成向量相等不能证明真实 Worker 问题已解决。部署入口准备沿用已有证据：仅源码且容器运行并兼容时使用相邻 infra `./scripts/sync-code.sh thesis-ledger`；预检拒绝或运行条件变化时使用 `./scripts/update.sh thesis-ledger`，本轮两者均未执行。

## 日志及既有构建产物

临时检查日志前缀为 `/private/tmp/s05-final-local-regression-0928-`，分别为 `diagnostic.log`、`server-test.log`、`server-typecheck.log`；完整开始/结束指纹为 `inputs.json`。未输出原始业务日志、凭据或 dirty 路径清单。Context Mode 在本环境不可用，使用 RTK 和有界统计。

Server 既有 `dist` 可读取：1875 文件；按排序的相对路径及各文件 SHA-256 联合摘要为 `7591a1273ab3497e41ee4cbb0b8db2ae7ecb6d818fbf7e4a8c7dc3aa9111fd1a`。这是现有产物身份，本轮没有构建，不作为当前源码 build 通过证据。

## 输入 SHA-256

| 文件 | 开始及结束 SHA-256 |
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
| `apps/server/test/market/market-window-jsonb-roundtrip-diagnostic.test.ts` | `d389552cccc260bde9c8eb8f9a0c4413426a57dccb30c5eb664e3cad099d3b2c` |
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

## 依赖证据 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| [2026-09-28-s05-window-local-gates.md](2026-09-28-s05-window-local-gates.md) | `56f59c2e552906ba06f58a3d070f303119a7ee69545483476b94935758196e54` |
| [2026-09-28-s05-calendar-package-parser.md](2026-09-28-s05-calendar-package-parser.md) | `531bad22afaddb700833ed744da8f8b460f76319aad0a205e7282e435c4fedb0` |
| [2026-09-28-s05-source-capture-parser.md](2026-09-28-s05-source-capture-parser.md) | `18a6d48e1a0c538296ca5b54b1b913ae111dc27f28776b82e444027f0c0bd7da` |
| [2026-09-28-s05-calendar-parser-discovery.md](2026-09-28-s05-calendar-parser-discovery.md) | `31be3ad60f87209bef3ed51b7969dddc3c5bb6e68a5ec2fca63fd8542e6e6bf9` |
| [2026-09-28-s05-schema-empty-source.md](2026-09-28-s05-schema-empty-source.md) | `497248db4c7341434c8ded262e8a4739f33066d19e4081d73e7cb6bd073c5a12` |
| [2026-09-28-s05-daily-window-math.md](2026-09-28-s05-daily-window-math.md) | `feb3ab93246bc8e327afb8dd6677d12518867c6225a8dcca121c5e2e1cc40b78` |
| [2026-09-28-s05-window-schema.md](2026-09-28-s05-window-schema.md) | `30b8cb296c4c46095eeb2f387e609c27967f698d1a354dc238789888a354b60d` |
| [2026-09-28-s05-window-local-integration.md](2026-09-28-s05-window-local-integration.md) | `9369477284d7e449c21ed253bea820acb5ee314f13ddf8f33d4693145605c763` |
| [2026-09-28-s05-parser-test-types.md](2026-09-28-s05-parser-test-types.md) | `29ce8f4c8cdbb224d9ac4c572465da1ddc727468f638dfbaf1169da82d9f622d` |
| [2026-09-28-s05-old-strict-v3-guard.md](2026-09-28-s05-old-strict-v3-guard.md) | `76a77b5aae7da01eb14096d64ecfa0c9bc4442b7cbc9c88f4b822bfbe3c95c85` |
| [2026-09-28-s05-window-discovery.md](2026-09-28-s05-window-discovery.md) | `8d056c327b14a35b0eded364fdc6b7a39a800901dc8a1687f844c2a67396e382` |
| [2026-09-28-s05-manifest-v2-content.md](2026-09-28-s05-manifest-v2-content.md) | `5b16e77d7dafccb03c1be3c16e9e43e014d1a55d89e5f25a3d6b0487f4f4de67` |
| [2026-09-28-s05-reconstruction-guards.md](2026-09-28-s05-reconstruction-guards.md) | `0366aa5078a3bdfc86745e40bc61b408d71e5c9d796ac2085d44b70ddc841082` |
| [2026-09-28-s05-evidence-complexity.md](2026-09-28-s05-evidence-complexity.md) | `6a40673097415e7da6516b9574b23a709907e241caeaee2160ed790612bfc1b6` |
| [2026-09-28-s05-venue-parser-discovery.md](2026-09-28-s05-venue-parser-discovery.md) | `5b4990050b60917d9e24454dc779b67c692bbb04d13904799366474eae3b02c8` |
| [2026-09-28-s05-daily-window-finish.md](2026-09-28-s05-daily-window-finish.md) | `a1a952f6392cb9e1a55263852966362652c00f91414bfc6567e804e895635d3a` |
| [2026-09-28-s05-calendar-schema-timezone.md](2026-09-28-s05-calendar-schema-timezone.md) | `57704ea54b71e6b3ee3de4cf66099243d2a99b1d3a6749c36ee6c8319c5b762f` |
