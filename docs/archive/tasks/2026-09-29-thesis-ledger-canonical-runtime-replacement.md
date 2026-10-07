# ThesisLedger 单一现行链路替换任务

> 任务标识：`thesis-ledger-canonical-runtime-replacement`
> 对应 Spec：[单一现行链路替换](../specs/2026-09-29-thesis-ledger-canonical-runtime-replacement.md)
> 状态：已完成并归档（2026-10-02）；全部 C/E/U/D 任务及最终 Review 完成，旧数据不保留读取兼容。
> 交叉验收：[多来源回测 Task](../../tasks/2026-09-25-multi-source-adjustment-aware-backtest.md)继续拥有 M1/M2/M3、AC01–AC20 和真实 Provider/业务验收状态。本任务只拥有版本替换及旧兼容删除，不将这些未完成门禁勾选。

## 1. 基线与执行约束

三仓有大量未提交工作；每叶开始核对 `git status` 与实际写集，禁止 reset、clean、整仓格式化或覆盖其他在途修改。2026-09-29 初始基线中 Server V2 Run 创建/模式分派与 V3 Runner 共存；现行 Run 创建已收紧为 `mode='V3'`，旧 `jobs` 和 Runner 仍可达。`/api/v2/market*` 仍是公开调用路径，DSA `api/v1` 同时承载非 ThesisLedger 路由。以当前源码为准完成全量库存，不凭后缀猜测旧代码。

每叶先定向测试，再包级测试/typecheck/build、仓库门禁、隔离数据库、官方 infra 更新入口、目标 Docker、桌面/浏览器和真实业务验收。只在输入改变后重跑相应高成本检查。旧数据无需转换，但任何数据清理/开发重建仍需遵守 `AGENTS.md` 的目标、owner、消费者停止和显式重建条件；正式发布数据升级单独验收。旧版本拒绝必须发生在读取或执行前，不能出现晚到写入。

## 2. 状态机与合同

| 状态 / 任务 | 写集与完成断言 | 验证 |
| --- | --- | --- |
| [x] C01 全量库存 | 主仓 Schema/Domain、Server/Worker、Prisma、API Client/Desktop、DSA ThesisLedger 路由/Control、infra 打包的 V1/V2/V3 路径逐项列出生产者、消费者、持久化格式和当前可达性；标明真正旧兼容、现行领域合同及不可变证据版本。 | 全量库存与 C03/C04 增量对账、当前路由/导出、目标结构及部署输入核对完成，见 [C01/C02 收口证据](../../tasks/evidence/2026-10-02-c01-c02-completion.md)。 |
| [x] C02 单一 Run 状态机 | 固定仅现行模式的新建、投递、领取、终态、重试、取消与 CAS；删除 V2 模式分派及旧 Run 创建。旧记录明确拒绝且不改写。 | 并发与六处模式 CAS 竞态、隔离 PostgreSQL/真实 Worker、目标创建/拒绝/幂等与数据不变性通过，见 [C01/C02 收口证据](../../tasks/evidence/2026-10-02-c01-c02-completion.md)。 |
| [x] C03 Schema/Domain 合同收敛 | 现行 Market、Backtest、Ledger 类型和经济不变量由各所有者模块单向导出；删除仅服务旧输入的可选字段、别名、默认值及 V1/V2 导出。将现行 V3 实现按职责收敛为单一模块，不机械改名。 | Schemas/Domain 定向与全包、类型/build、快照身份及经济 golden；边界门禁、隔离 PostgreSQL 和官方目标保数据更新通过，见 [C03 收口证据](../../tasks/evidence/2026-10-01-c03-contract-convergence.md)。 |
| [x] C04 冻结格式边界 | 新 Run 只写/读当前 Snapshot、证据与结果格式；旧 manifest/Parquet/本地 Store 路径不被回放、重试或研究执行消费。格式标识与摘要继续核验。 | 当前正向冻结/重放、旧格式/篡改/严格 PIT 拒绝、隔离 PostgreSQL/BullMQ 与目标 HTTP/离线重放通过，见 [C04 收口证据](../../tasks/evidence/2026-10-02-c04-frozen-contract-completion.md)。 |

C03 于 2026-10-01 完成 a.1 旧 Ledger 纯导出、a.2 旧配置 decoder/分派、a.3 旧回测及未消费 NAV 编排、b 当前策略/经济合同归属、b.1 显式数据库版本和 c Ledger/Trade/Baseline 公共合同。执行包、消费者写集、检查结果、目标备份与最终一致性复核统一记录在 [C03 收口证据](../../tasks/evidence/2026-10-01-c03-contract-convergence.md)。保留当前 AST2、Ledger 信封3和不可变证据格式，未扩展其他 Canonical 父组的验收结论。

C04-a 场内冻结边界按独立验收继续推进：

- [x] C04-a.1 冻结身份与复用：读取核对目录 Run ID 和文件状态，已冻结快照的构建复用、幂等 finalize 与并发复用均执行完整重放校验；旧版本及严格 PIT 拒绝保留。定向 23 项、Server 包级 2001 项、类型/build 与边界门禁通过；本叶为本地文件验收，见[执行记录](../../tasks/evidence/2026-10-01-c04-a-snapshot-identity.md)。
- [x] C04-a.2 结果与运行态：重新计算持久化 manifest/结果摘要，列表、单项、操作和优化评分使用当前冻结门禁；隔离 PostgreSQL/Worker 及目标 HTTP/离线重放通过。

- [x] C04-b PIT/模型证据：proof1/2、series/model-v1 归属与审计补字段用途已对账；绑定不授予资格，旧严格或伪造历史证据继续拒绝，必要条件及精度负例通过。
- [x] C04-c NAV 冻结/结果：当前物理产物、来源原文、研究/严格可见性、模型、期末 pending 与结果身份验证通过；隔离真实 Worker 及 6 个目标 NAV Run 离线重放、公开读取通过。

C04 于 2026-10-02 全部完成，保留当前不可变证据版本与严格 PIT 不可用门禁；最终 Server 2005 项、Schemas/Domain 定向、真实隔离数据库/队列、官方快更及目标 7 个成功 Run 重放与 35 条旧记录 HTTP 拒绝均通过。执行写集、成本与验收边界见 [C04 收口证据](../../tasks/evidence/2026-10-02-c04-frozen-contract-completion.md)。

C02 按下列叶子逐项验收，均完成后才能勾选 C02：

| 状态 / 子任务 | 完成断言 | 验证 |
| --- | --- | --- |
| [x] C02-a 创建入口 | 新建 Run 只接受现行合同，旧合同在查库与写库前拒绝；API Client 创建类型同步。 | 定向创建/幂等/拒绝、Server/API Client 包级及目标 API 通过。 |
| [x] C02-b 持久化模式与领取 | 当前 Run 写唯一现行 `mode`，Worker 领取、重试预算与全部 CAS 条件使用同一值；旧记录不得进入执行。 | 并发/晚到、六处模式切换 CAS、隔离 PostgreSQL 和实际 Worker 通过。 |
| [x] C02-c 取消、重试、恢复 | 当前 Run 取消和手动/自动重试维持预算与单调 attempt；旧记录明确拒绝且状态不变。 | 取消竞态、队列探测失败、重试预算、离线重试、恢复/篡改负例通过。 |
| [x] C02-d 读取与响应 | `runs` 返回只接受现行格式的响应，API Client/Desktop 与 Server 一致；`jobs` 旧入口由消费面迁移后删除。 | 当前消费者扫描、API Client/Desktop 回归、目标 HTTP 与 C04/N4 既有真实客户端证据通过；旧 jobs 无生产消费者且目标返回404。 |

`C02-b` 的数据库默认模式已由 `V1` 改为 `V3`；完整 migration 输入、隔离 PostgreSQL、实际 Worker、目标 Server/Worker 和结构核对已完成，见 [C01/C02 收口证据](../../tasks/evidence/2026-10-02-c01-c02-completion.md)。[默认模式证据](../../tasks/evidence/2026-09-29-canonical-backtest-mode-default.md)保留早期实施记录。

`C02-d/C04` 的当前 Run 读取已增加持久化 RunConfig、Snapshot、结果及相互身份门禁；列表过滤损坏结果，单项明确拒绝旧格式，响应 Schema 同步收紧。早期本地证据见[读取格式证据](../../tasks/evidence/2026-09-29-canonical-current-run-read-boundary.md)；C04 已补齐摘要重算、隔离 PostgreSQL/Worker 与目标 HTTP，见 [C04 收口证据](../../tasks/evidence/2026-10-02-c04-frozen-contract-completion.md)。本轮完成 C02-d 路由/消费者对账与目标验收；U01/U02 的其他领域消费验收继续独立。

`C02-b/C02-c` 的运行、重试与取消前置读取和底层模式 CAS 已收紧；旧合同及并发模式变更在写库前拒绝。定向 37 项、类型/构建/边界通过，真实 PostgreSQL 与目标 Worker 仍待验收，见[模式 CAS 证据](../../tasks/evidence/2026-09-29-canonical-run-mode-cas.md)。

## 3. 执行面

| 状态 / 任务 | 写集与完成断言 | 验证 |
| --- | --- | --- |
| [x] E01 Backtest Server/Worker | `backtest.service`、Runner、Processor 和 Snapshot Builder 使用单一状态机及执行核心；移除 V2/V3 双 Runner、旧 NAV/Exchange 兼容编排，仅保留实际业务所需资产能力。 | 单一场内 Runner/日期对齐算法与独立 NAV 所有权收敛；经济/时序回归、Server2011项、8个隔离运行态场景、目标26模块一致及7条冻结重放通过，见 [E01 收口证据](../../tasks/evidence/2026-10-02-e01-execution-completion.md)。 |
| [x] E02 Market Server | 替换 `/api/v2/market*` 的旧控制/读取实现为单一现行路由、缓存与精确来源合同；移除旧 source alias、无 source、旧字段填充和隐式 fallback，保留 G0 与覆盖拒绝。 | 路由/缓存/并发/目录/来源修订定向测试；旧路径不能触发业务。 |
| [x] E03 Ledger Server/Domain | 盘点 `LedgerEventV2`、仓储和当前客户端动作后，统一当前事件写入/投影及其 Backtest 关联；旧 Ledger 数据不转换，旧格式读取明确拒绝。 | 创建、修订、撤销、关联 Run、现金/份额/税费不变量及原子写入；见 [E03 最终收口](../../tasks/evidence/2026-10-01-e03-backtest-association-closeout.md)。 |
| [x] E04 DSA ThesisLedger 专属接口 | 只将 ThesisLedger 数据/Control 路由、目录、准入和结果传输收敛到现行合同；非 ThesisLedger `api/v1` 留在 DSA。删除旧精确来源别名及版本回退时保持 Provider 适配器所有权。 | DSA 定向与隔离官方 `offline-tests`、鉴权/撤销/晚到拒绝；目标 HTTP 与 Server 消费配对。 |

`E02` 的现行指标计算缓存已从 V2 键迁至 V3 命名空间，受控清理入口同时识别两代键；初期定向 28 项与 Server typecheck 通过，见[缓存隔离证据](../../tasks/evidence/2026-09-29-canonical-indicator-cache-namespace.md)。其余缓存、目录及目标 HTTP 已在 [E02 父项验收](../../tasks/evidence/2026-10-02-e04-c-e02-c-parent-completion.md)补齐，E02 已完成。

E01 中 NAV Fund 按下列阶段接入当前链路；各叶的本地通过不能代替目标业务验收：

