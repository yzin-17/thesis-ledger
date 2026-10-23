# AI 历史价格和旧客户端保留验收

状态：2026-10-21 完成并归档。接续[原配置 Task](../../tasks/2026-09-21-ai-provider-model-usage-configuration.md) AC-12/27，合同为[原 Spec](../../specs/2026-09-21-ai-provider-model-usage-configuration.md)中“历史任务和历史费用不被当前价格重算”。完整结果见[回执](../../tasks/evidence/2026-10-21-ai-provider-history-preservation.md)。真实模型暂停，DG3 TODO，只验 Web。

- [x] H1 既有隔离 HTTP 栈、真实 PostgreSQL 和实际执行状态存储建立并结算合成历史，SDK 调用为零；冻结价、预留及费用明确区分。
- [x] H2 正常改价、显式 legacy 迁移、旧客户端省略价格和删除配置四项通过；历史原始 JSON、冻结价格、计量修订、详情及费用 HTTP 保持。
- [x] H3 最终 Server 类型、新文件零告警 lint 和格式通过；正式 PostgreSQL 维护入口四项真实通过，专用容器清理；生产输入未变，复用已有构建和部署。
- [x] H4 原 AC-12/27 按证据层级对账；目标没有 AI 历史，正向历史属于隔离库，合成费用不冒充真实支出。继续其他可执行叶，总 Goal 未完成。
