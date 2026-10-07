# S05 日历 Schema 时区合同修复证据

## 状态与范围

`S05-calendar-schema-timezone-0928 / worker_done`。协调者提供基线为 `main / fe0e871e`；本轮保留大量已有 WIP，仅修改一个获授权源码、新增两个测试及本文，未 stage、commit 或清理工作区。没有后台进程或待等待的验证任务。

本叶落实 Spec §6 的必要结构语义，不能单独签发 `historical-window-bound`、严格 PIT、场所或历史时区规则资格。未修改 parser、Schema 外部形状、导出、限量、引用关系、历史截点、最终准入、manifest、配置或其他任务草稿。

Context Mode 工具在本环境不可用，使用 RTK、有界输出及外部日志；遵循 `spec-driven-workflow` 的实施证据规则。领域专用日期关系使用原生 `Intl.DateTimeFormat`，没有新增通用工具函数或依赖。

## 修复语义

原结构层将 ISO 文本的日期/小时直接当作当地日期/分钟：`01:30Z` 与当地 `startMinute=570` 被错误拒绝。现在每个日历建立一次使用其声明 IANA 时区的 formatter，将绝对瞬时投影到当地年/月/日/时/分/秒，核对原声明，不改写时间文本。

整分钟约束在读取 `Date` 前检查 ISO 秒和任意长度的小数位：非零秒、`0.000001` 秒及更长非零小数均拒绝，不能通过毫秒截断放行。当地投影秒也必须为零。原有时段有序、不重叠、正长度和同日约束保持；`endMinute=1440` 的明确次日零点仍不满足当前同日模型，不开放跨午夜。

UTC `Z`、`+08:00` 和其他表达同一瞬时的偏移形式具有相同结构结果；错误当地日期、分钟、UTC 改动和偏移拒绝。无效 IANA 时区由既有 refined 字段拒绝。formatter 的宿主时区查询仅属必要条件，不替代固定 parser 的 `Asia/Shanghai-2026-fixed-UTC+08-v1` 复算真实性。

文件从 69 行增长到 97 行。协调者已澄清该文件未超尺寸阈值，允许合理增加时区职责，不以压缩排版维持旧行数；没有提高阈值或新增 ignore。所有 owned 函数通过 `complexity<=20`，ESLint 零 warnings。原两个 Schema 测试中的合法 `+08:00` fixture 本来正确，均未修改，也没有放宽拒绝断言。

## 实际验证

依次执行下表，所有检查均同步结束、exit 0。高层 Server 验证在 Schemas 定向、全包、类型及 build 通过后执行。

| 检查 | 命令 | 最后结果 |
| --- | --- | --- |
| Schema 定向 | `pnpm --filter @thesis-ledger/schemas exec vitest run --cache=false test/market-pit-calendar-timezone-v1.test.ts test/market-pit-historical-evidence-v1.test.ts test/market-pit-reconstruction-v3.test.ts` | 3 文件、84/84；新增 18、既有 27+39，无 skip |
| 严格 lint | `pnpm exec eslint packages/schemas/src/market-pit-calendar-structure-v1.ts packages/schemas/test/market-pit-calendar-timezone-v1.test.ts apps/server/test/market/market-pit-calendar-schema-interoperability.test.ts --max-warnings=0 --rule 'complexity: [error, 20]'` | 通过，无 warnings |
| 格式 | `pnpm exec prettier --check` 加上述三个 TS 文件路径 | 通过 |
| Schemas 全包 | `pnpm --filter @thesis-ledger/schemas exec vitest run --cache=false` | 43 文件、451/451；原 433+新增 18，无 skip |
| Schemas 类型 | `pnpm --filter @thesis-ledger/schemas typecheck` | 通过 |
| Schemas 构建 | `pnpm --filter @thesis-ledger/schemas build` | 通过；仅刷新既有忽略的 dist，不修改 manifest/index |
| Server 联合真实输入 | `S05_CALENDAR_PUBLIC_INPUT_DIRECTORY=/private/tmp/s05-calendar-package-0928 pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/market/market-pit-calendar-schema-interoperability.test.ts test/market/market-pit-calendar-package-v1.test.ts test/market/market-pit-calendar-package-source-v1.test.ts test/market/market-pit-calendar-package-projection-v1.test.ts` | 4 文件、82/82，无 skip；既有入口 25、源码 27、投影 24，新联合 6 |
| Server 类型 | `pnpm --filter @thesis-ledger/server typecheck` | 通过，包含当前窗口草稿；不证明该草稿 lint 或算法测试通过 |

公开输入确实可读取且已实际执行：metadata 原字节 SHA-256 为 `38a86c1c1058cbaa84cb85ecafea74f9b19a7b87c10998a82f9df230bb52a87a`；外部输入 `sources.json` 文件 SHA-256 为 `e896e815c17a790f65af15353153d79ca22feee19653d874dc6008e8d74abc0a`，含 93 份源码，其中含两个合法零字节文件。测试使用固定 parser 重新核对完整原文、源码树、UTC+08 投影及内容摘要，没有新网络请求、依赖安装或输出原字节。

