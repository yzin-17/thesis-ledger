# G3 D43：Qwen候选与统一超时复测

对应[超时治理Task T5](../2026-10-25-ai-adaptive-execution.md)及[D41条件迁移](2026-10-27-g3-schema-2020-candidate.md)。本次是进入正式G3前的候选兼容性续验，不能代收正式创建／持久化报告／历史消费。

## 授权与边界

用户要求“复测G3”，并明确选择“续验D41的Cloudflare/Qwen候选”。新增最多1次、零费用、失败即停；Workers Free超额拒绝沿用已确认边界，GLM旧冻结1次不动。固定模型@cf/qwen/qwen3.8-27b、原2020-12候选、原材料与严格业务校验；不改默认Provider、V2、业务数据或生产源码，不stage／commit。

## 派发前证据

- 五服务健康，Server／Worker仍为已验镜像3fd6cbdb…，结构head保持，活动AI／回测均0；V2 canCreate=false、默认研究revision5／openrouter/free保持。
- 复用当前AiSdkGenerationAdapter、统一策略解析及任务scope；不运行旧D41的299910／310000毫秒脚本。reasoning未显式配置，映射普通研究：600秒总预算、5秒内含收尾、120秒首有效输出、60秒空闲，SDK自动重试0，无独立totalMs。
- 实际出站正文仍22515字节，SHA256为e59d3ebca9ab2ccbdd2d59e02e2195cbe09f264d2c2178e116258a4ce13f4987；messages与response_format摘要分别为a4e5f6a2ed3b147e8757ec959fca40c371b2045fcd759e1b580ea2dc622cd2d5、156a678f260b3f1c5240b0e007cc724e0cf730e2e68c4ee08a9a9a1a0fb3834a。与D41完全一致，无max_tokens／max_completion_tokens／stop／reasoning字段。
- 仅本地独立诊断进程扩大trace观察副本至16MiB、单artifact64MiB、总量128MiB；不改变原始流或SDK解析，不改生产默认值。3MiB受控流完整采集／反读，原Zod输出验证通过，外部模型0。
- 原default网关只读预检200，未新建网关、修改权限或配置。唯一派发采用独占锁及nativeFetch断言，已用1次，禁止第二次请求。

## 唯一真实请求与失败终态

北京时间2026-10-27 17:50:43开始，17:55:49失败结束，约305.67秒。trace=5b3f0b6f-9bbd-41a9-b824-4a3a0e8c71a9，网关日志=01a17cc4-f698-748a-95a7-7c8f53fcd999。17:50:45取得HTTP200；原任务截止18:00:43、执行截止18:00:38，均尚未到达。唯一请求已停止，无重试／补发。

私有原始依据位于`.recovery-artifacts/g3-d43-qwen-20261027/`，原D41不完整超时事实保持；本次证据不能回填旧事件。

## 分层结果

| 层次           | 实际证据与结论                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 客户端HTTP     | 入口200，读取至正常EOF；实际收到4942389字节，SHA256为67fd3d5b279f4ad5e189ffa2b806ea7385a9b4ccff8c70dc1fc96e3993ad7abc，未发生读取错误或采集截断                                                               |
| 流协议         | 13619个可解析SSE数据帧；全部finish_reason为null，无[DONE]，无上游错误帧。HTTP EOF不能证明模型完整结束                                                                                                         |
| 模型内容       | SDK观察到10505个reasoning与2211个正文进展事件（不是token计数）。正文7665字节／6123字符，JSON.parse报Unterminated string，位置6123、行180列8；不能进行完整Zod／冻结材料正向验证                                |
| SDK            | AiSdkGenerationError，code=transport_unknown、phase=stream、externalResult=unknown；原文为“Response stream ended without a finish reason.”。这句由SDK发现源流缺少结束原因后生成，不是Cloudflare返回的错误JSON |
| 本地计时       | 首有效进展约3.98秒，末次进展17:55:49.232，SDK失败17:55:49.238；无first_output_timeout／output_idle_timeout／task_budget_exhausted。600秒总预算及首输出／空闲计时没有触发本次终止                              |
| Cloudflare日志 | HTTP200、status_code=200、success=true、provider=workers-ai、同一Qwen模型，duration=300090ms；响应size5877402、response_head_complete=false。当时只取详情中的正文前缀；2026-10-29已由完整响应接口补取全部存档，见下文 |
| Trace          | captureStatus=complete，11份产物SHA256及身份反读通过、issues为空。此处表示脱敏观察记录完整，不代表源流协议或研究结果完整                                                                                      |
| 业务与迁移     | SDK未产出可接受的完整对象，业务校验未进入，无报告／业务库写入；D43未通过，GLM未验，不推广2020-12候选，不声明正式G3通过                                                                                        |

