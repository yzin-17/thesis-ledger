# AI 研究与 Agent 边界

## Provider、Prompt 与成本

AI Provider 通过 `AiProviderRegistry` 注册模型列表、baseURL、能力、健康状态和输入/输出成本。Model Routing 先按偏好 Provider 选择，失败后按同模型候选顺序 fallback；Provider 变化不会改变 Tool 或 Agent 契约。

`PromptVersionRegistry` 为 system、research、critic 和 report prompt 保存版本历史。每次 `AiRun` 记录实际 provider、model、promptVersion、上下文、checkpoint、token、成本和时长；Tool 调用另外保存权限、参数摘要、来源时间和可用时间，API Key 不进入日志。Decision Log 记录研究问题、假设、结论和 provenance，可按标的查看时间线。

## Tool 权限与证据链

AI 只可以调用 `market:read`、`portfolio:read`、`risk:read`、`journal:read`、`financials:read`、`news:read`、`announcements:read` 和 `backtest:run`。没有权限的 Tool 在执行前拒绝；失败返回 `unavailable`，不会用零值伪造结果。财务、新闻和公告结果必须保留 provider、publishedAt/availableAt、fetchedAt 等时序字段。

`runBacktest` 只能通过 Backtest Worker 契约提交任务并返回 job/result ID，不能执行任意代码。`getJournal` 与 `getRiskHistory` 接收 account/symbol 范围，不能跨账户读取事实。

## Agent 分工与安全门

Research Agent 负责收集行情、技术、筹码、财务、新闻/公告证据，输出 evidence 和 hypothesis；Risk Critic 只读原始证据，主动列出数据缺口、反例和假设脆弱点；Portfolio Context 将研究与真实仓位、集中度和风险历史关联；Final Composer 聚合结论、证据、风险和限制。

Portfolio Gate 在缺少关键数据或出现执行指令时 fail closed。`validateGroundedAnalysis` 要求每个 evidence 有 citation，且结论中的关键数字能在证据中找到；报告固定声明仅供研究参考，不生成买卖订单。Checkpoint 写入 `AiRun`，进程恢复时从最近步骤继续。

桌面端研究助手支持 portfolio、account、position、strategy 四类上下文，并展示运行的 provider/model、prompt 版本和来源链入口。真实模型连接与人工视觉验收需在运行环境中补做。
