# 移除 AI 执行路由免费依据配置 Spec

> 任务标识：2026-09-21-remove-ai-free-evidence  
> 日期：2026-09-21  
> 状态：已完成本地实现与验证；真实外部 Provider 计费事实与 Electron 实机视觉验收未执行  
> 对应任务：[实施任务](../tasks/2026-09-21-remove-ai-free-evidence.md)  
> 修订：[AI 接入层迁移 Spec](2026-09-19-vercel-ai-sdk-integration.md)、[移除能力声明 Spec](2026-09-21-remove-ai-capability-declaration.md)

## 背景与问题

AI 执行路由目前要求额外填写“免费依据”。该信息与 Provider 编辑器中已有的每千输入/输出费用、币种和定价版本重复，增加配置成本，并把用户是否信任自己填写的费用拆成两套概念。

## 目标

1. 移除执行路由的免费依据配置、Schema 字段、readiness 输出和执行成本分支。
2. 以 Provider 配置中用户填写的费用作为成本估算事实；不再要求额外的免费证明。
3. 两项费用均明确填写为 `0` 且存在有效币种时，零费用策略可以授权该路由；正费用路由仍需显式预算授权。
4. 保留费用上限、成本未知阻断、Provider 实际费用优先和用户配置费率估算等预算边界。
5. 旧 JSON 中的 `freeEvidence` 可以继续读取，但归一化和下次保存不再写回。

## 非目标

- 不移除 Provider 级别的每千输入/输出费用、费用币种和定价版本字段。
- 不移除研究策略的 `maxCost`、`paidRoutes` 或策略优化实验的费用上限。
- 不把缺少费用输入自动当作零费用；缺少可用费用事实时仍按未知费用处理。
- 不修改数据库表结构、凭证存储、生成模式、生成契约或能力撤销机制；上游服务限制由关联 Spec 另行移除。
- 不把连接测试或用户填写的费用伪装成真实外部 Provider 计费验收。

## 现状与约束

- `freeEvidence` 同时存在于共享 `AiProviderModelExecution`、Server 执行路由输入、Desktop 草稿/表单和研究/策略优化成本结算路径。
- readiness 当前允许免费依据绕过 `budget_not_authorized`；移除后应由用户填写的零费用费率承担这一授权语义，其他路由继续使用显式预算授权。
- 历史数据库设置和 `AI_PROVIDER_CONFIGS_JSON` 可能含有 `freeEvidence`，兼容读取不能因此丢弃整条路由。
- 用户输入的费用来自 Provider 配置，必须进入路由配置指纹；修改费用后旧能力撤销和就绪结果不能继续复用。

## 设计方案

### 配置与契约

从执行路由输入、`AiProviderModelExecution`、Desktop 草稿和保存转换中删除 `freeEvidence` / `freeEvidenceRef`。旧路由解析边界同时丢弃历史 `freeEvidence` 与已废弃的 `capabilityDeclaration`，其他未知字段继续由 strict Schema 拒绝。

### 预算授权与 readiness

保留 `budgetAuthorized` 作为显式付费策略授权。路由仅在以下任一条件满足时不产生 `budget_not_authorized`：

1. 当前研究/优化策略显式授权该 Provider/模型的预算；或
2. Provider 用户输入的 `costPer1kInput` 与 `costPer1kOutput` 均为数字 `0`，且存在有效三位币种。

未填写费用、只填写一项、费用为正但没有付费策略授权，仍保持阻断。零费用判断只信任当前 Provider 配置，不读取外部目录或自动推断。

### 成本结算

删除 `free_evidence:*` 成本来源。研究与策略优化优先使用上游报告的实际费用；无法取得实际费用时使用 Provider 用户填写的费率估算；两者都不可用时保留 `unknown`，在有费用上限的流程中按既有规则阻断后续执行。

### 兼容与指纹

旧配置读取时删除 `freeEvidence`，归一化输出和新保存请求不再生成该字段。配置指纹包含用户填写的费率、币种和定价版本，确保费用修改触发重新评估。

## 数据、状态或兼容性影响

- 不新增或修改数据库 migration；Provider JSON 通过读取归一化逐步清理废弃字段。
- 旧执行记录中的 `free_evidence:*` 成本来源作为历史事实保留，不再由新执行生成。
- 新执行的成本来源改为 Provider 报告或用户配置费率；费用未知仍不能伪造为零。
- 旧配置中的免费依据不再授予零费用路由资格；必须补充用户输入的零费用费率或显式预算授权。

## 测试策略

### 关键可观察行为

- 新建/编辑执行路由不显示或提交免费依据。
- 旧路由带 `freeEvidence` 时仍可读取，归一化输入和输出不包含该字段。
- 用户填写输入/输出费率为零且有币种时，零费用策略路由可以就绪；费用缺失或为正时仍受预算授权门禁约束。
- 研究和策略优化不再生成 `free_evidence:*`，用户费率可生成估算成本，未知费用仍阻断后续执行。

### 测试层级与证据边界

执行共享 Schema、Server readiness/成本结算、策略优化成本和 Desktop Provider UI 定向测试，再执行受影响包的 typecheck/build 与差异检查。上述证据不替代 Electron 实机视觉验收、Docker 目标运行态或真实外部 Provider 计费验收。

## 风险与备选方案

主要风险是旧配置被 strict Schema 直接丢弃，或删除免费分支后意外把未知费用当成零费用。通过单一兼容归一化入口、零费率明确条件和成本未知回归测试控制。若未来需要外部价格证明，应另建价格目录同步能力，不恢复为每条路由的手工免费依据字段。

## 未决问题

无。

## 验收标准

- AC1：Desktop 执行路由不再显示、保存或回显免费依据及其附属字段。
- AC2：共享 Schema、Server 输入和 readiness 输出不再包含 `freeEvidence` / `freeEvidenceRef`；旧 JSON 读取时兼容丢弃该字段。
- AC3：用户填写两项零费率和有效币种时，零费用策略可授权路由；其他路由仍需要显式预算授权，缺少费用输入不被当作免费。
- AC4：研究与策略优化使用用户输入费率或 Provider 实际费用计算成本，不再生成 `free_evidence:*`；未知费用继续按既有规则阻断。
- AC5：费用字段进入配置指纹，修改费率后重新评估；受影响 Schema、Server、Desktop、策略优化测试、typecheck/build 与差异检查通过。
