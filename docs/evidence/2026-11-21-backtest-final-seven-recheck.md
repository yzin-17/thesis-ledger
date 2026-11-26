# 最终版本七例完整复验证据

后续修复结果：repeat与止损字段说明已修复，随后v23／v31完整七例为技术6／7、交易原意4／7，计数、带宽、多周期未通过。详见[修复后整批证据](2026-11-21-backtest-repeat-readback-fix.md)。本记录保留v22／v30当时6／7及原始失败，不与新版本拼接。

关联：[任务归档](../archive/tasks/2026-11-21-backtest-final-seven-recheck.md)、[现行合同](../specs/2026-11-20-backtest-practical-design.md)。前序不同版本的通过组合仅为历史背景。

## 固定范围

用户要求用最终版本完整复验七例，沿用原模型、路由与已有私有资格，不新增探针、不自动重试。固定探索提示`strategy-optimization-v22-frozen-protection`及编写提示`authoring-prompt-v30-frozen-protection`，三用途合同保持V6。本批七个业务样本各一次，上限7，计入600次授权；批前已用20，余额580。

原模型为`qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，Provider为`lmstudio`，使用原生Schema路由。已有三用途资格从私有`v6-qualification-cache1`读取并由正式就绪检查核对，不设探针回退。业务写入限专属隔离PostgreSQL；冻结价格由原受控样本准备，禁止候选临时补取。

## 预定入口与停止条件

在infra工作目录，使用Node.js24.22.2和工作区npm镜像，从`node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs <私有目录>`进入。场景`BACKTEST_PLAN_SCENARIO=backtest-practical-v6`，显式选择全部七例，`PRACTICAL_V6_CALL_LIMIT=7`，私有目录`var/acceptance/backtest-practical-20261120/v22-seven-final1`；本批授权标识`2026-11-21-user-approved-600-final-seven`。

执行期间不修改生成输入或业务代码；前后记录相关源码、编译产物和测试输入摘要。若版本、模型、路由、资格变化或调用结果未知，停止相关批次，保留失败，不发起重试。正常业务校验失败保留回执并继续其余独立样本，不用其他批次补齐。实际发送、原始响应、编译诊断、回读与冻结执行均保存在本批目录；完成后单独给出七例技术与业务结论。

## 本批预检与判断口径

七例零网络冻结预检退出0，产物`v22-seven-final-preview1`。执行前只读目标核验退出0，Server／Worker各1433份JS与当前宿主构建一致，v22／v30提示生效；各自内存重放旧冻结股票两次结果一致，原结果不变，模型／行情请求及业务写入均0。相关源码、测试及编译输入5231份文件的摘要为`84513369ab321229c0747a8aed1d4cb53dd7c387482937972fd211d58dbee77e`，明细`v22-seven-final-source-before.json`。

每例分别报告技术链、交易原意、说明一致性。技术链包含正式编译／校验、隔离创建和两次冻结执行一致；交易原意按下表核对，数学等价表达允许，未要求的过滤或控制不允许附送；原始模型说明与程序中文回读另查，措辞错误不会因技术链成功被隐藏。

| 样本 | 必须保持的原意 |
| --- | --- |
| count-confirmation | 含当根最近5根至少3根收阳，且连续3根各自收盘高于当根EMA20；无额外事件等待 |
| statistics-gap | 20根总体标准差÷MA20的带宽，不高于该带宽60根20%线性分位数；绝对跳空比例严格小于2% |
| captured-retest | 排除当根的20根前高；完整冻结该操作数，10根内跌破作废、严格高于102%首次确认，禁止同根，允许重新启动 |
| timeframes-anchor | 当前已完成日线及可见60分钟收盘分别高于MA20／MA5；北京时间2026-03-02 15:00锚定的日线累计量高于其前一根日线值，无附加小时lag |
| session-vwap-arithmetic | 一分钟收盘÷当日开盘以来累计VWAP减1的绝对值严格小于1%；使用会话值而非固定窗口VWAP |
| hfq-only-discovery | 仅后复权，收盘严格高于MA20入场、严格低于MA20退出，权益20%；不增加原价或份数依赖 |
| stop-only-policy | 仅增加首笔成交价下方5%固定保护，后续可交易开盘清仓；原入场／退出／资金／费用／政策保持，无额外启用条件 |

各例还核对确认的权益比例、费用、空仓资格、入场政策及未要求的独立风控；恒假普通退出按本例要求保持。即时保护的显式immediate与省略即时启用等价，不以字段形状差异误报行为差异。

## 实际执行与本批结果

上述正式维护入口退出0，隔离库完成53份迁移；七例各发送一次并收到完整响应。实际调用目录为`v22-seven-final1`，日志`t13-v22-seven-final1.log`。7份物理wire均为原模型、原生Schema；探索5份输入均保存v22版本，编写与修改各1份均保存v30版本。私有资格严格复用，探针0、自动重试0、未知结果0。

技术链7／7通过，交易原意6／7通过，整批“七例原意全部通过”未达到：

| 样本 | 技术链 | 交易原意 | 本轮实际核对 |
| --- | --- | --- | --- |
| count-confirmation | 通过 | 通过 | all合并最近5根阳线至少3根与连续3根各自close高于EMA20，无事件包装 |
| statistics-gap | 通过 | 通过 | ddof=0／MA20，不高于同带宽60根20%分位数，绝对跳空严格小于2% |
| captured-retest | 通过 | **未通过** | capture与trigger.right完整保留lag，但原始repeat=false，遗漏允许重新启动 |
| timeframes-anchor | 通过 | 通过 | 当前已完成日线／小时值、日线累计量的前一日比较及北京时间锚点正确 |
| session-vwap-arithmetic | 通过 | 通过 | 使用sessionValue.vwap，偏离公式与空仓资格正确，未改为滚动VWAP |
| hfq-only-discovery | 通过 | 通过 | 仅research日线，高于MA20入场、低于退出，权益20%，无新数据依赖 |
| stop-only-policy | 通过 | 通过 | 首笔成交价下方5%即时固定保护；原入场、退出、仓位、费用及政策保持 |

失败的具体事实：`captured-retest.json`中模型原始JSON与正式定义均为`entry.repeat=false`，程序回读为“只确认一次”。现有`backtest-event-sequence.ts`在确认成功后设置consumed；repeat=false时不再允许后续新触发，和用户“结束后允许新的突破重新启动”相反。capture、期限、确认与失效其他部分正确不覆盖这一失败。本轮未修改repeat，也没有用上一批repeat=true的回执替换。

说明核对另记：回踩reason没有覆盖重新启动要求；仅加止损的intentCheck称“省略activation”，原始JSON实际显式填写immediate。后者两种表示的即时启用行为等价，交易原意通过，但字段说明存在不一致；原文不修改。其余例未出现前轮“不高于说成低于”或“一分钟下一开盘说成次日”的矛盾，程序中文回读准确。不能把技术链7／7或六例行为通过称为七例整体验收通过。

## 输入一致性与结算

执行后5231份相关文件与执行前逐份一致，总摘要仍为`84513369ab321229c0747a8aed1d4cb53dd7c387482937972fd211d58dbee77e`；明细`v22-seven-final-source-after.json`，变更列表为空。该批所有结果均来自本次固定版本的实际调用，没有拼接历史版本。版本与路由核对保存在`version-route-review.json`，逐例人工业务判断保存在`business-review.json`，原始回执与正式技术产物保持原样。

600次授权累计使用27次业务调用，余额573；本批新增7次、0探针、0未知结果，逐键仅发送一次，全部response-complete。未追加调用、修改业务代码或重新部署；本批写入仅专属隔离库及私有证据，真实业务数据只读。旧20次及更早历史回执、统计保留。当前剩余门禁为本轮冻结前高的重新启动语义错误；本次固定版本复验到此停止，不自动转入修复或重试。
