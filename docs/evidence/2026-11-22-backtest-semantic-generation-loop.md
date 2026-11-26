# 策略生成语义闭环验证

关联：[任务归档](../archive/tasks/2026-11-21-backtest-final-seven-recheck.md)、[现行合同](../specs/2026-11-20-backtest-practical-design.md)。用户要求先零模型调用成对验证，再修复生成端，最后同版本完整七例，全部通过后才完成。旧v22～v24结果分别保留。

## 判断责任与阶段边界

七例需求由原自然语言明确参数独立写成受控验收基准；不从模型reason反推期望，不由oracle生成业务策略。比较只覆盖本轮明确约束及列明等价形式，不能作为通用自然语言校验器或生产样本ID分支。接收端不改AST；发现语义不符即保留原输出与业务诊断，不进入正式创建。拒绝正确也不计生成成功。

零调用阶段必须先验证正例、反例、参数变化与等价写法，并检查旧三轮21份原始结果。生成端随后改为统一V6语义及完整合法算子示例，保留完整Schema与所有原能力；模型仍决定来源、周期、方向、capture、lag和阈值。

本轮前授权累计41／600，余额559。只有A／B检查完成并固定输入后才执行七例各一次，探针0、自动重试0，沿用原模型、原路由和已有私有资格。复验期间不修改版本，七例原意、说明、隔离创建与冻结执行全部通过才结案；任何未通过仍留在活动Task，不自动追加调用。

## A 零模型调用成对验证

新增独立需求基准、有限等价规范化和原意检查，均位于`apps/server/test/backtest/practical-v6-intent-*`；生产端不读取这些样本ID。28项测试覆盖七个正确配置、七个参数变体、空仓取反、计数与事件替换、MA与sum／周期等价及常量分母反例、完整capture／引用／repeat／lag／同根、时区及同一UTC时刻、会话与滚动VWAP、保护启用及政策；合取顺序／嵌套、相反比较、十进制、来源重命名、quantity零和双重否定均验证不误拒。

另将v22、v23、v24三轮21份原始回执仅在内存核对，独立复现其6／7、4／7、4／7业务结论。没有读取原人工passed标志作为期望，也不读reason推断含义；v23缺时区原始wire由正式Schema独立拒绝。fetch被禁止且调用次数为0，报告`loop-intent-recordings2.json`，最终日志`t13-loop-a-final.log`共29项通过。

首轮27项中仅“只改止损”参数变体错误地同时改变资金比例，被基线守卫拒绝；调整为仅改保护参数后通过。初次类型检查发现Schema广义Expression与布尔类型差异及可空对象，修正测试类型后通过；原失败日志保留。最终Server类型和新写集定向lint通过。本阶段没有业务代码变更、模型调用、数据库写入或目标部署。

## B 生成端与验收接入

V6使用单一`BACKTEST_GENERATION_GUIDE_V6`，以类型明确、完整可解析的JSON示例替换三份重叠表达式提示及伪JSON。示例参数刻意不同于七例，不按样本ID选择策略；模型仍需按本次用户参数／来源生成。显式补齐not(isOpen)、当前时钟、完整冻结操作数／eventValue、repeat及即时保护。旧V5提示和合法能力保持。

原生Schema只将既有两个事件分支交换为有capture在前，普通布尔仍在事件前。与原V6实际Schema递归结构等价检查通过，不增加或删除字段／绑定，不改变用途版本或已有资格；旧V5合同继续通过。参考的9个完整表达式全部经正式V6生成Schema解析成功。

受控验收在正式编译之后、创建之前调用独立原意检查，失败保存`*-intent.json`、原始生成及编译产物，不创建错误候选。历史技术回放保持原统计；新七例不能仅因技术执行成功进入通过统计。说明一致性仍由本轮原文与程序回读逐项人工核对，不以oracle替代模型说明。

版本固定为`strategy-optimization-v25-semantic-guide`／`authoring-prompt-v33-semantic-guide`。Domain／Schemas构建、Server类型通过；包括成对正例／参数变体正式编译的5文件47项、Schemas12项通过。lint首轮新增测试解构未使用变量失败，修正后通过；边界、尺寸、脚本语法和差异卫生通过。新写集包括Domain说明／示例、Schemas分支顺序、Server V6入口和验收测试，不改变编译／模拟／数据逻辑。

完整七例零网络预检通过，目录`v25-seven-loop-preview1`。每份实际消息只含一份结构化参考；相较v24，三个用途系统消息各增加401字节，是重复说明换成完整示例的结果，不宣称总上下文变短；实际预算继续按完整消息和Schema计算。

## 正式同步与最终固定输入

在infra目录，以Node.js24.22.2和工作区npm镜像执行`./scripts/sync-code.sh thesis-ledger`，退出0，日志`t13-loop-b-sync-code.log`。兼容预检、宿主构建与两服务就绪通过；镜像保持不变，无数据库结构或外部卷变更，属于可写层更新，不代表镜像或原生包更新。

