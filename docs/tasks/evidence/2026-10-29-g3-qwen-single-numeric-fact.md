# G3 D50：短输入的非空事实与数值分支验证

对应[超时治理Task T5](../2026-10-25-ai-adaptive-execution.md)与[研究G3](../2026-10-18-research-evidence-evolution.md)，接续[D49空事实分支](2026-10-29-g3-qwen-full-schema-short-input.md)。用户授权维持短输入与完整研究Schema，增加一条含数字的可核验事实，curl最多1次、关闭思考、不加token上限、失败即停；保留配置、数据和WIP，不stage／commit。沿用Workers Free零付费边界，旧GLM1次保持冻结。

## 唯一测试事实与冻结请求

本次事实为本地合成记录，不代表真实业务或市场信息，不写入业务数据库：

```json
{"evidenceId":"7e53c1ca-eafa-4f65-a9f0-0ef9a2486f50","description":"合成测试记录A的数量为12个","data":{"quantity":12},"numericFields":[{"fieldPath":"/quantity","unit":"count","currency":null}]}
```

短输入要求claims恰1条：id=c1、kind=qualitative、引用该evidenceId并陈述数量12个；numericClaims恰1条：id=n1、kind=field、source引用该记录的/quantity、value=12、unit=count、currency=null。条件与下一步数组为空，confidence.level=unassessed、basis说明仅单条合成记录，不添加其他事实。

本次只修改D49的messages。完整研究response_format、模型@cf/qwen/qwen3.8-27b、curl、端点、stream=true、include_usage=true、enable_thinking=false、日志头及等待均保持。完整格式仍8802字节、SHA256=156a678f260b3f1c5240b0e007cc724e0cf730e2e68c4ee08a9a9a1a0fb3834a；不增加max_tokens／max_completion_tokens、stop、reasoning_effort或采样参数。

单条短输入446字符／626字节；整个请求9648字节，SHA256=f3e11c5b49400c02925a384c33f7266c5398781f408f9800dfa578b807ab041f。总预算1200秒、内含5秒收尾、首输出120秒、空闲60秒，HTTP重试0。

## 本地验收与数值绑定

完整Schema和最小非空样例已通过原researchGenerationV2Contract业务Zod。原verifyResearchNumericEvidenceV2纯函数已使用合成evidence映射验证source；离线把引用值12改成13时，它拒绝并报“数值引用与冻结字段实际取值不一致”。已知值、单位、币种、字段路径及证据ID均纳入验收，而非只检查数组长度。

校验器禁止模型SDK与网络，调用原数值函数只做本地数值计算。本次合成映射不包含正式AiFrozenResearchV2完整性／指纹／准入审计或数据库AiToolCall绑定，不代收真实资料的研究生命周期。受控HTTP流也已通过完整单JSON、stop／DONE及脱敏验证，当前外部模型调用0。

## 实际结果：失败停止

唯一请求HTTP200并返回正文，思考输出0。首个完整对象已包含1条qualitative claim与1条field numericClaim，数值source的证据ID、/quantity、12、count、null与合成记录完全一致；但是首对象本身不符合完整Schema，之后还继续输出Markdown围栏及额外内容，完整响应不可解析为单个JSON。本次不通过。

| 项目 | 实际结果 |
| --- | --- |
| 开始时间 | 北京时间2026-10-29 02:28:11.836 |
| HTTP响应头／首正文 | 02:28:16.705／02:28:18.934 |
| 停止时间／客户端耗时 | 02:32:34.313／262.474秒，本地主动取消 |
| HTTP／curl退出 | 200／-15，对唯一curl子进程发送SIGTERM；stderr为空 |
| 原始HTTP body | 1823977字节；SHA256=3fcdfd88b0b0a81a81d5364659b15b771579a91e0ac8a5f3059c4703c3e8f3ba |
| 客户端捕获 | 5050个有效JSON事件；无非法JSON事件或残缺末事件 |
| 助手正文 | 14186字节／12176字符；SHA256=edaae498ec3a6b62721f6c31aa18d48b9307a8bd8a559c16a8529fbbdf4390c2 |
| 完整JSON解析 | Extra data，零起始位置814，行44列1 |
| 思考输出 | 0帧／0字符 |
| 终态与计时 | 取消前无非空finish_reason或[DONE]；本地总预算／首输出／空闲期限均未触发 |
| 网关日志ID | 01a183c5-1d04-7123-843d-c2caa2980ca9 |
| cf-ray | a51bffce5d7ace55-SIN |

