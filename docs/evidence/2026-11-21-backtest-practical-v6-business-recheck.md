# V6业务复验与600次授权结算

v25／v33阶段结算为4例通过原意、说明、创建及冻结执行，累计48／600、余额552；两例被独立原意门禁在创建前拒绝，一例覆盖校验拒绝，见[该批证据](2026-11-22-backtest-semantic-generation-loop.md)。后续v28／v36整批7／7见[最终证据](2026-11-22-backtest-comparison-readback-recheck.md)。以下各阶段记录保持历史值。

后续追加验收：用户要求固定最终版本整批复验七例，结果为技术7／7、交易原意6／7，冻结前高的repeat=false未通过。该批没有拼接本记录的历史通过结果，累计授权计数更新为27／600；详见[最终版本整批证据](2026-11-21-backtest-final-seven-recheck.md)。下文20次结算与跨版本组合保留为当时历史事实，不能作为本轮七例全通过依据。

关联：[实施任务](../archive/tasks/2026-11-20-backtest-practical-design.md)、[详细规格](../specs/2026-11-20-backtest-practical-design.md)、[上一批10次证据](2026-11-21-backtest-practical-v6-model-acceptance.md)。

## 授权与范围

2026-11-21用户授权最多600次业务复验，要求沿用原模型和路由、复用已有私有资格、不新增探针、不自动重试。新授权与原33次及上一批10次分开结算。记录在`var/acceptance/backtest-practical-20261120/v6-authorization-600.json`，总额600、探针上限0。

首批仅执行已完成冻结预检的六个未通过样本各一次：`count-confirmation`、`statistics-gap`、`captured-retest`、`timeframes-anchor`、`session-vwap-arithmetic`、`hfq-only-discovery`。单批硬上限6，不重跑已通过的`stop-only-policy`。其余额度保留，不能据此自动重复采样失败样本。

沿用`lmstudio`与`qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`、原生Schema路由。只写专属隔离库和私有回执目录，真实策略、回测、Provider及来源配置只读。逐请求发送前登记，保存原始输出、正式编译及诊断、中文规则和冻结执行结果；未知结果、配置变化或资格失效停止相关批次。

## 固定输入与复用证据

本批使用已同步的`strategy-optimization-v19-visible-v6-schema`正式探索提示，原生模式也向模型说明同一完整Schema。编写合同保持V6。六例冻结及请求预检已在`v6-recheck-preview1`通过，发送0；其输入未变化的检查不机械重跑。

私有资格来自上一批真实通过历史，保留原请求ID、指纹、检查时点和延迟，位于`v6-qualification-cache1`；之前零网络恢复及正式就绪检查通过。本批在任何模型发送前比较当前Provider／对应路由设置，再恢复严格就绪资格；没有探针回退分支。

## 实际入口

