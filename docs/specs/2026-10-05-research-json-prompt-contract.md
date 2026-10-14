# 研究文本 JSON 输出字段合同

## 问题与目标

Journal 真实 OpenRouter Run `a488ce1a-6485-43f6-b165-e56446faffd1` 返回 JSON，但缺少 conclusion、将 evidence 元素输出为字符串，最终以 research_schema_invalid 收敛。现行研究请求只要求“ResearchResult V1 JSON”，未向文本校验模式提供字段结构；该名称不能替代实际生成合同。SDK 的 json_validated 使用文本输出，随后按 Schema 校验，不向 Provider 原生传递 Schema。

AI 执行面必须把现行 aiResearchGenerationSchema 的字段约束明确写入请求，与终态校验消费同一合同。用户问题、冻结来源说明和业务提示保持原上下文。服务端拥有的 provider、version、createdAt、context 仍由结果装配补充，不要求模型生成，也不放宽输出或引用校验。

## 所有权与实现

输出指令属于 AI feature，由独立纯 helper 从共享 Schema 生成 JSON Schema 和中文说明，研究 Executor 消费。Journal 不复制输出定义，AI 不反向 import Journal。引用仅使用本次请求的服务端工具证据和审计标识；来源说明不能改写输出合同。保持冻结事实、绝对期限、owner CAS、取消、费用与失败分类。

这是一项请求字段说明修复，不新增模型、改公式、改数据库结构或把失败 JSON 修补成成功。已经失败的 Run 保留历史终态；新目标代码及修复后完整 Journal 报告需独立验收。

## 验收

1. 输出说明包含生成合同的必填字段、evidence 对象/citation 结构，不要求服务端拥有的元数据。
2. Executor 实际传给 SDK 的消息携带说明；冻结单笔/周期事实与工具审计保持绑定，旧研究和故障分类回归通过。
3. 类型、build、边界、尺寸与直接 lint 通过，不提高存量阈值或扩展大 Executor 的职责。
4. 修复后实际模型、目标代码与 Journal 成功终态单独留证；目标结构未升级或代码未部署时保持未完成，不重复旧失败请求。
