# 账户草稿、对账与乱序投影验收记录

## 范围与结论

按用户选择恢复[持仓草稿审核和确定性对账](../../specs/2026-10-21-account-draft-reconciliation-web.md)，并优先完成[乱序余额观察一致性修复](../../specs/2026-10-21-baseline-projection-consistency.md)。两项补充任务均已通过本次范围验收，原 T12/T13 已于 2026-10-22 完成最终核对并归档，见[原任务](../../archive/tasks/2026-08-18-position-entry-account-model.md#最终一致性-review)。主线程执行，只验 Web，真实模型暂停，DG3 TODO 保持。

## 实现与分层验证

审核列表在同一只读事务内取得当前修订和已提交行，共享 Schema 拒绝不兼容响应。客户端使用 TanStack Query；显式保存只生成新草稿修订，单独选行确认才提交账本。已提交行冻结；部分提交须为剩余行显式创建后续修订。409 后保留输入，重新读取同时刷新账本和草稿，再重新选择，避免仅刷新草稿而持续携带旧账本版本。

确定性对账保留当前账户、候选读取代次及账本版本；刷新或读取失败时不能确认旧选择。界面展示快照日期、数量与成本、匹配依据和冲突，原因非空才写入。

| 层级 | 实际证据 |
| --- | --- |
| 草稿与审核定向 | 服务端 4 文件、39 项；客户端 5 文件、57 项。最终日期/成本展示变更另复跑对账与账户两文件 20 项，其余未变输入复用 |
| 投影回归 | 初次 8 失败、4 通过，修复后新增 14 项通过；Domain 全量 50 文件、455 项通过 |
| 核心物化与对账 | Server 定向 5 文件、43 项通过，包含 AVG/FIFO 物化、原核心投影、对账、草稿提交及已实现收益 |
| 类型与构建 | Domain 构建、Server 类型/构建、Desktop 类型/最终构建通过；Web 最终为 3581 模块、`index-CDdRScLG.js`，原大包提醒保留 |
| 仓库门禁 | 最终 `pnpm guardrails:complexity` 为 8 组、2301 文件通过，8 个原文件尺寸提醒；边界及工作区依赖通过，新模块/本次对账变更定向 ESLint 零警告 |
| 正式运行态 | 两次阶段同步均使用 `sync-code.sh thesis-ledger`，Server/Worker 健康；仅可写层更新，镜像均保持 `sha256:1562291459dea8079e7a3edf53ece29a9cfd7e14f38c7afad11546e314bae880` |

验证输入为两项补充任务涉及的审核 Schema、Import 只读查询/委托、Desktop 草稿与对账消费、Domain 观察余量与成本重放，以及对应测试。没有 Schema/migration、运行时依赖、DSA requirements 或 Dockerfile 变化。首次仓库门禁发现提取夹具后未使用 import，修正后通过；没有用失败结果进入目标部署。

## 真实 Web 与账本结果

专用案例 `23732bdb-2166-4ff5-ba7f-018bb3051d1e`，账户 `d1136209-9409-447e-98c8-02fe9743a088`，草稿 `21e60430-ff80-46e2-aa63-5fe986dffa73`。账户为证券、模拟、CNY，仅使用已有已确认 `510300.SH` 和 `600000.SH`。

1. 人工来源草稿打开后没有自动选行或写入。重复代码保存拒绝，输入保留，账本修订保持 2、原草稿修订 1 不变。更正首行 12.5→12.75 后保存得到草稿修订 2，账本仍为 2。
2. 两次正常并发观察分别推进账本至 3、4，真实 Web 使用旧版本提交均得到 409，输入和选择保留。首次发现重读只刷新草稿的问题后补齐账本重读和失败恢复；新代码真实重读后重新选择，首行提交推进账本至 5，第二标的仍为 3、现金不由导入改变。
3. 首行冻结；显式创建修订 3，仅保留未提交第二行。提交后账本为 6，草稿为 committed，全部已提交行冻结。最终只读比较三份草稿修订与提交完成时逐行相等，原证据引用、时间精度和元数据保留。
4. 发现 10 月 20 日旧观察晚录入后混用 9 份与成本 24。领域修复仅收缩观察推算的 Baseline 余量，真实成交不被观察扣减；数量和成本采用同一收缩计划。专用账户两次正常重建结果相等，账本修订 6 和原 6 个有效事实不变。Web 显示 `600000.SH · 3 股 · ¥8.00`，Trade 仍保留 `CONFLICTED`、`MISSING_OPENING_BOUNDARY`、`QUANTITY_CONFLICT`，没有新增 SELL 或 Close Slice。
5. Web 查看和选择对账候选不写入；空原因提交拒绝后仍为修订 6、6 个有效事实。补齐原因并确认后才推进至 7，只新增一条对账事实：覆盖数量 5、成本 20，剩余数量 7.75、成本 31；观察总量 12.75、总成本 51 守恒。相同命令重放返回 `idempotentReplay: true`，修订和有效事实不变，候选消失。
6. 正常撤回本次对账推进至 8，原候选重新可用。后续清理只操作自有事实与账户。

390×844 下草稿与对账均实测；对账根宽度/滚动宽度为 390，抽屉 client/scroll 为 362，无横向溢出。桌面视口已恢复，Web 回到 `/portfolio`，模拟模式与系统浅色保持。页面恢复加载后再次只读核对，15 账户完整哈希与五项零模型计数保持，证据为 `account-draft-web-restored.json`。

## 清理与数据保护

草稿正常回滚因已存在后续对账审计而返回 409：`导入提交后 510300.SH 已有新的 Ledger 事件，不能自动回滚`。未绕过该保护；按[收尾预案](2026-10-21-account-draft-reconciliation-plan.md)作废自有模拟 BUY，再追加 PARTIAL 两标的零余额观察。最终账本修订 10，持仓为空、现金 0、两个 Trade 均 ENDED/余量 0，专用账户停用。原三份草稿修订仍保留，11 条账本审计包含确认、撤回、成交作废和归零观察；未删除历史。

原 14 账户、13 张业务保护表、57 个成功 V3 结果、资产身份与关联、范围外草稿/修订/批次和完整 Asset 内容逐项相等。原完整保护 SHA-256 仍为 `6bec06eac33dfaa1a51b5f18f605bf16ccd377cd5ff27c5f930a55f6e9fc5d80`；包含新增停用账户的 15 账户基线为 `aaadc515808b131889c5ffaaaded549c7945680dde2552a79168344665848c9e`。

政策/DSA 164、16 路由保持，指纹 `0117cfac907d941645be4134dd2f96a3e6cba30ba3b24fe00f8828eb2db49ea9`；27 来源公共配置指纹保持 `5b824921a2d31b05f06a0aaeac70f62081c70523efd1dbd308bc8c5f2ff2ae77`。`AiRun`、`AiToolCall`、`ResearchObservation`、`AiInvocation`、`AiInvocationFact` 均为 0。本轮没有模型请求，运行开关保留原值。

首次投影复核脚本漏解包公开来源响应，修正为只读核对后通过，没有重发重建。首次确认回执输出被工具截短，命令内幂等及守恒断言已执行成功；随后仅只读提取事件与检查点形成持久证据。

## 证据与接续

私有证据位于 `.recovery-artifacts/remaining-p1-2026-10-20/`：

- `account-draft-before.json`、`account-draft-case.json`、`account-draft-runtime.json`：前基线、正常写入输入及正式同步核对。
- `account-draft-web-before-save.json`、`account-draft-concurrency*.json`、`account-draft-recovery*.json`、`account-draft-partial.json`、`account-draft-continuation.json`：保存、两次冲突、冻结及后续修订。
- `account-draft-completed-probe.json`、`baseline-consistency-before.json`、`baseline-consistency-fixed.json`：原错误与修复后的独立数据核对。
- `account-draft-reconciliation-selected.json`、`account-draft-reconciliation-confirmed.json`：选择不写、确认和幂等/守恒断言。
- `account-draft-cleanup-plan.json`、`account-draft-cleaned.json`、`account-draft-final-protection.json`：回滚保护、结清停用、全部审计与最终差集。
- `baseline-consistency-web.jpg`、`account-draft-committed.jpg`、`account-draft-phone.jpg`、`account-draft-reconciliation-phone.jpg`、`account-draft-reconciliation-complete.jpg`：实际 Web 各状态截图。

本次两个补充叶完成后回到[原优先级与剩余条件](2026-10-21-continuation-frontier.md)。来源权限/合格材料、模型暂停及通知授权等缺口仍由原 Task 持有；DG3 保持原 TODO，未将其他未完成事项移入 TODO，总 Goal 未完成。最终 14 份相关文档的 128 条相对文件链接无缺失，两份归档任务均无未完成 checkbox；新增规格、归档任务、验收正文格式及 `git diff --check` 通过。