新联合测试将真实固定 parser 的 `calendar-package-verified` UTC 日历完整留在 v2 `historicalDecisionWindow` 内，经过 refined manifest 及 binder 再绑定，结果仅为 `bound`。同瞬时 `+08` 改写在必要结构层可绑定，但重新自报投影/内容摘要后仍被固定 parser 拒绝，证明结构等价没有放宽认证。错误原始 UTC 小时、UTC 分钟、当地日期和偏移都同时拒绝结构绑定及原包复算。

联合测试的来源见证、归档捕获和证券场所引用仅是明确的必要结构向量，未认证这些原文或取得场所资格；测试中的 XSHG 产物不证明 `159516.SZ` 属于 XSHG，不替代 XSHE 历史日历或场所原文。未执行全 Server 测试/build、全仓门禁、数据库、Provider、Docker、浏览器、运行态或最终历史原文准入。

日志保留在 `/private/tmp/s05-schema-timezone-{focused,lint,package,type,build,format,server-focused,server-type}.log`；完整验证输入摘要列表为 `/private/tmp/s05-schema-timezone-input-hashes.json`。没有测试缓存、coverage 或报告产物。

## 输入身份与既有证据有效性

原源码 SHA-256 为 `52485af5389883db5cebc934023f6fd8205c466a04cbcd3076029b2abc97f49a`。原 Schemas 433 项及旧 Schemas 类型/build 结果是旧输入历史记录，不能作为本次改动的通过证明；现以 451 项及本轮类型/build 刷新。此前只验证真实包记录集合的 Server 76 项没有证明完整 v2 互操作，本轮 82 项补齐这条必要接缝。旧 Server 类型结果受 Schema 依赖及已有窗口草稿影响，本轮重新执行类型检查；此前窗口任务的算法失败、lint 失败、临时绕行结果仍按原检查点保留，不能据本叶推导其完成。

| 本轮最终文件 | SHA-256 |
| --- | --- |
| `packages/schemas/src/market-pit-calendar-structure-v1.ts` | `413c3feb7b1d5434671956b7e9834442de9915c479025cd27554fee41b783c5b` |
| `packages/schemas/test/market-pit-calendar-timezone-v1.test.ts` | `f785c6f5f12967aba15ee3640da8c36733c6ef4b1ea0ea13f16ddc18234a9ea5` |
| `apps/server/test/market/market-pit-calendar-schema-interoperability.test.ts` | `d4311e5f17e691f43bf52c51dcd64bfaf0ece40c28daa9e75a6e616a26477449` |
| `apps/server/src/market/market-pit-calendar-package-v1.ts` | `0330d5a5325f77924f2c8ac3f79e3d1f1bbe1b9bab746756b1d3b72fd7c479dd` |
| `apps/server/src/market/market-pit-calendar-package-source-v1.ts` | `efed42b9895ecf4e1fc89e9c0415f1771c013365f7bdc59b4000781fe4b35d2a` |
| `apps/server/src/market/market-pit-calendar-package-projection-v1.ts` | `7337c2f2cb5053bf020218a4347fd86535f7b23a7fe4ed25df7761c7b2534965` |
| `apps/server/test/market/market-pit-calendar-package-v1.test.ts` | `d88815e37606ff60c815464b28190d3e50df5563e7cce0a2dae26c1e0ac87548` |
| `apps/server/test/market/market-pit-calendar-package-source-v1.test.ts` | `5924569e0a32aa901678335aa92b4da0b1cb2439376edf80b810f03bf400bebc` |
| `apps/server/test/market/market-pit-calendar-package-projection-v1.test.ts` | `0e43110ef42282f07914074046d5362fd88fb85b27e8466a460f7cfe1c2f8118` |

原两个 Schema fixture 文件保持 SHA-256：

- `packages/schemas/test/market-pit-historical-evidence-v1.test.ts`：`0e663e71666ec27cb29652fc6c0fa08967ed63c39df77bb0e6a512acb8855832`。
- `packages/schemas/test/market-pit-reconstruction-v3.test.ts`：`e60112a2fa836ac57c1b4345ad4cd917b514638432a884c70224affb5d61de61`。

`schemas` 当前 `src/test` 的 `.ts/.tsx/.json` 输入树为 103 文件，路径排序后以 `path:sha256` 换行连接且无末尾换行的 SHA-256 为 `6cd190049895d3cf0013bfb17c88472fea363a5005d004e8db605194a1eba736`。

`server` 当前 `src/test` 的 `.ts/.tsx/.json` 输入树为 636 文件，路径排序后以 `path:sha256` 换行连接且无末尾换行的 SHA-256 为 `123142f395b45a2b7d3faa1d8eabf6e7d8739fb2b7f4ab4ee0f3c7ff6d33846a`。

Spec/Task 台账与后续窗口任务仍由协调者维护。本叶无阻塞，源码与新测试已冻结；继续后续任务时，应使用本轮 Schema 输入重新执行受影响的窗口算法与最终准入检查。
