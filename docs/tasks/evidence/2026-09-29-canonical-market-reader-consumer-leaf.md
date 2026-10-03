# Market Reader 消费者迁移首叶

> 2026-09-29。本叶验证范围为 Server 源码与包级测试；目标运行态未更新。

## 调用链库存

| 消费者 | 当前调用 | 完成迁移所需条件 |
| --- | --- | --- |
| 正式绩效快照的股票与 ETF 日线估值 | 已改用 `MarketBarReader.readV3()`，以市场、资产类型、日线周期与 `none` 价格口径构造精确 RouteKey | 目标 DSA/Server 同源部署、真实正式估值快照与来源证据核验 |
| `MarketController` 的 `/bars`、`/indicators` 与非 V3 图表分支 | 仍调用 `MarketBarReader.read()`，返回旧 BarSeries/指标合同 | 统一当前 HTTP 响应及 API Client/Desktop 消费；分钟线、指标和图表行为逐项验收 |
| `StrategyRiskContextService.storedBars()` | 仍调用旧 Reader，包含 `1d` 和 `1m` | 当前 Reader 只支持日线窗口；迁移前需具备分钟线精确路由与时序验收 |
| `AutomationWorkflowRunner.closeSync()` | 仍调用旧 Reader，接收 `1d` 或 `1m` | 保留两种周期的同步能力，再统一当前 Reader |
| `DsaMarketBarPolicyPort`、`DsaMarketBarRemotePort` | 仍读取 V2 生效策略与 V2 BarSeries 数据 | 上述消费面迁移后删除，随后关闭 DSA 旧生效策略与数据接口 |

## 本叶行为

正式绩效快照对股票和 ETF 读取交易日精确 V3 窗口，只接受 `selected` 且 `completionStatus=complete` 的当日价格。结果保留来源 Provider 身份；不可用窗口或未完成日线返回不可用估值，不产生正式价格。基金净值和估算报价路径未在本叶更改。

## 验证与边界

- `pnpm exec vitest run test/performance/snapshot-position-valuation-v3.test.ts test/performance/valuation-series.test.ts`：8 项通过。
- `pnpm exec vitest run --silent`：1763 项通过、91 项跳过；`pnpm typecheck` 与 `pnpm build` 通过。
- 目标 Server/DSA、真实绩效快照、Risk 分钟线、Automation 与公开 Market HTTP 均未验收。本叶不勾选 E02/U02/D02。