这里的取消是“失败即停”的执行动作，不是新增请求参数、缩短原timeout、增加token上限或供应商主动EOF。failure-stop-cancel.json记录取消前完整JSON已经报Extra data：首对象在字符811结束，其后已观察到11111字符、以Markdown围栏开始；取消前已观察部分的摘要与最终捕获正文前缀一致。只向核对PID／PPID／UID及请求文件参数后的本次curl子进程发送信号，控制器继续完成证据收尾，没有重试。

## 首对象的实际Schema违规

首对象的JSON语法完整，并不等于满足研究合同。prefix-diagnostic.json仅在内存中检查原始811字符前缀，没有修剪整段结果作为成功输出，fullResponseAccepted=false。原业务Zod给出：

- numericClaims[0]存在合同不允许的rationale字段。
- 根对象缺少必填risks、unknowns、disclaimer。
- confidence.basis是字符串，合同要求字符串数组。

这些与实际发送的完整Schema一致：根required包含上述字段，field数值项additionalProperties=false，basis.type=array。observed-schema-violations.json同时记录这些声明与输出差异。首对象摘要51c11b6e65fff38f1ae3af0b1e7792b60ff1e9ffa313059525b7770d28c9a4f9；其source五项虽然正确，但不能据此接受整个对象。

整段actual-schema-check.json为accepted=false／protocolComplete=false；首对象prefixChecksPassed=false／原Zod失败，所以实际模型输出未进入原数值函数的整体验收。fixture-schema-check.json中的原Zod／原数值函数／错误值13拒绝仅是本地已知样例证据，不替代实际模型结果。

## 网关存档与取消边界

终态后只curl GET读取日志详情及/response，不调用模型。详情status_code=499、duration=258208ms、cached=false，与主动取消边界一致；日志的success字段不代替生成验收。

完整已记录原生聚合响应2135196字节，与response_size一致；下载SHA256=660d3c9942f60cdebcdf8bf26872a2d32bf2cc2c9a70104b383ad2328ac93e19。网关记录5061帧、12213字符／14223字节正文，客户端5050帧、12176字符／14186字节。客户端正文是网关正文的完整前缀，网关多记录11帧／37字符，双方均在位置814报Extra data，均无思考或非空结束原因。

因此sameProjectedFrames=false、sameAssembledContent=false，不能声称整段存档与客户端完全一致；取消前共同内容已足以复现JSON及Schema违规。本次没有观察供应商自然EOF，也不能把258／262秒当成新的上游固定期限。取消前未收到终态汇总，最终用量／账单金额未取得；不将分片usage或帧数直接当成完整用量。

## 当前结论与保全

D49的空事实数组分支可正常结束；D50在仅一条合成数字事实、短输入及同一完整Schema下已复现Schema不符和单JSON失败，长材料不是该失败的必要条件。当前流式样本中的strict=true未阻止上述违规输出；具体是流式结构化输出路径、模型遵循或其他上游处理导致，尚未通过独立对照确定。派生tuple、价格方向、非空条件及真实长材料仍未验收，正式G3与D41双模型推广保持未完成。

本次新增1/1已用、remainingAuthorized=0，无重试，旧GLM1次保持冻结。失败后仅只读取证与离线诊断。不部署、不启用V2或Provider、不修改应用配置或业务数据、不stage／commit。三个仓库原文件摘要、HEAD／空索引与旧验收包280个文件的保护比较见final-proof.json；仅新增本回执并更新两份现有Task，原WIP保持。

私有目录.recovery-artifacts/g3-d50-single-fact-20261029/保留request-body.json、request-diff.json、synthetic-evidence.json、numeric-context.json、fixture-schema-check.json、offline-proof.json、preflight.json、submitted-once.lock、dispatched.json、failure-stop-cancel.json、outcome.json、response-redacted.ndjson、assistant-content.txt、actual-schema-check.json、prefix-diagnostic.json、observed-schema-violations.json、gateway-log-detail.json、gateway-response-redacted.json、gateway-comparison.json、cancel-comparison.json、protocol-proof.json、workspace-before.json及final-proof.json。凭据与思考字段按现有规则脱敏；原始研究正文原样保留，没有补必填项、删除违规字段或裁剪为业务报告。
