# 历史研究指标指纹修复与交易规则离线诊断

## 范围与结论

用户要求离线修复指标指纹不一致，并检查历史交易规则缺失的具体原因，不调用模型或重试比赛。对应[活动任务 T2d-CF／T2d-CG](../tasks/2026-11-12-arena-replay-live.md)及[规格 AC03、AC10](../specs/2026-11-12-arena-replay-live.md)。

指纹实现已修正，44 项不同的定向测试通过；原样本的旧指纹被拒绝，修正后的同一批点通过本地 DSA 实际计算。全部 Server 源码和四项相关测试的隔离类型检查通过，范围内 ESLint、依赖边界通过。本报告原验证批次的完整包级类型检查被另一处回测测试的两项错误阻塞，当时未执行构建或部署。

后续记录批次的完整 Server 类型检查、Nest 构建、4 个 workspace 依赖重建及 60 项相关离线回归已通过，并以全部根输入的固定编译快照完成最终诊断和产物生成，详见[包级门禁补验证据](2026-11-16-arena-server-build-offline.md)。以下原失败记录保持不变；共享工作区后续改动不自动计入本轮快照，部署、真实历史资料及最终业务验收仍未完成。

历史规则问题已离线定位到两个独立缺口：日线可交易性入口不接受同日盘中时点；静态 A 股／ETF 事实明确没有合格执行制度。后续日状态、涨跌停及公司行动检查尚未到达，不能把它们说成已失败或已通过。

本轮没有模型、行情来源、数据库或比赛服务调用，没有更改提供方、采样参数、比赛记录或历史回执；没有更新容器。完整业务闭环及回放追平仍未完成。

## 指纹根因与修改

`MarketArenaHistorySource.research` 原先对 `JSON.stringify({identity, points})` 求 SHA-256；DSA 指标入口先按证券身份、排序后的点、规范化数字和可见时点编码，再校验摘要。即使数值完全相同，两种编码也不一致。

[历史读取器](../../apps/server/src/market/market-arena-history-source.ts)现复用 Market 既有 `barSeriesInputFingerprint`，由共享 `canonicalBarSeriesEncoding` 生成同一规范化表示。产品改动仅为增加导入、替换摘要调用，没有新增算法、依赖、跨领域导入、协议版本或绕过校验。身份发现使用的独立摘要不变。

先按模拟时点裁剪完整分钟，再按原 `limit` 取点，最后计算指纹；K 线返回与指标请求绑定相同输入。计算响应的顶层／逐项指纹、引擎版本、指标名称及数量拒绝条件保留。旧工具回执和归档不重算、不改写；新摘要只用于新的读取和计算。

## 原样本跨运行时离线验证

使用[上轮隔离工具往返](2026-11-16-arena-isolated-tool-roundtrip.md)留下的私有 `tools.json`，证券 `588000.SH`、周期 `5m`、业务时点北京时间 2026-11-10 13:01。冻结 K 线保留原点，按原请求取最后 10 根计算，不重拉来源或改动原请求的限制。

新增[指标定向测试](../../apps/server/test/market/arena-history-indicators.test.ts)、[跨运行时测试](../../apps/server/test/market/arena-history-offline.integration.test.ts)及[Python 离线夹具](../../apps/server/test/market/fixtures/arena-history-offline.py)。跨运行时测试必须显式提供旧回执路径；普通测试环境不依赖私人数据或兄弟仓库。测试把冻结点按已经投影的区间结束时点注入历史读取器，避免二次平移；该注入不认证原来源的时间戳或会话质量。

Python 子进程直接加载当前 DSA 的 `_bar_series_fingerprint`、`calculate_indicators`，没有调用 HTTP。进程审计阻止网络、DNS 和数据库连接，并断言没有尝试这些访问；关闭字节码写入和测试资料模式。旧摘要仍由真实 DSA 校验拒绝，新摘要通过真实计算与响应 Schema。

两项指标绑定的新摘要均为 `d5061b48e88c5c39ddbe56b600f38dc62a661d14f6d440736ecca19e650cc7d4`。

| 原请求      | 本地实际结果                                                                         |
| ----------- | ------------------------------------------------------------------------------------ |
| MA，10 根   | 返回 10 个点；末点 `ma5=1.3436`，`ma10=1.3458999999999999`，`ma20`／`ma60` 为 `null` |
| MACD，10 根 | 返回 10 个点；末点 `dif`／`dea`／`histogram` 均为 `null`                             |

空值表示原有预热不足，不再是指纹拒绝。本次没有扩充隐含读取范围、修改指标参数或舍入原始数值，亦没有把空值认证为有效交易信号。测试同时断言 MA 有可计算值、较长预热项及 MACD 保持空值。

冻结回执 SHA-256 前后为 `2731c18d85ef161f5bb58573802047c40a6ad3531c7e33fe8f92c9f12c0ca367`。

## 历史规则拒绝的具体路径

Market 的 `observe` 对成交证券先调用 `DsaClient.backtestInstrumentFacts`，请求当日区间和原始 `dataAsOf`。DSA 的 `instrument_facts_response` 返回证券单位、历史可交易性及制度状态；随后 Market 在 `replayExecutionInstrument` 检查 `tradable`、`executionRules.status`、覆盖范围和结算条件。

原回执只记录顶层 `replay_rules_unavailable`，没有保存完整事实响应。本轮在当前 DSA 源码上按原证券、日期和业务时点复现以下结果，不补写原调用的审计事实，也不将本地源码检查提升为已部署运行态验收。

