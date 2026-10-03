# E01-N1.1 净值依赖范围验收

日期：2026-09-30。状态：本叶通过；N1 整体、NAV 准备/冻结/Worker 和真实来源验收仍未完成。

## 实施范围

按 canonical replacement Spec §3「NAV 净值依赖范围」，新增 Server Backtest 所有的纯计划 `planNavSnapshotInputsV3` 和独立日历核验。输入为现行策略、`BacktestNavRunConfigV3`、独立 `NavPlanningCalendar`，没有网络、数据库或产物写入。复用现有 `strategyRequiredLookback`、实际信号引用收集与微秒精度时间比较；既有 `backtest-dependency-price.ts` 仅将信号引用收集函数导出，行数未增长，没有复制通用 AST 遍历或新增跨 feature 依赖。

首个计划仅接受 CN/CNY 日频 NAV Fund、同基金 `nav` 信号和同基金基准。未引用的来源不加入依赖；异标的信号/基准、事件信号、非法周期/身份和非零旧策略佣金或滑点拒绝。申赎费用仍来自独立显式执行模型，不在本叶重算费用。

## 日期与输出

预热条数采用入场/退出 AST lookback 的最大值，保守要求运行开始日前有该数量的估值日，按独立日历取最后 N 日；不使用自然日倍数估算作为完成判据。没有价格引用的策略仍保留至少 1 条历史净值用于初始估值依赖。输出包括精确 `FUND_NAV_HISTORY` RouteKey、实际信号、逻辑产物用途、运行范围、净值范围、预期估值日期、预热规则、日历身份和执行模型身份。

估值日期与申赎处理交易日期分开，日历必须声明完整覆盖、基金身份、版本、摘要、原始证据引用和 `availableAt`。核验格式、日期升序唯一、覆盖范围、标的及冻结可见性；实际来源日历资格和摘要对应原文的复核由后续冻结叶负责，任意声明不能成为真实来源证据。

所有执行模型段的确认与确认后可卖/资金可用延迟取保守上界。结束日后日历预算为 `1 + confirmation + afterConfirmation` 个交易日，1 日覆盖申请截止时间后的可能顺延；收益区间不延长，结束日后尚未定价或确认的申请按 `retain-pending` 规则交给后续 Runner。计划成功只说明范围已闭合，不授予真实净值、历史发布时间或严格 PIT 资格。

受控测试示例：运行 2026-09-08..09-15，入场 MA(3)、退出 MA(4)，所需 4 个历史估值日为 09-02、09-03、09-04、09-07，净值范围为 09-02..09-15。确认延迟 1 日、确认后最大延迟 2 日，申赎日历延伸 4 个交易日至 09-21；基准和结果仍为原运行区间。该日历是测试夹具，没有访问真实基金或供应商。

## 验证

| 检查 | 结果及断言 |
| --- | --- |
| `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-nav-input-plan.test.ts test/backtest/backtest-dependency-plan.test.ts` | 27/27；其中 NAV 16 项，场内依赖回归 11 项。覆盖嵌套预热、未使用来源、初始估值、独立估值/处理日历、多模型段预算、无执行日、预热不足、尾部不足、日历完整性/身份/日期/微秒可见性、其他来源与费用拒绝。 |
| `pnpm --filter @thesis-ledger/server typecheck` | 通过。首次发现策略 Schema 推导的 AST 为 unknown 和 never 箭头函数缩窄问题，按既有 StrategySchemaV2 类型入口及明确函数声明修复；未放宽输入校验。 |
| `pnpm --filter @thesis-ledger/server test` | 1742 项通过、83 项跳过，228 文件通过、25 文件跳过。跳过的数据库/外部集成不视为通过。 |
| `pnpm --filter @thesis-ledger/server build` | 通过。 |
| 定向 ESLint、Prettier | 新计划、日历、测试及既有引用收集入口 ESLint 通过；新增文件 Prettier 通过。 |
| `node scripts/check-boundaries.mjs` | 通过；没有新增跨 feature、上游反向依赖。 |

详细临时日志：`/tmp/n11-targeted.log`、`/tmp/n11-typecheck.log`、`/tmp/n11-server.log`、`/tmp/n11-build.log`、`/tmp/n11-eslint.log`。本轮保留全部既有未提交修改，没有提交或部署；不修改数据库、公共 API、Provider 配置或实际创建守卫。

## 一致性复核与下一步

N1.1 的范围算法、失败条件与本地验证一致，可勾选。N1.2 必须将上述计划及独立日历原文与现行 NAV 产物绑定，检查实际净值/发布时间、完整覆盖、摘要及读取一致性；N1.3 负责 Domain 事实映射。N2 负责真实精确来源准备/写入，N3 负责期末待处理及申赎经济消费，N4 负责目标运行态与客户端；这些门禁均未通过本次纯计划测试代替。
