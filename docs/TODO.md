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
| `ai-provider-probe-route-parameters` | 让连接探针与真实执行的参数一致：连接探针（`purpose` 为空，传输 `single`）目前只消费 Provider 总超时，用途级 / Provider 级 `firstOutputTimeoutMs`、`outputIdleTimeoutMs` 与路由级 `reasoningEffort` 都不参与。用途探针（`purpose` 非空，传输 `stream`）自 `272eaa27` 起已消费前两者（`ai-provider.service.ts:746-754` → `provider-connection-test.ts:113-116` → `ai-sdk-generation.adapter.ts:232-241`），推断理模型所需超时仍只能靠抬高该用途或 Provider 的总超时 | `tasks/2026-09-21-ai-provider-model-usage-configuration.md`（2026-09-22 记录，2026-09-23 复核收窄） | 真实 Provider 用途测试因超时参数不可用而被误判为模型不可用，或产品确认测试必须与流式执行共用同一组超时/推理参数时立项；立项前不得用放宽探针预算掩盖真实执行路径的超时 |
| `ai-generation-contract-semantic-refinements` | 三个生成契约的语义约束（`strategy.sizing.amount > 0`、`strategy.entry/exit` 最短长度等）只存在于 `superRefine`，JSON Schema 无法表达，`native_schema` 上游结构化输出与 `json_validated` 探针都只能靠提示词兜底；评估把可下沉的约束改为结构约束（如 `z.number().positive()`、`z.array().min(1)`）并明确哪些语义约束必须保留在应用侧校验 | `tasks/2026-09-21-ai-provider-model-usage-configuration.md`（2026-09-22 修复记录） | 出现模型反复输出 0 / 空数组被契约拒绝，或需要上游结构化输出自身保证语义合法性时立项；改动契约版本必须同步执行路由与冻结快照的兼容影响 |
| `ai-provider-json-text-error-classification` | `json_validated` 的空内容响应被错误分类：`parseJsonText` 对空内容抛的是普通 `Error`，而 adapter 的 `catch` 只把 `SyntaxError` / `ZodError` / `NoObjectGeneratedError` 归为 `schema_invalid`，导致“Provider 返回空内容”落入 `transport_unknown`（`phase=request`、`externalResult=unknown`），把上游输出问题误导成传输问题 | `apps/server/src/ai/ai-sdk-generation.adapter.ts`（2026-09-22 排查） | 出现空内容响应被当作传输故障排查，或需要按 `schema_invalid` 统计上游输出质量时立项；不得只改错误文案而不修分类 |
| `ai-provider-json-validated-prompt-guard` | `json_validated` 模式缺少统一的 JSON 指令保障：该模式不发 `response_format`，契约结构完全靠各调用点自己写的提示词，业务用途探针曾因漏写 JSON 指令整类失败（`Unexpected token '*'`）；评估在适配器或调用层加显式守卫/断言，而不是依赖每个新增调用点自觉 | `tasks/2026-09-21-ai-provider-model-usage-configuration.md`（2026-09-22 修复记录） | 新增第三个使用 `json_validated` 的调用点时立项，或再次出现因提示词缺 JSON 指令导致的整类失败 |

## 不属于 TODO 的当前门禁

以下类型即使受外部条件影响，也仍属于**当前任务完成条件**，不得迁入本文：

- AkShare/EastMoney 真实备用源成功门禁；
- 五个 Market Provider 的真实凭证/在线验收；
- Desktop / Mobile / Browser / Simulator 的当前产品运行态验收；
- 已实现功能的 Docker、Worker、PostgreSQL、Redis 或真实 Provider smoke；
- 当前 Task 明确列出的用户确认或受保护数据清理门禁。