| 状态 / 子任务 | 完成断言 | 验证 |
| --- | --- | --- |
| [x] E01-N1 净值冻结合同 | 当前 RunConfig、依赖计划和 Snapshot 明确区分 NAV 事实与场内 Bar；绑定真实来源、完整窗口、可见时刻、费用模型及产物摘要，旧格式拒绝。 | Schemas/Domain 定向、非法净值与缺覆盖负例、构建和边界；来源绑定合同使用受控数据验证，真实来源在 N2/N4 验收。 |
| [x] E01-N2 准备与写入 | 基金策略走精确净值 Reader 和当前准入，创建守卫不再把基金映射为 ETF Bar；准备、冻结和读取均拒绝不完整事实。 | Server 定向、隔离 PostgreSQL 冻结与篡改拒绝。 |
| [x] E01-N3 执行与消费 | 当前 Runner 依据冻结 NAV 产物调用既有申赎经济内核，并使用当前结果/校验合同；确认/结算、费用、份额、现金及基准语义完整。 | Domain golden、Worker 领取到终态、离线重放和晚到/取消；公开读取、重试、创建投递及任务历史通过，见 [N3 汇合任务](2026-10-01-n3-nav-worker.md)与[最终验证记录](../../tasks/evidence/2026-10-01-n4-nav-target.md)。 |
| [x] E01-N4 目标验收 | Server/Worker/DSA 与客户端同源运行，真实净值来源和旧合同拒绝均有可复核证据。 | 官方保留数据更新及快更、三只真实基金 HTTP/Worker、checksum/费用/期末待处理、浏览器准备创建/历史重开和 QDII 公开重试通过；按用户要求不验证 Electron。见[目标证据](../../tasks/evidence/2026-10-01-n4-nav-target.md)。 |

E01-N1 按以下有界叶实施；父任务在全部叶验收前保持未勾选：

2026-09-30：N1.1–N1.3 本地合同阶段全部通过，N1 已完成；N2–N4 继续负责真实来源、创建、执行与目标业务验收。

- [x] E01-N1.1 合同与依赖计划对齐：按 Spec §3「NAV 净值依赖范围」，从策略 AST、现行 NAV 配置与独立日历生成精确路由、用途、预热/执行日期及确认/结算日历范围。
  - 启动合同：现有 NAV RunConfig/Manifest Schema、策略 lookback 和申赎执行模型；本叶不依赖真实来源权限。
  - 上下文入口：`backtest-nav-freeze-v3.ts`、`backtest-dependency-price.ts`、`backtest-indicators.ts`。
  - 写集：Backtest 内独立 NAV 纯计划与日期核验、既有信号引用收集函数的单向复用、定向测试及所属 Spec/Task/证据。
  - 完成条件：独立日历确定预热实际起点及尾部交易日预算；无执行估值日、预热不足、日历无效/未来可见、身份不符及未支持组合拒绝；计划不宣称净值或 Provider 已就绪。
  - 验证：NAV 计划定向及既有场内依赖计划回归、Server 包级/typecheck/build、定向样式与模块边界门禁。N1.2/N2 负责产物绑定和实际冻结。
  - 执行记录：2026-09-30 纯计划与独立日期核验完成；定向 27/27、Server 全包 1742 通过/83 跳过、typecheck/build、ESLint/Prettier 与模块边界通过。首版限定同基金 CN/CNY 日频，计划不代表真实来源就绪；见[依赖计划证据](../../tasks/evidence/2026-09-30-e01-n1-1-nav-input-plan.md)。本叶停止，下一步 N1.2。
- [x] E01-N1.2 冻结产物与读取校验：NAV 行结构、来源原文引用、摘要及计划覆盖绑定；拒绝缺净值、篡改、旧格式和错误产物。
  - 启动依赖：N1.1 已完成；现行 NAV Schema、LocalArtifactStore 与 canonical 摘要已可复用。
  - 写集：现行 NAV Manifest 的上下文产物合同，Backtest 独立 NAV 冻结读写/校验适配器，定向测试、所属 Spec/Task/证据；不改变创建入口或现行场内 Runner。
  - 完成条件：真实本地 Parquet 写入与离线读取可复核计划、事实和原文摘要；最终发布不可覆盖，幂等输入一致；缺失/篡改/旧格式/未来事实拒绝。
  - 验证：Schemas/Server 定向与包级、类型/build、边界门禁；测试使用受控来源证据和真实文件存储，不代表真实 Provider 或目标 Worker 通过。
  - 执行记录：2026-09-30 完成真实 Parquet 冻结、上下文/来源原文绑定与离线计划复核；NAV 定向 40/40、Schema 定向 5/5、Schemas 包级 556/556、Server 包级 1766 通过/83 跳过，类型/build、ESLint/Prettier 和模块边界通过。见[冻结读写证据](../../tasks/evidence/2026-09-30-e01-n1-2-nav-freeze-store.md)。本叶停止，下一步 N1.3。
- [x] E01-N1.3 Domain 输入适配：将当前冻结净值转换为既有申赎内核事实，验证金额、身份、日期、可见性与费用模型映射。
  - 启动依赖：N1.1/N1.2 已完成，当前冻结读回与 CnNavSimulation 合同可用。
  - 写集：Backtest 独立 Domain 输入和日期日历适配器、定向测试及所属 Spec/Task/证据；不接通创建、Worker 或旧 NAV 执行入口。
  - 完成条件：冻结输入复核后保留十进制现金/净值及源身份、日期与时间；处理日历不补齐范围外日期或交易时段；完整费用模型消费有申购/赎回内核证据；微秒可见性负例通过。
  - 验证：适配器定向、既有 Domain NAV 回归、Server 包级/typecheck/build、样式和模块边界。真实来源、事件编排和目标运行态由 N2–N4 验收。
  - 执行记录：2026-09-30 完成冻结输入到 Domain 的映射、显式处理日期日历和微秒可见性查询；NAV 定向 51/51、既有 Domain 回归 9/9、Server 包级 1777 通过/83 跳过，类型/build、样式和模块边界通过。真实 Parquet 读回后申购/赎回费用、份额及现金核验通过，见[适配证据](../../tasks/evidence/2026-09-30-e01-n1-3-nav-domain-input.md)。本叶停止，下一阶段 N2。

N3 接线检查已完成：按微秒可见性查询生成净值事件，使用执行日期限制预热交易，独立编排确认/结算时刻。`expectedCutoffSchedule` 已按冻结模型 `atOrAfterNextTradingDay` 修复等于截止时间行为，截止前/等于/截止后均有定向回归；最终 Worker、队列与目标验收另见 N3/N4 证据。

E01-N2 涉及来源、准备、当前状态机及数据库，按以下叶推进；父任务在全部验收前保持未勾选：

- [x] E01-N2.1 来源与入口核查：核对现有净值来源语义、精确路由状态、真实样本及准备/创建阻断，划分后续责任。
  - 启动依赖：N1 已完成；当前 DSA/Server 源码和目标只读 HTTP 可用。
  - 写集：所属 Spec/Task/证据。读取相邻 DSA、运行容器和真实来源样本，不修改 Policy、准入、数据库或应用代码。
  - 完成条件：区分显示净值、真实发布时间证据、路由准入与基金日历，记录精确入口和实测结果，给出独立后续门禁。
  - 执行记录：2026-09-30 完成核查；110011.OF 的真实东方财富样本返回净值，但无明确逐条发布时间字段；目标 DSA 请求返回 503/no_eligible_provider，revision=31 无净值历史路由，完整目录两条候选均 not_admitted。见[来源核查证据](../../tasks/evidence/2026-09-30-e01-n2-1-nav-source-inventory.md)。本叶停止，下一步 N2.2。
- [x] E01-N2.2 真实来源与时间规则决策：核验净值原文、独立基金日期来源及 QDII 披露规则，依据用户选择建立显式研究时间假设；严格证据与研究假设分开冻结。
  - 上下文入口：Spec §3、N2.1 证据、DSA 净值适配器、N1 publicationEvidence 和 NavPlanningCalendar。
  - 写集：来源只读取证、所属 Spec/Task/证据；不改变 Policy 或写 Run，不以抓取时刻、估值日或市场日历默认值替代缺失证据。
  - 验证与停止点：核验实际接口正负例和官方规则；时间语义调整先完成 Spec 决策。本叶取证与决策完成后停止，不代替完整日期生产、Schema 实现或运行验收。
  - 执行记录：2026-09-30 用户确认一般 T+1 可见并要求查 QDII；最新官方文件核验 110011 通常 T+1、118001 两个工作日内披露，工作日均按沪深交易日计数。官方净值仍无实际发布时间，状态接口周六负例说明不能直接作为完整处理日历。已在 Spec 建立严格/研究模式及日终可见边界，见[取证与决策证据](../../tasks/evidence/2026-09-30-e01-n2-2-nav-publication-calendar-research.md)。下一步 N2.3.1。
