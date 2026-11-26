# 策略定义剩余范围实施记录

对应[上层 Task](../archive/tasks/2026-11-13-strategy-definition-authoring.md)的 L01、L03、L04、G03。2026-11-19 用户要求一次性推进剩余任务，并选择完成现有策略定义任务、具体披露不支持的数据／组合能力；不另建外部时点数据和组合／多腿执行系统。

## 工作区与执行边界

使用 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger` 的 `main@1ed418780d19` 及共享未提交修改。前轮 R11 盘点保留在[窗口核对](2026-11-19-strategy-highest-window-audit.md)。本轮修改正式数值／窗口／事件合同、Domain 计算、Server 构建与探索结果、双端编辑与回读，并按变更定向验证。历史策略、真实 Provider／路由、交易计划及 ATR 归档回执保持原值。经三批明确授权累计完成33次真实模型调用；2026-11-20最后7次中3例通过、4例未通过，13个独立业务样本按最新证据9例通过、4例未通过，见[七例真实复验](2026-11-20-strategy-expression-seven-recheck.md)。未进行外部行情实读、目标部署、提交或推送。

## 已执行的本地检查

以下均在主仓执行，依赖命令使用 `rtk proxy env npm_config_registry=https://registry.npmmirror.com` 前缀。本节按实际断言记录结果，不把局部通过提升为整体验收。

| 命令主体／范围 | 结果与边界 |
| --- | --- |
| `pnpm --filter @thesis-ledger/domain build`、`pnpm --filter @thesis-ledger/schemas build` | 已通过当前批次构建；生成产物仅在本地，不代表目标容器。 |
| Server `vitest run test/backtest/numeric-history.test.ts test/backtest/expression-windows.test.ts` | 23 项通过；包括 R11 排除当根、102% 严格阈值、精确四则、除零、历史缺值与延迟、连续确认、五中取三、标准差／分位黄金值、累计锚点。 |
| Server `vitest run test/backtest/expression-events.test.ts` | 9 项通过；事件有效窗两端、失效优先、同根与重复模式、冻结取值、作用域、两侧摆动确认及原时点取样。 |
| Domain `vitest run test/backtest-adx.test.ts` | 3 项通过；Wilder 初始化、+DI／−DI／ADX 独立黄金值、缺值重置与延迟传播。 |
| Server `vitest run test/backtest/expression-frozen-replay.test.ts` | 2 项通过；105 突破而 100 不突破，正式快照构建、冻结、实际 Runner 与重复回放一致；前者在下一交易日开盘买入。输入为独立模拟行情，冻结后读者抛错。 |
| Domain `vitest run test/strategy-definition-draft.test.ts test/backtest-rule-compatibility.test.ts test/backtest-simulation.test.ts` | 31 项回归通过；以实际命令执行时的源码为准，后续共同合同修改需检查受影响范围。 |
| Desktop `vitest run test/strategy-definition-editor.ui.test.tsx test/authoring-ui-contract.test.tsx` | 19 项通过；不替代新增控件的实际页面与原生验证。 |
| Server `pnpm typecheck`，Desktop／Mobile `pnpm typecheck` | 各已通过相应实现批次；后续新增消费与测试修改完成后仍需复核受影响包。 |
| Server `vitest run test/strategy-optimization/strategy-optimization-prompt-contract.test.ts test/ai/ai-generation-schema-yaml.test.ts` | 11 项通过；文本请求与实际预留小于原 16,000 字节上限，闭合字段／必填／枚举／范围／引用断言保留，原生仍携带完整输出合同。 |
| Server `vitest run test/strategy-optimization/strategy-discovery-capabilities.test.ts test/strategy-optimization/strategy-optimization-sdk-executor.integration.test.ts` | 15 项通过；同标的额外周期装配、越权来源拒绝、能力报告保留原意；本地 HTTP 一次请求、一次结算保存，不变为候选或自动重试。 |

## 修正与失败事实

