# D01–D03 适配与路由验证

## 本轮结果

2026-09-27 在 DSA 当前工作树执行以下定向测试，结果为 **134 passed，6 warnings**。警告为测试客户端类无法被收集等测试收集提示，进程退出码为 0。

```sh
.venv/bin/python -m pytest -q \
  tests/test_thesis_ledger_hithink_etf.py \
  tests/test_thesis_ledger_hithink_stock.py \
  tests/test_thesis_ledger_market_v3_pagination.py \
  tests/test_thesis_ledger_market_v3.py \
  tests/test_thesis_ledger_data_v3_target_pins.py \
  tests/test_thesis_ledger_hithink_stock_runtime_v3.py
```

日志：`/private/tmp/goal-d01-d03-local-20260927.log`。

## 证据范围

- D01：ETF `adjust:null` 对应 qfq；拒绝 raw/hfq；日期、重复、非法价格、单位、分页标记及安全错误分类的受控测试通过。
- D02：股票三口径映射、独立序列、日期范围、未知响应口径、权限与 HTTP 错误分类的受控测试通过。
- D03：V3 精确策略目标、备用索引、准入重检、未支持口径拒绝，以及锁定目标失败后不遍历其他目标的受控测试通过。

这些测试没有访问真实 HiThink 账户，没有创建真实回测或 AI 请求。此前真实来源卡点的重试预算不因本轮本地回归而重置。

## 尚待核对

### 子响应时间约束的消费与部署复验

共享 Schema 构建通过；Server 多窗口协议、客户端和实际 Parquet 冻结/离线重放 **13 项通过**。随后官方 `sync-code.sh all` 成功，三服务健康、镜像不变，日志 `/private/tmp/goal-d01-child-time-sync-20260927.log`。

目标 DSA 组合器及 Server、Worker 部署 Schema 均以明确的“子响应观测晚于采集完成”错误拒绝未来子观测；正确完整响应、跨语言哈希和 HTTP 能力声明仍通过。探针首次把完整多窗口父响应直接传给组合器，触发其禁止递归构造检查；移除父级已有观测字段、按组合器输入契约调用后，第一次重试通过。此次代码只在容器可写层生效。

据此关闭 D01-window-contract 的合同定义子项。D01 父项及真实来源、数据库冻结和完整运行验收继续保持开放。

### D01 子响应观测时间边界

合同核对发现两端均只检查采集开始/结束和父观测时间，未拒绝子响应的 `observedAt` 晚于其 `completedAt`。现由 Python 组合器与 TypeScript Schema 同时拒绝该矛盾时间，Spec §8.3 同步明确要求。Schema 定向 **14 项**和 Python 组合/API **14 项**通过，日志 `/private/tmp/goal-d01-child-time-ts-20260927.log`、`/private/tmp/goal-d01-child-time-py-20260927.log`。本次新增校验尚未构建同步到目标容器，后续部署验证不能沿用前一轮的旧代码证明。

### D03 适配器内部状态隔离核对

核对 `AkshareFetcher.get_daily_data_for_source`：V3 精确来源路径直接分派单个 endpoint，不进入旧分析入口的 `_enforce_rate_limit` 及共享 `_last_request_time`。新增同实例反例：东财返回 `RateLimitError` 时腾讯调用为零；随后显式选择腾讯，真实分派、标准化与来源标记成功，东财累计仍只有一次调用。测试仅替换外部 SDK 与进程隔离，不绕过适配器分派逻辑。

AkShare 精确适配、Tushare 精确请求与来源熔断隔离 **29 项通过**；日志 `/private/tmp/goal-d03-adapter-isolation-20260927.log`。Tushare 用例覆盖同缓存客户端的两分段计数、额度耗尽不休眠/不请求、总期限阻止第二分段、权限失败不重试，以及迟到/部分响应拒绝。该结果与上一节运行时目标隔离证据互补，没有修改来源准入或生产代码。

### D03 可重试失败的精确目标调用上限

核对既有 pin 测试发现错误夹具未设置 `retryable=True`，只能证明普通失败不会切换目标。现将错误夹具明确标为可重试，并对主、备两种 pin 分别覆盖 `upstream_failure`、`rate_limited`、`timeout`：指定适配器恰好调用一次，另一个已准入适配器调用零次，错误码原样保留。

