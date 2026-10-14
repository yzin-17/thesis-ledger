# 统一数据能力适配层：来源能力迁移验证记录

> 归档说明（2026-10-14）：本页是原日期/输入下的一次性运行、来源或治理证据，历史失败与适用边界保留。当前范围和未通过验收由[当前任务索引](../../tasks/README.md)及各正式 Task 维护；本次归档不表示重新验收或整个产品已完成。

对应[原 Task](../../tasks/2026-10-09-unified-data-capability-adapter.md)与[原 Spec](../../specs/2026-10-09-unified-data-capability-adapter.md)。

本文件是从原 Task 按语义抽取的历史实施与验证记录，迁移时间为2026-10-11。原小节编号、当时结论、授权、命令、失败/修正与证据路径保留；其中“当前”“下一叶”和勾选仅指当时基线，不维护活动计划。当前依赖、状态与执行边界以原 Task 为准。原始临时路径仅作辅助；必要输入、过程、结果及未覆盖层级已在正文保留，不把临时文件仍存在当作证据。

<a id="record-9-23"></a>

## 9.23 H07 TickFlow 精确日线范围核对（2026-10-11，启动）

重新核对本地工作树：主仓 1119、DSA 266、infra 75 条未提交/未跟踪记录，保留全部既有修改；没有更深层 AGENTS。本轮沿原 Task 继续代码实施，不改变早期仅文档历史。H09-K2 等受保护验收继续开放，不重复使用已结束的政策/故障授权。

本叶只迁移 TickFlow / CN STOCK / DAILY_BAR / 1d / none、qfq、hfq 三个既有 gated 目标。实际执行链为原 Runtime → Native read → `cn_exact_daily.py` → `TickFlowFetcher._get_client().klines.get`；SDK 参数为完整证券代码、1d、原有界 count、上海时区起止毫秒（包含结束日）、none/forward/backward、as_dataframe=false。原日期或 timestamp/time/ts 投影、量额单位未知、缺凭据及原错误分类保持；原 SDK/报价/批量分析链不重写，适配器不切源。

来源模块集中拥有 manifest、factory、api_key/apiKey 凭据声明、tickflow 依赖和三绑定/修订。原 Runtime 的 TickFlow 专用工厂分支删除；统一工厂沿已有 ReadContext.timeout_seconds 传入原普通 4.5s / probe 5s，不能因搬迁改变探测超时。现有配置的复权、批量开关/大小和 priority 原值仍传给 SDK。新来源模块、旧 CN helper、静态注册、Provider manifest/导入/依赖/凭据视图、Native 库存、原 Native/库存测试，以及必要来源测试为精确写集；公共 Schema、Server、用户配置及运行依赖不变。

当时状态记录：`[x]` H07-K6-tickflow-daily：三目标经原 Control/Runtime 走来源绑定，旧登记删除；完整 SDK 参数、日期结构、错误、凭据/配置快照、普通/probe 工厂预算、唯一库存与原修订及受影响 DSA 回归/门禁通过。代码叶勾选，最小目标同步与真实来源分别记录，不安装或保存凭据。

迁移核对发现日线匹配工厂提前返回会绕过原 SDK 凭据版本缓存，故扩大精确写集至 `thesis_ledger_capability_registry.py` 的来源工厂作用域及其合同测试。Spec §13.9 先明确 `route`/`provider` 两种静态作用域；TickFlow 选择后者，Runtime 复用已有版本缓存。新增实际 Runtime 重复查询、报价共享、换凭据、probe 不发布和旧实例不变回归，先记录失败再修复；不改变其他来源的默认作用域，不新增供应商判断或缓存。

<a id="record-9-24"></a>

## 9.24 TickFlow 代码叶验证与目标准备（2026-10-11）

实际写集为 DSA `data_provider/thesis_ledger_sources/tickflow.py`、`data_provider/cn_exact_daily.py`、`src/services/{thesis_ledger_capability_sources,thesis_ledger_capability_registry,thesis_ledger_provider_runtime,thesis_ledger_provider_manifests,thesis_ledger_provider_dependencies,provider_credentials,thesis_ledger_native_daily}.py`，以及 `tests/{test_native_exact_daily,test_thesis_ledger_inventory_export,test_thesis_ledger_tickflow_capability_path,test_thesis_ledger_capability_registry}.py`。文档增量为本 Spec/Task、原来源矩阵、`docs/architecture/canonical-runtime.md`、DSA 接入指南及 CHANGELOG；公共 Schema、Server、SDK、运行依赖和用户配置未改。

原 Runtime 重复创建 SDK 的新增回归先失败（1 失败/8 通过，`/tmp/tl-cap-h07-tickflow-cache-red.log`），作用域修复后定向四文件 60 项通过（`/tmp/tl-cap-h07-tickflow-cache-green.log`）。随后 `env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest` 运行 Native/Control/Runtime/目录/凭据/独立状态及四项 TickFlow SDK 回归，共 19 文件 260 项通过（`/tmp/tl-cap-h07-tickflow-regression.log`）。最后将既有“新 providerId 经原执行器”样例分别用两种工厂作用域执行，注册器及 TickFlow 两文件 24 项通过（`/tmp/tl-cap-h07-tickflow-extension-scope.log`）；新增来源不需要公共供应商分支。

初始测试中的 count=60 是测试对原 SDK 常量的错误假设，实际有界 count=30；修正样例，不修改 SDK。修订函数的 credential_version 是 keyword-only，测试调用已按真实签名更正；此前失败日志保留，未计为通过。`bash scripts/ci_gate.sh syntax`、`bash scripts/ci_gate.sh flake8`、`python scripts/check_thesis_ledger_capability_boundaries.py` 以及两仓 `git diff --check` 通过（`/tmp/tl-cap-h07-tickflow-{syntax,gates,boundaries}.log`），未改门禁或超时。

静态库存 `/tmp/tl-cap-h07-tickflow-inventory-verified.json` SHA256 `0ea3f0a9b783a91ef82515484514b65efb9c132de8c963e339756b9f9868da6f`：19 Provider、140 精确目标、8 来源定义、44 绑定、277 产品模块、283 DSA 哈希输入、64 Server 消费文件。按完整目标对象排序比较（包括 gated）与 §9.21 库存完全一致；仅登记顺序变化，不伪造上游修订。原 Source/Adapter 修订有实际 Runtime 合同断言。

目标三个应用均运行且 healthy，当前应用依赖及数据库结构未改。准备从 infra 执行 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa`，兼容预检拒绝时沿正式入口处理。同步后只读验证目录、政策、注册与来源配置；此段不先声明运行态通过。TickFlow 真实账户/上游读取、浏览器、新组合实际业务冻结和其余来源迁移继续开放，本批无临时政策变更或故障注入。

<a id="record-9-25"></a>

## 9.25 TickFlow 目标核对与下一来源（2026-10-11）

infra 正式 `sync-code.sh dsa` 完整执行通过（`/tmp/tl-cap-h07-tickflow-sync-dsa.log`），兼容预检、宿主 WebUI 构建及目标健康检查通过；DSA 镜像仍为 `0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`，仅写层更新，不变更数据库/卷或发布镜像。目标注册为 8 来源/44 绑定/140 目标，TickFlow 为 provider 作用域。只读原 Server API 目录 complete/140，政策 84/84、applied、非 stale，五个临时功能为 0。原 TickFlow 禁用且未配置，四目标均不就绪；本批没有上游账户读取，不能把 SDK 替身或静态登记当成真实来源验收（`/tmp/tl-cap-h07-tickflow-target{,-registry}.json`）。

继续 H07-K7，仅迁移 Alpha Vantage / US STOCK / DAILY_BAR / 1d / none 单个既有 gated 目标。原入口为 `read_multimarket_exact_daily`，HTTP 请求固定 TIME_SERIES_DAILY/full、去除 .US 后缀、4.5s；嵌套日期字典投影保持原价格、volume 未知单位及 amount 缺失，Note/Information 保留 quota_unavailable。工厂原 apiKey 与 control 来源 strict_errors、原 SDK 凭据版本缓存保留，报价读取保留旧入口。写集为新来源模块、原多市场 helper、静态注册、原 Provider manifest/依赖/凭据/导入视图及 Native 库存、原多市场/库存测试和必要来源测试；不新增公共执行供应商分支、不改 Schema/Server/运行依赖或用户配置。先实际 Control/Runtime 与 HTTP 参数、权限/额度/结构分类，再 SDK/受影响回归、边界和全精确库存等价；目标更新仍独立串行。

当时状态记录：`[x]` H07-K7-alphavantage-daily：上述单目标实际执行通过来源绑定，删除旧登记，保留原协议/修订、工厂/缓存与错误，完成受影响验证。真实账户、目标消费与浏览器单独记录。

<a id="record-9-26"></a>

## 9.26 Alpha Vantage 回归与 Finnhub 单目标范围（2026-10-11）

Alpha Vantage 新来源模块已落地，原 Native/manifest/导入/依赖/凭据登记删除，原多市场 helper 委托来源投影。公共 Runtime 只从既有工厂分支删除该来源，复用 §13.9 的 provider 作用域；SDK 和报价投影未改。实际工厂/Control/Runtime/full HTTP 读取、请求窗口截取、缺量额、唯一目标与原修订，以及 Note/Information、401/403/429/503 分类定向三文件 28 项通过（`/tmp/tl-cap-h07-alphavantage-directed.log`）。扩大 23 文件 314 项通过（`/tmp/tl-cap-h07-alphavantage-regression.log`），critical flake8 和统一能力边界通过；最后语法及最小目标同步与下述小批次串行执行，不先声明目标读取通过。

本批只读库存 `/tmp/tl-cap-h07-alphavantage-inventory.json` SHA256 `885fa5827de3ff46e71ffd960b1c993902bafe3fbdc2177cebc3bbc84dfb8746`：9 来源/45 绑定/140 目标，278 产品模块/284 DSA 输入/64 Server 消费文件，全精确目标含 gated 与上批完全一致。

继续独立 H07-K8，仅 Finnhub / US STOCK / DAILY_BAR / 1d / qfq 一个既有 gated 目标：纽约市场起止秒（结束日包含、跨夏令时）、D 分辨率、去除 .US、原 4.5s HTTP 预算和 token；t/o/h/l/c/v 数组转同一模型，amount 缺失、单位未知及 s!=ok 无覆盖保留。工厂 apiKey/control strict_errors、原凭据版本缓存保留，不将 qfq 推断为 none/hfq。写集为来源模块、原多市场 helper、静态来源入口、Native/manifest/导入/依赖/凭据视图，原多市场/库存测试及必要来源测试。每个来源独立测试和库存对比，未迁移能力继续旧链；不改其他能力或用户配置。最后一次最小 DSA 更新在本叶代码稳定、受影响门禁通过后执行，不与宿主构建重叠。

当时状态记录：`[x]` H07-K8-finnhub-daily：单目标通过原真实执行器及标准结果，保留参数、时钟、原修订、错误和生命周期，删除原双重登记；受影响验证与目标层分别记录。

<a id="record-9-27"></a>

## 9.27 两项美股日线代码叶与最终本地门禁（2026-10-11）

Alpha Vantage 与 Finnhub 分别拥有来源模块、manifest/factory、精确 binding/revision、credentials/dependency_modules；原 Runtime 的两来源工厂分支、导入和 Native/中央对应登记均删除。公共 Runtime 没有新增供应商分支。实际公共执行器仍按原 `cache=False` 约定构造凭据验证实例，provider 作用域只保持原工厂缓存，不声称所有数据读取共享同一 SDK。SDK、报价、Schema、Server、数据库和运行依赖未修改。

精确额外写集为 DSA `data_provider/thesis_ledger_sources/{alphavantage,finnhub}.py`、`data_provider/multimarket_exact_daily.py`、`src/services/{thesis_ledger_capability_sources,thesis_ledger_provider_runtime,thesis_ledger_provider_manifests,thesis_ledger_provider_dependencies,provider_credentials,thesis_ledger_native_daily}.py`、`tests/{test_multimarket_exact_daily,test_thesis_ledger_inventory_export,test_thesis_ledger_alphavantage_capability_path,test_thesis_ledger_finnhub_capability_path}.py`。文档沿原 Spec/Task、矩阵、Architecture、DSA 接入指南和 CHANGELOG 增量对账。

Finnhub 加两种真实不同结构的隔离 HTTP 响应定向四文件 37 项通过（`/tmp/tl-cap-h07-finnhub-directed.log`）；最终 24 文件 323 项通过（`/tmp/tl-cap-h07-finnhub-regression-final.log`）。其中实际 Control/Runtime+工厂读取证明完整 HTTP 请求、纽约夏令时秒边界、缺 amount、原 none/qfq 口径、唯一登记和原修订；不同输入得到同一字段模型，不能据此宣称跨源价格等价。工厂测试核对重复读取、跨能力共享、凭据变更、probe 与原旧实例隔离。原 HTTP 传输没有增加重试或内部备用。

最终 `ci_gate.sh syntax`、`ci_gate.sh flake8` 和能力边界检查通过（`/tmp/tl-cap-h07-finnhub-{syntax,gates,boundaries}-final.log`）。TL 可执行输入未变，§9.22 的 Schema/Server/工作区门禁及旧 Worker 重放继续作为对应输入证据，不用重复全量验证替代 DSA 门禁。原全部 140 精确目标及 gated 集合完全相同。最新库存 SHA256 `b5a6c1ff17e3b11e96228d5ef90ade6c27df637677875d838ba65dc80a70a527`，文件 `/tmp/tl-cap-h07-finnhub-inventory-final.json`：19 Provider/140 目标/10 来源定义/46 绑定，279 产品模块/285 DSA 输入/64 Server 消费文件。

两代码叶勾选，最后目标正式 DSA 同步与只读核对仍待执行。本轮不保存用户政策、不读取未配置账户、不执行新的故障注入；H07/H08/H09 总项及 H10–H12 继续开放。

<a id="record-9-28"></a>

## 9.28 三来源阶段交付与未覆盖层级（2026-10-11）

最终从 infra 执行 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa`，预检、宿主 WebUI build、替换及健康检查全部成功（`/tmp/tl-cap-h07-http-daily-sync-dsa-final.log`）。DSA 镜像仍为 `0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`；Server/Worker 未重启、三应用 healthy，只有 DSA 写层更新，不是镜像发布。没有数据库/卷变更、安装依赖、账户注册或采购。

通过只读 `docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module -`，调用原 Server GET 政策/Provider/能力目录及原 DsaClient.marketRouteCatalogV3，显式断言产品 status=complete、协议 integrity=complete、各 140 目标；政策 Desired/Effective 84/84、applied、非 stale、五个临时功能为 0。首次摘要误取直接协议 status 字段，已按实际 Schema 的 integrity 更正并加断言，不使用该初次输出证明完整性。最终记录 `/tmp/tl-cap-h07-http-daily-target-verified.json`。只读 DSA Python 注册核对为 10 来源/46 绑定/140 目标，三来源均 provider 工厂作用域（`/tmp/tl-cap-h07-http-daily-target-registry-final.json`）。三 Provider 均禁用、未配置、configVersion=0，八个日线/报价目标均 credential_missing；没有发出三家的真实数据请求或自动改配置。

最终受影响包实际命令（在 DSA 仓库执行，日志只保留统计与失败信息）：

```sh
rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest tests/test_native_exact_daily.py tests/test_multimarket_exact_daily.py tests/test_configured_market_routes.py tests/test_thesis_ledger_inventory_export.py tests/test_thesis_ledger_control_v3.py tests/test_thesis_ledger_capability_registry.py tests/test_thesis_ledger_catalog_sources.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_contract.py tests/test_thesis_ledger_dependency_facts.py tests/test_thesis_ledger_provider_credentials_runtime.py tests/test_thesis_ledger_catalog_contract.py tests/test_thesis_ledger_provider_v3_boundary.py tests/test_thesis_ledger_baostock_capability_path.py tests/test_thesis_ledger_status_acquisition.py tests/test_thesis_ledger_tickflow_capability_path.py tests/test_tickflow_fetcher.py tests/test_tickflow_manager_routing.py tests/test_tickflow_market_review_fallback.py tests/test_tickflow_pipeline_prefetch.py tests/test_thesis_ledger_alphavantage_capability_path.py tests/test_alphavantage_fetcher.py tests/test_finnhub_fetcher.py tests/test_thesis_ledger_finnhub_capability_path.py -q > /tmp/tl-cap-h07-finnhub-regression-final.log 2>&1
```

最终 24 文件/323 项通过，10 项既有警告；语法、critical flake8、统一能力边界和两仓空白门禁通过。三来源在原 Runtime/manifest/依赖/凭据/Native 中无对应供应商登记残留；未迁移报价继续原读取入口，来源工厂由同一静态定义派生。工作树最终主仓 1119、DSA 269、infra 75 条记录，保留既有 WIP；没有 stage/commit/push、用户路由保存、真实凭据保存、真实准入写入或 Ledger 修改。

本阶段完成 H07-K6/K7/K8 共五个既有日线目标，真实上游、浏览器、新组合实际业务冻结与目标 Provider 配置代次故障继续未覆盖；§9.22 既有 Worker 断网重放证据仍对应未变的 Server/Worker 可执行输入。H07/H08/H09 总项、H09-K2 和 H10–H12 保持未勾选，不把任何必需目标门禁挪入 TODO。新的临时政策或故障需要具体准备及单独授权。

下一独立代码叶为 Tushare CN/HK STOCK / DAILY_BAR / 1d / none 两目标。现有 CN `daily` 与 HK `hk_daily` 均用原 TushareHistoryRequest 4.5s 单次预算、完整 ts_code 身份与 YYYYMMDD 日期；工厂普通 30s/probe 5s、_source_pinned、无凭据修订时不缓存仍需先固定回归及来源所有权。不能将这些差异机械替换为通用 4.5s 工厂，也不能为了迁移改写已稳定的 ETF/INDEX、事件、MappedRead 或分页路径。其余 Native 的 Yahoo、Longbridge、Futu 后续独立分批；富途本轮不扩展已取消的订单簿/订阅。

<a id="record-9-29"></a>

## 9.29 Tushare 两目标迁移启动与精确写集（2026-10-11）

用户本轮授权继续代码实施；原工作树仍为主仓 1119、DSA 269、infra 75 条记录，没有更深规则。沿原 Task 启动 H07-K9，不重建 Spec/Task，也不复用过去临时政策/故障授权。

范围为 CN/HK STOCK / DAILY_BAR / 1d / none 两个既有 gated 目标。来源集中拥有 manifest/factory、token 凭据、tushare 依赖、两项 binding/revision 及原 ts_code/日期投影；删除原 Native/中央对应登记。工厂使用原 HTTP client、冻结 token/httpUrl、30s/5s、_source_pinned；读取仍用 TushareHistoryRequest 4.5s、原限流计数和单响应协议。Spec §13.9 先增加内部 probe 目的与凭据修订缓存条件，不用预算数值猜测调用目的。公共 Runtime 解释静态来源事实，删除 Tushare 工厂及缓存供应商判断；原精确执行器的 cache 参数、ETF/INDEX/事件/MappedRead 和分页原样保留。

写集固定为 DSA `data_provider/thesis_ledger_sources/tushare.py`、原 CN/多市场 helper、`src/services/{thesis_ledger_capability_contracts,thesis_ledger_capability_registry,thesis_ledger_capability_sources,thesis_ledger_provider_runtime,thesis_ledger_provider_manifests,thesis_ledger_provider_dependencies,provider_credentials,thesis_ledger_native_daily}.py`，原 Native/库存/注册器测试和新来源测试；Spec/Task、来源矩阵、Architecture、接入指南和 CHANGELOG 增量更新。Schema/Server/SDK/运行依赖/真实用户配置不改。先原工厂与 HTTP 执行参数/身份/缓存回归，再扩大原 Tushare 分页、凭据、ETF、MappedRead、事件与受影响 DSA 验证；门禁通过后最小正式 DSA 同步与只读核对。真实账户读取独立保留。

当时状态记录：`[x]` H07-K9-tushare-stock-daily：两个目标沿原 Control/Runtime → 来源绑定 → 原 HTTP client → 标准结果闭环；原工厂预算、凭据/端点缓存、限流和分页回归通过，全精确库存及原修订保持。代码叶完成，目标及真实账户分层记录。

<a id="record-9-30"></a>

## 9.30 Tushare 本地闭环与 Yahoo 六目标范围（2026-10-11）

Tushare 两目标经原实际 HTTP client、Control/Runtime 和能力绑定输出标准日线；原 Native/中央登记删除，公共工厂和缓存判断从供应商分支变为来源声明。原普通 30s/probe 5s、token/httpUrl pin、无有效 HMAC 修订不缓存、同实例限流计数与单响应 pagesFetched=1 保持。定向五文件 81 项通过（`/tmp/tl-cap-h07-tushare-directed-final.log`）。首次唯一修订断言只传 credential_version，原门禁正确返回 None；测试改为原内部函数产生的隔离 HMAC，未放宽产品检查（首轮 1 失败/80 通过，`/tmp/tl-cap-h07-tushare-directed.log`）。

扩大 28 文件 515 项通过（`/tmp/tl-cap-h07-tushare-regression.log`），包含原 ETF 分区/分页、INDEX 行、fund factors/dividend、MappedRead、事件、工厂凭据及来源配置回归。SDK/原分页协议未修改。`ci_gate.sh syntax`、`ci_gate.sh flake8`、能力边界与 DSA diff --check 通过（`/tmp/tl-cap-h07-tushare-{syntax,gates,boundaries}.log`）。库存 `/tmp/tl-cap-h07-tushare-inventory.json` SHA256 `4a001abb4ad35bef557064496f82ce6ff1ccb81657ce8a61ddd0f052149f1854`：11 来源/48 绑定/140 目标，280 产品模块/286 DSA 输入/64 Server 消费文件；完整 exactRoutes 含 gated 与上批完全相同。当前目标仍为上一批代码，正式最小 DSA 同步在本轮后续来源输入稳定后串行执行。

继续独立 H07-K10，仅 Yahoo 主来源 `yfinance` 的 CN/HK/US STOCK/ETF / DAILY_BAR / 1d / qfq 六个既有 gated 目标。保留 _convert_stock_code、CN .SH→.SS、HK 四位代码、原 auto_adjust=true、结束日加一、线程关闭、4.5s、MultiIndex 精确 ticker 校验及 amount 缺失；同一来源拥有 manifest/factory/依赖/绑定，原 Namespace 工厂缓存保留。US INDEX 和两项 Share 窗口不在本叶迁移，继续 Native/原读取，不能为这批扩张 DailyQuery 或改写研究范围。

精确写集为 Yahoo 来源模块、原多市场 helper、静态入口、Native/manifest/依赖/导入视图、原多市场/库存测试及新来源合同测试；原 Share 窗口、SDK、SourceQuerySchema 和凭据不改。工厂适用于原未迁移能力，manifest 中两个 Share 上游的专有能力由同一来源定义派生，仍只有日线股票。先六组合实际 Control/Runtime/SDK 调用、字段/标的错配，再股票/指数/Share 原回归和库存等价；账户网络与目标层分别记录。

当时状态记录：`[x]` H07-K10-yahoo-stock-etf-daily：六目标完成来源绑定与实际执行器闭环，原参数、日期、单位未知、MultiIndex 身份及工厂缓存保持；本叶完成时 US INDEX/Share 仍单一原登记，指数后续独立归 K11，受影响回归通过。

<a id="record-9-31"></a>

## 9.31 Yahoo 六目标回归与指数单目标范围（2026-10-11）

六个 STOCK/ETF 有效组合显式登记，原 Native 六行删除。原 SDK 下载投影由来源拥有，旧多市场 helper 委托同一投影；US INDEX 的现行 SDK 投影也复用该函数，但本叶未迁移其登记或内部请求合同。来源 manifest 拥有两个 Share 上游的专有日线声明，Share 原读取/登记保持，非迁移业务路径未改。

定向三文件 25 项通过（`/tmp/tl-cap-h07-yahoo-six-directed.log`）；扩大 23 文件 335 项通过（`/tmp/tl-cap-h07-yahoo-six-regression.log`），包含真实工厂/Control/Runtime 的六组合 SDK 参数、MultiIndex 标的错配/空窗口、工厂缓存/probe，以及原股票/指数报价、财务、Share 两窗口和 Tushare 分页/MappedRead。语法、critical flake8、能力边界通过（`/tmp/tl-cap-h07-yahoo-six-{syntax,gates,boundaries}.log`）。只读当前目标政策 84 已选择 Yahoo HK/US STOCK qfq 单主源，允许正式同步后经原 DsaClient 读取短窗，不新增路线或变更顺序；CN/ETF 等未选择能力不在目标强行读取。

继续 H07-K11，仅迁移既有 Yahoo / US INDEX / DAILY_BAR / 1d / qfq 单目标。Spec §13.10 先补齐内部 DailyQuery 的 INDEX 枚举；产品 Data V3 已支持该资产，不改变公共 Schema 或新增能力参数。写集仅内部能力合同、Yahoo 来源 binding、原 Native 单行、新来源/多市场测试；不改 SDK、两项 Share 或消费者。验证原 Control/Runtime 的指数代码转换、精确参数和原修订，非法指数身份在读取前拒绝，其他来源不因枚举扩展获得 INDEX 绑定；之后受影响日线/指数回归与全库存等价。

当时状态记录：`[x]` H07-K11-yahoo-us-index-daily：既有指数单目标通过原执行器与标准结果，原身份/单位/复权/单响应语义保持，旧 Native 单登记删除，股票/ETF 及 Share 回归通过。代码叶完成，真实目标分层记录。

<a id="record-9-32"></a>

## 9.32 当前本地门禁与目标范围（2026-10-11）

K11 定向五文件 61 项通过（`/tmp/tl-cap-h07-yahoo-index-directed.log`），含实际工厂/Control/Runtime 的 SPX.US → ^GSPC 请求、精确参数、非法指数在上游前拒绝、其他来源无 INDEX 绑定。最终 38 文件 594 项通过（`/tmp/tl-cap-h07-tushare-yahoo-regression-final.log`），覆盖本轮工厂/缓存/股票/ETF/指数、既有 Tushare 分页/MappedRead/事件、Yahoo Share 与报价/财务。语法、critical flake8、能力边界和两仓 diff --check 通过（`/tmp/tl-cap-h07-tushare-yahoo-{syntax,gates,boundaries}-final.log`），未修改预算、断言或门禁阈值来掩盖失败。

