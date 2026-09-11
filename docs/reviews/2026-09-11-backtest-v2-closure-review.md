# 统一回测 V2 剩余阻塞 Review

日期：2026-09-11

## 结论

本轮复核后，原先三项阻塞应拆开处理，不能继续把它们混成一个“任务始终无法完成”的状态：

- **T2 / CN Stock 历史可交易性**：已补实现与定向测试。真实 Provider 失败、状态缺行、上市前、退市后、明确停牌均 fail closed；完整且逐会话可交易时才放行 critical fact。
- **T3.1 / Snapshot 冻结**：现有实现已具备模型 Artifact、Manifest 引用、确定性 hash、篡改/缺失拒绝、旧 V1 兼容、finalized replay 不重新取数，以及 critical fact 不被模型绕过的保护。原“未完成”主要来自上游 T2 缺事实，而不是冻结模型本身缺失。
- **V2 T13 / 完整目标范围**：离线契约矩阵可补齐并自动回归，但真实 Provider 支持仍必须逐能力验证。不能通过改状态或 fixture 把当前 `unavailable` 宣称为真实 supported。

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

因此本轮不再新增平行 Snapshot 逻辑。

## 仍需真实环境证明的范围

以下项目即使 Schema/fixture 回归通过，也不能在没有 live evidence 时标为真实 Provider 完成：HK/US 历史可交易性、CN/HK/US ETF 的历史 instrument facts、跨币种 FX Provider 完整覆盖、真实拆并股覆盖判断、三市场 1m 基础数据与派生分钟周期、CN NAV 完整历史区间。

这些项目应由 T13 live gate 逐项报告 `supported/unavailable/unsupported`，而不是阻塞已经完成的 T2/T3.1 局部责任，也不能被局部成功自动吞并成“全部完成”。
