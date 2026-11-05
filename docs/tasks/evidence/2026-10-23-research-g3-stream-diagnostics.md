# G3 实际 SDK 版本与流分片诊断

日期：2026-10-23，最终复验于北京时间 2026-10-24。任务：[G3-D4～D8／N4](../2026-10-18-research-evidence-evolution.md)。原两条失败任务、预算与恢复证据保留，见[原诊断证据](2026-10-23-research-g3-diagnostics.md)。当前工作树含既有未提交修改，本轮未暂存或提交。

## 授权与停止边界

用户授权先补实际 SDK 版本及脱敏、限长的流分片诊断，验证通过后最多 3 次 `openrouter/free`，总费用上限 0 元；任一真实调用失败立即停止，不自动重试。原数据、来源启停、20 条路由与历史账本保持，结束后恢复 V2 写入关闭。历史两次各 1 次的授权不改写。

本次最多 3 次是人工控制的本轮总上限；每份新任务冻结 `maxAiCalls=1`、`maxCost=0`、无付费路由，避免单任务内继续尝试。未使用额度不要求消耗。实施和本地验证阶段真实模型调用为 0。

## 实现与证据边界

- 错误合同追加可选 `runtime`；实际版本从已解析 SDK 包的元数据读取，未知时保留 null，不从依赖声明或历史记录推断。旧错误和旧诊断均继续可读，不回填历史行。
- 兼容层采集点是 Provider SDK 校验通过、转换前的已解析 SSE 数据帧；SDK 层采集点是 `text-delta`／`reasoning-delta`。二者分别记录分片数、字符数、拼接文本的 UTF-8 SHA-256；处理跨分片 UTF-16 代理对，快照不消费哈希状态。不是网络字节采集，也不声称覆盖心跳或非法帧。
- 固定字段只保留有限的结束原因、非负用量和未知字段计数；原始字段名／帧、请求头、Prompt、完整正文及 reasoning 不保存。前 12 与末 12 帧为候选样本，正文预览最多扫描 192 字符、输出 96 字符且遮蔽全部文字／数字，reasoning 仅留长度与摘要；大小裁剪后记录省略数。运行诊断不超过 8 KiB，完整失败诊断不超过 12 KiB。
- 模型构建从已超尺寸的适配器提取到同一 AI feature 的独立模块；不改变正文提取、输出 Schema、请求参数语义、用量结算或 `maxRetries=0`。不改 manifest、锁文件、Prisma 或部署入口。

## 本地验证

| 范围 | 结果与适用边界 |
| --- | --- |
| 共享错误定向合同 | 3 项通过，旧记录兼容、版本与分片字段限长、未知字段拒绝 |
| 共享 AI 相关合同 | `vitest run test/ai-generation-error.test.ts test/ai-execution.test.ts test/ai-provider.test.ts test/ai-context-mode.test.ts test/ai-workbench.test.ts`：5 文件、20 项通过 |
| Server SDK 定向验证 | 初次 7 文件、53 项通过；代理对边界补齐后，变更相关 3 文件、10 项通过 |
| Server AI 回归 | `vitest run test/ai`：45 文件、391 项通过；14 文件、76 项因未配置隔离数据库跳过，未计为通过 |
| 构建和类型 | Schemas `tsc -p tsconfig.json`、Schemas／Server `tsc -p tsconfig.json --noEmit`、Server `nest build` 均退出 0 |
| 定向规范与门禁 | 本轮 13 个 TypeScript 文件的 ESLint／Prettier 通过；边界／workspace 依赖门禁通过，文件尺寸门禁退出 0，保留 8 条无关存量提示 |

本地 SSE 使用真实当前 SDK 与应用适配器，每例仅一次本机 HTTP 请求，禁止外网；覆盖 `{"` 的语法失败、完整分片 JSON、合法 JSON 的字段不合格、长流和供应商长度终止。两层正文摘要及 reasoning 摘要分别一致，错误分类保持；长流省略明确，秘密不进入诊断。另一集成测试经真实 `AiExecutionStateStore` 的生产结算／读取路径与模拟 JSON 存储边界往返，诊断与旧元数据均保持。该往返不是 PostgreSQL 验收。

本地实际加载版本为 `ai=7.0.107`、`@ai-sdk/openai-compatible=3.0.53`、`zod=4.4.3`。不据此补写原两次历史调用的包版本。未改变的来源、双读、恢复与其他包证据继续复用。

