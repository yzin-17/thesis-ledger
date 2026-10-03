# 策略风险日线读取迁移

> 2026-09-29。本叶只完成 Server 源码与包级验证；目标运行态、真实风险规则和分钟线来源尚未验收。

## 行为

`StrategyRiskContextService` 对股票与 ETF 的日线读取改用 `MarketBarReader.readV3()`，以标的市场、资产类型、`DAILY_BAR`、`1d`、`none` 组成精确 RouteKey。窗口默认覆盖评价日前 366 个自然日；有持仓起点时从该日起读。只接受 `selected`，并继续过滤评价时点之后产生或可用的 Bar；缺少窗口或来源时保留持仓事实，不产生行情价格。`take` 在时点过滤后生效。

DSA 旧 `/market/bars` 对 `1m` 明确返回 422，当前 V3 数据读取也只支持日线。风险分钟线及其派生周期现在直接返回行情不可用，不读取旧缓存或测试夹具；Automation 的 `1m` 同步请求在读取前拒绝。Automation 的日线同步仍在旧 Reader 上，基金净值与普通 Bar 的当前来源合同尚未统一。

## 验证与剩余门禁

- `test/risk/strategy-runtime.test.ts` 与 `test/automation-runtime.test.ts` 定向共 32 项通过；测试覆盖日线精确 RouteKey、评价时点过滤、分钟线无来源时拒绝旧 Reader。
- Server 全包 1765 项通过、91 项跳过；`tsc --noEmit` 与 `pnpm build` 通过。
- 目标策略、DSA 精确来源、完整性证据、Automation 日线、分钟线真实来源及风险规则业务结果尚未验收。U02/E02/D02 不勾选。
