# 回测整改 V6 真实模型验收

关联：[实施任务](../archive/tasks/2026-11-20-backtest-practical-design.md)、[详细规格](../specs/2026-11-20-backtest-practical-design.md)、[既有实施证据](2026-11-20-backtest-practical-implementation.md)。

## 授权与执行边界

2026-11-21 用户明确授权本批最多10次：编写、修改、探索各一次私有用途资格探针，七个业务样本各一次。原33次调用及其失败统计保持原值。沿用 `lmstudio` 的原生 Schema 路由、无凭证连接与模型 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，不变更目标 Provider 配置。

业务样本为 `count-confirmation`、`statistics-gap`、`captured-retest`、`timeframes-anchor`、`session-vwap-arithmetic`、`hfq-only-discovery`、`stop-only-policy`。前四例复用原自然语言，后三例分别覆盖会话均价嵌套算术与绝对值、仅后复权探索和仅加保护保持旧政策。

在实际 HTTP 发送前独立落盘占用额度；同一用途探针／业务样本不得再次发送，未知传输结果停止整批，资格失败停止该用途，不增加预算、不重采样。模型原文、编译诊断与编译定义独立保留。

## 入口与预检

新增 `apps/server/test/backtest/practical-v6-*` 验收夹具与定向测试，由既有登记的 `scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs` 选择 `BACKTEST_PLAN_SCENARIO=backtest-practical-v6`，仍通过 infra 正式维护锁和 `scripts/test-ai-provider-postgres.mjs` 创建、迁移和清理专属隔离库。目标业务数据只读。

发送前，七例均通过正式 V6 提示／请求合同预检，并先取得完整固定样本、生成实际 `dataScope`、物化 Parquet 和重复离线重放。模型候选只能从这些父窗口经正式冻结视图读取；越界窗口直接失败，无新行情读取。日线普通样本允许已冻结原价；小时／会话与专门仅后复权样本不宣称原价能力。模拟量明确声明自身口径，不视为真实供应商量字段证明。

预检日志 `var/acceptance/backtest-practical-20261120/t13-v6-preview8.log`：七例预检通过，实际模型发送0。此前预检失败保留，分别属于夹具价格维度、父窗裁剪、证据关联、量口径、分钟路由等问题；均发生在零真实请求阶段，不计为模型失败或产品缺陷。

预算防护测试3项通过，验证十次硬上限、禁止同例重试、未知传输停止及预览禁止联网。新增写集 lint 无错误；Server 最终类型检查、文件尺寸门禁与 `git diff --check` 通过。相关日志为 `t13-v6-budget1.log`、`t13-v6-lint1.log`、`t13-v6-types-final.log`、`t13-v6-size.log`。

## 实际执行

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。入口：`node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs <隔离回执目录>`，环境明确设置上述 scenario 和 `PRACTICAL_V6_MODEL_LIVE=1`，npm registry 使用工作区镜像；实际执行使用已安装 Node.js 24.22.2。

首轮 `t13-v6-live1.log` 在隔离脚本的等待时间参数检查时退出1，尚未创建隔离库或发送模型请求。保持已有120000～900000毫秒门限，恢复900000毫秒后启动新目录 `v6-live2`；不放宽门禁。实际调用以该目录 `call-ledger.json` 为唯一计数依据，原始请求、线协议最终输出、SDK回执及逐样本结果全部保存。

## 业务语义判据

