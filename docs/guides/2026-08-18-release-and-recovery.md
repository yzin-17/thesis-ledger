# 发布、备份与恢复

## 备份与恢复

`bash scripts/backup-db.sh [目录]` 使用 `pg_dump --format=custom` 生成带应用版本和 UTC 时间的备份，并写入 SHA-256 校验文件。`bash scripts/restore-db.sh <文件.dump>` 会先校验 checksum，再恢复到 `DATABASE_URL`，执行 Prisma migration，最后运行 integrity check 与核心 E2E。生产恢复前必须停写、保留当前数据库快照并记录 traceId；脚本不会自动删除未知目标数据库。

备份保留策略由部署环境设置：至少保留最近 7 个日备份、4 个周备份和 3 个版本备份。DSA 镜像使用 `DSA_VERSION` 标签，应用与 migration 版本必须一起记录；出现兼容问题时先回滚应用到上一版本，再按 migration 兼容矩阵恢复数据。

## 安全与运维检查

`pnpm security:secrets` 扫描仓库中的常见 API Key、私钥和飞书 Webhook；Provider 凭证只通过加密引用/环境变量进入服务，日志不打印 Secret。`/api/v1/metrics` 提供 API、Provider、Job、Import、Notification、AI 和 Backtest 需要的计数/延迟指标，`/api/v1/providers/health/history` 提供健康历史。

Error Tracking 通过可选的 `ERROR_TRACKING_URL` 接入；未配置时完全关闭。事件只包含 `release`、`environment`、`traceId`、`operation`、`errorCode` 和 HTTP status，不上传 Portfolio、请求体或凭证。

发布前必须完成 migration deploy、backup/restore 演练、integrity check、Contract/Regression 测试、Desktop build、文档和 known limitations Review。未完成真实外部资源（DSA fork、真实 Webhook、跨平台签名、浏览器/移动端人工验收）必须列在 release notes，不得伪装为通过。

## Desktop 更新策略

V1.0 不启用隐式自动更新。Desktop 只发布带版本号的安装包，用户通过发布页或组织内分发渠道手动安装；启动时可以提示新版本，但不会在后台下载、替换或重启。后续若启用自动更新，必须先固定更新源、签名校验、版本兼容矩阵、失败回滚和禁用开关，并补充更新演练记录。
