# 竞技场剩余任务执行与收尾

关联：[自主竞技场](../tasks/2026-11-12-autonomous-model-arena.md)、[回放任务 R4H5／R4H6](../tasks/2026-11-12-arena-replay-live.md)。日期：2026-11-24。用户要求完成其余任务，并取消第 3 次请求无回执原因确认；原未知结果不改写、不重试旧周期。新运行另经明确确认，最多 200 次共享请求／1 小时，模型与研究工具均计入；失败、截断或未知结果停止，不自动重试。ETF 归档检查／续验继续停止，现有门槛保持。

## ETF 修复目标同步

实际执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，正式命令 `./scripts/sync-code.sh thesis-ledger`，Node.js 24.22.2。北京时间 02:46:16.413 开始，02:47:03.735 结束，退出 0。脚本按原维护保护完成兼容预检、宿主构建、载荷同步及 Server／Worker 重载，两服务健康，镜像 ID 保持；没有数据库结构、依赖或外部卷变更。更新位于容器可写层，不表示镜像已更新。

完整命令、日志与时间回执保存在私有 `.recovery-artifacts/arena-finalization-20261124/sync-code-command.json`、`sync-code.log`。目标 Server／Worker 的执行读取器及新执行证据模块共 4 个编译文件与宿主 SHA-256 一致，见 `artifact-parity.json`。

目标 Server 编译模块经只读 `docker exec -i -w /app/apps/server … node --input-type=module` 消费已保存的 ETF 日历、分钟、快照及原异常：有快照返回 available，快照失败保留价格并返回稳定 `replay_rules_unavailable`，原 `invalid_union` 未进入研究结果。全部外网、数据库及模型端口被禁止，禁止尝试为 0；原始脚本与输出见 `target-etf-check.*`。

第一次目标断言因临时协议缺少必填 version、calendarId 等字段，在 Schema 阶段拒绝；未访问来源或业务。改为复用原完整协议后断言通过，首次输入错误输出单独保留，没有重试比赛或模型。

同步前后 11 张业务表内容摘要、115 条模型资格回执、原共享队列暂停归属和唯一旧待办保持。回执为 `guard-before.json`、`guard-after-sync.json`。目标模块断言通过且独立保护对账通过，R4H5 完成。

## G03 验收范围核对

现行主 Spec 的采样政策要求源码、隔离业务闭环和目标来源消费；真实模型准入、完整历史追平及远端 CI 独立持有。G03 不额外要求每个市场运行一次真实模型比赛或完成真实比赛成交。

继续复用[沪深港目标来源与业务闭环](2026-11-23-arena-sampled-deployment.md)、[六类账户隔离验收](2026-11-23-arena-sampled-policy-local.md)、[美股盘中来源及研究消费者](2026-11-24-arena-us-intraday.md)。旧严格制度缺口及原失败记录保持，本次不把它们扩展为采样政策的共同前提。依现行合同与上述相互独立证据完成范围对账，G03 的采样来源与隔离业务范围通过；完整历史／实时仍由 R4H6 持有。

## 新预算真实回放

新授权包位于私有目录 `authorization.json`。全市场、原 LM Studio 模型及参数、2026-11-02 起点、10 万 CNY 本金、现金基准及 sampled-v1 保持，仅使用新的 200 次共享额度和 3,600 秒维护时限。精确 v6 路由 `ready / passed`，配置指纹与原值一致。正式 plan 无业务操作通过。