最终库存 `/tmp/tl-cap-h07-tushare-yahoo-inventory-final.json` SHA256 `508e75909356ad9b192ee4f61299707f660ba245d08340cc478e58d28e87808b`：19 Provider/140 目标/12 来源定义/55 绑定，281 产品模块/287 DSA 输入/64 Server 消费文件。全部精确目标对象（含 gated）与上批完全一致；本轮累计九目标迁移，没有新增生产能力或路由。六目标阶段库存 `/tmp/tl-cap-h07-yahoo-six-inventory.json` SHA256 `8a10d8bb4258a70c43a23377df22a125b2cf32a90a81cdc715c611589971fcee`，为 12 来源/54 绑定，保留阶段证据。

实现完成后更新原矩阵、Architecture、DSA 接入指南/CHANGELOG。准备从 infra 串行执行 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa`，仅代码、依赖和数据库结构未变，预检拒绝则按正式入口处理。之后只读核对目标注册、目录、政策及 Tushare 禁用/未配置状态；不为其保存凭据、启用或选路线。

目标 Yahoo 实际读取限于原已保存且就绪的两个 STOCK qfq 单主源：AAPL.US 和 00700.HK，2024-07-15～19，经原 DsaClient.marketChartBarsV3/原 Reader/API，逐次请求只一次，不新增重试/备用。先核对政策 84/84、精确目标唯一且 eligible；调用后重新核对政策。结果保留实际来源、窗口、数据时钟与覆盖；失败保留真实错误，不用 SDK fixture 或改政策替代。该只读来源与目标查询不创建新快照或修改 Ledger，也不声称完整研究/跨源等价或浏览器通过。

<a id="record-9-33"></a>

## 9.33 正式目标更新与真实 Yahoo 短窗（2026-10-11）

infra `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 的 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa` 退出 0，兼容预检、宿主 WebUI build、DSA 替换与 healthy 全部通过（`/tmp/tl-cap-h07-tushare-yahoo-sync-dsa.log`）。镜像仍为 `0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`，仅 DSA 写层更新；Server/Worker 未重启，三应用 healthy，未改数据库、外部卷或运行依赖。目标直接注册为 12 来源/55 绑定/140 目标、Yahoo 七绑定、Tushare provider 作用域且要求凭据修订（`/tmp/tl-cap-h07-tushare-yahoo-target-registry.json`）。

真实来源与目标读取：只读 `docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module -`，经原 DsaClient.marketChartBarsV3 → DsaDataCapabilityReaderV3 → 原 DSA API → 当前能力绑定。先核对原 Effective Policy 84、每个目标唯一且 eligible，无临时政策；AAPL.US/00700.HK、qfq、2024-07-15～19 各只请求一次，分别返回五根日线，来源均 yfinance/yfinance、routeIndex=0、effectivePolicyRevision=84。美国时间戳 00:00:00-04:00，香港为 +08:00，实际起止覆盖本窗口、latestCompleteTradingDate=2024-07-19。价格 basis 为 provider-native/provider-defined、qfq；修订 origin=local-observation、volumeBasis=unknown、转换不可用，不伪造成跨源等价或研究资格。每次读取后重新断言 84/84、applied、非 stale、原 routes 深度相等。命令退出 0，结果 `/tmp/tl-cap-h07-yahoo-live-target.json`。

原 Server API 与原 DsaClient 目录分别 complete/integrity=complete、140 目标，政策仍 84/84、五个临时功能 0。Tushare disabled、未配置、configVersion=0，无真实 Tushare 数据调用；没有凭据保存、来源启用、用户路由变更、故障注入、准入或 Ledger 写入（`/tmp/tl-cap-h07-tushare-yahoo-target-state.json`）。本轮三代码叶 K9/K10/K11 共九个既有目标完成；Tushare 真实账户、其余 Yahoo 市场/资产、浏览器、H08 Provider 配置代次目标故障和 H09-K2 新组合业务冻结仍分别未覆盖。Server/Worker 输入未变，原冻结重放证据见 §9.22；不重复全量测试来代替这些缺口。

本轮精确写集沿 §9.29/§9.30/§9.31：两个来源模块、原 CN/多市场桥接、内部能力合同/注册器/来源入口、原 Runtime/manifest/依赖/凭据/Native，以及 Native/多市场/库存/注册器和两个新来源测试。公共 TS Schema、Server、SDK、数据库、部署入口与运行依赖未改；文档只有原 Spec/Task/矩阵/Architecture 与 DSA 指南/CHANGELOG 增量。下一独立来源叶是 Longbridge HK/US 股票/ETF none/qfq 八目标，须先核对 legacy/OAuth 工厂、probe 只读目的、数据库路径及 SDK 缓存责任，再迁移精确请求投影；Futu 与 Share 窗口仍后续独立分批，不恢复取消范围。H07/H08/H09 总项与 H10–H12 保持开放。

本轮最终扩大验证实际命令（在 DSA 仓库执行，38 文件/594 项通过）：

```sh
rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest tests/test_thesis_ledger_yfinance_capability_path.py tests/test_multimarket_exact_daily.py tests/test_thesis_ledger_inventory_export.py tests/test_yfinance_normalize.py tests/test_yfinance_hk_bare_code.py tests/test_yfinance_hk_indices.py tests/test_yfinance_us_indices.py tests/test_yfinance_jp_kr_indices.py tests/test_yfinance_fundamental_adapter.py tests/test_yfinance_financial_period.py tests/test_yahoo_share_window.py tests/test_yahoo_share_window_routes.py tests/test_yahoo_hk_share_window.py tests/test_yahoo_hk_share_window_routes.py tests/test_configured_native_quotes.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_control_v3.py tests/test_thesis_ledger_provider_credentials_runtime.py tests/test_thesis_ledger_capability_registry.py tests/test_native_exact_daily.py tests/test_thesis_ledger_tushare_capability_path.py tests/test_thesis_ledger_tushare_mapped_read.py tests/test_thesis_ledger_market_v3_pagination.py tests/test_thesis_ledger_tushare_credential_revision.py tests/test_thesis_ledger_tushare_market_v3.py tests/test_thesis_ledger_tushare_events_v3.py tests/test_thesis_ledger_tushare_event_registry_v3.py tests/test_tushare_exact_daily.py tests/test_tushare_fetcher_http_client.py tests/test_tushare_fetcher_followups.py tests/test_tushare_fund_daily.py tests/test_tushare_fund_adj.py tests/test_tushare_fund_dividend_reader.py tests/test_tushare_fund_dividends.py tests/test_tushare_index_daily_rows.py tests/test_thesis_ledger_tickflow_capability_path.py tests/test_thesis_ledger_alphavantage_capability_path.py tests/test_thesis_ledger_finnhub_capability_path.py -q > /tmp/tl-cap-h07-tushare-yahoo-regression-final.log 2>&1
```

最终只读工作树核对为主仓 1119、DSA 271、infra 75 条记录，保留已有 WIP；两仓 diff --check 通过，没有 stage/commit/push。矩阵、指南和 Architecture 已与本轮已实现范围对账，未覆盖层级仍在原 Task 开放，未迁移到 TODO 或借旧授权执行新的临时政策/故障。

<a id="record-9-34"></a>

## 9.34 Longbridge 八目标启动与工厂接缝（2026-10-11）

用户授权继续本叶代码实施；工作树核对主仓 1119、DSA 271、infra 75，保留 WIP。范围为既有 Longbridge HK/US STOCK/ETF / DAILY_BAR / 1d / none、qfq 八个 gated 目标；legacy/OAuth 工厂、probe 只读语义、凭据版本缓存、原 SDK 与未迁移报价/手数行为保持。数据链仍原 Control/Runtime → 能力绑定 → _get_ctx().history_candlesticks_by_date → 标准结果。

工厂现位于 Runtime：oauth 使用原 build_page_oauth(snapshot, store.database_path, read_only=probe)，legacy 显式传 appKey/appSecret/accessToken，空 environment values 保留原 SDK 发现。Spec §13.11 先明确内部 database_path 与来源静态环境例外，不通过判断预算推断 probe，也不把凭据例外解释成可用目录/准入。正常 OAuth 刷新只复用原 CAS 回调，probe 不写刷新或打开交互授权；本轮实际目标不调用未配置账户。

精确写集为新来源模块、原多市场 helper、内部 ReadContext/SourceDefinition、静态来源入口、原 Runtime/manifest/依赖/凭据/Native，原多市场/库存/注册器及新来源测试；文档沿原 Spec/Task/矩阵/Architecture/接入指南/CHANGELOG。不改 SDK、OAuth 存储/加密/管理协议、TS Schema、Server、运行依赖、用户配置或业务语义。先八组合实际工厂/Control/Runtime、SDK 参数及时间输入；再 legacy/OAuth 缓存、原真实隔离 Store 刷新与 probe 不写、OAuth/API/凭据/未迁移能力回归；最后库存等价与正式最小 DSA 同步。新的临时政策/故障仍需独立授权。

当时状态记录：`[x]` H07-K12-longbridge-daily：八目标迁移与原执行器闭环，工厂/OAuth/probe/缓存/SDK 原行为和修订保持，删除旧对应登记，受影响验证及库存等价通过。真实账户与目标同步分层记录。

<a id="record-9-35"></a>

## 9.35 Longbridge 本地闭环与后续有界窗口叶（2026-10-11）

八绑定全部由 Longbridge 来源模块唯一拥有；原 SDK/OAuth 存储文件未改。定向五文件 66 项通过，扩大十九文件最终 236 项通过、1 项跳过（`/tmp/tl-cap-h07-longbridge-directed.log`、`/tmp/tl-cap-h07-longbridge-regression-final.log`）。第一次扩大回归为 1 失败/235 通过/1 跳过：非 OAuth 环境缓存测试的简化 store 没有 database_path，新内部依赖不应强制所有来源提供路径；Runtime 改为可选 getattr，保持原测试与其他来源工厂语义后回归通过。语法、最终 critical flake8 和能力边界通过（`/tmp/tl-cap-h07-longbridge-{syntax,gates-final,boundaries-final}.log`）。

最终库存 `/tmp/tl-cap-h07-longbridge-inventory-final.json` SHA256 `009695d3278aee9cabcb4700ea6b4f928288123eaeb191d36de766786bdce0be`：13 来源/63 绑定/140 目标、282 产品模块/288 DSA 输入，全部精确目标对象与 §9.32 相同。尚未以本轮代码同步目标，未配置 Longbridge 真实账户读取仍未覆盖。

继续 H07-K13，仅将原 Yahoo 两项 STOCK/none 有界 Share 窗口登记与读取归入已有 Yahoo 来源模块。原解析器、参考包、摘要、窗口/证券限制、单位与 observedAt 保持；不新增追补、研究协议、消费资格或证券范围。Spec §13.12 先明确其归档事实边界。写集只 Yahoo 来源模块、Native 两条登记/分支、Yahoo 来源测试；沿原 HTTP/Control/Runtime 测试验证两个原参考包与错误，再做受影响回归、库存等价和两叶正式最小 DSA 同步。Futu 十二目标暂保留原路径：其 SDK 多页与执行器单次返回的页数含义需独立核对，不把单响应次数伪造成 SDK 分页计数。

当时状态记录：`[x]` H07-K13-yahoo-share-windows：两项已有有界参考窗口复用标准合同与原执行器，单一来源登记、原事实与消费边界保持，HTTP/错误/冻结相关回归和库存等价通过。参考包读取不作为当前在线来源验收。

<a id="record-9-36"></a>

## 9.36 两叶最终门禁与正式同步准备（2026-10-11）

K13 定向六文件最终 73 项通过（`/tmp/tl-cap-h07-yahoo-share-directed-final.log`）：原鉴权 HTTP → Control/Runtime → 标准结果，错误范围及零量观察保持；新增两例使用实际工厂与执行器，禁止在线 download 并逐字段、逐 attrs 比较原读取器输出。原参考包、解析器、消费者和冻结版本均未改。两叶扩大 47 文件最终 692 项通过、1 项跳过、13 条既有依赖警告（`/tmp/tl-cap-h07-longbridge-share-regression-final.log`）；包含 Longbridge SDK/OAuth 存储与 API、Runtime/凭据缓存、Yahoo 全市场/指数/财务/参考窗口、Tushare 分页及事件、已迁移来源与 Native 回归。

最终语法、critical flake8、能力边界通过（`/tmp/tl-cap-h07-longbridge-share-{syntax,gates,boundaries}.log`）。实际门禁命令为 DSA 下 `rtk proxy sh -c 'PATH="$PWD/.venv/bin:$PATH" ./scripts/ci_gate.sh syntax'`、同入口 `flake8`，及 `rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/check_thesis_ledger_capability_boundaries.py`，输出分别重定向上述日志。最终只读库存命令 `rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/export_thesis_ledger_capability_inventory.py > /tmp/tl-cap-h07-longbridge-share-inventory-final.json`：SHA256 `0ded7938cb3e3903cfafc02c5cc938a36907e160460bf965927f88cac3d549c4`，19 Provider/140 目标/13 来源/65 绑定、282 产品模块/288 DSA 输入/64 Server 消费文件，全部精确目标对象含 gated 与 §9.32 完全一致。新增十绑定分别替换原登记，不新增用户路线。

本轮精确写集：DSA `data_provider/thesis_ledger_sources/{longbridge,yfinance}.py`、`data_provider/multimarket_exact_daily.py`；`src/services/thesis_ledger_{capability_contracts,capability_registry,capability_sources,provider_runtime,provider_manifests,provider_dependencies,native_daily}.py`、`src/services/provider_credentials.py`；`tests/test_{thesis_ledger_longbridge_capability_path,thesis_ledger_yfinance_capability_path,thesis_ledger_inventory_export,thesis_ledger_capability_registry,multimarket_exact_daily}.py`。文档仅原 Spec/Task/来源矩阵/Architecture、DSA 接入指南与 `docs/CHANGELOG.md`。两仓和 infra `git diff --check` 通过，工作树 1119/272/75，保留所有 WIP，不提交或推送。TS Schema、Server、原 SDK/OAuth 存储、运行依赖、数据库和部署脚本输入未变。

准备串行从 infra 执行 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa`，只更新 DSA 代码写层；兼容预检拒绝则停止快更并处理正式更新条件。更新后分别核对目标实际来源注册、原 Server/DsaClient 目录、政策 84/84 与 Longbridge 禁用/未配置，不能用容器 healthy 代替注册或账户读取证明。不启用来源、保存凭据、变更路线或故障注入；H08/H09-K2 与浏览器仍保持未完成。

<a id="record-9-37"></a>

## 9.37 正式目标对账与下一执行叶（2026-10-11）

infra 实际执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，`rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-longbridge-share-sync-dsa.log 2>&1'` 退出 0，兼容预检、宿主静态资源构建及 DSA healthy 通过。只更新 DSA 写层，镜像仍为 `0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`；Server/Worker 镜像仍为 `2878d06a265a68ec8eb8e0079c82d4fa1e126a5dc4fdb06fa8226a5868f72afb`，均 healthy。未重建镜像、变更依赖/数据库/外部卷或更新 Server/Worker。

目标只读命令分别为 `docker exec -i -w /app -e PYTHONDONTWRITEBYTECODE=1 thesis-ledger-dev-dsa-1 python -` 与 `docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module - < /tmp/tl-cap-longbridge-share-target-verify.mjs`，均通过 RTK 执行。前者只导入静态注册，不实例化 SDK：13 来源/65 绑定/140 目标，Longbridge 八绑定、provider 工厂作用域、legacy/OAuth 两方法及原环境发现事实，Yahoo 九绑定，旧 Native 日线仅剩 Futu（`/tmp/tl-cap-h07-longbridge-share-target-registry.json`）。后者经原 DsaClient 与原 Server GET 双层核对目录 140、complete/integrity=complete，Longbridge 日线八项均未 ready，原政策前后 84/84、applied、非 stale、routes 深度相等、五个临时功能 0；Longbridge disabled、未配置、configVersion=0（`/tmp/tl-cap-h07-longbridge-share-target-state.json`，检查时间 `2026-10-10T19:53:55.285Z`）。只读验收脚本初次错误访问 integrity.status，实际合同为字符串；核对真实返回后修正脚本读取，未修改产品断言或目录状态。

当前产品输入摘要与 §9.32 对比，原 Longbridge SDK、两个 Share 读取器、OAuth contract/manager/runtime/store 均未变。公共 TS Schema、Server/Worker 冻结消费者输入未变，沿 §9.22 既有离线重放证据，不重复高成本全量冻结检查。真实 Longbridge 数据/账户刷新、当前在线 Share 来源、浏览器及 H08 目标配置代次故障/H09-K2 新组合业务冻结仍未覆盖，相关总项保持开放。已完成 K12/K13 两代码叶十个既有目标，没有新的临时政策或故障注入，没有保存凭据、变更启用、写准入或 Ledger。

下一独立来源叶为 Futu 十二日线目标的精确迁移盘点：真实入口是 `FutuMarketAdapter.get_exact_daily -> futu_query_worker -> read_futu_daily`；SDK max_count=1000、至多 64 页、cursor 循环/缺失检查、全部页完成后返回并关闭上下文，必须保留隔离进程 4.5s 与原错误。原执行器 pagesFetched=1 与 SDK 内部页数不能混淆；先明确此元数据边界，再迁移登记/工厂和标准桥，不对 SDK 页数作未经证实的宣称。Futu 独立交付及取消的订单簿/订阅范围保持。本轮只读盘点未修改其文件或 Task 状态；不能把该盘点当作已完成迁移。新政策/故障或研究语义仍在对应独立授权边界。

两叶最终扩大验证实际命令（DSA，47 文件/692 通过/1 跳过）：

```sh
rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest tests/test_thesis_ledger_longbridge_capability_path.py tests/test_longbridge_fetcher.py tests/test_provider_oauth_runtime.py tests/test_provider_oauth_store.py tests/test_provider_oauth_manager.py tests/test_provider_oauth_api.py tests/test_provider_oauth_native_storage.py tests/test_thesis_ledger_yfinance_capability_path.py tests/test_multimarket_exact_daily.py tests/test_thesis_ledger_inventory_export.py tests/test_yfinance_normalize.py tests/test_yfinance_hk_bare_code.py tests/test_yfinance_hk_indices.py tests/test_yfinance_us_indices.py tests/test_yfinance_jp_kr_indices.py tests/test_yfinance_fundamental_adapter.py tests/test_yfinance_financial_period.py tests/test_yahoo_share_window.py tests/test_yahoo_share_window_routes.py tests/test_yahoo_hk_share_window.py tests/test_yahoo_hk_share_window_routes.py tests/test_configured_native_quotes.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_control_v3.py tests/test_thesis_ledger_provider_credentials_runtime.py tests/test_thesis_ledger_capability_registry.py tests/test_native_exact_daily.py tests/test_thesis_ledger_tushare_capability_path.py tests/test_thesis_ledger_tushare_mapped_read.py tests/test_thesis_ledger_market_v3_pagination.py tests/test_thesis_ledger_tushare_credential_revision.py tests/test_thesis_ledger_tushare_market_v3.py tests/test_thesis_ledger_tushare_events_v3.py tests/test_thesis_ledger_tushare_event_registry_v3.py tests/test_tushare_exact_daily.py tests/test_tushare_fetcher_http_client.py tests/test_tushare_fetcher_followups.py tests/test_tushare_fund_daily.py tests/test_tushare_fund_adj.py tests/test_tushare_fund_dividend_reader.py tests/test_tushare_fund_dividends.py tests/test_tushare_index_daily_rows.py tests/test_thesis_ledger_tickflow_capability_path.py tests/test_thesis_ledger_alphavantage_capability_path.py tests/test_thesis_ledger_finnhub_capability_path.py tests/test_thesis_ledger_provider_v3_boundary.py tests/test_thesis_ledger_dependency_facts.py -q > /tmp/tl-cap-h07-longbridge-share-regression-final.log 2>&1
```

<a id="record-9-38"></a>

## 9.38 Futu 十二目标启动与迁移盘点（2026-10-11）

用户授权继续 Futu 代码迁移；实际工作树核对主仓 1119、DSA 272、infra 75，保留已有 WIP。精确范围为现有 HK/US STOCK/ETF / DAILY_BAR / 1d / none、qfq、hfq 十二目标。真实 SDK 隔离入口、分页与释放见 §9.37，原工厂在 Runtime 的 `_PROVIDER_ADAPTER_IMPORTS` 与末段 `adapter_class(**values)` Futu 分支；manifest、opend 凭据/依赖、Native 四组十二目标和分页修订为当前中央接缝。业务与 SDK 文件均不必改写。

Spec §13.13 先明确一次完整隔离响应与 SDK 内部页数的不同口径；本叶保持既有 pagesFetched=1，SDK 页数未知，不新增 wire 字段或冒充单页。写集：新增 `data_provider/thesis_ledger_sources/futu.py`；原 `thesis_ledger_{capability_sources,provider_runtime,provider_manifests,provider_dependencies,native_daily}.py`、`provider_credentials.py`；新增来源合同测试、原 Futu 日线/库存测试。原 SDK/worker/日线解析器、Server、Schema、依赖、目标用户配置不改。先十二组合实际工厂/Control/Runtime 与隔离命令/预算、两页/释放、原错误/缓存；再报价/静态资料/分发、分页与受影响回归、全库存等价，最后正式最小 DSA 同步和只读目录/政策核对。新的临时政策/故障仍需单独授权。

当时状态记录：`[x]` H07-K14-futu-daily：十二目标经原隔离入口与标准处理器完成迁移，完整分页/释放/预算/错误及原工厂缓存保持，精确登记与修订等价；目标与真实来源分层记录。

<a id="record-9-39"></a>

## 9.39 Futu 最小闭环与检查接缝收敛（2026-10-11）

K14 定向四文件最终 75 项通过（`/tmp/tl-cap-h07-futu-directed-final.log`），扩大二十二文件 398 项通过（`/tmp/tl-cap-h07-futu-regression.log`）。十二组合经实际来源工厂、Control/Runtime、原 worker.main 与原 SDK 读取器；只替换进程启动和网络 SDK，明确一次子进程/两页/一次释放、max_count/游标/复权/4.5s、不提交失败前缀、超时/进程/权限/缺 SDK 分类、缓存轮换/probe 与旧 LOT 缓存隔离。首次新测试因替身缺 __spec__ 被安装检查拒绝、修订测试缺 credential_version、错误假设 Futu 提供 native_daily_contract 而失败；按真实接口补齐替身/凭据版本与静态身份断言，没有改变生产门禁或伪造新元数据。阶段库存 `/tmp/tl-cap-h07-futu-inventory.json` SHA256 `b6efc4926a2ad06977e9a9a287bc4f8146c40f439f77265d3c01e49e02040802`，14 来源/77 绑定/140 目标，精确目标与 §9.36 相同。

调用链盘点发现只读 read_exact_probe 仍优先 Native、否则调用供应商通用 get_daily_data_for_source；迁移后 Futu 日线没有该通用方法，必须复用标准处理器，不能重新加供应商分支。继续 H07-K15，Spec §13.14 先明确移除空 Native 生产分支与检查复用，保留 HiThink 原 interactive 语义和未迁移能力。写集：`thesis_ledger_{exact_bar_execution,exact_probe_read,bar_query_semantics,market_v3_revisions,market_v3_facts,market_v3_adapters,native_daily}.py`，检查/门禁及定向检查回归。保留空登记哨兵供原迁移防重测试与自动门禁，不恢复执行能力；最终库存/目录应与 K14 等价。先精确检查实际处理器/worker/错误/只读，再受影响控制/目录/修订/冻结读取回归及正式目标更新。

当时状态记录：`[x]` H07-K15-retire-native-daily：空 Native 日线生产分支退役，已迁移非 HiThink 日线检查复用标准处理器，未迁移路径和 HiThink 专有语义保持，目录/修订/错误回归通过。

<a id="record-9-40"></a>

## 9.40 Futu 与检查叶最终门禁、写集及目标范围（2026-10-11）

K15 定向五文件 75 项通过（`/tmp/tl-cap-h07-futu-retire-directed.log`），含原 probe_sample 边界下实际工厂/worker/两页/释放、正常缓存不替换、凭据快照不写、后页错误原码及退役哨兵不能重新登记。最终扩大五十九文件 907 项通过、1 项跳过、18 条既有依赖警告（`/tmp/tl-cap-h07-futu-retire-regression-final.log`）；未提高门禁阈值、增加 ignore 或削弱生产校验。最终语法/critical flake8/能力边界通过（`/tmp/tl-cap-h07-futu-retire-{syntax,gates,boundaries}.log`），对应 `PATH="$PWD/.venv/bin:$PATH" ./scripts/ci_gate.sh syntax`、同入口 `flake8`、`.venv/bin/python scripts/check_thesis_ledger_capability_boundaries.py`，均经 RTK 执行。

最终静态只读导出 `.venv/bin/python scripts/export_thesis_ledger_capability_inventory.py > /tmp/tl-cap-h07-futu-retire-inventory-final.json` SHA256 `2e5bed94ee6bc991f9f7871f9e58a5123f96bf45fcd7f945c8147c86aed8490a`：19 Provider/140 目标/14 来源/77 绑定、282 产品模块/288 DSA 输入/64 Server 消费文件；所有精确目标含 gated 与 §9.36 相同。原 `futu_{market,daily,lot_size,query_worker,static_info}.py` 摘要逐一与上一批库存相同；保留 SDK 原行为，未改账户/行情权限、分钟或订阅范围。

精确写集：新 `data_provider/thesis_ledger_sources/futu.py`；`src/services/thesis_ledger_{capability_sources,provider_runtime,provider_manifests,provider_dependencies,native_daily,exact_bar_execution,exact_probe_read,bar_query_semantics,market_v3_revisions,market_v3_facts,market_v3_adapters}.py`、`src/services/provider_credentials.py`；新 `tests/test_thesis_ledger_futu_capability_path.py`、原 `tests/test_futu_daily.py`/`test_thesis_ledger_inventory_export.py`、`scripts/check_thesis_ledger_capability_boundaries.py`；文档仅原 Spec/Task/矩阵/Architecture 与 DSA 接入指南/CHANGELOG。共享 Runtime/目录/Task 串行处理；公共 TS Schema、Server/Worker、SDK、运行依赖、数据库及 infra 脚本输入未改。

继续正式最小 DSA 代码同步，入口仍为 infra `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa`，兼容预检不可绕过。目标随后只读验证注册、完整目录、政策与实际配置。上一批只读政策中 Futu 仅被选择为 HK/STOCK/SECURITY_LOT_SIZE，没有已保存的 Futu 日线目标；本轮必须重新核对，不能为十二目标真实读取自动新增路线或利用旧授权。SDK fixture、静态目录、目标健康与真实日线分别记录；目标日线消费若需临时政策，另行准备精确脚本并请求授权。H07/H08/H09 总项与 H10–H12 仍开放。

<a id="record-9-41"></a>

