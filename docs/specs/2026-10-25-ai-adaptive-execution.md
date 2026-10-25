# AI 研究请求的自适应超时与重试

任务标识：`ai-adaptive-execution`。对应[实施任务](../tasks/2026-10-25-ai-adaptive-execution.md)。来源为 [G3-D33](../tasks/evidence/2026-10-25-g3-reasoning-off-control.md) 的首输出超时与用户对固定模型、自适应超时／重试的实施授权。

## 目标与边界

固定本次选择的 Provider、模型、消息、Schema、reasoning 和传输协议，由 AI 研究执行层自动计算等待预算，并逐次决定是否重试。SDK 单次发送继续使用 `maxRetries=0`，每次实际尝试仍经既有 PostgreSQL 请求预留、派发授权、所有权及结算流程。业务持久化仍是事实源，历史延迟与重试配额仅为可丢失的运行缓存。

本轮仅修改及离线验收源码，不调用真实模型、不部署、不修改目标配置或业务数据；V2 保持关闭、余 4 次冻结，不 stage／commit。D32、Prompt／引用错误、模型默认和 Provider 选择不属于本次写集。

## 验收断言

- AE1：研究流式请求的总时限始终为已冻结绝对期限的剩余值。显式 route／provider 超时继续生效；旧数据有数值但缺少来源时按显式设置处理。系统缺省的 30 秒不再直接充当研究请求的硬上限；冷启动、缓存失效、样本不足或存在相关超时截尾时，以剩余任务预算等待，无新增任意固定秒数。
- AE2：同一配置指纹／Provider／请求模型／输出合同／输出模式／reasoning／输入规模分别统计首语义输出与最大输出停顿。默认规则的目标覆盖率 99%、置信度 95% 是显式工程目标，不是实测 SLA。采用完整观测最大值的一侧容忍界，最少完整样本数为 `ceil(log(1-confidence)/log(coverage))=299`；不足时保持冷启动。缓存窗口 24 小时，最多 512 项、有限 profile 数；窗口及规则版本记入决策。分布稳定、近似独立是学习假设，分组、过期及截尾保护用于限制漂移影响。
- AE3：超时不伪装成准确延迟：首块前失败记录右截尾，已有输出后中断记录停顿下界；相关截尾存在时不从仅成功的快样本收紧预算。HTTP 头、保活或空 delta 不算语义输出。动态 router 模型及实际模型不匹配的观测不混入固定模型学习。
- AE4：重试仅针对明确 `provider_rejected + rejected_before_generation`，固定原 Provider／模型；认证、权限、Schema／业务错误、取消、已开始生成及未知外部结果均不自动重试。最大次数来自现有冻结 `maxAiCalls`，现行合同最多 2 次尝试；不得改大上限或消耗冻结授权。每次重试重新预留并原子授权，累计输入／输出／费用和剩余期限继续检查，SDK 不叠加重试。
- AE5：运行重试配额最多允许一个额外尝试，来自现行合同的两次尝试上限。明确拒绝后的重试原子消耗一次配额，成功请求恢复；持续失败时实际重试次数下降至零。缓存不可用时不授予额外尝试。`Retry-After` 为等待下限，退避带抖动，等待和预期执行均必须装入剩余任务时间；无该等待依据时停止，不臆造重试间隔。不会为重试延长总期限。授权只允许一次时，即使缓存有配额也不重试；动态router名称不通过额外重试间接改变实际模型。
- AE6：缓存复用现有 Redis，使用独立 AI cache 命名空间、有限 TTL／长度、原子配额及无凭据的 profile 摘要；没有 PostgreSQL Schema／migration 或运行依赖变化。缓存错误只能使策略回到冷启动或减少重试。决策包含版本、来源、样本数、有效超时、重试原因并进入现有 trace；原始生成事实、usage、费用、未知结果与业务终态保持准确，不修饰旧 trace。
- AE7：纯策略测试及真实 SDK＋本地 HTTP 的集成测试覆盖迟到首输出、显式限制、截尾、同模型同 Provider 的拒绝后重试、预算用尽、取消和未知结果禁止重试。旧的自动跨 Provider fallback 不作为本功能行为；既有显式路由合同保持可读取。目标部署、真实 Provider 和跨进程 Redis 运行验收独立保留，离线通过不代收 G3 正向报告。

## 实现所有权

策略、观测缓存及同路由重试由 `apps/server/src/ai/` 拥有，单向消费 `platform/RedisService`。SDK adapter 仍只执行一次请求；共享 Schema 及现有业务预算语义保持。Nest 接线与边界门禁同步检查，不能引入 AI 对 Research 产品编排的反向依赖。D33 的既有 trace／控制脚本不修改。

Redis Lua 的原子性另由 infra 的 `scripts/verify-ai-adaptive-cache.mjs` 验证：只复用已存在的 Redis 镜像、创建带唯一所有权标签的无网络／无挂载临时容器，通过 CLI 适配器执行同一已编译缓存实现；仅清理本次拥有的容器。脚本不更新应用、目标 Redis 或任何业务数据，不安装或拉取依赖。命令规划先通过独立安全约束测试；该隔离结果不代替 T5 的目标 Nest／Redis 部署验收。

## 资料依据

工程依据为 [AWS 超时、重试与抖动实践](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)、[AWS 重试预算](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)、[LiteLLM 对结构化输出的超时区分](https://docs.litellm.ai/docs/proxy/timeout)及当前安装的 AI SDK 源码。这些资料不证明 Nvidia 本次托管实现或 120 秒的合理性。
