# 自动化配置台 Spec（Automation Console）

日期：2026-09-05　状态：已实施完成（T1–T8；遗留验收边界见任务文档 Review 结论）
任务文档：[`../tasks/2026-09-05-automation-console-design.md`](../tasks/2026-09-05-automation-console-design.md)（本文由同日拷问定案的设计文档按文档规范升级而来，定案决策保留于「设计方案 · 已定案决策」）

## 背景与问题

自动化引擎本身是完整的：任务 schema、croner 调度与 `nextRunAt` 计算、Redis 执行锁、按 retryPolicy 的退避重试、`AutomationRun` 运行历史、中国市场交易日感知（market 类任务休市自动跳过）。但能力只暴露了一半（详见「现状与约束」能力对照表）。

直接后果：`snapshot`（估值快照）任务没有任何 UI 入口可创建，收益分析的"资产走势"永远为空，空状态按钮只能跳转到本页；任务配错 cron 后无法挽回（没有编辑，也没有删除路径）。

## 目标

任务可创建、可编辑、可删除（受限）、可立即执行；调度失败发通知；运行历史可读（任务名、中文状态）；页面头部与交互对齐其他模块。

## 非目标

- 不改 Prisma schema（删除采用应用层守卫，见设计方案）；
- 不暴露 `retryPolicy`、`lockTtlMs`、时区的编辑（固定合理默认：retry `{ maxAttempts: 3, backoffMs: 1000 }`、lockTtlMs 300000、timezone Asia/Shanghai）；
- 任务类型创建后不可修改（类型绑定运行时处理器）；
- 不做任务的暂停窗口、通知策略等高级配置。

## 现状与约束

| 能力 | 服务端 | 桌面端 |
| --- | --- | --- |
| 创建任务 | ✅ `POST /automations`（schema 要求客户端生成 UUID、name、cron、retry、lockTtlMs） | ❌ 无 |
| 启停 | ✅ `PATCH /automations/:id/enabled` | ✅ 表格开关 |
| 编辑 cron/名称 | ❌ 无端点 | ❌ |
| 删除任务 | ❌ 无端点 | ❌ |
| 立即执行一次 | ⚠️ 执行层已具备（锁、历史、重试），无 HTTP 端点 | ❌ |
| 运行历史 | ✅ `GET /automations/history?jobId=` | ⚠️ 任务列显示 UUID，类型/状态/错误为英文原文 |
| 失败通知 | ❌ 仅写运行历史 | — |

关键约束：

- 任务类型共 7 种：`market-sync`、`risk-evaluation`、`daily-digest`、`snapshot`、`backup`、`provider-health`、`cash-deposit-materialization`；其中 market 类（前 4 种）在休市日调度自动跳过。
- `AutomationRun` 对任务的外键为 `Restrict`：有运行历史的任务在数据库层面不可删除。
- 执行分两层：调度层入口（启用检查、交易日检查、`nextRunAt` 维护）与执行层（Redis 锁、`AutomationRun` 记录、按 retryPolicy 重试）；手动立即执行应直走执行层。
- 通知冷却以 dedupKey 为粒度（Redis SET NX + TTL）：冷却窗口内同 key 不重复入队，窗口过后再次入队会新建投递记录；无可用通知 Provider 时入队直接返回空结果，不报错。
- 服务端全局异常过滤器把非 `HttpException` 统一改写为 500 与通用文案，端点层需要向调用方传递具体原因时必须抛出带 message 的 `HttpException`。

## 设计方案

### 已定案决策（拷问记录）

1. **run-now 放行已停用任务**：立即执行是显式手动动作，等价于"试跑"；调度仍然不会碰停用任务。同时绕过交易日检查（手动意图优先，休市日也能拍估值快照）。
2. **删除受限**：`AutomationRun.job` 为 `onDelete: Restrict`，有运行历史的任务在数据库层面就不可删除。服务端先查后删：存在历史 → 409"已有运行历史，请改用停用"；无历史才物理删除。与库约束对齐，避免裸 Prisma 错误。
3. **编辑是必要能力**：正因为有历史的任务删不掉，cron 配错的任务只能靠编辑挽回。编辑范围为名称、cron、时区、启用（接口层四项均支持；UI 仅暴露名称、cron、启用，时区编辑按非目标不在界面暴露）；类型不可改。
4. **失败通知只走调度路径**：调度器执行失败 → 发通知；手动 run-now 失败 → 不发（用户在场，前端已有错误 toast）。节流按任务冷却：`dedupKey = automation-failure:{jobId}`，沿用现有通知冷却策略——同一任务连续失败只通知第一次，冷却窗口过后再次失败会重新通知。
5. **立即拍估值快照跟随当前页面模式**：收益分析页处于模拟模式时拍影子账户、实际模式拍实际账户，与页面展示的数据模式一致。
6. **术语**：账户市值+现金的时点记录定名**估值快照（Valuation Snapshot）**，与已有"现金快照（Cash Snapshot）"区分；"持仓快照"是 Ledger 事件的避免词，不得使用。词条已补入 `CONTEXT.md`。

