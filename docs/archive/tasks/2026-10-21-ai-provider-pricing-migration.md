# AI 模型价格迁移实施与验收

状态：2026-10-21 完成并归档。对应[Spec](../../specs/2026-10-21-ai-provider-pricing-migration.md)，接续[原配置任务](../../tasks/2026-09-21-ai-provider-model-usage-configuration.md) AC-25/26；结果见[验收回执](../../tasks/evidence/2026-10-21-ai-provider-pricing-migration.md)。主线程执行、保留脏工作区和原数据；真实模型暂停，只验 Web，DG3 TODO。

- [x] M1 状态与规划：纠正依赖归类；完整/已有价格、旧键清理、非法及超限输入均有规则与定向证据。
- [x] M2 执行面：默认只读维护 CLI；显式应用绑定身份和源指纹，事务/条件更新、JSONB 精确复制、审计、幂等均实现。
- [x] M3 隔离数据库：正式脚本的真实 PostgreSQL 九项通过，含两个独立 CLI 进程、精确保留、冲突、幂等、回滚及历史/凭据/默认保护。
- [x] M4 本地门禁：定向 26 项、Server 类型/构建、边界、复杂度、最终受影响文件零告警 lint 和格式检查通过。存量告警及缺失 ratchet baseline 如实保留。
- [x] M5 目标消费：正式最小代码同步通过；两容器实际模块/只读 CLI 一致；三配置均 noop；整个保护 JSON 不变，未制造目标 legacy 样本或发模型请求。
- [x] M6 最终对账：原 AC-25/26 更新为对应条件通过；其他门禁保留。接续 AC-28 非生成并发，总 Goal 继续。
