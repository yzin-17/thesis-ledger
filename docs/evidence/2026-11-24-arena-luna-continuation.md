# Luna 后续运行准备与执行记录

## 当前结论

本轮列出的 Luna 正式接入、完整历史追平和同账户实时验收均已完成。比赛 `b2ebfb41-9d9d-4e1f-89f1-b07e673715d7` 从 2026-11-02 开始，805 个成功历史周期覆盖 17 个交易日；2026-11-24 19:02（Asia/Shanghai）追平并完成一次实际实时研究和完整估值。独立 API 200 与只读 SQL 确认 `paused / live / ready`，保持同一账户、现金和预算。

本场模型保持观望，现金与净值均为 100,000 CNY、零委托／成交；本轮不将观望验收描述为新成交验收，买卖、结算及再投资沿用已有隔离与目标证据。ETF 归档续验按用户选择保持停止，程序门槛保持。

本批累计 7,099 次共享请求：模型尝试 2,561（含两次准入及 13 次用量未知尝试）、研究工具 4,538。已知配置估算 2.4964315 USD，未知费用预留 0.149642 USD；预算账面含逐次取整及两次准入合计 2.6471977 USD，均低于明确授权的 20,000 次／6 小时／10 USD。未知记录不改写、不退款，不把估算称为账单确认。

38 项定向检查通过。原业务记录保留，提供方仅本轮获准的 OpenAI 配置变化，原队列归属和一条旧待办保留；36 条本批新终态投递经登记入口清理。代理规则与原文件摘要均未变化，没有目标部署／重启、提交或推送。本次新增维护代码的证据是本地检查与实际目标运行，原远端 CI 仍保持其原候选范围。

## 正式配置候选

在现有 `openai-arena` 内追加 `gpt-6-luna`，保持 Astra、既有密钥和其他提供方不变；只增加目标服务实际部署的 `arena_live_research / arena-live-research-v6` 用途，使用 `json_mode`。标准价格为每千输入 tokens 0.0001 USD、每千输出 tokens 0.0005 USD。复用现有加密凭据，不新增密钥文件。

正式只读 `POST /api/v1/ai/providers/validation-plan` 返回：仅 Luna 待准入、最多一次调用、每次输出上限 8,192 tokens、时限 600 秒、估算上限 0.0083692 USD。计划指纹为 `1145ed4d8ef4ed4e15256c9db5b051c617c8d06a651638f94622a829e203bc89`。该计划不等于准入通过；现有程序要求的单次准入计入本批预算，不额外运行保存样本的对照。

## 维护命令修复

修改 `scripts/local-runtime/run-arena-scoped-replay.mjs` 与对应测试，保留现有正式持锁入口及新比赛范围。

1. 付费用途公开摘要不带运行预算，可能仅有 `budget_not_authorized`。宿主允许这一单独原因继续检查明确的执行包；容器仍在每次生成前以 `budgetAuthorized: true` 执行严格用途与准入指纹核验。其他拒绝原因、失败准入或指纹变化仍停止。
2. 本地并行具名 V1 改动已使宿主 Schema 的协议版本成为 `arena-live-match-protocol-v1`，目标仍为数值 `2`。维护命令只读装载目标 Schema，按目标实际合同解析协议和查找研究用途；不部署并行改动、不转换旧记录、不改写新比赛的协议。创建后的正式 API 读回仍需具有相同规范化协议指纹。
3. 预览允许显式待准入的空指纹，输出 `admissionPending: true`；实际执行继续强制要求真实精确指纹和授权，不用占位字符串冒充准入。

## 本地与目标只读结果