- [x] E01-N2.3 净值证据生产：精确请求/响应合同与 DSA 生产者完成，已统一验证来源、鉴权接口、现行冻结与离线读回；Server 准备和目标运行态由后续阶段继续验收。
  - [x] E01-N2.3.1 可见性与日期合同：扩展 Schema 与 N1 冻结/Domain 校验，区分真实发布证据和研究假设，绑定延迟、日终边界、规则/原文/日历摘要；分别声明估值、处理、披露工作日及尾部预算，不能伪造 sourcePublishedAt。
    - 启动依赖：N1 严格合同已完成，N2.2 来源样本与用户决策已就绪；以 Spec §「NAV 研究可见性模式」为输入。
    - 写集：Schemas NAV 合同、Backtest NAV 计划/校验/适配器、定向测试与所属文档；不修改 DSA 运行、Policy、创建或 Worker。
    - 完成条件：严格与研究两种现行格式均能冻结读回；普通 T+1 和已核验 QDII 延迟显式绑定，周末/节假日按声明日历推算；缺规则/日期、模式不符、摘要篡改及未来事实拒绝；读取结果保留研究模式披露信息。
    - 验证：Schemas/Server 定向、现有严格模式回归、类型/build 和边界；实际生产者继续由 N2.3.2 验收。修改输入后重新验证受影响的 N1 代码与证据，不用此前严格测试代表研究模式通过。
    - 执行记录：2026-09-30 已完成显式严格/研究模式、规则与采集时间绑定、三类日期及独立尾部预算，真实 Parquet 冻结/离线读回保留研究披露信息。NAV 定向 69 项、Schemas 全包 565 项、Server 降并发全包 1795 项通过（83 项跳过），类型/build、边界、Lint/格式通过。首次默认并发的两项既有 Parquet 超时及重验记录见[合同验收证据](../../tasks/evidence/2026-09-30-e01-n2-3-1-nav-visibility-contract.md)。父项保持未勾选，下一叶 N2.3.2。
  - [x] E01-N2.3.2 DSA 精确净值生产：从精确来源冻结十进制净值原文与修订，依据绑定的基金规则和显式研究日期生产可见性证据；真实来源正例与缺失/未来/覆盖不足负例配对完成。严格模式及严格 PIT 准入继续保留独立证据要求。
    - 粒度检查：原文读取、规则/日期与精确 API 三个独立验收面均已完成；原完成条件及模式边界全部保留。
    - [x] E01-N2.3.2.1 精确来源原文读取：扩展现有东方财富分页 Reader，整批返回未经浮点转换的十进制净值、全部页原文/摘要、逐条来源记录、真实采集时间及 Reader 修订；沿用 TLS、总量、超时及无部分成功约束，并验证真实来源。
      - 启动依赖：N2.3.1 合同与 N2.2 来源规则核验已完成。
      - 写集：相邻 DSA `data_provider/eastmoney_fund_nav.py`、原文证据类型与定向测试、DSA 专题文档/变更日志、所属 Spec/Task/证据；既有显示净值入口继续消费同一 Reader。
      - 验证：分页/十进制/日期/原文/预算负例、既有显示入口回归、Python 静态门禁、110011 与 118001 真实只读样本；不变更 Policy、准入、Server 创建或部署。
      - 停止点：原文读取完成；不把来源分页总量当作基金预期日期完整性、历史修订或严格 PIT 证明。
      - 执行记录：2026-09-30 生产 Reader 与不可变原文证据已完成，相关 9 文件回归 133 项、Python 编译及完整 flake8 通过；110011 与 118001 真实首次读取分别 4410/3900 条、5/4 页，逐页/逐条摘要核验通过。源端十进制字符串原样保留，未改准入或部署。见[原文 Reader 验收证据](../../tasks/evidence/2026-09-30-e01-n2-3-2-1-nav-raw-source-reader.md)。本叶停止，下一叶 N2.3.2.2。
    - [x] E01-N2.3.2.2 研究规则与三类日期生产：绑定普通/QDII 具体规则原文与适用范围；严格模式保留独立日期要求，研究模式按已确认的来源净值日期/XSHG 交集生产，缺日不交易，预算不足拒绝。
      - 启动依赖：N2.3.1 字段合同已完成；消费 N2.3.2.1 原文证据。严格模式保留独立日期要求，研究模式采用 2026-10-01 已确认的净值日期构造假设。
      - 粒度检查：研究规则与日期生产分别交付；日期子叶保留非交易日估值、原文核验及预算门禁。真实暂停、限购与渠道差异按用户确认范围不纳入本版研究模拟，不能声明其完整验收通过。
      - [x] E01-N2.3.2.2.1 研究规则生产与原文核验：普通基金消费显式研究默认配置；已核查 QDII 使用基金级版本与官方 PDF 字节摘要，生成现行规则记录及原文，绑定请求适用区间、真实配置/采集时刻。未知 QDII、区间不足、PDF 变化、未来或缺失原文拒绝。
        - 写集：DSA 规则配置、官方文档读取与证据类型、定向测试、主仓现行规则 Schema 交叉验证及所属文档；不改变日期集合、Policy、准入、创建或部署。
        - 完成条件：110011 T+1、118001 T+2 官方 PDF 通过实时字节核验；普通 T+1 是显式用户研究默认且不冒充基金披露文件；现行 Schema 与原文摘要一致，正负例及 Python 门禁通过。
        - 停止点：规则生产完成后停止；未知基金类型不由规则生产器猜测，精确生产入口负责消费标的身份核验，完整日历交给下一子叶。
        - 执行记录：2026-09-30 规则生产与不可变证据完成，新增 46 项测试及相关 10 文件 179 项回归、Python 编译与完整 flake8、主仓边界门禁通过。110011 T+1、118001 T+2 真实官方 PDF 字节与审查摘要相符；两条真实规则及受控普通默认通过现行 Schema、Server 规则校验与原文摘要核验。未改变准入或部署，见[规则生产验收证据](../../tasks/evidence/2026-09-30-e01-n2-3-2-2-1-nav-research-rule-producer.md)。下一叶 N2.3.2.2.2；父任务保持未完成。
      - [x] E01-N2.3.2.2.2 研究三类日期生产与预算验收：消费精确来源快照、研究规则、显式用户决策及已核验 XSHG 发布制品；估值日取实际净值日期、处理日取与 XSHG 的交集、披露工作日取 XSHG，缺日不交易，绑定原文和假设摘要。核验非交易日估值、预热/尾部不足、篡改、规则范围及未来证据拒绝；本版不模拟真实暂停、限购及渠道差异。
        - 启动依赖：N2.3.2.2.1 规则与 N2.3.2.1 原文就绪；2026-10-01 用户已确认共同研究口径，按对应 Spec 实施。
        - 写集：DSA 日期生产与来源/日历核验 helper、定向测试、中文专题/变更记录；主仓 Spec/Task/证据及严格模式拒绝研究日期的守卫与定向测试。真实 110011/118001 与现行 Server 日期计划交叉验证；不改 Policy、API、准入、数据库、Worker 或部署。
        - 停止点：生产器及当前日期消费合同验证完成；来源 API 与假设证据冻结接线由 N2.3.2.3、N2.4 等后续叶完成。
        - 执行记录：2026-10-01 Spec 先按用户确认口径更新，日期生产及严格模式隔离完成。DSA 新增 28 项、相关 11 文件共 207 项回归及 Python 静态检查通过；Server NAV 首轮四文件 73 项、最终计划文件 21 项，类型检查/构建、限定 lint/格式、边界检查通过。真实 110011/118001 各取得原文、规则和日历制品，4 条预热与 4 个尾部处理日均与当前 Server 计划一致；严格模式拒绝同一证据。见[研究日期生产验收](../../tasks/evidence/2026-10-01-e01-n2-3-2-2-2-nav-research-calendar-producer.md)。本叶停止，下一叶 N2.3.2.3；上游复核中原等待决策已由此次用户确认解决。
        - 上游复核：2026-09-30 两基金 8 次真实请求均成功；官方仅给有限查询日期、方向/渠道状态与不完整暂停安排。118001 暂停文件为空，但 09-07 状态实际为暂停、09-08 为开放；未取得独立完整估值日和完整历史/尾部处理日覆盖。按用户要求先询问研究范围与缺失处理口径，决定前不改完整合同、不勾选；见[上游能力复核](../../tasks/evidence/2026-09-30-e01-n2-2-nav-publication-calendar-research.md)。
    - [x] E01-N2.3.2.3 精确生产接口与来源验收：接通选定 RouteKey/RouteTarget 与显式可见性模式，绑定来源修订、原文、规则及日期证据，核验精确准入并返回现行冻结输入；真实来源正例与缺失/未来/覆盖不足负例配对。
      - 启动依赖：N2.3.2.1 原文、N2.3.2.2 规则/日历就绪；严格 PIT 准入保持独立证据门禁。
      - 执行包：写集为 Schemas 精确 NAV 请求/响应、共享日期及领域路由准入 Schema（事件准入复用后收窄能力）、DSA 基金身份 Reader、NAV 准入/生产/证据投影、独立 API router 与注册、精确原文 Reader 修订、对应测试与中文文档；Server 仅调整共享日期合同引用。只允许首个 `efinance/eastmoney` 原文适配器，不拓展其他净值源，不修改目标 Policy/Admission、业务 Run、数据库或 Worker。
      - 验证安排：按用户要求，N2.3 全部实现完成后统一执行定向→包级/构建→门禁→真实来源及隔离鉴权 HTTP/冻结接缝验收；中途不运行测试。目标部署继续属于 N4。
      - 研究消费义务：核验基金身份，随来源返回日期、假设证据和用户决策原文，重新核对日期版本/引用的假设摘要及来源、规则、日历关联；N2.4/5 冻结消费不得只信任 `coverage.complete`，N3/4 结果须披露暂停、限购及渠道差异未模拟的限制。
      - 执行记录：2026-10-01 精确生产 API、来源身份和读取前后准入/安全守卫完成，所有实现及用例写完后统一测试。DSA 相关 220 项、Schemas 全包首轮 576 项、Server 全包 1800 项通过（83 项跳过）；修正真实冻结发现的研究规则引用错配后，受影响 DSA 135 项、Schemas 来源/事件 40 项及后补引用负例、最终 NAV 74 项复验通过，类型/构建与门禁通过。最终生产代码直连 161725、110011、118001，分别取得 2764/4410/3900 条、3/5/4 页；隔离 SQLite 和鉴权 HTTP、现行 Schema、真实 Parquet 冻结与离线读回全部通过。见[精确生产与统一验收](../../tasks/evidence/2026-10-01-e01-n2-3-2-3-nav-exact-production.md)。N2.3 及父生产叶已勾选，本叶停止，下一叶 N2.4；目标部署仍属于 N4。
- [x] E01-N2.4 精确 Reader 与准备：在 N2.3 合同就绪后建立 Server 精确净值 Reader 和 NAV 配置准备，核对 Desired/Effective/Catalog/Admission，绑定完整 N1 计划；拒绝缺路由、撤销、来源不符和不完整事实。
  - 粒度复核：精确 DSA 证据客户端、Market 路由 Reader 与 Backtest 配置准备属于三个独立消费边界，按以下子叶实施；父项在全部完成前保持未勾选。
  - [x] E01-N2.4.1 精确证据客户端：Server DSA 边界调用已就绪的 NAV API，单次请求、鉴权、有界读取，绑定固定请求身份及来源；重新核验原文页、规范/原生记录、基金类型、规则文件、假设和日期摘要关联，拒绝篡改、来源错配、未来或覆盖不足证据。
    - 输入：Spec §「NAV 研究可见性模式」、N2.3 请求/响应 Schema、DSA 真实来源信封、现行 DsaClient/协议错误类型与 N1 冻结合同。
    - 写集：`apps/server/src/integration/dsa/dsa-nav-*`、DsaModule 注册、定向测试及所属 Spec/Task/证据；不扩大既有 DsaClient，不改 Policy/Admission、数据库、业务 Run、Worker、部署或准备 API。
    - 验证：受控完整信封正例与逐项错配/篡改/缺失/未来负例、鉴权/单次请求/流量预算/错误关联，真实已采集原文经客户端与现行冻结离线复验；类型/build、限定 lint/格式与边界门禁。完成后停止，下一叶 N2.4.2。
    - 执行记录：2026-10-01 新增独立 DsaNavClient 与分职责原文核验，DsaModule 实际注册/导出通过；定向 28 项、相邻 5 文件 92 项、类型/build、限定 lint/格式、复杂度/函数尺寸与边界门禁通过。复用 N2.3 三份真实来源信封，经实际隔离鉴权 HTTP、完整原文校验、Parquet 冻结与离线读回全部通过；未重新拉取上游或部署，不代替当前路由/准备/业务 Run 验收。见[客户端验收证据](../../tasks/evidence/2026-10-01-e01-n2-4-1-nav-evidence-client.md)。现有默认 5 秒请求预算须在后续实时接线时核对，本轮未改目标配置。当前叶完成，N2.4 父项未完成，下一叶 N2.4.2。
  - [x] E01-N2.4.2 精确路由 Reader：消费 N2.4.1，在 Market 中核对 Server Desired 与 DSA Effective/Catalog，固定目标与顺序，读取前后复核状态，返回完整精确来源与准入；缺路由、修订变更、撤销、非选定来源拒绝，保留一次来源读取。
    - 启动依赖：N2.4.1；执行前展开 Market 所属模块与前后状态门禁用例，核对实时来源与客户端请求预算，不改业务写入。
    - 执行包：写集为 Market NAV 路由状态纯函数、独立 Reader、MarketModule 注册/导出、定向测试与中文证据。比较目标路由完整主备顺序、资格及目录状态，忽略目录生成时间；按首个合格且就绪目标固定一次来源读取，当前适配器不支持该目标时拒绝。读取后复核同一状态，并检查响应身份、准入范围及当前有效期，不引入冻结、数据库或 Run 编排。
    - 验证：路由缺失、禁用、未应用、陈旧修订、主备错序、目录不完整、读取期间撤销/修订改变、响应来源错配及准入失效负例；正常读取保留完整信封且仅调用一次来源。隔离 HTTP 接缝核对实际源证据与配置请求预算，随后类型/build、格式和边界门禁；目标默认预算与部署留给 N4。
    - 执行记录：2026-10-01 独立 MarketNavReaderV3 与路由状态函数、MarketModule 注册/导出完成；23 项定向及客户端相邻合计 51 项、类型/build、限定 lint/格式、复杂度/函数尺寸与边界门禁通过。隔离真实 DSA Control/NAV HTTP 与实际上游读取三个基金全部通过，每次单次来源调用、10 条事实，普通/T+1、110011/T+1、118001/T+2；耗时 14.3–16.0 秒，隔离请求预算 120 秒。目标默认 5 秒未修改，N4 必须调整后再做目标验收。见[精确 Reader 验收证据](../../tasks/evidence/2026-10-01-e01-n2-4-2-nav-exact-reader.md)。当前叶完成，N2.4 父项未完成，下一叶 N2.4.3。
  - [x] E01-N2.4.3 NAV 配置准备：消费 N2.4.2，将显式普通/QDII 规则及日期预算与完整 N1 输入计划、当前策略/配置摘要绑定，采集后确定冻结时点，返回 NAV 专属准备结果；不投递业务 Run。
    - 启动依赖：N2.4.2；执行前建立准备请求/响应、冻结时点和就绪凭据合同及所属服务/API，用受控与真实来源接缝验收；N2.5/6 继续写入和数据库验收。
    - 粒度检查：合同与纯准备核验、策略版本读取/API 是独立交付面，拆为下面两叶；N2.4.3 父项保持未完成，原有义务不转移到 TODO。
    - [x] E01-N2.4.3.1 准备合同与输入核验：建立显式研究意图 Schema，以及消费 Market NAV Reader 的纯准备函数；复用 N1 策略支持条件、预热/结算预算及完整计划，采集后确定冻结时点，绑定策略/意图/配置/计划/来源/路由/准入摘要，返回内部完整证据。
      - 依赖：N1、N2.4.2；写集为 Schemas NAV 意图与导出、Backtest NAV 预算及支持条件复用、独立纯准备/事实核验、定向测试及中文证据。不得接入 Prisma、HTTP controller、业务写入或投递。
      - 验证：显式研究决策、普通/QDII 区分、完整策略/日期预算、来源单次调用、采集后的冻结时点、各项摘要；未来时间、过期准入、错配策略/规则、缺预热/结算/披露日期、缺事实或重复原文负例；真实已采集来源经现行 Parquet 冻结及离线读回。随后受影响类型/build、格式与边界门禁。
      - 停止条件：本叶通过后停止；不将纯准备结果宣称为公开创建凭据或部署就绪。
      - 执行记录：2026-10-01 独立 NAV 意图 Schema、预算/支持条件复用、纯准备与完整事实核验完成。定向 28 项及相邻 5 文件共 114 项通过，Schemas 类型/build、Server 类型/build、限定 lint/格式、复杂度/函数尺寸与边界门禁通过。三份已采集真实来源经隔离鉴权 HTTP、当前客户端、完整准备及现行 Parquet 冻结/读回通过；使用受控历史时钟和请求关联元数据，来源原文/记录/真实采集时刻不变，未重新读取上游或验证服务/API。见[准备合同验收证据](../../tasks/evidence/2026-10-01-e01-n2-4-3-1-nav-preparation-contract.md)。N2.4.3/N2.4 父项保持未完成，下一叶 N2.4.3.2。
    - [x] E01-N2.4.3.2 策略版本服务与准备 API：消费 N2.4.3.1，由 Backtest 服务读取当前策略版本，建立 NAV 专属公开准备请求/响应、诊断与模块接线；通过实际服务/API 与真实 DSA 来源接缝验证完整准备结果及篡改/失败场景。
      - 依赖：N2.4.3.1；启动前展开服务/API 合同、错误映射、证据保管及 N2.5 消费入口。目标部署仍由 N4 验收。
      - 执行包：写集为 Schemas 公开 NAV 准备结果、Backtest 独立 service/controller/结果投影与诊断、BacktestModule 接线、定向 HTTP 测试及证据。端点为 `POST /api/v1/backtests/run-config/nav/prepare`；请求使用 N2.4.3.1 合同，来源仍只经 Market Reader。服务提供内部完整证据入口，HTTP 只返回配置、计划摘要、精确来源及内容绑定；本叶不保管跨请求持久证据、不返回可创建 Run 的持久引用，N2.5 负责证据持久化和创建守卫。
      - 验证：实际 Nest HTTP 与全局错误过滤器；非法请求 400、策略缺失 404、策略格式/版本错误 422、采集期间版本变化阻断，稳定来源错误诊断和未知错误 500；成功投影不得暴露来源原文或产生业务写入。隔离实际 DSA Control/NAV HTTP 和真实三基金来源完成服务/API 正例，核对请求预算和最终时点；目标配置/部署不修改。最后受影响类型/build、格式、边界与模块注册门禁。
      - 执行记录：2026-10-01 独立 NAV 准备 service/controller、公开结果 Schema、内部完整证据入口、前后策略版本复核、诊断及模块接线完成。实际 Nest HTTP 定向 27 项、相邻 8 文件共 184 项、Schemas 类型/build、Server 类型/build、限定 lint/格式、复杂度/函数尺寸及边界/模块注册门禁通过。实际隔离 DSA Control/NAV HTTP 与真实上游三基金，经完整准备 API 和同份证据的 Parquet 冻结读回全部通过，每基金一次来源读取和两次策略版本读取；耗时约 14.3/24.0/18.4 秒，隔离预算 120 秒。策略存储为受控 Prisma 查询桩，不代表目标数据库验收；未写业务 Run、返回持久创建引用或修改目标预算。见[服务与 API 验收证据](../../tasks/evidence/2026-10-01-e01-n2-4-3-2-nav-preparation-api.md)。N2.4.3/N2.4 组内义务闭合，N2 整体仍未完成；下一组 N2.5，启动前细分证据持久化、创建守卫/冻结关联与受执行能力约束的投递。