随后在主仓执行`node scripts/local-runtime/run-backtest-practical-readonly.mjs <t13-loop-b-target-before.json> thesis-ledger-dev-thesis-ledger-1 thesis-ledger-dev-backtest-worker-1`，退出0。每容器1435份编译JS与宿主一致，正式提示v25／v33、V6三用途及原编译诊断核对通过；各对旧股票冻结只读重放两次一致，原Run／结果保持，模型／行情请求及业务写入均0。目标无NAV历史样本，原隔离证据边界保持。

正式构建后再验证零调用29项及21份原回执，报告`loop-intent-recordings3.json`、日志`t13-loop-b-zero-final.log`，全部通过。复验前固定5242份源码／测试／编译输入，摘要`e2a2a1520a14bfca3b6a90e7dc358a1c5759fbe6fce802c465bf978ae0162de6`，清单`v25-seven-loop-source-before.json`。

## C 本轮真实七例计划

私有目录`v25-seven-loop1`，授权标识`2026-11-22-user-approved-600-semantic-loop-seven`；场景`backtest-practical-v6`，显式七例、`PRACTICAL_V6_CALL_LIMIT=7`、原`v6-qualification-cache1`。在infra使用正式`locked --idle`及主仓`run-backtest-trade-plan-acceptance.mjs`入口，只写专属隔离库。总账轮前41次、余额559。版本固定后不修改代码或原意检查，实际发送与业务结果待结算，不预记通过。

## C 实际执行与逐例结果

上述入口退出1，日志`t13-loop-c-seven1.log`。专属隔离库53份迁移成功，七次模型请求全部完整响应；失败来自正式校验及独立原意门禁，不是隔离基础设施失败或未知结果。七份实际wire使用原模型、原生Schema；五例探索均为v25，两例编写／修改为v33，资格复用无新增探针。

本轮生成Schema响应7／7、正式校验6／7；6例进入独立原意检查，4例通过、2例拒绝，1例在正式覆盖校验已失败。只有4例完成创建及两次冻结执行一致，并通过人工原始说明审查。不能把正式校验6／7称为完整技术执行6／7，也不能把新检查成功拒绝错误当作生成修复完成。

| 样本 | 正式校验 | 独立原意 | 创建／冻结执行 | 说明审查 |
| --- | --- | --- | --- | --- |
| count-confirmation | 通过 | 通过 | 通过 | 通过 |
| statistics-gap | 通过 | 拒绝：严格小于被改成不高于 | 未执行 | 与AST不符 |
| captured-retest | 通过 | 通过 | 通过 | 通过 |
| timeframes-anchor | 通过 | 通过 | 通过 | 通过 |
| session-vwap-arithmetic | 拒绝：覆盖路径不存在 | 未到达 | 未执行 | 下一分钟误写次日 |
| hfq-only-discovery | 通过 | 通过 | 通过 | 通过 |
| stop-only-policy | 通过 | 拒绝：附送条件启用 | 未执行 | 首笔成交价与均价混淆 |

带宽例的总体标准差／MA20、分位数和跳空公式已符合，但跳空比较是lte 0.02，用户明确要求lt 0.02，reason却称“<2%”；原意检查保存`statistics-gap-intent.json`并在创建前拒绝，没有改操作符。

会话例原始交易公式正确，但coverage列入所有根字段并引用未生成的description，原门禁返回`AUTHORING_COVERAGE_INVALID`；intentCheck又把下一可交易分钟开盘说成次日。保留原输出与正式诊断，没有删除覆盖路径或修补说明来通过。

仅加止损例又附送close<=averageCost×0.95的条件启用，把含费用均价当作首笔成交价，与即时固定保护不符；原意检查保存`stop-only-policy-intent.json`并在创建前拒绝，原激活条件保持。其他四例的AST、原始说明、程序回读、真实隔离创建及重复冻结结果逐项核对通过；冻结前高选择本池已取得的actual日线，用户原意未限定后复权，正式dataScope核验通过，不属于新增来源。

## 输入核对、结算与未完成义务

执行后5242份相关源码／测试／编译文件逐份未变，总摘要仍为`e2a2a1520a14bfca3b6a90e7dc358a1c5759fbe6fce802c465bf978ae0162de6`，清单`v25-seven-loop-source-after.json`。版本／路由核对及人工逐例结论保存在本轮`version-route-review.json`、`business-review.json`；原模型输出和正式产物保持原样。

本轮新增7次，600次授权累计48次、余额552；探针0、自动重试0、未知0，逐键各一次且全部response-complete。本批完整业务为4／7，失败为带宽严格边界、会话覆盖／说明和止损启用。后续完整通过见[最终同批证据](2026-11-22-backtest-comparison-readback-recheck.md)，本批原始结论保留。