最终源码核对发现，共享导出文件 `packages/schemas/src/index.ts` 于 `2026-10-23T14:15:14.761865Z` 在冻结后发生变化；新运行诊断导出仍保留，其余本轮 12 个源码／测试文件摘要未变。该文件原样保留，不推测修改者；上述通过结果属于回执中的冻结输入，当前入口变动须在恢复后先重验受影响检查，D5 已保留未勾选。未为此重跑测试、部署或模型请求。

用户随后确认“复验后重跑一次”。在当前共享入口下，Schemas `tsc -p tsconfig.json`、Server `tsc -p tsconfig.json --noEmit`、三文件 10 项诊断入口／真实本地 SSE／生产 Store JSON 往返及边界门禁均退出 0；本轮其他 12 个源码／测试摘要不变。D5 已恢复通过，不重复未受影响的 391／20 项检查。当前入口 SHA-256 为 `dce1beff1c8cdf5ccb4ccfbd6259aa6c8c782c699c572b7e36ed037729286cfe`。

## 目标验收当前状态

本轮已在 **1/20** 首次失败后停止，未派发后续 19 次。实际免费路由返回空正文、仅有推理内容，触发 `research_schema_invalid`；兼容层与 SDK 层的累计字符数和摘要一致。失败诊断已落目标 PostgreSQL，最终保留数据关闭更新退出 0，V2=false、canCreate=false、原环境恢复；原记录、已确认的同一 Asset 最新状态、旧 AI 记录、来源启停／20 条路由／准入与挂载保护通过。D6 的实际失败流诊断门禁通过，G3-D8 及父项保留未完成；仅能定位当前观察边界，进一步处理范围等待确认。

### D8 授权与预检记录

北京时间 2026-10-24 用户明确恢复 G3，授权剩余最多 20 次 `openrouter/free`、总费用 0 元，首次失败即停、不自动重试；本次计数从 0/20 起，旧 1/3 及旧未用次数仅作历史，不与本次上限叠加。继续使用原 600519.SH／recent-changes 样本和现有诊断，不更换来源或模型；每个新任务仍最多 1 次、0 元。

启用前调用为 0/20，用户确认保留本条 510300.SH 修改后，执行原入口的受控开启更新；17:25:30.946 UTC 初始预检全部 5 个目标健康，V2=false、临时研究策略未设置。SDK 实际版本、8 个目标模块和 16 个源码／测试指纹与上一阶段已验输入一致，既有测试及报告验收复用。随后开启更新退出 0，V2 临时为 true，单任务冻结最多 1 次／0 元；保护核对保持，已确认的同一 510300.SH 最新状态保留，其他三条 Asset 不变。当前失败与最终关闭结果见下方 D8 样本记录。

启用前曾发现 Asset 仍 4 条，但 `510300.SH`（沪深300ETF华泰柏瑞）一条原记录摘要变化，更新时间为 `2026-10-23T17:25:22.088Z`，即北京时间 10 月 24 日 01:25:22；其余三条 Asset 保留。按新卡点边界暂停后，用户明确确认“是预期修改，保留并继续”，现已将本条精确摘要纳入本轮基线；其他 Asset 更新不由此自动授权。原东财／HiThink 新闻准入版本均为 2，既有日期范围及有效期覆盖本次七日窗口，未修改准入或发出来源请求。[本轮保护与授权回执](2026-10-24-g3-bounded-sampling.json)保存精确摘要。

### D8 第 1 份样本、诊断与关闭核对

受控开启入口为 infra 的 `./scripts/update.sh thesis-ledger`，进程组 99076，日志 `/tmp/thesis-ledger-g3-d8-enable-update-20261024.log`，退出 0，未触发重试。参数保留研究／策略执行原开关，临时 V2=true、`AI_RESEARCH_POLICY_JSON={"version":"research-policy-v1","maxAiCalls":1,"maxCost":"0"}`、`DEV_DATABASE_MODE=check`、`UPDATE_SPACE_MODE=auto`；其他环境保持。目标实际包版本和 8 个模块摘要通过，研究默认仍为修订 5 的 openrouter/free，原两条新闻准入覆盖本次窗口，来源与路由未改。