执行目录为`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，Node.js24.22.2；入口为`node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs <v6-recheck-live1>`。

参数明确选择`BACKTEST_PLAN_SCENARIO=backtest-practical-v6`、六例`PRACTICAL_V6_CASES`、`PRACTICAL_V6_MODEL_LIVE=1`、`PRACTICAL_V6_CALL_LIMIT=6`、`PRACTICAL_V6_AUTHORIZATION_REF=2026-11-21-user-approved-600-business-batch1`及上述私有资格目录。npm registry使用工作区镜像。原每请求5分钟期限、进程组停止后清库及有界批次等待均保持。

实际调用以`v6-recheck-live1/call-ledger.json`为准，完成后更新总授权账本、逐样本语义和T13g。当前不预判验收通过。

## 第一批结算与实际修复

首批6次全部有完整回执，探针0；仅后复权MA20探索通过原意、创建和冻结重放。计数例多包sequence，带宽例比较两侧写反，回踩例capture遗漏lag，小时例额外后移小时值，会话例把累计均价写成period=1的滚动VWAP。四个技术上可执行的候选不因此全部计为业务通过。原始退出码1及回执保留。

小时窗口另有两层实现缺口：主源已冻结较长父窗，却被候选较短默认预热起点误拦截；额外分钟源及其聚合日历只按种子较短窗口准备。已按Spec修复：新范围的锚点由真实冻结父窗校验，准备各物理周期和日历统一覆盖acquisitionPlan。旧分钟父窗确实不足时保持拒绝，新准备上的原AST诊断重放另记，没有临时替换旧输入或修补lag。2项窗口／原AST诊断、52项受影响准备检查通过。

同时将已明确不可用或不一致的额外冻结周期标为DATA_UNAVAILABLE稳定输入失败；测试确认不自动重算，直接抛出的基础设施异常保留原异常及分类。这里没有扩大为其他无关错误的重构。

## 第二批：有实际实现变化后的五例验收

提示版本`strategy-optimization-v20-intent-semantics`／`authoring-prompt-v28-intent-semantics`补充同时过滤、事件先后、比较主语、capture完整表达式、会话与滚动VWAP及比例回读。原生输出Schema仍为前一批摘要`9085d3677a8d2f02cd3952ef512119783d9083d5ab9efea78e3cdd7910b85dd2`；实际4次探索请求逐项核对一致。

第二批只发5次业务请求（`v20-five-live1`），探针0，结果均已结算。冻结前高回踩通过：触发和capture均排除当根，10根等待、失效、102%严格确认、重启、权益20%和恒假退出正确，正式创建及冻结重放完成。计数／带宽仍增加sequence；小时累计量取小时来源lag(1)，不是前一日线；会话例coverage引用未生成description并选用本池未提供的actual。后两例即使部分技术或节点正确，业务结论仍未通过。

此时总授权已用11／600，探针0，余额589。最新7例合计3例通过（仅加止损、仅后复权、冻结回踩）；所有旧失败和统计独立保留。

## 第三批的边界与预检

针对持续出现的事件包装，V6联合分支仅调整展示顺序：all／any／比较等普通节点在前，sequence在后，未增删任何合法字段、范围和绑定。前版真实原生Schema已保存为公开结构基准，递归比较忽略分支顺序、引用名称及注解，保留全部业务属性和常量数据，验证结构等价；17项合同／旧V5检查通过，用途版本和资格指纹不变，因此继续复用原资格而不探针。该改变是否改善模型选择仍以业务回执判断，不预先宣称根因完全消除。

同时修复V6可见Schema精简中“注解description”与“同名业务属性”的区分，防止把真实字段／常量数据误删；旧V5文本路径按历史表示保留。补充多周期lag步长、相对研究坐标和coverage实际路径核对。版本为`strategy-optimization-v21-operator-order`／`authoring-prompt-v29-operator-order`。

第三批仅含计数、带宽、多周期锚定、会话四例，各一次、硬上限4，目录`v21-four-live1`；已通过三例不重跑。四例冻结和请求预检在`v21-four-preview1`通过，发送0。资格、模型、路由、隔离写入、未知结果停止及禁止同请求自动重试均沿用上述边界。

## 第三批实际结算与逐例判断

入口退出0，4次业务调用均收到完整响应，全部完成V6编译、正式创建和冻结执行；未知结果0、探针0。授权累计15／600，余额585。以下判断核对原始AST，不以技术链通过替代业务语义：

| 样本 | 本次实际行为 | 判断 |
| --- | --- | --- |
| count-confirmation | 最近5根上涨至少3根，且连续3根收盘高于EMA20；权益20%，边沿入场、恒假退出 | 通过。模型选择本池已有actual日线，并保留未使用research声明；本例没有指定后复权，未增加来源 |
| statistics-gap | 总体标准差20根÷20根均值，不高于该带宽60根20%分位数；开盘相对上一收盘变化绝对值小于2% | AST通过；用sum÷20表达均值与MA20等价 |
| timeframes-anchor | 当前已完成日线与60分钟线分别高于MA20／MA5；带时区锚点的日线累计量高于其前一日值 | 通过，无额外小时lag，累计比较两侧均为日线来源 |
| session-vwap-arithmetic | 空仓与收盘／当日累计VWAP偏差绝对值小于1%同时成立；边沿入场、权益20% | 通过，使用sessionValue而非滚动VWAP |

两处原始模型说明不精确：带宽reason把AST的“不高于”说成“低于”，会话intentCheck把一分钟的下一可交易开盘说成“次日”。保留原文并披露，不能声称模型叙述完全准确；正式行为与程序中文回读取自AST，没有改写模型AST或原回执。

收尾发现程序累计锚点仍固定UTC显示，与Spec“对应市场时间”不符。已按来源市场复用既有时区映射；嵌套表达式、委托价格和保护条件沿用相同上下文，无来源或市场不明时明确UTC。另补齐嵌套会话值的说明检测。CN／HK及美国冬夏时、缺上下文、原定义不变和既有回读共14项通过，Domain构建、Server类型、定向lint、依赖边界和尺寸门禁通过。新回读保存在`v21-four-final-readback.json`，原第三批回读仍原样保留。

## 最终公共合同回归

第三批改变公共Schema的呈现顺序与V6提示，另对冻结回踩、仅后复权和仅加止损各执行一次新版本回归，目录`v21-three-regression1`，硬上限3、探针0。目的为验证公共合同变化对既有通过行为的影响；不对第三批相同输入重复采样，不将余额视为自动重试许可。实际结果待批次结算，前述15次计数不预记尚未发送的请求。

第四批实际3次全部收到完整回执，技术入口退出0；人工业务核对仅后复权通过，另外两例未通过。回踩的trigger.right保留lag(1,Highest)，但capture仅Highest、遗漏lag；仅加止损保持原入场政策，却擅自增加以averageCost为基准的启用条件，改变首笔成交价固定保护的原意。技术校验成功不覆盖这些失败，第三批结束时“各例曾通过”不能作为公共新版本的七例完整通过。本授权此时实际18／600、探针0、余额582，原始JSON和回读均保留。

先补Spec再修复V6模型可见消息：完整Schema之后明确逐层保持被冻结操作数，以及固定保护阈值与额外启用条件的区别；同时要求严格／非严格和下一可交易开盘的中文按AST读取。仅改模型输入，不复制capture、不删除activation、不改原回执或Schema。版本`strategy-optimization-v22-frozen-protection`／`authoring-prompt-v30-frozen-protection`；15项现有生成合同检查、两例冻结预检、Domain构建和定向lint通过。第五批只验收受影响回踩与仅加止损，各一次，上限2，目录`v22-two-live1`，继续0探针、不自动重试。

## 最终结果、调用结算与验证边界

第五批入口退出0，两例完整响应且业务核对通过。回踩capture与trigger.right逐层相同，完整保留lag(1,Highest(high,20))，10根期限、禁止同根、102%确认、跌破失效和重新启动均保持。仅加止损为首笔成交价下方5%固定保护；模型显式填写activation.immediate，与省略时的即时启用语义等价，没有新增条件，原入场／退出、权益比例和rising-edge保持。

最终七例的证据组合为第三批计数／带宽／多周期／会话四例、第四批仅后复权、第五批回踩／仅加止损两例。第五批仅改冻结操作数与保护启用的说明，其他五例复用对应已通过输入证据；不是同一提示版本一次重跑七例，也不能推断模型所有后续输出都保证语义正确。带宽与会话两处原始模型措辞限制继续披露，程序回读与交易AST保持准确。

本次授权实际使用20／600次业务请求，0探针、0未知结果，余额580。按批次为6、5、4、3、2；每份账本物理键唯一，均为response-complete，没有SDK重试或同一批同请求重发。原33次与上一批10次历史保持独立。`v6-final-business-review.json`保存七例人工原意结论、原产物摘要和机械核对，`v6-authorization-600.json`保存总账；旧失败与旧成功均未重写。

实际业务写集按职责归属：Backtest依赖／准备／日历／冻结读取负责父窗与稳定缺项；AI Schema注解辅助负责完整业务字段；V6 Schema只置换联合顺序；Domain算子提示、编写／探索正式提示负责模型决定；Domain表达式／计划／委托回读负责来源时区及嵌套会话说明。对应测试、基准Schema、验收输入版本记录和只读目标验证脚本随主仓维护。DSA及infra本阶段没有新增业务实现或配置修改。

必要验证分层保留：受影响准备8文件52项、冻结父窗／原AST诊断2项、稳定缺项分类1项；Schema等价及旧合同17项、Schemas12项；末次提示合同15项、两例预检；市场时间及既有回读14项。Domain／Schemas构建、Server类型、定向lint、依赖边界、文件尺寸及差异卫生通过。前序真实DB／Redis／独立Worker、CPU取消及两端四宽度输入未变，复用实施记录，不机械再跑。早期失败日志仍保留。

## 最终目标运行态

2026-11-21在`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，以Node.js24.22.2及工作区npm镜像执行正式`./scripts/sync-code.sh thesis-ledger`，退出0；日志`t13-final-sync-code.log`。兼容预检与宿主Server／workspace构建通过，Server／Worker健康，镜像保持不变；没有执行数据库结构或外部卷变更。这是容器可写层快更，容器重建仍会恢复镜像内容，不能称为镜像或原生安装包更新。

随后在主仓执行`node scripts/local-runtime/run-backtest-practical-readonly.mjs <t13-final-target-readonly.json> thesis-ledger-dev-thesis-ledger-1 thesis-ledger-dev-backtest-worker-1`，退出0。两容器各1433份编译JS的SHA256均与当前宿主构建一致；正式提示为v22／v30，V6三用途、独立诊断、区间双边周转率和市场时区回读均核对。每容器对原00700.HK冻结股票样本用当前v5执行器只在内存重放两次，结果一致、29次成交，原v4任务及结果保持原值；网络Provider请求0、模型请求0、业务写入0。目标仍无NAV历史样本，NAV完整冻结／HTTP／重放继续以隔离R7为证，不提升为目标NAV业务验收。DSA沿用前序正式同步及协议核验，没有因本阶段提示变化重复更新。