- 首轮数值测试的 Schema 3 样本缺显式价格坐标，4 项在正式校验失败；补齐受控样本的 `actual` 后 11 项通过。后来提取测试夹具时三个带类型注解的常量漏导出，导致 9 项失败；补齐导出后数值／窗口 23 项通过。没有放宽正式校验。
- 新增可选统计参数首次触发 `exactOptionalPropertyTypes` 构建失败，修正可选 `undefined` 合同后通过。扩展定义使 Desktop 推导类型超过序列化上限，给既有 `authoringApi` 增加实际方法接口注解后类型通过。
- 扩展探索结果增加能力报告分支后，既有成功结果的无条件 `.strategy` 类型使用不再成立。正式模型合同保留结果分支；成功候选装配继续只返回可执行策略，已保存能力报告以具名结果停止该模型，不冒充候选。
- 文本探索输入先后为 21,983、19,599 字节，原 16,000 门槛均失败。保留断言、移除重复说明注解、用标准 YAML 锚点复用长键和引用，并压缩重复业务提示后通过。首个标量锚点实现触发 YAML 默认别名上限；修正为避开已有对象锚点内部、限制复用组，保留默认解析限制。全 flow 布局中的换行仅为序列化空白，字符串内换行转义；特殊字符及重复结构的默认解析往返通过。
- 本地 SDK 回归另发现旧断言仍匹配旧版披露文字，及“非法来源”夹具缺当前必填 `reason`、引用旧合同版本。修正为当前披露、补齐该受控夹具并使用当前合同后 15 项通过；历史真实模型原文与失败回执未改。
- 首轮冻结回放测试误读结果字段 `fills`，正确字段为 `simulationFills`；改正测试消费者后，突破／等值两项通过，未改执行结果结构。

## 后续验收边界

L01、L03、L04、G03 的当前状态由上层 Task 持有。浏览器／原生、隔离持久化、真实模型和目标部署分层记录；尚未执行的层级保持未完成。交易计划及 ATR 仅复用[归档 Task](../archive/tasks/2026-11-15-backtest-trade-plans.md)与[ATR 成对回执](../archive/evidence/2026-11-19-backtest-atr-authoring-pair.md)，不重复采样、不抹去旧失败。

## 浏览器、原生与隔离 Worker

- 浏览器使用 `scripts/local-runtime/strategy-expression-editor-browser.mjs` 和独立 Vite `127.0.0.1:5198`。Desktop／Mobile Web 各覆盖 1440、1024、768、390，最终 8／8；实际生产编辑器完成 JSON 往返、历史根数修改、布尔开关、数字枚举、递归来源改名、长小数保留、取消／继续和受控保存，无页面错误与横向溢出。回执为 `var/acceptance/strategy-expression-browser-20261119/receipt.json`。最初路由拦截误含源码 `/api/` 路径导致空白，已限定实际 `/api/` 请求，原失败文件保留；随后修正累计锚点显示为明确 UTC 的中文日期。
- iPhone Air 为 iOS 26.5 模拟器 `23AB3E1A-4C30-462C-943C-B9CB5B894E96`，复用现有原生容器。`xcodebuild` 的 `test04ExpressionHistoryAndBoolean` 1／1 与 `test99Cleanup` 1／1 通过；原生键盘改历史根数、Switch、JSON 类型及精度均已核对。产物在 `var/acceptance/strategy-expression-native-20261119/ios-controls.xcresult`、`ios-cleanup.xcresult`。不把这次 JavaScript 载入称为重新编译产品 Native 工程。
- Android 使用独立只读 AVD、ADB 端口 5042 和设备 `emulator-5560`，受控 API 5193、Metro 8083。宿主 ADB 37.0.1 的 arm64 守护进程出现 `libunwind` 崩溃；同一 SDK 经 x86_64 启动恢复。重设其专用反向端口后实际加载隔离入口。前几轮另暴露脚本点击未完整可见按钮、旧本机草稿查询缓存以及导航定位问题；修正验收脚本可点击范围和受控入口重置缓存后，键盘／开关／JSON 精度／草稿保存与清理通过，见 `android-current-baseline/result.json`，早期失败目录保留。未修改真实连接、业务草稿或正式业务记录。
- 隔离正式入口为主仓 `node scripts/test-strategy-expression-roundtrip.mjs var/acceptance/strategy-expression-browser-20261119`，退出 0，3／3。沿用仓库专用 PostgreSQL／Redis 测试宿主，随机名称、标签及 loopback 端口、tmpfs，无业务 volume；结束清理。浏览器两端相同定义逐字段保存、冻结，真正子进程 Worker 领取并完成；另两个受控 R11 变体分别在 105 时于 2026-05-19 买入，100 时无买入，三份完整结果均重复回放一致，业务账本及真实持仓记录数均为零。最终日志 `var/acceptance/strategy-expression-worker-1795088020.log`。
- Worker 初轮使用默认 10 秒前置等待，迁移准备超时；改为该宿主实际需要的 60 秒，保留清理。其后准备拒绝事件冻结值／标准差与零比较，修正价格单位追踪和零阈值尺度证明；非零价格平移仍须原转换约束，新增正反测试通过。R11 旧夹具循环覆盖受控 OHLC 的失败修正为独立样本。随后发生本地 HTTP `EADDRNOTAVAIL` 和新连接池不可达，未改系统网络；复用宿主已连接 Prisma 后 Worker 两个 R11 样本通过。复杂定义仍因模拟成交量单位未知而被正式门禁拒绝，补充受控输入的 `split-adjusted` 单位事实后全部通过，未放宽门禁。

