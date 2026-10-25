# G3 免费研究模型切换验收

## 范围与当前结论

用户要求查找能力较强的其他免费模型并切换，优先核对 DeepSeek；保留推理、原数据、来源启停、20 条数据路由及其他用途，零费用、失败即停、不自动重试。原样诊断不执行，剩余 11 次不重复累计。

当前实时目录共 469 个模型，其中 17 个明确免费型号，没有免费 DeepSeek；V4 Flash 0731 与 R1 的免费页面仍存在，但对应端点查询均为 HTTP 200、endpoints=[]，因此不能按页面的免费字样声称当前可调用。付费 DeepSeek 不在零费用边界内。

选择 dots-studio/dots-3-note-preview:free 作为本次研究候选：当前 AtlasCloud 免费端点输入／输出价格均为 0，支持 reasoning、response_format 和 structured_outputs；512K 上下文，输出上限 460,800。官方页面标注 2026-12-31 下线。该目录能力不替代真实 V2 用途验证，也不以参数规模断言必然优于此前模型。

## 执行叶与保护边界

- G3-D18a：免费目录、DeepSeek 实时端点与候选推理／结构化能力核对完成；业务及控制表新基线只读留存，旧 AI 记录保持，V2=false、canCreate=false。
- G3-D18b：通过现有正式用途计划和 test-and-save，最多 1 次零费用研究 V2 复验；候选显式 reasoningEnabled=true，保留 native_schema 与严格校验。保留原全部用途配置，新模型的其他用途显式停用，复用原两条已通过证明。计划如需其他调用、旧证明失效、非零价格或意外启用，先停止。
- G3-D18c：只有用途通过后，以正式 ai/settings 的修订保护更新研究默认；反读精确模型／推理／就绪状态，核对旧配置、原行、来源启停及 20 条路由。业务 G3 正式报告验收仍由 D8 持有，不把用途探针记成研究报告。

## 实际执行与停止结果

正式计划仅候选研究用途一条待验，最多 3 次的 auto 计划按已验证的 stopOnFirstFailure=true 边界收窄为本次最多 1 次；原两条用途证明复用，估算 0 USD，单次输出上限 8,192 tokens。本地脚本语法检查和计划预检通过。

唯一用途请求在北京时间 18:03:26～27 失败，正式入口 HTTP 400 的消息为 Provider returned error，明确原配置未修改。operationId 为 23b8f365-f6db-447b-bd2f-89f66eced202，requestId 为 e2845270-73e6-456c-9004-c9e895365cc6。ProviderHealthCheck 的 pending／failed 两条记录对应同一个请求，不记成两次调用；没有自动模式回退、重试或其他模型调用。

当前只能确认上游错误传播，不能把本次说成无效 JSON、Schema 不受支持或某个具体 HTTP 状态。实际上游模型、用量和实际费用未返回；账本仅按已核对的免费配置估算 0 USD，实际费用保留未知。模型保守计入 1/1，当前剩余 10 次冻结。

Provider 的完整行摘要保持 407e68b101cb0ced2607cd048f4a53c4，模型仍只有 openrouter/free；原全部用途／证明保持。研究默认仍为 openrouter / openrouter/free，修订仍为 5；默认更新与业务 G3 均未执行。V2=false、canCreate=false，未做开启／关闭更新。

最终 17 张保护表数量、逐行摘要和整体摘要均与本次前置基线完全一致；旧 AI 记录、计数器、来源控制、20 条数据路由、环境、挂载与镜像不变，全部目标健康。机器检查点见同名 JSON。没有应用源码、依赖或数据库结构变更，不重复已通过的全仓构建或 Docker 更新。

本次已按失败即停暂停。新的卡点是候选真实用途返回供应端错误，当前未切换；下一步仅在用户确认后查看本次已有错误／日志，核对是否存在上游状态或具体原因，不新增模型调用，不扩搜替代模型。

## 来源

- [实时模型目录](https://openrouter.ai/api/v1/models)
- [DeepSeek V4 Flash 免费端点](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731:free/endpoints)
- [DeepSeek R1 免费端点](https://openrouter.ai/api/v1/models/deepseek/deepseek-r1:free/endpoints)
- [Dots3 免费端点](https://openrouter.ai/api/v1/models/dots-studio/dots-3-note-preview:free/endpoints)
- [Dots3 模型说明](https://openrouter.ai/dots-studio/dots-3-note-preview:free)
