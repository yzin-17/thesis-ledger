# 复盘研究任务的失租恢复归属

真实目标故障验收中，`journal-review-v2` 任务已有一个 SDK 请求处于 `dispatching`。Server 重启后，恢复逻辑只把 `research-v1` 识别为研究任务，将复盘任务按通用任务重新排队并领取为 attempt 2，最后记录 `research_execution_failed`。现行 SDK 发送门禁仍阻止第二次请求，但恢复终态与审计语义不正确。

## 归属与状态机

研究归属由 AI 自己维护的 SDK contract `research` 或冻结研究版本 `frozen-research-v1` 识别，兼容旧 `research-v1`，不由 Journal 的 prompt 名称决定。AI 不得反向依赖 Journal 或硬编码其 prompt 清单。

恢复先查询过期研究任务并按现有 SDK 状态判断：只有尚未发送的 prepared 请求，或明确收到生成前拒绝且预算允许时才重排；dispatching、未知、无效状态均终止为 `research_unknown_outcome`。终态提交仍带运行 ID、running、原 attempt 和过期租约条件。研究候选 ID 必须排除在通用恢复与次数耗尽路径之外，避免再次领取。JSON 条件只用于正向查询，避免数据库 NULL 与否定条件导致通用任务被遗漏。

## 执行、消费与部署

只修改 AI 恢复选择条件及回归，复盘消费者继续显示服务端稳定错误码。保留真实失败验收运行及既有报告，不改写历史终态。验证按定向单元、隔离 PostgreSQL、Server 类型检查与构建、边界门禁、官方代码同步和目标故障复验分阶段执行。新目标复验只使用标记账户，保护 Ledger、默认模型、旧报告和 Worker；未执行的门禁保持开放。
