# G3 历史诊断与检查点

本文件保存各次实验当时的结果、授权和失败事实。未勾选的历史实验表示当次未通过，不是当前待重试任务；不恢复旧预算。当前状态由[研究Task](../2026-10-18-research-evidence-evolution.md)持有，D58／D59／D60的通过不改写先前失败。

## 原页首检查点

> 当前G3检查点（2026-10-29 D59）：OpenRouter/free正式单次通过，实际Nvidia／Nemotron3.5免费模型；2条断言／5条数字／11条真实引用、完整trace及重建反读通过。V2保持开启、默认与配置保持；原新闻准入仅按新授权续至23:31:34。见[复测回执](2026-10-29-g3-openrouter-formal-retest.md)。

> 当前运行状态（2026-10-29 22:05）：按用户新授权开启V2，`canCreate=true`；本地运行配置已持久保存。默认仍为OpenRouter/free，Cloudflare保持停用。本轮模型调用0，原配置／业务记录和WIP保持。见[开关生效回执](2026-10-29-g3-formal-acceptance.md#v2-enable)。

> D58验收检查点（2026-10-29）：获准Cloudflare/Qwen／JSON Mode路径已产出正式报告，3条claims／4条结构化数值、11条实际引用及Web／历史通过；17份trace与网关正文一致，配置恢复、V2关闭及重建反读、WIP最终保护和一致性Review通过。资料保持partial，不推广D41双模型方言或代收其他G1／DSA恢复义务，GLM冻结。见[正式回执](2026-10-29-g3-formal-acceptance.md)。

> D42工程交付（2026-10-27）：AI超时治理本地与正式部署通过，见[治理Task](../../archive/tasks/2026-10-25-ai-adaptive-execution.md)及[证据](2026-10-27-ai-timeout-governance.md)。空间修复后正式update退出0，Server／Worker同镜像3fd6cbdb…，实际Schema／SDK／三档策略及两个capabilities反读通过，原35表旧数据／默认配置保持；既有日终调度新增3条快照单独记录。真实模型调用0，D41候选未推广、GLM1次仍冻结，V2关闭，G3正向仍未通过。

## 原G3执行记录

  - 诊断采样本地历史检查点（2026-10-25，D21）：D21a实现及独立本地检查完成；嵌套断言、受影响测试／类型／构建通过，复杂度27恢复基线26，存量告警保留。Schema33／Server420项未变证据复用，76项DB集成跳过。当时D21b全仓边界沿用移动端夹具3条跨层引用失败，未重跑／豁免，未部署／调用模型，V2未改、余8次冻结。[原证据](2026-10-25-g3-http-response-local.md)。该阻塞后由D23解除，D24快更、D25真实响应与关闭检查点已接续，现行状态以D25为准。
    - [x] G3-D1：共享可选错误诊断合同及 Server 纯诊断模块；字段限长、文本／数字遮蔽、旧合同兼容，超尺寸及缺原文明确未知。写入范围：共享错误合同、AI SDK 失败捕获及定向测试；拆出已过尺寸阈值文件中的错误合同，公开导出保持兼容。
    - [x] G3-D2：本地真实 SDK 失败、原错误事实的生产 Store／JSON 存储边界往返及受影响包构建、类型、边界门禁通过；验证秘密、正文、Prompt／headers 不进入诊断，0 重试，旧记录无诊断仍可读。该往返使用内存 JSON 存储边界，不代替目标 PostgreSQL 验收。Schema 全包 1319 项通过；Server AI 382 项通过、76 项因未配置隔离数据库跳过；Schemas build／typecheck、Server build／typecheck、定向 ESLint／Prettier、边界／依赖／文件尺寸门禁通过，保留 8 条无关存量尺寸提示。实现自评：Ready；不改输出 Schema、数据库结构、请求次数或结算规则。
    - [x] G3-D3：完整更新开启、原样本单次采样及目标 PostgreSQL 诊断落盘通过，本次 1/1 已用尽。故障恢复后，同一保留数据完整更新退出 0；V2=false／canCreate=false，全部目标健康。17 张受保护表、原任务、来源启停／20 条路由、挂载与非 V2 环境摘要保持，两条失败任务及诊断在更新后仍可读取且完整行摘要不变；本轮新增模型调用为 0。仅关闭诊断／恢复子范围，G3 成功报告及引用／历史门禁保持未完成。
    - [x] G3-D4：共享错误诊断追加可选运行包版本与两层流分片摘要；实际包版本、旧记录兼容、样本限长、跨分片 Unicode 摘要与秘密遮蔽通过。不改输出 Schema、依赖、数据库或其他用途；同 feature 内提取模型构建，原适配器规模降低。见[版本与流诊断证据](2026-10-23-research-g3-stream-diagnostics.md)。
    - [x] G3-D5：原冻结输入的共享 AI 20 项、Server AI 391 项及构建／类型／规范／门禁证据保留，76 项数据库环境跳过。共享导出入口后续变化已原样保留；用户确认复验后，Schemas 全构建、Server 类型、当前入口的 10 项真实本地 SSE／诊断／Store JSON 往返与边界门禁均通过，其余 12 个本轮源码／测试指纹不变。仅本地证据，目标诊断落盘与真实 G3 仍由 D6 验收。
    - [x] G3-D6：已验证目标实际版本 ai@7.0.107／@ai-sdk/openai-compatible@3.0.53／zod@4.4.3，8 个诊断／绑定／反读模块与宿主构建一致。旧成功样本的 JSON／V2 与 D7 反读证据保留；D8 新授权下的首次请求 e46a779e-e0f6-48f4-b5ce-49115c4da568 补齐真实失败分支，SDK 审计、7,368 字节失败诊断及 7,004 字节运行诊断已落目标 PostgreSQL。最终保留数据关闭更新退出 0，失败任务完整行及诊断摘要重建后不变，原报告、历史与旧 AI 记录保留；V2=false、原环境／来源／20 条路由／准入和挂载恢复。仅诊断捕获及持久化门禁通过，不宣称上游问题已消除或旧两字符样本因果已证明；[本轮回执](2026-10-24-g3-bounded-sampling.json)。
    - [x] G3-D7：最小反读修复完成，14 项新正反例、相关 155 项、Server 构建／类型、规范／边界／依赖／尺寸／定向复杂度通过；79 项隔离数据库用例因未配置而跳过。原报告离线正式读取及官方 `sync-code.sh thesis-ledger` 后的公开正文／11 条引用／未知引用 404／历史／Web 报价和新闻展示通过。随后 `./scripts/update.sh thesis-ledger` 退出 0，新镜像重建后 8 个模块与本地构建一致；同一报告及全部引用／历史再次通过，原报告行摘要不变。V2=false、canCreate=false、原环境恢复，模型仍 1/3，无新增调用；已确认业务更新保留，原 LedgerEvent、其他保护记录、旧 AI 记录、来源／20 条路由／准入及挂载保持。写入仅两处 V2 绑定／反读及定向回归，冻结／数值／归属与引用检查保留，详见本次证据。
    - [ ] G3-D8：正式 G3 未完成。D25 新正式请求实际 HTTP 200／完整 SSE／stop，合法 JSON 未通过 V2 Schema，failed／research_schema_invalid、result=null；本轮 1/1、余 7 次冻结，费用仅冻结定价估算 0 USD。D21 已固化镜像并通过真实响应及失败记录重建反读；关闭更新经 ENOSPC／daemon 故障恢复后退出 0，V2=false、canCreate=false，数据／配置／来源／挂载保持。D20 原 Provider returned error 的响应和根因仍未知；新正式报告／全部引用／成功历史及发布反读未验。[当前检查点](2026-10-25-g3-single-formal-response.md)。
    - [x] G3-D9：显式兼容扩展的输入／保存／验证接线及首次失败即停授权完成；用户确认同步旧断言、单独重跑原 5 秒超时用例及修正两处类型／一条测试 lint 后，55 项定向、Server AI 396 项（76 项数据库跳过）、Schemas 1319+1 项、Server 构建／Server 与 Schemas 类型／定向规范／边界／依赖／尺寸门禁通过。没有依赖或数据库结构变更，外部调用 0/19；仅本地完成，目标与真实用途由 D10 验收。[证据](2026-10-24-g3-openrouter-explicit-compatibility.md)。
    - [x] G3-D10：显式兼容配置与两条原启用用途验证、正式保存接线完成；策略编写分析复用已有 0 USD 证明，研究单独复验一次、上游报告 0 USD。普通保存复用两条证明且模型调用为 0，扩展已落库并经完整更新保留；不代收 D8 的 G3 业务正向门禁。
      - [x] G3-D10a：修正 PATH 后以正式 sync-code.sh thesis-ledger 退出 0；六个目标模块／授权合同一致，提交前 17 表／旧 AI 记录／来源启停／20 路由／准入／挂载和环境摘要保持，V2=false。仅代码可写层更新，镜像未更新。
      - [x] G3-D10b：原分析通过证明复用；旧研究 pending 未重发，用户确认后以新 operationId 仅复验研究，通过并报告 0 USD。旧两次请求保守占用 2 次，旧研究实际结果／费用仍未知并保留；本次研究复验另占 1 次。
    - [x] G3-D9P：正式设置序列化优先保存显式扩展，省略时保留原值；测试经过真实序列化。33 项定向、397 项 Server AI（76 项数据库跳过）、类型／规范／边界通过；没有依赖或数据库变更，未新增模型调用。
    - [x] G3-D10c：官方代码更新及目标模块核对通过，正式计划 pending=[]／maxCalls=0，普通保存已将 openrouter-v1 落库；原六条用途启停／默认、其他 Provider、来源／20 路由保持。最终完整更新后扩展与两条证明仍在，V2=false；后续 G3 最新一次业务失败见 D8。
    - [x] G3-D11：实际 fetch 参数的脱敏诊断合同、采集和请求事实持久化实现；最多 1 KiB，仅首个请求与次数，白名单及隐私边界固定，成功／失败接线和旧记录兼容。按用户确认提取诊断组合、参数提取及请求事实合并纯函数，未变更数据库、依赖或门禁。
    - [x] G3-D12：本地最终 HTTP 请求、认证／次数保持、成功／失败生产 Store 与 JSON 账本往返、未知／超长输入及隐私验证通过；定向 32 项、Server AI 403 项（76 项隔离数据库跳过），Schemas AI 26 项／构建、Server 类型／构建及规范／仓库门禁通过，新增函数复杂度不超过 20。仅本地，不代替 D13 目标 PostgreSQL 和真实模型。
    - [x] G3-D13：实际 HTTP 请求诊断的目标验收完成；官方 sync-code 和 V2 开启／关闭完整更新均退出 0，11 个模块一致。真实唯一 fetch 尝试的 650 字节诊断落目标 PostgreSQL，执行／错误／HTTP Schema 和重建反读通过；最终 17 表／旧 AI／DSA 控制／环境／挂载保持，V2=false。模型在上游流式错误处失败即停、无重试，用量和费用未知；本叶只验诊断与恢复，G3 正向业务仍归 D8，余 14 次冻结。[证据](2026-10-24-g3-http-request-diagnostics.md)。
    - [x] G3-D14：原 G3 请求体 22,542 字节及 SHA-256 完全一致，原生 HTTP 直连一次返回 200／正常 SSE、2,537 事件无 error；标准正文 2 字符／推理 24,729 字符，实际 nvidia/nemotron-3.5-super-vl:free、费用报告 0 USD。确认本样本上游正文不足，SDK 响应解析未参与。原数据／旧 AI／来源／路由／环境／挂载保持，V2 全程关闭；不自动重试或切模型，剩余 13 次冻结。该分类不替代 G3 正式报告验收。[证据](2026-10-24-g3-direct-http-comparison.md)。
    - [x] G3-D15：官方实际免费端点与可选推理能力核对、本地参数差异和采集验证通过；固定原实际模型并关闭推理，仅直连一次，HTTP 200／stop、JSON／V2 Schema 通过、正文 2,946 字符／推理 0，费用报告 0 USD。未改业务代码／配置／默认或数据，V2 全程关闭，全部保护通过。该直连子范围完成，正式 G3 仍由 D8 持有；余 12 次冻结。[证据](2026-10-24-g3-direct-http-reasoning-off.md)。
    - [x] G3-D16：用途级 reasoningEnabled／准确 V2 探针／受控单次授权／保存／冻结和指纹本地验收完成；类型最小修正及复杂度 ratchet 通过。Schemas AI28项、Server AI411项（76项数据库跳过）、类型／构建／规范／仓库门禁通过。目标与真实用途仍由D17持有。[证据](2026-10-24-g3-research-reasoning-sdk.md)。
      - [x] G3-D16a：研究V2可选 reasoningEnabled、保存／省略保留、运行／验证指纹通过；分析指纹与原证明保持，错误用途／配置拒绝。
      - [x] G3-D16b：准确V2 Schema／消息透传、首次失败即停的受控单次授权、最终本地HTTP reasoning.enabled、冻结与派发匹配及旧记录兼容通过；没有隐式默认或其他用途注入。
      - [x] G3-D16c：9项Schema／39项Server定向及补充断言通过，最小类型修正后最终类型／包级28＋411项／构建／仓库门禁通过，存量复杂度不增加；局部失败历史保留。
    - [ ] G3-D17：官方sync-code退出0、14个实际模块和保护通过；唯一研究用途复验因强制推理被拒，未保存配置、未提交G3，无重试。该阶段预算1/2已用、当时余11次，实际模型／用量／费用未知（仅估算0 USD）。该阶段仅更新可写层；10月25日D20已通过完整镜像开启／关闭更新及14模块核对。旧拒绝事实保留，现行接续由D20持有。
    - [ ] G3-D18：免费候选目录／正式计划通过，唯一真实研究用途返回Provider returned error后停止。模型1/1、余10次冻结，未保存Provider或默认，V2=false；原全部用途／证明、17表、旧AI、来源和20条数据路由保持。实际费用未知，仅免费配置估算0 USD。是否只读核对本次错误日志待确认。[证据](2026-10-24-g3-free-model-switch.md)。
      - [x] G3-D18a：实时免费目录及DeepSeek免费端点核对，候选价格／推理／结构化参数和新保护基线通过；当前canCreate=false、V2关闭。
      - [ ] G3-D18b：正式计划仅候选研究1条待验，复用原两条证明；唯一V2探针上游错误，pending／failed为同一请求，未重试／保存。剩余卡点为该错误的具体原因；不能声称JSON／V2通过。
      - [ ] G3-D18c：默认切换未执行，研究默认仍为openrouter/free、修订5。最终逐行核对17表、旧AI、Provider、原用途／证明、来源控制、20条路由／环境／挂载通过，V2关闭；待D18b解除后再更新默认。
    - [x] G3-D19：原free入口结束诊断通过；原请求体22,542字节及摘要完全一致，唯一HTTP200／SSE完整／stop、同一实际NVIDIA免费模型保留推理，正文6,953字符、完整JSON／V2通过，费用报告0 USD。1/1、余9次，17表／旧AI／来源／20条路由／环境保持，V2关闭；旧失败结束原因仍未知，本次未复现，不据此修改解析器或模式。[证据](2026-10-24-g3-free-finish-diagnostic.md)。
    - [ ] G3-D20：官方保留数据开启／关闭完整更新均通过，唯一正式free请求在stream阶段失败；当时1/1、余8次冻结，实际用量／费用未知。V2关闭与旧AI／新失败／原行／来源控制／20路由／环境保护通过；策略两表新增保留。原响应事实未留存，当时同步又ENOSPC；D25新请求的HTTP200／Schema失败不能回填原根因，历史事实保持。[回执](2026-10-25-g3-formal-free-sdk-recovery.md)。
      - [x] G3-D20a：17个输入、原默认／用途、新闻准入预检通过；官方开启更新退出0，14目标模块一致，单次零费用策略、原行／来源／20路由及挂载核对通过。
      - [ ] G3-D20b：正式提交200／queued，唯一请求transport_unknown／stream／Provider returned error，任务failed／research_unknown_outcome、result=null；实际模型／用量／费用未知，未通过JSON／V2正向生成，不重试。
      - [ ] G3-D20c：未产出本次报告，正向报告／全部引用／历史及重建后反读均未执行；旧证据按不变输入保留，不代收本叶。
      - [ ] G3-D20d：安全关闭分支已过：官方关闭更新0、V2=false／无策略／canCreate=false，14模块及新失败摘要重建后保持，原行／来源／20路由／环境／挂载保护通过，策略新增保留。因无本次报告，正向报告重建反读仍缺，保留未勾选。
    - [x] G3-D21a：响应观察与脱敏合同本地实现通过；获准的版本数组类型与等价嵌套断言均已修正。受影响测试／类型／构建、默认lint／格式通过，Schema33／Server420项未变证据复用；只读对照确认断言复杂度27恢复增量基线26，存量方法30／测试26告警保留。原请求、解析、重试、结算和业务配置未改，不代表目标已部署。[本地证据](2026-10-25-g3-http-response-local.md)。
    - [ ] G3-D21b：D21a／D22 本地响应与 Store JSON 证据保留，D23 前置解除、D24 快更完成。D25 经正式 update 将 D21 固化镜像，Server／Worker 各 15 项及实际 Schema 一致；已取得真实 HTTP200／完整SSE响应诊断（329字节）与失败记录重建保持，最终 capabilities200／canCreate=false、V2=false。新正式报告／引用／成功历史仍未通过，保留未勾选；余7次冻结。[真实响应与部署回执](2026-10-25-g3-single-formal-response.md)。
    - [x] G3-D22：本轮授权内的零真实调用 D20 故障特征对照完成；未发现固定反例证明的本地业务缺陷，没有生产补丁。现有 D21 可区分本轮场景，但目标部署及原正式 G3 仍未验收；本轮模型／部署／目标配置／业务写入均为 0，余 8 次冻结。[路径、矩阵、指纹与下一次核心问题](2026-10-25-g3-fault-signature-matrix.md)。
      - [x] G3-D22a：盘点原四组测试及实际安装依赖，核对 D20 路由、错误包装、观察器启用条件和快照时机；沿用原 RSP1～RSP4，补充 RSP5 对照边界。
      - [x] G3-D22b：在原测试补齐 A～F 和 fetch 同文案／正常 EOF 子分支，保留原 401 对照；全部九场景比较旧合同／V2，每次实际 fetch=1。先取得观测再固定错误／计数／响应／包装断言，四组指定测试及两组单测共 40 项通过；最终矩阵文件 9 项复验通过，余 31 项输入未变复用。最终类型／规范／格式通过，原复杂度 26→26，没有新增告警；原失败诊断测试补充精确地址外网阻断。
      - [x] G3-D22c：候选排序与反证、D20 与当前代码可比边界、D21 足够性及下一阶段唯一问题已记录；A 完全匹配但 E2 也可匹配，标准 SSE error 在当前有效观察链先计 1 帧。未证明本地业务缺陷，生产补丁及修复三段反例不适用；没有新增诊断留存。工具入口／路径异常与设计内负例分开记账，G3-D8／D20／D21b 保持未完成，不自动进入部署或真实采样。
    - [x] G3-D23：本轮部署前置范围完成；保留现有 WIP、HEAD 和空索引，模型／部署／目标配置／业务写入为 0，余 8 次冻结。三条手机引用解除，capabilities 当前代理路径定位，目标模块核对完成；D21 未部署，D8／D20／D21b 保持未完成。[证据与指纹](2026-10-25-g3-d21-preflight.md)。
      - [x] G3-D23a：原门禁基线精确失败 3 条；手机改用自有四份合成字段及公共 Schema 工厂，原生成脚本保留且不执行 Server 算法。修复后原边界命令通过、脚本 SHA-256 不变；9 项定向、手机 src 类型及新增测试聚焦类型通过，原 JSON 摘要及四字段语义保持；手机原任务同步。首次命令误扫验收包的失败单独保留，未改包或排除规则。
      - [x] G3-D23b：仅四次预定 GET 对照：Context Mode 无代理环境变量、回落 macOS 127.0.0.1:7890，默认空 502；同一 Python 显式直连返回 200／canCreate=false，与宿主默认／直连摘要相同。目标 handler 一致且为只读；未修改系统代理、环境或目标配置。旧 502 无原响应，不补造其历史来源证据。
      - [x] G3-D23c：Server／Worker healthy、SDK 版本一致，Server V2=false／无策略；实际 Schema 包入口核对后，每面 15 模块为 7 一致／5 不同／3 缺失，D21 尚未部署。实际项目编译器内存发射的 10 个 AI 模块均与宿主产物一致、诊断 0，无产物写入或镜像构建；D22 的 30 个输入未变。目标路径／单文件转译方法问题已纠正并记账，未误报包缺失或源码过期。
    - [x] G3-D24：本轮授权的 D21 当前运行态部署完成；最小 thesis-ledger 目标通过正式 sync-code.sh 更新 Server／Worker，不更新镜像。双面 15 项一致、capabilities 200／canCreate=false，V2 关闭／无策略；22 表、配置、挂载及原 D20 失败保持。本轮模型 0、余 8 次冻结，不 stage／commit，G3 总验收及真实响应／镜像重建保留未完成。[完整回执](2026-10-25-g3-d21-deployment.md)。
      - [x] G3-D24a：D22／D23 输入未变证据复用，脚本语法退出 0；部署前 22 表、环境／挂载／文件摘要基线已记录，AiRun／回测／编写／优化无非终态任务。实际 database／owner／结构 head 核实，不隐式触发模型或更改配置。
      - [x] G3-D24b：两次正式调用的运行／镜像／四清单／Prisma 整目录预检均通过。首次因升级环境缺 node 在构建前段退出 1，尚未同步；核实现有 Node v24.18.0 后以一次性 PATH 重新执行同入口，四包构建及双面快更／重启／健康退出 0。没有安装依赖、改持久环境、绕过门禁或改用完整更新，镜像保持不变。
      - [x] G3-D24c：Server／Worker 实际模块各 15 项与宿主一致，实际 Schema 包响应文件存在且 runtime.httpResponse=true；SDK 版本保持，明确直连 capabilities 200／canCreate=false。22 表完整摘要／D20 行／环境／infra 文件／五容器 ID 镜像挂载保持，只有两个目标重启；启动后有界日志无错误级／缺模块／缺表信号。只验当前可写层，真实模型／重建持久化及正式 G3 未验。
    - [x] G3-D25：本轮单次正式新请求及失败收敛／关闭保护已执行；结果未通过 G3。openrouter/free／shadow／recent-changes，实际 1 次、费用约束 0 元，首次失败后无新增模型发送，余7次冻结；V2已恢复关闭。新提交与冻结材料独立于D20，旧失败、数据与WIP保留，未stage／commit。[证据](2026-10-25-g3-single-formal-response.md)。
      - [x] G3-D25a：官方免费定价、默认修订5／原用途ready、两面15模块／实际Schema、新闻准入及22表／7条旧AI／来源四表／20路由／环境挂载基线核对；单次策略和官方关闭步骤已准备。30个已验输入保持，复用D22／D23范围。
      - [x] G3-D25b：最小thesis-ledger正式update开启成功，实际包一致后仅提交新请求一次；fetch1、HTTP200、完整SSE／stop，合法JSON未通过完整V2合同，failed／research_schema_invalid。用量5613／11349 token已报告，费用仅估算0USD；实际费用未知。11份冻结证据完整性及最终请求摘要同体核验通过，离线核验真实调用0。
      - [x] G3-D25c：失败后停止新增发送，未进入成功报告／引用验收。首次关闭ENOSPC且daemon离线，现有恢复入口普通重启超时，后续受控核查已就绪、强制分支未触发；正式入口自动整备空间后关闭退出0。V2=false／无策略／capabilities200且canCreate=false，两面各15模块一致；22表原行、7条旧AI、新失败／11工具记录、来源四表／20路由、环境／配置／挂载保护通过，失败详情与历史反读保持。infra恢复分支11项替身测试通过，真实强制动作未验。
    - [ ] G3-D26：先确认上游正文，再分析校验；本轮只读追查与离线取证准备，剩余7次冻结，不部署、不改配置／业务数据，不stage／commit。
      - [x] G3-D26a：只读核对D25完整AiRun与非冻结／Prompt字段、诊断文件、保存逻辑和原容器；正文摘要无对应原文，result=null，原容器已移除，当前为json-file日志，未找到独立正文归档。原失败记录保持，不用新响应回填历史。
      - [x] G3-D26b：独立response.clone取证入口完成，8项协议／有界／防重复测试及完整SDK离线fixture通过；D25最终请求22517字节／摘要匹配，SDK schema_invalid时上游正文仍逐字取得，真实调用0。只读复核发现Docker挂载数组顺序不稳定，比较前按完整属性排序，仍保护容器身份／启动时间与全部挂载字段；最终22表／旧AI／来源／环境／挂载保护通过。入口仅作为准备证据，后续由D27正式trace承接。
      - [ ] G3-D26c：仅在用户明确解除一次调用冻结后执行同体新采样；最大1次／0元约束、不重试，V2保持关闭，不写业务表。先交付上游正文私有文件及响应事实，再独立校验；当前未获该新调用授权，不能执行，剩余7次保持冻结。
      - OpenRouter历史正文存在独立只读接口，但仅当请求发生时启用了私有输入／输出日志。现有推理Key查询analytics/meta实际403，需要管理Key才能列历史；浏览器入口两次创建超时，尚未取得该条generation ID／正文。未创建或扩大凭据权限，也未开启日志设置；不能据本地缺失断言上游未留存。用户随后明确选择实现正式节点trace，继续D27，不反复索要ID。
    - [ ] G3-D27：正式请求链trace代码与离线验证完成，门禁解除及部署由D28承接；该阶段真实模型0，余7次冻结、V2关闭。真实选中任务捕获及重建持久化仍未验，G3整体未通过。
      - [x] G3-D27a（状态与接口）：AI拥有的引用、节点／artifact合同及0700／0600私有存储落地，响应／artifact各2 MiB、单trace8 MiB；未完成反读为incomplete且不回写。`capture-v1`显式创建只保存新任务引用，run／owner／attempt绑定，默认关闭；旧提交复用、身份／范围及V2门禁保持。[证据及离线样例](2026-10-25-g3-request-trace.md)。
      - [x] G3-D27b（执行面）：正式SDK fetch接缝使用原生／受控HTTP adapter，同一响应状态／headers／字节继续交给SDK；逐requestId单次派发。SDK输入／Schema、最终请求、脱敏payload、独立原模型正文、SDK输出／异常链及独立校验路径均可读取；发送前保存失败本地阻断，发送后保存失败保留原业务结果。受控编译后样例物理HTTP1、真实模型0、完整V2 Schema拒绝时正文仍独立保留。
      - [x] G3-D27c（消费面）：接入Executor领取、SDK生成、业务结果构建、StateStore原结算／CAS与最终状态反读；父子节点、原操作返回值及终态事实保持。受限只读CLI、身份／路径／symlink／大小／摘要核验、凭据／Cookie／嵌套错误JSON／推理脱敏已验证；共享日志只记录索引／状态。trace反向依赖门禁及全仓boundaries通过；目标数据库并发／启动／卷验收仍归D27e。
      - [x] G3-D27d（本地验证）：受控HTTP+真实SDK+业务状态闭环覆盖合法JSON但Schema失败、成功、HTTP错误／SSE错误、无响应／取消、保存失败与默认关闭；原物理fetch1、字节／正文保留、校验路径和节点I/O证据保持。原全仓门禁阻断已由D28a解除，真实部署／模型验收仍独立保留。
        - 已通过：新trace33项、最终定向10文件110项；Server包419文件3437项通过／356项条件跳过，后续未完成反读增量由最终定向覆盖；Server类型／build、修改范围lint、边界、依赖8包、密钥16843文件、文件尺寸ratchet、diff check。Server同guardrails规则1237文件0错误，保留179项警告。
        - 原阻断已解除：D28a按Git源码归属与精确文件列表修复入口，全仓8组2665文件guardrails、边界、依赖图和文件尺寸门禁通过；保留验收包，未调整阈值／ignore／project service许可。旧失败见D27证据，新结果见D28。
      - [x] G3-D27e（部署验收）：D28无模型部署、D29镜像固化及TLS失败链持久化通过；D30独立获准单次补验完整捕获真实HTTP200、上游两字符正文、SDK相同文本／JSON解析错误及业务终态，18文件与D29旧12文件在双端重建后保持，见[D30回执](2026-10-25-g3-upstream-trace-acceptance.md)。本叶为trace部署／捕获／持久化通过；业务报告仍failed，G3整体未通过，V2关闭、余5次冻结。
    - [x] G3-D28：验收快照门禁阻断解除，并经infra正式最小thesis-ledger快更部署trace，独立无模型运行态核对通过。真实模型0、V2关闭、余7次冻结，原业务数据／配置／挂载及验收包保留，无stage／commit。[完整证据](2026-10-25-g3-trace-deployment.md)。
      - [x] G3-D28a（门禁源码归属）：`lint-workspace.mjs`＋职责单一的清单模块／测试落地；6项测试证明Git已跟踪＋未忽略WIP并集、已跟踪ignored源码保留、真实违规失败、中文／空格路径、删除及Git失败关闭。全仓原guardrails8组2665文件、边界、依赖图／文件尺寸通过，11份trace源码及未跟踪研究Controller均纳入；无release输入，未改ignore／阈值／project service许可。验收包原位保护基线已保存，部署后再对照。
      - [x] G3-D28b（兼容性与保护预检）：5容器健康，目标无queued／running研究，V2=false、capabilities200／false；22表、8条AI、DSA控制／20路由、环境及挂载基线已保存。正式sync-code内置Server／workspace清单、完整Prisma与容器／镜像预检通过，无需完整更新；复用D27未变源码的高成本测试。
      - [x] G3-D28c（正式部署）：从infra执行 `./scripts/sync-code.sh thesis-ledger` 退出0；仅Server／Worker重启，容器与镜像ID保持，未执行结构或外部卷变更，未回退到update。仅可写层更新，不代表镜像已更新或重建后仍保留trace。
      - [x] G3-D28d（无模型运行态验收）：两面各Server2037／Schema579／domain243／shared3文件摘要均与宿主一致，实际Schema物理包与runtime.httpResponse已核对；两面受控SDK／trace仅在内存运行，各1次受控transport、外部请求0，Schema拒绝时原正文与SDK文本一致。5容器健康、重启后有界日志无错误级／缺模块／缺表／ENOSPC信号；私有根位于共享RW卷，UID100可写父目录，目录尚未创建，实际文件捕获未代收。capabilities200／false、待执行研究0、22表完整摘要／旧AI／DSA控制与路由／环境／挂载保持。旧22,452份验收文件元数据与359份TS内容摘要保持；并行batch6新增文件与其他WIP保留。真实模型采样、实际选中任务捕获与重建反读保持未验。
    - [ ] G3-D29：验收一次真实模型trace及同镜像重建持久化；最多1次free请求／0元约束／失败即停，其余6次冻结。新任务与trace独立保留，旧失败不改写；完成后V2恢复关闭、策略移除，不stage／commit。
      - [x] G3-D29a（预检与正式入口）：22表、旧AI、DSA、环境／挂载、三仓10113项WIP文件及46项执行源码指纹已保存；原默认修订5、V2用途ready／native_schema／推理默认、免费路由、空闲和单次锁通过。infra R1镜像复用及原门禁回归通过；准备同镜像恢复关闭／无策略命令，未变应用证据沿用D28。
      - [x] G3-D29b（镜像与窗口）：正式 `update.sh thesis-ledger` 退出0，新镜像 `sha256:d1e5369eefa33638b2847dc30563c84e41a1511e836a11200bd25a5467c738de` 含trace；两消费者及实际Schema、Server2037／Schema561／domain228／shared3项与当前源码产物一致。宿主旧dist另有33项已无源码的残留，未删除WIP，未计为新镜像缺失。临时V2＋单次零费用策略、capabilities200／canCreate=true、22表及旧AI／DSA保持、无待执行研究和双端离线探针通过，尚无真实调用。
      - [ ] G3-D29c（该次真实单次未通过）：run=`b0ce2e5e-6cb6-4cef-8160-42221b875d47`／trace=`ba68ab6e-6b05-4bad-be33-f2338925a718`／attempt=1在TLS建立前断开，无上游HTTP状态／正文，业务failed／research_unknown_outcome。失败trace完整，1次nativeFetch、12文件，未重试。该次历史缺口不以新正文回填；之后的新授权及上游正向trace由D30独立验收，原文件保持。
      - [x] G3-D29d（关闭与重建）：同镜像正式复用入口退出0，两消费者身份改变；同卷12文件／123169字节、manifest和数据库终态逐字节及权限归属保持。V2=false／无策略、capabilities200／canCreate=false、pending=0，22表旧行、原环境、全部挂载、旧AI及DSA控制／20路由保持，五服务健康。
      - [x] G3-D29e（评审与交付）：[D29回执](2026-10-25-g3-real-trace-persistence.md)及同名JSON已记录请求体可复算摘要、SDK错误原文／cause链和私有路径、无上游正文、费用未知、关闭重建与数据保全。随后仅TLS握手成功、HTTP／模型请求0；原断链节点仍未知。D29c与G3保持未勾选，不将失败捕获完整视为真实报告成功，后续请求需新授权。
    - [x] G3-D30：独立授权仅用1次，真实上游正文／SDK／业务trace和同镜像重建持久化通过；报告仍failed／research_schema_invalid。正式关闭与旧数据保护通过，余5次冻结，无stage／commit。[完整回执](2026-10-25-g3-upstream-trace-acceptance.md)。
      - [x] G3-D30a（状态与执行预检）：新提交与单次锁已准备；22表、9条旧AI／99条旧工具、DSA控制／路由、环境／挂载及三仓WIP基线保存。原默认修订5／用途ready、46项未变执行源码、双端TLS握手通过；正式复用D29镜像开启退出0，两面Server2037／Schema561／domain228／shared3及实际Schema一致，V2＋单次零费用策略、capabilities200／true、pending=0通过，派发前业务原行保持。
      - [x] G3-D30b（单次执行）：run=`215dc5cf-9d50-4a6a-ae9d-6f8dfb7a6f87`／trace=`e7418aa5-7513-4f3a-8951-9336c4f96840`／attempt=1；单次HTTP200／完整SSE／stop／DONE，原assistant仅2字节 `{"`，与SDK文本及SHA相同。SDK实际AI_JSONParseError、独立JSON检查无效，业务failed／research_schema_invalid；captureStatus=complete，无补发或源码／模型／Schema修改。
      - [x] G3-D30c（消费与部署验收）：同镜像正式关闭退出0，两消费者身份改变；本次18文件／2201285字节与D29原12文件在两端逐字节及权限归属保持。V2=false／无策略、capabilities200／false、pending=0，五服务健康；22表全部旧行、9条旧AI／99条旧工具、DSA、环境和挂载保持，仅新增本次1任务／11工具；报告明细／历史如实反读failed／missing。
      - [x] G3-D30d（评审与交付）：[D30回执](2026-10-25-g3-upstream-trace-acceptance.md)及同名JSON固定原文／SDK／SSE私有路径、generation ID、wire与保存摘要、三层归因、用量／费用来源、原配置恢复和双trace重建证据。Provider自报cost=0与业务冻结定价估算0 USD分开；为何上游stop时只生成两字符及G3成功报告仍未完成，余5次冻结。
    - [ ] G3-D31：只读核对D30实际stop／max_tokens／reasoning／response_format，追查两字符正文原因；无新模型调用、部署、配置或业务修改，余5次冻结，保留原WIP／验收包，不stage／commit。
      - [x] G3-D31a（原参数）：原wire摘要可复算；stop未发送，max_tokens=20000，reasoning／reasoning_effort／include_reasoning未发送，response_format为json_schema／name=response／strict=true，Schema8671字节／SHA与SDK诊断相同；SDK maxOutputTokens=20000，无截断或取消事实。
      - [x] G3-D31b（默认与声明）：Nvidia官方说明默认完整推理；OpenRouter当前同canonical免费Nvidia端点声明response_format／structured_outputs支持、max_completion_tokens=131072。声明不能证明该次转发参数或严格解码实际生效；原Provider native_finish_reason=stop，尚无20k上限耗尽证据。
      - [x] G3-D31c（本地排查）：46项执行输入未变；SDK maxOutputTokens→max_tokens映射、未发送stop、system／user消息且无已检查终止标记均核对。Draft-07元Schema和完整generation样例通过，原SSE两个终止帧均stop／native_stop且无stop_reason。保留Ajv tuple警告及长度0／1／2／3反例；JSON Schema比Zod宽的确定性差异单列D32，未改应用或Schema。[完整证明](2026-10-25-g3-request-parameter-audit.md)。
      - [ ] G3-D31d（根因确证未完成）：最早异常为OpenRouter返回的content仅2字节；未发现客户端显式stop、本地20k限额耗尽、timeout／取消或SDK截断。vLLM37362相似报告仅为离线Nano／Guidance候选，过期关闭无修复结论，本次服务后端未知。确证仍缺当次OpenRouter→Nvidia真实转发body、Nvidia原始stop_reason／内部限额及服务版本；原I/O日志和debug回显未启用，现有记录不可补造，未追加调用或发送外部消息。
    - [ ] G3-D32（已确认待后续修复）：native Schema中的derived numericClaim.operands长度约束丢失，长度0／1／3被JSON Schema接受但Zod拒绝。D40又取得实际Qwen HTTP400／8006：同位置的Draft-07数组items不被对方接受，要求Draft2020-12的prefixItems。按RSP15治理通用Schema转换的方言与语义一致性，保留严格业务规则；先离线0／1／2／3及完整样例，再按变更范围验SDK／生成Schema。应用修复未实施，不归因为D30两字符或D39引擎500的确定根因。
    - [ ] G3-D33：用户明确授权的固定D30实际Nvidia模型、仅本次关闭reasoning的1次零费用对照已执行并失败停止，余4次冻结；在线首chunk超时、后补控制台JSON通过但Zod引用校验失败，业务验收未通过，不能自动补发。不改默认配置／数据／WIP，不stage／commit。[执行回执](2026-10-25-g3-reasoning-off-control.md)。
      - [x] G3-D33a（控制与预检）：D30原messages／Schema冻结，canonical免费Nvidia端点核对；离线SDK探针通过，外部模型0，实际请求仅model／reasoning两处变化，stop缺省／max_tokens20000／response_format及其余字段不变，停止与限额漂移被拒绝。46项源码及宿主编译产物与D30匹配；10条旧AI／110工具等22表、默认修订5、环境／挂载及三仓WIP基线保存。宿主Node24.18、目标24.21，SDK／编译代码相同，记录环境差异；V2关闭，无业务写入。
      - [ ] G3-D33b（单次已执行，在线接收及业务接受未通过）：run=a4c1a658-3ab4-4f95-9cb9-b96835443ed2／trace=7a98b353-fe89-4112-b91c-58fdec8b6170，仅派发1次；HTTP200后30秒首语义chunk超时，SDK cancelled，captureStatus=incomplete／response_read_error，本地正文0字节、无DONE。只读generation元数据确认canonical Nvidia／推理0／原生输出2155／stop／费用0／耗时45445ms；后补控制台正文按D33e独立核验，未回写本地响应，失败不补发。诊断未写AiRun或业务结果，完整在线接收和业务正向验收仍缺。
      - [x] G3-D33c（关闭与保全）：V2始终关闭、无临时策略、canCreate=false／pending=0；默认修订5／22表／10旧AI／110工具／Provider／DSA／环境／容器与挂载保持。现存trace的9份产物82047字节可反读且摘要一致，网络响应仍不完整；三仓HEAD／配置／空暂存区和原WIP核对，新增模型请求仅1次，余4次冻结。
      - [x] G3-D33d（判读并保留缺口）：请求仅model／reasoning两项变化；上游reasoning_tokens由10103变0，原生输入仍5601、输出10106变2155。SDK先于上游记录的45445ms结束停止读取；控制台后补证实本次JSON完整、两字符现象未重现，业务引用校验仍失败。单次结果与宿主／路由差异不足以确证内部原因；D31根因、D32约束差异和G3正式报告仍未完成，本次失败后未改超时或重试。
      - [x] G3-D33e（控制台正文补证）：用户提供同generation完整completion；私有独立副本／摘要与来源明确，不改原incomplete trace。JSON.parse及原wire Draft-07 Schema通过，Zod报告“研究动作引用不存在的断言”，定位nextSteps[1].claimId=ic-price-baseline-missing仅为条件id。同版本合成SSE探针返回schema_invalid，外部0；算术复核应约1.25%而rationale写1.26%，派生项未列numericClaims、五日方向仅用当日关系，作为人工内容问题保留，不冒充自动拒绝项。46项源码／原manifest未变，无新增业务写入，余4次冻结。
    - [ ] G3-D34：自适应超时与同Provider／模型重试的实现及工程验收由[独立Task](../../archive/tasks/2026-10-25-ai-adaptive-execution.md)所有；本地109项和隔离缓存通过，D35已固化新代码，D36补完整134秒流与原样失败收敛。T5真实成功对象仍未通过。原D33 trace不回写，不放宽业务校验或改变默认配置；现行预算以D36为准。
    - [ ] G3-D35：RSP18单次正式复验已执行并因上游HTTP404停止，正向报告未通过；本次1/1、余3次冻结，未重试或改变默认模型／推理。[回执](2026-10-25-g3-adaptive-runtime-acceptance.md)。
      - [x] D35a（状态与预检）：D34生产源码摘要未变，109项本地验证复用；53项执行输入、原22表／10旧AI／110工具、环境／挂载及三仓WIP基线保存，V2=false／无策略／pending=0。默认修订5／OpenRouter/free／native_schema就绪，新提交与单次锁入口准备，模型0。
      - [x] D35b（目标部署）：初次依赖I/O失败及入口自带重试后退出1；经已核对的仅构建代理参数重试正式update退出0，未改配置文件。新镜像df411ebf…固化D34代码，双角色健康、Server2052／Schema561／domain228／shared3份清单与当前编译输入一致，实际Schema及自适应模块核对，capabilities200／true；53项执行输入／默认修订5保持。
      - [ ] D35c（单次已执行，正向输出未通过）：run=7d957e4e-372a-4c8a-bd3c-d713950d9ae2／trace=cd858b89-f1fc-45da-a20e-dc48552723d7；SDK实际三项超时299935ms／cold_start／maxRetries0，唯一HTTP约2.6秒收到完整404错误JSON808字节，无模型正文。Nvidia Function对account不可找到，另附Nvidia500／502与Phala429内部路由记录；SDK仍归transport_unknown，账本unknown、业务research_unknown_outcome，未补发。generation只读GET亦404，用量／实际费用未知。
      - [x] D35d（关闭与持久化）：同一新镜像经正式入口关闭退出0、无再构建；两消费者重建，V2=false／无策略／pending=0、capabilities200／false及五服务健康。双端本次16文件和D30旧trace逐字节／权限／归属保持；原22表旧行、10旧AI／110工具、默认／环境／DSA／挂载不变，仅新增本次1任务／11工具，现11／121。三仓WIP／HEAD／配置及空暂存区保全，不stage／commit。
      - [ ] D35e（失败消费已验，成功消费缺口保留）：失败明细／历史GET200、failed／research_unknown_outcome／missing与数据库一致；没有成功报告／全部引用／成功历史／Web可验，仍未通过。真实trace完整捕获与业务正向结果分别判定；本次1/1、余3次冻结，费用上限0不冒充实际费用0，准确HTTP拒绝分类与D31／D32历史缺口保持。
    - [ ] G3-D36：RSP19单次已执行，HTTP200完整流仍只有2字节正文，G3正向未过；默认路由／推理／严格V2保持，失败停止，本次1/1、余2次冻结。D35原404及generation记录保持。[本次回执](2026-10-26-g3-repeat-acceptance.md)。
      - [x] D36a（身份与预检）：当前凭据SHA-256及标签首尾与用户贴出的控制台记录一致，纯本地比对、外部模型0、未输出Key。53项执行输入／已验镜像df411ebf…一致，V2=false／无策略／pending=0，默认修订5／OpenRouter/free就绪；11旧AI／121工具及22表、配置／挂载基线保存，新提交身份已冻结。
      - [x] D36b（开启与模块）：正式update指定df411ebf…复用、退出0，双角色／实际Schema／自适应模块与当前编译清单一致，capabilities200／true、单次策略正确，无新构建，53项源码指纹保持。
      - [ ] D36c（单次已执行，正向对象未过）：run=93ca715b-6945-4cce-bca8-2019723df08c／trace=7ce8572b-8928-48f6-ad5b-6222c929a63f；唯一HTTP200、930520字节完整SSE、stop／DONE，正文仍为2字节 `{"`，独立组装／保存／SDK一致。实际超时299910ms、SDK重试0，总耗时134231ms；schema_invalid、无报告，失败未补发。generation GET200确认canonical Nvidia、5609／7345／推理7342、费用0；用户图示Phala429后Nvidia200为内部路由，未授予新调用。
      - [x] D36d（关闭与保全）：同镜像正式关闭退出0，无新构建，V2=false／无策略／pending=0、capabilities200／false、五服务健康。两消费者重建后本次20文件及D35原16文件逐字节／权限／归属保持；原22表旧行、11旧AI／121工具、配置／来源／DSA／环境／挂载保持，仅新增1失败任务／11材料，现12／132；WIP／HEAD／配置及空暂存区保全。
      - [ ] D36e（失败消费已验，成功缺口保持）：明细／历史GET200、failed／research_schema_invalid／missing与数据库一致；上游正文JSON语法已无效，没有成功报告／引用／成功历史／Web可验。OpenRouter自报费用0与业务冻结定价估算0 USD分开，本次1/1、余2次冻结；D31内因、D32及G3正向保持未完成。
    - [ ] G3-D37：Cloudflare／GLM-4.7-Flash 唯一冻结输入 SDK 对照已执行，HTTP200完整流／stop／DONE却无正文，SDK报schema_invalid／empty；4.803秒结束，无超时、重试或补发，使用1/1、余1次冻结。用户确认Workers Free，上游报告3842输入／0输出／21.131 Neurons；重复终止帧不重复记账。离线重放复现空输出，wire Schema及有效样例通过标准验证，供应商内部原因与G3正向仍未确证。V2始终关闭，原22表／配置／容器／WIP保持，无部署或业务写入。[执行回执](2026-10-26-g3-cloudflare-control.md)。
      - [x] D37f（具体已知参数定位）：第一方源码明确记录GLM-4.7-Flash的max_tokens会返回空内容、3/3实测并过滤；trace实际发max_tokens20000，本地SDK固定字段映射已核对。模型Schema只读GET200、审计读取403均留证；不将接口类型校验通过当作运行时兼容证明，不新增Server专属适配。
    - [ ] G3-D38（上游默认上限实际对照，正向未通过）：用户授权最后1次，SDK不传maxOutputTokens，实际HTTP不含max_tokens／max_completion_tokens，其余D37请求字段保持；HTTP200但原始body为0字节，0条SSE、无结束原因或DONE，SDK报transport_unknown。失败停止，当前余量0；没有合法研究对象，不能确认max_tokens为唯一根因。[实际回执](2026-10-26-g3-cloudflare-default-limit-control.md)。
      - [x] D38a（派发与原始响应）：nativeFetch1、重试0、2.954秒EOF，完整trace及请求摘要反读；无输出上限、无stop／显式reasoning，严格Schema与材料保持，没有超时或取消。
      - [x] D38b（响应回放与控制台）：HTTP body为0字节，在禁网环境重放同版SDK复现无结束原因错误；用量及实际响应模型未知，未补填0或默认值。控制台账户一致、18:45–19:00为21.13 Neurons用量汇总，与D37的18:52请求及21.131 Neurons吻合；D38的21:57仅确认HTTP派发及Cloudflare入口响应，未取得实际模型执行或新增用量证据，未补发。
      - [x] D38c（保护反读）：原22表／旧AI／DSA／Provider／默认值／容器环境及挂载保持，V2=false／canCreate=false；三仓HEAD／空暂存区及2346项原WIP状态与已捕获文件摘要保持，不部署、不改业务配置或数据。
    - [ ] G3-D39（网关日志与实际上游错误，正向未通过）：按官方文档和用户新增单次授权发送无输出上限请求，控制台／日志API取得EngineCore内部500；客户端HTTP200空stop流未透传该错误，SDK无法生成对象。引擎内部堆栈及修复验收未取得，当前余量0。[完整回执](2026-10-26-g3-cloudflare-gateway-logs.md)。
      - [x] D39a（日志前置）：用户明确授权仅当前账户增加AI Gateway Read/Edit，保留现有Token及原权限，原Key网关读取403→200；本次请求自动创建default标准计费网关并逐请求开启日志／正文，未修改应用Provider默认配置。
      - [x] D39b（跨层核对）：日志ID与响应头、控制台22:56:44及本地trace一致；网关完整native响应含InternalServerError／500，客户端SSE仅两条空终止用量帧／DONE。SDK前错误未透传，实际SSE离线重放复现解析失败，不将本轮原因回填到历史请求。
      - [x] D39c（保护与预算）：nativeFetch1、SDK重试0，新增授权1/1已用、余量0；原22表／旧AI／DSA／应用Provider及默认值／环境／容器挂载不变，V2=false／canCreate=false，2347项原WIP、三仓HEAD及空暂存区保持。
    - [ ] G3-D40（Qwen单变量对照，正向未通过）：仅将模型改为@cf/qwen/qwen3.8-27b，HTTP400／8006明确拒绝response_format中operands的数组items；要求prefixItems／Draft2020-12，确认本次方言兼容缺口。未改Schema、未补发、未新增权限或网关配置，本轮1/1、当前余量0。[完整回执](2026-10-26-g3-cloudflare-qwen-model-control.md)。
      - [x] D40a（单变量与原文）：模型以外请求正文完全相同，仍省略输出上限；trace、网关日志及客户端400错误对应同一请求，实际HTTP错误离线重放通过。
      - [x] D40b（保护反读）：原22表／旧AI／DSA／应用默认配置／运行态不变，复用Token和default网关，V2=false／canCreate=false；三仓HEAD／空暂存区与2348项原WIP保持，无部署或stage／commit。
    - [ ] G3-D41（条件迁移2020-12，未推广）：本地候选通过；Qwen实际HTTP200后约300秒超时，网关499，未获得合法研究对象。失败停止，GLM未派发、余1次冻结；trace／网关正文截断，双模型与迁移条件未满足。业务Zod、应用源码及默认值保持。[实际回执](2026-10-27-g3-schema-2020-candidate.md)。
      - [x] D41a（隔离候选与本地语义）：7个现有生成契约的2020-12元Schema／编译、完整研究样例、tuple0／1／2／3及可选／rest、严格对象、原Zod细化／单次转换通过；两模型受控SDK出站0外部调用，原输出层8项测试通过。仅私有候选及说明文档，不改业务Zod／依赖／已保存配置。
      - [ ] D41b（真实正向未通过，失败停止）：Qwen1次HTTP200后TimeoutError／300057ms，网关日志499；保留前缀有reasoning而无正文，trace与网关正文均截断，冻结数值／引用验证未进入。SDK重试0、无输出上限，GLM未派发、1次冻结，完整响应与双模型兼容缺口保持。
      - [ ] D41c（条件未满足，禁止推广）：候选仍在私有目录，应用通用输出层、native_schema就绪指纹及目标运行态保持。先处理长流超时与采集容量、满足受控重验条件，双模型及本地门禁均通过后才推广同一候选；本轮不补发、不延长时限、不更改采集配置，部署与正式G3另列。
      - [x] D41d（保护与证据分层）：原22表／旧AI／DSA／默认配置／环境／容器挂载、三仓HEAD／空暂存区及2349项原WIP保持；V2=false／canCreate=false。完整trace断言的失败日志保留，另行只读确认incomplete及timeout失败并通过数据保护比较，不将文件可反读当作正文完整。
    - [ ] G3-D42（超时治理与部署通过，真实G3未验）：实现与工程证据由[原治理Task](../../archive/tasks/2026-10-25-ai-adaptive-execution.md)T6～T16所有。Server3573、Schema1353、Desktop79及隔离PostgreSQL79项通过，缓存与仓库门禁通过；首次磁盘满失败后，同一正式入口恢复更新退出0，双角色各1549份实际JS与当前编译输入一致，capabilities200／V2=false及原数据保护通过。模型调用0，D41候选及冻结额度保持，T5真实G3仍未执行。
    - [ ] G3-D43（Qwen候选唯一复测失败，流缺终态）：正文与D41相同，当前SDK／600秒统一预算下HTTP200后约305秒EOF；网关duration300090ms，13619帧无finish_reason／DONE，7665字节正文JSON截断，SDK报NoFinishReason／transport_unknown。11份脱敏trace完整反读及占位reasoning结构重放通过，35表／运行态／配置／WIP保持；本次1/1已用、GLM旧1次冻结，V2关闭且候选未推广。具体内部300秒来源未确证，正式G3未通过，见[D43回执](2026-10-27-g3-qwen-timeout-retest.md)。
    - [ ] G3-D44（仅延长本地总预算，唯一对照失败）：同一正文、本地总预算1200秒且其他阶段等待不变，网关仍在300224ms结束；14211帧无finish_reason／DONE，3580字节正文JSON截断，SDK报NoFinishReason。完整6126467字节网关存档与客户端投影／正文一致，trace11份反读通过。新增1/1已用并失败停止，GLM旧1次冻结，候选未推广；当前无应用容器，目标数据库／正式生命周期验收未执行。见[D44回执](2026-10-29-g3-qwen-extended-timeout.md)。
    - [ ] G3-D45（绕过SDK直接HTTP，唯一对照失败）：系统curl发送同一22515字节正文，1200秒预算下HTTP200／305.311秒EOF，13553帧无结束原因／DONE、正文0字节，本地期限未触发。网关duration300266ms，完整5827331字节存档与客户端逐帧投影／正文一致；本次不执行SDK仍复现流异常，具体内部300秒组件未知。新增1/1已用并停止，GLM旧1次冻结、候选未推广；不改配置／业务数据，目标库／V2运行态当前不可反读。见[D45回执](2026-10-29-g3-qwen-direct-http.md)。
    - [ ] G3-D46（关闭思考curl单变量对照，唯一请求失败）：仅新增chat_template_kwargs.enable_thinking=false，其他D45字段／等待保持且无token上限；0思考输出、正文27860字节，但HTTP200／302.953秒EOF后无结束原因／DONE，整段JSON报Extra data。网关duration300299ms、完整4100401字节存档与客户端投影／正文一致。新增1/1已用并停止，旧GLM1次冻结，未进入原Zod／冻结数值或正式报告验收，候选未推广。见[D46回执](2026-10-29-g3-qwen-reasoning-off.md)。
    - [x] G3-D47（最小curl问候通过；不代收研究合同）：同Qwen、关闭思考、单条问候且无Schema／token上限，HTTP200／1.671秒返回“你好”／stop／DONE，0思考输出。网关duration506ms、cached=false，完整正文／用量一致；兼容端终态帧形状不同，未宣称逐帧完全一致。新增1/1已用，旧GLM冻结，复杂研究输入与结构约束原因仍未分离，正式G3及候选推广未完成。见[D47回执](2026-10-29-g3-qwen-simple-curl.md)。
    - [x] G3-D48（最小严格Schema样本通过；不代收研究合同）：短问候增加单reply字段严格2020-12 Schema，保持curl流式／关闭思考、无token上限；HTTP200／2.096秒返回完整匹配对象、stop与DONE，0思考输出。网关duration585ms、cached=false，完整正文／用量一致；终态帧形状差异保留。新增1/1已用、旧GLM冻结；完整研究Schema及长输入未独立验证，正式G3和候选推广未通过。见[D48回执](2026-10-29-g3-qwen-simple-schema.md)。
    - [x] G3-D49（短输入／完整Schema空事实分支通过）：174字符无材料短指令配原D46完整研究格式，curl流式／关闭思考／无token上限，HTTP200／11.784秒返回完整JSON、stop／DONE，原Zod通过；0思考输出，网关duration5229ms／cached=false，完整正文／用量一致，终态帧差异保留。新增1/1已用、旧GLM冻结；非空事实／数值／条件分支和原提示／长材料未隔离，正式G3与候选推广未完成。见[D49回执](2026-10-29-g3-qwen-full-schema-short-input.md)。
    - [ ] G3-D50（短输入单数字事实，唯一请求失败）：HTTP200、0思考输出，生成1条qualitative claim与field数值源12，但首对象违反原Zod／声明Schema，之后尾随围栏使整段Extra data。失败在取消前已成立，262.474秒主动终止唯一curl、网关499，未观察供应商自然EOF。客户端是网关存档前缀，取消导致末尾差异已保留。新增1/1已用、旧GLM冻结，正式G3及推广未完成。见[D50回执](2026-10-29-g3-qwen-single-numeric-fact.md)。
    - [ ] G3-D51（非流式响应未取得）：仅stream=false／删stream_options，60.623秒curl52、无HTTP头／状态／正文，本地期限未触发，实际JSON／Zod／数值校验未进入。网关完整列表无本次关联，推理与上游结果未知。新增1/1已用、失败停止无重试，旧GLM冻结，不能将链路失败当作非流式Schema结论。见[D51回执](2026-10-29-g3-qwen-nonstream-control.md)。
    - [ ] G3-D52（同请求非流式复验未取得响应）：相同D51字节／捕获函数／参数下60.620秒curl52，无HTTP响应，本地期限未触发。网关完整列表仍无本次关联，当前代理端口可TCP连接但关闭方未知；实际JSON／Zod／数字验收未进入。新增1/1已用、无重试、旧GLM冻结；不认定非流式Schema结论，正式G3与推广未完成。见[D52回执](2026-10-29-g3-qwen-nonstream-network-retry.md)。
    - [x] G3-D53（最小非流式基线）：同Qwen、reasoning关闭，159字节短输入、无研究Schema及token上限，唯一curl请求HTTP200／1.887秒／“你好”／stop／0思考输出。网关200／未缓存，完整正文与客户端内容、终止及用量一致。新增1/1已用、旧GLM冻结，不代收完整研究Schema或正式G3。见[D53回执](2026-10-29-g3-qwen-minimal-nonstream.md)。
    - [x] G3-D54～D57诊断证据与D57 SDK正向：预算前通用提示已实施，真实SDK正常stop／DONE，3条claims／5条数值通过原校验，网关正文一致，默认容量trace新进程反读通过。由[SDK Task J-G3](../2026-09-19-vercel-ai-sdk-integration.md#json-stream-acceptance)持有实现叶；历史失败独立保留，正式配置／目标运行态／实际持久化未验，审计工具ID仍为诊断占位，旧GLM冻结保持。见[持续诊断回执](2026-10-29-g3-nonstream-schema-diagnosis.md)。
  - 新闻范围更新历史（2026-10-23）：用户确认补齐原正式入口的受控更新分支，保留原截止日、到期日、来源启停及 20 条路由；首次业务采样当时获准 1 次、0 元，现已用尽。后续独立诊断采样与恢复以 G3-D1～D3 的当前回执为准。
    - [x] G3-N1：同一入口补齐两条精确新闻目标的显式范围扩展；写锁内核对旧版本／摘要、来源／凭据修订、有效期与启用状态，追加旧记录审计链。
    - [x] G3-N2：Node 10、原 worker 11、独立 SQLite 6 项共 27 项通过；覆盖更新／只读核验及漂移、续期、范围／来源、撤销／过期、凭据变化拒绝，首次新增保护不变。
    - [x] G3-N3：原来源单页实读、两条准入版本 1→2 及只读回验通过，起点 10 月 16 日，原截止／到期日保持；其他 7 条准入、启停、20 条路由及业务表保持。
    - [x] G3-N4：真实新闻准备、获准模型成功生成、报告／11 条引用／未知引用拒绝／历史及 Web 展示通过；同一原结果在最终完整更新后仍可读取，费用按冻结免费定价估算 0 USD。历史两次独立授权各 1/1 的失败事实保留；本次独立最多 3 次授权仅使用 1 次，反读失败后停止，获准修复复用原结果，无新增调用。V2 已关闭，原数据、来源启停与路由按确认保护。此项不代替 D6 尚未覆盖的真实失败流诊断。
  - 首次单次验收历史（2026-10-23）：V2 用途验证与新闻七日窗口准入均已解除；同一样本的真实 G3 请求实际使用 1 次，配置估算 0 USD，来源报告 5,644／9,441 token，但响应无法解析为 V2 对象，任务 failed、`result=null`。原默认 OpenRouter/free、修订 5 保持。正式保留数据开启／最终关闭更新均退出 0，`canCreate=false`；失败任务、11 条工具记录和唯一调用审计重启后保持，原受保护表、来源启停、20 条路由及挂载不变。该次停在模型结构化响应解析失败，见[原证据](2026-10-23-research-g3.md)；后续专项授权的成功报告、引用与历史由上方 G3-D7／N4 承接，原失败事实继续保留。
  - 研究默认更新（2026-10-23）：用户另行授权最多 3 次零费用用途验证后，已将默认从 LM Studio 切为 `openrouter / openrouter/free`。实际 1 次 `research-generation-v1`／`native_schema` 验证通过，费用按配置估算为 0 USD，默认修订 4→5，其他 Provider 与其他用途保持，见[切换证据](2026-10-23-openrouter-research-default.md)。该独立授权不恢复 G3 业务额度，真实报告、引用、历史及发布门禁仍未通过。
  - 新闻前置更新（2026-10-22）：DSA DG3 已补财联社全市场电报与见闻 A 股频道的 DSA/Docker/Market/Web、拒绝与保全，见[最新复核](../../reviews/2026-10-22-market-flash-news-dg3-final-review.md)。原 NVIDIA、HiThink/AKShare、Yahoo Search 的适用证据复用；新市场快讯不推断证券关联，也不替代个股检索消费要求。本 G3 的获准模型、原预算及真实报告/引用/历史读取仍未通过，不调用模型。

## 原Review检查点

## 最终一致性 Review（D58当前正式路径与恢复通过）

- 当前D58：通用参数由前端显式保存，正式提交／领取／预留派发／报告落库完成；真实来源、原严格校验、引用／历史／Web与关闭重建反读通过。第一请求的SocketError／499保留为失败，第二请求84.679秒成功，未回填旧请求原因。原财务／策略／AI旧行保持，启动目录同步35新增／41更新单列；历史D条仍是各自实验结果，不变更失败checkbox或冻结状态。详见[正式回执](2026-10-29-g3-formal-acceptance.md)。

- D37现行结果：唯一Cloudflare请求HTTP200／644字节完整SSE／stop／DONE，两条相同终止帧的delta均为空，正文0字节；独立组装／保存／SDK一致，SDK报schema_invalid／empty，离线真实payload重放同样失败。上游ID=id-1793011960354，报告3842输入／0输出／21.131 Neurons，重复用量帧只计一次；4.803秒结束，没有超时或取消。本次1/1、余1次冻结，失败未补发；零付费边界由用户确认Workers Free，未读取到账单金额。
- D37收尾：宿主与双角色实际编译包一致，Node24.18／24.21的环境差异记录；诊断始终V2=false／无部署／无业务写入，未启用Cloudflare或改默认配置。原22表／旧AI／配置／环境／容器／挂载及HEAD／空暂存区保持，11份trace完整性反读通过。标准Schema与有效样例离线通过不能证明供应商支持全部结构化约束；D36两字符内因和正式G3正向缺口保持。
- D39取得GLM上游EngineCore内部500；D40仅换Qwen后取得HTTP400／8006，明确同一请求Schema的Draft-07 tuple数组items不兼容对方要求的prefixItems。D40本次原因已确认，通用Schema方言与D32业务约束一致性修复未实施，不能回填历史请求根因。当前余量0，失败未补发，应用默认配置保持，G3正向未通过。

- D36历史结果：同一控制台Key、唯一HTTP200、完整SSE／stop／DONE，实际Nvidia返回2字节 `{"`，独立组装／保存／SDK文本一致。SDK JSON解析失败、research_schema_invalid、无报告；实际三项超时299910ms／SDK重试0，总耗时134231ms，失败未补发。generation只读GET200确认canonical Nvidia／原生5609输入与7345输出／7342推理／费用0；北京时间00:26:25.632生成。用户截图确认Phala429后Nvidia200，属于OpenRouter内部路由，不能把该429作为最终失败码。
- D36收尾：开启／关闭均正式update复用df411ebf…，无新构建；双角色与实际Schema／自适应模块保持。关闭重建后本次20文件及D35原16文件逐字节／权限／归属不变，V2=false／无策略、capabilities200／false、pending=0及五服务健康。22表旧行、11旧AI／121工具、默认修订5、环境／来源／20路由／DSA／挂载及WIP保持，仅新增本次1失败任务／11材料，现12／132，本次1/1、余2次冻结。[本次回执](2026-10-26-g3-repeat-acceptance.md)。

以下D条仅保留各自历史时点事实；当前正式路径、预算授权与运行态以D58回执为准，不恢复旧次数。

- D35现行结果：唯一正式HTTP收到完整404／808字节错误JSON，最终Nvidia Function对其account不可找到，响应内另附Nvidia500／502及Phala429。消息由OpenRouter返回，SDK保留Provider returned error但归transport_unknown；不能由该分类反推TLS失败。本次实际超时299935ms／SDK重试0，约2.6秒返错，无正文／报告，未自动重试；generation只读GET404，实际模型／用量／费用仍未知。
- D35目标与收尾：新镜像df411ebf…经正式update固化，双角色实际Schema及自适应模块与当前构建一致；同镜像正式关闭后两消费者重建、16份本次trace及D30原trace保持，capabilities200／false、V2=false／无策略、pending=0、五服务健康。22表旧行、10旧AI／110工具、默认修订5、环境／DSA控制与20路由／挂载不变，仅新增本次1失败任务／11材料工具，现11／121。三仓WIP、配置／HEAD及空暂存区保持，本次1/1、余3次冻结；[D35回执](2026-10-25-g3-adaptive-runtime-acceptance.md)。

- D30历史结论：真实trace及持久化通过。独立授权仅1次HTTP200／完整SSE／stop／DONE，上游assistant只含2字节 `{"`；从脱敏SSE重新组装、独立原文与SDK文本三方摘要相同。SDK实际JSON解析失败，业务failed／research_schema_invalid、result=null；该次生成未形成报告。
- 部署与证据：两次正式update均复用D29已验镜像、退出0、未构建应用镜像；两消费者及实际Schema与已验产物一致。关闭时再次重建，两端本次18文件／2201285字节和D29原12文件逐字节及权限归属保持，详见[D30回执](2026-10-25-g3-upstream-trace-acceptance.md)。未变代码检查沿用D28／D29。
- 收尾与保护：V2=false／无策略、capabilities200／false、pending=0，五服务健康。22表全部旧行、9条旧AI及99条旧工具、DSA控制／20路由、环境和全部挂载保持，仅新增本次1任务／11工具，现为10／110。原验收源码及并行新增包保留，既有Metro日志增长761字节未回滚；WIP、配置、HEAD和空暂存区核对通过，无stage／commit。
- 历史边界：D20旧Provider错误、D25合法JSON但Schema失败及缺失旧正文、D29 TLS失败分别保留在各自回执；不使用D30原文回填。本轮Provider自报cost=0，业务冻结定价估算0 USD单独记录。
- D33历史结果：另获准1次指定canonical Nvidia且仅请求关闭reasoning，完整请求差异门禁通过；SDK在HTTP200后因30秒首语义chunk超时失败，未读到正文或DONE，trace为incomplete。只读generation记录显示推理0、原生输出2155、stop、费用0、耗时45445ms；用户后补同generation完整JSON，原JSON Schema通过，业务Zod因条件id误作claimId拒绝，同版本离线SDK复现schema_invalid，新增外部0。现存9份产物完整性通过；控制台补证与原在线接收分开，未冒充在线成功或业务报告。
- D33保全：V2全程关闭／无策略、canCreate=false／pending=0，默认修订5、全部22表及10旧AI／110工具、DSA、环境、同一容器和挂载保持；本次无部署或业务写入。原派发脚本与46项源码摘要未变，三仓HEAD／配置与空暂存区保持；[D33回执](2026-10-25-g3-reasoning-off-control.md)保留预算与失败事实。
- D34历史边界：后续源码已按独立授权调整，不能再把D33时点的46项源码未变当作当前源码结论；D34本地交付时尚未部署目标。策略及观测／请求组装／结算职责分别验证，缓存故障只减少重试或回到剩余期限，原始响应和严格业务校验保持。14:23Z只读复核确认原22表、配置、同一容器与挂载及D33九份产物／manifest保持；当时余4次冻结。D35已完成目标部署，详细工程与运行验收状态只见[自适应Task](../../archive/tasks/2026-10-25-ai-adaptive-execution.md)。
- 未完成：本次无成功报告可验，D33完整在线接收及业务Zod正向验收未通过；D31两字符根因、D32约束治理及G3成功报告／引用／历史／Web保持原缺口。D30真实捕获／重建、D36完整流及重建、D37空响应分层核对的证据分别有效，不由完整传输推断业务成功。当前余1次冻结，不补发；默认模型／推理及原业务校验保持。

