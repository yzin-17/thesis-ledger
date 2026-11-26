# 计数、带宽与多周期修复及七例完整复验

后续v25／v33有4例通过原意、说明、创建及冻结执行；另两例被新原意门禁在创建前拒绝、一例正式覆盖校验拒绝，累计48／600，见[该批记录](2026-11-22-backtest-semantic-generation-loop.md)。本文保留v24原始结果。

关联：[任务归档](../archive/tasks/2026-11-21-backtest-final-seven-recheck.md)、[现行合同](../specs/2026-11-20-backtest-practical-design.md)、[上一轮失败](2026-11-21-backtest-repeat-readback-fix.md)。本轮仅使用修复后同一版本的七份新回执。

## 原始失败与修复边界

上一轮计数例把sequence事件确认误称为最近窗口次数，遗漏countTrue和阈值3；带宽例把MA20结果替换成常量20；多周期例漏写锚点时区，并为最新已完成小时收盘及均线附加lag。原始SDK、正式Schema与计算语义无需因此放宽，也不能接收后猜测用户意图修补AST。

先补Spec，再在V6完整Schema之后的核对提示加入明确字段映射：窗口N根至少K根为compare(countTrue,gte,K)，连续M根为consecutive，同刻要求用all；MA的周期参数与数值结果分别表达，带宽分位数输入复用完整比值；最新小时值不额外lag，前一日累计值的lag只作用于日线累计表达式；锚点提供完整带偏移ISO格式示例并要求按用户时点选择。原repeat及即时止损说明保持。

生产写集仅为Domain末次核对提示、Server编写／探索提示版本；版本固定为`strategy-optimization-v24-window-operands`／`authoring-prompt-v32-window-operands`。只读目标脚本跟随核对版本。未修改V6／旧V5 Schema、编译器、模拟器、用户原文、价格源或数据能力；现有私有资格指纹不变。新增说明帮助模型选择，是否通过以本轮原始回执与执行判断。

## 本轮完整七例与授权

本轮前600次授权已使用34次、余额566。本轮硬上限7个业务请求，各例一次，沿用原模型`qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`和LMStudio原生Schema路由，复用`v6-qualification-cache1`，探针0、自动重试0。

私有目录预定`var/acceptance/backtest-practical-20261120/v24-seven-final1`。使用infra正式维护锁与主仓隔离入口，只写专属隔离库，真实业务数据只读。七例仍为计数、带宽、冻结前高、多周期累计、会话VWAP、仅后复权和仅加止损；固定前后源码／测试／编译输入，执行期间不改版本。未知结果、配置或资格变化停止，不重发；已完成的业务失败保留并继续其他独立样本。技术链、原意与说明独立判断，所有通过均须来自本批。

## 局部验证与预检

Domain构建、Server类型、定向lint、文件尺寸、只读脚本语法和差异卫生通过。现有数值历史、窗口计数／统计、有限事件、多周期／可见时钟及生成合同共8文件60项通过，日志`t13-v24-contract-operators.log`；没有为提示文本增加重复实现的字符串单测。已有V6原生Schema等价、旧V5合同及真实输入预算检查也在该批通过。

完整七例零网络冻结／请求预检通过，目录`v24-seven-final-preview1`、日志`t13-v24-seven-final-preview1.log`，真实调用0。模型原文、编译器和量价准备代码未改，本轮不重复无变化的DSA、原生客户端或浏览器整套验收。

## 正式同步与版本冻结

2026-11-22在infra目录以Node.js24.22.2和工作区npm镜像执行`./scripts/sync-code.sh thesis-ledger`，退出0，日志`t13-v24-sync-code.log`。兼容预检、宿主构建和Server／Worker就绪通过；镜像保持不变，无数据库结构或外部卷变更，属于容器可写层快更，不代表镜像或原生安装包更新。

