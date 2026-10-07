# S05 稳定输入回归与仓库门禁证据

## 结论与权限边界

`S05-stable-regression-gates-0928 / worker_done`。本叶仅完成稳定输入下的本地回归与静态门禁；不代表整体 AC、M1/M2/M3 或真实业务验收完成。唯一仓库写入为本文，未修改源码、测试、配置、Spec/Task，未 reset、stage、commit、clean 或 format。读取项目 AGENTS、RTK、Codex 规则与 codex-cost；未创建子代理。Context Mode 工具不可用，采用 RTK、临时日志和有界统计。

## 稳定输入与复用

HEAD 为 `fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`。所有上游 writer 已交接停止后登记原 49 TS 加 10 个新 helper，共 59 个 owned TS；另登记脚本、依赖及配置，共 70 项输入和 21 份依赖证据。开始与结束输入及证据全部无漂移；HEAD 不变。dirty 条目开始 537、结束 537（本文创建前），保留既有 WIP。

Schemas 最新 9 文件 SHA 均一致；103 个 src/test 的 .ts/.tsx/.json 文件按仓库相对路径排序，以 `path:sha256` 用换行连接、无末尾换行重新计算树摘要为 `6cd190049895d3cf0013bfb17c88472fea363a5005d004e8db605194a1eba736`，与最新证据完全一致。依赖锁文件及 ESLint 配置与最新登记也保持本轮稳定。复用 [时区合同证据](2026-09-28-s05-calendar-schema-timezone.md) 中 Schemas 43 文件、451/451 无 skip、typecheck/build；不重跑。

同证据真实公开原包联合 4 文件、82/82 无 skip 的 9 项代码输入未变。原包 `metadata.json` SHA 为 `38a86c1c1058cbaa84cb85ecafea74f9b19a7b87c10998a82f9df230bb52a87a`，93 份源码的 `sources.json` SHA 为 `e896e815c17a790f65af15353153d79ca22feee19653d874dc6008e8d74abc0a`，本轮只读复核一致；复用该结果，不重跑，不新增网络请求。默认全包公开输入相关 7 项 skip 不能替代该联合证据。

[DSA 指数回归证据](2026-09-28-m3-index-local-regression.md) 的六文件完整 SHA 全部相同，复用 87 项和完整六文件 flake8，不重跑。Schema、真实包、DSA 的复用结果与本轮 Server 统计分别记录，未相加。

## 本轮实际检查

所有命令实际经 `rtk proxy` 执行，按下表顺序完成；任一失败即停止更高层，本轮没有失败、重试或门禁绕行。完整 owned 清单为 `/private/tmp/s05-stable-owned.json`，以下 `<59 TS>` 精确对应本文输入表中的 49 原 TS 与 10 新 helper。

