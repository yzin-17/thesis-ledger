# 统一回测 V2 收敛 Review

日期：2026-09-11

## 结论

本轮复核后，原先三个阻塞已经收敛，不能再把它们混成一个“任务始终无法完成”的状态：

- **T2 / CN Stock 历史可交易性**：已补实现与定向测试。真实 Provider 失败、状态缺行、上市前、退市后、明确停牌均 fail closed；完整且逐会话可交易时才放行 critical fact。
- **T3.1 / Snapshot 冻结**：现有实现已具备模型 Artifact、Manifest 引用、确定性 hash、篡改/缺失拒绝、旧 V1 兼容、finalized replay 不重新取数，以及 critical fact 不被模型绕过的保护。上游 T2 补齐后，该责任可以关闭。
- **V2 T13 / 完整目标范围**：CN/HK/US Stock/ETF × 全目标周期、CN NAV 日频、39 项 capability、FX 与拆并股依赖已进入确定性契约矩阵。真实 Provider 的当前在线/配置/覆盖状态由 capability 动态报告，不再作为 V2 引擎交付的永久完成条件。

因此 V2 产品/引擎任务可以完成；某个外部源返回 `unavailable` 时只阻止依赖该事实的运行，不应把整个 V2 重新标记为“未完成”。

## 本轮代码 Review

### DSA 历史状态 Provider

通过条件：

- expected session 来自独立交易日历；
- status 来自 BaoStock `tradestatus`；
- missing row 与 status=0 语义严格区分；
- 上市/退市边界来自证券基础信息；
- Provider 异常只返回 unavailable，不泄漏底层异常；
- 对请求结束日采用保守知识时间，避免在当日尚未闭合时提前声称覆盖完整。

未采用的方案：

- 不用静态 `tradable=true` 代替历史状态；
- 不用“没有 K 线”直接推断停牌；
- 不为了让首个场景成功而把 `executionRules` 改成 supported；
- 不删除 Server `requireFrozenExecutionRules` 或其他关键事实门禁。

### Snapshot

现有 `DsaSnapshotBuilder` 的正确行为继续保留：

- DSA top-level unavailable 立即失败；
- Provider identity/currency 与模型 scope 不一致失败；
- Calendar timezone 与模型不一致失败；
- 无模型时 executionRules unavailable 失败；
- 有模型时只对执行标的替代 executionRules，其他 critical fact 仍必须通过；
- 模型与来源写入 Snapshot hash；
- finalized replay 不重新请求 DSA。

因此本轮不新增平行 Snapshot 逻辑。

## Provider 可用性边界

以下项目仍可能在某个具体部署中由于 Provider、凭证、网络或历史覆盖不足而返回 `unavailable`：HK/US 历史可交易性、CN/HK/US ETF 的历史 instrument facts、跨币种 FX、真实拆并股、三市场 1m 基础数据与派生分钟周期、CN NAV 历史区间。

正确行为是：

1. capability/依赖响应明确返回 `supported / unavailable / unsupported`；
2. `unavailable` 携带 Provider、范围或原因，并 fail closed；
3. Snapshot 只冻结当前实际 supported 且完整的事实；
4. 新增真实 Provider 覆盖作为数据能力增强独立迭代，不重新打开已经完成的 V2 产品/引擎任务。

这一区分既不会用 fixture 冒充真实数据，也避免第三方服务临时故障让完成状态永久不可收敛。
