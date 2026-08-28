# 架构边界与工程门禁收敛任务

- 日期：2026-08-28
- Task ID：`architecture-guardrails-hardening`
- 状态：Ready for Review
- 对应 Spec：[`../specs/2026-08-28-architecture-guardrails-hardening.md`](../specs/2026-08-28-architecture-guardrails-hardening.md)

## 目标

在不做无关大规模重构的前提下，把本轮全仓 Review 中容易重复出现的问题转化为长期规则和自动化门禁，并修复已确认的 `ledger -> imports` 反向源码依赖。

## Task 1：固化 AGENTS.md 规则

- [x] 增加 Server feature 单向依赖规则。
- [x] 明确禁止为了消除边界问题创建无所有权的 `common/shared` 大杂烩。
- [x] 增加大型文件增量 ratchet 规则。
- [x] 增加 Native compile 验证规则。
- [x] 增加生成物/发布产物不得被 Git 跟踪的规则。

验证：

- 已 Review `AGENTS.md`：规则明确了可判断的依赖方向、复杂度 ratchet、Native compile 和生成物约束，并要求系统性架构/门禁变更先建立 Spec/Task。

## Task 2：收敛 Import/Ledger 依赖方向

- [x] 将 Ledger-owned 的 import state helper 移到 `apps/server/src/ledger/`。
- [x] 将截图来源类型/检测所依赖的共享契约调整为 Ledger-owned 单向依赖。
- [x] 将 Vision position 校验原语调整为 Ledger-owned 单向依赖。
- [x] 将 `ImportDraftOptions` 从 `imports` 实现类中抽出为 Ledger-owned 类型。
- [x] 更新 `imports` 与 `ledger/baseline-import.service.ts` 的 import path。
- [x] 移除 `imports` 中重复实现；原路径仅保留兼容 re-export。
- [x] 在 boundary guardrail 增加 `ledger -> imports` 禁止规则。

验证：

- `main...HEAD` 静态 diff 显示 `baseline-import.service.ts` 仅有 4 行 import 增删，没有业务逻辑变化。
- `apps/server/src/ledger/**` 的已确认反向依赖已移除，并由 `scripts/check-boundaries.mjs` 防止回归。
- `imports` 继续作为截图上传/识别适配层单向消费 Ledger-owned 原语。
- 未修改 HTTP route、公共 Schema 或 API Client Contract。

## Task 3：升级文件尺寸 guardrail 为增量 ratchet

- [x] `check-file-size-guardrails.mjs` 支持 `GUARDRAIL_BASE_REF`。
- [x] 能读取基线版本同路径文件的行数。
- [x] 新文件直接超过阈值时失败。
- [x] 原本未超标的文件跨过阈值时失败。
- [x] 存量超标文件继续增长时失败。
- [x] 存量超标文件持平或减少时只 warning。
- [x] 本地缺少有效 base ref 时退化为 warning。
- [x] CI checkout 保证 base commit 可读取，并传入 base SHA。

验证：

- 静态 Review 覆盖四种 ratchet 判定：新超标、跨阈值、存量增长失败；存量持平/缩小仅 warning。
- `contracts-and-guardrails` 使用 `fetch-depth: 0`，并将 PR base SHA / push before SHA 传入 `GUARDRAIL_BASE_REF`。
- `pnpm guardrails:complexity` 仍是既有 contracts-and-guardrails job 的必跑步骤。

## Task 4：增加 Mobile Android Native CI

- [x] 新增 `mobile-android-native` job。
- [x] 使用 Ubuntu runner、pnpm、Node 24、JDK 17。
- [x] 安装 workspace 依赖。
- [x] 执行 `apps/mobile/android/gradlew :app:assembleDebug --no-daemon`。
- [x] 不启动 emulator，不安装 APK。

验证：

- Native compile 与 `quality`、`contracts-and-guardrails` 分离，可独立定位失败。
- Job 仅执行真实 Android debug assemble，不依赖设备或模拟器。

## Task 5：清理被跟踪的生成物

- [x] 删除 Git 中的 `apps/mobile/.expo/**`。
- [x] 删除 Git 中的 `apps/mobile/release/**`。
- [x] 保留现有 `.gitignore` 对这些路径的忽略规则。

验证：

- `main...HEAD` 中 `.expo` 和 Mobile release 仅为删除；包括移除已跟踪的 `investment-os-0.1.0.aab`。

## Task 6：最终 Review

- [x] 比较 `main...HEAD` 全部 diff。
- [x] 检查是否有 API/Schema/业务行为变化。
- [x] 检查是否新增无关重构。
- [x] 检查 Server feature 依赖方向。
- [x] 检查 CI ratchet 不会要求一次性拆完所有存量大文件。
- [x] 检查 Native CI 不依赖 emulator。
- [x] 更新本 Task 状态和验证证据。
- [ ] 创建单一 PR，正文关联 Spec/Task 并总结架构发现与验证范围。

## 验证状态

- 已完成 GitHub `main...HEAD` 静态 diff Review；当前分支相对 `main` 无无关业务改动。
- 由于当前执行容器无法解析 `github.com`，无法在本地 clone 后运行 `pnpm`，因此没有把静态检查冒充运行验证。
- PR 创建后以仓库 CI 的 `quality`、`contracts-and-guardrails`、`mobile-android-native` 作为真实运行验证；若暴露现有原生构建问题，应做最小修复，不通过跳过 job 规避。

## 风险

- 移动 helper 文件时遗漏 import path 会导致 typecheck/build 失败，由 PR CI 捕获。
- GitHub Actions 的 base SHA 在不同事件类型下不同；PR/push 提供基线，manual/无有效基线场景退化为 warning。
- Android native build 可能暴露现有原生工程问题；若发现真实问题应在本 PR 中做最小修复，不通过跳过 job 规避。