### 服务端

#### 1. `PATCH /automations/:id` — 编辑任务

- 新增任务更新 schema：`name`（min 1）、`cron`（min 5）、`timezone`、`enabled`，全部 optional，仅更新提供的字段；类型不在更新范围。
- 更新逻辑：任务不存在 → 404；`cron` 或 `timezone` **实际变化**时按生效值用 croner（`nextCronOccurrence`）重算 `nextRunAt`（值未变不触碰 `nextRunAt`）；非法 cron 由 croner 抛错 → 映射 400。
- 既有 `PATCH /automations/:id/enabled` 保留不变。

#### 2. `DELETE /automations/:id` — 删除任务

- 任务不存在 → 404；先查该任务是否已有 `AutomationRun`：存在 → 409"已有运行历史，请改用停用"；无历史才物理删除任务行（历史表无该任务的行，无外键残留）。
- 先查后删窗口内若并发产生运行而触发数据库外键冲突（Prisma P2003），同样以 409 呈现，不暴露裸 Prisma 错误。

#### 3. `POST /automations/:id/run` — 立即执行

- 按任务 `type` 解析运行时处理器，**直调执行层**：有意不经过调度层入口，跳过 `enabled` 检查与交易日检查（决策 1）；执行照常走 Redis 锁、`AutomationRun` 记录与 retryPolicy 重试。
- 任务不存在 → 404；锁被占用时返回既有跳过语义（"任务已有实例运行"）。
- 执行失败把原始错误信息以 `HttpException` 返回给调用方（前端 toast 展示具体原因），不触发失败通知（决策 4）。

#### 4. 失败通知（仅调度路径）

- 在调度层入口的 catch（调度器专属路径）调用新 helper（automation 模块内，照风险通知 `enqueueRiskNotificationIfNeeded` 模式，依赖 `NotificationService`）：
  - subject type `automation-run`，subjectId = 本次失败的 `AutomationRun` id（catch 内查询该任务最近一次运行记录解析；任务无任何运行记录时回退任务 id）；
  - `dedupKey = automation-failure:{jobId}`，severity `error`；
  - 正文含任务名称与错误摘要；traceId 取失败运行记录（缺失时回退任务 id）；
  - 冷却与投递重试沿用现有通知冷却策略默认（cooldownMinutes 30、maxAttempts 3）；
  - 入队本身失败只记 warn 日志，不影响失败状态的记录与原始错误抛出。
- 手动 run-now 路径不经调度层入口，天然不通知。

### 桌面端

#### API 与 mutation

- 新增 `createAutomationJob` / `updateAutomationJob` / `deleteAutomationJob` / `runAutomationJob`；
- create 时客户端生成 UUID 并补默认值（retry `{maxAttempts:3, backoffMs:1000}`、lockTtlMs 300000、timezone Asia/Shanghai、enabled true）；
- mutation 失效策略：create/update → 任务列表查询键；run → 任务列表 + 运行历史；delete → 任务列表；失败以 toast 展示服务端 message（含 409 文案），run 返回跳过语义时以提示 toast 展示原因。

#### 编辑器（新组件 `AutomationEditorSheet`）

- 照 `ProviderEditorSheet` 的 Sheet + form 骨架，创建与编辑共用；
- 字段：名称（创建默认 = 类型中文名，可改）、任务类型 Select（7 种中文名，编辑模式禁用）、执行时间预设 Select（每个交易日 16:00 → `0 16 * * 1-5`；每个工作日 09:00 → `0 9 * * 1-5`；自定义 → cron 文本输入，非法 cron 展示服务端报错）、启用开关；
- 编辑模式预填当前值（cron 命中预设则选中预设，否则回填自定义文本），提交走 PATCH。

#### 页面接线

- 自动化任务表标题行加"新建任务"按钮；
- 操作列扩展为：启停（现有）/ 编辑 / 立即运行 / 删除（确认弹窗确认；409 文案透出）；
- market 类任务在表头注明"休市日自动跳过"。

