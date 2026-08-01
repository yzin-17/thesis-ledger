# V1 发布清单

- [x] 当前 Prisma migration 已在 Compose PostgreSQL 部署并通过无 pending migrations；跨快照矩阵仍需 staging 复核。
- [x] Compose 集成 smoke 已重新通过 integrity、Redis 锁互斥与 Snapshot 幂等；Docker Desktop 重启后已复跑数据库/Redis 集成、DSA failover、V1 核心 E2E 与灾备恢复，备份恢复仍需 staging 演练。随后一次重启尝试因 Docker helper 未退出而暂时无法连接 daemon；2026-08-01 多次启动现有应用后 `docker compose ps` 仍返回 `Docker Desktop is unable to start`，host 日志记录 VM 写入 `console.log` 时 `no space left on device`，恢复后需补一次短 smoke，未删除数据卷。
- [x] 隔离 release-candidate E2E 已通过账户、截图、Ledger、Portfolio、行情、Risk、Feishu、AI、Journal、Backtest、日报和 integrity；报告见 `docs/reviews/v1-core-e2e-report.md`。
- [x] 灾备演练已通过隔离 backup/restore、DSA failover 和通知失败重试；生产 staging 演练仍需发布负责人执行。
- [x] Accessibility/responsive 代码级检查已通过；Desktop 浏览器及 Android API 35 模拟器（1080×2400、600×1000）人工验收已归档，iOS 与签名包仍待目标环境复核。
- [x] `pnpm format`、`pnpm security:secrets`、全包 build/typecheck/test、Contract/Regression 通过。
- [x] Provider、Automation、AI、Notification 指标和健康历史 API/桌面运维视图已实现；Compose 故障注入已通过，staging 仍需按同一脚本复核。
- [x] Desktop Vite production 静态构建、Electron 未签名 DMG/Windows NSIS 产物、Onboarding/UI 契约测试、Expo Mobile web bundle 和 Android arm64 APK/AAB 已通过；Android Portfolio/Risk 与 loading/empty/error/stale、小屏人工 checklist 已归档，真实 Desktop Windows 安装、签名和跨端 UI 对照仍待完成。
- [x] `pnpm release:artifacts` 已静态核对 DMG/EXE、APK/AAB 文件、SHA-256、Android JS bundle 和 arm64 单架构内容；该检查不替代签名、安装启动或设备验收。
- [x] V1.0 Desktop 不启用隐式自动更新；更新策略与后续启用条件已记录。
- [x] 依赖许可证扫描已通过并生成 `THIRD_PARTY_LICENSES.md` 与清单；DSA Fork Delta/Upstream Playbook 已完成，移植代码 attribution 和 Known Limitations 仍需人工 Review。
- [x] Spec Traceability 与架构 Review 已记录当前 294 项任务中 290 项完成、4 项外部门禁、owner 和明确遗留门禁；最终版本发布仍需完成剩余发布项。
