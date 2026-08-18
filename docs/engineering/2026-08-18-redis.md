# Redis 使用规范

Redis 只保存可重建状态，不是资产事实源。

## Key 命名

统一格式为 `thesis-ledger:<area>:v1:<key>`：

- `cache`：行情和计算缓存，必须设置 TTL；Quote 默认 30 秒，日线默认 24 小时。
- `queue`：任务队列内部键，由队列适配器维护。
- `lock`：分布式锁，必须设置 TTL、持有者 token，并在释放前核对 token。
- `pubsub`：瞬时事件通知，不承诺投递。

测试键必须包含 `test:<runId>`，通过 `RedisService.clearTestNamespace(runId)` 定向清理，禁止 `FLUSHALL`。
