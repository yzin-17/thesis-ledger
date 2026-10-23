# 富途行情与研究交付验收证据

> 日期：2026-10-15～17；实施记录：[已完成富途 Task](../../archive/tasks/2026-10-08-futu-openapi-full-integration.md)；稳定合同：[Spec](../../specs/2026-10-08-futu-openapi-full-integration.md)。本页保存执行事实，不维护另一套待办。

## 执行基线与边界

主仓 `main@da002744bd317b7754832c6ac41d169bcf005e27` 有既有 99 项 docs 修改；DSA `main@dd265715`、infra `main@3f661df` 起始干净。未暂存、提交或推送。既有五个开发容器运行；健康检查仅说明环境存活，不是本轮新代码或功能已验收。

现行任务已包括港美股票/ETF 历史 1 分钟图表，不扩大为订阅、盘前盘后、分钟策略回测或账户/交易。RQ 注册/试用、严格 PIT 等取消范围保持；本轮不购买权限或更换费用预算。

## M1 适配器与日线回归

实现：DSA 新增 `data_provider/futu_history.py` 复用静态身份、日期窗、完整分页和上下文关闭；原 `futu_daily.py` 继续使用原日线规范化。新增 `futu_minute.py` 保留完整当地分钟时间并转换香港/纽约时区，固定 `K_1M/AuType.NONE/extended_time=False`，未知量额不补零；重复/越界/无效 OHLC、游标循环、中途失败与 64 页上限均失败关闭。worker 新增固定 minute 分支，复用现有可终止 4.5 秒子进程。

