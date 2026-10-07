# 交接续接的集中 Review 与门禁收口

## 范围与结论

以[完整 Spec](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md)的 M1/M2/M3、AC01–AC20 和[唯一 Task](../2026-09-25-multi-source-adjustment-aware-backtest.md)为准，对本批实际最终源码、必要调用点、跨仓合同和证据做集中核对。目录的 117 个唯一编号仍是 116 个固定项加 R07.8 模板；未把已完成子叶再次派发，也未把未勾选父项当成零工作或自动通过。

结论是**局部实现和若干定向回归完成，整体验收未完成**。DSA 官方完整离线门禁两轮均未通过，依赖它的目标同步跳过；真实来源权限/历史覆盖、S05 最终资格、HiThink 普通 Run、独立真实对照、AI、浏览器/客户端与 M2/M3 原子来源门禁仍开放。I01 原始冲突已在后续节定位并修复，受控集成通过；这不是上述真实验收。后续没有第三次同前提 DSA 全包尝试、真实 Provider/AI 请求或目标数据库/应用容器操作；隔离测试容器另按证据精确清理。

## 源码与合同核对

| 面 | 实际检查及当前边界 |
| --- | --- |
| S05 | 核对归档内容读取和新时钟 helper：v2 的归档观察/Bar/availableAt 使用精确瞬时比较，实际 `Date` 抓取时刻只保留真实毫秒；v1 维持旧合同。66 项定向通过只授 `archives-bound`，不授历史 `qualified`。 |
| M26 身份与 wire | 核对 DSA resolver、映射读取、精确事件库存与生产入口、Schema 原文/准入分支以及 Server 在线 selector/离线 Snapshot 消费。共享 wire 只在 `data/CN/ETF/CASH_DISTRIBUTION` 的 `tushare/tushare` 上接收独立原文；Server 重算原始 UTF-8 SHA，读取前后核对当前准入、原文、凭据及安全配置。公开覆盖仍为 `complete=false`，本地合成成功不授真实身份、权限或历史完整性。 |
| M26 Review 修复 | 初次源码核对发现 `urlsplit` 错误接受 authority 反斜杠，[反例及修复](2026-09-28-cont-m26-url-authority.md)完成；随后核对发现畸形百分号/代理项主机名同样可错误通过，[14 个反例及修复](2026-09-28-cont-m26-url-host-proof.md)完成。最后相关两文件 217 项通过，非法原文在策略、目录、环境与 Control 账号、适配器和来源读取前拒绝；正常 Unicode 路径和合法百分编码主机名仍通过。未改原 bytes、Schema dist 或真实准入。 |
| M3 请求与报价 | 核对显式 `.SH/.SZ` 个股资金流参数、两个 Manager 入口的原请求身份与 CN 缓存作用域，以及东财股票/ETF 快照唯一精确原行选择。裸码不得猜交易所或退回默认标的；重复目标不能取首行。数值单位、日期/来源时间和其他候选的真实资格仍未证明。目录 HTTP 边界测试只证明传输/解析拒绝，不证明 `dt=kf` 分类或完整目录覆盖。 |
| 回归与兼容 | V3目录新增 Tushare 精确现金事件、RQData 仅注册空宽能力、HiThink ETF/股票分属独立 source；旧三项库存断言修正后 3 定向及 60 关联通过，生产适配/manifest未放宽，V2 错配拒绝与正确配对未准入保持。requirements 两处注释改 ASCII 且 44 条依赖声明不变；Yfinance 固定测试时钟保留 365 天产品逻辑；两个内部配置键声明隐藏且仍不在字段投影，未修改生产 UI 过滤、鉴权或 fixture 行为。 |

## 验证分层与失败

