# 回测历史执行规则决策与当前卡点（临时记录）

状态：2026-09-10 范围调整后说明；不替代 Spec/Task。

## 当前决定

产品目标已明确为“在明确的数据范围和执行假设下，提供可信、可复现的策略研究回测，服务于策略验证、风险规则联动及后续 AI 策略优化”。保留 CN/HK/US 股票与 ETF、国内场外基金及 V2 原有周期范围。

客户级历史精确复演不再是普通回测前置。逐日原公告、规则全历史版本、客户收费协议与提现时点退出当前交付范围；基础费用、最低额、币种/舍入、持仓可卖、资金再投资及 NAV 生命周期仍必须明确计算。F1–F6 的逐项边界以 [Spec](../specs/2026-09-10-backtest-historical-execution-rule-facts.md) 为准，不整组删除或保留。

## 职责与实现核对

DSA 原生 BacktestEngine/BacktestService 评估历史分析建议的方向、命中与模拟收益，不承担 ThesisLedger 的订单、持仓、资金和 Snapshot 模拟。继续复用 DSA 数据接入，ThesisLedger 复用现有 Snapshot、Runner、ExecutionRules、SimulationLedger 与结果体系；不新增引擎、不迁移运行时。

本地源码仍只有单套冻结规则：DSA 真实 instrument facts 返回 executionRules unavailable，Snapshot 校验并拒绝，Exchange Runner 使用单个 VersionedExecutionRules。文档范围调整没有改变代码门禁。

## 当前卡点与顺序

[实施任务](../tasks/2026-09-10-backtest-historical-execution-rule-facts.md)已取消全部历史证据串行门禁：T0 有界确认运行输入/模型，T1 可先做冻结契约；契约通过后 T2 处理 Provider 范围，T3.1 冻结 Snapshot、T3.2 执行模型、T3.3 披露配置及限制，最后 T4 验收真实成功运行与隔离。

必要价格/NAV、公司行为、身份/日历和无法合理建模的交易约束缺失仍阻止对应运行。可建模假设须显式选择、注明来源/版本/范围并冻结；无关审计缺项不阻塞。不能只删除 unavailable 检查，也不能仅显示警告便继续正常输出。

当前尚未选定并实现完整生产模型，成功买卖与权益闭环仍待验证；[V2 T13 记录](../benchmarks/2026-09-09-unified-backtest-v2-t13.md)最近记录的 Run 获取 68 根日线后失败，没有 snapshot/result，T13 保持未完成。未接入的市场/资产/周期仍是目标能力，不因范围调整被删除。

## 历史结论保留

此前选择“可审计历史复演”并将 T0 设为唯一可执行任务，这是已被本次产品决定替代的设计。此前 F1–F6 全部受 T0 阻塞的记录，及 [来源矩阵](../benchmarks/2026-09-10-backtest-historical-execution-rule-source-matrix.md)的 36 条来源、39 个链接与未证字段，继续作为历史证据；没有把它们改写成当时已通过。

本轮只修改文档并做一致性检查；未修改代码、Schema、测试、数据库或部署配置，未执行迁移、重建、重启或提交。
