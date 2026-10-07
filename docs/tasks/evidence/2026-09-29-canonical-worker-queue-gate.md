# 现行 Worker 队列准入证据

## 已实施

- Worker 领取前核对持久化 `mode='V3'`、`contractVersion=3` 与 `schemaVersion='3'`；旧记录返回 `unsupported_contract`，不增加 attempt、不写终态。
- 队列投递在核对前不调用 BullMQ，也不改写旧记录；恢复器仅查询现行模式并再次核对完整合同，避免旧记录被重新投递。
- BullMQ 队列名称改为 `backtest-run`，Server 与 Worker 共用同一常量；旧运输消息留在旧队列，不进入新 Worker。
- 原有旧 Run 服务和内部 V1/V2 执行代码仍存在；本叶仅封闭生产入口、领取和恢复，不能视为执行面删除完成。
- Strategy Optimization 分段执行只解析现行 RunConfig，旧配置在来源预检和预算申请前拒绝；入队唤醒调用现行 Run 入口。旧实验测试 fixture 和其他内部消费者尚待全面核对。

## 本地验证

- 队列定向 6 文件、34 项通过，包含旧合同不投递、不领取、恢复查询过滤、现行 attempt 预算和取消竞态。
- Server `typecheck`、`build`、`scripts/check-boundaries.mjs` 通过。
- Server 包级：233 文件、1827 项通过；25 文件、91 项跳过。旧 V1/V2 durable owner 与重试测试已换为现行合同断言；现行 V3 创建/重试及隔离 PostgreSQL 测试仍由原有测试覆盖。
- Strategy Optimization 分段运行定向 4 项通过，包含旧配置拒绝且不扣预算；修改后的 Server 包级回归 233 文件、1828 项通过，25 文件、91 项跳过。
- 未执行本轮真实 BullMQ/Worker 消费或目标容器验收；此前隔离 Worker 由于 `FUTURE_DATA` 两次失败的记录仍有效，不能用本地测试替代。

## 后续

删除 Server 内部 V1/V2 Runner 与队列兼容分派，迁移 Strategy Optimization 等内部消费者；完成当前 Snapshot 的真实 Worker 闭环后，再按官方 infra 入口更新目标运行态。