精确目标、准入、来源熔断隔离及第三目标拒绝四文件 **45 项通过**；日志 `/private/tmp/goal-d03-retryable-pins-20260927.log`。本轮仅加强测试，生产源码未变化，无需重新同步。该证据不等同于所有适配器内部限流计数均按真实目标隔离；D03 仍需核对该项，未提前勾选完成。

### 目标容器多窗口协议同步与解析

Server build、模块边界与 workspace 依赖图检查通过。文件尺寸门禁退出成功，但报告 13 项存量警告且没有有效比较基线，因此不作为尺寸 ratchet 的完整证明。随后执行 infra 官方 `./scripts/sync-code.sh all`，退出码 0，DSA、Server、Worker 全部健康；日志 `/private/tmp/goal-d01-multi-window-sync-20260927.log`。此次仅更新容器可写层，镜像 ID 不变，未修改数据库结构或外部卷。

目标 DSA 实际 HTTP capabilities 返回多窗口协议；其部署的 Python 编码器与 golden 指纹一致。Server、Worker 均直接调用已部署解析模块，接受完整正确观测并拒绝改写子指纹。探针 `/private/tmp/goal-d01-runtime-probe-20260927.py`。第一次探针遗漏 golden 中两个自引用哈希占位的回填，被解析器正确拒绝；参照现有合同测试补齐后，第一次重试通过。

该证据确认部署模块及能力接口，不代表真实 HiThink 读取、数据库冻结或队列 Worker 全链验收。此前 I01 JSONB 指纹卡点和真实来源卡点仍按原重试账本保留；D01-runtime 尚不能整体勾选。

### 多窗口能力声明及消费端协商

DSA capabilities 现声明 `multiWindowProtocols: ["market-multi-window-content-v1"]`，复用内容编码模块中的协议常量，避免声明与指纹版本分离。实际挂载的应用路由及独立路由均验证该声明。此变更替代下节“能力声明尚未开启”的历史状态。

能力/API/指纹回归 **32 项通过**；Server 协商及解析回归 **12 项通过**，包括缺失声明、错误 Data 版本和有效声明路径；ETF、窗口预算、交集、准入与目标数量回归另有 **83 项通过**。Server `typecheck` 通过。日志分别为 `/private/tmp/goal-d01-capabilities-20260927.log`、`/private/tmp/goal-d01-capabilities-client-20260927.log`、`/private/tmp/goal-d01-runtime-regression-20260927.log`、`/private/tmp/goal-d01-server-types-20260927.log`。

以上均为本地验证；尚未通过官方入口同步这些多窗口代码，目标运行时验收仍保持未完成。没有重置或消耗真实 HiThink 卡点的重试预算。

### 多窗口 HTTP 调度与错误传播

DSA 的 `market_bars_v3` 已接入固定 HiThink ETF qfq 目标的多窗口调度。请求先完成全部窗口与覆盖证明预检，每窗最多五年，最多八个子请求，共享 4.5 秒预算；生产运行时逐窗执行既有目标准入检查。每个子响应通过原单窗口响应构造器，再核对交集、合并与计算完整指纹。子窗口冲突或失败即停止，迟到响应不会形成成功结果。

修复调度内部的 `HTTPException` 被通用异常处理改写为 503 的问题：交易日缺失保留 422，分页声明矛盾保留 502。首轮新增分页测试错误预期为 422，核对既有分页契约后修正为 502。

相关七文件回归 **83 项通过**，日志 `/private/tmp/goal-d01-api-regression-20260927.log`。补充迟到响应测试后，真实 FastAPI 路由配合受控运行时的 API 测试 **7 项通过**，日志 `/private/tmp/goal-d01-api-deadline-20260927.log`；关键 flake8 检查通过。测试覆盖完整三窗、第二窗冲突、权限失败、缺失行情、分页未完成，以及第一窗超出总预算后不再继续调用。

上述证明本地 API 接缝，未证明真实上游、多窗口能力协商或目标容器行为；能力声明尚未开启，D01 及其部署验收保持未完成。后续仍需验证能力协商与部署，再按既有预算处理真实来源卡点。

### 父观测时间约束回填与全链回归

Schema 现要求父 `sourcePriceBasis.observedAt` 等于最晚子观测 `completedAt`，新增提前观测时间反例。同步修正两仓 golden 及多窗口 Parquet 夹具中的父时间；更新后的完整 golden SHA-256 为 `d73bbe8060612a0eece8033f4c31f254c892391522fcf435f1d826586741325c`。这是 fixture 内容变化，编码协议未改变，前述旧 golden 哈希仅保留为历史验证记录。

