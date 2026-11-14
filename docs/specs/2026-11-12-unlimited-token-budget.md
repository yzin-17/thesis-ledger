# 实验 Token 累计预算支持零值不限额

实施与验收：[已完成任务](../archive/tasks/2026-11-12-unlimited-token-budget.md)、[验证记录](../archive/evidence/2026-11-12-unlimited-token-budget.md)。

## 行为与验收

- AC1：输入、输出 Token 上限显式整数 `0` 表示不限制实验累计 Token 用量；正数范围、默认值保持原样。空值、负数、小数等非法输入继续拒绝。
- AC2：公共合同、Desktop 两个创建入口与 Mobile JSON 输入原样传递零值。原子预留、实际用量校正及 SDK 持久化结算均识别零值，继续累计实际用量，不生成误报的超预算终态。
- AC3：输出 Token 不限额时不把零值传给 SDK 的单次输出上限，也不从实验预算派生单次限制；单次执行沿用模型及 Provider 的配置。账务仍使用正数的保守预估预留，返回后以实际用量结算。有限预算继续按原逻辑分配单次上限。
- AC4：调用次数、回测次数、费用、时长、轮数、取消及终态门禁保持独立生效。隔离 PostgreSQL 覆盖零值累计、有限并发边界及用量结算；本地 Provider 验证真实请求没有零值单次上限；四宽受控浏览器验证零值、空值和原提交重试。

## 边界

延续[创建校验](2026-11-11-experiment-create-validation.md)及[调用次数零值](2026-11-12-unlimited-ai-call-budget.md)。Schemas 拥有合同，StrategyOptimization 拥有预留和结算，客户端消费共享边界。不修改真实实验或数据库结构，不调用外部模型，不改变模型配置和默认预算，不提交或推送。
