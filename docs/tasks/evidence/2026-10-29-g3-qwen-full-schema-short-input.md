# G3 D49：短输入与完整研究Schema的curl验证

对应[超时治理Task T5](../2026-10-25-ai-adaptive-execution.md)与[研究G3](../2026-10-18-research-evidence-evolution.md)，接续[D48最小Schema](2026-10-29-g3-qwen-simple-schema.md)。用户授权保持短输入、改用完整研究Schema、curl最多1次、关闭思考、无token上限、失败即停；沿用Workers Free零付费边界，旧GLM1次继续冻结。

## 冻结输入与边界

完整response_format从[D46](2026-10-29-g3-qwen-reasoning-off.md)冻结请求原样提取：严格json_schema／name=response／Draft2020-12，包含研究V2全部12个根字段及原联合、数值、条件与tuple结构，无删减或改写。其规范化JSON为8802字节，SHA256=156a678f260b3f1c5240b0e007cc724e0cf730e2e68c4ee08a9a9a1a0fb3834a。

短指令为174字符／280字节：

```text
未提供研究材料。请按指定 Schema 返回最简 research-generation-v2 JSON：结论写资料不足，claims、numericClaims、invalidationConditions、nextSteps为空数组；confidence.level为unassessed，basis说明缺少材料。不要编造事实，只输出JSON。
```

短指令适配完整研究合同，替换D48要求reply字段的问候指令；不回填长材料或真实证据ID。实际请求9278字节，SHA256=ced6a76857604867d7f50a9c7b8d2398298f2b8232fc127d9926d1bc8279076c。

模型@cf/qwen/qwen3.8-27b、同账户端点、curl、stream=true、include_usage=true、enable_thinking=false、日志头及等待保持。无max_tokens／max_completion_tokens、stop、reasoning_effort或采样参数；总预算1200秒、内含5秒收尾、首输出120秒、空闲60秒，HTTP重试0。

验收分两层：完整单JSON及stop／DONE／0思考输出；随后用原researchGenerationV2Contract的业务Zod校验实际正文，并核对无材料事实数组为空。完整Schema的本地最小样例已通过原Zod，校验器禁止网络与模型SDK；这不代收原研究材料的事实／数值／引用或正式G3生命周期。

## 实际结果：完整Schema的无材料分支通过

同账户D48日志只读预检通过后，唯一curl请求正常结束，返回单个完整研究JSON。原researchGenerationV2Contract业务Zod校验通过；未加载模型SDK、未执行网络校验或业务持久化。

| 项目 | 实际结果 |
| --- | --- |
| 请求时间 | 北京时间2026-10-29 02:15:33.205附近 |
| 客户端／网关耗时 | 11.784秒／5229ms |
| HTTP／curl | 200／退出0、stderr为空，本地期限未触发 |
| 正文 | 单JSON，527字节／393字符；version=2，conclusion=资料不足，confidence.level=unassessed |
| 数组分支 | claims／numericClaims／invalidationConditions／nextSteps均为空，符合短指令 |
| 思考输出 | 0帧／0字符 |
| 流终态 | 174个有效JSON帧，收到stop与[DONE]；无非法事件、残缺末事件或错误帧 |
| 缓存 | cached=false |
| 原Zod | 实际对象通过，原合同research／research-generation-v2 |
| 网关日志ID | 01a183b9-91f9-72d6-a369-1137519308df |
| cf-ray | a51bed51a9e040f5-SIN |
| 原始HTTP body | 62816字节；SHA256=c6adc3abf9e57ea3327816005079c2002385772a6fbc3ae7f59dd9ca2439697d |
| 正文SHA256 | 389d2f1ba51fb3e4348e5114166c3a366f0cd975a28582b32bd70c4aa396b62d |

正文的rationale说明未提供材料、无法形成有效结论；disclaimer为“基于当前输入，无法生成研究结论”；confidence.basis列出缺少材料／研究数据／文献。risks和unknowns也为空。本次只核对原合同与已给指令，不从该对象生成业务报告或声称它包含有材料的研究结论。完整原文保存在私有assistant-content.txt。

fixture-schema-check.json和actual-schema-check.json均accepted=true／originalZod=true／fullResearchFormatExact=true。两次使用相同业务Schema模块摘要b4394ecff609b00845f208f110713a1d49b5a56d5ce7d4831ee09f21d9247215；输出保持原文，未补字段或修剪尾随内容。

## 完整网关存档与终态核对

终态后仅curl GET读取日志详情及/response。详情success=true、status_code=200、duration=5229ms、cached=false；完整原生聚合响应79479字节，与response_size一致，下载SHA256=fe21c1304b20b5ac68f60b24afe80cfb93850a0b0ca6ceb0b3cfe812f7ac164b。

网关与客户端均174帧、0思考字段，组装正文、JSON解析和逐帧usage一致。最终汇总输入70／输出171／合计241 token、52.609089225530624 Neurons，只读取汇总一次；不把Neurons当成美元或token上限。

原生第171帧为stop、第172／173帧choices为空；兼容端第171帧结束原因为null、第172／173帧均为空delta与stop，其后客户端收到[DONE]。因此sameProjectedFrames=false，不能声称终态帧形状完全一致；正文、用量与正常结束语义一致。差异保存在terminal-comparison.json，两个stop仍属于同一个HTTP请求。

## 结论与验收边界

| 样本 | 输入与Schema | 结果 |
| --- | --- | --- |
| D47 | 短问候，无Schema | 1.671秒，正常终态 |
| D48 | 短问候，单reply字段严格Schema | 2.096秒，正常终态及匹配对象 |
| D49 | 174字符无材料短指令，完整研究Schema | 11.784秒，正常终态及原Zod通过 |
| D46历史 | 原研究提示与冻结材料，完整研究Schema | 302.953秒EOF、无终态，整段JSON报Extra data |

完整研究Schema可以在当前端点完成无材料、空事实数组分支。剩余尚未隔离的是非空claims／numericClaims／条件／tuple等实际输出分支，以及原研究提示／长材料的影响；不能据此把长度认定为唯一根因，也不能声称全部2020-12约束或原G3已验收。当前第一未通过层仍为包含实际冻结材料的正式G3及其报告／数值／引用／历史；D41双模型与推广条件保持。

## 预算、保全与可反读证据

本次新增1/1已用、remainingAuthorized=0，HTTP重试0，未补发；旧GLM1次继续冻结。不部署、不启用V2或Provider，不修改应用配置、业务数据或旧验收包，不stage／commit。三个仓库原文件摘要、HEAD和空索引，以及旧验收包250个文件的保护比较见final-proof.json；仅新增本回执并更新两份现有Task，原WIP保持。

私有目录.recovery-artifacts/g3-d49-full-schema-short-20261029/保留：plan.json、request-body.json、request-diff.json、minimal-fixture.json、fixture-schema-check.json、offline-proof.json、preflight.json、submitted-once.lock、dispatched.json、outcome.json、response-headers.json、response-redacted.ndjson、assistant-content.txt、actual-schema-check.json、upstream-identifiers.json、gateway-log-detail.json、gateway-response-redacted.json、gateway-comparison.json、terminal-comparison.json、protocol-proof.json、workspace-before.json及final-proof.json。原始响应在内存中计数和计算摘要，凭据与思考字段按现有规则脱敏落盘。