## 9.41 Futu 正式目标结果与未覆盖层级（2026-10-11）

实际 infra 命令 `rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-futu-retire-sync-dsa.log 2>&1'` 退出 0，兼容预检、宿主构建与目标 DSA healthy 通过。仅 DSA 写层更新，镜像 ID 与 §9.37 相同，Server/Worker 未更新，三应用均 healthy；没有重建镜像、改变数据库/卷/运行依赖或绕过正式入口。

只读目标注册命令 `docker exec -i -w /app -e PYTHONDONTWRITEBYTECODE=1 thesis-ledger-dev-dsa-1 python -`（经 RTK，stdin 仅静态导入与断言）：14 来源/77 绑定/140 目标、Futu 十二绑定/provider 工厂作用域/原 SDK 分页协议，生产执行及检查模块均没有 read_native_daily（`/tmp/tl-cap-h07-futu-retire-target-registry.json`）。只读原 Server/DsaClient 验证命令 `rtk proxy sh -c 'docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module - < /tmp/tl-cap-futu-retire-target-verify.mjs > /tmp/tl-cap-h07-futu-retire-target-state.json'` 退出 0，时间 `2026-10-10T20:12:32.005Z`。两层目录 complete/integrity=complete、140 目标，Futu 十二日线均配置 ready；Futu enabled/credentialConfigured=true、configVersion=1，opend 方法保持。政策读取前后仍 84/84、applied、非 stale、routes 深度相等，Futu 实际只选 SECURITY_LOT_SIZE、已选日线 0。

上述 ready 仅证明目录/依赖/配置，不能证明 OpenD 当前连接、历史权限、完整真实分页或十二目标业务消费。本轮未发真实 Futu 日线，不临时改政策，不调用保存凭据/准入或故障入口。真实 Futu 日线目标验收、H08 Provider 配置代次/迟到结果故障、H09-K2 新组合冻结及浏览器分别仍未完成；旧 Server/Worker 冻结消费者输入未变，继续保留 §9.22 重放证据，不用静态/fixture 关闭真实验收。

本轮已完成 K14 和后续 K15 两代码叶：十二目标迁移与空 Native 生产分支退役/检查复用。下一可执行迁移叶是 Futu 已稳定的非 K 线能力（先核对原 QuoteQuery/QuoteBinding 和四个 HK/US 股票/ETF 报价的字段/来源时间/严格来源调用，复用同一隔离工厂）；只读盘点后固定写集，不把所有报价、静态资料和手数合并重写。真实日线若需要临时政策，先完成可审阅的精确验收/恢复脚本，再取得该项授权；本轮不借用此前已执行完毕的授权。

最终扩大验证实际命令（DSA，59 文件/907 通过/1 跳过）：

```sh
rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest tests/test_thesis_ledger_futu_capability_path.py tests/test_futu_daily.py tests/test_futu_market.py tests/test_futu_static_info.py tests/test_futu_quote_consumer.py tests/test_futu_distribution_contract.py tests/test_futu_portfolio_service.py tests/test_provider_probe_execution.py tests/test_thesis_ledger_market_v3.py tests/test_thesis_ledger_field_units.py tests/test_thesis_ledger_status_cache.py tests/test_configured_market_routes.py tests/test_thesis_ledger_longbridge_capability_path.py tests/test_longbridge_fetcher.py tests/test_provider_oauth_runtime.py tests/test_provider_oauth_store.py tests/test_provider_oauth_manager.py tests/test_provider_oauth_api.py tests/test_provider_oauth_native_storage.py tests/test_thesis_ledger_yfinance_capability_path.py tests/test_multimarket_exact_daily.py tests/test_thesis_ledger_inventory_export.py tests/test_yfinance_normalize.py tests/test_yfinance_hk_bare_code.py tests/test_yfinance_hk_indices.py tests/test_yfinance_us_indices.py tests/test_yfinance_jp_kr_indices.py tests/test_yfinance_fundamental_adapter.py tests/test_yfinance_financial_period.py tests/test_yahoo_share_window.py tests/test_yahoo_share_window_routes.py tests/test_yahoo_hk_share_window.py tests/test_yahoo_hk_share_window_routes.py tests/test_configured_native_quotes.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_control_v3.py tests/test_thesis_ledger_provider_credentials_runtime.py tests/test_thesis_ledger_capability_registry.py tests/test_native_exact_daily.py tests/test_thesis_ledger_tushare_capability_path.py tests/test_thesis_ledger_tushare_mapped_read.py tests/test_thesis_ledger_market_v3_pagination.py tests/test_thesis_ledger_tushare_credential_revision.py tests/test_thesis_ledger_tushare_market_v3.py tests/test_thesis_ledger_tushare_events_v3.py tests/test_thesis_ledger_tushare_event_registry_v3.py tests/test_tushare_exact_daily.py tests/test_tushare_fetcher_http_client.py tests/test_tushare_fetcher_followups.py tests/test_tushare_fund_daily.py tests/test_tushare_fund_adj.py tests/test_tushare_fund_dividend_reader.py tests/test_tushare_fund_dividends.py tests/test_tushare_index_daily_rows.py tests/test_thesis_ledger_tickflow_capability_path.py tests/test_thesis_ledger_alphavantage_capability_path.py tests/test_thesis_ledger_finnhub_capability_path.py tests/test_thesis_ledger_provider_v3_boundary.py tests/test_thesis_ledger_dependency_facts.py -q > /tmp/tl-cap-h07-futu-retire-regression-final.log 2>&1
```

<a id="record-9-42"></a>

## 9.42 Futu 四项报价迁移启动（2026-10-11）

继续全目标的后续可执行叶 K16。实际工作树主仓 1119、DSA 273、infra 75；先核对原 QuoteQuery/QuoteValue/QuoteBinding、quote_dispatch、current_data_route、原 Futu worker 与报价 SDK。范围只既有 HK/US STOCK/ETF REALTIME_QUOTE 四目标；来源/价格/量额/市场时间/抓取时间/错误/4.5s 与原工厂保持，不添加字段推断、盘口或订阅。

当前 Futu 报价中央登记由 current_data_route 循环派生，quote_dispatch 含 Futu 专有分支；迁移后来源模块拥有四项 QuoteBinding 和原结果投影，删除对应循环项与执行分支。只读报价检查的证券格式改由现行分发器按标准证券代码处理，去掉检查器内重复的 Provider 格式名单；原分发器仍负责未迁移来源的现行桥接。写集为 Futu 来源模块、current_data_route、quote_dispatch、exact_probe_read、来源测试；指南/矩阵/Architecture/Task 沿原文件增量。SDK、worker、Schema、业务消费者与用户政策不改。

先四组合实际工厂/Control/Runtime/worker 与 SDK 单标身份、时钟、单位、取消式超时/错误/释放和检查复用，再定向来源/全部报价回归、库存等价与正式同步；当前没保存 Futu 报价路线，不以目录 ready 关闭真实验收。临时政策/故障仍待独立授权。

当时状态记录：`[x]` H07-K16-futu-quote：四个既有精确报价迁入标准绑定，原 SDK/工厂/投影/错误保持，删除旧对应登记与供应商分支，原检查复用与回归通过。目标及真实来源分层记录。

<a id="record-9-43"></a>

## 9.43 四项报价最终门禁与目标同步范围（2026-10-11）

定向六文件 90 项通过（`/tmp/tl-cap-h07-futu-quote-directed.log`），最终扩大六十文件 920 项通过、1 项跳过、18 条既有警告（`/tmp/tl-cap-h07-futu-quote-regression-final.log`），包含原 Futu 全部 SDK/日线/报价/静态资料、其他来源报价与 probe、原缓存/凭据/政策/字段单位和冻结输入读取。语法、critical flake8、能力边界通过（`/tmp/tl-cap-h07-futu-quote-{syntax,gates,boundaries}.log`），沿 §9.40 相同正式命令，仅对应新日志。

库存 `/tmp/tl-cap-h07-futu-quote-inventory-final.json` SHA256 `983b2e1496d870d68dda887ea998a75f06e7d58a877ab18e1e1b075830c691b1`，14 来源/81 绑定/140 精确目标、282 产品模块/288 DSA 输入/64 Server 消费文件；全部精确目标含 gated 与 K15 等价。Futu 现在十二日线与四报价绑定，未增加能力、权限、订阅或用户路线。精确写集沿 §9.42，另增 `tests/test_thesis_ledger_futu_quote_capability_path.py` 并调整原 Futu 来源测试按能力筛选日线绑定；文档沿原 Spec/Task/矩阵/Architecture/接入指南/CHANGELOG。

移除 Futu 分支后，已登记精确报价遇到错误 upstreamSource 会落入旧通用调用，故分发器增加按绑定事实拒绝的通用边界；新增测试断言上游零请求并保留 unsupported_source，没有重新加供应商分支。报价检查改传原标准证券代码，由现行分发器负责未迁移桥接；原 SDK、worker、公共 TS Schema、Server、用户配置/凭据与数据库未改。

准备正式 `sync-code.sh dsa`，只代码变化、依赖和数据库输入不变；目标核对原政策及四报价目录/配置，真实报价/日线若当前未被选择则保留消费验收缺口，不自动追加路线。全局目标仍为完成 H07–H12 及全部剩余门禁，K16 只是已完成子叶；下一来源叶继续核对 Futu 四项 SECURITY_STATIC_INFO 的现行强类型 wire 与内部能力合同，不将完成范围缩为报价。

本轮最终扩大验证命令为 §9.41 同一 59 文件命令，前置追加 `tests/test_thesis_ledger_futu_quote_capability_path.py`，输出改为 `/tmp/tl-cap-h07-futu-quote-regression-final.log`；命令参数、原 59 文件输入与排序均保持，其结果为 60 文件/920 通过/1 跳过。

<a id="record-9-44"></a>

## 9.44 报价正式目标对账与后续接缝（2026-10-11）

infra 实际 `rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-futu-quote-sync-dsa.log 2>&1'` 退出 0，兼容预检、宿主构建和 DSA healthy 通过；仅写层更新，镜像 ID 与 §9.41 相同，Server/Worker 未更新，三应用 healthy。静态只读 `docker exec -i -w /app -e PYTHONDONTWRITEBYTECODE=1 thesis-ledger-dev-dsa-1 python -` 断言原中央四报价项为空，目标注册 14 来源/81 绑定/140 目标、Futu 十二日线/四报价（`/tmp/tl-cap-h07-futu-quote-target-registry.json`）。

原 DsaClient 只读命令 `rtk proxy sh -c 'docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module - < /tmp/tl-cap-futu-quote-target-verify.mjs > /tmp/tl-cap-h07-futu-quote-target-state.json'` 退出 0，检查时间 `2026-10-10T20:25:00.837Z`。目录 integrity=complete/140，Futu 四报价均 ready；configVersion=1、enabled/credentialConfigured=true，已选 Futu 报价为 0。政策前后 revision/sourceDesiredRevision/requestId/enabled/routes 一致；再经原 Server GET 确认 84/84、applied、非 stale。只读脚本第一次比较整个动态 Effective 投影，因 appliedAt 每次读取生成观察时间而失败；核对实际返回后改为逐项核验全部政策身份/启用/路线，不把观察时钟当作用户政策版本，产品代码未因此改变。

当前没有保存 Futu 报价/日线路线，本轮未发真实行情请求；目录配置就绪不代替上游权限、数据时钟、目标业务消费或浏览器验收。没有临时政策/故障、凭据保存、来源启用变化、准入或 Ledger 写入，不提交/推送。H07/H08/H09 和 H10–H12 仍开放，完成全目标的授权边界保持。

下一接缝已核对：原 `futu_static_info.py` 的四目标资料只提供当前观察，精确正整数 securityId 保留为字符串，上市日/退市标志/每手缺失为未知、historicalChanges=unverified；原 Runtime 直接构造 static_info_operation，尚未绑定标准 QueryContract。后续叶先补齐该既有能力的内部强类型请求/结果、关联校验和无历史参数边界，复用原隔离读取器及 retryable 分类，再删除四条对应中央登记。不能将当前资料当历史 SECURITY_BASIC_DATES 或覆盖证明，不能提前宣称该叶已完成。

<a id="record-9-45"></a>

## 9.45 当前证券资料四目标启动与实际接缝（2026-10-11）

继续全目标 K17，工作树 1119/274/75，保留 WIP。核对实际调用链为 Runtime → `reference_data_operation` → 原 `futu_static_info.static_info_operation`，具体分派已在 `thesis_ledger_reference_data.py`，不是直接在 Runtime 追加分支。HTTP `api/thesis_ledger_static_info.py` 仍依赖 Futu 身份校验，DSA 当前无独立标准请求/结果 Schema；Server wire 保持现行合同。

Spec §13.16 先补齐标准请求/结果、关联校验和 retryable 传递。精确写集为新 `thesis_ledger_security_static_contract_v1.py`/`thesis_ledger_security_static_query.py`、来源 Futu 四项 QueryBinding、current_data_route 删除四项中央登记、reference_data/HTTP/probe 改消费标准合同、CapabilityContractError 增可选 retryable、新合同/执行测试及原只读检查有效结果 fixture。原 SDK/worker/静态读取器、Server、Schema、依赖、数据库和用户政策不改。先合同与四组实际工厂/Control/Runtime/worker/HTTP，校验精确整数/未知字段/类型和错误，再受影响门禁与库存等价，正式最小同步后分层记录目标与真实来源缺口。

当时状态记录：`[x]` H07-K17-futu-static-info：既有四项当前资料迁入独立强类型合同与标准处理器，原身份/整数/未知/释放/预算/错误保持，原 HTTP/probe 复用，删除旧对应登记，门禁及库存等价通过。目标与真实来源分层记录。

<a id="record-9-46"></a>

## 9.46 当前资料闭环、准入事实与最终本地门禁（2026-10-11）

首轮定向 3 失败/94 通过：QueryBinding 默认 gated=true 被 configured_data_route 解释为需要窗口准入，阻断了原按配置读取的静态资料。根因修复是在 QueryBinding 增可选 admission_required、静态资料显式 false，保留原目录 gated=true；None 保留其他存量行为，类型校验拒绝字符串。不是写入或放宽用户准入，原启用/凭据/依赖与前后控制核对继续执行。Spec §13.16 同步明确该内部边界。精确写集在 §9.45 基础上增 capability_registry、price_route_access；原 SDK 与解析器未改。

最终定向六文件 105 项通过（`/tmp/tl-cap-h07-futu-static-directed-final.log`），含四组合实际工厂/Control/Runtime/worker/HTTP、整数 `9007199254740993` 不丢精度、未知可选字段、当前观察/历史未核验、无历史参数、结果身份/资产/来源关联、第二来源同合同、超时 retryable=true 且只调用一次。原 probe 仅 Mock 返回值的两例改为真实合同形状与完整 kind=data 键，检查现校验结果，不再只检查调用成功。最终扩大 62 文件 955 项通过、1 项跳过、19 条既有依赖警告（`/tmp/tl-cap-h07-futu-static-regression-final.log`）。语法、critical flake8、能力边界通过（`/tmp/tl-cap-h07-futu-static-{syntax,gates,boundaries}.log`），命令沿 §9.40 同一入口，未提高阈值或增加 ignore。

库存 `/tmp/tl-cap-h07-futu-static-inventory-final.json` SHA256 `1e34fa0da65affa3745507adb6118f04ffe6faad823561f2695d78f9d6325631`：14 来源/85 绑定/140 目标、284 产品模块/290 DSA 输入/64 Server 消费文件，全部精确目标含 gated 与 §9.43 相同。Futu 十二日线/四报价/四当前资料，剩余每手能力原路径；当前观察不是历史 SECURITY_BASIC_DATES。文档仅原 Spec/Task/矩阵/Architecture 与 DSA 指南/CHANGELOG。新增两合同/执行测试文件；公共 TS Schema、Server/Worker、SDK、运行依赖、数据库、infra 脚本与用户政策未改。

最终扩大命令为 §9.43 的 60 文件命令，前置追加 `tests/test_thesis_ledger_security_static_contract.py tests/test_thesis_ledger_futu_static_capability_path.py`，输出改为 `/tmp/tl-cap-h07-futu-static-regression-final.log`，其余 60 文件及参数保持。接下来从 infra 正式 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa`；代码变化、依赖和数据库输入未变，仍需兼容预检。目标只读核对 85 绑定与四项资料目录、原配置和政策，当前未保存该能力路线，不自动新增或借用旧授权关闭真实消费验收。

<a id="record-9-47"></a>

## 9.47 当前资料正式目标对账与下一叶（2026-10-11）

infra `rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-futu-static-sync-dsa.log 2>&1'` 退出 0，兼容预检、宿主构建与 DSA healthy 通过。镜像 ID 仍同 §9.41，仅 DSA 写层更新；Server/Worker 未更新，三应用 healthy。原五个 Futu SDK/worker/读取器文件 SHA256 逐一与 §9.43 相同，未改变 SDK 行为、数据库/卷/依赖或部署入口。

只读目标注册 `docker exec -i -w /app -e PYTHONDONTWRITEBYTECODE=1 thesis-ledger-dev-dsa-1 python -`（经 RTK，静态导入与断言）核对 14 来源/85 绑定/140 目标、四项当前资料、query-only、目录 gated=true/准入要求 false、整数 ID Schema 为 string（`/tmp/tl-cap-h07-futu-static-target-registry.json`）。原 DsaClient 只读 `rtk proxy sh -c 'docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module - < /tmp/tl-cap-futu-static-target-verify.mjs > /tmp/tl-cap-h07-futu-static-target-state.json'` 退出 0，时间 `2026-10-10T20:41:08.873Z`：目录 integrity=complete/140，四资料项均 ready，实际已选该能力 0、Futu configVersion=1/启用/已配置保持；前后政策身份/启用/routes 深度一致，再经原 Server GET 为 84/84、applied、非 stale。

当前配置就绪不证明实际 SDK 资料、目标业务消费、历史变化或浏览器通过；本轮未发真实当前资料，不临时添加路线或写准入，真实消费仍未覆盖。H08 目标配置代次故障、H09-K2 新组合冻结、H10–H12 继续开放，全目标未完成。工作树最终 1119/278/75、三仓 diff --check 通过，保留 WIP，无提交/推送、凭据/启用变化或 Ledger 写入。

下一独立能力叶为 HK/STOCK/SECURITY_LOT_SIZE 的 Futu 与 Longbridge 两个既有目标：先核对原 reference_data/security_lot_size 的请求格式、当前参考/历史未核验、标准股单位、参考 ID、24h SDK 缓存、OAuth 工厂与错误；新增该能力标准合同后由两来源各自绑定，不能把手数参考当作无单位证据日线的量额换算。该能力当前已有 Futu 单主路由，可在迁移后保持原路线做必要只读真实验收，仍不能新增 Longbridge 路线或配置其账户。新临时政策/故障与研究语义仍需独立授权。

<a id="record-9-48"></a>

## 9.48 每手股数双来源启动（2026-10-11）

继续 K18，实际工作树 1119/278/75。现行 API → reference_data_operation → read_security_lot_size 中 Futu/LB 供应商分支；中央 current_data_route 两项登记。结果为 sharesPerLot 正整数字符串、historicalChanges=unverified、source/provider/URL/observedAt/sha256，原摘要仅绑定观察。Futu 缓存与隔离在 futu_lot_size.py；LB 700.HK 请求、HKEquity 校验和 _static_cache 观察时刻在通用供应商 helper，须归来源模块。原主备/无隐藏备用和 HTTP 测试保持。

Spec §13.17 先明确标准合同及当前参考边界。写集为新 security_lot_values/contract/query、原 security_lot_size 兼容导出/读取、Futu/LB 来源绑定/投影、current_data_route 删除两项、reference_data/API/probe 消费标准合同，以及合同/执行/缓存回归。SDK 工厂、Futu 隔离代码、LB SDK/OAuth、Server/TS Schema、依赖/数据库/用户政策不改。原参数中额外字段未消费，标准合同明确拒绝，不增加业务语义。先定向、受影响门禁和库存等价，正式同步后原 DsaClient.readSecurityLotSize 经已保存 Futu 路线读取 00700.HK；只读一次，不修改路由或保存凭据，失败保留真实错误，不追加重试。

当时状态记录：`[x]` H07-K18-security-lot-size：两来源复用标准当前参考合同，来源专有投影归模块、原工厂/缓存/时钟/摘要/错误与主备保持，旧对应登记删除；目标与真实来源分层记录。

<a id="record-9-49"></a>

## 9.49 每手双来源本地门禁及正式真实读取范围（2026-10-11）

定向六文件 97 项通过（`/tmp/tl-cap-h07-lot-directed.log`），最终扩大 65 文件 1010 项通过、1 项跳过、20 条既有警告（`/tmp/tl-cap-h07-lot-regression-final.log`）。包含原 SKU/HTTP 主备、无隐藏备用、Futu 实际工厂一次隔离请求后缓存返回同一观察、LB 实际工厂/700.HK/板块与缓存时间、legacy/OAuth/probe、当前资料及价格冻结输入回归；合同证明第三 providerId 可用同模型，不修改公共执行分支或供应商名单。值函数与摘要原行为逐项保持；额外未消费参数在标准合同明确拒绝。

语法、critical flake8、能力边界通过（`/tmp/tl-cap-h07-lot-{syntax,gates,boundaries}.log`），命令仍沿 §9.40 入口。库存 `/tmp/tl-cap-h07-lot-inventory-final.json` SHA256 `0f411f9fa8f908afe247e04f7c71d918eecf32fb07cacf561dda5b711713efaf`：14 来源/87 绑定/140 目标、287 产品模块/293 DSA 输入/64 Server 消费文件；全部精确目标含 gated 与 K17 相同。Futu 21 项当前产品精确能力均已来源绑定，LB 九项（日线八/每手一），其四报价仍独立后续叶，不以整源完成代替逐能力结论。

精确写集：新 `src/services/thesis_ledger_security_lot_{values,contract_v1,query}.py`、`data_provider/security_lot_size.py` 兼容导出与标准读取、Futu/LB 来源模块、current_data_route/reference_data/exact_probe_read/API reference_data；新 `tests/test_thesis_ledger_security_lot_contract.py`，原 Longbridge 日线测试按能力筛选。文档仅原 Spec/Task/矩阵/Architecture/DSA 指南/CHANGELOG。Futu SDK 隔离/缓存与 LB SDK/OAuth 实现、Server/TS Schema、依赖/数据库/infra 入口未改。

最终扩大命令为 §9.46 的 62 文件命令，前置追加 `tests/test_thesis_ledger_security_lot_contract.py tests/test_security_lot_size.py tests/test_security_lot_size_routes.py`，输出改为 `/tmp/tl-cap-h07-lot-regression-final.log`，其余文件与参数保持。继续 infra 正式最小 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa`，预检不能绕过。同步后核对原政策 84/84、HK/STOCK/SECURITY_LOT_SIZE 只有 Futu/routeIndex=0 且 eligible；通过原 DsaClient + `readSecurityLotSize` 调一次 00700.HK，再核对政策/启用/凭据版本，保留真实来源、sharesPerLot/observedAt/sha256 与历史未核验。失败不改路线或追加重试，不把当前观察当历史变化/价格资格。

<a id="record-9-50"></a>

## 9.50 每手正式同步与真实原路线读取（2026-10-11）

infra `rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-lot-sync-dsa.log 2>&1'` 退出 0，兼容预检、宿主构建及 DSA healthy 通过。仅 DSA 写层更新，镜像 ID 同 §9.41，Server/Worker 未更新，三应用 healthy；不改变数据库/卷/运行依赖。目标只读静态 `docker exec -i -w /app -e PYTHONDONTWRITEBYTECODE=1 thesis-ledger-dev-dsa-1 python -`（RTK，静态导入断言）确认中央每手登记为 0，14 来源/87 绑定/140 目标、LOT 两绑定、Futu 21/LB 九绑定/query-only（`/tmp/tl-cap-h07-lot-target-registry.json`）。

真实来源与目标消费：`rtk proxy sh -c 'docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module - < /tmp/tl-cap-lot-live-target.mjs > /tmp/tl-cap-h07-lot-live-target.json'` 退出 0。调用前核对原 Effective 84、HK/STOCK/SECURITY_LOT_SIZE 唯一 Futu/routeIndex=0/eligible、configVersion=1/启用/已配置，再经原 DsaClient + readSecurityLotSize → 原 DSA HTTP/Control/Runtime → 标准合同 → 原 Futu 静态隔离 SDK，一次读取 00700.HK。返回 sharesPerLot="100"、historicalChanges="unverified"、实际来源 Futu、原文档 URL，观察时间 `2026-10-10T20:55:17.850766+00:00`、规范化观察摘要 `2a0537ce0b8da0ea91637f60e4bbe72ed32c1e0fa3f7596aa4d96afd13c5b741`，policyRevision=84/routeIndex=0。最后核对政策身份/启用/routes 深度一致、Futu 配置/凭据状态不变；原 Server GET 为 84/84、applied、非 stale。没有追加重试或备用，没有临时政策、凭据保存、启用变更或准入/Ledger 写入。

该结果仅证明当前 Futu 每手参考的真实原路线闭环，不能证明历史变更、日线价格/成交量单位、LB 真实账户或未选择 Futu 日线/报价/资料消费。LB 仍未配置，未对其保存凭据或启用。浏览器、H08 目标配置代次故障/H09-K2 新组合冻结与 H10–H12 分别仍未完成。工作树 1119/282/75、三仓 diff --check 通过，无提交/推送。全目标仍 active，上一目标轮次是可验证代码/测试/目标状态进展。

下一来源叶为 Longbridge HK/US STOCK/ETF 四项已有报价：复用当前 QuoteBinding，核对 SDK 静态身份/价格读取/单位未知、来源时钟与旧 v2 修订、工厂缓存/OAuth/probe；保持原严格单源调用。其 disabled/未配置不是当前真实权限证明，不能自动配置或选路线。随后继续剩余当前来源能力和 H08–H12，不把 Futu 21 项代码登记完成解释成总任务完成。

<a id="record-9-51"></a>

## 9.51 Longbridge/Yahoo 报价两叶启动（2026-10-11）

继续 K19/K20，实际工作树 1119/282/75。原 SDK 的严格报价已提取到 exact_foreign_quotes：LB quote 单标证券校验，不调用静态资料或独立核验股票/ETF；Yahoo Ticker.get_info 校验代码及已提供 quoteType。原 quote_dispatch 先桥接证券并为 Yahoo 去 US 后缀，原字段/时间处理在 exact_quote_fields。只迁既有 LB 四目标与 Yahoo 七目标；Spec §13.18 先补内部 INDEX 与实际参数/错误/资格边界，不增加能力或真实账户承诺。

