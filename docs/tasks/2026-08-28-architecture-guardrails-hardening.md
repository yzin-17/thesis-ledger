# 架构边界与工程门禁收敛任务

- 日期：2026-08-28
- Task ID：`architecture-guardrails-hardening`
- 状态：In Progress
- 对应 Spec：[`../specs/2026-08-28-architecture-guardrails-hardening.md`](../specs/2026-08-28-architecture-guardrails-hardening.md)

## 目标

在不做无关大规模重构的前提下，把本轮全仓 Review 中容易重复出现的问题转化为长期规则和自动化门禁，并修复已确认的 `ledger -> imports` 反向源码依赖。

## Task 1：固化 AGENTS.md 规则

- [ ] 增加 Server feature 单向依赖规则。
- [ ] 明确禁止为了消除边界问题创建无所有权的 `common/shared` 大杂烩。
- [ ] 增加大型文件增量 ratchet 规则。
- [ ] 增加 Native compile 验证规则。
- [ ] 增加生成物/发布产物不得被 Git 跟踪的规则。

验证：

- Review `AGENTS.md`，规则必须可执行、可判断，不能只写抽象原则。

## Task 2：收敛 Import/Ledger 依赖方向

- [ ] 将 Ledger-owned 的 import state helper 移到 `apps/server/src/ledger/`。
- [ ] 将截图来源类型/检测所依赖的共享契约调整为 Ledger-owned 单向依赖。
- [ ] 将 Vision position 校验原语调整为 Ledger-owned 单向依赖。
- [ ] 将 `ImportDraftOptions` 从 `imports` 实现类中抽出为 Ledger-owned 类型。
- [ ] 更新 `imports` 与 `ledger/baseline-import.service.ts` 的 import path。
- [ ] 删除不再使用的旧文件，避免双份实现。
- [ ] 在 boundary guardrail 增加 `ledger -> imports` 禁止规则。

验证：

- `apps/server/src/ledger/**` 不存在 `../imports/` import。
- `imports` 仍可单向依赖 `ledger`。
- 不改变现有 HTTP route 和 command schema。

## Task 3：升级文件尺寸 guardrail 为增量 ratchet

- [ ] `check-file-size-guardrails.mjs` 支持 `GUARDRAIL_BASE_REF`。
- [ ] 能读取基线版本同路径文件的行数。
- [ ] 新文件直接超过阈值时失败。
- [ ] 原本未超标的文件跨过阈值时失败。
- [ ] 存量超标文件继续增长时失败。
- [ ] 存量超标文件持平或减少时只 warning。
- [ ] 本地缺少有效 base ref 时退化为 warning。
- [ ] CI checkout 保证 base commit 可读取，并传入 base SHA。

验证：

- 静态 Review 脚本分支覆盖上述四种判定。
- CI 中 `pnpm guardrails:complexity` 继续作为 contracts-and-guardrails job 的必跑步骤。

## Task 4：增加 Mobile Android Native CI

- [ ] 新增 `mobile-android-native` job。
- [ ] 使用 Ubuntu runner、pnpm、Node 24、JDK。
- [ ] 安装 workspace 依赖。
- [ ] 执行 `apps/mobile/android/gradlew :app:assembleDebug --no-daemon`。
- [ ] 不启动 emulator，不安装 APK。

验证：

- Workflow YAML 语法与现有 job 结构一致。
- Job 与 `quality`、`contracts-and-guardrails` 解耦，失败可独立定位。

## Task 5：清理被跟踪的生成物

- [ ] 删除 Git 中的 `apps/mobile/.expo/**`。
- [ ] 删除 Git 中的 `apps/mobile/release/**`。
- [ ] 保留现有 `.gitignore` 对这些路径的忽略规则。

验证：

- PR changed files 中不再出现这些生成物的新增/修改，只存在删除。

## Task 6：最终 Review

- [ ] 比较 `main...HEAD` 全部 diff。
- [ ] 检查是否有 API/Schema/业务行为变化。
- [ ] 检查是否新增无关重构。
- [ ] 检查 Server feature 依赖方向。
- [ ] 检查 CI ratchet 不会要求一次性拆完所有存量大文件。
- [ ] 检查 Native CI 不依赖 emulator。
- [ ] 更新本 Task 状态和验证证据。
- [ ] 创建单一 PR，正文关联 Spec/Task 并总结架构发现与验证范围。

## 风险

- 移动 helper 文件时遗漏 import path 会导致 typecheck/build 失败。
- GitHub Actions 的 base SHA 在不同事件类型下不同，需要为 PR、push、manual 场景提供兼容退化逻辑。
- Android native build 可能暴露现有原生工程问题；若发现真实问题应在本 PR 中做最小修复，不通过跳过 job 规避。
