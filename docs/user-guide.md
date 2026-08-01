# 核心模块使用说明

## Account、Position 与截图导入

先创建 Account，再手动录入 Position 或上传 PNG、JPEG、WebP 截图。截图只生成 Import Draft；在 Review 中处理低置信度、歧义匹配和数值警告后才能提交。重复截图会返回已有草稿，已提交导入可从历史中回滚。

## Provider 与行情

Quote、Bar、Indicator 和 Chip 使用统一契约。Provider 可按能力配置优先级和 fallback。`stale` 表示数据陈旧，`partial` 表示结果不完整；两者都不能用于无提示的完整回测或组合结论。

## Risk 与通知

RiskRule 负责确定性判断，RiskEvent 保存阈值、触发值和数据时点。Notification 只负责路由、静默时段、去重、重试和送达记录，不重新计算风险。提醒不是交易执行保证。

完整规则语义、数据不足处理和通知治理见 [风控与通知说明](./risk-and-notifications.md)。

Provider 状态、行情落库和数据质量问题见 [Provider 与数据可靠性](./provider-reliability.md)；Ledger、持仓投影和收益口径见 [Ledger 与收益计算](./ledger-and-performance.md)。

专业 Provider 的能力路由、PIT 财务、额度和授权选择见 [数据源选择与专业 Provider](./provider-selection.md)。

## Strategy 与 Backtest

策略使用版本化 Schema，固定 Universe、信号、止损/止盈、仓位、执行、成本、约束和 Benchmark。A 股回测处理 T+1、涨跌停、停牌、最小交易单位、手续费、印花税和滑点。结果必须区分样本内/样本外，并记录 PIT 和 survivorship limitation。

完整契约、偏差防护、数据完整度和可复现元数据见 [策略与回测](./strategy-and-backtest.md)。

## AI Research

AI 只能调用获准的只读或研究 Tool。关键数字必须能追溯到 Tool citation；Tool 失败会显示 unavailable，不会用零值代替。AI 不得写 Ledger、Position 或 Order，也不得输出自动交易指令。

Provider、Prompt 版本、Agent 分工、Tool 权限和 provenance 规则见 [AI 研究与 Agent 边界](./ai-research.md)。

## Automation

自动化任务包含 cron、timezone、重试策略、锁 TTL、nextRunAt 和执行历史。盘前、盘中、收盘和日报应复用手动 API 的 Market、Portfolio、Risk 和 Report 逻辑。

日志、交易计划、确定性行为指标和反事实回放见 [投资日志与行为分析](./journal-and-behavior.md)。

自动化调度、交易日跳过、日报链路和失败排查见 [自动化与日报运维](./automation.md)。

备份、恢复、Secret 扫描和发布门禁见 [发布、备份与恢复](./release-and-recovery.md)；领域关系与需求追踪见 [Domain Model 总审计](./domain-audit.md) 和 [Spec Traceability](./spec-traceability.md)。
