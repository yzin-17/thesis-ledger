# S05 稳定输入本地集成验证证据

## 状态与范围

`S05-window-local-integration-0928 / blocked / needs_split`。Schemas 与 Server 包级测试通过，Schemas typecheck 通过；Server typecheck 在本批拥有的日历解析器测试中发现两项类型错误，因此停止 Server build 及更高层静态门禁。本叶不修复源码，交由协调者启动新的有界测试类型修复叶。

权威依据：主 Spec §6、AC12/AC15，主 Task §12.8。工作区为 `main / fe0e871e37a09964f7a113b82e7d09f6d4d95f7e` 的既有脏工作区。仅写入本文及 `/private/tmp/s05-window-local-integration-0928-*` 日志/输入快照；没有 stage、commit、reset、clean，没有源码、配置、fixture、锁文件或主台账改动。RTK 和 Codex 规则已读；Context Mode 工具发现不可用，日志只输出失败与最终统计。所有测试进程已结束，Schemas/Server 测试、类型与构建资源已释放；本 dispatch 关闭后不复用。

## 测试前置与实际命令

Schemas `test` 为 `vitest run`，Server 同样为 `vitest run`；Server `vitest.config.ts` 仅使用 `test/setup.ts`，setup 仅初始化测试用凭据加密键。检查了测试的显式真实环境开关：PostgreSQL、Worker、Redis、数据库备份容器、DSA 日历 HTTP、公开日历输入目录对应启用变量均未设置，标准测试中的服务请求由 mock 或临时本地 HTTP fixture 承接。没有启用真实 Provider、数据库或网络探针。未启用 coverage，全部包级测试显式禁用缓存。

| 检查 | 实际命令 | 输入范围 | 结果 |
| --- | --- | --- | --- |
| Schemas 全包 | `rtk proxy pnpm --filter @thesis-ledger/schemas exec vitest run --cache=false` | 当前整个 Schemas 包测试，含本批结构与空源码回归 | 42 文件、433 项通过；0 skip；3.66 秒 |
| Server 全包 | `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run --cache=false` | 当前整个 Server 包测试，含 parser、Store 门禁及旧版本回归 | 222 文件通过、23 文件跳过；1624 项通过、81 项跳过；39.76 秒 |
| Schemas 类型 | `rtk proxy pnpm --filter @thesis-ledger/schemas typecheck` | Schemas 当前 `tsconfig.json` 全输入 | 通过 |
| Server 类型 | `rtk proxy pnpm --filter @thesis-ledger/server typecheck` | Server 当前 `tsconfig.json` 全输入，包含 test | 退出码 2；两项 owned test TS2322 |

Schemas 与 Server 类型检查在独立包上并行，均使用 `--noEmit`，无共享输出。Schemas dist 已由协调者在空源码修复后刷新，本叶未重复 Schemas build。以上包级统计包含既有 WIP，不代表仅本批新增测试数量，定向检查计数不另行相加。

Server 跳过的 80 项属于显式真实 PostgreSQL、Worker、容器备份/升级及 DSA 日历端点验收；另 1 项是 `market-pit-calendar-package-v1.test.ts` 的真实公开原 JSON 与 93 份源码探针，因 `S05_CALENDAR_PUBLIC_INPUT_DIRECTORY` 未设置而跳过。跳过不计为通过，不替代 parser 叶已独立取得的公开输入证据。

原始日志：`/private/tmp/s05-window-local-integration-0928-schemas-test.log`、`/private/tmp/s05-window-local-integration-0928-server-test.log`、`/private/tmp/s05-window-local-integration-0928-schemas-typecheck.log`、`/private/tmp/s05-window-local-integration-0928-server-typecheck.log`。

## 精确阻塞与最小修复提案

- `apps/server/test/market/market-pit-calendar-package-v1.test.ts:139:36`：`TS2322`，`'0'.repeat(64)` 的 `string` 不能赋给固定 SHA-256 字面量类型。
- 同文件 `:142:12`：`TS2322`，负例毫秒时间 `2026-03-10T03:24:37.055Z` 不能赋给固定六位微秒时间字面量类型。

`metadata()` 的返回类型由 `registration` 和源码登记常量直接推断，其 `digests.sha256` 与 `upload_time_iso_8601` 被保留为固定字面量；负例刻意修改这些字段时触发编译错误。Vitest 转译运行不执行完整类型检查，所以全包测试通过不消除此失败。错误落在本批拥有测试，不是无关 WIP，也不是旧严格 V3 成功预期与新安全合同的冲突。

建议新叶仅拥有上述测试文件及新修复证据：为 `metadata()` 设语义明确、允许负例修改字段的 fixture 返回类型，或在该 helper 中显式拓宽这两个字符串字段。保留 SHA-256 篡改与微秒边界负例、固定生产登记和原有拒绝断言。不得通过删除断言、cast 整个输入为 `any`、放松生产 Schema 或修改配置绕过。修复后先定向测试和 Server typecheck，再由新的稳定集成 dispatch 执行尚未完成检查；本叶未重试，无测试 runner/环境失败，不能无变化重跑。

