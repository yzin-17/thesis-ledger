# 事件重新启动与止损说明修复复验

后续记录：v24／v32完整七例仍为技术6／7、交易原意4／7，计数已通过，带宽／多周期／冻结前高未通过；累计41／600。详见[2026-11-22复验](2026-11-22-backtest-count-bandwidth-timeframe-fix.md)。下文v23原始结果与三例失败保持历史事实。

对应[任务归档](../archive/tasks/2026-11-21-backtest-final-seven-recheck.md)及[现行合同](../specs/2026-11-20-backtest-practical-design.md)。上一批的6／7交易原意结果与止损字段说明不一致保留在[原始证据](2026-11-21-backtest-final-seven-recheck.md)，本轮不拼接其通过结果。

## 根因与实际修复

原V6提示虽然要求repeat布尔值，却没有向模型说明全历史一次与每轮首次的区别；模型将允许后续突破重新启动的事件写成repeat=false。运行时已有正确语义，确认成功后consumed与repeat共同控制后续触发，不应修改引擎来掩盖模型失配。

止损原提示要求省略activation，模型实际选择显式immediate，intentCheck却仍声称省略。两者即时启用行为等价，问题在模型说明与实际字段不一致。已先补Spec，再修改V6完整结构说明之后的末次核对：明确repeat=true／false与within／allowSameBar的独立含义；无额外启用要求时明确选择immediate，说明写实际即时保护，不声称省略字段。模型仍自行生成AST，接收端不改repeat、capture、activation或原始文本。

生产写集仅为Domain末次核对提示及Server两用途提示版本，固定为`strategy-optimization-v23-repeat-readback`／`authoring-prompt-v31-repeat-readback`。原V6合法Schema、资格指纹、模型与原生路由不变；只读目标脚本核对相应新版本。旧V5消息与旧回执保持。

## 七例同版本验收边界

用户授权本次修复后完整复验七例，各一次；计入原600次业务额度，轮前27次、余额573，本轮上限7、探针0、自动重试0。复用`v6-qualification-cache1`，资格变化、模型／路由变化、未知传输结果停止；正常已完成响应的业务失败保留并继续其余独立样本，不重发。

本轮私有目录预定`var/acceptance/backtest-practical-20261120/v23-seven-final1`。沿用infra正式维护锁和主仓隔离入口，Node.js24.22.2、工作区npm镜像；生成／创建／冻结执行只写专属隔离库，真实业务数据只读。复验开始后不改输入；记录前后源码／测试／编译产物摘要、每例实际版本、原始模型输出、独立诊断、中文回读及冻结执行。技术链、交易原意与说明分开判断，七例全部来自本轮，不用旧版本补齐。

## 局部验证

Domain构建通过；Server现有事件成对测试、V6可见Schema与旧V5合同、编写生成／修改及编写提示共5文件28项通过（`t13-v23-contract-events.log`）。事件测试已经覆盖repeat=false只确认一次与repeat=true允许多轮，未修改引擎或增加与实现重复的字符串单测。Server类型、定向lint、尺寸门禁、只读脚本语法及差异卫生通过。

完整七例零网络冻结／请求预检通过，目录`v23-seven-final-preview1`、日志`t13-v23-seven-final-preview1.log`，真实发送0。本轮合法Schema没有变更，输入仍按新消息实际内容预留；原资格继续严格核对，不新增探针。

## 正式同步与版本固定

在`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`以Node.js24.22.2及工作区npm镜像执行`./scripts/sync-code.sh thesis-ledger`，退出0，日志`t13-v23-sync-code.log`；兼容预检、宿主构建、Server／Worker健康均通过。仅代码可写层更新，镜像不变，无数据库结构或外部卷变更。

随后在主仓执行`node scripts/local-runtime/run-backtest-practical-readonly.mjs <t13-v23-target-before.json> thesis-ledger-dev-thesis-ledger-1 thesis-ledger-dev-backtest-worker-1`，退出0。每容器1433份编译JS与宿主一致，正式提示v23／v31，旧股票冻结各只读重放两次一致，原Run／结果不变；业务写入、模型及行情请求均0。目标NAV仍无历史样本，未将此核对称为目标NAV业务验收。