- [x] E01-N2.5 当前 Run 写入与冻结关联：在 N2.4 合同就绪后接通 NAV 配置、创建守卫与当前状态机持久化；公开投递依赖 N3 最小 NAV 执行分支就绪。保留现有状态/attempt 原子更新约束，禁止将 NAV 投递给仅支持场内的 Worker。
  - [x] N2.5.1 证据持久化：新增准备记录，保存原请求与完整证据、摘要、策略版本、有效期和唯一 Run 消费关联；准备 API 返回持久引用。载入时重做准备证明，拒绝篡改、过期及来源关联不一致。
  - [x] N2.5.2 创建与冻结：独立 NAV 创建入口复核当前策略、路由与准入有效期，沿用原冻结时间与原文；锁定准备记录和策略版本，原子写入 V3 Run 与唯一消费关联，处理重复提交/幂等冲突。冻结失败落入失败终态，数据库事务失败不得留下成功关联。
  - [x] N2.5.3 执行边界与读取：N3 就绪前，已冻结 Run 记录为 `failed/NAV_RUNNER_UNAVAILABLE`，保留冻结关联；NAV 创建/读取使用完整合同，创建不投递且队列拒绝未就绪 NAV。完成定向测试、类型/build 和工程门禁。用户指定 N3 在另处处理，Worker 的 NAV 执行接线与能力启用由 N3 独立完成。
- [x] E01-N2.6 隔离 PostgreSQL 验收：N2.5 写入合同就绪后验证准备/冻结证据关联、篡改拒绝、失败状态与原子写入；N3/N4 独立验证 Worker 和目标运行态。
  - [x] N2.6.1 在独立 PostgreSQL 执行全部 migration，核对结构 head、预期表与应用角色权限。
  - [x] N2.6.2 实际 Prisma 与 Parquet 验证持久准备、重启读取、冻结关联、篡改/陈旧/过期拒绝、失败终态、并发幂等、唯一消费和事务回滚；记录证据并清理隔离资源。
  - 执行包（2026-10-01）：主 Agent 负责合同、共享模块接线与数据库验收；证据工作包负责独立准备存储、模型/migration 和测试；创建工作包负责独立 NAV Run 服务/API/合同、队列拒绝边界和测试。已有无关变更保留，目标部署及真实执行由 N3/N4 验收。
  - 完成记录（2026-10-01）：持久准备引用、当前策略/路由守卫、实际 Parquet 冻结及当前 V3 Run 原子消费关联已接通，原冻结时点和原文保持绑定。最终复核补齐已知文件失败终态、未知错误透传、冻结来源/上下文/计划与准备证据的完全一致校验、锁内幂等竞态及非法 UUID 拒绝。151 项定向与相邻回归、收据补强 9 项、完整 Server 类型/build、Schemas 类型/build、限定 lint/格式/复杂度、边界、migration matrix 和 runtime 数据库输入门禁通过。隔离 PostgreSQL 补强后 10/10 通过，全部 25 条 migration、71 张表及实际应用角色权限/结构门禁通过；新 Prisma/服务重读、真实过期与历史幂等、篡改拒绝、并发唯一消费及事务回滚均验收，隔离资源已清理。见[持久化与数据库验收证据](../../tasks/evidence/2026-10-01-e01-n2-5-6-nav-persistence.md)。N2 本地与隔离阶段闭合；N3 投递执行与 N4 目标运行态继续独立验收，本轮没有更新目标开发数据库或应用容器。

依赖约束：N3 的离线执行分支从 N1 冻结合同启动，不等待 N2 整组；N3 的 Worker 闭环再消费 N2.5 合同，避免创建投递就绪条件与执行开发形成依赖环。未就绪的后续叶只记录边界，启动前按实际合同展开执行包。

- [x] E01-I1 场内历史可交易性依赖：原 Run 因固定 `adjustment=none` 与精确 qfq 准入不符而失败；已完成来源核查、日级合同、DSA 生产、Server 冻结和 Runner 消费。目标新 Run `4a8694de-f8b4-4d47-b0db-5ec16b29666e` 经独立 Worker 成功，冻结重放、缺路由/撤销拒绝及浏览器客户端验收通过。见[目标验收证据](../../tasks/evidence/2026-09-30-e01-i1-6-target-acceptance.md)。
  - [x] E01-I1.1 来源核查：用已知停牌标的 `159515.SZ` 验证 HiThink 响应缺日，并核对 `159516.SZ` 目标 `qfq` 窗口；确定缺 Bar 日按不可交易假设处理的边界。见[来源探针证据](../../tasks/evidence/2026-09-30-e01-i1-1-hithink-missing-bar-demo.md)。
  - [x] E01-I1.2 日级合同：Spec §8.1 明确缺 Bar 假设的适用条件和 PIT 边界；`BacktestDailyTradabilityEvidenceV3` 绑定已上市窗口、日历、精确 RouteKey/RouteTarget、来源修订、响应摘要及采集时刻，逐日区分 `observed-traded` 与 `assumed-untradable-no-bar`。本叶建立合同，生产者随后由 I1.3 接通，Server/Runner 消费仍待后续叶。验证：`pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-daily-tradability.test.ts` 3/3、`typecheck` 通过、包级 `test` 553/553、`build` 通过（2026-09-30）。
  - [x] E01-I1.3 DSA 来源与分类：首个已准入 HiThink ETF 生产者读取精确日线及独立日历/上市事实，对完整来源响应逐日分类并返回合同证据；其他缺元数据来源不可用。请求失败、零量 Bar、未准入及来源不符均拒绝。见[本地生产者验收](../../tasks/evidence/2026-09-30-e01-i1-3-daily-tradability-producer.md)；目标运行态仍由 I1.6 验收。
    - [x] E01-I1.3.1 精确来源读取：DSA `instrument-facts` 可显式接收日线口径及 RouteTarget，调用现行 `execute_market_bars_v3` 精确准入入口；目标 ETF `qfq` 不再被固定改为 `none`，缺路由、来源不符或 fallback 保持不可用。DSA 定向 41/41 通过（2026-09-30）；Server 参数接线随后由 I1.4 完成，目标 Run 仍待 I1.6 验收。
    - [x] E01-I1.3.2 缺 Bar 来源解析：HiThink ETF 适配器显式 `allow_missing_sessions=True` 时可返回有效 Bar、缺失会话、覆盖摘要与响应指纹；默认完整价格读取仍拒绝缺日，请求、分页、日期和量价核验保留。DSA 来源、重叠、多窗口、目标准入与 Market V3 定向测试 92/92 通过（2026-09-30）；生产响应接线随后由 I1.3.3 完成。
    - [x] E01-I1.3.3 日级证据生产：接通内部稀疏读取、独立范围事实与分类函数，`instrument-facts` 输出 `historicalTradability`；共享响应 Schema 保留并校验新字段。DSA 定向 122/122、Schemas 包级 554/554、类型检查与构建通过（2026-09-30）。Server 核验/冻结随后由 I1.4 完成；Runner 和目标部署继续独立验收。
  - [x] E01-I1.4 Server 核验与冻结：请求绑定实际选中的日线口径及来源目标，核对逐日证据、冻结 Bar 日期、独立日历/上市事实及 `dataAsOf`，写入证券事实产物并在离线重放时重新核验；缺失、篡改、未来事实、来源撤销与无历史可见性资格的 PIT 请求拒绝。Server 包级 1715 通过、83 跳过；Schemas 555/555、类型检查与构建通过；隔离 PostgreSQL 24 项 migration 下 3/3 通过。见[核验与冻结证据](../../tasks/evidence/2026-09-30-e01-i1-4-server-tradability-freeze.md)。
  - [x] E01-I1.5 行情窗口与 Runner 消费：接通有日级证据的稀疏行情获取/冻结路径，按冻结状态跳过假设不可交易日，不生成价格或成交，保持日历、预热和经济结果一致；见[实施与验收证据](../../tasks/evidence/2026-09-30-e01-i1-5-sparse-window-runner.md)。
    - [x] E01-I1.5.1 行情合同与来源：固定来源 CN 日线显式请求缺日假设模式；单窗/多窗响应保留逐窗日级证据与原始来源摘要，缺证据、冲突或不完整响应拒绝；默认市场读取保持严格完整窗口。Schemas 与 DSA 定向通过。
    - [x] E01-I1.5.2 Server 冻结消费：复用本次行情中的日级证据，单独读取身份事实并保留原始响应；绑定预热/执行范围，子窗口只裁剪既有状态，离线重放重建相同证据与校验。准备、Snapshot、窗口裁剪定向通过。
    - [x] E01-I1.5.3 Runner 执行：只对实际已交易 Bar 决策/成交，缺日保持独立交易日历身份，估值按冻结估值策略读取上一条可用价格；覆盖首日、末日、预热不足与无实际执行 Bar。Domain 与 Runner 定向通过。
    - [x] E01-I1.5.4 集成验收：固定稀疏输入验证准备、冻结与 Worker 终态、缺日无成交、经济结果与断网重放一致；包级/构建门禁与隔离 PostgreSQL/Redis/生产 Worker 通过。真实来源和目标部署由 I1.6 验收。
  - [x] E01-I1.6 目标验收：用户完成更新后，核对 Server/Worker/DSA 当前关键代码同源，真实目标准备→创建→Worker 终态、缺路由与撤销负例，以及浏览器客户端业务验收通过。见[完整证据](../../tasks/evidence/2026-09-30-e01-i1-6-target-acceptance.md)。
    - [x] E01-I1.6.1 同源部署：此前官方 `update.sh all` 因下载和磁盘不足受阻；用户完成更新后，新镜像和五个健康服务已核对，关键代码摘要一致，24 项 migration head、59 个 model/11 个 raw-owned 表与应用权限完整；保留既有数据。本轮未取得用户更新进程退出日志，未重复构建。
      - [x] E01-I1.6.1a 构建依赖范围修复：主仓 Dockerfile、infra 精确映射与合同测试完成，过滤安装保留冻结 lockfile；用户更新后的 Server/Worker 新镜像成功执行本次真实 Run。Docker 当前 32GB、约 20GB 可用，不再阻断验收。
    - [x] E01-I1.6.2 真实回测：既有精确 HiThink 准入范围内 prepared/ready，新 Run 第一次 Worker 执行 succeeded/complete；22 笔成交、59 个估值点；禁止在线 fetch 的冻结重放校验值 `733135b633176f64` 一致。真实窗口 68 个状态均为 observed-traded，缺日场景沿用 I1.1/I1.5 证据。
    - [x] E01-I1.6.3 目标负例：缺路由与临时撤销在生产路由层明确 NO_ELIGIBLE_PROVIDER，HTTP 按现行合同 503/upstream_failure 拒绝；原准入行完整摘要恢复一致，成功结果和冻结重放不变。
    - [x] E01-I1.6.4 客户端验收：实际浏览器界面核对同一 Run 已完成、22 笔成交、11 笔平仓交易、59 个日历估值点及首末日权益。未测试 Electron 专属能力，本叶没有原生桥接改动。

