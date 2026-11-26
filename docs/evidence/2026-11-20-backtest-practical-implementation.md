# 策略回测整改实施证据

对应[详细设计](../specs/2026-11-20-backtest-practical-design.md)与[实施任务](../archive/tasks/2026-11-20-backtest-practical-design.md)。本记录只保存实际实现、验证与边界，Task持有当前状态。

## T01 表达式遍历与会话求值

### 实际写集与行为

- `packages/domain/src/backtest-expression-children.ts`：有类型且穷尽的直接子节点遍历；正式规则根统一列出入场、退出、保护启用条件及委托价格，保留路径。结构遍历不承担放宽合法性或改变窗口语义。
- `packages/domain/src/index.ts`：导出上述两个入口，保留原有工作区导出。
- `apps/server/src/backtest/backtest-session-series.ts`：使用统一根与子节点，嵌套算术／absolute不再遗漏会话指标。
- `packages/schemas/src/backtest-numeric-unit-validation.ts`：会话VWAP继承对应来源的市场与价格坐标，修正与同源close相减被误拒；elapsedMinutes保持时间单位。该关联问题先补入Spec第6.1节再实施，运行兼容分析原已使用相同含义。
- `packages/domain/test/backtest-expression-children.test.ts`、`apps/server/test/backtest/session-series.test.ts`：覆盖正式根、事件capture／摆动sample子树、合法会话算术的依赖→Schema→准备→求值，以及非法历史／跨坐标／时间混算。

两根收盘100、120、成交量各10的受控样本，会话VWAP为110。`close > sessionVWAP*1.02`与`abs(sessionVWAP-close)>9`均实际求值为true。初次定向测试发现后者被旧单位检查误拒，修复后保持原样断言通过；未放宽不同坐标或动态会话历史预计算。

### 验证

