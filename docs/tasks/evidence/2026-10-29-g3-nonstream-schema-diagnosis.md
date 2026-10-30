# G3：非流式完整研究 Schema 持续诊断

对应[治理 Task T5](../2026-10-25-ai-adaptive-execution.md)与[研究 G3](../2026-10-18-research-evidence-evolution.md)，接续[D53 最小非流式基线](2026-10-29-g3-qwen-minimal-nonstream.md)。

## 授权与验证范围

2026-10-29 用户明确授权“持续尝试，直到解决问题”，解除后续有诊断价值的模型对照逐次确认要求。继续沿用当前账户 Workers Free 超额拒绝、零付费、Qwen3.8-27B、reasoning 关闭、不加 token 上限，以及保留配置、业务数据、旧 GLM 冻结额度和 WIP 的边界；不 stage 或 commit。每个实验仍单独记录输入、唯一派发、响应及原校验，不自动重试同一请求；新实验必须针对具体未决问题。

当前顺序：D54 检验完整研究 Schema 与空事实短输入的非流式兼容性；通过后 D55 恢复 D50 的单数字事实并验原 Zod／数值绑定，再进入完整冻结材料及 SDK 消费面。简单样本不代收正式 G3，候选 Schema 不自动推广。

官方通用 [JSON Mode 文档](https://developers.cloudflare.com/workers-ai/features/json-mode/)指出流式存在支持限制、复杂 Schema 不保证满足；[模型参数页](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/)同时列出同步和流式 response_format。两者不能替代目标请求实测，不据此预先认定根因。

## D54：短输入、完整 Schema、非流式

输入复用 D49，messages、完整 2020-12 response_format 与关闭思考字段保持，仅改 stream=false 并删除 stream_options。预计四类事实与行动数组为空；验收要求正常非流式信封、单一合法研究 JSON、stop、0 思考、原业务 Zod 通过。沿用 1200 秒总预算／120 秒首正文／60 秒正文传输空闲和 HTTP 重试 0。

私有目录为 .recovery-artifacts/g3-d54-full-schema-nonstream-20261029/。只读复用 D51 经本机验证的捕获与脱敏函数，按摘要固定来源；复用原 Zod 样例与模块摘要。准备阶段补全复用预检所需的只读基线变量，修复前没有发出模型请求。准备、本机捕获与同账户只读预检均通过。

请求 9239 字节，SHA256 为 17df8c720a2078e8b4f30d6f234dee041fba67df09e58ffba480b175a0295aad；完整 response_format 摘要保持 156a678f260b3f1c5240b0e007cc724e0cf730e2e68c4ee08a9a9a1a0fb3834a。唯一实际请求 HTTP200／curl0，42.811 秒正常完成，单一完整 JSON、stop、0 思考；正文 442 字节，摘要 677409c42a2dcd39499804a4156812ef9e9f3ee0a1626f51f66b80abeca35107，claims、numericClaims、invalidationConditions、nextSteps 均为空，原业务 Zod 通过。

网关 ID 为 01a18454-cd74-77bb-83b8-d45c070a2767，HTTP200／success=true／cached=false／41369 毫秒。原生正文完整下载 1179 字节，与记录相等；原生与兼容正文、解析研究对象、终止原因及用量均一致。用量为输入 70／输出 146／合计 216 token、45.336360931396484 Neurons。该样本证明完整 Schema 的空事实非流式分支可用，不证明单数字事实、完整材料或正式 G3。

## D55：单数字事实、完整 Schema、非流式

输入复用 D50，仅改 stream=false 并删除 stream_options，实际 9609 字节、摘要 d386eff9d5e3e4faf570ec4cd86d9a4c17bb57452463f34e04b31dd1eb975e6f，与 D51／D52 相同。目标是恰有一条 qualitative claim 与一条 field numericClaim，引用原合成记录 /quantity=12、unit=count、currency=null；要求原 Zod 与原数值校验均通过，不修剪或修补实际响应。

唯一实际请求 60.626 秒后 curl52／Empty reply from server，没有 HTTP 状态、响应头或正文，本地期限未触发。实际研究 JSON／Zod／数值校验未进入，实际推理和用量尚未知；本次不机械重发相同请求。D54 成功仅证明空事实分支，不能覆盖本次。

## D55a：仅移除出站 Schema 的 maxLength

公开 [xgrammar 问题 #852](https://github.com/mlc-ai/xgrammar/issues/852)报告字符串 maxLength 导致约束解码显著变慢；[Cloudflare 问题 #16165](https://github.com/cloudflare/workers-sdk/issues/16165)也记录该 Qwen 模型在部分 json_schema 输入下超时。这些是诊断线索，不能证明当前 Cloudflare 使用相同后端或本次具有相同原因。

实验保持 D55 messages、模型、非流式、关闭思考及其他字段不变，仅移除出站 Schema 中 33 处 maxLength；其他限制和完整字段结构保持。原业务 Zod 及数值绑定不变，任何实际响应都须原样通过；未修改应用源码、Provider 配置或 Schema 默认值。

私有目录为 .recovery-artifacts/g3-d55a-no-maxlength-20261029/；请求 9075 字节、摘要 689b1c911866ad0e198d6e60b07fe37aa0358b234c0ea6d214686477ad185c48。唯一请求 57.003 秒后返回 HTTP500／curl0，原始 JSON 为 errors=[{message:Server Error,code:6001}]、success=false、result={}、messages=[]；CF-Ray 为 a51cee2c19d0fd0f-SIN。这是直接 curl 收到的 Cloudflare API 错误，不是 SDK 生成的文本；仍未定位具体内部引擎原因。没有研究正文或用量、本地期限未触发。

网关完整列表 13 条，无本次时间窗口记录；没有可反读的相关正文。仅去 maxLength 未修复问题，不推广该修改；原 Zod／数值校验未进入。D55 的列表同样只有历史记录，唯一窗口候选为早于本次发起的 D54，不建立错误关联。

## D55b：JSON Mode 与完整提示词 Schema

实验使用已有通用 json_mode 对应的 response_format={type:json_object}，把完整原始研究 Schema 精确放入可信 system 提示词，原 D50 user 消息保持。模型、非流式、关闭思考、无 token 上限及原业务 Zod／数值绑定保持。该实验同时改变输出模式与可信 Schema 的传达位置，用来检验可用路径，不作为唯一根因的单变量证明；实际输出不裁剪、不修补。

私有目录为 .recovery-artifacts/g3-d55b-json-mode-20261029/，请求 11084 字节、摘要 996f020a04648147ec85f0347fcfa1bd49e0c98740be567c3a45993a276dd95b；完整提示词 Schema 摘要 be0b50cc2c3e9b32e9b3d6af62edeb3826f726e26177e17bef72b6cf28cefece，原用户消息逐字相同。唯一请求 HTTP200／curl0，11.726 秒正常结束，stop／0 思考；完整研究正文 1171 字节，摘要 32002f25fbf6f362d8a61e9c613a7bd0c2da49781630dd9b8a7ca3d48a3ca447。

原业务 Zod、恰有一条 qualitative claim／field numericClaim、/quantity=12/count/null 精确绑定和原数值校验全部通过；错误数值 13 的既有拒绝样例及未变化的模块摘要一并核对。网关 01a1845d-a9fe-70e2-bcd1-8a83193e97d9，HTTP200／未缓存／9516 毫秒；完整原生正文 1986 字节等于记录，正文、解析对象、用量和终止原因与客户端一致。输入 3336／输出 411／合计 3747 token，256.0363464355469 Neurons。

本次验证了 JSON Mode 加完整提示词 Schema 的非空事实可用路径；native_schema 的失败仍保留，不宣称 maxLength 是根因，也不自动修改已保存的 Provider 模式或配置。

## D56：完整冻结材料与 JSON Mode

实验恢复 D46 的完整冻结 messages 与原研究 Schema，以 D55b 相同方式在可信提示词传达 Schema，保持 Qwen、非流式、关闭思考和无 token 上限。验收要求原业务 Zod、允许引用范围及原数值字段绑定通过，取得网关正文并核对 SDK 消费；不刷新材料、写业务报告或修改配置。

本机先通过原冻结完整性核验：11 条可用证据、输入指纹 2e656b7b83b13e4f904f99df47c45082abd188c610e6038968732d924de0d6af，原消息语义与当前冻结构建器一致。对照 SDK 合并 system 的实际规则修复了本机比较方式，并从已验证的研究请求 instruments 读取允许标的；两项准备修复均发生于模型派发前，原请求未改变。

私有目录为 .recovery-artifacts/g3-d56-full-materials-json-mode-20261029/，实际请求 24000 字节、摘要 090258f659ef8c1a779351785b0196745c76ac7a5426cb938b1f0f8863965d5a。唯一请求 1.917 秒后 HTTP400／8007，实际错误为 System message must be at the beginning。手工 curl 在 Schema system 后又保留原 system，未按 SDK 既有规则合并；这是本实验的消息序列不兼容，不能回填其他失败的原因。

网关 01a18462-58d0-76f4-ad07-4c8cd6f56341 同样记录400／success=false／未缓存，原生错误正文445字节与记录相等；未生成研究正文或报告用量。原业务 Zod／数字绑定未进入。

## D56a：按 SDK 规则合并 system

仅将 D56 两条 system 的内容用两个换行连接为开头一条，Schema、原始指令、完整 user 材料及其他请求字段保持。该序列与现有 sdkPrompt 的序列化规则一致；仍使用原冻结完整性、业务 Zod、数值引用及范围检查，不建立真实 AiToolCall／业务报告。

私有目录为 .recovery-artifacts/g3-d56a-merged-system-20261029/，请求 23973 字节、摘要 99dc3d177929e2657761692d66a2fc7b64695e82d4f3c36783242162fa9afaa8；本机捕获、冻结输入与校验链自检通过。唯一真实请求仍在 60.581 秒 curl52，无 HTTP 状态／头／正文，本地期限未触发。网关列表只发现更早 D56 的400记录，不与本次错误关联；该次列表 count=15、total_count=13 不一致，不宣称分页完整。实际研究对象与用量未知。

## D56b：保持完整内容，仅切回流式 JSON Mode

保持 D56a messages、json_object、关闭思考及所有其他字段，只有 stream=true 并增加 stream_options.include_usage=true。直接观察实际正文进展和协议终止，要求 stop、DONE、单一完整 JSON、原冻结完整性／Zod／数值绑定与范围校验通过。这个模式与现有研究 SDK 的流式路径一致，完整 Schema 保留在可信提示词。

私有目录为 .recovery-artifacts/g3-d56b-stream-json-mode-20261029/，请求 24012 字节、摘要 abf89ef3c5f1c3b18ebebe5f2aa43358973d9ffbcb5fd0157d366d571047d53d。唯一请求 HTTP200／curl0，73.789 秒正常完成，2859 条 SSE、stop／DONE、0 思考与 8085 字节完整研究 JSON；正文摘要 7ae204128bbc07b23ddfc664609901382c3c08f7c78020a18e3e4e9aabffa99f。没有本地期限或主动取消。

原业务 Zod 通过，生成 3 条 claims、5 条直接字段数值及 1 条派生数值。原数值校验拒绝 n-006：冻结 previousClose=1318.49、price=1335，模型给 percentage_change=0.012522401266598，实际为 0.01252190005233259258697449354943913112727…；不修正实际正文或放宽误差门禁。

网关 01a18467-5091-703e-a7d3-8dee438dce43，HTTP200／success=true／71680 毫秒；原生完整正文 1238331 字节等于记录，组装研究正文与客户端完全相同。终止帧布局不同：原生1条stop、兼容2条stop，投影不完全相等；客户端DONE完整。传输、结构与业务数字错误分开记录。

## D56c：明确不可核验数字的处理

保持 D56b 全部输入、完整 Schema、流式 JSON Mode 与参数，仅在可信 system 末尾补充既有数值纪律：优先直接 field 引用；不能精确核验的派生值不猜测小数、不提供近似值，改为保留原始字段并将计算需求列为 unknowns。仍允许能准确核验的合法派生声明，不裁剪／修补实际输出，不降低原 Zod 或数值校验。

私有目录为 .recovery-artifacts/g3-d56c-numeric-discipline-20261029/，请求 24369 字节、摘要 29ddfd60fd1ea3eee9a28f1a159535646f1555a1e3abfc785cf3f4f30546c985。唯一请求 HTTP200／curl0，57.421 秒正常完成，2313 条 SSE、stop／DONE、0 思考；正文 6342 字节，摘要 dc66b99e375ead9c4a5ebfb85afdbf09089e3d0dce47a7cbd4d92e6e2db448b8。

2 条 claims、5 条直接 numericClaims 通过原业务 Zod、原数值绑定及允许引用／标的范围；11 条冻结证据及原输入指纹完整性核验通过。原 correlateResearchResultV2 也通过，但其审计工具 ID 为仅内存中的 evidenceId 占位，不代表实际 AiToolCall／数据库报告关联，正式 G3 仍开放。

网关 01a1846b-c6e7-71fe-85cb-2d18fd2b7f0a，HTTP200／success=true／52364 毫秒；原生完整正文 1002657 字节等于记录，组装研究正文与客户端完全相同。原生1条stop、兼容2条stop的布局差异保留，客户端DONE完整。没有修剪或修补原模型响应。

## D57：通用提示构建与 SDK 消费

已定位现有 JSON Mode 只负责语法与本地 Schema 校验，研究提示只描述部分结构，没有把完整输出 Schema 交给模型。修复放在预算预留之前：新增通用 Schema 描述函数，由 V2 研究消息构建器显式调用，同时补充已验证的数值纪律；估算与执行继续共用该构建器。SDK 适配器不在预算之后追加提示，不新增 Cloudflare 专属分支，不迁移 native_schema 默认 wire 方言，不改变配置或业务数据。

按 [JSON Mode 规格](../../specs/2026-09-22-ai-json-mode-stream-validation.md)与[SDK Task](../2026-09-19-vercel-ai-sdk-integration.md#json-stream-acceptance)完成本地实现、真实响应离线消费、唯一一次真实 SDK 请求及新进程 trace 反读。私有执行包为 .recovery-artifacts/g3-d57-generic-prompt-20261029/。

本地修复新增通用 buildGenerationSchemaPrompt，由原 Zod 生成包含必填字段、严格对象及固定／可选／rest 元组语义的完整描述；仅 V2 研究消息构建器显式接入。Schema 文字使用 2020-12，native_schema 的实际 wire 仍为原 Draft-07，D41 双模型迁移条件保持。原材料、冻结模板、业务 Zod、数值校验和 Provider 适配器均未改变。

定向测试最初16项通过，类型检查发现新增元组索引可能为 undefined 后已修正；修正后7项定向与 AI 回归615项通过、79项真实数据库／环境用例跳过。Server 类型检查、Nest 构建、四个变更代码文件的 ESLint／Prettier、模块边界及工作区依赖门禁通过。文件尺寸检查退出0，存在7项存量告警且未提供 ratchet 基线，不表述为全仓尺寸债务已消除。精确命令、范围、退出码及摘要分别保存在 targeted-test-2.log、ai-regression.json、typecheck.json、server-build.json 和 repository-gates.json。

先用 D56c 的真实 SSE 进行当前 SDK 离线消费，禁止网络派发；原 Zod／数值／范围均通过，Schema 和材料语义与成功请求相同。trace 13份／7节点在新进程反读通过。离线样本临时使用16MiB采集上限，仅证明消费兼容，不替代下列生产默认容量的真实验证。

真实 SDK 请求由当前编译的 AiSdkGenerationAdapter、aiPolicyFetch 和统一超时策略执行，非 curl 回放；2026-10-29 北京时间约05:59:54取得 HTTP200，06:01:51完成。本次只有一次原生派发、SDK maxRetries=0，未发送 max_tokens／max_completion_tokens，JSON Mode 实际发送 response_format.type=json_object、stream=true。使用既有1200秒诊断总预算，首输出／空闲仍为统一策略；没有触发本地超时。网关记录耗时117176毫秒，正常 stop／DONE，0思考，报告输入8346／输出3162 token。

原冻结完整性、原 Zod、数值及引用／标的范围校验通过：3条 claims、5条直接 numericClaims。实际研究正文8259字节／6089字符，SHA256为859fa5e929b387858f19b716a2e3237648da334e81bff326fb665656b62b4679。网关01a18486-ddeb-7720-af35-1f9fd996f0b5完整正文下载1361771字节，与记录相等，组装内容与本地 trace 完全一致；原生1条 stop、兼容2条 stop的尾帧投影差异如实保留。

真实 trace 为 acf479c3-1792-471a-927e-50151734ff46，15份产物／8节点，captureStatus=complete，无采集问题；采用生产默认2MiB正文采集容量。06:06:16在新进程反读全部产物成功，未新增模型调用；06:08:46只读取得网关正文完成比对。

两种 SDK 诊断的关闭思考均由私有传输控制器加入 chat_template_kwargs.enable_thinking=false，并单独记录实际请求节点；该字段不是生产 Provider 配置能力。它没有改 Server 适配器，不能宣称正式路由已经能发出同一请求。数值／引用审计仍使用仅内存中的工具 ID 占位，没有创建实际 AiToolCall、AiRun 或研究报告。

## 当前结论与正式 G3 前置

已确认一条完整材料的可用链路：流式 JSON Mode、预算前的完整 Schema 提示、明确不可核验数值的处理、关闭思考及上游默认 token 上限。curl 与当前真实 SDK 均取得原校验接受的完整研究对象。单次正向不证明重复成功率；不能据此回填早期500、非流式空连接或300秒关闭的供应商内部根因。

持续授权阶段累计9次模型 HTTP 派发：D54、D55、D55a、D55b、D56、D56a、D56b、D56c、D57；部分无响应请求的实际推理状态未知。只读日志、离线回放、编译与测试不计模型请求。旧 GLM 冻结不变，未保存凭据或推理正文。

正式 G3 保留未完成：2026-10-29只读 docker ps 未发现本项目 Server／Worker／数据库容器；新源码未部署。实际 Provider 模式／关闭思考参数／不传 token 上限须通过通用配置和正式请求构建链核对，不能使用诊断注入代验；现有研究业务构建器仍把内部预算的 outputTokens 作为 maxOutputTokens 传入，此与成功样本有差异。保留原配置与 V2／业务写入边界，不启用用途、不改变默认配置、不创建业务报告。后续正式部署、实际 AiToolCall／报告／引用／历史及客户端验收继续由 J-G3-3／研究 G3 持有。

| 正式接入差异 | 当前事实与接续条件 |
| --- | --- |
| 输出模式 | 成功样本为 json_mode，现有通用配置支持用户选择；不能将结果套到 native_schema，也不因此推广 D41。 |
| 关闭思考 | 成功样本由私有传输加入 chat_template_kwargs；现有通用模型配置未提供任意请求体参数，不能增加 Cloudflare 专属适配代替通用配置。 |
| 输出上限 | 诊断 SDK 不传上限；researchSdkAdapterRequest 当前仍强制传内部预算的 outputTokens。后续须区分预算事实与上游参数，不用未经核对的正式请求代验。 |
| 运行态与业务 | 当前项目容器未运行；需正式 infra 入口、实际模块／Schema反读、正式业务关联及客户端验收，遵守配置和业务写入授权边界。 |

D57收尾保护审计通过：主仓4535份原文件、infra196份、DSA9430份原文件的无关内容保持；主仓仅上述4个代码／测试文件及6个说明文档改变，另两仓未改。22个既有验收包共654份文件保持，三个 HEAD／Git 索引未改且暂存区为空；Provider适配器与 D57开始前备份字节一致。新执行包及本轮文件的78份扫描未发现当前凭据，文档文件链接及 git diff --check通过。详见私有 final-proof.json与protocol-proof.json；没有部署、配置或业务写入，当前V2运行态没有反读。