执行目录均为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`，Node 为 `/Users/yzin/.volta/tools/image/node/24.22.2/bin/node`。

| 检查 | 结果与范围 |
| --- | --- |
| `node --test scripts/local-runtime/arena-scoped-replay.test.mjs` | 23／23 通过。覆盖付费单原因放行与其他原因拒绝、目标解析注入、待准入预览拒绝执行，以及原有范围／预算／失败停止。 |
| 两个修改文件的 `node --check` | 均退出 0。 |
| `node scripts/local-runtime/run-arena-scoped-replay.mjs plan .recovery-artifacts/arena-luna-continuation-20261124/run-draft.json` | 退出 0；目标协议 `2`、研究用途 v6、Luna、CNY 账户与 USD 费用预算分别保留；`executionAuthorized: false`、`admissionPending: true`，比赛与模型操作为零。 |
| 原保护快照只读检查，2026-11-24 15:58:01（Asia/Shanghai） | 原共享队列暂停与归属保持、active 0、旧 waiting 1；资格记录 117，其他研究／编写／回测活动为零。原队列中一条待办仍由原暂停保护，不领取。 |

私有候选、正式计划、目标协议、预览和检查日志位于 `.recovery-artifacts/arena-luna-continuation-20261124/`。源码仍未提交；未执行部署、重启、来源修改、提交或推送。

## 一次正式准入的实际结果

2026-11-24 16:19:19.900—16:19:25.164（Asia/Shanghai），执行目录为上述主仓，复用已有加密凭据，经正式 `POST /api/v1/ai/providers/test-and-save` 执行一个用途、一个调用；`allowTextFallback: false`、`stopOnFirstFailure: true`，未追加输出模式、模型或比赛重试。

| 项目 | 实际结果 |
| --- | --- |
| 操作 ID | `fbdce9d0-c692-4545-87e6-0d32d53a81d7` |
| 请求 ID | `153c7eab-479c-4a1a-b5d5-d81f2da54fe1` |
| 配置指纹 | `81573848a10423f6fa72bebb914d8b652c85b95bbe8023f2c01ec14b8b3e4aff` |
| 返回 | HTTP 400；`gpt-6-luna / arena_live_research` 回复未通过解析或合同校验，原配置未修改。 |
| 用量与时间 | reported 输入 5,536／输出 121 tokens，5,264 ms。 |
| 费用 | 配置估算 0.0006141 USD，不是提供方账单确认。 |
| 保存与运行 | OpenAI 提供方版本仍为 `2026-11-24T06:39:21.336Z`，模型仍只有 Astra；Luna 未保存，没有新比赛、研究周期或委托。 |

正式日志增加 pending／failed 两条用途记录，117→119，两条对应同一个请求，不能计为两次生成。资格日志只保存错误类别、用量和费用，不保存模型原始正文或 Schema 问题路径；目标对应时间窗口也没有匹配的正文日志。现阶段不能确定具体错误字段，不推断截断、重复思考或模型智力。已从未变化的目标源码重建该探针的两条消息留档，明确标记为重建，不冒充实际 HTTP 请求捕获或恢复原始模型回复。

私有回执：`provider-save-intent.json`、`provider-save-failure.json`、`validation-receipts-after.jsonl`、`provider-after-stopped.json`、`probe-request-reconstruction.json`，均位于上述私有目录。`batch-authorization.json` 记录本轮独立上限及依据；首次失败后已停止，剩余 1,999 次不自动续用。

## 实时衔接源码与检查

新增 `scripts/local-runtime/arena-scoped-live-runtime.mjs`，复用目标现有 Market 读取器、研究工具和执行／估值读取器，不启动 Nest 生命周期、后台轮询或队列。回放输入继续交给原历史工具；只有实时输入才访问当前读取器。

`completeLiveCycle: true` 显式开启后，在同一新比赛实际追平后使用现有单比赛触发、预约和领取入口安排一次实时周期；只认本次周期的成功提交。随后复用原委托到期、开市撮合与估值服务，要求估值结果完整，再保存交界前后同一账户与预算快照并暂停。默认回放到 live 即暂停的行为保持。该流程没有实跑，不声称当前资料或成交就绪。

最新 `node --test scripts/local-runtime/arena-scoped-replay.test.mjs` 为 29／29 通过：新增实时成功提交、交界预算耗尽、未形成待办、失败或未提交、其他成功周期冒认、账户结果失败等情形；原有 23 项保持。五个相关脚本 `node --check` 退出 0。目标容器只读装配确认当前 Market、报价、执行、估值和工具函数均存在；没有真实模型或业务查询。源码检查范围与摘要留在 `live-local-checks.json`，测试输出留在 `live-scoped-tests.log`，目标装配在 `live-assembly.log`。

源码未提交；本批未执行目标同步、重启、来源／路由修改、提交或推送。正式 API 保存失败，不能描述为配置已完成。

## 保护核对与未完成边界

前后 14 表逐行摘要核对通过：原记录全部保持；`ArenaLiveValuation` 自然追加 10 条单独列出，其余 13 表无新增、删除或修改，包含原 7 条 `ProviderConfig`。比赛 6、研究周期 89、模型账户 6 均未变化。结束快照确认共享队列仍由原归属暂停、active 0、旧 waiting 1，其他活动研究／编写／回测保持为零。

完整历史追平和同账户实时业务仍未验收。R4H14 的准入失败阻止本批进入 R4H16；R4H17 仅源码、受控与装配检查通过。首次失败停止后不继续模型调用或比赛操作，不续用旧批次或本批余额。ETF 归档续验继续停止，现有程序门槛保持。

## 用户要求继续后的正式执行

用户随后明确要求“完成全部，不要停下来”，继续本批总上限，保留前次失败。新增并登记 `scripts/local-runtime/run-arena-luna-admission.mjs`，通过现有正式保存服务执行单次用途准入，并在私有回执保留 SDK 结果／错误事实；不改探针、Schema 或输出模式，不伪造准入。

执行目录为主仓，正式命令为 `node ../thesis-ledger-infra/scripts/infra.mjs locked --idle -- node scripts/local-runtime/run-arena-luna-admission.mjs <单次授权包> <私有回执>`；退出 0。输入 5,536／输出 60 tokens、配置估算 0.0005836 USD，准入通过且配置保存，API 独立读回通过。首次失败加本次成功共两次模型调用，累计估算 0.0011977 USD。候选及回执位于原私有目录 `admission-continued-*`、`provider-readback-passed.json`。

同目录以正式已登记回放入口持锁执行 `run-arena-scoped-replay.mjs apply execution-packet.json run`，新比赛 `34e97439-1492-46e8-ad0c-5711249d2cc8`，Luna／全市场／11 月 2 日起／10 万元／现金基准。比赛上限 1,998 次共享请求、1.99 USD，时限 2,065 秒，已扣除本批首次真实调用后已用时间；`completeLiveCycle: true`。当前真实运行中，待最终结果；本节替代前文“停止后不续用本批余额”的当时边界，不改写首次失败事实。

## 实际断连与连接调整续行

首场 Luna 比赛 `34e97439-1492-46e8-ad0c-5711249d2cc8` 在第 12 周期收到 `transport_unknown`：`Cannot connect to API: other side closed`，外部结果和用量未知，未收到输出或停止原因，不能认定为模型截断。请求 `2def0de5-971b-44a8-9818-75be8430803b` 的 12,557 micros 预留保留，不重发该请求、不返还未知费用。该场正式命令退出 1，原回执 `pauseUnconfirmed: true` 保留；独立 SQL 已确认 paused，游标为 11 月 2 日 10:06。该场共消耗或预留 98 次共享请求。

用户本次“完成全部，不要停下来”作为继续处理阻断的依据。仅在该隔离维护进程对 `https://api.openai.com` 请求设置 `Connection: close`，保持模型、JSON 模式、完整请求和合同不变，SDK 不增加自动重试。该项是针对连接复用的缓解，不将单次断连定因为连接池。原 29 项回归通过。

