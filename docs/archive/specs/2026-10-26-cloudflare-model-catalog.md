# Cloudflare 模型目录适配规格

> 任务标识：`cloudflare-model-catalog`
> 对应任务：[当时的实施任务](../tasks/2026-10-26-cloudflare-model-catalog.md)
> 状态：历史规格；2026-10-26 起由[Provider 模型目录通用配置](../../specs/2026-10-26-provider-model-catalog-configuration.md)接续，现行要求及验收以新规格和任务为准。

## 问题与范围

前端“从接口获取”调用 `POST /ai/providers/models`，现有实现统一访问 `${baseUrl}/models`。Cloudflare Workers AI 的生成兼容地址为 `/client/v4/accounts/{account_id}/ai/v1`，目录实际使用原生 `GET /client/v4/accounts/{account_id}/ai/models/search`。用户现场显示上游 HTTP 405 被应用包装为 502。

本规格只扩展目录适配。通用凭据复用、错误脱敏、返回类型及草稿行为继续由 [模型发现规格](../../specs/2026-09-15-ai-provider-model-discovery.md) 定义。保留现有配置、选择、数据和 WIP；不调用生成接口，不启用 Provider 或 V2，不更换默认模型，不修改费用、套餐、凭据或数据库结构，不 stage 或 commit。

这里的目录范围是 Workers AI 子目录，不等于 Cloudflare 的统一模型目录，也不代表所有返回型号都适用免费套餐。统一目录中的第三方型号和 Workers AI 分别核对计费；本规格不自动接入或启用第三方付费型号。

## 适配边界

- 仅精确识别 `https://api.cloudflare.com/client/v4/accounts/{32位十六进制账户ID}/ai/v1`，允许末尾斜杠；不得按 Provider 名称猜测，不改写其他主机或代理地址。
- 使用 Bearer 凭据读取 Cloudflare 原生目录；所有请求为 GET、拒绝重定向，共享一次总超时，不自动重试。
- 按页读取，直到空页；单页 100 项，总项数最多 2,000，最多 21 页。重复页面、超量、错误形状、认证失败或超时必须失败，不能返回部分成功。
- 不以 `result_info.total_count` 单独判定完整性。已取得的实际目录出现声明总数 326、返回集合 73 的差异；终止以实际空页为依据。
- 返回任务为 `Text Generation` 的 Workers AI 模型，使用 `name` 作为可调用 ID；原生 `id` 是目录 UUID。其他任务类型不进入对话模型候选。
- 将 `properties.reasoning_effort.value` 交给现有推理元数据白名单解析器；只返回既有 `models`、`modelDetails` 和 `fetchedAt` 契约允许的字段。
- 通用 OpenAI-compatible、Anthropic 目录及无需认证模式保持原行为。获取目录只更新前端临时候选，不自动保存或改变当前选择。

## 验收断言

- AC1：标准 Cloudflare 地址转向原生目录，正确分页、筛选和映射名称及推理元数据；其他地址使用既有协议。
- AC2：共享超时、拒绝重定向、分页停滞和数量限制有效；错误不触发协议回退、自动重试或生成请求。
- AC3：Server 定向测试、包级验证和受影响仓库门禁通过；其他目录及现有前端草稿行为有回归证据。
- AC4：目标 Server 经 infra 正式最小更新入口生效；正式模型目录 API 与真实前端按钮可读取原生目录，已有三个选择保留，Provider 配置及受保护业务表不变。
- AC5：模型调用为 0，V2 关闭、默认研究模型和原余 2 次冻结保持；既有数据、验收包和 WIP 保留，无 stage 或 commit。

## 验证与风险

先用固定响应验证协议与边界，再执行包级检查和仓库门禁，最后通过正式更新入口验证目标 API 与浏览器。目录成功不代表生成、结构化研究契约或 G3 验收通过。Cloudflare 声明总数的差异保留为来源限制，不通过放宽数量和超时门禁补偿。

官方协议：[模型搜索接口](https://developers.cloudflare.com/api/resources/ai/subresources/models/methods/list/)、[生成兼容接口](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)。当前实现没有阻塞性设计问题。