依据：[富途官方历史 K 线接口](https://openapi.futunn.com/futu-api-doc/quote/request-history-kline.html)与本机 `futu-api 10.8.6808`；官方文档的参数及市场时区已核对。未假定新版接口所有参数可用，未创建交易上下文。

验证（DSA 目录，Python 3.12.14 / pandas 3.0.5 / pytest 9.1.1）：

- `.venv/bin/python -m pytest -q tests/test_futu_minute.py tests/test_futu_daily.py tests/test_futu_market.py tests/test_futu_static_info.py`：103 项通过，其中新增分钟 33 项。覆盖四类市场/资产、美国夏冬时区、同日不同分钟、未知/零量额、非法参数读取前拒绝、分页错误不返回前缀及超时边界；三个既有测试告警不影响结果。
- `.venv/bin/python -m flake8 data_provider/futu_daily.py data_provider/futu_history.py data_provider/futu_minute.py data_provider/futu_query_worker.py tests/test_futu_minute.py --select=E9,F63,F7,F82,F401`：退出 0。
- 尚未调用真实分钟数据、登记分钟目录、同步目标运行态或检查产品图表。M1 只证明局部适配和原日线回归，M2～M4 及 FAPI-11 保持未通过。

M1 一致性 Review：通过本地实现范围；没有新增能力可用性、历史覆盖或部署验收声明。

## M2 共享合同、精确库存与生产 HTTP 接缝

共享交互合同接受港美股票/ETF 的 `MINUTE_BAR/1m/none`；时间戳整分钟、严格递增，分钟结束晚于观察时刻不得声明完成，`session: regular` 显式披露；`latestCompleteTradingDate` 对分钟始终为空。日线同日唯一及完整回测窗口要求保持。Schema 包 1085 项通过（含新分钟 12 项）及构建通过；此后选项 Schema 的周期回显随 M3 消费继续验证。

DSA 复用标准 QueryBinding/CapabilityContract 注册四个分钟精确目标，没有增加账号准入系统。新增分钟强合同与返回前策略/凭据检查，源字段和 worker 留在富途适配层；原 V3 精确策略/目标选择提取到单一模块，原运行时文件从 1590 行减少约 247 行，不继续堆叠职责。分钟不经过日线 DataFrame 校验，也不产生日历覆盖或回测资格。

本地验证：

- `.venv/bin/python -m pytest -q tests/test_thesis_ledger_futu_minute_capability_path.py tests/test_thesis_ledger_chart_v3.py tests/test_thesis_ledger_futu_capability_path.py`：58 项通过。新分钟测试含四类资产的控制/工厂/worker/HTTP 闭环、鉴权、非法口径、完整回测入口拒绝、后页失败及读取期间凭据/政策变化拒绝。
- `.venv/bin/python -m pytest -q tests/test_thesis_ledger_capability_registry.py tests/test_configured_market_routes.py tests/test_thesis_ledger_futu_minute_capability_path.py`：270 项通过。旧“非 bar 不得隐藏复权字段”仍按真实非 bar 键验证；新增分钟 bar 明确暴露口径，未实现 qfq 登记拒绝，未放宽其他查询。
- `.venv/bin/python scripts/check_thesis_ledger_capability_boundaries.py`：通过。
- 首轮分钟链路测试的四个失败是验收替身返回 `(command, kwargs)` 被误读成字典，修正测试读取后通过；策略变化测试首次复用了固定 revision 1 的幂等 helper，改为实际 revision 2 后证明拒绝。来源修订检查发现旧目录只处理 DailyBinding，已补精确分钟 QueryBinding 的修订解析及四目标断言；没有将测试失败记为真实 Provider 失败。

M2 一致性 Review：通过本地合同、精确目录和生产 HTTP 接缝范围；当前未同步分钟代码或读取真实分钟数据。M3/M4/FAPI-11 的 Server/Desktop、真实链路与镜像条件独立保留。

## M3 Server/Desktop 本地消费者与运行态检查点

Server 按 `1m/none` 和市场时区规划窗口、选择精确分钟路由；选项查询先校验参数再读取身份，保留原无效参数不访问数据库的行为。Desktop 保留完整时间戳，以秒时间戳调用 Lightweight Charts；新增时间与范围纯函数，原大型图表减少行数。周期选择复用现有 Query，分钟固定不复权，日线偏好独立保存。未新增依赖、数据库结构或 Native 配置。

验证：Schema 构建、API Client 构建、Server/Desktop 类型检查与构建通过；Server 分钟/reader/选项/详情四份定向测试 29 项通过；Desktop 分钟/模型/图表/读数 23 项、对话框/周期/工具栏 18 项、详情 API/选择组件/分钟 13 项及 Client 选项 8 项通过。全仓 lint/复杂度检查 8 组 2031 文件通过，模块边界、workspace 依赖图及 `git diff --check` 通过。首次 Server 无效日期回归发现身份查询顺序变化，已修复并复验。

DSA 完整 `ci_gate.sh all` 的语法、关键 flake8 与能力边界通过；离线测试首次为 10381 通过、4 失败、1 跳过、4 排除（另 626 subtest）。四项均为旧预期：富途新增分钟能力、独立 TickFlow 免费源的工厂/目录/准入数量及 Tushare 账号访问元数据。按真实注册值修正断言后，受影响四份测试共 46 项通过；未重新声称首次完整门禁退出为 0，也未重复运行输入未变的其余测试。

官方 `../thesis-ledger-infra/scripts/sync-code.sh all` 退出 0；DSA、Server、Worker 健康，三个容器镜像 ID 保持不变，未变更数据库或外部卷。当前代码位于容器可写层，FAPI-11 镜像验收仍开放。

真实分钟产品 API 已读取 `2026-10-08～2026-10-14`：`00700.HK`、`02800.HK` 各 1655 点，`AAPL.US`、`SPY.US` 各 1950 点，均超过单页 1000 点，完整市场时区分钟、不复权、`session: regular` 与富途来源正确。初次验证脚本错误要求可选的 `latestCompleteTradingDate` 必须显式为 null，导致四条结果记录为断言失败；已修正为空或缺省均可，并离线解析原始真实响应验证四项通过，未重复请求上游。原始响应与首次结果保留于忽略目录 `.recovery-artifacts/futu-2026-10-15-minute/`。策略内容及 enabled 按 CAS 恢复，修订 126→128。

M4 尚未全部通过：独立 SDK 值核对、真实页面与最终状态保护仍待完成。当前四类样本在目标资产/目录中均为 `UNKNOWN`；正常页面入口需要真实已知资产身份，不能把显式类型的底层 API 成功算作详情页面成功。

## M4 真实链路、消费者与失败边界

上述 M3 段落是当时检查点。本节接续最终结果：通过当前证券资料的来源校验进入只读行情，不通过账本录入补港美身份。`SecurityStaticPriceDialog` 复用既有图表，报价、价格口径和分钟独立缓存；显式交互规划类型与已有资产/目录冲突时拒绝，没有修改普通未知身份规则或写入资产。

### 确定性与门禁

Server 分钟/选项规划、读数与详情集成 28 项通过；包含未知本地身份的显式港美交互、类型冲突和非法参数先行拒绝、无分钟路由不调用上游且返回控制拒绝。Client 规划 9 项、Schema 22 项通过，Desktop 分钟时间/键盘 4 项通过。Schema、Client、Server 与 Desktop 构建/类型检查通过；全仓 lint 在键盘末次改动前为 8 组 2032 文件通过，此后受影响三个文件 ESLint、Desktop 类型检查与构建再次通过。

最终 DSA 全门禁命令为 `env PATH="$PWD/.venv/bin:$PATH" bash scripts/ci_gate.sh all`：语法、关键 flake8、统一能力边界及完整离线测试全部通过，**10394 passed、1 skipped、4 deselected、626 subtests passed**，退出 0。最早的脚本路径及未带虚拟环境 PATH 的启动错误不计为产品失败；首轮四个旧断言修复及其 46 项回归仍保留在前文。

真实页面发现并修复两项问题：`thesis_ledger_cache_context_v3._sample` 未区分来源已有的 `version` 与 `hmac` 凭据策略，导致富途报价在上游前被误拒；新增四类真实 Store 回归先复现失败，修复后缓存/配置/富途链路 69 项通过。美股 `get_market_snapshot.update_time` 实际带 `.626` 等毫秒，`read_futu_quote` 原整秒解析拒绝；补毫秒及夏冬时区、非法时间回归后相关 76 项通过。没有新增权限、放宽准入或重置请求预算。

### 真实数据与页面

独立使用本机 `futu-api 10.8.6808`、`OpenQuoteContext(127.0.0.1, 11111)` 的 `request_history_kline`，固定 `K_1M/AuType.NONE/extended_time=False/max_count=1000`，查询 `2026-10-08～2026-10-14`；不调用生产日/分钟规范化函数，逐条比较保存的真实产品 API。四类全部时间戳、OHLC、volume/turnover 一致，数值容差 `1e-9`：

| 标的 | SDK 页大小 | 匹配点数 |
| --- | --- | --- |
| `00700.HK` | 1000＋655 | 1655 |
| `02800.HK` | 1000＋655 | 1655 |
| `AAPL.US` | 1000＋950 | 1950 |
| `SPY.US` | 1000＋950 | 1950 |

在 `http://127.0.0.1:5174` 实际执行“市场数据→标的目录→当前证券资料→查看行情”。四类报价显示真实值与富途来源；四类日线分别读取不复权、前复权和后复权，分钟固定不复权，切回日线保持此前口径。分钟页面实际显示同日多个点、香港/美东时间、正常交易时段及来源；宽屏 1280×900 与默认窄屏均实测。港股 ETF 键盘 Home→右键使读数从 `2026/10/08 09:30` 移到 `09:31`，End 返回 `2026/10/15 12:00`，与真实蜡烛点位对应。Web 验收不代表 Electron、原生设备或物理触摸通过。

失败事实保留：首轮四类报价被错误缓存围栏拒绝；修复后美股毫秒时间再暴露独立解析错误；修复后的 SPY 曾被现有 `request_budget_cooldown` 拒绝，日志确认没有上游请求，等待原 600 秒冷却后四类 API 均通过。ETF 页曾展示明确标注的缓存/陈旧报价，不作新鲜价格资格声明。苹果两年后复权窗口首读 502，后续 SDK 492 点规范化、原始 DSA 200 响应、共享请求关联 Schema 及同窗 Web 均通过，未稳定复现，未据此新增放宽规则。一次构建期间分钟刷新在 DSA 返回 503、Server 约 6.77 秒后同样返回 503，页面保留并明确标注“上次成功加载”；该失败仍属于来源/执行耗时边界，不关闭统一适配层的性能门禁。恢复无分钟路由时同样拒绝，不静默切日线；原先泛化 500 已改为控制拒绝。

### 状态保护与交付范围

验收脚本的默认浏览器窗口仍为 3 分钟；本轮较长检查显式选择最长 10 分钟，到时或收到换行按 CAS 恢复。首个短窗口的自动恢复不能误记为持续路由可用。四类最终 Quote API 回执在 `.recovery-artifacts/futu-2026-10-15-final-acceptance/`，原分钟响应在 `.recovery-artifacts/futu-2026-10-15-minute/`；所有失败回执及后续临时路由回执分别保留，未覆盖首轮失败。最后诊断窗口不重复已通过的 Quote API，实际页面和原始 DSA 按当前临时路由检查，结束按 CAS 复原。

本轮使用官方 `sync-code.sh all` 及后续最小 `thesis-ledger`/`dsa` 同步，全部健康；仍是容器可写层，未固化新镜像。结束只读对账：原 68 个 BacktestJob、原 1 个 Account、原 2 个 Asset 的逐行摘要全部不变，BacktestJob/Asset 数量仍为 68/2。仅新增过一个未录入持仓的专用模拟账户，已通过正式接口停用；未永久删除记录。用户原账户上下文和实际模式已恢复，原路由内容及 enabled 复原。FAPI-3b、5b、M4/M4a 通过本节限定的交互范围；FAPI-5c 冻结/离线重放及 FAPI-11 镜像交付继续开放。

## 2026-10-16 正式镜像与状态备份

本节记录分钟交付版本的 FAPI-11 通过，不改变 FAPI-5c 的独立资格与冻结条件；本节之后新增的研究接入，其镜像仍按末节单独跟踪。

- 正式命令：在 `thesis-ledger-infra` 执行 `BUILD_SPACE_ROLLBACK_KEEP_COUNT=2 ./scripts/update.sh all`，退出 0。实测宿主空闲 22629 MiB、Docker 21343 MiB，分别满足原 20480/18432 MiB 门槛；未降低阈值。使用数据库 `check` 路径，未执行重建或迁移升级；5 个目标服务均 healthy。
- DSA 新镜像：`sha256:03913531fa8256ec247fe7c0908fd5510acd9d70868b3068c4a5cf5f7029cc72`。Server 与 Worker 新镜像：`sha256:2f4419bb125c96740782bad7670c04c7296923f4f508922c5cd1c27d85f39d56`。三者没有源码 bind mount；不依赖此前的容器可写层。
- 独立核验：镜像内 `futu_history.py`、`futu_minute.py`、`thesis_ledger_cache_context_v3.py`、`thesis_ledger_bar_route_execution.py` 与 DSA 当前文件 SHA-256 一致；Server 镜像真实 `apps/server/dist/src/market/` 下的 `market-chart-options-v3.js`、`market-chart-options-request.js`、`market-chart-request.js` 与本地已构建产物一致。源码基于主仓 `da002744bd317b7754832c6ac41d169bcf005e27`、DSA `dd26571509e842ab230c393f5f339911ea98425d` 的未提交工作树，不宣称为干净提交镜像。
- 产品检查：新镜像 actual/shadow 估值 API 均 200，分别为 0/1 条持仓。使用既有受界限验收脚本执行四类富途 Quote smoke，4 passed / 0 failed；`policy-restored.json` 的断言确认 routes、enabled 与原配置一致且 applied。本次只做镜像后 API smoke，不新增浏览器通过声明。回执在 `.recovery-artifacts/futu-2026-10-16-image-smoke/`。
- 正式备份：在 infra 执行 `node scripts/research-state-backup.mjs backup --target thesis-ledger-dev --output <主仓绝对路径>/.recovery-artifacts/futu-2026-10-16-image-backup`，退出 0，内置完整性验证通过。包含 `postgres.dump`、`dsa.sqlite`、`dsa-data.tar`、`backtest.tar` 及带校验值的 Manifest；数据库结构 head 为 `20261006030000_strategy_authoring_save`。
- 状态保护：备份与 smoke 后的 7 张保护表摘要完全一致，包含全部 `BacktestJob`；68 条回测记录、2 个账户及 2 个资产保留。其中 54 份成功 V3 结果的 ID/校验值相同，活动回测数为 0。此处 54 是成功 V3 子集，不是总记录数。
- 受影响验证复用原定向与 DSA 全量通过证据；最新 Desktop Dialog 21 项、类型检查和定向 ESLint 通过。`pnpm guardrails:complexity` 退出 0（8 组、2032 文件），保留既有复杂度、文件尺寸和 React Native Flow 解析提示，不把告警写成无告警结果；`git diff --check` 通过。

镜像交付及本节备份、状态保护已通过。普通供应商价格与历史按股执行资格继续区分，尚未建立新的富途合格快照或完成离线重放，FAPI-5c 保持开放。

## 2026-10-16 冻结准备失败与实现缺口

真实准备使用 `00700.HK / qfq / normalized-series / fixed-provider-snapshot`，执行范围 `2026-09-15～2026-10-08`，暖机后实际请求窗口为 `2026-08-22～2026-10-08`；研究假设显式覆盖整窗，费用为显式研究配置，没有宣称历史按股执行资格。策略 ID 为 `6bdc0878-396e-457b-bf90-86d0b8ed6ab8`，版本 ID 为 `ef47944d-1190-4233-9b94-537a03a54ce0`，后续优先复用该验收对象。

- 准备回执 `db454fc2-f0a5-4467-a2fd-a5df25ddce68` 为 `blocked`，诊断缺 `readyExecutionRouteTarget`；没有投递 BacktestJob，也没有生成新快照。
- 同窗原始 DSA Bar 请求 `84313005-f131-413b-a790-7f1e4684f44a` 返回 422 `insufficient_coverage`。临时路由仍为 eligible、精确目录为 ready，不是账号缺权限的证据。执行结束按 CAS 恢复原配置；脚本退出 0 只表示诊断及清理完成。
- 修复前代码只读复现：富途 HK/STOCK/qfq 的 `research_calendar_eligible`、`research_instrument_policy` 都为空，`research_market_coverage_context(request)` 返回 `None`。`api/thesis_ledger.py::market_bars_v3` 在调用上游前拒绝空覆盖上下文；`src/services/thesis_ledger_research_calendar.py::_research_request` 要求来源绑定有明确研究日历回调。不能将本次失败归因于 SDK 分页、权限或已证明的价格缺日。
- 当时缺口是来源研究合同及当前身份、日历、价格口径与冻结截点的接入，随后由下一节限定实现补齐。普通报价、交互日线和当前证券资料不能自动授予该资格；旧 Yahoo 身份包及已取消的历史制度补证范围保持。
- 四类当前证券资料再次实读为 4 passed / 0 failed；补充身份元数据观察仅作当前事实线索，尚未进入生产资格。其成功不关闭冻结、ETF 或历史单位验收。

原始回执保留在 `.recovery-artifacts/futu-2026-10-16-freeze/`：后续运行将首轮失败原字节保存为 `prepared.initial.json`，SHA-256 仍为 `d69e8f5ac07be640876735346f694ccc3ae70710bbccc5e51c66f09644c2604c`；`raw-bar-response.json` 为 `f0dfe7133a165907ae0213cc12f0810c3f7f1f79f4dce9a0f0b8cd63c6fe50f5`。`scripts/futu-market-target-check.mjs` 增加受原 CAS/期限约束的 `--policy-window-only`，仅允许 browser 持有窗口时使用，避免重复已经通过的 Quote 实读；语法检查和无效模式拒绝通过。

## 2026-10-16 首批股票冻结与断网重放

### 实现与验证范围

DSA `data_provider/futu_research_identity.py` 维护两份真实当前观察的关联：富途核对代码、股票类型及交易所，独立 Yahoo 元数据核对币种、时区与身份。观察包为 `data_provider/market_reference/futu-research-identities.json`，保留双方观察时间与原回执 SHA-256；修订为 `futu-current-identity-sha256:39876a00d01c545dc15c0177cd0c76591affd379607606e2f5880c0d37b1cf8f`。它不是富途原始币种字段，也不是历史单位原件。

`data_provider/thesis_ledger_sources/futu.py` 仅为股票 qfq 绑定既有研究日历与身份接口。通用读取位于 `src/services/thesis_ledger_research_instrument_reader.py`，编排层映射公开错误，来源模块不反向依赖事实编排；存量依赖事实文件缩减。无新依赖、数据库结构、权限购买或 RouteAdmission 写入；原 12 个普通日线目标、版本和价格读取保留。

定向回归先复现 4 failed / 6 passed；修复并增加身份矛盾拒绝后，相邻合同 123 项通过。依赖收敛期间曾把两个旧 Yahoo `not_covered` 错误误归为 `invalid_response`，原回归捕获后恢复来源错误，再次 123 项通过。最终 `env PATH="$PWD/.venv/bin:$PATH" bash scripts/ci_gate.sh all` 退出 0：**10412 passed、1 skipped、4 deselected、98 warnings、626 subtests passed**，最后一次用时 207.66 秒。没有降低准入、门禁或预算。

### 真实准备、投递和计算

两份样本均为 `qfq / normalized-series / fixed-provider-snapshot`，执行 `2026-09-15～2026-10-08`，实际获取含暖机范围 `2026-08-22～2026-10-08`，各冻结 33 根日线。显式整窗研究模型假设零费用/滑点、不应用整手/价位/涨跌幅，分别以 HKD、USD 计价，不宣称真实市场收费或历史按股执行资格。策略为 MA5 进出场，实际均有成交和权益序列。

| 样本 | Run ID | 冻结快照 SHA-256 | 持久结果校验和 | 实际计算 |
| --- | --- | --- | --- | --- |
| 腾讯 `00700.HK` | `6efb203b-c55f-4a40-a2ef-2887c9670a81` | `28770593a4dc48e204187caa33a8acfc18bce1ec03cd39cb8c879cbe2f564224` | `0a9dd9a1d40e38e6` | 6 笔模拟成交、3 笔闭合交易、17 个权益点 |
| 苹果 `AAPL.US` | `af19148a-5239-4165-91e5-08a6ee0cc73c` | `163aba886c4e36196fd9aba642a6957a2118a4eb9e90ea82b48af35234a4787a` | `304fe998eec9d148` | 5 笔模拟成交、2 笔闭合交易、18 个权益点 |

均通过正式准备、`POST /api/v1/backtests/runs` 投递，观察到 queued → succeeded、`executionAttempt=1`。执行、信号及基准的冻结来源均为 `futu/futu`，分别绑定生效策略修订 151、153；没有静默换源。每个有界窗口结束后由维护脚本按 CAS 复原路由内容与 enabled。

冻结原始身份响应的 `tradable=false`、`lotSize/tickSize=null` 均保留在 `metadata/dependency-evidence-v3.parquet::sourceResponse`，两份实际制品已只读核验。冻结研究投影的 `tradable=true` 来自既有 `composeSnapshotIdentityTradabilityV3` 与已绑定的 observed-traded 日级价格证据，原始响应和投影分别保留；它不表示历史整手、最小价位、停复牌或严格 PIT 已核验。其他证券、ETF、none/hfq 没有借用这份研究资格。

### 离线重放与旧状态保护

分别执行 `node scripts/research-window-replay-target.mjs <Run ID> <持久结果校验和> --output=<本轮对应目录>/offline-replay.json`。现有维护入口在 Worker 独立进程只读冻结输入，阻断 fetch/http/https/net/tls，每份运行两次；两次结果相同且与持久校验和一致，**networkCalls=0**。

使用正式备份的相同逐行摘要算法，只排除本轮新增的 3 个空账户、2 个策略及对应版本、2 个回测，原有 **7 张保护表全部原始行摘要相同、54 份成功 V3 结果的 ID/校验值相同**。原 68 条回测保留，当前共 70 条、活动数 0；不把新增样本计作旧记录变更。回执为 `.recovery-artifacts/futu-2026-10-16-freeze/state-protection.json`，基线时间 `2026-10-16T09:06:54.322Z`。

腾讯回执在 `.recovery-artifacts/futu-2026-10-16-freeze/`，苹果在其 `aapl/` 子目录；分别保留准备、投递、终态及离线结果，未重复创建腾讯策略，也未覆盖首轮失败。

研究完成后另以维护入口 `node scripts/research-state-backup.mjs backup --target thesis-ledger-dev --output=<本轮研究备份目录>` 执行备份并校验，退出 0。回执 `.recovery-artifacts/futu-2026-10-16-research-backup/manifest.json` 创建于 `2026-10-16T11:22:48.900Z`，覆盖 PostgreSQL dump、SQLite、DSA 数据与回测制品；当前共 70 条回测，其中 56 份成功 V3 制品包含上表两份新增样本。镜像仍依赖原分钟版本与研究代码可写层，备份回执没有将后者记为新镜像。

### 尚未通过的正式镜像

以下为 10-16 历史检查点，已由下节 10-17 正式重建后复验关闭，不再作为当前待办。

研究增量执行 `BUILD_SPACE_ROLLBACK_KEEP_COUNT=2 ./scripts/update.sh dsa` 后，维护脚本按原规则清理可回收 BuildKit 缓存、保护镜像并回收 Docker Desktop 空闲块；最终宿主仅 14497 MiB，低于 20480 MiB，Docker 18836 MiB 已满足 18432 MiB。脚本退出 1，在拉取/应用构建前停止，未删除容器、数据卷或宿主文件，也未降低门槛。

最终 `./scripts/sync-code.sh dsa` 退出 0；六份相关运行时文件与宿主 SHA-256 一致，两份当前身份在目标运行时只读实取成功。DSA 镜像 ID 仍为本文件前节的分钟交付版本，新增研究实现依赖容器可写层，重建会消失。FAPI-5c 仅按上表已核验范围通过；FAPI-11 的研究镜像固化继续开放，不归档或转 TODO。

## 2026-10-17 研究镜像固化与重建后复验

用户确认空间问题已修复。独立核对发现磁盘治理任务已通过正式入口完成两应用冷构建、保卷恢复与数据库结构检查，本轮复用该真实构建，未再执行无变更构建。执行目录为 `thesis-ledger-infra`，命令为 `DEV_DATABASE_MODE=check UPDATE_SPACE_MODE=auto ./scripts/update.sh all`，沿用系统本机代理，最终退出 0。完整操作及六卷/挂载保护见[infra 实际验收](../../../../thesis-ledger-infra/docs/tasks/evidence/2026-10-17-docker-update-peak-acceptance.md)；原日志为 infra 忽略目录 `.maintenance-backups/compact-update-resume-proxy-2026-10-17.log`，本轮核对镜像导出记录和更新完成尾记录。

当前工作区与正式脚本已将 20/18 GiB 调整为清理参考值，已知正余量可以继续；此前 14497 MiB、2.8 GiB 和硬门槛失败只说明当时状态。重建后宿主约 10.3 GiB、Docker 约 18 GiB，不能再按旧硬门槛要求用户重复清理或重建健康服务。

| 独立核对 | 当前结果 |
| --- | --- |
| DSA 正式镜像 | `sha256:cc15730b336fa1304262f13354d8ac792e98ae83614dc38664b4f5077aacb188`，创建于北京时间 10-17 02:41:58 |
| Server / Worker 正式镜像 | `sha256:1d91cb246e789a404b4b8738b2adc6efb00dd50606b645fba6ffe7624d76208a` |
| 源码与依赖输入 | 20 份变更生产 Python、当前身份观察包及 `requirements.txt`，共 22 份 SHA-256 与宿主一致；DSA 对这些文件无可写层覆盖 |
| 编译产物 | Server / Worker 的 `apps/server/dist` 与 `packages` 无可写层覆盖；目标重放使用新镜像编译的 Runner |
| SDK 与本地观察包 | `futu-api=10.8.6808`；目标加载腾讯 HKD、苹果 USD 两份已有观察，修订与观察包摘要一致，没有重采上游 |
| 当前目标 | 五服务均 healthy；两份既有 Run 的真实产品 API 仍返回 succeeded |

执行现有维护入口 `node scripts/research-window-replay-target.mjs <Run ID> <原结果校验和> --output=<本轮回执>`，在新 Worker 镜像内对两份已有冻结输入各计算两次：

| 既有 Run | 原持久校验和 | 新镜像复验 |
| --- | --- | --- |
| `6efb203b-c55f-4a40-a2ef-2887c9670a81` | `0a9dd9a1d40e38e6` | 两次一致、与原结果相同，`networkCalls=0` |
| `af19148a-5239-4165-91e5-08a6ee0cc73c` | `304fe998eec9d148` | 两次一致、与原结果相同，`networkCalls=0` |

腾讯、苹果的快照摘要仍分别为 `28770593a4dc48e204187caa33a8acfc18bce1ec03cd39cb8c879cbe2f564224`、`163aba886c4e36196fd9aba642a6957a2118a4eb9e90ea82b48af35234a4787a`。没有创建新策略、Run 或 Provider 请求，AI 真实生成仍为 0。复验后原七张保护表逐行摘要和原 54 份成功 V3 结果均与基线一致；回测总数仍 70、活动数 0。既有研究状态备份继续有效。

本地回执位于 `.recovery-artifacts/futu-2026-10-17-image-acceptance/`：`image-verification.json`、`hk-offline-replay.json`、`us-offline-replay.json`。源码未变，复用已有 10412 项 DSA 全门禁及分钟/页面证据，不重做来源采样。**FAPI-11 完成，现行用户范围全部闭合，Task 归档，Spec 保留当前合同。** 统一适配层、按需历史、其他证券/复权/历史按股及取消范围保持各自原状态。