E02 按 Data、Provider 消费、Control/缓存/派生拆分；各叶完成后再收口父项：

| 状态 / 子任务 | 完成断言 | 验证 |
| --- | --- | --- |
| [x] E02-a Data 读取边界 | Bar/Chart/Event 与回测依赖使用当前 Data；非 Bar 上游和缓存同样拒绝旧版本/错误标的；无版本 FundNavPoint 不补版本回读；旧 Server 路径拒绝。 | Data 配对定向、Server2019项、目标3个旧Server路径、实际DsaClient解析及编译服务故障下零投影读取通过，见 [Data 配对证据](../../tasks/evidence/2026-10-02-e04-a-e02-data-completion.md)。 |
| [x] E02-b Provider 消费配对 | Server Registry/配置/测试/移除/OAuth 与 E04-b 同一当前合同；凭证修订、撤销、晚到和来源绑定有明确边界。 | [当前生产与消费证据](../../tasks/evidence/2026-10-02-e04-b-e02-provider-completion.md)；客户端真实交互归 U01。 |
| [x] E02-c Control、缓存与派生 | Policy/Catalog 的修订、来源准入、缓存并发与派生证据消费收口；旧 cursor/source alias/无来源或隐式事实回退不得污染现行读取。 | [配对定向、隔离故障及目标验收](../../tasks/evidence/2026-10-02-e04-c-e02-c-parent-completion.md)，E02 父项已对账完成。 |

E04 的 Control/Provider/Catalog 继续分叶验收，不能用 Data 路由与握手通过代替配置和目录消费：

| 状态 / 子任务 | 完成断言 | 验证 |
| --- | --- | --- |
| [x] E04-a Data 路由 | 当前 Market、回测依赖事实、事件和能力端点只有一个可调用合同；旧 URL 不返回业务结果。 | Data 定向90项、DSA官方离线7689项；目标56个旧URL、13个鉴权、5个旧请求体拒绝及实际DsaClient当前解析通过，见 [Data 配对收口证据](../../tasks/evidence/2026-10-02-e04-a-e02-data-completion.md)。 |
| [x] E04-b Provider 配置与状态 | Registry、配置、只读测试、移除和 OAuth 的生产请求/响应使用同一当前合同；凭证仍只写，修订和来源绑定保持；旧 V1/V2 信封拒绝且不更改 SQLite 状态。 | [全部 13 个 Provider、凭证与竞态、隔离 HTTP/SQLite、目标 Server→DSA](../../tasks/evidence/2026-10-02-e04-b-e02-provider-completion.md)；Desktop 真实交互归 U01。 |
| [x] E04-c Policy 与 Catalog | 精确 Desired/Effective Policy、路由目录、快照/增量/ACK/Job 使用当前合同与单调修订；旧 cursor、响应和旧 URL 不污染现行目录。 | [Policy CAS、目录身份、Job 恢复与目标 HTTP 完成证据](../../tasks/evidence/2026-10-02-e04-c-e02-c-parent-completion.md)。 |
| [x] E04-d 旧合同删除 | 全部消费者迁移后清理 DSA Store/DTO、Schema、缓存和旧测试夹具；仍承担现行业务的领域原语按所有权保留。 | 调用反查、边界、包级与目标 Docker 验收。 |

E04-c/E02-c 的执行子项及 E02 父项已完成，见[父项完成与分层验收](../../tasks/evidence/2026-10-02-e04-c-e02-c-parent-completion.md)。E04 仍保留旧合同删除阶段：

| 状态 / 配对子任务 | 完成断言 | 验证与依赖 |
| --- | --- | --- |
| [x] E04-c1/E02-c1 Policy 当前投影与尝试 CAS | 当前 Desired/Effective、精确路由目录严格校验；同 revision 重试绑定当前 Apply requestId/独立 attemptId，晚到结果不覆盖当前策略或历史；旧格式投影明确拒绝；当前准入细化拒绝原因同源配对。 | [Server 2034、Schemas 586、Desktop 523、DSA 定向 31、隔离 PostgreSQL 6 及目标 14 模块/幂等 Apply/状态不变](../../tasks/evidence/2026-10-02-e04-c1-e02-policy-completion.md)。 |
| [x] E04-c2/E02-c2 Catalog 同源合同与恢复 | Snapshot/Delta/ACK/Job 校验当前信封、generation/checksum/cursor、Job 身份与终态恢复；旧目录信封和 cursor 不回填。 | [当前 Job/ACK、6项隔离 PostgreSQL、实际 HTTP及25模块目标验收](../../tasks/evidence/2026-10-02-e04-c-e02-c-parent-completion.md)。 |
| [x] E02-c3 缓存、精确来源与派生 | 当前缓存身份、修订、并发及派生证据完整；拒绝旧 source alias、无来源和隐式事实回退。 | [旧算法拒绝、缓存/来源65项、真实Redis3项及目标派生验收](../../tasks/evidence/2026-10-02-e04-c-e02-c-parent-completion.md)；未变化的真实来源证据复用，来源刷新失败和过期准入明确保留。 |

E03 按持久格式与消费者拆叶；经济 payload 版本和信封版本分别管理，不能用改名替代旧行拒绝：

| 状态 / 子任务 | 完成断言 | 验证 |
| --- | --- | --- |
| [x] E03-a 信封与数据库标记 | 当前事件信封有唯一版本；`LedgerEvent` 新增可空信封版本标记，新写入显式当前值，旧空值在读取及写入前拒绝，`payloadVersion` 仅表示经济 payload 结构。 | Schema/Domain、migration matrix、隔离 PostgreSQL 新旧行与原子写入；见下文信封证据。 |
| [x] E03-b 命令与投影 | 创建、修订、撤销、现金/份额/税费及 T+1 投影都消费当前信封；旧链路不再被后台重建或 Import 调用。 | Ledger/Import/Portfolio 定向及经济 golden、并发和回滚；见[命令与投影证据](../../tasks/evidence/2026-10-01-parallel-e03-b-ledger-projections.md)。 |
| [x] E03-c 客户端消费 | Ledger API Client、Desktop 当前动作与审计展示只使用当前信封；旧记录明确错误，不做显示补齐。 | API Client/Desktop 类型、交互及目标浏览器；Electron 按用户确认不作为门槛，见[目标验收](../../tasks/evidence/2026-10-01-parallel-e03-target-acceptance.md)。 |
| [x] E03-d 部署验收 | 目标数据库结构、应用角色、Server/Worker 与客户端同源；新事件纵向闭环和旧行拒绝均有证据。 | 官方 infra 入口、隔离及目标 PostgreSQL/HTTP、必要回滚演练；见[目标验收](../../tasks/evidence/2026-10-01-parallel-e03-target-acceptance.md)。 |
| [x] E03-e Backtest 经济关联 | 核对场内与 NAV 的 SimulationLedger 现行执行入口；经济结果绑定 Run、策略版本、冻结快照及校验和，跨 Run 串用与身份篡改拒绝，账户账本保持隔离。 | 场内 Runner 及读取定向回归；两个 NAV Run 的真实 Parquet 隔离及身份负例；目标已有 NAV Run 的只读 HTTP 复核，见[最终收口](../../tasks/evidence/2026-10-01-e03-backtest-association-closeout.md)。 |

E03-e 执行范围：N2/N3/N4 已完成。只新增独立关联验收测试和证据，更新本 Spec/Task 的 E03 收口状态；不改 Backtest/Worker 生产实现、Prisma 或 infra，不创建新目标 Run，也不向账户导入回测成交。复用 E03-b/c/d 已通过的局部及目标证据；发现现行经济行为或关联守卫缺陷时保留失败并另行拆分修复，不以文档勾选替代验证。

早期 `E03-a/E03-b` 已将当前事件信封切为 `version=3`，新增可空数据库标记与 migration，Repository 写入及旧行写前/读前拒绝已接入，现金、核心投影和 Desktop 划转判断同步；当时仅有本地门禁，见[当前信封证据](../../tasks/evidence/2026-09-29-canonical-ledger-envelope-marker.md)。2026-10-01 已补齐隔离 PostgreSQL、目标运行态、客户端交互及 Backtest 经济关联，并完成 E03-a 至 e 和父项；见[最终收口](../../tasks/evidence/2026-10-01-e03-backtest-association-closeout.md)。跨包旧命名与导出治理仍由 C03 拥有，不据 E03 完成勾选 C03。

## 4. 消费面

| 状态 / 任务 | 写集与完成断言 | 验证 |
| --- | --- | --- |
| [x] U01 API Client/Desktop | Market、Backtest、Ledger 客户端统一现行路径、类型和状态显示；清除旧接口重试、旧快照读取与旧数据展示分支。 | 包级类型/build、交互定向测试、真实桌面/浏览器 Network 与 Console。 |
| [x] U02 其他 Server 消费者 | Portfolio、Risk、Research、Strategy Optimization、AI 等实际调用者按 C01 清单迁到同一现行 Market/Backtest/Ledger 接口；不得由绕过 Reader 的旧路径补数据。 | 各消费者定向测试、模块边界检查及真实调用观察。 |