## 包级回归与剩余门禁

Domain 全包 116 文件／1018 项通过。Schemas 全包最初 163 文件通过、1 文件失败（1697 通过／1 失败），失败为原生根对象断言尚未识别能力报告联合分支；适配该测试后单独 1／1 通过。后续坐标追踪及零阈值修正，价格研究、能力联合分支与新增坐标回归 3 文件／8 项通过，未反复重跑不变的包。

Server 全包实际为 626 文件通过、23 失败、130 跳过，4825 项通过、86 失败、583 跳过；Desktop 全包 14 项失败。完整日志分别为 `var/acceptance/strategy-expression-server-tests.log`、`strategy-expression-desktop-tests.log`。多项 HTTP 失败为宿主 `EADDRNOTAVAIL`；另有旧 Schema 2／引擎版本、旧控件标识和文案、其他领域合同断言不匹配。已修正本轮探索提示遗漏常量写法及冻结字段说明，探索 11／11、提示预算 9／9 通过；不能据此称整包或仓库门禁已通过。真实目标部署尚未执行。

同标的跨周期可见性及累计锚点准备 2／2，多模型能力报告停止范围及最终分类 9／9，通过；小时决策不读取未完成日线，累计锚点扩大准备范围但拒绝静默扩大已冻结预算。新增生产循环依赖在 Android 产生 Require cycle 警告后，把来源／观测元数据提取到无运行依赖的模块；没有关闭告警规则。

## 真实模型输入、授权与结果

已经准备 13 个无字段名的业务样本：相对阈值与排除当根前高、五中取三与逐根确认、标准差／分位／跳空、冻结事件价、ADX 与方向分量、已确认摆动背离、同标的多周期与累计锚点、外部数据／组合缺口、趋势、逆势、趋势同义表达、仅改入场周期、未指定均线类型。每条原意和正式实际消息在 `var/acceptance/strategy-expression-model-preflight-20261119/`，只读预检 1／1，没有模型请求。

正式入口复用 infra `scripts/infra.mjs locked --idle` 下的应用 `scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs`，新增 `BACKTEST_PLAN_SCENARIO=strategy-expressions` 与显式 `STRATEGY_EXPRESSION_MODEL_LIVE=1`；只读原 Provider 设置，沿用原真实模型及路由，不修改真实资格。上限 13 次业务生成／分析和 4 次私有用途资格，共 17 次；各样本一次，资格或生成传输失败停止增加调用，不自动重试。保存只在隔离数据库，冻结行情仍为独立模拟样本。结构通过后仍逐项人工核对原意和中文，尚未真实执行的层级不勾选。


2026-11-19 用户已明确授权本批上限 17 次真实模型调用。按业务小批运行，同一用途的已完成私有资格仅在当前合同与配置指纹仍通过严格就绪检查时复用，不增加资格探针。前置输入的冻结、实际 wire 与业务原文分别保留；超出该上限不自动继续。

最后一批本地 Server 定向验证为 14 文件／93 项通过；三端类型检查及 Domain／Schemas 构建通过。生产 Server／Schemas／Domain 的受影响文件 lint（含禁止嵌套三元）通过；双端受影响文件 lint 退出 0，React Native Flow 依赖解析的 stderr 保留原日志。导入边界、依赖图、文件规模及全工作区 `git diff --check` 通过。全仓复杂度／lint 的实际结果另记，不用局部通过替代。

