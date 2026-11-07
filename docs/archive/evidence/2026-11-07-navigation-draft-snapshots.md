# 导航确认草稿快照保护验证

对应[规格](../../specs/2026-11-07-navigation-draft-snapshots.md)与[任务](../tasks/2026-11-07-navigation-draft-snapshots.md)。所有真实业务数据保持只读，回归使用内存组件、受控请求或隔离浏览器上下文。

## 共享故障与修复

在真实 `NavigationGuardProvider` 上控制确认 Promise。初始六项挂载回归中，内容刷新、同内容切换记录、新增草稿、移除编辑器和 Provider 卸载后晚到确认五项失败；普通重渲染使用最新回调原本通过。基线 `/tmp/goal-navigation-races-before.{json,log}`。修复登记已提交内容快照和注册身份，确认后核对当前集合及 Provider 生命周期；通过后才调用最新丢弃回调和提交转换。

共享 `useDraftCloseGuard` 将已有真实快照桥接给导航层。账户模式切换新增回归先失败（`/tmp/goal-navigation-bridge-before.json`），接入后连同关闭/导航回归五文件 27 项通过（`/tmp/goal-navigation-bridge-after.json`）。来源路由直接登记已有 draft，不改变保存请求及失败恢复。

## 消费者所有权

共核对 14 个生产导航登记入口：11 个含草稿身份，3 个只保护忙碌状态。

| 所有者 | 快照与保留的职责 |
| --- | --- |
| 共享关闭 Hook | 复用既有 20 处表单调用的序列化内容与打开会话 |
| 账户页 | 保留页面/侧栏协调，登记模式与当前编辑目标；不复制子表单字段 |
| 持仓管理 | 原非受控表单通过已有 `markDirty` 编辑事件产生版本，包含账户、持仓及侧栏身份；无 DOM 字段副本 |
| 交易表单 | 本地 dirty 与原父回调同步，登记账户、事件、交易字段、费用及标的选择 |
| 导入审核编辑器 | 实际持有人工修订行，登记草稿 ID/修订、行、选择及全量确认 |
| 手动策略编辑器 | 登记版本来源、schema 与高级 JSON；父页继续协调创建模式和路由 |
| 自然语言策略 Hook | 登记所有者、草稿、未保存内容及操作参数，保持自动保存和操作在途限制 |
| 实验新建/风险应用 | 登记现有编辑参数、预算、目标及通知选择，不新增请求 |
| 来源路由 | 直接登记已有本地 draft，保留原 discard |

`AuthoringWorkPage` 的建稿、`ResearchSavedReport` 的取消和 `RiskCenter` 的在途动作继续显式 `dirty: false`，自身没有未保存表单内容。其他实际表单通过所属编辑器登记，不要求这些入口伪造草稿。

挂载真实持仓与策略编辑器，确认期间继续输入后检查路由仍在编辑器，新值及持仓长小数在重新聚焦时完整保留；下一次确认可离开，业务保存次数为 0。首轮数量断言错误地把失焦压缩展示当原值，改为按既有数值合同重新聚焦检查原值，没有修改业务格式化或精度。

新增手动策略子保护首次阻止了保存后的合法跳转；真实保存/确认读取恢复测试发现后，将父页已有成功 bypass 传给字段所有者。该回归随后通过。首次构建发现可选函数与 `exactOptionalPropertyTypes` 不兼容，改为明确返回布尔值的委托，未放宽类型检查。

## 路由重试与确认归属

实际浏览器在持仓侧栏取消后立即再次请求离开时，没有出现新确认。记录路由和保护状态发现：Router 已发出 unblocked 及新 blocked，但 React 将两次渲染合并，原 effect 只依赖 `blocker.state`，因而漏掉新的请求。

新增两项回归（`/tmp/goal-navigation-route-before.json`）：快速重试未重新确认；确认期间改为另一目标后，旧确认错误地调用 discard。共享 effect 改为识别实际 blocker 请求，`request` 在丢弃前确认仍属于该请求；晚到结果不重置或提交其他请求。两个旧故障均修复，相关四文件 26 项通过（`/tmp/goal-navigation-route-after.json`）。路由测试沿用仓库的 jsdom/Node Request realm 适配，只验证确认归属，未模拟业务请求取消。

## 最终集成

