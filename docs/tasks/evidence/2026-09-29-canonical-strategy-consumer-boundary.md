# 策略消费者现行合同收敛

> 2026-09-29；对应[单一现行链路替换任务](../2026-09-29-thesis-ledger-canonical-runtime-replacement.md)的 C03、U01、U02。本记录仅覆盖本地源码与测试，未构成整链路验收。

## 修改

- Strategy Optimization 评分只解析当前 `BacktestResultV3`；旧结果与未知版本在计算评分前失败。执行拒绝诊断仍保留当前合同允许的可选 NAV 拒绝集合。
- Desktop 新建策略默认配置改用服务端当前接受的 `schemaVersion='2'` 策略结构；执行标的、资产类型与信号来源同步更新，支持在常用配置中选择股票或 ETF。空标的在提交前由合同校验拒绝，示例入场/退出规则在说明中明示。策略编辑器只按当前策略 Schema 校验，移除 V1 表单、JSON 降级与约 600 行旧交互。
- 策略库删除 V1 版本能力分支，回测和 AI 实验仅在当前策略摘要可用时开放。`StrategySections` 中无调用方的旧结果弹窗、其显示兼容辅助函数及只覆盖该弹窗的测试已删除；当前结果详情由 `StrategyBacktestDetailPage` 承担。
- 回测设置弹窗在准备行情前解析完整的当前策略 Schema；缺损或旧策略显示不可用，并禁用提交。多标的“仅使用首个标的”的旧提示与旧版本摘要回退已删除。
- 策略摘要移除 `legacy` 返回分支；后台回测动作在排队前解析完整策略，旧/缺损策略不调用队列。定向测试覆盖旧策略拒绝后仍可提交有效当前策略。
- `StrategyV2Summary` 仍是当前经济策略配置组件；用户可见标题不再把当前合同标成旧版本。`StrategySchemaV2` 及服务端持久化数字 2 仍是现行策略协议，不能仅因命名将其删除；须在 C03 中与 Worker、研究、优化和数据库写读同步替换。

## 验证

| 层级 | 结果 |
| --- | --- |
| 定向 | Server 优化评分 8 项、Desktop 回测准备/策略/路由 4 文件 29 项通过；默认策略选定标的后通过当前 Schema 解析，空标的被拒绝。 |
| 包级 | Server 226 文件通过、25 文件跳过，1772 项通过、91 项跳过；Desktop 76 文件、508 项通过。 |
| 类型与构建 | Server、Desktop 类型检查与 build 通过。 |
| 门禁 | `node scripts/check-boundaries.mjs`、本叶主要源码与测试 Prettier、`git diff --check` 通过。`test/backtest-preparation.test.tsx` 存量段落尚未整体符合 Prettier，本叶未做整文件机械格式化；改动段落已按其规则书写。 |

目标 API、浏览器/桌面交互、实际 Worker 和旧持久化策略读取未验收。C03、U01、U02、D02 继续未勾选。
