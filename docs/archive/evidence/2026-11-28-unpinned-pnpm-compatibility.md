# 三仓 pnpm 远端兼容复验

对应[三仓取消 pnpm 版本绑定任务](../tasks/2026-11-14-unpinned-pnpm.md)。2026 年 11 月 28 日 21:37（上海时间），infra `main` 手动触发的完整 [Compatibility Gate 46150501411](https://github.com/yzin-17/thesis-ledger-infra/actions/runs/46150501411) 完成，结论为 `success`。

| 仓库 | 复验分支 | 提交 |
| --- | --- | --- |
| infra | `main` | `c44471ec3203676d917c7f99d4b6b07ec2f45aee` |
| ThesisLedger | `main` | `602baee3604f25543a10e9c115d6a172c84a130c` |
| DSA | `yzin` | `01aa3099b80edf0b59712ba48bfc01246a4c5197` |

infra 提交与运行的 `headSha` 一致。工作流从 ThesisLedger 默认分支和 DSA `yzin` 检出应用配置；两仓分支头在触发前与作业结束后读回一致。ThesisLedger `602baee3` 只新增归档文档，主仓代码全绿回执绑定到前一提交 `d10184ef`。[主仓修复与验收回执](2026-11-28-thesis-ledger-main-ci-recovery.md)

作业实际安装 pnpm `12.23.0`，冻结锁文件安装与 `pnpm check` 通过。`pnpm test` 共 28 个文件，98 项通过、1 项跳过。DSA 应用侧快更与恢复检查 30 项通过、零失败。[兼容作业日志](https://github.com/yzin-17/thesis-ledger-infra/actions/runs/46150501411/job/140995881817)

上一轮在 DSA 应用侧恢复的错误文案断言失败。使用现行 infra 与 DSA 版本按同一命令本地复验 30 项通过，随后本轮完整远端兼容门禁通过。[上一轮失败](https://github.com/yzin-17/thesis-ledger-infra/actions/runs/45856036217) · [早期主仓与 infra 门禁记录](../../evidence/2026-11-22-active-task-followup.md#工程与外部条件)
