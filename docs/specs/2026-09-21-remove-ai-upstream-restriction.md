# 移除 AI 执行路由上游服务限制 Spec

> 任务标识：2026-09-21-remove-ai-upstream-restriction  
> 日期：2026-09-21  
> 状态：已完成本地实现与验证；真实外部 Provider、Docker 目标运行态和 Electron 实机视觉验收未执行  
> 对应任务：[实施任务](../tasks/2026-09-21-remove-ai-upstream-restriction.md)  
> 修订：[AI 接入层迁移 Spec](2026-09-19-vercel-ai-sdk-integration.md)、[移除免费依据 Spec](2026-09-21-remove-ai-free-evidence.md)

## 背景与问题

执行路由中的“上游服务限制”只对少数带有下游供应商池的兼容 Provider 有意义；对 LM Studio、OpenAI 直连等单一服务没有清晰的用户价值，且会把 Provider 入口和 Provider 背后的上游供应商混在一起。当前产品暂不需要这项限制能力。

## 目标

1. 从执行路由配置、共享 Schema、readiness 投影、生成请求和 Desktop 表单中移除上游服务限制。
2. Provider 请求不再携带 `provider.only` 上游白名单参数。
3. 旧 JSON 中的 `allowedUpstreams` 可以继续读取，归一化后不再写回，避免历史 Provider 无法打开。
4. 保留 Provider 地址、模型、生成模式、生成契约、超时、费用和其他现有路由行为。

## 非目标

- 不移除 Provider 的 `baseUrl`、上游格式选择或 OpenRouter 兼容 profile；这些仍用于选择请求适配器。
- 不改变 Provider 凭证、模型目录、连接测试和真实 Provider 验收。
- 不新增替代性的上游供应商选择 UI 或自动路由策略。
- 不修改数据库表结构；历史执行记录不做回写清理。

## 设计方案

### 配置与契约

删除 `allowedUpstreams` / `allowedUpstreamsText` 及其输入、草稿、readiness 输出字段。旧路由解析边界丢弃该字段，其他未知字段仍由 strict Schema 拒绝。

### 执行请求

研究和策略优化执行不再向生成适配器传入上游白名单；OpenRouter 请求转换不再生成 `provider.only`。OpenRouter 仍可作为兼容适配器使用，但不再提供供应商限制。

### readiness 与指纹

删除 `route_not_allowed` 判断和展示文案。配置指纹不再包含上游限制；相同 Provider、模型和执行契约的路由不因历史白名单产生新的当前配置组合。

## 数据、状态或兼容性影响

- 无 migration；旧 Provider JSON 在读取时丢弃 `allowedUpstreams`，下次保存得到新格式。
- 新生成的 `AiProviderModelExecution` 不再返回上游限制字段。
- 旧执行结果或日志中的历史上游请求事实不改写；本次只禁止新配置和新请求继续生成该限制。

## 测试策略

### 关键可观察行为

- Desktop 执行路由表单不显示、不保存、不回显上游服务限制。
- 旧配置带 `allowedUpstreams` 时仍可读取，归一化输入和输出不包含该字段。
- readiness 不再产生 `route_not_allowed`，生成请求不再包含 `provider.only`。
- 研究和策略优化仍能按原 Provider、模型、模式、契约、费用与超时完成请求构造。

### 测试层级与证据边界

执行共享 Schema、Server readiness/适配器、研究/策略优化和 Desktop Provider UI 定向测试，再执行受影响包的 typecheck/build 与差异检查。上述证据不替代 Electron 实机视觉验收、Docker 目标运行态或真实外部 Provider 验收。

## 验收标准

- AC1：Desktop 执行路由不再显示、保存或回显上游服务限制及附属字段。
- AC2：共享 Schema、Server 输入和 readiness 输出不再包含 `allowedUpstreams`；旧 JSON 读取时兼容丢弃该字段。
- AC3：研究、策略优化和 OpenRouter 适配请求不再生成或传递 `provider.only` 上游白名单。
- AC4：readiness 不再产生 `route_not_allowed`；模型、模式、契约、费用和超时行为保持现有语义。
- AC5：受影响测试、typecheck/build 与差异检查通过，Specs/Tasks 与实际实现一致。
