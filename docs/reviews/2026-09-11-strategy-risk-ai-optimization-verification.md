# 策略风险与 AI 优化验证记录

> 日期：2026-09-11  
> 对应任务：`2026-09-09-strategy-risk-ai-optimization`  
> PR：#35  
> 状态：验证中

## 当前实现基线

本次增量复用统一回测 V2、`StrategyVersion`、`BacktestJob`、`AiRun` 与现有风险事件体系，不新增第二套回测引擎或 AI 平台。

已落地的边界包括：

- 策略风险规则编译、来源追溯、冻结计划、四态评价与显式账户应用；
- AI 提案参数白名单、严格 Provider + Model 路由、不可变候选、真实 V2 开发/验证/测试回测；
- 基准与候选数据 Artifact 指纹一致性门禁，测试集锁定后才揭示；
- 调用次数、回测次数、费用与最长运行时长预算，取消、租约恢复、超时 `unknown_outcome` 与无改善停止；
- 多 AI Provider 配置、Desktop 实验工作区、候选比较、封存测试、正式采纳和风险规则差异预览；
- `STRATEGY_RISK_APPLICATIONS_ENABLED` 与 `STRATEGY_AI_OPTIMIZATION_ENABLED` 独立回退开关。

## 验证原则

- CI 必须通过 lint、typecheck、tests、build、contract tests、migration matrix、complexity guardrails 与 Android native build；不通过提高阈值或新增 ignore 绕过。
- Fixture 用于确定性契约、隔离与故障测试；不会冒充外部在线 Provider 验证。
- 外部模型是否在线属于部署能力状态。产品实现完成度与某个 Provider 临时不可用分开记录；真实外部模型 smoke 只有在部署环境已配置授权凭证时执行，不在仓库或 CI 中写入密钥。
- 正式采纳与实际风险启用保持两次显式用户动作；测试与优化过程不得写真实 Ledger 或自动交易。

## CI 证据

最终证据在 PR #35 收口后补充。