新提交 `33a46506-22cc-460c-87b8-c18b1ab10082` 由正式入口返回 200、reused=false，新任务为 `e46a779e-e0f6-48f4-b5ce-49115c4da568`，唯一 SDK 请求为 `6f4269da-63a5-4d1f-b28f-257235a12d4b`。实际执行合同 research-generation-v2；任务 failed／result=null，错误 research_schema_invalid。SDK 审计完成，generationStatus=incomplete、schemaAccepted=false，settledRevision=1；来源报告输入 5,629、输出 12,643 tokens，其中推理 12,641 tokens，费用按冻结免费定价估算 0 USD。没有派发第 2 次，也没有重试失败任务。

| 观察点 | 正文字符数 | 推理字符数 | 摘要关系 |
| --- | ---: | ---: | --- |
| 兼容层的已解析有效帧 | 0 | 32,057 | 空正文 SHA-256 与 SDK 一致；推理摘要也一致 |
| SDK text／reasoning 流 | 0 | 32,057 | 与兼容层累计摘要相同 |

实际模型为 `nvidia/nemotron-3.5-super-vl:free`，SDK 实际版本为 ai@7.0.107、@ai-sdk/openai-compatible@3.0.53、zod@4.4.3。诊断 errorClass=no_object、jsonStatus=empty、outputCharacters=0、structuralPreview 为空；兼容层与诊断的结束原因均为 stop。SDK 请求 outcome 的 schema_invalid 是应用输出校验结果，不与上游结束原因混同。空正文的 SHA-256 为 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。

共记录 3,597 帧，22 条限量样本，省略 3,575 条样本；省略数不表示实际流分片丢失，完整累计长度和摘要仍覆盖已观察有效帧。完整失败诊断 7,368 字节、运行诊断 7,004 字节，分别低于 12 KiB／8 KiB，正文与推理原文未保存。首帧、结束帧和用量帧的正文长度均为 0。

本次结论是：正文在兼容层已解析有效帧的观察点就为空，SDK 没有进一步丢失已收到正文的证据。该观察点不等于网络原始字节，也不足以区分模型本身、OpenRouter 路由或更上游根因；finish=stop 不支持直接推定长度上限截断。它是同类 Schema 失败，和旧样本精确两字符 `{"` 不同，不能据此反推旧样本的因果。现阶段不改请求参数、模型、正文提取或输出校验。

首次观察到失败后，立即通过原入口执行关闭更新，进程组 8545，日志 `/tmp/thesis-ledger-g3-d8-close-update-20261024.log`，退出 0，未重试。V2=false、canCreate=false，临时策略已撤除，原环境按键名规范化后摘要一致。17:50:07.597 UTC 全部 5 个目标健康，8 个模块与宿主已验构建一致；失败任务完整行及诊断重建后均不变。

以采样前基线核对：Account 24 条、LedgerEvent 129 条原记录全部保留，Asset 4 条及用户已确认的同一 510300.SH 最新状态保持；三张已授权业务投影表保留，其余保护表不变。原三条 AI 记录保持，新增仅本次任务及 11 条冻结 Tool，runs=4／tools=44，Observation／Invocation／InvocationFact 均为 0。DSA 四张控制表摘要、来源启停、20 条路由、准入、挂载及非目标镜像保持。

关闭后的公开接口继续返回 200：旧成功报告 succeeded／available，新失败报告 failed／missing，历史保留全部四条；默认修订 5 不变。此前 11 条引用和 Web 证据按不变输入复用，没有重复请求来源。全部实际快照、逐行摘要、SDK 诊断及费用事实见[本轮回执](2026-10-24-g3-bounded-sampling.json)。

本轮未修改应用代码、依赖或数据库结构，16 个输入指纹未变，复用已通过测试和构建；新增验收仅为真实失败流、落盘与完整关闭更新后的保护。下一步如获确认，仅只读核对本次冻结模型配置、现有请求构造与 OpenRouter 官方结构化输出约束，给出最小处理结论；不修改配置或代码、不新增模型调用，无法确认即汇报。剩余 19 次继续暂停，不自动继续采样或寻找其他模型／来源。

## 上一阶段目标验收与恢复记录

