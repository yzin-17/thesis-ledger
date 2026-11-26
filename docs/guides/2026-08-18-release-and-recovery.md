# 发布、备份与恢复

## 备份与恢复

`bash scripts/backup-db.sh [目录]` 使用 `pg_dump --format=custom` 生成带应用版本和 UTC 时间的备份，并写入 SHA-256 校验文件。`bash scripts/restore-db.sh <文件.dump>` 默认只检查 checksum、归档预期表及 `DATABASE_URL` 的实际数据库/owner，输出预检报告，不写入数据库。依赖 Node.js 24、`pg_restore` 和 `psql`，具体合同见[数据库工具说明](../../scripts/database/README.md)。

显式恢复必须先保留目标当前快照，经正式维护入口停止 Server、全部 Worker 及其他消费者，再执行 `bash scripts/restore-db.sh <文件.dump> --apply --confirm-database <实际数据库名> --confirm-owner <实际owner>`。连接用户必须为数据库 owner；未精确确认或仍有其他连接时拒绝恢复。仅接受与当前源码结构一致的可信备份，替换备份内的 `public` 对象和数据；恢复与 Prisma/raw-owned 全表及当前 SchemaVersion 检查位于同一事务，错误会整体回滚。

脚本不执行 Prisma migration、应用 integrity check 或核心 E2E，不自动停止消费者、不操作 Docker volume。恢复后应按对应运维任务独立验证应用角色权限、Server/Worker、队列、健康与业务功能，再决定恢复服务；结构通过不能代替这些验收。历史版本升级和正式发布的保留数据迁移需要另行准备兼容、备份与回滚流程。

备份保留策略由部署环境设置：至少保留最近 7 个日备份、4 个周备份和 3 个版本备份。DSA 镜像使用 `DSA_VERSION` 标签，应用与 migration 版本必须一起记录；出现兼容问题时先回滚应用到上一版本，再按 migration 兼容矩阵恢复数据。

## 安全与运维检查

`pnpm security:secrets` 扫描仓库中的常见 API Key、私钥和飞书 Webhook；Provider 凭证只通过加密引用/环境变量进入服务，日志不打印 Secret。`/api/v1/metrics` 提供 API、Provider、Job、Import、Notification、AI 和 Backtest 需要的计数/延迟指标，`/api/v1/providers/health/history` 提供健康历史。

Error Tracking 通过可选的 `ERROR_TRACKING_URL` 接入；未配置时完全关闭。事件只包含 `release`、`environment`、`traceId`、`operation`、`errorCode` 和 HTTP status，不上传 Portfolio、请求体或凭证。

发布前必须完成 migration deploy、backup/restore 演练、integrity check、Contract/Regression 测试、Desktop build、文档和 known limitations Review。未完成真实外部资源（DSA fork、真实 Webhook、跨平台签名、浏览器/移动端人工验收）必须列在 release notes，不得伪装为通过。

## Desktop 更新策略

V1.0 不启用隐式自动更新。Desktop 只发布带版本号的安装包，用户通过发布页或组织内分发渠道手动安装；启动时可以提示新版本，但不会在后台下载、替换或重启。后续若启用自动更新，必须先固定更新源、签名校验、版本兼容矩阵、失败回滚和禁用开关，并补充更新演练记录。