经同一正式持锁入口创建独立续行比赛 `44c09ab5-86c2-4f9f-bd47-3027c4158fc0`。此前比赛保持 paused；续行包上限 1,900 次共享请求、1.93 USD、1,852 秒，扣除两次准入、前场 98 次共享请求及已用／预留费用和时间，累计上限仍为本批 2,000 次、一小时、2 USD。`execution-connection-packet.json`、`run-connection/` 保留实际授权包和回执，不接管失败周期。截至中途只读检查已成功 25 周期，游标为首日 11:19、正在研究 11:20，仍未追平或进入实时。

## 第二次断连与独立 HTTPS 客户端续行

关闭连接复用的比赛 `44c09ab5-86c2-4f9f-bd47-3027c4158fc0` 在第 26 周期仍遭遇 `transport_unknown / other side closed`；请求 `91b39e74-e0c2-4e48-baa5-9e7b0ad8be90` 未收到响应，用量未知，保留 11,167 micros 预留。该场消耗或预留 201 次共享请求，独立 SQL 确认为 paused。因此不能把前述关闭连接复用标记为已修复根因。

新增隔离维护用 `arena-model-http.mjs`，通过 SDK 现有 `httpClient` 接口使用 Node HTTPS 客户端，目标固定为同一 OpenAI origin，保留方法、JSON 正文、鉴权和取消信号；每请求独立连接，无自动重发。三个受控检查验证原文／鉴权／用量传递、网络错误只发送一次及目标拒绝；3／3 通过。测试替身起初以字符串模拟 IncomingMessage，已改为与实际一致的 Buffer，原失败保留在本次执行记录。原 29 项入口检查通过。

