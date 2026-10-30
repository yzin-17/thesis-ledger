# G3 D48：最小严格Schema的curl验证

对应[超时治理Task T5](../2026-10-25-ai-adaptive-execution.md)与[研究G3](../2026-10-18-research-evidence-evolution.md)，接续[D47最小问候](2026-10-29-g3-qwen-simple-curl.md)。用户要求增加请求复杂性，本次在相同问候语义上增加一个reply字符串字段的严格Schema，新增最多1次零费用请求、失败即停，旧GLM1次保持冻结。

## 输入与验收

模型仍为@cf/qwen/qwen3.8-27b，同账户curl／stream=true／include_usage=true／enable_thinking=false保持，不增加token上限、stop或采样参数。messages改为 `请只返回 JSON 对象 {"reply":"你好"}，不要其他内容。`，新增response_format如下：

```json
{"type":"json_schema","json_schema":{"name":"g3_greeting_v1","strict":true,"schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"reply":{"type":"string","enum":["你好"]}},"required":["reply"],"additionalProperties":false}}}
```

实际请求536字节，SHA256=2fdcffdb32e00e3dc7972a9fa63e2cbe3bb035bf9027d95620b95a2cfdaf65d3。相对D47只适配同一问候的JSON格式指令并增加response_format；本次不回填研究材料或完整研究Schema。等待仍为1200秒总预算、内含5秒收尾、120秒首输出和60秒进展空闲；HTTP重试0、不跟随重定向。

验收要求整段响应解析为单个对象且严格等于{\"reply\":\"你好\"}，并收到stop／[DONE]、0思考输出；额外字段、尾随内容或缺少终态均失败。受控流已通过对应对象与完整流终态校验，未调用外部模型。

文档存在边界冲突：[通用JSON Mode页面](https://developers.cloudflare.com/workers-ai/features/json-mode/)标注不支持流式，而[Qwen模型页](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/)的流式输入列出response_format。本次实测当前OpenAI兼容端点及最小Schema组合，不把通用页面的限制直接当作已确认根因，也不预设组合成功。

## 实际结果：最小Schema样本通过

本机受控流与D47同账户日志只读预检通过后，唯一curl请求返回 `{"reply":"你好"}`，整段JSON合法、无额外字段或尾随内容，与预期对象完全相等，满足本次Schema；收到正常stop／DONE，0思考输出，没有SDK参与。

| 项目 | 实际结果 |
| --- | --- |
| 开始时间 | 北京时间2026-10-29 02:05:50.967 |
| 客户端／网关耗时 | 2.096秒／585ms |
| HTTP／curl | 200／退出0、stderr为空，本地期限未触发 |
| 正文 | {"reply":"你好"}；18字节／14字符 |
| 流终态 | 9个有效JSON帧、stop及[DONE]；无非法事件、残缺末事件或错误帧 |
| 思考输出 | 0帧／0字符 |
| 缓存 | cached=false |
| 网关日志ID | 01a183b0-9b2f-7457-86d7-051eab32ef70 |
| cf-ray | a51bdefe6f7fff95-SIN |
| 原始HTTP body | 3171字节；SHA256=3751a0a17ddac44baf22c964ef01551fdaa244c837c770cf569b38be6a03fc6e |
| 正文SHA256 | 6c906160340723d0b3bd3cc60d7dad8a6352a9a6292ae11207ca7ecfee510fe6 |

本次只证明当前端点接受带此最小response_format的流式请求，并返回满足该Schema的完整对象；单次匹配输出不证明服务端强制执行任意Schema、全部2020-12能力或完整研究合同。通用文档的流式限制不能直接代替本模型／端点的实际结果。

## 完整网关存档

终态后只用curl GET读取日志详情及/response。详情success=true、status_code=200、duration=585ms、cached=false；完整原生聚合响应4426字节，与response_size一致，下载SHA256=e9325c989cfc86162f9c32fb573931d90274a8710c86536490ccb4871561eebf。

网关与客户端均9帧、0思考输出，组装正文、JSON校验及9帧usage一致。最终汇总为输入28／输出6／合计34 token、2.8909090161323547 Neurons；只读取最终汇总一次，不把各分片重复相加，也不把Neurons当成美元。

与D47相同，原生第6帧为stop、第7／8帧choices为空；兼容端第6帧结束原因为null、第7／8帧均带空delta及stop，之后收到[DONE]。因此sameProjectedFrames=false，终态帧形状有差异，正文／用量与正常结束语义一致。该差异由terminal-comparison.json保留，未改写原记录或把两个stop算作两次请求。

## 当前结论与保全

D47纯问候与D48最小严格Schema均成功，D46完整研究请求失败。当前不能将“流式＋json_schema”本身视为必然失败条件；仍缺少对完整研究Schema结构及研究材料／长输入的独立验证。正式G3报告、原业务Zod／冻结数值／引用／历史与D41双模型推广均未通过，本次不代收或推广候选。

本次新增1/1已用、remainingAuthorized=0，无重试；旧GLM1次继续冻结。不部署、不启用V2或Provider，不改应用配置或业务数据，不stage／commit。三个仓库原文件摘要、HEAD及空索引和旧验收包224个文件的保护比较见final-proof.json；仅新增本回执及更新两份现有Task，原WIP保持。

私有证据位于.recovery-artifacts/g3-d48-simple-schema-20261029/：plan.json、request-body.json、request-diff.json、offline-proof.json、preflight.json、submitted-once.lock、dispatched.json、outcome.json、response-headers.json、response-redacted.ndjson、assistant-content.txt、upstream-identifiers.json、gateway-log-detail.json、gateway-response-redacted.json、gateway-comparison.json、terminal-comparison.json、protocol-proof.json、workspace-before.json及final-proof.json。原始响应在内存中计数及计算摘要，凭据与思考字段按现有规则脱敏后落盘。
