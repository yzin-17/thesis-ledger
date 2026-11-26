# 策略交叉方向真实 AI 验收证据

关联[规格](../../specs/2026-11-15-strategy-cross-live-ai-validation.md)与[归档任务](../tasks/2026-11-15-strategy-cross-live-ai-validation.md)。

## 当前结论

首次通过正式策略编写 API 执行真实 AI 调用，但到达编写入口的 120 秒总时长上限后，未取得完整响应。首次没有生成可验证定义，没有发布新版本或创建新回测。

用户随后明确授权调整时限并使用同一模型重试一次。共享编写总时长已调整为 300 秒，本地验证与正式快更通过。唯一一次追加生成成功，AST 方向正确，已原样发布为 v3。旧冻结窗口被路由修订门禁拦截后，用户另行授权重新冻结同一区间，新正式回测成功；23 笔信号成交与 6 笔风险退出全部独立核验通过。模拟收益为 -17.6660%，方向正确不代表策略盈利。

## 实际输入与调用事实

宿主入口：`node scripts/local-runtime/strategy-cross-live-ai.mjs --receipt /tmp/strategy-cross-live-ai-20261115.json --apply`，退出码 1。失败报告保存在该绝对路径，完整操作与调用事实保存在服务端。

| 项目 | 实际记录 |
| --- | --- |
| Provider | `lmstudio` |
| 模型 | `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m` |
| 合同／模式 | `strategy_authoring_generation` / `authoring-generation-v3` / `native_schema` |
| 提示版本 | `authoring-prompt-v11` |
| 草稿 | `396c1506-3edc-44b6-b9c2-a493289e1741` |
| 生成操作 | `bb3516ea-610f-4d5d-b730-f9e8fa43f179` |
| 调用 requestId | `d0e9ba45-ab52-4968-b108-26c0da92426b` |
| dispatching 时间 | 2026-11-15 18:34:53.471，Asia/Shanghai |
| unknown 时间 | 2026-11-15 18:36:53.477，Asia/Shanghai |
| 实际尝试／调用记录 | 1 / 1 |
| 调用失败码 | `AUTHORING_PROVIDER_COMPLETION_TIMEOUT` |
| 操作终态／结果 | `failed` / `AUTHORING_RESULT_UNKNOWN` / `externalResult=unknown` |
| 输出、用量、费用 | `outputText=null`；用量与费用未知，不能记为实际费用零 |

用户需求文本如下，未提供旧策略 AST，未提示交叉操作数或方向字段：

> 腾讯控股（00700.HK）日线趋势策略：收盘价上穿20日指数移动平均线时买入，下穿同一均线时卖出。每次投入研究权益的50%，固定止损3%，最多持有10个交易周期。信号后在下一可交易日开盘执行，佣金率和滑点率均为0。价格与均线使用后复权序列，不增加其他交易条件或交易计划。

结构化确认复用原 v2 的标的、周期、仓位、风险、执行与费用；原定义没有交给模型。草稿需求清单由本次已明确的需求建立，不额外消耗一次 AI 分析调用。

## 超时定位与边界

- 首次调用时 `packages/schemas/src/strategy-authoring-definition.ts` 的 `AUTHORING_LIMITS.deadlineMs=120_000`；追加授权后调整为 `300_000`。
- `authoring-attempt.ts` 将剩余总时长传入 SDK 的 `timeout.totalMs`，并以该剩余时长建立取消信号。
- 当前生成用途的首输出时限为 120 秒、输出空闲时限为 60 秒。仅增加宿主脚本的轮询时间，不能延长服务端操作生命周期。
- 只读检查确认本地模型服务可访问、模型已加载；其他现有 Provider 没有就绪的策略编写生成用途。配置中的历史验证通过不代表本次业务请求完成。
- 服务端超时后的上游结果未知，未声称模型一定停止、一定没生成或生成方向错误。没有为诊断另发模型测试请求。

## 原记录保护

执行开始时的原策略、5 条版本记录（其中正式版本为 v1、v2）、11 条回测，以及原关联实验、候选、尝试和 AiRun，执行前后逐记录摘要全部一致。`originalRecordsPreserved=true`。

原策略摘要：`c226a32b1580920869f86436fd0cf7817a799cc2c4ffb78dc11ccc90d030c459`。

关联实验等记录摘要：`8de79f4c77dce50860aa87f22df3dd2c883c5936fb66a966859a5919034276db`。