### 完成顺序与执行记录

U01-a/b/c、U02、E04-d/E04、D01–D03 与最终 Review 已完成，见[最终收口证据](../../tasks/evidence/2026-10-02-canonical-final-completion.md)。以下保存实际执行顺序。

当前 C01–C04、E01–E03、E01-I1、NAV N1–N4 及 E04-a/b/c 已完成。用户于 2026-10-02 授权完成全部剩余任务，按以下顺序连续实施：

1. U01 → U02：完成客户端及其他 Server 消费迁移，复用已经完成的 Run、Ledger 与 NAV 消费证据。
2. E04-d：消费者迁移后删除 DSA 旧合同、Store、别名及夹具，完成 E04 父项对账。
3. D01 → D02 → D03 与最终一致性 Review：最终部署输入、完整目标纵向闭环、残余清理及文档对账。

详细阶段、依赖与避免循环的安排见[当前剩余顺序](../../tasks/evidence/2026-10-02-canonical-remaining-order.md)。关联多来源回测 Task 中其余 M1/M2/M3 与 AC01–AC20 仍按其独立范围验收，不由 Canonical 单项完成自动代替。

每个尚未细化的组在实施前按现有 Task 约束补齐有界执行包；本轮以[连续执行包](../../tasks/evidence/2026-10-02-canonical-final-execution.md)记录写集、发现与验收，完成条件继续以完整 Spec 为准。

## 5. 部署与产品验收

| 状态 / 任务 | 写集与完成断言 | 验证 |
| --- | --- | --- |
| [x] D01 数据与部署输入 | 根据最终 Schema/原始表清单新增 migration、更新 matrix/打包检查；若采用开发 `public` 重建，走显式官方入口和精确目标确认，保留正式保数据升级与备份门禁。选择相邻 infra `sync-code.sh` 或 `update.sh` 的最小目标。 | Schema diff/validate、隔离 PostgreSQL、目标结构 head/权限/消费者日志、镜像与可写层区分。 |
| [x] D02 目标纵向闭环 | 现行接口从创建、投递、领取到结果/重放贯通；旧 URL、旧 Run、旧 Snapshot 显式拒绝且不污染现行状态。Server、Worker、DSA 和客户端同源部署。 | 官方目标 Docker、鉴权 HTTP、真实客户端与故障恢复，记录版本/镜像/数据库 head。 |
| [x] D03 清理与文档收口 | 删除 C01 标记的全部已不可达旧兼容代码、测试 fixture、旧缓存键与错误导出；更新架构、API、运维及相邻 infra 文档。仍需保留的证据格式版本逐项说明其完整性作用。 | `rg` 反查、包级与仓库门禁、文档链接检查、最终跨仓 Review。 |

M1/M2/M3 与 AC01–AC20 的真实数据、历史 PIT、独立备用、事件、AI、UI、回滚和业务结果由关联 Task 独立验收；本任务全勾选也不自动令关联 Task 完成。

## 最终一致性 Review

2026-10-02 最终结论：完整 Spec 对账通过，全部任务完成。当前消费者、DSA 旧合同删除、结构与权限、官方目标更新、隔离 Worker、真实 Desktop Network/Console 均闭合；独立 SDK 库存遗漏已删除并复验。见[最终收口证据](../../tasks/evidence/2026-10-02-canonical-final-completion.md)。关联多来源门禁继续独立，快更不作为镜像发布。以下保存各阶段当时的观察，不覆盖最终状态。

- 2026-10-02 E01 收口：C01/C02/C03/C04 与 I1/N1–N4 完成基础上，删除残余双 Runner、旧瞬时基准分派、未配置 NAV 转发及无生产消费者的执行聚合入口。目标35条旧记录拒绝、7条当前冻结结果摘要与43条完整记录摘要不变，E01 父项完成；其他父组及整体最终 Review 继续开放。

- 本次覆盖范围：E01-I1.1 至 I1.6，结论通过；整份 canonical replacement Task 继续实施中。
- 后续有界复核：E01-N1.1 纯依赖计划、E01-N1.2 冻结读写与原文绑定、E01-N1.3 Domain 输入映射均通过，N1 本地合同阶段闭合。N2/N3/N4 仍未接线或验收，基金回测入口继续按现行准入控制。见[计划证据](../../tasks/evidence/2026-09-30-e01-n1-1-nav-input-plan.md)、[冻结读写证据](../../tasks/evidence/2026-09-30-e01-n1-2-nav-freeze-store.md)与[Domain 适配证据](../../tasks/evidence/2026-09-30-e01-n1-3-nav-domain-input.md)；N3 的截止时间边界修复保持明确跟踪。
- N2.1 有界复核：来源/入口盘点及真实样本通过；N2 已按来源取证、生产、准备、写入和隔离数据库验收拆分。当前精确净值候选未准入，显示响应缺少发布时间证据及基金日期合同，N2/N3/N4 保持未完成。见[来源核查证据](../../tasks/evidence/2026-09-30-e01-n2-1-nav-source-inventory.md)。
- N2.2 有界复核：官方接口与 QDII 文件取证完成，用户已选择 T+1 为一般研究假设并按基金核验 QDII。研究合同已由 N2.3 完成 Schema、日期/规则生产、精确 API 与真实冻结验收；N1 严格合同继续独立有效。下一叶 N2.4，N2/N3/N4 整体继续未完成。见[规则取证证据](../../tasks/evidence/2026-09-30-e01-n2-2-nav-publication-calendar-research.md)及[生产验收](../../tasks/evidence/2026-10-01-e01-n2-3-2-3-nav-exact-production.md)。
- 已对账来源核查、合同、生产者、Server 冻结、Runner 消费、本地/隔离与目标证据；目标关键代码与当前工作区一致。
- 真实新 Run、冻结校验、缺路由/撤销拒绝与恢复、实际浏览器消费均有证据；真实窗口无缺 Bar，稀疏行为仍由 I1.1/I1.5 证明，不混淆固定快照、严格 PIT、归一化费用与实际费用边界。
- I1 相关勾选满足其范围；E01、C02、C04、D02 和关联多来源 Task 的其余门禁未按此次通过自动勾选。未扩大来源授权或删除原 Run。
- 本轮只更新 Task/证据，保留三仓未提交修改，未创建提交。证据见[目标验收记录](../../tasks/evidence/2026-09-30-e01-i1-6-target-acceptance.md)；其他范围的最终 Review 待各自任务完成后继续。

## 6. 2026-09-29 首叶记录

[首叶执行证据](../../tasks/evidence/2026-09-29-canonical-replacement-first-leaf.md)已记录主干库存和 `runs` 创建入口收紧。C01 尚缺所有消费者、缓存键及可达性逐项核对；C02 尚缺队列、Worker、重试、取消与隔离数据库闭环，因此两个任务均保持未勾选。Server 定向测试、typecheck 与包级测试通过；目标 Docker 和业务验收未执行。

[现行模式接线证据](../../tasks/evidence/2026-09-29-canonical-mode-persistence-leaf.md)记录 `mode='V3'` 写入、CAS/取消/重试/恢复和 API Client 响应解析的本地闭环。Server 1822 项、Schemas 568 项、API Client 36 项包级测试及隔离 PostgreSQL 3 项通过；实际 Worker 集成测试两次受 `FUTURE_DATA` 阻断并记为 `skipped_after_retry`，目标 Worker、旧记录读取与 Desktop 交互仍未验收，因此 C02-b/c/d 仍未勾选。

[现行 Run 读取门禁证据](../../tasks/evidence/2026-09-29-canonical-run-read-boundary.md)记录 `runs` 详情、执行、重试、取消对旧记录的前置拒绝；后续已删除公开 `jobs` 路由，Worker 旧路径仍可达，因此 C02-c/d 与 E01 继续未勾选。

[Desktop 与 HTTP 入口替换证据](../../tasks/evidence/2026-09-29-canonical-desktop-run-route.md)记录 Desktop 当前 Run 列表、详情与操作入口、原始价格现行准备、SSE 过滤及公开旧 `jobs` 路由删除。Server 内部旧 Worker、其他业务消费者和目标运行态仍待处理，C02、E01、U01 与 D02 保持未勾选。

[Worker 队列准入证据](../../tasks/evidence/2026-09-29-canonical-worker-queue-gate.md)记录现行合同的领取、投递、恢复过滤与新队列名。本地包级验证通过；内部旧 Runner、真实 Worker、目标容器和其他消费者仍待验收，C02-b、E01 与 D02 保持未勾选。

Strategy Optimization 分段执行已停止解析旧 RunConfig，现行配置定向 4 项通过；旧实验数据和其他内部消费者仍在 U02 清单中，U02 不勾选。

[跨运行时库存首轮](../../tasks/evidence/2026-09-29-canonical-cross-runtime-inventory.md)列出 Backtest、Market、Ledger、DSA 与部署的生产者、调用者和持久化归属；Schema 导出、缓存键与所有消费者仍待逐项核对，C01 不勾选。

[回测执行服务收敛证据](../../tasks/evidence/2026-09-29-canonical-backtest-runtime-convergence.md)记录旧 V1 Service、V2 Runner 注册和旧快照构建入口删除，当前执行服务只接受现行合同。Server 定向 51 项、包级 1782 项、类型、构建和模块边界检查通过；实际 Worker/目标容器及全业务能力盘点未完成，C01/C02/E01/D02/D03 不勾选。

[Market 公开路由切换证据](../../tasks/evidence/2026-09-29-canonical-market-public-route.md)记录 Server、API Client 与 Desktop 从 `/api/v2/market*` 切换到 `/api/market*`。本地 Server、API Client、Desktop 类型/构建/包级检查通过；来源合同、缓存、DSA、目标 HTTP 和浏览器验收未完成，E02/U01/D02 不勾选。

[现行 Snapshot Store 边界](../../tasks/evidence/2026-09-29-canonical-snapshot-store-boundary.md)记录旧 V1/V2 Store 读写/重试/回放、迁移 dry-run 与旧基础 manifest 构建删除。Schemas 568 项、Server 1773 项、类型/构建/边界门禁通过；目标 Worker/容器未验收，策略 Schema 与其他经济核心仍待收敛，C03/C04/E01/D02 继续未勾选。

[策略消费者现行合同收敛](../../tasks/evidence/2026-09-29-canonical-strategy-consumer-boundary.md)记录优化评分删除 V2 结果回退、Desktop 新建策略默认合同修复、V1 编辑分支与无调用方旧结果弹窗删除。Server 1772 项通过、91 项跳过；Desktop 508 项、类型/build、边界门禁通过。策略协议本身仍标记为 2，目标 API、真实客户端和 Worker 未验收，C03/U01/U02/D02 继续未勾选。

[Market Policy 单一合同接线证据](../../tasks/evidence/2026-09-29-canonical-market-policy-contract.md)记录 Server 默认种子、持久化与操作入口删除 V2 双格式，Desktop 策略及 Onboarding 只消费当前生效合同，DSA 策略写入 HTTP 只接受 V3。Server 定向 51 项、包级 1760 项通过且 91 项跳过；Desktop 定向 30 项、包级 508 项通过，双方类型和构建通过。DSA 定向 33 项通过，官方隔离 `offline-tests` 待重跑。目标容器未运行，数据库旧策略、DSA 旧生效策略读取与真实客户端未验收，E02/E04/U01/D01/D02 继续未勾选。

[Market Reader 消费者迁移首叶](../../tasks/evidence/2026-09-29-canonical-market-reader-consumer-leaf.md)将正式绩效快照的股票与 ETF 日线估值改为精确 V3 窗口，定向 8 项、Server 包级 1763 项通过且 91 项跳过，类型与构建通过。公开 Market HTTP、Risk 分钟线、Automation 与 DSA 旧读取仍未替换；目标运行态未验收，E02/U02/D02 不勾选。

