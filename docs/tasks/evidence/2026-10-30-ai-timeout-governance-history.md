# AI超时治理历史实验记录

仅保留各次输入、结果和冻结条件，不作为新的执行计划。未通过实验保持原事实，当前治理任务已完成；D41方言候选与GLM冻结由[研究Task](../2026-10-18-research-evidence-evolution.md)持有。

  - 历史D36两字符、D39内部500、D40方言400、D41超时／GLM1次冻结见[原D41](2026-10-27-g3-schema-2020-candidate.md)。
  - D43已执行未通过：用户选择D41 Cloudflare/Qwen候选，唯一请求正文与D41相同；HTTP200后约305秒正常EOF，缺finish_reason／[DONE]且JSON截断，SDK报transport_unknown／NoFinishReason。Cloudflare日志duration300090ms，本地600秒预算未耗尽；具体内部300秒来源未确证。完整脱敏trace11份及数据／配置保护通过，失败停止，本次1/1已用、GLM1次继续冻结，不推广候选、不代收正式G3，见[D43回执](2026-10-27-g3-qwen-timeout-retest.md)。

  - D44已执行未通过：同一请求正文，仅本地总预算改为1200秒；网关duration300224ms后EOF，14211帧无结束原因／DONE，3580字节正文JSON截断，SDK仍报NoFinishReason／transport_unknown。本地总预算及首输出／空闲未触发；网关完整6126467字节存档与客户端逐帧投影／正文一致，trace11份完整反读。唯一新增1/1已用、失败停止，旧GLM1次冻结，不推广候选；当前Docker无应用容器，目标业务库／V2运行态及正式生命周期未反读，见[D44回执](2026-10-29-g3-qwen-extended-timeout.md)。

  - D45已执行未通过：系统curl直接POST、没有SDK，同一22515字节正文及1200秒预算下HTTP200／305.311秒EOF；13553帧结束原因均null，无DONE、正文0字节，本地超时未触发。网关duration300266ms，完整5827331字节存档与客户端逐帧投影／正文一致，具体内部300秒组件未确证。新增1/1已用并停止、旧GLM1次冻结；仅更新私有诊断及现有Task，不改配置／业务数据或推广候选，目标业务库／V2运行态当前不可反读。见[D45回执](2026-10-29-g3-qwen-direct-http.md)。

  - D46已执行未通过：同一curl／模型／材料／response_format，仅新增chat_template_kwargs.enable_thinking=false，无token上限；0思考输出，正文27860字节，但9642帧均无结束原因／DONE，首JSON后继续输出使整段报Extra data。网关duration300299ms，完整4100401字节存档与客户端逐帧投影／正文一致，本地期限未触发。新增1/1已用并失败停止、旧GLM1次冻结，未进入原Zod／冻结数值或正式报告验收，不改配置／业务数据或推广候选。见[D46回执](2026-10-29-g3-qwen-reasoning-off.md)。

  - D47最小请求通过：同模型curl只问“请只回复：你好”，移除response_format，保留enable_thinking=false及流式，无token上限；HTTP200／1.671秒返回精确问候、stop与DONE，0思考输出。网关duration506ms／cached=false，完整正文／用量一致，兼容端终态形状差异保留。新增1/1已用，旧GLM冻结；正式G3及复杂输入／Schema原因仍待核实，不代收研究合同。见[D47回执](2026-10-29-g3-qwen-simple-curl.md)。

  - D48最小Schema样本通过：短问候新增单reply字段严格Schema及匹配JSON指令，其他传输设置保持，无token上限；HTTP200／2.096秒返回完整匹配对象、stop与DONE，0思考输出。网关duration585ms、cached=false，完整正文／用量一致，终态帧差异保留。新增1/1已用、旧GLM冻结；当前仅验证这一最小Schema组合，不代收完整研究合同或推广候选。见[D48回执](2026-10-29-g3-qwen-simple-schema.md)。

  - D49空事实分支通过：174字符短指令配原D46完整8802字节格式，curl流式／关闭思考／无token上限，HTTP200／11.784秒返回完整研究JSON、stop／DONE，原Zod通过。网关duration5229ms、cached=false，完整正文／用量一致，终态帧形状差异保留。新增1/1已用、旧GLM冻结；非空数值／条件分支、原提示和长材料未隔离，不代收正式G3或推广候选。见[D49回执](2026-10-29-g3-qwen-full-schema-short-input.md)。

  - D50未通过：短输入单条数量12在HTTP200下生成非空claim／field数值源，但首对象本身违反原Zod与实际Schema，尾随围栏使整段JSON报Extra data；0思考输出。按失败即停主动取消唯一curl，262.474秒、退出-15／网关499，不作供应商自然断流归因。原数值源五项直接核对正确不代收整段失败；新增1/1已用、旧GLM冻结。见[D50回执](2026-10-29-g3-qwen-single-numeric-fact.md)。

  - D51未通过：仅改stream=false并删stream_options，60.623秒curl52、HTTP头／状态／正文均未取得，本地计时未触发；没有可验的非流式JSON。网关完整列表最新仍D50，无本次关联记录，实际推理状态未知。新增1/1已用、无重试，旧GLM冻结；下一前置为取得非流式响应并查明空响应关闭来源，未归为Schema失败。见[D51回执](2026-10-29-g3-qwen-nonstream-control.md)。

  - D52未通过：D51原9609字节请求及捕获函数不变，60.620秒再次curl52／无HTTP响应，本地120秒期限未触发；没有实际JSON／Zod／数值验收。网关完整11条仍最新D50，当前代理端口可连接但未证明关闭方，推理发生与结果未知。新增1/1已用、无重试、旧GLM冻结；先取得非流式样本并查固定关闭来源。见[D52回执](2026-10-29-g3-qwen-nonstream-network-retry.md)。
  - D53基线通过：同Qwen、stream=false、关闭reasoning，仅短输入、无研究Schema及输出上限；HTTP200／1.887秒／“你好”／stop／0思考，网关未缓存且完整正文与客户端内容、终止和用量一致。新增1/1已用、无重试；配置、数据、WIP与旧GLM冻结额度保持。完整研究Schema及正式G3未验，不回填D51／D52断连原因。见[D53回执](2026-10-29-g3-qwen-minimal-nonstream.md)。
  - [x] D54：D49原短输入和完整Schema的非流式样本，HTTP200／42.811秒／stop／0思考，原Zod及空事实语义通过；网关完整正文与客户端一致。
  - [ ] D55：D50原单数字事实的非流式样本，60.626秒curl52且无HTTP响应，原Zod／数值绑定未进入。
  - [ ] D55a：仅移除出站33处maxLength仍HTTP500／6001，未取得研究正文；修改不推广。
  - [x] D55b：通用JSON Mode、完整可信提示词Schema及原D50 user消息，HTTP200／11.726秒／stop／0思考，原Zod和数字绑定通过；网关完整正文与客户端一致。仅证明所测模式的可用路径，不代收原native_schema模式。
  - [ ] D56：完整冻结材料及输入指纹核验通过；手工两条system消息被上游400／8007拒绝，实际输出未验。
  - [ ] D56a：按SDK既有规则合并system后仍60.581秒curl52，无HTTP响应，原业务实际输出未验。
  - [ ] D56b：完整流式JSON Mode正常stop／DONE，原Zod通过；1条派生数值运算不一致，业务数字门禁拒绝。
  - [x] D56c：完整材料HTTP200／57.421秒／stop／DONE／0思考，原Zod、冻结完整性、引用范围及5条直接数值绑定通过；实际AiToolCall关联使用内存占位，不代收正式持久化。
  - [x] D57：预算前通用Schema提示与数值纪律、真实SDK消费及默认容量trace新进程反读通过；3条claims／5条数值通过原校验，网关正文一致。实现叶由[SDK Task J-G3](../2026-09-19-vercel-ai-sdk-integration.md#json-stream-acceptance)持有；关闭思考仍为私有诊断注入，正式参数／目标／持久化保留未验。各实验输入与结果见[持续诊断回执](2026-10-29-g3-nonstream-schema-diagnosis.md)。

