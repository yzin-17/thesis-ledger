# 复盘对象与 Schema 契约验证

本文按实施顺序保留各次基线。当前结论以末尾“最终源码与目标闭环复验”及[AC 对账](../../reviews/2026-10-04-journal-review-consistency.md)为准；前段 GET 缺失、未部署或父任务全部开放均属于当时状态。

## 已完成的独立契约

`packages/domain/src/journal-review.ts` 拥有稳定对象 ID、片段归属、nullable 时间、统计资格和半开窗口。ACTIVE Trade 没有周期结束时间，但其已发生的 SELL 片段可独立统计。未知开仓时间保持为空，不借用 earliestEvidenceAt。时间端点先检查带时区 ISO 与实际日期，整数秒由原生 Date 解析，秒内小数用既有 DecimalValue 保留，亚毫秒及负 epoch 不截断。

domain 定向 27 项通过；全包 40 文件、327 项通过；typecheck/build 通过。

`packages/schemas/src/journal-review.ts` 定义 decimal 原始 Trade/成本/费用/收益、显式关联计划、FX 来源、四类投影与对象指纹、nullable 候选、typed 确定性指标及 CURRENT/STALE Snapshot。保存请求只接受对象和预期指纹，不接受客户端伪造输入或输出。未知指标必须 value=null 并带缺失原因；高级 JSON/legacy 引用不进入正式对象。计划 reason/thesis 保留在结构化输入中。

Schema 定向 12 项通过；全包基线 51 文件、598 项通过；typecheck/build 通过。计划说明字段补充后定向 12 项另通过。domain 与 Schema 的对象类型/排除原因由契约测试对齐；Schema 不引入 domain 运行时依赖。

## 候选及对象级证据编排

Journal helper 的 16 项通过：对象及依赖事实来源、ID/行序重建、整体世代及无关标的变更、实际价格/成本/来源修订、后续 SELL、未分配建仓、片段时间前后公司行动、显式计划及 FX 变化。事实数量和收益始终保留 decimal string。完整周期与片段分别从自身可用成本源计算资格；未知开仓保留对象和实际收益，ACTIVE 周期不伪造结束，已发生片段独立统计。

旧快照对象指纹不同会显示 STALE；当前事实的统计资格单独判断，不因旧结果过期而隐藏当前可分析事实。输入投影本身过期仍输出 STALE_PROJECTION。该阶段的 helper 验证与下述实际查询验证分开记录。domain 时间/引用接口只依赖所需 ID 和时间字段，避免引入与职责无关的费用 DTO optional 属性差异。

窗口/分页另 11 项通过，当前 Journal helper 共 3 文件、27 项通过：账户/模式/标的/窗口范围、半开端点、未知时间、片段时间、稳定排序、世代及 ledger revision 变更、混代输入、无效游标和对象消失。分页绑定当前查询及版本。精确时间排序需要领域 comparator；strict sortBy 不接受 comparator，分页在 filter 产生的新数组上使用原生 sort，不修改输入。

## 原子投影读取的隔离数据库证据

Ledger 的 `TradeQueryService.readAccountProjection` 在同一 Repeatable Read 事务返回版本和详情，未引入 Journal 概念。专用数据库 `journal_review_fixture`、owner `fixture_owner`、localhost PostgreSQL 17 临时容器、tmpfs、全部 26 migration；`node scripts/test-journal-review-postgres.mjs` 的 2 项通过，临时容器清理完毕。

真实表锁让详情查询停在等待窗口，另一个写入事务此时把 state/Trade 同时从 7 更新为 8 后提交。该次读取仍为 state 7/Trade 7，随后新读取为 state 8/Trade 8；大于 JS 安全整数并含 18 位小数的数量原样返回，未知时间和收益仍为空。模式/标的查询隔离通过。fixture 只写本次隔离投影行，不连接目标库、不重放经济事实。

入口已纳入 CI，远端 Checks 尚未运行。初次结构 head 核对发现仅执行 migration SQL 会保留 baseline marker；已改为构建并调用当前 `dev-database-rebuild` 显式入口，固定 development、数据丢失开关、`journal-isolation/journal_review_fixture` 确认和 owner，完成全部迁移、Prisma/raw-owned 表检查、隔离应用角色及 head 初始化。受限 `fixture_app` 读取的最终 2 项复验通过，临时容器已清理；fixture 权限 SQL 仅用于该新建隔离库，不替代目标部署权限。