| 样本 | 必须保留的含义 |
| --- | --- |
| count-confirmation | 五根中至少三根收阳；连续三根各自收盘严格大于各自同期EMA20；窗口含当根；普通退出恒假。 |
| statistics-gap | 总体标准差ddof=0、20期简单均线、60根带宽的20%线性分位数、带宽比较为不高于；abs(open/上一根close-1)严格小于2%。 |
| captured-retest | 突破此前20根最高时显式冻结该前高；后续十根首次超过冻结值102%才确认；跌回冻结价下失效；触发当根不确认，等待不更新capture。 |
| timeframes-anchor | 当前已完成且可见的日线与60分钟线各自close严格高于同期MA20／MA5；北京时间2026-03-02 15点锚定累计量大于该累计序列前一根日线值；不擅自给当前价格再加lag。 |
| session-vwap-arithmetic | 一分钟close除以当日累计VWAP、减1、取绝对值后严格小于1%；不能换成固定20根VWAP；普通退出恒假。 |
| hfq-only-discovery | 仅research坐标与比例投入，close严格高于MA20入场、严格低于MA20退出；原价缺失不阻断，也不增加量或固定份数要求。 |
| stop-only-policy | 保持旧普通策略上穿EMA20入、下穿EMA20出、权益20%、原费用与rising-edge；仅增首笔成交价下5%的收盘保护，下一可交易开盘退出。 |

全部样本不因零交易而误报数据不足；数据窗口、量口径与能力是否充足由正式校验判断。结果需区分合同／编译、正式创建／冻结执行与语义核对，不能相互替代。

## 结果

前3份完整业务回执已经逐项核对，语义通过0／3：

- `count-confirmation`：Schema与编译通过、隔离创建完成，冻结兼容检查拒绝。原始AST没有`open`或`countTrue`，将收阳数量改为`Highest(close,5) >= Lowest(close,5)+3`，并把权益20%近似成2000份。绝对价格检查拒绝该常量叠加符合合同，不能删除检查来迁就输出。
- `statistics-gap`：编译在一次回执汇总4项价格坐标错误。带宽写成标准差除以自身，没有MA20或60根20%分位数，另加60根持仓退出与固定100份；reason所述完整规则不能替代AST。
- `captured-retest`：正式创建及冻结Runner重复执行通过；模型显式capture与事件作用域正确，但把此前最高价写成`rolling.sum(high,20)`，并将权益20%改成固定金额0.2，因此业务验收失败。

以上均保留原始输出，不修补AST、不追加模型调用。最终结果见下表。


## 最终结算与原始回执重放

本批实际发送10次：3次用途探针全部通过，7次业务样本各一次。10份物理HTTP请求记录、10份最终线协议输出与调用账本对应，实际模型完全一致，无重试、无结果未知，剩余额度0。原33次历史事实独立保留；不将本批或离线重放回写为旧样本成功。

原15分钟测试等待不足以覆盖10个各最长5分钟请求。`test-ai-provider-postgres.mjs`只结束pnpm父进程，Vitest后代仍继续已授权样本，而隔离库已经清理，导致`hfq-only-discovery`与`stop-only-policy`首次创建失败。此为验收入口缺陷，不归咎于模型，不抹去首次失败。原批脚本退出1，完整测试最终记录1169秒。

随后通过同一正式锁／隔离数据库入口，以`PRACTICAL_V6_REPLAY_DIR=v6-live2`执行`v6-replay1`，退出0；此模式全局禁止HTTP，直接读取原始生成与原先父窗口。7份冻结输入逐字节一致，7份生成结果对象一致，模型调用0。三个候选完成正式创建与重复冻结Runner，其余四例按原错误阶段拒绝；该通过表示重放断言正确，不表示七例业务全部通过。

| 样本 | 原始／重放的技术结果 | 业务原意 |
| --- | --- | --- |
| count-confirmation | 创建后冻结兼容检查拒绝 | 未通过：收阳数量与仓位改变 |
| statistics-gap | 编译一次返回4项坐标错误 | 未通过：均线、分位数、仓位和退出改变 |
| captured-retest | 创建、冻结与重放完成 | 未通过：前高变为求和、仓位改变 |
| timeframes-anchor | 编译拒绝跨来源历史窗口 | 未通过：均线缺失、自己与自己交叉、增加序列与退出 |
| session-vwap-arithmetic | 正式编写校验拒绝coverage | 未通过：引用不存在的description；入场政策为while-flat |
| hfq-only-discovery | 首轮隔离库已关闭；零模型重放完成创建／冻结 | 未通过：MA20缺失、仓位及退出改变 |
| stop-only-policy | 首轮隔离库已关闭；零模型重放完成创建／冻结 | **通过**：仅增加5%保护，原政策与规则保持 |

