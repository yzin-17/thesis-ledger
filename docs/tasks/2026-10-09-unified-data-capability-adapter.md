# 统一数据能力适配层实施任务

> 任务标识：`unified-data-capability-adapter`；首次日期：2026-10-09
> 对应规格：[统一数据能力适配层与扩展契约](../specs/2026-10-09-unified-data-capability-adapter.md)
> 状态核对：2026-10-14；原H07/K38及H08–H12、HiThink K37f-R与东财K37b-R证据复用；K37-C资格v2及当时写集的镜像固化完成。TF-F免费历史三个绑定、沪深六组实源/有限口径核对、正常新Run/快照、页面下载、独立计算和新旧断网重放通过；正式update.sh dsa固化及目标复验现已完成。TA1～TA5账户功能控制、目标API/页面及正式update.sh all镜像固化和运行态复验通过，原空间阻塞解除。RQ/Tushare原实现完成、真实成功受账号/权益外部条件阻塞，K37父项和整个主题保持部分完成。
> 历史实施基线：当时的本地未提交工作树 `/Users/yzin/code/thesis-ledger-workspace`；各次部署/实读只证明其记录输入。2026-10-14 本轮基于 `main@3570ab2` 只做文档对账，复用已保存验收证据，没有新增实读或部署。
> 过程与完整证据：[实施日志](../archive/reviews/2026-10-11-unified-data-capability-implementation-log.md)；[全源差异矩阵](../reviews/2026-10-10-provider-adaptation-and-route-matrix.md)。支持记录不维护另一套当前进度。

> 当前接续：先读 §9.5 的剩余条件。RQ 注册/试用已取消且后来仅授权代码层；Tushare 精确现金接口权限未满足。两家迁移与拒绝层完成，正向消费仍未验证；条件未变化时没有开户、采购或重复实读动作，也不重做已完成的 TF-F、TA、K37f-R、K37b-R、K37-C 和 H08～H12。


## 当前任务与边界

实现、逐能力检查及 H08～H12 的有界机制已完成，原失败、目标版本与命令只维护在历史/证据报告中。尚未通过的是下面三项；没有新凭据或权限事实时维持停止，不开户、采购、保存/启用账号、改路由或扩搜。真实成功消费与账号可用性分开，不以拒绝路径通过代替正向结果。

### 9.5 当前未完成执行包与阻塞

H07当前范围实现/逐能力检查、K38代码/合同/正式目标层及H08–H12机制按原断言对账完成，[直接证据与最终Review](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-h07-h12-final-obligation-reconcile)。K37原显式正向义务保持未过，主题不归档；未配置来源不构成已验证消费者与冻结的总前置。

| 原责任项 | 当前层级与依据 | 最小解除条件 |
| --- | --- | --- |
| K37父项内东财现金b正向层 | 按普通研究合同完成K37b-R1～R6；6次实源、五事件对账、3新Run/重放、真实展示/导出 | 逐窗口项目准入及旧严格live前置已解除。保留缺公告日/状态、历史覆盖未知及未核对事件的显式假设边界；无需追加本轮窗口审批 |
| K37c-live RQ现金/拆分 | 代码/合同/来源错误及目标credential_missing、零尝试通过；无RQ账号 | 可合法使用的原凭据及精确证据/准入到位后原链路一次正向验证；不要求采购/开户或围绕缺账号新增重构 |
| K37e-live Tushare现金 | 同凭据daily成功，fund_div HTTP200/40203精确拒绝，fund_daily亦拒绝；目标现金准入缺失 | fund_div权益实际变化/合法权限证据与原准入前置后才复验；不再询问Key、不保存/启源。400/2000门槛冲突未知，rt_k拒绝不外推 |
| K37f-live HiThink现金 | 普通研究已完成；原值2保留未知、历史覆盖未验证，具体事件核对只覆盖已保存样本 | 不再等待人工scope、全部枚举或旧严格live；未核对事件默认排除或按显式假设模拟，未知与漏报风险继续披露 |

RQ与Tushare的真实正向条件仍阻止K37父项完成；HiThink与东财普通研究切片已通过，不阻止H08–H12已通过机制。公告a-live、拆分d-live不重复；拆分两事实/真实信封/实际完成截止/离线消费已过，coverage=false/原完整冻结及Runner独立受阻保持。解除完整收益须原窗口覆盖证据，不能买账号、重复两事实、读全页面或改complete代替；不重开已取消全历史任务，不改Spec。

TickFlow原完整服务4绑定保持；免费历史TF-F1～F4完成独立端点/认证/版本接入，沪深三复权有限实源、实际新消费者及断网重放通过。连接/精确库存20/143；免费来源只声明本范围历史日K，单位/锚点和全历史可见性限制保持。最终正式update.sh dsa已完成镜像固化，目标三文件/SDK/绑定及新旧重放复验通过；此前空间阻塞解除，不新增供应商请求或放宽数据语义。

已完成叶的完整执行事实和原路径见历史记录；当前状态以本节、下方未通过项和支持记录的最新锚点为准，不沿用旧政策值、一次预算或下一步。


## 未通过的原责任项

- [ ] H07-K37-event-batches：七事件实现/来源绑定及中央分派退役已齐；公告a-live、拆分d-live及普通研究新合同下的HiThink f-live、东财b正向层已过。RQ c-live、Tushare e-live仍受外部条件阻塞，父项保持开放；不扩为已完成研究切片失败。[东财证据](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-k37b-research-v2)。
  - 证据与原执行范围：[原§9.69](../archive/reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-69)。