本次随后 Server 全包 259 文件通过、41 文件跳过；2,109 项通过、169 项跳过。数据库 2 项独立执行，条件式跳过不计通过。该全包基线位于计划/Journal 关联证明补充前，后续改动另执行定向验证，不以原子读 helper 代替完整 Journal 闭环。

## 计划、Journal 与实际查询

显式关联/查询补充后，5 文件 43 项定向测试、Server typecheck、ESLint 及复杂度局部门禁通过。唯一直接 Trade 计划和 Journal 事件关联均保留原始来源；多重关联不按时间挑选。关联证明独立于正文，错误账户、事件、计划或重复证明被拒绝。片段输入不包含其他 SELL 正文，该正文修改不改变当前片段指纹；本片段正文修改会改变指纹。

实际 query 单向消费 Ledger 原子读取，Journal 数据使用 Repeatable Read 读取，并在返回前重新核对账户世代。读取期间更新返回 PROJECTION_GENERATION_CONFLICT；Trade 指纹未就绪明确拒绝。旧 SELL 唯一映射到正式片段，缺失和歧义保留原说明并排除统计；歧义说明不复制到多个正式对象，未知模式保持为空。

2026-10-04 15:50 的隔离 PostgreSQL 增为 3 项通过，包含受限应用角色完整查询：Prisma decimal 计划原样返回、说明关联、历史输入读取、无关整体世代更新保持 CURRENT、计划修订标记 STALE，查询前后 Trade 和 Snapshot 行完全一致。随后增加存储输入指纹自校验，最终复验另记；不得将前一轮结果当作新加固已验证。

15:52:40 指纹自校验加固后的隔离 PostgreSQL 3 项复验通过，全部 26 migration/head 和受限角色初始化通过，临时容器已清理；Schema 全包 51 文件 598 项、自动边界门禁通过。文件尺寸检查当前仍报告 10 个存量警告，Journal.service.ts 保持 618 行未增长；新查询未挂接控制器或 Desktop，目标运行态仍未包含这些改动。

## decimal 分析与正式快照

domain 单对象分析 12 项、全包 41 文件 339 项通过；Schema 全包 598 项通过。分析使用原始 DecimalValue 计算，再对派生金额/价格/比率/天数进行 8 位 HALF_UP 舍入，实际数量原样保留。先舍入实际和计划再相减的虚假偏差场景已测试。Baseline 不伪装 BUY，未知开仓只降级持有时间；计划缺失不清空已有实际结果。反事实使用实际 SELL 数量并保留原成本/费用；公司行动价格单位不明时相关比较与反事实返回证据不足。

Server Journal 当前 8 文件 59 项通过，条件式隔离数据库 6 项另执行；Snapshot 定向 6 项覆盖权威输入、只显式保存、指纹竞争/序列化竞争、旧结果保留、旧契约/元数据兼容状态、历史游标及亚毫秒时间边界。Server typecheck、局部 ESLint/复杂度通过；快照读取没有重跑分析，也没有覆盖原行。

16:25:36 `node scripts/test-journal-review-postgres.mjs` 的 2 文件 6 项通过，全部 26 migration/head/受限角色初始化通过，临时容器已清理。新增场景通过真实 LedgerCommandService 写入当前信封并重建 Trade，使用 `fixture_app` 保存、分页和读取复盘；原始数量 `2.000000000000000001` 保留，结果净收益 `4.6`、止损假设 `-2.4`。保存和读取前后 Ledger/state/Trade/Cash 行保持一致；计划修订只标记历史 STALE，不修改旧输入或结果。

真实 Ledger 更正的 FOR UPDATE 在 Snapshot 的账户 state 共享锁期间等待，保存提交后更正继续执行；旧结果仍为 `4.6` 并显示 STALE，旧指纹再保存返回 JOURNAL_EVIDENCE_CHANGED。该测试使用实际事务/锁/命令，不用 mock 模拟数据库竞争。后续仅将测试的经济行读取提为同文件职责 helper，消除 describe 尺寸警告；下一轮业务输入变化时再一起复验。

## 工具函数的当前使用

