# 数据库备份与恢复工具

正式入口为 `bash scripts/backup-db.sh [目录]` 与 `bash scripts/restore-db.sh <文件.dump>`。恢复从自身路径定位源码，依赖 Node.js 24、可读取备份的 `pg_restore` 及 `psql`；无需先构建 Server。连接由 `DATABASE_URL` 提供，不自动加载相邻仓库的凭据。

## 默认预检

```sh
bash scripts/restore-db.sh /absolute/path/backup.dump
```

必须同时存在 `backup.dump.sha256`，摘要格式沿用备份入口。预检检查 SHA-256、归档目录中的全部预期表和实际数据库/owner 身份，输出当前源码 head、预期表数与活动连接数；不执行恢复或其他数据库写入。Prisma 专用的 `?schema=public` 会在调用 PostgreSQL 客户端前移除，其他 schema 被拒绝。

结构定义复用 Server 的 `database-structure.ts`，由全部 migration SQL、Prisma Schema 与 `raw-owned-tables.json` 派生。预检通过不保证备份里的 SchemaVersion 正确；版本在恢复事务末尾检查。

## 显式恢复

恢复仅接受可信且与当前源码结构一致的 custom-format 备份。先保留目标当前快照，经正式维护入口停止 Server、全部 Worker 及其他消费者，再核对实际数据库名和 owner。连接用户必须为数据库 owner；有其他连接时拒绝恢复，不自动断开它们。

```sh
bash scripts/restore-db.sh /absolute/path/backup.dump \
  --apply --confirm-database <实际数据库名> --confirm-owner <实际owner>
```

`--apply` 会替换备份内的 `public` 对象和数据。恢复 SQL、全部预期表检查及当前 SchemaVersion 检查在同一事务执行，失败整体回滚；缺少预期表的备份在写入前拒绝，避免目标残留表掩盖缺表。临时 SQL 在成功或失败后删除。脚本不自动升级历史备份、不运行应用 E2E，也不操作容器、卷或消费者。

该能力不是正式发布的保留数据升级流程。应用角色权限、目标运行态健康、队列及业务验收需要按对应发布/运维任务单独验证，不能从结构校验推断通过。

## 验证入口

- `pnpm test:database-tools`：默认不写入、checksum、目标确认、活动连接、缺表和事务清理合同。
- `node scripts/database/test-restore-postgres.mjs`：维护脚本自建唯一名称的 PostgreSQL 17 临时容器，实际执行全部 migration、当前备份恢复、错误版本回滚与缺少 raw-owned 表拒绝；只清理自身容器和临时文件，使用 tmpfs，不挂载业务数据库卷。需要本机已有 `postgres:17-alpine` 镜像，CI 由已有拉取步骤准备。

隔离验收不接受业务目标参数，并使用固定隔离连接覆盖环境中的 `DATABASE_URL`。执行 Docker 操作仍须遵守工作区规则。
