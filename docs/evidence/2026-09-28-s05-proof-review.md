# S05 必要证据链最终源码 Review

## 结论与范围

`S05-proof-review-0928 / worker_done`：本叶只读 Review 工作完成，发现两项 P2，未修复；不表示代码已批准或整体任务完成。唯一写入为本文，未修改源码、测试、配置、Spec/Task，未 reset、stage、commit、clean，未创建子代理。读取 AGENTS、RTK、Codex 规则、codex-cost；涉及工具选型的修复建议按 recommend 检查本地依赖。Context Mode 不可用，采用 RTK 与有界读取。所有本叶命令已结束，没有后台进程，会话不复用。

依据完整 Spec §6.1–6.2 和 AC09、AC12、AC15、AC20 实际读取下列源码，并选择性查看定向测试的行为及夹具边界。父进程负责窗口计算器、Store、Snapshot、生产预检和离线重放，本叶没有重复审查这些面。基线 HEAD 为 `fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`；写入本文前 dirty 条目为 537，全部保留。

## 需处理的问题

### F01：来源观察必要绑定截断合法亚毫秒时间（P2）

位置：[market-pit-reconstruction-source-times-v3.ts](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/apps/server/src/market/market-pit-reconstruction-source-times-v3.ts:25)，关联同文件第 29、33–37、49 行。

触发输入：已通过完整归档门禁的一根 Bar，`timestamp=2026-05-18T07:00:00Z`、`availableAt=2026-05-18T07:01:00.123455Z`，原归档 `sourcePriceBasis.observedAt=2026-05-18T07:01:00.123456Z`、真实 `fetchedAt=2026-05-18T07:01:00.124Z`，其余身份、摘要、坐标和冻结截点合法。这些原字符串可以由现有 `z.iso.datetime({ offset: true })` 合同接收。`Date.parse` 将两个小数时间都截到 `.123`，第 49 行不能识别观察晚于 Bar 可见时刻，最终返回 `source-times-bound`。相反方向的亚毫秒抓取/观察顺序和 Bar/观察顺序比较也存在同类遗漏。

这违反 Spec §6 的来源观察必要条件，但不证明生产严格 PIT 已被放行：后续独立窗口与最终资格仍有自己的门禁。必要状态本身仍应真实。现有来源时钟测试覆盖 10 毫秒传输、整窗迟观察、非法时钟和重复/缺失归档，没有亚毫秒严格边界；捕获解析器的 57 项测试验证的是另一入口，不能覆盖这里。

最小修复：来源时钟必要阶段复用已存在的 `parseMarketPitEvidenceInstantV1` 与 `compareMarketPitEvidenceInstantsV1`，保留原时间字符串，用精确比较核对所有顺序和相等条件；用有界错误处理继续返回稳定领域错误码。建议独占写集为本源码与 `apps/server/test/market/market-pit-reconstruction-source-times-v3.test.ts`，新增合法亚毫秒、等价 offset/尾零、非法时钟以及精确相等向量。修复后来源时钟与依赖它的 repository/content 定向证据失效，需要刷新；原包认证和捕获 parser 原字节证据不因该修复自动失效。

### F02：新 v2 清单和历史结构仍将不相等/未来瞬时判成相等（P2）

主位置：[market-pit-reconstruction-v3.ts](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/packages/schemas/src/market-pit-reconstruction-v3.ts:206)。v2 将 `decisionAt=2026-05-18T07:01:00.123456Z` 与实际输入 Bar 的 `availableAt=2026-05-18T07:01:00.123455Z` 用 `Date.parse` 比较；只要其余字段合法，就没有触发 `bar-archive-mismatch`，违反 Spec §6.1 对未修改 Bar `availableAt` 的精确绑定。