写集为两来源模块实际报价处理器/绑定、QuoteQuery INDEX、current_data_route 删除原四/七登记、quote_dispatch 删除对应供应商分支、来源测试及库存/SDK/全部报价回归。Shared Runtime/Schema/主 Task 串行处理，原 SDK/工厂/OAuth、Server、依赖/数据库与用户配置不改。先每组合实际工厂/Control/Runtime/SDK参数、原时钟/空/错配、禁止隐含备用及不匹配来源拒绝，再受影响门禁/库存等价；两叶合并正式最小 DSA 同步。LB 未配置/目标报价未选择时保留真实层缺口，不擅自选路线。

当时状态记录：`[x]` H07-K19-longbridge-quote：四既有报价标准绑定与实际投影，原代码/时钟/结果原型/空与错误保持，删除旧对应登记/供应商分支，工厂/OAuth 回归通过。真实层分开记录。
当时状态记录：`[x]` H07-K20-yahoo-quote：七既有报价（含 US INDEX）标准绑定与单响应校验，原代码/quoteType/未知与失败保持，删除旧对应登记/供应商分支，不为其他来源扩大指数资格。

<a id="record-9-52"></a>

## 9.52 十一报价目标本地闭环与最终门禁（2026-10-11）

定向五文件最终 71 项通过（`/tmp/tl-cap-h07-foreign-quote-directed-final.log`），十一组合经过实际工厂/Control/Runtime/原 exact_foreign_quotes SDK；港股转换仍 LB/Yahoo 0700.HK、ETF 2800.HK，CN .SS、美股去后缀、SPX→^GSPC 保持，原结果原型/时钟/未知与参数正确。第一轮 1 失败/70 通过是新测试将 adapter not_covered 当成最终错误；核对原 Runtime 仍将空结果汇总为 upstream_unavailable 后修正该层测试预期，没有改生产汇总或新增重试。SDK空/错配、OAuth/缓存/probe、股票/ETF/指数及所有已迁移接缝回归保持。

最终扩大 67 文件 1034 项通过、1 项跳过、20 条既有警告（`/tmp/tl-cap-h07-foreign-quote-regression-final.log`），命令为 §9.49 的 65 文件命令，前置追加 `tests/test_thesis_ledger_foreign_quote_capability_path.py tests/test_exact_foreign_quotes.py`、输出改为上述日志，其余参数/排序保持。语法/critical flake8/能力边界通过（`/tmp/tl-cap-h07-foreign-quote-{syntax,gates,boundaries}.log`），仍沿 §9.40 正式门禁入口。内部 INDEX 仅补现行类型；没有公共 TS Schema 或其他来源指数资格变更。

最终库存 `/tmp/tl-cap-h07-foreign-quote-inventory-final.json` SHA256 `6f41072868442167437b28d7ccce52fce21ca6849b40e7bda090b70814537b25`，14 来源/98 绑定/140 目标、287 产品模块/293 DSA 输入/64 Server 消费文件，全部精确目标含 gated 与 K18 相同。LB 13 项当前产品目标、Yahoo 16 项均已绑定；不等于其所有 SDK/权限已验证。精确写集沿 §9.51，新增一来源合同测试文件；原 Yahoo 日线测试按能力筛选。SDK/工厂/OAuth/Server/冻结消费者/依赖与用户配置未改，文档仅原六入口增量。

接下来合并正式 `sync-code.sh dsa`，只代码/目录变化、依赖和数据库不变，预检不能绕过。目标只读核对 98 绑定、十一报价目录及原政策/配置；先确认已有报价路由实际来源，未选择的来源不发业务查询，保留其真实消费缺口。新的政策/故障授权仍未取得，不擅自追加目标。

<a id="record-9-53"></a>

## 9.53 十一报价正式目标对账与剩余责任（2026-10-11）

infra `rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-foreign-quote-sync-dsa.log 2>&1'` 退出 0，兼容预检、宿主构建和 DSA healthy 通过；仅 DSA 写层更新、镜像同 §9.41，Server/Worker 未更新，三应用 healthy。原 Longbridge/Yahoo SDK、exact_foreign_quotes/exact_quote_fields、OAuth runtime/store/manager 的输入摘要逐一与 K18 相同，没有修改原 SDK 参数、数据或认证流程。

目标静态只读 `docker exec -i -w /app -e PYTHONDONTWRITEBYTECODE=1 thesis-ledger-dev-dsa-1 python -`（RTK，静态导入断言）确认中央两来源报价登记为 0，14 来源/98 绑定/140 目标、LB 13/Yahoo 16 绑定（`/tmp/tl-cap-h07-foreign-quote-target-registry.json`）。原 DsaClient 只读 `rtk proxy sh -c 'docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module - < /tmp/tl-cap-foreign-quote-target-verify.mjs > /tmp/tl-cap-h07-foreign-quote-target-state.json'` 退出 0，时间 `2026-10-10T21:08:38.273Z`。目录 integrity=complete/140、LB 四报价/Yahoo 七报价；实际选两来源报价路线 0，LB disabled/未配置/configVersion=0。前后政策身份/启用/routes 深度相同，原 Server GET 为 84/84、applied、非 stale。

本轮未发真实两来源报价，不自动添加路线或配置 LB；静态 SDK fixture、目标目录与真实消费分开，未知类型/时钟与真实权限不假装验证。Yahoo 原已选日线真实证据仍 §9.33，Futu 当前每手真实证据 §9.50，不能替代本叶报价。H08 目标故障、H09-K2 新组合冻结、浏览器及 H10–H12 保持开放，全目标未完成。三仓 diff --check 通过、保留 WIP，无提交/推送、政策/凭据/启用/准入或 Ledger 写入。

下一来源批先盘点余下已稳定报价（TickFlow/Tushare/Finnhub/AlphaVantage 的单标股票；AKShare/efinance/pytdx 的现行来源），按真实 SDK 字段/参数/错误固定切片后迁移。未实现或不具备单标能力的声明如实保留缺口，不制造接口成功或恢复高级 Quote 准入。随后继续净值/持仓/筹码/事件等原范围能力与 H08–H12；不把完成当前三家来源定义当成所有剩余任务完成。

<a id="record-9-54"></a>

## 9.54 四项单标股票报价启动与真实性盘点（2026-10-11）

工作树 1119/283/75。K21 迁 TickFlow/Tushare/Finnhub 三目标，原 native_quote 已提取，真实接口分别 quotes.get(symbols=[完整代码])/rt_k/strict HTTP quote，来源模块接收原投影并移除公共供应商分支。K22 迁 Alpha Vantage 一个 GLOBAL_QUOTE：原 SDK 缺 volume/价格字段默认 0、忽略响应证券，不能作为标准事实；Spec §13.19 明确产品来源适配层修正，原 SDK/原生分析不改，原 5s、sleep、strict 错误保持。实际适配修订升级 v2、sourceRevision 不伪造。该修复是收敛既定未知/身份合同，不放宽研究语义。

写集为四来源模块/原 native_quote 兼容入口、current_data_route 四登记、quote_dispatch 对应分支、新来源测试与相关旧日线测试按能力筛选；文档沿原入口。Factory/SDK、公共 TS Schema/Server/冻结消费者、依赖/数据库/用户配置不改。先真实工厂/Control/Runtime/接口参数/错误/空/零与未知，再受影响回归和库存等价，统一正式 DSA 同步。四来源未配置时不添加路线、保存凭据或宣称真实账户通过。

当时状态记录：`[x]` H07-K21-native-stock-quotes：三既有单标股票报价来源绑定，原预算/参数/时钟/错误/工厂保持，旧分支/对应登记删除。TickFlow 实际缺失修复单独升本地修订。
当时状态记录：`[x]` H07-K22-alphavantage-quote：单标标准投影校验真实身份、缺失与零，预算/错误/原工厂保持，本地适配修订与来源协议分别表达，不改 SDK 或旧冻结。

<a id="record-9-55"></a>

## 9.55 四报价闭环、错误检查根因与最终门禁（2026-10-11）

定向六文件通过（`/tmp/tl-cap-h07-four-quotes-directed-final.log`）；扩大首轮 9 失败/1037 通过/1 跳过：旧私有 _realtime_quote(adapter, provider, AAPL) 省略资产/来源，已迁路径没匹配绑定，退回普通 SDK 而漏掉 strict HTTP 分类；另一个草稿检查 fixture 仅有 close。根因修复为同一股票能力键存在唯一来源绑定时，按事实补齐省略参数，不加供应商分支/名单；草稿 fixture 补完整有效 OHLC/previousClose，健康状态/熔断未持久化的原断言保持。定向 probe/凭据五文件回归通过（`/tmp/tl-cap-h07-four-quotes-probe-regression.log`）；原 401/403/429/超时稳定分类及无凭据泄漏重新通过。

最终扩大 68 文件 1046 项通过、1 项跳过、20 条既有警告（`/tmp/tl-cap-h07-four-quotes-regression-final.log`），实际命令为 §9.52 的 67 文件命令前置追加 `tests/test_thesis_ledger_four_stock_quote_paths.py`、输出改为上述日志，其余参数/排序保持。原四来源日线、凭据/SDK工厂/缓存/其他报价/未来工作线输入读取回归覆盖，未修改生产阈值或增加 ignore。语法/critical flake8/能力边界通过（`/tmp/tl-cap-h07-four-quotes-{syntax,gates,boundaries}.log`），沿 §9.40 正式入口。

库存 `/tmp/tl-cap-h07-four-quotes-inventory-final.json` SHA256 `664e26e78d853097e92ae8cb7e8de106fa3800a7b7a2d2a399070198993fcc1a`，14 来源/102 绑定/140 目标、287 产品模块/293 DSA 输入/64 Server 消费文件，全部精确目标含 gated 与 K20 相同。TickFlow 与 Alpha 产品缺失修复为本地 quote adapterRevision v2，sourceRevision 仍 v1，其他旧修订保持。Alpha 实际符号校验/缺量/日级时间与 TickFlow 原原文量额缺失分别测试；实际零保留、非法数值拒绝，无新增源内重试/切源，原 SDK 原生分析不改。

精确写集沿 §9.54，新四报价测试，原 TickFlow/Tushare 日线测试按能力筛选，旧草稿检查 fixture 补有效结果；内部私有调用兼容按事实处理，Server/TS Schema/SDK/冻结版本/依赖/数据库/用户配置未改。指南/矩阵/Architecture 沿原文档更新，后续正式最小 DSA 同步、只读四来源配置/目录/政策核对；未配置或未选路线的真实层仍不勾选。

后续来源接缝初步核对：efinance 已有 get_realtime_quote_single_symbol，但仅 ETF 保证单标，股票仍转 get_realtime_quote 的失败后全市场路径；因此不能直接用方法名字宣称新合同。AKShare ETF 有独立 exact_etf_quote，股票三个来源仍需读取完整调用链；pytdx 的 get_realtime_quote 是独立单标读取。下一批固定真实接缝与缓存/缺字段，避开产品隐藏备用或以全市场掩盖失败，再迁各目标，不恢复高级资格。

<a id="record-9-56"></a>

## 9.56 四项股票报价正式同步与目标状态（2026-10-11）

infra `rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-four-quotes-sync-dsa.log 2>&1'` 退出 0，兼容预检、宿主构建和 DSA healthy 通过，仅 DSA 写层更新、镜像同 §9.41，Server/Worker 未更新、三应用 healthy。原四 Fetcher 与 TushareHistoryRequest 摘要逐一与 K20 相同；产品真实规范化修复位于来源模块，SDK 原生分析不变。无数据库/卷/运行依赖或部署入口变化。

目标静态只读 `docker exec -i -w /app -e PYTHONDONTWRITEBYTECODE=1 thesis-ledger-dev-dsa-1 python -`（RTK，静态导入断言）确认四中央报价登记为 0，14 来源/102 绑定/140 目标、四报价及 TickFlow/Alpha 本地 v2/原 source v1（`/tmp/tl-cap-h07-four-quotes-target-registry.json`）。原 DsaClient 只读 `rtk proxy sh -c 'docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module - < /tmp/tl-cap-four-quotes-target-verify.mjs > /tmp/tl-cap-h07-four-quotes-target-state.json'` 退出 0，时间 `2026-10-10T21:25:48.508Z`：目录 complete/140、四报价、已选这些报价路线 0；四来源均 disabled/未配置/configVersion=0。前后政策身份/启用/routes 深度一致，原 Server GET 为 84/84、applied、非 stale。

本轮未发真实四账户请求，不保存凭据、启用来源或新增路线。SDK/HTTP fixture、已配置目标目录和真实消费分别记录，未覆盖真实权限、配额、上游时钟或浏览器。新政策/故障仍需独立授权；H08/H09-K2/H10–H12 及剩余来源叶继续开放，不以定向测试关闭总目标。三仓 diff --check 通过、保留 WIP，无提交/推送、准入或 Ledger 写入。下一叶沿 §9.55 已盘点接缝推进 efinance 单标股票/ETF 与 pytdx，再处理 AKShare 的各真实来源边界，不合并成未核验全源重写。

<a id="record-9-57"></a>

## 9.57 沪深四报价目标启动与精确迁移范围（2026-10-11）

工作树核对 1119/284/75，保留 WIP。K23 范围 efinance CN STOCK/ETF 两项和 pytdx CN STOCK 一项；K24 仅 AKShare CN ETF/eastmoney 一项。efinance 单证券快照已有原代码/结果校验及全局 TTL 缓存、限流，股票包装仍可能回全市场；pytdx 原 get_realtime_quote 忽略响应身份且缺字段默认零，适配器必须读取同一原单标接缝后校验，不能把旧默认当事实。AKShare ETF 原 helper 已有明确交易所/代码/4.5s/错误，直接复用。

Spec §13.20 先明确原主成功接口/缓存/SDK不变与产品真实边界修复，efinance 股票、pytdx 本地 adapterRevision v2，原 sourceRevision 不伪造。写集为三来源模块四 QuoteBinding/实际读投影、current_data_route 四登记、quote_dispatch 对应特判、来源回归与真实接口/缓存测试；工厂、SDK原生分析、公共 Schema/Server、依赖/数据库/用户政策不改。先实际工厂/Control/Runtime/接口形状及错误/缺失/释放、旧主备回归，再门禁和库存等价；正式同步后只对已保存的就绪报价路线做一次只读，未选择能力不添加目标。

当时状态记录：`[x]` H07-K23-efinance-pytdx-quotes：三既有报价标准绑定，efinance 股票单标失败不走原生全市场，pytdx 校验身份/缺失，缓存/单位未知/错误与原工厂保持。
当时状态记录：`[x]` H07-K24-akshare-etf-quote：既有 ETF/eastmoney 单标接口标准绑定，原参数/证券交易所/预算/错误/未知保持，旧对应分支与登记删除。

#### 本地实现与回归记录

四项已沿原 Control/Runtime/QuoteBinding 执行。精确写集：`data_provider/thesis_ledger_sources/{efinance,pytdx,akshare}.py`、`src/services/thesis_ledger_{current_data_route,quote_dispatch}.py`、新 `tests/test_thesis_ledger_cn_quote_paths.py`、原 `test_native_exact_daily.py`/`test_thesis_ledger_provider_runtime.py`；文档仍为原 Spec/Task/矩阵/Architecture 与 DSA 指南/CHANGELOG。原 SDK、工厂、公共 TS Schema/Server、运行依赖、数据库、infra 入口与用户政策未改。

首轮扩大回归三失败/1066 通过：两例旧夹具仍调用迁移前的 get_realtime_quote，已改为 pytdx 原始字典/session 和 efinance 原单标快照；一例暴露 efinance TimeoutError 被改为 timeout，已恢复原 transient_failure，原断言保持。ETF 二次请求仍受 request_budget_cooldown 约束，不改冷却或扩大预算。修复定向两文件 30 项通过（`/tmp/tl-cap-h07-cn-quotes-repair.log`）。最终扩大 70 文件 1069 项通过、1 项跳过、20 条既有警告（`/tmp/tl-cap-h07-cn-quotes-regression-final.log`）；命令为 §9.55 的 68 文件命令前置追加 `tests/test_thesis_ledger_cn_quote_paths.py tests/test_efinance_realtime_quote.py`，输出改为上述日志，其余参数保持。

语法/critical flake8/能力边界全部通过（`/tmp/tl-cap-h07-cn-quotes-{syntax,gates,boundaries}.log`），实际入口同 §9.40。库存 `/tmp/tl-cap-h07-cn-quotes-inventory-final.json` SHA256 `7edbcd4d64dca46ac0933108f77c2e60f7ada781973baf96ee0a4d261c86925c`：14 来源/106 绑定/140 目标、287 产品模块/293 DSA 输入/64 Server 消费文件；排序后的全部精确目标对象含 gated 与 K22 相同，新增绑定导致导出次序变化。原 efinance/pytdx SDK 输入摘要逐项相同。efinance 股票和 pytdx 的本地适配修订 v2，sourceRevision 保持；目录不新增用户路由。

下一步以 infra 正式最小 dsa 快更同步并核对现有政策/目标目录；只读调用仅限已保存且就绪的本批报价路线，未选或未配置能力保留真实来源缺口。其后盘点 AKShare 股票三个真实接口并建立下一叶，不将本地通过代替 H08/H09-K2/H10–H12。

#### 目标部署与只读核对

infra 实际 `rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-cn-quotes-sync-dsa.log 2>&1'` 退出 0，兼容预检/构建/DSA healthy 通过；仅可写层更新，DSA 镜像仍 `0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`，Server/Worker 未更新、三应用 healthy。只读目标静态导入核对四绑定唯一、原中央登记为零、140 目标（`/tmp/tl-cap-h07-cn-quotes-target-registry.json`）。

原 DsaClient 只读 `rtk proxy sh -c 'docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module - < /tmp/tl-cap-cn-quotes-target-verify.mjs > /tmp/tl-cap-h07-cn-quotes-target-state.json'` 退出 0，`2026-10-10T21:44:58.955Z`；目录 complete/140、本批四报价存在，三来源 enabled=true/configVersion=0/无凭据（原无凭据来源）。前后有效政策身份/启用/routes 完全相同，revision/sourceDesiredRevision=84。已选本批报价路线为零，未发真实上游请求；目标静态/目录通过不代替权限、配额、真实行情或浏览器验收。K23/K24 仅实现叶完成，H08/H09-K2/H10–H12 继续开放。

<a id="record-9-58"></a>

## 9.58 AKShare 股票 Eastmoney/Tencent 精确报价迁移（H07-K25）

A01 核对真实 `get_realtime_quote`：按代码自动切 ETF/HK，股票按 source 分派并先检查 circuit breaker。Eastmoney `_get_stock_realtime_quote_em` 原市场快照/TTL 缓存，失效最多两次 `stock_zh_a_spot_em` 加原退避，按代码选行；Tencent `_get_stock_realtime_quote_tencent` 原 requests.get/10s、verified_quote_fields 身份检查、量额投影、来源时钟（volume 启发式口径选择不证明单位已核验）；均保留原 None/熔断错误语义。一次适配调用不等于一次 SDK/HTTP 或市场快照内部页数。Sina 原引号解析缺少对应响应身份校验，暂保留原路径，另立后续叶。

精确范围仅 CN/STOCK 两项报价（akshare/eastmoney、akshare/tencent），来源模块直接拥有两处理器和原熔断前置；避免代码自动改走 ETF 接口，明确资产代码不匹配。写集：akshare 来源模块、current_data_route 两登记、新实际工厂/快照缓存/HTTP 字段/身份/失败次数测试，必要旧夹具接缝更新；Spec §13.21 先声明。SDK/原生分析、公共 Runtime/Schema/Server、依赖/配置/冻结消费者不改。验证实际 Runtime/Control 与定向主备后，扩大原回归/门禁/库存，正式最小 dsa 同步，再只读检查现有政策。未选路线不追加，新的临时政策/故障注入仍需独立授权。

当时状态记录：`[x]` H07-K25-akshare-stock-em-tencent：两既有来源报价标准绑定、源内缓存/有界次数/单位/时钟保持，原登记移除。
当时状态记录：`[x]` H07-K26-akshare-stock-sina：响应身份/参数边界收口后迁移，保留原 SDK 原生分析与错误边界，不能把输入代码当上游身份凭据。

#### K25 本地实现里程碑

定向五文件 83 项通过（`/tmp/tl-cap-h07-akshare-stock-directed-final.log`）；初轮三失败：两例旧夹具仍用通用 get_realtime_quote，已转原股票接口；实际 Eastmoney 快照夹具缺昨收与涨跌额，被现行 previousClose 合同拒绝，补充同次来源明确涨跌额后验证原推导，未放宽合同。最终扩大 71 文件 1077 项通过、1 项跳过、20 条既有警告（`/tmp/tl-cap-h07-akshare-stock-regression-final.log`），命令为 §9.57 的 70 文件命令前置追加 `tests/test_thesis_ledger_akshare_stock_quote_paths.py`，仅替换日志名。语法/critical flake8/能力边界通过（`/tmp/tl-cap-h07-akshare-stock-{syntax,gates,boundaries}.log`），入口同 §9.40。

库存 `/tmp/tl-cap-h07-akshare-stock-inventory-final.json` SHA256 `d6c6cb0a42a5a3a9a3617db31934e87fd02b4bfd80858a5648aa789a628a903b`：14 来源/108 绑定/140 目标，排序后精确目标含 gated 与 K24 相同，akshare_fetcher.py 摘要相同。实际工厂测试证明 Eastmoney 同两次查询一快照调用，失败两次 SDK/退避 2s、4s 后失败缓存命中不请求；SDK 内部市场分页未导出。Tencent 响应头/正文错配均只有一次 HTTP 后拒绝，原 10s、量额投影/来源时钟保持。SDK volume 的启发式值不等于单位已证明，后续消费者不应据此新增单位资格。

K25 本地里程碑已可复用，目标同步待同一来源的 K26 验证后合并为一次正式 dsa 快更，当前勾选仍保留。Sina 只收口原 HTTP/10s/限流/熔断与相同字段解析，但来源适配器必须核对唯一 `var hq_str_<symbol>` 响应封套和至少 32 字段；原 SDK 原生分析保持。HTTP/异常/空结果仍对应原不可用语义，身份错配/多响应按 invalid_response；本地适配修订 v2、上游不变，不新增源内重试或切源，旧来源时钟未知保持。写集限制在 AKShare 来源模块、current_data_route 一登记、quote_dispatch 剩余对应分支、K25 测试文件增新浪真实 HTTP/错误/缺失/隔离及接入文档。先定向、再受影响回归/门禁/库存，目标按原政策只读核对，真实读取仍只限已选路线。

#### K26 实现、兼容探测与验证

Sina 来源处理器使用原工厂/HTTP 参数与限流/熔断，响应身份和结构分别校验；缺量额/实际零/时钟未知与单次调用均验证。初轮定向仅旧 smoke 一失败：原无 RouteTarget 检查默认 Sina 不能由多绑定唯一推导。Spec §13.22 先明确内部 QuoteBinding.legacy_probe_default，来源声明 Sina=true，注册拒绝非 bool 或同一来源/Key 多默认；通用分发只读取该事实，不增加供应商分支或用户路线。旧 smoke 测试改为真实 HTTP 封套，并保留 native symbol/source 断言及原日线检查。

最终定向六文件 96 项通过（`/tmp/tl-cap-h07-akshare-sina-directed-final.log`）；报价合同/时钟/未知和旧 SDK 回退日志四文件 48 项通过（`/tmp/tl-cap-h07-akshare-quote-wire.log`）；注册和库存元数据测试通过（`/tmp/tl-cap-h07-akshare-sina-metadata.log`）。最终扩大 75 文件 1136 项通过、1 项跳过、21 条既有依赖警告（`/tmp/tl-cap-h07-akshare-sina-regression-final.log`）：命令为 K25 的 71 文件命令前置追加 `tests/test_thesis_ledger_contract.py tests/test_thesis_ledger_quote_time.py tests/test_thesis_ledger_quote_values.py tests/test_realtime_quote_fallback_logging.py`，仅替换日志名。语法/critical flake8/能力边界均通过（`/tmp/tl-cap-h07-akshare-sina-{syntax,gates,boundaries}.log`），入口同 §9.40。

库存 `/tmp/tl-cap-h07-akshare-sina-inventory-final.json` SHA256 `9b1c3fbac3e63931543ba66e75a0c4e15b721a70586397c1fb6d2af3501a5d2c`：14 来源/109 绑定/140 目标、287 产品模块/293 DSA 输入/64 Server 消费文件；全部排序精确目标含 gated 与 K24 相同，AKShare 原 SDK 摘要未变。K26 精确写集在 K25 基础上增加 capability_registry 的强类型旧探测默认事实、quote_dispatch 的通用默认读取及 AKShare 分支删除、注册/原 smoke 测试、只读库存 exporter 的该元数据投影；公共 Runtime/TS Schema/Server、原 SDK、冻结、依赖和用户设置未改。

下一步 K25/K26 合并一次正式最小 dsa 快更，核对目标静态注册、原 DsaClient 目录/政策/Provider 配置和已选路线；不为真实消费主动新增报价政策。之后继续 HiThink 两项已稳定报价接缝、其余净值/持仓/筹码/事件能力，以及 H08/H09-K2/H10–H12，当前实现统计不能替代最终验收。

#### K25/K26 目标部署与未覆盖层级

infra `rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-akshare-quotes-sync-dsa.log 2>&1'` 退出 0；兼容/空间/构建预检、DSA healthy 通过，镜像仍 `0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`，仅 DSA 可写层更新，Server/Worker 不变，三应用 healthy。目标静态只读导入验证 AKShare 四报价/其中三股票绑定唯一、旧中央登记为零、Sina 旧探测默认唯一、query-only、14 来源/109 绑定/140 目标（`/tmp/tl-cap-h07-akshare-quotes-target-registry.json`）。

原 DsaClient 只读脚本同 §9.57，输出 `/tmp/tl-cap-h07-akshare-quotes-target-state.json`，`2026-10-10T22:01:52.710Z`；目录 complete/140、三来源共七报价目标、原 Provider enabled/configVersion=0 保持，前后有效政策身份/启用/routes 深度相同、84/84。已选这些报价路线零，未发真实上游请求，真实行情/权限/配额/浏览器仍未覆盖。没有临时政策/故障注入、凭据/准入或 Ledger 写入；新政策仍需独立授权。原 Spec/Task、矩阵/Architecture/DSA 指南与 CHANGELOG 已按实际实现更新，矩阵总表从当前只读绑定刷新。

