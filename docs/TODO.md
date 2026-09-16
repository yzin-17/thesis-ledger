# 延期实现 TODO

本文只记录**已经明确要在后续迭代实现、但当前不属于任何 active Spec/Task 完成条件**的事项。它不是当前任务清单，也不能用于把当前未完成的实现、运行时验收或外部门禁延期掉。

治理规则：

- 当前已经承诺实施或仍属于验收条件的事项，继续留在 `docs/tasks/` / `docs/reviews/`，不得迁入 TODO。
- 已经存在正式后续 Spec/Task 的事项，直接由该 Spec/Task 承接，不在 TODO 重复维护。
- TODO 只保留延期范围、来源、前置条件和重新立项触发条件；一旦启动实施，先创建成对 Spec/Task，再从本文移除对应条目。
- 普通“非目标”不自动进入 TODO；只有文档明确写明“后续实现 / 后续版本 / 另行立项 / 已确认后续范围”的事项才进入本文。

## 当前 TODO

| ID | 延期范围 | 来源 | 重新立项前置条件 / 触发条件 |
| --- | --- | --- | --- |
| `market-chart-minute-period` | 行情图表分钟线与盘中周期：Provider 分钟能力与 RouteTarget、CN/HK/US Session/午休边界、分钟级分页窗口、TTL/尾 bar 完成状态、指标预热、Desktop 盘中刷新与增量更新 | `specs/2026-09-16-market-chart-period-aggregation.md`；`tasks/2026-09-10-market-chart-indicator-integration.md` | 至少一个目标市场的分钟级数据能力、授权和运行预算明确；单独建立 `market-chart-minute-period` Spec/Task |
| `market-detail-pagination-anchor` | 修复 `/api/v2/market/:symbol/detail` 对 `calculationAnchor` 的显式支持，并收敛 `loadEarlier` 的分页锚点语义，避免把序列末尾日期误作向前分页锚点 | `specs/2026-09-16-market-chart-period-aggregation.md` | 在继续扩展历史分页/周期分页前，或现有分页出现可复现错误时，独立立项并补充回归证据 |
| `market-chart-trading-overlays` | 行情图表交易标记、成本线、风险线与区间测量等交易叠加层 | `tasks/2026-09-10-market-chart-indicator-integration.md` | 产品交互与数据来源明确后单独立项；不得夹带进周期、指标或分页任务 |
| `backtest-market-rules-expansion` | 在首个真实历史规则来源闭环之后扩展完整市场矩阵、客户级真实费用，以及公告/规则原文、首次公开时间和长期可复核来源链 | `tasks/2026-09-16-backtest-real-historical-market-rules.md` | 当前 bounded slice 完成，首个来源的许可、版本和历史覆盖稳定；再按市场/资产拆分新增 Spec/Task |
| `market-batch-catalog` | 为真正需要批量行情的消费者建立显式 batch/catalog 边界，禁止从单标 Quote 路径恢复 universe/full-market fallback | `archive/tasks/2026-09-14-portfolio-valuation-demand-guard.md` | 出现独立批量消费场景并能定义请求预算、缓存和 Provider 责任边界 |
| `portfolio-valuation-followups` | FX、LedgerEvent 与 realized PnL 相关的组合估值/性能优化 | `archive/tasks/2026-09-14-portfolio-valuation-demand-guard.md` | 有独立性能证据或产品需求证明当前链路需要优化；分别立项，不回填进已完成的估值保护任务 |

## 不属于 TODO 的当前门禁

以下类型即使受外部条件影响，也仍属于**当前任务完成条件**，不得迁入本文：

- AkShare/EastMoney 真实备用源成功门禁；
- 五个 Market Provider 的真实凭证/在线验收；
- Desktop / Mobile / Browser / Simulator 的当前产品运行态验收；
- 已实现功能的 Docker、Worker、PostgreSQL、Redis 或真实 Provider smoke；
- 当前 Task 明确列出的用户确认或受保护数据清理门禁。
