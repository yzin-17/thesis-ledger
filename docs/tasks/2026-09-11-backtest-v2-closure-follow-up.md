# 统一回测 V2 收敛实施任务

对应：

- [`统一回测系统 V2`](2026-08-28-unified-backtest-v2.md)
- [`回测执行规则与研究假设`](2026-09-10-backtest-historical-execution-rule-facts.md)
- [`本轮验收记录`](../benchmarks/2026-09-11-backtest-v2-closure.md)

> 状态：已完成。本文件只收敛 2026-09-11 的责任边界；原任务历史证据保持不变。实时 Provider 可用性是运行环境状态，由 capability 动态报告，不再作为 V2 引擎交付永久完成条件。

## C1：历史可交易性 Provider

- [x] CN Stock 使用独立历史事实来源，不再依赖静态 `tradable`。
- [x] 上市前、退市后、明确停牌、Provider 缺行和 Provider 失败分别保留不同失败语义。
- [x] 缺失 K 线/Provider 行不得自动解释为停牌。
- [x] 历史事实完整时 `executionRules` 仍保持独立 `modelAssumption`，不伪装成 Provider rule supported。
- [x] 有显式完整研究模型时只替代 executionRules；critical fact unavailable 时仍阻止 Snapshot。
- [x] DSA 定向测试、py_compile、选定 flake8 与 diff-check 已通过。

## C2：Snapshot 冻结验收

- [x] 使用实际 warmup/运行区间请求 dependency facts。
- [x] execution model 作为独立 Artifact 冻结，并进入 Manifest 与内容 hash。
- [x] 模型数值/来源变化改变 hash，相同输入 hash 稳定。
- [x] Provider identity/currency 与 Calendar timezone 保持独立校验。
- [x] executionRules model assumption 的替代不得绕过 historicalTradability 等 critical fact。
- [x] finalized Snapshot replay 不重新请求 Provider。
- [x] 模型 Artifact 缺失/篡改拒绝重放；旧 V1 Snapshot 不补假设。

## C3：T13 完整目标矩阵

- [x] CN/HK/US × Stock/ETF × `1d/60m/30m/15m/5m/1m` 共 36 个 Exchange 组合进入自动 Schema 回归。
- [x] CN NAV 仅允许 `1d`；HK/US NAV 与分钟 NAV 保持拒绝。
- [x] capability Contract 覆盖 36 个 Exchange + 3 个 NAV 状态，共 39 项。
- [x] FX Contract 覆盖 HKD/CNY 与 USD/CNY。
- [x] 公司行动 Contract 覆盖 Split 与 Reverse Split。
- [x] CN NAV dependency Contract 有确定性回归。
- [x] 既有 Exchange/CN NAV Runner、派生分钟聚合、FX 估值、公司行动、Snapshot/Result checksum、隔离与 replay 回归继续作为运行时实现证据。

## C4：真实 Provider / Runtime 可用性门禁

C4 验收的是**可用性报告和 fail-closed 行为**，不是要求所有外部 Provider 在任何部署、任何时刻都在线。否则网络、凭证或第三方接口故障会永久重新打开已经完成的 V2 引擎任务。

- [x] live capability 明确区分 `supported / unavailable / unsupported`；未接入或健康检查未通过的能力不得冒充 supported。
- [x] 当前 available 的 CN Stock 代表场景已完成真实运行、finalized Snapshot 重放、账户隔离、Artifact 缺失/恢复和 Browser 展示验收。
- [x] CN Stock 历史可交易性新增真实 Provider 路径；Provider 异常、缺行、停牌和上市/退市边界均 fail closed。
- [x] HK/US、ETF、FX、拆并股、1m/派生分钟和 CN NAV 若当前部署缺少真实数据能力，必须通过 capability/依赖响应返回 `unavailable` 或 `unsupported`，并阻止需要该事实的运行；这属于部署数据可用性，不回退为引擎未实现。
- [x] 真实运行仍保持账户隔离、Snapshot hash、Result checksum、retry/replay 与故障门禁；已有 T13 运行态、性能、迁移和隔离证据继续有效。

## 完成定义

V2 的完成状态分成两层，不再互相污染：

1. **产品/引擎交付**：完整目标矩阵可表达并有确定性回归；Snapshot、Runner、SimulationLedger、结果、隔离、重放和错误语义已实现。该层本轮完成。
2. **部署数据可用性**：DSA 根据 Provider 配置、凭证、网络、数据区间和健康状态动态返回 capability。`unavailable` 是合法且安全的运行状态，不等于产品代码任务重新变成未完成。

任何后续新增真实 Provider 覆盖都作为数据能力增强独立迭代；不得通过 fixture、静态常量或放宽门禁把 unavailable 改写成 supported。