当前结果：**实际 SDK 版本及目标诊断模块已核对；唯一新请求完成 1 次派发，JSON／V2 输出结构及已存结果 Schema 通过，费用估算 0 USD。请求模型／实际模型混淆的反读问题已最小修复，同一原报告的正文、11 条引用、历史和 Web 展示通过，原完整行摘要不变。最终保留数据完整更新退出 0，修复已进入新开发镜像，8 个模块摘要与已验构建一致，更新后原报告／全部引用／历史再次通过。V2=false、canCreate=false、原环境恢复，模型停止在 1/3，不新增调用**。预期业务新增、同类投影更新及同一 `000001.OF` 修改获准保留，原 LedgerEvent、其他保护记录、来源与路由保持。G3-D7／N4 通过；原无效 JSON 本次未复现，未触发真实 Provider 失败流诊断落盘，G3-D6 的该分支仍未覆盖，父项保留未完成。历次保护摘要和源码指纹见[停止与复验回执](2026-10-23-g3-stream-diagnostic-closeout.json)。

部署前快照时间为 `2026-10-23T14:00:58.542Z`，V2=false；runs=2、tools=22，Observation／Invocation／InvocationFact 均为 0。17 张保护表与来源控制已封存，本轮预算尚未使用。受控开关和单任务零费用预算需要更新容器环境，使用原维护入口 `./scripts/update.sh thesis-ledger`，不以只能重启原环境的代码同步代替。

首次默认沙箱执行退出 1，原日志 `/tmp/thesis-ledger-g3-stream-diagnostic-v2-enable-update-20261023.log` 明确提示 `ps` 权限不足，尚未取得更新锁或修改 Docker。遵照工作区 AGENTS.md 的既定处理，用 `require_escalated` 执行同一维护入口并保留全部校验，进入镜像构建后失败；新日志 `/tmp/thesis-ledger-g3-stream-diagnostic-v2-enable-ps-update-20261023.log`，不是成功回执。

执行目录为 `thesis-ledger-infra`，非敏感参数为 `AI_RESEARCH_POLICY_JSON={"version":"research-policy-v1","maxAiCalls":1,"maxCost":"0"}`、`AI_RESEARCH_EXECUTION_ENABLED=true`、`AI_RESEARCH_V2_WRITES_ENABLED=true`、`STRATEGY_AI_OPTIMIZATION_ENABLED=true`、`DEV_DATABASE_MODE=check`、`UPDATE_SPACE_MODE=auto`，目标 `thesis-ledger`。未修改 `.env`。原样本已核对为模拟模式、独立标的 `600519.SH`、`recent-changes` 及原问题，默认设置修订 5。待更新完成后先验证目标版本和保护，再提交一次；失败即停，关闭 V2 后核对数据和账本。

### 构建错误、停止与最终核对

构建步骤 `apk add --no-cache g++ make python3` 在第 357.8 秒报告 `gcc-15.2.0-r5` 无法解包 `usr/libexec/gcc/aarch64-alpine-linux-musl/15.2.0/plugin/gengtype: I/O error`。没有更换软件源、修改镜像或继续寻找部署替代方案。按用户失败即停要求，先只读核对本次正式更新的 PID／父子关系及进程组成员，再重核身份，仅向自有进程组 83648 发送 SIGTERM；原更新退出 143，随后该组为空，未重跑构建。

最终保护快照时间为 `2026-10-23T14:20:21.547Z`：全部目标健康，Server／Worker／DSA 镜像和挂载不变；17 张保护表、两条旧任务完整行摘要、全部计数、来源控制、启停／20 条路由、准入及环境摘要均与部署前一致。原策略摘要仍保持。`GET /api/v1/research/capabilities` 返回 HTTP 200、`canCreate=false`，V2 写入为 false；本次尚未切换服务，也未启用临时预算，真实调用 0/3。`df -h /tmp` 显示主机仍约 10 GiB 可用，仅凭这次错误不判定是主机磁盘不足或 Docker 已只读。

本地实施自评通过；目标更新／实源采样阻塞。等待用户确认是否仅只读检查磁盘与 Docker 构建存储，或由用户恢复 Docker 后继续同一正式更新。保留未使用额度，失败边界未解除前不继续调用。未暂存、提交或推送。

### 只读检查与获准的单次重跑

