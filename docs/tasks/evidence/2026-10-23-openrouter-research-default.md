# OpenRouter 研究默认切换与独立验证记录

> 日期：2026-10-23
> 状态：研究用途验证、启用与默认切换已完成；G3 业务生成继续暂停
> 责任任务：[AI 配置](../2026-09-21-ai-provider-model-usage-configuration.md)、[AI SDK](../2026-09-19-vercel-ai-sdk-integration.md)、[研究 G3](../2026-10-18-research-evidence-evolution.md)

## 授权与范围

用户要求切换研究默认到 OpenRouter，并另行明确授权：最多 3 次零费用验证，通过后启用对应研究用途并切换默认。该授权只覆盖本次 `openrouter/free` 的 `research-generation-v1` 用途验证，不恢复 G3 业务生成，不重置历史调用账本，未用次数不转作其他业务额度。

原研究默认是 `lmstudio / qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，默认设置修订为 4。OpenRouter 已启用、已保存 `openrouter/free`，但研究用途为停用状态。正式计划只包含一个待验证用途，最多 3 次、每次最多 8192 输出 token、总期限 300 秒；配置估算费用为 0 USD。

## 正式执行

通过目标服务 `/api/v1` 下的正式接口执行：

1. `POST /ai/providers/validation-plan` 核对版本、用途、次数与费用；计划返回 201。
2. `POST /ai/providers/test-and-save` 使用独立操作标识和明确授权；`allowTextFallback=false`，未额外授权文本格式回退。接口返回 201。
3. 只读核对验证历史、其他 Provider 与 OpenRouter 配置差异。
4. `PATCH /ai/settings` 携带 `expectedRevision=4`，只更新研究默认；返回 200，修订升至 5，随后 GET 回读一致。

执行直接使用已保存凭据；未在请求或证据中输出凭据。未重新提交测试操作或追加验证请求。

## 验证事实

| 项目 | 结果 |
| --- | --- |
| 验证操作 | `1f0d48df-9bc0-4544-98f8-d0744e4cfc90` |
| 请求标识 | `25de227e-e8cc-4c7f-91ab-dae7c799fd68` |
| 实际请求数 | 1 次，未用满 3 次上限 |
| 请求模型／用途 | `openrouter/free`／`research` |
| 合同／模式 | `research-generation-v1`／`native_schema` |
| 最终状态 | `passed`，无错误码 |
| 用量 | 来源报告输入 681、输出 1181 token |
| 费用记录 | 估算 0 USD，来源为 `configured_model_pricing`；该记录不是供应商账单实报 |
| 验证完成时间 | 北京时间 2026-10-23 18:00:35.951 |
| Provider 保存版本 | `2026-10-23T10:00:35.991Z` |

请求数按该操作下的唯一 requestId 统计；同一请求的 pending 与 passed 两条历史不重复计数。既有验证记录保持，使用独立操作标识追加本次记录。

## 配置保护与结果

当前研究默认是 `openrouter / openrouter/free`，设置修订 5，研究用途已启用。LM Studio 及其他 Provider 配置投影的 SHA-256 与切换前一致。OpenRouter 的可写配置投影在将研究用途 enabled 恢复为 false 后，摘要与切换前一致：本次只改变该用途启停，原模型、优先级、其他用途和价格输入保持。

上述配置比较使用正式写入 DTO 对应字段，排除更新时间和价格版本／来源等派生显示字段；没有将完整数据库行摘要与配置投影混称。默认选择另由 PATCH 及后续 GET 验证。

本次完成的是研究用途接入验证和默认选择。SDK G1 的三类完整业务、G3 的真实报告／引用／历史读取及发布条件继续保持未通过；恢复这些业务仍需独立明确调用范围与预算。既有新闻、数据库、恢复和界面证据继续复用。

后续状态（2026-10-23）：用户已另行授权 V2 用途验证及 G3 单次业务验收，研究用途现已通过 `research-generation-v2` 验证，默认仍为本记录的修订 5。本页 V1 验证事实保留为历史；V2 请求、部署及材料拒绝卡点见[研究 G3 记录](2026-10-23-research-g3.md)。
