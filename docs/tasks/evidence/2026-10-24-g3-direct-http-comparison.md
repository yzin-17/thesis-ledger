# G3 原请求体的上游 HTTP 直连核对

## 结论

2026-10-24 16:14（北京时间），同一 G3 请求体通过原生 HTTP 直接访问 OpenRouter，得到 HTTP 200 和正常 SSE，2,537 个可解析事件且没有 error 事件；标准正文通道 delta.content 总计仅 2 个字符，推理通道 24,729 个字符。实际模型为 nvidia/nemotron-3.5-super-vl:free，上游报告费用 0 USD。

本样本已在绕过 SDK 响应解析时复现正文不足，故障定位到上游实际模型的正文输出环节；2 个字符无法构成完整 research-generation-v2 报告。该请求没有 HTTP 错误，也没有 SDK 丢失正文的证据。先前 Provider returned error 样本的原始响应未留存，其历史 HTTP 状态仍不能据此反推。

本次仅一次外部 HTTP，已停止，无自动重试；从剩余 14 次计入 1 次，现余 13 次冻结，总费用上限 0 元保持。V2 全程关闭，原数据、来源启停和路由保持。机器回执及摘要见[直连证据](2026-10-24-g3-direct-http-comparison.json)。本直连不是正式 G3 报告、引用与历史验收，G3 保持未完成。

## 请求可比性与执行边界

- 用户明确要求直接请求上游 HTTP，区分 HTTP 错误与 SDK 流识别。复用 run 428b6e10-4d9a-459b-a375-6abcd286c1ba 的原冻结材料，不重取来源、不创建业务任务。
- 调用既有纯消息构造与 SDK 参数序列化，在本地 fetch 截获边界中止；此步骤网络请求为 0。重建请求体 22,542 字节，SHA-256 为 e1d08b2fe1f909e21f27489cba5322a0d5aa977d45818dd988d0c93f5741b0ca，与原目标实际 fetch 诊断完全一致。
- 真正发送与响应读取采用原生 fetch，不走 SDK 响应解析。地址为 https://openrouter.ai/api/v1/chat/completions，POST，openrouter/free，stream=true，json_schema／strict=true／require_parameters=true，max_tokens=20000。只允许一次发送，不重定向、不重试，300 秒总上限及 30 秒空闲上限。
- 复用原已配置凭据，解密与使用只在进程内存；未输出或落盘密钥、认证 headers、Prompt、原请求正文或完整响应。实现脚本为 /private/tmp/g3-direct-http-20261024.mjs，仅执行只读 Docker／数据库查询及用户获准的上游 HTTP；没有 Docker 状态变更、部署或业务数据库写入。

## 实际响应

| 项目 | 结果 |
| --- | --- |
| 请求开始／结束 | 北京时间 16:11:54.690／16:14:07.749 |
| HTTP | 200 OK |
| Content-Type | text/event-stream |
| 响应字节／SSE 事件 | 1,039,115 字节／2,537 个可解析事件 |
| 标准正文／推理字符数 | 2／24,729 |
| 上游错误事件 | 0 |
| 实际模型 | nvidia/nemotron-3.5-super-vl:free |
| 输入／输出／其中推理 tokens | 5,621／8,414／8,411 |
| 上游费用 | 0 USD |
| 响应摘要 | d2a786e0361b3016614bdbc227c105dac3c1275adba15a3a447529af98ad6ef6 |

本次未保留两个正文字符的原文，也未记录 finish_reason，不能声明正文精确为何、达到 token 上限或具体停止原因。结论限于标准正文通道不足，不把推理文字当作合格报告，也不修改本地解析器或降低 Schema 要求。

## 保护与接续

最终五个容器健康，V2=false、canCreate=false、原策略未设置；17 张保护表与本次直连前基线完全一致，旧 AI 记录／任务及工具计数、四张 DSA 控制表、环境与挂载摘要保持。既有用途、成功报告／引用／历史／Web 和 HTTP 参数诊断按不变输入复用。

G3-D14 的直连分类叶完成，G3-D8 正向生成仍未通过。后续应围绕上游实际免费模型的正文／结构化输出行为处理，先由用户确认下一步边界；不自动切模型、调整参数或消耗余下 13 次。