三仓 diff --check 通过，工作树状态计数 1119/286/75，保留未提交和未跟踪修改，无提交/推送。Futu 五个原 SDK 输入（daily/market/lot_size/query_worker/static_info）摘要逐项与 K22 库存相同，当前仍十二日线/共 21 个来源绑定；复用此前隔离进程、4.5s、完整分页/释放与错误证据，一次执行完整响应和 SDK 内部页数的边界未改，不因后续报价迁移重新定义统计或关闭真实日线消费缺口。

<a id="record-9-59"></a>

## 9.59 HiThink 两项报价的接缝盘点与下一执行叶（H07-K27）

A01 实际调用链：两个旧报价登记实际在 hithink_quote_admission._QUOTE_REVISIONS（STOCK/a-share-prices-snapshot 与 ETF/fund-market-snapshot），并由 exact_route_inventory 独立枚举；不在 current_data_route 表中；quote_dispatch 的 HiThink 分支直接调用 HiThinkSnapshotAdapter.fetch_quote，并在公共分发把字典转为标准属性对象。SDK 已拥有 URL/凭据参数/4.5s/单标身份/数值/OHLC/单位/来源与抓取时钟，HiThinkQuoteError 有 retryable。原 _call_first 在当前政策/目录与凭据检查中核对 quote_guard，同次使用 guard.snapshot 的 apiKey 创建快照适配器，调用后再次核对；这个凭据及配置资格一致性不能丢失。

现行来源工厂只返回股票日线 get_market_bars_v3 代理，不能只加 QuoteBinding 后声称报价已跑通。精确迁移需在来源模块拥有报价适配器工厂和结果投影，并把同一已核对 snapshot 传入现行工厂；原 Runtime 的手工 SDK 构造分支可收敛到已有 _adapter(..., market_v3_route_key=...)，保留全部政策/目录/凭据前后核对、预算、健康与一次切源责任。其他已迁移报价的工厂缓存路径不改；HiThink 原 ETF 日线和分红路径不混入本叶。

当时状态记录：`[x]` H07-K27-hithink-quotes：两项标准报价绑定及原工厂/错误/单位/时钟/Guard 快照闭环，移除对应旧登记与 SDK 分发。

下一叶写集：HiThink 来源模块、hithink_quote_admission 原修订表及 exact_route_inventory 的独立枚举、quote_dispatch 对应 SDK 分支及标准错误 retryable 转换、Runtime 原报价 SDK 构造片段、HiThink 实际工厂/政策与凭据代次/一调用/错误/结果合同测试和原六文档；公共文件串行、修改前重读并核对摘要。先在原 Spec 明确这些兼容不变量，再写代码，不能借此变更当前配置读取资格、恢复专业 Quote 高级任务或修改研究口径。验证从 HiThink quote/runtime/旧 admission 兼容 与注册测试开始，再既有日线/报价/控制/凭据/缓存/冻结输入回归及正式门禁。目标同步只用 infra 正式入口；只读验收限实际已选就绪目标，新增政策/故障单独授权。H08/H09-K2/H10–H12 与其余能力继续未勾选，不转 TODO。

补充核对：现行 Guard 不读取人工准入记录，已有真实 runtime/HTTP 测试证明撤销旧记录后仍按当前配置执行；本叶保留此行为及 late-state not_admitted 原错误码，不恢复旧高级准入。旧 hithink_quote_revisions/iter_hithink_quote_routes 保留兼容接口但从绑定派生，库存删除独立第二枚举。其他来源 Quote 的工厂缓存入口不改；仅在原 quote_guard 非空分支，将同一快照和精确数据 Key 传入现行 _adapter 工厂。源码 ratchet 通过移除原手工 SDK 构造片段保持，不能扩充 Runtime 供应商分支。

#### K27 本地实现与验证

精确写集：HiThink 来源模块增加两个 QuoteBinding、工厂报价入口与标准投影；hithink_quote_admission 删除 _QUOTE_REVISIONS、兼容 helper 从绑定派生；exact_route_inventory 删除第二枚举；quote_dispatch 移除最后供应商 SDK 分支/透传、通用保留 retryable；Runtime 仅原手工构造处改用 Guard.snapshot 和精确 Key 的 _adapter，文件行数减少；新 `tests/test_thesis_ledger_hithink_quote_capability_path.py`，能力边界门禁固化目录去重、公共报价不可 SDK 透传及 Runtime 不重建旧构造。原 SDK/Guard、TS Schema/Server、依赖/数据库/infra 入口、其他报价工厂缓存及用户设置未改。

初次定向五文件 80 项通过；最终含新实际工厂路径六文件 92 项通过（`/tmp/tl-cap-h07-hithink-quotes-directed-final.log`）。实际 Runtime/Control 无人工准入，Source 工厂/原 SDK 只构造一次、发出一次 HTTP，原 thscode/thscodes、API 头、4.5s/no redirect、字段/单位/抓取和来源时钟保持；原 SDK HTTP503 重试标志与响应身份错误分类不变。政策或凭据在 HTTP 中变更，使用原快照请求并拒绝晚到结果。注册/库存/门禁接缝组 34 项通过（`/tmp/tl-cap-h07-hithink-quotes-seam-check.log`）。

最终扩大 79 文件 1206 项通过、1 项跳过、21 条既有警告（`/tmp/tl-cap-h07-hithink-quotes-regression-final.log`），命令为 §9.58 的 75 文件命令前置追加 `tests/test_thesis_ledger_hithink_quote_capability_path.py tests/test_thesis_ledger_hithink_quote.py tests/test_thesis_ledger_hithink_quote_runtime.py tests/test_thesis_ledger_hithink_quote_admission.py`，仅替换日志名。语法/critical flake8/能力边界全部通过（`/tmp/tl-cap-h07-hithink-quotes-{syntax,gates,boundaries}.log`），入口同 §9.40，未增加 ignore 或改阈值。

库存 `/tmp/tl-cap-h07-hithink-quotes-inventory-final.json` SHA256 `7242189622602e4b249c0d98bc1f517bdf18543dac9e715a38a3a42cca42c7c8`：14 来源/111 绑定/140 目标、287 产品模块/293 DSA 输入/64 Server 消费文件；全部排序精确目标含 gated 与 K26 相同，HiThink 原 quote/stock SDK 摘要未变，原报价修订逐一相同。所有现行报价已经来源绑定；这不表示真实权限/覆盖/消费全通过，也不表示净值/持仓/筹码/事件或 H08–H12 已完成。

下一步正式最小 dsa 快更并核对目标静态绑定、目录/政策/当前配置及已选报价路线。未选能力不新增路线或发请求，新的临时政策和故障注入单独授权。其后读取净值现行调用链形成下一准确叶，不以当前单标报价收口代替总目标。

#### K27 正式目标与真实来源读取

infra 实际 `rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-hithink-quotes-sync-dsa.log 2>&1'` 退出 0，兼容/空间/构建预检与 DSA healthy 通过；镜像仍 `0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`，仅写层更新，Server/Worker 不变。目标静态只读断言两绑定唯一、旧 helper 派生修订、query-only、14 来源/111 绑定/140 目标（`/tmp/tl-cap-h07-hithink-quotes-target-registry.json`）。

原 DsaClient 只读目录/政策/Provider 脚本 `/tmp/tl-cap-hithink-quotes-target-verify.mjs`，输出 `/tmp/tl-cap-h07-hithink-quotes-target-state.json`，`2026-10-10T22:21:59.309Z`；完整目录 140，当前两报价路线均已保存 HiThink 单目标/eligible，Provider enabled/credentialConfigured=true/configVersion=5，前后政策身份/routes 相同，84/84。没有追加路线或故障注入。

按已保存路线，通过原 Server 的 DsaClient.get（attempts=1）与原消费者 parseCurrentQuote，各读取一次 600519.SH/STOCK 和 510300.SH/ETF；命令 `rtk proxy sh -c 'docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module - < /tmp/tl-cap-hithink-quotes-live.mjs > /tmp/tl-cap-h07-hithink-quotes-live.json'` 退出 0。`2026-10-10T22:23:20.952Z` 两响应均通过现行 Quote Schema 与证券/来源/无备用校验：价格 1263、4.385，实际来源分别 a-share-prices-snapshot/fund-market-snapshot，STOCK 原股/CNY 单位、ETF 原量额未知保持。前后政策 84 与 Provider configVersion=5/启用/凭据状态完全相同。未修改 Ledger、准入、凭据或用户政策，未发额外重试。

本次覆盖原 Server 客户端/解析器→目标 DSA 原 Runtime/Source 工厂→真实 HiThink；没有覆盖浏览器或 MarketQuoteReader 的 Redis 缓存/并发层，不能替代 H08/H10。原 SDK 响应源时间分别为 2026-10-10T22:23:18Z/22:23:20Z、旧接口 freshness=live；它们是来源报告时钟，本次未证明其代表交易所最后成交时间、最后交易日或交易时钟精度，不能把周末返回推定为持续交易。报价时钟语义及消费者要求仍须在 H08/C 边界核对，不改变旧结果以消除该差异。

<a id="record-9-60"></a>

## 9.60 净值下一叶的真实接缝盘点（H07-K28/K29）

A01 当前仅 akshare/eastmoney 与 efinance/eastmoney 两来源，各已有 FUND_NAV 和 FUND_NAV_HISTORY，登记仍在 current_data_route。Runtime 两分支都调用 _fund_nav_from_provider→adapter.get_fund_nav_history，再进行日期/正数/重复/历史升序校验、select_nav_rows；FUND_NAV 取最大日期，历史先按原来源日期日段过滤、后取最后 limit 行。API _real_fund_nav/_real_fund_nav_history 再识别中文/英文列名并序列化 UTC 时间；净值日期不是公告可见时间，SDK 字段差异仍透入当前处理器，须在迁移时收口。

真实 SDK：AKShare get_fund_nav_history 只调用 fund_open_fund_info_em(symbol=<六位代码>, indicator=单位净值走势)；EF get_fund_nav_history 调用现有 Eastmoney read_fund_nav，再进行稳定日期排序，异常保留 DataFetchError。Eastmoney 原证据 Reader 为 55s 总预算、最多 100 页、每页 1000、100000 行、4MiB 单页/32MiB 总量、有界分块流读取、TLS、总量/页长度/重复/未来估值日期校验，完整整批后才发布；单次适配执行不等于上游页数。read_fund_nav 的旧四列投影不暴露原文页统计。不得为使用统一默认 4.5s 改写这个既有读取器或压缩页数，也不能由另一个 wrapper 冒充独立上游。

拆分为两个能力叶，避免把新契约、两能力和 API 迁移打包为一个不可验证步骤：

当时状态记录：`[x]` H07-K28-fund-nav：首次标准化已有最新净值能力，建立强类型请求/结果与 Schema/关联校验、小型处理器和两来源绑定；来源拥有 SDK 列名投影及基金代码转换，Runtime/API 只消费标准模型，FUND_NAV_HISTORY 保留原路径。
当时状态记录：`[x]` H07-K29-fund-nav-history：依赖 K28 的点模型/日期边界里程碑，建立独立历史请求与序列合同、窗口/limit/单调唯一校验及两绑定；保留完整来源校验后截窗/限量与原 SDK 排序/预算/分页/错误，公共 API 形状保持，旧历史路径退役。

下一执行 K28：先在原 Spec 记录估值日期、UTC 兼容序列化、未知公告可见时间、正净值与来源关联、原预算/分页与当前配置读取（不新增准入）不变量。写集为能力所有的 NAV 点/最新请求结果合同和处理器、adapter 内 Eastmoney NAV 字段投影、AKShare/EF 来源模块两个 FUND_NAV 绑定、current_data_route 两行、Runtime 最新分支及 API 最新响应、实际工厂/两种 SDK 输入/日期/错误/完整读取/主备/标准 HTTP 测试；历史 API/SDK、RawEvidence 与冻结研究模型不改。源码 ratchet 通过移除最新分支/列名解析职责收敛，不能加公共供应商分支或仅注册不执行。定向验证入口复用 nav_dates/nav_production/nav_rules/eastmoney_fund_nav/eastmoney_nav_evidence、原 Runtime/控制/注册和新的最新能力合同测试，再受影响门禁；真实源/目标/浏览器/冻结层分别记录。共享 Runtime/Task/目录串行，修改前重新核对现行文件，新政策/故障仍独立授权。

#### K28 最新净值实现与本地门禁

精确写集：新 `src/services/thesis_ledger_fund_nav_contract_v1.py`（请求/点/结果及 Schema/关联）、`thesis_ledger_fund_nav_query.py`（原执行器处理器/未来日期边界）、`data_provider/eastmoney_nav_projection.py`（两 SDK 列名/数值/日期投影）；AKShare/EF 来源模块两个 QueryBinding，current_data_route 对应两行退役，Runtime 最新分支与 API 最新响应改用标准模型、代码规模减少；current_data_execution 最新日期检查使用标准报告估值日。历史能力路径、SDK、55s Reader、RawEvidence、TS Schema/Server、研究/冻结模型、运行依赖及用户政策未改。标准结果明确 identity_basis=request_bound/publication_visibility=unverified，不从无身份回显的 SDK 表格推定独立核验或公告时间；实例重新校验防止 model_copy 篡改数值绕过 Schema。

初轮定向 8 失败/160 通过：两例旧最新值夹具/断言仍依赖 DataFrame；一处通用日期边界仍寻找供应商列名，已按标准点报告估值日保留未来日期拒绝。另六个精确 NAV 研究测试的旧 _CatalogStore 只有 akshare/tencent/efinance，缺已登记的十个 ungated 状态能力所属 baostock/official-states，完整目录故为 partial；SDK 日期/最新绑定本身没有 manifest 错配或重复。仅完善测试夹具，所需 Provider 从当前 ungated 库存派生，不放宽生产目录门禁、准入或研究合同。新 HTTP 测试首次路径误写，核对实际路由后改用原 /thesis-ledger/market/fund-nav。最终定向九文件 186 项通过（`/tmp/tl-cap-h07-nav-latest-directed-final.log`）。

实际工厂证明 AKShare 单次原 SDK symbol/indicator、中文列名与非升序最新选择；EF 一次逻辑读取/两真实模拟 HTTP 页，完整原 Reader 后才能取最新，坏第二页不发布首个最新点；全来源坏历史行、重复日期、非法数值、未知参数零数据请求、来源/基金身份关联和新 provider 同合同扩展分别覆盖，原 HTTP 字段集合保持。原 SDK 日期偏移的时间顺序测试改为标准模型夹具，保留原数值/UTC 断言；完整历史、研究原文/日历/准入回归仍单独执行。

最终扩大 87 文件 1390 项通过、1 项跳过、22 条既有警告（`/tmp/tl-cap-h07-nav-latest-regression-final.log`），命令为 §9.59 的 79 文件命令前置追加 `tests/test_thesis_ledger_fund_nav_capability_path.py tests/test_thesis_ledger_nav_dates.py tests/test_thesis_ledger_nav_production.py tests/test_thesis_ledger_nav_rules.py tests/test_eastmoney_fund_nav.py tests/test_eastmoney_nav_evidence.py tests/test_thesis_ledger_nav_calendar.py tests/test_nav_research_admission.py`，仅替换日志名。语法/critical flake8/能力边界全部通过（`/tmp/tl-cap-h07-nav-latest-{syntax,gates,boundaries}.log`），入口同 §9.40。

库存 `/tmp/tl-cap-h07-nav-latest-inventory-final.json` SHA256 `bb0f7e0f98d52da9fb3834b0fb6499c645c1989d902408ddef91bda7676e994a`：14 来源/113 绑定/140 目标、290 产品模块/296 DSA 输入/64 Server 消费文件；全部排序目标含 gated 与 K27 相同。AKShare/EF SDK、eastmoney_fund_nav/eastmoney_nav_evidence 摘要逐项未变，保留原修订。目标快更、当前路由/真实消费、浏览器与冻结分别继续记录，不用本地通过关闭后续层级。

#### K28 正式目标与独立层级记录

infra `rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-nav-latest-sync-dsa.log 2>&1'` 退出 0，兼容/空间/构建预检和 DSA healthy 通过；仅 DSA 写层更新，镜像仍 `0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`，Server/Worker 不变。目标静态只读确认最新两绑定唯一、原中央两登记为零、gated=true/人工准入要求 false、历史尚未迁移、14 来源/113 绑定/140 目标（`/tmp/tl-cap-h07-nav-latest-target-registry.json`）。

原 DsaClient 只读目录/政策/Provider 脚本 `/tmp/tl-cap-nav-latest-target-verify.mjs` 输出 `/tmp/tl-cap-h07-nav-latest-target-state.json`，`2026-10-10T22:54:56.324Z`；完整目录 140、两最新目标均 ready，EF/AK enabled=true/configVersion=0、无凭据来源状态保持，前后有效政策身份/启用/routes 深度相同，84/84。已保存 FUND_NAV 路线零，未发真实上游请求或添加政策；真实来源、消费者缓存、浏览器与冻结层级仍未覆盖。K28 勾选仅其实现与目标登记叶完成，不关闭 H08/H09-K2/H10–H12，也不修改现有净值研究准入或冻结状态。

下一执行 K29 的精确补充：原 REST 历史默认 limit=365、允许 1–3650；内部现行请求允许 None 或正整数，不为框架统一擅自降低这个上限。完整 SDK 序列先严格升序/唯一/正数校验，再按原报告估值日窗口过滤、取最后 limit 行，并保留现行未来估值日拒绝；旧 API 仍有 UTC 日期时间边界过滤，偏移日期测试需覆盖，不能用新日期编码改变旧窗口/限量顺序。复用 K28 点模型与 adapter 投影但建立独立 HistoryRequest/HistoryResult 合同及两绑定；SDK/55s/RawEvidence 与 NAV 精确研究协议继续原路径。迁移写集仅标准历史处理器/序列合同、源模块两个历史绑定、current_data_route 两行、Runtime 历史分支与普通 API 历史输出/日期边界及对应测试；生产 NAV 研究/日历/准入只回归，不重写。先 Spec 明确兼容，再实际执行；新政策/故障仍单独授权。

<a id="record-9-61"></a>

## 9.61 普通净值历史实现与标准错误边界（H07-K29）

Spec §13.25 先明确独立历史请求、严格完整序列校验、报告日截窗/取尾/UTC API 顺序及精确研究独立。写集：新 `thesis_ledger_fund_nav_history_contract_v1.py`/`thesis_ledger_fund_nav_history_query.py`、原 Eastmoney adapter 投影增加历史序列处理、两来源模块历史绑定、current_data_route 两行删除、Runtime/普通 API 历史分支与 current_data_execution 日期边界标准化；新 `test_thesis_ledger_fund_nav_history_capability_path.py`，原 nav_dates/provider_runtime/configured_market_routes 按标准结果调整夹具与断言。原 SDK/55s分页/RawEvidence、精确 NAV 研究/日历/准入/冻结、TS Schema/Server、依赖/用户配置未改。现行 exact_probe_read/provider_smoke 仍为独立旧 SDK 诊断，后续叶收敛，不能宣称已完成所有消费者。

初轮定向三失败/183 通过：UTC API 测试夹具仍给 DataFrame、两 Runtime 测试仍 monkeypatch 已不执行的旧 _fund_nav_from_provider，已转实际 SDK 方法夹具，保留全部原数值/主备一调用/严格升序断言。修复后暴露 CapabilityContractError 继承 ValueError，最新/历史处理器的请求捕获误分类来源 invalid_response；根因修复为请求验证独立 try、注册执行只捕获 CapabilityContractError，SDK ValueError 原样进入原 Runtime 分类。新测试分别证明上游坏结果仍 invalid_response、两能力 SDK 原始 ValueError 不标为参数错误；不改原 SDK 解析或错误表。

最终定向十文件 202 项通过（`/tmp/tl-cap-h07-nav-history-directed-final.log`）；扩大首轮仅 configured_market_routes 一例旧 DataFrame 下标断言失败/1405 通过，改为标准报告日/净值相同值断言，修复定向两文件通过（`/tmp/tl-cap-h07-nav-history-fixture-repair.log`）。最终扩大 88 文件 1406 项通过、1 项跳过、22 条既有警告（`/tmp/tl-cap-h07-nav-history-regression-final.log`），命令为 §9.60 的 87 文件命令前置追加 `tests/test_thesis_ledger_fund_nav_history_capability_path.py`，仅替换日志名。语法/critical flake8/能力边界通过（`/tmp/tl-cap-h07-nav-history-{syntax,gates,boundaries}.log`），入口同 §9.40。

实际工厂验证 AK 原参数/原输入、EF 两模拟 HTTP 页与稳定排序；坏未选中行/重复/倒序先拒绝后截窗，窗口/limit/未知参数前置校验，3650/None 请求保持。UTC 偏移兼容例证明先取尾两点、再 UTC 过滤，仅输出其中一条，不从被截掉更早点补齐。Schema 再校验篡改实例，来源/身份/窗口/限量关联分别受约束。旧精确 NAV 原文/研究协议/日历/准入组继续通过，未放宽研究消费。

库存 `/tmp/tl-cap-h07-nav-history-inventory-final.json` SHA256 `25aabdb4e77abcbc512eff49c46559c9b4aa7037d6e62e80406feb4bf442a9c4`：14 来源/115 绑定/140 目标、292 产品模块/298 DSA 输入/64 Server 消费文件；全部排序目标含 gated 与 K28 相同，四个 SDK/RawEvidence 输入摘要未变，原修订保持。下一步正式最小 dsa 快更与目标目录/已选路线只读核对，不自动追加政策；真实源/目标/浏览器/冻结层级分别保留。通过后下一可执行叶为普通 NAV 诊断与兼容 SDK helper 的职责收敛，保留原 probe 只读/样本范围与缓存隔离。

#### K29 目标登记与当前路由核对

infra 实际 `rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-nav-history-sync-dsa.log 2>&1'` 退出 0；兼容/空间/构建预检和 DSA healthy 通过，镜像仍 `0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`，仅 DSA 写层更新，Server/Worker 不变。目标静态只读核对两历史绑定唯一/Query-only/gated=true/admission_required=false、旧中央登记为零、115 绑定/140 目标与原3650请求支持（`/tmp/tl-cap-h07-nav-history-target-registry.json`）。

原 DsaClient 只读 `/tmp/tl-cap-nav-history-target-verify.mjs`，输出 `/tmp/tl-cap-h07-nav-history-target-state.json`，`2026-10-10T23:10:29.994Z`；完整目录140、两历史目标均 ready，EF/AK启用/configVersion=0/无凭据来源状态保持，前后政策身份/启用/routes深度相同，84/84。当前保存历史路线零，未发真实上游请求或追加策略；实现叶完成不代替真实源、缓存、浏览器和冻结验收，H08/H09-K2/H10–H12 继续开放。未改 Ledger、凭据或人工准入，未提交/推送。

<a id="record-9-62"></a>

## 9.62 普通 NAV 诊断接缝与消费者职责收敛（H07-K30）

A01：生产最新/普通历史两能力已经标准结果，但 exact_probe_read 的 NAV 分支仍直接 _fund_nav_from_provider，并由 bound_nav_dates/Runtime._validate_fund_nav(_history)识别SDK列名；provider_smoke 也直接调用同一旧SDK兼容方法。exact_probe_read 初始为全部能力创建带 interactive_chart 参数的日线式请求，不能直接拿它调用 NAV 合同。其NAV旧样本窗口是 probe_sample 的前七日至今天，检查接口返回该窗口；smoke 不要求该窗口。原 bound_nav_dates 仅这些诊断仍使用，生产普通读已不走它。

当时状态记录：`[x]` H07-K30-nav-diagnostics：诊断复用最新/历史合同及同一源绑定，保留原 probe 只读、cache=false、样本窗口/观察与工厂上下文；退役诊断执行对SDK列名/Frame的公共依赖。

下一叶先在 Spec 明确 probe 请求按能力构造（NAV不带日线参数）；最新能力从完整来源校验取最新标准点后检查原样本日范围，历史用完整校验后标准窗口查询。smoke 原无RouteTarget场景只能从绑定事实确定唯一该Provider/能力/MUTUAL_FUND来源，不能增加供应商默认列表或更改用户路由。迁移写集为 exact_probe_read/provider_smoke 的两个能力分支、小型标准诊断处理器与必要旧兼容函数退役、真实工厂/Scope/原SDK预算/单调用/空窗口/日期错误/不污染正常缓存和不写政策凭据准入的隔离测试；公共 Runtime/目录/Task 串行。SDK、原文、精确NAV研究/冻结不改。测试先定向 NAV/diagnostic/probe/current routes，再受影响组和边界门禁；目标可读目录不代替真实来源检查，新政策/故障仍单独授权。

#### K30 实现与本地验证

Spec §13.26 明确标准诊断/生命周期与样本范围。实际写集：新 `thesis_ledger_nav_diagnostics.py`，exact_probe_read/provider_smoke 两能力用标准绑定；NAV 最新/历史结果增可选 source_reported_end 与 ISO/一致性校验，Eastmoney 适配器在选择前从实际所有行派生此最大报告日，诊断保留整源未来日拒绝（历史窗口外未来行也不隐藏），不作为连续覆盖/PIT证明。NAV probe 使用原通用 _adapter(cache=false,probe=true) 工厂入口，避免 route 工厂分支复用已有正常缓存对象，实际工厂测试确认两实例/正常缓存版本不变。旧 Runtime._fund_nav_from_provider/_validate_fund_nav(_history)、current_data_execution.bound_nav_dates、无调用的 select_nav_rows 退役；源列名只在适配器。原日期/边界测试转标准 adapter/合同，不减数值/重复/顺序断言。能力门禁固化这些旧公共执行方法不能恢复。

初轮定向只有日期测试局部重复 import 造成先调用后绑定的 UnboundLocalError，移除重复后通过（`/tmp/tl-cap-h07-nav-diagnostics-directed-repair.log`）。新实际诊断组覆盖两能力真实工厂一次 SDK调用、不替换正常缓存/版本、不改政策/凭据/准入、原样本范围、窗口外未来日期/空样本拒绝、无路线 smoke 唯一绑定、完整来源最大报告日与截窗不同；原 smoke 健康记录保持。最终七文件 81 项通过（`/tmp/tl-cap-h07-nav-diagnostics-directed-final.log`）。SDK、RawEvidence、研究冻结、公共 API、其他能力与运行依赖未改。

最终扩大 90 文件 1419 项通过、1 项跳过、22 条既有警告（`/tmp/tl-cap-h07-nav-diagnostics-regression-final.log`），命令为 §9.61 的 88 文件命令前置追加 `tests/test_thesis_ledger_nav_diagnostics.py tests/test_thesis_ledger_consumer_boundary.py`，仅替换日志名。语法/critical flake8/能力边界通过（`/tmp/tl-cap-h07-nav-diagnostics-{syntax,gates,boundaries}.log`），入口同 §9.40。边界脚本后增加原方法退役守卫，仅该边界再次通过，不重跑未变的 SDK 高成本检查。

