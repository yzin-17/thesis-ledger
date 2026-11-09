# 策略标的目录选择实施证据

任务：[策略标的目录选择](../tasks/2026-11-07-strategy-instrument-selection.md)。

## 原因与修复

Desktop 的 `StrategyConfigurationFields` 按默认执行标的的 `CN/stock` 限定搜索，并提供手动资产类型选择；Mobile 也依赖用户先选市场和类型。共享搜索本身不限定这些市场。

新增 `packages/domain/src/strategy-instrument-selection.ts`，拥有交易所/净值模式可选范围、目录身份投影与 `execution` 信号源原子更新。领域仅依赖中立的目录字段，不依赖 Schema 或客户端；现有模块依赖方向未改变，边界检查通过。

Desktop 与 Mobile 手动编辑复用该规则及现有 TanStack Query 目录搜索，搜索输入与提交身份分离；选中结果自动写入完整代码、市场和类型，取消人工类型/市场选择。更换输入或清空后执行代码为空，保存校验不会把名称搜索词或上一身份当成新选择。已有版本只读加载、独立信号源、周期与原始资金精度保持。

自然语言确认页已读取目录的市场及类型，本轮只核对并保留；高级 JSON 仍沿用原有显式编辑/应用和校验。

## 验证

- 领域定向 15 项、完整领域包 782 项通过；Desktop 三份定向测试 26 项通过；Mobile 两份定向测试 15 项通过，覆盖港股 ETF、美股股票、内地 ETF 的实际受控保存内容与保存响应丢失恢复。
- 领域、Desktop、Mobile 构建通过，包含两端 TypeScript 检查；新增与修改源码及测试的定向 ESLint 通过；`scripts/check-boundaries.mjs` 通过。没有提高阈值、修改依赖或原生配置，不将 TypeScript 检查称为真机验收。
- 实际最终构建页面在 1440、1024、768、390 验证目录下拉：五项可选交易所结果、场外基金过滤、弹层边界及无横向溢出。等待视口变化后的弹层定位收敛再量取，保留早期瞬时位置失败记录；没有修改共享浮层。
- 在隔离受控目录中切换盈富基金、苹果公司、沪深300ETF 和标普500ETF，逐次读取高级 JSON 核对执行标的及信号源一致。未选结果、目录失败、清空不能提交；最后一次隔离保存实际提交 `SPY.US/US/etf`，一个受控业务写请求，无页面异常。
- 日志 `/tmp/strategy-instrument-*.log`；浏览器脚本、截图、请求与结果位于 `/tmp/strategy-instrument-selection/`。受控数据不代表真实港美目录或模型/行情来源验收。

## 真实目录初始缺口

只读查询当前 PostgreSQL `Instrument` 按市场与类型分组：BJ 股票 363、SH 股票 2468/ETF 948、SZ 股票 3095/ETF 772、OF 基金 28326；没有 HK 或 US。真实只读搜索 `00700.HK`、`AAPL` 无对应港美记录，结果见 `real-directory.json`，不得把模糊匹配到的内地记录当成港美标的。

初始 DSA `thesis_ledger_catalog.py` 的 Loader 只有 AKShare 与 efinance 内地集合。简单重新同步不能补齐港美，直接替换快照还可能破坏现有完整集合语义。用户随后选择已有富途账户，G2 按下述范围实施。

## 富途目录实现与本地验收

