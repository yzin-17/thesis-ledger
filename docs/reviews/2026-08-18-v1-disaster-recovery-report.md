# V1 灾备与故障恢复报告

## 演练范围

本报告使用可清理的隔离目标验证恢复，不删除开发库：

1. `pnpm disaster:recovery` 使用 PostgreSQL custom-format dump、SHA-256 校验和 `pg_restore` 恢复到临时数据库。
2. `pnpm provider:failover --allow-service-stop` 预热 DSA Quote 后停止 DSA，验证健康状态降级、last-valid stale fallback、DataQuality 记录和恢复。
3. `pnpm v1:e2e` 让测试 Feishu Webhook 首次返回 503，验证 NotificationDelivery 进入 `retrying`，第二次投递成功并记录 `delivered`。

## 结果

| 演练                  | 结果 | 证据                                                                         |
| --------------------- | ---- | ---------------------------------------------------------------------------- |
| 数据库备份与恢复      | 通过 | custom dump、checksum、3 个账户、1 条 Ledger、5 个 Snapshot、15 条 migration |
| DSA 不可用            | 通过 | `degraded → degraded → down`，Quote `stale=true`，恢复后 `healthy`           |
| Provider 主源故障降级 | 通过 | Provider health history 与 DataQuality issue 均保留                          |
| 通知失败与重试        | 通过 | 第一次 HTTP 503 为 `retrying`，第二次为 `delivered`                          |

所有临时数据库、容器和 dump 文件均在脚本退出清理阶段删除；开发数据库未被删除或回滚。

## 剩余发布边界

生产环境仍需由发布负责人在 staging 执行一次真实停写、备份、恢复和通知凭证演练；本报告是本地 Compose 的可重复证据，不替代生产审批。
