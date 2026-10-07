# S01 路由配置持久化核验

当前 `market-control.service.test.ts` 19 项通过，验证 V3 Desired 保存与旧 V2 raw 保留、partial 目录拒绝 Apply、严格 Desired/Effective 身份与 revision、一致才标记 applied、显式重试重读目录、非法提交不推进修订、同 revision 并发冲突、历史回滚和 Provider 移除不隐式删除凭据。

源码对账：`persistMarketPolicyRevision` 在事务内先对现有 consumer 行 FOR UPDATE，再核对修订及内容；V3 使用独立 routesV3 并保留 legacyV2Routes，不从复权路由推导旧 raw 选择。保存后首先标记未应用；`market-policy-catalog` 按精确能力目录与资格决定是否 Apply，partial/不可用保留诊断；响应中的 sourceDesiredRevision、目标顺序与身份匹配后才持久 applied。`marketPolicyResponse` 根据 revision 与 syncState 计算 effectiveStale。

共享 Schema 已通过完整 330 项检查，RouteKey 包含价格口径，主备数量与重复目标被拒绝。C02/C04 前置项、S02 结构交付均已完成；该功能复用现有 Policy JSON 字段，本轮没有新增结构或迁移。

S01 的服务端保存、校验与读回范围通过。并发测试使用受控事务替身，不能作为真实数据库锁竞争或目标用户操作证据；这些集成层仍归各自门禁。本轮没有操作目标策略、凭据或业务数据。

S07 的诊断/预检/准备已有当前 backtest 全目录通过证据，但其 S04/S05 前置项仍开放，本轮不关闭 S07，也不新增重复预检快照或模型调用。
