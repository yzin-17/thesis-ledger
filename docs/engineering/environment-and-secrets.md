# 环境变量与 Secret

`.env.example` 是配置键清单，不包含可用凭证。生产 Secret 由部署平台注入，不写入数据库明文、日志、错误响应或镜像层。

Server 启动时通过 Zod 校验 `DATABASE_URL`、`REDIS_URL` 和 `DSA_BASE_URL`；缺失或格式错误会立即失败，并只报告字段名。`AI_API_KEY`、Provider Token、飞书 Webhook 和 `CREDENTIAL_ENCRYPTION_KEY` 在日志中只允许记录“已配置/未配置”。Provider 凭证使用 AES-256-GCM 加密，主密钥必须来自环境变量或外部 Secret Manager。

`PROVIDER_HEALTH_CHECK_INTERVAL_MS` 是非敏感的定时健康检查间隔配置，默认 1 小时（`3600000` 毫秒）；它不包含凭证，不应被当作 Secret 管理。

浏览器跨源访问只通过 `CORS_ORIGINS` 配置允许的来源，生产环境不得使用通配符；本地 Expo Web 可在 `.env.example` 的开发端口上显式配置。Docker Desktop 构建/运行前需保留足够宿主机磁盘空间；内容存储出现 I/O 或空间错误时先恢复 Docker，再重跑 Compose 运行态门禁，不得把历史通过记录当作当前健康状态。

提交前执行 Secret Scanner，并人工检查 `.env*`、日志 fixture 和截图 Ground Truth。发现泄漏时先吊销并轮换凭证，再清理历史；仅删除当前文件不视为完成。
