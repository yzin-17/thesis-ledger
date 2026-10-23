# V1 核心 E2E 报告

> 归档说明（2026-10-14）：本文保留原日期、输入、命令、结果、失败与未覆盖条件，供历史追溯。下文“当前”与状态仅指原记录时点；本次归档不代表未通过验收已完成。现行义务由[当前 Task](../../tasks/README.md)及其 Spec 管理，发布外部门禁仍从[发布门禁记录](../../reviews/2026-08-18-v1.0-release-gate-review.md)进入。


历史证据适用性（2026-10-03）：本报告只证明原记录的版本、输入与环境，不是当前全仓运行态声明。现行接口及任务承接关系见[状态对账 Review](2026-10-03-task-state-reconciliation.md)；原发布/设备/恢复未覆盖义务保留，不因本轮文档对账视为通过。

## 执行环境

- 使用 `pnpm v1:e2e` 启动一次临时 Compose Server 容器和临时 PostgreSQL 数据库。
- Redis、DSA 使用当前 Compose 服务；Feishu 使用本地测试 Webhook，验证真实 HTTP 投递和 `delivered` 状态。
- 测试结束后删除临时 Server 容器和数据库，不修改开发库。

## 验证链路

账户创建 → 持仓草稿审核与提交 → Ledger Adjustment → Portfolio 重建 → DSA Quote → Snapshot 幂等 → RiskRule/ RiskEvent → Feishu 通知 → AI Run/Tool Call → Trade Plan → Journal Entry 与行为复盘 → Strategy/Backtest → 日报 → Integrity。

## 结果

| 检查项              | 结果                                                   |
| ------------------- | ------------------------------------------------------ |
| Ledger/Portfolio    | 通过，`600519.SH` 数量 10                              |
| DSA 行情            | 通过，Provider `dsa`                                   |
| Snapshot 幂等       | 通过                                                   |
| RiskEvent           | 通过                                                   |
| Feishu 测试 Webhook | 先返回 503 进入 `retrying`，再次投递后状态 `delivered` |
| AI provenance       | 通过，保存 Run 与 Quote Tool Call                      |
| Journal/Trade Plan  | 通过                                                   |
| Backtest            | 通过，状态 `succeeded`                                 |
| 完整性检查          | 通过，`healthy=true`                                   |

完整输出包含临时数据库名、Account、Import、Risk、Notification、AI、Strategy、Backtest 和 Automation ID；临时数据已在退出清理阶段删除。测试 Webhook 收到失败和重试两次请求。

## 发现并修复

空数据库首次提交持仓草稿时，提交逻辑直接写入 Ledger，因 Asset Master 不存在返回 500。现已在同一事务中先 `asset.upsert`，并补充 Server 回归测试。