同根问题的本批历史区位置：同文件第 129–134 行冻结截点；[market-pit-historical-references-v1.ts](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/packages/schemas/src/market-pit-historical-references-v1.ts:45) 原文可见/获取顺序；[market-pit-calendar-structure-v1.ts](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/packages/schemas/src/market-pit-calendar-structure-v1.ts:48) 日历可见/获取顺序；[market-pit-historical-bar-bindings-v1.ts](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/packages/schemas/src/market-pit-historical-bar-bindings-v1.ts:60) 日历和来源修订的决策可见性。举例：原文 `acquiredAt=.123456Z`、`dataAsOf=.123455Z`，或来源 `revisionKnownAvailableAt=.123456Z`、对应 `decisionAt=.123455Z`，同一毫秒内非法顺序可通过新 v2 必要结构门禁。原文登记 parser 后续能够拒绝其中部分输入，不改变此结构状态误通过的事实。

最小修复：在 Schemas 所有的稳定证据瞬时契约中提供精确、有界比较，并贯通新 v2 相等、获取/可见顺序及冻结截点；不能从 Schemas 反向 import Server helper，也不能单用字符串比较，因为等价 offset 与尾零应相等。建议写集为上面四个 Schema 文件、一个由 Schemas 所有的证据瞬时 helper（如需新增）、`packages/schemas/test/market-pit-reconstruction-v3.test.ts` 与 `market-pit-historical-evidence-v1.test.ts`；必要出口单独指定所有者。本批 Schema/v2 content/repository 联合证据需要刷新；原始登记常量及 93 文件源包映射不需要重建。

以上为实际源码路径推导，按本叶只读授权未运行复现程序或新增测试。没有将它们描述为已发生的生产事故。

## 已核对的合同与安全边界

| 核对面 | 实际源码结论 |
| --- | --- |
| v1/v2 与输入绑定 | v1 parser 保留独立入口；联合 parser 严格拒绝未知字段，v2 完整覆盖按原清单顺序的 Bar、归档 identity/hash、市场/标的/窗口、请求/响应真实目标、来源完整价格坐标、序列版本与输入指纹。v2 的精确时钟缺口见 F02。 |
| 有界结构 | 文件限 32 MiB，Bar/累计日期/跨度限 100,000，记录 1,024，单原文 8 MiB，元数据字段及源码相对路径有界；预处理发生在日期索引与结构精炼前，源码 base64 预算发生在解码前。 |
| 固定原发布 | 日历 parser 先核对固定发布者、URI、版本、定位、发布时间和原文字节摘要，原文 28,845 字节，唯一 wheel 的 URL/大小/摘要/类型/yanked/六位微秒时间核对。攻击者自重算摘要不能替换登记原文。 |
| 固定源码树 | 必须提供全部 93 份原字节、逐文件摘要及 695,008 总字节，路径唯一，排序摘要树与登记相等，XSHG 文件摘要单独相等，再提取 605 日期和四个分钟常量。不执行 Python，不声称重新计算 wheel ZIP 摘要。 |
| 投影与范围 | 日历原发布只允许 CN/XSHG/Asia/Shanghai、2026-03-10 至 2026-12-31 范围内的连续日期和常规双时段、固定 +08 规则；完整复算日期状态和原时间文本投影摘要。不外推 XSHE，不签发 `symbolScope` 或场所证据。 |
| 日历时钟 | 登记发布时刻精确到微秒；parser 对 acquiredAt/dataAsOf/可选 decisionAt 使用整数微秒比较，拒绝多于六位小数而不截断。仅结构层使用宿主 Intl 的时区投影，不作为原日历准入。 |
| JSON 与字节 | 固定发布 JSON 拒绝损坏 UTF-8、BOM、重复及转义重复键；捕获摘录只允许三项 string 字段，拒绝多余/缺失/重复字段、非 UTF-8 声明、BOM、孤立 surrogate 和字节预算溢出。清单文件 fatal UTF-8 解码、摘要和严格对象 Schema 组合失败关闭。 |
| 捕获摘录 | 固定登记只接受实际归档 identity、完整响应 hash 与 evidence hash、真实 fetchedAt 的精确相等；原文摘要按完整 UTF-8 字节计算。获取必须满足 fetchedAt <= acquiredAt <= dataAsOf；不从 sourceObservedAt 补齐抓取时间。1,024 位小数的有界精确比较与未知偏移拒绝已实际读取。 |
| 实际内容 | content 真实调用 `findFrozen`，复核响应解析、identity/hash、派生系列版本、完整来源/修订/价格坐标与完整逐 Bar 值；观察时间可以不同，request-window 基准范围必须相同；输出完整去重归档的克隆。不接受清单内联价格替代归档。 |
| repository | 引用必须等于当前配置摘要；每次打开普通文件，以 stat 和额外一字节读取检查上限及增长，原始摘要一致后解析；撤销、改字节、归档缺失均不复用缓存。保留 manifestText/hash，不提供 HTTP 写入入口。 |
| 状态语义 | `bound`、`archives-bound`、`source-times-bound`、`calendar-package-verified`、`source-capture-bound` 都是局部必要结果，没有自行返回最终 `historical-window-bound` 或运行 ready。caller 声明与实际已登记原文/归档门禁分别处理；typed archive 输入要求调用者先完成内容门禁。 |