用户确认仅只读检查后，主机可用约 10.95 GiB；Docker.raw 虚拟容量 32 GiB、实际分配约 8.4 GiB，已有容器内 `df` 显示约 22 GiB 可用（28% 使用）。Docker 29.7.2、BuildKit v0.32.2 的只读查询正常，5 个业务容器运行，本次失败构建已终止且无活动构建。镜像约 3.166 GB、构建缓存约 4.037 GB，其中约 3.864 GB 标为可回收；没有执行清理。

检查的当前 VM／backend 日志没有本次时段的文件系统只读／容量耗尽错误；仅找到 12:03 UTC 的旧 BuildKit diskusage I/O 错误及 12:23 UTC 的旧日志写入空间不足记录，均早于本次构建，不能据此判定当前仍异常，也不能以只读查询证明写入已恢复。没有重启、清理、改配置或试写。14:40:55.969 UTC 保护快照与首次停止回执一致，V2=false、模型调用 0/3。

用户随后确认“复验后重跑一次”。受影响复验通过后，14:46:11.391 UTC 再次封存全部保护状态；以原非敏感参数从 `thesis-ledger-infra` 调用 `./scripts/update.sh thesis-ledger` 一次。入口、预检与更新锁均保留；外层只监控输出，在首次明确构建错误时向本次新建的自有子进程组发送 SIGTERM，阻止入口内置的第二次构建尝试，不直接操作 Docker。日志为 `/tmp/thesis-ledger-g3-stream-diagnostic-v2-retry1-update-20261023.log`。该次记录不代表部署通过，实际退出与锁阻塞如下。

该次入口随后在获取锁时退出 1，未触及 Docker，未进入任何镜像构建或内置重试。锁目录为 `/var/folders/t6/qhk7wqzd07g25xwy7mr46gb00000gn/T/thesis-ledger-update-501-2842842147.lock`，只含 `pid` 文件、值为 83652，对应首次中止的本次更新。只读进程核对确认 PID 83652、原组 83648、新组 1112 均为空；该锁是上一轮停止后留下的本次失效锁，没有推定或删除其他任务的锁。

14:51:04.257 UTC 保护快照与重跑前一致：V2=false，全部目标健康；17 张保护表、旧任务、计数、来源控制、启停／20 条路由、准入、镜像、挂载和环境摘要不变。当时按“再次失败即停”暂停，未删除锁或再次更新；模型仍 0/3，原预算未使用。

用户随后确认“清理本次失效锁并继续”。再次检查锁目录为当前 UID 的真实目录、仅含真实 `pid` 文件且值精确为 83652，并确认原 PID／进程组均退出后，仅删除该文件并移除空目录。随后以同一非敏感参数继续原维护入口；本次新进程组为 9897，日志 `/tmp/thesis-ledger-g3-stream-diagnostic-v2-retry2-update-20261023.log`。保留全部入口预检，首次明确构建错误即停止；没有新增模型调用。

本轮完整更新退出 0，未触发监控停止或内置重试。目标实际安装版本为 `ai@7.0.107`、`@ai-sdk/openai-compatible@3.0.53`、`zod@4.4.3`；6 个诊断相关编译模块与宿主已验证构建的 SHA-256 一致。公开能力 `canCreate=true`，默认仍为 revision `5` 的 `openrouter/free`；临时单次研究策略为 `maxAiCalls=1`、`maxCost="0"`。

15:14:36.152 UTC 保护核对发现 Account 18→24、AccountLedgerState 16→18、LedgerEvent 103→105、Trade 16→18；其余 13 张保护表、旧 AI 记录、研究计数、DSA 控制表、来源启停、20 条路由、准入及挂载保持。此时尚未提交研究或调用模型，按新卡点确认要求暂停采样，并启动原维护入口的保留数据关闭更新（组 16624，日志 `/tmp/thesis-ledger-g3-stream-diagnostic-v2-retry2-close-update-20261023.log`），恢复 V2=false 及原未设置的研究策略环境。用户随后确认这批新增属于预期，要求原样保留并继续；关闭更新完整收束后，以确认后的业务状态继续原 G3 验收，原 3 次零费用授权仍为 0/3。

该关闭更新退出 0。15:21:45.117 UTC 全部目标健康、V2=false，公开能力 canCreate=false；临时研究策略已撤除，其他环境按键名对齐后摘要相同。关闭期间又新增 AccountLedgerState 18→19、CashBalance 12→13、LedgerEvent 105→107，Account 24、Trade 18 不变。再次向用户列明差异后，获确认“是预期写入；后续同类追加按原记录保留核对”。

