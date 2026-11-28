# ThesisLedger 主分支 CI 修复任务

2026 年 11 月 28 日结案。范围为修复 ThesisLedger `origin/main` 的 CI 门禁，推送前验证相关检查及可独立运行的后续步骤，并等待主分支完整工作流终态。具名 V1 切换及其独立验收分支的原始回执见[具名 V1 合同实施任务](2026-11-24-named-v1-cutover.md)。

## 完成项

- [x] 恢复桌面与 Server lint、首次构建及 PostgreSQL E2E，修复 Chromium 安装和浏览器回归。
- [x] 对齐基金定投信封与 Domain 策略保护断言，修复隔离 PostgreSQL 恢复测试的样本就绪和文件所有权。
- [x] 修复 Server 测试及收益与风险隔离 PostgreSQL 的缺价断言，按具名 V1 合同恢复运行工具与归档策略方向检查。
- [x] 推送前验证全仓 lint、类型检查、测试、构建和运行工具检查。远端回放超时用例调整后，本地复跑 Server 全套、该文件 lint 和全部运行工具步骤。
- [x] 确认 `origin/main` 头提交与最终 CI 回执一致。质量门禁、合同与隔离 PostgreSQL、Chromium、iOS 模拟器和 Android 构建五个作业通过。

## 结案复核

修复以独立提交推送，保留其他本地工作，未开 PR。最终 CI 绑定 `d10184efd5526a427e464f2040549babf479bcb9`，桌面安装包依据工作流条件跳过。历次失败及本地与远端的各自结果见[修复与验收回执](../evidence/2026-11-28-thesis-ledger-main-ci-recovery.md)。本批主分支 CI 无剩余门禁。
