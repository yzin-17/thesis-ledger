# Cloudflare Provider 三模型配置回执

验收时间：2026-10-26 03:01（北京时间）。本轮范围为读取已授权凭据、选择三个可使用 Workers Free 额度的模型并保存配置。

## 已保存模型

以下用途是根据公开能力、上下文和价格作出的选择，实际研究任务效果仍待验证。价格单位为 USD／百万 token；应用中已换算为每千 token 保存。

| 模型 ID | 建议用途 | Cloudflare 上下文 | 输入／输出单价 | 官方来源 |
| --- | --- | ---: | ---: | --- |
| `@cf/nvidia/nemotron-3-120b-a12b` | 复杂研究问题分析、推理复核 | 256,000 | 0.50／1.50 | [Cloudflare 模型页](https://developers.cloudflare.com/workers-ai/models/nemotron-3-120b-a12b/) |
| `@cf/qwen/qwen3.8-27b` | 通用研究整理、中文材料分析 | 262,144 | 0.45／3.20 | [Cloudflare 模型页](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/) |
| `@cf/google/gemma-4-26b-a4b-it` | 长材料阅读与对照整理 | 256,000 | 0.10／0.30 | [Cloudflare 模型页](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/) |

三者均存在于本账户实际返回的文本模型目录。目录实际返回 73 个模型，其中 39 个文本生成模型；分页交叉核对得到相同集合，但接口声明总数为 326，其差异来源尚未确认，目录未标记为完整。[原始目录快照](../../../.recovery-artifacts/cloudflare-model-catalog-20261026/catalog.json)

三个模型均可使用 Workers Free 额度。按 [Cloudflare 官方计费规则](https://developers.cloudflare.com/workers-ai/platform/pricing/)，免费额度为每日 10,000 Neurons，Free 套餐超额后请求失败；Paid 套餐超出免费额度后可能计费。表中保留官方公布的标准单价用于预算估计，未将模型价格填写为零。本轮未修改账户套餐、计费设置或额度，也未发送推理请求；账户当前套餐、额度余额及实际推理可用性尚未验证。

## 保存与反读

- 通过正式接口 `POST /api/v1/ai/providers` 保存 `cloudflare`，模型更新使用 `expectedRevision` 防止覆盖并行修改，返回 HTTP 201。
- 使用 `.zshrc` 的 `CLOUDFLARE_API_KEY` 和 `CLOUDFLARE_ID`；未执行该文件中的命令。
- 地址为 `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1`，实际保存时使用来源账户 ID。
- 协议为 `chat-completions`，实现为 `compatible`，优先级为 100。
- `enabled=false`，用途路由为空，保持停用待验证。
- 反读确认模型恰好为三个，价格及币种与目录换算值一致；数据库凭据可解密且与来源 Key 一致，验收文件不包含明文 Key 或实际账户 ID。

本轮模型生成请求为 **0**。尚未验证这三个模型的实际输出、结构化研究契约及运行稳定性；本次配置不构成 G3 通过证据。

## 保留边界

- 其他 Provider 行及其他 21 张受保护表保持一致。
- 研究默认模型仍为 `openrouter/free`，设置 revision 仍为 `5`。
- V2 关闭，`canCreate=false`，原余 2 次 G3 调用继续冻结。
- 现有 AI 历史、业务数据、容器、挂载、环境和 `.zshrc` 保持一致。
- 三个仓库的既有 WIP、验收包及配置保留；本轮无部署、stage 或 commit。

## 验收证据

- [保存回执](../../../.recovery-artifacts/cloudflare-workers-free-20261026/saved.json)
- [配置、加密凭据及数据保护核对](../../../.recovery-artifacts/cloudflare-workers-free-20261026/verification.json)
- [工作区前置快照](../../../.recovery-artifacts/cloudflare-workers-free-20261026/before-workspace-proof.json)
- [工作区结束核对](../../../.recovery-artifacts/cloudflare-workers-free-20261026/closed-workspace-proof.json)