复验前固定5231份相关源码／测试／编译输入，总摘要`d435702332f15fe7a9ce7b9a78d4cd2ecac93b42380b850907806a8fda0ac579`，清单`v23-seven-final-source-before.json`。真实复验期间不再修改这些输入。

## 同一修复版本的七例实际结果

真实入口在infra目录执行：`node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs <v23-seven-final1>`。参数显式选择场景`backtest-practical-v6`、全部七例、硬上限7、授权标识`2026-11-21-user-approved-600-repeat-readback-seven`及原私有资格目录，沿用Node.js24.22.2和工作区npm镜像。隔离53份迁移成功；入口退出1，原因是一个样本结构校验失败，并非传输未知或隔离基础设施失败。日志`t13-v23-seven-final1.log`，原始产物均在本轮目录。

七次请求全部完整响应，探针0、自动重试0、未知0。七份物理wire均为原模型和原生Schema，五个探索输入均保存v23版本，编写／修改各一份保存v31版本。执行前后5231份相关文件逐份一致，总摘要未变；清单`v23-seven-final-source-after.json`，版本核对`v23-seven-final1/version-route-review.json`。以下结果全部来自本轮，不拼接旧版本通过。

| 样本 | 技术链 | 交易原意 | 原始输出与说明核对 |
| --- | --- | --- | --- |
| count-confirmation | 通过 | **未通过** | sequence代替countTrue，既无最近5根计数也无至少3根阈值；reason却声称实现计数 |
| statistics-gap | 通过 | **未通过** | 带宽分母为常量20而非MA20，分位数输入重复同一错误；reason仍称除以均线 |
| captured-retest | 通过 | 通过 | repeat=true，说明明确结束后可新启动；cross.above表示突破，capture完整保留lag，10根、102%确认、失效与禁止同根正确 |
| timeframes-anchor | **未通过** | **未通过** | 两个anchorAt漏时区，正式Schema拒绝；另有多余小时lag，未进入正式创建或冻结执行 |
| session-vwap-arithmetic | 通过 | 通过 | 会话累计VWAP、偏离公式及空仓正确，说明明确下一可交易分钟开盘 |
| hfq-only-discovery | 通过 | 通过 | 仅后复权close／MA20、权益20%，无额外输入依赖，说明一致 |
| stop-only-policy | 通过 | 通过 | 显式immediate，说明保护立即生效，不再声称省略字段；基线其他字段保持 |

本轮技术链6／7、交易原意4／7，不能称为七例全通过。两个指定修复在本轮原始模型JSON中得到验证：冻结前高repeat=true且回读“可重复启动”；止损为immediate且原始说明与该即时行为一致，没有接收端修补。新增三例失败仍原样保留，六份技术通过不覆盖其中计数／带宽的原意错误。

多周期失败已经零网络核对正式V6 Schema：`strategy.entry.conditions[2].left.anchorAt`及`right.input.anchorAt`均为`2026-03-02T15:00`，返回`Invalid ISO datetime`。完整wire保存在`discovery/wire-output-4-1.json`，独立诊断保存在`timeframes-anchor-structure-review.json`；没有补时区、去掉小时lag、修改原AST或重发请求。这里是模型输出结构错误，不是冻结行情缺失或网络调用未知。

## 最终结算与剩余门禁

本批新增7次，600次授权累计34次、余额566；所有物理键各一次，全部response-complete，没有自动重试或新探针。逐例人工核对保存在`v23-seven-final1/business-review.json`，原始回执、失败、独立编译及技术产物保持。旧v22／v30整批6／7及更早组合证据均不回写。

本批未通过的门禁为计数表达式、带宽分母和多周期时区／小时lag三例。两项指定修复与正式同步已完成，本轮同版本复验后保留原有输入及调用计数。源与目标在本批前已正式核对一致，快更为容器可写层更新。