旧 v1 的 `market-pit-reconstruction-manifest-validation-v3.ts:56–65` 与内容冻结检查 `market-pit-reconstruction-content-v3.ts:75–81` 也保留 `Date.parse` 的毫秒语义。这是既有必要阶段边界风险，本文不将所有 legacy 时间比较合并成全面改造任务，也不声称 finalstage 可被绕过；父进程应根据最终门禁和兼容边界确认修复范围。F01 与 F02 的必要状态误通过应先独立处理。

## 测试证据与最终资格边界

本叶没有运行测试、build、运行时、网络或数据库。实际查看 source capture 测试的登记/字节/重复字段/精确小数向量、calendar package 测试的固定登记/元数据及可选公开输入分支、repository 撤销和摘要向量、source-times 合成归档向量，并扫描本范围其余测试标题；没有把测试标题扫描当作完整测试代码审计。

[稳定回归证据](2026-09-28-s05-stable-regression-gates.md) 记录 Server 1736 通过/88 skip、类型/build、59 TS 严格 lint/格式、边界及带真实 HEAD 的尺寸 ratchet 通过。该证据是独立验证叶结果，本叶未重跑。默认全包公开原包相关 7 项 skip；独立公开输入联合 82/82 无 skip 是固定真实原 JSON 与 93 份源码的认证证据，不能等同交易所场所、来源修订、真实历史同期抓取或合格 PIT 运行。合成 calendar/归档 fixture 仅验证结构和算法；捕获 parser 单元成功不是来源准入。

Spec §6 的最终原文资格、场所绑定、修订发布真实性、执行日历一致、冻结发布前撤销/摘要复核及封存离线重验仍需由其所属阶段闭合。XSHE 日历和 `159516.SZ` 场所证据仍是外部前置。AC09/12 的本地拒绝合同与 AC15 的兼容必要条件不意味着全部验收完成，AC20 的 M2/M3 真实准入不能由本叶补签；未实现但 Spec 明确留开的最终资格管线不列为本批局部实现缺陷。

## 实际 Review 输入 SHA-256

下表为本叶实际读取源码的当前摘要；共享 index 仅看必要 API 出口，非全文件 Review。辅助 wire/price/window 文件仅核对时钟接收及实际归档端口边界。

