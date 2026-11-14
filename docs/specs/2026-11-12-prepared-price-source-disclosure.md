# 准备结果披露两套行情来源

实施与验收：[已完成任务](../archive/tasks/2026-11-12-prepared-price-source-disclosure.md)、[验证记录](../archive/evidence/2026-11-12-prepared-price-source-disclosure.md)。

## 行为与范围

- AC1：普通回测与实验准备的成功响应增加可选 `actualPriceSource`，直接返回本次已校验并冻结的不复权参考来源，包含 Provider、上游与主备索引。执行来源继续使用 `actualSource`，不查询当前路由来猜测或补写冻结来源。
- AC2：Desktop 普通准备与实验准备统一显示“后复权来源”“不复权来源”，各自附主源/备用源。非价格研究继续使用原来源含义，未规划原价不展示原价行；旧成功响应有参考窗口但未返回来源时明确提示重新准备。
- AC3：Mobile 使用相同响应，普通准备摘要和实验准备显示两套来源。不新增行情请求，不影响原准备、确认、提交、冻结或历史业务记录。
- AC4：验证来源透传、独立主备索引、旧响应兼容与未规划场景；四宽浏览器覆盖准备卡片，更新本地运行态后验证真实准备响应。

Schemas 拥有响应合同；Backtest 提供已冻结参考来源，StrategyOptimization 透传；客户端消费相同事实。沿用[独立来源](2026-11-12-independent-research-price-sources.md)；不改变路线或数据来源，不调用真实 AI，不创建用户实验或改数据库结构，不提交或推送。
