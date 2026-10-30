# G3 D52：网络问题后的同请求非流式复验

对应[超时治理Task T5](../2026-10-25-ai-adaptive-execution.md)与[研究G3](../2026-10-18-research-evidence-evolution.md)，接续[D51](2026-10-29-g3-qwen-nonstream-control.md)。用户反馈刚才网络有问题并授权再试一次，本次新增最多1次零费用HTTP尝试、失败即停，旧GLM1次继续冻结；D51失败证据保持，不重置原预算或锁。

## 相同输入与验收

D51的request-body.json逐字节复制，正文仍9609字节、SHA256=d386eff9d5e3e4faf570ec4cd86d9a4c17bb57452463f34e04b31dd1eb975e6f，没有任何请求字段变化。保持同模型@cf/qwen/qwen3.8-27b、446字符短输入、数量12的合成记录、完整研究Schema、stream=false、无stream_options、enable_thinking=false，无token上限／stop或采样参数。

curl、认证账户、日志头、原1200秒总预算、120秒首正文／60秒传输空闲及HTTP重试0保持。非流式捕获、认证、脱敏函数源码与D51完全相等；相同请求字节、相同curl版本及Schema／数值模块摘要核对通过，所以复用D51已通过的本机捕获及业务样例证据，不重跑未变化检查。

验收仍要求完整非流式HTTP JSON信封、finish_reason=stop、message.content为单研究JSON、原Zod与原数值源绑定通过、无思考输出；不要求SSE或[DONE]。只读网关预检使用最后已知D50日志核对账户和模型，因D51没有可关联日志ID。

## 实际结果：同样的空响应，失败停止

唯一尝试仍报 `curl: (52) Empty reply from server`，没有HTTP状态码、响应头或正文，未取得网关日志ID。原120秒首正文期限没有触发；因为没有首正文，60秒正文传输空闲阶段也没有开始。该结果不能判为模型返回空文本或研究Schema不符合。

| 项目 | D51 | D52 |
| --- | --- | --- |
| 开始时间（北京时间） | 2026-10-29 03:47:23.650 | 2026-10-29 04:25:33.574 |
| 结束时间（北京时间） | 03:48:24.276 | 04:26:34.196 |
| 客户端耗时 | 60.623秒 | 60.620秒 |
| curl退出码 | 52 | 52 |
| HTTP状态／头／正文 | 未取得／未取得／0字节 | 未取得／未取得／0字节 |
| 本地期限 | 未触发 | 未触发 |
| 实际JSON／Zod／数值验收 | 未进入 | 未进入 |

两次请求字节及捕获函数完全一致，停止耗时仅相差约0.003秒，提示应调查固定的响应等待／关闭窗口，而不能只归为短暂网络波动；但现有证据不能确定关闭来自代理、接入层或更深上游。没有主动取消、延长timeout或重发请求。

reasoning请求参数仍关闭；由于没有响应，不能将捕获器的reasoningCharacters=0当作实际无思考生成的证据。actual-schema-check.json为accepted=false／protocolComplete=false，原Zod及数值函数未处理实际模型输出。

## 网关与代理只读核对

04:28:06通过同账户网关列表API取得HTTP200，完整单页11条，count=total_count=11、per_page=20；最新仍D50日志01a183c5-1d04-7123-843d-c2caa2980ca9，创建于02:32:35。没有本次派发之后的新记录或可关联候选；列表只保留元数据，不保存request／response／prompts载荷。

由于无日志ID和匹配记录，没有可读取的D52上游原文。是否实际到达推理、推理结果、实际用量和账单记录仍未知；不能从无记录推出确定未到达Cloudflare。

事后只读环境显示HTTPS_PROXY／HTTP_PROXY指向http://127.0.0.1:7890，ALL_PROXY指向同端口的socks5；未发现针对api.cloudflare.com的NO_PROXY匹配。TCP连接该端口成功，但lsof未取得监听进程信息，不能把它解释为无监听或认定代理是关闭方。network-environment.json与proxy-reachability.json标记为事后观察，未修改代理或系统网络配置。

## 结论、预算与保全

D52复现D51约60秒空响应。当前非流式JSON／Schema对照仍缺实际响应样本；可继续优先定位固定关闭点，或在新的明确授权下建立非流式最小问候基线，但本轮不再调用模型。原D50的流式Schema违规事实保持，不能据此宣布非流式也违反Schema。

新增授权1/1按HTTP尝试计已用，remainingAuthorized=0，HTTP重试0。实际推理是否发生未确认；旧GLM1次保持冻结，零付费仍沿用已确认Workers Free超额拒绝边界。不部署、不启用V2或Provider、不修改配置或业务数据，不stage／commit。三个仓库原文件摘要、HEAD／空索引以及旧验收包349个文件的保护比较见final-proof.json；仅新增本回执及更新两份现有Task，原WIP保持。正式G3与D41推广未完成。

私有目录.recovery-artifacts/g3-d52-nonstream-retry-20261029/保留request-body.json、request-diff.json、fixture-schema-check.json、offline-proof.json（含复用来源）、preflight.json、submitted-once.lock、dispatched.json、outcome.json、response-headers.json、non-json-response-summary.json、assistant-content.txt（空）、actual-schema-check.json、gateway-list-redacted.json、gateway-window-candidates.json、gateway-lookup-proof.json、network-environment.json、proxy-reachability.json、transport-comparison.json、protocol-proof.json、workspace-before.json及final-proof.json。失败后只做只读查询与证据核对，未新增推理尝试。