- [ ] H07-K37c-live：RQ真实账号消费，当前未配置/未选路线，不自动创建或启用。
  - 证据与原执行范围：[原§9.71](../archive/reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-71)。
- [ ] H07-K37e-live：Tushare真实现金消费；用户已提供现有TUSHARE_API_KEY。本轮独立fund_div实际HTTP200/40203明确该接口无权限；同凭据daily单日成功，fund_daily亦明确拒绝。官方fund_div门槛400/2000冲突仍未知，不依据rt_k推断或要求采购。目标未保存凭据/未启用/未选且无现金合法准入，正向生产消费未过。[精确核查](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md#record-20261012-exact-entitlement-audit)。
  - 证据与原执行范围：[原§9.73](../archive/reviews/2026-10-11-unified-data-capability-source-evidence.md#record-9-73)。

## 1. 后续实施共同约束

实现前重新读取实际源码、现行任务范围和环境，不把示意方法当作已存在实现。当前能力适配、已支持冻结版本、用户路由、配置和凭据保留；不清库、不改账户 Ledger、不启动已取消申请或旧任务。

主仓拥有能力契约、产品 API/读模型和消费者；DSA 拥有来源定义、实现绑定与运行机制；infra 只处理必要运行依赖和部署。先确认所有权，不新增无边界 common/shared 目录，不机械拆文件规避门禁。

A01 固定本轮精确迁移切片及回归集合，不将所有来源或现行业务任务合并为一次重写。选定切片迁移后，其目录和执行来自同一注册定义；未迁移能力保持原路径，不双重生成同一目标。

验证按定向 → 受影响包 → 边界/依赖门禁 → 必要真实目标递进。低层级失败先修复；输入未变的证据可复用，但改造前结果不能冒充改造后通过。


## 已完成任务索引

以下仅标记原任务完成态；实际写集、日期、命令、失败与修正见[历史执行包与记录](../archive/tasks/2026-10-09-unified-data-capability-adapter-history.md)，不重复执行。范围内的正向来源、覆盖及客户端边界以当前未完成项为准。

| 原任务 ID | 状态 | 已完成范围摘要 |
| --- | --- | --- |
| `TA1` | 完成 | 状态与合同：六个精确功能使用标准访问状态，18秒/六请求预算、5分钟配置绑定内存缓存、草稿隔离和并行变化拒绝发布 |
| `TA2` | 完成 | 执行面：原HTTP客户端按传输职责小范围提取，Fetcher兼容入口、十进制解析和生产参数保持；来源负责六接口参数及2002/明确 |
| `TA3` | 完成 | 消费面：新权限侧栏、保存后当前配置检查、禁用候选和原因、中文标签及过期内部目录刷新完成 |
| `TA4` | 完成 | 目标验收：正式sync-code all退出0，兼容性预检及DSA/Server/Worker健康通过 |
| `TA5` | 完成 | 镜像固化：用户要求重试后，宿主29386MiB/Docker23947MiB达到原20480/18432MiB门槛；仅为本次命令补 |
| `TF-F1` | 完成 | 来源接入：免费目标仅沪深A股三日线绑定，原四绑定/Key/报价保持 |
| `TF-F2` | 完成 | 有限语义核对：沪600519/深000001，2025-06-23～07-04三复权各10条，原价80个OHLC与腾讯一致；量数值 |
| `TF-F3` | 完成 | 真实消费者：正常新prepare/原策略3笔成交、25冻结价格（含预热）及qfq归一化新快照完成；10研究日期40OHLC等于此前 |
| `TF-F4` | 完成 | 部署与对账：原330项受影响/末次99项及目标消费证据复用 |
| `C1` | 完成 | 规则与版本：510300/510050/510880一手公告确认交易结束后的登记份额，沿原policy.entitlement冻结 |
| `C2` | 完成 | 执行面：quantity为成交记增减总数量、settledQuantity为可卖结算数量；登记截止事件在同刻有效成交之后采集，不依 |
| `C3` | 完成 | 计算：A～F独立期望与原账本/队列测试相等，Server定向24、Domain受影响27项通过；独立脚本分新/旧版本，真实新29/ |
| `C4` | 完成 | 来源事实轻量去重：五个事件移入DSA有所有权/版本/引用的共享事实表，两来源各自匹配不扩大，不补字段；112项受影响及能力边界通过 |
| `C5` | 完成 | 真实消费者：正常新prepare/preflight/create、原引擎登记日实际买100份，资格100/应收8.8，期末现金9 |
| `C6` | 完成 | 本地固化：2026-10-14用户要求重试后，正式update.sh all退出0，DSA及Server/Worker切换新镜像； |
| `K37b-R1` | 完成 | 状态机：合同已同步；旧严格入口/旧结果保持，缺公告日和状态分别保存null及明确问题，覆盖未知独立表达 |
| `K37b-R2` | 完成 | 执行面：既有东财读取模块复用有界传输，注册通用研究协议；配置/前后控制和实际采集时钟保持 |
| `K37b-R3` | 完成 | 有界对账：实际3样本、51原记录/5目标事件；跨2024～2026金额、每10份单位、三现金日期及窗口合计无差异，5条均缺公告日/ |
| `K37b-R4` | 完成 | 消费面：3个新快照/Run完成，独立Decimal复算全部74权益点；1091.2元核对事件、未知默认不采用、显式假设2172.6 |
| `K37b-R5` | 完成 | 展示与导出：3个真实结果页面、2份实际下载通过；采用/未采用计数、缺字段、假设、覆盖、模拟发放和原资料清楚分列，下载逐字段等于持久 |
| `K37b-R6` | 完成 | 部署验收：正式sync-code all及必要thesis-ledger同步成功；3新快照各两次断网重放校验和一致、网络0 |
| `D00-local-reconcile` | 完成 | 已连接设备，读取工作区/主仓 Agent 规则、文档指南和本地状态；未发现同主题 Spec/Task |
| `D01-local-doc-merge` | 完成 | 创建通用 Spec/Task，并在现有按需数据、富途、共同价格文档及两个导航中增量关联；逐文件校验编辑前内容，不覆盖并行修改 |
| `D02-local-doc-check` | 完成 | 检查本轮增量 diff、相对链接、任务标识/AC 映射、原任务勾选及本轮仅文档写集，区分并行源码变化；只对新文档格式化，不重排原大 |
| `A01-inventory` | 完成 | 核对当前定义、工厂、能力/修订表和消费者特判；选择已有日线与非 K 线切片，固定精确文件、原行为及测试 |
| `A02-capability-contract` | 完成 | 定义能力版本、强类型请求/结果关联、query/subscribe 操作及错误约束；保留 V3 路由，不接受任意名称执行 |
| `A03-registry` | 完成 | 建立静态能力与来源绑定，关联定义/工厂/处理器/修订；拒绝重复、缺处理器和操作不匹配，目录视图由绑定生成 |
| `A04-first-query-path` | 完成 | 迁移一个现有精确日线目标，保留请求、路由、账号、结果校验和来源记录；复用超时/错误/限流，不加第二层切源 |
| `B01-bars-adapters` | 完成 | 迁移腾讯/HiThink 选定日线的工厂、精确范围和本地修订；供应商 SDK/字段差异留在来源模块 |
| `B02-non-bar-adapter` | 完成 | 迁移至少一种现有非 K 线能力，优先选择已稳定的净值、状态或当前资料；保持其原模型，不强制 Quote/K 线字段 |
| `B03-binding-consolidation` | 完成 | 选定切片中其余绑定采用现行 V3 薄适配收拢，确保同一目标只有一个定义源；未迁移范围记录原有入口，不以重写全部来源作为前置 |
| `B04-readiness-projection` | 完成 | 静态能力由绑定派生，依赖/账号/权限/配额及启用状态动态判断；未知保持未知，测试能力不注册为生产能力 |
| `B05-credential-lifecycle` | 完成 | 验证工厂缓存、账号配置代次、停用、在途结果和释放；不复用失效实例，不泄漏凭据 |
| `C01-basic-price-policy` | 完成 | 收拢 DSA 基础价格放行和 Server supportsBasicPriceFallback() 的名称判断，包括 A01 确 |
| `C02-consumer-boundaries` | 完成 | 沿用 DsaDataCapabilityReaderV3 和既有 Market Reader；消费标准字段，不增加供应商 DTO  |
| `C03-cache-and-state` | 完成 | 缓存身份包含必要来源、账号权限、覆盖和参数；来源停用/配置变化正确失效，用户主备顺序不变 |
| `C04-frozen-regression` | 完成 | 目录与政策身份按现行协议处理，已支持冻结版本及结果不改写；离线重放不依赖在线适配器/当前凭据，不追补已取消缺失旧资产 |
| `C05-boundary-guard` | 完成 | 固化消费者不得依赖来源实现或新增供应商执行分支的规则；显示标签不误判为执行分支，已有模块方向不反转 |
| `D10-new-provider-proof` | 完成 | 测试中新 providerId 实现已有能力，记录 changed-files；只允许来源模块、测试和显式注册，公共 Runtim |
| `D11-order-book-contract` | 完成 | 按 Spec §7 定义盘口、深度、单位、时钟、覆盖与错误；query/subscribe 分开，只进入测试注册表 |
| `D12-two-adapter-fixtures` | 完成 | 两种不同结构分别适配同一 OrderBook，覆盖已知/未知单位、缺时间、排序、权限失败、深度不足和显式降级；不是复制 JSON  |
| `D13-subscription-state-model` | 完成 | 用隔离迭代器/回调验证初始状态、取消/释放、失效/重同步；缺口不能继续输出有效盘口，无序列不声称连续性已验证 |
| `D14-switch-and-backpressure` | 完成 | 验证重连/切源代次、旧消息隔离、有界缓冲溢出；B 增量不作用于 A 盘口，UI 合并完整状态不破坏重建 |
| `D15-scope-isolation` | 完成 | 验证共享不跨账号权限/来源/不兼容参数；停用或撤权影响已有消费者 |
| `E01-focused-tests` | 完成 | 执行注册、查询、转换、错误、控制一致性、隔离和生命周期定向测试，记录实际命令与统计 |
| `E02-packages` | 完成 | 运行受影响 Schemas/Server/Desktop 及 DSA 检查，不触发未改原生客户端的无关编译，也不宣称原生验收通过 |
| `E03-repository-gates` | 完成 | 按实际 scripts 执行类型、lint、build、边界/依赖/尺寸门禁，不提高阈值或新增 ignore 隐藏问题 |
| `E04-target-update` | 完成 | 源码稳定且确需目标验收时，从 infra 正式 sync-code.sh/update.sh 选择最小目标并遵守预检；依赖/SDK |
| `E05-existing-source-runtime` | 完成 | 对已迁移且现行可用的来源做有界真实查询、研究/冻结和必要主备故障验证；需要临时改用户政策时先取得授权并按 CAS 恢复，不自动启用 |
| `E06-consumer-check` | 完成 | 用当前浏览器入口验证目录、图表与错误，确认测试能力未作为真实能力展示，不新增供应商业务面板 |
| `F01-onboarding-guide` | 完成 | DSA 给出“已有能力新增来源”的最短流程与真实测试入口，主仓给出“首次新增能力”的契约/消费者边界；不把复制多个中央分支写成规范 |
| `F02-current-architecture` | 完成 | 实现完成后才同步 Architecture 与兼容说明，不把设计文档写成已实现事实；旧文档仅链接，不重复状态 |
| `F03-acceptance-reconcile` | 完成 | 核对 AC01–AC12，明确未执行层级；本地盘口测试不称为二级行情已实盘接入，也不改变原业务任务完成或取消状态 |
| `F04-worktree-summary` | 完成 | 核对实际 diff 与授权范围，保留并行 WIP；不自动提交、推送、发版或清理 |
| `H01-framework-closeout` | 完成 | 依赖原 A–D 选定闭环及 E/F 记录，核对完整框架验收并完成仍开放的 E05 |
| `H02-source-inventory` | 完成 | 依赖 H01，固定当前产品所有 Provider、真实 upstreamSource、现有精确能力、旧执行入口和新绑定清单，覆盖内 |
| `H03-per-capability-audit` | 完成 | 依赖 H02，逐项核对声明/实现/统一迁移/消费者、字段语义、能力参数、错误和依赖；沿已有测试及已授权配置做必要有界验证，来源无权 |
| `H04-difference-report` | 完成 | 依赖 H03，在主仓 docs/reviews/2026-10-10-provider-adaptation-and-route- |
| `H05-route-split-plan` | 完成 | 依赖 H04，补齐同报告中的旧路由→独立能力/参数/目标映射；优先拆出历史交易状态、风险警示、价格规则与基础日期，确认上市阶段等实 |
| `H06-route-contract` | 完成 | 依赖 H05，主仓共享契约和 DSA 对应边界分别建立功能级请求/结果、逐能力覆盖与状态、独立启停及政策迁移合同；沿现行强类型扩展 |
| `H07-adapter-batches` | 完成 | 依赖 H06，按 H03 缺口将当前范围的既有来源能力逐切片迁入统一定义/执行或补齐准确标准投影，复用原读取器/SDK；每批固定来 |
| `H08-route-runtime` | 完成 | 依赖 H06/H07，落实 DSA 单目标读取及控制检查、Server 每能力主备选择与停用语义，明确唯一切源责任 |
| `H09-consumer-and-freeze` | 完成 | 依赖 H08，消费者按本次需求组合各能力的不同来源结果，必需数据缺失只影响对应计算；分别冻结请求、RouteTarget、观察时间 |
| `H10-route-ui` | 完成 | 依赖 H09，在原功能路由界面按业务组展示独立功能开关、精确主备候选、支持范围与不可用原因；Provider 配置不复制到每功能、 |
| `H11-target-verification` | 完成 | 依赖 H10，定向→受影响包→边界/依赖/尺寸→必要正式更新→真实功能消费分层验证 |
| `H12-matrix-reconcile` | 完成 | 依赖 H11，更新同一差异矩阵与接入指南、必要当前架构及新 AC13–AC20 结果 |
| `H01-K1` | 完成 | 核对并补齐新能力查询的精确请求匹配、结果关联、操作及合同版本约束 |
| `H01-K2` | 完成 | 固定 E05 的最小真实备用验收方案及可复用入口，先核对现行目标和 CAS |
| `H01-K3` | 完成 | 在现有 Provider 配置事务补可选期望配置代次，作为受保护恢复前置 |
| `H06-K1-shared-contract` | 完成 | 只改共享 Schema、导出和跨语言固定样例；证明五项能力参数、单位/时钟/未知/证据/关联边界，不改业务研究语义 |
| `H06-K2-dsa-contract` | 完成 | 只改 DSA 强类型合同和合同测试；标准化五项能力并接通已有 registry 校验，不加入生产目录 |
| `H06-K3-policy-compatibility` | 完成 | 串行修改共享 route、DSA 校验/Effective 与 Server 控制合同；旧序列化不注入字段，新功能显式关闭、禁用保 |
| `H07-K1-status-and-dates` | 完成 | 来源模块拥有 BaoStock 日级状态/粗风险/基础日期与 official-states 事实投影，逐能力准入/覆盖，不回补价 |
| `H07-K2-efinance-daily` | 完成 | 迁移既有 CN STOCK/ETF、none/qfq/hfq 六个精确日线目标；来源模块拥有定义/工厂/绑定/修订和精确 SDK  |
| `H08-K1-feature-epoch` | 完成 | 通过现有 Runtime/Reader 的功能启停、目标匹配、代次及缓存检查，证明关闭前后无新增调用和晚到结果隔离 |
| `H08-K2-server-status-routes` | 完成 | 演进现有 DsaDataCapabilityReaderV3，为五项独立功能增加按当前 Effective Policy 的读取； |
| `H07-K3-akshare-daily` | 完成 | 完成上述 12 个既有精确日线的来源所有权迁移、原执行入口合同回归与登记等价检查 |
| `H07-K4-baostock-daily` | 完成 | 完成三个既有价格目标迁移，不将独立状态/日期事实合并为价格完整性证明 |
| `H09-K1-composition-freeze` | 完成 | 新建普通 STOCK 固定来源快照按当前已选独立能力获取、分别冻结请求/目标/修订/时钟/覆盖/错误和采用事实；只沿原“已知停牌日 |
| `H07-K5-pytdx-daily` | 完成 | 上述单目标移入来源模块，保留原参数、错误、修订与有效组合，原登记删除，经过原 Runtime 与库存等价验证后勾选代码叶 |
| `H09-K2-target-composition` | 完成 | 使用真实已选价格及不同来源的独立功能，经原消费入口生成新组合冻结，并证明可选功能失败保留其他事实；不得用测试原文或单独 Schem |
| `H07-K6-tickflow-daily` | 完成 | 三目标经原 Control/Runtime 走来源绑定，旧登记删除；完整 SDK 参数、日期结构、错误、凭据/配置快照、普通/pr |
| `H07-K7-alphavantage-daily` | 完成 | 上述单目标实际执行通过来源绑定，删除旧登记，保留原协议/修订、工厂/缓存与错误，完成受影响验证 |
| `H07-K8-finnhub-daily` | 完成 | 单目标通过原真实执行器及标准结果，保留参数、时钟、原修订、错误和生命周期，删除原双重登记；受影响验证与目标层分别记录 |
| `H07-K9-tushare-stock-daily` | 完成 | 两个目标沿原 Control/Runtime → 来源绑定 → 原 HTTP client → 标准结果闭环；原工厂预算、凭据/端 |
| `H07-K10-yahoo-stock-etf-daily` | 完成 | 六目标完成来源绑定与实际执行器闭环，原参数、日期、单位未知、MultiIndex 身份及工厂缓存保持；本叶完成时 US INDEX |
| `H07-K11-yahoo-us-index-daily` | 完成 | 既有指数单目标通过原执行器与标准结果，原身份/单位/复权/单响应语义保持，旧 Native 单登记删除，股票/ETF 及 Shar |
| `H07-K12-longbridge-daily` | 完成 | 八目标迁移与原执行器闭环，工厂/OAuth/probe/缓存/SDK 原行为和修订保持，删除旧对应登记，受影响验证及库存等价通过 |
| `H07-K13-yahoo-share-windows` | 完成 | 两项已有有界参考窗口复用标准合同与原执行器，单一来源登记、原事实与消费边界保持，HTTP/错误/冻结相关回归和库存等价通过 |
| `H07-K14-futu-daily` | 完成 | 十二目标经原隔离入口与标准处理器完成迁移，完整分页/释放/预算/错误及原工厂缓存保持，精确登记与修订等价；目标与真实来源分层记录 |
| `H07-K15-retire-native-daily` | 完成 | 空 Native 日线生产分支退役，已迁移非 HiThink 日线检查复用标准处理器，未迁移路径和 HiThink 专有语义保持， |
| `H07-K16-futu-quote` | 完成 | 四个既有精确报价迁入标准绑定，原 SDK/工厂/投影/错误保持，删除旧对应登记与供应商分支，原检查复用与回归通过 |
| `H07-K17-futu-static-info` | 完成 | 既有四项当前资料迁入独立强类型合同与标准处理器，原身份/整数/未知/释放/预算/错误保持，原 HTTP/probe 复用，删除旧对 |
| `H07-K18-security-lot-size` | 完成 | 两来源复用标准当前参考合同，来源专有投影归模块、原工厂/缓存/时钟/摘要/错误与主备保持，旧对应登记删除；目标与真实来源分层记录 |
| `H07-K19-longbridge-quote` | 完成 | 四既有报价标准绑定与实际投影，原代码/时钟/结果原型/空与错误保持，删除旧对应登记/供应商分支，工厂/OAuth 回归通过 |
| `H07-K20-yahoo-quote` | 完成 | 七既有报价（含 US INDEX）标准绑定与单响应校验，原代码/quoteType/未知与失败保持，删除旧对应登记/供应商分支，不 |
| `H07-K21-native-stock-quotes` | 完成 | 三既有单标股票报价来源绑定，原预算/参数/时钟/错误/工厂保持，旧分支/对应登记删除 |
| `H07-K22-alphavantage-quote` | 完成 | 单标标准投影校验真实身份、缺失与零，预算/错误/原工厂保持，本地适配修订与来源协议分别表达，不改 SDK 或旧冻结 |
| `H07-K23-efinance-pytdx-quotes` | 完成 | 三既有报价标准绑定，efinance 股票单标失败不走原生全市场，pytdx 校验身份/缺失，缓存/单位未知/错误与原工厂保持 |
| `H07-K24-akshare-etf-quote` | 完成 | 既有 ETF/eastmoney 单标接口标准绑定，原参数/证券交易所/预算/错误/未知保持，旧对应分支与登记删除 |
| `H07-K25-akshare-stock-em-tencent` | 完成 | 两既有来源报价标准绑定、源内缓存/有界次数/单位/时钟保持，原登记移除 |
| `H07-K26-akshare-stock-sina` | 完成 | 响应身份/参数边界收口后迁移，保留原 SDK 原生分析与错误边界，不能把输入代码当上游身份凭据 |
| `H07-K27-hithink-quotes` | 完成 | 两项标准报价绑定及原工厂/错误/单位/时钟/Guard 快照闭环，移除对应旧登记与 SDK 分发 |
| `H07-K28-fund-nav` | 完成 | 首次标准化已有最新净值能力，建立强类型请求/结果与 Schema/关联校验、小型处理器和两来源绑定；来源拥有 SDK 列名投影及基 |
| `H07-K29-fund-nav-history` | 完成 | 依赖 K28 的点模型/日期边界里程碑，建立独立历史请求与序列合同、窗口/limit/单调唯一校验及两绑定；保留完整来源校验后截窗 |
| `H07-K30-nav-diagnostics` | 完成 | 诊断复用最新/历史合同及同一源绑定，保留原 probe 只读、cache=false、样本窗口/观察与工厂上下文；退役诊断执行对S |
| `H07-K31-fund-holdings` | 完成 | 单既有能力建立标准请求/持仓结果/Schema/处理器并来源绑定，字段/季度/明确百分比转换归适配器；保留原空年份回看、错误、观察 |
| `H07-K32-holdings-diagnostics` | 完成 | 诊断消费同一标准合同/绑定，删除 Runtime 原 SDK 持仓方法/列名校验并固化边界；实际工厂、缓存隔离、错误、草稿和无路由 |
| `H07-K33-chip-summary` | 完成 | 两来源绑定同一强类型估算摘要合同/处理器，来源适配拥有字段、身份、单位与报告日，业务消费删除SDK DTO/比例猜测；保留原SDK |
| `H07-K34-special-etf-daily` | 完成 | 分开完成Tushare ETF与HiThink ETF来源绑定/工厂/修订事实迁移，保留原分页、范围、单位、原文/计算/准入与交互 |
| `H07-K34a-tushare-etf` | 完成 | 一精确绑定替换三中央事实，原SDK工厂/基金日线入口、4.5s、完整分段、单位与错误不改；公共执行器删除TushareETF特判， |
| `H07-K34b-hithink-etf` | 完成 | 一个qfq目标绑定原专用读取，来源拥有工厂/请求元信息/错误，删除中央登记/Runtime特判并保留交互/稀疏/单位/修订/凭据代 |
| `H07-K35-public-fees` | 完成 | 六目标分子叶迁入费用标准合同/处理器和三来源模块，来源绑定派生原目录/修订，删相应旧登记，原JSON内容/摘要/文档/覆盖/收费政 |
| `H07-K36-legacy-status` | 完成 | 旧聚合七目标建立强类型请求/结果/Schema及来源绑定，分别保留公告、结构化与盘中原证据/窗口/错误，删除对应旧登记与公共供应商 |
| `H07-K37a-notice-cash` | 完成 | 公告现金源事件绑定、标准请求/现金结果与类型化事件上下文，复用原执行器；动态修订从来源派生，删旧中央目标/供应商分支/工厂登记，原 |
| `H07-K37a-live` | 完成 | 2026-10-12原正式入口续期24小时、版本2原scope；原Server真实现金读取、新Run b60471f6 succe |
| `H07-K37b-eastmoney-cash` | 完成 | 原严格合同/拒绝兼容保持；普通研究正向按K37b-R1～R6新合同通过，真实单基金页面→标准资料→新快照→现金计算→页面/下载→断 |
| `H07-K37c-rqdata-events` | 完成 | 两事件目标迁入来源定义、原账号工厂、强类型现金/拆分合同与原映射/隔离执行；目录/修订/凭据与当前准入查找派生，退役公共RQ执行特 |
| `H07-K37d-eastmoney-split` | 完成 | 复用原持久日期映射、原页面/分页/时钟、Split合同，保留原生效日与登记日；本地与目标代码移植完成 |
| `H07-K37d-live` | 完成 | 原159516映射/证据/版本1准入复用；追加明确一次预算后，原Server单次HTTP200/observed，两条ratio= |
| `H07-K37e-tushare-cash` | 完成 | 保留原原文先于账号的多重guard、30s总预算、实际Decimal HTTP解析/可见日和原adapter凭据缓存；原精确时钟不 |
| `H07-K37f-hithink-cash` | 完成 | 最后一个精确目标完成来源绑定，原文先行、全部准入symbol范围、environment/control快照、精确时钟、30s m |
| `H07-K37f-live` | 完成 | 依据2026-10-13用户产品决定，以普通现金研究的新合同验收；现有合法配置、用户已选来源、未知标准记录、有限具体事件核对、新快 |
| `H08-K3-cache-control-context` | 完成 | 增加原Data V3的只读缓存上下文（控制事实投影，不执行来源），先用于即时价并迁移其余受影响缓存；fresh/last-vali |
| `H08-K3a-local-and-projection` | 完成 | 五类缓存本地移植、共享/包级/静态门禁和正式目标只读投影完成；不代表真实切代次/故障或缓存消费验收 |
| `H08-K3b-live-cache-generation` | 完成 | 目标原Server消费和真实缓存代次、停用/恢复、一次有界错误验收已由quote-generation/four-cache/so |
| `H10-K1-ui-draft` | 完成 | 原路由界面的五独立功能、精确候选/参数范围、草稿开关和显式保存CAS完成；隔离保存及真实浏览器草稿通过 |
| `H10-K2-target-save` | 完成 | 原浏览器入口权限当前可用，同一5173开发服务恢复后，真实控件保存五独立功能117→118，原Server五消费全部通过；关闭状态 |
| `H07-K38-runtime-residue` | 完成 | 继续原Runtime/SourceDefinition接缝收敛公共来源特判 |
| `H07-K38a-credential-revision` | 完成 | 来源声明拥有准入修订策略及认证载荷，公共层保留用途隔离摘要；新providerId、原三家指纹字节、权限范围、旋转失效和整数版本回 |
| `H07-K38b-quote-guard` | 完成 | 公共报价执行按有限来源声明准备/复核；原HiThinkGuard实现不改，同次快照、预算与后置拒绝回归通过，正式DSA同步和目标原 |
| `H07-K38c-retire-implicit-daily` | 完成 | 通用日线SDK/attrs死分支退役，原timeframe/控制拒绝和零执行合同保持；显式V3入口回归与正式目标同步通过 |
| `H07-K38d-quote-admission-reader` | 完成 | 来源拥有兼容准入reader，全部scope/有效期/同次可选快照及新provider隔离回归通过；正式目标同步/原报价读取通过 |
| `H07-K38e-revision-view` | 完成 | 修订从唯一DailyBinding派生，未登记报价失败关闭；140项修订/manifest结果逐项相同，本地及目标目录回归通过 |
| `H08-K3b-quote-generation` | 完成 | 本次精确授权的真实Server报价功能关闭/恢复与缓存代次验收完成；非故障注入，不替代其他Provider配置/来源失败及其余四类 |
| `H07-K38f-hithink-probe` | 完成 | HiThink三固定诊断由来源策略拥有，原SDK/代表证券/单日qfq/4.5s、安全错误和draft/non-draft生命周期 |
| `H07-K38g-inventory` | 完成 | 核对通用probe四来源的工厂与参数生命周期，形成可执行迁移边界 |
| `H07-K38g-quote` | 完成 | 依赖K38g-inventory，承接K38/AC13/14/20，迁移Tushare/TickFlow代表报价的canonica |
| `H07-K38g-daily` | 完成 | 依赖K38g-quote的有限adapter诊断上下文就绪，承接K38/AC13/14/20，迁移Finnhub/AlphaVan |
| `H07-K38h-inventory` | 完成 | 依赖K38g，承接既有K38宽manifest兼容缺口及AC13/14/20 |
| `H07-K38h-manifest` | 完成 | 依赖K38h-inventory，承接原K38/AC13/14/20，迁移HiThink原现金/股票目录兼容与删除对现行绑定无效的 |
| `H07-K38i-inventory` | 完成 | 依赖K38h，承接原K38公共来源分支缺口与AC13/14/20，限定环境凭据读取/方法推导 |
| `H07-K38i-environment` | 完成 | 依赖K38i-inventory，承接原K38/AC13/14/20，迁移六来源环境凭据字段/方法及最终快照附加 |
| `H08-K3b-next-preflight` | 完成 | 依赖H08五缓存本地合同与当前目标代码就绪，承接K3b其余四缓存/配置/来源失败真实门禁 |
| `H08-K3b-transport-observation` | 完成 | 依赖next-preflight已确认的原入口/计数缺口，承接H08零调用真实门禁的必要证据 |
| `H08-K3b-source-config-preflight` | 完成 | 依赖五缓存功能代次就绪，承接原Provider配置代次真实门禁，先准备精确案例 |
| `H08-K3b-source-failure-preflight` | 完成 | 依赖原报价缓存合同及控制代次就绪，承接原一次有界错误目标门禁，先准备隔离HTTP故障案例 |
| `H08-K3b-source-config-case` | 完成 | 依赖source-config-preflight就绪及本次独立授权，承接原Provider配置代次真实缓存门禁 |
| `H08-K3b-four-cache-case` | 完成 | 依赖next-preflight的精确方案与transport-observation就绪里程碑，承接其余四缓存真实门禁 |
| `H09-K2-price-preflight-next` | 完成 | 依赖原K2合法价格要求与当前绑定就绪，承接既有组合消费/新冻结的数据资格缺口 |
| `H09-K2-research-options-preflight` | 完成 | 依赖两窗预检及原K2读取接缝，修复验收驱动遗漏的既有研究读取选项，承接合格价格必要缺口 |
| `H09-K2-target-packet` | 完成 | 依赖完整原研究选项价格预检就绪，承接原H09-K2真实业务组合与冻结，准备可审查的精确执行包 |
| `H09-K2-status-error-envelope` | 完成 | 依赖真实Worker失败证据，承接原标准错误/部分失败合同及新冻结阻断的必要修复 |
| `H09-K2-new-case-after-error-fix` | 完成 | 依赖status-error-envelope目标核对，承接原K2真实组合/新冻结的修复后验收 |
| `H09-K2-creation-observation` | 完成 | 依赖本次真实晚到提交证据，承接K2真实新冻结执行包的必要生命周期缺口 |
| `H09-K2-policy-projection-fence` | 完成 | 依赖101→103真实创建失败，承接原组合控制修订/冻结的必要接缝修复 |
| `H08-K3b-source-failure-case` | 完成 | 依赖source-failure-preflight、正式目标同步及本次独立故障授权，承接原报价有界错误真实缓存门禁 |
| `H07-K38aa-quote-public-units` | 完成 | 依赖K38z及API实际接缝审计，承接AC05/14/20单位适配不进入公共业务入口的既有义务 |
| `H07-K38ab-quote-result-schema` | 完成 | 依赖K38aa的单位合同就绪里程碑，承接原AC01/04/14请求/结果强Schema和标准对象隔离义务 |
| `H07-K38ac-daily-public-units` | 完成 | 依赖K38ab及实际API调用链审计，承接AC04/05/14/20字段差异由来源拥有的既有义务 |
| `H07-K38ad-daily-window-plan` | 完成 | 依赖K38ac与原多窗口调用链，承接AC01/04/14/20来源参数差异隔离及原有界查询行为 |
| `H07-K38ae-query-operation-boundary` | 完成 | 依赖K38ad与AC06/08注册操作审计，修复现有查询绑定误声明订阅的必要缺口 |
| `H07-K38af-non-bar-key-boundary` | 完成 | 依赖K38ae定向操作边界就绪，承接AC02/06精确身份及能力参数隔离义务 |
| `H07-K38ag-canonical-capability-contract` | 完成 | 依赖ae/af实际注册边界就绪，承接AC02/03/07同一标准能力复用及新增能力契约义务 |
| `H07-K38ah-factory-error-boundary` | 完成 | 依赖ag及Runtime实际工厂调用链，承接AC03/04/09新来源复用/标准错误与凭据隔离义务 |
| `H07-K38ai-local-source-readiness` | 完成 | 依赖ah与目录就绪实际调用链，承接AC02/03/14/20来源拥有实现差异及目录/执行一致性义务 |
| `H07-K38ab-a-quote-source-aliases` | 完成 | 依赖K38aa及K38ab实际来源库存，承接K38ab标准结果来源前置契约 |
| `H07-K38z-manifest-source-facts` | 完成 | 依赖K38y及公共构造器实际引用审计，承接AC14/20单一登记事实与公共供应商分支收拢 |
| `H07-K38y-research-instrument-binding` | 完成 | 依赖K38x，承接AC05/14及原研究身份/单位事实的已定位供应商分派 |
| `H07-K38x-research-frame-projection` | 完成 | 依赖K38w及零量真实接缝，承接AC05/14来源DTO/attrs不由公共研究消费者解析的必要缺口 |
| `H07-K38w-research-calendar-binding` | 完成 | 依赖K38v及研究接缝实际调用链，承接AC05/14消费者不识别供应商、旧覆盖保持的必要缺口 |
| `H07-K38v-policy-admission-guard` | 完成 | 依赖K38t及实际公共接缝审计，承接AC14/20供应商后置准入守卫收拢 |
| `H08-H09-obligation-reconcile` | 完成 | 依赖已有缓存/功能及组合冻结真实结果，承接H08/H09父项过期摘要与依赖对账 |
| `H07-K38u-all-provider-check-regression` | 完成 | 依赖K38t扩查，承接原逐来源精确诊断回归义务 |
| `H07-K38t-exact-dependencies` | 完成 | 依赖K38当前接缝审计，承接AC14/20的新来源不修改公共执行/环境供应商分支 |
| `H11-target-runtime-recovery` | 完成 | 依赖DSA正式镜像/健康及当前政策111只读复核，承接原Server/Worker目标消费、缓存/冻结/最终门禁 |
| `H07-K38s-sdk-source-build-gap` | 完成 | 依赖本地诊断源码稳定及正式dsa构建失败，承接必要目标更新门禁，不新增SDK业务能力 |
| `H07-K38p-hithink-event-probe` | 完成 | HiThink来源旧严格probe_read及前后准入保持兼容；原212定向/2710包级和目标零尝试证据保持 |
| `H07-K38q-tushare-event-probe` | 完成 | Tushare来源拥有原mapped probe，工厂仍请求绑定cache=false/probe=True，凭据冻结、4.5秒/ |
| `H07-K38r-eastmoney-event-probe` | 完成 | AK来源现金/拆分两probe已各自声明；现金原fetch_fund_dividend_observations/max_page |
| `H07-K38o-rqdata-event-probe` | 完成 | 依赖K38官方诊断迁移与K37事件绑定，承接原在线事件精确诊断供应商分派残留 |
| `H07-K38n-independent-notice-probe` | 完成 | 依赖K38l实际再现的七独立功能诊断缺口，承接原五独立能力/来源检查合同 |
| `H07-K38m-capability-regression-fixtures` | 完成 | 依赖K38k/l扩大能力回归，承接原迁移回归及H08/H11受影响门禁 |
| `H07-K38l-notice-exact-probe` | 完成 | 依赖K38j/k本地接缝，承接原K38官方精确诊断残留 |
| `H07-K38k-hk-us-exact-probe` | 完成 | 依赖K38j本地来源诊断接缝，承接K38/AC14/AC20的公共供应商分派残留 |
| `H07-K38j-cn-fee-exact-probe` | 完成 | 依赖K38最终公共接缝审计，承接原精确来源检查的供应商残留 |
| `H07-K38-probe-runtime-qualification` | 完成 | 依赖K38g工厂/参数迁移及当前目录，承接原真实probe层的控制资格核对 |
| `H09-K2-two-session-result-proof` | 完成 | 依赖实际succeeded Run ff4bbf86…、完整新快照与原Worker断网两次一致重放，承接原K2业务验收驱动的结果层 |
| `H09-K2-response-diagnostics` | 完成 | 依赖6889043e…明确失败/107恢复，承接原标准错误和真实组合缺口的必要定位 |
| `H09-K2-response-chain` | 完成 | 依赖已确认失败Run/107恢复及紧接107→109响应案例完整恢复，承接原真实组合执行包的必要证据连续性 |
| `H09-K2-snapshot-policy-projection` | 完成 | 依赖Market比较修复及实际Snapshot调用链，承接同一政策事实在冻结前后的完整核验 |
| `H09-K2-baostock-query-isolation` | 完成 | 依赖103→105真实晚到失败与实际调用链，承接原组合不同来源事实/执行生命周期的必要缺口 |
| `H07-K38aj-rqdata-guard-errors` | 完成 | 承接原AC04/09/11/20与K37c/K38o，2026-10-12用户确认RQ无法申请凭据，先推进代码层；真实账号义务保留 |


## 验收与证据入口

AC01～AC20 及来源专属合同由[原 Spec](../specs/2026-10-09-unified-data-capability-adapter.md)与其来源附页维护；已完成阶段不消除 K37 的真实正向条件，旧完整覆盖/Runner 边界不因少量事件成功而放行。

- [来源迁移与拒绝证据](../archive/reviews/2026-10-11-unified-data-capability-source-evidence.md)
- [真实运行、普通现金、TickFlow、权限提示及分层对账](../archive/reviews/2026-10-11-unified-data-capability-runtime-evidence.md)
- [原始阶段记录](../archive/tasks/2026-10-09-unified-data-capability-adapter-history.md)

## 最终一致性 Review

代码、拒绝路径、已选来源和已保存窗口按其原范围通过；RQ/Tushare 正向条件仍阻止父项收口。新输入与明确执行指令到位后只复验相应原叶，不重跑未变证据，不以文档精简降低合同。