全部命令在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger` 执行，包命令前缀为 `rtk proxy env npm_config_registry=https://registry.npmmirror.com`。详细日志位于 `var/acceptance/backtest-practical-20261120/t01-solo-*.log`。

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/domain build` | 通过。 |
| `pnpm --filter @thesis-ledger/schemas build` | 单位修正后通过。 |
| Domain `vitest run test/backtest-expression-children.test.ts` | 2项通过。 |
| Server `vitest run test/backtest/session-series.test.ts` | 最终6项通过；首轮4通过、1失败为上述单位缺陷，原失败日志保留。 |
| Server `vitest run test/backtest/session-minute-counterexample.test.ts test/backtest/session-source-failure.test.ts` | 2文件7项通过，约52秒；复用真实冻结与Runner，覆盖31／32分钟、60／61分钟和缺量／零量／未知时间标签。 |
| Domain、Server `typecheck` | 通过。 |
| 遍历helper、其测试、会话构建与测试的定向eslint | 通过，无输出。 |

这是当前代理独立重做后的实现证据。未发起真实模型或Provider请求，未写真实业务数据，未更新Docker运行态或镜像，未提交或推送。隔离Worker及目标环境由T13验收；不能据本节宣告整个整改完成。

后续在T02重建Schemas后，完整Server类型检查发现新增会话测试未将已正式解析的策略收窄到现有BacktestStrategy类型，已在测试边界补上类型断言；`t02-server-types2.log`明确退出0。运行时断言及生产校验未变，先前类型失败保持日志，不扩大旧通过结论。

## T02 成交指标与分析评分版本

### 实际写集与行为

- Domain：新增 `backtest-research-analytics.ts`与其测试，由实际fills计算全部成交额及初始研究资金分母；新指标移除旧turnover金额别名，不修改旧analytics对象。`simulation-valuation.ts`导出复用现有汇率选择、反向换算和失效规则的金额换算入口；`index.ts`导出新分析。
- Schemas：新增 `backtest-research-analytics.ts`，`backtest-result.ts`、`backtest-nav-result-v3.ts`兼容读取缺版本的旧结果，新版本要求两个指标存在；`strategy-optimization.ts`开发／验证指标白名单增加新指标。
- Server回测：新增 `backtest-research-analytics-v3.ts`使用运行初始现金篮子与冻结汇率；`backtest-v3-runner.ts`按正式投影fills生成v2分析并提升股票Runner到v5；`backtest-nav-result-v3.ts`仅按已确认fills生成v2分析并提升NAV Runner到v2。待确认申请保持原状态且不计成交额。
- Server优化：`strategy-optimization-evaluation.ts`、`strategy-optimization-common.ts`、`strategy-optimization-model-feedback.ts`保存并投影新分析／评分版本；v2只读取turnoverRate，旧无版本结果仍按原金额语义。`strategy-optimization-run.service.ts`将新分析、评分和完整引擎身份纳入新比较指纹，旧比较值保持原值。
- 对应测试：Domain新增分析测试，Server修改NAV Runner、优化评价、版本分派及模型反馈测试。上述文件均在接手基线上局部修改，未将既有dailyOrders、研究或其他改动计入本项成果。

固定样本初始1000、买入1000、部分卖出500且未平仓时，成交额1500、周转率1.5；同比扩大10倍仍为1.5。首个权益点为1100的样本仍使用初始1000作分母。NAV按请求确认事实独立核对成交额，并以10000初始现金核对分母；待确认申请保留而不进入成交。

### 验证与边界

命令目录和npm镜像前缀同T01，日志为 `var/acceptance/backtest-practical-20261120/t02-*.log`。

| 检查 | 结果 |
| --- | --- |
| Domain／Schemas构建 | 最终通过。Domain首轮为新局部指标对象的status类型推导过宽，补充BacktestMetric注解后通过。 |
| Domain新分析与旧分析回归 | 5项＋12项通过；新测试最初仅两个权益点，不足以计算波动率，加入第三个恒定观测后准确验证ZERO_VOLATILITY。 |
| Server股票Runner、NAV Runner、优化评价 | 3文件34项通过；后加NAV独立请求／分母核对后16项再通过。包含离线Parquet、正式Schema、重复回放与旧快照摘要保留。 |
| Server版本比较、模型反馈 | 5项＋5项最终通过，包含新旧比较隔离、新版本原始金额不作为回退、封存测试不进入模型反馈。 |
| Server类型检查 | 最终退出0，同时修正T01测试的解析类型边界。 |
| 新增及受影响生产／测试文件定向eslint | 退出0，无warning。 |

模型反馈首轮3项失败来自既有断言要求“不得描述为严格无前视样本外”，实际既有提示用“不得声称严格无前视样本外”。仅将同义表达纳入断言，封存数据与未来元数据的排除断言均保留；没有改动提示或重新请求模型。

当前验证证明分析与比较版本的本地行为；零波动下的目标评价资格由T03继续实施，完整引擎领取／重试兼容由T10持有，客户端新指标由T12消费，隔离与目标验收由T13持有。未对旧结果、旧分数或原始快照做迁移写回。

## T03 局部诊断与按目标评价

### 实际写集与行为

- Domain新增 `backtest-rule-diagnostics.ts`：按入场、退出、风险和保护启用根记录观测、可计算、成立及适用次数；预热单独计数。原因保留计数，每组最多3个路径／时点样本，最多12个具体组与一个合并组。`backtest-expression-lookback.ts`复用既有按来源子树的窗口算法，不把其他来源的长窗强加给当前来源。
- `backtest-simulation-evaluator.ts`实现明确的三值短路，比较缺值保留实际子原因；`backtest-numeric-operations.ts`不再用通用提示遮住首个缺值输入。
- `backtest-simulation.ts`、`backtest-signal-selection.ts`、`backtest-expression-context.ts`传递观察回调，持续观察条件而按持仓判断适用性；已经短路或从未适用的分支不因迟到事实被升级成全局错误，尚不可见的值不覆盖边沿记忆。
- `backtest-trade-protection.ts`、`backtest-trade-plan-runtime.ts`只在尚需启用保护时记录该条件，已启用后不重复读取并追记缺失。Domain `index.ts`公开新入口。
- Schemas新增 `backtest-rule-diagnostics.ts`，`backtest-result.ts`以可选新字段保存有界结构，旧结果继续无默认值地读取。
- Server的 `backtest-v2-execution-exchange.ts`、`backtest-v2-execution-shared.ts`、`backtest-v3-runner.ts`收集并输出正式诊断；模拟账本拒绝实际变更时抛出执行错误，不再用指标可用性掩盖账本失败。
- 优化的 `strategy-optimization-evaluation.ts`按目标及硬约束所需指标判断新版本资格。全部适用时点不可计算时指出规则；从未适用的退出不阻断。`strategy-optimization-common.ts`保存诊断摘要，`strategy-optimization-model-feedback.ts`仅投影开发／验证的计数，移除时点样本并继续隔离封存测试。
- 测试写集：Domain `backtest-rule-diagnostics.test.ts`，Server优化评价／模型反馈及V3 Runner测试。

布尔规则和模型反馈的具体边界先补入Spec第5.2节再实施。旧无版本结果仍使用原评价路径；新版本不以全局completeness=complete作为必要条件，不把未达到最少交易数称为缺数据。

### 验证与剩余关联

日志为 `var/acceptance/backtest-practical-20261120/t03-*.log`，目录与命令前缀同上。

| 检查 | 结果 |
| --- | --- |
| Domain构建、Schemas构建 | 均退出0。 |
| Domain诊断7项、原模拟14项、交易计划8项、日线执行5项 | 最终4文件34项通过。 |
| Server评价11项、数值历史11项、窗口12项、股票Runner9项、模型反馈6项 | 49个独立用例通过；后续修改仅重验受影响文件，未重复构建镜像。 |
| Server类型、定向生产／测试lint | 退出0；lint无warning。 |

固定用例证明恒假入场正常无交易、未适用退出没有缺数据原因、100次缺值只保存3个样本、观测不足与已有观测后缺输入分组、保护已启用后不再记录启用条件、三值短路不受条件排列影响、决定性false不因另一分支迟到事实产生拒绝。正式离线股票结果含诊断且完整重复回放一致。新收益目标可在Sharpe零波动未定义时评价；硬回撤约束仍要求回撤，最少交易数另归策略不符合目标。

入场下单资格中的资金与冲突待执行订单，随T08的显式政策接入同一观察入口；本项先提供已有普通持仓／保护阶段的计数。T11需将新增稳定账本错误 `SIMULATION_LEDGER_ERROR` 纳入不自动重试分类。两端展示和隔离／目标运行态继续由T12／T13持有，尚未执行。本节没有真实模型／Provider调用或业务库写入。

## T04b 复杂实际份额计费的准备限制

新增 `packages/schemas/src/backtest-execution-combinations.ts`及其测试，由Schemas公开导出；Server的 `backtest-run-preparation.ts`和 `backtest-v3-run-lifecycle.ts`复用同一判断。仅在raw-events、dailyBarOrders、perBarCap同时启用，且运行区间内的执行分段采用actualShares券商计费时，返回具体分段路径与限制。wholeOrder／unlimited不被该限制拦截；不以未来是否异价作为判断条件，不修改用户配置，不在旧RunConfig解码器添加全局拒绝。

新建Run检查位于既有幂等查询之后、快照构建之前。独立Server测试证明受影响配置在路由／价格读取之前就被准备拒绝，直接创建同样拒绝且不调用Builder；已有同内容幂等Run仍先找回。普通整笔进入原准备流程，原普通研究准备与生命周期回归继续通过。外层幂等／准备戳竞态仍按T11要求统一收敛，不能以此局部断言替代T11。

实际检查：Schemas新helper4项通过；Server `execution-combination-guard.test.ts`、`backtest-run-preparation.test.ts`、`v3-run-lifecycle.test.ts`共3文件28项通过；Schemas构建、定向lint及最终Server类型检查退出0。初次类型检查发现受控控制面mock返回undefined与接口类型不符，改为同样不通过路由校验的空记录，业务分支与断言不变。日志为 `var/acceptance/backtest-practical-20261120/t04b-*.log`。真实业务数据、来源和运行态未变；T04依赖与dataScope主体仍未完成。

## T04c 依赖需求与能力范围基础合同

实际写集：Domain新增`backtest-research-inputs.ts`、`backtest-research-data-scope.ts`，为T01遍历补充子节点路径；Schemas新增严格`backtest-research-data-scope.ts`并导出。Spec先补充逻辑周期、逐字段窗口和联合窗口限制，Task拆出T04d持有实际准备／冻结接入。

依赖由正式规则根、隐式ATR保护、委托、估值和仓位提取；可选预留与显式引用合并后必需性升级。不同子树分别传播窗口，当前量过滤不承担另一支均线的预热。能力仅统计调用方已经构造的逻辑序列，保存有效值数量、预热数量及最长连续窗口；全空字段不开放，单值不能满足二十根窗口，资产及周期不一致拒绝。原始AST不变。

验证：`t04c-domain-tests2.log`的10项与`t04c-schema-tests.log`的3项通过；`t04c-lint.log`无错误，Domain／Schemas构建退出0。范围摘要只是必要条件，联合／嵌套输入仍须在T04d使用同一冻结逻辑输入复核，不能把本小项标作纵向就绪。

## T04d 准备与冻结的数据范围接入

实际写集：Domain新增`backtest-research-window-availability.ts`，用原始窗口交集复核各规则；Schemas的`backtest-price-research.ts`增加可选dataScope，旧配置没有默认补值。Server新增`backtest-research-data-scope-v3.ts`，修改价格依赖规划、配置准备及其服务、原价参考读取、创建生命周期、冻结完整性检查，新增`research-data-scope.test.ts`并扩展Domain依赖测试。

准备只使用已取得的执行、原价及额外周期行；聚合来源复用既有`rowsAtTimeframe`、日历请求／验证，日线无需为能力统计多取日历。范围随RunConfig进入现有校验和与准备身份。创建拒绝范围外依赖；冻结／重放进一步核对实际输入的字段与联合窗口。新准备不因未使用的原价声明而取原价；旧无dataScope的冻结校验保留原解释。候选的全面生成／正式校验接入仍由T05／T07持有。

实际验证：Domain9项（含各字段最长窗口分别足够却没有交集的反例）通过；Server新范围5项、双价格7项、原依赖计划12项、准备16项、生命周期10项，共50项通过。双价格测试包含独立主备选源、冻结身份和离线完整Runner重放；60条一分钟测试经真实日历聚合只得到一根小时能力，拒绝20根指标。Domain／Schemas构建、Server最终类型及定向lint退出0，日志`t04d-*.log`。

初次新增测试误用了已有“价格大于常数”样本，其投影本来明确要求原价；改用同坐标价格均线样本表达纯价格研究。试图直接修改旧日级响应的量值／行数会被旧协议摘要关联拒绝，保留该失败；字段／窗口反例改在接收已解析逻辑行的边界测试，真实缺量日线链路继续由T06持有。没有将其称作HTTP缺量验收。

## T05 受本次能力约束的后复权探索

实际写集：Schemas准备意图加入optional原价预留；Domain范围校验补充投入方式许可。Server的原价参考错误投影、准备范围、ConfiguredRun及Optimization准备、创建、候选、运行预算、存储版本、种子和模型上下文接入新版范围。提示版本为strategy-optimization-v17-price-scope；新写入空间为strategy-space-price-research-v2。新增`price-research-scope-v2.test.ts`，扩展HTTP准备测试，校准受影响旧测试的既有文案与策略版本断言。

省略原价预留按实际用途取数；freeze保持必需；optional仅对未被规则／份数引用的原价预留降级。只接受未配置、暂不可用、缺窗口等已有结构化原因；错误响应、窗口或来源不匹配仍阻断，不捕获任意程序错误作为能力限制。缺项写入dataScope，不伪造原价窗口，不重取成功后复权。模型获得字段、逻辑周期、窗口和投入限制；候选预检在Market读取之前检查范围，只保留当前用途已有物理引用，不取得范围外数据。

旧空间继续要求双价格，克隆／重试沿用原配置与空间；新创建要求范围和冻结执行窗口，不能把旧双窗口配置直接认作新范围。研究种子明确使用research坐标，修复旧种子仅含持仓状态时遗留run坐标，避免已有生成路径误判研究合同。正式新生成编译及其原始回执分离仍由T07完成。

必要验证：Domain10项通过；Server新范围10项、配置预检9项、HTTP准备1项（同例覆盖明确双窗口及可选原价缺失）、既有研究4项、发现11项、反馈6项，共41项通过。新范围测试实际物化本地快照，断开Reader后完成Runner且有fills，没有原价读取；旧空间缺原价仍拒绝。Schemas／Domain构建、最终Server类型和定向lint退出0，日志`t05-*.log`。

原失败保留：离线新样本第一次未更新改写种子后的fixture策略哈希，正确被拒绝，补齐样本哈希后通过。回归发现已有测试仍断言V2新种子和旧错误文案，与接手代码当前V3新定义及既有具体错误不符；仅调整断言，旧记录及旧模型回执均未修改。没有新增真实模型／行情调用，也未更新运行态；T06、T07、T12／T13继续开放。

## T06 两端日级观察与缺量研究

跨仓写集：Schemas的日级证据、Data V3请求／响应及能力声明、价格研究配置、Snapshot Manifest增加可选版本身份；Domain日级消费增加显式价格观察许可，既有分钟聚合增加显式保留未知量／额选项。Server的Market读取／选源、SDK解析、缓存与冻结身份、子窗重放，Backtest准备、原价／额外来源、快照完整性、日历、归一化执行、结果警示和对应测试接入版本。DSA修改日级证据生产、精确请求及能力、请求分发、底层校验选择和对应测试；更新其合同文档及CHANGELOG。没有修改infra。

版本1不增加默认字段，不改正量解释或旧摘要；版本2只把有效价格且volume=null的实际观察记为observed-price-only。真实零量、负量、错误OHLC仍拒绝；限定Yahoo零量排除保持原来源／窗口边界。版本2进入DSA新输入指纹、Server序列及窗口身份，缓存查找重建版本，裁剪保持版本，旧消费者及未明确价格研究的读取拒绝借用。原始身份／冻结事实的tradable仍只依据真实已交易观察；仅归一化研究的执行适配层消费价格观察，实际份额路径仍拒绝缺量。

Spec先补充上线能力选择及分钟聚合边界。服务准备先读能力：已声明2才发2；旧服务仍收到原缺省请求，新配置记版本1。能力读取失败阻断，不在读取失败后换版本。由此可先部署消费兼容，再升级生产，后续新准备启用2，旧实验与在途冻结不变。新版分钟聚合在任一分量未知时不补零，缺额不以价格乘量补造，价格及会话完整性独立保留；旧读取及已知值路径原解释不变。

定向验证：Schemas新版本及旧读／摘要43项、Domain日级／依赖16项及聚合7项通过。Server选源／SDK／窗口库55项，冻结及裁剪16项，双价格、准备、范围与离线Runner相关案例通过；三项日级研究测试覆盖缺量产生模拟fills、原始真实资格为false、量指标路径及20根限制、旧服务到新服务能力切换和读取前失败。完全断开Reader后重放结果一致。Domain／Schemas构建、最终Server类型及各次定向lint退出0，日志`t06*-*.log`。

DSA定向1025项及新增分发验证通过。执行目录`/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis`，正式命令`env PATH=<仓库>/.venv/bin:$PATH ./scripts/ci_gate.sh`，日志`t06-dsa-gate.log`：语法、critical flake8、能力边界、运行载荷、测试范围及两个确定性脚本均通过；8412个离线选择项中8367通过、42跳过，3个能力响应全量断言因新增dailyObservationVersions失败，脚本实际退出1。更新这3处断言后只复验所属两个文件，54项退出0（`t06-dsa-gate-failed-recheck.log`）；未重跑输入未变且已通过的其余案例，不能将旧脚本退出结果改写成0。另有4个network项未选择、323个subtest通过。初次新低层测试把Infinity写入整数列被pandas拒绝，改为浮点样本列后通过；首次Server测试使用了不存在的ArtifactStore.read，改走真实openRead迭代后通过；旧新准备精确断言与手工子窗请求已按实际新合同更新，原日志保留。

所有行情均为隔离固定样本，未调用真实Provider／模型，未写业务数据，未更新目标运行态。两仓物理独立进程及部署顺序验收继续由T13持有，双端展示由T12持有。

## T07a1 新生成结构与机械编译

实际写集：Domain新增策略结构编译helper；Schemas新增V6声明、事件作用域及生成结构，表达式生成支持显式作用域，交易计划工厂可选择作用域；Server新增正式编译边界与批量诊断。V3允许无需行情信号的空来源，未使用声明保留空派生字段，V2非空及主周期要求保持。V5生成继续使用原字段与主周期要求，三用途JSON Schema的完整SHA256与变更前一致。

Schemas4项、Server5项通过，Domain／Schemas构建及Server类型通过；日志`t07a1-schema-tests2.log`、`t07a1-compiler-tests3.log`、`t07-types4.log`。样本证明ATR隐式OHLC派生、合法作用域、capture／lag及阈值原样保留、未知来源和未绑定事件一次汇报、程序不补来源、结构错误不产出候选。首次测试样本遗漏交易计划必填version／evaluation，修正样本后通过，原失败保留。此叶只证明纯结构和编译；用途注册、操作冻结、接收／应用和探索范围仍由T07a2继续完成。

## T07 正式用途与旧失败只读重放

实际写集：Schemas的AI用途注册、V6动态编写合同、独立编译产物和操作快照／结果合同；Server编写提交、提示、接收、语义校验、修改审核、应用／保存及三个格式探针；探索用途选择、提示、装配、SDK接收与AiRun元数据。新用途使用三个v6版本及strategy-ast-compiler-v1；新空间使用V6，旧空间继续V5。没有新表，不把原始回执变为编译后的对象。编写V6可使用同标的独立逻辑周期，保存复用完整规则根检查；旧编写限制不修改。旧策略局部修改先物化原入场政策，运行语义与全面入口仍随T08收敛。

Spec补充已完成但结构校验失败时的原文留存：V6在SDK完成事实中携带原输出上限内的文本。成功、非法来源、结构错误分别以本地HTTP实际通过SDK校验／结算路径验证，每例一次且无自动重试。旧用途不新增原文属性；探索写入受AiRun当前attempt及running归属保护。日志`t07-sdk-raw-structure2.log`共15项通过；V6编写固定SDK、旧合同选择、独立原文与编译、只加保护不改政策等5项通过（`t07-v6-authoring1.log`）。首轮旧回归66项中65通过、1个旧探针版本断言失败，更新为V6后所属2项通过。Schemas首轮48项中46通过、2个当前用途版本断言失败，更新后所属10项通过，原日志保留。新旧合同区别均有反例，不仅修改期望版本字符串。

四份旧真实失败输入／回执SHA256核对后只读重放，展开原V5固定事实及来源继承、物化旧政策并去除旧重复字段集合，不能称作V6实际模型输出。count-confirmation与statistics-gap由AST派生缺失open后可编译；captured-retest派生high但仍明确报告两个未绑定eventValue，不补capture；timeframes-anchor保留两个缺时区锚点，结构阶段指向具体anchorAt，未删lag(1)。编译及重放6项通过，日志`t07-legacy-replay1.log`；逐例回执`t07-legacy-failure-replay.json`明确保留旧失败统计。当前Server类型与定向lint退出0（`t07-types10.log`、`t07-lint2.log`）。未使用真实Provider、未更新目标运行态；物理隔离应用／Worker、双端消费及真实V6模型资格由T12／T13继续持有。

## T08a 显式政策与独立下单资格

实际写集：Domain策略政策物化、信号选择、模拟观测记忆、普通及日线执行／交易计划入口、中文回读；Schemas显式升级；Server全新策略默认、正式新版本发布、探索种子／候选及编写审核保存、NAV离线策略入口。新策略显式政策，普通与交易计划同样消费政策；旧无字段仍走原普通／有效计划分支。资金或待执行入场资格不阻止条件及边沿观测。拒单释放待执行记忆；日线按真实订单终态判断资格，不靠平仓期间一次性消费标志替代政策。

Spec先明确发布必须携带已核对的入场政策，禁止从修改后的保护反推；再明确NAV待申赎时仅推进入场记忆，退出保持原串行协调。新增成对样本真实运行事件队列和账本，证明仅加宽止损时成交时点、方向、金额／数量保持，且持仓期再次变真、退出后持续真时新边沿不会重入，旧有效计划仍按原空仓行为重入。缺值不当作false、资金恢复不虚构边沿、拒单与日单到期、普通／保护两路径及未来退出输入不丢已观测入场均有反例。

Domain新增政策17项通过（`t08-policy-tests7.log`），旧模拟／计划／空壳／日线29项通过，回读4项通过。Server新建与发布3项、发现11项及V6编写5项通过；NAV16项通过，包含显式升级与旧非空请求、确认、现金和事件完全相同及重复离线重放。Schema升级、V6及旧合同11项通过；升级再增1项原计划政策保留的定向断言，随最终相关检查汇合。Domain／Schemas构建、Server类型及定向lint目前退出0（`t08-types2.log`、`t08-lint1.log`）。

原失败保留：最初新成交样本误用未携归一化假设的执行模型，再因固定数量不允许当归一化单位被拒绝，最终改用已有实际份额T+0冻结模型单独验证政策；没有放宽执行约束。初次NAV把退出边沿也在待结算时推进而少了一笔赎回，已按补充Spec修复且16项通过。中文回读新增政策行后旧测试按数组下标取退出，改为按业务标签定位。T08b编辑入口由T12汇合，未声称目标运行态或两端页面已验收。

补充冻结贯通：检查Server适配发现只转发旧策略字段，补上entryTrigger后用正式Snapshot／Runner验证同一恒真限价条件：委托到期后rising-edge只一单，while-flat两单；两种完整离线结果重复一致，新增两项通过。含新建／发布共5项通过，日志`t09a-poll-t08-runner1.log`。未把Domain通过替代这一Server字段贯通证据。

## T09a 持久取消与领取竞争

实际写集：Server取消repository不再以旧status／attempt限制意图登记，先按非终态原子保存首个时点，再有条件收敛queued；执行attempt增加启动及约1秒持久取消／归属检查。已有成功、失败和取消提交继续保留attempt与cancelRequestedAt CAS。队列查询未知保持原义，不改变为任务不存在。

CAS11项、队列生命周期4项、执行15项与恢复12项通过；新增重复取消保留首时点、queued读后已running仍登记、完成后取消不覆盖，以及入口不共享controller的持久轮询测试。后者实际约1002ms停止并清空活动controller，分别检查已登记但仍running、计算退出、cancelled终态及无结果写回；它是本地attempt验证，不等于真实独立Worker槽位验收。日志`t09a-cancel3.log`、`t09a-attempt-poll1.log`、`t09a-poll-t08-runner1.log`。

初次调整测试夹具时错改了队列派发mock、漏改running取消mock，后续新增异步remove mock又漏返回Promise，原失败日志保留；仅修正夹具，最终相关案例通过。T09b正在把同一计算状态的分批迭代贯通所有长计算阶段，CPU目标仍开放，不以“已取消”终态代替计算停止或槽位释放。

## T09b1 同一状态的分批计算

实际写集：Domain新增仅供回测计算的批次推进器，既有事件引擎、普通／日线执行共享同一生成器状态；全部指标、方向指标、算术／历史／窗口／事件／摆动预计算、成交投影、权益／回撤／指标分析及成交额增加逐点推进，同步入口继续消费相同迭代器。Server的股票逻辑指标、会话、模拟／分析，NAV可见输入、事件／策略、估值及结果投影接入同一调度。运行默认每256步或20ms让出事件循环，保留原事件比较、Decimal顺序、可见时点、原始结果和checksum。指标序列装配改为私有缓冲追加，避免每个时点重复复制全部历史；产物只在结束后返回。

Domain原指标／可见性／ADX22项及分析／成交／基准36项通过。新增完整事件、信号、拒单、成交、账本对比，九种指标全部点与预热／长十进制一致，分析曲线／全部指标／checksum一致，以及模拟、指标、分析CPU取消，共16项通过（`t09b-cooperative-stages2.log`）。Server会话7项包含完整Map结果一致、90天工作日分钟输入的CPU取消（`t09b-session-cancel2.log`）。本地批次测试均实际通过计时器登记取消并退出迭代，未用最终状态代替计算退出。

股票冻结Runner、日线、会话与仅后复权范围27项通过（`t09b-runner1.log`；会话四例约76秒，后续未机械重跑）。NAV、数值窗口／事件、冻结重放及多周期首轮48项中46项通过，两个旧准备夹具缺新日历端口，补齐正式依赖采集后又暴露其仅生产观察版本1；明确其能力为1后只复验两例，全部通过（`t09b-multi-recheck3.log`）。原整批退出1不改为0；不放宽生产覆盖／请求关联门禁。NAV Runner独立回归在`t09b-multi-nav2.log`通过；该次整批仍因上述两例退出1。全部原失败保留。

Domain／Schemas构建、Server类型和定向lint退出0（`t09b-domain-build6.log`、`t09b-schema-build7.log`、`t09b-types7.log`、`t09b-lint2.log`）；类型曾因测试把泛型job断言为never失败，已修正测试类型。上述都是本地源码／固定数据证据；独立Worker槽位、持久取消竞争与目标运行态五秒验收仍由T09b2／T13持有，没有更新目标容器或真实模型调用。

## T10 完整执行身份与关联重放

实际写集：Server完整Runner比较、执行历史识别、领取门禁、显式重试和关联Run编排；股票冻结克隆、NAV准备原Run关联、NAV结果读取版本及独立HTTP重试回执。新Runner只能在全新未执行输入绑定；股票／NAV／自定义字符串均完整比较，执行后缺身份稳定失败，未装配执行器不绑定占位身份或消耗attempt。旧终态和结果保持，版本不同的显式重试使用原Run与目标Runner生成幂等键，返回关联新id。

新Run以backtest-job-input-v1保存物理来源摘要和逻辑父Run，克隆可信完整Parquet及原配置；股票数据指纹不变，NAV继续使用原消费凭证与原创建时点核验。修复NAV历史读取硬编码当前版本的问题：读取核对数据库保存身份，Worker仍核对当前Runner。过期原凭证、当前路由变化和重复重试不新增来源请求。NAV独立HTTP入口已验证返回新id（`t10b-nav-http-final.log`，1项）；股票关联、离线执行及旧结果保持包含在`t10b-stock1.log`的16项中。完整身份、缺身份和旧终态保护首轮32项通过（`t10a-identity1.log`）；未装配执行器反例随后通过。

## T11 持久创建与attempt隔离物化

实际写集：股票／NAV创建生命周期、版本化物化输入、Worker准备／冻结及原子发布、存储位置解析、股票／NAVRunner上下文、走势图冻结读取、重试资格、稳定错误分类和队列协调。正式提交保存queued，快照不在HTTP中编码；NAV在同一事务保存意图并消费凭证。旧完整输入继续原目录。新产物按runId／attempt隔离，完整manifest与snapshotStorageAttempt通过状态、attempt和取消CAS一起发布，不搬运文件或拼接产物；新旧attempt互不删除，完整产物关联前中断后整套复用。仅未发布的首次构建复核准备戳，已有完整冻结输入不会因当前路由改变而重取。

补齐独立Worker装配：MarketBacktestInputModule复用原有读取组件，由Server与Worker共同消费；不引入目录同步、基金定时计算或完整HTTP应用模块。Worker实际注册构建器、准备守卫、现金原包核验和仓库，新增边界门禁。Nest容器解析1项通过（`t11-worker-wiring2.log`）；首轮Vitest缺生产tsc发射的构造器元数据，在测试夹具恢复元数据后解析通过，不修改生产依赖来迎合测试。走势图所属11项通过，另新增attempt存储位置反例；边界检查退出0（`t11-boundaries1.log`）。

本地真实Parquet物化／重放、关联前中断、取消后及旧attempt晚到、准备戳过期、稳定账本失败只计算一次，共10项通过（`t11-stable-recheck1.log`）。创建／重试、NAV消费／HTTP、协调器47项通过（`t11-integration-recheck1.log`）。执行／读取／NAV等最后核心批次66项中65通过，唯一新增账本案例的mock缺少队列领取的in／lt条件，补齐后所属10项通过；该原退出1保留（`t11-final-core1.log`）。NAV新增完整文件关联前中断恢复在该批次通过。Server类型和新发布／重放定向lint退出0（`t11-types8.log`、`t11-lint4.log`）；后续模块装配与走势图类型调整继续按受影响面核对。

原失败分别保留：旧HTTP创建即冻结的断言已移至Worker；旧NAV缺Runner的fixture现明确完整身份；新物化fixture原非UUID改为正式UUID；NAV关联新Run测试补齐数据库默认null，避免把undefined误当已发布快照。没有放宽物理完整性、准备戳、来源、日期或策略摘要检查。真实PostgreSQL／Redis／独立进程故障、目标容器和双端页面仍由T13持有。本阶段新增真实模型调用为0，未提交、推送或写真实业务数据。


## T12 两端消费实现与当前验证

实际写集：Domain回测范围、阶段、指标及规则观测共享展示；Schemas旧策略编辑政策投影、任务阶段／取消／关联Run读取；API Client重试接受明确关联的新id。Desktop准备范围、普通／NAV结果和任务、实验指标、旧定义编辑、V6完整AST提案、Query／事件和取消／重试；Mobile准备证据、旧定义与本机草稿、结果／任务、取消／重试找回及关联新id导航。日期展示使用显式业务时区；本机待确认的原保存内容不改写。

金额与双边周转率独立展示，旧turnover明确为旧口径成交额，不作为百分比回退。只有后复权且缺量仍显示实际可用范围和投入方式；缺必需volume保留具体规则与窗口失败。新建默认政策、旧定义原政策先投影再编辑，V6多周期合法AST可回读；旧模型合同不改写。

Domain展示4项、Schemas编辑政策与升级12项、API共享读取18项及NAV关联重试后续11项、Desktop相关17项与V6提案21项、Mobile本机草稿与操作状态14项通过。Domain／Schemas／API构建、Desktop类型（t12-desktop-types5.log）、Mobile与Server类型通过。首轮lint遗漏类型导入及历史unknown配置直接取币种已修正，相关两文件lint退出0（t12-lint2.log）。浏览器四宽度和最终写集lint继续执行，不把这些局部检查当页面验收。

## T13 隔离独立进程与CPU取消

执行目录为主仓。首轮使用正式已有入口node scripts/test-backtest-recovery.mjs -t R0，构建后后续复用同一产物，以BACKTEST_RECOVERY_ISOLATED=1、BACKTEST_RECOVERY_BUILD_ROOT指向apps/server/dist/backtest-recovery执行Server的backtest-process-recovery.integration.test.ts。入口创建专属随机PostgreSQL／Redis与artifact目录，安装当前全部53份migration、107张预期表，清理只处理本次资源。没有读写目标业务库。

R0生产独立processor实际解析Market输入模块、准备守卫和构建器；HTTP创建先保存queued／attempt0／空快照，未读取价格，Worker读取已准备冻结窗口，物化attempt1快照并完成。结果与离线完整重放checksum一致。日志t13-recovery-r0-3.log，1项通过。旧完整快照的R1进程SIGKILL与默认stalled恢复、R2 Redis短停查询未知保护、R3运输记录重建及owner单调递增共3项通过，日志t13-recovery-r123-2.log；旧owner四种提交均拒绝，完整结果唯一且离线checksum相同。

CPU用例使用独立BullMQ Worker和生产runBacktestAttempt，注入五万点真实Domain RSI及主模拟计算，不使用空转忙循环；独立父进程登记取消，Worker约1秒持久轮询实际中止计算。两例分别在994／995ms内确认计算退出、cancelled终态及下一探针任务完成；重复取消时点保留，晚到结果CAS为0，日志t13-cpu1.log共2项通过。此注入执行端验证取消与槽位，完整生产processor正常路径由R0独立证明。

原失败保留：最初R0夹具未携准备冻结窗口，Worker重新抓取后被旧dataAsOf拒绝；继而夹具准备未携日级观察模式，冻结Reader正确拒绝。补齐与生产准备相同的窗口及模式，并在启动Worker前以真实DB和FrozenReader复核后通过。旧完整夹具增加冻结引用后，其手动构造Reader未装配FrozenReader，补齐测试装配后R1～R3通过。没有放宽来源、截止时钟或冻结关联。首轮还发现FUTURE_DATA历史输入错误被自动重算，已按既有稳定输入合同修复分类，新增反例包含在t13-stable-input1.log的11项中。目标容器未更新，实际模型调用仍为0。


## T12 四宽度浏览器与晚到响应终验

使用实际Desktop组件及Mobile RN Web页面，受控请求只指向本地隔离API，禁止未登记与外部来源；没有业务库写入。主仓执行BROWSER_REGRESSION_CHANNEL=msedge node scripts/local-runtime/backtest-practical-browser.mjs，报告browser6/evidence.json及t12-browser6.log退出0。两端各1440／1024／768／390共8组通过：准备、明确volume二十根缺项与保留输入、恢复、仅后复权且缺量prepared、实际提交、取消中禁用重复操作、失败原因、关联新id导航、结果与全部结果页签。成交额15000 CNY与周转率150.00%独立展示，零收益／零交易及单项未定义Sharpe均可阅读。

BACKTEST_BROWSER_SECTION=policy专项使用同一入口，旧普通与旧有效计划共16组成对编辑／保存通过（t12-policy-browser1.log、browser-policy1/evidence.json）。编辑前从原版本投影政策，仅增加止损后实际保存仍分别为rising-edge与while-flat，两端中文预览一致。

BACKTEST_BROWSER_SECTION=late专项以真实Query启动慢读取，再提交取消并释放旧回执，随后确认终态并注入旧running响应。首轮Desktop四宽度通过，Mobile因原state.reading禁用取消失败（t12-late-browser1.log）。先补Spec第九节，修正Mobile同范围轮询不禁用取消、读取期间继续禁止重试，并统一状态名称；控制函数及既有状态11项通过（t12-cancel-controls1.log），专项两端8组通过（t12-late-browser2.log、browser-late2/evidence.json）。未用纯函数测试替代该实际请求竞态。

视觉检查实际查看390宽Desktop结果、Mobile准备／取消与政策，以及1440宽Desktop准备截图：未见页面横向溢出，长指纹换行，按钮、金额／比例与政策可辨识。截图在var/acceptance中保留，不加入文档资源。原生WebView图表和Android／iOS安装包未在本轮运行；未改原生依赖、插件或工程配置，RN Web不冒充设备验收。

首轮浏览器夹具将DATA_SCOPE_FIELD直接当作公共错误码而不符合Schema，改为正式DATA_UNAVAILABLE并保留字段／窗口正文；未修改生产门禁。后续夹具补齐已有后台提交入口，使用已通过共享Schema的样本。曾未按既有浏览器总入口设置VITEST，导致开发Inspector派生子进程并卡在关闭回执；明确关闭开发Inspector后脚本完整退出0，未放宽清理条件。原日志与中间截图均保留。

## T13 真实DB创建与发布中断补充

在同一既有隔离入口上复用生产编译产物，R4（t13-recovery-r4-1.log）1项通过：真实PostgreSQL同键并发只创建一条Run；路由修订变化后同内容找到原Run，而不同键继续被准备守卫拒绝。专属Redis停止后正式创建仍保存queued；恢复后协调器补投成功。测试最终取消其隔离任务。

R6（t13-recovery-r6-1.log）1项通过：专属测试DB触发器仅使本Run第一次快照关联失败，完整文件已经finalized。退出首次Worker进程，改变隔离路由后启动新Worker；attempt2整套复用attempt1文件，在新路由不符时仍不读取Provider，结果成功，snapshotStorageAttempt=1、manifest完整内容与摘要不变。触发器、sequence、Worker及容器均由原隔离资源清理入口处理，不接触目标DB。

独立Python真实V3路由与Server DsaClient共5项通过（t13-dsa-process2.log）。Python进程仅注入冻结Provider返回样本，启用非本地网络禁止边界；真实HTTP请求、公共生产路由、生产响应构造和Node解码保持。版本2未知量保持null及observed-price-only；实际份额转换拒绝；缺省1继续拒绝缺量；零量、负量、坏OHLC分别拒绝；显式1与缺省原响应一致，2指纹独立。初次遗漏DsaClient配置校验所需的未连接DB／Redis占位URL，补齐127.0.0.1:1后通过，未连接实际业务服务。

## T13 必要检查与正式目标运行态

最终受影响包：Domain／Schemas／API构建已通过；Server正式nest build随部署通过；Desktop tsc＋vite build退出0（t13-desktop-build1.log，仅保留既有大chunk提示）；Mobile最终类型退出0（t13-mobile-types2.log），Desktop／Server类型在t13-desktop-types1.log、t13-server-types1.log退出0。V5三用途完整JSON Schema黄金哈希与政策合同12项通过（t13-legacy-goldens1.log）；变更的生成测试Schemas5项及Server5项分别通过。边界与带原HEAD基准的文件尺寸门禁退出0（t13-boundaries1.log、t13-file-size1.log）。git diff --check最终退出0。

本次基线后变化候选TS按应用／包分别检查286份。一次在同一进程载入全部类型项目触发Node内存耗尽，未当作代码错误，也未关闭规则；随后分组执行保留全部规则，Desktop29、Mobile15、Server150、API4、Domain46、Schemas42。发现3份测试的未使用解构变量后改为明确筛除字段，所属复验退出0（t13-owned-lint2.log、t13-lint-recheck1.log）；最后慢轮询修复及浏览器入口lint退出0（t13-lint-final2.log）。原OOM、Flow解析依赖噪声与错误日志均保留，不重写原退出结果。

正式执行目录：/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra；入口：./scripts/sync-code.sh all；未设置放宽门禁或破坏性参数，Node依赖下载沿正式入口镜像源设置。退出0，日志t13-sync-all1.log。兼容预检和宿主构建先完成，再替换既有运行容器；DSA、Server、Worker健康，镜像ID保持，未执行数据库结构或卷变更。属于容器可写层快更，不是镜像发布；Desktop产物本地构建通过，Mobile／Electron安装包没有更新。

独立目标核验：主仓node scripts/local-runtime/run-backtest-practical-readonly.mjs <隔离报告路径> thesis-ledger-dev-thesis-ledger-1 thesis-ledger-dev-backtest-worker-1，t13-target-readonly3.log退出0。每个容器核对1432份Server／Domain／Schemas／Shared编译JS的SHA256，验证V6三用途、AST机械编译、未知来源与无capture两个独立语义诊断、成交额／周转率、旧政策保留。读取原00700.HK股票快照（研究2025-11-12至2026-11-12，预热2025-09-19，原冻结Futu后复权），每个容器用当前Runner只在内存完整复算两次并核对相等；全程禁止Provider fetch，原Run及结果JSON保持。原engine v4不原地改写；复算属于当前v5独立核验。目标库无NAV历史快照，NAV完整物化／HTTP／重放仍引用隔离验证，不宣称存在目标NAV业务验收。

DSA目标核验使用run-backtest-practical-dsa-readonly.mjs，通过python -B只读核对本轮变更的运行源码摘要及实际HTTP capabilities，报告t13-dsa-target1.json。版本声明为[1,2]，没有行情Provider调用。首轮目标核对误用workspace源码目录定位镜像包，改为按实际包入口解析dist位置后通过，未更改部署布局或跳过缺文件检查。

业务保留核对复用scripts/p0-target/protected-baseline.mjs，只读前后102表的行级哈希及1623个冻结文件摘要。100表完全一致，全部策略、版本、回测、AI回执与配置表保持；冻结文件全部一致，目标更新前后活动AI／回测均0。ArenaLiveValuation由51012增至51035，旧行哈希全部保留，为既有后台估值新增；AutomationJob共7条，有1条盘中估值计划行哈希变化。当前已有AutomationService启动逻辑会将该系统计划cron从工作日改为每日并重算nextRunAt，此源码属于原有工作区修改，不计本次业务成果。未恢复该行或删估值；原始前后摘要、差异及只读排查全部保留，不能称为全库逐行完全未变。比较报告t13-target-business-comparison.json。

截至本节非模型实施阶段，真实模型调用0。随后获独立授权的10次V6验收及其失败／修复见[后续证据](2026-11-21-backtest-practical-v6-model-acceptance.md)，不改写这里的阶段事实。旧33次授权不沿用，旧模型成功／失败统计与回执保持；V6真实用途资格和业务语义尚无新模型证据，继续作为明确的外部预算事项，不用SDK fixture、编译、目标源码一致或冻结复算替代。


## 验收案例与证据对应

下表只归纳已取得的层级，不把离线或隔离证据升级为真实模型语义通过。各日志均位于本文件记录的var/acceptance目录，首轮失败继续保留。

| 案例 | 已取得证据 |
| --- | --- |
| AC01～AC05 | T04／T05依赖与范围、准备HTTP、独立双来源及冻结重放；固定份数缺参考时不执行，原价可选失败不重取后复权。AC03 补验确认必需原价整窗缺失返回规则、字段、路由与请求窗口。 |
| AC06～AC08 | T06 DSA与Server定向／冻结、daily-price-only-research及独立Python真实路由5项；未知量、零量、负量和坏OHLC分支独立。补验覆盖隔离生产者的分阶段切换和回退。 |
| AC09 | V6机械编译与dataScope路径拒绝、候选与正式创建固定范围，不补取来源；目标编译器拒绝未声明来源。 |
| AC10～AC12 | T01穷尽子节点、会话算术与绝对值，T07独立语义诊断及当前完成值／lag保留；目标同时报告UNDECLARED_SOURCE和EVENT_VALUE_UNBOUND。 |
| AC13～AC16 | T02全部fills／初始资金、缩放不变、T03按目标资格与恒假正常零交易；两端实际页面独立显示未定义Sharpe。 |
| AC17～AC18 | T08普通／保护成对事件与成交、NAV待确认与原行为；双端16组成对旧政策编辑保存。 |
| AC19～AC20 | T09持久CAS、独立轮询、真实Domain指标与主模拟CPU分别994／995ms释放槽位并完成下一探针；晚到提交拒绝。 |
| AC21～AC22 | 真实DB R4并发／旧回执／路由改变／派发故障；R5 部分写入后退出并完整重建；R6完整文件关联失败后进程退出与离线复用；R1～R3既有冻结进程恢复及旧owner拒绝。 |
| AC23 | T10股票完整Parquet关联与NAV独立HTTP新id，过期原凭证不重准备；两端实际重试打开关联新Run。目标未创建NAV业务样本。 |
| AC24～AC25 | V5三用途黄金哈希、旧版本1响应及冻结摘要保持；同步／分批全部事件与结果相同；目标Server／Worker分别只读完整复算两次，原结果与1623冻结文件保持。 |
| AC26 | 两端四宽度业务8组、政策16组、晚到竞态8组；实际截图查看与无横向溢出检查，未计作原生设备验收。 |
| AC27 | T04b受影响计费组合准备限制及wholeOrder对照，配置原值保持。 |

本节收尾当时尚未取得V6真实模型用途资格及自然语言业务语义；预检、SDK固定样本和旧V5回执重放都不能替代。待授权具体10次上限、7个业务样本及停止条件已写入Task的T13g。当时未执行任何新模型调用；后续已授权批次结算、提示修复和新增预算边界以[2026-11-21证据](2026-11-21-backtest-practical-v6-model-acceptance.md)及当前Task为准。


## T13 NAV独立生产Worker补充

R7在真实隔离PostgreSQL中保存并消费原NAV准备凭证，先得到queued／attempt0／空快照；随后独立生产processor读取原消费时点核验凭证，在当前实际时钟下物化attempt1并完成。当前NAV完整身份为thesis-ledger-v3-nav-local-runner-v2，分析为research-analytics-v2；完整Parquet离线回放两次与数据库结果完全相等，额外DSA来源请求0。t13-recovery-r7-3.log共1项通过，Server最终类型及该集成文件lint退出0（t13-server-types-final2.log、t13-r7-lint1.log）。

首次使用原股票专用队列夹具，缺NAV执行端而被正式门禁拒绝；给夹具装配NAV执行端后又发现正式nest build已清理旧隔离构建目录。未重复构建或降低门禁，改为复用刚部署的apps/server/dist生产产物后通过。原两次失败日志保留。这补齐独立生产Worker的NAV执行层，仍不宣称目标业务库存在NAV历史样本。

## 2026-11-22 补充收尾

### AC03 必需原价整窗缺失

样本入场条件为实际收盘价小于 4，使用固定金额投入。后复权可取得、原价整窗不可取得时，准备状态为 `blocked`。诊断给出 `entry.left`、`close`、独立不复权路由及其已配置来源和实际请求起止日期，含预热。请求依次只读后复权和原价各一次，策略原样保留。使用同一依赖提取器区分可选原价与用户明确要求。双价格和受限探索定向测试共 18 项通过，命令为 `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/price-research-pair.test.ts test/strategy-optimization/price-research-scope-v2.test.ts`。

### AC22 部分写入后的独立进程恢复

在主仓运行 `node scripts/test-backtest-recovery.mjs -t 'R5：'`，使用既有隔离入口、53 份迁移、107 张表和专属 Redis。第一份 Parquet 实际落盘 4,750 字节，记录处于 `building`，行情产物尚未写入。独立 Worker 经 `SIGKILL` 退出后，数据库仍为 `running` 且 `snapshotId`、结果为空。BullMQ 检出停滞后由生产协调器恢复，第二次尝试独立写成 8 份产物并发布，`snapshotStorageAttempt=2`。原部分产物保持在首次尝试目录，离线重放校验值 `92851cfb7076b0d8` 与唯一持久结果一致，额外行情请求为 0。复用 R6 的完整文件复用和 R1 的晚到写入拒绝证据。

首轮隔离夹具没有执行协调器。默认停滞任务补投时持久 owner 仍在运行，首次补投退出后继续等待协调。第二轮补上生产协调器的一次检查并通过。首轮 `closeout-ac22-r5.log` 与通过的 `closeout-ac22-r5-confirmed.log` 均保留。两轮的独立 Worker、专属 PostgreSQL、Redis 和临时产物均已清理。

### T06／T13f 日级观察分阶段切换和回退

在主仓使用 `node scripts/test-backtest-price-only-process.mjs` 运行历史五项合同对照；补验使用 `-t '分阶段上线'`。同一 Server 消费端及同一隔离回环端口先接 DSA 旧提交 `2dec2a938ec9000c5828856934eb27eef52ae347` 的实际生产路由。旧能力未声明版本 2，消费端省略请求字段并冻结版本 1。切换到当前 DSA 后实际声明 `[1,2]`，消费端显式请求 2，固定样本的未知成交量保持 `null` 并写作 `observed-price-only`。在途准备、冻结和计算结束后回退到同一旧提交，恢复接收时新准备只使用版本 1，行情冻结身份与升级前一致。关闭生产者后两版均可离线重放，清单字节、完整结果与各自首轮一致。

该场景用实际旧／新 Python 进程、真实 HTTP 及 Server 的准备、行情读取、快照和 Runner。路由使用固定测试配置，行情复用受控样本，行情证据存测试内存，产物写临时目录。首轮因测试填写的冻结时点早于本次 HTTP 获取而被门禁拦截。改用已有的获取完成后冻结时点后通过，日志分别为 `closeout-observation-rollout.log` 与 `closeout-observation-rollout-confirmed.log`。此次证据覆盖隔离生产者切换，消费者保持兼容版本。

### 检查与适用范围

Server 编译、类型检查、变更 TypeScript 定向 ESLint、两个测试入口的 Node 语法检查及 DSA 夹具的 `py_compile`、`flake8` 均通过。两仓复用已有验证，infra 无本期写集。只读核对 `backtest-price-research-input.js` 摘要，隔离新构建为 `139b39a575c7`，目标 Server 和 Worker 均为此前的 `543aa3923258`。本次未执行 `sync-code.sh` 或 `update.sh`。隔离验收使用已提交旧版源码及本机 Python 运行时，未切换目标 Docker 镜像。真实模型和行情 Provider 调用均为 0，真实业务库写入为 0。

## 2026-11-22 AC03 目标同步前核对

复用原定向用例的 `159516.SZ` 后复权样本和实际收盘价低于 4 的条件。通过标准输入在目标 Server 与 Worker 的独立 Node 进程，以及宿主此前的隔离构建，执行实际 `prepareBacktestRunConfigV3`，注入同一固定路由、后复权样本和原价 `missing_window`，禁止网络连接。两目标产物彼此一致，`backtest-price-research-input.js`、`backtest-run-preparation.js` 的字节摘要与本地修复构建不同。两者均返回缺少规则和字段的旧诊断，结构化范围为 2026-05-18 至 2026-05-20。本地修复返回 `entry.left`、`close`、不复权路由、来源及含预热的 2026-05-02 至 2026-05-20。三处均依次读取后复权、原价各一次，策略原样保留。结构化回执见 `closeout-ac03-target-readonly-preflight.json`。

前置核对阶段暂未执行 `./scripts/sync-code.sh thesis-ledger`。已通过目标产物只读确认，正式入口会重启两容器，Server 使用 `NODE_ENV=production` 且启动时对真实库的 `AutomationJob` 执行 upsert。前置核对的模型调用、真实行情调用、真实业务库连接与写入均为 0。后续授权及实际结果见下节。

## 2026-11-22 AC03 目标同步验收

用户允许本次正式重启产生的正常系统维护写入，验收全程只读、模型调用为 0。在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，使用 Node.js 24.22.2，`COREPACK_NPM_REGISTRY`、`pnpm_config_registry`、`npm_config_registry` 均为 `https://registry.npmmirror.com`。正式兼容预检、宿主构建、两个目标同步及健康检查通过，脚本退出 0。Server 和 Worker 在 13:13:43（北京时间）重启，各自容器和镜像 ID 保持。DSA 容器的启动时间与镜像保持。部署日志为 `closeout-ac03-sync-code.log`。