| 检查 | 实际命令 | 结果 |
| --- | --- | --- |
| Server 全包 | `env -u DIAG_DATABASE_URL -u DIAG_DATABASE_NAME -u S05_CALENDAR_PUBLIC_INPUT_DIRECTORY pnpm --filter @thesis-ledger/server exec vitest run --cache=false` | exit 0；226 文件通过、24 文件跳过；1736 项通过、88 项跳过，总 1824；61.16s |
| Server 类型 | `pnpm --filter @thesis-ledger/server typecheck` | exit 0；通过 |
| Server 构建 | `pnpm --filter @thesis-ledger/server build` | exit 0；通过 |
| 模块边界 | `node scripts/check-boundaries.mjs` | exit 0；Import boundaries: OK |
| 工作区依赖 | `node scripts/check-workspace-dependencies.mjs` | exit 0；8 packages，OK |
| 普通 ESLint | `pnpm exec eslint <59 TS> --max-warnings=0` | exit 0；0 errors、0 warnings |
| 严格 ESLint | `pnpm exec eslint <59 TS> --max-warnings=0 --rule no-nested-ternary:error --rule 'complexity:[error,20]' --rule 'max-lines-per-function:[error,{max:220,skipBlankLines:true,skipComments:true}]'` | exit 0；complexity error 20、max-lines-per-function error 220、no-nested-ternary error；0 errors、0 warnings |
| Prettier | `pnpm exec prettier <59 TS> --check` | exit 0；59 文件全部通过 |
| 真实尺寸 ratchet | `GUARDRAIL_BASE_REF=fe0e871e37a09964f7a113b82e7d09f6d4d95f7e node scripts/check-file-size-guardrails.mjs` | exit 0；13 legacy warnings；ratchet passed，真实 HEAD 基线 |
| 变更空白 | `git diff --check -- apps/server/src/backtest/backtest-reconstruction-preflight-v3.ts apps/server/src/backtest/backtest-snapshot-v3-artifact-writer.ts apps/server/src/backtest/backtest-snapshot-v3-builder.ts apps/server/src/backtest/backtest-snapshot-v3-calendar-alignment.ts apps/server/src/backtest/backtest-snapshot-v3-comparable-data.ts apps/server/src/backtest/backtest-snapshot-v3-completeness-checks.ts apps/server/src/backtest/backtest-snapshot-v3-completeness.ts apps/server/src/backtest/backtest-snapshot-v3-dependencies.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-artifact-checks.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-collector.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-error.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-instrument-identity.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-response-checks.ts apps/server/src/backtest/backtest-snapshot-v3-dependency-validation.ts apps/server/src/backtest/backtest-snapshot-v3-events.ts apps/server/src/backtest/backtest-snapshot-v3-execution-bars.ts apps/server/src/backtest/backtest-snapshot-v3-execution-evidence.ts apps/server/src/backtest/backtest-snapshot-v3-execution-identity.ts apps/server/src/backtest/backtest-snapshot-v3-execution-metadata.ts apps/server/src/backtest/backtest-snapshot-v3-execution-window.ts apps/server/src/backtest/backtest-snapshot-v3-input-plan.ts apps/server/src/backtest/backtest-snapshot-v3-multi-window.ts apps/server/src/backtest/backtest-snapshot-v3-pit-guard.ts apps/server/src/backtest/backtest-snapshot-v3-source-evidence.ts apps/server/src/backtest/backtest-snapshot-v3-source.ts apps/server/src/backtest/backtest-snapshot-v3-store.ts apps/server/src/backtest/backtest-snapshot-v3-validation.ts apps/server/src/market/market-pit-calendar-package-projection-v1.ts apps/server/src/market/market-pit-calendar-package-source-v1.ts apps/server/src/market/market-pit-calendar-package-v1.ts apps/server/src/market/market-pit-decision-window-calendar-v3.ts apps/server/src/market/market-pit-decision-window-source-v3.ts apps/server/src/market/market-pit-decision-window-v3.ts apps/server/src/market/market-pit-evidence-instant-v1.ts apps/server/src/market/market-pit-reconstruction-content-v3.ts apps/server/src/market/market-pit-reconstruction.repository.ts apps/server/src/market/market-pit-source-capture-v1.ts apps/server/test/backtest/backtest-reconstruction-preflight-v3.test.ts apps/server/test/backtest/v3-snapshot-builder.test.ts apps/server/test/backtest/v3-strict-snapshot-replay-guard.test.ts apps/server/test/market/market-pit-calendar-package-projection-v1.test.ts apps/server/test/market/market-pit-calendar-package-source-v1.test.ts apps/server/test/market/market-pit-calendar-package-v1.test.ts apps/server/test/market/market-pit-calendar-schema-interoperability.test.ts apps/server/test/market/market-pit-decision-window-v3.test.ts apps/server/test/market/market-pit-reconstruction-content-v2.test.ts apps/server/test/market/market-pit-reconstruction.repository.test.ts apps/server/test/market/market-pit-source-capture-v1.test.ts apps/server/test/market/market-window-jsonb-roundtrip-diagnostic.test.ts packages/schemas/src/index.ts packages/schemas/src/market-pit-calendar-structure-v1.ts packages/schemas/src/market-pit-historical-bar-bindings-v1.ts packages/schemas/src/market-pit-historical-evidence-v1.ts packages/schemas/src/market-pit-historical-references-v1.ts packages/schemas/src/market-pit-reconstruction-manifest-validation-v3.ts packages/schemas/src/market-pit-reconstruction-v3.ts packages/schemas/test/market-pit-calendar-timezone-v1.test.ts packages/schemas/test/market-pit-historical-evidence-v1.test.ts packages/schemas/test/market-pit-reconstruction-v3.test.ts` | exit 0；通过 |