本轮创建的 Vite 5198、受控 HTTP 5193、Metro 8083 均已核对进程身份后停止；iPhone Air 恢复关机状态，独立 Android 模拟器与 5042 ADB 服务退出。两端隔离草稿已清理，不改业务连接和业务数据。


真实模型第 1 个业务样本（`01-relative`）已完成一次资格及一次生成，合计 2 次传输。原生输出在 `reason` 声称前高／EMA 过滤，但实际 `entry` 仅为未持仓，两项均遗漏；并自行生成日线委托模板。正式隔离保存后，冻结阶段以“日线委托缺少已冻结的模拟撮合政策”拒绝，未补写配置、未执行该错误候选，也未重试该样本。该轮输入同时含种子费用为零与用户文本费用 0.03%／0.1% 的夹具不一致；后续首次样本已把实验固定费用对齐文本，原请求与失败仍原样保留。费用矛盾不改变前高及 EMA 过滤实际遗漏的结论。

全仓复杂度／lint 首次执行在 Desktop 1202 文件组触发 Node `Reached heap limit`，退出失败，原日志 `var/acceptance/strategy-expression-workspace-guardrails.log` 保留。该结果不计通过，局部 lint 及文件规模检查结果独立成立。


第 2 个业务样本 `count-confirmation` 同样在原生理由中提到五中取三／连续确认，实际条件却只有 `close > 0`，并改为日线委托，正式冻结以研究坐标绝对价格门禁拒绝。随后用实际 `wire-2-1.json` 的 JSON Schema，独立经 Ajv 校验包含 all、lag／Highest 和 EMA×1.02 的完整 R11 配置，结果通过；实际出站 Schema 包含新增全部节点。该受控结构探针不是模型输出，也未用于替换失败配置。当前模型遗漏不能凭本地原语执行通过而抹去。

## 首批17次模型结果与复验准备

实际发送13次业务样本和4次私有用途资格探针，正好17次，未自动重试。结构层为5例正式保存／冻结／完整重复回放通过、1例分析结构通过、7例在装配或冻结阶段失败。按原意复核仅4例通过，另9例未通过；包含两个结构通过但语义错误的样本：趋势把EMA写成MA，摆动背离取了RSI自身低点而非价格低点当时的RSI。完整逐例判定见[真实模型语义复核](2026-11-19-strategy-expression-model-semantic-review.md)，原始回执与SHA256保存在私有目录。不能把本批记为AC09通过。

实际有效三份定义的受控成交也已核对：逆势5月26日买入；趋势同义与局部周期修改均5月21日买入、5月26日卖出。前者对应5月25日下穿，后两者对应5月20日上穿及5月25日下穿；各自按下一交易日开盘成交。相同成交不证明EMA与MA等价，首趋势样本仍失败。

最后针对实际错误补充事件capture与eventValue的正确引用、价格摆动的sample、额外周期声明、能力报告分支，保留直接生成正式AST，不增加自然语言修补器。9个失败业务样本的当前消息／合同只读预览通过，位置为 `var/acceptance/strategy-expression-model-repair-preview-20261119/`；没有新增模型请求。矩阵入口允许明确选择样本、限制本批调用数，并要求已有私有资格；资格缺失或失效时停止，不自动增加探针。后续若获授权，仅复验这9例、上限9次、使用原模型与路由和已有资格，原17次回执保持原样。

## 同标的跨周期正式冻结与执行

最终检查发现旧V3准备／构建只允许来源周期与主周期相同，不能以Schema接受多周期代替执行支持。本轮增加独立物理来源计划：同一标的的日线和原始分钟分别固定窗口，逻辑来源按周期与价格口径复用；RunConfig保存额外窗口身份，构建持该身份读取，冻结后Runner／Worker不访问行情来源。证据含完整请求／响应、父子窗口身份和行情行摘要。完成／可见时间、独立来源ATR预热及价格基准均核验；严格历史截点不推进，仅明确取得后冻结的固定快照允许推进。未增加独立参考资产或组合执行。

