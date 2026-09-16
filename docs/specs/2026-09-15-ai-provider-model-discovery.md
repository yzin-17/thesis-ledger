# AI Provider 模型发现 Spec

> 任务标识：`ai-provider-model-discovery`
> 日期：2026-09-15
> 状态：源码实现与分层验证完成；当前运行中的 Docker Server 尚未重建，部署后生效。
> 对应任务：[2026-09-15-ai-provider-model-discovery](../archive/tasks/2026-09-15-ai-provider-model-discovery.md)

## 背景与目标

当前 AI Provider 表单要求用户手动输入模型 ID。OpenAI-compatible Provider 通常提供 `GET /models`，因此应由 Server 代为访问模型目录，前端展示可筛选、可多选的结果，减少拼写错误并避免浏览器直接访问第三方或持有已保存 API Key。

## 设计

- 新增 `POST /ai/providers/models`。请求包含当前 `name`、`baseUrl` 和可选的新 API Key；未提供新 Key 时，仅允许复用同名数据库 AI Provider 的加密凭据。
- Server 请求 `${baseUrl}/models`，使用 Bearer 鉴权，校验 OpenAI-compatible `{ data: [{ id }] }` 响应，返回去重、排序后的模型 ID、可选推理能力元数据与获取时间。为兼容现有客户端，`models: string[]` 保持不变，并新增与模型 ID 对应的详情集合。
- 推理能力只接受已知的 `supported_efforts`、`default_effort`、`default_enabled`、`supports_max_tokens` 和 `mandatory` 字段；Provider 未返回或返回非法元数据时忽略该部分，不影响合法模型 ID 进入目录。
- 复用数据库凭据时，请求 Base URL 必须与已保存配置一致；模型目录请求拒绝重定向，避免把已保存密钥发送到其他地址。
- API Key 不进入响应、日志、查询键或持久化模型目录。错误沿用 AI Provider 脱敏规则。保存 Provider 时仅保留已选模型的非敏感推理能力快照，不持久化完整目录。
- Desktop 使用可搜索的多选 Combobox 作为唯一模型输入：已选模型以内联标签展示，可逐个移除；展开列表显示可选项和选中状态；选择变化只修改当前草稿，不自动保存 Provider。
- 多选器的候选集合由接口目录与草稿中已有模型合并。已有模型即使不在本次目录中也必须保留为可见、可删除的已选标签，避免编辑旧配置时静默丢失。
- 最多保存 32 个模型；目录响应本身最多接受 2,000 个合法 ID，防止异常响应占用过多资源。
- 修改 Base URL 或 API Key 后，用户可重新获取目录；旧目录不作为 Server 配置事实。
- Desktop 在候选列表中展示 Provider 声明的推理强度和强制推理状态；缺少元数据时显示为未声明，不根据模型名称猜测能力。
- 连接测试仍以第一个模型为目标：已知 `mandatory = true` 或明确不支持 `none` 时不得发送 `effort: "none"`；若声明了支持强度，则选择最低可用强度并使用受控输出预算。首轮仅返回 reasoning 或其他不可消费内容时最多扩大一次预算，重试后仍无最小 JSON 则失败。该规则不新增用户可编辑的推理参数。

## 非目标

- 不定时同步或持久化第三方模型目录。
- 不自动选择最便宜、免费或能力最强的模型。
- 不在本次新增用户手动选择并持久化推理强度的运行参数。
- 不支持用户在模型目录之外任意录入模型 ID；Provider 未实现 `/models` 时只能保留和删除已有选择，不能新增目录外模型。

## 验收标准

- AC1：Server 能使用草稿 API Key 或同名数据库 Provider 的已保存凭据获取 `/models`，且响应不包含凭据。
- AC2：非法 URL、非成功 HTTP、超时、错误响应形状与超量目录均返回脱敏错误，不修改 Provider 配置或 Registry。
- AC3：Desktop AI Provider 表单仅提供带标签的可搜索多选器，不渲染模型 `textarea`；已选项可从标签或列表移除，列表明确展示选中状态，最多选择 32 个。
- AC4：获取失败不清空当前选择；已有但不在最新目录中的模型仍显示为可删除标签，且不能新增目录外模型。
- AC5：Server/Desktop 定向测试、TypeScript、边界与文件尺寸门禁通过，并在目标页面完成浏览器验收。
- AC6：模型目录响应兼容保留 `models: string[]`，并返回合法、脱敏、数量受限的可选推理能力元数据；非法或未知元数据不会污染目录。
- AC7：Desktop 模型候选项可展示支持的推理强度、默认值和强制状态；未声明能力时不作推断，既有搜索、多选、标签和 32 项上限行为不变。
- AC8：已选模型的非敏感推理能力可随 Provider 配置回读；连接测试遇到已知强制推理或不支持 `none` 的模型时不发送 `effort: "none"`，有支持列表时选择最低可用强度并在 reasoning-only 响应时最多重试一次；既有配置无元数据时保持兼容。