#### 文案中文化

- 任务类型 7 种、运行状态（succeeded → 成功等）、健康状态（healthy → 健康、degraded → 降级、down → 宕机）、通知投递状态、错误码（`notification_provider_unconfigured:*` → 通知 Provider 未配置）、数据质量问题级别均提供中文映射；
- 运行历史"任务"列由 `jobId` 解析为任务名显示，查不到回退 jobId 前 8 位。

#### 收益分析页

- 空状态新增"立即拍一个估值快照"按钮：调用既有收盘快照工作流 `POST /automations/workflows/close-snapshots`（`accountIds` = 当前页面数据模式的账户列表，`capturedAt` = 当前时间），成功后失效收益查询缓存并反馈；当前模式无账户时按钮禁用；
- 模拟模式拍影子账户、实际模式拍实际账户（决策 5）；
- "完成数据配置"保留——它跳转的 Provider 页现在具备任务创建能力，两条路径闭环。

#### 界面打磨

- 页面头部从无样式定义的标题容器改为其他模块通用的标准 `page-header` 结构 + 操作区；右上角"新增或更新 Provider"主按钮 + ghost 图标刷新按钮（28px 同高、muted 色、hover 浅灰底、18px `RefreshCw`、刷新中旋转并禁用，点击失效 Provider 页查询）；
- 模块间隙保持既有 `.panel` 分隔线风格；样式用现有原子类与既有公共 class 组合，不新增页面级样式。

### 术语

- **估值快照（Valuation Snapshot）**：见 `CONTEXT.md` 词条（已补）。
- 三个易混概念在文案中区分：**自动化任务（AutomationJob）** = 持久调度配置；**运行（AutomationRun）** = 一次执行记录；**工作流触发（workflows/\*）** = 无调度的直接执行。

## 对外行为或接口变化

- 新增 `PATCH /automations/:id`：部分更新名称/cron/时区/启用；cron 或时区实际变化时重算 `nextRunAt`；非法 cron → 400；未知任务 → 404。
- 新增 `DELETE /automations/:id`：无运行历史 → 物理删除；有运行历史 → 409"已有运行历史，请改用停用"。
- 新增 `POST /automations/:id/run`：立即执行一次；绕过启用与交易日检查；照常走执行锁、运行历史与重试；失败返回原始错误信息；不产生失败通知。
- 调度执行失败新增失败通知投递（subject type `automation-run`，dedupKey `automation-failure:{jobId}`）。
- 桌面端无新增 HTTP 契约；消费既有 `POST /automations/workflows/close-snapshots`。
- 既有 `PATCH /automations/:id/enabled`、`GET /automations`、`GET /automations/history`、全部 workflow 端点行为不变。

## 数据、状态或兼容性影响

- 不改 Prisma schema，无迁移；存量任务行为不变。
- 删除语义变化：新增 409 应用层语义（与库约束对齐）；无历史任务可物理删除。
- 失败通知会产生 subjectType `automation-run` 的投递记录；无可用通知 Provider 时不产生记录。
- 编辑后 `nextRunAt` 立即按新 cron 重算（含停用任务；调度仍不执行停用任务）。
- 桌面端任务类型补充 `cron`、`timezone` 只读字段（列表接口已返回），无兼容风险。

## 测试策略

### 关键可观察行为

- run-now 与调度路径对停用、休市任务的行为差异（绕过 vs 跳过）。
- 编辑 cron 后 `nextRunAt` 与新 cron 一致；非法 cron → 400 而非 500。
- 有运行历史的任务删除 409，无历史任务删除成功。
- 调度失败入队失败通知且 dedupKey 固定为任务粒度；冷却窗口内不重复；手动 run-now 失败不入队。
- 收益页空状态一键快照产生第一个资产曲线数据点。
- 历史任务列显示任务名；类型/状态/健康/投递状态/错误码/数据质量级别中文化。
- 页面头部结构与刷新按钮刷新中状态。

### 优先测试层级

- 服务端：automation 运行时测试（内存假件）覆盖 update/delete/run 与通知接线；HTTP 校验与错误映射测试覆盖 400/404/409；通知运行时测试回归冷却语义。
- 桌面端：组件渲染与源码合同测试覆盖编辑器契约、标签映射、页面接线；api 函数层断言请求契约。

### 可复用的现有测试入口