15:25:49.546 UTC 以一次只读查询建立 17 张保护表的逐行摘要基线，数量及整表摘要与最新获准状态一致。后续允许 Account、AccountLedgerState、CashBalance、LedgerEvent、Trade 的正常追加，但必须保留基线每条原记录的摘要及重数；其他保护表、旧 AI 记录、来源启停、20 条路由和准入仍按原边界核对。摘要只保存行哈希，不保存业务原文。本次受控采样启用仍使用原维护入口（组 22416，日志 `/tmp/thesis-ledger-g3-stream-diagnostic-v2-sampling-enable-update-20261023.log`）；13 个已验证诊断输入指纹一致，否则入口执行前立即停止。原模型授权仍 0/3，单次策略 maxAiCalls=1、maxCost="0"，首次失败即停，验后恢复关闭。

该受控启用更新退出 0，目标实际 SDK 版本及 6 个模块与宿主构建再次核对一致。15:31:49.386 UTC 原 107 条 LedgerEvent 均保留并增至 115 条，但 AccountLedgerState／CashBalance／Trade 分别有 3／1／2 条原记录摘要不再匹配。此时没有提交研究；列明差异后用户确认“是预期更新；允许后续同类业务投影更新”。后续允许这三张业务投影表的同类正常更新；原 LedgerEvent、Account 和其他受保护记录、旧 AI 记录、来源启停、20 条路由及准入仍保护，不回滚已确认业务写入。

唯一新提交为 `e2aa6833-b727-48ad-95c6-6d4d4827e657`，公开入口 200，返回新任务 `805cc84a-2333-4695-8aac-217ef57e7ac8`、reused=false。持久化仅 1 条派发记录 `40d3c31d-f65e-42f2-9777-58ad89494692`，执行合同 `research-generation-v2`；15:36:51.305 UTC 用量结算输入 5630／输出 9547 tokens，冻结免费定价估算 0 USD。实际路由模型 `nvidia/nemotron-3.5-lightning:free`，不同于旧失败样本；finishReason=stop、schemaAccepted=true、generationStatus=complete。只读导出的已存结果通过现有 `researchResultV2Schema`，无字段错误。因此本次未复现原无效 JSON，也没有真实失败诊断可反读，不能将这次成功作为原问题已修复或真实失败流落盘通过的证据。

正式报告接口 200，却返回 status=succeeded、availability=invalid，故 G3 的报告／引用／历史验收仍未通过。按首次失败即停，未派发第 2／3 次调用；原任务和结果保留，已启动最终保留数据关闭更新（组 29472，日志 `/tmp/thesis-ledger-g3-stream-diagnostic-v2-sampling-close-update-20261023.log`）。新的确认项仅涉及用本次已存结果定位并最小修复反读问题，保留证据与归属校验标准，不新增模型调用；尚未继续排查其他方案。

## 反读最小修复与复验（北京时间 2026-10-24）

用户确认定位并最小修复后，使用现有纯校验器及同一条持久记录逐项回放：冻结完整性、提交归属、结果关联、数值证据和冻结 Tool 绑定全部通过，仅旧的模型名称直接相等检查失败。根任务保留请求模型 `openrouter/free`，结果保留 SDK 实际模型 `nvidia/nemotron-3.5-lightning:free`，二者语义不同。Spec 的 T7 先明确这一边界，再实施 G3-D7。

写入仅 `apps/server/src/ai/ai-research-run-binding-v2.ts`、`ai-research-report-projection.ts` 和 `apps/server/test/research/research-report-model-binding-v2.test.ts`。同 Provider 且模型名相同的旧路径保持；不同模型名必须有严格有效的完整 V2 SDK 审计、同执行 attempt、同请求预留 Provider／model、配置摘要、实际派发及完成时间、成功 outcome 和结构接受事实。冻结范围、版本、数值证据、Tool 指纹和归属检查保留。没有改写报告或重新请求模型。

新增 14 项正反例通过；相关研究、冻结完整性、执行读模型和 SDK 集成回归共 155 项通过，79 项因未配置隔离 PostgreSQL 跳过，不计为通过。Server Nest build／完整 typecheck、三文件 ESLint／Prettier、边界、workspace 依赖、尺寸及定向复杂度均通过，保留 8 条无关存量尺寸提示。首次测试命令误用工具环境 `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node`，Rollup 原生模块被签名限制拒绝，未进入用例；改回此前验证的项目 Volta Node 24.18.0 后，同一测试通过，未删除／重装依赖或修改锁文件。