随后在主仓执行`node scripts/local-runtime/run-backtest-practical-readonly.mjs <t13-v24-target-before.json> thesis-ledger-dev-thesis-ledger-1 thesis-ledger-dev-backtest-worker-1`，退出0。两容器各1433份编译JS与当前宿主一致，正式提示v24／v32、三用途V6、编译诊断与回读检查通过；各对旧股票冻结只读重放两次一致，原Run及结果保持，模型／行情请求和业务写入均0。目标无NAV历史样本的边界保持。

复验前记录5231份相关源码、测试与编译输入，摘要`c37580e944cbb4ff4e16e8bda605da2bfdc08650a1197f5b943855384926613b`，明细`v24-seven-final-source-before.json`；执行期间保持此版本。

## 本轮同版本七例实际结果

在infra目录，以Node.js24.22.2及工作区npm镜像执行正式入口`node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs <v24-seven-final1>`。参数固定场景`backtest-practical-v6`、全部七例、`PRACTICAL_V6_CALL_LIMIT=7`、授权标识`2026-11-22-user-approved-600-window-operands-seven`及原私有资格目录。隔离53份迁移成功；入口退出1，为冻结前高候选正式校验失败，日志`t13-v24-seven-final1.log`。不是隔离运行失败或调用结果未知。

七次业务调用均完整响应，探针0、自动重试0、未知0。五次探索均为v24，两次编写／修改均为v32；七份实际wire为原模型及原生Schema。执行前后5231份输入逐份一致，总摘要保持，清单`v24-seven-final-source-after.json`；版本／路由核对与逐例人工判断分别保存在本轮`version-route-review.json`和`business-review.json`。所有结果只来自本轮七例。

| 样本 | 技术链 | 交易原意 | 本轮实际情况 |
| --- | --- | --- | --- |
| count-confirmation | 通过 | 通过 | countTrue最近5根收阳至少3根，且连续3根各自close高于EMA20，all同时判断，说明一致 |
| statistics-gap | 通过 | **未通过** | MA20分母与完整带宽分位数已正确，但入场增加“已持仓”，与用户空仓要求相反 |
| captured-retest | **未通过** | **未通过** | 未生成capture／eventValue，确认比较当前close与1.02×当前close，失效比较close与常量0.98；正式校验拒绝 |
| timeframes-anchor | 通过 | **未通过** | 带时区锚点已正确；仍为小时前一根收盘及均线，且入场为“已持仓” |
| session-vwap-arithmetic | 通过 | 通过 | 空仓、sessionValue.vwap、绝对偏离公式正确，说明与回读一致 |
| hfq-only-discovery | 通过 | 通过 | 仅后复权日线close／MA20，权益20%，严格高于入场／低于退出，说明一致 |
| stop-only-policy | 通过 | 通过 | 固定5%即时保护、原政策及基线字段保持，说明准确 |

本轮技术链6／7、交易原意4／7，不能声明七例全部通过，也不能声明三个原失败案例均已解决。计数修正通过，带宽公式和锚点时区只是局部修正；错误持仓资格和小时lag仍使完整原意失败。两个原始reason称“空仓”，实际JSON却为positionState.isOpen；程序回读准确显示“已持仓”，没有替模型取反。

冻结前高原始生成中的sequence没有capture，确认并未引用冻结值；原始reason所称“冻结历史高点”没有实现。编译诊断为`PRICE_COORDINATE_INVALID`，路径`entry.invalidation`，因后复权close与实际常量价格0.98比较而被拒绝；独立候选和完整诊断保留在`captured-retest.json`。没有补capture、改eventValue或替换阈值来制造通过，没有进入该候选的正式创建／冻结执行。

## 结算与剩余门禁

本轮新增7次，600次授权累计41次、余额559；逐键各发送一次、全部response-complete，新增探针0、自动重试0、未知0。所有原始成功／失败与旧统计保留，本轮没有引用旧版本的通过回执补齐。

本批未通过的是带宽的空仓资格、多周期的空仓资格及最新小时值、冻结前高的完整捕获与冻结价引用。本次同版本七例复验已结束，正式目标当时已同步到v24／v32，复验期间源码及调用结算保持原样。