- `apps/server/test/automation-runtime.test.ts`（内存假件，执行/调度/通知接线）
- `apps/server/test/automation/services.test.ts`（纯函数：cron 计算、重试、跳过语义）
- `apps/server/test/http-validation.test.ts`（HTTP 校验与错误映射）
- `apps/server/test/notification-runtime.test.ts`（通知冷却/路由回归）
- `apps/desktop/test/ui-contract.test.tsx`（页面结构合同）
- `apps/desktop/test/performance-ui.test.tsx`（收益页组件与 api 契约）
- `apps/desktop/test/refactor-contract.test.ts`（查询键契约）

### 需要新增的测试入口

- `apps/desktop/test/providers-automation-ui.test.tsx`（自动化编辑器契约与标签映射）。其余复用现有入口。

### 关键边界与回归场景

- 失败通知 helper 自身异常不得替代或吞掉原始执行错误。
- 先查后删与外键约束的并发窗口以 409 呈现。
- croner 对非法 cron 的抛错必须映射 400 而非 500。
- 编辑模式任务类型禁用；删除确认与 409 文案原样透出。
- 无通知 Provider 配置时失败路径静默（不报错、不产生投递记录）。
- 收益页空状态在当前模式无账户时按钮禁用。

## 风险与备选方案

- 删除采用"先查后删 + 库约束兜底"而非级联删除历史：运行历史是审计事实，不可随任务删除；级联删除备选被否。
- 失败通知挂在调度层入口 catch 而非调度器循环 catch：手动与工作流路径不会误发通知，无需在 helper 内区分来源；代价是运行记录落库前的病态失败（如任务已被并发删除）不通知，可接受。
- cron 合法性完全依赖 croner：croner 对手写表达式较宽容，语义误配仍可能；编辑器提供两个常用预设降低手写比例，且服务端以"能否算出下一次执行时间"为判定标准。
- 不暴露 retry/lockTtl/timezone 编辑：收敛误配面；确有需求时以本 Spec 修订扩展，不在本次实施中夹带。

## 未决问题

### Blocking

无。

### Non-blocking

- 失败通知的冷却/投递重试参数未单独定案，默认沿用现有风险通知策略（cooldownMinutes 30、maxAttempts 3）；影响边界仅为失败通知的重复频率与投递重试次数。
- 收益页一键快照在当前模式无账户时的表现未单独定案，默认禁用按钮；影响边界仅为空状态按钮的可用性。
- （2026-09-06 实测发现）收益页默认"全部账户"视图的组合资产曲线按既有读模型语义只读取 `accountId` 为空的聚合快照，本 Spec 设计的逐账户拍摄不会点亮该视图的曲线；选择具体账户后曲线正常出现数据点。默认维持逐账户拍摄不变。**已立项跟踪：见 [`2026-09-07-portfolio-aggregate-snapshot.md`](2026-09-07-portfolio-aggregate-snapshot.md)（待定案）。**

## 验收标准

- AC1：在 Provider 页通过"新建任务"创建 snapshot（估值快照）任务后，任务表出现该任务且 `nextRunAt` 与所选 cron 一致。
- AC2：停用任务可"立即运行"并写入成功的 `AutomationRun`；调度仍不执行停用任务；run-now 绕过交易日检查（休市日也能拍估值快照）。
- AC3：有运行历史的任务删除返回 409"已有运行历史，请改用停用"且前端原样透出；无运行历史的任务删除后不再出现在任务表。
- AC4：编辑 cron（预设或自定义）后任务 `nextRunAt` 按新 cron 重算；名称与启用可编辑并生效；任务类型在编辑器中禁用，更新接口不接受类型变更。
- AC5：调度执行失败产生失败通知（正文含任务名与错误摘要），冷却窗口内同一任务不重复通知；手动 run-now 失败不产生通知。
- AC6：收益页空状态"立即拍一个估值快照"后，资产曲线出现第一个数据点（快照按当前页面数据模式拍摄；≥2 个快照后出现收益率）。
- AC7：运行历史"任务"列显示任务名（查不到回退 jobId 前 8 位）；任务类型、运行状态、健康状态、通知投递状态、错误码、数据质量级别均为中文；market 类任务注明"休市日自动跳过"。
- AC8：Provider 页头部为其他模块通用的标准 page-header 结构：右上角"新增或更新 Provider"主按钮与 ghost 刷新按钮（刷新中旋转并禁用）。
- AC9：服务端与桌面端测试全绿：服务端覆盖 update 重算、delete 409、run-now 绕过检查、调度失败入队通知且手动不入队；桌面端覆盖编辑器契约与标签映射。
