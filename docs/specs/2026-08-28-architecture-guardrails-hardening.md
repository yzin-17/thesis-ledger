# 架构边界与工程门禁收敛

- 日期：2026-08-28
- Task ID：`architecture-guardrails-hardening`
- 状态：Accepted
- 对应任务：[`../tasks/2026-08-28-architecture-guardrails-hardening.md`](../tasks/2026-08-28-architecture-guardrails-hardening.md)

## 背景

全仓 Review 未发现需要停发的 P0，但确认了几类容易重复出现的工程问题：

1. Server feature 的 Nest 模块依赖方向与源码 import 方向不一致，当前已经出现 `ImportModule -> LedgerModule`，同时 `ledger/* -> imports/*` 的反向源码依赖。
2. 大型 Service 已超过现有文件尺寸阈值，但 guardrail 仅输出 warning，无法阻止继续增长。
3. Mobile 已维护原生 `android/`、`ios/` 工程，但常规 CI 的 `pnpm build` 实际只执行 TypeScript 编译，无法发现 Gradle/Manifest/原生依赖损坏。
4. `.gitignore` 已忽略 `.expo/`、`release/`、`*.aab`，但历史生成物仍被 Git 跟踪。
5. 上述问题目前主要依赖人工 Review 发现，缺少可重复执行的规则与门禁。

本轮目标不是大规模重构，而是把已经确认的架构约束固化成项目规则，并用最小改动建立自动回归防线。

## 目标

### G1. 固化 Agent 规则

在根目录 `AGENTS.md` 增加长期规则：

- Server feature 的源码依赖必须与模块/领域依赖方向一致；下游/核心模块不得反向 import 上游适配层。
- 跨 feature 复用前先确认所有权；优先移动到真正拥有该概念的模块或稳定 package，不得为了消除 import 随意建立 `common/shared` 大杂烩。
- 已超过复杂度阈值的存量文件进入 ratchet：修改时不得继续增长；新增职责优先拆到纯函数、repository/query、orchestrator 等明确边界。
- 维护原生工程时，TypeScript build 不能替代 Native compile；涉及原生配置/依赖的改动必须有对应原生构建验证。
- 已被 `.gitignore` 覆盖的生成目录、安装包和发布产物不得继续提交到 Git。

### G2. 收敛 Import/Ledger 依赖方向

保持现有 HTTP Contract 和业务行为不变，统一依赖方向为：

```text
imports（截图上传/识别适配）
  -> ledger（Import Draft / Baseline Ledger 契约与状态）
  -> packages/domain + packages/schemas
```

Ledger 不再直接 import `apps/server/src/imports/*`。

现有 `ledger/baseline-import.service.ts` 所依赖的 Ledger-owned 导入状态、来源类型和校验原语移入 `ledger`；`imports` 侧改为消费 Ledger 提供的这些原语。

### G3. 将文件尺寸告警改为增量 ratchet

保留现有阈值：

- Desktop feature `.tsx`：800 行
- Server `*.service.ts`：600 行
- Test：800 行

规则改为：

- 当前文件未超过阈值：保持原有行为；新跨过阈值时失败。
- 基线版本已经超过阈值：当前版本可以继续存在，但行数不得增加；减少或持平允许通过并继续 warning。
- 无法解析基线 ref 的本地/手动场景退化为 warning，不阻断开发者本地运行。
- PR/Push CI 提供可读取的 Git 基线 ref，使 ratchet 在 CI 中可阻断回归。

不要求本 PR 立即拆完现有大型 Service。

### G4. 增加 Mobile Native CI

在常规 CI 增加 Android 原生编译门禁：

```text
apps/mobile/android -> :app:assembleDebug
```

要求：

- 在 Ubuntu runner 安装项目依赖与合适 JDK；
- 不要求模拟器、不安装 APK；
- 仅验证 Gradle/Manifest/native dependency 能完成 debug assemble；
- iOS 仍可保留到 macOS/manual/release 阶段，本轮不扩大 CI 成本。

### G5. 清理已被忽略的历史生成物

停止跟踪：

- `apps/mobile/.expo/**`
- `apps/mobile/release/**`

保留 `.gitignore` 规则，不改变发布产物的实际生成方式。

## 非目标

- 不拆分 `RiskService`、`PerformanceService` 等大型 Service 的全部职责。
- 不重构 Trade、Portfolio、Risk 等业务模型。
- 不修改现有 API path、Schema 或客户端 Contract。
- 不新增通用 DI 框架或复杂架构层。
- 不引入新的包管理、monorepo 或 CI 平台。

## 设计

### 1. Server feature 依赖规则

Server feature 间依赖需要同时满足：

1. 模块层依赖方向清晰，例如 `ImportModule` 引用 `LedgerModule`；
2. 源码 import 不得出现相反方向；
3. 跨模块共享概念由真正拥有该概念的一方暴露，调用方单向消费；
4. 只有稳定、无业务编排的跨应用能力才提升到 `packages/*`。

本轮为已确认的 `ledger -> imports` 回归增加静态检查，后续其他 feature 在 Review 中按同一原则增量纳入。

### 2. 文件尺寸 ratchet

`check-file-size-guardrails.mjs` 同时读取：

- 当前工作树文件行数；
- `GUARDRAIL_BASE_REF` 对应版本的同路径文件行数。

判定：

```text
current <= threshold                     -> pass
base 不存在 && current > threshold       -> fail
base <= threshold && current > threshold -> fail
base > threshold && current > base       -> fail
base > threshold && current <= base      -> pass + warning
```

这样可以阻止技术债继续扩大，同时避免为了门禁一次性重构全部历史文件。

### 3. Native CI

新增独立 `mobile-android-native` job，避免和通用 `quality` job 混在一起。该 job 只负责 Android native compile；业务单测、lint、typecheck 仍由现有 quality job 负责。

## 验收标准

- [ ] `AGENTS.md` 包含 Server 边界、复杂度 ratchet、Native 验证、生成物治理规则。
- [ ] `apps/server/src/ledger/**` 不再 import `../imports/*`。
- [ ] boundary guardrail 能阻止新的 `ledger -> imports` 依赖。
- [ ] 文件尺寸 guardrail 在 CI 中对新增超标和存量增长返回失败。
- [ ] 存量超标但未增长的文件仍允许通过。
- [ ] CI 增加 Android `assembleDebug` 原生编译 job。
- [ ] `.expo` 与 Mobile `release` 历史生成物从 Git 跟踪中移除。
- [ ] HTTP Contract、Schema 和现有业务行为保持不变。
- [ ] 最终 PR diff 通过再次 Review，没有引入新的反向依赖或无关重构。

## 风险与回滚

- Ratchet 对 Git 基线选择敏感：CI 必须显式提供 base SHA；无有效基线时脚本应退化为 warning。
- 原生 Android CI 会增加少量运行时间，但不需要 emulator，成本可控。
- 移动导入原语时必须同步所有 import path，避免编译失败；不改变原语实现本身以降低行为风险。
- 任一门禁导致不可接受的误报时，可以单独回滚对应 guardrail，不需要回滚业务代码。