库存 `/tmp/tl-cap-h07-nav-diagnostics-inventory-final.json` SHA256 `a50fc6356f4cec380b5a936c87716ded3017dd8d181274ee1e993e5d957f4e74`：14 来源/115 绑定/140 目标、293 产品模块/299 DSA 输入/64 Server 消费文件；全部排序目标含 gated 与 K29 相同，未新增生产能力或来源路线。下一步正式最小 dsa 同步与静态目标/原目录政策核对，真实诊断未用隔离 SDK 测试替代，当前没有普通 NAV 路线时不额外读取。后续来源能力仍按原范围推进，不关闭 H08/H09-K2/H10–H12。

#### K30 正式目标与层级核对

infra 实际 `rtk proxy sh -c 'env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa > /tmp/tl-cap-h07-nav-diagnostics-sync-dsa.log 2>&1'` 退出0；兼容/空间/构建预检与 DSA healthy 通过，镜像仍 `0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`，仅DSA写层更新、Server/Worker不变，三应用healthy。静态只读目标断言旧 Runtime NAV SDK/列名方法及 bound_nav_dates 均不存在、两标准结果包含源报告日上界、14来源/115绑定/140目标（`/tmp/tl-cap-h07-nav-diagnostics-target-registry.json`）。

原 DsaClient 只读沿 §9.61 目录脚本，输出 `/tmp/tl-cap-h07-nav-diagnostics-target-state.json`，`2026-10-10T23:27:13.415Z`；目录完整、84/84，前后有效政策身份/启用/routes深度相同，EF/AK enabled/configVersion=0保持，当前普通历史路线零。没有新增策略、触发真实来源诊断或改变凭据/准入；当前目标静态与隔离诊断通过不能替代浏览器、真实诊断或 H09 组合冻结。H08/H09-K2/H10–H12 与剩余来源叶继续开放，不转 TODO；未提交/推送。

<a id="record-9-63"></a>

## 9.63 基金持仓单目标迁移接缝盘点（H07-K31）

A01：现行 FUND_HOLDINGS 仅 akshare/eastmoney、CN/MUTUAL_FUND，current_data_route 一条登记；Runtime _fund_holdings_from_provider 去 .OF 后调用 SDK get_fund_holdings，再 _validate_fund_holdings 解析 SDK列名。AKShare SDK已调用 data_provider/fund_holdings_source.read_recent_fund_holdings，按上海当前年及上一年最多两次 fund_portfolio_hold_em(symbol,date)；只有空结果才读上一年，非空错年/坏合同立即拒绝，不是供应商备用切换。holding_period/validate_holding_rows 验证唯一报告期、代码/名称、单季度重复、原百分比0–100与合计<=100.0001。

实际 API 已从 _real_fund_holdings 提取 _fund_holdings_payload，不能按旧文件布局假设函数未提取。该 payload 仍解析四中文列、选最大季度，标准证券代码、百分比/100、按权重降序/代码排序，不归一权重，合计<=1.000001，disclosureDate=None；evidenceVersion 使用原 holdings JSON sort_keys 的 SHA256。SDK的 attrs 中 sourceEndpoint/sourceQueryYear/sourceObservedAt 是来源观察事实，不能当公告可见时间或作为业务DTO。精确语义以原 tests/test_fund_holdings_source.py、test_fund_holdings_disclosure_time.py、test_thesis_ledger_holding_rows.py 及 Runtime/API 回归为准。

当时状态记录：`[x]` H07-K31-fund-holdings：单既有能力建立标准请求/持仓结果/Schema/处理器并来源绑定，字段/季度/明确百分比转换归适配器；保留原空年份回看、错误、观察与原输出/摘要。目标同步与真实消费层另记本节，不由本地通过推定。

下一执行先 Spec 明确当前报告查询、基金/持仓身份、份额权重、披露日未知与观察、旧摘要算法/排序、完整序列先校验再取最新季度；无新年份参数或研究假设。写集：小型持仓能力合同/处理器、来源适配投影与 AKShare绑定、current_data_route 一行、Runtime/现有 payload 的必要消费接缝、实际工厂/两年份空结果/非空错误/权重/季度/日期/摘要/API/同合同第二来源隔离测试；SDK、原文研究/冻结、公共TS Schema、依赖与用户路由不改。先定向、受影响组/边界/正式门禁，再最小dsa同步和原已选目标只读验收。新政策/故障独立授权，未选能力不追加路线。

实际写集：DSA 新增 `thesis_ledger_fund_identity_v1.py`、`thesis_ledger_fund_holdings_contract_v1.py`、`thesis_ledger_fund_holdings_query.py`、`data_provider/eastmoney_holdings_projection.py` 与 `test_thesis_ledger_fund_holdings_capability_path.py`；增量修改 `fund_nav_contract_v1` 的身份函数引用、AKShare 来源绑定、`current_data_route` 一条旧登记、Runtime 原业务分派及 API `_fund_holdings_payload`；调整持仓日期、原行校验、Runtime 测试的实际标准消费接缝。原 `akshare_fetcher.py` 和 `fund_holdings_source.py` 输入摘要与 K30 相同。仅空当前年回看上一年、非空坏数据不回看、最新季度/排序/摘要、百分比除100且不归一、披露未知均保持。API 不再解析中文列或 attrs；诊断旧路径留给 K32。

验证：八文件定向 `89 passed, 4 warnings`（`/tmp/tl-cap-h07-holdings-directed-final.log`）；K30 的90文件加持仓四文件，共94文件受影响组 `1459 passed, 1 skipped, 22 warnings`（`/tmp/tl-cap-h07-holdings-regression-final.log`）。命令为 `.venv/bin/python -m pytest -q` 加上述文件组；完整命令沿既有90文件组增量追加，持仓四文件是 `test_thesis_ledger_fund_holdings_capability_path.py`、`test_fund_holdings_source.py`、`test_fund_holdings_disclosure_time.py`、`test_thesis_ledger_holding_rows.py`。`PATH="$PWD/.venv/bin:$PATH" ./scripts/ci_gate.sh syntax`、`flake8` 及 `.venv/bin/python scripts/check_thesis_ledger_capability_boundaries.py` 均通过，日志分别为 `/tmp/tl-cap-h07-holdings-{syntax,gates,boundaries}.log`。库存导出 `/tmp/tl-cap-h07-holdings-inventory-final.json` SHA256 `85116d72ec04d9d5919de4da955eb05e43710e0c9125751ec1979a3a0dadd965`：14来源、116绑定、140目标、297模块、303DSA输入。排序比较完整目标对象与 K30 相同，新增一绑定/删除一旧登记，没有双执行。第二来源仅隔离测试使用不同结构 basisPoints 输入，未进入生产目录。合同覆盖参数隔离、完整原行验证、毒化模型重新校验、单/双SDK调用与旧 HTTP 消费。

K31 目标层：从 infra 执行 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa`，退出0且 dsa healthy，镜像保持原值；仅容器可写层更新，日志 `/tmp/tl-cap-h07-holdings-sync-dsa.log`。原 DsaClient 只读校验完整目录140目标，FUND_HOLDINGS唯一 ready 目标 akshare/eastmoney；当前未选择此路由，未追加政策、未进行真实持仓消费。政策前后84/84、AKShare启用/configVersion0一致，证据 `/tmp/tl-cap-h07-holdings-target-state.json`。真实 SDK、目标消费、浏览器、研究/冻结仍各自保留缺口。

<a id="record-9-64"></a>

## 9.64 基金持仓诊断收口接缝（H07-K32）

A01：当前精确 probe 与 smoke 仍调用 Runtime `_fund_holdings_from_provider` 后 `_validate_fund_holdings`；只有两个诊断消费者和原行校验测试仍引用。它们解析 SDK 中文列而正常业务查询已使用标准模型。精确 probe 当前缓存禁用但带 RouteKey 会复用来源路由工厂；应沿 NAV 已验证接缝，先建立独立原工厂，再标准绑定读取，不进入用户路由/保存准入。样本000001.OF、持仓无日期参数、summary只含symbol。smoke 正常健康记录保持，草稿凭据不得保存健康或凭据。

当时状态记录：`[x]` H07-K32-holdings-diagnostics：诊断消费同一标准合同/绑定，删除 Runtime 原 SDK 持仓方法/列名校验并固化边界；实际工厂、缓存隔离、错误、草稿和无路由诊断测试通过后做受影响门禁与最小目标同步。

精确写集：新增能力专有小型诊断处理器；修改 exact_probe_read、provider_smoke、Runtime 两退役方法/一个 import、对应测试、边界门禁；原 SDK/年度回看不改，公共 Schema/业务研究不改。验证先实际工厂定向，再K31受影响组增量、syntax/flake8/边界/库存；目标仅正式快更与只读目录/导入检查，未选路由不替代真实消费。

实际新增 `thesis_ledger_holdings_diagnostics.py` 和九项诊断测试，修改上述五接缝及原行校验测试。定向五文件71通过/2warnings，K31的94文件加诊断一文件，共95文件1468通过/1skip/22warnings；日志 `/tmp/tl-cap-h07-holdings-diagnostics-{directed-final,regression-final}.log`。初跑两失败暴露 SDK 投影前 ValueError 边界；确认原源码 smoke 分类 upstream_failure、直接 probe 留给原外层分类，测试据此明确保持，不修改错误代码或新增回看。投影错误仍由合同输出 invalid_response。无新供应商公共分支；不修改 SDK/年度读取。

相同 syntax、flake8、边界三命令退出0（`/tmp/tl-cap-h07-holdings-diagnostics-{syntax,gates,boundaries}.log`）；库存导出 SHA256 `38ed43cc4cf8c3f0cc971bc38881489d091901060e3e108e7dc881cc6d477c4c`，14来源/116绑定/140目标/298模块/304DSA输入。完整精确目标排序等价；两个 SDK 文件摘要相同。公共TS/冻结未改，复用其未变输入既有门禁，不以这些本地/目录证据替代实际持仓消费。

K32目标层：正式 `sync-code.sh dsa` 退出0/healthy，镜像保持原值，日志 `/tmp/tl-cap-h07-holdings-diagnostics-sync-dsa.log`；只读导入确认14来源/116绑定/140目标、唯一持仓标准合同绑定、Runtime两个旧方法不存在。原DsaClient目录/政策前后84/84、AKShare启用/config0、无已选持仓路由保持，证据 `/tmp/tl-cap-h07-holdings-diagnostics-target-{registry,state}.json`。未调用真实持仓上游或保存政策。下一叶为K33筹码摘要；H08/H09及实际来源/目标消费/浏览器未因本叶勾选而关闭。

<a id="record-9-65"></a>

## 9.65 筹码摘要两目标迁移接缝（H07-K33）

A01：current_data_route仅两项 CN/STOCK/CHIP_SUMMARY：akshare/eastmoney（akshare-stock-chip-em-v1 / akshare-stock-cyq-em-v1）、tushare/tushare（tushare-stock-chip-v1 / tushare-cyq-chips-v1）。Runtime普通查询/精确probe/smoke解析原 ChipDistribution，API `_real_chip` 仍 getattr SDK字段与比例猜测。AK原SDK读取stock_cyq_em并取最后行，保留限流/UA/异常返回None；Tushare先原19点交易日选择、cyq_chips，非空再daily，同原算法计算/四位舍入，工厂与凭据不变。这是两种估算算法，不代表交易所逐笔持仓事实或跨源等价。安装版AKShare算法benefitPart=below/totalChips、concentration=(high-low)/(high+low)；本地Tushare compute_cyq_metrics最终获利/集中度均除100。因此当前SDK输出均为0–1比例，不需按大于1猜单位。价格为原CN报价单位，报告日不是发布/最后交易时刻。

当时状态记录：`[x]` H07-K33-chip-summary：两来源绑定同一强类型估算摘要合同/处理器，来源适配拥有字段、身份、单位与报告日，业务消费删除SDK DTO/比例猜测；保留原SDK算法、调用条件、None错误、原输出和工厂缓存；诊断同合同。

精确写集：新标准合同/处理器和两来源适配、来源模块两绑定、central两登记、Runtime/现API/诊断接缝及合同/真实工厂隔离测试。先标准和SDK调用回归，再K32受影响组增量、syntax/flake8/边界/库存，最后正式最小dsa快更与已选路由只读核对。SDK/模型算法、公共TS、冻结/研究/依赖、账户政策不改；methodology明确两个来源估算而非等价，缺报告时钟保留未知，旧API观察回显不充当来源发布证明。

实际新增 `src/services/thesis_ledger_chip_summary_contract_v1.py`、`thesis_ledger_chip_summary_query.py`、`data_provider/chip_summary_projection.py` 和 `tests/test_thesis_ledger_chip_capability_path.py`；来源akshare/tushare各新增一精确绑定，central删除两登记，Runtime删除原SDK方法读取/校验，API删除SDK字段/比例猜测，精确probe/smoke改标准读取并保留独立工厂。边界门禁禁止旧 `_validate_chip_summary` 复活。四份当前架构/接入/矩阵/Changelog同步实际实现，SDK两文件摘要与K32相同。

六文件定向96通过/4warnings：`.venv/bin/python -m pytest -q tests/test_thesis_ledger_chip_capability_path.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_contract.py tests/test_thesis_ledger_capability_registry.py tests/test_chip_distribution_manager.py tests/test_chip_structure_fallback.py`。K32的95文件加这三新增/原生筹码测试，共98文件1518通过/1skip/22warnings（`/tmp/tl-cap-h07-chip-{directed-final,regression-final}.log`）；API删除已无调用的比例helper后重跑定向仍96通过。工厂测试核对AK一次数据SDK调用，Tushare日历/cyq/daily最多三个接口调用、cyq空时不读daily、30s原工厂预算/禁止重定向/原算法四位舍入；环境HMAC快照缓存，控制快照无有效revision原本不缓存，不修改缓存策略。两次初跑暴露测试对控制快照缓存的错误假设，沿真实源码补环境/控制两类断言后通过。

syntax、flake8、能力边界（原三命令）均退出0，日志 `/tmp/tl-cap-h07-chip-{syntax,gates,boundaries}.log`。库存 `/tmp/tl-cap-h07-chip-inventory-final.json` SHA256 `b9eca1264f0d395f2a5f561e8f66486ac04a35b35f3c60e3f1d378e3c4328bf8`：14来源/118绑定/140目标/301模块/307DSA输入；完整精确目标排序与K32等价，SDK摘要相同；新增绑定是替换原登记，没有扩产品目标或改来源修订。API日期回显不代表发布/最后交易时刻，标准报告日期缺失保留None；实际SDK已知比例超出1、错误身份、非有限值、逆区间/坏日期拒绝，不靠猜单位放行。H08/H09、真实来源/目标消费/浏览器仍分别保留。

K33目标层：infra正式 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa` 退出0/healthy，镜像保持原值，仅容器可写层，日志 `/tmp/tl-cap-h07-chip-sync-dsa.log`。只读目标导入确认14来源/118绑定/140目标、两筹码标准合同绑定、Runtime原校验不存在（`/tmp/tl-cap-h07-chip-target-registry.json`）。原DsaClient目录/政策前后84/84：AKShare ready且启用/config0，Tushare credential_missing且未启用/config0，均无已选筹码路由（`/tmp/tl-cap-h07-chip-target-state.json`）。未新增政策/凭据/准入，未进行真实筹码查询；SDK隔离测试不能替代实源/目标消费/浏览器。当前未迁移精确目标22个，H07总叶和H08–H12保持开放。工作树当前1119/314/75项，不清理无关WIP。

<a id="record-9-66"></a>

## 9.66 专用 ETF 日线迁移接缝（H07-K34）

下一叶A01已沿真实调用核对，而非假设旧文件名。剩余日线为HiThink ETF qfq / fund-market-historical及Tushare ETF none / tushare。旧事实分别留在 `thesis_ledger_market_v3_adapters._GATED_ROUTE_ADJUSTMENTS` 和 `market_v3_revisions._MARKET_V3_ADAPTER_REVISIONS`；现执行器 `thesis_ledger_exact_bar_execution.execute_exact_bar` 已优先标准binding，但对两个专用路径仍有供应商分支。HiThink Runtime `_fetch_hithink_etf_bars` 使用本地listing/calendar、冻结credential snapshot、原有界ETF接口及历史交易状态投影，真实volume/turnover单位仍unknown；交互读取已提取 `thesis_ledger_hithink_interactive_daily`。不能将其按普通股票日线机械投影。

Tushare `get_daily_data_for_source` 实际定义在 `data_provider/tushare_exact_daily.py::TushareExactDailyMixin`，由 `tushare_fetcher`继承，不在Fetcher正文。该方法原4.5s调用 `fetch_tushare_fund_daily`，保留366日分段、完整校验、fundDailyRetrieval partitions和实际partition数量，不能用一次适配执行覆盖为pagesFetched=1。原执行器针对ETF先校验源分页证据再返回；迁移需让来源拥有传输验证，复用已存在 `DailyBinding.verify_transport`，公共执行器只消费标准完整性/数量事实，不能删除检查。现 `market_pagination_proof_v3` 内仍含 `_tushare_partition_count`，需按真正来源所有权移动/复用而非降级。

当时状态记录：`[x]` H07-K34-special-etf-daily：分开完成Tushare ETF与HiThink ETF来源绑定/工厂/修订事实迁移，保留原分页、范围、单位、原文/计算/准入与交互合同；公共Runtime/执行器供应商分派随实际迁移增量收口。

拟精确写集：两个来源模块与其能力适配、`exact_bar_execution` / `market_v3_adapters` / `market_v3_revisions` / 分页事实的必要绑定派生接缝，HiThink Runtime旧ETF helper依赖按来源所有权迁移，原Tushare ExactDailyMixin/分页算法和原HiThinkETF接口行为保持。先盘点 `test_thesis_ledger_tushare_mapped_read.py`、HiThinkETF/交互/分页及完整价格/冻结回归，再限定每子叶。公共Schema/原冻结/研究模型/用户路由/工厂凭据不改；共享Runtime/目录串行写，新的政策或故障注入继续单独授权。

K34第一子叶已限定Tushare ETF。原分页校验函数完整读取：检查fundDailyRetrieval endpoint/adjustment/partitionComplete、未验证交易日覆盖、原量额单位，1–32分段及366日边界、行数/64位摘要/总revision。迁移到来源专有 `data_provider/tushare_fund_transport.py` 后仍完整执行；来源处理器还核对原完整分页头部，不能被通用执行器重写修复。原 `market_pagination_proof_v3` 的Tushare协议分支删除，改按binding.verify_transport；unique单一none组合保持旧调用省略adjustment兼容，腾讯多口径省略继续拒绝。

当时状态记录：`[x]` H07-K34a-tushare-etf：一精确绑定替换三中央事实，原SDK工厂/基金日线入口、4.5s、完整分段、单位与错误不改；公共执行器删除TushareETF特判，验证真实工厂及损坏证明/半窗/迟到/权限回归。

K34a实际写集：新增 `data_provider/tushare_fund_transport.py` 及 `test_thesis_ledger_tushare_etf_binding.py`；来源Tushare新增ETF一个binding，`market_v3_adapters`/`market_v3_revisions`/`market_v3_facts`分别删除旧登记/修订/协议特判；`market_v3_pagination`用标准binding传输验证并删除原来源DTO解析，`exact_bar_execution`删除TushareETF特判。原股票测试仅限定股票修订断言，ETF原修订由新测试独立核对。SDKFetcher/ExactDailyMixin/基金日线读取三文件SHA256与K33相同。实际SDK请求仍fund_daily完整窗口，参数保留完整证券身份，错误交易所输入零网络请求。

七文件定向154通过/3warnings：`.venv/bin/python -m pytest -q tests/test_thesis_ledger_tushare_etf_binding.py tests/test_thesis_ledger_tushare_capability_path.py tests/test_tushare_exact_daily.py tests/test_tushare_fund_daily.py tests/test_thesis_ledger_market_v3_pagination.py tests/test_thesis_ledger_tushare_mapped_read.py tests/test_thesis_ledger_capability_registry.py`（`/tmp/tl-cap-h07-tushare-etf-directed-final.log`）。K33的98文件新增binding一文件，共99文件，最终1535通过/1skip/22warnings（`/tmp/tl-cap-h07-tushare-etf-regression-final.log`）。初跑1534通过/1失败为原股票修订循环未限定asset，已修正范围并单独证明ETF修订，未放宽断言或门禁。坏完整头部/源分段不会被公共执行器覆写为成功；一次适配/两个SDK分段在原Runtime实际工厂闭环验证。迟到、半窗、权限、限流、凭据和原映射回归保留。

原三命令syntax/flake8/能力边界均退出0，日志 `/tmp/tl-cap-h07-tushare-etf-{syntax,gates,boundaries}.log`，输入为最终生产源码；随后仅测试范围修复，生产源码未变。库存 `/tmp/tl-cap-h07-tushare-etf-inventory-final.json` SHA256 `c8151d8086242d0212de0873b80788bfa0215bdfb1e7b54262a8d7a1f8416d2c`：14来源/119绑定/140目标/302模块/308DSA输入，完整目标排序与K33等价。原Spec补§13.30，架构/接入/矩阵/Changelog只描述已实现范围；目标同步与实源/消费层另记，不由本地结果推定。

K34a目标层：infra正式 `sync-code.sh dsa` 退出0/healthy，镜像保持原值，日志 `/tmp/tl-cap-h07-tushare-etf-sync-dsa.log`。只读导入确认14来源/119绑定/140目标，传输验证归 `data_provider.tushare_fund_transport`，三中央事实已删除；目标目录Tushare ETF none唯一、原barQuery协议保持，政策前后84/84，Tushare未启用/无凭据/config0、无已选路线，证据 `/tmp/tl-cap-h07-tushare-etf-target-{registry,state}.json`。未实源读取、未保存用户政策/准入或凭据，未将本地验证替代实源消费。

K34b已补真实接缝：HiThink源工厂目前仅股票日线/报价，Runtime旧ETF closure承担来源编排；ETF qfq标准绑定后，应让来源工厂按能力资产选择原股票/ETF读取，删除Runtime专属分派/helper。交互 `thesis_ledger_hithink_interactive_daily` 当前反向导入Runtime错误，需将原协议读取放回来源适配并让旧服务薄投影错误保持兼容，绑定直接消费来源错误。精确probe也改走已有标准执行，而非另存HiThink供应商路径。原完整ETF读取仍使用本地calendar/listing及现有接口，不新增覆盖假设；稀疏历史交易投影保持。注意bar series的volume/turnover未知字段与既有独立field-unit合同是不同层；后者已有fund-unit/CNY核验版本，必须原样保留，不能因前者未知删除既有单位证明。

当时状态记录：`[x]` H07-K34b-hithink-etf：一个qfq目标绑定原专用读取，来源拥有工厂/请求元信息/错误，删除中央登记/Runtime特判并保留交互/稀疏/单位/修订/凭据代次；定向、受影响、边界与目标分层验收。

精确写集：HiThink来源模块、能力专有ETF适配及交互读取；标准DailyBinding可选来源请求元信息、CapabilityContractError可选原诊断；Runtime旧ETF helper/分派退役、精确执行错误投影、probe标准入口、旧交互服务兼容投影、facts/目录/修订从同绑定派生；原ETF SDK及单位/稀疏helper不改。测试修订原注入接缝并新增来源合同/实际入口/错误诊断/交互和工厂隔离回归。共享文件串行；账户政策/原冻结/研究条件不改。

K34b实际新增 `data_provider/hithink_etf_capability.py`、`data_provider/hithink_interactive_daily.py` 与 `tests/test_thesis_ledger_hithink_etf_binding.py`；修改HiThink来源绑定/工厂，Runtime退役原ETF helper/供应商工厂分派，旧交互服务仅错误投影，精确执行/probe标准读取、facts/目录/修订绑定派生、边界门禁、三原测试接缝。标准DailyBinding新增来源请求元信息，错误合同可保留安全诊断；SourceDefinition新增显式无目标准备工厂和复核日线工厂缓存声明，Tushare设原缓存行为，其他保持原值。缓存/准备事实替代公共供应商分支，不引入任意SDK方法透传。

初跑暴露原测试注入Runtime退役helper/原requests模块、标准DailyQuery身份与派生appliedAt时间比较，以及工厂过早读取凭据导致原复核次数/错误边界变化。前三类转到真实来源接缝及标准模型，政策保留除动态appliedAt外全部字段比较；工厂问题在实现中以来源无目标准备工厂修复，未放宽原3次快照读取或NO_ELIGIBLE_PROVIDER断言。另修正probe提取时的条件缩进，随后定向验证原凭据轮换、交互、单位、稀疏读取和错误传播。原ETF SDK/units/tradability三文件SHA256与K34a相同；不重写算法/冻结或扩大研究资格。

七文件定向104通过/3warnings：`.venv/bin/python -m pytest -q tests/test_thesis_ledger_hithink_etf_binding.py tests/test_thesis_ledger_hithink_credential_admission_runtime.py tests/test_hithink_interactive_daily.py tests/test_thesis_ledger_capability_registry.py tests/test_thesis_ledger_market_v3_pagination.py tests/test_thesis_ledger_tushare_etf_binding.py tests/test_thesis_ledger_tushare_capability_path.py`（`/tmp/tl-cap-h07-hithink-etf-directed-final.log`）。K34a的99文件追加前三文件，共102文件最终1562通过/1skip/22warnings（`/tmp/tl-cap-h07-hithink-etf-regression-final.log`）。复核缓存事实调整后已重跑以上组。新增用实际工厂证明原native错误code/retryable/diagnostics一次调用传到执行边界，403/429/503交互错误不被ValueError重新捕获；probe同绑定、独立工厂与旧政策保持。

syntax、flake8、能力边界原三命令退出0，日志 `/tmp/tl-cap-h07-hithink-etf-{syntax,gates,boundaries}.log`。库存 `/tmp/tl-cap-h07-hithink-etf-inventory-final.json` SHA256 `7b7e98b0673e256f94e8e3f493096d19dfc033a35c5f369f5a29046cc1343fc6`：14来源/120绑定/140目标/304模块/310DSA输入；完整目标排序与K34a等价。所有现行精确日线已登记标准binding，20个非日线目标仍待逐能力迁移；不以注册数代替强类型完整性、控制缓存、组合冻结或真实目标验收。H07总叶/H08–H12仍开放。目标同步和真实来源/目标消费另记。