Schema build 通过；定向 Schema **13 项**、Server 解析/网络/选择器/仓库/固定窗口/离线 Snapshot **52 项**、Python 组合/编码 **9 项**全部通过。日志 `/private/tmp/goal-d01-parent-clock-schema-20260927.log`、`/private/tmp/goal-d01-parent-clock-server-20260927.log`、`/private/tmp/goal-d01-parent-clock-python-20260927.log`。

父时间规则已从 Python 生成端落实到 TypeScript 消费端；上一条组合器记录中“父时间关系仍需补验”由本节替代。真实 API 输出及目标运行时仍未完成，本轮没有重新请求外部来源。

### DSA 多窗口响应组合及可用时间

新增 `thesis_ledger_multi_window_response.py`，消费已经校验的父覆盖响应和各单窗口 wire 观测，检查身份/协议/范围/重叠行情与并集，保留完整子观测，生成请求窗口作用域、本地观测修订和全内容指纹。没有接入 API 或声明 capabilities。

核对现有 API 后发现各次读取记录自己的可用时间。已修正 Schema 的重叠规则：OHLC/量额一致但 `availableAt` 不同时不判价格冲突，父 Bars 必须采用较晚的真实可用时间。Python 组合器同步实现，并以最晚子观测完成时间设置父 `observedAt`；Schema 对父观测时间与子完成时间的关系仍需进一步补验。

Python 组合/指纹 **9 项通过**，关键 flake8 通过；将 Python 实际生成响应保存为跨仓 fixture 后，TypeScript 独立解析和 SHA-256 核验通过，相关合同测试 **12 项通过**，Schema 类型检查通过。日志 `/private/tmp/goal-d01-response-20260927.log`、`/private/tmp/goal-d01-produced-wire-20260927.log`、`/private/tmp/goal-d01-produced-wire-typecheck-20260927.log`。

尚未完成采集器→生产单窗 wire 构造→本组合器→API 响应的运行时接缝，也没有刷新已耗尽预算的真实来源请求。

### 多窗口 Parquet 与离线执行校验

Snapshot `actualSource` 新增可选 `windowProtocol`，多窗口来源写入明确标记。离线执行器调用新 `backtest-snapshot-v3-multi-window.ts`：要求标记与完整证据对应，重验多窗口合同及内容哈希，核对来源指纹/身份、覆盖、价格协议与逐条执行 Bars，并拒绝晚于 `dataAsOf` 的子观测。单窗口继续使用既有路径。

新增集成回归真实写入本地 Parquet 并调用 `snapshots.v3.replay`。首轮夹具只有 golden 的三天，而生产 Builder 要求从 4 月 24 日开始的预热窗口；经定位后改为生成完整预热范围的两窗观测，不缩短生产预热。最终多窗口重放 1 项与旧 Builder 4 项共 **5 项通过**；另在读出的实际 Artifact 上验证删除完整证据、改写子观测时间、改写执行价格均拒绝。Server 类型检查和 ESLint 通过。

日志 `/private/tmp/goal-d01-offline-20260927.log`、`/private/tmp/goal-d01-offline-typecheck-20260927.log`、`/private/tmp/goal-d01-offline-eslint-20260927.log`；Schema 包回归与边界结果见 `/private/tmp/goal-d01-offline-schema-tests-20260927.log`、`/private/tmp/goal-d01-offline-boundaries-20260927.log`。

上述验证为受控 Reader、真实本地 Parquet 与离线读取，不证明真实 PostgreSQL、Worker、DSA 多窗口响应生成或目标部署完成。DSA 执行面及运行时门禁继续开放。

### 整窗复用与 Snapshot 来源证据

`deriveFrozenMarketWindowViewV3` 改用冻结响应校验入口，整窗复用保留多窗口观测；原请求窗口基准依然禁止裁剪为其他原生窗口。`createBacktestSnapshotV3Source` 接受已校验多窗口结果，并在来源 Artifact 的标量 JSON 字段 `multiWindowResponse` 保存完整响应及子观测；单窗口 Artifact 不新增字段。