- Schemas 最终相关输入的全包为 45 文件/546 通过，typecheck/build 与限定质量门禁通过；Server 为 228 文件/1769 通过、24 文件/88 skip，typecheck/build、限定 lint/格式、边界/依赖及真实 HEAD 尺寸 ratchet 通过。当前逐文件复查 Server 889 份源码/配置输入与 1950 份 dist 文件，相对[稳定证据](2026-09-28-cont-server-stable-gates.md)均零不匹配；新 DSA/说明文档改动不重跑未失效的高成本 TS 检查。
- DSA [完整离线门禁](2026-09-28-cont-dsa-stable-gates.md)首轮因隔离副本遗漏 `src/data` 在收集阶段 225 errors/零测试执行；唯一重试完整运行后为 7208 passed、16 failed、1 skipped、4 deselected，不能称全包通过。重试前最终低层顺序存在偏差，随后 syntax/critical 为0；HOME 未显式固定、native 子进程/Node PATH 等隔离不足，不能宣称 OS-wide 隔离或已证实零真实账号读取。
- 16 个历史失败中，5 个是native子进程被guard阻断、1 个是隔离 PATH 缺Node；本检查点有7个原断言在改变后输入的定向检查通过（库存3、requirements1、配置1、Yfinance2），当时其余 AlphaVantage/Finnhub 无key归一值2项与 LiteLLM `prompt_cache_key` 透传1项仍开放，见[只读分诊](2026-09-28-cont-dsa-residual-gate-triage.md)。后续定向续接见文末。这些分类不是新全包结果，不能从 16 减去局部通过数后猜测当前全包总数。
- 新修复后的 DSA 源码、测试、`requirements.txt` 与失败全包使用的输入已不同；没有第三次官方全包。常规整文件 style 对既有大文件及配置测试仍有存量诊断，只有各证据记录的限定质量检查通过。目标 Docker/HTTP/Server/Worker、真实 Provider/账号、隔离 PostgreSQL、浏览器和 AI 仍按各自未执行或历史失败等级记录。

## 跳过与恢复条件

DSA 本门禁按用户要求在一次隔离修复重试后保留失败并跳过目标升级，不能把定向测试重算为第三次全包。当前 `requirements.txt` 已修改；如果后续在门禁前提改变且获得相应授权后确需把本批 Server 与 DSA 同步到目标，应按项目规则核对相邻 infra 的官方 `update.sh all` 入口，不能把 `sync-code.sh`、旧镜像/容器健康或此前批次同步当成本批目标验收。此处仅记录选择条件，未执行更新。

S05 原发布/场所/日历/修订原文、I01 原 ORM 完整响应、HiThink 目标 ETF 准入、目录分类、资金流金额单位、财务字段身份/倍率、Tushare/RQData 权限和历史覆盖等未获得新事实；既有耗尽预算不因本批换叶重置。真实普通 Run、独立同 Bar/费用/时序对照、AI 封存实验与 UI/Electron 验收仍须分别完成。主 Task §13 保持未勾选；本 Review 是检查点，不是功能或 goal 完成证书。

三仓 HEAD 未变且 staged 为0；主仓/DSA 大量未提交 WIP 全部保留，infra 无本批修改。全部本批子任务及必要测试进程已结束。最新 Task/Spec、DSA 能力 SSOT、M2 门禁和变更记录的本地链接复核无缺失。

## 2026-09-28 后续定向续接

- [无 key 回归](2026-09-28-cont-dsa-empty-key-regression.md)：AlphaVantage/Finnhub 两旧断言原为 2 failed，修后精确 2 passed、两文件 31 passed；缺 key 仍在 HTTP 前拒绝，生产抓取器未改。
- [缓存边界只读发现](2026-09-28-cont-dsa-prompt-cache-boundary.md)确认原 LiteLLM 直调断言把应用责任放到了第三方 SDK，但 DSA YAML 的预置 `prompt_cache_key` 的确可经 Analyzer、Agent、screening Router 透传。随后[核心修复](2026-09-28-cont-dsa-prompt-cache-core.md)以 Analyzer localhost wire 捕获复现修前透传、修后未验证无键、模拟 verified 仅派生 HMAC，定向 136 passed；[消费面修复](2026-09-28-cont-dsa-prompt-cache-consumers.md)覆盖 Agent 两处和 screening 一处 Router，模拟合并捕获及相邻检查 50 passed。原配置与非缓存参数保留，三个旧生产大文件均未增长。
- 父级合并验证在同一 DSA 输入下运行九个相关文件，**202 passed、2 条第三方弃用 warning**；本轮没有新增失败或第二次尝试。原完整离线全包仍是两轮历史失败，未第三次运行；5 个 native guard 和 1 个 Node PATH 隔离失败及 HOME/账号读取边界未补证。真实 Provider、目标 Docker/HTTP/Worker、AI、UI/Electron、AC01–AC20 的其余条件均未因此通过，主 Task §13 保持未勾选。

