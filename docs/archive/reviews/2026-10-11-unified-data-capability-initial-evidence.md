# 统一数据能力适配层：初始闭环与文档授权记录

> 归档说明（2026-10-14）：本页是原日期/输入下的一次性运行、来源或治理证据，历史失败与适用边界保留。当前范围和未通过验收由[当前任务索引](../../tasks/README.md)及各正式 Task 维护；本次归档不表示重新验收或整个产品已完成。

对应[原 Task](../../tasks/2026-10-09-unified-data-capability-adapter.md)与[原 Spec](../../specs/2026-10-09-unified-data-capability-adapter.md)。

本文件是从原 Task 按语义抽取的历史实施与验证记录，迁移时间为2026-10-11。原小节编号、当时结论、授权、命令、失败/修正与证据路径保留；其中“当前”“下一叶”和勾选仅指当时基线，不维护活动计划。当前依赖、状态与执行边界以原 Task 为准。原始临时路径仅作辅助；必要输入、过程、结果及未覆盖层级已在正文保留，不把临时文件仍存在当作证据。

<a id="authorization-history"></a>

## 原文档与实施授权历史

## 0. 授权、状态与唯一事实源

本节首段保留上一轮仅文档的授权记录；本轮实施授权见 §0.2，当前进度以勾选和 §8 最新证据为准。

用户授权按讨论思路调整文档，设备恢复连接后继续本地写回；不授权本轮实施代码、安装 SDK、购买行情、注册账号、改变运行路由、部署或提交推送。以下实现叶是后续计划，不代表已经执行。

