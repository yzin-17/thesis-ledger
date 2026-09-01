# Spec 追踪矩阵

## 已覆盖

- 账户、截图导入、统一行情 Contract、Provider fallback、健康和数据质量：V0.1/V0.2 服务、契约测试和桌面入口。
- Ledger 事实源、Position 投影、现金/公司行动、TTWROR/XIRR、三层 Performance：V0.3 服务、迁移命令和 domain 回归。
- Risk scope/context、规则版本、筹码/组合风险、通知去重与摘要：V0.4 Rule Engine、Audit、Notification 和 Risk Center。
- Strategy Schema、A 股执行、PIT/bias、Worker、OOS、Benchmark、analytics、复现 metadata：V0.5 domain/server 测试。
- AI Provider/Prompt/Tool 权限、Agent 分工、Provenance、Decision Log、Checkpoint：V0.6 服务、Schema 和测试。
- Journal/TradePlan、行为证据、Counterfactual、自动化工作流、专业 Provider 插件：V0.7–V0.9 服务和测试。
- DSA Fork/upstream 零差异审计、同步演练、行情/组合风险/通知/ToolSurface 能力证据和筹码算法固定 fixture：Phase 0/V1 Review 文档已归档。

## 明确未完成的外部验收

真实 Provider 凭证和分钟回填、真实飞书 Webhook、Desktop/iOS 目标平台签名与 release、完整浏览器/设备 UI E2E、全新用户 onboarding 仍需外部资源或可运行环境；同一隔离测试账户的 Desktop/Mobile Portfolio、Risk 和状态对照已完成并归档。PostgreSQL/Redis Compose 集成、灾备和隔离 E2E 已在 Docker Desktop 重启后重新通过；Android release APK/AAB 已安装并在 API 35 ATD 模拟器完成 Portfolio/Risk 与状态 smoke，iOS archive 仍受 Xcode `DVTDownloads` 系统框架版本不匹配阻塞。剩余对应任务保持未勾选，不能用单元测试替代。

本轮 V1 门禁结论详见 `docs/reviews/2026-08-18-v1.0-release-gate-review.md`；本地可验证项已完成，外部项未被伪装成通过。