新增回归贯通受控 repository→固定窗口 Reader→Snapshot 来源生成，断言完整观测保留、不请求 DSA 行情、不二次落库，裁剪请求被拒绝。冻结 Reader **10 项通过**；Snapshot 来源与 builder **8 项通过**。Server 类型检查、边界门禁及最终 ESLint 通过（已修正一个仅类型用途的 import）。日志 `/private/tmp/goal-d01-frozen-view-20260927.log`、`/private/tmp/goal-d01-snapshot-source-20260927.log`、`/private/tmp/goal-d01-snapshot-source-typecheck-20260927.log`、`/private/tmp/goal-d01-snapshot-source-eslint-20260927.log`。

当前仅证明来源 Artifact 生成保留证据；离线执行器还需对新增字段做独立指纹和执行 Bars 一致性校验，不能将上述 builder 回归直接算作多窗口离线重放完成。

### 多窗口冻结仓库接通

新增 `market-window-response-v3.ts` 供本地冻结校验使用；多窗口读写复用完整 Schema 和全观测内容哈希验证，离线读回不依赖网络能力查询。`MarketWindowEvidenceV3Repository.record/findFrozen` 保留完整多窗口响应。多窗口冻结哈希使用独立 `frozen-market-window-multi-v1` 域，旧单窗口哈希实现保持原样。

新增受控 repository 测试确认完整写入、读回和子观测时间改写后拒绝。首次回归发现单窗请求边界错误被新解析层提前拦截，已恢复原关联校验顺序及仓库错误行为。最终仓库 17 项、冻结 Reader 9 项共 **26 项通过**；Server 类型检查、修改范围 ESLint、import boundaries 均通过。

日志 `/private/tmp/goal-d01-frozen-20260927.log`、`/private/tmp/goal-d01-frozen-typecheck-20260927.log`、`/private/tmp/goal-d01-frozen-eslint-20260927.log`、`/private/tmp/goal-d01-frozen-boundaries-20260927.log`。

当前验证使用受控 Prisma 存储，未重新运行真实 PostgreSQL、Worker 或目标运行时。DSA 多窗 wire 生成、实际声明能力、Snapshot 全链保留及离线重放仍未完成；D01 与 I01 保持开放。

### Reader 二次校验接通

`MarketBarReaderV3` 向窗口选择器提供 capabilities 读取端口，选择器复用网络层 `readBarSeriesV3` 的多窗口协议确认与完整指纹校验。无端口或未声明支持时继续拒绝多窗口；单窗不读取能力。新增选择器测试分别验证支持与不支持两种状态，成功时返回全部子响应，没有投影丢弃证据。

Reader/selector **18 项测试通过**，Server 类型检查及边界门禁通过。ESLint 首次指出两个没有 await 的 async 回调，改为显式 `Promise.resolve` 后 ESLint 和全部 18 项定向测试通过。日志 `/private/tmp/goal-d01-reader-final-20260927.log`、`/private/tmp/goal-d01-reader-typecheck-20260927.log`、`/private/tmp/goal-d01-reader-eslint-20260927.log`、`/private/tmp/goal-d01-reader-boundaries-20260927.log`。

冻结仓库 `record` 和 `findFrozen` 仍直接使用单窗口 Schema，冻结哈希也尚未识别新响应；下一步必须接通存储及离线读取，当前不宣称完整 Reader 落库路径完成。

### 网络客户端能力确认

Data capabilities Schema 新增可选 `multiWindowProtocols`，当前仅接受 `market-multi-window-content-v1` 且不重复；既有仅版本列表的响应保持有效。`DsaClient.marketBarsV3` 将请求校验和能力确认委派到 `dsa-market-bars-v3.ts`，收到多窗口响应才读取 capabilities，只有同时声明 Data V3 和目标协议才调用已实现的哈希解析；能力读取失败不会静默降级。旧单窗口请求保持一次请求，不新增能力查询。客户端存量文件未扩大。

网络能力确认新增 4 项测试，结合旧客户端 13 项及多窗口解析 8 项，共 **25 项通过**。Schema build、Server 类型检查、修改范围 ESLint 和 import boundaries 通过。日志 `/private/tmp/goal-d01-negotiation-20260927.log`、`/private/tmp/goal-d01-negotiation-typecheck-20260927.log`、`/private/tmp/goal-d01-negotiation-eslint-20260927.log`、`/private/tmp/goal-d01-negotiation-boundaries-20260927.log`。