K34b目标层：infra正式 `sync-code.sh dsa` 退出0/healthy，镜像保持原值，仅写层更新；日志 `/tmp/tl-cap-h07-hithink-etf-sync-dsa.log`。目标导入确认14来源/120绑定/140目标、原ETF sourceContract从binding派生、中央日线登记/修订均空、Runtime旧ETF helper不存在；证据 `/tmp/tl-cap-h07-hithink-etf-target-registry.json`。原DsaClient目录/政策核对仍84/84，HiThink enabled/credentialConfigured/configVersion5，已选CN/ETF/qfq仅HiThink routeIndex0 eligible，证据 `/tmp/tl-cap-h07-hithink-etf-target-state.json`。

真实来源与目标消费：原Server `DsaClient.marketBarsV3` 经已有能力Reader和V3响应/覆盖解析，固定上述现有主源，单次数据尝试读取159516.SZ、2026-05-18～20；2026-10-11T00:31:32.800Z验收通过，三条日线，provenance hithink/fund-market-historical/routeIndex0/effectivePolicyRevision84，实际日期2026-05-18～20。证据 `/tmp/tl-cap-h07-hithink-etf-live-target.json`，脚本 `/tmp/tl-cap-hithink-etf-live-target.mjs`。原Client数据post固定attempts=1，未切源/故障/临时政策；前后完整政策字段（除动态appliedAt）与Provider启用/配置/凭据状态一致。此证据证明该目标窗口的当前查询消费，不扩展为所有ETF/全历史/真实Futu或研究冻结验收。浏览器、新组合冻结及H08控制门禁仍独立开放。

<a id="record-9-67"></a>

## 9.67 公共费用六目标迁移接缝（H07-K35）

A01已读取真实入口 `api/thesis_ledger_public_fees.py` → `api/thesis_ledger_local_rules.py::build_rule_data_router` → `Runtime.execute_request` → `thesis_ledger_reference_data.local_rule_operation` → `thesis_ledger_local_rules.local_rule_operation`。当前API将原V3 wire payload放入request.parameters，来源读取器再解释routeKey/routeTarget/range；标准化时应建立费用专有强类型请求与结果，保留原wire和目标pin，不把这些字段作为所有RouteKey的通用可选项。

六目标：CN official-rules的cn-stock-auction-fees / cn-stock-auction-fees-archive；HK official-hk-rules的hk-stock-public-fees / hkex-trading-fee；US official-us-rules的us-section31-exchange-t2 / us-stock-public-fees。CN原读取器 `thesis_ledger_public_fees.OfficialPublicFeeProvider` 读取当前/归档JSON并验证文档、费用、日期、范围；目前只接受6开头SH股票，不可推断覆盖所有CN股票。港美原 `thesis_ledger_multimarket_rules.MultimarketRuleProvider` 共用于费用和交易状态，选定包symbol必须相同，范围/来源文档与收费政策原样保留；不能为迁移费用重写或双登记未迁移交易状态。

当时状态记录：`[x]` H07-K35-public-fees：六目标分子叶迁入费用标准合同/处理器和三来源模块，来源绑定派生原目录/修订，删相应旧登记，原JSON内容/摘要/文档/覆盖/收费政策不改；原V3 API与主备消费/冻结字段兼容。

下一先补读取结果完整字段和Schema/原测试：`test_thesis_ledger_multimarket_rule_routes.py`、`test_thesis_ledger_trading_status_routes.py`、`test_thesis_ledger_multimarket_rules.py`、`test_thesis_ledger_multimarket_public_fee_expansion.py`，以及当前Schemas费用合同。写集限制费用标准模型/处理器、三来源定义/工厂/绑定、current_data_route与原API/本地规则执行必要接缝/定向测试；共享Runtime/目录串行，现交易状态和现金来源未迁移路径保留。先定向再受影响/边界/正式门禁，最后必要目标只读消费；新政策/故障仍单独授权，无新费用/研究假设。

K35补齐精确写集：新增费用专有合同/查询处理器、三来源模块official_rules/official_hk_rules/official_us_rules与合同/真实工厂/API测试；在原capability_sources静态入口登记，reference_data优先费用处理器。删除current_data_route两CN费用登记，港美旧循环仅保留尚未绑定条目，不能双登记。源模块复用OfficialPublicFeeProvider/MultimarketRuleProvider，原manifest/包内容/工厂默认时钟和缓存保持。标准结果直接对齐 `packages/schemas/src/market-public-fees-v3.ts`，已有status处理器的标准模型→JSON投影可复用其边界方式，不需另建API/网关。

标准请求核对外层symbol/requestId/asset/start/end与本能力wire参数及目标，额外参数由严格Schema拒绝；来源参数与来源读取错误分开捕获。标准结果验证完整有序分段、文档引用及身份关联，十进制字段不转float，原source/providerRevision与收费日政策原样保留。CN范围是6开头SH，港美范围是包中明确symbol/日期，不能把6项目录理解为所有证券。当前门禁顺序为真实工厂/六目标合同/认证HTTP/坏源输入/未迁移status → K34受影响组增量 → syntax/flake8/边界/库存 → 正式最小目标同步及原已选路线只读验收。

K35实际写集：新增 `thesis_ledger_public_fees_contract_v1.py`（费用专有强类型Schema）、`thesis_ledger_public_fees_query.py`、`data_provider/public_fee_projection.py`、来源模块 `official_rules.py`/`official_hk_rules.py`/`official_us_rules.py` 与 `test_thesis_ledger_public_fees_capability_path.py`。增量修改静态注册入口、reference_data费用分派、current_data_route对应登记/循环和local_rules三个退役工厂登记；更新库存测试来源预期。原PublicFeeProvider/MultimarketRuleProvider/费用维度源码摘要与K34相同，原JSON/原文文件未修改。SourceDefinition保留原工厂缓存和类，读取器先执行原口径/范围/摘要，再标准合同验证；Runtime/API原政策、目标pin、认证及响应保持。

八文件定向89通过/7warnings：`.venv/bin/python -m pytest -q tests/test_thesis_ledger_public_fees_capability_path.py tests/test_thesis_ledger_public_fee_routes.py tests/test_thesis_ledger_multimarket_rule_routes.py tests/test_thesis_ledger_trading_status_routes.py tests/test_thesis_ledger_multimarket_rules.py tests/test_thesis_ledger_multimarket_public_fee_expansion.py tests/test_thesis_ledger_capability_registry.py tests/test_thesis_ledger_inventory_export.py`（`/tmp/tl-cap-h07-public-fees-directed-final.log`）。K34的102文件追加前六文件，共108文件1629通过/1skip/24warnings（`/tmp/tl-cap-h07-public-fees-regression-final.log`）。初跑参数测试期望Gateway子类，而原reference准备阶段抛ProviderCallError；按现有边界断言精确invalid_request和零读取。初跑库存固定旧14来源，更新为实际17来源，19Provider/140目标唯一、无测试生产来源及禁止SDK/网络/写入副作用断言保持。删除退役工厂后重跑上述验证。

原三命令syntax、flake8、能力边界最终退出0，日志 `/tmp/tl-cap-h07-public-fees-{syntax,gates,boundaries}.log`。库存 `/tmp/tl-cap-h07-public-fees-inventory-final.json` SHA256 `88ea1b4c04ccf8360c00581f0a8b6c14e244840abcd08039a8ccc67c225d4d6a`：17来源/126绑定/140目标/310模块/316DSA输入，完整目标排序与K34相同。六目标实际工厂经原Runtime对照原读取器全字段相同（固定测试时钟），原provenance/文档/摘要/率/TAF/进位/T+2保留；错误参数零数据读取，坏源身份/窗口/原文引用/浮点金额/显式null/无时区拒绝。第二来源隔离百分比输入经Decimal转换复用合同，未生产登记。目标同步/真实消费/冻结/浏览器另记，H07总叶及H08–H12保持开放。

K35目标层：infra正式 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa` 退出0/healthy，镜像保持原值，仅写层更新；日志 `/tmp/tl-cap-h07-public-fees-sync-dsa.log`。只读导入确认17来源/126绑定/140目标、六费用标准合同绑定、旧对应登记/三工厂登记退役，港美旧交易状态登记仍在（脚本实际assert）；证据 `/tmp/tl-cap-h07-public-fees-target-registry.json`。原DsaClient目录六目标ready，政策前后84/84，原已选仅HK hkex-trading-fee及US us-section31-exchange-t2，证据 `/tmp/tl-cap-h07-public-fees-target-state.json`。

生产源包与目标Server消费：原 `DsaClient.marketPublicFeesV3` / 已有能力Reader / 现V3请求结果Schema各单次尝试，读取00147.HK的2025-08-06～11和GME.US的2024-05-10～24。2026-10-11T01:08:28.721Z两项通过，HK一分段/单费项，US两分段/单费项；US exchangeSettlement/T+2、费用日2024-05-22对应成交生效日2024-05-20及原日历修订保留。historicalAvailability仍notVerified，未填其他零费用。证据 `/tmp/tl-cap-h07-public-fees-live-target.json`，脚本 `/tmp/tl-cap-public-fees-live-target.mjs`。完整政策（除动态appliedAt）及Provider启用/凭据状态/configVersion前后一致，不改政策/凭据/准入/费用模型。此层是目标读取既有真实生产源包，不是重新访问公告网站或新增外部SDK查询；其余四未选费用目标只有本地实际工厂/合同与目录证据，冻结/浏览器仍分别保留。

<a id="record-9-68"></a>

## 9.68 旧聚合交易状态七目标接缝（H07-K36）

A01已核对七既有目标：CN BaoStock/baostock；official-states的cn-stock-daily-suspension / cn-stock-risk-price-limits / cn-stock-initial-listing / cn-stock-delisting-period；HK official-hk-rules/hkex-00147-halt；US official-us-rules/nyse-gme-halt-observations。剩余非日线目标共14，另七为五现金与两拆分。

旧聚合状态仍沿 `reference_data` → `local_rules.local_rule_operation`；BaoStock供应商特判调用 `thesis_ledger_baostock_status_source.read_baostock_status_response`，其结构化记录、独立交易日查询、coarseST、sourceRecordIds及basicLifecycle均有现行消费合同，不可塞进其他价格源coverageProof。official-states原 `OfficialTradingStatusProvider` 读取公告/初期/整理期包并投影未知日期；港美 `MultimarketRuleProvider` 仅声明实际盘中暂停，整日仍unknown。新独立五能力继续自身路径，旧聚合兼容/冻结不能删字段或回填旧产物。

当时状态记录：`[x]` H07-K36-legacy-status：旧聚合七目标建立强类型请求/结果/Schema及来源绑定，分别保留公告、结构化与盘中原证据/窗口/错误，删除对应旧登记与公共供应商分派；不得将本叶变为新的宽松研究协议或重写五项独立能力。

下一补读 `packages/schemas/src/market-trading-status-v3.ts` 后半及 `market-structured-status-v3.ts` / `market-basic-lifecycle-v3.ts`，沿真实结构拆可验证子叶。当前已读状态/风险/日限/阶段/盘中字段及引用守卫：完全未知不能伪造引用，盘中时刻须绑定当地日，日限/无日限互斥；Doc.kind是issuerDisclosure/exchangePublication，与费用Doc.kind不同，不强行复用费用模型。写集将限制旧聚合合同/处理器、现来源模块及必要原读取投影、current_data_route/local_rules旧登记/分派、实际工厂/API/坏源/旧冻结回归。原BaoStock worker/缓存/基本日期及公告/日历规则保持，先定向再受影响/边界/必要目标；新政策/故障仍单独授权，H08–H12保持开放。

K36补读完整Schema：market-trading-status-v3 / market-structured-status-v3 / market-basic-lifecycle-v3已核对。结构化记录必须同provider/source/symbol/range，observedAt<=fetchedAt；覆盖四个日期数组有序唯一且在窗口内，未知数组和逐日结果严格对应，complete不因粗ST缺失被伪造。BasicLifecycle要求两日期状态/值一致、未知来源不可用理由、与日状态不同引用；旧Server明确验证BaoStock query_stock_basic字段/修订，迁移将对应来源校验置于BaoStock适配器，保持原消费契约，不新增供应商白名单。

实际写集限定：旧聚合能力值模型、合同/覆盖处理器和小型查询；BaoStock/official_states/official_hk_rules/official_us_rules来源绑定，来源专有旧响应投影；原reference_data增加该能力标准处理，删除current_data_route七旧登记与local_rules旧公共供应商读取分派。BaoStock worker/历史缓存/基础日期及公告/港美读包源码不改；跨层结果Schema与旧冻结不变。官方四源、港美两源先验证真实工厂/原JSON全字段相同，再BaoStock结构化/基础日期/缓存/隔离错误回归，低层全部通过后受影响、门禁、正式最小目标与原已选路线只读验收。

K36实际新增旧聚合值模型、合同、查询处理器、`data_provider/legacy_status_projection.py`、`data_provider/baostock_legacy_status.py` 与 `test_thesis_ledger_legacy_status_capability_path.py`。修改四来源模块各自绑定、reference_data分派、current_data_route七旧登记、local_rules退役公共供应商读取；边界禁止该分派复活。原BaoStock status/lifecycle、公告与港美读包源码SHA256与K35相同；SDK缓存、45s隔离进程、基本日期独立事实与原JSON未改。标准模型分为值域和结果/覆盖职责，不拆业务编排或扩大BaseProvider。

七文件定向90通过/6warnings：`.venv/bin/python -m pytest -q tests/test_thesis_ledger_legacy_status_capability_path.py tests/test_thesis_ledger_trading_status_routes.py tests/test_thesis_ledger_multimarket_rule_routes.py tests/test_thesis_ledger_multimarket_rules.py tests/test_thesis_ledger_capability_registry.py tests/test_thesis_ledger_baostock_status_routes.py tests/test_thesis_ledger_baostock_lifecycle.py`（`/tmp/tl-cap-h07-legacy-status-directed-final.log`）。K35的108文件追加新合同与两个BaoStock原回归文件，共111文件1674通过/1skip/24warnings（`/tmp/tl-cap-h07-legacy-status-regression-final.log`）。新增实际工厂全字段对照官方/港美六源，BaoStock原工厂/缓存/基本日期不同引用；坏源身份、结构化未知覆盖、缺口、错引用、基本日期角色/方法、未来观察、盘中时区/粒度/错误全天声明拒绝，坏参数零读取。

初跑旧测试把未配置来源与缺routeIndex混在一起；保留完整未配置pin→503/no_eligible_provider断言，另明确缺index→422/bad_request，与现V3 Schema一致。BaoStock旧函数被模块早绑定导致测试的政策变更注入未触发，已在适配器调用时沿原模块定位函数；原晚到测试返回完整合法响应后变更政策，原not_admitted断言保持，不以坏响应代替政策检查。原低层失败先修根因，未提高阈值/ignore或删除门禁。

syntax、flake8、能力边界三命令最终退出0，日志 `/tmp/tl-cap-h07-legacy-status-{syntax,gates,boundaries}.log`；生产最后仅模块说明与边界覆盖变化，SDK/功能验证输入保持。库存 `/tmp/tl-cap-h07-legacy-status-inventory-final.json` SHA256 `731db91aa45e7a3342d60cfd165d359646c5337e0f317431ed3b66bc00254e10`：17来源/133绑定/140目标/315模块/321DSA输入，完整目标排序与K35相同。未迁移仅五现金/两拆分事件，H07总叶及H08–H12仍开放；目标、源包/实源、浏览器与冻结另记。

K36目标层：infra正式 `sync-code.sh dsa` 退出0/healthy，镜像保持原值，仅写层；日志 `/tmp/tl-cap-h07-legacy-status-sync-dsa.log`。只读导入17来源/133绑定/140目标、七聚合标准绑定、中央_DATA_ADAPTERS空、公共local_rule_operation退役；证据 `/tmp/tl-cap-h07-legacy-status-target-registry.json`。原DsaClient目录/政策前后84/84，已选HK/US盘中源及CN BaoStock主、公告风险routeIndex1备用保持，证据 `/tmp/tl-cap-h07-legacy-status-target-state.json`。

目标Server消费：原 `DsaClient.marketTradingStatusV3` / 原能力Reader / 现V3状态、结构化、基本日期Schema，每案固定当前已选pin/单次尝试。2026-10-11T01:25:36.104Z四案通过：00147.HK 2025-08-06～11六日、GME.US 2024-05-10～24十五日，均保留intraday粒度且整日unknown；000995.SZ 2023-08-17的BaoStock主源与公告风险备用各一日。BaoStock返回ipoDate2000-08-07、outDate=null/notProvided，basic引用独立于日状态，未推导最后交易日；公告保留原风险。证据 `/tmp/tl-cap-h07-legacy-status-live-target.json`，脚本 `/tmp/tl-cap-legacy-status-live-target.mjs`。政策全部语义字段、Provider启用/凭据状态/configVersion前后相同，无政策变更/故障/切源。此证据为生产公告包/实际结构化事实的目标消费；BaoStock响应未标识缓存命中与当次在线获取，不作为新实源查询证明。其余三未选公告目标、真实故障/配置代次、浏览器、新组合冻结仍独立待验。

<a id="record-9-69"></a>

## 9.69 现金/拆分七事件目标接缝（H07-K37）

A01真实接缝已定位 `thesis_ledger_event_v3_adapters.py`：五现金（akshare/eastmoney、rqdata/rqdata、tushare/tushare、hithink/fund-corporate-actions-dividends、official-dividends/cn-etf-cash-notices），两拆分（akshare/eastmoney、rqdata/rqdata）。中央登记/修订和iter_event_adapters仍未迁移。执行不是普通Runtime.execute_request分支，而是 `thesis_ledger_event_v3.execute_event_request`；其供应商分支沿notice/tushare/hithink专用execute以及rqdata/mappedSplit读取，不能按普通行情目录搬表后旁路原映射/身份/安全复核。

当时状态记录：`[ ]` H07-K37-event-batches：七事件目标分源/能力子叶迁入强类型请求/结果、来源绑定与原执行；保留精确身份、金额/比例、映射证据/原文/摘要、准入/安全、空结果与完整分页、原冻结/重放，删除对应中央事实与供应商执行分派。

下一按实际调用补读 `_admitted_state` / `execute_event_request` 及 `market-event-wire-v3.ts`，先限定一种已稳定事件子叶。复用 `test_thesis_ledger_events_v3.py`、event_control_v3、split_event_control_v3、各rqdata/tushare/hithink/notice事件与mapped_read测试；不把全事件迁移合并成一次重写。现金不当价格复权因子，映射缺失/窗口未覆盖不当零事件；SDK/身份/映射/安全复核和Source修订沿当前代码，未配置/未准入不自动启用。写集先确认事件专有处理器/标准模型、单来源绑定与原执行接缝后串行公共目录/Task，不改账户策略/原冻结/研究语义；新政策或故障仍单独授权。H08–H12及全部剩余门禁保持原目标。

K37首叶限定official-dividends/cn-etf-cash-notices。原源包独立年报现金覆盖与明确事件清单、每十份单位除10、观察截点、原件摘要/页码/公告日期关系均在OfficialNoticeDividendProvider校验，原execute_notice_events_v3再次绑定准入evidence/sourceRevision并检查安全回调。源码使用实时notice_dividend_revisions()读取包摘要；不得注册成静态导入时摘要，否则包变化后旧准入会误用。

当时状态记录：`[x]` H07-K37a-notice-cash：公告现金源事件绑定、标准请求/现金结果与类型化事件上下文，复用原执行器；动态修订从来源派生，删旧中央目标/供应商分支/工厂登记，原正常/空结果/坏证据/包变化/晚到/安全/认证/原响应字段回归。本地实施完成；真实成功消费与新冻结验收另列，不能由此勾选推定。

精确写集：事件专有标准合同/上下文与EventBinding、official_dividends来源模块及投影，capability_sources静态登记；event_v3在原入口优先标准事件绑定，event_v3_adapters目录/修订派生并跳过已迁移旧目标，current_data视图排除事件执行域，local_rules删旧notice工厂。原公告源包/读取器/execute_notice_events_v3不改，不传Runtime到来源，不双执行。先该源真实工厂与原事件/控制/鉴权/准入回归，再受影响/边界/必要正式最小目标；未选/未准入不自动补路线。

K37a实施新增 `src/services/thesis_ledger_event_cash_contract_v1.py`、`thesis_ledger_event_execution_context_v1.py`、`data_provider/thesis_ledger_sources/official_dividends.py` 和 `tests/test_thesis_ledger_notice_cash_capability_path.py`；增量修改 capability_registry/sources、current_data_route、event_v3/adapters、local_rules、market_v3_adapters、price_route_access、库存/边界脚本及事件/库存测试。EventBinding解析当前包摘要，不伪造缺包修订；来源执行原notice生命周期，仅接收本请求准入/安全回调，标准证据投影回原noticeDividendEvidence且逐字段相同。公共日线判断收紧为DailyBinding，避免任意注册数据能力误获基础价格资格。金额字符串、CNY每份0.064、原时钟/准入/原文摘要保持，已覆盖无事件小窗仍完整空结果，未覆盖不当零事件。

验证实际命令：`env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q` 定向 notice_cash_capability_path、notice_events_v3、capability_registry、control_v3、inventory_export 五文件，53通过/4警告；之后补充空窗和错误样例，新增文件单跑14通过/2警告（`/tmp/tl-cap-h07-notice-{directed,extra}.log`）。K36的111文件受影响组追加 notice_cash_capability_path、notice_events_v3、events_v3、hithink_events_v3 共115文件，最终1720通过/1跳过/26警告，命令全量测试文件序列沿K36并追加上述四文件（`/tmp/tl-cap-h07-notice-regression.log`）。后补三测试全部局部复验，生产行为未再变。首次受影响6失败/1714通过：旧事件夹具只含两Provider导致当前目录partial，在读取前拒绝；补齐夹具当前真实Provider后事件四文件46通过，再重跑受影响组，不删除完整性断言。首次新错误样例少传NoticeDividendError.message导致1失败，补正夹具后14通过，失败证据保留。

`PATH="$PWD/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 ./scripts/ci_gate.sh syntax`、同环境 `flake8`、`env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/check_thesis_ledger_capability_boundaries.py` 退出0（`/tmp/tl-cap-h07-notice-{syntax,gates,boundaries}.log`）；静态门禁禁止恢复公共公告执行特判/直连。库存导出仍拒绝SDK实例、网络和配置写，18来源/134绑定/140目标/318模块/324输入，完整目标与K36逐对象同序相等。最终摘要待末次类型注解核验后追加；现导出 `/tmp/tl-cap-h07-notice-inventory.json`。

目标：从infra正式 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa` 兼容预检通过/退出0/healthy，只写层不改镜像；`/tmp/tl-cap-h07-notice-sync-dsa.log`。原Server DsaClient只读政策/目录/Provider前后比较，84/84全部政策语义字段（排除动态appliedAt）与Provider开关/凭据状态/configVersion一致；目录complete/140。证据 `/tmp/tl-cap-h07-notice-target-{before,after}.json`，脚本 `/tmp/tl-cap-notice-target-state.mjs`。原现金主HiThink not_admitted、公告index1 admission_expired，公告目录not_admitted；没有新增准入/政策或故障，真实成功消费未执行，新冻结/浏览器未验。末次类型注解变化需要再以正式入口同步最终输入，另记结果。

当时状态记录：`[ ]` H07-K37a-live：已过期准入的公告真实成功消费及新冻结，需对应范围决策/授权，不自动刷新准入。
当时状态记录：`[x]` H07-K37b-eastmoney-cash：沿原有界页面执行读取，经共用现金合同保留incomplete覆盖、观察时钟和原事件准入；不把页面读全等同历史覆盖。源读取与本地迁移完成，真实成功消费独立待验；其余五事件与H08–H12继续开放。

<a id="record-9-70"></a>

## 9.70 东财现金事件迁移启动（H07-K37b）

A01沿真实 `fetch_fund_dividend_observations` → `normalize_eastmoney_fund_dividends` 核对：元/份金额Decimal字符串、除息日上海时钟、当前观察availableAt，跨年默认总10页/最多五年，requests.Session释放，分页元数据变动/重复/不足拒绝；页面证据摘要形成本次providerRevision，准入sourceRevision仍为接口合同，不能强行相等。原结果coverage永远未验证，不生成strategyVisibility。

写集限定标准CashObservation共用请求/事实与身份/时钟关联、公告CashResult继承保留公告专属证据，东财现金来源处理器、新akshare事件binding、公共事件旧现金else分派与中央现金登记退役；原拆分/RQData/Tushare/HiThink保留。事件上下文延迟构造来源，准入失败不得触碰SDK工厂。原读取器/归一化/分页/请求参数不变；现金原wire不增新字段。验证原事件/东财页面/合同/准入/安全，再受影响组、静态门禁、最终库存和正式最小同步；目标成功消费与过期准入分开，不新增政策/准入/故障。

实施：新增 `data_provider/eastmoney_cash_capability.py`、`tests/test_thesis_ledger_eastmoney_cash_capability_path.py`，增量修改 akshare来源、event_cash_contract_v1、event_execution_context_v1、event_v3/adapters、边界门禁及原事件/库存顺序测试。两来源的binding.contract为同一个CASH_DISTRIBUTION CONTRACT，请求/现金事实/准入时钟模型复用；公告扩展原文证据校验，东财输出来源投影拒绝虚构公告证据或完整覆盖。事件上下文延迟factory至原准入之后；缺准入零factory，东财原页面读取不构造无用Akshare SDK。原前后状态比较/错误分类/空事实/availableAt/fetchedAt关系保持；响应providerRevision保持本次页面证据摘要，不等同准入接口修订。

实际验证命令仍为 `env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q`：公告/事件/东财原读取器/归一化/control/inventory七文件87通过/4警告；新增东财六项6通过/2警告，实测一次execute_event_request调用完整读取两页且零SDK工厂，金额0.064不转float、观察时钟不变、无strategyVisibility、覆盖未知；坏币种/浮点金额/来源/重复/未来时钟全部invalid_response且只读一次。K37a末次公告五文件56通过/4警告，补零工厂后新公告文件15通过/2警告。日志 `/tmp/tl-cap-h07-{eastmoney-cash-directed,eastmoney-cash-extra,notice-directed-final,notice-extra-final}.log`。

受影响组K37a115文件追加东财能力路径/原页面/原归一化三文件共118文件，最终1761通过/1跳过/26警告（`/tmp/tl-cap-h07-eastmoney-cash-regression.log`）；独立原event_control_v3、rqdata_events_v3、split_event_control_v3、split_mapping_v3、rqdata_fund_event_process五文件55通过/3警告（`/tmp/tl-cap-h07-eastmoney-cash-event-compat.log`）。首次1失败/1760通过是原库存测试依赖中央枚举顺序；两处库存测试改为按精确identity排序比较完整条目，仍检查所有目标/状态/gated/修订，不放宽消费者断言；45项定向复验通过后再跑118文件。目录枚举顺序可变化，用户主备仍由Policy routeIndex唯一决定，未重排政策。

最终三命令syntax/flake8/能力边界退出0，日志 `/tmp/tl-cap-h07-eastmoney-cash-{syntax,gates,boundaries}.log`；禁止恢复公共公告/东财现金调用，生产无测试来源。库存导出 `/tmp/tl-cap-h07-eastmoney-cash-inventory-final.json` SHA256 `2d125547a47310d13063f6be904b4ad6544b3fdfd30a273f80526ddd67d5fc46`，18来源/135绑定/140目标/319模块/325输入，完整精确目标排序与K36相同。原notice_dividends/notice_events_v3/eastmoney_fund_dividend_reader/eastmoney_fund_dividends四模块逐文件SHA与K36相同。未改依赖/SDK/凭据/包/研究或原冻结；主仓Schema/Server源码未变，既有包级/边界/依赖/尺寸结果只适用于原未变输入，不充当本次目标/新冻结证据。

六入口（原Spec/Task、当前架构、矩阵、DSA接入指南/Changelog）同步已实现范围。末次事件类型注解/延迟factory由本批最终三门禁及受影响组覆盖，并通过本批正式dsa同步最终输入；实际运行态结果另追加。仍缺原已过期公告准入的成功消费、未选东财现金真实消费、浏览器、新冻结，以及H08–H12所列门禁。下一可执行叶为RQData现金/拆分身份与隔离进程迁移，不能拿完整SDK分页或known-empty替代映射/准入/覆盖证明。

K37b最终目标：从infra正式 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa` 最小目标执行，预检通过/退出0/healthy，日志 `/tmp/tl-cap-h07-eastmoney-cash-sync-dsa.log`；最终输入覆盖K37a后补类型注解/延迟factory。镜像保持 `0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`，只写层，不代表镜像/发布。目标只读导入18来源/135绑定/140目标、两现金binding共享同一个CONTRACT、动态公告包摘要仍 `924ca0ef585cbc044a34cc552ec0a17b24645a63ecbfec4df9fa01ded414cfa3`，证据 `/tmp/tl-cap-h07-eastmoney-cash-target-registry.json`，脚本 `/tmp/tl-cap-event-target-registry.py`。