首次写入仅为上述草稿、生成操作和该操作的一次调用审计，失败样本继续保留。授权追加生成另建草稿、操作及 v3。没有账本或真实交易写入。

## 本地工具验证

- `node --test scripts/local-runtime/strategy-cross-live-preparation.test.mjs scripts/local-runtime/strategy-cross-live-verification.test.mjs`：最终 7 项通过，覆盖数学方向、EMA20、成交时点／价格、空计划、风险条件、重新冻结参数保护与逐行差异分类。新增风险测试的首版样本曾因未形成第二次上穿失败，修正样本后通过；没有据此修改产品逻辑或 AI 输出。
- `node --check scripts/local-runtime/strategy-cross-live-ai.mjs`：通过。
- 已取得真实模型定义并通过正式 API 保存 v3；按后续授权重新冻结后，正式回测与真实逐笔验证分支均已通过。

## 后续执行约束

已取得额外时限调整确认，先修订对应生命周期合同并做定向验证，再通过正式部署入口更新运行态；保持原失败操作与所有旧版本、回测不变。新尝试建立独立操作与 `/tmp/strategy-cross-live-ai-retry-20261115.json` 报告，不复写原报告或将原失败操作改为成功。

新增 `authoring-deadline.test.ts` 两项测试：操作已运行 130 秒时仍可向 SDK 传递约 170 秒剩余预算，运行 310 秒时拒绝派发并保持未发送结果。现有编写错误分类、操作仓库、语义、提示词及交叉语义定向测试 36 项继续通过；宿主工具 3 项测试和语法检查通过，schemas／Server 本地构建通过。首输出／空闲超时、60 秒租约、token 上限与重投次数未改动。

首次运行态更新：执行目录为相邻 `thesis-ledger-infra`，命令 `./scripts/sync-code.sh thesis-ledger`；兼容性预检与宿主构建通过，替换两端产物后，Server 在 120 秒内未通过健康检查，脚本退出码 1。正式脚本自动使用原镜像重建目标容器，Server／Worker 均恢复健康；没有执行数据库结构或外部卷操作。独立读取两端共享常量均为 `120000`，故不能声称新时限已部署。

首次被回退容器的启动日志随重建消失，尚未确定健康失败根因；第二次调用相同正式脚本时增加并行只读 `docker logs --follow` 观察，在回退前保留启动异常。观察本身不更新容器、配置或数据库，所有部署变更仍由原正式入口执行。

第二次相同入口退出码 0，Server／Worker 均健康，镜像 ID 保持不变；启动观察没有发现异常。期间一次检查发现 Server 的 Docker 健康探针超过其 3 秒上限，随后健康收敛，没有修改探针阈值或绕过检查。首次健康未收敛的具体原因没有得到确定证据，不归因于总时长常量或宣称修复了健康检查。

独立读取实际 Server／Worker 的 `AUTHORING_LIMITS`：`deadlineMs=300000`、`leaseMs=60000`、`maxRedeliveries=2`。两端实际 PID 1 均执行 `apps/server/dist/src` 下的对应入口。快更只更新可写层，不能作为镜像已更新或正式发布证据。

## 追加尝试的实际前提

共享工作区的并行交易计划任务已将当前合同推进至 `authoring-generation-v4`，提示词也为后续版本。快更刚结束时，原 v3 路由因 `adapter_contract_evidence_missing` 被正常阻止；本任务没有绕过该门禁。

随后只读核对发现并行任务已更新 Provider 配置（2026-11-15 19:04:09.084，Asia/Shanghai），v4 编写生成用途当前 ready、实际验证 passed，资格 requestId 为 `66b42918-880d-4da1-9a82-f0da36962069`，验证时间为 19:03:21.826。正式 `/ai/providers/validation-plan` 预览返回 `pending=[]`、`maxCalls=0`；本任务没有执行配置保存或增加资格验证调用。此处复用现有就绪事实，不把并行任务的调用计为本次生成样本。

追加业务调用使用同一 `lmstudio` Provider 与同一模型，草稿 `63b5c9da-a42d-41ec-8602-52ac3671006c`，操作 `849b83bf-1923-42ed-98e7-17482d7f8043`。因合同／提示词也随并行工作更新，这不是仅变更时限的配对模型性能实验；本任务仍按 AST、冻结回测和逐笔成交验收本次生成方向。

