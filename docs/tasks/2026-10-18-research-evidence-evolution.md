# 数据供给与研究能力增强实施任务

<a id="priority"></a>
> 排期：**P1｜数据基础与最小研究；P2｜历史比较/复核；P3｜阶段化实验**。T0R/T0/T1～T9、G1 与 DSA 的独立数据基础、N1～N3、源码/客户端退役及最终依赖输入已完成各自本地交付；DSA 最终物理矩阵 6,178 项、实际 DSA/主仓 SDK 六类互通通过。真实生成、正式镜像、目标升级/恢复与实源仍按各自前置；T10～T12、T13a/T13b 及 T14 已完成各自本地交付；T13c 的现行实源正向消费和目标验收保持未完成，T15a 的受控离线驱动也已交付；真实对照与生产激活仍受 T15b/G3 的授权及证据门禁约束。
> [全局优先级与接续规则](README.md#priority-policy)。本轮按接续实施指令执行原叶，不变更编号或降低验收条件。

> 对应规格：[research-evidence-evolution](../specs/2026-10-18-research-evidence-evolution.md)。
> 当前状态（2026-10-26，D36另获准单次重试准备）：用户因控制台未见请求授权“再试一次”；保留D35 HTTP404和generation记录，当前目标Key与用户提供的控制台SHA-256／标签首尾完全匹配。53项执行输入与已验df411ebf…镜像不变，V2=false／无策略／pending=0，新提交8d2a2c1a-aebe-4233-bc32-7ccd91ecbf95。预留1次，实际派发后余2次冻结；经infra最小入口复用同一镜像临时开启单次策略，结束关闭，不重建应用镜像、不改默认／原数据／WIP，不stage／commit。[D35历史回执](evidence/2026-10-25-g3-adaptive-runtime-acceptance.md)。
> 前次正式生成：D25仅1次请求收到HTTP200／完整SSE／stop，合法JSON未通过V2 Schema，failed／research_schema_invalid、result=null，具体字段原因仍未知。D20原根因和D25旧正文仍未恢复，不以本轮受控响应回填；详见[D25历史回执](evidence/2026-10-25-g3-single-formal-response.md)与[D24历史部署](evidence/2026-10-25-g3-d21-deployment.md)。
> [Provider returned error 诊断交接 Prompt](evidence/2026-10-25-g3-provider-returned-error-handoff.md)：保留为初始授权与证据边界的历史入口；本次接续状态以上方及原G3叶为准。
> DSA 任务唯一入口：[纯数据服务 Task](../../../daily-stock-analysis/docs/tasks/2026-10-18-data-only-service.md)。

## 当前执行摘要

以下实现摘要保留各自历史时点事实；现行状态以上方当前状态及 G3-D36 接续记录为准。

**先做数据服务隔离和研究合同，再完成新闻到报告的最小路径；随后补历史、复核，最后评估阶段化 Agent。** 本轮已进入实施。DSA N1 固定 `news-search-v1` 的 12 组共享样例；T1/T2 消费同版样例并通过 38 项新闻 Schema 测试、31 项新闻客户端测试、30 项受控 HTTP 测试。共享 Schema 全量 1,129 项与受影响 Server 40 文件 433 项通过，后续新闻分类 61 项补充通过，见[新闻消费证据](evidence/2026-10-18-research-news-consumption.md)。

T0 已完成消费者/历史格式与模式信任盘点，见[盘点证据](evidence/2026-10-18-research-consumer-inventory.md)；没有查询业务库，各族实际数量仍未知。T3 已固定 V2/冻结合同及受控样例，59 项新合同测试与既有兼容测试通过；共享 Schema 全量 102 文件 1,188 项、Schema 构建及 Server/Desktop 类型检查通过。T4 接续持久化，DSA 删除仍须先完成 D0；合同完成不代表实源接入或研究产物已升级。T0R 已提供收藏项目的固定版本实现对照；它不要求先审完全部参考项目才能开始独立叶。数据结构升级和真实调用不能越过各自前置。

T4 的 13 项提交测试及 V1/Journal/结构回归、34 项迁移与打包检查通过；Docker 恢复后，六项真实数据库用例及合成 V1 记录逐字段保留/旧解析器读取也已通过。T5/T6 的持久化前置已就绪，目标升级仍留给 G2a。独立 T9 已通过 19 项确定性断言及既有计量回归，原始输入/评价版本与基线保存在[离线报告](evidence/2026-10-18-research-trace-baseline.json)；它不证明业务库、实源或真实模型质量。

现有 R01、工作台真实业务、AI SDK/费用和各 Provider 正向门禁仍保留原状态。当前真实 AI 调用已停止，本 Task 不授予调用额度。后续接续时先检查相应权威 Task，不按旧的剩余次数计算预算。

## 统一优先顺序

以下分组使用[全局排期](README.md#priority-policy)：本主题的基础工作为 P1-a，不与现行正确性修复争用“P0”标签。分组不是新依赖图；原叶依赖逐条保留。

| 顺序 | DSA 所有的交付 | ThesisLedger 所有的交付 | 阶段出口 |
| --- | --- | --- | --- |
| P1-a 基础 | D0、D1a/D1b、D2a/D2b、D3a/D3b、DG1：盘点、FX/配置隔离与数据运行 | T0、T3、T4：消费者/历史盘点、V2/冻结合同与持久化 | 明确数据保全与新产物前置 |
| P1-b 最小研究 | N1～N3：新闻合同、Adapter、V3 | T1、T2、T5、T6、G1：新闻读模型、冻结提交、V2 执行 | 真实业务实现通过受控 HTTP/数据库闭环 |
| P1-c 产品与收敛 | D2c 保全搜索；D9a/D10 先准备载荷，再分批删除和 D9b 依赖收敛；DG2a/DG2b/DG2c 分别验收更新、留存、恢复；DG3 验证新闻 | T7～T9、G2a/G2b、G3：读取、报告交互、轨迹评估与目标验收 | 可用研究路径与纯数据服务分别有验收证据 |
| P2 研究闭环 | 复用已验收数据能力 | T10～T14、G4a/G4b：报告比较、观察版本、到期复核、下一步 | 冻结历史可比较、结论可复核 |
| P3 条件增强 | 提供相同冻结数据输入 | T15a 实验驱动、T15b 获准对照；激活后 T16a/T16b、G5 | 有收益证据及生产生命周期验收才启用 |

表格表示推进优先级，不把阶段中的全部条目互相设为启动依赖。DSA 剥离不等待新增新闻 V3/真实模型；G3 需要两侧目标版本已包含新能力。DSA 状态只在配套 Task 勾选；本表不重复维护完成比例。T7 必须进入 G1 前置；读写发布按 T6 默认关闭、G2a 双读升级、G2b 恢复基线、G3 获准开启的顺序。

## 共享实施约束与入口

- 保留三仓现有未提交修改。只修改当前叶允许路径；大文件不得继续增加复杂度，提取有明确所有权的职责。
- `ResearchModule → MarketModule/AiModule`，`MarketModule → DsaModule`；Ai 不反向 import Research/Journal。相关修改同步 `scripts/check-boundaries.mjs`。
- 模型配置、额度、真实请求和再次生成沿用[AI SDK Task](2026-09-19-vercel-ai-sdk-integration.md)与[AI 配置 Task](2026-09-21-ai-provider-model-usage-configuration.md)。不修改默认模型来满足测试。
- 数据源沿用[统一数据能力 Task](2026-10-09-unified-data-capability-adapter.md)及来源合同；外部来源未就绪只阻塞对应门禁，不阻塞无关的本地合同工作。
- 每叶完成包括定向测试、自审和必要文档；扩大职责、缺少前置或权限时停止并重拆。测试结果记录实际输入/版本，按相同断言复用，不重复跑无关全量检查。
- 验证入口：`pnpm --filter @thesis-ledger/schemas test`；Server 用 `pnpm --filter @thesis-ledger/server exec vitest run <定向文件>`；Desktop 用对应 `test/typecheck/build`；边界用 `node scripts/check-boundaries.mjs`。括号中的定向文件由各叶实际测试文件确定，不是执行时全量扫描指令。
- 数据结构变更需新增 migration、单独检查 Schema diff，并同步 migration matrix、runtime 打包输入、结构门禁。保留数据升级与开发重建分别处理。
- Docker 仅经 infra 正式入口。首次 DSA 收敛和数据库/依赖变化必须完整更新；只改兼容应用代码时按预检结果选择最小 `sync-code.sh` 目标。
- T0/D0 形成的精确路径/测试清单是后续派发条件；同一控制器、模块注册、共享 Schema 或脚本不同时派发给多个叶。接口独立设计与并行写同一文件不是一回事，交接时核对前叶实际输出。

<a id="star-reference-review"></a>
## 收藏项目实现对照（只读核查）

- [x] **T0R：补齐逐项目实现证据、反例与归属**
  - 覆盖：RA13；依赖：当前本地工作区和[逐项对照清单](../reviews/2026-10-18-starred-project-implementation-coverage.md)；不依赖真实模型或供应商账号。
  - 执行面：只读上游/本地源码、测试与获准脱敏证据；允许写入仅参考 Review 和相关 Spec/Task，不修改业务代码、配置、依赖、数据库、镜像或外部状态。
  - 范围：REF01～REF14 已列参考点，REF05 明确排除。按数据/适配、计算/账户、研究/实验三组核查，不把每个想法展开为一个自动实施任务，不以审完 13 个仓库所有代码为完成条件。
  - 每项交付：固定上游提交与函数/测试，本地实际消费者与未提交输入，合同差异、可复算最小反例、证据层级，以及“已有等价/现行缺陷/新能力候选/有依据不适用/证据不足”的处理决定。只看 README 或找到类名不算源码对照；未跑测试不记已通过。
  - 完成证据：13 项固定版本/发布包的源码与测试阅读、本地消费者及处理决定已齐，详见[源码核查](../reviews/2026-10-18-starred-project-source-audit.md)。原核查运行三个指标缺陷反例和一个 EMA 正对照，包含原 Server 指标助手的隔离消费。IR01 复用 R3.I1/I3；IR02～IR06 与 IR09/IR10 当时交所属领域，现已由三个 P0 Task 完成修复和[独立目标验收](evidence/2026-10-19-p0-target-acceptance.md)，不代收本页研究运行门禁；IR07 模型差异、IR08 同端点单位未知保留。
  - 完成条件：所有范围内已列参考点有两侧实现证据或明确不适用依据，剩余缺陷有唯一责任与下一步；证据不足不得标为无问题或为清空表格而取消。核查叶完成状态在本 Task，逐项证据在 Review，修复进度只在所属领域 Task 更新。
  - 分派规则：与研究相关的输入/引用、比较/观察、预算和统计反例交 T3/T5/T9/T13/T15a；来源相关的保全维度交 D0/N1～N3。新增能力和现行缺陷先确认所属合同再建立/补充聚焦叶，不能塞进 DSA 删除、策略探索 T19 或无关 UI 任务。
  - 非阻塞边界：T0R 整体不是 D0、DG1、T0、T3 或新闻最小链的前置；只有采用该参考点的具体叶必须先取得对应核查证据。不新增开户、采购、实源探针、模型额度或 free-stockdb 任务。

<a id="p0合同与持久化"></a>
## P1：合同与持久化

- [x] **T0：盘点研究消费者与历史数据形态**
  - 覆盖：RA1、RA3～RA5、RA10 的前置；依赖：无。
  - 执行面：只读源码与获准的脱敏元数据检查；可写仅本主题文档。
  - 入口：`packages/schemas/src/{ai,research,research-display}.ts`、`apps/server/src/ai/`、Journal 冻结调用方、`apps/desktop/src/features/ai/`、API client 与现有受影响客户端。
  - 完成/验证：列出 V1 生产/解析者、模式可信度来源、存量冻结结构、API/数据库兼容约束和准确的受影响测试集；不因当前账户模式推断历史。发现其他客户端消费者时加入其定向兼容任务，不能只验证 Desktop。
  - 证据：[消费者盘点](evidence/2026-10-18-research-consumer-inventory.md)已覆盖 Ai 执行/恢复、Journal、实验、Desktop 与共享 API client；Mobile 未找到直接消费者，未据此宣称设备通过。现行 V1 受控基线 7 文件 25 项通过，实际历史记录数量与数据库升级仍未知/未验。

- [x] **T3：建立 V2 产物与研究范围合同**
  - 覆盖：RA3、RA5；依赖：T0 的消费者与历史分类。
  - 执行面：共享 Schema；允许修改 `packages/schemas/src/ai.ts`、`research.ts`、`research-display.ts` 及新增语义清晰的研究合同文件和测试。
  - 版本接线：`ai-execution.ts` 的研究 contract ref 允许显式 V2 序列化；既有 `aiGenerationContracts.research` 默认仍为 V1，执行器/开关在 T6 接线，不因合同新增而启用新生成。
  - 完成/验证：V1/V2 产物与 `frozen-research-v1/v2` 分别定版；独立标的范围、服务端范围快照、合法失效条件/动作、证据引用及历史未知分支固定。新输入严格拒绝客户端伪造的快照、费用和来源审计字段。冻结合同由 Ai 接口拥有，通用序列化放共享 Schema，Ai 不 import Research。
  - 输出：T4～T8 使用的已验证合同样例；没有生产者实现不妨碍合同完成，但不能据此宣称业务可用。
  - 实施：`research-scope-v2`、`research-evidence-v2`、`ai-frozen-research-v2`、`research-result-v2` 与 `research-versioned` 固定严格提交、五类服务端范围、历史未知分支、证据/数字引用、有限动作及 V1/V2 读取联合。冻结包保存规范提交并核对对象/模式/设置修订；结果关联核对原冻结指纹、快照、Prompt、时间、质量及调用方提供的证据调用归属集。
  - 验证：`packages/schemas/test/research-v2.test.ts` 的 59 项及三个既有研究/模式文件合计 75 项通过；Schema 全量 102 文件 1,188 项、构建、Server/Desktop `typecheck` 通过；上述新合同、样例/测试及 `ai-execution.ts` 定向 ESLint 为 0 错误/0 警告。共享合成样例为 `packages/schemas/fixtures/research-v2.samples.json`（SHA-256：`8b6f4357e7d357a94b21938e5578c4aa354574eab0638ee20eb0987c7dbd676c`），Schema/Server 各自验证后读取，避免跨包导入测试源码。改用 JSON 后 75 项定向回归再次通过；其中占位内容指纹不作为实际数据、模型或内容哈希核验的证据。
  - 后置：T5 负责按真实冻结输入计算指纹；T6 必须核验实际字段值、单位、派生运算与数据库中的调用归属。Schema 形状和传入的归属集合本身不提供数据资格、身份或费用授权；现有生成默认仍为 V1。

- [x] **T4：保存幂等提交与版本化范围快照**
  - 覆盖：RA3、RA4、RA10 的持久化部分；依赖：T3。
  - 执行面：Server 数据持久化；允许修改 AiRun 必需字段、新 migration、提交/读取 repository、迁移清单和对应数据库测试；不改模型或页面。
  - 入口：`apps/server/prisma/schema.prisma`、`ai/ai-research-submission.ts`、`ai/ai-execution-state.store.ts`。
  - 实施边界：Ai 所有的 V2 提交仓储复用既有 Provider 配置事务围栏，权限检查为必需依赖；不注册入口、不触发 Worker。身份来自现有认证层，按身份/提交标识查重，T5/T6 再完成提交与执行接线。
  - 完成/验证：同提交标识同摘要返回原任务，异摘要冲突；查重/找回先校验权限；快照原子保存；并发只产生一条任务；旧 V1 记录无需回填且仍可读。定向测试后，在隔离 PostgreSQL 验证保留升级与唯一约束；目标升级留给 G2a。
  - 已实现：`ai-research-submission-v2.store.ts` 与提交身份摘要；新增 `20261019010000_research_submission_v2`，只为 AiRun 追加四个可空字段及身份/提交唯一约束，Schema diff 无其他变更。旧 V1 提交流程未接线到新仓储，V2 生产提交仍待 T5/T6。
  - 本地验证：新提交身份/权限顺序/找回/冲突 13 项通过；与既有 V1/Journal、结构/升级计划合计 10 文件 61 项通过，修正测试样例后受影响 3 文件 36 项再次通过。Server `typecheck/build`、Prisma 占位连接静态 `validate/generate`、边界、34 项 migration matrix、34 项 runtime 输入和定向 ESLint（0 错误/0 警告）通过。
  - 隔离证据：在主仓执行 `node scripts/test-ai-provider-postgres.mjs test/ai/research-submission-v2-postgres.integration.test.ts`，退出 0，六项通过；两个真实连接的十次并发仅产生一个任务/一份执行配置，验证异摘要冲突、原材料保留、终态找回、身份隔离、数据库直接拒绝重复/不完整记录及事务失败回滚。入口核对专用库 `ai_provider_concurrency_fixture`/owner `fixture_owner`，迁移前写 V1 合成行，34 份 SQL 后逐字段相等、新字段为空且原 `researchResultSchema` 可读；实际 head 正确，退出清理本次 tmpfs 容器。未访问业务库、调用模型或升级目标；G2a/G2b/G3 仍开放。

## P1：数据消费与最小执行路径

- [x] **T1：实现新闻 V3 消费合同**
  - 覆盖：RA2 的协议；依赖：DSA N1 固定样例。
  - 执行面：Schema/协议适配；允许修改 `packages/schemas` 的新闻 wire 合同、`apps/server/src/integration/dsa/` 新闻客户端和定向测试；不新增 Provider SDK 或路由默认值。
  - 完成/验证：与同一批 N1 样例互通；来源、时间、覆盖和错误映射不失真；拒绝不兼容合同，能力缺失不回退原生分析接口。
  - 证据：`market-news-v3` 共享 Schema、`dsa-news-v3` 协议核验、`DsaClient.marketNewsV3` 单次 Data Token 请求；同版样例 SHA-256 为 `388f19f1275965042020a340f6c6659c47c973164df67315577cd01126404a05`。已通过上述本地回归、Schema 构建和 Server 类型检查；未请求实际 DSA 或外部新闻来源，详见[证据](evidence/2026-10-18-research-news-consumption.md)。

- [x] **T2：提供 Market 新闻读模型**
  - 覆盖：RA1、RA2；依赖：T1。
  - 执行面：Server Market；允许修改 `apps/server/src/market/` 的新闻 reader/控制器、模块出口及边界测试，复用 DsaClient。
  - 完成/验证：规范标的输入、缓存身份、质量/空结果/失败行为稳定；上层看见来源无关的事实合同，不能传 Provider 私有参数。HTTP 定向验证使用共享合同样例；实源由 DSA DG3 负责。
  - 证据：`MarketNewsReader` 已从 `MarketModule` 导出，`POST /api/market-data/news` 严格拒绝额外字段和 query。真实 Nest HTTP → 原 DsaClient → 本机受控 HTTP 共 30 项通过；响应使用 `no-store`，明确实际来源错误与服务/协议失败，未知抓取/尝试保持未知。详见[证据](evidence/2026-10-18-research-news-consumption.md)。

- [x] **T5：准备冻结证据并提交标的研究**
  - 覆盖：RA1、RA3、RA4；依赖：T2、T3、T4。
  - 执行面：Server 研究产品编排；允许新增 `apps/server/src/research/` 的准备/提交职责、注册 `ResearchModule`、扩展现有冻结材料入口和边界测试；不另建 Worker 或运行状态表。
  - 接线边界：复用现有 `IdentityGuard/CurrentIdentity`；规范证券身份由 Market 解析，不调用会写入 Asset 关联的确认接口。必要时为 Market 与 Dsa 既有只读方法追加可选取消信号和剩余预算，旧调用默认不变，不改变 wire、路由或来源准入。先完成规范标的公开材料纵向闭环，再串行接入既有四种范围；父项保留到全部受影响范围与取消/找回验证齐备。
  - 实施：规范标的、账户、组合、持仓和策略五类范围已串行接线；私有材料通过只读 RepeatableRead 事务取得实际账户集合、持仓/成本、现金投影代次和策略版本，未知币种、缺失/陈旧现金与未解析证券保留原因，不计算估值或复算账本。当前账本没有用户所有权字段，仅既有本机主体可读；真实注册身份只消费有归属的策略，不自动获得共享账本权限。无命名组合实体时拒绝任意 portfolioId。
  - 价格与预算：普通行情使用实际单位币种；基金只消费已确认 CNY 元数据资格并在取数后复核，其他币种/未确认/变化均拒绝，不创建持仓或历史净值点。净值日期与未知发布时间分开，原生 unit-nav 数值注册。准备最多 30 秒、10 个规范标的、1,000 个数值字段，按最终固定模型消息验证输入预算；取消信号传至实际数据 HTTP，提交前中断不留模型任务。
  - 定向验证：准备/材料与原 Market 缓存、窗口、边界共 7 文件 75 项通过；共享私有材料与 V2 合同 2 文件 71 项通过；`vitest run test/ai test/research test/integration` 为 64 文件 567 项通过、14 文件 94 项按数据库条件跳过。Server 类型检查及 Server/依赖构建通过，触及源码/测试严格 ESLint（复杂度 20、函数 220）0 错误/0 警告；边界、工作区依赖及 `git diff --check` 通过。构建后离线评估 CLI 退出 0，与既存基线逐项一致。
  - 隔离验证：`node scripts/test-ai-provider-postgres.mjs test/research/submission-http-postgres.integration.test.ts test/research/private-scopes-http-postgres.integration.test.ts test/research/fund-submission-http-postgres.integration.test.ts test/ai/research-execution-v2-postgres.integration.test.ts test/ai/research-execution-v2-lifecycle-postgres.integration.test.ts test/ai/research-submission-v2-postgres.integration.test.ts test/ai/ai-research-sdk-postgres.integration.test.ts` 退出 0，7 文件 51 项通过。其中准备提交 32 项覆盖并发、五范围/模式/身份隔离、准确来源拒绝、旧持仓找回、默认修订变化、预算不足、净值资格/时钟、实际读取超时和断连；准备阶段模型 HTTP 记录为零。V1 保留升级探针通过，34 份 SQL，tmpfs 退出清理；三份准备集成文件已加入既有脚本默认集。测试使用真实核心类和 PostgreSQL、受控来源/缓存/投递，G1 完整模块与 DSA 进程联通仍独立保留。
  - 核查修正：新闻准备材料改为执行端实际消费的非空 `items` 并补直接消费反例；当前现金需账本修订与投影代次一致才注册数值；规范目录查询复用范围事务，单连接 PostgreSQL 验证不发生嵌套连接等待。身份守卫的 Vitest 反射元数据仅在测试装配补齐，生产身份语义未改。
  - 完成/验证：先校验模式/权限/默认模型，再通过 Market 获取材料；准备阶段超时/取消且未提交时不创建任务，提交后断连可按原标识找回并取消；部分资料与必需资料区分。V1/V2 冻结包分别读取，冻结内容、Prompt 和版本后调用现有 AiRun 提交接口。DSA 请求中不含私人账户材料；定向覆盖源文提示注入、伪造工具/引用和跨账户指令，不改变执行权限或提交范围。
  - 停止条件：数据准备不能在既有请求预算内收敛时，先形成独立准备状态机方案，不在本叶引入隐式后台循环。

- [x] **T6：在现有 AI 执行器生成并保存 V2**
  - 覆盖：RA4、RA5；依赖：T3、T4；按 T3 冻结样例可先于 T5 实现。
  - 执行面：Server AI 执行；允许修改 `ai-research.executor.ts`、结果构建/Prompt/SDK 适配协作文件及定向测试，不引入 DSA Agent 或新模型 SDK。
  - 必要合同补充：共享冻结证据增加服务端数值字段映射，保持空映射的序列化兼容；执行时对引用值、单位、币种、派生算子及证据/输入指纹做实际核验。改动只用于完成本叶已有的数值绑定义务，不扩大模板或来源范围。
  - 取消/恢复合同：V2 取消先按提交身份与当前范围权限定位，再与既有请求结算锁定同一 AiRun 行；已完成终态保持不变，已发送请求保留未知，未发送预留保留 not_sent 事实，不制造用量或费用。调用方持久取消后可中止本进程传输，跨进程晚到结果由现有 attempt/租约/终态条件阻断。仅未发送的 prepared 恢复复用原 requestId/预留，不重复计入请求或预算；V1 也沿用这一安全恢复修复。
  - 完成/验证：根据冻结合同版本生成/解析；来源元数据由服务端绑定；引用不在成功证据集、缺必需材料、格式失败均正确终止；重试/取消/租约丢失和晚到结果不重复写入/结算。既有 V1、Journal/策略用途定向回归通过。
  - 发布合同：实现默认关闭的服务端 V2 写入开关，关闭时拒绝新 V2 提交而保持旧任务/双版本读取；已保存的任务按自身版本执行，不因切开关改写快照。G1 可在隔离环境显式开启；目标写入需先通过 G2a/G2b，再由 G3 按原 AI Task 授权启用，不自动恢复真实生成。
  - 实施：V1/V2 按保存的执行合同选择固定 Schema；V2 校验冻结内容指纹、实际字段/单位/币种和派生运算，再将真实 AiToolCall、范围与模型绑定到产物。沿用同一 SDK、请求事实、租约与结算仓储；新提交仅在 `AI_RESEARCH_V2_WRITES_ENABLED=true` 时允许。readiness 显式识别 V2，默认研究合同仍为 V1；冻结路由缺失、模式/适配器/配置指纹不符时在发送前终止。通用 HTTP 入口拒绝客户端写入新增服务端研究审计字段。
  - 局部验证：16 文件 140 项通过，包含指纹/数值反例、V2 开关、V1 执行与提交、实际 localhost SSE、Provider readiness、Journal 和策略合同；Server `typecheck` 与依赖构建通过。全部触及的 T6 源码/测试严格 ESLint（复杂度 20、函数 220）为 0 错误/0 警告，边界与 `git diff --check` 通过。文件尺寸检查通过并保留 8 项存量告警；未提供有效基线，不能据此宣称全仓尺寸 ratchet 已验证。
  - 隔离验证：`node scripts/test-ai-provider-postgres.mjs test/ai/research-execution-v2-postgres.integration.test.ts test/ai/research-execution-v2-lifecycle-postgres.integration.test.ts test/ai/research-submission-v2-postgres.integration.test.ts test/ai/ai-execution-state-postgres.integration.test.ts test/ai/ai-research-recovery-postgres.integration.test.ts test/ai/ai-research-sdk-postgres.integration.test.ts` 退出 0，6 文件 38 项通过。其中 V2 的 12 项贯通真实 Registry、执行器、SDK、Tool 审计与 PostgreSQL，只控制 localhost SSE 和范围权限回答；验证取消/晚到、租约过期、原预留恢复、重复结算、内容损坏及失败仍保留实际用量/费用。34 份 SQL 的保留升级探针再次通过，临时容器退出清理；默认 CI 隔离列表已包含两份 V2 文件，远端 CI 未运行。
  - 修复证据：新恢复测试先复现 prepared 被误当已尝试路由，修复后复用原身份并只发送一次。首轮测试清理的外键顺序已纠正；取消断言依据 sdkExecution 的 unknown/计量修订，而非 AiRun 旧累计列的默认零。受控来源文本不能触发额外工具，模型伪造来源/费用字段或错误数字不产生报告。
  - 证据边界：T5 已接线默认关闭的 V2 HTTP 提交；目标未开启 V2 写入。T7 读取、真实 Provider、目标升级/恢复、浏览器及其他客户端验收继续归相应叶与 G1～G3，真实模型保持暂停。

- [x] **G1：最早的 HTTP 与持久化联通**
  - 完成：2026-10-19，真实 Server、DSA、PostgreSQL 与受控原始来源/SDK/SSE 通过六项 G1 场景及 25 项既有回归，共 31 项；34 项 migration，Server 类型/测试 lint/边界通过。腾讯 ETF 单位缺口先由 DSA D2f 修复，材料门槛保持；见[证据](evidence/2026-10-19-research-http-dsa-postgres.md)。目标保留升级、恢复、真实来源/模型继续由后续门禁独立承担。
  - 覆盖：RA1～RA5 的联通断言；依赖：DSA N3、T2、T4、T5、T6、T7。
  - 执行面：隔离 Server、DSA、PostgreSQL；入口为真实研究提交和查询 HTTP，使用真实模块加受控来源/模型响应。
  - 场景：一只规范证券的新闻/价格材料准备、同请求并发提交、一次执行、持久化结果/引用、历史查询；并覆盖错误模式、资料不足和取消。
  - 完成：无核心实现缺口、无重复任务或结算、被冻结材料可核对。证据明确为受控集成；缺失能力退回所属实现叶，不在本门禁内大规模补实现。

## P1：读取、工作台与评估

- [x] **T7：提供产物与范围隔离读接口**
  - 覆盖：RA3、RA5、RA6 的服务端部分；依赖：T3、T4、T5 的 ResearchModule/控制器装配已交接。读合同可先设计，修改共同装配文件串行进行。
  - 执行面：Server 研究读模型；允许修改 Research 查询/控制器、现有 AiRun 读投影与 `packages/api-client` 对应方法和定向测试。
  - 完成/验证：列表/详情/引用在相同范围与权限下读取；V1/V2 展示兼容；缺可信模式的历史进入显式兼容入口；查询不取最新行情重写旧报告，不执行模型。
  - 接线合同：Research 提供 `GET /research/reports`、`/:id` 与 `/:id/evidence/:referenceId`；普通入口显式传 `view=scoped`、模式和可选范围筛选，历史入口显式传 `view=legacy` 且不接收模式。列表游标绑定身份/模式/筛选；撤权或非法记录不进入列表，详情/引用复用相同权限。旧记录即使带 context.mode 也不升级为可信快照。Ai 导出只读产物查询协作类，Research 传入范围权限回调，依赖方向不反转。
  - 投影边界：V2 读取重新核对冻结指纹、根任务绑定、结果关联、实际 Tool 归属和数字；损坏结果显示不可用，不返回伪造引用。V1 保持原解析器和未记录范围标签，Journal/优化实验不混入通用历史。旧通用任务列表/详情、引用、重试预填和证据入口排除有 V2 身份的任务，避免绕过 Research 的验证；不重取数据或改写历史。
  - 实施：复用现有身份守卫与范围权限；Ai 只读查询在 RepeatableRead 中校验冻结对象及当前权限。分页绑定主体/模式/对象/搜索/状态，撤权记录可跳过且游标继续推进，不推断总数。账户/持仓/组合/策略/独立标的筛选已接入；关闭持仓或目录失效不重写旧 V2 范围。旧 V1 无可信快照，显式历史读取按既有上下文和当前策略归属校验；引用无法确认归属时保留正文为待核验，不开放引用明细。原始 modelMetadata、请求密钥和 Tool 输入摘要不进入新读响应。
  - 客户端合同：`ThesisLedgerApiClient.research` 提供提交/找回/取消、列表/详情/引用，检查父任务、提交标识、模式、对象及版本关联，保留 AbortSignal；提交身份规范化复用共享合同，输入大小写不制造冲突。V2 执行与读取共用根任务关联校验，保存格式与原固定样例未改。
  - 定向验证：读取合同 12 项、客户端传输 7 项，含跨模式/对象响应和引用错配；共享 Schema 全量 104 文件 1,212 项、API 客户端全量 13 文件 86 项通过，Server/API 客户端类型检查通过。新增读职责及受影响的有界协作文件严格 ESLint（复杂度 20、函数 220）0 错误/0 警告；旧 `AiResearchQuery.projections` 的未改动回调在强制 20 规则下仍为 57，不据此声称全仓复杂度通过；该文件常规 lint 通过。提取原上下文权限函数后 AiRunService 降至 508 行，未扩大存量大文件。
  - 隔离验证：`node scripts/test-ai-provider-postgres.mjs` 默认集退出 0，12 文件 91 项通过，含 20 项新读取场景、32 项准备提交、V1/V2 保存、独立服务进程退出恢复、取消和结算。覆盖真实优化尝试关系、策略转让、未知旧模式、篡改数值/来源/根任务/模型、跨任务 Tool 和旧 HTTP 入口旁路；读取阶段不新增来源或模型请求、保存行逐字段不变。脚本先构建当前 Server/依赖；34 份 SQL 的 V1 保留探针通过，tmpfs 退出清理，两份新文件已加入默认集。边界、依赖图、`git diff --check` 通过；尺寸检查保留 8 项存量告警，未提供有效基线。
  - 证据边界：G1 的完整生产模块与 DSA 进程联通、目标 G2a/G2b、浏览器和真实来源/模型仍独立验收；目标 V2 写入保持关闭。

- [x] **T8：完善现有研究创建、报告和引用界面**
  - 完成：2026-10-19，现有工作台完成五范围创建、稳定提交身份及恢复、保存范围读取、引用/质量和旧 V1 兼容。Desktop 受影响八文件当前 57 项、Schema 1216 项、API client 88 项及正式隔离 PostgreSQL 92 项通过；六类浏览器受控场景已实测，详见[消费验收](evidence/2026-10-19-research-workbench-v2.md)。目标写入、真实生成与 R01 联验仍分别保留在 G1～G3 和原 Task。
  - 覆盖：RA6 的客户端部分；依赖：T3、T7 的已验证接口；联通验收依赖 T5/T6。
  - 执行面：Desktop 研究工作台；允许修改 `apps/desktop/src/features/ai/` 及对应 API hooks/测试，保留既有页面结构和共享组件。
  - 完成/验证：独立标的选择、准备/取消、结果、引用、失效条件与质量可读；旧报告可查看；TanStack Query 按模式/范围隔离并取消过期请求。UI 修改使用现有 shadcn 组件和原子类。
  - 关联：不实现第二个模式开关；R01 由原 UI Task 负责，本页转换保护在 G3 联验。
  - 串行接续：先把现有列表/详情装配切到 T7，并提供明确历史入口；再接入五范围 V2 准备、稳定提交身份、响应不明时找回及取消；最后完成 V2 引用、失效条件/质量和浏览器受控验收。原 V1 再次生成流程继续单独使用原合同，普通新建走 V2。能力接口只追加只读的创建开放状态，不改变服务端开关或真实生成决定。

- [x] **T9：建立离线轨迹评估与确定性门禁**
  - 覆盖：RA7；依赖：T0 的实际审计字段清单，可与新闻/页面工作独立推进。
  - 执行面：Server 审计投影及离线评估；允许修改审计导出/投影、固定脱敏样例、评估脚本和 CI 精确入口；不写业务数据或调用模型。
  - 完成/验证：工具出现率、调用成功率、有效证据覆盖分开；成功但空/unknown 不算有效材料。覆盖重复调用、失败/超时/取消、耗时及实际费用完整性，失败尝试不从成本/失败率分母消失；缺记录为未知。越界引用、跨模式和重复结算样例必须失败。报告保存输入/评价版本，性能与主观质量仅作基线；采用 T0R 的反例时绑定真实消费入口，不能以基线曲线相似替代逐项事实/费用/样本断言。
  - 实施：`ai-research-trace-contract/projection/evaluation` 消费实际 AiRun/Tool/Invocation 合同与调用事实转换规则；保持 V1/内部实验/未知分类，不从当前模式或摘要推断历史。`scripts/evaluate-research-trace.mjs` 读取显式脱敏文件，输出版本化报告；没有业务库读取、外部请求或模型调用。CI 在现有 Server 构建产物上增加该定向测试和 CLI 入口；T4 的六项数据库用例同时纳入既有隔离脚本默认集。
  - 验证：19 项新断言加既有计量投影合计 2 文件 22 项通过；Server `typecheck/build`、严格定向 ESLint（复杂度 20/函数 220，0 错误/0 警告）、边界和两个脚本语法通过。编译后 CLI 正例退出 0，重复任务/请求/工具的反例退出 1，临时反例已清理；远端 CI 未运行。
  - 基线：`research-trace-input-v1` / `research-trace-evaluation-v1`；固定合成输入 `apps/server/test/ai/fixtures/research-trace-v1.samples.json` 的字节指纹为 `70d806d607415fd6500341b1f783d46f208a1356f7d4260706b346d2e77d2abc`，与保存报告逐项核对一致。4 条轨迹/5 个请求包含失败、截止超时和取消；已知费用分别为 USD 0.6、CNY 1.2，另有一次实际费用未知及 USD 0.4 预留，未做汇率折算。缺失历史使总证据覆盖为未知，已知子集另列，不显示满覆盖。
  - 证据边界：报价/新闻及 T5 严格合同的账户/组合/持仓、策略材料具备本期可用性判定；其他材料保持未知，必需材料未知时成功 V2 报告被门禁阻断。T5 构建后重放 CLI，原始输入与保存基线未变。每请求超时原因与历史结算事件无法由当前审计可靠重建，分别保留 null/unknown，仅统计明确的研究截止超时和现存结算修订标记。重复修订/身份反例失败，不宣称证明了不可见历史没有重复扣费；主观文本质量和真实来源资格未验。

- [x] **G2a：目标保留升级与双版本读取**
  - 完成：2026-10-20。沿用已通过的目标正式保留升级，补齐同一镜像与正式备份副本的 V1/V2 正向 HTTP、公开 SDK、Web、Journal 严格 V1 及 57 份既有策略结果读取；封存带 V2 的可恢复基线。目标业务数据、镜像、任务/调用数量及关闭状态保持一致。客户端验收范围按用户本次决定为 Web，见[双读证据](evidence/2026-10-20-research-dual-read.md)。
  - 覆盖：RA4、RA5、RA10；依赖：T4、T6、T7、G1。
  - 执行面：目标 Server/数据库；先隔离副本演练，再按 infra 正式保留升级入口执行。
  - 断言：结构 head/矩阵一致、旧 V1 与受控 V2 均能读、已有 Journal/策略结果可读，其他客户端按 T0 清单验证；目标 V2 写入开关保持关闭。记录可恢复的双读基线，开发清库不能替代该门禁。
  - 接口恢复与 G2a-B（2026-10-19，已完成子范围）：旧运行产物缺少 `ResearchModule` 导致资格/报告 GET 为 404；修复仅编译命令的 Node 堆预算后，正式 `update.sh thesis-ledger` 保留升级成功，备份、隔离演练及结构门禁通过，目标 head 为 `20261019020000_research_observation_versions`。公开 GET、实际 SDK 与浏览器已确认资格可读，创建仍关闭，研究/优化任务及 AI 调用记录均未增加。见[运行态回执](evidence/2026-10-19-research-capabilities-runtime.md)。G2a 的完整双读正向样本/消费者、G2b 与 G3 保持未完成，不由空页或 healthy 关闭。
  - 接续只读盘点（2026-10-20）：DSA DG2a/DG2b/DG2c 已通过，目标已恢复同一候选。主库 `AiRun=0`、带研究范围的 Run=0、`ResearchObservation=0`，版本分组为空；没有以空列表补齐双读验收。下一步仍须准备可恢复的受控 V1/V2 正向读取样本并验证既定消费者；目标 V2 写入开关和真实模型保持原关闭/暂停决定，本门禁继续未完成。
  - 本轮叶任务已依次验收；沿用本 Spec 的“先双读、后生产 V2”顺序，受控保存产物只写入正式备份的隔离副本，不向目标业务库补样本。上方 10-19 接口恢复与 10-20 初始盘点为当时状态，完整结果以本轮证据为准：
    - [x] G2a-C1：建立可重复的双读副本入口。复用正式备份校验及同一目标镜像，准备明确标识的 V1/V2 保存产物、审计引用和损坏反例；使用独立资源标记、固定副本库、无外网网络和只读运行账号。恢复、权限及封存检查通过，不算目标生成验收。
    - [x] G2a-C2：实际编译 Server 的真实 HTTP 与公开 SDK 共 20 次请求、33 项断言通过，覆盖双版本、引用、模式与损坏拒绝；156 份有效 Schema 与镜像一致。副本与目标保护状态、任务/调用数量及关闭开关分别核对。
    - [x] G2a-C3：按本次 Web 范围完成现有前端列表/完整阅读、模式切换、原文引用与损坏态；Journal 单对象/周期 V1 正向读取、V2 隐藏及 4 项跨模式拒绝通过，57 份既有策略结果逐份经 SDK 与数据库保存正文核对。目标没有历史 AI 结果，副本另增 1 个受控账户及 4 份明确标记的复盘样本，原有 7 张保护表保持一致；T0 的 Mobile 无直接消费者结论继续保留为源码清单，不计作设备验收。带 10 份保存产物的私有基线已封存，实际恢复兼容由 G2b-A 验证。

- [x] **G2b：执行恢复与回退兼容验收**
  - 完成：2026-10-20。带 V2 的基线实际恢复后，在同一目标镜像/保留副本完成 9 个执行场景、22 个独立进程（4 个 SIGKILL）、7 次本地受控 SDK 请求和 13 次真实 HTTP/SDK 读取。原有报告、审计、业务表及目标状态保持一致，真实模型请求为 0，见[执行恢复证据](evidence/2026-10-20-research-execution-recovery.md)。
  - 覆盖：RA4、RA5、RA10；依赖：G2a、现有 AI Task 的恢复验证入口。
  - 执行面：使用同一候选产物及受控模型响应，按正式脚本执行恢复/回退场景，不消耗真实模型额度。
  - 断言：重启、租约丢失、取消及晚到结果不改写终态/重复结算；带 V2 记录的保留副本可由登记的双读基线读取，回退/恢复不清库。若正式入口或兼容基线缺失，先拆所属实现叶，不能在本门禁临时改部署脚本或调用真实模型。
  - 入口盘点：既有 AI Task 的隔离 R1 已有三进程证据，原 Task 的真实目标在途/Provider 条件继续暂停；infra 尚无研究 V2 专用故障入口，不能复用回测或 Authoring 的名称直接关闭本门禁。按以下叶接续，不重跑输入未变的 R1：
    - [x] G2b-A：从 G2a 登记基线实际恢复带 V2 的数据库副本，使用登记的双读镜像与只读账号验证原文/引用、Journal 合同和保留状态。2026-10-20 实际 `pg_restore` 恢复 10 份 Run/9 条 Tool，7 张保护表及 57 份成功策略结果指纹一致；研究 SDK 20 次请求/33 项断言、Journal 9 次请求/9 项断言通过，副本/目标前后状态一致。固定基线摘要及镜像见[双读证据](evidence/2026-10-20-research-dual-read.md#双读基线与-g2b-a-实际恢复)，完成只计为保存产物恢复兼容。
    - [x] G2b-B0：正式 `research-target-recovery.mjs` 入口及限定数据库/原点/文件/资源保护就绪，主仓与 infra 各 2 项定向门禁通过；使用同一现有镜像，无目标模型请求。
    - [x] G2b-B1a：queued/prepared 两种独立进程退出/重启通过；attempt、请求身份、冻结指纹、单次预留及旧代次拒绝分别核对。
    - [x] G2b-B1b：发送中 SIGKILL 与存活进程租约丢失两种场景通过；Run 收敛为未知结果失败，请求不重放，晚到结果不改写终态或结算。保留请求最后持久化的发送状态，不推定不可见的外部结果。
    - [x] G2b-B1c：四种取消和重复结算通过；只有 3 次已结算请求，合成 USD 0.21、24/15 tokens 来自副本实际存储。9 份新终态与 3 份成功引用经真实 HTTP/公开 SDK 读取；原有报告/Tool、其他表及目标状态一致，资源清理完成。
  - 连续执行（2026-10-20）：用户要求当前 P1 在已授权范围内连续完成；上述叶仅作为验证和证据边界，不作为逐项等待用户接续的停止点。继续保留原数据、Web 范围、真实模型暂停与 DG3 TODO。

- [ ] **G3：真实新闻与获准模型的用户路径验收**
  - 诊断采样本地历史检查点（2026-10-25，D21）：D21a实现及独立本地检查完成；嵌套断言、受影响测试／类型／构建通过，复杂度27恢复基线26，存量告警保留。Schema33／Server420项未变证据复用，76项DB集成跳过。当时D21b全仓边界沿用移动端夹具3条跨层引用失败，未重跑／豁免，未部署／调用模型，V2未改、余8次冻结。[原证据](evidence/2026-10-25-g3-http-response-local.md)。该阻塞后由D23解除，D24快更、D25真实响应与关闭检查点已接续，现行状态以D25为准。
    - [x] G3-D1：共享可选错误诊断合同及 Server 纯诊断模块；字段限长、文本／数字遮蔽、旧合同兼容，超尺寸及缺原文明确未知。写入范围：共享错误合同、AI SDK 失败捕获及定向测试；拆出已过尺寸阈值文件中的错误合同，公开导出保持兼容。
    - [x] G3-D2：本地真实 SDK 失败、原错误事实的生产 Store／JSON 存储边界往返及受影响包构建、类型、边界门禁通过；验证秘密、正文、Prompt／headers 不进入诊断，0 重试，旧记录无诊断仍可读。该往返使用内存 JSON 存储边界，不代替目标 PostgreSQL 验收。Schema 全包 1319 项通过；Server AI 382 项通过、76 项因未配置隔离数据库跳过；Schemas build／typecheck、Server build／typecheck、定向 ESLint／Prettier、边界／依赖／文件尺寸门禁通过，保留 8 条无关存量尺寸提示。实现自评：Ready；不改输出 Schema、数据库结构、请求次数或结算规则。
    - [x] G3-D3：完整更新开启、原样本单次采样及目标 PostgreSQL 诊断落盘通过，本次 1/1 已用尽。故障恢复后，同一保留数据完整更新退出 0；V2=false／canCreate=false，全部目标健康。17 张受保护表、原任务、来源启停／20 条路由、挂载与非 V2 环境摘要保持，两条失败任务及诊断在更新后仍可读取且完整行摘要不变；本轮新增模型调用为 0。仅关闭诊断／恢复子范围，G3 成功报告及引用／历史门禁保持未完成。
    - [x] G3-D4：共享错误诊断追加可选运行包版本与两层流分片摘要；实际包版本、旧记录兼容、样本限长、跨分片 Unicode 摘要与秘密遮蔽通过。不改输出 Schema、依赖、数据库或其他用途；同 feature 内提取模型构建，原适配器规模降低。见[版本与流诊断证据](evidence/2026-10-23-research-g3-stream-diagnostics.md)。
    - [x] G3-D5：原冻结输入的共享 AI 20 项、Server AI 391 项及构建／类型／规范／门禁证据保留，76 项数据库环境跳过。共享导出入口后续变化已原样保留；用户确认复验后，Schemas 全构建、Server 类型、当前入口的 10 项真实本地 SSE／诊断／Store JSON 往返与边界门禁均通过，其余 12 个本轮源码／测试指纹不变。仅本地证据，目标诊断落盘与真实 G3 仍由 D6 验收。
    - [x] G3-D6：已验证目标实际版本 ai@7.0.107／@ai-sdk/openai-compatible@3.0.53／zod@4.4.3，8 个诊断／绑定／反读模块与宿主构建一致。旧成功样本的 JSON／V2 与 D7 反读证据保留；D8 新授权下的首次请求 e46a779e-e0f6-48f4-b5ce-49115c4da568 补齐真实失败分支，SDK 审计、7,368 字节失败诊断及 7,004 字节运行诊断已落目标 PostgreSQL。最终保留数据关闭更新退出 0，失败任务完整行及诊断摘要重建后不变，原报告、历史与旧 AI 记录保留；V2=false、原环境／来源／20 条路由／准入和挂载恢复。仅诊断捕获及持久化门禁通过，不宣称上游问题已消除或旧两字符样本因果已证明；[本轮回执](evidence/2026-10-24-g3-bounded-sampling.json)。
    - [x] G3-D7：最小反读修复完成，14 项新正反例、相关 155 项、Server 构建／类型、规范／边界／依赖／尺寸／定向复杂度通过；79 项隔离数据库用例因未配置而跳过。原报告离线正式读取及官方 `sync-code.sh thesis-ledger` 后的公开正文／11 条引用／未知引用 404／历史／Web 报价和新闻展示通过。随后 `./scripts/update.sh thesis-ledger` 退出 0，新镜像重建后 8 个模块与本地构建一致；同一报告及全部引用／历史再次通过，原报告行摘要不变。V2=false、canCreate=false、原环境恢复，模型仍 1/3，无新增调用；已确认业务更新保留，原 LedgerEvent、其他保护记录、旧 AI 记录、来源／20 条路由／准入及挂载保持。写入仅两处 V2 绑定／反读及定向回归，冻结／数值／归属与引用检查保留，详见本次证据。
    - [ ] G3-D8：正式 G3 未完成。D25 新正式请求实际 HTTP 200／完整 SSE／stop，合法 JSON 未通过 V2 Schema，failed／research_schema_invalid、result=null；本轮 1/1、余 7 次冻结，费用仅冻结定价估算 0 USD。D21 已固化镜像并通过真实响应及失败记录重建反读；关闭更新经 ENOSPC／daemon 故障恢复后退出 0，V2=false、canCreate=false，数据／配置／来源／挂载保持。D20 原 Provider returned error 的响应和根因仍未知；新正式报告／全部引用／成功历史及发布反读未验。[当前检查点](evidence/2026-10-25-g3-single-formal-response.md)。
    - [x] G3-D9：显式兼容扩展的输入／保存／验证接线及首次失败即停授权完成；用户确认同步旧断言、单独重跑原 5 秒超时用例及修正两处类型／一条测试 lint 后，55 项定向、Server AI 396 项（76 项数据库跳过）、Schemas 1319+1 项、Server 构建／Server 与 Schemas 类型／定向规范／边界／依赖／尺寸门禁通过。没有依赖或数据库结构变更，外部调用 0/19；仅本地完成，目标与真实用途由 D10 验收。[证据](evidence/2026-10-24-g3-openrouter-explicit-compatibility.md)。
    - [x] G3-D10：显式兼容配置与两条原启用用途验证、正式保存接线完成；策略编写分析复用已有 0 USD 证明，研究单独复验一次、上游报告 0 USD。普通保存复用两条证明且模型调用为 0，扩展已落库并经完整更新保留；不代收 D8 的 G3 业务正向门禁。
      - [x] G3-D10a：修正 PATH 后以正式 sync-code.sh thesis-ledger 退出 0；六个目标模块／授权合同一致，提交前 17 表／旧 AI 记录／来源启停／20 路由／准入／挂载和环境摘要保持，V2=false。仅代码可写层更新，镜像未更新。
      - [x] G3-D10b：原分析通过证明复用；旧研究 pending 未重发，用户确认后以新 operationId 仅复验研究，通过并报告 0 USD。旧两次请求保守占用 2 次，旧研究实际结果／费用仍未知并保留；本次研究复验另占 1 次。
    - [x] G3-D9P：正式设置序列化优先保存显式扩展，省略时保留原值；测试经过真实序列化。33 项定向、397 项 Server AI（76 项数据库跳过）、类型／规范／边界通过；没有依赖或数据库变更，未新增模型调用。
    - [x] G3-D10c：官方代码更新及目标模块核对通过，正式计划 pending=[]／maxCalls=0，普通保存已将 openrouter-v1 落库；原六条用途启停／默认、其他 Provider、来源／20 路由保持。最终完整更新后扩展与两条证明仍在，V2=false；后续 G3 最新一次业务失败见 D8。
    - [x] G3-D11：实际 fetch 参数的脱敏诊断合同、采集和请求事实持久化实现；最多 1 KiB，仅首个请求与次数，白名单及隐私边界固定，成功／失败接线和旧记录兼容。按用户确认提取诊断组合、参数提取及请求事实合并纯函数，未变更数据库、依赖或门禁。
    - [x] G3-D12：本地最终 HTTP 请求、认证／次数保持、成功／失败生产 Store 与 JSON 账本往返、未知／超长输入及隐私验证通过；定向 32 项、Server AI 403 项（76 项隔离数据库跳过），Schemas AI 26 项／构建、Server 类型／构建及规范／仓库门禁通过，新增函数复杂度不超过 20。仅本地，不代替 D13 目标 PostgreSQL 和真实模型。
    - [x] G3-D13：实际 HTTP 请求诊断的目标验收完成；官方 sync-code 和 V2 开启／关闭完整更新均退出 0，11 个模块一致。真实唯一 fetch 尝试的 650 字节诊断落目标 PostgreSQL，执行／错误／HTTP Schema 和重建反读通过；最终 17 表／旧 AI／DSA 控制／环境／挂载保持，V2=false。模型在上游流式错误处失败即停、无重试，用量和费用未知；本叶只验诊断与恢复，G3 正向业务仍归 D8，余 14 次冻结。[证据](evidence/2026-10-24-g3-http-request-diagnostics.md)。
    - [x] G3-D14：原 G3 请求体 22,542 字节及 SHA-256 完全一致，原生 HTTP 直连一次返回 200／正常 SSE、2,537 事件无 error；标准正文 2 字符／推理 24,729 字符，实际 nvidia/nemotron-3.5-super-vl:free、费用报告 0 USD。确认本样本上游正文不足，SDK 响应解析未参与。原数据／旧 AI／来源／路由／环境／挂载保持，V2 全程关闭；不自动重试或切模型，剩余 13 次冻结。该分类不替代 G3 正式报告验收。[证据](evidence/2026-10-24-g3-direct-http-comparison.md)。
    - [x] G3-D15：官方实际免费端点与可选推理能力核对、本地参数差异和采集验证通过；固定原实际模型并关闭推理，仅直连一次，HTTP 200／stop、JSON／V2 Schema 通过、正文 2,946 字符／推理 0，费用报告 0 USD。未改业务代码／配置／默认或数据，V2 全程关闭，全部保护通过。该直连子范围完成，正式 G3 仍由 D8 持有；余 12 次冻结。[证据](evidence/2026-10-24-g3-direct-http-reasoning-off.md)。
    - [x] G3-D16：用途级 reasoningEnabled／准确 V2 探针／受控单次授权／保存／冻结和指纹本地验收完成；类型最小修正及复杂度 ratchet 通过。Schemas AI28项、Server AI411项（76项数据库跳过）、类型／构建／规范／仓库门禁通过。目标与真实用途仍由D17持有。[证据](evidence/2026-10-24-g3-research-reasoning-sdk.md)。
      - [x] G3-D16a：研究V2可选 reasoningEnabled、保存／省略保留、运行／验证指纹通过；分析指纹与原证明保持，错误用途／配置拒绝。
      - [x] G3-D16b：准确V2 Schema／消息透传、首次失败即停的受控单次授权、最终本地HTTP reasoning.enabled、冻结与派发匹配及旧记录兼容通过；没有隐式默认或其他用途注入。
      - [x] G3-D16c：9项Schema／39项Server定向及补充断言通过，最小类型修正后最终类型／包级28＋411项／构建／仓库门禁通过，存量复杂度不增加；局部失败历史保留。
    - [ ] G3-D17：官方sync-code退出0、14个实际模块和保护通过；唯一研究用途复验因强制推理被拒，未保存配置、未提交G3，无重试。该阶段预算1/2已用、当时余11次，实际模型／用量／费用未知（仅估算0 USD）。该阶段仅更新可写层；10月25日D20已通过完整镜像开启／关闭更新及14模块核对。旧拒绝事实保留，现行接续由D20持有。
    - [ ] G3-D18：免费候选目录／正式计划通过，唯一真实研究用途返回Provider returned error后停止。模型1/1、余10次冻结，未保存Provider或默认，V2=false；原全部用途／证明、17表、旧AI、来源和20条数据路由保持。实际费用未知，仅免费配置估算0 USD。是否只读核对本次错误日志待确认。[证据](evidence/2026-10-24-g3-free-model-switch.md)。
      - [x] G3-D18a：实时免费目录及DeepSeek免费端点核对，候选价格／推理／结构化参数和新保护基线通过；当前canCreate=false、V2关闭。
      - [ ] G3-D18b：正式计划仅候选研究1条待验，复用原两条证明；唯一V2探针上游错误，pending／failed为同一请求，未重试／保存。剩余卡点为该错误的具体原因；不能声称JSON／V2通过。
      - [ ] G3-D18c：默认切换未执行，研究默认仍为openrouter/free、修订5。最终逐行核对17表、旧AI、Provider、原用途／证明、来源控制、20条路由／环境／挂载通过，V2关闭；待D18b解除后再更新默认。
    - [x] G3-D19：原free入口结束诊断通过；原请求体22,542字节及摘要完全一致，唯一HTTP200／SSE完整／stop、同一实际NVIDIA免费模型保留推理，正文6,953字符、完整JSON／V2通过，费用报告0 USD。1/1、余9次，17表／旧AI／来源／20条路由／环境保持，V2关闭；旧失败结束原因仍未知，本次未复现，不据此修改解析器或模式。[证据](evidence/2026-10-24-g3-free-finish-diagnostic.md)。
    - [ ] G3-D20：官方保留数据开启／关闭完整更新均通过，唯一正式free请求在stream阶段失败；当时1/1、余8次冻结，实际用量／费用未知。V2关闭与旧AI／新失败／原行／来源控制／20路由／环境保护通过；策略两表新增保留。原响应事实未留存，当时同步又ENOSPC；D25新请求的HTTP200／Schema失败不能回填原根因，历史事实保持。[回执](evidence/2026-10-25-g3-formal-free-sdk-recovery.md)。
      - [x] G3-D20a：17个输入、原默认／用途、新闻准入预检通过；官方开启更新退出0，14目标模块一致，单次零费用策略、原行／来源／20路由及挂载核对通过。
      - [ ] G3-D20b：正式提交200／queued，唯一请求transport_unknown／stream／Provider returned error，任务failed／research_unknown_outcome、result=null；实际模型／用量／费用未知，未通过JSON／V2正向生成，不重试。
      - [ ] G3-D20c：未产出本次报告，正向报告／全部引用／历史及重建后反读均未执行；旧证据按不变输入保留，不代收本叶。
      - [ ] G3-D20d：安全关闭分支已过：官方关闭更新0、V2=false／无策略／canCreate=false，14模块及新失败摘要重建后保持，原行／来源／20路由／环境／挂载保护通过，策略新增保留。因无本次报告，正向报告重建反读仍缺，保留未勾选。
    - [x] G3-D21a：响应观察与脱敏合同本地实现通过；获准的版本数组类型与等价嵌套断言均已修正。受影响测试／类型／构建、默认lint／格式通过，Schema33／Server420项未变证据复用；只读对照确认断言复杂度27恢复增量基线26，存量方法30／测试26告警保留。原请求、解析、重试、结算和业务配置未改，不代表目标已部署。[本地证据](evidence/2026-10-25-g3-http-response-local.md)。
    - [ ] G3-D21b：D21a／D22 本地响应与 Store JSON 证据保留，D23 前置解除、D24 快更完成。D25 经正式 update 将 D21 固化镜像，Server／Worker 各 15 项及实际 Schema 一致；已取得真实 HTTP200／完整SSE响应诊断（329字节）与失败记录重建保持，最终 capabilities200／canCreate=false、V2=false。新正式报告／引用／成功历史仍未通过，保留未勾选；余7次冻结。[真实响应与部署回执](evidence/2026-10-25-g3-single-formal-response.md)。
    - [x] G3-D22：本轮授权内的零真实调用 D20 故障特征对照完成；未发现固定反例证明的本地业务缺陷，没有生产补丁。现有 D21 可区分本轮场景，但目标部署及原正式 G3 仍未验收；本轮模型／部署／目标配置／业务写入均为 0，余 8 次冻结。[路径、矩阵、指纹与下一次核心问题](evidence/2026-10-25-g3-fault-signature-matrix.md)。
      - [x] G3-D22a：盘点原四组测试及实际安装依赖，核对 D20 路由、错误包装、观察器启用条件和快照时机；沿用原 RSP1～RSP4，补充 RSP5 对照边界。
      - [x] G3-D22b：在原测试补齐 A～F 和 fetch 同文案／正常 EOF 子分支，保留原 401 对照；全部九场景比较旧合同／V2，每次实际 fetch=1。先取得观测再固定错误／计数／响应／包装断言，四组指定测试及两组单测共 40 项通过；最终矩阵文件 9 项复验通过，余 31 项输入未变复用。最终类型／规范／格式通过，原复杂度 26→26，没有新增告警；原失败诊断测试补充精确地址外网阻断。
      - [x] G3-D22c：候选排序与反证、D20 与当前代码可比边界、D21 足够性及下一阶段唯一问题已记录；A 完全匹配但 E2 也可匹配，标准 SSE error 在当前有效观察链先计 1 帧。未证明本地业务缺陷，生产补丁及修复三段反例不适用；没有新增诊断留存。工具入口／路径异常与设计内负例分开记账，G3-D8／D20／D21b 保持未完成，不自动进入部署或真实采样。
    - [x] G3-D23：本轮部署前置范围完成；保留现有 WIP、HEAD 和空索引，模型／部署／目标配置／业务写入为 0，余 8 次冻结。三条手机引用解除，capabilities 当前代理路径定位，目标模块核对完成；D21 未部署，D8／D20／D21b 保持未完成。[证据与指纹](evidence/2026-10-25-g3-d21-preflight.md)。
      - [x] G3-D23a：原门禁基线精确失败 3 条；手机改用自有四份合成字段及公共 Schema 工厂，原生成脚本保留且不执行 Server 算法。修复后原边界命令通过、脚本 SHA-256 不变；9 项定向、手机 src 类型及新增测试聚焦类型通过，原 JSON 摘要及四字段语义保持；手机原任务同步。首次命令误扫验收包的失败单独保留，未改包或排除规则。
      - [x] G3-D23b：仅四次预定 GET 对照：Context Mode 无代理环境变量、回落 macOS 127.0.0.1:7890，默认空 502；同一 Python 显式直连返回 200／canCreate=false，与宿主默认／直连摘要相同。目标 handler 一致且为只读；未修改系统代理、环境或目标配置。旧 502 无原响应，不补造其历史来源证据。
      - [x] G3-D23c：Server／Worker healthy、SDK 版本一致，Server V2=false／无策略；实际 Schema 包入口核对后，每面 15 模块为 7 一致／5 不同／3 缺失，D21 尚未部署。实际项目编译器内存发射的 10 个 AI 模块均与宿主产物一致、诊断 0，无产物写入或镜像构建；D22 的 30 个输入未变。目标路径／单文件转译方法问题已纠正并记账，未误报包缺失或源码过期。
    - [x] G3-D24：本轮授权的 D21 当前运行态部署完成；最小 thesis-ledger 目标通过正式 sync-code.sh 更新 Server／Worker，不更新镜像。双面 15 项一致、capabilities 200／canCreate=false，V2 关闭／无策略；22 表、配置、挂载及原 D20 失败保持。本轮模型 0、余 8 次冻结，不 stage／commit，G3 总验收及真实响应／镜像重建保留未完成。[完整回执](evidence/2026-10-25-g3-d21-deployment.md)。
      - [x] G3-D24a：D22／D23 输入未变证据复用，脚本语法退出 0；部署前 22 表、环境／挂载／文件摘要基线已记录，AiRun／回测／编写／优化无非终态任务。实际 database／owner／结构 head 核实，不隐式触发模型或更改配置。
      - [x] G3-D24b：两次正式调用的运行／镜像／四清单／Prisma 整目录预检均通过。首次因升级环境缺 node 在构建前段退出 1，尚未同步；核实现有 Node v24.18.0 后以一次性 PATH 重新执行同入口，四包构建及双面快更／重启／健康退出 0。没有安装依赖、改持久环境、绕过门禁或改用完整更新，镜像保持不变。
      - [x] G3-D24c：Server／Worker 实际模块各 15 项与宿主一致，实际 Schema 包响应文件存在且 runtime.httpResponse=true；SDK 版本保持，明确直连 capabilities 200／canCreate=false。22 表完整摘要／D20 行／环境／infra 文件／五容器 ID 镜像挂载保持，只有两个目标重启；启动后有界日志无错误级／缺模块／缺表信号。只验当前可写层，真实模型／重建持久化及正式 G3 未验。
    - [x] G3-D25：本轮单次正式新请求及失败收敛／关闭保护已执行；结果未通过 G3。openrouter/free／shadow／recent-changes，实际 1 次、费用约束 0 元，首次失败后无新增模型发送，余7次冻结；V2已恢复关闭。新提交与冻结材料独立于D20，旧失败、数据与WIP保留，未stage／commit。[证据](evidence/2026-10-25-g3-single-formal-response.md)。
      - [x] G3-D25a：官方免费定价、默认修订5／原用途ready、两面15模块／实际Schema、新闻准入及22表／7条旧AI／来源四表／20路由／环境挂载基线核对；单次策略和官方关闭步骤已准备。30个已验输入保持，复用D22／D23范围。
      - [x] G3-D25b：最小thesis-ledger正式update开启成功，实际包一致后仅提交新请求一次；fetch1、HTTP200、完整SSE／stop，合法JSON未通过完整V2合同，failed／research_schema_invalid。用量5613／11349 token已报告，费用仅估算0USD；实际费用未知。11份冻结证据完整性及最终请求摘要同体核验通过，离线核验真实调用0。
      - [x] G3-D25c：失败后停止新增发送，未进入成功报告／引用验收。首次关闭ENOSPC且daemon离线，现有恢复入口普通重启超时，后续受控核查已就绪、强制分支未触发；正式入口自动整备空间后关闭退出0。V2=false／无策略／capabilities200且canCreate=false，两面各15模块一致；22表原行、7条旧AI、新失败／11工具记录、来源四表／20路由、环境／配置／挂载保护通过，失败详情与历史反读保持。infra恢复分支11项替身测试通过，真实强制动作未验。
    - [ ] G3-D26：先确认上游正文，再分析校验；本轮只读追查与离线取证准备，剩余7次冻结，不部署、不改配置／业务数据，不stage／commit。
      - [x] G3-D26a：只读核对D25完整AiRun与非冻结／Prompt字段、诊断文件、保存逻辑和原容器；正文摘要无对应原文，result=null，原容器已移除，当前为json-file日志，未找到独立正文归档。原失败记录保持，不用新响应回填历史。
      - [x] G3-D26b：独立response.clone取证入口完成，8项协议／有界／防重复测试及完整SDK离线fixture通过；D25最终请求22517字节／摘要匹配，SDK schema_invalid时上游正文仍逐字取得，真实调用0。只读复核发现Docker挂载数组顺序不稳定，比较前按完整属性排序，仍保护容器身份／启动时间与全部挂载字段；最终22表／旧AI／来源／环境／挂载保护通过。入口仅作为准备证据，后续由D27正式trace承接。
      - [ ] G3-D26c：仅在用户明确解除一次调用冻结后执行同体新采样；最大1次／0元约束、不重试，V2保持关闭，不写业务表。先交付上游正文私有文件及响应事实，再独立校验；当前未获该新调用授权，不能执行，剩余7次保持冻结。
      - OpenRouter历史正文存在独立只读接口，但仅当请求发生时启用了私有输入／输出日志。现有推理Key查询analytics/meta实际403，需要管理Key才能列历史；浏览器入口两次创建超时，尚未取得该条generation ID／正文。未创建或扩大凭据权限，也未开启日志设置；不能据本地缺失断言上游未留存。用户随后明确选择实现正式节点trace，继续D27，不反复索要ID。
    - [ ] G3-D27：正式请求链trace代码与离线验证完成，门禁解除及部署由D28承接；该阶段真实模型0，余7次冻结、V2关闭。真实选中任务捕获及重建持久化仍未验，G3整体未通过。
      - [x] G3-D27a（状态与接口）：AI拥有的引用、节点／artifact合同及0700／0600私有存储落地，响应／artifact各2 MiB、单trace8 MiB；未完成反读为incomplete且不回写。`capture-v1`显式创建只保存新任务引用，run／owner／attempt绑定，默认关闭；旧提交复用、身份／范围及V2门禁保持。[证据及离线样例](evidence/2026-10-25-g3-request-trace.md)。
      - [x] G3-D27b（执行面）：正式SDK fetch接缝使用原生／受控HTTP adapter，同一响应状态／headers／字节继续交给SDK；逐requestId单次派发。SDK输入／Schema、最终请求、脱敏payload、独立原模型正文、SDK输出／异常链及独立校验路径均可读取；发送前保存失败本地阻断，发送后保存失败保留原业务结果。受控编译后样例物理HTTP1、真实模型0、完整V2 Schema拒绝时正文仍独立保留。
      - [x] G3-D27c（消费面）：接入Executor领取、SDK生成、业务结果构建、StateStore原结算／CAS与最终状态反读；父子节点、原操作返回值及终态事实保持。受限只读CLI、身份／路径／symlink／大小／摘要核验、凭据／Cookie／嵌套错误JSON／推理脱敏已验证；共享日志只记录索引／状态。trace反向依赖门禁及全仓boundaries通过；目标数据库并发／启动／卷验收仍归D27e。
      - [x] G3-D27d（本地验证）：受控HTTP+真实SDK+业务状态闭环覆盖合法JSON但Schema失败、成功、HTTP错误／SSE错误、无响应／取消、保存失败与默认关闭；原物理fetch1、字节／正文保留、校验路径和节点I/O证据保持。原全仓门禁阻断已由D28a解除，真实部署／模型验收仍独立保留。
        - 已通过：新trace33项、最终定向10文件110项；Server包419文件3437项通过／356项条件跳过，后续未完成反读增量由最终定向覆盖；Server类型／build、修改范围lint、边界、依赖8包、密钥16843文件、文件尺寸ratchet、diff check。Server同guardrails规则1237文件0错误，保留179项警告。
        - 原阻断已解除：D28a按Git源码归属与精确文件列表修复入口，全仓8组2665文件guardrails、边界、依赖图和文件尺寸门禁通过；保留验收包，未调整阈值／ignore／project service许可。旧失败见D27证据，新结果见D28。
      - [x] G3-D27e（部署验收）：D28无模型部署、D29镜像固化及TLS失败链持久化通过；D30独立获准单次补验完整捕获真实HTTP200、上游两字符正文、SDK相同文本／JSON解析错误及业务终态，18文件与D29旧12文件在双端重建后保持，见[D30回执](evidence/2026-10-25-g3-upstream-trace-acceptance.md)。本叶为trace部署／捕获／持久化通过；业务报告仍failed，G3整体未通过，V2关闭、余5次冻结。
    - [x] G3-D28：验收快照门禁阻断解除，并经infra正式最小thesis-ledger快更部署trace，独立无模型运行态核对通过。真实模型0、V2关闭、余7次冻结，原业务数据／配置／挂载及验收包保留，无stage／commit。[完整证据](evidence/2026-10-25-g3-trace-deployment.md)。
      - [x] G3-D28a（门禁源码归属）：`lint-workspace.mjs`＋职责单一的清单模块／测试落地；6项测试证明Git已跟踪＋未忽略WIP并集、已跟踪ignored源码保留、真实违规失败、中文／空格路径、删除及Git失败关闭。全仓原guardrails8组2665文件、边界、依赖图／文件尺寸通过，11份trace源码及未跟踪研究Controller均纳入；无release输入，未改ignore／阈值／project service许可。验收包原位保护基线已保存，部署后再对照。
      - [x] G3-D28b（兼容性与保护预检）：5容器健康，目标无queued／running研究，V2=false、capabilities200／false；22表、8条AI、DSA控制／20路由、环境及挂载基线已保存。正式sync-code内置Server／workspace清单、完整Prisma与容器／镜像预检通过，无需完整更新；复用D27未变源码的高成本测试。
      - [x] G3-D28c（正式部署）：从infra执行 `./scripts/sync-code.sh thesis-ledger` 退出0；仅Server／Worker重启，容器与镜像ID保持，未执行结构或外部卷变更，未回退到update。仅可写层更新，不代表镜像已更新或重建后仍保留trace。
      - [x] G3-D28d（无模型运行态验收）：两面各Server2037／Schema579／domain243／shared3文件摘要均与宿主一致，实际Schema物理包与runtime.httpResponse已核对；两面受控SDK／trace仅在内存运行，各1次受控transport、外部请求0，Schema拒绝时原正文与SDK文本一致。5容器健康、重启后有界日志无错误级／缺模块／缺表／ENOSPC信号；私有根位于共享RW卷，UID100可写父目录，目录尚未创建，实际文件捕获未代收。capabilities200／false、待执行研究0、22表完整摘要／旧AI／DSA控制与路由／环境／挂载保持。旧22,452份验收文件元数据与359份TS内容摘要保持；并行batch6新增文件与其他WIP保留。真实模型采样、实际选中任务捕获与重建反读保持未验。
    - [ ] G3-D29：验收一次真实模型trace及同镜像重建持久化；最多1次free请求／0元约束／失败即停，其余6次冻结。新任务与trace独立保留，旧失败不改写；完成后V2恢复关闭、策略移除，不stage／commit。
      - [x] G3-D29a（预检与正式入口）：22表、旧AI、DSA、环境／挂载、三仓10113项WIP文件及46项执行源码指纹已保存；原默认修订5、V2用途ready／native_schema／推理默认、免费路由、空闲和单次锁通过。infra R1镜像复用及原门禁回归通过；准备同镜像恢复关闭／无策略命令，未变应用证据沿用D28。
      - [x] G3-D29b（镜像与窗口）：正式 `update.sh thesis-ledger` 退出0，新镜像 `sha256:d1e5369eefa33638b2847dc30563c84e41a1511e836a11200bd25a5467c738de` 含trace；两消费者及实际Schema、Server2037／Schema561／domain228／shared3项与当前源码产物一致。宿主旧dist另有33项已无源码的残留，未删除WIP，未计为新镜像缺失。临时V2＋单次零费用策略、capabilities200／canCreate=true、22表及旧AI／DSA保持、无待执行研究和双端离线探针通过，尚无真实调用。
      - [ ] G3-D29c（该次真实单次未通过）：run=`b0ce2e5e-6cb6-4cef-8160-42221b875d47`／trace=`ba68ab6e-6b05-4bad-be33-f2338925a718`／attempt=1在TLS建立前断开，无上游HTTP状态／正文，业务failed／research_unknown_outcome。失败trace完整，1次nativeFetch、12文件，未重试。该次历史缺口不以新正文回填；之后的新授权及上游正向trace由D30独立验收，原文件保持。
      - [x] G3-D29d（关闭与重建）：同镜像正式复用入口退出0，两消费者身份改变；同卷12文件／123169字节、manifest和数据库终态逐字节及权限归属保持。V2=false／无策略、capabilities200／canCreate=false、pending=0，22表旧行、原环境、全部挂载、旧AI及DSA控制／20路由保持，五服务健康。
      - [x] G3-D29e（评审与交付）：[D29回执](evidence/2026-10-25-g3-real-trace-persistence.md)及同名JSON已记录请求体可复算摘要、SDK错误原文／cause链和私有路径、无上游正文、费用未知、关闭重建与数据保全。随后仅TLS握手成功、HTTP／模型请求0；原断链节点仍未知。D29c与G3保持未勾选，不将失败捕获完整视为真实报告成功，后续请求需新授权。
    - [x] G3-D30：独立授权仅用1次，真实上游正文／SDK／业务trace和同镜像重建持久化通过；报告仍failed／research_schema_invalid。正式关闭与旧数据保护通过，余5次冻结，无stage／commit。[完整回执](evidence/2026-10-25-g3-upstream-trace-acceptance.md)。
      - [x] G3-D30a（状态与执行预检）：新提交与单次锁已准备；22表、9条旧AI／99条旧工具、DSA控制／路由、环境／挂载及三仓WIP基线保存。原默认修订5／用途ready、46项未变执行源码、双端TLS握手通过；正式复用D29镜像开启退出0，两面Server2037／Schema561／domain228／shared3及实际Schema一致，V2＋单次零费用策略、capabilities200／true、pending=0通过，派发前业务原行保持。
      - [x] G3-D30b（单次执行）：run=`215dc5cf-9d50-4a6a-ae9d-6f8dfb7a6f87`／trace=`e7418aa5-7513-4f3a-8951-9336c4f96840`／attempt=1；单次HTTP200／完整SSE／stop／DONE，原assistant仅2字节 `{"`，与SDK文本及SHA相同。SDK实际AI_JSONParseError、独立JSON检查无效，业务failed／research_schema_invalid；captureStatus=complete，无补发或源码／模型／Schema修改。
      - [x] G3-D30c（消费与部署验收）：同镜像正式关闭退出0，两消费者身份改变；本次18文件／2201285字节与D29原12文件在两端逐字节及权限归属保持。V2=false／无策略、capabilities200／false、pending=0，五服务健康；22表全部旧行、9条旧AI／99条旧工具、DSA、环境和挂载保持，仅新增本次1任务／11工具；报告明细／历史如实反读failed／missing。
      - [x] G3-D30d（评审与交付）：[D30回执](evidence/2026-10-25-g3-upstream-trace-acceptance.md)及同名JSON固定原文／SDK／SSE私有路径、generation ID、wire与保存摘要、三层归因、用量／费用来源、原配置恢复和双trace重建证据。Provider自报cost=0与业务冻结定价估算0 USD分开；为何上游stop时只生成两字符及G3成功报告仍未完成，余5次冻结。
    - [ ] G3-D31：只读核对D30实际stop／max_tokens／reasoning／response_format，追查两字符正文原因；无新模型调用、部署、配置或业务修改，余5次冻结，保留原WIP／验收包，不stage／commit。
      - [x] G3-D31a（原参数）：原wire摘要可复算；stop未发送，max_tokens=20000，reasoning／reasoning_effort／include_reasoning未发送，response_format为json_schema／name=response／strict=true，Schema8671字节／SHA与SDK诊断相同；SDK maxOutputTokens=20000，无截断或取消事实。
      - [x] G3-D31b（默认与声明）：Nvidia官方说明默认完整推理；OpenRouter当前同canonical免费Nvidia端点声明response_format／structured_outputs支持、max_completion_tokens=131072。声明不能证明该次转发参数或严格解码实际生效；原Provider native_finish_reason=stop，尚无20k上限耗尽证据。
      - [x] G3-D31c（本地排查）：46项执行输入未变；SDK maxOutputTokens→max_tokens映射、未发送stop、system／user消息且无已检查终止标记均核对。Draft-07元Schema和完整generation样例通过，原SSE两个终止帧均stop／native_stop且无stop_reason。保留Ajv tuple警告及长度0／1／2／3反例；JSON Schema比Zod宽的确定性差异单列D32，未改应用或Schema。[完整证明](evidence/2026-10-25-g3-request-parameter-audit.md)。
      - [ ] G3-D31d（根因确证未完成）：最早异常为OpenRouter返回的content仅2字节；未发现客户端显式stop、本地20k限额耗尽、timeout／取消或SDK截断。vLLM37362相似报告仅为离线Nano／Guidance候选，过期关闭无修复结论，本次服务后端未知。确证仍缺当次OpenRouter→Nvidia真实转发body、Nvidia原始stop_reason／内部限额及服务版本；原I/O日志和debug回显未启用，现有记录不可补造，未追加调用或发送外部消息。
    - [ ] G3-D32（已确认待后续修复）：native Schema中的derived numericClaim.operands长度约束丢失，长度0／1／3被JSON Schema接受但Zod拒绝。按RSP15治理Schema转换语义一致性，保留严格业务规则；先离线0／1／2／3及完整样例，再按变更范围验SDK／生成Schema。本轮仅登记，未实施、不新增模型或部署，不归因为D30两字符根因。
    - [ ] G3-D33：用户明确授权的固定D30实际Nvidia模型、仅本次关闭reasoning的1次零费用对照已执行并失败停止，余4次冻结；在线首chunk超时、后补控制台JSON通过但Zod引用校验失败，业务验收未通过，不能自动补发。不改默认配置／数据／WIP，不stage／commit。[执行回执](evidence/2026-10-25-g3-reasoning-off-control.md)。
      - [x] G3-D33a（控制与预检）：D30原messages／Schema冻结，canonical免费Nvidia端点核对；离线SDK探针通过，外部模型0，实际请求仅model／reasoning两处变化，stop缺省／max_tokens20000／response_format及其余字段不变，停止与限额漂移被拒绝。46项源码及宿主编译产物与D30匹配；10条旧AI／110工具等22表、默认修订5、环境／挂载及三仓WIP基线保存。宿主Node24.18、目标24.21，SDK／编译代码相同，记录环境差异；V2关闭，无业务写入。
      - [ ] G3-D33b（单次已执行，在线接收及业务接受未通过）：run=a4c1a658-3ab4-4f95-9cb9-b96835443ed2／trace=7a98b353-fe89-4112-b91c-58fdec8b6170，仅派发1次；HTTP200后30秒首语义chunk超时，SDK cancelled，captureStatus=incomplete／response_read_error，本地正文0字节、无DONE。只读generation元数据确认canonical Nvidia／推理0／原生输出2155／stop／费用0／耗时45445ms；后补控制台正文按D33e独立核验，未回写本地响应，失败不补发。诊断未写AiRun或业务结果，完整在线接收和业务正向验收仍缺。
      - [x] G3-D33c（关闭与保全）：V2始终关闭、无临时策略、canCreate=false／pending=0；默认修订5／22表／10旧AI／110工具／Provider／DSA／环境／容器与挂载保持。现存trace的9份产物82047字节可反读且摘要一致，网络响应仍不完整；三仓HEAD／配置／空暂存区和原WIP核对，新增模型请求仅1次，余4次冻结。
      - [x] G3-D33d（判读并保留缺口）：请求仅model／reasoning两项变化；上游reasoning_tokens由10103变0，原生输入仍5601、输出10106变2155。SDK先于上游记录的45445ms结束停止读取；控制台后补证实本次JSON完整、两字符现象未重现，业务引用校验仍失败。单次结果与宿主／路由差异不足以确证内部原因；D31根因、D32约束差异和G3正式报告仍未完成，本次失败后未改超时或重试。
      - [x] G3-D33e（控制台正文补证）：用户提供同generation完整completion；私有独立副本／摘要与来源明确，不改原incomplete trace。JSON.parse及原wire Draft-07 Schema通过，Zod报告“研究动作引用不存在的断言”，定位nextSteps[1].claimId=ic-price-baseline-missing仅为条件id。同版本合成SSE探针返回schema_invalid，外部0；算术复核应约1.25%而rationale写1.26%，派生项未列numericClaims、五日方向仅用当日关系，作为人工内容问题保留，不冒充自动拒绝项。46项源码／原manifest未变，无新增业务写入，余4次冻结。
    - [ ] G3-D34：自适应超时与同Provider／模型重试的实现及工程验收由[独立Task](2026-10-25-ai-adaptive-execution.md)所有；本地109项和隔离缓存通过，D35已将新代码固化到目标、核对实际决策及单次失败停止。T5真实成功输出仍未通过。原D33 trace不回写，不放宽业务校验或改变默认配置；本次预算以D35为准。
    - [ ] G3-D35：RSP18单次正式复验已执行并因上游HTTP404停止，正向报告未通过；本次1/1、余3次冻结，未重试或改变默认模型／推理。[回执](evidence/2026-10-25-g3-adaptive-runtime-acceptance.md)。
      - [x] D35a（状态与预检）：D34生产源码摘要未变，109项本地验证复用；53项执行输入、原22表／10旧AI／110工具、环境／挂载及三仓WIP基线保存，V2=false／无策略／pending=0。默认修订5／OpenRouter/free／native_schema就绪，新提交与单次锁入口准备，模型0。
      - [x] D35b（目标部署）：初次依赖I/O失败及入口自带重试后退出1；经已核对的仅构建代理参数重试正式update退出0，未改配置文件。新镜像df411ebf…固化D34代码，双角色健康、Server2052／Schema561／domain228／shared3份清单与当前编译输入一致，实际Schema及自适应模块核对，capabilities200／true；53项执行输入／默认修订5保持。
      - [ ] D35c（单次已执行，正向输出未通过）：run=7d957e4e-372a-4c8a-bd3c-d713950d9ae2／trace=cd858b89-f1fc-45da-a20e-dc48552723d7；SDK实际三项超时299935ms／cold_start／maxRetries0，唯一HTTP约2.6秒收到完整404错误JSON808字节，无模型正文。Nvidia Function对account不可找到，另附Nvidia500／502与Phala429内部路由记录；SDK仍归transport_unknown，账本unknown、业务research_unknown_outcome，未补发。generation只读GET亦404，用量／实际费用未知。
      - [x] D35d（关闭与持久化）：同一新镜像经正式入口关闭退出0、无再构建；两消费者重建，V2=false／无策略／pending=0、capabilities200／false及五服务健康。双端本次16文件和D30旧trace逐字节／权限／归属保持；原22表旧行、10旧AI／110工具、默认／环境／DSA／挂载不变，仅新增本次1任务／11工具，现11／121。三仓WIP／HEAD／配置及空暂存区保全，不stage／commit。
      - [ ] D35e（失败消费已验，成功消费缺口保留）：失败明细／历史GET200、failed／research_unknown_outcome／missing与数据库一致；没有成功报告／全部引用／成功历史／Web可验，仍未通过。真实trace完整捕获与业务正向结果分别判定；本次1/1、余3次冻结，费用上限0不冒充实际费用0，准确HTTP拒绝分类与D31／D32历史缺口保持。
    - [ ] G3-D36：RSP19另获准再试1次；默认路由／推理／严格V2保持，失败即停，实际派发后余2次冻结。D35原404及generation记录保持，不以控制台未显示抹除请求事实。
      - [x] D36a（身份与预检）：当前凭据SHA-256及标签首尾与用户贴出的控制台记录一致，纯本地比对、外部模型0、未输出Key。53项执行输入／已验镜像df411ebf…一致，V2=false／无策略／pending=0，默认修订5／OpenRouter/free就绪；11旧AI／121工具及22表、配置／挂载基线保存，新提交身份已冻结。
      - [ ] D36b（开启与模块）：正式update thesis-ledger指定已验镜像复用，核对双角色／实际Schema／自适应模块／capabilities和单次策略，无新构建，再允许唯一提交。
      - [ ] D36c（单次执行）：唯一HTTP派发及实际超时／重试、原始响应／generation、SDK与业务结果分层核对，失败或未知即停，按实际派发结算余量。
      - [ ] D36d（关闭与保全）：同镜像正式关闭V2并移除策略；重建反读本次与D35原trace，原数据／配置／来源／挂载和WIP保全。
      - [ ] D36e（消费与判读）：报告明细／历史／引用及实际业务终态核对，保留成功消费缺口与未知费用，更新权威入口。
  - 新闻范围更新历史（2026-10-23）：用户确认补齐原正式入口的受控更新分支，保留原截止日、到期日、来源启停及 20 条路由；首次业务采样当时获准 1 次、0 元，现已用尽。后续独立诊断采样与恢复以 G3-D1～D3 的当前回执为准。
    - [x] G3-N1：同一入口补齐两条精确新闻目标的显式范围扩展；写锁内核对旧版本／摘要、来源／凭据修订、有效期与启用状态，追加旧记录审计链。
    - [x] G3-N2：Node 10、原 worker 11、独立 SQLite 6 项共 27 项通过；覆盖更新／只读核验及漂移、续期、范围／来源、撤销／过期、凭据变化拒绝，首次新增保护不变。
    - [x] G3-N3：原来源单页实读、两条准入版本 1→2 及只读回验通过，起点 10 月 16 日，原截止／到期日保持；其他 7 条准入、启停、20 条路由及业务表保持。
    - [x] G3-N4：真实新闻准备、获准模型成功生成、报告／11 条引用／未知引用拒绝／历史及 Web 展示通过；同一原结果在最终完整更新后仍可读取，费用按冻结免费定价估算 0 USD。历史两次独立授权各 1/1 的失败事实保留；本次独立最多 3 次授权仅使用 1 次，反读失败后停止，获准修复复用原结果，无新增调用。V2 已关闭，原数据、来源启停与路由按确认保护。此项不代替 D6 尚未覆盖的真实失败流诊断。
  - 首次单次验收历史（2026-10-23）：V2 用途验证与新闻七日窗口准入均已解除；同一样本的真实 G3 请求实际使用 1 次，配置估算 0 USD，来源报告 5,644／9,441 token，但响应无法解析为 V2 对象，任务 failed、`result=null`。原默认 OpenRouter/free、修订 5 保持。正式保留数据开启／最终关闭更新均退出 0，`canCreate=false`；失败任务、11 条工具记录和唯一调用审计重启后保持，原受保护表、来源启停、20 条路由及挂载不变。该次停在模型结构化响应解析失败，见[原证据](evidence/2026-10-23-research-g3.md)；后续专项授权的成功报告、引用与历史由上方 G3-D7／N4 承接，原失败事实继续保留。
  - 研究默认更新（2026-10-23）：用户另行授权最多 3 次零费用用途验证后，已将默认从 LM Studio 切为 `openrouter / openrouter/free`。实际 1 次 `research-generation-v1`／`native_schema` 验证通过，费用按配置估算为 0 USD，默认修订 4→5，其他 Provider 与其他用途保持，见[切换证据](evidence/2026-10-23-openrouter-research-default.md)。该独立授权不恢复 G3 业务额度，真实报告、引用、历史及发布门禁仍未通过。
  - 新闻前置更新（2026-10-22）：DSA DG3 已补财联社全市场电报与见闻 A 股频道的 DSA/Docker/Market/Web、拒绝与保全，见[最新复核](../reviews/2026-10-22-market-flash-news-dg3-final-review.md)。原 NVIDIA、HiThink/AKShare、Yahoo Search 的适用证据复用；新市场快讯不推断证券关联，也不替代个股检索消费要求。本 G3 的获准模型、原预算及真实报告/引用/历史读取仍未通过，不调用模型。
  - 覆盖：RA2～RA6、RA10、RA11 的消费侧；依赖：DSA DG2a/DG3、G2a、G2b、T8，以及原 UI Task 的 R01 转换能力就绪。DSA 留存/恢复仍由 DG2b/DG2c 独立验收，未通过时 RA11 不算完成。
  - 执行面：目标运行态与浏览器；真实模型部分另受现有 AI Task 的明确接续与预算条件限制，未满足时保持未完成。
  - 开启条件：核对双读基线、目标生产者/消费者修订及明确模型授权后，才按 T6 发布合同开启 V2 写入；记录开启/关闭与回退证据，不修改默认模型迁就验证。
  - 场景：真实新闻准备、获准模型生成、保存/刷新/历史读取与引用追溯；实际/模拟切换、未保存输入、在途请求、旧任务和旧响应均保持原范围。
  - 证据：模型/数据来源、冻结上下文、实际调用与费用状态、结果及浏览器行为。复用 DSA DG3 的新闻证据，不重复探测；浏览器通过不替代原生安装版或其他客户端门禁。

## 最终一致性 Review（D35目标已更新；上游HTTP404，G3报告未通过）

- D35现行结果：唯一正式HTTP收到完整404／808字节错误JSON，最终Nvidia Function对其account不可找到，响应内另附Nvidia500／502及Phala429。消息由OpenRouter返回，SDK保留Provider returned error但归transport_unknown；不能由该分类反推TLS失败。本次实际超时299935ms／SDK重试0，约2.6秒返错，无正文／报告，未自动重试；generation只读GET404，实际模型／用量／费用仍未知。
- D35目标与收尾：新镜像df411ebf…经正式update固化，双角色实际Schema及自适应模块与当前构建一致；同镜像正式关闭后两消费者重建、16份本次trace及D30原trace保持，capabilities200／false、V2=false／无策略、pending=0、五服务健康。22表旧行、10旧AI／110工具、默认修订5、环境／DSA控制与20路由／挂载不变，仅新增本次1失败任务／11材料工具，现11／121。三仓WIP、配置／HEAD及空暂存区保持，本次1/1、余3次冻结；[D35回执](evidence/2026-10-25-g3-adaptive-runtime-acceptance.md)。

- D30历史结论：真实trace及持久化通过。独立授权仅1次HTTP200／完整SSE／stop／DONE，上游assistant只含2字节 `{"`；从脱敏SSE重新组装、独立原文与SDK文本三方摘要相同。SDK实际JSON解析失败，业务failed／research_schema_invalid、result=null；该次生成未形成报告。
- 部署与证据：两次正式update均复用D29已验镜像、退出0、未构建应用镜像；两消费者及实际Schema与已验产物一致。关闭时再次重建，两端本次18文件／2201285字节和D29原12文件逐字节及权限归属保持，详见[D30回执](evidence/2026-10-25-g3-upstream-trace-acceptance.md)。未变代码检查沿用D28／D29。
- 收尾与保护：V2=false／无策略、capabilities200／false、pending=0，五服务健康。22表全部旧行、9条旧AI及99条旧工具、DSA控制／20路由、环境和全部挂载保持，仅新增本次1任务／11工具，现为10／110。原验收源码及并行新增包保留，既有Metro日志增长761字节未回滚；WIP、配置、HEAD和空暂存区核对通过，无stage／commit。
- 历史边界：D20旧Provider错误、D25合法JSON但Schema失败及缺失旧正文、D29 TLS失败分别保留在各自回执；不使用D30原文回填。本轮Provider自报cost=0，业务冻结定价估算0 USD单独记录。
- D33历史结果：另获准1次指定canonical Nvidia且仅请求关闭reasoning，完整请求差异门禁通过；SDK在HTTP200后因30秒首语义chunk超时失败，未读到正文或DONE，trace为incomplete。只读generation记录显示推理0、原生输出2155、stop、费用0、耗时45445ms；用户后补同generation完整JSON，原JSON Schema通过，业务Zod因条件id误作claimId拒绝，同版本离线SDK复现schema_invalid，新增外部0。现存9份产物完整性通过；控制台补证与原在线接收分开，未冒充在线成功或业务报告。
- D33保全：V2全程关闭／无策略、canCreate=false／pending=0，默认修订5、全部22表及10旧AI／110工具、DSA、环境、同一容器和挂载保持；本次无部署或业务写入。原派发脚本与46项源码摘要未变，三仓HEAD／配置与空暂存区保持；[D33回执](evidence/2026-10-25-g3-reasoning-off-control.md)保留预算与失败事实。
- D34历史边界：后续源码已按独立授权调整，不能再把D33时点的46项源码未变当作当前源码结论；D34本地交付时尚未部署目标。策略及观测／请求组装／结算职责分别验证，缓存故障只减少重试或回到剩余期限，原始响应和严格业务校验保持。14:23Z只读复核确认原22表、配置、同一容器与挂载及D33九份产物／manifest保持；当时余4次冻结。D35已完成目标部署，详细工程与运行验收状态只见[自适应Task](2026-10-25-ai-adaptive-execution.md)。
- 未完成：本次无成功报告可验，D33完整在线接收及业务Zod正向验收未通过；D31两字符根因、D32约束治理及G3成功报告／引用／历史／Web保持原缺口。G3-D27e的D30真实捕获／重建证据仍有效，D33控制台与离线补证、本次完整HTTP错误不扩大正向验收。余3次冻结，不补发；默认模型／推理及原业务校验保持。

## P2：历史比较与结论复核

- [x] **T10：实现冻结产物的确定性比较**
  - 完成：2026-10-19，双端授权、稳定前序与五类冻结差异已交付；整包摘要与资料版本分离。28 项定向、6 项真实 HTTP/隔离 PostgreSQL、共享 Schema 1,216 项及类型/静态/边界验证通过，见[比较证据](evidence/2026-10-19-research-comparison.md)。目标与 T11 消费仍未计完成。
  - 实施中：按成功完成时间与 UUID 稳定排序选择前序，同规范对象/模式/账户范围及模板匹配；自定义问题以原问题区分。只读扫描设 200 条上限，未穷尽时明确“查找未完成”。显式选取的两端分别检查当前权限；V1 缺范围/版本资料保持不可比。字段深比较选用已安装 `es-toolkit@1.51.0` 的 `isEqual(a, b): boolean`，由 `es-toolkit` 导入；实际声明/入口及[官方文档](https://es-toolkit.dev/reference/predicate/isEqual.html)已核对，同内容对象可相等、数组顺序保留。
  - 覆盖：RA8；依赖：T3、T7。
  - 执行面：Server Research 纯比较与查询；允许修改比较函数、只读接口及测试。
  - 完成/验证：同对象/模式/范围/模板的默认前序选择稳定；观点字段、证据指纹、条件、数据/模型版本分开展示；跨权限拒绝，旧 V1 缺字段明确不可比；零外部请求。

- [x] **T11：在历史详情展示变化与前后证据**
  - 完成：沿用现有详情壳和已加载成功报告，按身份/范围/报告重置选择，分别读取两端证据。当前 Schema 1,216 项、SDK 92 项、Desktop 992 项及构建/静态检查通过；受控浏览器鼠标选项、证据与切换错误态通过，见[客户端证据](evidence/2026-10-19-research-comparison-desktop.md)。目标业务路径仍由 G4b 验收。
  - 覆盖：RA6、RA8 的交互；依赖：T10 接口、T8 的现有详情交接。
  - 执行面：Desktop 研究历史；允许修改现有详情/比较区域及测试，不新增平行报告中心。
  - 完成/验证：可从已有列表进入两份报告对照；“报告更新”“文字变化”“数据更新”不混用；切换对象与模式不会显示旧比较结果。

- [x] **T12：保存研究断言的观察窗口与复核记录**
  - 完成：三张独立表、并发提交映射、追加输入版本和按截止时点的投影已交付；35 份迁移及打包输入、双连接 PostgreSQL 和原报告/Journal 保留升级通过。样本按逻辑观察及谱系去重，见[存储证据](evidence/2026-10-19-research-observation-store.md)。目标升级保留在 G4a。
  - 实施阶段：先建立逻辑观察、不可变输入版本与提交映射，再实现事务追加和投影选择，最后执行迁移/打包门禁及隔离保留升级。真实目标升级留在 G4a。
  - 覆盖：RA9 的状态/持久化、RA10；依赖：T3、T4。
  - 执行面：Server 数据模型；允许新增观察版本及提交标识映射、migration、repository、Schema 与定向数据库测试；原产物与 Journal 表不改写，不新增运行队列。
  - 完成/验证：逻辑观察绑定产物/窗口/方法，版本再绑定输入指纹；同提交找回原尝试、同输入并发不重复写、不同输入追加版本、旧截止时点晚到不覆盖当前投影。以“资料不足 → 补充资料后完成”证明旧观察仍可读。样本按逻辑观察/研究谱系去重，不按版本或重试次数累计；同步迁移/打包门禁并通过隔离保留升级。

- [ ] **T13：计算首批价格方向复核结果**
  - 本地证据：[方法及接口](evidence/2026-10-19-research-observation-method.md)。T13c 未完成，父项保持未勾选。
  - [x] **T13a｜受控计算**：固定第 0 日及 5/20 交易日窗口，经济价格资格失败保持未知；方法、材料、身份及统计 49 项定向通过。本轮补齐证据时钟的原始精度比较，覆盖晚于截止点一纳秒、等价偏移及非法时刻；共享合同全量 1,220 项通过，详见原方法证据中的精度补漏记录。
  - [x] **T13b｜接口与持久化消费**：权限、提交重试、只读历史、范围回显和谱系统计已通过 14 项受控 HTTP/SQL 检查（8 项接口、6 项存储）；联合报告/比较回归 41 项通过。提交与读取先规范化截止时点，资料请求、计算和存储使用同一时刻；SDK 全量 99 项通过，其中观察接口 7 项。
  - [ ] **T13c｜现行实源正向消费**：仅在实际日历、经济价格及目标运行态满足各自资格后验收；合成输入和拒绝路径不能替代本项。
  - 实施阶段：先完成固定窗口及经济价格的受控计算，再接入授权、按需提交/读取与去重统计；现行日历及经济价格的正向真实消费作为独立资格验收，未满足时保留未知及未勾选状态。
  - 覆盖：RA9 的计算/读取；依赖：T7 的权限/产物读取、T12、已具备正向资格的现行日历和经济价格合同；受控计算可先做，实源门禁不能用未获准数据代替。
  - 执行面：Server Research evaluator/API；允许修改研究复核计算、按需接口与定向测试，读取 Market，不增加模型调用或自动调度。
  - 完成/验证：仅处理 5/20 交易日合格方向断言；按 Spec §6.2 固定第 0 日与终点，覆盖盘中/收盘后、节假日、市场时区、停牌和缺价，不跳日改变窗口。调用前校验模式/权限；分母、排除原因和少于 20 样本规则正确；保持账本、模型和路由不变。

- [x] **T14：统一研究状态与下一步入口**
  - 完成：复用现有详情、比较和新建准备入口，统一中文状态映射；按需读取及显式复核、同提交找回和范围切换取消已交付。Desktop 1,003 项、SDK 98 项、Schema 1,216 项及构建通过，受控浏览器完成一次提交和历史读取，见[客户端证据](evidence/2026-10-19-research-review-desktop.md)。本地交互依赖 T13a/T13b，完整实源与目标路径仍由 T13c/G4a/G4b 验收。
  - 覆盖：RA6、RA8、RA9 的交互；依赖：T7、T11 的历史详情交接、T13。
  - 执行面：Desktop 研究状态组件；允许修改研究列表/详情中的状态映射和动作入口及测试。
  - 完成/验证：无报告、准备中、运行中、数据过期/未知、观点有变化、到期/资料不足分别提供明确动作；状态标签共用中文映射；点击只执行明确请求，不隐式触发新研究、交易或通知。

- [x] **G4a：观察存储目标保留升级**
  - 覆盖：RA9、RA10 的持久化；依赖：T12 的隔离升级证据、G2a。
  - 执行面：正式目标升级入口；断言结构 head/清单一致，旧报告和现有观察数据保留，可恢复到兼容版本；不使用清库路径，不调用模型。
  - [x] **G4a.1｜目标输入核对**：核对最近正式 `update.sh` 的输入、结构、表清单、权限及目标报告/观察摘要；未改变的运行输入复用已有升级，不重复构建。
  - [x] **G4a.2｜非空保留副本恢复**：通过维护脚本备份目标，在无外网、无业务卷的自有副本追加明确标记的观察版本；封存后实际恢复，当前候选和登记的兼容双读镜像分别读取原报告、旧观察及当前投影。
    - 兼容恢复点同时保留镜像归档；历史镜像缺失时，只登记实际通过上述读取的当前版本，不声称已恢复缺失的旧二进制。
  - [x] **G4a.3｜保留核对与清理**：研究三张观察表、报告、工具审计、Journal 与原业务摘要一致；目标配置、数据和暂停状态不变，自有资源清理完毕。合成观察只验存储/恢复，不关闭 T13c/G4b。
  - 完成：2026-10-20，35 份 migration、83 张表与权限通过；三版非空观察实际恢复、旧版/当前投影及 V1/V2 原报告读取通过，当前兼容镜像归档并实际加载。目标调用事实均未增加，详见[目标保留与恢复验收](evidence/2026-10-20-research-observation-target-retention.md)。

- [ ] **G4b：历史比较与复核用户路径验收**
  - 覆盖：RA8、RA9、RA10；依赖：T11、T13、T14、G4a，以及 R01 转换能力就绪。
  - 执行面：目标 API/浏览器与已获准价格数据；使用明确产物、市场、日历和时间窗口，不调用模型。
  - 断言：查看/比较不改变旧 JSON/证据；复核的起止价格、追加输入版本、去重统计和模式隔离可追溯，缺失与样本不足正确。缺来源资格只阻塞对应实源门禁，不能以 fixture 计算正确替代真实数据口径核对。

## P3：阶段化执行的条件任务

- [x] **T15a：建立固定协议和隔离实验驱动**
  - 完成：协议、固定集、共同预算、阶段 I/O 和评价阈值已写回 Spec §6.3。既有 SDK 回环运行两份固定案例的单链/三阶段，共 8 次请求与 8 份请求审计对齐，见[受控结果](evidence/2026-10-19-research-experiment-offline.json)。21 项驱动反例及现有 SDK/轨迹回归共 48 项通过，覆盖取消、总时限、超额、异币种、零/未知费用与评价隔离；类型、静态、边界及构建通过。质量/收益成绩为空，激活未评价，生产策略保持原值；T15b 仍需独立授权。
  - 覆盖：RA12 的实验前置；依赖：T9、T6 已验证的模型适配接口；不依赖真实模型授权，可先做纯离线部分。
  - 执行面：评估脚本、脱敏固定集和受控响应；通过既有适配/审计接口组织有界阶段，不注册生产 API、修改默认策略或另建模型客户端。
  - 完成/验证：固定同输入/模型/总预算、阶段 I/O、评价准则和成本/时延上限；比较窗口、资金与经济假设一致，收益和无风险基准同频，封存评价不回灌候选，缺失成绩不填零；受控响应验证驱动能跑单链/阶段两组、取消、超时、调用数和账目可核对。离线结果只证明驱动，不宣称质量收益；写回实验协议后才能运行 T15b。

- [ ] **T15b：运行获准对照并决定是否激活**
  - 覆盖：RA12 的激活依据；依赖：T15a、G3、明确的模型实验调用/预算授权；当前条件未满足。
  - 执行面：隔离评价运行与报告，不修改生产策略；分别记录质量、失败、实际费用和时延，采用相同固定输入与限制。
  - 出口：依据事先阈值明确“激活”或“保持单链”，回写阶段合同及可派发实现范围；未激活时 T16a/T16b/G5 保持不适用且未交付。不能用受控响应或一次漂亮输出替代真实对照。

- [ ] **T16a：固定生产阶段快照与恢复合同**
  - 覆盖：RA12 的状态/持久化；依赖：T15b 明确激活并写回合同。
  - 执行面：Ai 阶段快照、checkpoint 合同和 repository 定向测试；继续使用 AiRun 为执行事实源。
  - 完成/验证：阶段输入/输出、attempt、取消与恢复位置可验证；旧单链快照兼容。若需要新增数据库结构或 Worker/队列，先拆独立迁移/执行叶与门禁，不能在本叶隐式扩展。

- [ ] **T16b：接入共用预算的阶段执行器**
  - 覆盖：RA12 的执行；依赖：T16a。
  - 执行面：现有 Ai 执行器、预算/费用适配和定向故障测试，不增加 DSA 分析调用。
  - 完成/验证：各阶段共享总截止时间/预算、取消、attempt 与单一终态；阶段失败/晚到结果不重复写入结算，轨迹可查；功能默认关闭。受控故障通过后交 G5，不直接开启生产。

- [ ] **G5：阶段执行的目标恢复与启用验收**
  - 覆盖：RA12 的目标运行；依赖：T16b、T15b 激活结论、目标模型调用授权。
  - 执行面：正式部署与同一候选产物的恢复验证；核对阶段版本、重启、取消、预算耗尽、单链回退和费用台账。
  - 完成/验证：受控故障与获准真实路径分别有证据；用户授权范围内才启用，未通过时继续默认单链。实验驱动结果不替代此生产门禁。

## 验收责任映射

### MB1：研究报告模型绑定与手机第 2 批 CI 接续

2026-10-24 用户授权修复模型绑定，并将本地 CI 路径修正纳入原隔离分支重验；保留原工作树与其他会话 WIP。范围为完成事实 Schema、研究执行/读取、对应反例和 HTTP 测试；不调用真实模型、不更新业务容器或修改研究配置。规格见[实际模型绑定补验](../specs/2026-10-18-research-evidence-evolution.md#研究报告实际模型绑定补验2026-10-24)。

- [x] MB1a：完成事实记录 SDK 实际模型，V2 读取精确绑定最后一次成功请求；历史同模型报告兼容，篡改正文/模型/引用继续拒绝。
- [x] MB1b：定向 Schema 11 项、SDK 8 项按不变输入复用；最终报告投影/比较 52 项、隔离 PostgreSQL/HTTP 23 项再次通过，Server 构建 27 秒、lint 10 秒通过。修复前反例、首轮夹具克隆错误及畸形审计 4 项失败均保留，未改写损坏模型断言。
- [x] MB1c：最终 `0a040833` 的 quality、contracts、Android/iOS Native 全部通过，原失败组 14 文件、106 项通过，无安装包上传；五组显式损坏审计反例及有效基准文件尺寸 ratchet 均通过。首轮全绿与早期失败保留，见[手机第 2 批收口](evidence/web-mobile-parity/2026-10-24-batch-2-ci-closeout.md)。本叶关闭源码/隔离 HTTP/CI 阻塞，G3 真实研究和目标业务镜像的义务保持原状态。

| 断言 | 实现责任 | 验证责任 |
| --- | --- | --- |
| RA1 | T1、T2、T5；DSA 配置/存储/入口叶 | 定向依赖/合同、G1；DSA DG1/DG2a |
| RA2 | DSA N1～N3、T1/T2 | 共享样例、DSA DG3、G3 |
| RA3 | T3、T4、T5、T7、T8 | 定向/数据库、G1、G3；R01 原 Task |
| RA4 | T4、T5、T6 | 原子/生命周期测试、G1、G2a/G2b、G3 |
| RA5 | T3、T6、T7、MB1 | 产物/引用/V1 回归、模型绑定反例、G1、G2a/G2b；MB1 的隔离 HTTP/CI 不替代目标及真实模型 |
| RA6 | T5、T7、T8、T11、T14 | 客户端定向、G3、G4b |
| RA7 | T9 | 离线固定样例与 CI 断言 |
| RA8 | T10、T11、T14 | 比较/权限/交互定向、G4b |
| RA9 | T12、T13、T14 | 迁移/经济口径/追加版本/统计定向、G4a/G4b |
| RA10 | T4、T6、T12；相关发布叶 | 隔离升级、G2a/G2b/G3/G4a/G4b；其他客户端按 T0 清单 |
| RA11 | DSA Task | DSA DG1、DG2a/DG2b/DG2c、DG3；本仓 G3 仅证明消费侧 |
| RA12 | T15a/T15b；激活后 T16a/T16b | 固定对照、阶段故障/预算/取消、G5；未激活有明确依据 |
| RA13 | T0R；采用点只交相关既有叶，现行缺陷归原领域 | 逐项目代码/合同/反例核查及明确处理；不替代任何实现或运行验收 |

## 规划预检与交付边界

- [x] DSA 与 ThesisLedger 的职责、直接接入及产品完善分别有所有者。
- [x] 数据、执行、持久化、消费与部署验收分开；最早联通为 G1，没有把全部集成拖到最终 UI。
- [x] 已修正已知任务依赖，拆开配置/FX/生命周期、产品删除、部署/恢复和实验/生产；D0/T0 仍负责补齐精确闭包和消费者清单。
- [x] 新增验收有责任映射；现有 AI、数据源和 R01 的开放义务没有被替换或勾选。
- [x] 没有恢复真实生成、开通数据源、删除历史数据或修改应用代码。

**结论：本轮已知问题已回写，首批盘点入口明确；后续删除叶尚不具备直接派发条件。** D0/T0 的清单、产品内部引用的退役顺序及可能新增的迁移/恢复叶仍须补齐。P3 保持条件范围。代码、数据库、实源、模型、浏览器和目标部署尚未验收，未把规划完成写成产品完成。

复核问题与源码依据见[方案复核记录](../reviews/2026-10-18-dsa-research-plan-review.md)。文档检查需覆盖本地链接/锚点、任务 ID、两组验收映射及已显式声明的跨仓依赖；D0 尚未发现的依赖不算已经验证。原规划复核没有运行代码测试或构建；本次 T0R 另有公开源码读取与隔离纯函数反例，证据独立记录。未调用供应商/模型或变更运行态；文档检查只证明规划一致性。

本次不新增重复 TODO：已立项范围留在本 Task，现有风险/组合/UI 工作引用原 Task；ETF、新宏观来源等只是评估材料，没有形成后续实施承诺。实施后的最终一致性 Review 在本节原位更新，不另建重复总验收任务。

历史局部 Review（2026-10-23，G3-D4～D6）：D4 通过；D5 共享入口已保留并完成受影响复验。D6 当时在旧自有更新锁预检处阻塞，单次重跑退出 1、未修改 Docker；锁属上轮已退出的 PID 83652，当时尚未清理。该阶段保护通过，V2=false、模型 0/3。现行状态以上方 D25／最终 Review 为准，旧事实不作为当前锁或预算。完整边界见[版本与流诊断证据](evidence/2026-10-23-research-g3-stream-diagnostics.md)。

2026-10-18 收藏项目收口：T0R 完成原清单 13 项既定参考点的实现对照，REF05 排除；原 5 项局部/8 项待查状态由固定源码/发布包证据取代。该次仅关闭 T0R；当时转交的 IR02～IR06、IR09/IR10 于 2026-10-19 由所属 P0 Task 完成修复及独立目标验收。真实来源单位、账号能力、研究运行和完整删除闭包仍按各自证据维护，不由参考审查或 P0 通过代收。