以下实际命令均从主仓经 `rtk proxy` 执行，普通测试入口清除 `NODE_OPTIONS`。

- `env -u NODE_OPTIONS pnpm --filter @thesis-ledger/desktop test test/navigation-confirmation-races.ui.test.tsx test/global-mode-transition.ui.test.tsx test/navigation-draft-recovery.ui.test.tsx test/position-strategy-recovery.ui.test.tsx test/strategy-backtest-navigation.ui.test.tsx test/import-draft-review.ui.test.tsx test/authoring-draft-recovery.ui.test.tsx test/account-data.cash.test.tsx test/strategy-center-ui.test.tsx --reporter=json --outputFile=/tmp/goal-navigation-targeted-final.json`：9 个文件、82 项通过。
- `env -u NODE_OPTIONS pnpm --filter @thesis-ledger/desktop test --reporter=json --outputFile=/tmp/goal-navigation-desktop-final.json`：238 个文件、1363 项通过。初轮的 1361 项通过早于新增路由归属修复，作为历史结果保留，不替代最终输入。
- `pnpm --filter @thesis-ledger/desktop build`：类型检查及 Vite 生产构建通过，保留既有大 chunk 提示；最终日志 `/tmp/goal-navigation-build-complete.log`。
- 本轮 16 个运行时/测试文件 ESLint 通过，最后改变的 4 个文件再次通过（`/tmp/goal-navigation-lint{,-final}.log`）。脚本继续按既有仓库门禁范围验证，没有扩大忽略或放宽规则。
- `node --test scripts/draft-close-boundaries.test.mjs`：6 项通过，保留局部关闭的原 4 项，新增导航缺失/空快照及纯 busy、注释/测试不误报验证。实际 `scripts/check-boundaries.mjs` 通过。
- `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`：6 条既有债务告警，ratchet 通过；没有调整阈值，临界风险应用页面未跨越 800 行。

完整包前后及浏览器之后记录 1920 个 Desktop 源码、测试、配置及共享包源码/构建输入的 SHA-256，全部一致（`/tmp/goal-navigation-final-inputs-{before,after,browser}.json`）。测试运行器仍为宿主 Node 26.13.0；门禁和浏览器脚本使用本机已有 Codex Node 24.22.1。本记录的完整包证据可供日期、Drawer、标的选择和自选行情的活动任务按同一输入范围复用。

## 实际浏览器

仓库保留 `/test/browser-navigation-draft-snapshots.html` 与 TSX 受控入口，挂载真实 `PortfolioModeProvider`、`NavigationGuardProvider`、确认框、策略编辑器及持仓编辑器。MemoryRouter 与全新 Chromium 上下文隔离用户 URL 和模式记忆；不改真实账户与业务记录。

1440、1024、768、390 × 模式切换、策略路由离开、持仓侧栏三类场景，共 12 组通过。每组都先编辑、发起实际确认、用受控事件模拟确认期间内容更新，检查原位置/模式及新内容保留，再验证取消和新确认成功。持仓数量重新聚焦后仍是 `202.1234567890123456789`。确认框测量等待实际动画完成；侧栏保留窄屏边界，整页无横向溢出。浏览器的就绪检查不以固定 sleep 代替路由收敛，旧实现在同一就绪检查下仍复现快速重试失败。

脚本 `/tmp/goal-navigation-browser.cjs`，结果 `/tmp/goal-navigation-browser.json`，截图 `/tmp/goal-navigation-{mode,route,position}-{1440,1024,768,390}.png`；已查看桌面策略和窄屏持仓，页面异常及业务/外部请求均为 0。浏览器没有调用保存入口，也没有把受控样本表述为真实数据写入验收。

## 最终范围复核

AC1～AC3 有旧实现失败和修复后通过的挂载证据；AC4 覆盖全部 14 个登记入口并保留纯 busy 职责；AC5 有稳定输入的完整包、构建与四宽实际组件；AC6 有 AST 测试和仓库门禁；AC7 有路由复现及实际浏览器重新确认。没有未决验收或转移到 TODO 的范围。

本轮未执行 Docker、外部行情或模型调用，没有业务写入、提交、推送或发布。共享主工作区仍含其他任务改动，完整 Desktop 包通过不替代 Server、Mobile、数据库、来源或部署验收；全线程持续优化 Goal 继续活动。