当前正式新增版本接口会把 `source` 记为 `manual`。若后续用该接口原样发布 AI 定义，必须以持久化 AI 操作、原始输出和定义摘要关联证明来源，不能伪造来源字段或声称接口已有自动来源关联。

## 追加生成成功与原样发布

追加操作终态为 `succeeded`，`externalResult=received`，attempt 为 1，仅一条实际调用记录。实际模型与指定模型一致，合同为 `authoring-generation-v4`，提示为 `authoring-prompt-v13`。requestId 为 `7191c9ef-295c-4fd5-9a15-1714e9151aec`，派发时间为 2026-11-15 19:08:39.638，收到时间为 19:09:46.749，均为 Asia/Shanghai。实际用量为输入 5066、输出 3733 token；费用为配置定价的估算 USD 0，不认证实际收费为零。

AST 数学含义：entry 为 `close(source1) above EMA(close(source1),20)`，exit 为同一左、右操作数的 `below`。仓位为 0.5，固定止损 0.03，最多持有 10 个周期；日线、后复权研究坐标、下一可执行 K 线开盘、零佣金／滑点均符合需求。

模型另外输出 `tradePlan={version:1,evaluation:'barClose',stages:[]}`。最初宿主核验过严，将空计划判为额外动作而暂停。读取引擎实现确认空 stages 没有动作后，修正工具为仅接受这个无动作的空计划，并增加接受空计划／拒绝额外动作的测试；AI 输出保持原样，没有再次生成。该宿主核验失败保存在报告的 `verificationHistory`。

正式新增版本为 v3 `893ddc7e-1e8e-4f4d-a4a5-6668d340b097`。原始 AI 输出经公共 schema 解析所得定义与正式版本的规范化摘要均为 `56fb0119bcf1bd43aef562eefb918f411a3a53e4d083b536edbd3521a0ab305a`。接口来源字段实际为 `manual`，真实 AI 来源通过上述持久化操作、原始输出和摘要关联证明。

只读结构比较确认：排除名称、说明、来源引用名和空计划，并将公共十进制表达统一后，新 AI 定义的交易条件及参数与已修正的 v2 相同。后续实际运行发现，空计划虽然没有阶段动作，仍会启用计划执行分支，影响仓位计算参考价；因此上述结构比较不能证明两个定义的完整执行行为等价。具体差异见后文。

## 冻结回测阻塞

第一次提交复用旧准备凭证，正式创建接口返回 `409 PREPARATION_STALE`，未创建回测。发现 AI 自主命名的信号为 `source1`，旧配置绑定为 `discovery-primary`，因此只将新 RunConfig 中的信号引用名绑定至新定义；不修改 AI 定义，也不改变行情、日期、资金和执行模型。

随后通过正式 `/backtests/run-config/preflight` 重新读取当前准备凭证。2026-11-15 19:15:02.117 的预检为 `blocked`，诊断 `DATA_UNAVAILABLE`／`readyExecutionRouteTarget`／`policy_mismatch`。当前 Desired／Effective 均为 200，Catalog 为 `3175945065355000`；旧冻结事实的 Desired／Effective 均为 199，目标均为 `futu/futu`、routeIndex 0。`MarketFrozenWindowReaderV3` 要求当前路由修订与冻结事实修订一致，因此拒绝复用旧窗口；这不代表行情已经重新取过或买卖方向核验失败。

当时没有手写新凭证、回退路由、启用来源或放宽冻结门禁；新回测 ID 尚不存在。用户随后明确回复“允许重新冻结并回测”，按以下边界继续，原拦截证据保留。

## 重新冻结与正式回测通过

执行入口为 `node scripts/local-runtime/strategy-cross-live-ai.mjs --receipt /tmp/strategy-cross-live-ai-retry-20261115.json --retry-from /tmp/strategy-cross-live-ai-20261115.json --apply --resume --refreeze`。恢复使用已有成功操作和 v3；此阶段没有新增 AI 调用、草稿或版本。

正式 `/backtests/run-config/prepare` 返回 prepared，随后 `/backtests/run-config/preflight` 返回 ready。富途来源仍为 `futu/futu`、routeIndex 0，Desired／Effective 均为 200。历史区间仍为 2025-11-12 至 2026-11-12，含预热的行情区间为 2025-09-19 至 2026-11-12。资金 HKD 100000、执行模型、50% 目标投入、3% 止损、10 周期限制、佣金和滑点均保持原参数。新冻结时点为 2026-11-15 19:23:39.055，Asia/Shanghai。

