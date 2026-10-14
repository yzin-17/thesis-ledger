# 统一数据能力适配层：功能路由、组合冻结与早期目标验证记录

> 归档说明（2026-10-14）：本文保留原日期、输入、命令、结果、失败与未覆盖条件，供历史追溯。下文“当前”与状态仅指原记录时点；本次归档不代表未通过验收已完成。现行义务由[当前 Task](../../tasks/README.md)及其 Spec 管理，发布外部门禁仍从[发布门禁记录](../../reviews/2026-08-18-v1.0-release-gate-review.md)进入。


对应[原 Task](../../tasks/2026-10-09-unified-data-capability-adapter.md)与[原 Spec](../../specs/2026-10-09-unified-data-capability-adapter.md)。

本文件是从原 Task 按语义抽取的历史实施与验证记录，迁移时间为2026-10-11。原小节编号、当时结论、授权、命令、失败/修正与证据路径保留；其中“当前”“下一叶”和勾选仅指当时基线，不维护活动计划。当前依赖、状态与执行边界以原 Task 为准。原始临时路径仅作辅助；必要输入、过程、结果及未覆盖层级已在正文保留，不把临时文件仍存在当作证据。

<a id="record-9-1"></a>

## 9.1 当前对齐与已核对输入

用户要求先完成适配层，再检查每个数据源的适配情况，以文档表格列出差异；功能路由应合理拆分，允许功能不同的来源按需启用。需求正文与新增 AC13–AC20 见[Spec §13](../../specs/2026-10-09-unified-data-capability-adapter.md#13-全源适配检查差异矩阵与功能级路由2026-10-10-对齐)。本节是原主题的后续责任，不创建平行 Spec/Task，不将当前事项迁到 TODO。

本次已读取用户指定 `codex://threads/01a124cb-36a5-7151-bca9-cd9fddc84ff3` 对应本机日志中的任务输入和最终回复，并对照当前 Spec/Task、DSA 接入指南、生产注册、来源模块、Provider 清单及主仓路由/状态合同。只读取指定线程的用户可见内容，不以其汇报代替重跑测试或完整代码审计。

核对结果：生产 `CAPABILITY_SOURCES` 当前只有腾讯与 HiThink；精确迁移是腾讯股票/ETF 日线、腾讯 ETF 报价及 HiThink 股票日线，HiThink ETF/其他能力、富途、BaoStock 和其余来源保留原路径。原 §8.3–8.8 的“选定切片”结论成立，但不代表全部 Provider 或全部能力已经通过统一层。既有 E05 真实故障切源仍开放，原测试统计只作为那次执行记录，本轮未重新运行。

另外，当前 `HISTORICAL_TRADING_STATUS` 响应同时承载交易状态、粗 ST/风险警示、价格限制、上市阶段和 basicLifecycle；route 自身仍为 key/targets，enabled 在顶层政策，页面只有“行情与市场数据”“历史规则与状态”两组。本节据此增加真正的功能级选源、启停与聚合消费责任，不将现有分组当作已实现细分路由。

<a id="record-9-2"></a>

## 9.2 顺序、范围与状态规则

先 H01 收口适配层，再 H02/H03 全源逐能力检查，H04 形成实际差异报告，H05 定稿功能路由，然后按 H06–H12 分面实施、验证和对账。框架设计需要的最小清单确认可以提前做，但不能当作全源检查已完成；本次读取只是需求对齐，不提前勾选 H02/H03。

原 A–F 和 D00–D02 的完成状态与历史证据原样保留，F03 只证明原 AC01–AC12 的一次对账，不代表新增范围完成。原 E05 不因新规划被取消或自动勾选。新阶段有独立阻塞时继续记录具体范围，不能为追求“全源通过”擅改用户策略、购买服务或重启已取消义务。

“检查每个数据源”覆盖当前产品清单、精确库存、统一绑定和实际执行入口的并集及其真实上游；必须检查旧路径和内置资料来源，不能只遍历新注册表。未配置或已跳过来源可以完成静态检查，但保留实读未验证/已跳过；不要求强行接通全部供应商产品。发现源码存在但没有实际路由、合同或消费者时单独记录，不用供应商 manifest 代替实现。

<a id="record-9-3"></a>

## 9.3 后续任务

原任务定义、AC、依赖和勾选完整保留于[当前 Task §9.3](../tasks/2026-10-09-unified-data-capability-adapter-history.md#93-%E5%90%8E%E7%BB%AD%E4%BB%BB%E5%8A%A1)，此处不复制活动任务表。

<a id="record-9-4"></a>

## 9.4 交付检查点

| 交付               | 唯一正文位置                           | 当前状态                                           |
| ------------------ | -------------------------------------- | -------------------------------------------------- |
| 适配层框架收口     | 原 Task E05 与 H01，引用既有 A–F 证据  | 选定切片已取得证据；真实故障切源仍开放，本次未重验 |
| 全源逐能力检查     | H02/H03，完成后进入差异报告            | 未开始，不以本次抽读冒充全量检查                   |
| 差异矩阵           | H04 所定义的 Review 文件               | 尚未建立；必须由实际检查填表                       |
| 路由拆分设计与落地 | Spec §13、H05–H11，映射表归同一 Review | 需求已明确，具体全源映射与实现未执行               |
| 新范围最终对账     | H12；原任务编号与历史记录保持          | 未执行                                             |

<a id="record-9-5"></a>

## 9.5 本次文档对齐记录

本轮只在原 Spec/Task 上增量增加顺序、全源检查与文档矩阵要求、功能级启停/选源/聚合消费及新增验收和任务，未改写原 A–F 勾选或执行结果。线程最终回复与本地源码用于核对“选定迁移不等于全源完成”和当前聚合路由，不代表完整源码审计、重跑测试或当前账号在线能力检查。

本次文档验证：仅格式化新增章节片段，项目锁定 Prettier 检查通过；两份原文档除状态头与新增段落外正文保持，原 33 个任务勾选及 AC01–AC12 原行不变。25 处相对文件链接与 4 处锚点检查通过，新增 AC13–AC20 和 H01–H12 标识唯一且均有责任映射，新 H 叶全部未勾选；增量空白检查通过，Git index 与写前一致。写前副本、增量补丁及检查摘要在本机 `/tmp/tl-capability-alignment-20261010-ghnh52vk`，仅用于本次文档对比，不是业务备份。本轮没有安装 SDK、请求 Provider、调用产品 API、改变用户路由/凭据、操作 Docker/数据库或修改应用源码；没有提交或推送。已给出的功能名称是规划边界，不把它们登记为可用生产能力，也不把文档对齐当作 H01–H12 的完成证据。

<a id="record-9-6"></a>

## 9.6 H01 实施启动（2026-10-10）

用户附件明确继续代码实施；§9.5 保留此前仅文档对齐的历史，不追溯改写。已重读当前 Spec §13、Task §9、接入指南及文档规则，核对规则文件未发生变化且无更深层 AGENTS。实际工作树仍为主仓 1258、DSA 268、infra 80 个可见记录，增量维护原文件。指定历史线程不另读原始日志；本会话既有结果只作为旧范围证据。

当时状态记录：`[x]` H01-K1：核对并补齐新能力查询的精确请求匹配、结果关联、操作及合同版本约束。精确写集为 DSA `src/services/thesis_ledger_capability_registry.py`、`src/services/thesis_ledger_order_book_contract.py`、盘口夹具/合同测试及注册测试，必要指南增量；不改现有日线/报价处理器、生产目录或用户政策。先定向失败复现，再注册/盘口/原迁移回归与语法、边界检查。
当时状态记录：`[x]` H01-K2：固定 E05 的最小真实备用验收方案及可复用入口，先核对现行目标和 CAS。当前 Effective/Desired 均为 74；合法双源价格仅 CN STOCK none/qfq，不能绕开 proof。ETF 单源须经单独授权才可临时增加备用，真实故障注入同样单独授权；不得提前执行或声明 H01 完成。

H02–H12 保持未开始；H01 内只做框架接缝复核与准备验收所需的最小只读盘点，不提前建立空矩阵或批量迁移旧来源。框架发现 QueryBinding 尚可声明 subscribe，且通用入口没有强制能力专属请求/结果关联；此缺口由 H01-K1 修复，不能依赖测试适配器手工校验当作框架约束。

当时状态记录：`[x]` H01-K3：在现有 Provider 配置事务补可选期望配置代次，作为受保护恢复前置。Spec §6.3 定义兼容行为；先 DSA 输入/持久化条件及隔离测试，再 Server 输入与现有 DsaClient 透传测试，最后可复用验收入口。写集：DSA `provider_credentials.py`、`thesis_ledger_control.py`、原控制测试；主仓 `market-provider-input.ts`、`market-control.service.ts`、`integration/dsa/dsa.client.ts` 及相应定向测试。不新增数据库结构/事实系统，过大 Control 文件通过复用原输入校验减少行数；没有真实配置写操作。

H01-K2 的可审核案例：新增 `scripts/market-route-failover-case.mjs`、`market-route-failover-acceptance.mjs` 与隔离测试。默认只读预览已成功，观察到政策 74、HiThink 配置代次 3，CN/ETF/DAILY_BAR/1d/qfq 的现有主源为 `hithink/fund-market-historical`，`tencent/tencent` 有唯一且就绪的同口径整窗能力。仅拟临时将此一条保存路由扩为 `[原主源, 腾讯备用]`；然后短暂停用 HiThink（影响其全部产品能力，正常窗口预计少于 60 秒），经原 Server API 请求 510300.SH、2024-07-15 至 2024-07-19、interactive、refresh=true，检查实际腾讯来源/index=1 和完整五日整窗，再恢复 HiThink 启用标记及原路由选择并验证主源。

变更采用原持久化事务：Provider expectedConfigVersion；政策新增可选 expectedRevision，仅产品写操作使用，不修改 DSA Desired Policy 数据合同。相应写集另含 `market-policy-storage.ts` 及现有存储测试；条件冲突包括并行者恰好提交相同内容的情形。执行/恢复均只针对本案例获得明确提交确认的变更；超时等未知结果不凭代次猜测所有权，停止覆盖并保留无凭据的恢复记录，必要时由用户核对。信号取消仍尝试恢复；不执行 Docker stop、不改凭据/准入、Ledger 或其他路由。当前没有执行这些受保护操作，须取得本案例的具体授权。

初步新证据：新框架回归先 8 失败/17 通过，修复后定向 48 通过；本轮 DSA 原迁移/目录/控制/凭据/HTTP 集合 287 通过。Provider CAS/原配置输入 39 通过；Server Provider/政策输入及原事务定向、验收脚本测试已通过。后续包/门禁与必要同步未完成，不用这些初步统计标记 H01 或 E05 完成。

用户随后明确授权上述一次精确 E05 案例，包含临时 ETF qfq 腾讯备用、短暂停用 HiThink、原 API 整窗读取及按版本条件恢复。授权不扩大到其他来源/路由/研究语义；先完成本轮包和门禁及正式同步，再固定 `--expected-policy=74 --expected-config=3` 执行。前置版本变更时退出，不自行改为新的测试范围。

<a id="record-9-7"></a>

## 9.7 H01 / E05 收口证据（2026-10-10）

实际命令：DSA 19 个相关文件的 pytest（前述 17 文件加 `test_thesis_ledger_control.py`、`test_provider_credentials.py`）326 通过；最后报价市场匹配增量再跑注册/腾讯报价/盘口 67 通过。Server 原市场与冻结回归命令同 §8.7，增加本轮政策/Provider CAS：77 文件、886 通过，5 文件/27 项条件测试跳过；CAS 定向 20 通过。验收脚本 `node --test scripts/market-route-failover-acceptance.test.mjs` 13 通过，三个脚本 `node --check` 通过。Server typecheck/build、受影响 TS ESLint、DSA syntax/严重 flake8/deterministic、新能力边界、主仓边界/依赖/尺寸通过。`node scripts/lint-workspace.mjs --guardrails` 8 组/1967 文件通过，既有警告保留；误用无参数全目录 lint 扫入工作区外 `.recovery-artifacts` 导致 503 项项目解析错误，该次失败保留，不称为严格全仓 lint 通过。使用原有 workspace guardrail 范围及精确写集 lint，未加 ignore 或改阈值；Node 脚本由语法与测试覆盖，原 ESLint 配置不检查它们。

正式 infra `sync-code.sh thesis-ledger` → `sync-code.sh dsa` 均正常结束（`/tmp/tl-cap-h01-sync-{server,dsa}.log`），消费者先行。预检通过，镜像保持、无数据库结构/外部卷变更；仅可写层快更。

经用户具体授权执行 `rtk proxy node scripts/market-route-failover-acceptance.mjs --execute --expected-policy=74 --expected-config=3`，退出 0。案例 `f4ffb611-00b0-4062-b6e8-c5102fb73fe5` 的实际源/整窗如下：

| 阶段 | 实际源及目标 | 政策/配置代次 | 原 Server API 结果 |
| --- | --- | --- | --- |
| 基线 | HiThink / fund-market-historical，index=0 | 74 / 3 | 510300.SH ETF/qfq，2024-07-15–19，5 根、非缓存 |
| 受控来源停用 | 腾讯 / tencent，index=1 | 75 / HiThink=4且停用 | 同窗5根、非缓存、整窗来自腾讯；没有拼接价格或伪造股票 proof |
| 恢复 | HiThink / fund-market-historical，index=0 | 76 / HiThink=5且启用 | 同窗5根、非缓存；主源恢复 |

独立只读复核：Desired/Effective 76/76、applied、effectiveStale=false；原 DSA 层目标序列摘要仍为 `69138950692f7039fed40031c563f0dff8ea0175dcf4d032ec0e0cedf9eb41e6`。HiThink credentialConfigured=true、method=api_key，实际控制补丁仅 enabled/期望代次/请求身份，不提交 credentials/settings。政策和配置代次按受保护变更递增，不回退旧修订；所有原主备选择已恢复。恢复记录 `/var/folders/t6/qhk7wqzd07g25xwy7mr46gb00000gn/T/tl-route-failover-e5NQhj/recovery.json` 为 verified、两项提交所有权均已确认，含无凭据的原政策和证据。

更新后的实际 Worker 再运行既有只读 `research-window-replay.mjs`：旧 run 70eda2d7 的 a8069a8e8cd3c551、新 run c1a51028 的 2c730d72e0adb7c4 均两次一致、10 资产、阻断5类网络且调用0。没有新建研究协议、改旧结果/冻结、写 Ledger 或重开历史业务门禁。§8.8 原 E05 开放描述保留为当时历史，本节才关闭该门禁。此结论是框架与选定回归完成，不是所有来源迁移完成。

H02 启动写集：从现行 Provider 清单、精确库存、新绑定、原 Runtime/消费者接口的并集只读导出；优先验证导出无 SDK 实例化、网络或配置写入。库存报告将在 H03/H04 完成后进入唯一矩阵，不提前建立空报告或生产登记表。H02–H12 仍按顺序单独验收。

<a id="record-9-8"></a>

## 9.8 H02–H05 全来源检查与功能拆分定稿

精确写集：DSA 新增 `scripts/export_thesis_ledger_capability_inventory.py`、`tests/test_thesis_ledger_inventory_export.py`；主仓新增唯一 `docs/reviews/2026-10-10-provider-adaptation-and-route-matrix.md`，增量修改 docs/README、reviews/README、本 Spec §13.7 和本 Task。未修改其他来源/历史数据/Futu 任务或真实政策。

导出命令：DSA `env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/export_thesis_ledger_capability_inventory.py > /tmp/tl-cap-h02-inventory.json`；当前 19 Provider、130 精确目标、97 分组、2 新定义/9 新绑定，265 个产品依赖源码模块、271 个带摘要 DSA 输入、61 个 Server 消费/路径文件。包含模块名常量指向的隔离 worker，未运行 SDK。安全测试命令 `env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q tests/test_thesis_ledger_inventory_export.py`：6 通过，日志 `/tmp/tl-cap-h02-export-tests.log`，证明文件/目录写入、数据库、网络与 SDK 实例均提前拒绝。

H03 两组现行合同回归分别 22 文件/313 通过及 18 文件/313 通过；准确文件范围与命令为该组日志测试 session 的 collected files，日志 `/tmp/tl-cap-h03-audit-regression.log`、`/tmp/tl-cap-h03-nonbar-audit.log`；矩阵 §1 记录输入/验证层级，§2/3 逐源逐能力结论，§4 为完整精确组合，§5 为旧路由映射。目标只读 Provider 检查见矩阵，不将测试声明变成全部账户已验证。HiThink Unknown thscode、BaoStock 日期/状态边界及 CN 股票 invalid_proof 继续复用，不逐证券补丁。

H05 已在 Spec §13.7 定义首批五项功能、专有参数、启停兼容与冻结边界；迁移预览不保存，真正策略变更另需授权。H06 起拆单责任子叶：

当时状态记录：`[x]` H06-K1-shared-contract：只改共享 Schema、导出和跨语言固定样例；证明五项能力参数、单位/时钟/未知/证据/关联边界，不改业务研究语义。
当时状态记录：`[x]` H06-K2-dsa-contract：只改 DSA 强类型合同和合同测试；标准化五项能力并接通已有 registry 校验，不加入生产目录。
当时状态记录：`[x]` H06-K3-policy-compatibility：串行修改共享 route、DSA 校验/Effective 与 Server 控制合同；旧序列化不注入字段，新功能显式关闭、禁用保留目标。纯迁移预览无写入，CAS 保护。
当时状态记录：`[x]` H07-K1-status-and-dates：来源模块拥有 BaoStock 日级状态/粗风险/基础日期与 official-states 事实投影，逐能力准入/覆盖，不回补价格 proof；合同、统一绑定和现有实际执行入口贯通后才勾选。
当时状态记录：`[x]` H07-K2-efinance-daily：迁移既有 CN STOCK/ETF、none/qfq/hfq 六个精确日线目标；来源模块拥有定义/工厂/绑定/修订和精确 SDK 参数投影，原 Native 库存删除对应行。保持原源修订、单位未知与失败分类，使用现有 Runtime/SDK fixture 回归，不修改未迁移报价/净值或用户路由。
当时状态记录：`[x]` H08-K1-feature-epoch：通过现有 Runtime/Reader 的功能启停、目标匹配、代次及缓存检查，证明关闭前后无新增调用和晚到结果隔离。
当时状态记录：`[x]` H08-K2-server-status-routes：演进现有 DsaDataCapabilityReaderV3，为五项独立功能增加按当前 Effective Policy 的读取；只用用户已选的最多两个目标、单目标请求由原 Runtime 执行，Server 是唯一切源方。功能关闭/政策变化不继续取数；部分覆盖明确返回 partial，不替代 H09 的必需字段判断。定向测试与旧 Reader 回归通过后才勾选本代码叶，目标消费单独验收。

当前 H02/H03 完成为全清单静态核对及现行测试；H04/H05 完成为真实矩阵/设计定稿，不能当作 H06–H12 后端、UI、用户迁移或目标运行态通过。下一执行叶 H06-K1；待完成必要实现再按最小目标更新和申请精确功能验收。

<a id="record-9-9"></a>

## 9.9 H06 与首批 H07/H08 实施记录（进行中）

本轮新增实际代码，不只建立声明：五项能力有独立强类型请求/结果和 TS/Python 同义校验；风险按必需类别、规则按比例/精确值判定覆盖；基础日期不携带价格窗口。QueryBinding 在调用前检查合同/目标及来源参数，结果再校验身份、窗口、参数、政策代次。新版 Callback 带固定目标，沿用原 registry，没有供应商方法透传或生产 ORDER_BOOK。

共享写集：`packages/schemas/src/market-status-capability-id.ts`、`market-status-capabilities-v1.ts`、`market-status-route-migration-v1.ts`、`market-route-v3.ts`、`index.ts`，三项新增定向测试和双仓同字节 `market-status-capabilities-v1.shared.json`。纯迁移预览只使用来源绑定提示，保留旧策略及已保存新策略；仅创建实际可映射、默认关闭的新行。无法映射/旧备用转为唯一候选时明确需要选择，不保存、不增修订、不引入未选来源。

DSA 写集：新增 `src/services/thesis_ledger_status_capabilities_v1.py`、`thesis_ledger_feature_policy.py`、`thesis_ledger_status_query_operation.py`、`api/thesis_ledger_status_capabilities.py`；增量修改 registry、order_book_contract 回调、Control、reference_data、current_data_execution/current_data_route、exact_route_inventory、price_route_access；新增 BaoStock 和 official_states 来源模块，登记于唯一 capability_sources，并移除已转交来源的中央 manifest/factory 记录。原 HISTORICAL_TRADING_STATUS 与未迁移价格执行路径保留，旧数据包/上游修订未改写。Control 大文件由 2450 行降为 2447 行，Runtime 仅移除一条中央工厂记录。

BaoStock 新绑定三项：日级状态、粗 ST、基础日期。日级查询没有调用基础日期接口；基础日期没有调用日历/历史状态；不满足沪深身份、来源窗口或粗风险参数的请求在 SDK 调用前拒绝。official-states 新绑定七个精确目标：停复牌状态、风险、三条价格规则、两条上市/退市阶段；复用已有只读证据读取，按不同能力投影，不重新抓公告或伪造缺失字段。旧停复牌文档无 hash/观察时钟时如实输出 unknown，规范化查询摘要明确标注 normalizedResponse。

执行面沿原 `execute_request` → reference_data 小型处理器 → `execute_current_data_request` → `_execute_with_metadata` → registry；新 API 是现有认证的 V3 数据入口，Server 增量演进 `DsaDataCapabilityReaderV3.statusCapability`，沿原 DsaClient 的 `dataCapabilities`/post/期限/错误投影，没有平行客户端或网关。Server 写集还包括 `test/integration/dsa-status-capability-reader-v1.test.ts`。Provider 启停往返以 configVersion 隔离：即便 Desired revision 未变、来源已恢复为 enabled，旧在途结果也不发布。

当前定向结果：共享 44 通过；DSA 独立功能/实际包与 SDK fixture 闭环 51 通过（`/tmp/tl-cap-h07-all-path-test.log`）；Server Reader/CAS 31 通过（`/tmp/tl-cap-h07-reader-test.log`）；共享/Server typecheck 与共享 build 通过。此前 H06 包级 91 文件/1017 通过；最终输入的包级、扩大 DSA 回归与工程门禁正重新执行，不先将 H06/H07/H08 总叶勾选。当前库存为 19 Provider、140 精确目标、4 来源模块/19 绑定（`/tmp/tl-cap-h07-inventory.json`）；矩阵将按本批输入增量对账。

尚存缺口：当前只迁移选定四个来源模块与首批状态/日期，其他来源仍按矩阵的旧路径继续；功能级缓存共享/失效、必要消费者组合及新版冻结、UI、真实功能策略与目标验收尚未完成。没有保存新的用户功能路由，也没有实际启停 BaoStock/official-states。下一执行叶：完成本批工程门禁、回写矩阵，再推进来源专有参数目录事实及功能消费/冻结；真实配置验收须先准备具体脚本与恢复方案，再单独授权。

本批最终验证：DSA `env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q` 后跟 official_capability_path、baostock_capability_path、feature_policy、status_capabilities_v1、baostock_daily_status、baostock_status_routes、control_v3、current_data_route、capability_registry、catalog_sources、contract、native_exact_daily、order_book、inventory_export、trading_status_routes、trading_status_listing 对应 `tests/test_*.py` 共 16 文件：219 通过（`/tmp/tl-cap-h07-dsa-final.log`）。共享包 `pnpm --filter @thesis-ledger/schemas test`：91 文件/1017 通过（`/tmp/tl-cap-h07-schema-package.log`）。Server `pnpm --filter @thesis-ledger/server exec vitest run test/market test/integration/dsa-status-capability-reader-v1.test.ts test/integration/dsa-chart-v3.test.ts test/integration/dsa-trading-status-v3.test.ts test/backtest/v3-frozen-comparison.test.ts test/backtest/v3-legacy-calendar-replay.test.ts test/backtest/backtest-hithink-identity-replay-v3.test.ts`：79 文件/905 通过，原有 5 文件/27 跳过（`/tmp/tl-cap-h07-server-regression.log`）。

共享/Server typecheck、build、定向 ESLint、DSA critical flake8、两仓能力/依赖边界通过。`node scripts/lint-workspace.mjs --guardrails`：8 组/1974 文件通过，发现本轮 windowIssues/correlate 的两条复杂度警告后，按事实证据校验与请求身份职责收敛；`pnpm exec eslint packages/schemas/src/market-status-capabilities-v1.ts --rule 'complexity:[error,20]'` 无输出、exit 0（`/tmp/tl-cap-h07-new-complexity.log`），相关共享定向 37 通过、Reader 11 通过。文件尺寸门禁保留 9 条存量警告，无全 WIP baseline，不能宣称全工作树 ratchet 已独立证明。未提高阈值、ignore 或删除资产。

H06 与 H07-K1 按本批合同/执行面验收勾选；H07 总叶与 H08 总叶仍开放。H08 已验证禁用无调用、政策代次变化及 Provider 关闭/恢复时旧结果隔离；共享获取缓存与目标故障门禁尚未完成。首轮正式 `sync-code.sh thesis-ledger` 因与独立宿主 build 重叠导致 ENOTEMPTY，在宿主构建阶段退出、未替换目标代码；独立 build 完成后只串行重试原入口，不手工清 dist 或操作容器。日志 `/tmp/tl-cap-h07-sync-server.log` 与重试日志 `/tmp/tl-cap-h07-sync-server-retry.log`。

<a id="record-9-10"></a>

## 9.10 目标同步与单次精确功能验收

正式串行更新：infra `./scripts/sync-code.sh thesis-ledger` 重试通过，随后 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa` 通过。兼容性预检通过，Server/Worker/DSA healthy；镜像仍为 `2878d06a...` / `0d92aaa1...`，没有数据库/外部卷更新。这是容器可写层代码同步，不是镜像发布。只读检查：原 Server policy Desired/Effective 76/76、applied、非 stale；目录 complete/140，其中十个独立功能精确目标 ready。原用户路由尚未增加任何新功能行。

已准备可审查的正式验收脚本 `scripts/market-status-functional-case.mjs`、`market-status-functional-acceptance.mjs` 与 5 项 `market-status-functional-acceptance.test.mjs`。`node --test scripts/market-status-functional-acceptance.test.mjs`：5 通过；`node --check scripts/market-status-functional-acceptance.mjs`：通过。只读运行 `node scripts/market-status-functional-acceptance.mjs` 已通过预览（`/tmp/tl-cap-h11-functional-preview.log`），未调用来源或保存政策。

待单独授权的具体案例：仅临时追加 CN/STOCK 的 DAILY_TRADING_STATUS（official-states/cn-stock-daily-suspension）、RISK_WARNING 与 DAILY_PRICE_RULE（official-states/cn-stock-risk-price-limits）、SECURITY_BASIC_DATES（baostock/baostock）、LISTING_PHASE（official-states/cn-stock-delisting-period）五条 enabled=true 的精确单目标路由。前四项读取 000995.SZ；状态/风险/规则只读 2023-08-17，基础日期无价格窗口；阶段只读 600462.SH 的 2025-07-10。查询通过目标 Server 中已有 DsaClient.dataCapabilities.statusCapability，沿原认证和执行器；不新建研究/冻结、不更改 Ledger/凭据/准入或全局 Provider 启停。

脚本执行前核对原政策已同步、五项现无用户选择、两来源已启用且精确目录 ready；保存使用 expectedRevision。查询结束（包括已确认提交后的失败）按当前修订和临时指纹恢复原全部路由；新修订递增。并行修改或提交结果不明时不覆盖，由 `/tmp/tl-functional-capability-*/recovery.json` 保留原政策、所有权与恢复阶段，无凭据。实际命令为 `node scripts/market-status-functional-acceptance.mjs --execute --authorized-functional-case --expected-policy=76`，必须在用户给出本案例授权后才执行；H01/E05 单次授权不能代替它。

其余来源/参数目录、共享缓存、组合冻结、UI 门禁继续开放。本案例通过只能证明首批独立来源和目标执行面，不关闭 H09–H12 或历史退市研究消费验收。

用户随后明确授权本节这一次精确功能验收，实际执行上述命令通过。案例 `c54d07ad-d4d5-4244-a2dc-0020306be900`，恢复记录 `/var/folders/t6/qhk7wqzd07g25xwy7mr46gb00000gn/T/tl-functional-capability-D8bjtv/recovery.json`，最终阶段 `verified`；执行日志 `/tmp/tl-cap-h11-functional-live.log`。原政策 76 → 临时 77 → 恢复 78；再次只读 GET 原 Server API 确认 Desired/Effective 78/78、applied、非 stale，五条临时功能路由均已移除。

五项返回均通过强类型校验和请求关联：000995.SZ 的 2023-08-17 状态为 suspended，细分退市风险 active、其他风险 none，规则为 previousRawClose 上下各 0.05，三项所请求日窗口 complete=true；BaoStock 基础日期 ipoDate=2000-08-07/known、outDate=null/notProvided，原始规范化记录引用 `baostock-basic:42480adafb0a0536d18490e01c134dee2728ae19176b4d138c6fb76d3047beb8`。600462.SH 的 2025-07-10 返回 delistingPeriod，但 coverage.complete=false，未把单条已知阶段升级为完整覆盖。公告旧文档缺失的哈希及观察时钟继续保留 unknown/null。本次未创建研究或冻结结果，未更改 Provider 总开关、凭据、准入、Ledger 或其他路由。

下一执行叶为来源绑定派生的逐能力参数资格目录及合同测试；随后继续 H07 其余能力迁移、H08 缓存和控制修订、H09 组合消费与冻结、H10 界面。H11 总项仍未完成，真实来源账户、浏览器与组合冻结分别保留验收缺口。

<a id="record-9-11"></a>

## 9.11 参数资格目录与 H08 首批共享获取（2026-10-11，进行中）

本批精确写集：共享包新增 `src/market-status-query-support-v1.ts`、`test/market-status-query-support-v1.test.ts`，增量修改 `src/market-route-v3.ts`、`market-route-catalog-v3.ts`、`market-provider-control.ts`、`index.ts` 及两仓相同 `market-status-capabilities-v1.shared.json`。DSA 新增 `src/services/thesis_ledger_status_query_support_v1.py`、`thesis_ledger_status_acquisition.py` 与各自测试；修改同目录 `thesis_ledger_capability_registry.py`、`thesis_ledger_capability_contracts.py`、`thesis_ledger_status_query_operation.py`、`thesis_ledger_reference_data.py`、`thesis_ledger_route_catalog.py`，`data_provider/thesis_ledger_sources/baostock.py`、`official_states.py`，`scripts/export_thesis_ledger_capability_inventory.py`，以及 `tests/test_thesis_ledger_baostock_capability_path.py`、`test_thesis_ledger_official_capability_path.py`、`test_thesis_ledger_control_v3.py`。大文件 `thesis_ledger_provider_runtime.py` 仅将原 reference handler 调用传入 self，不增加行数或供应商分支；未改历史持久状态缓存与价格执行分支。Spec §13.7 增量记录所选参数/缓存边界。

十个独立功能目标的 querySupport 从来源绑定派生；粗 ST/细分风险类别、规则表示和基础日期字段、阶段集合均不与窗口完整性混淆。BaoStock 不接受细分风险，公告不接受粗 ST 或 exactPrices，前置拒绝发生于来源读取前。旧目录无字段时保持原序列化；实际绑定修订沿用原值，没有为了目录/缓存变更伪造上游修订。

BaoStock 状态和粗 ST 复用同次规范化日历/flags 获取，基础日期独立取数。缓存不含请求身份/目标投影，键隔离方法字段、真实修订、证券/窗口、政策和来源配置代次；单 Runtime 最多 64 条、每条 512 KiB、TTL 最多 300 秒，同时获取最多 64 项，等待最多 4 秒。无事实、异常和超限结果不持久复用，合法未知响应仍可交付当次等待者；返回前原 Runtime 控制检查继续执行。已测试功能关闭阻止缓存命中、关闭/恢复及配置代次切换重新获取、晚到结果拒绝、同源跨能力投影重新绑定 requestId、拷贝隔离、TTL/LRU、有界并发等待与失败后恢复。

验证：定向 Schema 43 通过、DSA 65 通过；扩大 DSA 11 文件 166 通过（`/tmp/tl-cap-h08-regression-final.log`，命令为 `env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q` 后跟 status_acquisition、baostock_capability_path、provider_runtime、status_query_support_v1、catalog_sources、current_data_route、control_v3、capability_registry、order_book、inventory_export、official_capability_path 对应测试文件）。共享包 `pnpm --filter @thesis-ledger/schemas test`：92 文件 1030 通过（`/tmp/tl-cap-h08-schema-package-verified.log`）；共享 build/typecheck、定向 ESLint、DSA critical flake8 与能力边界通过。扩大回归先发现旧目录严格字段断言，再发现带 refine 的 Zod 对象不能直接 extend/pick；分别补充新合同的能力归属/绑定校验及改用 safeExtend/显式 probe 字段，未知字段拒绝与原 probe 语义保持，未放宽断言或门禁。

受影响 Server 与仓库门禁正在执行；尚未将本批参数目录/缓存同步到目标运行态。H08-K1 和 H08 总项仍开放，未完成其余能力主备、目标缓存/控制故障门禁；H09 组合冻结、H10 浏览器和其余 H07 迁移尚未覆盖，不以本批离线结果替代。

本批后续检查与同步完成：Server 原命令（同 §9.9 的 market、三个 DSA 及三个冻结兼容测试集合）79 文件/905 通过、原有 5 文件/27 跳过（`/tmp/tl-cap-h08-server-test.log`）；Server typecheck 通过。`node scripts/check-boundaries.mjs` 通过；`node scripts/lint-workspace.mjs --guardrails` 8 组/1976 文件通过，0 错误、全部组共 359 条 warning（`/tmp/tl-cap-h08-boundaries.log`、`/tmp/tl-cap-h08-guardrails.log`）。23 条是 desktop/Server 部分组统计，不能作为工作区总数；本批定向 lint 文件无警告。本批还修正 `market-provider-control.ts` 对 refine Schema 的 probe pick/route extend 组合，完整共享包回归与 probe 兼容测试通过。

infra 串行 `./scripts/sync-code.sh all` 预检及更新通过（`/tmp/tl-cap-h08-sync-all.log`），DSA/Server/Worker healthy；原镜像不变，未执行数据库结构或外部卷变更。仅容器可写层同步，不是镜像更新或发布。同步后只读原 Server API：政策仍为 78/78、applied、非 stale，独立功能临时路由 0 条；140 项精确目录中十项返回新的 querySupport，BaoStock coarseST 与公告 riskCategories 范围正确。这证明目标元数据链，未重新执行已结束的单次授权功能请求，不宣称目标共享缓存/停用故障验收已完成。

最新静态导出 `/tmp/tl-cap-h08-inventory.json`：19 Provider、140 精确目标、4 来源定义/19 绑定、十项参数资格，273 产品源码模块/279 DSA 哈希输入，SHA256 `e83e19d05f183b02e3ad716a3fd344771a390595c1c72c302ad41348a53106b1`；来源矩阵按真实输入增量对账。下一执行叶为 H08 Server 按能力的手动主备及读取期间政策隔离，随后 H09 组合消费与冻结；其他 H07 迁移继续分批，不重新开启已取消准入。

<a id="record-9-12"></a>

## 9.12 H08 Server 独立功能主备代码叶（2026-10-11）

精确写集：新增 `apps/server/src/integration/dsa/dsa-status-route-reader-v1.ts`、`test/integration/dsa-status-route-reader-v1.test.ts`，增量修改同目录现有 `dsa-data-capability-reader-v3.ts` 与 `dsa.client.ts`。新增 `dataCapabilities.routedStatusCapability(input)` 经已有 DsaClient 注入的 `effectiveControlPolicyV3()` 读取当前选择，不要求业务自行构造 Provider/控制网关。来源处理器仍是原单目标 statusCapability 请求；只有 Server 对已分类来源错误执行最多一次人工备用。没有供应商执行分支，公共大文件 DsaClient 相对此叶开始没有增加行数；旧生命周期消费者和旧能力方法保持原调用。

返回明确为窗口 complete/partial 或基础日期 observed；partial 不自动混合备用事实，也不冒充计算的必需字段已齐。每次请求成功/失败后检查政策 revision/sourceDesiredRevision、功能启停、路由及目标资格；变化即拒绝。unauthorized、invalid-request、control-rejected、stale-revision、invalid-response 不触发备用；timeout、已分类来源不可用/身份识别/权限或能力差异只转人工已选的 eligible 目标。未设置功能无来源读取，注册表不自动写入用户选择。

定向三文件 30 通过（`/tmp/tl-cap-h08-routed-reader-final.log`），扩大 Reader/生命周期五文件 48 通过（`/tmp/tl-cap-h08-routed-regression.log`，实际匹配 status-route-reader、status-capability-reader、chart、trading-status、market-lifecycle-reader；命令中多余的不存在 protocol 文件未计入覆盖）。Server typecheck、四文件定向 ESLint 与边界通过；DsaClient/multi-window 原有入口回归单独记录。首轮定向通过后的 typecheck/ESLint 发现测试参数推导与两个未用解构变量，已修正并重跑，未隐藏警告或跳过测试。

本叶尚待最后工作区门禁与最小目标同步；当前目标只包含 §9.11 的参数目录/共享获取。真实手动主备路由案例需另行精确授权，不能重复使用 §9.10 已执行完毕的单次授权。H08 总叶、H09 组合消费/新冻结与 H10 界面仍未勾选。

最后代码门禁已通过：原 DsaClient/multi-window-client/multi-window-v3-protocol 三文件 25 通过（`/tmp/tl-cap-h08-client-regression.log`）；`node scripts/lint-workspace.mjs --guardrails` 8 组/1978 文件、0 错误、359 条 warning（`/tmp/tl-cap-h08-routed-guardrails.log`），总数与本叶开始一致，四个定向修改/新增文件无 warning。后续只需 `sync-code.sh thesis-ledger` 最小目标同步；不会重复 DSA 同步或再保存临时政策。

该最小目标同步通过（`/tmp/tl-cap-h08-routed-sync-server.log`），Server/Worker healthy、镜像不变、未改数据库或外部卷。目标 Server 内通过编译后的原 DsaClient 调用新 routedStatusCapability（000995.SZ、2023-08-17、DAILY_TRADING_STATUS），在五条功能路由已恢复移除的当前政策下返回 control-rejected。只读进程包裹 fetch 统计：恰好一次 GET `/api/v3/thesis-ledger/control/policies/effective`，market 数据请求 0 次；未变更路由或重新调用来源。这是“未选择功能不自动获取”的目标入口证据，不替代功能已启用后的真实主备/缓存故障验收。再次只读原 Server API：政策 78/78、applied、非 stale；目录 status=complete、140 目标、十项参数资格。H08-K2 仅代码叶按定义勾选，H08-K1/总叶及 H09–H12 继续开放。

<a id="record-9-13"></a>

## 9.13 H07 第二批 efinance 日线范围核对（2026-10-11，启动）

沿真实调用链确认六个目标原位于 `thesis_ledger_native_daily.py::NATIVE_DAILY_ROUTES`，请求由 `thesis_ledger_exact_bar_execution.py` → `read_native_daily` → `data_provider/cn_exact_daily.py::read_cn_exact_daily` 的 efinance 分支执行。真实 SDK 入口 `ef.stock.get_quote_history`，quote_id_mode/use_id_cache、证券 secid、beg/end、klt=101、fqt=0/1/2 和 4.5 秒期限均有既有 `tests/test_native_exact_daily.py` 原 Runtime/SDK fixture 验证。manifest 实际由 `thesis_ledger_efinance_manifest.py` 提取；工厂导入仍在 Runtime 的中央适配导入表。选定仅这六个目标，不迁移该来源报价/净值，不合并 Akshare/Eastmoney 为另一失败域。

原适配修订为 `dsa-v3-cn-{stock|etf}-efinance-{none|qfq|hfq}-exact-daily-v1`，sourceRevision/protocol 为 `dsa-efinance-exact-daily-single-response-v1`。保留原精确证券、日期、OHLC、空响应和身份错误校验；volume/amount 不新增没有证据的单位换算。预期写集：来源模块 `data_provider/thesis_ledger_sources/efinance.py`、统一来源注册入口、原 manifest/Native 库存/SDK 请求投影、Runtime 中一处导入登记和依赖登记；定向日线、目录/控制/修订/边界与静态导出测试。公共 Schema、Server、研究/冻结、真实用户政策不改；同目标只有统一绑定登记，旧内部 helper 兼容调用复用同一来源实现，不重复 SDK 获取。

实际实施完成上述写集，并修改 `tests/test_native_exact_daily.py`、`test_thesis_ledger_inventory_export.py`、`scripts/check_thesis_ledger_capability_boundaries.py`：既有 SDK 参数/Runtime 回归扩展为六种股票/ETF 调整组合，新增身份/空响应分类、修订保留和唯一登记证明；边界门禁新增对 NATIVE_DAILY_ROUTES 重复登记的检查。主 Runtime 只删除中央 efinance 导入行，不改执行供应商分支；原普通 execute_request/报价/净值兼容路径保留。本批未宣称所有 efinance 旧能力完成迁移。

命令 `env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q` 后跟 native_exact_daily、thesis_ledger_inventory_export、configured_market_routes、thesis_ledger_control_v3、thesis_ledger_capability_registry、thesis_ledger_catalog_sources、thesis_ledger_provider_runtime、thesis_ledger_contract、thesis_ledger_dependency_facts、thesis_ledger_provider_credentials_runtime、thesis_ledger_catalog_contract、thesis_ledger_provider_v3_boundary 对应 12 文件：175 通过（`/tmp/tl-cap-h07-efinance-verified.log`）。能力边界与 critical flake8 通过。首轮 metadata 顶层导入造成 provider_manifest/credential_schema 循环，已按其他来源的延迟 manifest 读取修复后通过；一次扩大命令因两个旧假定测试名不存在退出 4，未算验证通过，随后按实际 rg --files 清单执行上述集合。

静态导出进程无 SDK 实例/网络/配置写入，新旧 exactRoutes 全集合归一排序后完全相同，连同六项目标的原 gated=true 事实一起保留。最新为 19 Provider/140 精确目标/5 来源定义/25 绑定，274 产品模块/280 DSA 哈希输入、62 Server 消费文件；SHA256 `35cb8a0a7ffe006fddbee11bb4ccba93ddb6ddb9dde7844c9091c4b201f434ff`，文件 `/tmp/tl-cap-h07-efinance-inventory-final.json`。只改变登记与实现所有权，不改变来源可用范围、原适配/上游修订或真实准入。当前尚待最小 DSA 同步；本批 SDK fixture 通过不等于真实来源/目标消费验收，H07 总叶与 H09–H12 仍开放。

最小同步完成：infra `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa` 预检与更新通过（`/tmp/tl-cap-h07-efinance-sync-dsa.log`），仅 DSA 重启且 healthy，镜像 `0d92aaa1...` 不变，无数据库结构/外部卷变更。原 Server 只读目录 status=complete/140，六项 efinance STOCK/ETF 调整组合均 ready，transportProtocol 与原值相同；政策继续 78/78、applied、非 stale。未增加用户路由或调用 efinance 实际历史接口，真实来源及目标消费仍归 H11。H07-K2 按本代码/SDK fixture 叶定义勾选，不关闭全来源 H07 总项。

本次授权验收及后续三个可执行切片已落地：§9.10 五功能真实目标验收并恢复；§9.11 参数资格/共享获取；§9.12 Server 单目标主备；本节六项日线来源迁移。下一执行顺序：H07 后续既有来源能力切片与 H08 剩余控制/目标缓存门禁 → H09 不同来源事实组合及版本化冻结 → H10 原路由界面 → H11 剩余目标/浏览器/冻结验收与 H12 对账。未授权新的临时政策/故障注入、未采用新的宽松研究语义；已通过历史切片与旧冻结资产保持原状态。

<a id="record-9-14"></a>

## 9.14 H07 第三批 Akshare 精确日线（2026-10-11，启动）

工作树核对：主仓 1106、DSA 266、infra 75 项修改/未跟踪记录，增量编辑，不清理其他工作线。适用规则仍为工作区及三仓根 AGENTS，无更深规则。沿 `execute_exact_bar` → `get_daily_data_for_source` 定位现有单目标读取；选定 STOCK 的 eastmoney/sina/tencent 与 ETF eastmoney，各 none/qfq/hfq，合计 12 个已存在组合。不接入未登记的 ETF 腾讯、不改报价/净值和原生分析备用链。

写集：新增 Akshare 来源模块及一处静态注册；删除对应中央 manifest、工厂导入、依赖、精确能力、修订和分页表登记，派生同一来源绑定；扩展 configured_market_routes 的原 Runtime 回归及库存测试。保留 `dsa-v3-{stock|etf}-akshare-{source}-{adjustment}-adapter-v1` 与四种既有 range-response-v1 协议、原 gated=false、原日期/证券映射和 4.5 秒单目标期限。公共 Schema、Server、用户路由、研究冻结与富途工作线不在本批写集。验证先 12 组合定向，再目录/修订/控制/凭据回归、Python 门禁和静态库存等价；必要目标同步只走 infra 正式入口。真实来源查询与新的临时政策验收另记，不用 fixture 替代。

当时状态记录：`[x]` H07-K3-akshare-daily：完成上述 12 个既有精确日线的来源所有权迁移、原执行入口合同回归与登记等价检查。

<a id="record-9-15"></a>

## 9.15 H07 第四批 BaoStock 日线（2026-10-11，启动）

继续复用已迁移的 BaoStock 来源模块，迁移 CN/STOCK、none/qfq/hfq 三个既有 Native 日线目标。真实接缝为 `cn_exact_daily.py` 中 `_baostock_session` 与 `query_history_k_data_plus`，字段、频率 d、adjustflag=3/2/1、证券身份、SDK 错误及空响应校验已有实现；将此投影移入来源模块，旧 helper 委托同一实现。写集限 BaoStock 来源、Native 库存、CN helper、native_exact_daily 测试及原文档。原 gated=true、适配/源修订、单位与真实覆盖范围保留；三项状态/日期能力和其缓存不改，日期不并入价格 proof。原 Runtime 到 SDK fixture 的三组合回归和全库存等价通过后才勾选。

当时状态记录：`[x]` H07-K4-baostock-daily：完成三个既有价格目标迁移，不将独立状态/日期事实合并为价格完整性证明。

<a id="record-9-16"></a>

## 9.16 H08 精确功能开关/缓存/主备目标案例准备（2026-10-11，待单独授权）

已实现 `scripts/market-status-epoch-{case,driver,acceptance,acceptance.test}.mjs`。只读预览政策仍为 78/78，新增两条 CN/STOCK 功能：DAILY_TRADING_STATUS（BaoStock 主、公告停牌备用）与 RISK_WARNING（BaoStock 单源，仅 coarseST）。仅读取 000995.SZ 的 2023-08-17，不改基础日期、价格或研究协议。预期政策 79 启用 → 80 仅关闭状态功能（保留两目标、风险仍启用）→ 81 恢复状态功能 → 82 删除临时功能并恢复全部原选择，每步使用 expectedRevision 与政策指纹。Provider 总开关、凭据、准入、Ledger、其他路由均不修改。

目标原编译 DsaClient.routedStatusCapability 读取，初始状态/粗 ST 并发及重复读取通过同源规范化观察时钟相同、请求身份不同证明共享获取；再次启用后的新政策修订必须取得不同观察时钟，防止旧缓存复用。状态关闭阶段原 Reader 必须在发送数据请求前拒绝，独立风险仍实际读取。主备故障仅在独立 docker exec 的验收进程中，将精确 BaoStock 状态的一次 fetch 返回分类 503 unavailable；真实服务/来源不停止、不重启、不改运行配置。原 Reader 必须只尝试主/备各一次，公告实际返回 suspended，结果披露 routeIndex=1。注入不是 BaoStock 真实服务故障，不作为真实停用或 Provider 配置代次的目标证据。

恢复记录在第一次写入前原子落盘；每次提交确认后记录已拥有的版本/指纹。读取/证明失败时按已确认 CAS 恢复，提交结果不明或并行变化时停止覆盖并保留记录。脚本加原功能验收回归 10 项通过（`/tmp/tl-cap-h08-epoch-script-test.log`）；只读预览通过（`/tmp/tl-cap-h08-epoch-preview.json`），未实际保存政策或执行故障。实际入口 `node scripts/market-status-epoch-acceptance.mjs --execute --authorized-epoch-case --expected-policy=78`，仅在本案例授权后运行。当前 H08-K1/总叶不勾选，Provider 配置代次目标验收仍独立未覆盖；H09 按依赖等待其必需门禁，旧冻结与研究选择保持。

<a id="record-9-17"></a>

## 9.17 第三/四批实际结果与验证对账（2026-10-11）

两批实际写集为 §9.14/9.15 所列源码与测试，并补齐 `tests/test_thesis_ledger_market_v3.py` 的目录状态 fixture：新增独立无门禁能力后，仅两家 Provider 状态本应 partial；先明确断言缺失状态 partial，再补完整 registry 验证停用/缺凭据/重复目标原保护。没有删除原检查或提高阈值。Akshare 首轮定向 21 通过/1 失败，原因为静态导出需要处理器名称而 partial 无名称，改为具名闭包后 22 全过；三/四批四文件定向 53 通过。公共 Runtime 仅删除一项中央导入，不增加供应商执行分支。

扩大原 Runtime、Control、凭据、目录、唯一注册、独立 HTTP 状态及获取缓存共 14 文件 202 通过（`/tmp/tl-cap-h07-sources-h08-cache-regression.log`）；原 Akshare SDK 精确参数、单目标无隐藏回退、超时、量额单位与 Data V3 四文件最后 67 通过（`/tmp/tl-cap-h07-akshare-sdk-units-final.log`）。后者首轮目录 fixture 失败已按上述根因修正，不隐藏为通过。`scripts/ci_gate.sh flake8` 全仓 critical 检查和 `scripts/check_thesis_ledger_capability_boundaries.py` 通过。Python 定向导入/执行覆盖实际改动模块，未改 manifest/依赖安装输入，不重复无受影响的 Server/Schema 包级 build。

新静态库存 `/tmp/tl-cap-h07-akshare-baostock-inventory.json`：19 Provider/140 精确目标/6 来源定义/40 绑定，275 产品模块/281 哈希输入，SHA256 `4fe4067b52a147b533b8b6e29c3375d599886fca9c6dbf23cf0565680d9241f0`。与上批 efinance 库存的 exactRoutes 全集合归一比较完全相同，包含 gated 和既有适配登记范围；原 SourceRevision/协议有定向断言。原三表矩阵只增量更新当前迁移状态，没有新增重复表。

infra `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa` 兼容预检和最小目标更新通过（`/tmp/tl-cap-h07-akshare-baostock-sync.log`），仅 DSA 代码写层更新，非镜像发布。只读目标原目录与政策另记；未保存新政策，未调用 Akshare/BaoStock 日线实际网络接口。本两批代码叶勾选，H07 总叶、H08 目标/Provider 配置代次门禁、H09 新组合冻结及 H10–H12 保持开放。下一独立可执行叶为剩余 Native 来源能力的逐来源迁移；§9.16 授权到达后优先执行该精确目标案例，必需门禁通过后再推进 H09。

<a id="record-9-18"></a>

## 9.18 H08 授权案例首次运行与原客户端错误边界修复（2026-10-11，进行中）

用户已明确授权 §9.16 这一次精确验收。首次命令按 expected-policy=78 执行，caseId `821fb1c1-e5a4-42c8-a012-832700d14457`；已确认临时政策 79，在主备注入阶段失败。原脚本 finally 恢复 80，随后只读确认 Desired/Effective 80/80、applied、非 stale，临时两功能均已移除。恢复记录 `/var/folders/t6/qhk7wqzd07g25xwy7mr46gb00000gn/T/tl-status-epoch-R1OFbb/recovery.json`，phase=restored、proofs=0；日志 `/tmp/tl-cap-h08-epoch-live.log`。不把未验证的前置读取记为验收通过。

原入口暴露根因：DsaClient.post 使用 toDsaError 将协议错误变成独立 Error 子类 DsaError，而 readStatusRouteV1 只认 DsaV3ProtocolError，导致已分类 unavailable 未继续备用。新增原 DsaClient + fetch + Effective Policy + 两目标的端到端合同回归，修改前确定性失败 1/17（`/tmp/tl-cap-h08-actual-client-red.log`），真实复现该问题。写集增加原 `dsa.client.ts` 与 `dsa-status-route-reader-v1.test.ts`：DsaError 继承同一协议错误基类，保留导出、构造参数、code/status/sourceReason 与原认证、次数；不根据任意对象的 code 放行备用，也不加入供应商分支。存量大文件减少行数。

本次授权范围尚未验收完成；修复及门禁通过后，仅在核对原政策选择指纹完全一致时继续同一证券/窗口/两功能案例。新起点修订因本次安全恢复为 80，后续需增量记录实际政策修订；不扩展 Provider 总开关或其他故障范围。预告的 pytdx 下一切片尚未修改，先处理本次目标失败根因。H08 与 H09 当前仍未勾选。

<a id="record-9-19"></a>

## 9.19 H08 本次授权案例闭环与 H09 首个消费切片启动（2026-10-11）

修复后五文件 53 通过、Server 全包 355 文件/2778 通过（47 文件/217 项跳过；`/tmp/tl-cap-h08-actual-client-server-package.log`）；typecheck、定向 ESLint、边界及工作区 guardrails 8 组/1978 文件通过。正式 `sync-code.sh thesis-ledger` 预检、Server/Worker 更新通过（`/tmp/tl-cap-h08-actual-client-sync-server.log`），未重建镜像/数据库。验收脚本增加已恢复同一范围/选择的继续约束、最多一次及仅错误码/次数的脱敏诊断，11 项脚本回归通过（`/tmp/tl-cap-h08-epoch-resume-test.log`）。

已核对第一次恢复后的原选择指纹完全相同，使用同一 caseId 继续未完成的授权范围，政策 80→81 启用→82 只关状态→83 再启用→84 恢复。原 DsaClient 真实三阶段通过，状态 suspended、粗 ST flagged；初始/重复状态及风险共用观察时钟 `2026-10-10T17:16:59.435925+00:00`，再启用后获取时钟 `2026-10-10T17:17:01.879867+00:00`。关闭阶段状态数据请求 0，风险请求 1；验收进程一次分类 503，原 Reader 最多两目标，公告实际返回 suspended/routeIndex=1，尝试 unavailable→成功。恢复记录 `/var/folders/t6/qhk7wqzd07g25xwy7mr46gb00000gn/T/tl-status-epoch-XfOcgC/recovery.json`，phase=verified、三阶段；日志 `/tmp/tl-cap-h08-epoch-live-continued.log`。最终只读 84/84 applied、非 stale、临时两功能为 0。本次授权至此执行完毕。

H08-K1 的当前独立功能控制/目标缓存与 H08-K2 原 Server 主备已形成闭环。Provider 配置关闭/恢复的晚到隔离有原 Runtime/HTTP fixture，未在本次目标改变 Provider 总开关；其他能力和目标 Provider 配置故障仍归 H08/H11 未覆盖层级，不因此关闭总项。H09 首个普通固定来源消费切片只依赖已闭环的独立功能 K1/K2，不以其余来源迁移为前置。

当时状态记录：`[x]` H09-K1-composition-freeze：新建普通 STOCK 固定来源快照按当前已选独立能力获取、分别冻结请求/目标/修订/时钟/覆盖/错误和采用事实；只沿原“已知停牌日”解释约束执行。价格规则、风险、上市阶段和基础日期先作为分别披露的观察输入，不替代其已有研究资格、不变更策略或估值。必需/可选需求、冲突和部分失败由标准组合契约处理；新版本独立产物接入原 Builder/ArtifactStore/离线 Runner，旧聚合与旧资产保持原读法。

精确写集：标准组合/冻结 Schema 和测试，Market 的能力组合 helper 与已有生命周期 Reader 入口；Backtest 小型收集/离线读取 helper，原 snapshot manifest、builder、artifact writer、状态执行解释和 runner 的必要接缝及依赖门禁。新组合有独立 `frozen-status-composition-v1` 版本和产物，不将日期/状态回填价格 coverageProof，不创建新路由网关。读取整个组合前后核对同一 Effective Policy；身份、认证、控制变化仍终止，不能被可选错误掩盖。先定向组合/真实 Builder/离线消费测试，再受影响包/gates；本切片不保存真实政策或新建真实账户资产，目标新组合冻结需独立验收记录。

<a id="record-9-20"></a>

## 9.20 H09 本地闭环与后续单目标迁移（2026-10-11，进行中）

组合读取 8 项、新旧冻结及原生命周期六文件 35 项通过；Schema 包 93 文件/1036 项通过。新组合实际进入原 Builder、Parquet、完整快照校验和 Runner，离线读取原配置/采用日期并核对物理内容哈希；旧聚合路径不双读、原价格和模型校验和不变。首轮 fixture 只改结果 range 而未改独立 coverage.range，强合同正确拒绝，修正隔离 fixture；随后原完整快照规划拒绝新产物，已补齐正式产物登记与所有新冻结的身份校验，没有放宽白名单或断言。

定向 ESLint 首轮发现仅作类型使用的冲突 Schema，已明确导出为标准运行时合同。默认全包并发和全仓 lint 同时运行出现八项原 5000ms 超时；不改超时/断言，改用 `vitest run --maxWorkers=2` 复测。当前全包和工作区门禁仍执行中，不先勾选 H09-K1。目标运行态尚未更新 H09，当前仍为政策 84/84，无本批临时政策修改。

下一 H07-K5 精确范围仅 pytdx / CN STOCK / DAILY_BAR / 1d / none 一目标：将 `cn_exact_daily.py` 的 `_fetch_raw_data` 投影归 pytdx 来源模块，保留原 SDK、沪深覆盖/BJ 失败、vol 字段未知单位、原协议与修订、gated=true。写集固定为 `data_provider/thesis_ledger_sources/pytdx.py`、原 CN helper、静态注册、Provider manifest/导入/依赖视图、Native 唯一库存、原 Native 测试与库存测试；不修改通用执行分支或业务代码，不改报价、路由或准入。先原 Control/Runtime 参数、BJ/复权拒绝和唯一登记测试，再受影响 DSA 包、边界/库存等价。H07 总项保留，真实 pytdx 网络读取与目标选择不由 fixture 替代。

当时状态记录：`[x]` H07-K5-pytdx-daily：上述单目标移入来源模块，保留原参数、错误、修订与有效组合，原登记删除，经过原 Runtime 与库存等价验证后勾选代码叶。

<a id="record-9-21"></a>

## 9.21 独立选择兼容修复与本批验证（2026-10-11）

新增“只选择基础日期仍保留旧交易状态”实际 Builder 回归，修改前 1 失败/2 通过（`/tmp/tl-cap-h09-independent-choice-red.log`），修复后六文件 36 项通过（`/tmp/tl-cap-h09-independent-choice-green.log`）。状态收集 helper 只有在新 DAILY_TRADING_STATUS 被明确选择时替代旧聚合；其他独立观察能力不删除已有交易约束。无同能力双重读取/采用；产物读取检查交易状态重复登记，冻结前再次核对整组政策。Spec §13.8 已按此准确边界对账。

H09 精确写集：`packages/schemas/src/{market-status-composition-v1,backtest-status-composition-v1,backtest-snapshot-manifest-v3,index}.ts` 与 `test/market-status-composition-v1.test.ts`；Server `market/{market-status-composition-reader-v1,market-lifecycle-reader-v3}.ts`；Backtest `backtest-status-composition-v1.ts`、原 V3 builder/artifact-writer/dependency-collector/validation/completeness/completeness-checks、trading-status-execution 与 runner；新增 `test/market/{status-composition-fixtures,market-status-composition-reader-v1.test}.ts`、`test/backtest/status-composition-snapshot-v1.test.ts`；`scripts/check-boundaries.mjs`。未改运行依赖、数据库或研究模型。

默认全包并发首次 350 文件/2780 项通过、7 文件/8 项 5000ms 超时，均保留日志（`/tmp/tl-cap-h09-server-package.log`）；首次降低并发后 357 文件/2788 项通过、原 47 文件/217 项跳过（`/tmp/tl-cap-h09-server-package-bounded.log`），支持宿主争用判断。此后增加独立选择兼容修复，正在复测最终全包，未用过期结果替代当前门禁。最终 Schema 93 文件/1036 项通过（`/tmp/tl-cap-h09-schemas-package-final.log`）；Schema/Server typecheck、Schema build、定向 ESLint 0 错误/0 警告、边界和依赖检查通过。最后一次全仓 guardrails 仍执行中，前次八组/1986 文件通过，不放宽门禁或超时。

pytdx 本批实际写集严格沿 §9.20；原 SDK 未修改，新增来源绑定拥有 manifest/factory/依赖、唯一 none 目标、原协议/修订，删除原 Native/中央对应登记，旧 CN helper 委托同一来源投影。定向 28 项通过，随后 14 文件 205 项通过（`/tmp/tl-cap-h07-pytdx-regression-final.log`），critical flake8 和统一能力边界通过。扩大验证首次命令误写一项不存在的测试文件，收集 0 项后退出，沿实际文件名更正再执行，不将该次计为测试通过。

库存 `/tmp/tl-cap-h07-pytdx-inventory-verified.json`：19 Provider/140 精确目标/7 来源定义/41 绑定，276 产品模块/282 DSA 哈希输入、64 Server 消费文件；SHA256 `e1850cd746fd0261b49d2d7ba17d1fa2a215126ac258972102efe4ab1f65d873`。全 exactRoutes 集合（含 gated）与上批完全相同，原适配/来源修订有 Runtime 定向断言。矩阵只更新 pytdx 日线与库存来源；Architecture 和接入指南按已实施代码更新，不声称新组合目标/浏览器已通过。

等待当前必需门禁全部通过后，使用 infra `sync-code.sh all` 最小双应用目标（仅代码/兼容运行条件不变），再只读核对目录/政策与两份既有十资产冻结的 Worker 断网重放。新组合真实业务快照、浏览器、其余来源迁移和 Provider 总开关目标故障仍分别开放；不自动创建真实账户资产或临时功能路由。

<a id="record-9-22"></a>

## 9.22 当前代码叶完成与目标回归（2026-10-11）

最终命令 `pnpm --filter @thesis-ledger/server test --maxWorkers=2`：357 文件/2789 项通过，原 47 文件/217 项跳过（`/tmp/tl-cap-h09-server-package-final.log`）。定向六文件 36 项覆盖组合的五能力参数隔离、必需/可选失败、政策变化、交易资格冲突，以及实际 Builder/Parquet/Runner、只选日期保留旧约束、配置/采用/身份错配和物理哈希拒绝。Schema 最终包 93 文件/1036 项通过；build/typecheck 与 Server typecheck 通过。`pnpm guardrails:complexity` 八组/1986 文件通过，尺寸九项既有警告，未提高阈值（`/tmp/tl-cap-h09-guardrails-final.log`）；`node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs`、受影响文件 ESLint 和两仓 `git diff --check` 通过。只格式化本次新增的八个 TS 文件，没有全仓格式化。

infra `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh all` 兼容预检和宿主 Server/workspace、DSA WebUI 构建通过（`/tmp/tl-cap-h07-pytdx-h09-sync-all.log`）；DSA、Server、Worker healthy。镜像 ID 均不变，只有代码写层更新，未变更数据库结构/外部卷，不作为镜像发布证据。只读目标静态注册为 7 来源/41 绑定/140 目标；原 Server API 的目录 complete/140，政策 Desired/Effective 84/84、applied、非 stale、五个临时功能为 0。本批没有政策保存或故障注入；旧授权在 §9.19 已结束，默认案例脚本仅只读预览。

同步后的实际 Worker 用原 `scripts/research-window-replay.mjs`，分别执行 `docker exec -i -w /app thesis-ledger-dev-backtest-worker-1 node --input-type=module - <runId> <checksum>`（脚本从 stdin 读取）。旧 run `70eda2d7-ab50-4c67-9ba4-a23ad874bfe1` 的结果仍为 `a8069a8e8cd3c551`；先前 run `c1a51028-7117-4863-a307-ce523f5f494c` 仍为 `2c730d72e0adb7c4`。每份十资产、各两次完全一致，fetch/http/https/net/tls 均阻断、网络调用 0；输出 `/tmp/tl-cap-h09-{old,prior}-worker-replay.json`。没有改旧冻结、旧结果、Ledger 或当前凭据。

H09-K1 按当前代码与隔离完整快照闭环勾选；已部署入口及旧资产目标回归通过，不等于新组合真实业务验收。H07/H08/H09 总项、H10–H12 仍开放。当前代码中的风险/规则/阶段/日期是观察输入，研究必需数据要求和现行 invalid_proof 没有被放宽；新组合真实来源、目标业务快照与浏览器分别保留门禁。

当时状态记录：`[ ]` H09-K2-target-composition：使用真实已选价格及不同来源的独立功能，经原消费入口生成新组合冻结，并证明可选功能失败保留其他事实；不得用测试原文或单独 Schema 冻结替代业务快照。涉及新增临时功能路线时先准备精确方案/恢复记录、取得独立授权；遇到真实价格资格、必需事实或现行研究合同不足时保留阻断，不新增白名单、估值假设或更宽松研究协议。

下一非保护执行叶是剩余 Native 精确日线的逐来源迁移，先固定 TickFlow 三项日线的实际 SDK 参数/错误/凭据与写集，不改公共供应商执行分支；H09-K2 在真实输入资格与具体授权就绪后独立推进。目标 Provider 配置开关故障、功能界面和浏览器仍未验收，不重开已通过历史切片或移入 TODO。
