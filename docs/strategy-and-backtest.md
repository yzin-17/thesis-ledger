# 策略与回测

## 统一契约

策略以 `Strategy` 和不可变的 `StrategyVersion` 保存。每次修改都创建新版本，回测任务只引用版本 ID；因此历史结果不会被后续编辑覆盖。`strategySchemaV1` 包含固定 universe、有效期、入场/出场信号、止损止盈、仓位、成交与成本、风险约束和基准。组合条件使用 `all`、`any`、`not` 表达，不绑定某个 Python 函数名。

回测任务的状态为 `queued`、`running`、`succeeded`、`failed` 或 `cancelled`，并记录进度、时间、引擎版本和结果 checksum。Worker 只依赖 `BacktestWorker` 的 `run/cancel/status/result` 边界，内置实现的引擎标识为 `investment-os-engine-v1`。

## A 股交易规则

本地执行模型在生成成交前依次检查停牌、T+1、涨跌停和最小交易单位，再计算滑点、佣金和卖出印花税。每笔成交保留费用拆分；被拒订单保留日期、数量和原因。策略可以配置单标的仓位上限和现金下限。

公司行动通过行情 Bar 的 `dividend` 与 `splitFactor` 表示：分红进入现金，拆分调整数量和单位成本，避免把价格调整重复计入收益。生产接入时应把这些事实同步到 Ledger 的公司行动事件。

## 偏差防护与数据完整度

只使用 `availableAt <= dataAsOf` 的数据。回测开始前检查 universe 标的和区间日期；缺失内容在结果 `completeness` 和 `warnings` 中明确列出，不会静默缩小 universe。缺少退市或历史成分覆盖时，结果固定标记 `survivorship_coverage_unknown`。

结果同时保存交易级指标、period-based analytics、样本内/样本外指标和基准超额收益。`metadata` 保存策略版本、schema 版本、数据版本、provider、引擎版本、参数和成本模型，`resultChecksum` 用于固定输入重跑比较。

## 验证边界

领域回归覆盖 T+1、涨跌停、停牌、交易单位、成本拆分、公司行动、PIT、universe 完整度、风险约束、基准、样本切分和 period analytics。桌面端可创建策略、创建版本、排队、运行、取消并查询任务；真实行情数据和人工浏览器验收仍需在接入运行环境后执行。