DSA 尚未发布该能力，Reader/selector 的二次解析也尚未传入已确认协议；冻结与重放继续开放。本轮网络验证使用受控 HTTP，未部署、未访问真实来源。

### Server 生产解析入口与指纹核验

`parseBarSeriesResponseV3` 已识别携带 `windowObservations` 的响应并委派给新 `dsa-multi-window-v3-protocol.ts`。调用方必须显式提供已确认的 `market-multi-window-content-v1` 协议；缺少或未知协议拒绝。校验完整 Schema 后仅为请求关联构造单窗口投影，返回值仍保留全部子窗口。父 `inputFingerprint` 和本地修订 `contentHash` 必须同时等于全观测 SHA-256。

新增生产入口测试 **8 项通过**，既有 DSA 客户端 **13 项通过**；Schema build、最终 Server `tsc --noEmit`、修改范围 ESLint 和 import boundaries 均通过。ESLint 首次发现未使用解构变量，已改用仅供请求关联的 Schema 投影，随后重跑定向测试及静态检查通过。

日志：`/private/tmp/goal-d01-parser-20260927.log`、`/private/tmp/goal-d01-parser-legacy-20260927.log`、`/private/tmp/goal-d01-parser-typecheck-20260927.log`、`/private/tmp/goal-d01-parser-eslint-20260927.log`、`/private/tmp/goal-d01-parser-boundaries-20260927.log`。

当前网络客户端尚未协商/传入多窗口能力，故线上入口仍默认拒绝该新路径。DSA 生成、Reader 二次校验、数据库冻结和重放仍待接通；未部署此轮 Server 改动，不以解析器测试替代运行验收。

### 跨语言多窗口内容编码

新增 Schema `market-multi-window-encoding-v3.ts` 与 DSA `thesis_ledger_multi_window_fingerprint.py`，采用 Spec 中的版本化类型编码及 IEEE-754 数值字节。父哈希自身和传输关联排除，子响应内容/指纹与观测时间全部绑定。两仓各保存同一完整响应 golden，避免单仓测试依赖相邻 checkout。

TypeScript 合同及编码共 **10 项通过**，Python 编码 **3 项通过**，Schema 包类型检查通过；完整响应两端 SHA-256 均为 `f28d6d13faee97a4cd25f9d6f94f4a495db5604eb9f31a5063a1ab759ae2c98f`。日志 `/private/tmp/goal-d01-encoding-20260927.log`、`/private/tmp/goal-d01-encoding-python-20260927.log`、`/private/tmp/goal-d01-encoding-typecheck-20260927.log`。

这是多窗口新协议的编码验证，不修复或重试先前 I01 单窗口 JSONB 卡点。生产解析入口中的哈希核验、能力门禁、DSA 响应生成和冻结重放仍待接入。

### 多窗口 Schema 实施

新增 `packages/schemas/src/market-multi-window-v3.ts` 并从包入口导出，复用单窗响应的严格校验定义非递归 `windowObservations`。要求请求窗口作用域、本地观测修订、父子身份一致、窗口升序且不越界、相邻已观测交集、重叠 Bars 一致，以及父 Bars 等于去重子事实并集；单窗旧解析器继续拒绝新字段，避免无能力匹配时静默接收。

新增 8 项合同测试通过，覆盖正常响应、身份变更、重叠冲突、父行情改写、时间倒置、全局基准冒充、递归及乱序。首次类型检查发现回调中的可空变量推断，修正后 Schema 包类型检查通过。定向新旧 wire 测试结果见 `/private/tmp/goal-d01-wire-20260927.log`，类型检查日志 `/private/tmp/goal-d01-wire-typecheck-20260927.log`。

当前新 Schema 尚未被 Server 生产解析入口选用；全观测哈希核验、能力声明/匹配、DSA 输出及冻结重放仍开放。仅结构和一致性校验通过，不作为来源真实性或整个 D01-wire 完成证据。

### V3 承载边界核对

当前 `packages/schemas/src/market-data-wire-v3.ts` 使用严格响应对象，`market-coverage-proof-v3.ts` 的分页证明只有状态、页数和 continuation 标志，不能承载子窗口事实。`market-window-evidence-v3.repository.ts` 保存及校验的是当前单响应。已在主 Spec §8.3 明确非递归子响应证据、父子窗口与内容一致性、全观测指纹及能力匹配要求，并在 D01 下拆出 wire、执行、消费、运行时四阶段；尚未宣称合同已实现或支持多窗口成功响应。

