# V1 灾备与故障恢复报告

> 归档说明（2026-10-14）：本文保留原日期、输入、命令、结果、失败与未覆盖条件，供历史追溯。下文“当前”与状态仅指原记录时点；本次归档不代表未通过验收已完成。现行义务由[当前 Task](../../tasks/README.md)及其 Spec 管理，发布外部门禁仍从[发布门禁记录](../../reviews/2026-08-18-v1.0-release-gate-review.md)进入。


历史证据适用性（2026-10-03）：本报告只证明原记录的版本、输入与环境，不是当前全仓运行态声明。现行接口及任务承接关系见[状态对账 Review](2026-10-03-task-state-reconciliation.md)；原发布/设备/恢复未覆盖义务保留，不因本轮文档对账视为通过。

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
