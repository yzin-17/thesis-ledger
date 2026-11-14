# 权限检查长期保留与凭证底部操作实施

规格：[权限检查长期保留与凭证底部操作](../../specs/2026-11-10-provider-access-retention.md)

## 当前状态

T1–T4 全部完成，最终一致性核对通过，2026-11-10 归档。复用现有 SQLite 权限记录，保留两仓并发改动。计划预检：范围、配置指纹、草稿隔离与验收环境明确，可以实施。验证命令及输入范围见[验收证据](../../evidence/2026-11-10-provider-access-retention.md)。

## 执行任务

- [x] T1：当前权限记录长期持久化（AC1）。修复无等级存储与快照归一化，验证超过五分钟、重启、凭证/端点变化及无关启停。
- [x] T2：草稿保存绑定（AC2，依赖 T1）。无等级来源复用同一输入的检查结果，保持原子代次与无额外请求行为；验证隔离、冲突及无效凭证。
- [x] T3：底部操作与说明（AC3）。移除按钮统一进入共享 Footer，区分长期记录与未保存草稿说明；完成定向测试、build和四屏宽浏览器验收。
- [x] T4：完整镜像与集成（AC4，依赖 T1–T3）。正式 `update.sh dsa` 退出0，新镜像及容器8个文件比对、实际 API 与四宽页面通过，保留数据与配置。

## 入口与续接

DSA：`thesis_ledger_account_access.py`、`thesis_ledger_account_access_store.py`、`thesis_ledger_account_access_configuration.py`；Desktop：`ProviderCredentialsSheet.tsx`、`ProviderAccountAccessPanel.tsx`。证据写入 `docs/evidence/2026-11-10-provider-access-retention.md`。

当前旧内存结果不保证在升级后恢复，不自动用真实 Key 重查；隔离样本覆盖写入和重启，不改写真实业务记录。未授权 Git 提交。
