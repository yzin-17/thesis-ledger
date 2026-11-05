# S05 精度修复后的回归与仓库门禁证据

## 状态与范围

`S05-precision-regression-gates-0928 / worker_done`，等待父级最终验收。仅新增本文及本叶临时日志，未修改源码、测试、Schema、配置或共同 Task，未 reset、stage、commit、clean 或格式化写入。已读取项目 AGENTS、RTK、Codex reference 与 codex-cost；未创建子代理。Context 工具不可用，使用 `rtk proxy`、临时日志及有界统计。

本次只证明局部必要绑定与包级／静态门禁。旧 strict PIT V3 仍须失败关闭为 DATA_UNAVAILABLE，最终 historical-window-bound 资格管线未实现；不代表 AC20、M2/M3、真实 backtest、数据库、Provider、AI、业务任务、Docker、浏览器或部署验收通过。

## 稳定输入与复用

开始及结束 HEAD 同为 `fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`。在上游源码 writer 已停止的前提下登记 63 个 owned TS（原 stable 59 加 4 个新增路径），包含未跟踪文件；完整清单见下表。872 项检查输入开始及结束逐文件 SHA 相等，零漂移。范围为 Server src/test/prisma、Schemas src/test/fixtures、domain/shared src、owned TS 与实际存在的 package/锁文件/workspace/Server 构建与 Vitest 配置、仓库门禁脚本。

872 文件聚合 SHA-256：`1298788b0f45805ac17ece59c2a4713404bd444bbb6ec9f678c92be32cea99ff`。算法：仓库相对路径按路径排序，逐文件更新 UTF-8 路径 + NUL + 原始字节 + NUL。逐文件开始／结束摘要分别保留于 `/private/tmp/s05-precision-start.json` 与 `/private/tmp/s05-precision-end.json`。

ESLint 与 Prettier 的实际配置另以当前 SHA 和上一 stable 检查点核对一致；tsconfig.base.json 在检查结束额外登记，未声称它具有本叶开始摘要。配置摘要如下：

| 配置 | SHA-256 |
| --- | --- |
| `.prettierrc.json` | `d878174ad29271d3eefb56749e241ce0c53abb9d8bcec3dc92d501c9464680f3` |
| `eslint.config.mjs` | `00bbf5bedc2fca7cdb3b373a969e825425d8c8bfa89431f423736d778d7fc1d1` |
| `tsconfig.base.json` | `469891a592e66c93e6070f4b1ae89fd28eb258d1a697b2b2d48cb234710cd5d1` |

Schemas src/test/fixtures 全文件与 package.json/tsconfig.json，共 131 项，按同一仓库相对路径/NUL/原字节/NUL 算法，SHA 为 `6607626460bf20ddee8b93eca846eee682a25f041840c1626a4e3cf75dae98e0`，与 [v2 精度证据](2026-09-28-s05-v2-precision.md) 完全一致；复用其 109 定向、476 全包、typecheck/build，不重复、不与 Server 数量相加。复用 [来源精度证据](2026-09-28-s05-source-times-precision.md) 的 23 定向和 [窗口消费者证据](2026-09-28-s05-window-cutoff-consumer.md) 的 42 单文件／111 关联结果；本轮全包覆盖这些最终测试。前一次关联 110 通过/1 失败已由窗口消费者的最小两行调整及 111 通过替代，未隐藏原失败。

真实公开输入目录 `/private/tmp/s05-calendar-package-0928` 存在，metadata.json SHA 为 `38a86c1c1058cbaa84cb85ecafea74f9b19a7b87c10998a82f9df230bb52a87a`，sources.json SHA 为 `e896e815c17a790f65af15353153d79ca22feee19653d874dc6008e8d74abc0a`。逐项解码核验 93 个 rawBase64 源码输入与各自 sha256 完全一致（含两个合法空文件）。与来源精度证据记录一致，复用该最新 4 文件 82/82 真实原文解析结果；未新增网络请求。默认全包的公开输入 7 skip 不能取代该结果。

[DSA 指数离线回归](2026-09-28-m3-index-local-regression.md) 的六项最终 SHA 均以绝对 sibling 路径实际核对一致，复用 87 离线测试与该文准确记录的分层 flake8，不声称 DSA 全包或所有存量文件完整 flake8。与 Server/Schemas 分别计数。DSA index review 作为依赖说明参见 [指数 review](2026-09-28-m3-index-review.md)。

## 实际执行的检查

Server package 名为 `@thesis-ledger/server`，实际 test 脚本为 `vitest run`，typecheck 为 `tsc -p tsconfig.json --noEmit`，build 为 `nest build`。全部命令经 `rtk proxy` 顺序执行，必需检查失败会停止升级。本轮业务测试及门禁全部 exit 0，无源码修复或重试。