全包 88 项 skip 包含 PostgreSQL/Worker 等环境门禁、公开日历输入 7 项及 JSONB 数据库分支 1 项；跳过不计通过。显式移除 `DIAG_DATABASE_URL`、`DIAG_DATABASE_NAME` 和 `S05_CALENDAR_PUBLIC_INPUT_DIRECTORY`。没有启动数据库、Provider、I01 新诊断或业务任务；已耗尽的原 1+2 retry 业务预算未重置。

原六个严格复杂度失败与格式缺口由上游职责拆分/格式叶处理，本轮 59 TS 严格与格式门禁完成刷新。13 条尺寸警告是实际基线下的存量技术债，无规模增长；不把警告解释为失败，也不把无基线历史检查当通过。没有调整阈值、ignore 或配置。

## 产物与适用层

Server 本次成功构建 `apps/server/dist`，递归 1935 文件；按排序相对路径、NUL、各文件 SHA-256、换行的联合摘要为 `195960da3b256f6c0caa31ef594c3158497b2c192c5c5ebb4a1f75eb2c48bbe0`。这是本地编译产物身份，不是镜像、容器或安装验收。

本轮未执行 Docker 更新/同步、真实数据库、Provider、Worker、浏览器、部署或故障注入。后续目标更新应由独立叶按相邻 infra 官方入口选择最小 `all`（本批含 DSA 与 ThesisLedger）；运行容器且仅源码及兼容预检满足时 `./scripts/sync-code.sh all`，依赖/结构/运行条件变化或预检拒绝时 `./scripts/update.sh all`。本轮两个入口均未调用。

所有本叶测试、类型、构建、lint、格式与静态检查进程均已退出，没有后台服务或占用中的构建/测试资源。上游证据原 19 个本地链接全部解析存在（包含 `:line` 文件链接）；本文相对链接与中文说明、末尾换行/尾空白单独检查。资源已交还父级集中 Review 与后续独立运行时验收。

## 起终变更与输入摘要

从前轮登记到本叶开始，下列文件由已交接上游叶改变；不归属为本叶改动。本叶开始到结束无输入/证据变化。

`apps/server/src/backtest/backtest-reconstruction-preflight-v3.ts`、`apps/server/src/backtest/backtest-snapshot-v3-builder.ts`、`apps/server/src/backtest/backtest-snapshot-v3-calendar-alignment.ts`、`apps/server/src/backtest/backtest-snapshot-v3-completeness.ts`、`apps/server/src/backtest/backtest-snapshot-v3-dependencies.ts`、`apps/server/src/backtest/backtest-snapshot-v3-dependency-collector.ts`、`apps/server/src/backtest/backtest-snapshot-v3-dependency-error.ts`、`apps/server/src/backtest/backtest-snapshot-v3-dependency-validation.ts`、`apps/server/src/backtest/backtest-snapshot-v3-events.ts`、`apps/server/src/backtest/backtest-snapshot-v3-execution-evidence.ts`、`apps/server/src/backtest/backtest-snapshot-v3-multi-window.ts`、`apps/server/src/backtest/backtest-snapshot-v3-source.ts`、`apps/server/src/market/market-pit-reconstruction.repository.ts`、`apps/server/test/backtest/backtest-reconstruction-preflight-v3.test.ts`、`apps/server/test/backtest/v3-snapshot-builder.test.ts`、`apps/server/test/market/market-pit-reconstruction.repository.test.ts`、`apps/server/test/market/market-window-jsonb-roundtrip-diagnostic.test.ts`。