复用已启用且已配置的富途 OpenD 账户快照（真实 `/api/market-data/providers` 确认），不改账户、路由或准入。按[富途官方静态数据合同](https://openapi.futunn.com/futu-api-doc/quote/get-static-info.html)及本地 SDK，使用 `code_list=None` 读取港股股票、港股 ETF、美股股票、美股 ETF 四集合，每集合一次、子进程总硬期限 60 秒、无重试或新增订阅费用。逐行校验原生市场/类型、名称、退市布尔值和唯一身份；任一集合失败不返回部分结果，明确退市记录排除，连接始终关闭。

DSA 新增 `futu_catalog.py` 来源读取与 `thesis_ledger_catalog_refresh.py` 按市场合并/执行模块。`scope=HK_US` 显式写入目录任务，旧 SQLite 加法升级默认 `CN`；异范围任务互斥，同范围仍去重，港美租约超时不自动补投。执行职责从原控制文件提取，该文件净减 35 行，保留原发布事务及租约条件。刷新只替换自身范围，复用经 checksum 校验的范围外记录，后续内地同步同样保留港美。

Server 同步入口、DSA 客户端和任务响应合同接受范围；请求绑定范围，不能把默认内地任务当成港美完成。原快照、增量、checksum、generation 与 ACK 流程继续复用，没有新增 Nest 模块或反向跨领域依赖，边界门禁通过。

- DSA 最初定向 81 项通过；加入范围请求持久化回归后，完整 `./scripts/ci_gate.sh` **7588 通过、315 子测试通过、1 跳过、4 网络测试排除**，全部门禁通过，日志 `/tmp/strategy-catalog-dsa-gate.log`。
- Server 目录定向 30 项、市场及消费者回归 **1075 通过/35 跳过**；Schema 完整 **1489 通过/3 跳过**。相关构建、定向 ESLint、边界及 diff 检查通过；尺寸门禁保留 6 个存量警告，通过，不提高阈值。
- 首次执行 Schema 定向命令误用了不存在的 `test/market-*.test.ts` 路径，未收集测试；改用实际 `src/market-client-projections.test.ts` 并完成包级测试，未将未收集计为通过。
- 首次 Server 快更在宿主构建阶段遇到并发回测修改中尚未生成的 `request.policy` 类型，退出 1，未替换容器文件；等待对应 Schema 源码就绪并构建后重走正式入口。首次 DSA 正式更新因现有 `.venv/bin/python` 断链退出 1；使用脚本已有 `LONG_BRIDGE_SOURCE_PYTHON` 指向本轮已验证解释器，不修改依赖或绕过门禁。

## 目标更新与真实来源验收

部署前独立只读基线：PostgreSQL 33 个策略、账本等保护表共 4222 行，以及 DSA 5 个账户/配置/策略/准入表内容摘要；内地有效目录 35585 条（初始分组数字包含非活跃历史行），DSA generation 31。摘要位于 `/tmp/strategy-catalog-before.json`、`/tmp/strategy-catalog-directory-before.json`。后续结果在此节记录；本地测试不代替真实目录成功。

- 从 infra 工作目录执行 `./scripts/sync-code.sh thesis-ledger` 成功；Server/Worker 镜像仍为 `744b2f…5141c`，当前源码位于可写层，不称为新镜像。DSA 使用 `LONG_BRIDGE_SOURCE_PYTHON=/tmp/market-closeout-python/bin/python ./scripts/update.sh dsa` 成功，镜像 `sha256:86ace638a1fb6072e125ccd1fe9a9a0b5b469eed033cec8a668e3c671de640ed`。挂载、PostgreSQL/Redis 实例保持，运行容器健康。日志 `/tmp/strategy-catalog-sync-server-final.log`、`/tmp/strategy-catalog-update-dsa-final.log`。
- 在真实来源调用前发现 Server 原 checksum 用带点号拼接后地区排序，和 Python 身份元组排序不等价。改为字段元组顺序；Python 独立生成混合市场、变长美股及点号/连字符样本 SHA-256，Server 校验一致。新增/相关 31 项通过，6 个 PostgreSQL 隔离测试因未提供隔离环境跳过；定向 lint 通过。后续正式快更 `/tmp/strategy-catalog-sync-checksum-final.log` 成功；此前一次同入口因并发回测测试的可选字段类型编译失败退出 1，未覆盖运行文件，待该任务输入修复后重走入口。
- 唯一首轮真实写请求为 `POST /api/market-data/catalog/sync {"scope":"HK_US"}`，创建任务 `445095f7-6755-4271-9b97-c69664b985af`。任务终态 `failed`，错误码 `catalog_provider_invalid_response`、不可自动重试；现有诊断未指出具体失败字段，不能推定错误原因或声称四集合均已读取。DSA 仍为 generation 31，无新快照、无 ACK/港美投影。原始结果 `/tmp/strategy-catalog-job-started.json`、`/tmp/strategy-catalog-source-result.json`。
- 失败后比较：内地目录每市场/类型数量及名称/代码摘要完全一致；33 个 PostgreSQL 保护表与 DSA 5 个控制表内容摘要完全一致，全部挂载保持。结果 `/tmp/strategy-catalog-after-source.json`、`/tmp/strategy-catalog-directory-after-failed.json`。没有真实策略、交易或账本写入。
- 已补安全错误诊断，仅包含集合、字段、总行数/行序号；不记录完整证券记录、地址或凭据。受控 `CatalogBuildError` 信息穿过子进程，原始异常继续收敛为通用错误。诊断相关 88 项及新增安全诊断回归通过，完整门禁另行运行；这些修改尚待 DSA 正式快更。首轮停止规则不被静默续用，已通过异步问题请求第二轮四集合各一次、60 秒、无新增费用的诊断确认。
- 真实失败状态经 Server 目录任务接口可正常解析：`acknowledged=false`，现有目录仍为 `ready`、generation 31，`510300.SH` 搜索存在；失败不会把已有目录解释为不可用。最终构建页面透传真实目录查询，其他 API 使用隔离数据，在 1440/1024/768/390 选择 `510300.SH` 均自动生成 `CN/etf` 与一致执行信号源，无横向溢出、页面异常或业务写请求。结果 `/tmp/strategy-catalog-failure-http.json`、`/tmp/strategy-catalog-browser/cn-results.json`；这仍不能替代港美真实可选验收。
- 诊断版完整 `./scripts/ci_gate.sh` **7589 通过、315 子测试通过、1 跳过、4 网络测试排除**，全部门禁通过，日志 `/tmp/strategy-catalog-diagnostic-gate.log`。首次 DSA 快更遇到另一任务的活动更新锁，未删除锁或并发绕过；其结束后从 infra 工作目录执行 `./scripts/sync-code.sh dsa` 成功。DSA 五个运行文件与宿主源码 SHA-256 一致，诊断更新位于既有镜像可写层，不声称已重建诊断版镜像。日志 `/tmp/strategy-catalog-sync-diagnostic-final.log`、`/tmp/strategy-catalog-runtime-hashes.json`。
- 该检查点保护摘要再次确认：PostgreSQL 33 表/4222 行、DSA 五个控制表及全部挂载与基线完全一致；数据库与 Redis 实例未更换。当时保留 G2.3/G2.4 未勾选，不归档、不转移 TODO、不提交；解除条件为用户确认下一轮有界真实诊断，再据字段证据继续投影和搜索验收。

## 已授权诊断与身份范围修复

用户随后明确回复“允许诊断并继续完成”。在此授权下创建唯一诊断任务 `945cd42b-7caf-4fe8-8174-52c1ba2aaa38`；终态失败，精确诊断为 `HK/STOCK；代码格式；length=9；rows=3807；row=3050`，仍未发布 generation。该轮在首个集合的记录校验处停止，没有声称读过剩余三个集合。结果 `/tmp/strategy-catalog-diagnostic-result.json`；只保留集合、字段与计数，没有读取账户交易或输出具体异常记录。

此前读取器把所有原生代码都当作产品已支持的可选身份，导致任意不支持格式阻断整个集合。实际项目报价身份合同只支持五位港股以及既有美股代码范围；不能通过扩大目录格式让用户选到后续接口拒绝的身份。修复将原生校验与产品可选范围分离：先验证来源市场前缀、明确类型、名称、退市布尔值与唯一性，再分别排除明确退市/不支持的原生格式，记录每集合输入、纳入、退市排除及范围排除数量。每集合必须仍有可选条目，来源错市场、类型、未知退市或重复仍整体拒绝，不截断、补位或猜测代码。

新增支持范围排除计数及“不支持格式不能掩盖类型错误”反例，相关 **91 项通过**。沿用用户继续完成的授权，已告知修复后仅再执行一次最终同步：四集合各一次、60 秒、无新增费用，新异常即停止。完整门禁、目标快更与此后真实来源结果分别记录，不复用先前失败作为成功证据。

该版完整门禁 **7591 项/315 子测试通过**，通过 infra `./scripts/sync-code.sh dsa` 更新。任务 `c78b046d-3305-42ce-8b17-cb742ce7c8aa` 完整返回港股股票 3807 行（纳入 3063、支持范围排除 744、退市排除 0），港股 ETF 484 行全部纳入；US/STOCK 13078 行在第 1522 行原生代码校验失败，整个任务失败，不发布两组港股部分结果。结果 `/tmp/strategy-catalog-live.json`、`/tmp/strategy-catalog-source-counts.json`，保留未完成记录。

进一步自审确认 SDK `Security.code` 为不透明字符串，`merge_qot_mkt_stock_str` 原样拼接原生代码，不能为其擅自规定产品字符集。来源层改为检查市场前缀、非空、长度和控制字符；原样保留身份进行唯一性检查，再用现有产品身份合同筛选可选目录。新增美股带特殊字符的原生标识排除、类别股原样保留、错市场/空值/过长/控制字符仍拒绝等测试，相关 **97 项通过**。已向用户说明此修复及继续执行的同一四集合、60 秒验收上限，不更换来源或增加费用。

本轮最终读取前重建保护基线：33 表/4223 行。相对上一轮仅 `StrategySubmission` 从 0 行变为 1 行，发生于本任务不涉及该表的并发窗口；DSA 五个控制表、账本与交易摘要保持。不将其他流程的这条变化归入目录写入，也不再声称跨整个并发窗口全部表未变。基线 `/tmp/strategy-catalog-before-final-read.json`，最终同步后按这份实际基线比对。

## 最终真实验收

最终版完整门禁 **7597 项通过、315 子测试通过、1 跳过、4 网络测试排除**，全部检查通过，日志 `/tmp/strategy-catalog-opaque-gate.log`。从 infra 工作目录执行 `./scripts/sync-code.sh dsa` 成功（日志 `/tmp/strategy-catalog-sync-opaque.log`），未再构建镜像；最终五个源文件与目标 SHA-256 一致，镜像仍为 `86ace6…640ed`，代码更新位于可写层。Server/Worker 同样沿用既有镜像及正式快更，不能将此证据表述为最终镜像或生产发布。

唯一最终任务 `1f72a1a6-17cd-4a0d-b4e2-f25b4079c797` 成功，generation **32**，checksum `86e84f0cb7a24d3790ab5dcd3dead8b4eb74ea1ed947d864fc45e476b8435080`。Server 应用增量 **23016 条**、删除 **0 条**，`acknowledged=true`；最终有效目录 **58601 条**。同轮来源 SDK 四集合各一次，统计如下，不把排除记录推定为退市：

| 市场与类型 | 来源行数 | 纳入目录 | 不支持格式排除 | 明确退市排除 |
| --- | ---: | ---: | ---: | ---: |
| 香港股票 | 3807 | 3063 | 744 | 0 |
| 香港 ETF | 484 | 484 | 0 | 0 |
| 美国股票 | 13078 | 13060 | 18 | 0 |
| 美国 ETF | 6409 | 6409 | 0 | 0 |

结果 `/tmp/strategy-catalog-final-live.json`、`/tmp/strategy-catalog-final-counts.json`。真实搜索逐项确认 `00700.HK/STOCK/腾讯控股`、`02800.HK/ETF/盈富基金`、`AAPL.US/STOCK/苹果`、`SPY.US/ETF/标普500ETF-SPDR`，同时 `510300.SH` 保留原名称与类型。

实际最终构建页面在 **1440、1024、768、390** 分别选择上述港美结果，读取高级 JSON 确认执行标的与 `execution` 信号源自动写入对应市场和 `stock/etf`；弹层无越界、页面无横向溢出、无异常、真实业务写请求为 **0**。目录查询透传真实 Server，其他界面元数据使用隔离样本。第一次 SPY 浏览器定位采用子串匹配，同时匹配到 GSPY 等真实结果；只将测试定位改为精确代码文本后通过，没有修改产品或再次请求 Provider。结果 `/tmp/strategy-catalog-browser/results.json`、截图 `search-*.png`，日志 `/tmp/strategy-catalog-final-browser-verified.log`。

最终保护比对：内地 **35585 条**目录的市场/类型数量与代码/名称摘要、DSA 内地条目摘要均与最初基线一致。最终读取前 33 个业务保护表/4223 行、DSA 五个控制表及全部挂载内容摘要保持，PostgreSQL/Redis 实例未变。目录状态 `ready`、generation 32、总数 58601 与任务一致。结果 `/tmp/strategy-catalog-complete-verification.json`、`/tmp/strategy-catalog-protection-complete.json`、`/tmp/strategy-catalog-directory-complete.json`。

最终审查覆盖 AC1–AC8：实现、失败保留、范围更新、两端身份、当前来源与目标投影、界面和数据保护证据一致；无剩余当前义务。保留本记录全部失败和授权变化，归档已完成 Task 与本专属证据，Spec 继续维护当前产品合同。不提交 Git，不将本次静态目录验收延伸为历史可交易性、行情价格、移动真机或生产发布验收。