[Market 图表读取入口收敛](../../tasks/evidence/2026-09-29-canonical-market-chart-route.md)将详情、独立日线与指标端点、Desktop 图表选择及基金持仓估算日线接到当前图表 Reader；交互图表不接收历史可见性参数。Desktop 旧分页与逐页指标刷新状态已删除。Server 包级 1764 项通过、91 项跳过，Desktop 508 项、API Client 36 项通过，类型与构建通过。响应投影、Risk/Automation 分钟线、DSA 旧读取与目标运行态尚未收敛，C03/E02/U01/U02/D02 继续未勾选。

Risk/Automation 的 `1m` 读取经源码核对在旧 DSA 接口也返回不支持；其可用性不能由测试夹具或旧缓存推断。U02 须先建立当前精确分钟线来源、覆盖与时序合同，再迁移分钟线消费者；此门禁保持未勾选。

[策略风险日线读取迁移](../../tasks/evidence/2026-09-29-canonical-risk-daily-reader.md)将股票/ETF 风险日线改用精确 V3 窗口，分钟线及派生周期在真实来源缺失时不再读取旧缓存；Automation `1m` 请求前置拒绝。Server 包级 1765 项通过、91 项跳过，类型与构建通过。Automation 日线、基金净值、DSA 旧读取、目标风险规则和真实分钟线仍待处理，U02/E02/D02 不勾选。

[旧 BarSeries Reader 与 DSA 入口拆除](../../tasks/evidence/2026-09-29-canonical-market-reader-removal.md)完成 Automation 股票/ETF 精确日线同步、基金净值分流、Server 旧 Reader/缓存实现与 DSA V2 BarSeries GET 删除；生效策略读取默认 V3，旧版本拒绝。Server 全包 1686 项通过、81 项跳过；Schemas 569 项、DSA 官方离线 7602 项通过。旧 Prisma 事实表、基金净值/Data V1、指标 V2、目标容器和真实来源仍待处理，C01/C03/E02/E04/U02/D01/D02/D03 均不勾选。

[停用行情事实表的结构收敛](../../tasks/evidence/2026-09-29-canonical-market-fact-table-removal.md)新增顺序迁移并从 Prisma、清理 SQL 和旧 Redis 前缀删除两张停用表；定向 27 项、Server 全包 1686 项通过且 81 项跳过、Schema validate、类型/build、迁移矩阵、运行时打包及临时 PostgreSQL 全链结构验证通过。目标数据库和应用容器未更新，D01/D02/D03 仍不勾选。

[图表指标计算合同收敛](../../tasks/evidence/2026-09-29-canonical-indicator-contract.md)将 DSA 纯指标路由、Server Client、Schemas 与 Desktop 投影直接切到当前合同，旧 V2 指标 POST 已删除；定向与包级结果及未完成门禁见证据。Data V1、当前 BarSeries/详情的旧编号合同和目标运行态仍待处理，E04/U01/U02/D02/D03 不勾选。

[旧日线与逐指标入口拆除](../../tasks/evidence/2026-09-29-canonical-dead-market-v1-routes.md)删除无现行客户端调用的 DSA V1 日线与逐指标 GET，以及 Server 旧指标 Service、请求构造、陈旧缓存和对应 Redis 前缀；回测仍在使用的取数函数保留。Server 全包 1686 项、DSA 官方离线 7601 项通过，目标验收未做，C01/C03/E02/E04/U02/D02/D03 不勾选。

[详情内部旧合同拆除](../../tasks/evidence/2026-09-29-canonical-detail-internal-contract.md)将非图表详情 helper 收窄为分段和依赖结果，删除 V1 Bar、逐指标及完整详情解析器，并保留当前结果的顺序校验；Schemas 562 项、Server 1686 项、Desktop 508 项、API Client 36 项通过。公开详情与 BarSeries 的 V2 编号合同、目标运行态和真实来源仍待替换，C01/C03/E02/U01/U02/D02/D03 不勾选。

[公开行情详情合同收敛](../../tasks/evidence/2026-09-29-canonical-detail-public-contract.md)将 Server、Schemas、API Client 与 Desktop 的详情响应统一为现行合同，删除旧 V2 类型和解析器；Schemas 562 项、API Client 36 项、Server 1686 项、Desktop 508 项通过。日线序列、其余旧链路与目标运行态仍待处理，C01/C03/E02/U01/U02/D02/D03 不勾选。

[日线序列合同收敛](../../tasks/evidence/2026-09-29-canonical-bar-series-contract.md)将当前 BarSeries 的公开类型、Schema 与文件名原位替换为单一名称，拒绝旧序列版本；Schemas 562 项、Server 全包 1686 项且 81 项跳过、Desktop 行情定向 89 项、API Client 36 项、构建与类型检查通过。目标运行态仍未完成，C01/C03/E02/U01/U02/D02/D03 不勾选。

[基金净值读取合同收敛](../../tasks/evidence/2026-09-29-canonical-fund-nav-contract.md)将 ThesisLedger 专属基金净值 URL 和响应改为当前合同，Server 取消旧版本补写并隔离缓存，Schemas/Server/DSA 定向与 Desktop 全包通过；DSA 与 Server 全包各有无关失败，隔离重试已通过，完整门禁仍按失败记录。目标运行态未验收，C01/C03/E02/E04/U01/U02/D02/D03 不勾选。

[报价与筹码合同收敛](../../tasks/evidence/2026-09-29-canonical-quote-chip-contract.md)将 ThesisLedger 专属报价与筹码迁到当前 URL/Schema，去掉 Server 补写和旧缓存读取；DSA 官方离线 7601 项、Schemas 562 项、Server 1687 项、Desktop 508 项以及构建通过。目标运行态尚未完成，C01/C03/E02/E04/U01/U02/D02/D03 不勾选。

[基金持仓与 FX 合同收敛](../../tasks/evidence/2026-09-29-canonical-holdings-fx-contract.md)将专属持仓与汇率路由、共享类型和响应收敛到当前合同；Schemas 563 项、Server 1687 项、DSA 官方离线 7601 项、API Client 36 项、Desktop 508 项及构建通过。目标运行态仍未执行，C01/C03/E02/E04/U01/U02/D01/D02/D03 不勾选。

[回测旧 DSA 客户端方法清理](../../tasks/evidence/2026-09-29-canonical-backtest-unused-client-removal.md)依据实际调用反查删除三项无生产调用的 V2 回测客户端方法与冗余测试 mock；Server 类型检查及定向 30 项通过。DSA 旧路由、V2 公司行动 envelope 与目标运行态仍待迁移，C01/C03/E01/E04/D02/D03 不勾选。

[回测事件快照响应合同收敛](../../tasks/evidence/2026-09-29-canonical-backtest-event-envelope.md)让当前 V3 事件形成的公司行动响应使用版本 3，Schema 拒绝旧版本；Schemas 全包 563 项与 Server 回测定向 41 项通过。Server 全包因一次 `parquet-wasm` 错误失败，隔离重试相应 4 项通过；Calendar、Instrument Facts 仍在 DSA V2 路由，目标验收未做，C03/E01/E04/D02/D03 不勾选。

[回测依赖事实路由收敛](../../tasks/evidence/2026-09-29-canonical-backtest-dependency-routes.md)将 Calendar 与 Instrument Facts 的 Server→DSA 路径迁到 V3，删除无消费者的旧 V2 公司行动端点；Schemas 563 项、Server 1687 项、DSA 离线 7601 项全量通过。旧 V2 Capabilities/Bars 入口、目标运行态和真实来源仍待处理，C03/E01/E04/D02/D03 不勾选。

[旧回测路由与服务清理](../../tasks/evidence/2026-09-29-canonical-backtest-v2-route-removal.md)删除 DSA 剩余 V2 Capabilities/Bars 路由及专用 helper，并移除无消费者的 Server 聚合 Service；DSA 官方离线 7596 项、Server 全包 1684 项通过，类型、flake8 和边界门禁通过。V1 capabilities 的旧回测元信息、Schema/领域残留和目标验收仍未完成，C03/E01/E04/D02/D03 不勾选。

[当前 Data 能力与健康检查收敛](../../tasks/evidence/2026-09-29-canonical-data-capabilities-health.md)将 Server 健康检查与行情选择器统一为当前 V3 能力读取，DSA 仅声明 Data 版本 3 并删除 V1 capabilities 路由；Schemas 全量 563 项、Server 1684 项、DSA 离线 7596 项通过。目标门禁未执行，C03/E01/E04/D02/D03 不勾选。

[旧 Control 握手客户端清理](../../tasks/evidence/2026-09-29-canonical-unused-control-handshake-clients.md)依据调用反查删除 Server 两项无消费者的 V1/V2 握手方法；定向 13 项与类型检查通过。DSA Control 的旧分支仍待迁移，C03/E04/D02/D03 不勾选。

[Control 握手版本准入收敛](../../tasks/evidence/2026-09-29-canonical-control-handshake.md)使 DSA 握手只接受 V3 并明确拒绝 V1/V2；Server 全包 1684 项、DSA 离线 7596 项通过。其他 Control 路由和目标运行态仍未验收，C03/E04/D02/D03 不勾选。

[Provider registry 读取路由收敛](../../tasks/evidence/2026-09-29-canonical-provider-registry-route.md)将 DSA 与 Server 的 registry GET 迁到 V3 路径，旧 GET 返回 404；DSA 离线 7596 项、Server 1684 项通过。配置、测试、移除和目标运行态仍未迁移，E04-b/D02/D03 不勾选。

[Provider 配置、测试与移除合同收敛](../../tasks/evidence/2026-09-29-canonical-provider-write-routes.md)将三项生产请求及 DSA 端点改为 V3，旧 URL、版本和单字符串凭据前置拒绝；DSA 离线 7597 项、Server 1685 项通过。Store 旧凭据分支、OAuth、Policy/Catalog 与目标验收仍待处理，E04-b/c/D02/D03 不勾选。

[Longbridge OAuth 会话路由收敛](../../tasks/evidence/2026-09-29-canonical-provider-oauth-route.md)将创建、查询和取消的 Server→DSA 路径迁到 V3，旧 URL 与旧创建信封拒绝；Server 全包 1685 项、DSA 离线 7597 项与类型检查通过。目标运行态尚未验收，E04-b/c/D02/D03 不勾选。

[Control 策略与目录路由收敛](../../tasks/evidence/2026-09-29-canonical-control-policy-catalog.md)将握手、Policy、路由能力和 Catalog 快照/增量/Job/ACK 的生产 URL 统一为 V3，删除空 V1 router；Server 全包 1685 项、Schemas 563 项、DSA 离线 7597 项通过。旧 Store 分支和目标运行态仍待验证，E04-c/d、D02/D03 不勾选。

[现行合同 smoke 入口收敛](../../tasks/evidence/2026-09-29-canonical-contract-smoke-entry.md)修正 V3 探针握手 URL，将主仓和 infra 合同入口接到现行协议与正向业务探针并删除旧 V1 脚本；旧握手 404 负例、协议 10 项和业务 2 项定向测试通过。目标鉴权 HTTP 和业务链路仍待验收，D02/D03 不勾选。

[官方更新磁盘阻塞](../../tasks/evidence/2026-09-29-canonical-update-all-disk-blocked.md)记录 `update.sh all` 的 DSA 镜像完成、主仓镜像构建期间宿主空间耗尽和主动中断；数据库升级与服务启动均未发生。目标 D01/D02/D03 保持未勾选。

[目标旧策略显式转换](../../tasks/evidence/2026-09-30-canonical-policy-state-rebase.md)记录目标 PostgreSQL 与 DSA SQLite 的旧策略拒绝、DSA 精确确认与备份、主仓迁移归档、隔离演练及目标结构升级。Server→DSA revision 31 已重新 Apply，`159516.SZ` 当前 Run 准备通过；正式创建在 `historicalTradability` 的 raw 路由缺失处失败，retry 返回 409。官方 DSA 完整更新也因构建重试后 pip 解析失败保持开放；D01/D02/E01/E04-c 不勾选。