上游链路在约300秒结束并留下不完整JSON及流终态，是本次实际阻断。当前没有明确的上游超时错误码或内部组件日志，不能仅凭duration认定某个固定300秒配置。Cloudflare[请求处理文档](https://developers.cloudflare.com/ai-gateway/configuration/request-handling/)将cf-aig-request-timeout定义为首响应等待；本次首响应约2秒且未设置该头，不能直接把它当作本次流尾截断的修复项。本轮未修改网关或任何请求参数来试探。

## 离线与用量边界

- 保留结束协议与13619帧序列，脱敏reasoning恢复为同字符数占位字符串（不恢复原思考内容、不声称字节级重放），同版SDK复现相同NoFinishReason错误，外部模型0。原两次重放准备错误分别是非UUID请求标识、脱敏reasoning对象类型不适合直接输入SDK，独立失败文件保留；二者均不是本次真实调用的失败原因。
- SDK和网关原样报告input=0／output=1，明显不足以代表数千增量的真实token用量，未将它当作可靠总量。网关另报0.290909081697464 Neurons、cost=0.000003199999898672104，这是日志计算值，不作为实际账单扣费；零付费边界沿用用户确认的Workers Free超额拒绝，未升级套餐，未读取到账单。
- 本次新增授权1/1已用，失败停止。原GLM计划继续frozen_after_qwen_failure、used=0／remaining=1；未变默认模型、reasoning、输出合同、V2或生产配置。

## 保护与接续

真实请求前后35张表行数／摘要、结构head、五容器身份／镜像／健康／安全配置完全一致，活动AI／回测均0。三仓HEAD、空暂存区与原WIP保全，原D41及验收包保留，不stage／commit；仅本次私有诊断与说明记录新增。

当前第一未通过层为Cloudflare返回流的完整终结及完整研究对象；其约300秒结束的内部来源仍待进一步上游证据。不能用延长本地预算、补造finish_reason／[DONE]、修补残缺JSON、切换模型或放宽校验代收验收。旧GLM冻结与D41双模型推广门槛保持，正式G3仍由原Task T5负责。

## 2026-10-29：只读补取网关完整响应

北京时间2026-10-29重新读取同一网关日志，详情接口仍返回HTTP200、duration=300090ms、response_head_complete=false。随后只读调用`GET /accounts/{account_id}/ai-gateway/gateways/default/logs/01a17cc4-f698-748a-95a7-7c8f53fcd999/response`，返回HTTP200并取得5877402字节，恰好等于详情登记的response_size，未触及本次下载容量限制。

修正此前取证范围：详情中的response_head只是前缀，完整响应接口仍可下载该日志保存的全部响应。下载内容虽然标为text/event-stream，实际是含streamed_data的JSON聚合存档；其SHA256为b969ee954aaad378fc6b268f49bffead314b41ae22aab01738b67a9e7919a82a，不能与客户端归一化SSE的原始字节摘要混为同一种表示。密钥与reasoning正文脱敏后单独保存，原D43产物保持。

| 核对项 | 补取结果 |
| --- | --- |
| 原生响应标识 | chatcmpl-55aa1a62-a418-4f3f-b851-a620090f82ba；streamed_data首末帧标识一致 |
| 帧与结束原因 | streamed_data共13619帧，所有finish_reason均为null，无错误帧 |
| 本地对照 | 逐帧比较choices的index、正文、脱敏reasoning字符数、finish_reason及帧级error，均与原客户端trace一致；未声称思考原文或原始字节相同 |
| 研究正文 | 拼接后仍为7665字节／6123字符，SHA256为c93cafd9122d2a4029864ccfb21bf6dc19baf287ba3e44f0fd315df5a7e663b7，与原客户端正文完全相同，JSON仍因字符串未结束而无效 |
| 证据边界 | 已取得网关保存的完整日志，但模型输出及结束协议仍不完整；没有新增内部超时错误码或具体组件日志 |

只读下载及对照依据位于`.recovery-artifacts/g3-d43-qwen-20261027/cloudflare-log-read-20261028T163438Z/`的receipt.json、response-redacted.json、assistant-content.txt与comparison.json，目录名使用UTC时间。本次新增模型请求0、配置写入0、业务写入0，不stage／commit。

网关存档本身已包含与客户端相同的残缺正文及缺失结束原因，因此现有证据不支持“SDK丢掉了一个已完整返回的研究对象”。约300秒中断究竟由Workers AI、AI Gateway或内部执行节点的哪项条件触发，仍无法从这些日志判定；D43失败和原冻结边界保持。
