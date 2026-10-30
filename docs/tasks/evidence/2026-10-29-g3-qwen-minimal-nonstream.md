# G3 D53：Qwen 最小非流式请求验收

对应[超时治理 Task T5](../2026-10-25-ai-adaptive-execution.md)与[研究 G3](../2026-10-18-research-evidence-evolution.md)，接续[D52](2026-10-29-g3-qwen-nonstream-network-retry.md)。用户新增授权仅 1 次 curl 最小非流式请求，零费用、失败即停；旧 GLM 额度保持冻结。

## 输入与边界

实际请求正文 159 字节，SHA256 为 86c3edd602081205db7eceb5361d02ecedd98f90c5cc663c87c7c7dd50aa02f3：

~~~json
{"model":"@cf/qwen/qwen3.8-27b","messages":[{"role":"user","content":"请只回复：你好"}],"stream":false,"chat_template_kwargs":{"enable_thinking":false}}
~~~

使用与 D52 相同账户、/ai/v1/chat/completions、日志头、curl 8.7.1 与计时策略；没有 stream_options、response_format、stop、max_tokens、max_completion_tokens 或其他输出限制字段。相对 D52 仅缩短 messages 并移除 response_format；相对 D47 历史最小流式请求仅改 stream=false 并移除 stream_options。两种比较均不替代同输入正式 G3 验收。

本次只核对 HTTP200、完整非流式 JSON 信封、单一 message.content 恰为“你好”、finish_reason=stop 与无 reasoning 输出。纯文本正文不要求研究 JSON、Zod 或数值绑定；DONE 不适用。原 1200 秒总预算、120 秒首正文与 60 秒正文传输空闲保持，HTTP 重试为 0。

## 执行与验证

本机非流式捕获样例通过：请求字节相等、HTTP200／stop／“你好”识别正确，注入的思考标记被脱敏，外部模型调用为 0。只读既有网关元数据预检通过，确认相同账户及模型。

唯一真实请求于北京时间 2026-10-29 04:50:37.079 发出，04:50:38.969 完成：

| 检查项 | 实际结果 |
| --- | --- |
| HTTP／curl | 200／退出 0 |
| 客户端耗时 | 1.886653 秒 |
| 响应信封 | 完整 JSON，单一 choice |
| message.content | 你好，2 字符／6 字节 |
| finish_reason | stop |
| reasoning | 内容 0 字符，无结构化思考输出 |
| 期限／取消 | 均未触发，正常完成 |
| 用量 | 输入 17／输出 2／合计 19 token，1.2772727012634277 Neurons |
| 客户端响应 | 502 字节，SHA256 a38881caf6d1a2132aee9c4286352a9c581bf8670d1dccb6a15697db68be2eb2 |

实际信封中的 message 包含 role=assistant、content=你好、reasoning=null；finish_reason=stop，stop_reason=null。纯文本正文的 JSON 解析不适用，不能将“你好”不是研究 JSON 当作本次失败。

## 网关正文反读

日志 ID 为 01a18447-7614-7742-b84d-723be8386fe7，CF-Ray 为 a51cd05c9ac040ac-SIN。只读元数据及 /response 获取成功：同账户、同模型、status_code=200、success=true、cached=false，网关耗时 327 毫秒。

网关正文完整下载 684 字节，与元数据 response_size 相等，SHA256 为 7723f500d295c087130fdc5f22ffda419eca03f2fe17acfddd49a3991dd2afd2。网关和客户端的正文均为“你好”，SHA256 同为 670d9743542cae3ea7ebe36af56bd53648b0a1126162e78d81a32934a711302e；finish_reason、用量与 0 思考输出一致。原生与兼容信封元数据字段不同，未宣称整个响应逐字节相等。sameParsedResearchObject=false 及 assembledJsonValid=false 是纯文本样本的预期诊断值。

兼容响应 id 为 id-1793220638863，网关原生响应 id 为 chatcmpl-2bf267d6-054d-4333-a8c5-4403ff1970b6；二者不同。关联依据是实际客户端响应头 cf-aig-log-id 对应的网关记录，以及同模型、完整正文、终止原因和用量，不要求两层响应 id 相等。

私有取证目录：.recovery-artifacts/g3-d53-minimal-nonstream-20261029/。实际执行 direct.py prepare、direct.py offline、direct.py preflight、唯一一次 direct.py live-once，以及只读 read_gateway.py；通过 RTK 调用 Python，模型 HTTP 由 /usr/bin/curl 发出，未使用 SDK。认证仅在内存读取并通过 stdin 交给 curl，不打印或落盘密钥及原始 reasoning。准备文档时一次工具编排语法错误发生于执行前，没有发出请求或消耗额度。

## 当前结论与保全

最小非流式基线通过，实际调用与网关正文已关联；新增授权 1/1 已用、remainingAuthorized=0，未重试或追加模型请求。旧 GLM 1 次仍冻结。D47 历史最小流式与本次最小非流式都能正常返回，但本次与 D52 同时改变输入和 Schema，不能据此定位 D51／D52 的关闭来源或宣称研究 Schema 是唯一原因。

成功只代表最小非流式基线，不完成研究 Schema、数值绑定、D41 双模型迁移或正式 G3。零付费边界沿用用户确认 Workers Free 超额拒绝，未读取到账单金额。配置、业务数据及原 WIP 保留，不部署、不启用能力，不 stage 或 commit；目标数据库及 V2 当前运行态不在本次直接 HTTP 诊断中反读。最终保全、脱敏与证据一致性检查记录于 final-proof.json 和 protocol-proof.json。