- `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/expression-multitimeframe.test.ts`最终9项通过；包括日线／小时互为主周期、正式准备、丢失／改变身份、预热不足、价格基准不兼容、冻结证据及行情篡改、ATR别名预热、严格时点与取得后冻结、多周期模型受控冻结夹具。额外来源helper原测试需把已支持的signal从拒绝样本改为允许，benchmark用途继续拒绝；首次旧断言失败保留。
- 生命周期相关4文件35项通过，含10项创建、15项运行与2项既有生命周期冻结，加当时8项多周期；`strategy-expression-final-lifecycle-regression.log`保留命令结果。准备／输入计划／源规划另4文件34项通过，采用当时8项多周期基线。
- 在主仓运行 `node scripts/test-strategy-expression-roundtrip.mjs`，现有隔离宿主创建本轮PostgreSQL／Redis，正式HTTP创建、队列和已构建子Worker实际执行。最终4／4通过（原浏览器提交、R11突破、R11等值、多周期），多周期5月19日成交，持久化定义和完整结果重复回放一致，业务ledger及position仍为0。日志 `var/acceptance/strategy-expression-worker-multitimeframe2.log`；脚本退出0，隔离资源清理完成。
- 首次双向测试把小时主周期的预期成交误写为次日，正确为5月18日同日后续开盘；仅修正预期，正式数据可见政策保持。首轮构建有测试行类型错误，修正明确ArtifactRow类型后构建通过；首次实际创建又暴露只允许执行RouteKey的旧manifest检查，已按精确来源计划扩展且保留标的／身份／内容hash门禁。原失败日志均保留。

## 最后静态检查与清理

Domain构建、Server构建与Server／Desktop／Mobile最终类型检查通过。新多周期生产及夹具文件lint（complexity≤20、函数行数≤220、零warning）通过；边界、依赖图和文件规模检查通过。最终提示与发现合同3文件16项、Schemas准备／出站合同／坐标3文件15项通过。当前检查不替代目标部署。

全仓guardrails用8GiB临时Node堆继续执行：Desktop／Mobile组已有本轮结果复用，剩余Server及packages／services／scripts逐组检查完成。发现的本轮4个lint错误已修正（多周期未用导入、安全unknown数组类型和仅类型导入），另有既有 `packages/schemas/src/strategy-authoring-definition.ts:94` 多余断言错误，未擅自改动该共享工作内容；各组复杂度／函数规模warning保留日志。因此整个工作区guardrails仍不计通过。默认堆OOM、所有原包级失败保持原记录，不反复重跑全套验收。

最终只读Docker清单确认本轮隔离库／Redis已退出，原应用和其他项目容器继续运行。浏览器、原生模拟器与端口清理沿用上节已完成回执。目标Server／Worker尚未同步本轮源码，不宣称镜像或运行态更新。

补充收尾结果：额外来源helper旧断言修正后4／4通过；最终Server类型与本轮15个新增／受影响文件的零warning lint通过。模型验收夹具已独立支持实际多周期准备，控制样本原样定义、预期5月19日成交与完整重复回放通过；没有借此替换任何失败模型输出。最终边界、文件规模和全工作区 `git diff --check` 均退出0。追加9次业务复验问题已提交用户确认；收到明确答复前不执行依赖该授权的调用。

2026-11-19 用户已明确回复“授权这9次业务复验”。本批新目录为 `var/acceptance/strategy-expression-model-repair-live-20261119/`，最多9次业务调用、0次资格探针；严格复用原批私有资格。各例一次、原模型／路由、隔离保存及无自动重试的约束继续生效。旧17次原始证据不覆盖。

## 九例追加复验的最终对账

已执行完9次业务复验、0次新探针、0次自动重试。趋势和具体能力缺口报告通过，另7例未通过。旧17次输入／回执逐例SHA256核验一致；两批合计26次实际调用，其中22次业务生成／分析与4次私有用途资格。按最新证据，13个独立业务样本为6例符合原意、7例未通过。详见[九例真实模型复验](2026-11-19-strategy-expression-model-recheck.md)。入口退出0表示授权批次执行完成，不能提升为全部业务样本通过。

剩余失败包括：可表达规则误报unsupported、未要求的日线委托、ddof与比较边界及条件遗漏、以前一根high替代20根前高、ADX输出字段非法、摆动sample错误造成矛盾条件、额外小时来源未声明。保留模型原文和技术拒绝，不补写AST或撮合政策，不再新增调用。趋势定义已经与独立日期预期、原样保存、冻结、完整重复回放和中文核对一致；其他有效方向及局部编辑沿用先前通过证据。

上节暂留的 `strategy-authoring-definition.ts:94` lint错误随后已仅删除冗余类型断言，保留原业务修改；单文件lint、Schemas类型与编写输出测试通过。原全仓失败命令及warning仍保留，不称重新跑过全套门禁。

