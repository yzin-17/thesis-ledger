# 提供方健康记录维护

健康历史使用共享 Schema 校验当前验证事件、授权操作事件和独立探测事件。普通健康检查的详情为空。独立探测保留自身结果，不会成为当前用途验证凭证。

## 开发库旧记录转换

从主仓目录执行。先构建共享 Schema，再查看只读计划：

```sh
pnpm --filter @thesis-ledger/schemas build
node scripts/local-runtime/provider-health-record-maintenance.mjs --target thesis-ledger-dev
```

仅处理旧 `ai_provider_test` 记录。必要事实齐全且归因一致时转换为 `ai_provider_probe`；其他旧记录删除。转换保持原主键、提供方、时间、延迟、顶层状态、用量、费用和配置指纹。

事务演练验证逐行原值冲突、集合冲突及整笔回滚；实际执行先保存受影响原件。每次指定全新的绝对目录，该目录必须位于主仓 `.recovery-artifacts/` 或 infra `.maintenance-backups/` 内。

```sh
node scripts/local-runtime/provider-health-record-maintenance.mjs --target thesis-ledger-dev --mode rehearse --output /绝对路径/thesis-ledger/.recovery-artifacts/health-records-rehearse
node scripts/local-runtime/provider-health-record-maintenance.mjs --target thesis-ledger-dev --mode apply --output /绝对路径/thesis-ledger/.recovery-artifacts/health-records-apply
```

执行前核对真实容器的项目、服务、健康状态及数据库名称、owner。事务锁定健康检查表，核对原集合和原值；SQL 发生错误立即停止并回滚，非目标记录摘要必须一致。备份为权限受限的 `before.json`，结果为 `report.json`；它们不进入 Git。

完成后再次执行默认计划，确认旧记录为零；通过真实健康历史 API 全部分页校验及页面读取验证结果。若有独立测试代码仍写旧事件，应先完成对应应用代码更新。运行态更新遵循 infra 的 `sync-code.sh` / `update.sh` 正式入口。