最终业务原意1／7通过，6／7未通过。完整独立核对在`v6-semantic-review-final.json`，原批`v6-live2/receipt.json`和零调用`v6-replay1/receipt.json`都保留。

## 已修复的确定缺口及验证边界

1. V6正式探索原生模式只向模型展示合同名称，探针与编写却提供完整Schema。实际探索消息估算约三千输入token，探针约三万七千，亦与消息中是否包含Schema一致。补充Spec后，正式探索复用`buildGenerationSchemaPrompt`，在预算预留前加入同一完整合同，提示版本为`strategy-optimization-v19-visible-v6-schema`。这修复了确定的字段说明缺口；它是否使六例业务通过，仍需新的真实结果证明，不能声称已消除所有模型语义错误。
2. 普通隔离等待120000～900000毫秒保持；仅明确的V6十次模型文件及执行标志允许最多3300000毫秒，覆盖10×300000毫秒及准备开销，外层3360000毫秒。超时停止本次新建进程组后才清理数据库。两个Node定向测试证明期限边界和孙进程不能晚写，`t13-v6-process1.log`通过。
3. 旧空间的提示合同测试原先错误地使用“当前V6”Schema验证V5固定输出，现按旧空间选择保留的V5合同。原16,000字节文本预算也实际暴露16046字节，精简重复说明保持语义后恢复原门限，没有提高阈值或改旧Schema。
4. 原始通过历史、请求版本、原指纹、原检查时点和延迟恢复为3份私有资格缓存，正式`strictReadyContract`检查通过，HTTP调用0，`t13-v6-qualification-cache1.log`。缓存位于`v6-qualification-cache1`，不写真实Provider或伪造新的探针事实。

验证：提示／合同15项、预算防护4项、进程组2项、三用途资格恢复1项通过；六例后续输入的冻结预检通过且发送0。最终Server类型、lint、文件尺寸、边界及差异卫生通过。失败日志与修复后日志分别保留，不机械重跑无变化的其他包／浏览器／DSA验收。

## 实际写集与目标运行态

生产写集为`apps/server/src/strategy-optimization/strategy-optimization-prompt.ts`、`strategy-discovery-generation-prompt.ts`。验收写集为`apps/server/test/backtest/practical-v6-*`、`test/strategy-optimization/strategy-discovery-v6-visible-schema.test.ts`及旧空间提示测试的合同选择。隔离入口写集为`scripts/ai-provider-test-process.mjs`、对应Node测试、`scripts/test-ai-provider-postgres.mjs`及既有`run-backtest-trade-plan-acceptance.mjs`的V6／零调用重放分支。文档更新限于本Spec、Task与证据。

2026-11-21在`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`执行`./scripts/sync-code.sh thesis-ledger`，Node.js24.22.2，退出0（`t13-v6-sync1.log`）。正式兼容检查、宿主构建及Server／Worker健康均通过。镜像不变，不变更数据库结构或卷，仅更新可写层。随后`run-backtest-practical-readonly.mjs`对两容器各1432份编译JS逐项核对一致，各完成原股票冻结重放两次；`t13-v6-target1.json`、`t13-v6-target1.log`退出0。DSA与两端界面本批没有业务源码变更，复用此前相应证据。未提交、未推送。

## 未完成事项与下一批边界

T13g保持未通过，不归档。当前实现修复及可离线完成的检查、资格恢复和正式目标同步已完成；六份失败不能用程序重写AST或删除coverage后标成模型成功。

若用户追加授权，具体范围为上述六个未通过样本各一次，最多6次业务请求，0次新探针；复用原三份私有资格并先比较当前路由／配置，沿用原模型和原生Schema，仅写隔离库，不重跑已通过的stop-only-policy。保持同例禁止重试、结果未知／配置变化／资格失效即停止，不追加预算。六份新提示及冻结输入预检在`v6-recheck-preview1`，账本明确标为未授权提案，发送0；尚未执行此批。