## D01 多窗口局部对账

[D01 本地证据](2026-09-28-cont-d01-window-verification.md)确认生产 V3 API 到受预算/准入约束的多窗口读取、逐次全部交集比较、完整 `windowObservations`、共享协议与 Server 本地文件冻结/离线重放已有接线。此前补 DSA 单位口径、调整口径和实际 Bar 无交集三条拒绝反例；三项、DSA 多窗口 20 项与准入 14 项、Schemas 14 项、Server 9 项均通过。后续 I01 JSONB 修复解除原数据库卡点，[隔离数据库消费](2026-09-28-cont-d01-pg-consumption.md)已验证原响应到 Snapshot artifact 及重放；真实 G0-H、原标的跨窗响应、目标 `D01-runtime` 和父 D01 继续开放。Desktop 优化结果以 Run 引用跳详情页，V3 详情已有实际来源/基准/执行模型披露；当前只读审查未发现新的独立 Ready Desktop 叶，目标浏览器/Electron 仍待验收。

## R02.12 指数行唯一性

[本地实施证据](2026-09-28-cont-r02-12-efinance-index-identity.md)记录 Efinance 指数重复目标先红后绿：修前静默取首行，修后只接受恰好一条代码匹配行，其他唯一指数仍保留。定向 5 项、相邻指数/报价合并 32 项通过；生产大文件全文件 flake8 存量告警未消失。R01 剩余叶经只读核对仍受分类、历史状态 Consumer 或来源端点前提约束；R03 暂无独立纯本地叶。R02.12 只关闭本地行选择，不推定来源实际 endpoint、同源、单位、时点、权限及 G0-M，也不改变 DSA 全包失败和目标未更新的状态。

随后[来源与完整身份核对](2026-09-28-cont-r02-12-efinance-upstream-identity.md)把上述首轮“代码匹配”进一步收紧：本地及当前运行中 DSA 容器均为 `efinance 0.5.9`，相关包源码哈希一致，该入口静态指向 EastMoney HTTP `clist/get`，返回的 `行情ID` 将市场编号与代码组合。合成错市场、缺完整身份及同代码跨市场反例先红后绿；最终 getter 7 项、相邻合并 34 项通过，其他字段与 Consumer 不变。当前容器应用源码未同步，依赖版本仍未锁定未来构建，也不能把 EastMoney 的两个封装计为独立备用。R02.12 的实际传输、字段单位/时点和 G0-M 继续开放；上段 5/32 是此前检查点，不是最终测试数。

[R02.7 股票回退身份](2026-09-28-cont-r02-7-efinance-fallback-identity.md)继续核对同包的另两条调用路径：单标 `SHSZQuoteSnapshot` 为 EastMoney HTTPS，股票失败后全市场回退为 EastMoney HTTP `clist/get`；行业板块查询也走后者。回退重复目标取首条的反例先红后绿，最新四文件合并 35 项通过；ETF 仍不回退全市场。测试文件已有 `E731` 和生产大文件存量 lint 告警不作为本轮通过项。该本地修复与来源静态核对都不证明实际回退、行业板块、单位/时点、传输安全或 G0-M 准入。

进一步只读发现 Efinance manifest 的 `efinance` source alias 与实际 EastMoney 上游不一致，而 Runtime 将选中 alias 原样写入执行元数据。已在唯一 Task 登记跨路由兼容迁移前置；旧 Desired/Effective、冻结引用及预算/健康键未清点前，不把简单改名视为修复，也不计独立备用。该缺口仍属未完成合同，不因报价行选择通过而关闭。

R03 净值来源目录随后与当前代码对账：Efinance adapter 已使用直连 EastMoney HTTPS 的有界分页 Reader，`FUND_NAV` 与 `FUND_NAV_HISTORY` 经同一历史入口消费；旧 SDK 路径仅是先前目标探针的历史。能力目录及原[净值来源证据](../../../../daily-stock-analysis/docs/thesis-ledger-nav-source-evidence.md)已校正该时间语义，净值分页/Efinance 两文件 25 项本地测试通过。本次未复跑真实来源或目标；披露时刻、修订、完整覆盖与 G0-M 仍开放。