仍通过原正式持锁回放命令创建 `d6b8cd0f-6502-46fb-a6ab-6fff3f6fbdad`。`execution-https-packet.json` 上限为 1,699 次共享请求、1.83 USD、1,320 秒，累计扣除两次准入及前两场 299 次共享请求；估算及未知预留均保守扣除。没有重发两条未知请求或恢复失败比赛。当前真实运行，模型与合同保持。

实际自主预约密度表明原 2,000 次／一小时上限可能不足覆盖完整区间，已在继续执行当前剩余额度时提出本批扩展预算选择；未收到选择前不扩大上限。

## 扩大预算后的完整区间运行

用户明确选择总上限 20,000 次共享请求／6 小时／10 USD（含全部已用和未知预留）。`budget-extension.json` 保存选择。本批总截止沿首次调用时刻为基准，即 2026-11-24 22:19 左右（Asia/Shanghai）；不会将各场预算累计当作可额外叠加授权。

前期三场的原上限合计保守预留 2,000 请求／2 USD；完整区间场使用最多 18,000 请求／8 USD，时限在启动前从六小时总截止扣除已用时间，实际冻结为 18,635 秒。正式命令仍为主仓执行 `node ../thesis-ledger-infra/scripts/infra.mjs locked --idle -- node scripts/local-runtime/run-arena-scoped-replay.mjs apply .recovery-artifacts/arena-luna-continuation-20261124/execution-extended.json .recovery-artifacts/arena-luna-continuation-20261124/run-extended`。新 ID 为 `b2ebfb41-9d9d-4e1f-89f1-b07e673715d7`。

显式 `maxNetworkRecoveries: 100`，每个业务游标最多初次加两次观察。只允许末次调用为 `transport_unknown` 的未提交周期，由原 `LiveMatchesRepository.retry` 及预约／回放入口建立新周期；不重发原上游请求，不改写未知行或返还预留。原默认未知即停止的 29 项仍通过，新增恢复及 HTTPS 定向后共 35／35 通过。首次实际网络未知后，原 unknown_usage 行保留，后续新周期实际 succeeded，说明单比赛续行已生效；并非仅受控替身通过。

当前运行进程会话为 `19559`，不重复启动、不并行创建其他比赛；下一步等待该正式命令并按新实际进度记录。结束时需独立核对新比赛状态、完整历史时间、实时成功周期、账户／估值及本批全部用量，再更新 R4H16／R4H17；出现外部阻断或预算到限保留真实状态。