使用新构建的正式 `projectResearchReport` 对同一持久记录和原 Tool 审计只读回放，availability=available、11 条引用绑定通过；原完整行 MD5 为 `e8bed09ac6ff9160460bbd7caee87c5a`，结果 MD5 为 `969bd932a8c5e1cb227c177da14ad412`。随后从 infra 执行保留数据的 `./scripts/sync-code.sh thesis-ledger`，保持 V2=false、研究策略环境撤除，退出 0；日志 `/tmp/thesis-ledger-g3-d7-model-binding-sync-20261024.log`。这是运行态快更，镜像仍保持原值，不作为镜像发布证据。

快更后 8 个诊断／绑定／反读编译模块与宿主构建 SHA-256 一致。公开报告详情 200、succeeded／available；11 条引用明细均 200，runId、Tool 及证据指纹匹配，未知引用 404。历史列表包含这份成功报告及原两条失败报告；公开能力 canCreate=false。IAB Web 实际打开同一报告，结论、部分质量提示、报价 1335 CNY、新闻摘要及原文链接均展示；未点击新研究或外部链接。截图 `/tmp/g3-d7-report-read-20261024.png`，页面保留为交付结果。

快更后原报告完整行摘要和旧 AI 记录均保持，DSA 控制表、来源启停、20 条路由、准入、挂载及非 V2 环境相同；原 LedgerEvent 全部保留。AccountLedgerState／CashBalance／Trade 的已授权同类业务投影更新保留。Asset 仍为 4 条，差异限定用户已确认的同一 `000001.OF` 记录，其他三条原 Asset 保留；其 15:59:24.077 UTC 的更新不另当作新的未授权记录。

为在容器重建后保留最终修复，按原完整更新授权执行 `./scripts/update.sh thesis-ledger`（组 56985，日志 `/tmp/thesis-ledger-g3-stream-diagnostic-g3-d7-final-image-update-20261024.log`），保持 V2=false、原未设置的研究策略及其他开关。16 个已验证源码／测试输入已封存；入口退出 0，未触发首次错误停止或自动重试，不新增模型调用。

最终 Server／Worker 镜像均为 `sha256:021685e98bbaae40dfca50ae82f7fe1ad442a510578e0646da6e82d51003169f`，不同于快更前镜像；DSA、PostgreSQL、Redis 镜像保持。16:40:09.578 UTC 全部 5 个目标健康，Schema head 为 `20261023010000_report_metadata_snapshots`，8 个诊断／绑定／反读编译模块与宿主已验构建逐一一致；实际 SDK 版本仍为 `ai@7.0.107`、`@ai-sdk/openai-compatible@3.0.53`、`zod@4.4.3`。V2=false、canCreate=false，原研究策略未设置，其他环境按键名规范化后摘要一致，挂载不变。

最终逐行保护核对：基线 125 条 LedgerEvent 全部保留，正常追加至 128；Account 24 条原记录保持。已授权三张业务投影表的同类更新及同一 `000001.OF` 修改保留，其他三条 Asset 及其余保护表保持。原两条失败任务和本次成功任务的完整行摘要不变，runs=3／tools=33，Observation／Invocation／InvocationFact 均为 0；DSA 四张控制表摘要不变，来源启停、20 条路由与准入均保持。

16:41～16:42 UTC 对新镜像再次只读验收：公开报告 200、succeeded／available、resultVersion=2；11 条引用均 200，runId、Tool、evidenceId 和冻结指纹匹配，未知引用 404；历史保留本次成功项与原两条失败项。默认仍为修订 5 的 `openrouter/free`，公开能力 canCreate=false。上述读取不触发模型或外部来源；复用同一编译输入下已通过的 Web 证据，不再生成报告。

本次反读修复与主路径验收收口，G3-D7／N4 通过；当前没有新的部署或数据保护卡点。原无效 JSON 未复现，真实失败流分片落盘仍缺样本，G3-D6 及父项不勾选。剩余 2 次额度不自动执行；如需继续真实失败采样，须明确恢复采样范围。Longbridge 和其他用途、策略及实验调用继续按原暂停条件管理。