| 检查 | 精确命令或输入 | 结果 |
| --- | --- | --- |
| Server 全包 | `env -u DIAG_DATABASE_URL -u DIAG_DATABASE_NAME -u S05_CALENDAR_PUBLIC_INPUT_DIRECTORY pnpm --filter @thesis-ledger/server exec vitest run --cache=false` | 226 文件通过、24 文件跳过；1747 项通过、88 项跳过，总 1835；65.19s |
| 类型 | `pnpm --filter @thesis-ledger/server typecheck` | exit 0 |
| 构建 | `pnpm --filter @thesis-ledger/server build` | exit 0 |
| 边界 | `node scripts/check-boundaries.mjs` | exit 0，OK |
| 依赖 | `node scripts/check-workspace-dependencies.mjs` | exit 0，8 packages，OK |
| 尺寸 ratchet | `GUARDRAIL_BASE_REF=fe0e871e37a09964f7a113b82e7d09f6d4d95f7e node scripts/check-file-size-guardrails.mjs` | exit 0；13 legacy warnings；ratchet passed |
| 普通 ESLint | `pnpm exec eslint <63 TS> --max-warnings=0` | exit 0，零 warning |
| 严格 ESLint | 上一命令加 `--rule no-nested-ternary:error --rule 'complexity:[error,20]' --rule 'max-lines-per-function:[error,{max:220,skipBlankLines:true,skipComments:true}]'` | exit 0，零 warning |
| 格式 | `pnpm exec prettier <63 TS> --check` | exit 0，全部通过 |
| 空白 | `git diff --check -- <63 TS>` | exit 0；未跟踪文件另由 Prettier 核验 |
| 文档链接 | 34 份 S05／DSA evidence 与主 Spec/Task 的本地 Markdown 文件链接；支持绝对路径末尾行号 | 168 个链接全部存在；记录于 `/private/tmp/s05-precision-doc-links.json` |

88 skip 分为：数据库/运行时/备份集成条件 80 项、JSONB 真实数据库诊断 1 项、默认未配置公开原文 7 项。没有将 skip 记为通过，没有执行 live SQL 或开启数据库环境变量。

首次 DSA 摘要复核封装使用相对 Path('.') 的 parent，错误地定位 sibling，报 FileNotFoundError；这是只读验证封装路径错误，不是代码测试失败。随后改为明确绝对 sibling 路径，六项核验通过。该路径核验不影响已启动的 Server 包级测试；未因低层业务失败升级检查。首次链接检查把合法绝对文件链接末尾的 `:行号` 当成文件名，报告 11 项缺失；修正只读检查器去除行号后，34 文档的 168 个链接全部存在。未修改被检查文档。

## 构建产物与失效条件

Server dist 当前 1935 个文件，聚合 SHA-256 `b081f50f2de59676e674dfb0c4b5710954152240d9733c277af7d6bf15ede570`。算法同上，以 `apps/server/dist/...` 仓库相对路径排序，逐文件路径 + NUL + 原始字节 + NUL；逐文件表位于 `/private/tmp/s05-precision-dist.json`。本结果是本地构建证据，不是容器或部署证据。

源码、测试、Schemas 公共合同、依赖锁、package、tsconfig、runner/setup、lint/格式配置、门禁脚本或公开原文变化会使对应结果失效，需按受影响范围重新验证。当前 Task/文档更新不改变这些源码检查输入。所有执行进程已退出，无后台检查；本叶停止写入并交还 Server 输出和门禁资源。

## 完整 owned TS 清单

所有文件当前 SHA 如下，开始／结束一致；`<63 TS>` 精确对应本表，不以 tracked-only 清单遗漏新文件。