## 已完成的低成本只读核对

15 个本批源码/测试文件在测试前后 SHA-256 无漂移，历史结构源码仍为 `1c941c3d...`；最终身份见下表。Store 274 行，符合 293→274 的本批收敛；三个 parser 模块 214/109/134 行；新 validation 47 行、pit guard 13 行；历史结构 338 行、重建 250 行、共享 index 53 行。

本批 15 个源码/测试、主 Spec/Task、五份实施证据及 DSA 能力目录直接检查无行尾空白并以换行结束。文档共 80 个相对文件链接均存在。DSA 当前能力目录保留 116 个固定 ID，116 个唯一，`R07.8/{sourceId}` 模板存在；未重新进行 117 条能力准入审计。没有重跑 F02 的 Provider 或部署证据。

## 未执行与验收限制

因 Server typecheck 失败，Server build、受影响 ESLint/complexity、边界、workspace dependency、file-size、contract 门禁均未执行，不记通过。既有 13 项无基线文件尺寸警告没有本次新结果，也不能记为通过；本叶仅确认 owned 文件当前行数及 Store ratchet。Schemas build 沿用协调者已完成输入刷新，未重跑。

未执行 Desktop 全包测试、浏览器、DSA build、Docker、业务数据库、真实 Provider/AI、部署同步、故障注入或清理。结构 v2、XSHG 包投影与旧严格 V3 拒绝门禁不授予 `historical-window-bound`、场所绑定、XSHE、完整依赖 ready、合格严格 PIT 冻结或离线成功。真实来源、证据核验、窗口、repository、冻结和最终离线验证仍按主 Task 保留开放，父级拥有最终 review、验收与台账。

## 最终输入身份

| 文件 | SHA-256 |
| --- | --- |
| `packages/schemas/src/market-pit-historical-evidence-v1.ts` | `1c941c3d872d52f12775ce32b039d64e6c1ed6ac302f47674aa389367ba38eb2` |
| `packages/schemas/src/market-pit-reconstruction-v3.ts` | `4bec6991ce80445d676332aa399bee43e4ab8bed5eb3813c0d0e385a6770ede8` |
| `packages/schemas/src/index.ts` | `d64c164fb5afadecfba89cb17945a871f6256aeadcd0af5e2dcd3469efc5da01` |
| `packages/schemas/test/market-pit-historical-evidence-v1.test.ts` | `0e663e71666ec27cb29652fc6c0fa08967ed63c39df77bb0e6a512acb8855832` |
| `packages/schemas/test/market-pit-reconstruction-v3.test.ts` | `e60112a2fa836ac57c1b4345ad4cd917b514638432a884c70224affb5d61de61` |
| `apps/server/src/market/market-pit-calendar-package-v1.ts` | `0330d5a5325f77924f2c8ac3f79e3d1f1bbe1b9bab746756b1d3b72fd7c479dd` |
| `apps/server/test/market/market-pit-calendar-package-v1.test.ts` | `3af01a9473d910fed9941d7ec9c3724663bdd202ca7da0b3ece2f9833dcb94a7` |
| `apps/server/src/market/market-pit-calendar-package-source-v1.ts` | `efed42b9895ecf4e1fc89e9c0415f1771c013365f7bdc59b4000781fe4b35d2a` |
| `apps/server/test/market/market-pit-calendar-package-source-v1.test.ts` | `5924569e0a32aa901678335aa92b4da0b1cb2439376edf80b810f03bf400bebc` |
| `apps/server/src/market/market-pit-calendar-package-projection-v1.ts` | `7337c2f2cb5053bf020218a4347fd86535f7b23a7fe4ed25df7761c7b2534965` |
| `apps/server/test/market/market-pit-calendar-package-projection-v1.test.ts` | `0e43110ef42282f07914074046d5362fd88fb85b27e8466a460f7cfe1c2f8118` |
| `apps/server/src/backtest/backtest-snapshot-v3-store.ts` | `c4638dd8369c17bc9144465f732b52737edc649fb3d87a076501019326f17eed` |
| `apps/server/src/backtest/backtest-snapshot-v3-validation.ts` | `1648301ecdae856dfadcb1b4bf43c3331a2d7d6b3570fd02b5de3d4e2afdf17c` |
| `apps/server/src/backtest/backtest-snapshot-v3-pit-guard.ts` | `0c6237f00fe7a68ccd4146700a4c2e3a4684ba716d6ace4d5f069dd098b71f3e` |
| `apps/server/test/backtest/v3-strict-snapshot-replay-guard.test.ts` | `baab4b00eba7b3eed2f739156a59b1a624c0595e13baf60bbbceddc4e1c389df` |