原Server DsaClient最终只读目录/政策/Provider：complete/140，政策84/84与批次前全部语义字段相同、Provider启用/凭据状态/configVersion相同；证据 `/tmp/tl-cap-h07-eastmoney-cash-target-final.json`。原现金HiThink index0不准入、公告index1过期，东财未选，未自动更新。2026-10-11T02:00:44.481Z经原 `DsaClient.marketEventsV3` 单次读取公告510300.SH原2023-01-03～02-01范围，422/control-rejected，符合当前不eligible拒绝边界；证据 `/tmp/tl-cap-h07-notice-target-denial.json`、脚本 `/tmp/tl-cap-notice-target-denial.mjs`。此为目标拒绝与接口边界验证，不是数据成功消费、实源分页或冻结验收；未触碰真实Ledger/凭据/准入/政策，无故障注入。

下一叶接缝已继续读取 `thesis_ledger_rqdata_event_v3.py`：原生产不是普通RQ工厂透传，而是 `read_rqdata_mapped_fund_event` 接受本请求read_admission/read_credentials/read_master_key、持久映射仓及30s隔离预算；先准入后凭据，read_rqdata_events_v3当前仍接Runtime。后续通过类型化请求回调迁移，保留隔离进程、身份原文/映射、凭据HMAC、前后复核和源事实；尚未将这两个目标登记为标准绑定。H07总叶及H08–H12仍未完成，下一执行叶不依赖新的临时政策。

<a id="record-9-71"></a>

## 9.71 RQData现金/拆分迁移启动（H07-K37c）

当时状态记录：`[x]` H07-K37c-rqdata-events：两事件目标迁入来源定义、原账号工厂、强类型现金/拆分合同与原映射/隔离执行；目录/修订/凭据与当前准入查找派生，退役公共RQ执行特判。本地与目标代码迁移完成，真实RQ账号消费另保留。

A01写集：事件公共信封/强类型拆分合同、RQ来源模块与事件处理器；capability_registry/sources、event_execution_context、event_v3/adapters、provider_manifests/credentials与Runtime当前准入查找；原rqdata_mapped_read/rqdata_read只增加可选工厂注入接缝，默认原调用不变。原rqdata_fund_event_process、ClientFactory、两SDK读取器/归一化/身份resolver保持原预算/terminate/join/释放/账号/映射校验。公用事件信封只负责固定请求、准入范围、原文字节引用与事实时钟/唯一性；现金金额和拆分比例分别建模，不把SPLIT继承现金语义。

RQ原身份原文上限1MiB、持久仓、准入记录时刻/有效期/范围、六位查询代码/币种文档由原resolver核验；缺准入先失败，不解密凭据。RQ当前观测摘要不替代sourceRevision，ratio=1原样无经济事件，反向拆分保持type/ratio，不生成strategyVisibility，不宣称上游分页或历史覆盖。原manifest能力空保留，显式event绑定表达两精确能力；不扩普通原生Provider能力，不配置真实账号或新准入。先原SQLite/认证HTTP真实spawn/映射/账号轮换/晚到与标准模型定向，再受影响/静态/最终库存/必要正式同步；无临时政策或目标故障。

增量接缝核对：所有19个Provider的CAPABILITY_SOURCES.manifests()与原合并manifest逐字段相同，删除残余中央覆盖，使manifest只从来源定义派生。公共provider_credentials仍有RQ密码空白规则特判；新增来源声明的字段值归一化回调，公共Control只调用该回调并验证结果为字符串，RQ用户名trim/有效密码原字节/空白密码空串保持。用隔离fixture新providerId复用同声明证明不改公共分支；不改变实际凭据或存储格式。

完成写集：新增 `src/services/thesis_ledger_event_envelope_v1.py`、`thesis_ledger_event_split_contract_v1.py`、`data_provider/thesis_ledger_sources/rqdata.py`、`data_provider/rqdata_event_capability.py`、`tests/test_thesis_ledger_rqdata_event_capability_path.py`。修改 event_cash_contract_v1 提取固定信封（现金经济事实/公告模型保持）、event_execution_context_v1 的请求绑定账号上下文，capability_registry/sources，provider_manifests/credentials，event_v3/adapters、market_v3_revisions、provider_runtime 与原RQ当前准入模块、两原注入接缝、库存/边界脚本及库存测试。公共Runtime原两行RQ分支替换为两行精确绑定准入解析，原供应商透传read_rqdata_events_v3退役；来源内部直接使用既有mapped_read，工厂由source.factory经已核验快照构造，不传Runtime。

标准结果复用现金合同，拆分使用独立SplitRequest/SplitFact/SplitResult与同一事件信封；正比例、反向拆分方向和ratio=1无经济事件保持。身份原文/摘要/窗口/币种由原resolver再核对，providerRevision仍为本次内容摘要，sourceRevision仍为原接口修订。无SDK用户方法透传、无分析备用、无新增重试或切源。RQ上游paginationVerified仍未证明：本地一次能力执行、一个隔离进程、一个SDK get_dividend/get_split调用不代表上游内部物理页数；30s预算/2000行上限、父进程凭据复核、terminate/join/释放按原进程实现与测试保留。

实际验证：最初四文件66通过/3警告；六文件原RQ执行/过程/身份/映射/账号与新合同93通过/3警告；最终九文件135通过/4警告，命令 `env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q` 后跟 rqdata_event_capability_path、rqdata_events_v3、rqdata_fund_event_process、rqdata_fund_identity_evidence、thesis_ledger_rqdata_mapped_read、thesis_ledger_rqdata_read、inventory_export、capability_registry、provider_credentials 对应测试文件，日志 `/tmp/tl-cap-h07-rqdata-events-directed-final.log`。其中原认证HTTP真实spawn两案、无准入零账号/SDK、账号/文件/政策晚到变更、错误脱敏不重试全部保留。新合同18项验证wire逐字段回环、两能力隔离、错误币种/摘要/比例/方向/身份/未来时钟/重复拒绝、Source参数错误零控制读取、查询不订阅、声明修订不授予当前修订，以及隔离新providerId复用密码字节规则、不写存储。

K37b的118文件追加上述RQ六文件和event_control_v3/split_event_control_v3/split_mapping_v3三文件共127文件，1885通过/1跳过/27警告（`/tmp/tl-cap-h07-rqdata-events-regression.log`）；新增Source凭据归一化后再追加provider_credentials，共128文件最终1905通过/1跳过/27警告（`/tmp/tl-cap-h07-rqdata-events-regression-final.log`），不以较早输入结果代替最终结果。最终 syntax、flake8、能力边界三原命令退出0，日志 `/tmp/tl-cap-h07-rqdata-events-{syntax,gates,boundaries}.log`。静态门禁禁止恢复公共RQ事件、Runtime透传及凭据特判。

最终库存 `/tmp/tl-cap-h07-rqdata-events-inventory-final.json` SHA256 `ab357f4449599999d9e3c03fd1d369ad6d3cd1664dd71e0ed9bb9a0067e4b1e5`：19来源/137绑定/140目标/323模块/329输入，19个Provider声明逐字段、完整精确目标排序与K37b相同；原RQ ClientFactory、process、两SDK读取器/归一化和身份resolver七模块SHA相同。原mapped_read/read只增加可选工厂注入且保留默认构造，未改SDK/requirements/真实凭据/准入/研究或旧冻结，不伪造Source修订。六入口已更新；主仓源码未变，既有Schema/Server门禁只适用于未变输入。

目标：infra正式 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa` 预检通过/退出0/healthy，日志 `/tmp/tl-cap-h07-rqdata-events-sync-dsa.log`，镜像保持原值，只写层。目标只读导入19来源/137绑定/140目标，四事件标准绑定；RQ两声明接口修订保留，未传当前HMAC时resolver返回None。证据 `/tmp/tl-cap-h07-rqdata-events-target-registry.json`，脚本 `/tmp/tl-cap-event-target-registry.py`。原DsaClient政策/Provider前后84/84全部语义字段相同，目录complete/140；RQ enabled=false/credentialConfigured=false/configVersion0、无选定RQ路线。证据 `/tmp/tl-cap-h07-rqdata-events-target-{before,after}.json`，脚本沿原只读状态脚本。未配置真实账号、未添加路线/准入/故障，没有真实RQ成功消费、浏览器或新冻结证据；这些层级与源移植分别保留。

当时状态记录：`[ ]` H07-K37c-live：RQ真实账号消费，当前未配置/未选路线，不自动创建或启用。
当时状态记录：`[x]` H07-K37d-eastmoney-split：复用原持久日期映射、原页面/分页/时钟、Split合同，保留原生效日与登记日；本地与目标代码移植完成，真实消费另保留。Tushare/HiThink现金仍待迁移，H07总叶及H08–H12继续开放。

已继续核对K37d真实接缝 `thesis_ledger_split_event_reader_v3.read_mapped_split_events`：持久MappingEvidenceStore绑定准入原文，先用空观测验证映射，再按明确effectiveDate筛当前symbol/窗口；读取起点扩至sourceConversionDate以避免漏前日登记，来源观测经原resolver映射，providerRevision是来源观察摘要与映射SHA组合，原recordDate与observedAt保持。其当前fact固定SPLIT且原recordDate可选；迁移前须核对原ratio=1/反向比例处理及dateMappingEvidence合同，不能为了适配新模型猜生效日、改日期或悄悄丢掉原字段。下一读原split_mapping_v3、SDK页面与合同测试后启动精确代码写集。

<a id="record-9-72"></a>

## 9.72 东财拆分迁移启动（H07-K37d）

A01核对原resolver与SDK观测：比例仅要求有限正十进制，原mapped reader保留ratio=1及小于1的SPLIT标签和可选recordDate，不猜生效日或公告可见性。现行 `packages/schemas/src/backtest-data.ts` 的corporateActionFact同样仅要求正比例；K37c的统一SplitFact额外方向/ratio=1限制比现行消费更窄，应收回到RQ来源投影（该源原normalizer按方向分类、跳过1），共享模型沿现行合同保留全部合法原记录。此为来源语义隔离，不能改原native输出或消费/冻结格式来迁就模型。

写集限定Split合同补原recordDate与dateMappingEvidence；EventExecutionContext补持久仓地址，原入口绑定运行时资源；新增东财拆分处理器、akshare一精确binding及中央修订别名迁到来源，原公共generic split执行退役。源处理器前后原状态核对、原read_mapped_split_events与原字节/观察/修订保持，投影复核映射事实；原页面/normalize/resolver/持久映射读取器不改。定向原控制/映射/SDK分页与新增真实原读取对照、Ratio1/小比例/缺可选日期/空观察/错误/晚到；之后受影响/静态/库存/正式最小同步。无新路由、准入、真实故障、研究放宽或资产追补。

完成新增 `data_provider/eastmoney_split_capability.py`、`tests/test_thesis_ledger_eastmoney_split_capability_path.py`；修改 akshare来源binding、event_split_contract_v1、event_execution_context_v1、event_v3/adapters、RQ来源方向守卫和能力边界门禁。原公共generic事件尾段退役，仅未迁移Tushare/HiThink现金保持旧分派；同目标只有一个binding登记。两拆分来源使用同一个CONTRACT，原recordDate可选/dateMappingEvidence进入标准模型，东财投影再验证原文字节和每事实唯一映射，原Source修订保持。

定向命令 `env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q`：原split_event_control_v3、split_mapping_v3、eastmoney_fund_splits、eastmoney_fund_split_reader、RQ能力路径/事件六文件86通过/3警告，加新eastmoney_split_capability_path共七文件99通过/3警告，日志 `/tmp/tl-cap-h07-eastmoney-split-directed-final.log`。新增13项真实原mapped reader对照，ratio2/1/0.5/高精度、登记日可选、原facts/原文/组合修订逐字段相同，来源起点扩至前登记日；一次原事件执行读取两原SDK页、零Akshare工厂，空观察保持unknown，无strategyVisibility。坏日期/登记日/比例/摘要/证据/重复事实拒绝且一次来源读取，坏参数零生命周期调用；RQ方向守卫仍拒绝不符数据，原控制撤销/晚到/缺映射行为保持。一次补丁因同文件hunk顺序无法匹配而原子拒绝，重读后按实际顺序增量应用，未整文件覆盖。

K37c最终128文件追加上述新能力路径/东财原页面/原归一化三文件，共131文件受影响组1946通过/1跳过/27警告（`/tmp/tl-cap-h07-eastmoney-split-regression.log`）。最终syntax、flake8、能力边界原三命令退出0（`/tmp/tl-cap-h07-eastmoney-split-{syntax,gates,boundaries}.log`）；静态禁止恢复公共mapped split读取。库存 `/tmp/tl-cap-h07-eastmoney-split-inventory-final.json` SHA256 `fd58bc8b25625f5113caeae775d1642d90b958abcd0a3a138a3725426e0dd96d`，19来源/138绑定/140目标/324模块/330输入。19个Provider声明逐字段、完整精确目标排序与K37c相同；原东财split_reader/normalize/split_mapping_v3/split_event_reader_v3四模块SHA相同，不伪造上游修订。原Spec/Task、架构、矩阵、DSA接入指南/Changelog同步已实现范围；主仓代码/公开Schema/冻结格式未改。

目标：infra正式 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa` 兼容预检通过/退出0/healthy，日志 `/tmp/tl-cap-h07-eastmoney-split-sync-dsa.log`，镜像保持原值，仅写层。目标只读导入19来源/138绑定/140目标、五事件标准binding，两拆分共用CONTRACT且原接口修订相同（`/tmp/tl-cap-h07-eastmoney-split-target-registry.json`，脚本 `/tmp/tl-cap-event-target-registry.py`）。原DsaClient政策/Provider前后84/84全部语义字段相同，目录complete/140，当前无SPLIT_EVENT路线（`/tmp/tl-cap-h07-eastmoney-split-target-{before,after}.json`）。没有临时政策或新准入，没有真实成功消费/实源请求/新冻结/浏览器证据，不能由本地原分页替代。

当时状态记录：`[ ]` H07-K37d-live：东财拆分真实已选路线消费，目前未选，不自动新增政策/准入。
当时状态记录：`[x]` H07-K37e-tushare-cash：保留原原文先于账号的多重guard、30s总预算、实际Decimal HTTP解析/可见日和原adapter凭据缓存；原精确时钟不截断。本地与目标代码移植完成，真实账号消费另保留。HiThink现金及H08–H12仍开放。

<a id="record-9-73"></a>

## 9.73 Tushare现金迁移启动（H07-K37e）

A01实际写集：标准事件精确时钟原语与信封比较、现金已存在strategyVisibility强类型字段；事件账号上下文补本地原始准入读取，provider作用域工厂通过原Runtime._adapter缓存，route作用域仍直接source.factory。原Tushare事件模块仅提取无账号guard的资源端口并退役生产Runtime透传execute，保留原_response与当前准入原语；新来源现金处理器复用原guard/response/mapped_read，以固定回调完成原生命周期。tushare来源新增一binding/当前准入/修订，公共event/adapters/Runtime删对应特判，原SDK/mapped/identity/HTTP/Decimal解析保持。

原身份时间解析支持最多1024位小数，不能只按微秒截断或把纳秒边界投影返回；事件通用时钟按整数秒/等宽小数精确比较，原原文/时间字符串不改。原可见日是conservative-day，不从当前availableAt推导公告可见性；无该事实的来源不能因标准字段可选而声明支持。必须维持坏原文零政策/目录/所有账号路径、原请求预算与不可变快照、缓存重复命中、原晚到/安全/错误/认证HTTP/现已build Schema交换，随后受影响/门禁/库存/正式最小同步。无新政策、准入、凭据或研究语义。

完成新增 `data_provider/tushare_cash_capability.py`、`src/services/thesis_ledger_event_time_v1.py`、`tests/test_thesis_ledger_tushare_cash_capability_path.py`；修改 tushare来源binding、事件信封/现金模型/资源上下文、原event入口/adapters/Runtime当前准入及原Tushare guard资源端口/response模块、其他未提供历史可见性的现金来源投影守卫与能力边界。来源接收请求绑定raw准入/当前准入/凭据/主密钥/原缓存构造器，不接Runtime，原execute_tushare_events_v3透传退役；别名修订/当前准入由绑定派生，不双登记。现金继续同一个CONTRACT，强类型strategyVisibility保留已存在的conservative-day/announcement语义，无该事实来源明确拒绝伪造可见性。

首轮原Tushare事件/登记与RQ/东财拆分四文件113通过/3警告，最终加新Tushare现金路径五文件125通过/3警告（`/tmp/tl-cap-h07-tushare-cash-directed-final.log`），命令 `env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q` 后跟 tushare_cash_capability_path、tushare_events_v3、tushare_event_registry_v3、rqdata_event_capability_path、eastmoney_split_capability_path 五测试。原坏原文/文档零政策/目录/所有账号路径、账号/原文/政策/目标/Provider/Bearer晚到、预算和错误脱敏单次调用、Decimal HTTP与已build的主仓Schema交换全部通过，没有改断言。新增12项：原wire逐字段回环与高精度金额/可见日；两次同快照一次构造且call_count2，令牌重新准入后第二次构造、新adapter、共3次HTTP（仅隔离测试）；标准时钟与原原语对负epoch/时区/1～1024位小数等价；1ns有效窗口通过且不改validUntil字节，到期相等/未来1ns拒绝；未知/显式null可见性拒绝。

K37d131文件追加新现金路径、原tushare_mapped_read、原tushare_fund_identity_evidence三文件共134文件，2126通过/1跳过/27警告（`/tmp/tl-cap-h07-tushare-cash-regression.log`）。最终syntax/flake8/能力边界原三命令退出0（`/tmp/tl-cap-h07-tushare-cash-{syntax,gates,boundaries}.log`），门禁禁止恢复公共Tushare执行特判/Runtime透传。库存 `/tmp/tl-cap-h07-tushare-cash-inventory-final.json` SHA256 `7f703efa872daec41ceebb7d8ee9a0b8b45c3dea057cf81755e700bea0c0c2b9`，19来源/139绑定/140目标/326模块/332输入；19个Provider声明逐字段、完整精确目标排序与K37d相同。原mapped_read/identity/SDK reader/normalize/Fetcher五模块SHA相同；只有原事件编排拆为来源固定回调，原接口/上游Source修订、原始包/凭据/公开Schema/研究与旧冻结不改。六入口同步已实现范围。

目标：infra正式 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa` 兼容预检通过/退出0/healthy，日志 `/tmp/tl-cap-h07-tushare-cash-sync-dsa.log`，原镜像不改/仅写层。目标只读导入19来源/139绑定/140目标、六事件标准binding，Tushare声明接口修订原值、无HMAC时当前resolver=None（`/tmp/tl-cap-h07-tushare-cash-target-registry.json`）。原DsaClient政策/Provider前后84/84语义字段相同、目录complete/140，Tushare enabled=false/credentialConfigured=false/configVersion0、无选定Tushare路线（`/tmp/tl-cap-h07-tushare-cash-target-{before,after}.json`）。脚本沿原只读registry/state脚本；未配置真实账号/启用/补政策/准入或故障，无真实成功消费/浏览器/新冻结证据。

当时状态记录：`[ ]` H07-K37e-live：Tushare真实现金消费，当前未配置/未选，不自动启用或新增政策/准入。
当时状态记录：`[x]` H07-K37f-hithink-cash：最后一个精确目标完成来源绑定，原文先行、全部准入symbol范围、environment/control快照、精确时钟、30s mapped读取与fetch接缝保持。本地与目标代码移植完成，真实成功消费独立未验；原分红认证不改。H07总叶及H08–H12仍开放。

<a id="record-9-74"></a>

## 9.74 HiThink现金迁移启动（H07-K37f）

A01实际分红认证为api_key快照(apiKey)→原X-api-key头；不是日线/其他HiThink方法的认证入口，原认证不改。原mapped Reader先原文、快照/HMAC、30s剩余预算→原fetch→原文/准入/快照再次核对→原毫秒日期及每十份税前金额除10归一化，原response再核对币种/窗口/精确时钟/覆盖未知。原当前准入还逐一校验全部scopeSymbols，不省略；现金没有strategyVisibility，不能套用Tushare可见日。

写集限定原HiThink事件guard提取固定资源端口、生产Runtime透传执行退役；新增HiThink现金处理器与来源binding/current_admission/原修订，同一个CASH合同，原wire hithinkIdentityEvidence由来源投影。公共event/Runtime/adapters删除最后现金特判，策略准入以绑定当前解析器查找替代HiThink分红特判；其余HiThink报价/日线准入行为不改。原mapped/identity/HTTP/金额/日期/业务错误定义不改、不重做1002分类，不擅自改账户、准入、路径或研究资格。先定向原HTTP/身份/准入/时钟/SDK/新投影，再受影响和静态门禁、库存、正式最小目标，未过层级保持未勾选。

完成新增 `data_provider/hithink_cash_capability.py`、`tests/test_thesis_ledger_hithink_cash_capability_path.py`；修改 hithink来源一binding、原HiThink guard资源端口/response模块、公共event入口/adapters/Runtime、price_route_access通用当前准入解析、能力边界及原HTTP测试的注入模块位置。原execute_hithink_events_v3及生产Runtime透传退役，最后现金控制/执行特判删除；全部事件目录/修订由binding派生。没有改原SDK/mapped/identity/单位/日期/业务错误，不扩大HiThink研究/所有退市覆盖。

首轮原HiThink/Tushare/登记/RQ四文件105通过/5警告；增加新HiThink能力路径共五文件116通过/5警告（`/tmp/tl-cap-h07-hithink-cash-directed-final.log`），命令 `env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q` 后跟 hithink_cash_capability_path、hithink_events_v3、tushare_events_v3、tushare_event_registry_v3、rqdata_events_v3 五测试。新增11项：共用CASH合同与原wire逐字段回环，原0.880/十份→0.088/份、原登记/除息/支付日期、原身份字节/观察摘要/覆盖未知和<=30s预算；坏币种/摘要/未来1ns/伪造可见性/浮点金额/重复拒绝且仅一次原fetch；坏参数零生命周期；共享时钟与原HiThink 1ns/1024位精度等价。原HTTP注入从退休事件执行模块调整到实际source handler，未改断言。环境与Control凭据、缺原文、轮换/撤销/晚到、其他现金行为保持。

K37e134文件追加新能力路径、原hithink_mapped_dividend_read、原identity、原SDK reader/normalize五文件，共139文件2201通过/1跳过/27警告（`/tmp/tl-cap-h07-hithink-cash-regression.log`）。独立四文件 placeholder_read、research_semantics、dividend_contract_v3、stock_error_semantics 兼容组71通过/2警告（`/tmp/tl-cap-h07-hithink-cash-compat.log`），不恢复已取消语义或重复1002修复。最终syntax/flake8/能力边界三原命令退出0（`/tmp/tl-cap-h07-hithink-cash-{syntax,gates,boundaries}.log`），门禁禁止恢复公共HiThink事件/Runtime透传。

库存 `/tmp/tl-cap-h07-hithink-cash-inventory-final.json` SHA256 `c2426454a574a9eb14093b7e5ca45c2bc41b84e957c12a827d442545b34e1d8d`：19来源/140绑定/140目标/327模块/333输入。完整Provider声明及精确目标与K37e相同，归一比较证明每个exactRoute恰好一个binding；原HiThink mapped/identity/HTTP reader/normalize/dividend_contract五模块SHA相同。当前全部精确目标本地移植完成，只证明现行注册/执行接缝与已测合同范围，不以数量关闭H07真实消费、H08控制缓存、H09新冻结或浏览器验收。

目标：infra正式 `env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh dsa` 兼容预检通过/退出0/healthy，日志 `/tmp/tl-cap-h07-hithink-cash-sync-dsa.log`，原镜像不变/仅写层。目标导入19来源/140binding/140目标，七事件标准binding，两拆分/五现金复用各自相同CONTRACT；HiThink接口修订原值，无当前HMAC时resolver=None（`/tmp/tl-cap-h07-hithink-cash-target-registry.json`）。原DsaClient政策/Provider前后84/84全部语义字段相同、目录complete/140；HiThink enabled=true/credentialConfigured=true/configVersion5，但现金index0 not_admitted，公告index1 admission_expired，不eligible（`/tmp/tl-cap-h07-hithink-cash-target-{before,after}.json`）。无新政策/准入/凭据/故障或成功数据请求，真实来源、目标成功消费、浏览器、新冻结未覆盖。

当时状态记录：`[ ]` H07-K37f-live：HiThink现金目标成功消费，目前未获准入；不自动更新真实准入或新增宽松研究协议。
