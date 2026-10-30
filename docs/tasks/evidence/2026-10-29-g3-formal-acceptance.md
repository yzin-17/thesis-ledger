# G3：正式配置、部署与业务验收

> 当前运行状态（2026-10-29 22:05）：按用户新授权开启V2，`canCreate=true`；本地运行配置已持久保存。默认仍为OpenRouter/free，Cloudflare保持停用。本轮模型调用0，原配置／业务记录和WIP保持。见[开关生效回执](2026-10-29-g3-formal-acceptance.md#v2-enable)。

## 授权与边界

用户于2026-10-29明确允许补齐正式请求参数、经infra启动／部署目标，并临时启用V2、落库验收报告；结束恢复开关和配置，保留验收报告。沿用持续零付费Cloudflare／Qwen诊断授权，旧GLM额度冻结，保留WIP和既有业务数据，不stage或commit。

D58验收结论（验收结束时）：获准的Cloudflare/Qwen／JSON Mode正式G3路径通过，报告、11条实际引用、历史、Web、完整trace及容器重建反读均通过。原默认、Provider配置和运行期开关已恢复，V2关闭；报告与失败审计保留。三个仓库的无关WIP、HEAD、索引及23个旧验收包保持，未stage或commit。资料仍为partial，具体数据增量和验收范围见下文。

前置复用[D57](2026-10-29-g3-nonstream-schema-diagnosis.md#d57通用提示构建与-sdk-消费)：完整材料真实SDK与原校验通过，但关闭思考为临时注入，正式研究仍会传内部token预算。当前按[通用参数T7](../2026-09-21-ai-provider-model-usage-configuration.md#g3所需的通用请求参数)补齐，再进入[正式J-G3-3](../2026-09-19-vercel-ai-sdk-integration.md#json-stream-acceptance)。

## 原现场保护

私有执行包为.recovery-artifacts/g3-d58-formal-acceptance-20261029/。实施前记录主仓4538份、infra196份、DSA9430份源码／文档输入及三个HEAD／空索引，23个既有验收包单独保护；不覆盖D57代码及其他WIP。原目标容器未运行，部署前仍须通过正式入口保留原卷和数据库。

## 执行起点（历史）

T7.REQUEST-CONTRACT／EXEC／UI本地通过后，进入J-G3-3A正式恢复／部署；当时尚未修改实际Provider配置、启用V2或发送本轮正式模型请求。Server和DSA应用镜像、容器均不存在，四个命名卷存在且非空，选择正式update.sh all、DEV_DATABASE_MODE=check，不初始化或重建数据库。首次启动临时关闭研究执行、V2写入和策略AI优化，先反读原数据／配置／队列，再开放本次G3。

## 通用参数合同与就绪

modelDefaults按模型可选保存requestOptions，统一输入和Server复用相同Schema。新增有界JSON校验，系统字段、嵌套凭据／原型键、非JSON、循环和过深输入均拒绝；额外参数没有供应商判断。保存／读取、注册快照、就绪和用途验证指纹已贯通；upstream仅在输入／输出明确零价格且币种有效时就绪，Anthropic Messages因协议必填上限拒绝。

共享定向35项通过，schema构建通过；Server定向5文件78项通过，类型检查通过。首次发现新增导入的价格函数没有导出，已修正；随后严格协议选择器拒绝完整配置对象，已改为只传协议选择字段；最后修正exactOptionalPropertyTypes的可选价格类型。失败输出与修正后的独立结果分别保存在schema-targeted.json、server-contract-tests*.json与server-contract-typecheck*.json；未重复外部调用。

参数合并遵循顶层赋值。已按recommend skill核实项目es-toolkit1.51.0及merge声明：merge会递归修改目标并合并数组，与本合同不符，因此使用原生对象展开复制；不新增自制深度合并。前端参数字段按项目锁定shadcn4.16.1的Field／Textarea文档及现有组件实现，不安装或覆盖组件。

补齐通用非认证headers以承载网关日志选择；显式凭据／连接头、非法字符和原型键拒绝。首次头部测试发现Zod record会静默丢弃__proto__，已改为解析前检查原始对象，39项最终定向通过。三个核心保护字段的末次收紧已定向重验并重建共享包，其他业务Schema未变；全量基线为1386通过／3跳过。

## 执行链与前端

正式研究冻结并匹配requestOptions，参数变更即使伪造同一指纹也不能复用；使用上游默认上限时不把内部预留的outputTokens传给SDK。用途验证、连接探针、研究及策略消费统一传递配置，通用HTTP变换先于诊断与trace。四种协议的本地真实HTTP验证嵌套值和非认证头、上限字段、单次派发及实际正文摘要；Anthropic Messages保留必填上限并拒绝upstream。

Provider服务原1051行缩为975行，将测试运行配置构建移入专有helper；前端类型634行保持、编辑Hook683→677行。Server AI／编写／优化回归782通过／140项环境用例跳过，Server类型和Nest构建通过；不是数据库或真实Provider验收。完整改动ESLint、边界与工作区依赖通过，仓库guardrails入口退出0且保留存量诊断；文件尺寸检查有7项存量告警且未提供完整commit基线，不冒称全仓ratchet债务已清除。

前端新增父级草稿中的模型参数JSON；坏JSON同时阻止保存和测试，错误草稿保留；清空显式提交空对象，参数不会被默认方式编辑抹掉。核对时发现原用途转换固定写V1，已保留已有合同version并增加研究V1／V2中文选择，不按Provider适配。Provider前端回归67项、类型／构建与ESLint通过。

IAB本地夹具http://127.0.0.1:5174/test/browser-ai-provider-request-options.html通过：坏JSON保存被拒；合法body／headers／upstream保存重开一致；实际保存输入为research-generation-v2；显式切换V1后取消恢复V2和原参数。证据为私有browser-local-proof.json与browser-request-options.jpg，只证明本地组件／草稿，不包含目标HTTP或模型调用。

## 目标部署前置

只读确认Docker上下文desktop-linux，现有SkillAtlas两容器作为无关运行态保留。ThesisLedger原四卷均存在且非空：PostgreSQL约166.8MB、DSA约36.73MB、Redis约55.42MB、制品约8.396MB；数据内容和结构尚待正式启动后核验，不仅凭卷名判为业务完整。主仓／infra环境文件不改写，运行期开关通过正式入口的临时环境参数控制，结束按原渲染值恢复。

因为Server和DSA镜像均缺失，all是本次恢复依赖所需目标；不使用不适用的快更，也不直接docker compose up／build。该部署前置检查点的原账本、实际配置、Provider凭据、Schema head、Worker和模块、capabilities及业务报告尚待目标反读，当时J-G3-3保持未勾选。

正式update首轮在源码预取前因DSA旧.venv解释器缺失退出1，无应用启动或模型调用。核对源码预取仅使用标准库后，按入口现有LONG_BRIDGE_SOURCE_PYTHON=/opt/homebrew/bin/python3接续；不安装依赖、不修改DSA源码或绕过固定revision／干净树验证。两轮结果分别保存在deployment-result.json、deployment-02-result.json。

## 正式恢复与数据基线

正式update.sh all第二轮于03:23:09～03:42:37 UTC退出0；实际DEV_DATABASE_MODE=check通过，Schema head为20261023010000_report_metadata_snapshots。Server与Worker同镜像4734144d9ceb…，Node24.22.2／AI SDK7.0.107；按真实pnpm解析位置核对Server1290、schemas192、domain76、shared1份JS，两角色无差异。两个capabilities、配置和Provider API均200；研究／V2／策略AI开关均暂停，无活动AiRun和回测。

已通过正式research-state-backup.mjs封存PG、DSA在线SQLite及数据／制品tar，Manifest和摘要校验通过。目标原有12条AiRun、132条AiToolCall及39类表的逐记录摘要封存；实际原研究默认为openrouter/free，Cloudflare停用、无用途配置，保留标准单价。后续仅对Qwen临时配置已确认Workers Free下的零费用验收费率，其他模型用途不启用；结束恢复原标准单价、默认和停用状态，保留验收新增审计。

## 用途验证一：发现探针语义遗漏

前端参数已保存到停用的Cloudflare配置；密文解出的Key摘要与既有成功诊断Key一致，未读取回显或更换凭证。正式validation-plan只含Qwen／research／manual，最多1次、估算0 USD、期限600秒；通过公开test-and-save唯一派发，失败即停，HTTP400未覆盖原配置。网关01a185c4-6402-7309-b3e6-fa3741474311返回HTTP200／6774ms／229输出Token，完整564字节JSON、stop、0思考，实际无stop或任何token上限。

离线按原researchGenerationV2Contract复现唯一错误：nextSteps[0]为view_evidence但evidenceIds为空。原用途探针只内联JSON Schema，无法表达该refine，最小实例指令未给语义规则。接续REQUEST-PROBE提供原Zod验证的研究V2格式实例，复用现有格式样例机制，不修补本次输出、不改领域Schema／数值／引用校验，也不把用途探针当正式G3。原始请求、脱敏网关流、正文及离线错误分别封存在validation-wire-*和validation-offline-proof.json。本轮已发生1次用途请求，正式业务模型请求仍0。

REQUEST-PROBE本地实现已通过：18项定向、AI回归631通过／79环境用例跳过，类型、ESLint和Server构建通过；一个存量测试原来靠Schema文本中的const识别V2，已改为将实际样例按原V2合同解析，初次失败结果保留。样例仅对准确research-generation-v2生效，V1及其他合同保持原提示。原view_evidence空引用仍被拒绝；没有修补先前模型正文。为后续同镜像切换开关和容器重建验收，需将新增探针写入正式开发镜像，选择update.sh thesis-ledger，复用已完成DSA。

随后正式update.sh thesis-ledger于03:51:58～03:53:56 UTC退出0，双角色更新至38166f1a02d2…；公开用途验证第二次成功，网关记录为01a185cb-d269-7525-9fed-88abbc37db1b，原V2合同校验通过。两次用途验证均只含Qwen；通过后才临时启用所需用途和默认，进入正式材料验收。validation-02-*保留实际请求及成功结果。

## 正式业务一：连接中断

研究默认通过前端从openrouter/free临时切至Cloudflare/Qwen，revision5→6；官方update.sh thesis-ledger复用已核对镜像38166f1a02d2…，临时启用研究／V2，策略AI保持暂停，maxAiCalls=1、maxCost=0。正式POST /research/submissions携带capture-v1，创建shadow／独立标的600519.SH任务1e13eb78-f501-429c-ad24-e61fac0d3bff及11条真实AiToolCall；此次材料重新获取，不能冒充D57的同一冻结快照。

唯一模型请求在30.024秒失败，research_unknown_outcome，未形成成功报告；trace b4d90a0a-7f42-4b41-8bdb-ffef8657890c已从挂载数据卷反读。实际SDK首输出120000／空闲60000ms、总预算600000ms，重试0；错误链最终为TypeError terminated → SocketError other side closed。原始响应689帧／1155字符、无DONE／finish，trace如实标为incomplete／response_read_error。网关01a185ce-7a4d-7328-a8eb-6529e96ed086记录499／22859ms，保存691帧的部分输出；请求下载接口500，响应下载已成功封存。不能据30秒巧合归因于业务或SDK固定超时；对端关闭的具体组件仍未知。保持失败任务和原正文，不修补为成功；根据明确传输异常新建一次正式对照，仍唯一Qwen路由与零费用边界。

## 正式业务二：成功报告与原校验

同一正式配置的新提交创建898c9071-9c70-4cb8-9887-cd73971e8eac，trace为7c6ce1dc-331c-4222-bbba-2ba627c18949；84.679秒成功，输入8398／输出2440Token，配置估算0 USD。3条claims、4条结构化field数值通过原生成Zod、冻结摘要、严格数值与范围关联；11条绑定均指向真实同run的AiToolCall，审计evidenceId／fingerprint／provider逐项相等。报告详情、历史及11个材料API均200，历史含当前报告；Web阅读正文、部分资料标记、来源展开和模拟模式列表已核对，未改写模型自由文本。该数值核验不代表自由文本中的全部趋势或资金叙述已自动证实。

网关01a185d5-4305-7691-b5e4-bb7ad9736593为HTTP200、82534ms。1057330字节完整网关下载与记录尺寸一致，4791字符／6835字节正文和trace、落库inference完全一致。兼容流和原生日志各2441帧，兼容端两条stop与原生一条stop的终态差异保留；客户端DONE、0思考、无stop或token上限字段，response_format为json_object，输入除路径中的model外逐字段相同。17份trace制品完整、无issue。首次只读日志下载curl18，改用HTTP2压缩下载成功；没有额外模型调用。

只读网关配置为workers_ai_billing_mode=postpaid，未切至Unified billing。网关cost指标0.0115870996等于按原标准Token单价的计算量级，业务配置估算0与该指标分别保留；零付费依据为用户确认Workers Free及[官方免费分配／超额拒绝规则](https://developers.cloudflare.com/workers-ai/platform/pricing/)，不把估算0当独立账单证据。网关[遥测cost定义为估算值](https://developers.cloudflare.com/ai-gateway/observability/otel-integration/)。本轮共4次Qwen：用途验证失败／成功各1，正式业务传输中断／成功各1；GLM未调用。

## 恢复与收尾

前端恢复openrouter/free默认（revision6→7）和原实际账户模式。用公开普通保存接口、带expectedRevision，先显式清空临时默认参数，再按原字段保存；Cloudflare恢复停用、无用途／无模型默认参数及原三模型标准单价，未覆盖密文。正式update复用38166f1a02d2…于04:15:42～04:15:52 UTC退出0，强制重建Server／Worker，恢复研究执行true／V2 false／策略AI true，撤除临时单次策略。

收尾本地验证发现已移除模型的旧upstream参数仍参与价格门禁，错误阻断保存；没有访问模型或改目标数据。按AC-31补齐选中模型过滤，保持显式空对象清除与省略保留规则；不增加供应商分支。收尾修正后已反读完整目标、旧数据和制品。

## 最终运行态与保护

收尾按模型集合过滤配置合并，覆盖保存、持久化与测试运行配置三个入口；6项定向、632项AI回归通过／79项环境用例跳过，类型、写集ESLint与构建通过。初次类型检查提示漏传测试入口的模型集合，已修正并重验。最终update.sh thesis-ledger于04:19:51～04:21:34 UTC退出0；双角色同镜像1654b11a1f4b…，实际Server／schemas／domain／shared全部JS与当前构建一致，两个capabilities均200，canCreate=false，无活动研究或回测。没有再次调用模型。

最终通过正式备份入口封存当前状态。关闭／重建后，从全新容器进程反读成功和失败两条trace：17／15份制品及manifest与重建前深度一致；成功报告正文、历史和11条材料API逐项一致，关闭V2后原submission仍能找回succeeded／reused=true。原制品卷708份旧文件的摘要、权限、UID／GID均保持，新增34份文件仅为本次两条trace。

36张严格保护业务表全部旧行不变，仅新增2条AiRun和22条AiToolCall，现14／154；默认值恢复openrouter/free、修订5→7，其他四个Provider整行不变，Cloudflare所有配置值及凭据密文恢复，Qwen价格元数据时间和健康审计正常递增。infra .env摘要不变，研究执行true／V2 false／策略AI true与原渲染一致，临时AI_RESEARCH_POLICY_JSON已撤除。DSA的172条策略历史、1条策略状态、9个Provider配置和9条准入整表摘要一致。

参考目录存在独立变化：既有CatalogReadinessService在启动时发起同步，CatalogSyncService按增量更新目录；原35848条标的ID全部保留，目录新增35条、更新41条（主要为基金名称、拼音、别名、generation，含2条active变化），当前35883条。本轮没有手工修改目录，原财务／策略／历史AI数据不变；不把自然目录同步写成“数据库逐行完全不变”。原始和最终数据库备份及catalog-metadata-delta.json均保留。

Web重新加载已保存报告、展开原始材料并确认模拟模式历史；原实际账户模式恢复。报告仍明确标记资料partial；结构化4条数值核验不等于自由文本中的全部资金和趋势推断均已证实。当前Cloudflare/Qwen／JSON Mode正式路径通过，不推广D41的Draft2020-12双模型方案，旧GLM继续冻结；Nvidia历史两字符的内部原因不由本次回填，其他G1／客户端与DSA完整恢复门禁保持各自边界。

验证口径：本轮写集ESLint与边界门禁通过。全仓guardrails入口退出0，但保留存量复杂度告警和React Native第三方解析诊断；不据该退出码宣称全仓无告警。新增参数／探针／过滤职责没有供应商判断、依赖变更、数据库结构变更或门禁豁免。

## 最终一致性Review

workspace-protection-proof.json核对通过：主仓4538份原输入、infra196份、DSA9430份均在保护范围；三个HEAD及索引摘要不变，暂存区均为空，全部变化都位于声明写集。23个旧验收包的727份文件原样保留。无关SkillAtlas两个容器ID保持且均健康。browser-final-proof.json记录重建后报告页面及恢复实际账户模式；browser-report-conclusion-after-rebuild.jpg与browser-configuration-restored.jpg保留页面证据。

按合同／执行／消费／部署／恢复逐层核对：T7.REQUEST-*、J-G3-3A／B／C和本次G3-D58验收叶通过；当前获准路径没有剩余实施或验收阻塞。原账本、持仓、策略与历史AI行保持；报告新增和启动目录同步按上文单列。GLM冻结、D41双模型推广、原Nvidia内部原因及其他独立任务不由本次回填。最终配置为原研究默认openrouter/free、Cloudflare停用且无用途／默认参数、V2关闭；验收成功报告和失败trace均留存。

<a id="v2-enable"></a>

## 2026-10-29：按新授权开启V2

用户在D58验收后明确要求“恢复V2开关”，本次将开启状态持久保存到infra本地.env，只新增AI_RESEARCH_V2_WRITES_ENABLED=true；原文件其他字节及权限保持。Compose默认值与应用源码不改，其他开关、Provider、模型、价格、凭据和研究默认不改。该授权更新了D58验收后的开关状态；前文关闭及恢复记录仍为当时真实检查点。

执行目录为/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra，正式命令为./scripts/update.sh thesis-ledger；ENV_FILE指向该仓.env，DEV_DATABASE_MODE=check，REUSE_THESIS_LEDGER_IMAGE_ID为原完整镜像sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45。北京时间22:05:27～22:05:37退出0，仅强制重建Server／Worker，复用原镜像、数据库及挂载；原依赖和无关容器ID保持。没有重建源码或数据库，没有模型请求。

独立反读确认：服务健康；Server环境V2=true，研究执行true／策略AI true保持；/research/capabilities返回200且canCreate=true。默认仍为openrouter/free、revision7，Cloudflare停用，旧GLM冻结。原验收报告898c9071-9c70-4cb8-9887-cd73971e8eac仍200且正文逐值一致。

39张记录表的行数与整表摘要一致，含ProviderConfig、AiRoutingSettings、AiRun、AiToolCall与Instrument，无新增任务或模型记录；活动研究／回测均0。Provider只读API的9个readiness.evaluatedAt随请求时间变化，持久配置和其他字段保持，不将动态评估时间误判为配置修改。三仓HEAD／索引及无关WIP核对通过，未stage或commit。由于只改开关，复用原镜像与既有代码验收，不重复构建或模型测试。

本次私有证据包为.recovery-artifacts/g3-v2-enable-20261029T140430Z/，含before.json、after.json、env-change.json、deployment.json、verification-02.json及保护核对；首轮只读API逐值比较因动态评估时间不相等的结果独立保留。
