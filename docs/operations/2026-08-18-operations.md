# 运维与故障排查

## 启动与健康检查

```bash
cd ../thesis-ledger-infra
test -f .env || cp .env.example .env
docker compose --env-file .env -f compose.yml -f compose.dev.yml up --build -d
curl http://localhost:3000/api/v1/health
```

健康响应分别报告 PostgreSQL、Redis 和 DSA，并声明 Account model、actual/shadow 和 `fund-nav` capability。任一依赖失败时 Server 应返回 `degraded`，并保留其余可用能力；缺少 Fund NAV capability 时不得用 Quote 或截图净值替代。

## 数据库初始化与 Schema 版本

```bash
docker compose --env-file .env -f compose.yml -f compose.dev.yml exec thesis-ledger sh -c 'cd apps/server && ./node_modules/.bin/tsx prisma/seed.ts'
```

数据库结构由主仓排序后的全部 SQL 输入定义，包含 Prisma model 与 raw-owned 表。空卷初始化只能解决首次安装，已有卷必须显式处理结构差异；PostgreSQL 进程健康不代表业务结构就绪。应用使用 app role，结构安装与权限初始化由独立 owner 执行。

开发阶段可显式接受历史数据丢失并重建指定数据库的 `public` schema，保留 external volume；该流程使用全部 SQL 作为结构输入，不维护 Prisma 迁移历史。已验收设计见 [归档规格](../archive/specs/2026-09-14-dev-database-rebuild.md)，部署证据见 [验证记录](../reviews/2026-09-14-dev-database-rebuild.md)，操作入口以 infra 运维说明为准。未开启重建时应保留数据，并在结构不匹配时停止更新。

正式发布需要独立的保留数据升级流程、备份与隔离演练，完成结构与权限校验后再发布匹配的版本标记。开发重建不能作为正式发布的升级入口；本主题未实现或验证正式环境的 Prisma Migrate 升级。禁止脚本或 entrypoint 自动删除卷。

## Provider 故障

1. 查看 `/api/v1/health` 和 Provider 健康状态。
2. 确认能力、优先级、限额和 credential 状态。
3. 在 Provider 健康历史中区分 `manual`、`scheduled` 和 `delivery` 来源。
4. 检查数据是否为 `partial` 或 `stale`，不得把旧缓存解释为实时行情。
5. 主源失败时确认 fallback chain；所有来源都失败时保留最后有效值并明确标记陈旧。

DSA 定时检查间隔由 `PROVIDER_HEALTH_CHECK_INTERVAL_MS` 控制，默认 1 小时。健康历史接口支持 `page` 和 `pageSize` 分页参数，桌面端默认每页显示 20 条。Feishu Webhook 不进行无副作用的定时探测，优先查看手动测试和实际通知投递结果。

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
- 数据库切换：正式环境先备份并演练保留数据升级；开发环境按显式重建契约操作指定数据库，保留 PostgreSQL external volume。Redis 缓存切换需单独评估，数据库重建不授权清理 Redis volume。

开发重建不保留或导入旧业务数据。正式升级仍需独立发布验收，不能用开发空库重建结果代替。