只读逐文件比较本次宿主正式构建的 Server、Domain、Schemas、Shared `dist`，两目标各有 7,107 份产物与宿主文件名及 SHA-256 完全一致，清单摘要为 `c2fb1ce5703947187d58b25c892ff9e9e67b94aebc9098825b6fc459278ed0`。对比同步前清单，变化的业务执行 JavaScript 为 `backtest-price-research-input.js` 和 `backtest-run-preparation.js`，其余变化为声明、源映射及已有收尾测试产物。本次同步位于容器可写层。

两容器分别以独立 Node 进程加载本次 `prepareBacktestRunConfigV3`，复用上述 `159516.SZ` 固定样本。后复权可用、原价整窗返回 `missing_window` 时，均返回 `blocked`、`entry.left`、字段 `close`、CN ETF 日线不复权路由及固定样本中配置的来源，结构化请求窗口为 **2026-05-02 至 2026-05-20**，含预热。与宿主正式构建的诊断完全一致，读取序列均为 `hfq → none`，策略保持原值。该过程禁止网络连接，直接使用内存输入。同步前清单及同步后回执为 `closeout-ac03-before-manifest.json`、`closeout-ac03-target-readonly-after.json`。

同步前后通过只读事务核对 6 张表的摘要，策略版本、回测、来源配置、路由策略及两张模型调用表均一致。Arena 仍在原有维护暂停，活动执行为 0，保留原有 1 条待执行周期。观察到允许范围内的 3 条系统估值计划行被重写，其中盘中估值采样行的内容摘要发生变化。诊断验收未发起真实行情请求、未调用模型、未写库。[归档任务](../archive/tasks/2026-11-22-backtest-ac03-target-sync.md)
