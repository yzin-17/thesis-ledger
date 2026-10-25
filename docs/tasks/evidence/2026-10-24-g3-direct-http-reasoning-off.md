# G3 固定免费模型并关闭推理的单次直连验证

## 当前结论

2026-10-24 16:30（北京时间），按用户确认固定已实测的 nvidia/nemotron-3.5-super-vl:free，并设置 reasoning.enabled=false，仅原生 HTTP 直连一次：HTTP 200、SSE 完整、结束原因 stop，正文 2,946 字符，推理字符及推理 tokens 均为 0；JSON 解析及 research-generation-v2 Schema 校验均通过，上游报告费用 0 USD。

这证明该实际免费模型在本次关闭推理请求中能够返回完整的 V2 结构化正文。上次同一实际模型正文仅 2 字符、推理 24,729 字符的输入材料与输出 Schema 保持；本次仅修改 model 和 reasoning 两个请求字段。该结果不证明所有 openrouter/free 随机模型均通过，也不证明旧样本因达到 token 上限而失败。

本次用 1/13 次，现余 12 次冻结，无重试。V2 全程关闭；未修改业务配置、默认模型、来源启停、路由或业务结果。正式 SDK 请求尚未接入该显式参数，G3 的业务生成／引用／历史验收仍未完成。详见[机器证据](2026-10-24-g3-direct-http-reasoning-off.json)。

## 官方约束核对

- 只核对该实际模型。[OpenRouter 免费端点目录](https://openrouter.ai/api/v1/models/nvidia/nemotron-3.5-super-vl:free/endpoints)列出 reasoning、response_format 和 structured_outputs，输入／输出价格均为 0；[模型目录](https://openrouter.ai/api/v1/models)中该免费模型 reasoning.mandatory=false。
- [推理参数说明](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)提供统一 reasoning 控制；exclude=true 只隐藏返回的推理内容，不关闭内部推理，不能作为本次修复参数。
- [结构化输出说明](https://openrouter.ai/docs/guides/features/structured-outputs)要求 json_schema，并建议 require_parameters=true；strict 的实际强制效果因端点而异，因此保留原 Schema 和本地 V2 校验标准。
- 此处根据实际免费端点目录及 OpenRouter 当前公开文档制定请求。NVIDIA 文档直开返回 404、权重页返回 401，未继续寻找其他来源，也不把检索快照当成该免费端点当前行为的证明；实际行为由本次单次直连验证。

## 本地与请求检查

1. 复用原失败任务 428b6e10-4d9a-459b-a375-6abcd286c1ba 的冻结材料和纯消息构造，不重新取数。
2. 原请求体仍精确重建为 22,542 字节，SHA-256 e1d08b2fe1f909e21f27489cba5322a0d5aa977d45818dd988d0c93f5741b0ca。本次修改后为 22,590 字节，SHA-256 5eba936472c211fd790dcee2c04f0573f9883c68ce86968df436be99c568ed26；恢复 model／reasoning 后与原 JSON 完全一致。
3. 保留 stream=true、json_schema、strict=true、require_parameters=true、max_tokens=20000。本地截获及采集验证均无上游调用；JSON／V2 分类、结束原因、推理计数、秘密遮蔽、结构预览限长、错误事件及超长截断验证通过。
4. 诊断脚本为 /private/tmp/g3-direct-http-reasoning-off-20261024.mjs；响应观察及本地验证分别为 /private/tmp/g3-http-output-observation-20261024.mjs 和同名 .test.mjs。没有应用源码／依赖／数据库结构变更或 Docker 状态变更，不重复已通过的全仓构建。

## 单次实际结果

| 项目 | 结果 |
| --- | --- |
| 开始／结束 | 北京时间 16:30:11.840／16:30:45.748 |
| HTTP／Content-Type | 200 OK／text/event-stream |
| 实际模型／供应端 | nvidia/nemotron-3.5-super-vl:free／Nvidia |
| SSE | 3 个解析事件、0 畸形事件、0 错误、已收到 DONE |
| 结束原因 | stop |
| 正文／推理字符 | 2,946／0 |
| 输入／输出／推理 tokens | 5,621／2,034／0 |
| JSON／V2 Schema | 均通过，Schema 问题 0 项 |
| 上游费用 | 0 USD |
| 正文 SHA-256 | 6f85fa2355b9b12b619dd9f3976e081f5e35ae15fd3014f9111284eb1e6583e4 |

原始正文只在内存中拼接、解析及校验；仅保留摘要和脱敏结构预览。预览被截短与完整正文被截断分别记录：本次前者为 true，完整正文 textTruncated=false，JSON／Schema 判断针对全部正文。

## 保护与后续

最终五个容器健康，V2=false、canCreate=false、原研究策略未设置。17 张保护表、旧 AI 记录及任务／工具计数、四张 DSA 控制表、环境、挂载和原开关均与本次直连前完全一致。

G3-D15 的受控单次直连验证通过；G3-D8 正式业务未通过。下一步需用户确认将关闭推理作为研究用途的显式配置接入 SDK，保留冻结／指纹／用途验证和预算边界，再进行正式 G3；不把本次未写入业务账本的直连结果作为正式报告。余 12 次保持冻结。