[三仓兼容矩阵收敛](../../tasks/evidence/2026-09-29-canonical-infra-compatibility-matrix.md)将 infra 发布检查从 V1 基线加平行 V3 块收敛为唯一 Data/Control V3 组合，并同步主仓、DSA、infra 的当前入口说明；静态检查通过。目标部署与业务验收尚未完成，C01/D01/D02/D03 不勾选。

[Provider 凭证存储格式收敛](../../tasks/evidence/2026-09-29-canonical-provider-credential-storage.md)删除单字符串写入和读取分支，结构化凭证与密钥轮换定向 50 项通过。DSA 全包与目标真实配置尚未复核，E04-b/d、D02/D03 不勾选。

2026-09-29 反查发现 DSA V3 报价端点的通用 Gateway 在无覆盖参数时仍由 `_execute_with_metadata` 读取旧 `effective_policy()`，HiThink 报价守卫也仍核验 V2 `routeStatus`。因此 E04-c/d 还包含通用数据请求对当前 Policy 的执行选择、晚到复核与旧 Store 方法删除，不能仅凭 V3 URL/信封通过勾选。

[通用数据网关当前策略准入](../../tasks/evidence/2026-09-29-canonical-data-gateway-policy.md)已将通用 Gateway 选择改为当前 Policy、精确目标和标的/日期准入；HiThink 的当前修订与晚到守卫同步迁移，定向 48 项通过。当时尚缺精确 data 能力目录和返回前复核；后续进展见下一条。

[当前数据路由精确目录](../../tasks/evidence/2026-09-29-canonical-data-route-catalog.md)已登记有实际源码适配器的报价、净值、持仓与筹码目标，并在调用前后核验当前修订和准入；定向 65 项通过。DSA 全包在无关筛选限时用例失败，隔离重试通过；其余来源及目标 Server→DSA HTTP/容器仍待验收，E04-c/d、D02/D03 不勾选。

[Provider 当前生效投影](../../tasks/evidence/2026-09-29-canonical-provider-effective-projection.md)将配置、移除返回值从旧 Policy 状态转为 V3 即时计算，健康写入不再改旧投影；当前 HTTP 错误信封编号同步为 3。定向 71 项通过。DSA 全包在筛选模块限时用例失败，隔离重试通过，完整门禁仍按失败记录；旧 Store 分支、目标运行态仍未完成，E04-b/c/d、D02/D03 不勾选。

[DSA 当前策略存储收敛](../../tasks/evidence/2026-09-29-canonical-policy-store-removal.md)删除 Store V1/V2 Policy 写入/读取/投影和旧表定义，内部执行入口仅接受当前精确目标；旧格式行前置拒绝。定向 61 项与静态检查通过。回测 fixture 的 V2 能力汇总、来源别名与目标 SQLite/容器仍待清理和验收，E04-c/d、D01/D02/D03 不勾选。

[回测依赖 fixture 收敛](../../tasks/evidence/2026-09-29-canonical-fixture-dependency-cleanup.md)删除无生产调用的 V2 能力汇总与旧 Policy/raw 日线探测，Calendar/Instrument Facts 测试模式只构造当前端点所需的 CN 事实；定向 44 项通过。第一次全包复核因旧策略并存断言失败；删除该断言与来源兼容后，全包通过，见下一条。真实历史事实和目标运行态未验收，E04-d、D02/D03 不勾选。

[DSA 来源身份与净值准入收敛](../../tasks/evidence/2026-09-29-canonical-source-identity-and-nav-scope.md)删除来源 alias 的健康/预算兼容键、Runtime 的 tuple 入口及结果的 V2 投影，净值完整序列校验后按请求截取并复核实际行准入；最终 DSA 全量离线 7524 项通过。目标运行态和真实来源未验收，E04、D01–D03 不勾选。

[Snapshot 与现金账本旧格式读取删除](../../tasks/evidence/2026-09-29-canonical-snapshot-ledger-readers.md)移除无生产调用的 V1/V2 Snapshot 解码和历史迁移划转的宽松读取；Schemas 包级 564 项、Server 包级 1685 项、类型/构建和模块边界检查通过。目标结构及真实 Worker 未验收，C03/C04/E01/U02/D01–D03 不勾选。

[回测创建 Schema 旧导出清理](../../tasks/evidence/2026-09-29-canonical-run-create-schema-cleanup.md)删除无生产调用的 V2 Run 创建 Schema 与旧合同集合；Schemas 最终全包 563 项、API Client 36 项及类型/构建通过。当前准备链仍使用 V2 命名的基础 RunConfig 校验，需在 C03 中按职责收敛；C02/C03/E01/U01/D02/D03 不勾选。

[停用公司行动适配链清理](../../tasks/evidence/2026-09-29-canonical-dead-corporate-action-adapter.md)删除 DSA 无生产调用的 V2 公司行动 helper、AkShare 旧适配入口和对应标准化器；定向 25 项、官方离线 7515 项通过，受影响文件语法、关键 lint 与 diff 检查通过。当前 Event V3 来源未改，目标容器与真实事件仍待验收，E04-d、D02/D03 及关联 M1/M2/M3、AC01–AC20 不勾选。

[当前 Run 响应 Schema 收敛](../../tasks/evidence/2026-09-29-canonical-run-response-schema.md)删除可解析旧模式的 Run 响应 Schema 导出，使现行响应独立定义并拒绝 `mode='V2'`；Schemas 定向 19 项、全包 563 项、构建及 Server/Desktop/API Client 类型和边界检查通过。结果 Schema 的旧编号基础字段、目标运行态及真实客户端另行验收，C02/C03/U01/D02/D03 不勾选。

C01/E01 后续核对点：`runCnNavVertical` 当前只有 Server 的旧测试和 `backtest-v2-execution.ts` 转导引用，V3 Runner 只调用场内执行；但当前策略 Schema 仍允许 NAV Fund，创建守卫按“非股票即 ETF”构造日线 Bar 路由。删除旧 NAV 引擎前须先核对当前产品是否承诺 NAV 回测、准备链对 NAV 的实际拒绝位置及现行经济能力归属；不能仅以生产引用数为零认定 NAV 业务可删除。

[当前回测结果 Schema 边界](../../tasks/evidence/2026-09-29-canonical-result-schema-boundary.md)删除 Schemas 可解析旧结果的导出，使当前 V3 结果直接组合经济字段并保留来源/口径校验；Schemas 定向 19 项、全包 563 项及构建、下游类型和边界门禁通过。真实 Worker 与重放未验收，C03/C04/E01/D02 不勾选。

[领域交易类型收敛](../../tasks/evidence/2026-09-29-canonical-domain-simulation-trade.md)删除无调用的旧结果接口，并将当前交易归集与分析所用类型命名为 `SimulationTrade`；Domain 定向 16 项、全包 313 项、构建及下游类型检查通过。C01/C03 的其余领域库存、真实执行与部署仍开放。

[优化实验创建合同收敛](../../tasks/evidence/2026-09-29-canonical-optimization-create-schema.md)删除仅由旧测试引用的 V2 创建解析器，当前合同拒绝旧信封及旧 RunConfig；Schemas 定向 17 项、全包 563 项、构建与下游类型检查通过。旧实验读取、目标 Worker 与真实 AI 验收仍需在 U02/D02 和关联多来源门禁核对。

C01/E01 NAV 调用链复核：`backtest-run-preparation.ts` 与 `backtest-snapshot-v3-input-plan.ts` 均在进入冻结前明确拒绝 NAV Fund，当前 V3 Runner 只调用场内执行。因此现行创建守卫中“非股票即 ETF”的构造尚无已确认的 NAV 正向可达路径；保留 NAV 经济能力仍属 AC15 与 E01 的未完成接线，后续先定义当前 NAV 准备/冻结合同，再接执行与目标验收，不以旧函数有测试就认定已支持。

[当前准备请求的 RunConfig 校验](../../tasks/evidence/2026-09-29-canonical-preparation-run-config-validation.md)使生产准备入口直接使用当前 V3 字段与共享业务校验，不再调用旧 RunConfig 解析器；定向 43 项、Schemas 全包 563 项、构建及下游类型检查通过。旧解析器仍被测试导出引用，C03/C04/E01/D02 不勾选。

[停用 Ledger V1 Schema 清理](../../tasks/evidence/2026-09-29-canonical-unused-ledger-v1-schema.md)删除仅由旧测试引用的事件解析器、包导出和对应测试；Schemas 全包 548 项、构建与下游类型通过。整份 `contracts.test.ts` 的 Prettier 检查仍因本叶未触及的既有格式差异失败；当前 Ledger 经济链与目标数据库/运行态仍待 E03/D01/D02 验收。

[当前 Market 路由目标合同收敛](../../tasks/evidence/2026-09-29-canonical-market-route-target.md)将 V3 路由、目录与事件准入共用的目标身份移出旧 Policy Schema，删除无生产消费者的 V2 Policy 解析器；Schemas 全包 546 项、构建及下游类型通过。两份现行 Schema 文件的整文件 Prettier 门禁仍有本叶未触及区段的差异，目标 HTTP/客户端未验收，C03/E02/E04/U01/D02/D03 不勾选。

[停用 Market Policy V1 Schema 清理](../../tasks/evidence/2026-09-29-canonical-market-policy-v1-schema.md)删除无生产调用的旧信封、Policy 解析器与类型，现行合同继续拒绝 V1/V2 请求；Schemas 全包 546 项、构建、下游类型及边界门禁通过。`market.ts` 整文件格式门禁仍有未触及区段的差异；目标运行态未验收，C03/E02/E04/U01/D02/D03 不勾选。

[基金净值首次读取回归修复](../../tasks/evidence/2026-09-29-cont-u04-nav-opening.md)让 Desktop 基金详情直接请求净值能力，避免现行图表计划误拦截 NAV；Desktop 全包 509 项、类型与构建通过。真实客户端及 NAV 业务验收仍开放，U01/D02 与关联 U04/AC15 不勾选。

[停用回测 V2 能力汇总合同清理](../../tasks/evidence/2026-09-29-canonical-unused-backtest-capabilities-schema.md)删除无生产消费者的旧能力汇总 Schema、fixture 与 T13 脚本，保留现行策略、日历和 NAV 事实测试；Schemas 全包 543 项、构建、下游类型及隔离门禁通过。目标 DSA/Worker 与真实来源未验收，C01/C03/E01/E04/D02/D03 不勾选。

[NAV 创建守卫前置准入](../../tasks/evidence/2026-09-29-canonical-nav-create-guard.md)在基金策略构造错误 ETF 路由前拒绝直接创建，新增查库/查路由前负例；Server 全包 1686 项通过、81 项跳过，类型、构建及目标 ESLint 通过。NAV 正向业务仍须完成 E01-N1 至 N4，C02/E01/D02 不勾选。

[NAV 冻结输入合同前置](../../tasks/evidence/2026-09-29-canonical-nav-freeze-contract.md)新增独立运行配置、最终 Manifest 及配对读取 Schema，要求可核验历史发布时间、精确来源、费用模型、完整估值窗口及 NAV 产物摘要，拒绝伪装 Bar、缺覆盖与未来可见。Schemas 全包 550 项、构建及目标检查通过；Reader、Store、Runner、Domain 与真实来源尚未接线，E01-N1 至 N4 保持未勾选。

[目标保数据升级证据](../../tasks/evidence/2026-09-29-canonical-target-database-upgrade.md)记录旧行情缓存真实行导致的演练拒绝、归档保留修复，以及官方更新后的目标 head、权限、归档行数、Server/Worker 健康和旧 Run/URL 拒绝。D01 的结构与目标部署部分已有证据；D02 纵向新 Run、E03-d 新旧事件、DSA 与客户端同源、真实来源仍开放，父叶不勾选。

[DSA 目标运行层与旧 URL 证据](../../tasks/evidence/2026-09-30-canonical-dsa-target-runtime.md)记录官方镜像更新、HiThink Key 进程注入、SPA 回退导致旧 POST 为 405 的修复，以及官方快更后目标源码摘要和 Data/Control V3 鉴权结果。最新修复仅在容器可写层，当前 Run、真实 Provider 与不可变镜像验收未完成，E04/D02/D03 不勾选。
