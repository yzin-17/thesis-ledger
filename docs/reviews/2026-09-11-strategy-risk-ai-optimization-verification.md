# 策略风险与 AI 优化验证记录

> 日期：2026-09-11  
> 对应任务：`2026-09-09-strategy-risk-ai-optimization`  
> PR：#35  
> 状态：最终验证中

## 当前实现基线

本次增量复用统一回测 V2、`StrategyVersion`、`BacktestJob`、`AiRun` 与现有风险事件体系，不新增第二套回测引擎或 AI 平台。

已落地的边界包括：

- 策略风险规则编译、来源追溯、冻结计划、四态评价、RiskEvent/通知与显式账户应用；
- RiskCenter 独立展示策略来源应用；策略新版本只提示升级，先看增删改 Diff，再显式确认，不静默覆盖；
- AI 提案参数白名单、严格 Provider + Model 路由、不可变候选、真实 V2 开发/验证/测试回测；
- 基准与候选数据 Artifact 指纹一致性门禁，测试集锁定后才运行，技术失败只允许相同候选与 finalized Snapshot 重试；
- 调用、回测、输入/输出 Token、费用与最长计算时长预算；用户等待最终验证不计入计算时长；
- 多模型按轮次公平推进；进程级模型调用默认全局最多 2 个、同一 Provider+Model 最多 1 个；明确网络传输错误只对原 Provider+Model 重试 1 次，不 fallback；
- 无改善通道独立停止；取消、租约恢复、Timeout/Abort 保留 `unknown_outcome`；
- Provider 价格表可选：有价格表记录估算和实际费用，无价格表明确为“费用未知”且创建实验需显式确认，不把 0 冒充免费；
- 回测评价按真实 V2 Result 保存成交数、fill 数、拒绝数和拒绝原因；`lowTurnover` 模式以换手本身作为排序目标，不再把收益混入低换手分数；
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
- PR CI #334：Secret scan、Migration matrix、Contract tests 通过；Complexity guardrails 精确定位新建主编排 Service 为 639 行，未提高 600 行阈值，已将只读职责拆到 `StrategyOptimizationReadService`，当前主 Service 为 583 行。
- PR CI #348 暴露职责拆分后的单个内部 `compare` 残留调用；已改由 ReadService 返回 finalize 对比结果。
- 新增并发 Gate、网络重试分类、预算/时长、参数白名单、模型严格路由、MonitoringPlan、四态风险评价与评分语义的确定性单元测试。
- 中间失败均按根因修复：没有提高复杂度阈值、没有新增 ESLint/TypeScript ignore、没有放宽迁移或契约门禁。

## 部署能力门禁

以下验证依赖部署环境，而不是仓库功能完成度；未配置时保持 `unavailable`/待验证，不能用 Fixture 冒充：

- 至少一个真实外部 Provider 的网络、鉴权、模型身份和 usage/cost 回传 smoke；双模型比较需要两个严格不同的 Provider+Model 身份实际可用。
- 在线 CN/HK/US 场内与 CN NAV 数据能力 smoke；固定 fixtures 只证明引擎与协议，不证明某个外部行情源当前在线。
- Desktop 浏览器人工视觉/键盘/焦点 smoke；CI 继续负责类型、契约与构建，不把无浏览器环境伪报为已人工验收。

这些部署门禁失败时应限制对应能力，不回写成 `supported`，也不把仓库实现重新标为未完成。

## 待最终收口

- 以当前最新 PR HEAD 执行完整 CI，确认 quality / contracts-and-guardrails / mobile-android-native 全绿。
- 完成 Spec/Task 当前状态与验证证据收敛。
- PR 合并后再次确认 `main` push CI 全绿。