原[共同价格 Task](../tasks/2026-09-25-multi-source-adjustment-aware-backtest.md)保留历史；多源当前范围以[2026-10-08 取消与保留决定](../../specs/2026-10-03-multi-source-remaining-acceptance.md#scope-cancellation-20261008)为准。S05、旧 HiThink M31 全历史/高级准入追补、M32、专业 Quote 高级资格、指定旧资产追补与复杂回退不恢复，不列为本 Task 的依赖。

[历史数据按需获取](../../tasks/2026-10-09-history-data-on-demand.md)和[富途研究所需能力](../tasks/2026-10-08-futu-openapi-full-integration.md)继续独立维护业务任务、范围和实际完成状态；本 Task 只跟踪统一适配层。框架未完成不阻塞其既有切片，已完成项不重开。公共 Schema/目录/执行器由实际责任叶串行修改，不让两条工作线重复建设框架。

盘口案例只交付标准契约与隔离扩展性测试；真实二级行情、生产推送、逐笔历史、盘口 UI 和专业回测不能通过测试替身宣称完成，也不据此恢复富途范围外接口。

### 0.1 本地文档阶段

离线附件是前一轮草稿，本轮先核对本地再合并。原文档只增补接入约束和链接，历史正文、任务编号、勾选和原 AC 不变；新增通用设计只维护在本 Spec/Task。

当时状态记录：`[x]` D00-local-reconcile：已连接设备，读取工作区/主仓 Agent 规则、文档指南和本地状态；未发现同主题 Spec/Task。核对按需数据、富途当前范围、多源取消决定及实际 RouteKey、能力读取器、非 K 线库存、基础价格备用接缝。
当时状态记录：`[x]` D01-local-doc-merge：创建通用 Spec/Task，并在现有按需数据、富途、共同价格文档及两个导航中增量关联；逐文件校验编辑前内容，不覆盖并行修改。
当时状态记录：`[x]` D02-local-doc-check：检查本轮增量 diff、相对链接、任务标识/AC 映射、原任务勾选及本轮仅文档写集，区分并行源码变化；只对新文档格式化，不重排原大文档。无源码变化不执行构建、部署或 Provider 请求。

D00–D02 已完成，仅表示本地文档写回及检查通过；实现阶段的复选框全部保持未勾选。

### 0.2 本轮实施启动（2026-10-10）

用户本轮明确授权开始代码实施，先 A01，再 A02–A04，并沿依赖继续可执行叶。上方 0/0.1 是上一轮仅文档的历史记录，不追溯改写授权。沿用本对 Spec/Task，不建立重复计划。允许必要正式目标更新，仍不允许提交、推送、清库、改 Ledger、购买服务、自动配置凭据或改用户主备；研究语义变化单独等待决定。

### 0.3 本次目标对齐（2026-10-10）

在原实施进度上追加全源逐能力检查、差异矩阵与功能级路由 H01–H12，执行顺序及验证责任见 §9。原 A–F 勾选和 §8 历史记录保留，不代表新增范围已完成；本次已核对指定执行线程的最终回复与本地接缝，但没有重跑测试或变更运行态。既有授权边界保持，不因本次对齐默认批准用户策略写入、开户采购或已取消研究语义。



<a id="record-8-summary"></a>

## 原阶段A–F分层证据摘要

## 8. 证据记录

实现证据如下；详细输入、命令、结果与未覆盖层级见 §8.6–8.8，不包含凭据或业务备份。

| 检查项                 | 输入/代码版本 | 实际命令或操作 | 结果及未覆盖范围   |
| ---------------------- | ------------- | -------------- | ------------------ |
| 注册与能力合同         | 本地选定迁移切片 | pytest 注册/原适配/Runtime，Schemas 合同 | 通过；未迁移能力仍走原路径 |
| 新来源改动面证明       | 隔离新 providerId | 原 Runtime → 精确执行 → HTTP 标准结果 | 通过；生产目录和政策不加入替身 |
| 盘口两类输入与状态边界 | 独立测试绑定、共用标准夹具 | Python 17 项、TypeScript 16 项 | 通过；非真实行情/网络验收 |
| 受影响包与门禁         | §8.6 实际写集 | 测试、类型、build、边界、依赖、复杂度/尺寸 | 通过；既有警告保留，未验证原生客户端 |
| 既有真实来源与冻结回归 | 政策 74，选定真实证券/窗口 | DSA/Server 查询、实际 Worker 冻结、断网重放 | 正例及身份错误通过；真实故障切源仍未完成 |
| 目标与浏览器消费       | 正式快更后的 Server/Worker/DSA | sync-code.sh，原数据源/标的图表入口 | 通过；镜像未重建，不作为生产发布证据 |



<a id="record-8-1"></a>

## 8.1 本地文档写回记录（2026-10-09）

本轮读取实际工作树而非仅远端提交；主仓已有 3228 个 Git 可见路径纳入写前摘要基线，不代表它们全部被修改。精确写集为本对 Spec/Task、按需数据/富途/共同价格各自原 Spec/Task、`docs/README.md` 和 `docs/tasks/README.md`，共 10 份 Markdown。未修改 DSA 或 infra 文件。

写前副本和 SHA-256 清单保存在本机 `/tmp/tl-adapter-docs-20261009-vaiga4s2`，不进入仓库。临时备份仅用于本次增量对比，不是业务灾备。

实际文档验证：

- 在主仓执行 `./node_modules/.bin/prettier --ignore-path /dev/null --write` 和 `--check`，参数只包含本对新 Spec/Task，两项均通过。原 `.prettierignore` 排除了 specs/tasks，因此显式检查新文件；没有修改忽略规则或格式化原有大文档。
- 执行 `python3 /tmp/tl-adapter-docs-20261009-vaiga4s2/verify_docs.py`：10 份文档的 608 处相对链接有效；12 项 AC 均映射到任务，33 个任务 ID 唯一；8 份原文档在本轮补丁中仅插入内容，3 份原 Task 的全部勾选保持。
- 对写前副本与本轮写后副本执行 `git diff --no-index --check`，增量空白检查通过；本轮精确补丁为临时目录内 `changes.patch`。
- 第一次应用前检测到按需获取 Task 的 L2-C/L2-B 并行更新，尚未写入任何目标即停止；读取实际差异、更新写前基线后再合并，新增进度原样保留。写回期间另有 Git 可见路径被并行更新，最新校验明细在本机 `verification.json`；本轮未写这些路径，也未回滚、清理或将其归为本轮改动。Git index 与初始摘要一致。
- 本轮只完成文档阶段；未运行应用测试、SDK 请求、数据库或 Docker 操作，未提交、推送或改变用户路由。DSA/infra 的工作树未由本轮写入。

<a id="record-8-2"></a>

## 8.2 退市证券相关来源差异（后续统一处理）

用户于2026-10-09明确要求先记录差异，后续统一处理适配层。本节是后续A01盘点及B/C阶段的输入，不启动实现、不预先决定更宽松研究协议，也不更改既有任务勾选。业务实际证据由[按需历史数据Task](../../tasks/2026-10-09-history-data-on-demand.md)的L3-D2/D3/D4及[补充核实报告](2026-10-09-history-data-on-demand-bounded-followup.md)维护；以下为当时观察，不将配置状态当作长期事实。

| 差异面 | 已取得事实与当前缺口 | 后续归属与约束 |
| --- | --- | --- |
| HiThink退市证券身份与历史覆盖 | 600112完整代码/纯代码检索均code0但无身份行；完全摘牌前2024-03-16～07-19仍Unknown thscode，去offset相同。普通证券对照正常，本地适配器无当前在市名单过滤。未取得历史身份映射或专用退市参数，不能扩大为所有退市证券均不支持 | A01、B01、B04：DSA区分来源身份识别、该证券该窗口覆盖和当前可用性；若后续取得供应商历史身份映射/专用入口，由来源适配器验证，不猜代码或市场迁移，不把空检索变成零历史 |
| 腾讯退市前价格可得与消费资格 | 原600112两价格查询窗取得5/83行，价格序列最后返回日2024-07-19；实际读取成功不证明最后交易日，也不证明其与HiThink等价。当前缺固定基准范围、必要金额语义核验及主备兼容证明 | B01、C01、E05：价格来源保留自身口径、覆盖、传输证据和未知项；能力可读取与消费者可使用分开验证，不以样本成功直接授予准入 |
| BaoStock生命周期与价格的职责差异 | 已取得600112的IPO1997-11-27/outDate2024-08-15；日期独立于价格，outDate不是最后交易日。逐日停牌和粗isST也不能替代全部风险分类或精确价格限制 | B02、C02、C04：复用现有基础日期/状态适配；独立来源和冻结输入保持，不将生命周期写入其他价格来源coverageProof，不增加摘牌后估值假设 |
| 供应商业务错误语义 | HiThink原1002同时承载参数错误和精确Unknown thscode；来源层精确身份分类已修复并通过目标验证，其余1002保持原含义 | A02、B01：统一错误契约保留身份未知、参数错误、覆盖缺失及暂不可用的区别，原始供应商消息和安全处理留DSA；不重做已完成修复 |
| 当前股票备用兼容与基础研究差异 | CN股票现行备用入口要求整窗proof/observation；主源无目标序列时不能构造等价或转换证明，当前腾讯备用因此invalid_proof。现有基础价格备用名称分支未覆盖CN股票 | C01、C03、C04：统一适配层按标准能力事实与消费者需求收敛判断，不追加供应商/证券白名单，不删除完整性检查；若改变研究语义，先明确独立合同、用户选择和冻结规则。此前整窗备用单源方案未获授权，不由本记录默认启动 |

后续重新开始时先核对当时有效路由、凭证条件和所选证券/区间，再确定单一职责叶与精确写集。本次仅记录，不再请求来源或部署。按需数据L3的摘牌真实消费正例仍未取得，维持开放；统一适配层处理这些差异不会自动关闭该业务验收，也不重开已通过的A0/S/L1/L2/跨上市切片或已取消任务。已有正式Spec/Task承接，遵守`docs/TODO.md`约定，不在TODO另建重复清单。

<a id="record-8-3"></a>

## 8.3 A01 接缝、切片与写集（2026-10-10）

实际工作树初始状态：主仓 1072 项、DSA 234 项、infra 75 项 Git 可见修改/未跟踪记录。已读取工作区及三个仓库规则；排除依赖/虚拟环境后未发现更深层 AGENTS.md。现有按需历史与富途 Task 已有后续实施证据，保持原勾选及独立前沿，不用交接摘要覆盖。

| 接缝 | 当前实现与迁移责任 |
| --- | --- |
| 产品合同 | `packages/schemas/src/market-route-v3.ts` 保留 V3 精确 RouteKey 与最多两个目标；能力专有请求/结果采用独立合同，不扩充通用可选字段 |
| Server 读取 | `DsaDataCapabilityReaderV3` 已集中请求解析；`DsaClient` 保留认证/传输；不新建网关 |
| DSA 公共运行 | `thesis_ledger_provider_runtime.py` 2040 行，工厂仍含供应商分支；日线执行已提取到 `thesis_ledger_exact_bar_execution.py`；本轮以删除/委托方式接入，Runtime 不增长 |
| 静态登记 | `thesis_ledger_provider_manifests.py`、`thesis_ledger_market_v3_adapters.py`、`thesis_ledger_market_v3_revisions.py`、`thesis_ledger_current_data_route.py`、`thesis_ledger_market_v3_facts.py` 分别维护显示/精确组合/修订/非 K 线/分页；选定条目改为来源绑定派生，旧条目删除，未迁移目标保留 |
| 原执行器 | `execute_market_bars_v3 -> _execute_with_metadata -> execute_exact_bar` 保留政策、限流、熔断、有界预算、主备及来源记录；绑定只提供单目标处理器，不增加切源 |
| 适配实现 | 腾讯 `TencentFetcher` / `tencent_native_daily.py` / ETF 单标报价；HiThink 股票 `read_hithink_stock_bars` 与已修复 `classify_hithink_stock_error`；复用现行输出和错误，不重写解析器 |
| 消费特判 | Server `market-basic-price-fallback.ts` 仍是 CN ETF 与港美来源名单；DSA `quote_dispatch`/精确日线有方法名、腾讯传输、HiThink 图表分支；A/B 先把选定分支归来源模块，C 再按事实与消费者要求收敛 |

精确切片：腾讯 CN STOCK 的 none/qfq、CN ETF 的 none/qfq/hfq 日线（含原逐年传输验证），HiThink CN STOCK 的 none/qfq/hfq 日线（含原交互图表入口），非 K 线选择腾讯 CN ETF `REALTIME_QUOTE`。首个闭环先腾讯日线。HiThink ETF、BaoStock 状态/生命周期、富途资料/分钟线及其他来源保留现行路径；不会双重登记本次迁移条目。

原行为回归：有效组合、拒绝 STOCK hfq、同口径整窗、pin 不切源、用户顺序、配置代次变化拒绝晚到结果、逐年完整性、量额未知、实际行情时钟、身份错误/参数错误/无覆盖/暂不可用、V3 HTTP 与已有冻结合同。§8.2 沿原证据承接：Unknown thscode 分类复用，腾讯有价不升格为最后交易日或消费资格；BaoStock outDate/状态不写入价格覆盖；CN STOCK `invalid_proof` 不删除或放宽。当前未获授权的整窗单源研究语义不实施。

预定精确写集：DSA 新能力合同/静态注册模块、`data_provider/thesis_ledger_sources/{tencent,hithink}.py` 与显式注册；现行 manifests、market adapters/revisions/facts、current data、quote dispatch、exact bar execution、Runtime 的委托接缝及对应测试；主仓独立能力合同/测试及必要导出、原 Task。C/D 的写集在依赖就绪后另行追加，不先占用。infra 当前无写集。

验证命令：DSA `.venv/bin/python -m pytest` 定向注册/能力合同、腾讯原生日线/ETF 报价、HiThink 股票 Runtime/错误、current data、market V3/分页/凭据；再受影响离线集合、`scripts/ci_gate.sh syntax/flake8`。主仓使用锁定 pnpm 的 Schemas 定向测试/build/typecheck，再 `scripts/check-boundaries.mjs`、`check-workspace-dependencies.mjs`、复杂度/尺寸门禁。目标与浏览器单独保留 E04–E06。

跨仓接缝：首个查询不改变 V3 HTTP 载荷、RouteKey ID、缓存身份、冻结版本或控制 CAS；本地适配修订保持实际语义版本，不因目录移动虚增。公共 Schema/导出、Runtime/目录与主 Task 串行；这些都是其他工作线潜在共享文件，每次写前读取当前内容并增量应用。按需数据/富途 Task 不在本轮写集。

<a id="record-8-4"></a>

## 8.4 A/B/D 本地闭环及 C 启动检查点（2026-10-10）

已实施选定腾讯/HiThink 股票日线与腾讯 ETF 报价。`CapabilityRegistry` 按显式强类型能力合同绑定处理器；未知/重复/缺处理器/错误操作或版本拒绝；请求参数使用能力专属 Pydantic Schema。生产注册只有两个实际来源，不登记测试盘口。工厂、显示清单、精确组合、凭据声明、依赖及本地修订由来源模块提供；已有 SDK/解析器复用，未迁移目标保留旧库存。标准产品请求/结果沿用既有 V3 Schema；`DailyRead.frame` 仅是 DSA 内部兼容桥，不作为新增公开 DataFrame 合同。

首个闭环测试用腾讯原始 `newfqkline` 响应经过真实 Fetcher、Control SQLite、原 Runtime 和图表 HTTP 投影，证明单位换算、标的、来源及窗口；只替换上游网络，没有旁路执行。新 providerId 的测试只增加隔离来源定义/注册，原 Runtime、修订投影和 HTTP 图表处理器自动消费；注册本身不创建用户路由。接口供应商许可表改由实际精确库存派生。

盘口写集：主仓 `market-order-book.ts`、导出、合同测试及同一 JSON 样例；DSA `thesis_ledger_order_book_contract.py`、`thesis_ledger_order_book_state.py`、两类输入测试夹具和隔离测试。数组/手数/epoch 输入与方向行/股数/ISO 输入通过各自处理器形成相同模型；未知单位/时钟/连续性保持未知，权限失败不返回空成功，深度降级同时要求调用方与政策许可。纯状态覆盖初始快照、取消释放、缺口重同步、切源代次、旧消息隔离、增量先重建再 UI 合并、有界缓冲溢出、账号/权限代次/来源/参数隔离和撤权/停用。没有生产连接、推送 API、盘口页面或 SDK 安装。

已执行证据：首批现有 DSA 定向回归 87 项通过；新增查询/注册证明 11 项通过；DSA 盘口及注册合计 22 项通过；主仓盘口/目录/图表合同 22 项通过，Schemas build 通过；Server 标准备用、窗口/图表选择、图表选项、冻结窗口及 DSA 图表协议 67 项通过；凭据收拢后的 DSA 注册/腾讯报价/HiThink 股票/凭据/Runtime 97 项通过。两项新增查询测试初次失败均为夹具错误（多传 consumer、无政策返回 None），修正夹具后通过，没有改产品校验或放宽断言。

C 新增写集：可选 `barQuery` 标准目录语义、目录生产与校验、Server 基础备用及三个现有调用点/定向测试。Spec §6.1 已明确升级顺序及边界。严格在线旧消费者会拒绝新字段，必须先更新主仓消费者再更新 DSA 生产者；旧冻结目录仍可读取，不回填快照。CN STOCK 仍返回现行 `invalid_proof` 兼容路径，未启用退市单源研究方案。

下一执行叶：完成 C 的源特判/门禁回归及 B 的最终对账 → E 受影响包/复杂度门禁 → 稳定源码后按正式入口分序更新主仓/DSA → 有界真实来源、消费与冻结回归 → F 接入指南及当前架构对账。当前尚未取得真实来源、目标服务或浏览器的新实现证据，所有 E04–E06 保持开放。按需历史/富途原 Task 没有写入或自动关闭。

<a id="record-8-5"></a>

## 8.5 真实错误边界修复启动（2026-10-10）

按正式入口先主仓、后 DSA 的首次快更成功；实际政策修订 74 与目标序列摘要保持。三个有界图表正例已取得。HiThink 600112 的既有来源身份分类在 HTTP 投影被压成 `upstream_failure`；属于本任务 A02/B04 的错误边界缺口，不重做已修复的供应商分类。先在 Spec §6.2 明确增量，再修复。

追加精确写集：主仓 `market-data-wire-v3.ts`、`dsa-v3-protocol.ts` 及错误合同/传输测试；DSA 新小型标准错误投影模块、`api/thesis_ledger.py`/`thesis_ledger_chart_v3.py` 的委托与实际端点测试。不改变请求范围、用户路由、股票备用条件或原冻结格式。修复后定向验证并按相同正式顺序重新同步受影响源码；不能用第一次目标证据代表修复后的验收。

<a id="record-8-6"></a>

## 8.6 实际写集与扩展性证明（2026-10-10）

A01–A04 已经经由原 Control Store、Runtime、精确执行器、HTTP 标准结果形成闭环，继续完成 B/C/D。以下路径相对各仓库；未用旧副本覆盖整文件，未修改按需历史/富途 Task 或 infra 源码。

- DSA 能力接缝新增：`src/services/thesis_ledger_capability_contracts.py`、`thesis_ledger_capability_registry.py`、`thesis_ledger_capability_sources.py`、`thesis_ledger_quote_validation.py`、`thesis_ledger_bar_query_semantics.py`、`thesis_ledger_market_errors_v3.py`；来源新增 `data_provider/thesis_ledger_sources/{__init__,tencent,hithink}.py`。
- DSA 原接缝增量修改：`src/services/thesis_ledger_provider_manifests.py`、`thesis_ledger_market_v3_adapters.py`、`thesis_ledger_market_v3_revisions.py`、`thesis_ledger_current_data_route.py`、`thesis_ledger_market_v3_facts.py`、`thesis_ledger_provider_runtime.py`、`thesis_ledger_exact_bar_execution.py`、`thesis_ledger_quote_dispatch.py`、`provider_credentials.py`、`thesis_ledger_provider_dependencies.py`、`thesis_ledger_market_v3_pagination.py`、`thesis_ledger_route_catalog.py`；`api/thesis_ledger.py`、`api/thesis_ledger_chart_v3.py`。Runtime 从初始约 2040 行收敛为 1977 行；未迁移的普通能力/HiThink ETF 等仍走原路径，不宣称已消除全部存量分支。
- DSA 隔离盘口新增：`src/services/thesis_ledger_order_book_contract.py`、`thesis_ledger_order_book_state.py`、`tests/order_book_adapter_fixtures.py`、`tests/test_thesis_ledger_order_book.py`。其他新增测试为 `tests/test_thesis_ledger_capability_registry.py`、`tests/test_thesis_ledger_market_errors_v3.py`；增量测试为 `tests/test_thesis_ledger_market_v3_pagination.py`、`tests/test_thesis_ledger_control_v3.py`。门禁新增 `scripts/check_thesis_ledger_capability_boundaries.py` 并接入现有 `scripts/ci_gate.sh`。
- 主仓标准契约新增 `packages/schemas/src/market-bar-query-semantics.ts`、`market-order-book.ts`；增量 `market-route-v3.ts`、`market-route-catalog-v3.ts`、`market-data-wire-v3.ts`、`index.ts`；新增 `packages/schemas/test/market-order-book.test.ts`、`test/fixtures/order-book-v1.json`。
- 主仓消费者增量 `apps/server/src/market/market-basic-price-fallback.ts`、`market-window-selector-v3.ts`、`market-chart-selector-v3.ts`、`market-chart-options-v3.ts`，仍使用原 Reader；增量 `apps/server/src/integration/dsa/dsa-v3-protocol.ts`；新增错误码要求穷尽映射，故增量 `apps/server/src/backtest/backtest-nav-preparation-result.ts`，映射到已有不可用/未授权诊断，不改 NAV 合同。
- 主仓测试新增 `apps/server/test/market/bar-query.fixture.ts`、`market-basic-price-fallback.test.ts`；增量 `market-window-selector-v3.test.ts`、`market-chart-selector-v3.test.ts`、`market-chart-options-v3.test.ts`、`futu-market-chart-consumer.test.ts` 和 `apps/server/test/integration/dsa-chart-v3.test.ts`。Futu 测试只补目录事实夹具，不改其业务实现或任务。门禁增量 `scripts/check-boundaries.mjs`。
- 文档：本对原 Spec/Task、主仓 `docs/architecture/canonical-runtime.md`；DSA `docs/thesis-ledger-capability-adapters.md` 与 `docs/CHANGELOG.md`。新增说明均使用中文。Desktop 未改业务页面，infra 未改文件，数据库/依赖清单/SDK 未改。

新来源证明的独立改动面：`test_new_provider_uses_original_runtime_without_supplier_branch` 在隔离环境定义新身份、工厂、日线绑定及处理器并显式登记，随后走原 Runtime/精确执行/标准图表投影；公共 Runtime、Control、Server 不出现这个测试 providerId 分支。注册本身不创建用户政策。真实迁移定义的工厂、凭据、依赖、有效组合和本地修订由来源模块拥有，目录/查找视图从绑定派生。

新能力证明的独立改动面：ORDER_BOOK 只增加自身强类型合同、校验、`QueryBinding`、两种测试来源及纯生命周期；未改 DAILY_BAR/REALTIME_QUOTE 的数据模型。A 输入为数组、整手量、毫秒时钟和 HK 前缀；B 输入为方向行、股数和 ISO 时钟，分别适配同一标准夹具。缺单位/源时钟/序列保持未知，权限失败不变成空成功；规范代码与市场不符、重复价格、排序、深度、非法整数及时间均拒绝。切源/重连代次拒绝晚到消息，有界缓冲溢出进入重同步，先归并每个增量再合并 UI 状态；共享键包含来源、账号、权限代次、深度和降级参数，撤权/停用释放消费者。两个生产来源只声明 query，不声明 subscribe；测试 ORDER_BOOK 不加入生产注册表。

<a id="record-8-7"></a>

## 8.7 本地验证命令、结果与输入（2026-10-10）

以下命令均通过 RTK 执行，长输出重定向到 `/tmp/tl-cap-*.log` 后只分析失败和统计；日志不是长期归档证据，必要统计记录在本 Task。输入为 §8.6 当前工作树，不用 Git HEAD 替代。

| 层级 | 实际命令与输入范围 | 最后结果 |
| --- | --- | --- |
| DSA 迁移/工厂/凭据 | `.venv/bin/python -m pytest -q tests/test_thesis_ledger_capability_registry.py tests/test_thesis_ledger_order_book.py tests/test_thesis_ledger_market_v3_pagination.py tests/test_tencent_native_daily.py tests/test_thesis_ledger_hithink_stock_error_semantics.py tests/test_thesis_ledger_hithink_stock_runtime_v3.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_provider_credentials_runtime.py tests/test_tencent_etf_basic_quote.py` | 176 通过。含实际腾讯解析器到原 Runtime/HTTP、报价非 K 线、现有凭据快照/配置代次/在途保留/安全错误回归；真实凭据没有改动 |
| DSA 目录/控制 | 同一 pytest 入口的 `test_thesis_ledger_catalog.py`、`catalog_contract.py`、`catalog_sources.py`、`current_data_route.py`、`control_v3.py`、`hithink_stock_control_gate.py`、`hithink_credential_revision.py`（均带 `test_thesis_ledger_` 前缀） | 首轮 76 通过、1 个旧目录精确字段断言失败；增加匹配日线/复权的可选 barQuery 后，该文件 11 项全部通过。其余未变输入 66 项证据保留 |
| DSA HTTP 错误 | pytest `tests/test_thesis_ledger_market_errors_v3.py tests/test_thesis_ledger_capability_registry.py tests/test_thesis_ledger_hithink_stock_error_semantics.py`；另跑现有 market/chart/pin/HiThink 合同回归 | 定向 31、协议回归 72 通过；两类实际 HTTP 入口测试安全错误、状态、请求关联。非 HTTP 的旧来源分类复用 |
| 最终盘口/分页 | pytest `tests/test_thesis_ledger_order_book.py`；此前 order_book 与 market_v3_pagination 定向组 | 最后盘口 17 通过；分页缺少/未知复权的完整性回归组 40 通过。无序列不能声称连续性验证 |
| Schemas | `pnpm --filter @thesis-ledger/schemas test`、`build`；最后 `exec vitest run test/market-order-book.test.ts`；最后再次 `build` | 全包 88 文件/978 项通过；后续仅隔离盘口代码/市场校验新增，定向 16 项通过，最终 build 通过 |
| Server | `pnpm --filter @thesis-ledger/server exec vitest run test/market test/integration/dsa-chart-v3.test.ts test/backtest/backtest-hithink-identity-replay-v3.test.ts test/backtest/v3-legacy-calendar-replay.test.ts test/backtest/v3-frozen-comparison.test.ts` | 初轮两项 Futu 目录夹具缺失 barQuery 导致失败，修正真实标准事实夹具后，最终 76 文件/870 项通过；5 文件/27 项隔离 DB/Redis 等条件测试仍跳过，不当作通过 |
| Server 补充 | 新错误/selector/basic-price 定向；NAV 准备诊断定向；Server `typecheck`、`build` | 分别 31、28 项通过，类型与 build 通过；没有放宽原备用断言 |
| Desktop | 既有行情/数据策略等 7 文件定向；`pnpm --filter @thesis-ledger/desktop typecheck`、`build` | 41 项、类型与 build 通过；保留既有 chunk 警告。未执行 Electron 原生/移动原生编译，无对应改动 |
| DSA 门禁 | 激活现有 venv 后 `scripts/ci_gate.sh syntax`、`flake8`、`deterministic`；`.venv/bin/python scripts/check_thesis_ledger_capability_boundaries.py` | 语法、严重 flake8、确定性检查及新边界门禁通过；无新增忽略/阈值 |
| 主仓门禁 | `node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs`、`node scripts/lint-workspace.mjs`；受影响新合同/测试/诊断另做 `pnpm exec eslint …` | 边界 OK、8 包依赖图 OK、复杂度/尺寸通过，9 个既有尺寸警告保留。未提供本轮初始全工作树 ratchet 基线，故不把门禁结果宣称为对所有并行 WIP 的增量证明；本轮巨大 Runtime 减少，三个存量 selector 调用行数不增长 |

Schema 增量为可选目录事实及四种安全标准错误，生产者需在消费者就绪后上线。`barQuery` 只说明精确目标的既有查询合同，不构成覆盖或跨源等价证明；基础价格还检查消费者范围、完整目录、两个不同的精确保存目标、口径、备用就绪及执行结果。CN 股票兼容证明检查、数量/事件严格消费仍保留。旧现金/生命周期冻结输入不合并到价格 coverageProof。

<a id="record-8-8"></a>

## 8.8 正式目标、真实消费、冻结与剩余验收（2026-10-10）

目标更新在 `thesis-ledger-infra` 串行执行：`rtk proxy ./scripts/sync-code.sh thesis-ledger`，成功后 `rtk proxy env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa`。依赖、Prisma/迁移、SDK 和 Dockerfile 未变，兼容/空间/结构预检通过，选择最小目标。首次迁移、标准错误修复、最终隔离盘口合同校验每次输入变化后按同一消费者优先顺序更新；最后日志 `/tmp/tl-cap-sync-contract-final-{server,dsa}.log` 均正常结束。最后 Server、Worker、DSA 全部 healthy。镜像 ID 保持，更新只在可写层；不是镜像更新或生产发布证据。没有手工替换容器、清库或卷变更。

最终只读 `GET /api/v3/thesis-ledger/control/policies/effective?contractVersion=3` 返回 200，Effective 修订 74、Desired 来源修订仍为 74；保存目标序列 SHA-256 始终为 `69138950692f7039fed40031c563f0dff8ea0175dcf4d032ec0e0cedf9eb41e6`。生产目录经主仓 Schema 校验，目录修订 `4441324961563645`，55 项标准 barQuery、0 项 ORDER_BOOK；注册没有改变用户启用或路由。现有认证探针通过，错误令牌拒绝、版本不支持 422，未恢复旧链路。

| 真实层级 | 请求/实际入口 | 结果与严格限制 |
| --- | --- | --- |
| DSA 原日线执行 | 2024-07-15 至 2024-07-19，腾讯 `510300.SH` ETF/none，HiThink `600519.SH` STOCK/qfq，精确保存目标 pin | 各 200/5 根；标准结果、来源及请求关联通过。未在适配器内回退 |
| 来源身份错误 | 同窗 HiThink `600112.SH` STOCK/qfq | 修复后 404 `source_symbol_unrecognized`，安全文案、请求关联和 Schema 有效；不推断全部退市证券不可用 |
| 已保存备用的直接读取 | 同窗腾讯 `600112.SH` STOCK/qfq，现有目标 index=1 pin | 200/5 根；仅证明该窗取得退市前价格，不证明最后交易日、跨源等价或研究资格，不构成主源故障切源正例 |
| Server 原 Market Reader | `/api/market/{symbol}/bars`，相同窗/口径，`acceptance=interactive` | 510300、600519 各 5 点，实际来源披露；600112 返回安全身份错误。CN 股票 proof 边界未放宽 |
| 浏览器消费 | 当前 Desktop `http://127.0.0.1:5173` → 实际 Server；数据源/路由及标的行情原入口 | 显示政策 74/74 同步；生产目录无测试盘口。600519 的前复权最近日线正常绘制、实际源 HiThink；600112 原对话框安全失败态、诊断号和重试入口保留。其他实时报价/筹码等独立模块的不可用状态保留，未宣称全部能力健康；页面没有新增供应商分支 |
| 实际研究/冻结 | 复用已有策略版本 `523be3ce-7c61-4cd4-a09d-1d5d27698339` 与旧 run `70eda2d7-ab50-4c67-9ba4-a23ad874bfe1` 的既有已知现金选择；510300 ETF/none，2025-05-15 至 2025-07-04，固定来源、after-acquisition-freeze | 原 prepare → 创建 run → 实际 Worker 收敛 succeeded。新 run `c1a51028-7117-4863-a307-ce523f5f494c`，snapshot `8e692374763ed0ba5eb088500dba9a89b23886a49225586d21d11e43ed7a189a`，resultChecksum `2c730d72e0adb7c4`，10 个资产。完整性仍 partial，保留未验证上市边界、现金覆盖/基准等限制；只刷新原选择的数据截止，不新增研究协议/摘牌后估值假设、不改真实 Ledger |
| 旧快照断网重放 | 只读实际 Worker 内 `node --input-type=module - <runId> <checksum> < scripts/research-window-replay.mjs`，经 RTK 的 `docker exec -i -w /app` 执行既有仓库脚本 | 旧 run 结果 `a8069a8e8cd3c551` 两次一致；新 run 结果 `2c730d72e0adb7c4` 两次一致；各 10 资产。脚本阻断 fetch/http/https/net/tls，网络调用 0。旧 run 内容未改、旧快照没有补字段；不读当前在线适配器或凭据 |

E05 仍不勾选：已有真实正例、身份错误、冻结和重放，但没有获得真实主源故障后整窗切入备用的正例。现有 ETF 选定路由只有单源；CN 股票虽有已保存主备，现行兼容证明失败不能放宽为单源研究协议。离线故障/同口径整窗与来源披露回归通过，不能替代这个真实门禁。需要临时变更用户目标才能继续时，先取得单独授权，再以现有 CAS 和恢复机制执行；不能为完成框架自动改路由或扩大研究语义。该缺口留在 E05，不移入 TODO。

| 验收 | 当前证据与边界 |
| --- | --- |
| AC01 | 腾讯/HiThink 日线和腾讯 ETF 当前报价统一绑定执行；本地原解析器/Runtime 合同通过，选定真实日线成功；非 K 线真实请求未单独扩展为新的业务验收 |
| AC02 | 单一绑定生成定义/工厂/凭据/依赖/精确能力/修订视图，非法登记拒绝；旧未迁移路径保留 |
| AC03 | 隔离新 providerId 经原执行器，独立改动只在测试来源/显式注册；公共执行及业务不增加该身份分支 |
| AC04 | 代码/字段/单位/时钟转换和未知事实、权限、安全来源错误通过；真实 Unknown thscode 沿原分类投影 |
| AC05 | 能力事实替代消费者供应商名，离线整窗/手选顺序/披露及新旧重放通过；真实故障切源正例仍欠 E05 |
| AC06 | 精确组合/操作、参数和盘口深度拒绝，显式降级披露；缺价格口径不会绕开腾讯传输完整性校验 |
| AC07 | 两种盘口结构共同合同通过，生产目录零测试能力；未购买或连接二级行情 |
| AC08 | 初始状态/取消释放/重同步/代次/旧消息/有界缓冲均纯状态通过；真实网络重连非本轮交付 |
| AC09 | 原凭据快照、配置失效、在途保护、安全错误回归和盘口共享隔离通过；真实撤权/账号变更没有执行 |
| AC10 | 新来源不改已有 UI/计算；新盘口合同/处理/隔离测试没有改写既有能力；无盘口页面 |
| AC11 | 政策未改，目录按合同产生修订，新旧冻结兼容且断网重放通过；真实故障切源部分同 E05 开放；不改 Ledger/已取消义务 |
| AC12 | [接入指南](../../../../daily-stock-analysis/docs/thesis-ledger-capability-adapters.md)与[当前架构](../../architecture/canonical-runtime.md)已同步，分层结果及跳过项留本 Task；不把本地/真实/浏览器相互替代 |

下一执行叶是 E05 的受保护真实故障切源验收；授权或既有政策出现合适双源目标后，先重新核对当前政策/目标与消费者资格，再执行有界验证及 CAS 恢复。统一适配层剩余门禁不作为历史按需/富途交付前置，不自动关闭其退市真实消费验收，也不重开已通过或取消切片。

最终卫生核对：主仓与 DSA 本轮已跟踪路径 `git diff --check -- <精确路径>` 均为 0；文档相对链接无缺失。最终全工作树可见记录为主仓 1258、DSA 268、infra 80，包含并行工作的增量，不能把这些差异全部归为本轮；infra 本轮仅调用正式脚本。未执行 stage、commit、push、reset、clean 或发布。以最后验证日志时间核对共享源码：Server/测试和 Desktop 无后续输入变化；Schemas 仅本轮隔离盘口代码/测试有后续变化，已追加 16 项定向与 build；DSA 选定公共接缝也仅隔离盘口合同有后续变化，已追加 17 项定向。没有以旧测试结果覆盖未测的公共输入。

