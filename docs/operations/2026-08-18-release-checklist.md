# 发布检查清单

本文件是可复用的发布前检查模板，不记录某次发布的执行结果。具体发布证据、失败记录和一次性环境信息应写入 `docs/reviews/`；历史发布记录归档到 `docs/archive/reviews/`。

## 版本与数据库

- [ ] 已确认发布版本、Git commit、镜像 tag/digest 和目标环境一致。
- [ ] 当前数据库 baseline / migration 与应用版本匹配，无未解释的 schema 漂移。
- [ ] 发布前备份已完成，并保留 checksum、版本和恢复入口。
- [ ] 若涉及数据库结构变化，已完成隔离 fresh 演练或批准的升级/重建演练。

## 质量门禁

- [ ] 格式、Lint、Typecheck、单元测试和关键 Contract/Regression 测试通过。
- [ ] `pnpm security:secrets` 或等价 Secret 扫描通过。
- [ ] 数据完整性、核心 Portfolio/Ledger/Trade/Journal 路径已完成与本次变更风险相称的验证。
- [ ] 相关架构/边界 Guardrail 通过，没有新增未解释的反向依赖或生成物污染。

## 运行时与外部依赖

- [ ] PostgreSQL、Redis、DSA/Provider 等必要依赖健康状态符合发布要求。
- [ ] 涉及外部 Provider、Webhook、Worker、Scheduler 或通知时，已完成对应真实环境验收；未完成项明确标记为发布门禁或 Known Limitation。
- [ ] 涉及 Desktop/Mobile 原生能力时，已完成目标平台构建；需要安装、签名或设备验收的项目有明确状态。
- [ ] 不把静态检查、Mock 或未签名构建结果表述为真实线上/设备验收。

## 发布与回滚

- [ ] 已确认发布步骤、负责人、维护窗口和观察指标。
- [ ] 已确认应用回滚版本与当前数据库 schema 兼容。
- [ ] 数据库恢复或卷重建仅使用已批准流程，不执行未授权的 destructive reset。
- [ ] DSA / Provider / 基础设施版本可追溯，不使用不可确认来源的 `latest` 作为发布证据。

## 发布后检查

- [ ] 服务健康检查通过，关键 API、任务和投影无异常。
- [ ] 关键指标、错误日志和通知/自动化历史无新增阻断问题。
- [ ] 必要的 Smoke / E2E 已在目标环境执行。
- [ ] 发布结果、未完成门禁、回滚信息和验证证据已写入对应 Review。

## 证据记录原则

本模板只维护长期检查项，不在这里持续追加某次发布的测试数量、机器故障、截图或临时阻塞。发布完成后，应在 `docs/reviews/YYYY-MM-DD-<release>-release-review.md` 或等价 Review 中记录实际结果；该 Review 失去当前门禁价值后再移入 archive。