## 首组到限、真实网络定位及原比赛断点续行准备

完整区间比赛第一组在同一业务时点连续网络失败后以 `network_recovery_limit` 停止，已保存回执，累计尝试 382 个周期，已安排恢复 ID 4 个。历史进度保留，未通过真实历史／实时。

宿主和容器均解析 OpenAI 到现有 Mihomo fake-ip；宿主系统代理为本地 7890。未认证 OpenAI 读取在宿主、容器及显式系统代理都出现 TLS EOF／ECONNRESET／TLS 超时，未调用模型。读取代理运行配置确认 rule 模式，当前 MATCH 选择器为良心云／新加坡01；不修改选择器。通过[官方 Mihomo API](https://wiki.metacubex.one/en/api/)提供的指定节点延迟接口，以 OpenAI 未认证模型目录预期 401 比较：新加坡01、04、05失败，美国01为 250 ms、美国02为 547 ms。该结果证明现有可达出口，不能将问题归为 Luna 输出。

已准备单条 `DOMAIN,api.openai.com,🇺🇸美国01|流媒体|0.1x` 规则及原／候选配置摘要，私有 `network-route-plan.json` 不含代理凭据。因为原用户限制未授权路由修改，已异步询问是否允许这一宿主机代理修改；答复前没有改配置、切节点或重载。其余域名和原选择器拟保持，模型及数据来源配置不变。

新增绑定上一组 `intent.json`／`created.json`／`receipt.json` 的续行检查，拒绝协议、总预算、身份或停止原因变化；承接原恢复 ID 并在目标核验，续行不新建比赛或重置原现金、持仓、游标和剩余额度。局部与 HTTP 合计 36／36 通过；本次维持原预算截止，待网络可达后运行 `execution-resume-1.json`，回执新目录，来源为 `run-extended`，不会重复启动上一进程。

## 原出口恢复后的同一比赛续行

2026-11-24 18:07:12（Asia/Shanghai）原容器对 OpenAI 的未认证请求返回 HTTP 401，网络可达，模型调用为零。没有修改代理配置、规则或节点，也没有调用重载／重启。单域名候选尚未应用，原出口恢复后不再作为继续业务的必要前提。

以原正式持锁回放命令执行 `execution-resume-1.json` 至新目录 `run-extended-resume-1`，同一 ID `b2ebfb41-9d9d-4e1f-89f1-b07e673715d7`，不创建新比赛。源为上一组 `run-extended` 的意图、创建与停止回执；协议和比赛预算指纹保持，承接原四个已恢复 ID，并在数据库逐项验证均为本比赛的传输未知周期。实际剩余运行秒数从六小时总截止重算为 15,033 秒，不在等待后沿用较早草案时限。现有暂停／继续与业务观察重试入口保留原现金、持仓、预算和历史游标，未知记录及预留不退款。

当前会话 `6209`，原进程已结束；等待此进程最终回执并独立核对，勿重复发出上述执行命令。

## 最终验收

### 完整历史与实际实时

最终主场成功周期 806，其中历史 805、实时 1；另保留 10 条传输用量未知周期，均经有界新观察继续。历史成功业务时间从 11 月 2 日 09:31 到 11 月 24 日 14:55，覆盖实际 17 个交易日；随后游标推进到 11 月 24 日 19:02:15.618 并进入 live，不重复调用历史周期。一次实际实时周期冻结时间为 19:02:16.020，执行了两次 Luna 生成和三次研究工具，19:02:25.945 成功提交，19:02:26.059 生成完整估值。实时市场状态为 closed，研究在休市执行，不把休市价格当成交价。

交界前后均为账户 `30480dee-55fb-4ef6-8d01-e30cac9f048d`，现金 100,000、无持仓或成交，账户修订 818→819；实时提交后的下一观察为 11 月 25 日 09:35。实时研究及工具共享请求扣减 5，剩余请求 11,554→11,549，剩余估算费用 5,616,878→5,614,941 micros。估值 `complete: true`，账户与现金基准净值均为 100,000、收益率 0。没有重置现金、持仓、原比赛预算或历史游标。

### 正式命令与独立结束核对

执行目录为主仓，实际 Node 路径见前文；均通过 `../thesis-ledger-infra/scripts/infra.mjs locked --idle --` 调用已登记的应用维护脚本。

| 实际应用入口与非敏感参数 | 结果 |
| --- | --- |
| `run-arena-scoped-replay.mjs apply execution-extended.json run-extended` | 首组退出 1，`network_recovery_limit`；原失败及暂停读回未确认标记保留，独立 SQL 确认 paused。 |
| `run-arena-scoped-replay.mjs apply execution-resume-1.json run-extended-resume-1` | 业务回执 `completed / live_cycle_completed`，末尾宿主 API 暂停读回未确认而退出 1；该原回执不改写。 |
| 独立 Node `fetch`（`Connection: close`）及 Python API 读取、只读 SQL | 均确认实际 paused／live／ready，API HTTP 200。模型调用为零。维护 API 以后显式使用新连接，避免重用同步等待前的宿主连接；不将本次原 CLI 退出码改成 0。 |
| `run-arena-luna-finalize.mjs finalize-packet.json finalize-receipt.json` | 退出 0。数据库只读验证四场均 paused 且无 pending／running 周期；只移除本批 36 条终态队列投递，逐条核对非本批待办数据与状态未变。 |

独立最终核验使业务结束状态可验收；正式主命令的读回失败仍是原始历史事实。记录分别在 `run-extended-resume-1/receipt.json`、`final-independent-verification.json`、`final-api-detail.json`、`finalize-receipt.json`。

### 全批预算、保护及源码检查

四场新比赛合计模型尝试 2,559、工具 4,538，再加两次正式准入，合计 7,099 次共享请求。四场共保留 13 条未知调用的原状态和 149,642 micros 预留；没有重复发送这些请求或返还未知费用。本轮本批首个调用约 16:19，业务完成约 19:02，低于六小时上限。

前后 14 表逐行摘要显示：原 Arena、研究、编写及账本相关记录无删除或修改；新加本批比赛 4、账户 4、周期 898、时间线 4。估值追加 5,073 条（含正常后台追加）单列。ProviderConfig 原 7 条中只有获准追加 Luna 的 OpenAI 行变化，其余 6 条逐行摘要保持。资格用途日志 117→121，分别为两次调用的 pending／failed 与 pending／passed，不能计为四次生成。

结束清理后共享队列仍由原归属暂停，active 0、wait 1、paused 0；旧待办 ID、数据及状态已在正式维护命令内逐项核对。无活动研究、编写、回测或模型周期。用户明确选择保持代理，代理文件摘要与候选准备前一致，未切节点、加规则、重载或重启。

`node --test scripts/local-runtime/arena-scoped-replay.test.mjs scripts/local-runtime/arena-model-http.test.mjs scripts/local-runtime/arena-luna-finalize.test.mjs` 为 38／38 通过，`git diff --check` 通过；没有因收尾重复跑模型。对应私有证据为 `final-local-tests.log`、`final-budget-and-coverage.json`、`final-summary.json`、`final-*.jsonl`、`protection-final-comparison.json`、`guard-final-clean.json`。当前源码未提交，新维护改动不冒称已进入旧远端 CI。

最终审查补充：用户明确选择保持代理，未采用单域名候选；原出口恢复后完成剩余运行。结束回执、真实时间线、同账户实时记录、预算和原队列保护已逐项对账。只清理本批终态投递，不移除或改写任何未知调用的数据库记录。ETF 归档续验保留为用户停止的独立事项，本轮三个目标及收尾没有待执行工作。
