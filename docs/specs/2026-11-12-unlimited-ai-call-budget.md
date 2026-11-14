# AI 调用次数支持零值不限额

实施与验收：[已完成任务](../archive/tasks/2026-11-12-unlimited-ai-call-budget.md)、[验证记录](../archive/evidence/2026-11-12-unlimited-ai-call-budget.md)。

## 行为合同

- AC1：`budget.maxAiCalls` 显式整数 `0` 表示不限制累计 AI 调用次数；正数仍为 1–30，并检查足以覆盖模型数与轮数。空值、负数、小数和超出正数范围的值仍拒绝。
- AC2：表单、公共合同、准备后提交和持久化原样保留 `0`。后台原子准入绕过零值次数比较，继续累计真实次数；有限额度的并发边界保持原样。
- AC3：Token、费用、时长、取消、轮数和终态继续按各自设置生效。不限制次数且输出 Token 有限时，单次输出 Token 预留按模型数乘轮数分配，避免按零次除法或预留全部输出额度阻断其他模型。Token 零值规则见[累计 Token 不限额](2026-11-12-unlimited-token-budget.md)。
- AC4：Desktop 和 Mobile 就近说明零值语义。四宽受控浏览器验证零值提交、空值拒绝及原提交重试；隔离 PostgreSQL 验证原子累计与其他限制。

## 所有权与边界

Schemas 拥有预算合同，StrategyOptimization 拥有累计准入和 Token 预留，客户端消费公共边界。沿用[实验创建校验](2026-11-11-experiment-create-validation.md)和已有回测零值合同；不改变默认值，不扩展其他预算的零值含义，不触发真实 AI 或用户实验，不修改数据库结构，不提交或推送。