### 多窗口受控 HTTP 集成

采集测试现通过生产 `fetch_hithink_etf_daily_bars` 和生产解析器消费受控 HTTP 响应，覆盖三窗一致、第二窗缺少中间交易日、第二窗显式分页以及第二窗价格冲突。失败用例明确断言 `incomplete_coverage`、`pagination_unverified` 和带 `bar_mismatch` 诊断的 `invalid_response`，且均只发出两次请求；成功用例保留三个实际响应指纹和全部三组交集证明。

第一次加强错误码断言时，缺日夹具因删除末日却保留末日时间戳，先触发 `invalid_response`。已将夹具改为缺少中间交易日，并确认命中覆盖不足分支。修正后的采集文件 **13 项通过**，日志 `/private/tmp/goal-d01-http-final-20260927.log`；其余 ETF 与重叠测试的 46 项沿用本轮 `/private/tmp/goal-d01-http-20260927.log` 的通过结果，未修改对应输入。关键 flake8 检查通过。

已建立受控 HTTP→生产单窗解析→多窗口采集→重叠比较的链路。生产 V3 wire、冻结和运行时消费仍未接入，D01 不勾选；本轮没有真实 HiThink 调用或容器同步。

### D01 有预算的多窗口采集

新增 `thesis_ledger_hithink_windows.py`，实际调用重叠比较内核：全部窗口先复用单窗口请求和日历校验，确认相邻窗口存在上市后交易日交集；调用方必须提供最大请求次数和总时间预算。顺序采集、不重试、每次使用剩余超时，晚到响应拒绝；新窗口与全部有日期交集的既有窗口比较，错误或冲突即停止。结果保留每窗响应和 UTC 开始/完成观测时间，不输出合并 wire Bars。

采集器和比较内核共 **22 项测试通过**，关键 flake8 检查通过，日志 `/private/tmp/goal-d01-collection-20260927.log`。新增用例覆盖三窗全部两两交集、超出请求预算、非法末窗在首请求前拒绝、无交易日交集、第二窗失败/冲突停止、晚到响应拒绝。

当前已有采集器到比较内核的调用链，测试采集端使用受控序列。尚需用实际单窗口解析器完成受控 HTTP 集成验证，并明确运行时 wire 如何承载多窗观测后接入当前 V3 请求路径；尚未部署或发起真实来源请求。D01 父项及执行/验证叶子继续开放。

### D01 重叠比较实现第一步

已在主 Spec §8.3 明确两次已校验观测的比较合同，并新增 DSA `thesis_ledger_hithink_overlap.py`。比较结果保留两窗范围和响应指纹；标的、口径、单位或方法基准不同返回未核实；逐交易日比较 OHLC、成交量及成交额，冲突返回日期；无交集、空交集、日期集合不同或重复日期均不返回一致。未知方法版本和锚点保持未知，函数不输出合并 Bars。

定向测试 **13 项通过**，关键 flake8 检查通过，日志 `/private/tmp/goal-d01-overlap-20260927.log`。本函数目前尚未接入多窗口采集或运行时读取，因此只完成比较内核，D01-window-execution、D01-window-verification 和 D01 父项继续开放；不重复同步尚无消费入口的辅助模块。

### 股票分页截断修复

股票适配器此前仅核对交易日覆盖，未检查响应中的显式分页标记。已提取由 HiThink 适配层拥有的 `thesis_ledger_hithink_pagination.py`，ETF 保持原检测行为，股票适配器复用检测并以 `incomplete_coverage` 拒绝未确认分页，不把当前页的日期齐全当作完整响应。

新增股票回归覆盖 none/qfq/hfq、顶层/data 容器，以及 `hasMore`、`next_page`、嵌套 cursor，合计 18 项反例。股票、ETF 和股票 V3 运行时测试共 **87 项通过**，关键 flake8 检查通过，日志 `/private/tmp/goal-d02-pagination-20260927.log`。本次修改缩小两个既有适配器文件，未扩大存量大文件规模。

准入、凭据修订、未启用来源及旧路由另有 **22 项通过**，日志 `/private/tmp/goal-d02-admission-20260927.log`。随后官方 `sync-code.sh dsa` 同步成功，退出码 0，日志 `/private/tmp/goal-d02-pagination-sync-20260927.log`。目标容器内直接导入股票适配器，注入受控 `hasMore:true` 响应，确认返回 `incomplete_coverage`；探针使用测试字符串，无真实外部请求或准入修改。此次仍是容器可写层更新。

