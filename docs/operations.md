# 运维与故障排查

## 启动与健康检查

```bash
docker compose up --build -d
curl http://localhost:3000/api/v1/health
```

健康响应分别报告 PostgreSQL、Redis 和 DSA，并声明 Account model、actual/shadow 和 `fund-nav` capability。任一依赖失败时 Server 应返回 `degraded`，并保留其余可用能力；缺少 Fund NAV capability 时不得用 Quote 或截图净值替代。

## 数据库迁移

```bash
pnpm --filter @thesis-ledger/server prisma migrate deploy
pnpm --filter @thesis-ledger/server prisma db seed
```

发布前先备份并在副本演练迁移。账户模型迁移 `20260807100000_account_entry_model` 会先检查账户类型与持仓资产冲突，预检失败必须停止。迁移失败时恢复上一兼容应用和备份；禁止对生产库执行 `migrate reset`。

## Provider 故障

1. 查看 `/api/v1/health` 和 Provider 健康状态。
2. 确认能力、优先级、限额和 credential 状态。
3. 检查数据是否为 `partial` 或 `stale`，不得把旧缓存解释为实时行情。
4. 主源失败时确认 fallback chain；所有来源都失败时保留最后有效值并明确标记陈旧。

## 自动化故障

1. 查询 `/api/v1/automations/history`，按 `traceId` 定位失败。
2. 检查任务是否启用、cron、timezone、nextRunAt 和交易日条件。
3. 查看重试次数与最终错误；永久错误不会无限重试。
4. Redis 锁未过期时重复实例会跳过，避免重复日报或同步。

## 通知未发送

依次检查 RiskEvent 是否触发、severity 是否有渠道、是否处于 quiet hours、cooldown/dedup 是否生效，以及 DeliveryResult 的 `status`、`attemptCount`、`errorCode`。

## 回退原则

- 应用：回退到与当前数据库 schema 兼容的镜像。
- 数据库：优先前向修复；必须恢复时使用发布前备份并执行完整性检查。
- DSA：镜像标签必须绑定 Git commit，不使用不可追溯的 `latest`。
- DSA Contract：确认 `THESIS_LEDGER_DSA_TOKEN` 与 DSA 服务一致，并检查 `/capabilities` 的 `fund-nav.assetSuffix=.OF`；生产配置使用 GHCR digest。
- 数据库迁移：先备份原 `investment_os` 数据库，再恢复并校验到 `thesis_ledger`；Redis 不迁移旧 key，启动后由新命名空间重建缓存。

数据迁移使用 `pnpm migration:thesis-ledger`，需要显式提供 `SOURCE_DATABASE_URL` 和已创建的空 `TARGET_DATABASE_URL`。脚本拒绝源/目标相同或目标非空，不删除旧库；完成后保留 dump 和 checksum，Redis 只通过新命名空间重新生成。