最终只读Docker清单确认各小批隔离库／Redis均已退出，原目标应用和其他项目继续运行。两批调用仅隔离写入，真实Provider／路由／资格、业务库、历史候选及原冻结证据保持原样；没有目标代码同步、镜像更新、提交或推送。整体语义及目标运行态义务仍开放，未宣告全部任务完成。

## 七例根因修复检查点

按用户后续“查清剩余7例失败的根因并修复”完成生成输入、共享节点说明、精简默认执行分支及原生字段合同修正。详见[七例根因与修复](2026-11-19-strategy-expression-seven-failure-root-causes.md)。本次Schemas1701／Domain1019项通过，Server定向84、多周期9、正式隔离Worker4及双端编辑19／5项通过；三端类型与局部lint、边界、依赖、文件规模通过。旧26次回执保持原值，本次新增真实模型调用为0。L04.1／L04.2在限定本地范围完成，修复后7份实际请求已准备但真实模型尚未复验，状态由L04.3和G03继续持有。

## 2026-11-20七例真实复验的最终检查点

上节预览之后，用户明确授权7次业务复验、0新探针，各例一次不自动重试。实际7次已执行，3例通过、4例未通过；失败为两例漏报open、事件例漏报high且缺capture、多周期例锚点无时区且小时收盘多滞后一根。旧22份业务输入与回执摘要核验一致，旧4次资格回执及失败保持原样。全部当前wire匹配审阅的同一Schema基线，实际定义未补写。方向／背离另以原定义完成正反及延迟确认的离线数据核对，0新增模型调用；具体证据和退出1的失败结果见[独立复验记录](2026-11-20-strategy-expression-seven-recheck.md)。

三批总计33次调用，按最新有效回执13例中9例符合原意、4例未通过，L04.3／L04／G03保持开放。隔离数据库／Redis已清理，目标应用未同步，没有提交或推送。当前授权已用尽，不再新增真实调用。

## 2026-11-22 零模型调用结案验收

### L01.5／L04 原样本与回执

以 11-20 的 `semantic-review.json` 中 13 个原意为清单，逐个按当批审阅摘要核对原输入和回执的 SHA-256。采用原九项通过证据和[最终 V6 批次](2026-11-22-backtest-comparison-readback-recheck.md)中的四项。四例与旧样本的自然语言逐字对应，均走正式探索入口。V6 使用 `strategy-discovery-v6`、原生严格 Schema、`strategy-optimization-v28-comparison-readback` 和已记录的冻结数据范围。将四份请求消息按采集器的 JSON 字符串编码复算传输摘要，与实际 wire 回执一致。模型原始输出、记录中的原始说明、正式编译和独立语义审阅均关联到同一次生成。原 11-20 批次仍为 3／7，其完整失败记录保留。最终固定 V6 批次仍为独立的同版本 7／7。

| 原业务意图 | 本任务采用的证据 |
| --- | --- |
| `relative-breakout` 排除当根前高及 102% 边界 | 原 V5 正式定义、隔离保存／冻结与重放。复用 R11 突破／等值和持仓／空仓对照。 |
| `count-confirmation` 五中取三及连续确认 | 最终 V6。源字段依赖由原 AST 编译，收阳含 `open`，连续三根分别比较各自 EMA20。 |
| `statistics-gap` 带宽与绝对跳空 | 最终 V6。总体标准差、线性分位、带宽含等值及严格小于 2% 的比例跳空保持。 |
| `captured-retest` 冻结前高与复验 | 最终 V6。`lag(1, Highest(high,20))` 捕获、随后 10 根、排除当根确认和允许再次触发均通过。原冻结行情成交为 0，完整结果重放一致。 |
| `timeframes-anchor` 多周期累计 | 最终 V6。日线与最近完成可见的 60m 共用唯一下单标的，锚点保留 `+08:00`，只有前一日累计使用日线 lag。 |
| `directional` 方向分量 | 原 V5 正式定义和独立上升／下降样本，隔离冻结与重复重放。 |
| `confirmed-divergence` 摆动背离 | 原 V5 正式定义、摆动值与 RSI 取样、右侧两根完成前后对照及隔离重复重放。 |
| `trend` 趋势 | 原 V5 编写的 EMA20 上穿入场、下穿退出，当前回读方向一致。 |
| `reversion` 逆势 | 原 V5 编写的 EMA20 下穿入场、上穿退出，当前回读方向一致。 |
| `trend-synonym` 同义描述 | 原 V5 用相同操作数表达交叉，当前回读保持 EMA20 的真实方向。 |
| `only-entry-period` 仅修改入场周期 | 原 V5 局部修改。仅 `entry.right.params.period` 由 20 改为 30，恢复这一个数值后与原请求冻结基线深度相等。 |
| `unspecified-average` 均线未明确 | 原分析回执保持待确认问题，当前分析合同解析后答案仍为空。 |
| `unsupported-data-portfolio` 数据和组合超范围 | 原 V5 真实能力报告，当前 V6 正式装配仍返回能力缺口分支。项目能力以正式附录为准，原报告中的公式和调仓日澄清继续按业务问题理解。 |