D02 的本地实现范围现已收口：三口径独立映射、未知标签拒绝、单位保持、权限/额度错误分类、缺少交易日和显式分页拒绝均有直接测试。C04 前置已完成；真实启用仍依赖独立 G0-H 门禁，本地收口不表示账号可用或生产准入通过。

### 未锁定请求的主备数量修复

源码核对发现 `execute_market_bars_v3` 仅在提供 `route_target` 时检查 Effective 中目标数量。现将 `len(targets) > 2` 检查移到两条路径共用的位置，保持文件规模不变，落实 Spec §7 每条路由最多一个主源和一个备用的约束。

新增 `tests/test_thesis_ledger_v3_target_count.py`，覆盖锁定及未锁定两条路径：即使第三目标当前禁用，非法数量也在准入、健康或适配器调用前返回 `invalid_response`。与来源熔断、目标锁定、V3 行情回归合计 **49 项通过**，日志 `/private/tmp/goal-d03-count-20260927.log`；修改文件的关键 flake8 检查通过。

该修复已通过 infra 官方 `./scripts/sync-code.sh dsa` 同步成功，退出码 0；日志 `/private/tmp/goal-d03-sync-20260927.log`。宿主和目标 DSA 的 `src/services/thesis_ledger_provider_runtime.py` SHA-256 一致：`a48f298582e862ec45bf60b5b95c2fe683131d0ac568ed7e3996ea451f383164`。

目标容器内直接导入当前运行时，用受控 Effective 三目标配置分别执行锁定和未锁定请求，两者均在外部调用前以 `invalid_response` 拒绝非法数量。此探针未使用真实凭据、修改策略、访问业务数据库或发起来源请求。

DSA 镜像仍为 `sha256:d4a11dfbf07eba886f9b385aa028dbedde0b8f8d997e97a82f9d0163834192d0`；同步只更新容器可写层，不是新镜像发布，容器重建会恢复镜像代码。

限流追踪同时确认 `claim_provider_request_budget` 以 `upstream_source` 参与持久化键，但共用执行器当前仅为 ETF `REALTIME_QUOTE` 申请该预算，不能将其作为 V3 `DAILY_BAR` 限流证据。此差异仍需按来源实际配额合同处理，不擅自给历史行情套用报价冷却时长。

### 共用执行面的目标熔断补验

新增 DSA `tests/test_thesis_ledger_target_circuit_isolation.py`，4 项通过（日志 `/private/tmp/goal-d03-isolation-20260927.log`），关键静态检查 `flake8 --select=E9,F63,F7,F82` 通过。测试调用 V3 使用的 `_execute_with_metadata` 执行面，未替换实际熔断器：

- 同一 `akshare` 的 `eastmoney` 来源连续三次上游失败或限流后熔断。
- `sina` 来源仍可成功执行，保留实际来源和 revision；其成功不重置 `eastmoney` 熔断。
- 使用同一受控健康存储重建运行时后，已持久化的来源熔断仍只阻止原来源。
- 被熔断的来源再次请求时不调用适配器，不出现隐藏重试。

该测试使用受控健康存储及执行目标，不证明生产数据库持久化、V3 来源准入或供应商共享账户配额的限流预算隔离。

- D01 的跨窗口重叠一致与冲突处理尚未实现。当前 `fetch_hithink_etf_daily_bars` 只验证单个请求，`_validate_request` 拒绝超过五个日历年的窗口；Server `MarketBarReaderV3.read` 的读取回调只发出对应目标的单次请求，`selectMarketWindowV3` 选择单个完整响应，`MarketWindowEvidenceV3Repository` 保存该响应，不负责多窗口采集或合并。不能以不混源、单窗口覆盖或哈希保存代替重叠区一致性验证。
- D03 的同 Provider 不同 upstreamSource 熔断及健康更新已有上述反例；限流预算、完整 V3 准入链仍需核对。V2 用例或锁定目标用例不能直接替代全部 V3 隔离要求。
- G0-H 真实启用条件继续保持开放；fixture 通过不能作为账户可用、真实覆盖完整或真实回测成功的证明。

因此本轮不勾选 D01–D03 父任务；后续先处理上述可在本地验证的缺口，再继续其他任务。
