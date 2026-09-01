# 架构边界与工程门禁收敛任务（已完成）

- 日期：2026-08-28
- Task ID：`architecture-guardrails-hardening`
- 状态：Completed
- 对应 Spec：[`../specs/2026-08-28-architecture-guardrails-hardening.md`](../specs/2026-08-28-architecture-guardrails-hardening.md)
- 完成 PR：[#22 chore: harden architecture boundaries and CI guardrails](https://github.com/yzin-17/thesis-ledger/pull/22)

## 完成范围

- [x] 固化 Server feature 单向依赖、ownership-aware 修复、复杂度 ratchet、Native compile 和生成物治理规则。
- [x] 移除 `ledger -> imports` 反向源码依赖，同时保持 Screenshot/Vision adapter 概念归 `imports` 所有。
- [x] 增加 boundary guardrail，阻止新的 `ledger -> imports` 回归。
- [x] 将文件尺寸 guardrail 升级为基于 `GUARDRAIL_BASE_REF` 的增量 ratchet。
- [x] 增加 Android `:app:assembleDebug` 原生 CI job，不依赖 emulator。
- [x] 清理已被 `.gitignore` 覆盖但仍被跟踪的 Expo / Mobile release 生成物。
- [x] 完成最终 patch Review；修正第一版把 adapter 类型错误搬入 Ledger 的 ownership 问题。

## 验证与归档结论

PR #22 已于 2026-08-28 合并到 `main`。该任务不再作为当前实施入口；长期约束由 `AGENTS.md`、boundary/complexity guardrail 和 CI 持续执行。原始逐项验证记录可从 Git 历史及 PR #22 diff/讨论追溯。
