# G3 D46：Qwen关闭思考的curl对照

对应[超时治理Task T5](../2026-10-25-ai-adaptive-execution.md)及[研究G3](../2026-10-18-research-evidence-evolution.md)，直接接续[D45](2026-10-29-g3-qwen-direct-http.md)。本次是隔离HTTP诊断，不替代正式报告／引用／历史验收。

## 授权与唯一变化

用户明确要求“把Qwen的reasoning关掉，再用curl验证一次，其他请求字段保持不变，不加token上限，失败即停”。新增授权最多1次、零费用、HTTP重试0；沿用已确认Workers Free超额拒绝，旧GLM1次继续冻结。不启用Provider或V2，不改应用默认配置、业务数据或现有验收包，不部署、stage或commit。

只在D45请求正文新增chat_template_kwargs.enable_thinking=false。依据[Cloudflare模型输入参数](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/)的chat_template_kwargs对象与[Qwen官方非思考模式示例](https://huggingface.co/Qwen/Qwen3.8-27B#instruct-or-non-thinking-mode)；未把reasoning_effort=low当作关闭，也未使用该字段不支持的none值。实际是否没有思考输出，以本次返回流另验。

| 输入 | 冻结内容 |
| --- | --- |
| 模型／端点 | @cf/qwen/qwen3.8-27b；同账户/ai/v1/chat/completions |
| D45原始正文 | 22515字节；SHA256=e59d3ebca9ab2ccbdd2d59e02e2195cbe09f264d2c2178e116258a4ce13f4987 |
| D46正文 | 22564字节；SHA256=37764e067f32e671b98eee042e6009e2b0a36773f7f4035a5156f62dab4615f2 |
| 差异证明 | 移除新增chat_template_kwargs后，序列化字节与D45原文完全相等；原字段无改写或删除 |
| 材料与输出合同 | messages、response_format、stream、stream_options及严格2020-12候选保持 |
| 上限／停止参数 | 不含max_tokens、max_completion_tokens、stop或思考预算 |
| 客户端与日志头 | 系统curl8.7.1、HTTP1.1、同User-Agent及三个cf-aig采集头；不执行SDK |
| 等待与重试 | 原1200秒总预算、内含5秒收尾、120秒首有效输出、60秒进展空闲；HTTP重试0、不跟随重定向 |

认证仅从.zshrc读取既有字面量并经标准输入交给curl，不写入命令参数或文件。传输捕获沿用D45已验证的控制器，仅增加请求差异断言及思考输出计数；受控流仍校验正文发送、研究fixture、stop／DONE及思考原文脱敏。

## 实际结果

唯一请求已执行并失败停止。关闭参数已发送，客户端与网关存档的reasoning字段／字符均为0，HTTP响应头后约6.8秒开始返回研究正文；但是约303秒后仍无正常SSE终态，整段正文也不是单个合法JSON。没有补发、切换模型、截取首对象充当成功结果或修改业务解析规则。

| 观察 | D45：默认思考 | D46：enable_thinking=false |
| --- | --- | --- |
| 网关duration | 300266ms | 300299ms |
| HTTP与传输 | 200／curl退出0／EOF | 200／curl退出0／EOF |
| 思考字段帧 | 13552 | 0 |
| 助手正文 | 0字节 | 27860字节，19188字符 |
| finish_reason／DONE | 全null／无 | 全null／无 |
| 完整正文JSON | 空 | Extra data：首对象后继续输出 |
| 本地期限 | 未触发 | 未触发 |

本次说明只关闭思考可以让该样本开始输出正文，但没有解决约300秒后缺少结束原因／DONE的问题；不能把“无思考字段”提升为对模型内部隐藏计算的验证，也不能据此承诺其他样本行为。具体Cloudflare内部结束组件仍没有错误码或堆栈可确认。

## 实际响应与JSON检查

同账户D45日志只读预检于2026-10-29 01:41:26（北京时间）通过，模型调用0；随后唯一curl POST消耗本次1/1授权。控制台可按北京时间01:41:34附近、模型@cf/qwen/qwen3.8-27b及User-Agent curl/8.7.1查找。

| 项目 | 实际值 |
| --- | --- |
| 网关日志ID | 01a1839a-6000-74f9-83a0-27d955bc3c2c |
| cf-ray | a51bbb6c9a12ce1f-SIN |
| HTTP响应头／首正文 | 01:41:36.240／01:41:43.039 |
| 最后有效输出／结束 | 01:46:36.139／01:46:37.002 |
| 客户端耗时 | 302.953秒；总预算／首有效输出／空闲均未触发 |
| 原始HTTP body | 3481622字节；SHA256=a6479ba2d3c1c1b040597eb2114fd9427da27d96c7673438cfbf857189dad2da |
| SSE | 9642个有效JSON帧；无非法JSON事件、残缺末事件或错误帧 |
| 结束帧 | 9642个choice的finish_reason均null，无[DONE] |
| 思考输出 | reasoningPayloadFrames=0、reasoningCharacters=0、reasoningEffectiveFrames=0 |
| 助手正文 | 27860字节／19188字符；SHA256=91985f586b60168a84127cc1a35399eeee219d50891dc23adfc837c372765b7d |

Python JSON解析器在零起始字符位置3661、行135列1报Extra data。第一个对象在字符3660结束，后面还有15528字符，非空白部分以Markdown代码围栏开始；整段包含8个围栏及5处version=2样式字段。这些计数只说明返回文本重复／混入额外格式，不把它们当成5份完整报告。

完整响应先因协议终态和JSON失败，原业务Zod、冻结数值与数据库引用绑定未进入。check_output.mjs禁止网络及模型SDK加载，output-check.json记录acceptedOffline=false／failedStage=protocol；json-document-check.json单独保留Extra data位置和未修剪证明。没有从首对象建立正式研究结果。

## Cloudflare完整存档核对

终态后仅用curl GET读取日志详情与/response，不触发模型。详情status_code=200、success=true、duration=300299ms。完整/response为原生JSON聚合格式，下载4100401字节，与response_size完全一致；原始下载SHA256=cfdeae2aa3c919b8de1f045c44dfefc93512ef84b4d785f2db91a78d41edc174。

网关streamed_data和客户端均为9642帧、0思考字段帧、0非空结束原因；逐帧投影SHA256均为0972e0948d42b81ad55970cc8ca52849e9b127c7e49359eaddf6a528c9a6966c，组装正文摘要及JSON错误位置一致。投影包含choice索引、正文、思考字符数、结束原因及错误字段；没有把原生JSON聚合格式与HTTP原始SSE字节混作同一种格式比较。客户端实际未收到[DONE]，存档格式自身不证明该标记曾存在。

因此，Extra data和缺少终态均已在curl与Cloudflare存档两端取证，本次没有SDK参与；日志仍不能定位Cloudflare内部哪个组件在约300秒结束了流。增大本地超时或仅关闭思考均尚未得到合格研究对象。

## 验证、预算与保全

- 请求差异断言、实际body摘要及本机受控HTTP流通过；移除新增字段即可逐字节还原D45，未添加任何token上限、stop、采样参数或思考预算。受控流的思考哨兵只用于验证脱敏，不属于外部模型结果。
- 本次1/1已用，remainingAuthorized=0，submitted-once.lock存在，HTTP重试0；失败后只读日志并核对证据，旧GLM1次继续冻结，未增加权限或改网关配置。
- 三仓原文件摘要与索引已冻结；原D41／D43／D44／D45六组验收包共170个文件的最终比较见final-proof.json。主仓只更新本回执及两份现有Task，不stage／commit，保留原WIP。
- 不部署、不启用Provider或V2、不修改默认配置或业务数据；本次未进入目标Server／Worker／数据库，不将历史运行态或旧数据反读结果代收为当前事实。正式G3与D41双模型推广仍未通过。
- 当前系统git入口受Xcode许可前置阻断，只读核对改用已安装CommandLineTools的git二进制；没有接受或修改系统许可。离线检查复用D44已保留的Node24.18.0，不安装依赖、不修改旧验收包。

私有证据位于.recovery-artifacts/g3-d46-reasoning-off-20261029/：request-diff.json、plan.json、request-body.json、offline-proof.json、preflight.json、submitted-once.lock、dispatched.json、response-headers.json、response-redacted.ndjson、assistant-content.txt、outcome.json、upstream-identifiers.json、json-document-check.json、output-check.json、gateway-log-detail.json、gateway-response-redacted.json、gateway-assistant-content.txt、gateway-comparison.json、workspace-before.json、final-proof.json。原始响应在内存中计数和计算摘要；按既有规则脱敏思考原文及凭据后落盘，研究正文原样保留。