实际执行目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`，命令为 `node ../thesis-ledger-infra/scripts/infra.mjs locked --idle -- node scripts/local-runtime/run-arena-scoped-replay.mjs apply .recovery-artifacts/arena-finalization-20261124/authorization.json .recovery-artifacts/arena-finalization-20261124/run`。北京时间 02:50:33.022—03:31:17.193，退出 1。仅创建并驱动新比赛 `13432f24-7477-4d28-9519-63473ea32bb9`，共享队列未恢复。

冻结的两轮周期及请求审计由只读 SQL 导出至 `cycles-after-stop.jsonl`，统计见 `audit-summary.json`：共 23 次共享请求，7 次模型、16 次研究工具，均有已知回执，剩余 177。第一轮 09:31 成功提交空委托观望和 09:45 预约；第二轮 09:45 在最后一次模型回复后失败。最后请求 `4501aa99-c7d4-44b4-991f-626b3aa0acac` 于 02:52:11.342 发出，03:31:17.042 返回，Provider 的 `finishReason=length`，错误为 `output_truncated`，最终正文 0 字符，报告输入 10,979／输出 120,093 tokens，其中 reasoning 109,950 tokens。周期按现有分类为 `model_output_invalid`；此次有明确截断回执，与前批无回执保持为两个独立事实，不推断前批原因。

比赛在已提交游标 11 月 2 日 09:44 停止；没有委托、成交或持仓，现金仍为 100,000 CNY，没有追平或进入实时。报价工具保留价格并返回简洁 `replay_rules_unavailable`，不再返回原 `invalid_union`；历史执行归档门槛保持，未续验。按授权在首次失败停止，不自动重试，不转移剩余额度。

入口原回执为 `pauseUnconfirmed=true`，保留原值。随后独立只读 SQL 及详情 HTTP 200 均确认新比赛 `paused`，参见 `pause-independent-sql.txt`、`match-after-stop.json`、`pause-confirmation.json`。原队列暂停归属、唯一旧待办 `0806ac74-d3f2-4130-a2bf-06301a93d896-1` 均保持，活动作业为 0。

`protected-replay-comparison.json` 核对 14 表全部原记录摘要，缺失／改写均为 0。新增仅为新比赛、账户、时间线各 1 条，周期 2 条；估值新增 253 条，其中新比赛 16 条，其余为原有后台估值追加，不认定为旧比赛研究或重试。提供方配置原行、115 条资格回执及 DSA 来源政策／历史／准入／提供方控制摘要保持。R4H6 已执行但业务验收不通过，R4H3／R4／T2d／T12.14 继续未完成。

## 远端 CI

三个现有 checkout 均保持，真实暂存区为空。执行开始时主仓有 1,227 个已修改或未跟踪路径，DSA 114 个、infra 7 个；CI 候选明确分离相关改动与无关工作，没有将当前目录整体发布。目标同步、真实业务与远端 CI 各按实际证据验收，不能互相替代。

## CI 候选隔离与实际检查

候选从当前 HEAD `1ed418780d1970e8380955453667edc2fed4b126` 构建，使用私有源码快照及隔离 Git index；没有新增 worktree、改写用户暂存区或发布全部未提交工作。通用 AI 文件仅投影竞技场改动，其他策略用途保留已提交版本。三次冻结请求在候选 SDK 上离线重建，实际序列化请求体 SHA-256 与原回执全部一致，模型／网络调用为 0。详细清单与源代码投影保存在私有 `ci-candidate-final.json`、`ci-source-overrides/`、`candidate.index`。

全量构建通过。独立候选最初的 Domain 871 项、Schemas 1,592 项、API client 274 项、Mobile 278 项及 DSA adapter 3 项通过。Server 全套首次为 4,642 通过、11 失败、524 跳过。最终保留的竞技场修复是：研究报价显式不申请买入结算、未设置周期时限不制造收盘期限、已有触发接口补 ai 成本登记；另修正路由测试中缺少的已有竞技场导航。

曾尝试修正其他基线的复盘可选参数、迁移清单及回测旧断言，定向 84 项通过；随后确认这些属于独立全仓范围，已撤回本次对它们的修改，原用户版本保持，未进入专用提交。尝试和撤回版本保存在 `*.before-ci-fix`、`*.deferred-ci-fix`。旧回测校验差异在完全还原已提交 HEAD 时同样复现：原 v3／v2 标签值为 `ed3ae2cf83259e36`／`f8467595af22acbf`，已提交基线独立结果为 `9e13119a0155b8fc`／`8e2cec7aab253ab5`。保留 `baseline-comparison.json`、`baseline-checksum.log` 及原失败，不将已撤回的修复认定为交付。

Typed ESLint 原 4 GiB 堆实际耗尽，专用竞技场工作流设置 Node 8 GiB 堆；原并行测试的 5 秒超时在单独两 worker 下 2.9 秒通过。专用测试逐包、每包两 worker，保留断言、原测试时限和代码门槛。原全仓工作流及根测试脚本保持用户版本；只撤回本次对它们的资源调整。

全仓 Desktop 基线检查发现 11 个失败文件（8 个失败用例及 3 个导入失败），涉及缺失的复盘辅助模块、风险表单测试上下文、毫秒输入、配色／导航／来源选项旧断言和列表操作列。范围选择未收到答复，按已告知默认完成竞技场定向远端 CI，全仓实际失败另列；其中竞技场导航旧断言已修正，其余没有在本次发布中修复。

新增 `.github/workflows/arena-acceptance.yml`，覆盖全量构建、共享领域／合同／API、竞技场／Market／AI 传输、两端竞技场消费者、Mobile、限定回放入口、边界／依赖／尺寸／Lint 及凭证扫描；禁止真实模型与业务数据库访问。限定入口使用已提交 infra `8fdd51b51933614f019216066e1b15016d44c9dc`，本地 20 项通过；候选 Lint（9 组、3,959 文件）、其他门禁和 6,816 文件凭证扫描通过。

专用提交 `0be26edf2574f9974c857bc202efb3b51192e109` 包含 142 个相关路径，分支 `codex/arena-finalization-20261124`；主 main HEAD 和真实索引不变。首次 push 因默认 OAuth 缺少 workflow 权限拒绝；随后仅本命令使用已有 gh 登录凭据成功，未修改全局认证配置。

首轮 [Arena acceptance](https://github.com/yzin-17/thesis-ledger/actions/runs/45252246550) 的构建、共享包和服务端相关测试通过（服务端 2,273 通过／206 跳过）；客户端因 Agent 重复加入一条竞技场导航预期而失败。该错误已纠正，主工作区路由测试恢复本轮修改前的用户内容。修正后本地相同命令 Desktop 53 项、Mobile 278 项通过；仅该测试一文件追加提交 `ceb5db239d66458cbc1a232fdea5032f3bed9443` 并推送。原失败回执保存在 `remote-ci-first.json`，不覆盖失败结果。[第二轮检查](https://github.com/yzin-17/thesis-ledger/actions/runs/45253954895) 在提交 `ceb5db239d66458cbc1a232fdea5032f3bed9443` 上全部成功，北京时间 03:55:30 创建，04:07:56 完成；所有工作流步骤通过，退出 0。远端 Domain 871、Schemas 1,592（5 跳过）、API client 274、Server 2,273（206 跳过）、Desktop 53、Mobile 278 项通过；限定入口及全部代码门禁、凭证扫描通过。Lint 为 9 组／3,959 文件。原需隔离数据库等环境的跳过用例不认定为本次执行通过，继续复用已有独立隔离验收。实际提交、步骤与日志摘要见 `remote-ci-final.json`、`remote-ci-log-summary.md`；R4H7 的竞技场定向远端范围完成，未宣称全仓原测试通过。

## 触发接口成本登记的目标核对

竞技场现存 `POST /api/v1/arena-matches/:id/agents/:agentId/trigger` 补登记 `ai` 成本，未改变其他接口额度。正式 `./scripts/sync-code.sh thesis-ledger` 于北京时间 03:50:02.384—03:50:41.854 执行，目录仍为 infra，退出 0；Server／Worker 健康、镜像保持，未改数据库或卷。日志与回执见 `sync-rate-policy.*`。

两容器只读消费编译模块，实际路径返回 `cost=ai`；该文件及 ETF 两个相关模块共 6 个产物与宿主 SHA-256 一致，见 `target-final-artifact-policy.json`。同步前后 11 张业务表摘要、115 条资格记录及队列保护完全一致，DSA 来源控制摘要与运行前基线一致，见 `guard-after-replay.json`、`guard-final.json`、`source-control-after.json`。本次没有新增模型请求或比赛操作。

## 本次截断的离线排查

用户要求只用本次保存的请求与回执排查，不调用模型、不重试比赛。检查对象是本比赛两轮研究中的 7 次模型请求，最后请求为 `4501aa99-c7d4-44b4-991f-626b3aa0acac`；不追查前批未知调用。私有材料位于 `.recovery-artifacts/arena-truncation-diagnosis-20261124/`：`frozen-input.json` 固定已保存输入和同版本提供方配置，`analysis.json`／`request-comparison.json` 保存比较结果，`wire/` 保存离线重建的请求，原周期与回执未修改。

直接证据是最后请求约耗时 39 分 5.7 秒，Provider 报告 `finishReason=length`，应用分类 `output_truncated`，最终正文 0 字符。报告输入 10,979、输出 120,093 tokens，其中 reasoning 为 109,950 tokens，占报告输出约 91.55%；兼容适配器直接读取 Provider 的用量字段，没有把预留估算替代实际用量。输入与输出之和恰好为 131,072。这最符合生成期间耗尽 131,072 tokens 总窗口的解释；回执没有保存上游加载时的上下文长度或更细停止原因，因此总窗口耗尽是强推断，不伪称已直接读到 LM Studio 的上下文配置。

思考输出诊断记录 326,688 字符、完整 SHA-256，以及前 65,536 字符的有界重复统计：同一行（去空白后至少 8 字符）最多 70 次，同一段落（至少 32 字符）最多 22 次。源码在终止时计算这些统计，且明确不归档思考正文；故可以确认出现大量重复思考，不能还原它具体在反复推敲什么。`reasoningOutput.repetition.truncated=true` 只表示统计采样窗口有限；另一个 `diagnostic.truncated=false` 表示诊断预览未截短，均不能取代 `finishReason=length` 的生成终止含义。

请求记录的 `maxInputTokens`、`maxOutputTokens` 与 `effectiveOutput` 均为 null。`reservedInput=36880` 是 UTF-8 字节保守预留，不是实际输入 tokens，也不是输出上限。实际调用装配在输出上限为 null 时不设置 `maxOutputTokens`，SDK 同样不默认补应用上限。使用保存的 v6 路由配置、完整消息和当前已构建 SDK 做离线序列化：`analyze.mjs` 将所有真实 fetch 禁止，并让自定义传输在本地返回固定 400；7 个请求各捕获一次，网络尝试、模型、数据库及比赛操作均为 0，全部断言通过。重建请求均只有 model、messages、response_format，没有 `max_tokens`／`max_completion_tokens`／`max_output_tokens`，也没有显式 reasoning 开关、强度或预算。没有发现应用把上限意外压小的路径。此处是保存输入的离线重建，不冒充本次原始 HTTP 线包。

7 次请求的系统提示与 Schema 摘要全部相同；前 6 次正常结束，输出 231～1,761 tokens，耗时约 6.2～36.9 秒。失败请求实际输入 10,979 tokens，低于此前成功请求最大 15,575；输入不存在原 `invalid_union` 异常。第一轮在同样执行资格不可用时已正常提交空委托观望，说明现行合同存在合法终止路径。最后输入中两个 ETF 只有各一根已结束的 15 分钟 K 线，RSI 值均为 null，执行资格仍为简洁 `replay_rules_unavailable`。这可能构成模型反复推敲的上下文，但已保存统计不能证明它就是触发原因；不把这个假设改成新数据门禁或自动追加外部核验。

结论：本次直接问题是模型出现大量重复思考、未产出最终正文，随后以长度原因终止；强证据指向耗尽上游总窗口。ETF 异常污染输入的修复已生效，但它并未证明模型思考退化得到解决。增加共享请求次数不会改变这一单次生成行为。具体重复语义及上游细分停止条件未确认；本次排查在现有证据边界收口，不修改模型参数、提示词、来源或路由，不新增模型调用或比赛重试。原失败与完整历史／实时未通过状态保持。

## 最终一致性结论

R4H4／R4H5 的修复、目标同步、实际样本断言及保护审计通过；G03 按现行采样合同复用三市场来源和隔离业务证据通过；R4H7 的专用竞技场远端 CI 通过。main 仍为 `1ed418780d1970e8380955453667edc2fed4b126`，真实暂存区为空，其他修改保持，未合并专用分支。两份活动 Task 的当前摘要、叶状态与本记录已对账，128 个本地文档链接有效。

完整历史追平与同账户实时业务尚未通过：R4H6 已按新授权执行，在明确截断后停止；R4H3／R4／T2d／T12.14 不勾选，任务不归档。ETF 归档续验维持用户停止决定及原门槛，前批未知原因确认已取消。全仓基线测试的失败独立保留，未因定向 CI 成功改写。原失败、未知审计和首次 CI 失败均保持。本轮执行结束，不追加模型或比赛重试。