| 文件 | SHA-256 |
| --- | --- |
| `packages/schemas/src/market-pit-historical-references-v1.ts` | `7ee43020f6503f865fed0bbca57044eb20bc41daaba4d394df40cf2cac6cf986` |
| `packages/schemas/src/market-pit-calendar-structure-v1.ts` | `413c3feb7b1d5434671956b7e9834442de9915c479025cd27554fee41b783c5b` |
| `packages/schemas/src/market-pit-reconstruction-v3.ts` | `da1d8521a9e64877d578633cbea9274f3e6ba5dcaa0b0e8282f55bf086bf3022` |
| `packages/schemas/src/market-pit-reconstruction-manifest-validation-v3.ts` | `d6f380dc35ac13664d6c05f28f063b430f6d1def2fd4a84076c5493c8cb69321` |
| `packages/schemas/src/market-pit-historical-evidence-v1.ts` | `ad61c28930ae4b5275a2e3e2d21f7870f9f0986afc23a589f6320a560c3d87a8` |
| `packages/schemas/src/market-pit-historical-bar-bindings-v1.ts` | `f5f3d201c8965811149a17a245d91472f28e34c447d1db876193d17305db0970` |
| `packages/schemas/src/index.ts` | `d64c164fb5afadecfba89cb17945a871f6256aeadcd0af5e2dcd3469efc5da01` |
| `apps/server/src/market/market-pit-calendar-package-v1.ts` | `0330d5a5325f77924f2c8ac3f79e3d1f1bbe1b9bab746756b1d3b72fd7c479dd` |
| `apps/server/src/market/market-pit-calendar-package-source-v1.ts` | `efed42b9895ecf4e1fc89e9c0415f1771c013365f7bdc59b4000781fe4b35d2a` |
| `apps/server/src/market/market-pit-calendar-package-projection-v1.ts` | `7337c2f2cb5053bf020218a4347fd86535f7b23a7fe4ed25df7761c7b2534965` |
| `apps/server/src/market/market-pit-source-capture-v1.ts` | `990ad6aa7b590049c1aa23cf72544b4653a257a97691d65e0562d178b00e6abb` |
| `apps/server/src/market/market-pit-evidence-instant-v1.ts` | `e6fe936cfcd90ec6bf17bc9905903f80792f94cefb0c0dcad4c05a16c7768f76` |
| `apps/server/src/market/market-pit-reconstruction-content-v3.ts` | `e831152a1338ce7633a6c8163670b144e663585f9e5e5e0c295c7eab6bb7f768` |
| `apps/server/src/market/market-pit-reconstruction-source-times-v3.ts` | `0c2528d1994e0f2a4edb323979e1c07c68dc69b98dc26d096599f55d4b9172ef` |
| `apps/server/src/market/market-pit-reconstruction.repository.ts` | `afaed2831520bcbb3c144b6f171641c7a9c9e3d5f0989f2325dfe7a088a33187` |
| `packages/schemas/src/market-price-protocol.ts` | `17eacc128f2109d680baa29e8b0f62ca88c65c48a5db79e58800f54d38268727` |
| `packages/schemas/src/market-data-wire-v3.ts` | `09f2cec7b518b895f0da490ed5c69f1774a3a8a06e53db524248c1401fd4279f` |
| `apps/server/src/market/market-window-response-v3.ts` | `cf5023656897f020d8fbd00a96ba21145c156a640be0380ab65b144c7de981a6` |
| `apps/server/src/market/market-window-evidence-v3.repository.ts` | `7a31e0019caa1172f7e90e67d9046533f70d90bb6be82d349000e144104688db` |
| `docs/specs/2026-09-25-multi-source-adjustment-aware-backtest.md` | `ec4abf29d835d3cb5bb190cdf0f704bb8bcaac307039af243d2079968baccbf8` |

工具选型只读检查：Server manifest 声明 `es-toolkit ^1.51.0`，本地为 `1.51.0`；本地声明没有精确证据瞬时解析/比较函数，`isJSON` 声明仅承诺 `JSON.parse` 可解析，不适合领域精确时钟与原文字节校验。网络在本叶明确禁止，没有补做官方网页访问，也没有基于记忆推荐新的工具函数。精确秒与有界小数的现有领域 helper 是可评审的修复接缝。
