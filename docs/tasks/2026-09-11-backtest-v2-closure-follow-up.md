# 统一回测 V2 收敛实施任务

对应：

- [`统一回测系统 V2`](2026-08-28-unified-backtest-v2.md)
- [`回测执行规则与研究假设`](2026-09-10-backtest-historical-execution-rule-facts.md)
- [`本轮验收记录`](../benchmarks/2026-09-11-backtest-v2-closure.md)

> 本文件只收敛 2026-09-11 仍存在的责任边界，不复制原 T0–T12。原任务历史证据保持不变。

## C1：历史可交易性 Provider

- [x] CN Stock 使用独立历史事实来源，不再依赖静态 `tradable`。
- [x] 上市前、退市后、明确停牌、Provider 缺行和 Provider 失败分别保留不同失败语义。
- [x] 缺失 K 线/Provider 行不得自动解释为停牌。
- [x] 历史事实完整时 `executionRules` 仍保持独立 `modelAssumption`，不伪装成 Provider rule supported。
- [x] 有显式完整研究模型时只替代 executionRules；critical fact unavailable 时仍阻止 Snapshot。
- [x] DSA 定向测试、py_compile、选定 flake8 与 diff-check 通过后才允许进入主分支。

## C2：Snapshot 冻结验收

- [x] 使用实际 warmup/运行区间请求 dependency facts。
- [x] execution model 作为独立 Artifact 冻结，并进入 Manifest 与内容 hash。
- [x] 模型数值/来源变化改变 hash，相同输入 hash 稳定。
- [x] Provider identity/currency 与 Calendar timezone 保持独立校验。
- [x] executionRules model assumption 的替代不得绕过 historicalTradability 等 critical fact。
- [x] finalized Snapshot replay 不重新请求 Provider。
- [x] 模型 Artifact 缺失/篡改拒绝重放；旧 V1 Snapshot 不补假设。

## C3：T13 离线完整目标矩阵

- [x] CN/HK/US × Stock/ETF × `1d/60m/30m/15m/5m/1m` 共 36 个 Exchange 组合进入自动 Schema 回归。
- [x] CN NAV 仅允许 `1d`；HK/US NAV 与分钟 NAV 保持拒绝。
- [x] capability Contract 覆盖 36 个 Exchange + 3 个 NAV 状态，共 39 项。
- [x] FX Contract 覆盖 HKD/CNY 与 USD/CNY。
- [x] 公司行动 Contract 覆盖 Split 与 Reverse Split。
- [x] CN NAV dependency Contract 有确定性回归。

## C4：T13 真实 Provider / Runtime

- [ ] HK/US historical tradability 有可证明来源或明确 fail-closed 路径，并完成代表性真实运行。
- [ ] CN/HK/US ETF instrument facts 的历史适用性完成代表性真实运行。
- [ ] HKD/CNY、USD/CNY 真实 FX 覆盖完成 Snapshot + replay 验收。
- [ ] Split/Reverse Split 的真实公司行动覆盖完成 Snapshot + Runner 验收。
- [ ] 三市场真实 1m 基础数据与 5m/15m/30m/60m 派生完成代表性运行。
- [ ] CN NAV 真实历史区间完成 request → confirmation → redemption 闭环。
- [ ] 上述真实运行完成账户隔离、Snapshot hash、Result checksum、retry/replay 与故障门禁。

C4 只有真实环境证据通过后才能勾选。`unavailable` 是正确状态，不得通过 fixture、静态常量或放宽门禁改写成 supported。
