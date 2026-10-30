# G3 D47：Qwen最小问候curl验证

对应[超时治理Task T5](../2026-10-25-ai-adaptive-execution.md)与[研究G3](../2026-10-18-research-evidence-evolution.md)，接续[D46](2026-10-29-g3-qwen-reasoning-off.md)。用户要求构造简单请求，本次新增最多1次零费用curl请求，沿用Workers Free超额拒绝与失败即停，旧GLM1次继续冻结。

## 简单请求

```json
{"model":"@cf/qwen/qwen3.8-27b","messages":[{"role":"user","content":"请只回复：你好"}],"stream":true,"stream_options":{"include_usage":true},"chat_template_kwargs":{"enable_thinking":false}}
```

正文198字节，SHA256=aa20cbbc27c543fa6915d380c56c222bdbfa8f9c396246ddde50d6a2ae50a552。相对D46，将messages改为单条问候，并移除response_format；模型、流式／用量选项、关闭思考参数、端点、认证账户、curl／日志头与等待保持。不增加token上限、stop或采样参数。

本次期望非空问候文本及正常stop／DONE，不要求JSON。受控流相应以纯文本问候校验，不能将非JSON判为本次格式失败。总预算仍1200秒、内含5秒收尾、首有效输出120秒、进展空闲60秒，HTTP重试0。

这是最小连通与流终态验证，同时简化了材料和输出约束；即使成功，也不能直接归因为原Schema或原Prompt其中某一项，更不代收正式G3报告、引用、历史或候选推广。

## 实际结果：最小请求通过

本机纯文本受控流与D46同账户日志只读预检通过后，唯一真实请求返回“你好”，没有额外字符。实际模型调用1次，curl未经过SDK，未重试。

| 项目 | 实际结果 |
| --- | --- |
| 请求时间 | 北京时间2026-10-29 01:58:08.541 |
| 客户端／网关耗时 | 1.671秒／506ms |
| HTTP／curl | 200／退出0，stderr为空，本地期限未触发 |
| 模型／缓存 | @cf/qwen/qwen3.8-27b；cached=false |
| 正文 | 你好；6字节／2字符，逐字符合请求 |
| 思考输出 | 0帧／0字符 |
| 流终态 | 客户端5个有效JSON帧，收到stop与[DONE]，无错误或截断事件 |
| 网关日志ID | 01a183a9-8ce1-75f8-b838-9a78f4ea4385 |
| cf-ray | a51bd3b44889aa0f-SIN |
| 原始HTTP body | 1723字节；SHA256=11946b6d5f48c5e34deb1edbab99456c38afc5b6790b7058f180f6646d77c188 |
| 正文SHA256 | 670d9743542cae3ea7ebe36af56bd53648b0a1126162e78d81a32934a711302e |

本次未要求JSON；outcome.json沿用的JSON探测字段为false，符合普通文本预期，不属于失败。complete_text与expectedGreetingExact=true分别记录协议通过及问候逐字相等。

## 完整网关日志与终态差异

终态后通过curl GET读取详情及/response，均成功。详情success=true、status_code=200、duration=506ms、cached=false。原生聚合正文2377字节，与response_size一致，原始下载SHA256=ffc1ac879c7967e4b82b1547aaa6b40255d9ee87c6302e2a22a87b51b026151f。

网关与客户端组装正文均为“你好”，思考字段均为0；5帧usage逐帧一致。最后汇总为输入17、输出2、合计19 token与1.2772727012634277 Neurons，只读取汇总一次，不重复累加增量或终止帧；Neurons不是美元金额，零付费仍依据既有Workers Free超额拒绝边界。

原生存档与兼容端的终态形状存在实际差异：原生第2帧为stop、第3／4帧choices为空；客户端第2帧结束原因为null、第3／4帧均带空delta与stop，之后收到[DONE]。因此sameProjectedFrames=false，不能声称逐帧投影完全相等；正文、用量与最终stop语义一致。客户端两个stop来自同一次HTTP流，不是两个推理请求。terminal-comparison.json保留此差异，gateway-comparison.json保留原始比较结果。

## 结论与保全

简单问候说明本次Cloudflare/Qwen、认证、关闭思考、curl与兼容流终态可以工作，约300秒结束并非每次请求必然发生。D46复杂研究请求仍失败；由于本次同时替换messages并移除response_format，尚不能在输入规模、提示内容及结构化输出约束之间确定具体原因。正式G3、原Zod／冻结数值／引用／历史验收与D41候选推广均未通过，不从问候成功推导它们完成。

本次新增1/1已用、remainingAuthorized=0；旧GLM1次继续冻结。不部署、不启用V2或Provider、不修改应用配置或业务数据，不stage／commit。三个仓库原文件摘要、HEAD和空索引，以及旧验收包198个文件的保护比较见final-proof.json；仅新增本回执并更新两份现有Task，原WIP保持。

私有证据位于.recovery-artifacts/g3-d47-simple-curl-20261029/：plan.json、request-body.json、request-diff.json、offline-proof.json、preflight.json、submitted-once.lock、dispatched.json、outcome.json、response-headers.json、response-redacted.ndjson、assistant-content.txt、upstream-identifiers.json、gateway-log-detail.json、gateway-response-redacted.json、gateway-comparison.json、terminal-comparison.json、workspace-before.json及final-proof.json。原始响应字节在内存中计算摘要，凭据和思考字段沿用脱敏规则。