上述 Efinance 报价/指数、Sina/Tushare 指数与 EastMoney 净值分页在最终相同输入下合并运行五个 DSA 文件，47 passed、2 条第三方弃用 warning；这是定向合并，不倒填已失败的 DSA 官方全包，也不证明目标容器包含最新源码。

## Efinance 新建默认路由

[跨仓定向证据](2026-09-28-cont-r02-efinance-default-source.md)将新建 V2 默认策略的 Efinance 报价与净值四组 RouteTarget 指向 `eastmoney`，DSA Efinance manifest version 2 对该 source 精确登记可执行能力。预检先抓到 Server 默认旧 alias 与 DSA source 只有日线两道拒绝；修后 Server 20、DSA Control/V2/V3 36 项通过，Server 类型/build、限定质量与 DSA 编译/lint 通过。显式及持久化旧 `efinance` 路由保持原字节；其执行元数据、冻结、预算/健康键迁移和目标部署仍未完成，不能据新默认值关闭独立备用或 G0-M 门禁。

[AKShare 净值默认来源证据](2026-09-28-cont-r03-akshare-nav-default-source.md)继续把新建 `FUND_NAV/FUND_NAV_HISTORY` 的 AKShare RouteTarget 标为 `eastmoney`，DSA AKShare manifest version 2 为该精确 source 补两项净值能力，其他 AKShare 能力及旧 alias 不变。Server 20、DSA Control/V2/V3/净值分页 49 项通过，类型/build/限定质量通过。默认净值两个 Provider 均为 EastMoney 包装，不能视为跨独立上游备用；旧策略与冻结的 alias 迁移、目标运行态、披露时刻/修订/完整覆盖和 G0-M 均未完成。

[AKShare 股票报价新建默认来源证据](2026-09-28-cont-r02-akshare-stock-quote-default-source.md)把新建 `REALTIME_QUOTE/STOCK` 的 AKShare RouteTarget 改为 `eastmoney`，DSA manifest version 3 对该精确 source 补股票报价，Runtime 分发到旧 adapter 的 `em` 参数。Server 默认修前 1 failed、修后 20 passed；DSA source 缺能力修前失败，修后四文件 66 passed。Server 类型/build/限定质量及 DSA 新模块、Runtime critical 检查通过。本机 AKShare `1.18.94` 的目标函数静态指向 EastMoney HTTPS，不证明目标应用同步或真实传输。旧 `akshare/akshare` Desired/Effective 与冻结身份保留，新增 `CONT-R03-akshare-source-alias-migration` 待与 Efinance alias 共同固定版本化合同；两家默认报价同源，不能计独立备用。DSA 官方全包既有失败预算未重置，目标更新、G0-M 及 Spec 全部验收仍开放。

## I01 完整响应数据库回读

[根因与恢复证据](2026-09-28-cont-i01-jsonb-orm-fix.md)将原未定位的完整响应冲突落到 Prisma ORM JSON 参数写入：真实仓库修前隔离 PostgreSQL 回读有 22 个合成浮点值发生 1 ULP 变化，原生 JSONB SELECT 诊断的零差异不覆盖这一路径。现用参数化 JSON 文本原子写入完整响应和摘要，空载荷条件填充也保留位模式；隔离 ORM 复验两条写路径均零差异。Server 相邻 83 项、本轮包级退出 0、类型/build/限定质量/边界和带 HEAD 基线尺寸门禁通过。源码变化后的原 I01 受控 Reader/HTTP/队列/生产 Worker 组合 1 项通过，隔离 PostgreSQL/Redis 已清理。仅关闭 I01-reader-pg 子门禁；真实 HiThink、完整 PIT/来源资格、目标运行态、DSA 官方失败全包、I01 父依赖及完整 Spec 验收不倒填。

[D01 数据库消费证据](2026-09-28-cont-d01-pg-consumption.md)进一步把合成多窗口父响应的 19 条 Bar/两份子观测经真实 PostgreSQL 证据仓库写读后交给 Snapshot Builder：artifact 原样、离线重放一致、数据库内子观测晚到篡改拒绝。只关闭受控 `D01-consumption`，不把隔离数据库当真实 HiThink 来源、目标运行态或 `D01-runtime`；全局 AC01–AC20 仍开放。