共 13 个原意有对应通过证据，包含 11 份正式定义纵向验证、1 份能力缺口和 1 份待澄清分析。宿主用 AC03 正式快更后的构建，重新解析七份历史正式定义。四份 V6 原始输出分别经正式 `assembleDiscoveryGeneration` 装配，定义、编译输入摘要及独立原意检查均相符。使用各自原冻结快照运行当前 Runner，四份完整结果逐项相同，校验值依次为 `00f04857658e498b`、`c0d6140978706328`、`010924c7808b078b`、`19fdd5dbded691ec`。这次对账复用不同阶段的成功回执，原模型批次和调用统计保留。

### L03／G03 运行态与一致性

复用[最近一次正式快更和全产物摘要](2026-11-20-backtest-practical-implementation.md#2026-11-22-ac03-目标同步验收)。本次 Server／Worker 健康且均为该次启动，针对编译、跨周期价格、快照、Runner 和探索能力缺口共核对 6 个模块。两个目标分别在独立只读 Node 进程加载生产产物，原 `timeframes-anchor` 输出与冻结范围经正式探索入口再次编译，和宿主重放定义一致。其冻结 manifest 含物理日线和原始一分钟，逻辑小时由一分钟聚合。把小时来源改为另一资产的隔离副本由当前入口按独立参考资产限制拒绝。两目标的能力报告和分析分别保持缺项及待确认状态。目标进程只消费内存中的回执，完整快照重放在宿主执行。

- AC01～AC03 复用完整回读、来源与路径改名、草稿和原义保存的 [定向及浏览器证据](2026-11-16-strategy-definition-authoring.md#浏览器受控检查)，正反交叉复用[腾讯逐笔冻结对照](../archive/evidence/2026-11-12-strategy-cross-direction.md)。
- AC04～AC05 复用两端四宽实际组件及 [iPhone Air／Android 原生交互](2026-11-16-strategy-editor-native-model.md#iphone-air-原生交互)。新增表达的页面证据见[本轮浏览器与独立 Worker 验收](#浏览器原生与隔离-worker)。
- AC06～AC08 复用历史升级、股票／ETF 与非空 NAV 申赎、消费与新写入门禁[原证据](2026-11-16-strategy-definition-authoring.md#协议基金与新写入)。目标 NAV 历史样本仍为空，NAV 纵向验收使用隔离 Worker。目标快更记录覆盖当前容器可写层。
- AC09 采用上表，交易计划、ATR 及日线委托复用[已归档子任务](../archive/tasks/2026-11-15-backtest-trade-plans.md)。实际来源证据按原样本使用，包括[富途 `600000.SH` 指定窗口](2026-11-19-backtest-session-futu-minute-warmup-worker.md)和腾讯历史冻结，本次多周期 V6 受控快照沿用其原取价范围。

C10 的独立参考资产探索及 C12／C13 的外部时点数据、历史成分／行业／证券池、同时点报价、截面分配、组合与多腿、期货空头及借券仍按[能力附录](../specs/2026-11-13-strategy-rule-capabilities.md)披露。既定当前范围验收完成。原始回执和快照只读，模型调用、行情 Provider 请求、真实业务库连接与写入均为 0。新增文件仅为验收记录及私有校验回执，未再次部署或更新原生安装包。

私有回执保存在 `var/acceptance` 的 `strategy-definition-closeout-20261122-{receipts,current-replay,authoring-readback,target-readonly}.json`。首次本地校验按原字符串计算传输摘要，随后依据实际采集器改用 JSON 编码，重新校验通过。
