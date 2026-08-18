# V1 核心 E2E 报告

## 执行环境

- 使用 `pnpm v1:e2e` 启动一次临时 Compose Server 容器和临时 PostgreSQL 数据库。
- Redis、DSA 使用当前 Compose 服务；Feishu 使用本地测试 Webhook，验证真实 HTTP 投递和 `delivered` 状态。
- 测试结束后删除临时 Server 容器和数据库，不修改开发库。

## 验证链路

账户创建 → PNG 截图上传与人工确认 → Ledger Adjustment → Portfolio 重建 → DSA Quote → Snapshot 幂等 → RiskRule/ RiskEvent → Feishu 通知 → AI Run/Tool Call → Trade Plan → Journal Entry 与行为复盘 → Strategy/Backtest → 日报 → Integrity。

## 结果

| 检查项              | 结果                                                   |
| ------------------- | ------------------------------------------------------ |
| 截图导入与提交      | 通过                                                   |
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

空数据库首次截图导入时，提交逻辑直接写入 Ledger，因 Asset Master 不存在返回 500。现已在同一事务中先 `asset.upsert`，并补充 Server 回归测试。