[D01 受控 HTTP/Worker 证据](2026-09-28-cont-d01-controlled-http-worker.md)再将双窗口父响应送入实际 DSA 客户端、V3 Reader、PostgreSQL、普通 HTTP 创建、BullMQ 和独立生产 Worker；多窗口/旧单窗口均成功且重放一致，损坏快照按 `DATA_UNAVAILABLE` 失败，16 张业务账本表哨兵不变。首轮新能力读取次数断言过窄，修正后唯一重试 1 passed，资源精确清理。该证据只关闭 `CONT-D01-controlled-http-worker`，目标 `D01-runtime`、真实 HiThink G0-H 和整体 AC01–AC20 不变。

[S03 父项对账](2026-09-28-cont-s03-parent-reconciliation.md)在 I01 完整响应位模式修复后复跑当前缓存/Reader/仓库定向 36 项及隔离 PostgreSQL 10 项；版本共存、来源隔离、legacy、缺窗及日期末端合同的原证据仍适用，临时库完整 migration/独立应用角色和清理通过。S03 按自身本地/隔离数据库条件关闭；它不关闭 S04/S05 的真实来源和严格 PIT 资格，也不能把此前目标同步当成本批源码已部署。

[S04 整窗口选择对账](2026-09-28-cont-s04-parent-reconciliation.md)在 S03/C04 前置完成后复跑 Selector/Reader/委派及旧边界 28 项；有效兼容证明才允许同窗备用，缺窗、预热、目标/修订错配与第三源边界均保持失败关闭。实际主源 Reader 经受控 HTTP/数据库/Worker 组合，但没有真实 HiThink 或备用来源准入、目标应用更新和严格 PIT 历史资格；仅关闭 S04 本地实现父项。

[Efinance ETF alias 预算证据](2026-09-28-cont-efinance-etf-alias-budget.md)修复同一单标 adapter 可因旧/新 source 切换而绕过 600 秒持久冷却：旧 alias、规范键及 V1 无 source 键在同一事务查询，后续仅写规范键，旧记录与路由/冻结身份不动。受控红例 4 failed、1 passed；测试夹具一次定向修正后六文件 81 passed。此叶不迁移历史 Desired/Effective、准入、健康/熔断或跨 Provider 同源判断；DSA 官方全包既有失败、真实来源和目标应用均未重新验收。

[两侧只读库存](2026-09-28-cont-source-alias-inventory.md)确认目标当前和历史 V2 Policy 均含旧 alias，DSA 健康/已到期预算行仍按 source 分隔；Server V3 行情证据和事实缓存为 0，109 份旧 Snapshot manifest 未见精确 RouteTarget，但不排除工件与旧格式间接引用。只读聚合不打印原文也不写目标。预算局部修复之外的准入、健康/熔断、逐能力物理来源、旧冻结/审计与目标迁移仍需版本化合同，R02/R03 alias 父项继续 `needs_contract`。

[Efinance ETF alias 健康证据](2026-09-28-cont-efinance-etf-alias-health.md)将同一 ETF 单标 adapter 的旧/新 source 与 V1 无 source 健康 open 合并为规范熔断作用域：未过期旧 open 优先于新 closed，过期仍半开探测，新写入仅规范键，路由和执行来源原文不变。修前 4 failed、2 passed；修后本叶及相邻 97 passed，官方 syntax/critical flake8、限定完整 lint 与编译通过。本叶只关闭 ETF 报价健康绕行，不推定其他能力/Provider、旧冻结、准入、真实来源或目标容器已验；完整 alias 父项仍 `needs_contract`。

[AKShare 股票 alias 健康证据](2026-09-28-cont-akshare-stock-alias-health.md)基于旧 V2 默认 `em` 与新 V2 显式 `em` 的同调用事实，仅合并股票东财双 alias 的持久健康和进程内熔断；V1 无 source 实为新浪，保持独立。红例 5 failed、2 passed，修后含 Efinance ETF alias 与相邻路由/Control/Runtime 共 119 passed，官方 syntax/critical flake8 和限定完整 lint 通过。未变更执行来源、历史策略/冻结、其他 AKShare 能力或目标环境；R03 alias 父项、G0-M 及 AC01–AC20 仍开放。
