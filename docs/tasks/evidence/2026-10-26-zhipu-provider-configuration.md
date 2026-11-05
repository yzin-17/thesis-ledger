# 智谱 Provider 配置记录

> 当前状态：用户指定后已只保留 `glm-4.7-flash`。一次零费用边界内的研究用途验证收到“该模型当前访问量过大，请您稍后再试”，失败即停，未启用 Provider。Key、其他 Provider、研究默认和 V2 状态保持；原 G3 余 2 次继续冻结。初始 11 模型与 0 调用的配置阶段记录在下，现行验证结果见末节。

用户授权从 `.zshrc` 的 `BIGMODEL_API_KEY` 配置智谱。已通过正式 `POST /api/v1/ai/providers` 新增 `bigmodel`，使用[官方 OpenAI 兼容接口](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction) `https://open.bigmodel.cn/api/paas/v4`，协议为 `chat-completions / compatible`，认证为 `api_key`。

密钥只在内存和本机配置请求中使用，经服务端加密入库；未输出或另存明文。反读解密后与来源一致，`.zshrc` 原文件摘要不变。使用已保存的凭据再次获取模型目录成功，返回 11 个模型：

`glm-4.5`、`glm-4.5-air`、`glm-4.6`、`glm-4.7`、`glm-5`、`glm-5-turbo`、`glm-5.1`、`glm-5.2`、`glm-5.3`、`glm-5.3-flash`、`glm-5.3-flashx`。

初始阶段保存为**停用待验证**，执行用途为空。正式启用入口要求先通过真实模型验证（`apps/server/src/ai/ai-provider-save.service.ts:104,191`）；该阶段没有伪造验证证明、调用模型或绕过门禁，随后用户指定模型并按下节接续。

验证结果：只新增智谱这一条 ProviderConfig；3 条旧 Provider 行、其余 21 张受保护表、12 条 AiRun／132 条 AiToolCall、默认设置修订 5、默认 `openrouter/free`、DSA 控制与路由、容器／环境／挂载保持。V2=false、`pending=0`，无部署、模型生成 0 次、余 2 次继续冻结。仓库 WIP 保留，不 stage／commit。

私有证据在 `.recovery-artifacts/zhipu-provider-20261026/`：`plan.json`、`saved.json`、`verification.json`、数据保全及 WIP 核对；不包含 API Key 明文。

## 用户指定 GLM-4.7-Flash 后的接续

用户回复“仅使用GLM-4.7-Flash”，将智谱模型列表收窄为唯一 `glm-4.7-flash`，不修改其他 Provider 或研究默认模型。[官方模型页](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.7-flash)给出该精确 ID；[官方定价](https://docs.bigmodel.cn/cn/guide/start/pricing)列输入、输出均免费。当前目录未列出这个模型，不直接将目录缺项等同于不可用。

本次按先前“最多测试1次”的配置问题接续，在既有零费用边界内执行最多 1 次研究用途验证，失败即停，原 G3 余 2 次继续冻结。使用[官方 JSON 模式](https://docs.bigmodel.cn/cn/guide/capabilities/struct-output)，仍验证完整 `research-generation-v2` 业务合同，不自动换模型或降级为自由文本。

已通过正式入口保存单模型待验证配置，零单价按 CNY 记录；正式 validation-plan 返回 `maxCalls=1`、`maxOutputTokensPerCall=8192`、`maxDurationSeconds=300`、预估 0 CNY。未新增首输出／空闲超时覆盖，原 Provider 探测 timeout=120000 保持。验证通过后由正式 test-and-save 启用；未通过保持停用，不重发。

本轮单模型及测试证据独立保存于 `.recovery-artifacts/zhipu-glm47flash-20261026/`；前一节的 11 模型与 0 调用为初始配置阶段历史，现行状态以后续验证结果为准。

## 单次验证结果与收尾

北京时间 2026-10-26 01:28:42.530 发起一次 `research-generation-v2 / json_mode` 配置验证，operation 为 `16abad14-1233-4a70-b961-1ae286ac7ceb`，request 为 `9c92fc30-aa90-4a38-b1a7-7a51e0722440`。796ms 后失败，正式 test-and-save 本机端点返回 HTTP 400，消息为：

> glm-4.7-flash / research 验证未通过：该模型当前访问量过大，请您稍后再试。原配置未修改。

测试历史只有同一 request 的 pending／failed 两条状态记录，没有第二次测试或换模型。这里的 HTTP 400 是本机测试端点的包装状态，当前记录未保留上游 HTTP 状态，不能仅由“访问量过大”写成已确证的上游 429。未生成可用验证结果或成功证明，因此正式入口没有启用 Provider。

最终模型列表精确为 `['glm-4.7-flash']`，保留研究 V2 的 JSON 模式待验证配置；Provider `enabled=false`，readiness 为 blocked／provider_disabled。密钥密文摘要保持，其他 3 条 Provider 行、其余 21 张受保护表、12 条 AiRun／132 条 AiToolCall、默认 `openrouter/free`／修订 5、DSA／环境／容器／挂载不变。设置响应中仅新增该停用模型的派生候选，没有改写研究默认。

本次配置验证最多 1 次且已使用；费用按官方免费定价估算为 0 CNY，供应商 token／实际账单未回报。原 G3 余 2 次保持冻结；V2=false，未发起真实研究报告、未部署或改代码，WIP 保留，不 stage／commit。后续重验需要新的调用授权，不自动等待后重试。
