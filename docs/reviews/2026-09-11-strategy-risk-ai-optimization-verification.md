# 策略风险与 AI 优化验证记录

> 日期：2026-09-11  
> 对应任务：`2026-09-09-strategy-risk-ai-optimization`  
> PR：#35  
> 状态：验证中

## 当前实现基线

本次增量复用统一回测 V2、`StrategyVersion`、`BacktestJob`、`AiRun` 与现有风险事件体系，不新增第二套回测引擎或 AI 平台。

已落地的边界包括：

- 策略风险规则编译、来源追溯、冻结计划、四态评价、RiskEvent/通知与显式账户应用；
- RiskCenter 独立展示策略来源应用；策略新版本只提示升级，先看增删改 Diff，再显式确认，不静默覆盖；
- AI 提案参数白名单、严格 Provider + Model 路由、不可变候选、真实 V2 开发/验证/测试回测；
- 基准与候选数据 Artifact 指纹一致性门禁，测试集锁定后才运行，技术失败只允许相同候选与 finalized Snapshot 重试；
- 调用、回测、输入/输出 Token、费用与最长计算时长预算；用户等待最终验证不计入计算时长；
- 多模型按轮次公平推进，无改善通道独立停止；取消、租约恢复、超时/中断保留 `unknown_outcome`；
- Provider 价格表可选：有价格表记录估算和实际费用，无价格表明确为“费用未知”且创建实验需显式确认，不把 0 冒充免费；
- 多 AI Provider 配置、实际模型身份记录、Desktop 实验工作区、候选比较、封存测试、正式采纳和风险规则差异预览；
- 实验克隆继承测试集暴露信息；已揭示测试集不能通过克隆重新包装成新的独立验证；
- `STRATEGY_RISK_APPLICATIONS_ENABLED` 与 `STRATEGY_AI_OPTIMIZATION_ENABLED` 独立回退开关。

## 验证原则

- CI 必须通过 lint、typecheck、tests、build、contract tests、migration matrix、complexity guardrails 与 Android native build；不通过提高阈值或新增 ignore 绕过。
- Fixture 用于确定性契约、隔离与故障测试；不会冒充外部在线 Provider 验证。
- 外部模型是否在线属于部署能力状态。产品实现完成度与某个 Provider 临时不可用分开记录；真实外部模型 smoke 只有在部署环境已配置授权凭证时执行，不在仓库或 CI 中写入密钥。
- 正式采纳与实际风险启用保持两次显式用户动作；测试与优化过程不得写真实 Ledger 或自动交易。
- 固定实验数据采用“Run-owned finalized Snapshot + 分区 Artifact 指纹一致性”作为逻辑 ExperimentDataBundle：不同 Run 保持独占 Snapshot，Server 以基准指纹门禁保证候选读取同一市场事实，不引入第二套共享可变 Snapshot 生命周期。

## 已完成的门禁证据

- PR CI #314：Secret scan、Migration matrix、Contract tests、Complexity guardrails 全部通过。
- PR CI #317：lint、typecheck 已通过；随后暴露的单个 Provider 配置测试断言已按公共错误边界修正。
- 中间失败均按根因修复：没有提高复杂度阈值、没有新增 ESLint/TypeScript ignore、没有放宽迁移或契约门禁。

## 待最终收口

- 以当前最新 PR HEAD 重新执行完整 CI，确认 quality / contracts-and-guardrails / mobile-android-native 全绿。
- 完成 Spec/Task 当前状态与验证证据收敛。
- 外部 Provider 在线 smoke 仅在部署环境实际提供授权凭证时执行；未配置时记录为部署前置检查，不以 Fixture 替代。
- PR 合并后再次确认 `main` push CI 全绿。