| 路径 | SHA-256 |
| --- | --- |
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
| `apps/server/src/market/market-pit-evidence-instant-v1.ts` | `b569495a1dc95419b25d3b7744e1e8fda68fa18b281a46393b36b11fd79061bd` |
| `apps/server/src/market/market-pit-reconstruction-content-v3.ts` | `e831152a1338ce7633a6c8163670b144e663585f9e5e5e0c295c7eab6bb7f768` |
| `apps/server/src/market/market-pit-reconstruction-source-times-v3.ts` | `6d7d899f8f6c8ad92c7e066ef0f20c107340ed3e930f25480f12c4dfc495a61a` |
| `apps/server/src/market/market-pit-reconstruction.repository.ts` | `afaed2831520bcbb3c144b6f171641c7a9c9e3d5f0989f2325dfe7a088a33187` |
| `apps/server/src/market/market-pit-source-capture-v1.ts` | `990ad6aa7b590049c1aa23cf72544b4653a257a97691d65e0562d178b00e6abb` |
| `apps/server/test/backtest/backtest-reconstruction-preflight-v3.test.ts` | `1b0f4996362c886f3b66484d210276e4955c5d0c4aaa54796c8a1ef30d1d8052` |
| `apps/server/test/backtest/v3-snapshot-builder.test.ts` | `8bf6c83c5929dff976d77928a7900c8b2d24f92863deea0d9ad2ca033610689e` |
| `apps/server/test/backtest/v3-strict-snapshot-replay-guard.test.ts` | `baab4b00eba7b3eed2f739156a59b1a624c0595e13baf60bbbceddc4e1c389df` |
| `apps/server/test/market/market-pit-calendar-package-projection-v1.test.ts` | `0e43110ef42282f07914074046d5362fd88fb85b27e8466a460f7cfe1c2f8118` |
| `apps/server/test/market/market-pit-calendar-package-source-v1.test.ts` | `5924569e0a32aa901678335aa92b4da0b1cb2439376edf80b810f03bf400bebc` |
| `apps/server/test/market/market-pit-calendar-package-v1.test.ts` | `d88815e37606ff60c815464b28190d3e50df5563e7cce0a2dae26c1e0ac87548` |
| `apps/server/test/market/market-pit-calendar-schema-interoperability.test.ts` | `d4311e5f17e691f43bf52c51dcd64bfaf0ece40c28daa9e75a6e616a26477449` |
| `apps/server/test/market/market-pit-decision-window-v3.test.ts` | `4124ad4467b7c168beb5ed3f9e3c6ac1bda94ddac0aab05a9abe5607fee57651` |
| `apps/server/test/market/market-pit-reconstruction-content-v2.test.ts` | `4ded0b45e66cee1649aac37247698e9088892bd0c218e132fdd028c7a6d90aea` |
| `apps/server/test/market/market-pit-reconstruction-source-times-v3.test.ts` | `ff3e8c8b9dff6b38fb395ef27eadf3dc3a1fc49ca1515246bc4e6cc2cd2324cd` |
| `apps/server/test/market/market-pit-reconstruction.repository.test.ts` | `a76ec49e605f76be02599101fce34d1375c350cfa53365b7508cd0c2e082a8ed` |
| `apps/server/test/market/market-pit-source-capture-v1.test.ts` | `796cd574036a77cfddab88d3bec61dbc2b57b08371777956a3006ec5339cb2c7` |
| `apps/server/test/market/market-window-jsonb-roundtrip-diagnostic.test.ts` | `22493726cbf8164d9a14addbf56b7063b0e31e95fd586dc09889473733490766` |
| `packages/schemas/src/index.ts` | `744954bc76ed07c26f4abd368ea4f71468dcd900af1690ba4e5a56fcf31471ff` |
| `packages/schemas/src/market-pit-calendar-structure-v1.ts` | `2adf502d790ab07235c96082838b0b543421f2e8fae4f133ca7a190472bacaf0` |
| `packages/schemas/src/market-pit-evidence-instant-v1.ts` | `7faf533fb71291ebbed1945e4d51d9e73a2cc5103b78e404b6eb9efeb360b552` |
| `packages/schemas/src/market-pit-historical-bar-bindings-v1.ts` | `1e59d1e6ad1f82ed942967e75e5e05f5a068205cf563b2fc42d056c2db9b45d8` |
| `packages/schemas/src/market-pit-historical-evidence-v1.ts` | `ad61c28930ae4b5275a2e3e2d21f7870f9f0986afc23a589f6320a560c3d87a8` |
| `packages/schemas/src/market-pit-historical-references-v1.ts` | `0e794814d8bc4f44bfac081266cb308fde083d0e03cb6b3645b33b1822fe39d5` |
| `packages/schemas/src/market-pit-reconstruction-manifest-validation-v3.ts` | `d6f380dc35ac13664d6c05f28f063b430f6d1def2fd4a84076c5493c8cb69321` |
| `packages/schemas/src/market-pit-reconstruction-v3.ts` | `cb16e874fa5f207a1b046c20f213037fcdc001b187da3290f6dae4e4a4d1f01f` |
| `packages/schemas/test/market-pit-calendar-timezone-v1.test.ts` | `f785c6f5f12967aba15ee3640da8c36733c6ef4b1ea0ea13f16ddc18234a9ea5` |
| `packages/schemas/test/market-pit-evidence-precision-v2.test.ts` | `758efc6c03a63dd902457eb4796d483d75a1d72c21595f8d9410edbc3adbf673` |
| `packages/schemas/test/market-pit-historical-evidence-v1.test.ts` | `0e663e71666ec27cb29652fc6c0fa08967ed63c39df77bb0e6a512acb8855832` |
| `packages/schemas/test/market-pit-reconstruction-v3.test.ts` | `e60112a2fa836ac57c1b4345ad4cd917b514638432a884c70224affb5d61de61` |

完整命令、退出码与耗时位于 `/private/tmp/s05-precision-results.json`；日志位于 `/private/tmp/s05-precision-test.log` 和 `/private/tmp/s05-precision-{typecheck,build,boundaries,dependencies,size,eslint,strict-eslint,prettier,diff}.log`。本文只保留最终统计及必要失败事实。