| 项目 | 实际结果 |
| --- | --- |
| 正式版本 | v3 `893ddc7e-1e8e-4f4d-a4a5-6668d340b097` |
| 新回测 | `9c7efea9-9242-494b-8bec-cef825ed4b1d` |
| 终态／完成时间 | succeeded；2026-11-15 19:23:46.393，Asia/Shanghai |
| 模拟收益／最大回撤幅度 | -17.66600462%／17.66600462% |
| 已平仓交易／成交笔数 | 14／29，期末仍有一次未平仓持有 |
| 信号成交 | 买入 15，信号卖出 8，合计 23 |
| 风险退出 | 3% 固定止损 4，10 周期持有上限 2 |
| 新可比数据指纹 | `8bd11e820a65fd17839451ff6dc5c707866268e020124e6392d9872df5c136cb` |
| 原可比数据指纹 | `bf8e43d6bd205706d30606ad267f85855fd002f399549659dc1649ccf5dc8237` |

逐行比较 282 根冻结行情：无新增或缺失日期，open／high／low／close／volume／amount 全部一致。每行变化的仅有 `availableAt`、`effectivePolicyRevision` 和 `inputFingerprint`，各 282 行；因此完整行与可比数据指纹不同，不能称为同一冻结输入。原始逐行差异保存在宿主报告 `frozenRowsComparison`。

独立核验以香港交易日期对齐，前 20 个收盘价均值预热 EMA，再使用 2/21 平滑系数逐日重算。全部 23 笔信号成交均满足前一交易日价格与 EMA20 的正确交叉，全部 29 笔成交价等于其成交日开盘价。风险退出单独验证信号日收盘价不高于入场价的 97%，或已完成 10 个持有周期，不要求出现反向交叉。

| 样本 | 信号日 | 成交日 | 交叉前差值 | 交叉后差值 | 成交价 |
| --- | --- | --- | --- | --- | --- |
| 买入 | 2025-12-12 | 2025-12-15 | -78.22141042 | 0.39015091 | 3386.532691239 |
| 信号卖出 | 2025-12-15 | 2025-12-16 | 0.39015091 | -63.44733332 | 3367.547573689 |

风险退出日期及分类：2026-03-12、06-04、06-17、09-25 为固定止损；07-21、08-13 为持有 10 周期退出。全部独立核验明细保存在宿主报告 `fillVerification.evidence`，正式成交记录保存在上述新回测。

## 收益差异与验收边界

与旧修正 v2 相比，29 笔成交的日期、方向、原因和价格全部一致，数量不同。旧 v2 收益为 -17.51265988%，新 v3 为 -17.66600462%。数量差异可追溯至 `apps/server/src/backtest/backtest-exchange-sizing.ts`：存在 tradePlan 时用信号日可见收盘价定数量；没有 tradePlan 时使用下一可执行开盘价。AI 返回的空计划仍会启用前者，不能将 stages 为空解释为整个执行行为完全无变化。

首笔实例：信号日收盘价 3440.775884239，新数量为 `50000 / 3440.775884239 = 14.531606149947936...`，开盘按 3386.532691239 成交，名义投入约 HKD 49211.76；旧数量为 `50000 / 3386.532691239 = 14.764363600962893...`。两者均保留 sizing 参数 0.5，但参考价及实际投入不同。本任务保留模型原始空计划，未删除字段后将修改结果宣称为真实 AI 原样成功。

最终旧策略、起始 5 条版本与 11 条回测，以及关联实验／候选／尝试／AiRun 的摘要全部一致；首次超时操作与调用事实也一致，`originalRecordsPreserved=true`、`failedOperationPreserved=true`。本次最终新增一条正式 v3 和一条成功回测。当前运行仍提示上市日期未知、公共收费源和真实停复牌源不可用，沿用明确的普通研究假设；没有认证真实成交或完整市场规则回测。

最终一致性复核确认：AI 原始定义摘要与当前正式 v3 相符；合同／提示词变化、原超时、旧冻结拦截、新冻结事实及空计划的数量差异均保留。局部工具 7 项通过，语法和本轮文档链接／差异卫生检查通过；宿主工具变更无需重新部署，不重复执行此前已通过且输入未变的服务端构建与高成本检查。
