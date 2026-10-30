# G3 D51：相同数字事实的非流式curl对照

对应[超时治理Task T5](../2026-10-25-ai-adaptive-execution.md)与[研究G3](../2026-10-18-research-evidence-evolution.md)，接续[D50](2026-10-29-g3-qwen-single-numeric-fact.md)。用户授权仅把stream改为false并删除stream_options，用curl最多1次、零费用、关闭思考、不加token上限、失败即停；保留配置、数据及WIP，不stage／commit。旧GLM1次继续冻结。

## 唯一请求差异

- stream：true→false。
- 删除stream_options：原值为include_usage=true。

D50的messages逐字保持，仍为446字符的单条合成数量12事实；完整研究response_format仍8802字节、SHA256=156a678f260b3f1c5240b0e007cc724e0cf730e2e68c4ee08a9a9a1a0fb3834a。其余模型@cf/qwen/qwen3.8-27b、端点、认证账户、enable_thinking=false、curl／日志头与所有请求字段保持；无max_tokens／max_completion_tokens、stop、reasoning_effort或采样参数。

本次正文9609字节，SHA256=d386eff9d5e3e4faf570ec4cd86d9a4c17bb57452463f34e04b31dd1eb975e6f；D50原正文9648字节，SHA256=f3e11c5b49400c02925a384c33f7266c5398781f408f9800dfa578b807ab041f。request-diff.json记录两处差异及其余字段全等。

## 非流式捕获与验收

直接由系统curl发送，按完整HTTP JSON信封解析choices[0].message.content，要求finish_reason=stop，不要求SSE或[DONE]。取出原始研究正文后，仍运行原研究Zod、证据ID／字段／数值12／count／null绑定及原数值核验。

总预算仍1200秒、内含5秒收尾；非流式首正文前120秒、正文传输空闲60秒，HTTP重试0。没有逐token事件，进展按HTTP正文传输记录，计时数值及原总预算不变。

新捕获器的本机非流式HTTP样例已通过：发送字节、完整JSON信封、单对象、stop及凭据／思考脱敏均验证，模型调用0。生成代码中的HTTP头转义问题已在外部派发前修正，正文不变，修复和新源码摘要记录于preparation-repair.json。

D50的本地Schema／数值正向及错误值13拒绝证据按相同输入与模块摘要复用，fixture-schema-check.json保留来源和复用时间；没有重跑未变化的业务样例。合成记录和最小数值context保持，不构造真实业务冻结记录或数据库引用绑定。

## 实际结果：传输失败，未取得非流式样本

唯一HTTP尝试在60.623秒后返回curl退出码52，stderr为 `curl: (52) Empty reply from server`。没有收到HTTP响应头、状态码或正文，也没有网关日志ID；这不是HTTP52／502或模型返回了空字符串。完整JSON、原业务Zod及实际数值绑定均未进入，不能据此判定非流式Schema是否成功。

| 项目 | 实际结果 |
| --- | --- |
| 开始／结束 | 北京时间2026-10-29 03:47:23.650／03:48:24.276 |
| 客户端耗时 | 60.623秒 |
| curl退出码 | 52，Empty reply from server |
| HTTP状态／响应头 | 未取得；httpStatus=null |
| 原始响应正文 | 0字节，SHA256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| 首正文／结束原因 | 未取得，firstBodyAt=null、finishReasons为空；DONE对本模式不适用 |
| 本地期限 | timeoutStage=null；120秒首响应期限未触发，60秒正文传输空闲阶段尚未开始 |
| 主动取消 | 无；未发送SIGTERM，不同于D50的失败后取消 |
| 实际Schema／数值校验 | 未进入；actual-schema-check.json因协议前置不满足而accepted=false |

请求明确携带enable_thinking=false，但由于没有模型输出，不能把捕获器的reasoningCharacters=0当作实际已完成的无思考生成证据。没有用空文件的JSON解析错误冒充模型Schema失败，也没有补发请求。

## 网关只读查找

因为客户端没有收到日志ID，未直接调用按ID读取正文的脚本。随后用相同账户只读GET `/ai-gateway/gateways/default/logs`，HTTP200、API success=true。2026-10-29 03:56:29取得的完整单页为11条，count=total_count=11、per_page=20；最新仍是D50日志01a183c5-1d04-7123-843d-c2caa2980ca9，创建于02:32:35。没有本次派发之后的新记录或可关联候选。

gateway-list-redacted.json、gateway-window-candidates.json及gateway-lookup-proof.json保留列表元数据、分页和判断依据；列表的request／response／prompts等正文载荷不落盘。当前没有可读回的D51原始上游正文，也不能用“暂未查到网关记录”证明请求从未到达Cloudflare。是否实际进入推理、上游输出、最终用量和账单记录均未知；本地只确认一次HTTP派发尝试。

本轮在线API文档入口连接失败后，改为只读查询已知网关日志集合接口；未扩大权限或改网关配置。查询不触发推理，未消耗新的模型请求授权。

## 当前结论与保全

本次停在非流式HTTP响应链路，无法进行D50／D51的Schema行为对照。60秒附近的连接关闭不来自当前捕获器的120秒首响应或60秒正文空闲控制；具体来自网络、代理、接入端还是更深上游尚未定位，不能因本次结果宣称非流式也违反研究Schema。

下一验收前置为取得完整非流式响应并定位空响应关闭来源，而不是更改研究合同或降低Zod／数值校验要求。原D50的短输入Schema违规事实保持；正式G3与D41双模型／推广仍未通过。

新增授权1/1按HTTP派发计已用、remainingAuthorized=0，实际推理是否发生未确认；无重试，旧GLM1次继续冻结，零付费仍沿用已确认Workers Free超额拒绝边界。不部署、不启用V2或Provider、不修改配置和业务数据，不stage／commit。三个仓库原文件摘要、HEAD／空索引及旧验收包316个文件的保护比较见final-proof.json；只新增本回执并更新两份现有Task，原WIP保持。

私有目录.recovery-artifacts/g3-d51-nonstream-20261029/保留plan.json、request-body.json、request-diff.json、fixture-schema-check.json、offline-proof.json、preparation-repair.json、preflight.json、submitted-once.lock、dispatched.json、outcome.json、response-headers.json、non-json-response-summary.json、assistant-content.txt（空）、actual-schema-check.json、gateway-list-redacted.json、gateway-window-candidates.json、gateway-lookup-proof.json、protocol-proof.json、workspace-before.json及final-proof.json。研究输入和完整Schema只在本次获准请求中使用，凭据未写入命令参数或日志。