新增 helper：`apps/server/src/backtest/backtest-snapshot-v3-artifact-writer.ts`、`apps/server/src/backtest/backtest-snapshot-v3-completeness-checks.ts`、`apps/server/src/backtest/backtest-snapshot-v3-dependency-artifact-checks.ts`、`apps/server/src/backtest/backtest-snapshot-v3-dependency-instrument-identity.ts`、`apps/server/src/backtest/backtest-snapshot-v3-dependency-response-checks.ts`、`apps/server/src/backtest/backtest-snapshot-v3-execution-bars.ts`、`apps/server/src/backtest/backtest-snapshot-v3-execution-identity.ts`、`apps/server/src/backtest/backtest-snapshot-v3-execution-metadata.ts`、`apps/server/src/backtest/backtest-snapshot-v3-execution-window.ts`、`apps/server/src/backtest/backtest-snapshot-v3-source-evidence.ts`。

| 输入文件 | 开始及结束 SHA-256 |
| --- | --- |
| `.prettierrc.json` | `d878174ad29271d3eefb56749e241ce0c53abb9d8bcec3dc92d501c9464680f3` |
| `/private/tmp/goal-s05-reconstruction-guards-target-20260928.py` | `79862d10316a89832248862be1833507f62835ab21af7a62e1bf568edc364cf2` |
| `apps/server/package.json` | `0fa472983266905b004f428648283565887cbd476856e7cdfc7a2e6a1ea4840e` |
| `apps/server/src/backtest/backtest-reconstruction-preflight-v3.ts` | `8374356a08e55afa7c81727533a588b36524aa7ad00daaa8c4efb4e49f090115` |
| `apps/server/src/backtest/backtest-snapshot-v3-artifact-writer.ts` | `30341d4fe91bfe723985632b9d55471db73e397242d0294330a4090d12e101a9` |
| `apps/server/src/backtest/backtest-snapshot-v3-builder.ts` | `5880fccabc621cc81e5b6d0476f67034dde05c3b1fd51a93a61603cd8b0296c5` |
| `apps/server/src/backtest/backtest-snapshot-v3-calendar-alignment.ts` | `e5548e60f4a875822be7142b0dad05b671c083af6eb50ae2da0c2e50888b1e56` |
| `apps/server/src/backtest/backtest-snapshot-v3-comparable-data.ts` | `6a141184de532babe4eb58884e73e30dcbc06aae90688e7eb3b106d191341213` |
| `apps/server/src/backtest/backtest-snapshot-v3-completeness-checks.ts` | `719f8c0069569a4593dea3aa8934eca08f436b7106637d8446d2449c0f3a080e` |
| `apps/server/src/backtest/backtest-snapshot-v3-completeness.ts` | `30f50c451dc9794f2453555a7fb0b8c002a6f2c4ec277cffcceb32e883683768` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependencies.ts` | `cd7f95170230a6d3bd35034e4e2be1cba1d3a83ffff52dda4e4ccf34ea3bd204` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-artifact-checks.ts` | `2f04c74992e83d25e5edd666bd403fd343932a2b262fc4548f604ae1f1b7ce16` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-collector.ts` | `81772abe7e7ae7c6abf6105780a2e1297e0e8b2bda1ade77566596d39563fb2c` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-error.ts` | `d6cedf2a3afaeb3f2bc0ece0d8d86e4f356c6d090017f3521857068c89b52b18` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-instrument-identity.ts` | `478cd2333b32909854cdcc5304c9b5e865c5a35cc4c50796c542c90586f118f7` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-response-checks.ts` | `a797adcc86a0f0389979de19d40d861d9fa2374147f02acd03b442117615b8d8` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-validation.ts` | `77f1536e3a3f0aeafd42ef9e298294e5f44752301fe3b7b3ea8b3d8b781d7416` |
| `apps/server/src/backtest/backtest-snapshot-v3-events.ts` | `39df7861eb5889a0003e75b512cabf96402ad8d02dda9266938c3c0771f9ef9a` |
| `apps/server/src/backtest/backtest-snapshot-v3-execution-bars.ts` | `930a4419b1baac543ef3ef9c196aba56cedcbff302777fe3ef1fe473d5632b4b` |
| `apps/server/src/backtest/backtest-snapshot-v3-execution-evidence.ts` | `2af794bd46b5f033f392f6e1bf52156cd0c2d92f90bb276b17b22fc79217d1ae` |
| `apps/server/src/backtest/backtest-snapshot-v3-execution-identity.ts` | `83cb969712aa20fafb3eaef777dac51b9e5ffa8e07eaa5a4b9cf706a53079c95` |
| `apps/server/src/backtest/backtest-snapshot-v3-execution-metadata.ts` | `2783c2937b369e0beb80db0935e165bed9b73e24239c9615c5f6e870873c97a6` |
| `apps/server/src/backtest/backtest-snapshot-v3-execution-window.ts` | `9291d2d5e67419063a955a86a09fa2323ffff2dc36c3e245db0ebd2979f836f3` |
| `apps/server/src/backtest/backtest-snapshot-v3-input-plan.ts` | `2823ecd2345589cf806a9e602a153579fcd532f2f6efc34577a206ef4de840c4` |
| `apps/server/src/backtest/backtest-snapshot-v3-multi-window.ts` | `602035e6cc100a488cb351b1f655b04cb60f6d40a75c4d156d059bd6980d6dc7` |
| `apps/server/src/backtest/backtest-snapshot-v3-pit-guard.ts` | `0c6237f00fe7a68ccd4146700a4c2e3a4684ba716d6ace4d5f069dd098b71f3e` |
| `apps/server/src/backtest/backtest-snapshot-v3-source-evidence.ts` | `87da26e547b007ed2a9f09d199b0d3e89065c0d11ad2a24884aa6bdfc6b32569` |
| `apps/server/src/backtest/backtest-snapshot-v3-source.ts` | `f88b44ffce4d01f16640a59e8695f61797a16bd5e07971a80c57dbe3a53bdd8b` |
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
| `apps/server/src/market/market-pit-reconstruction.repository.ts` | `afaed2831520bcbb3c144b6f171641c7a9c9e3d5f0989f2325dfe7a088a33187` |
| `apps/server/src/market/market-pit-source-capture-v1.ts` | `990ad6aa7b590049c1aa23cf72544b4653a257a97691d65e0562d178b00e6abb` |
| `apps/server/test/backtest/backtest-reconstruction-preflight-v3.test.ts` | `1b0f4996362c886f3b66484d210276e4955c5d0c4aaa54796c8a1ef30d1d8052` |
| `apps/server/test/backtest/v3-snapshot-builder.test.ts` | `8bf6c83c5929dff976d77928a7900c8b2d24f92863deea0d9ad2ca033610689e` |
| `apps/server/test/backtest/v3-strict-snapshot-replay-guard.test.ts` | `baab4b00eba7b3eed2f739156a59b1a624c0595e13baf60bbbceddc4e1c389df` |
| `apps/server/test/market/market-pit-calendar-package-projection-v1.test.ts` | `0e43110ef42282f07914074046d5362fd88fb85b27e8466a460f7cfe1c2f8118` |
| `apps/server/test/market/market-pit-calendar-package-source-v1.test.ts` | `5924569e0a32aa901678335aa92b4da0b1cb2439376edf80b810f03bf400bebc` |
| `apps/server/test/market/market-pit-calendar-package-v1.test.ts` | `d88815e37606ff60c815464b28190d3e50df5563e7cce0a2dae26c1e0ac87548` |
| `apps/server/test/market/market-pit-calendar-schema-interoperability.test.ts` | `d4311e5f17e691f43bf52c51dcd64bfaf0ece40c28daa9e75a6e616a26477449` |
| `apps/server/test/market/market-pit-decision-window-v3.test.ts` | `a6e57d79bbddc0b5d53fefcacbc7e0097b85769e4c1756708fe1c8af1c604a4c` |
| `apps/server/test/market/market-pit-reconstruction-content-v2.test.ts` | `4ded0b45e66cee1649aac37247698e9088892bd0c218e132fdd028c7a6d90aea` |
| `apps/server/test/market/market-pit-reconstruction.repository.test.ts` | `a76ec49e605f76be02599101fce34d1375c350cfa53365b7508cd0c2e082a8ed` |
| `apps/server/test/market/market-pit-source-capture-v1.test.ts` | `796cd574036a77cfddab88d3bec61dbc2b57b08371777956a3006ec5339cb2c7` |
| `apps/server/test/market/market-window-jsonb-roundtrip-diagnostic.test.ts` | `22493726cbf8164d9a14addbf56b7063b0e31e95fd586dc09889473733490766` |
| `apps/server/tsconfig.json` | `97eefcb6f4f12e2cc4fedb1b389e3f809eafe643bde2d9db1bb993355b05c3f7` |
| `apps/server/vitest.config.ts` | `8bf9f0a8fe5b733a79a6bb04aaea19f369af14be33b8fd76de1e10905d714426` |
| `eslint.config.mjs` | `00bbf5bedc2fca7cdb3b373a969e825425d8c8bfa89431f423736d778d7fc1d1` |
| `package.json` | `37f4f09e63817c82f3aaf84951f26bb064f5e64a2c4a352d0dd18ff001e44c90` |
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
| `pnpm-lock.yaml` | `e5114e412d1cea6517e0e45e58fdfb52b922c83f61918c47b6e5ed0095cdefe1` |
| `scripts/check-boundaries.mjs` | `8bcbd867179f934dbf1f89d20338e3de13c2bad0ba2103370f6addbd6439dc4c` |
| `scripts/check-file-size-guardrails.mjs` | `9fa9ae406b9ac741c86b6f50c652b9627a8baba071c4a02e7143e6b47bbe83cc` |
| `scripts/check-workspace-dependencies.mjs` | `bc25742859695b3c1f720aa24982f3f563f52b604f3ba19603534c414712ae22` |

## 依赖证据摘要

| 证据 | 开始及结束 SHA-256 |
| --- | --- |
| [2026-09-28-s05-build-source-complexity.md](2026-09-28-s05-build-source-complexity.md) | `8675496dd194311c4317ecd1dfc50d6bcafb4f5ab2e9590d4122146c40e96d97` |
| [2026-09-28-s05-calendar-package-parser.md](2026-09-28-s05-calendar-package-parser.md) | `531bad22afaddb700833ed744da8f8b460f76319aad0a205e7282e435c4fedb0` |
| [2026-09-28-s05-calendar-parser-discovery.md](2026-09-28-s05-calendar-parser-discovery.md) | `31be3ad60f87209bef3ed51b7969dddc3c5bb6e68a5ec2fca63fd8542e6e6bf9` |
| [2026-09-28-s05-calendar-schema-timezone.md](2026-09-28-s05-calendar-schema-timezone.md) | `57704ea54b71e6b3ee3de4cf66099243d2a99b1d3a6749c36ee6c8319c5b762f` |
| [2026-09-28-s05-daily-window-finish.md](2026-09-28-s05-daily-window-finish.md) | `a1a952f6392cb9e1a55263852966362652c00f91414bfc6567e804e895635d3a` |
| [2026-09-28-s05-daily-window-math.md](2026-09-28-s05-daily-window-math.md) | `feb3ab93246bc8e327afb8dd6677d12518867c6225a8dcca121c5e2e1cc40b78` |
| [2026-09-28-s05-dependency-complexity.md](2026-09-28-s05-dependency-complexity.md) | `8e6c15e64d6d9c3dc2b6a4ba03ada5d9f9f9420ea353326e4956b209e68a7283` |
| [2026-09-28-s05-evidence-complexity.md](2026-09-28-s05-evidence-complexity.md) | `6a40673097415e7da6516b9574b23a709907e241caeaee2160ed790612bfc1b6` |
| [2026-09-28-s05-execution-evidence-complexity.md](2026-09-28-s05-execution-evidence-complexity.md) | `e6265cf7811256cd9cf4cde2db3cc92fade73761199ac36ef92885df0843fa2b` |
| [2026-09-28-s05-manifest-v2-content.md](2026-09-28-s05-manifest-v2-content.md) | `5b16e77d7dafccb03c1be3c16e9e43e014d1a55d89e5f25a3d6b0487f4f4de67` |
| [2026-09-28-s05-old-strict-v3-guard.md](2026-09-28-s05-old-strict-v3-guard.md) | `76a77b5aae7da01eb14096d64ecfa0c9bc4442b7cbc9c88f4b822bfbe3c95c85` |
| [2026-09-28-s05-owned-format-canonical.md](2026-09-28-s05-owned-format-canonical.md) | `22b4692687e6967f99ed5755be5750d2ebcfdef678e919f82fb9b62d8aae41c2` |
| [2026-09-28-s05-parser-test-types.md](2026-09-28-s05-parser-test-types.md) | `29ce8f4c8cdbb224d9ac4c572465da1ddc727468f638dfbaf1169da82d9f622d` |
| [2026-09-28-s05-reconstruction-guards.md](2026-09-28-s05-reconstruction-guards.md) | `0366aa5078a3bdfc86745e40bc61b408d71e5c9d796ac2085d44b70ddc841082` |
| [2026-09-28-s05-schema-empty-source.md](2026-09-28-s05-schema-empty-source.md) | `497248db4c7341434c8ded262e8a4739f33066d19e4081d73e7cb6bd073c5a12` |
| [2026-09-28-s05-source-capture-parser.md](2026-09-28-s05-source-capture-parser.md) | `18a6d48e1a0c538296ca5b54b1b913ae111dc27f28776b82e444027f0c0bd7da` |
| [2026-09-28-s05-venue-parser-discovery.md](2026-09-28-s05-venue-parser-discovery.md) | `5b4990050b60917d9e24454dc779b67c692bbb04d13904799366474eae3b02c8` |
| [2026-09-28-s05-window-discovery.md](2026-09-28-s05-window-discovery.md) | `8d056c327b14a35b0eded364fdc6b7a39a800901dc8a1687f844c2a67396e382` |
| [2026-09-28-s05-window-local-gates.md](2026-09-28-s05-window-local-gates.md) | `56f59c2e552906ba06f58a3d070f303119a7ee69545483476b94935758196e54` |
| [2026-09-28-s05-window-local-integration.md](2026-09-28-s05-window-local-integration.md) | `9369477284d7e449c21ed253bea820acb5ee314f13ddf8f33d4693145605c763` |
| [2026-09-28-s05-window-schema.md](2026-09-28-s05-window-schema.md) | `30b8cb296c4c46095eeb2f387e609c27967f698d1a354dc238789888a354b60d` |

## DSA 六文件复用摘要

| 文件 | 前证据及本轮 SHA-256 |
| --- | --- |
| `../daily-stock-analysis/data_provider/sina_index_identity.py` | `c65f98eb974c98d7b3c364ff8193aa3e9cd8e0f45fca33cfdc5b3c21ad6204ed` |
| `../daily-stock-analysis/data_provider/akshare_fetcher.py` | `abb60ee7c54661f53e81babf6186bf183aa5aae4d455e3e8d5c820cc09da566c` |
| `../daily-stock-analysis/data_provider/tushare_index_daily_rows.py` | `25f13b0abaa406b53c7ba8ff47e18022dbf300a5240ebecf7ea2d1fcd0f3dacc` |
| `../daily-stock-analysis/data_provider/tushare_fetcher.py` | `fe0d7c99e91433571d1bbd496c734511854e8e399db3d89497f8a107a746919f` |
| `../daily-stock-analysis/tests/test_sina_index_identity.py` | `bb3d82cf6e6549ee44173336af1d15eacca4c1cea22d7380d0e74cb2051461f9` |
| `../daily-stock-analysis/tests/test_tushare_index_daily_rows.py` | `8ee91f6d36ada53b9b4411e9b174e8e478ce7893ce1bf3ccc2512bebc822e21b` |

临时证据为 `/private/tmp/s05-stable-{start,end,results,reuse,schema-tree,owned,doc-links}.json`；原始日志仅保留在 `/private/tmp/s05-stable-test.log` 与 `/private/tmp/s05-stable-check-0..8.log`，不将大成功日志或业务 JSON 嵌入本文。输入、依赖合同、runner/编译/lint/格式配置变化会使相应结果失效。
