# 工具维护索引

本目录维护工程门禁、业务验收、发布与运行辅助工具。详细分类见[审计快照](../docs/reviews/2026-11-15-scripts-maintenance-audit.md)和[逐文件清单](../docs/reviews/2026-11-15-scripts-maintenance-inventory.md)；快照不是全部脚本都可安全运行的承诺。

## 目录与维护归属

| 位置 | 职责与入口 | 运行边界 |
| --- | --- | --- |
| 根目录 `check-*.mjs`、`lint-workspace.mjs` | 由根 `package.json` 与 CI 登记的工程门禁 | 优先使用已有包命令 |
| `local-deployment.sh`、`deployment/` | 应用构建与快更兼容合同 | 容器更新由相邻 infra 正式入口执行；`maintenance.json` 保持部署合同职责 |
| `local-runtime/` | 宿主业务验收与跨应用运行辅助 | 执行前核对具体工具的目标、副作用和授权 |
| [界面回归](local-runtime/browser/README.md) | 7 项固定样本回归，按标的、提供方、风险分组 | 自建临时服务、拦截真实 API；统一包命令执行 |
| `backup-db.sh`、`restore-db.sh`、[数据库工具](database/README.md) | PostgreSQL 备份、恢复预检、显式恢复和隔离验收 | 目标由 `DATABASE_URL` 明确指定，恢复默认不写入 |
| `mobile-release.mjs`、`mobile-release/` | 原生发布与签名合同 | 遵守现有发布流程 |
| `fixtures/`、`p0-target/` | 共用样本与动态装载的 P0 探针 | 不以静态零引用判断可删除 |
| [专项归档](archive/README.md) | 已结案任务的 5 个专项脚本与配套测试 | 保存历史复现；不列为日常操作入口 |

## 生命周期与变更约束

长期工具随其领域合同维护，测试和夹具与入口一起检查。正在进行的任务及审计中 15 项新增工具由原任务决定归属；13 项待复核脚本保持原位，其余验收脚本须逐族确认后再迁移。此次整理不扩大删除范围。

新增或移动工具时，同步维护包命令、显式与通配符 CI、相对依赖、宿主页、夹具、文档及相邻仓库引用。已结案专项进入 `archive/<原任务标识>/`；仍承担回归、门禁或基准生成的工具继续维护。涉及系统性合同调整时，先建立成对 Spec/Task。