按 recommend skill 核对项目安装的 es-toolkit 1.51.0、运行时导出、声明与源码。isDate 只判断 Date 对象，不能解析带时区字符串或表达窗口，窗口使用原生 Date 与已有 DecimalValue。[官方 isDate](https://es-toolkit.dev/reference/predicate/isDate.html)。

候选编排的通用数组及对象操作按各自语义选择，均返回新值：

| 函数                                                         | 输入                        | 行为与返回                   | 选择条件                                    |
| ------------------------------------------------------------ | --------------------------- | ---------------------------- | ------------------------------------------- |
| [uniq](https://es-toolkit.dev/reference/array/uniq.html)     | readonly 基础值数组         | 去重，保留首次顺序，返回数组 | 事实与事件 ID 去重                          |
| [sortBy](https://es-toolkit.dev/reference/array/sortBy.html) | readonly 对象数组与排序依据 | 升序返回新数组               | 事实集合按稳定依据排序                      |
| [omit](https://es-toolkit.dev/reference/object/omit.html)    | 对象与键数组                | 返回省略键的新对象           | 指纹剔除非经济性的存储 ID、展示名和整体世代 |

从 `es-toolkit` 导入上述函数，不复制同类通用工具。项目 strict sortBy 的签名要求对象数组；基础字符串 ID 使用 uniq 返回的新数组再执行原生 sort，不修改输入数组。当前 TS lib 未提供 toSorted，未因此调整编译目标。对象指纹的依赖范围仍由 Journal 拥有，不提升到无所有权的 shared/utils。

## 门禁与证据边界

定向 ESLint、项目复杂度规则、边界及 git diff --check 通过。边界新增交易投影/成本分配/Trade Schema 不得反向依赖 Journal，以及正式 Journal 契约不得依赖旧 number API 的限制；未改变阈值或增加 ignore。

当前独立查询、decimal 分析、周期及 Snapshot 已实现，控制器/API client 已接入，桌面消费正在验证。原 T1～T7/AC1～AC16 保持开放，不能将局部测试当作完整产品或目标运行态验收。Journal 新链路尚未部署，目标仍是 AI 恢复时的镜像。

## 周期、草稿与当前数据库复验

2026-10-04 17:02:04，`node scripts/test-journal-review-postgres.mjs` 的 2 文件 7 项通过；仍为 PostgreSQL 17、全部 26 migration、当前 head 和受限角色，临时容器已清理。真实 Ledger 更正后的净收益 `5.6` 保留；本次草稿止损 `8` 得到反事实 `-4.4`，原计划止损仍为 `9`。快照保存草稿，来源指纹保持原值，读取不重算；原 TradePlan 和 Ledger/state/Trade/Cash 行没有被复盘操作修改。同一真实投影进入周期查询时，完整周期 1 个、独立减仓 2 个，返回输入对象与同一投影版本。

domain 定向 51 项、全包 42 文件 351 项；Schema 全包 51 文件 598 项；Journal 定向 8 文件 61 项通过（7 项数据库条件式跳过已独立执行）。Server typecheck、定向 ESLint 通过。新增深链定位随后单独 9 项查询测试通过；深链由 Server 按账户、模式、父 Trade 与 Slice 返回正式对象 ID，Desktop 不拼接标识。

桌面主路由已接入新组件。固定输入页面与目标服务分开：本页请求在当前页处理，不读取或写入业务服务。正式 UI 的 4 项定向验证覆盖原始数量、STALE 与当前资格分开、片段未知值不借父周期事实、失效深链账户不回退到其他账户。实际浏览器交互和包级检查仍在继续，尚不作为目标 HTTP、Electron 或真实 Provider 通过的证据。

## 正式消费与冻结 AI 链路

截至 2026-10-04 18:13，旧 number 候选/快照服务及客户端入口已清理；JournalService 收敛为原始说明、计划与导出。五种旧 number 分析保留在显式兼容 Controller/服务，正式对象、周期和 Snapshot 不消费它们。新边界门禁固化 Journal→AI、AI 不得反向依赖 Journal，以及正式消费不得依赖旧 number 编排。未增加阈值或 ignore。

单笔解读重新核对对象指纹、草稿和算法后，冻结对象实际依赖范围内的事实与确定性结果。周期解读核对账户/模式/标的/窗口、Ledger revision、投影世代、算法及全部对象指纹；完整周期、减仓与时间未知对象分别保留。通用 HTTP 客户端不能伪造冻结事实或 Prompt，执行器使用冻结的审计 Tool，不回读当前组合替换来源。

AI 与确定性分析使用独立 mutation，单笔/周期共用轮询和结果展示。重新分析使用独立序号；旧任务的晚到关联不能写入另一轮快照。修改草稿或窗口后保留旧结果并阻断旧范围保存/解读。显式保存只接受同对象、事实、草稿和算法的 AI 元数据。

| 检查                               | 输入范围                                                 | 最后结果                                               |
| ---------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| domain 全包                        | 分析假设提取后的当前 domain                              | 42 文件、351 项通过                                    |
| Schema 全包                        | 单笔/周期 AI 契约、快照元数据                            | 51 文件、598 项通过                                    |
| API client 全包                    | 正式消费、范围/算法/草稿绑定、旧响应拒绝                 | 10 文件、60 项通过                                     |
| Server AI/Journal 定向包           | 当前提交、执行来源、读取、分析及快照                     | 37 文件、291 项通过；46 项条件式跳过单列               |
| Desktop 全包                       | 正式路由及复盘组件                                       | 82 文件、551 项通过；状态职责提取后正式复盘 5 项另通过 |
| typecheck/build                    | 当前 Schema、domain、API client、Server、Desktop         | 通过；Desktop 保留既有 bundle 尺寸提示                 |
| 隔离 Journal PostgreSQL            | 全部 26 migration、当前 head、受限角色、真实 Ledger 命令 | 2 文件、8 项通过，容器已清理                           |
| 隔离研究提交及独立进程恢复         | 当前 Server 构建、临时数据库、实际独立 PID/SIGKILL       | 2 文件、6 项通过，临时容器清理；不代表目标在途研究重启 |
| ESLint、边界、依赖图、静态可访问性 | 当前修改文件及仓库规则                                   | 通过；新分析/来源选择/界面状态职责无新增复杂度警告     |

18:02 的 Server 全包首次出现 3 个回测超时，另有同一超时触发的目录清理错误；2148 项通过、175 项跳过。三个失败文件在默认 5 秒阈值下以单线程复验，11 项全部通过。未放宽阈值；当前职责提取后的 Server 全包正在以最多 2 个 Worker 重新执行，最终结果另记。

18:11:57 的 Journal 隔离 PostgreSQL 8 项包含新增 AI 持久化场景：创建任务冻结精确来源/草稿/结果及默认模型修订，显式 Snapshot 保存任务编号/Provider/模型/Prompt/保存时状态。后续任务失败不修改历史快照；不同草稿不能关联该任务，周期任务不能冒充单笔任务；经济 Ledger/state/Trade/Cash 行不变。数据库证明只覆盖隔离环境，目标尚待官方更新。

固定输入浏览器已验证原始数量、草稿 Sheet、显式分析/保存、草稿改变后禁用保存、相关证据改变后保留旧结果、历史 STALE 读取和账户切换清空旧上下文。新增单笔 AI 缺少模型返回中文配置错误，确定性结果与保存能力仍保留；周期窗口修改保留旧统计并禁用 AI。固定页不访问业务服务；目标 HTTP/浏览器、真实 Provider、Electron 和远端 CI 仍分别待验收。

## 最终源码与目标闭环复验

2026-10-04，18:14 的完整 Server 复验以 `vitest run --maxWorkers=2` 完成：265 文件、2151 项通过，42 文件/175 项条件式跳过；87.35 秒，未放宽默认超时。该结果位于 native 格式收敛前；最终格式源码又执行 Journal/执行器/提交/控制器定向 82 项，通过，8 项数据库条件式跳过另执行。

18:40:23 的 `node scripts/test-journal-review-postgres.mjs`：3 文件、8 项通过，全部 26 migration、当前 head、受限角色和真实 Ledger 命令；临时容器清理完成。AI 关联场景已移到独立账户夹具，不再依赖前一个快照更正用例，冻结实际收益为原始 `4.6`；原快照更正用例的 `5.6` 仍按真实命令验证。后续任务失败不会改写保存时 AI 元数据。

| 检查命令                                                    | 当前输入范围                                            | 最后结果                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm --filter @thesis-ledger/domain test`                  | 最终分析假设和指标职责                                  | 42 文件、351 项通过                                                |
| `pnpm --filter @thesis-ledger/schemas test`                 | 正式/历史/单笔与周期 AI 契约                            | 51 文件、598 项通过                                                |
| `pnpm --filter @thesis-ledger/api-client test`              | 正式 SDK 和范围校验                                     | 10 文件、60 项通过                                                 |
| `pnpm --filter @thesis-ledger/desktop test`                 | 正式路由、复盘组件                                      | 82 文件、552 项通过；后续夹具改动不进入生产路由                    |
| `vitest run test/journal-formal-review.ui.test.tsx`         | 原始精度、片段未知、中文、深链隔离和基线来源范围        | 6 项通过，18:58 复验                                               |
| 包级 typecheck/build                                        | 当前 Server 与依赖；Desktop 含兼容错误中文提示          | 通过；Desktop 保留既有 bundle 大小提示                             |
| 定向 ESLint/Prettier                                        | Journal、冻结 AI、domain/Schema/SDK 与当前桌面复盘/夹具 | 通过，新职责无新增复杂度警告                                       |
| `check-boundaries.mjs` / `check-workspace-dependencies.mjs` | 全仓模块/8 包依赖                                       | 通过                                                               |
| `check-accessibility.mjs`                                   | 现行静态规则                                            | 13 项通过，不替代键盘/设备验收                                     |
| `check-file-size-guardrails.mjs`                            | 当前文件尺寸                                            | 9 个存量警告；JournalService 已退出超尺寸列表；未增加阈值或 ignore |
| `git diff --check`                                          | 当前主仓全部 tracked diff                               | 通过；未 stage/commit/push                                         |

### 官方目标同步

先检查运行容器与兼容预检，再调用 infra `./scripts/sync-code.sh thesis-ledger`。最终源码同步成功，Server 与 Backtest Worker 均 healthy，镜像保持 `sha256:27dfa6a8aa364abf0eacf21a793a2ecfb4f95a579d0285bd7aabcbb143744426`。本轮无 package manifest、Prisma Schema/migration、Dockerfile 或系统依赖变化，未执行数据库重建或卷操作。同步是可写层更新，不是镜像发布；最终 UI 文案调整属于宿主 Desktop 构建，目标 Server 核心输入没有再次变化。

### 目标 HTTP 与事实保护

显式运行 `node scripts/journal-review-target-smoke.mjs --create-fixture` 一次，创建开发验收账户 `95bd7e1a-72df-4cd7-aae8-121d8545e5ea`（复盘验收 2026-10-04 1e77d3fe）。使用真实 Ledger 命令写入 1 BUY、2 SELL，再显式关联计划和说明；复盘分析/保存/读取前后该账户经济 Ledger 不变。

- 标的 `600519.SH`，原始数量 `2.000000000000000001`；实际净收益 `4.6`，本次止损草稿 `8` 对应反事实 `-4.4`、差額 `-9`，原计划止损 `9` 保留。
- 周期窗口 `[2026-01-02T09:00:00Z, 2026-01-04T09:00:00Z)` 返回 1 完整周期、2 独立减仓；将结束缩到 01-03 时仅返回 01-02 片段，边界不含结束。
- 快照 `4e670373-64b1-468b-9dee-c0645cc44c75` 保存于 `2026-10-04T10:19:06.020Z`。相关说明显式修订后 STALE，历史结果仍保留；旧指纹再保存 409，错误模式对象读取 404。
- 目标浏览器随后显式保存另一份当前快照；最终同步后复用同账户只读复验，仍为 3 对象、2 快照，旧 STALE 结果和单笔/周期结果不变。没有重复创建验收账户。
- 默认模型仍为空；单笔/周期解读分别 400 拒绝，研究历史 SHA-256 不变，没有创建伪成功任务。目标拒绝后仍 healthy，确定性结果可保存。

两个受保护账户的 Ledger 原始响应 SHA-256，最终复验与初始完全相同：

| 账户                                   | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `0e9677d2-98c6-45b1-8bc3-8d07b9209180` | `0fbaef556819de4ae6c2df4e6217fd20b8f71e22b54873899df74b69c6fbf6aa` |
| `93337db7-a5a0-40c5-823f-63577e9e924b` | `16adbe5ab0384cc5189c91118ccfbae03e2fcf3327fd64f0e4dc68a88bbaee2b` |

目标 Server 日志检查未发现 ERROR、Unhandled 或缺表；3 条预期 HTTP 400 警告来自空默认拒绝，不能误判为执行器故障。目标研究在途重启尚未执行。

### 浏览器分层证据

目标正式页面验证完整事实/费用/计划/说明、人读精度、Sheet 草稿、显式分析/保存、旧 STALE 详情、独立周期以及空默认 AI 错误后保留确定性结果。高级 JSON 在目标验证非法输入反馈和合法旧 number 分析；没有创建正式对象或快照。

固定页面 `/test/browser-journal-review.html` 验证实际生产组件，所有请求只在当前页处理。单笔与周期 AI 均由 queued/running 轮询到固定 succeeded，展示任务编号/Provider/模型/Prompt/算法、风险和结果；显式保存后历史保留保存时元数据。它只证明协议与消费，不证明真实模型或经济数值。固定输入使用最小来源样本，经济正确性依据 domain、真实命令隔离数据库及目标账户。

固定状态页还验证无账户、账户失败与重试、无候选、候选/对象读取失败、确定性失败、保存失败、历史失败、AI failed 终态。保存或 AI 失败仍保留旧确定性结果。未知开仓仅降级相关指标，Baseline 显示“基线观察（不是成交）”及估算排除，ACTIVE 不伪造退出，独立片段显示自身收益/数量；应用候选窗口清空旧对象，周期改窗口保留旧结果并禁用旧范围 AI。

Sheet 使用键盘 Enter 打开，初始焦点为计划入场；Tab 到计划退出，非法价格给出中文字段错误，Escape 关闭并回到原触发按钮。390×844 下页面宽度/scrollWidth 为 390，Sheet 宽 374，底部操作可见；临时视口随后恢复默认。该验收覆盖固定页面和 Sheet，不替代全部产品窄屏/键盘或原生客户端。

### 未完成门禁

完整 UI 矩阵仍需 legacy 歧义记录、分页世代冲突与重试、离线/恢复及其上下文晚到路径等补验；真实 Provider 成功/失败、目标在途研究恢复、原生客户端与远端 CI 仍开放。T1～T3 已完成，T4～T7 不以核心流程或固定 AI 代替全量验收，详见当前 AC 对账。

19:00 后补验固定 legacy 无映射记录：正式对象列表为空，旧记录单列“未找到对应减仓”，明确排除正式统计。账户加载中只呈现 Skeleton，不保留对象操作。目标高级 JSON 的非法输入反馈已改为中文，Desktop build 与定向 ESLint 通过；正式页面在 390×844 下稳定宽度及 scrollWidth 均为 390，候选表、标签和底部导航可用。旧 Sheet 已关闭后再检查稳定画面，不以关闭动画中的截图作为视觉通过证据；临时视口恢复默认。

## 聚合后保护性复验与 legacy 歧义浏览器补验

行情 T1.2 的公共 Schema/SDK/Controller 补丁完成并快更后，复用原标记账户再次读取 3 个正式对象、2 份历史快照；旧 Snapshot 保持 STALE 和原输出，确定性收益 4.6/反事实 -4.4，周期为 1 Cycle/2 Slice。两个受保护账户和验收账户分析前后 Ledger 哈希仍一致。主仓当前 Domain 386、Schema 619、API Client 68；Server 行情特性 614 项通过、27 项默认条件跳过，独立输入与完整 Journal 回归分别记账。镜像未变更。

固定页新增符合正式 Schema 的 `SELL_MAPPING_AMBIGUOUS` 状态，保留两个不同减仓候选及原 Journal 来源。显式 fixture TypeScript 编译通过；浏览器展开“旧 Journal 记录待确认（1）”后显示“减仓映射存在歧义”和“尚未进入正式统计”，正式候选为 0、没有“选择对象”按钮。此验证覆盖消费层保留歧义，不声称新增真实目标歧义历史。

当前固定页使用同一浏览器会话、新 Vite 来源 `http://127.0.0.1:5184/test/browser-journal-review.html`；旧 owned 5183 Vite 已停止，其他端口未清理。分页/版本冲突与重试、离线、晚到响应及全页面交互矩阵继续开放。日志为 `/tmp/journal-fixture-ambiguous-type.log` 和 `/tmp/market-period-api-journal-protection.log`。
