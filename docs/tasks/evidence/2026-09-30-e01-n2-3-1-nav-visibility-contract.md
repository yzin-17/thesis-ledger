# E01-N2.3.1 净值可见性与日期合同验收

## 范围与决定

2026-09-30，依据用户确认的普通 T+1 及具体 QDII 披露规则，实施显式严格/研究模式合同。真实来源取证见 [N2.2 证据](2026-09-30-e01-n2-2-nav-publication-calendar-research.md)。本叶完成 Schemas、Server 冻结与 Domain 适配边界；真实 DSA 生产、Policy、Run 创建、Worker 和客户端由后续叶验收。

## 已实施合同

- RunConfig 与 Manifest 必须提供 `navVisibility`。严格模式使用 `strict-publication`；研究模式使用 `research-assumption`，绑定上海时区、披露日终边界、具体基金规则、版本、适用区间、配置时刻及披露日历摘要。
- 普通 `domestic-default` 只接受延迟一个工作日；QDII 必须显式提供 `verified-fund-rule`，支持具体规则规定的 T+1 或 T+2，不能依类型自动选择延迟。
- 独立日历声明 `valuationDates`、`tradingDates`、`disclosureWorkDates`，分别决定净值完整性、申赎处理与研究可见性。估值日之后计数 T+n，不包含 T 日；披露日结束后的下一自然日上海零点可见。
- 确认/结算 `calendarRange` 与披露 `visibility.disclosureRange` 分开，`requiredCalendarRange` 取两者并集。缺日历、日期不升序、不足以覆盖预热或尾部时拒绝。
- 研究证据记录来源 ID、原始净值记录摘要、规则/日历摘要、披露日及假设时间，不允许 `sourcePublishedAt`。来源响应、逐条原始记录和 `capturedAt` 继续冻结；采集时刻不能晚于 `dataAsOf`。
- 上下文 Parquet 保存 `ruleRaw`，以 `contentHash` 核验规则原文；`documentHash` 绑定引用披露文件。冻结及离线读回重新核验原文、身份、日期、模式和假设时间。
- Domain 输入保留模式、规则和 `visibilityDisclosure`。研究模式标明延期披露及历史修订限制；严格发布时间模式仍要求独立的来源 PIT 准入。
- 独立提取来源原文核验与研究规则计算，冻结校验器继续负责整体一致性。没有新增跨 feature 依赖。

## 验收场景

受控测试日历声明 9 月 14 日为披露休息日，申赎处理日仍包含该日；该测试设置只证明三个集合独立，不能作为真实基金日历。

1. 严格、普通 T+1 和 QDII T+2 格式均使用真实 Parquet 冻结并离线重放，保留原文且不修改调用输入。
2. 9 月 11 日星期五估值，跳过周末与受控休息日：T+1 在 9 月 16 日上海零点可见，T+2 在 9 月 17 日上海零点可见。边界前一微秒不可用，恰好边界时可用。
3. 另一个受控长延迟规则使披露尾部延伸至 9 月 23 日，确认/结算仍止于 9 月 21 日，并集覆盖至 23 日。
4. 缺规则原文、缺日期、披露尾部不足、原文/规则/日历摘要篡改、模式不符、未核查 QDII、规则区间不足、伪造发布时间和未来采集/可见时间均拒绝。
5. 重新计算 Manifest 根摘要后，篡改规则仍被冻结上下文核验拒绝；既有严格冻结、锁定、幂等、损坏产物及经济内核回归继续通过。

## 验证记录

输入范围：本次 NAV 可见性 Schema、独立日历/计划、来源与规则核验、LocalNavSnapshotStore、Domain 适配器及相关测试；Schemas/Server 全包同时覆盖各自当前源码。Schemas 构建完成后再运行 Server；没有更新目标镜像。

| 命令 | 最后结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/schemas test test/backtest-nav-freeze-v3.test.ts` | 14 项通过 |
| `pnpm --filter @thesis-ledger/server test test/backtest/backtest-nav-visibility.test.ts test/backtest/backtest-nav-input-plan.test.ts test/backtest/backtest-nav-snapshot-store.test.ts test/backtest/backtest-nav-domain-input.test.ts` | 69 项通过，其中新增可见性 18 项 |
| `pnpm --filter @thesis-ledger/schemas test --reporter=dot` | 47 文件、565 项通过 |
| `pnpm --filter @thesis-ledger/server test --reporter=dot --maxWorkers=2` | 231 文件、1795 项通过；25 文件、83 项跳过 |
| `pnpm --filter @thesis-ledger/domain test test/nav-simulation.test.ts` | 9 项通过 |
| Schemas 与 Server 的 `typecheck`、`build` | 通过 |
| 本叶源文件与测试的 `eslint --max-warnings=0` | 通过 |
| 本叶源文件复杂度 20、函数长度 220 门禁 | 无警告 |
| `node scripts/check-boundaries.mjs` | 通过 |
| `node scripts/check-workspace-dependencies.mjs` | 8 包依赖图通过 |
| 本叶文件 `prettier --check`、`git diff --check` | 通过 |

首次默认并发 Server 全包出现两项既有场内 Parquet 测试的 5 秒超时：`v3-frozen-comparison.test.ts` 与 `v3-sparse-tradability-runner.test.ts`；NAV 场景通过。降低并发后完整回归通过，没有修改测试超时阈值。随后强化严格模式缺发布时间负例，使原文和响应摘要正确、但真实发布字段缺失，定向重验。

## 后续边界

本叶没有授予任何真实来源准入或严格 PIT 资格。控制夹具中的规则文件摘要与日历只用于合同验收；真实基金规则、披露文件、日期完整性及 Provider 修订由 N2.3.2 生产和验收。结果页面披露由后续消费叶实现。N2.3 与 N2 父项保持未勾选。

下一叶：E01-N2.3.2，生产符合本合同的精确来源净值及独立日期证据，并完成真实来源正例与失败负例。