1. `real_cn_tradability` 使用日线完整性证明该日可交易性，保守可用时间是请求结束日期的下一日零点。原时点北京时间 11 月 10 日 13:01，早于 11 月 11 日 00:00，因此在访问来源前返回覆盖不完整、`tradable=false`；缺项为 `historicalTradability`，原因是“dataAsOf 早于请求区间历史交易状态的保守可用时间”。这不是分钟价格缺失，也不是该次路径中的来源权限或网络错误。
2. `static_cn_instrument_fact` 对 ETF 提供整手 `100`、最小价位 `0.001`，但 `executionRules.status` 固定为 `unavailable`，理由为“缺少覆盖请求历史区间的价格限制、法定收费与结算规则事实”。日历、标的身份及可读价格都不会自动生成这些制度事实。

受控反事实检查仅在隔离进程中把历史可交易性结果替换为完整覆盖，仍得到 `tradable=true`、`executionRules.status=unavailable`，缺项仍含 `executionRules`。这个受控输入证明两个缺口独立存在，不冒充真实历史来源或可成交证据。

使用上述实际 DSA 响应与受控日历／价格进入 Market 门禁，确认抛出 `replay_rules_unavailable`；`readComposition` 和公司行动读取器均未调用。因此当前不能断言后续停牌状态、精确价格限制或公司行动存在何种缺失。

另一个尚未触发的接入限制：Arena 没有给该回测事实入口提供精确日线路由；即使把时点移到日线可用之后，该入口还会检查 `RouteKey`／`RouteTarget`。不能靠后移 `dataAsOf` 修复盘中回放，也不能用当前事实、默认规则或旧测试覆盖代替历史制度。

后续执行面需要面向盘中模拟时点的历史可交易性证据，以及覆盖该证券／日期、在该时点可见的版本化结算和法定收费等执行制度，再独立验证日状态、价格限制和持仓事件。该实现及真实验收仍由 T2d-CT-B／T2d 持有；本次没有改变规则来源、状态或准入条件。

## 检查、失败记录与限制

命令中的 `pnpm` 实际通过 `/Users/yzin/.volta/bin/pnpm` 执行，Shell 使用 RTK。测试工作目录为 `thesis-ledger/apps/server`：

```sh
pnpm exec vitest run test/market/arena-history-indicators.test.ts test/market/arena-history-source.test.ts
ARENA_HISTORY_OFFLINE_RECEIPT=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/arena-isolated-roundtrip-20261116-once/tools.json ARENA_HISTORY_OFFLINE_DSA_ROOT=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis pnpm exec vitest run test/market/arena-history-offline.integration.test.ts
pnpm exec vitest run test/market/arena-replay-reader.test.ts test/market/market-indicator-window.test.ts test/market/market-series-identity.test.ts test/model-arena/live-execution-scope.test.ts
pnpm run typecheck
```

| 检查                       | 结果与边界                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| 历史来源及新指纹回归       | 15 项通过，覆盖全部五个允许分钟周期、裁剪／限条数、MA／MACD 和五类错误响应拒绝                        |
| 原回执与本地 DSA           | 3 项通过：两个指标旧拒绝／新计算，以及两个独立规则缺口和 Market 拒绝顺序                              |
| 关联消费者                 | 26 项通过；输入未改变后复用，不重复累计测试数                                                         |
| 范围内 ESLint／依赖边界    | 通过；Market 内复用既有函数，不修改模块依赖职责或门禁                                                 |
| 隔离类型检查               | 全部 Server 源码、Prisma、配置及四项历史相关测试，共 934 个根输入，原编译选项不变，0 项错误           |
| 完整 Server 类型检查       | 未通过：`test/backtest/session-series.test.ts` 第 24 行 `TS2352`、第 31 行 `TS2375`；本次未修改该文件 |
| 构建／部署／真实模型及比赛 | 未执行；包级类型门禁仍保留，目标容器未更新                                                            |

隔离类型检查从 Server 目录调用 TypeScript `getParsedCommandLineOfConfigFile('tsconfig.json', {noEmit:true}, ts.sys)`，使用全部非测试根输入以及 `arena-history-indicators`、`arena-history-offline.integration`、`arena-history-source`、`arena-replay-reader` 四个测试文件创建编译程序。没有修改项目 `include`、编译选项或忽略列表；这个检查不能替代完整包级通过。

夹具初版因没有设置 Python 模块路径而导入失败，已给子进程显式设置 DSA 根目录的 `PYTHONPATH`；新增测试的类型收窄和受控响应类型也已修正。第一次隔离类型检查在 Context Mode 临时目录中创建编译程序，产生类型定位错误；改为从实际 Server 目录加载完整配置后通过。这些是本轮验证夹具的问题，不是模型、来源或历史规则的新失败，不计作任何真实请求重试。

核心产品文件验证时 SHA-256 为 `203dca63b276fc3a12842e9b34946220c7f199da713828ece9e1b903e2a851ad`；使用的 DSA `api/thesis_ledger.py`、`thesis_ledger_dependency_facts.py`、`thesis_ledger_tradability_provider.py` 摘要依次为 `2ade1e74f231353bac1a38fad20509d1833ad5a24c7788fe7acc6792d4429f31`、`6260627a5d2708acfeafdad4b8fb43d077a3677f82aae28c732ee1eae1cbe1ab`、`f189fc2def2ae433f0d19531385e812ddcff93e7a0bf4a183eabc69efd4f7ba3`。本次没有修改 DSA。

最终审查：指纹修复、离线验证与缺口诊断范围一致，旧失败和归档保持；完整包级门禁、部署、真实交易及历史追平不冒充通过。不创建提交或归档活动任务，不转移当前验收义务到 TODO。
