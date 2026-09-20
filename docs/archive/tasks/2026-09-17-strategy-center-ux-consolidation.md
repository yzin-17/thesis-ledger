# 策略中心统一交互与回测结果体验优化实施任务

> 任务标识：strategy-center-ux-consolidation
> 首次日期：2026-09-17；文档修订：2026-09-19
> 对应 Spec：[统一交互与回测结果体验优化](../../specs/2026-09-17-strategy-center-ux-consolidation.md)
> 状态：T00—T16 与 G1—G3 已完成；运行中任务直达终态、151 条历史分页、新建策略成功回测、浏览器历史与错误边界故障注入，以及真实风险启用保留为用户确认接受的验证边界。
> 本次修订范围：根据运行反馈将已有版本编辑改为保留源详情的右侧 Drawer；修复 Provider 响应消费、AI 完整策略输出与可比数据指纹，并通过正式 infra 快更入口同步 Server/Worker、执行 G2 目标数据库/API 验收；未提交 Git，容器更新仅位于可写层。

## 1. 实施边界与事实基线

本任务消费 Spec 的 D-01—D-25、AC-01—AC-30 和第 4 节逐页交互设计，不另立第二套业务规则。采用一份统一 Spec，是因为策略版本身份、实验采纳、回测读取和风险应用共同组成同一用户工作流；实现按可独立验证的职责拆开。

自然语言编写由独立的[实施任务](../../tasks/2026-09-18-natural-language-strategy-authoring.md)负责。本主题 T01 提供可扩展来源读取契约，T07 提供独立创建页与版本导航接入点；其手动创建和实验路径不依赖自然语言功能全量完成。新增 AI 辅助创建来源及对应入口启用由关联任务接入，未接入前不展示不可用的生成动作。

2026-09-18 的基线已完成只读运行态补充：既有 Desktop 依靠长页面与弹窗，AI/Risk 只接收定义格式 V2；实验名称与完整分页、测试揭示读取保护、费用币种及同源应用判重存在契约缺口。随后目标 Docker 已用当前工作树完整构建，Server、Worker、数据库、Redis 与 DSA 健康；真实 Provider 已调用但未返回可消费候选，浏览器行为仍未验证。

2026-09-19 用户运行截图确认策略详情页头层级松散、默认摘要信息密度低、版本触发器回显内部 UUID，`v1` 与“正式 V2”并列造成概念混淆；用户同时确认风险生成采用 Drawer。源码诊断确认当时根节点使用声明式 `BrowserRouter`，而 `StrategyEditorPage` 与 `StrategyExperimentCreatePage` 在渲染时调用 Data Router 专属 `useBlocker`，会在首屏前抛错。后续源码已完成 Data Router、摘要、风险 Drawer 与编辑 Drawer 修订，但浏览器复验仍归 G3，不能把本地自动化当作实际窗口证据。

工作树已有其他任务修改，包括 Server 回测/优化、Desktop 行情和文档索引。实施前记录相关差异和输入版本，不回滚、覆盖或提交这些既有修改。仅修改本任务拥有的职责；触及大文件时按领域职责提取，遵守文件尺寸 ratchet。

### 验证顺序

定向测试 → 受影响包测试及 build/typecheck → 仓库门禁 → 隔离数据库/API → 目标 Docker → 浏览器。低层失败时停止依赖该结果的高成本检查；本地与线上证据分别记录。

涉及数据库与执行生命周期的工作按“状态与读取契约、执行面、消费面、部署验收”列出，不能合并为单一交付。各任务保有自己的测试；G1/G2/G3 验收跨组件事实，不接收缺失核心功能。

## 2. 任务与依赖

### 状态、持久化与读取契约

- [x] T00：建立实施基线与契约清单
  - 覆盖：AC-01—AC-27 的前置盘点，不据此宣布这些 AC 已通过；AC-28—AC-30 的增量基线由 2026-09-19 修订记录补充。
  - 依赖：无。
  - 范围：记录相关 dirty diff、实际路由/调用方、Schema/API/数据库结构、共享类型、现有组件与图表依赖；只读盘点历史 V1、缺失元信息、已揭示/访问但未揭示实验、重复风险应用和混币种费用。
  - 完成条件：建立“已有复用/本轮新增/历史降级”映射；固定页面路由、旧入口映射与明确版本定位方式。数据盘点无法完成时停止依赖历史判断的迁移及保护切换，不推断可以清理历史。
  - 验证：核对实际代码入口、只读数据统计和至少一个历史代表样本；输出只保留计数、状态与必要脱敏证据。确认实验读取、回测直链、列表摘要和导出所有旁路。
  - 产出：更新本任务的基线与接口责任表；不改动产品语义。发现超出 Spec 的决策先返回 Spec，不由调用方临时猜测。

### T00 只读盘点结果（2026-09-18）

#### 版本与工作树定位

| 定位项         | 已核对事实                                                                                                                                                                                                                                                                             | 证据边界                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 源码输入       | ThesisLedger `HEAD=8648d006895e175913db33d52e1f198fe534c96d`（`8648d00`）；工作树 55 条未提交路径。相关 dirty diff 包括 Server `backtest`、`strategy-optimization`、`ai/provider-adapters`，以及其他行情/文档任务；没有 Desktop `features/strategy` 或 `features/risk` 的 dirty diff。 | 这是工作树静态基线；未提交改动不能用提交 SHA 代表完整源码。              |
| 数据库结构输入 | `node scripts/check-migration-matrix.mjs`：11 条 migration、65 张 SQL 表、58 个 Prisma model、7 张 raw-owned 表，head=`20260916100000_remove_legacy_market_bar`；目标库 `SchemaVersion` 同为该 head。                                                                                  | 只读结构核对，不执行迁移、不证明应用行为。                               |
| 目标运行态     | `thesis-ledger:dev` 镜像 `sha256:08215d2296e25669a54355107615adf6b3cab573a13aae4281bdd0fcfc9fe90d`，创建于 2026-09-17T10:45:51Z；Server/Worker/PostgreSQL/Redis 均 healthy。`GET /api/v1/health` 返回 `healthy`；API 前缀为 `/api/v1`。                                                | 健康状态不证明目标镜像包含当前未提交代码，也不替代浏览器/Provider 验收。 |

#### 页面路由、旧入口与版本定位

| 当前入口                             | 实际实现                                                                                                             | 旧入口/旁路                                                                                                  | 本轮定位约束                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `/strategy`（导航名称“策略实验”）    | `AppRoutes` 渲染 `StrategyDashboard`；`?tab=library                                                                  | jobs                                                                                                         | optimization`只切换策略库、回测任务、AI 策略实验。策略实验内另有`ai                | risk` Tabs。 | 无策略详情、实验详情或回测详情 URL；结果仍由 `StrategyResultDialog` 弹窗承载。 | T07/T09/T11 必须用稳定 strategy/version/job/experiment 标识定位；不能以当前列表内存对象或“最新版本”补全。 |
| `/risk-center`（导航名称“风险中心”） | `RiskCenter` 保留总览、规则、策略应用、事件、通知等 Tabs。策略应用区来自 `strategy-optimization/risk-applications`。 | 首次引导进入 `/risk-center`；风险中心当前“打开策略”跳转 `/strategy?tab=optimization`。没有旧版本参数解析器。 | T10 只能保留一个版本风险应用入口；旧链接无法解析时必须明确失败，不能猜测最新版本。 |
| 根路径与未知路径                     | `/` 和 `*` 均重定向 `/portfolio`。                                                                                   | 没有策略中心旧 URL alias。                                                                                   | 版本地址需在保存/刷新/直接打开后仍指向明确 ID；现有 `?tab` 不是对象身份。          |

版本身份的现有事实是 `Strategy.id` → `StrategyVersion.id`（同一策略内 `version` 唯一）；`BacktestJob.strategyVersionId`、`OptimizationExperiment.baselineStrategyVersionId`、`OptimizationCandidate.candidateStrategyVersionId` 和 `StrategyRiskApplication.strategyVersionId` 均应沿用这些稳定 UUID。V2 正式版本的 Server 门槛是 `schemaVersion=2` 且 `version>0`；实验候选的版本行可以是 `version<=0` 的 `experiment-only`，不能当作正式版本展示。

#### 已有复用、本轮新增、历史降级映射

| 领域           | 已有复用                                                                                                                                                  | 本轮新增责任（未实现）                                                  | 历史降级/保留                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 策略身份与来源 | Prisma `Strategy`/`StrategyVersion`；Desktop `StrategyRecord`/`StrategyVersion`；创建和创建新版本 API。                                                   | T01/T07/T09 补可读名称、来源联合类型、明确版本详情与来源反链。          | 缺少来源或元信息时显示明确“未知/不可用”及原始 ID；不回退到最新版本。                   |
| 实验读取与揭示 | `OptimizationExperiment`、`OptimizationCandidate`、`OptimizationAttempt`；`GET .../experiments/:id` 与 `/compare`；测试结果由 `testExposedAt` 持久化。    | T01/T02/T06/T09 补完整分页、统一揭示可读性字段、直链与 compare 的保护。 | `testExposedAt` 缺失或未揭示时不返回测试结论；已揭示历史保留可读；未知来源单独标记。   |
| 回测与结果     | `BacktestJob` V1/V2 共用表；`BacktestResultV2` 已定义 `equityCurve`、可选 `drawdownCurve`、metrics/warnings/rejectedOrders；V2 run 有 snapshot/checksum。 | T02/T11/T12/T13 补独立详情、结果语义、分页明细、图表联动和白名单导出。  | V1 若历史存在则保留原能力并标注限制；结果/元信息缺失显示不可用，不补零、不猜策略来源。 |
| 风险应用       | preview hash、revision、enabled、notification、upgrade preview/upgrade API；raw-owned 表由服务层管理。                                                    | T05/T10 补同源身份判重、停用保存、启用冲突和多条历史选择。              | 历史重复全部保留并可选；归档不自动恢复；当前无记录不能推断未来唯一约束安全。           |
| 费用与币种     | `modelConfig`、`runConfig.baseCurrency`、budget、AI attempts 的 cost 字段；Server 能返回 cost unknown。                                                   | T04/T08/T09 补费用币种快照、未知费用确认和同币种硬限制。                | 历史混币种/未知费用按“部分已知/不可确认”展示，不换汇、不把零费用推断为免费。           |
| 图表           | Desktop 现有 `StrategyResultDialog` 从 `equityCurve` 派生回撤并用 inline SVG 绘制；依赖中已有 `lightweight-charts`，但现策略结果未复用它。                | T12 新增真实时间对齐、权益/回撤联动、缩放/平移和分页明细适配。          | 无 `drawdownCurve` 或缺口证据时按事实降级，不猜断点、不构造占位线。                    |

#### Schema、API、数据库与共享类型责任

| 责任面                | 权威入口/对象                                                                                                                   | 当前语义与调用方                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop 路由与页面    | `apps/desktop/src/app/routes.tsx`、`views.ts`、`features/strategy/*`、`features/risk/*`                                         | `/strategy` 由 `StrategyDashboard` 统一拉取策略与回测摘要；`/risk-center` 由 `RiskCenter` 拉账户/组合并消费风险 API。TanStack Query 已用于现有读取。                                                                    |
| Desktop 策略/回测 API | `features/strategy/strategy.api.ts`、`strategy.queries.ts`                                                                      | `GET /backtests/strategies`、`GET /backtests/jobs/summary`、`GET /backtests/jobs/:id`；创建策略/版本，V1 jobs 与 V2 runs 的 queue/run/cancel/retry。                                                                    |
| Desktop 实验/风险 API | `features/strategy/strategy-optimization.api.ts`、`StrategyOptimizationExperimentPanel.tsx`、`StrategyRiskApplicationPanel.tsx` | capabilities、parameters、monitoring-plan、experiments list/detail/compare/create/clone/cancel/finalize/adopt；risk application preview/create/list/update/upgrade。当前实验列表固定请求 `limit=50`。                   |
| Server 执行面         | `apps/server/src/backtest/backtest.controller.ts`、`backtest.service.ts`、`backtest-v2-run.ts`                                  | `/api/v1/backtests/strategies`、`/jobs`、`/jobs/summary`、`/jobs/:id`、`/runs/:id` 及运行控制；列表过滤掉 `status='experiment-only'` 的策略。                                                                           |
| Server 实验/风险面    | `strategy-optimization.controller.ts`、`strategy-optimization-read.service.ts`、`strategy-risk-application*.ts`                 | `/api/v1/strategy-optimization/experiments*`、`risk-applications*`；实验读取按 `ownerKey='local-user'`，当前未提供统一揭示门禁。                                                                                        |
| 共享契约              | `packages/schemas/src/backtest-v2.ts`、`strategy-optimization.ts`                                                               | `StrategySchemaV2`、`RunConfig`、`BacktestResultV2`、`MonitoringPlan`、实验创建/状态/阶段/采纳契约；`StrategyRiskApplication` 返回类型目前位于 Desktop API 文件。                                                       |
| 持久化结构            | `apps/server/prisma/schema.prisma`；全部 `apps/server/prisma/migrations/*/migration.sql`                                        | Prisma 管理 `Strategy`、`StrategyVersion`、`BacktestJob`；`raw-owned-tables.json` 管理 `StrategyRiskApplication`、`OptimizationExperiment`、`OptimizationCandidate`、`OptimizationAttempt`、`OptimizationAdoption` 等。 |

#### 读取与导出旁路清单

| 旁路           | 当前入口                                                                                                                                                                                              | 保护/缺口结论                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 实验读取       | Desktop 实际消费 `/experiments?limit=50` 与 `/experiments/:id/compare`；`fetchOptimizationExperiment` 已定义但当前无调用方；Server 另有 `/experiments/:id` 返回 experiment/candidates/attempts。      | T02 已在 get、compare 和详情直链统一返回 `readEligibility`，访问事实不再替代揭示证据；未来新增入口仍须复用该契约。 |
| 回测直链       | `GET /backtests/jobs/:id` 与 `GET /backtests/runs/:id` 均可由已知 ID 直接读取；实验候选/基线的 `runRefs` 只在 compare 响应中返回。                                                                    | T02 已覆盖已知 runId、摘要、分组、SSE 与运行控制响应；图表/结果消费者仍由 T11 接入，不依赖列表是否可见。           |
| 列表摘要与分组 | `GET /backtests/jobs/summary` 返回服务端摘要并经 T02 读取门禁；Desktop `StrategyJobs` 仅在客户端将 job 绑定到已拉取策略版本，未按实验分组；实验列表由 Server `createdAt DESC,id DESC` 且最多 100 条。 | 不能对前 50/100 条做伪分页或把候选回测当普通任务；T01/T08/T11 负责服务端分页、筛选与实验分组契约。                 |
| 导出/备份      | `/api/v1/exports/account` 及 Automation `backup` 复用 `DataExportService`；导出包含 `strategies`/`versions`，不包含 `BacktestJob`、Optimization* 或 StrategyRiskApplication。                         | 当前没有策略结果专用导出，但未来 T13 的白名单必须复用揭示门禁，不能把全量 JSON、日志或 Provider 凭证带出。         |

#### 目标开发库只读统计与脱敏样本

目标为容器内 `thesis_ledger`，当前用户 `thesis_ledger`；仅执行 SELECT，未写入数据库、未迁移、未启停容器。

| 对象/问题                  |                                                                                                                                    只读统计 | 解释边界                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------: | --------------------------------------------------------------------------------------------------------------- |
| Strategy / StrategyVersion | 17 / 22；Strategy 为 `draft=1`、`experiment-only=16`；版本全为 `schemaVersion=2`，其中 `version>0` 正式 2 条、`version<=0` 实验候选 20 条。 | 当前库无 V1 行，不能据此证明历史全量无 V1。运行 API 返回 1 条策略与 DB 总数一致于过滤掉 16 条 experiment-only。 |
| BacktestJob                |                                                                               56；全为 V2；`succeeded=47`、`failed=9`；9 条 `result` 缺失。 | 当前库未发现 V1；缺失结果是失败/未产物事实，不把成功状态外推为完整结果。                                        |
| OptimizationExperiment     |      16，全部 `sourceMode=discovery`；`failed/failed=15`、`succeeded/completed=1`；`testExposedAt` 已设置 1、未设置 15；锁定 1、未锁定 15。 | 当前库没有 existing 实验样本，也没有名称字段；来源缺失、owner 缺失、baseline 缺失均为 0。                       |
| Candidate / Attempt        |                                                                                           4 / 19；Candidate `invalid=3`、`test_invalid=1`。 | 4 个候选均有 metrics、runRefs 与 candidateStrategyVersionId；`test_invalid` 仍不可视为可采纳。                  |
| StrategyRiskApplication    |                                                                                                        总数 0；启用 0；未归档重复身份组 0。 | 无法提供历史重复风险应用样本；不得据此提前建立会排斥历史重复的唯一约束。                                        |
| 费用/币种                  |                16 个实验均有 `costUsed`（当前最小/最大均为 0）；16 个 `runConfig.baseCurrency` 均为 CNY；21 条模型路由均缺 `costCurrency`。 | 当前库没有混币种样本；零费用不等于免费，未知 `costCurrency` 仍应按未知费用处理。                                |

脱敏代表样本（ID 仅为 `md5(id)` 前 8 位）：已揭示实验 `9a06c9e6` 为 `succeeded/completed`，已锁定、1 个模型路由、CNY、1 个候选；其候选 `14fee90e` 为 `test_invalid`，但 metrics/runRefs/策略版本引用均存在。未揭示失败实验 `99df83f7` 为 `failed/failed`、未锁定、未揭示；候选 `eb1e19b7` 为 `invalid`，同样有 metrics/runRefs/策略版本引用。回测样本 `50e4b3b2` 为 V2 `succeeded` 且 result/diagnostics/snapshot 均存在；另有结果存在但 diagnostics 缺失的 V2 记录，故缺失元信息不能由状态标签掩盖。上述样本不包含账号、策略名、标的、凭证或完整 UUID。

T00 结论：已满足“代码入口与调用链、接口责任、旁路清单、版本定位、只读统计及至少一个脱敏代表样本”的完成条件，故勾选 T00。V1、重复风险应用、混币种费用在当前目标库均为 0，后续实现只能保留对应历史兼容分支和测试夹具，不能把 0 条样本写成已验证支持；若迁移或读取保护需要这些事实，先用受控 fixture/隔离数据库补证据。

- [x] T01：补齐实验身份、来源及完整分页读取
  - 覆盖：AC-02（来源读取）、AC-07、AC-11、AC-23（名称、分页、分组生产者）。
  - 依赖：T00。
  - 范围：实验名称创建/修改、历史降级、克隆名称；正式版本/候选/阶段精确来源；策略相关记录查询；服务端筛选分页及用户任务/实验分组读取。所有来源关联由稳定标识完成，避免逐行查询。
  - 完成条件：超过 100 条记录可遍历；相同创建时间以稳定 ID 排序；按筛选后的完整集合分页、分组，实验组可展开完整成员；候选不会伪装成正式版本。新增名称不改写冻结结果。
  - 接口契约：固定名称校验、更新响应、来源联合类型、分页参数及下一页语义；分组与成员的排序、筛选和计数遵守 Spec。消费者共享 Schema/类型及同源契约 fixture。
  - 来源交接：与自然语言编写任务 T04 确认来源扩展边界；实验采纳有实验/候选引用，AI 辅助创建有编写来源引用，历史未知独立降级。此交接不要求 T01 实现编写草稿或调用模型。
  - 验证：名称保存/刷新/改名/克隆、历史无名称、151 条实验、跨页同时间记录、筛选匹配和完整组成员；隔离 PostgreSQL 验证新增迁移及历史数据保留。
  - 结构门禁：同步 migration matrix、raw-owned inventory（实际受影响时）、runtime 打包与结构检查；不修改历史 migration，不运行默认清库。

#### T01 实施状态与证据（2026-09-18）

已完成并勾选。当前代码新增实验名称 nullable migration（保留历史无名称记录）、创建/改名/克隆名称契约与历史降级名称；实验读取通过正式策略版本联表或 discovery 来源联合类型返回稳定身份，候选返回独立候选来源和阶段。`GET /strategy-optimization/experiments` 支持 `search/sourceMode/status/strategyVersionId`、`createdAt + id` 游标、完整筛选计数和 `pageInfo`；`GET /strategy-optimization/backtests/groups` 以一次任务查询和一次来源关联查询生成用户任务/实验组，按完整集合筛选、分组和分页，返回完整成员及候选关系，未把候选标作正式版本。Desktop API 已消费分页 `items`，并提供改名及分组生产者契约；未进入视觉、揭示、采纳、费用或风险语义。

| 证据项           | 结果                                                                                                                                                                                                                                                                                                                                                                     | 边界                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 共享 Schema/类型 | `packages/schemas` 定向测试通过（20 files / 182 tests）；名称 trim/max、改名、正式来源/候选来源联合类型有契约用例。                                                                                                                                                                                                                                                      | 仅契约与单测，不证明数据库已升级。                                                                                                    |
| Server/读取      | Server 与 Desktop `tsc --noEmit` 通过；新增读取单测验证 151 条同创建时间记录可跨页遍历、稳定 ID 无重复、完整计数、历史名称降级及 discovery 来源。                                                                                                                                                                                                                        | 使用 mock Prisma；不替代 PostgreSQL。全量 Server Vitest 曾受既有平台测试基线影响，已同步更新该测试对新增 migration 的计数/head 期望。 |
| 结构门禁         | `pnpm migration:matrix` 通过：12 migrations、65 SQL tables、58 Prisma models、7 raw-owned tables，head=`20260918090000_strategy_optimization_experiment_name`。                                                                                                                                                                                                          | 新 migration 尚未部署到目标开发库；目标 Docker 仍是旧镜像/旧 head，不能作为 T01 验收。                                                |
| 隔离 PostgreSQL  | 通过。一次性容器 `thesis-ledger-t01-pg-20260918-0348`（PostgreSQL 17、无挂载卷）先执行前 11 条 migration，插入迁移前无名称历史行，再执行 `20260918090000_strategy_optimization_experiment_name`；历史行迁移后仍为 `name IS NULL`，名称索引存在。另以 `thesis-ledger-t01-pg-20260918-0339` 执行完整 `prisma migrate deploy`，12 条 migration 全部成功。两个容器均已删除。 | 这是一次性隔离数据库证据，不是目标开发库或部署证据。                                                                                  |

T01 的完成条件已满足：真实集成测试验证 migration 历史保留、名称 create/read/rename/clone 不改变冻结字段、正式来源联表、筛选后的完整计数、151 条同时间记录的 100+50 游标遍历，以及包含 baseline/candidate 关系的完整实验组成员。未修改历史 migration、未写目标开发数据库、未部署容器。

- [x] T02：统一封存结果读取门禁
  - 覆盖：AC-09、AC-16（导出门禁）、AC-20（读取及历史兼容）。
  - 依赖：T00；新增来源查询的接入依赖 T01 已通过的来源契约。
  - 范围：由实验状态与来源所有者提供可读性判断，覆盖 get/compare、回测详情、列表摘要/分组、图表输入与导出；检查并维护模块边界，避免 backtest 反向依赖上游优化编排层。
  - 完成条件：访问时间不等于已揭示；未统一揭示时不返回测试指标、完整产物及可推断质量结论的标签。历史明确已揭示结果继续可读；证据不明的历史返回明确限制。
  - 验证：在部分候选已落库、另一候选仍运行/技术失败时逐入口请求；直链已知 runId、摘要排序/计数和导出都不能旁路。已揭示历史仍能查询。
  - 契约就绪里程碑 M-揭示：可读性字段、限制原因、受保护响应及权威 fixtures 通过测试后，T09/T11/T13 可使用；运行时发布还需 T06 和 G1。

#### T02 实施状态与证据（2026-09-18）

已完成并勾选。`packages/schemas` 新增 `ResultReadEligibility` 及稳定限制码：`READABLE`、`TEST_NOT_REVEALED`、`HISTORICAL_REVEAL_UNKNOWN`、`RUN_NOT_ASSOCIATED`。策略读取和回测读取共用 `ResultReadPolicyService`；`testExposedAt` 只作为访问时间，只有 `exposure.testRevealed=true` 才开放测试结果。未揭示时删除测试 `runRefs`/metrics、完整回测产物、checksum/snapshot/diagnostics、测试质量标签及预选候选；已揭示结果继续可读；历史证据不明明确返回限制码。内部执行仍使用未保护的 `status()` 事实读取，HTTP 详情及运行控制响应使用保护读取，避免门禁反向影响 T06 执行面。生产模块将读取策略作为必需依赖，HTTP/SSE 不再在策略缺失时回退原始结果；策略查询同时核对持久化回测来源和实验引用，候选或基线缺失引用时均 fail-closed，只有明确普通正式回测才可使用 `RUN_NOT_ASSOCIATED`。

保护入口已覆盖：实验 get/compare、候选/基线测试引用和指标、`GET /backtests/jobs/:id`、`GET /backtests/runs/:id`、jobs/jobs summary、T01 实验回测分组、SSE 更新、V1/V2 运行控制响应，以及现有导出中的稳定省略码 `BACKTEST_RESULTS_REQUIRES_REVEAL` 与 `OPTIMIZATION_TEST_RESULTS_REQUIRES_REVEAL`。分组与批量摘要使用一次关联查询，未逐行查询；backtest 核心未反向 import strategy-optimization。

| 证据项                   | 结果                                                                                                                                                                                                                                                                                                                                                      | 边界                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Schema/Server/Desktop    | `packages/schemas` 20 files / 184 tests 通过；Server 读取策略、必需依赖 wiring、导出及受影响回测服务定向 13 files / 44 tests 通过，另有隔离集成 3 tests 通过；Server 与 Desktop `tsc -p tsconfig.json --noEmit` 通过。                                                                                                                                    | 不代表目标镜像已包含本次源码，不替代浏览器验收。                                             |
| 隔离 PostgreSQL 读取集成 | 通过。唯一临时容器 `thesis-ledger-t02-pg-20260918-1453` 应用全量 12 migrations（含 `20260918090000_strategy_optimization_experiment_name`），使用该容器自动生成的临时存储，测试后连同容器精确删除；3 tests 覆盖部分批次 peer 运行、技术失败、get/compare/groups、已知 run 直链、显式揭示后读取，以及删除候选/基线引用后仍依据持久化优化来源 fail-closed。 | 只证明一次性隔离数据库和 Server service 读取契约；未写目标开发库，未执行 T06 自动揭示/重试。 |
| 仓库门禁                 | `node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs`、`pnpm migration:matrix` 通过（12 migrations，head=`20260918090000_strategy_optimization_experiment_name`）；`git diff --check` 通过。                                                                                                                               | 目标 Docker 仍是旧镜像/旧 head，G1/G2/G3 保持未勾选。                                        |

T02 的完成条件已满足：读取权限以显式揭示证据为准，所有已盘点旁路有服务端保护，受保护响应有稳定码，历史未知不猜测；生产 wiring 缺失策略时 fail-closed，不存在原始结果回退；隔离 PostgreSQL 证明未揭示/运行中/技术失败/已揭示四类读取边界，以及候选和基线 runRefs 缺失时的持久化来源保护。M-揭示契约可供 T09/T11/T13 消费；运行时发布和实际状态推进仍依赖 T06 与 G1。

- [x] T03：实现旧基线确认后的原子采纳
  - 覆盖：AC-02—AC-04、AC-21。
  - 依赖：T00；来源返回接入 T01 契约。
  - 范围：区分实验基线和用户确认的当前正式版本；为采纳提供原基线/当前版本/候选差异上下文；原子校验当前版本、候选哈希及采纳资格，创建原策略新版本。
  - 完成条件：v2 实验面对 v3 经明确确认可追加 v4；不合并 v3、不改旧版本或风险应用。确认后再次变化拒绝旧意图，要求重新审阅；同意图并发/响应丢失重试返回同一版本。首次与幂等重放响应结构一致。
  - 验证：隔离 DB 的并发版本创建、相同和不同采纳意图竞态、哈希改变、测试未完成、已采纳候选、从零采纳及响应重放；检查来源反向关联和已有应用保持不变。
  - 契约就绪里程碑 M-采纳：确认上下文、提交前置条件及错误结构通过共享契约测试，供 T09 使用。
  - 实施证据（2026-09-18）：新增 `20260918153000_strategy_optimization_adoption_context` migration，持久化实验原基线与确认时当前正式版本；`OptimizationAdoptionContext` 返回原基线/当前版本/候选三方快照及差异。采纳在 PostgreSQL 事务内按幂等键与策略锁定、重读并校验来源、揭示资格、候选完整定义哈希和当前版本，再条件写入新正式版本与来源反链；结构化错误覆盖未揭示、不合格、哈希/来源不一致、过期基线、已采纳及幂等冲突。
  - 隔离验证（2026-09-18）：一次性无卷容器 `thesis-ledger-t03-pg-20260918-1600` 应用全部 13 条 migration，T03 集成测试 3/3 通过，覆盖三方上下文、正数版本排除候选版本、相同意图并发深相等重放、同幂等键不同确认版本冲突、不同意图竞态、未揭示/不合格/哈希变化、从零采纳、来源反链及旧版本保留；真实 `StrategyRiskApplication` 绑定当前正式版本的字段快照在采纳前后保持一致且未改指向；容器已精确删除，目标开发库未写入。
  - 定向门禁：Schema/Server/Desktop 类型检查、采纳单测（2 tests）、边界/工作区依赖检查与 `git diff --check` 通过；migration matrix 的 13 条 migration 证据沿用未变输入；目标运行态仍未验证，G1—G3 保持未勾选。

- [x] T04：约束费用币种与未知费用预算
  - 覆盖：AC-08、AC-22。
  - 依赖：T00。
  - 范围：创建/确认时快照已知币种与计费状态；已知异币种拒绝同实验；费用或币种未知时拒绝总金额上限并要求明确确认。读取区分已知部分、未知及不可确认的历史合计。
  - 完成条件：只有全部费用与币种已知且同币种时开放总金额限制；服务端预留、结算及其他硬限制持续生效。改变相关模型/预算后确认失效；不根据模型名称推断免费。
  - 验证：同币种、多币种、未知价格、未知币种、明确零价、模型变化、历史混币种；真实预算预留/结算路径验证调用、Token、回测、时长上限，不能只测表单禁用。
  - 契约就绪里程碑 M-费用：校验与读取字段、确认失效规则及权威 fixtures 通过后供 T08/T09 使用。不新增汇率换算。
  - 实施证据（2026-09-18）：冻结 `costStatus`、`costCurrency`、`pricingVersion`；已知计费路由要求单一币种，未知价格/币种关闭总金额上限但保留其他硬上限并要求显式确认；明确零价仍要求币种；读取区分完整单币、部分已知+未知、历史混币/不可确认，禁止换汇或混加；模型、路由、预算及 `maxRounds` 变化使确认失效。
  - 定向验证：Server 成本/预算测试 11/11 通过；受影响 Server 测试 7 files/34 tests、Schemas 20 files/185 tests、Provider metadata 9 tests 通过；Schema/Server/Desktop typecheck、Server build、boundary/workspace/migration matrix、Prettier 与 `git diff --check` 通过。
  - 隔离 PostgreSQL 验证：一次性无卷 PostgreSQL 17 容器应用全部 13 条 migration，T04 reserve/settle 集成测试 2/2 通过，覆盖已知费用、零价、币种不匹配、未知结算和其他硬限制；容器已精确删除，未写入目标开发库。
  - 证据边界：在线 Provider、目标 Docker 运行态、浏览器/真实凭据及 G1—G3 未在本 T04 范围内验证，仍保持未勾选。

- [x] T05：收敛风险应用身份与启用冲突
  - 覆盖：AC-05—AC-06（服务端）、AC-24。
  - 依赖：T00；源版本展示接入 T01 来源契约。
  - 范围：复用现有停用保存、预览哈希和修订检查；相同未归档策略版本/账户/标的/范围跨会话判重，通知不属于身份；维持账户/标的单启用。
  - 完成条件：同源已有记录返回查看/显式编辑信息；启用冲突可保存停用而不替换旧应用。历史重复全部可访问，列出供选择，不自动更新某一条、合并或删除；归档记录不自动恢复。
  - 验证：隔离 DB 下并发重复保存、不同版本/范围同时启用竞态、过期预览/修订、停用保存后重新进入、通知变化及历史重复夹具；源版本升级遇到已有同源目标时返回管理入口，不覆盖目标。验证数据库级或等价事务保护，不能仅依赖预查询。
  - 迁移约束：先执行 T00 历史盘点；采用保留历史、约束新写入的方案，不直接施加会因存量重复失败的全量唯一索引。新增结构同样维护全部结构门禁。
  - 实施证据（2026-09-18）：以 `strategyVersionId + accountId + symbol + cycleMode` 作为未归档同源身份，使用事务级 advisory lock 串行化新写入并保留全部历史重复；通知配置不参与身份。账户/标的启用切换使用独立事务锁，冲突返回已有应用管理入口并允许失败方显式保存为停用；同源已有记录、历史歧义、归档记录及升级命中已有目标均返回结构化查看/编辑入口，不自动覆盖、合并、删除或恢复。
  - 隔离 PostgreSQL 验证：一次性无卷 PostgreSQL 17 容器应用全部 13 条 migration，显式启用 `RUN_STRATEGY_CENTER_T05_POSTGRES_E2E=1` 后 5/5 tests 通过，覆盖并发同身份创建、通知变化、跨版本/范围单启用竞态与停用保存、过期 preview/revision、历史重复含归档记录可见且歧义拒绝、升级命中已有目标不覆盖。测试曾真实暴露 advisory lock `void` 反序列化问题，修复为显式 `text` 返回后重跑通过；容器已精确删除，未写目标开发库。
  - 定向门禁：风险应用与数据库结构测试 14/14、Schemas 13/13、Server typecheck/build、边界、工作区依赖、13 条 migration matrix 与 `git diff --check` 通过。目标 Docker、浏览器与真实运行态仍未验证，G1—G3 保持未勾选。
  - 契约就绪里程碑 M-风险：预览、复用、多条历史选择、启用冲突、显式编辑错误结构和 fixtures 通过后供 T10 使用。

### 执行面

- [x] T06：落实统一揭示与原批次技术重试
  - 覆盖：AC-09、AC-17（实验阶段）、AC-20（执行）。
  - 依赖：T02、T04。
  - 范围：锁定、开始访问、各项完成、整批完成/揭示及技术失败恢复；保持数据库为状态事实源，按状态/attempt 原子提交，复用现有任务执行能力。
  - 完成条件：基线及全部锁定候选完成后一次性开放结果；test_invalid 是已评估结论但不可采纳。技术失败仅重试原批次未完成部分，保持候选/预选项/区间/指纹；缺失冻结依赖时阻塞。放弃保持隐藏并保留访问记录。
  - 验证：A 完成、B 技术失败；B 重试成功/重复失败；整批含不合格结果；放弃；晚到结果；冻结依赖不可访问；进程恢复后已完成部分不重跑。验证每一状态下 T02 的实际读取响应。
  - 边界：不新增任意改选、重置曝光、无限自动重试或新的队列平台；若现有执行恢复无法满足，明确补齐本任务内的有界恢复，不能改用重新生成整个实验。
  - 实施证据（2026-09-18）：最终测试原子锁定候选集合与预选项并记录首次访问；基线及候选按 `executionAttempt`、实验状态和候选状态条件提交。技术失败回到 `awaiting_finalization`，只允许同一锁定批次显式重试；已完成的 `test_valid`/`test_invalid` 及基线冻结事实不重跑，`test_invalid` 作为已评估但不可采纳结论。缺失或半损坏 runRef、metrics、数据指纹及不可访问冻结 Run 均 fail-closed；取消保留访问记录并保持未揭示；过期 attempt 的晚到结果不能覆盖新执行。
  - 隔离 PostgreSQL 验证：两次一次性无卷 PostgreSQL 17 容器均应用全部 13 条 migration；首次真实执行暴露历史 `exposure` 为 JSON `null` 时 `jsonb ||` 生成数组的问题，改为仅合并对象后复验 3/3 tests 通过。覆盖 A 完成/B 技术失败、运行中/失败/不合格各状态的 T02 详情、比较、分组与回测直链隐藏，原批次重试仅执行 B、指纹不一致收敛为 `test_invalid` 后整批一次揭示、半损坏冻结事实阻塞、取消、晚到旧 attempt、过期 lease 恢复且不重跑完成项，以及成功后实际读取开放；容器均精确删除，未写目标开发库。
  - 定向门禁：T02/T06 读取与状态机相关测试 19/19、边界、工作区依赖、13 条 migration matrix 与 `git diff --check` 通过。Server typecheck/build 当前被工作树中无关的 `test/ai/research-query.test.ts:82` 两个既有 TypeScript 错误阻塞；本次未修改该文件，T06 独立测试的 TypeScript 错误已在此前检查中清零。目标 Docker、在线 Provider 与浏览器仍未验证。

- [x] G1：早期 API 与真实领域语义闭环
  - 覆盖：AC-02—AC-04、AC-08—AC-09、AC-20—AC-22 的跨组件断言。
  - 依赖：T01—T04、T06；不等待全部 UI 或风险应用界面。
  - 责任：本主题集成负责人；入口为实验创建、执行、查询、锁定测试和采纳 API。
  - 环境：隔离 PostgreSQL、实际 Server/执行组件、可复用且受控的行情/模型输入。可以用受控输入验证真实领域路径，但必须标记为受控集成，不能声称在线 Provider 已通过。
  - 完成条件：创建实验 → 产生并持久化候选 → 验证 → 原批次封存测试 → 统一揭示 → 采纳 → 查询准确正式版本。穿插部分技术失败、旁路读取、版本冲突和幂等重放。
  - 证据：请求/响应、持久化状态与产物引用、预算和源版本关联；日志脱敏。缺少核心能力时退回责任任务，不在 G1 临时扩大实现。
  - 实施证据（2026-09-18）：新增 Controller 边界纵向集成用例，使用真实 `StrategyOptimizationController`、优化/候选/运行/读取服务、读取策略及 PostgreSQL 持久化 `BacktestJob`；外部 Provider 与行情产物使用受控确定性适配器，不冒充在线 Provider。实验创建与同 key 重放、候选生成和验证、Token/费用归集、原批次封存测试、读取旁路、采纳上下文和正式版本查询均经实际服务链路完成。
  - 故障与一致性证据：首次候选封存测试注入技术失败后，实验回到 `awaiting_finalization` 且测试结果字段从直链响应完全移除；重试只补未完成候选，已完成基线测试没有重跑。整批完成后统一变为 readable；在采纳确认后插入并发正式版本会拒绝陈旧确认，刷新上下文后生成 v3，同一采纳意图重放深相等且数据库只有一条 Adoption。
  - 隔离验证：一次性无卷 PostgreSQL 17 容器 `thesis-ledger-g1-pg-20260918a` 应用按目录排序的全部 13 条 migration；G1、T02、T03、T04、T06 联合 5 个测试文件 12 个断言通过，覆盖从零采纳、旁路保护、费用预算、原子冲突和原批次恢复。Server typecheck、G1 文件 ESLint/复杂度规则、全仓 secrets 13,939 文件扫描及 `git diff --check` 通过；临时容器已精确删除，未挂载或删除任何 volume，未连接目标开发库。
  - 证据边界：G1 证明受控输入下的实际领域闭环，不证明在线 Provider、目标 Docker 镜像、目标数据库结构、Worker 运行身份或浏览器消费；这些仍由 G2/G3 验收。

### 消费面：页面与交互

- [x] T07：策略中心导航、版本详情与编辑闭环
  - 覆盖：AC-01、AC-03（版本导航）、AC-18—AC-19、AC-26（导航恢复）、AC-27（策略页）。
  - 依赖：T00；关联数据消费 T01 已验证的来源契约。
  - 范围：全局名称与三列表入口、策略列表、独立版本详情、独立新建页、绑定版本详情的编辑 Drawer、旧入口迁移。复用 TanStack Query，按策略/版本/筛选隔离查询和失效。
  - 页面交接：向自然语言编写任务 T06 提供新建页创建方式、草稿导航和来源详情扩展点；本项先独立验证手动路径，澄清/生成/恢复行为由关联任务拥有。
  - 完成条件：默认可读策略定义；切换版本时上下文及全部动作同步；保存真实新版本后可定位；V1 现有能力保持。旧链接可解析则导向明确版本，无法解析明确说明，不猜测最新版本。
  - 验证：路由级组件集成，刷新/直接打开/前进后退、分页滚动恢复、版本切换请求竞态、未保存离开、保存失败/重复点击、V1/V2；验证标签交互规则。主题与窄屏本地检查随任务完成。
  - 边界：不在本任务中修改任务引擎、采纳或风险规则生效逻辑。

- [x] T08：AI 实验列表与三步创建
  - 覆盖：AC-07—AC-08、AC-22—AC-23（实验列表消费）、AC-27（实验列表/创建）。
  - 依赖：T07、T01、M-费用。
  - 范围：列表名称修改/筛选/分页，三步输入保留，已有策略锁定来源与全局从零入口，模型/推理能力、三段时间、资金与预算确认。
  - 完成条件：最后一步才创建；错误定位字段；未知费用确认与金额禁用、异币种拒绝、模型无 fallback。离开提示和提交幂等意图明确；名称修改不改变实验内容。
  - 验证：151 条列表、改名后刷新/克隆、步骤来回、离开/返回、模型变更使费用确认失效、连续时间边界、重复请求与响应丢失；共享契约 fixtures 和实际 API 集成分开记录。

- [x] T09：实验详情、候选比较与采纳交互
  - 覆盖：AC-02—AC-04、AC-08—AC-09、AC-17（实验）、AC-20—AC-21、AC-27（实验详情）。
  - 依赖：T08、M-揭示、M-采纳、M-费用；本地完成前 T06 已可提供实际状态。
  - 范围：候选与运行详情、基线对照、真实参数差异、阶段动作、锁定测试、部分失败重试/放弃、采纳三方差异、入库与来源反链。
  - 完成条件：只能基于服务端资格提供动作；封存前不推断质量；测试中隐藏结论；旧基线明确采用候选完整定义，不自动合并。已采纳状态与目标版本刷新可恢复，首次/重放均能正确处理。
  - 验证：全失败/部分失败/预算耗尽、测试未揭示/已揭示/不合格、当前版本两次变化、采纳响应重放、详情直接打开与链接回跳；至少一个接口级消费集成，不以静态文案检查代替。

- [x] T10：版本风险应用工作页与风险中心衔接
  - 覆盖：AC-05—AC-06、AC-24、AC-27（风险工作页）。
  - 依赖：T07、M-风险；接口联调完成依赖 T05。
  - 范围：唯一版本创建入口、账户与范围、通知控件、预览/失效、保存停用/启用、同源复用、历史重复选择及源版本追溯；删除 AI 下重复表单入口。
  - 完成条件：始终显示明确策略版本；配置变化必须重预览；冲突不静默替换；成功定位对应应用；版本升级只提示预览差异，已有规则保持原绑定。
  - 验证：配置变更后提交旧预览、重复保存、旧规则已启用、历史多条同源、通知独立编辑及旧链接迁移。真实应用启停在 G2/G3 验证。

- [x] T11：回测列表、独立详情及结果语义
  - 覆盖：AC-10—AC-12、AC-17—AC-18、AC-23（任务分组）、AC-25—AC-27（回测页面）。
  - 依赖：T07、T01、M-揭示。
  - 范围：用户任务/AI 分组列表，统一排队/运行/失败/完成详情，精确元信息及独立错误，四内容页签、紧凑核心与次要指标，再次运行。
  - 完成条件：优先真实来源、原版本/候选及执行标的；不以最新策略补历史。运行到完成主动读取完整结果，SSE 断线可恢复；重新获取数据创建新任务并明示语义；不可用值不补零。
  - 验证：直接打开运行任务直到终态结果、断线重连、元信息错误但结果存在、V1/V2、拒单/取消/超时、已平仓交易与成交区分、CNY/HKD/USD、分页分组超过 100 条、再运行原配置缺失和封存旁路限制。
  - 边界：不重算领域指标；复杂展示适配按职责提取，不能继续扩大原有超限组件。

- [x] T12：联动图表与分页权益明细
  - 覆盖：AC-13—AC-15、AC-18（图表）、AC-27（结果图）。
  - 依赖：T11 的已验证结果适配契约；权威输入以共享 BacktestResult 契约为准。
  - 范围：权益/回撤主次布局，真实时间对齐、联动悬停、缩放/平移/重置、主题响应式，缺口证据与降级，折叠明细及区间导出。
  - 完成条件：优先已有 drawdownCurve；必要展示派生保持全序列历史高点，缩放不修改全任务指标；无定位证据不猜断点。明细默认 25 条可选 50，导出完整筛选区间而非当前页。
  - 验证：空/单点/平直/负收益/缺口/不可定位缺口、50/250/5,000 点及当前实际最大分钟级规模、时区、主题、侧栏伸缩、隐藏页签恢复、键盘与触屏。
  - 性能证据：固定视口、设备和数据量记录渲染与交互耗时/控制台情况，验证连续拖动与十字线更新无可观察冻结；若要新增量化阈值，先在 Spec 约定，不事后调阈值。抽样须保首尾极值且可定位原始点。
  - 条件增强：仅现有可信数据满足时接基准、成交标记和现金/持仓 Tooltip；缺数据不新增 Provider，也不构造占位线。

- [x] T13：诊断分层、复制与白名单导出
  - 覆盖：AC-09（导出）、AC-16、AC-18（诊断访问）。
  - 依赖：T11、M-揭示；导出消费 T02 的实际受保护数据。
  - 范围：分组键值、完整复制与反馈、格式版本化 JSON 及诊断摘要；身份、冻结配置摘要、不可用原因、哈希和来源保留各自语义。
  - 完成条件：默认结果不堆哈希卡；导出严格允许清单并脱敏，不序列化整个请求/日志/Provider。只含引用时说明依赖未验证，不称完整复现包。
  - 验证：完整复制、缺失字段、安全换行、键盘访问、带凭证 URL/错误文本、未揭示测试各导出入口、不同语义相同字符串仍保留字段及原始精度。

- [x] T14：收紧策略详情页头、默认摘要与版本显示
  - 覆盖：AC-18（页头与返回）、AC-19（旧版定义提示）、AC-27（策略详情）、AC-28。
  - 依赖：T07 已有明确版本路由与详情读取；无需等待 G2/G3 开始。
  - 范围：将返回入口收敛为带可访问名称的图标按钮，标题与业务状态组成首行；补齐策略说明、适用范围、入场、退出、仓位、风险及执行假设的默认摘要；统一版本选择器触发器和选项主标签；UUID 下沉到诊断信息，定义格式不作为业务状态徽标。
  - 完成条件：完整定义无需展开 JSON 即可理解主要交易逻辑；真实缺失、摘要解析失败和加载失败具有不同反馈及动作限制；策略修订版本、业务状态与定义格式不混淆；切换版本时摘要和全部动作原子切换，不残留旧版本操作。
  - 验证：使用完整 V2、真实缺少必需字段、摘要解析失败、旧版定义及多版本 fixtures 做组件行为测试；断言返回按钮可访问名称与键盘操作、版本触发器/选项相同主标签、UUID 不出现在主要回显、受限动作附近有原因。补 1440×900、窄屏及浅深主题实际浏览器截图，证据归 G3 汇总。
  - 边界：不修改策略 Schema、版本号、业务状态或服务端资格判定，不用展示默认值掩盖缺失数据。
  - 实现状态（2026-09-19）：已实现。新增独立摘要模型，完整 V2 默认展示说明、适用范围、入场、退出、仓位、风险和执行假设；真实缺字段与字段存在但解析失败分别反馈并限制回测/风险动作。页头改为图标返回、策略名和业务状态，版本触发器与选项复用 `vN` 主标签，UUID 与定义格式移入诊断信息。
  - 本地证据：`strategy-version-summary.test.ts` 覆盖完整 V2、真实缺失、解析失败及版本/状态标签；策略中心定向集合 10 个文件 61 个断言通过，Desktop 全量 64 个文件 422 个断言通过，目标 ESLint、typecheck、生产 build 与 `git diff --check` 通过。
  - 浏览器证据（2026-09-19）：实际浏览器在 1440×900、768×900、浅色与深色主题下检查策略详情、实验列表和实验详情，策略标题、业务状态、`vN` 回显及默认摘要层级清晰；页面宽度与 `scrollWidth` 一致，无全页横向溢出。宽窄视口和浅深主题关键路径均留有截图，T14 完成。

- [x] T15：将生成风险规则收敛为上下文 Drawer
  - 覆盖：AC-05—AC-06、AC-18（单层弹层）、AC-24、AC-27（风险生成）、AC-29。
  - 依赖：T07 的明确版本上下文、T10 已有预览/失效/保存及风险中心衔接；不依赖 T14 完成，但两项共同修改策略详情入口时需协调写入并联合验证。
  - 范围：从具体版本打开单层 Drawer，复用现有账户、范围、通知、预览及保存契约；固定打开时的来源版本；保存成功后关闭 Drawer、保留源详情并提供实际风险应用入口。已有应用的启停、通知修改、历史与升级管理继续由风险中心负责。
  - 完成条件：Drawer 内不产生嵌套 Drawer；账户、范围或通知实质变化使旧预览失效；启用冲突可保存停用或进入风险中心，不静默替换；关闭或切换版本前保护未保存输入。
  - 验证：组件与路由集成覆盖打开/关闭、来源版本固定、预览失效、重复保存、启用冲突、已有同源应用和保存后返回；实际浏览器验证焦点进入/返回、Escape、遮罩、固定页脚、窄屏与无全页溢出，证据归 G3 汇总。
  - 边界：不改风险编译器、应用身份、单启用约束、通知投递或服务端幂等语义。
  - 实现状态（2026-09-19）：已实现。具体版本路由同时保留源详情并打开 Base UI `Sheet` 右侧 Drawer；来源版本固定，配置变化使旧预览失效，保存成功关闭 Drawer 并在源详情提供实际风险应用入口。关闭、后退和刷新均接入未保存保护；关闭确认在 Drawer 固定页脚内完成，没有嵌套 Drawer/Dialog。
  - 交互收敛（2026-09-19）：策略详情移除与页头“生成风险规则”重复的“风险应用”页签及页签内容；页头按钮作为唯一生成入口，已保存应用继续由风险中心统一管理。
  - Drawer 状态保持（2026-09-19）：策略详情 Tabs 改为受控 `value`，状态提升到策略中心路由容器，并按策略与版本身份隔离；打开或关闭编辑/风险规则 Drawer 发生子路由切换时保持原页签，不使用 query 参数。切换到其他策略或版本仍回到“策略定义”。
  - 本地证据：既有风险应用模型/API 5 个断言继续通过；新增 UI 契约覆盖单层 Sheet、固定页脚、保存后入口与未保存关闭；共享 Drawer 布局契约通过。策略中心定向、Desktop 全量、目标 ESLint、typecheck、build 与 diff 证据同 T14。
  - 浏览器证据（2026-09-19）：从明确 V2 版本打开风险 Drawer 后仅存在一个 `dialog`，焦点进入实际账户控件；Escape、关闭按钮及未保存内联确认均保留源详情，关闭后焦点返回“生成风险规则”。960px Drawer、遮罩、固定页脚、真实滚动区和窄屏均无全页横向溢出；真实预览返回规则摘要，同源身份显示既有 r1/r5 管理入口并可进入风险中心，再由来源链接回到固定策略版本。T15 完成。

- [x] T16：修复编辑与实验创建路由白屏并补错误降级
  - 覆盖：AC-01（编辑保存入口）、AC-07（实验创建入口）、AC-18（返回与键盘）、AC-27（创建页/编辑 Drawer）、AC-30。
  - 依赖：T07、T08 的既有页面和路由；不依赖 G2。若选择迁移根路由模式，实施前必须盘点全部现有路由、导航状态及测试影响，不能把全站迁移隐藏在局部修复中。
  - 范围：使未保存离开保护与应用实际路由模式兼容；已有版本编辑在保留源详情的右侧 Drawer 中渲染，新建策略和新建 AI 实验继续使用独立页面；在策略中心增加局部错误边界，提供错误摘要、重试和安全返回。保留编辑保存创建新版本、实验最后一步提交及幂等语义。
  - 完成条件：从策略详情点击“编辑当前版本”会保留源版本详情并打开 Drawer，从策略详情和实验列表进入“新建 AI 实验”均显示目标页面；修改输入后关闭 Drawer 或离开会确认，继续编辑/放弃离开均正确；渲染异常不清空应用导航或变成全页空白。
  - 验证：测试必须在与生产一致的路由类型下挂载根入口并执行真实点击，不仅导入纯函数或直接渲染叶子组件；覆盖直接 URL、刷新、前进后退、未保存确认、错误边界重试及返回。完成定向测试、Desktop typecheck/build 后，再在目标浏览器检查控制台无 `useBlocker` 路由上下文异常。
  - 边界：不借此改写全站 URL、数据加载或提交状态机；错误边界不吞掉错误日志或把失败伪装成空态。
  - 实现状态（2026-09-19）：已实现并完成 T16 验收。根路由升级为 `createBrowserRouter` + `RouterProvider`，保留现有 URL 与嵌套 `<Routes>`；两个页面的 `useBlocker` 获得 Data Router 上下文，并补 `useBeforeUnload`。策略中心增加局部错误边界，保留应用壳并提供错误摘要、重试和安全返回，同时继续写入错误日志。
  - 运行反馈修复（2026-09-19）：首次路由修复后，编辑页仍因 page 模式在 `Sheet` 根节点之外渲染 Base UI `SheetTitle`/`SheetDescription` 而报 `useDialogRootContext` 缺失。现已将 page 模式标题改为普通语义标题与说明，只有真实 Sheet 模式使用 Sheet primitives；回归测试不再 mock `StrategyEditorSheet`，会渲染完整编辑器并覆盖该组合错误。
  - 交互反馈修订（2026-09-19）：已有版本编辑路由现在先保留明确来源版本详情，再打开复用共享 `Sheet` 布局的右侧 Drawer；新建策略仍为独立页面。Drawer 标题明确来源版本，保存进入服务端实际返回的新版本，关闭回到原版本；加载失败和未解析版本也在 Drawer 内反馈。保存失败进入 Drawer 内容，关闭、后退和刷新继续复用未保存保护。
  - 本地证据：生产同类 Data Router 根上下文直接渲染编辑页与实验创建页 2 个断言通过；新增 UI 契约确认编辑路由组合源版本详情与 Drawer、编辑器使用真实 `Sheet` 根节点和固定页脚。策略中心定向 2 个文件 13 个断言、Desktop 全量 64 个文件 424 个断言、目标 ESLint、typecheck 和生产 build 通过。
  - 浏览器证据（2026-09-19）：真实点击“编辑当前版本”保留源详情并打开 Drawer；直接刷新 `/edit` 地址仍同时渲染源详情和编辑器，Escape 与未保存“继续编辑/放弃修改并关闭”均有效，焦点返回来源按钮，控制台没有 `useBlocker` 上下文异常。浏览器新建 `G3 浏览器验收策略 20260919` v1，并通过 Drawer 保存 v2 `d03b6962-d428-41c4-bf1f-b228a6a59cd8`，证明实际保存返回明确版本。上述证据满足 T16 核心完成条件；浏览器历史前进/后退与故障注入后的错误边界重试继续作为 G3 跨页门禁保留，不再阻塞 T16。

### 部署与真实消费验收

- [x] G2：目标数据库结构、Server 与执行面运行态
  - 覆盖：AC-02—AC-06、AC-08—AC-09、AC-20—AC-25 的真实服务端断言。
  - 依赖：T01—T06、G1，且本次需要打包的主要源码和启动输入稳定、定向/包级/仓库检查通过。
  - 责任与环境：本主题集成负责人核对实际目标、源码版本、migration head、容器与 Worker 入口；凭证只由既有本地配置读取，不输出。
  - 更新入口：新增名称持久化等结构/运行时变化预期使用相邻 infra 的 `./scripts/update.sh thesis-ledger`；执行前按实际差异复核。只有后续纯代码/静态资源且兼容预检通过时才用 sync-code，不绕过入口手动替换容器。
  - 完成条件：保留历史数据，结构和权限完整，Server/Worker 使用目标输入；真实 API 验证保护门禁、冲突、幂等、费用与风险应用。至少一次已配置 Provider 的受控真实调用和真实回测完成领域闭环；失败/缺凭证保持门禁未通过，不用 fixture 代替。
  - 证据：源码输入、迁移/容器版本、健康与缺表日志、脱敏请求及持久化事实、费用消耗；运行身份与目标数据库确认。不得为此自动执行开发清库或删除 volume。
  - 成本控制：主要输入稳定后构建一次，故障/恢复复用同镜像；不重复运行已通过且输入未变的高成本检查。
  - 运行态结构与镜像证据（2026-09-18）：目标为 `thesis-ledger-dev-postgres-1` 的 `thesis_ledger` 数据库，结构 head 为 `20260918153000_strategy_optimization_adoption_context`；13 条 migration、65 张 SQL 表、58 个 Prisma model 与 7 张 raw-owned 表的 matrix 通过。使用 `./scripts/update.sh thesis-ledger` 保留历史数据并以 `check` 模式校验结构，未执行开发重建、清库或删除 volume；最后一次源码变化后再次完整更新，Server 与 backtest-worker 共同使用最终镜像摘要 `sha256:d0e91073cb1d1b5f3a6e4dbd00227d3be01a4df8ac4a017a16d4db09db3ea4e7`。健康端点确认数据库、Redis 与 DSA 均为 healthy，Worker 日志确认队列 ready；目标库保留 8 条实验、10 条 BacktestJob、3 条 OptimizationAttempt 与 7 条 Strategy 验收记录。
  - 生产装配修复：首次真实实验 `d6f1d60d-5724-4988-8118-64cb01ff6b34` 在执行前以“V2 Run 服务未配置”失败。根因为 `BacktestService` 的可选联合类型参数未显式声明 Nest 注入 token；修复 `BacktestQueueService` 与 `BacktestV2RunService` 的 `@Inject(...)` 后新增反射级回归测试。服务端完整测试 113 个文件、710 个测试通过，相关测试、typecheck、build 与目标 ESLint 通过；仓库级复杂度命令仍被当前工作树 25 个无关既有 ESLint 错误阻断，本次文件无新增错误。
  - 真实回测证据：修复后的 600519 实验已实际创建 V2 Run，并因缺少历史执行规则事实按 `DATA_UNAVAILABLE` fail-closed，证明装配已进入 Snapshot 执行面。随后对 `159516.SZ` 选择明确的 ETF `userConfiguration` 研究执行模型，清楚标注非 Provider 历史事实；多次实验的 development 与 validation 基线均由真实 DSA/Server/Runner 完成，结果稳定为 complete、各 2 fills、1 closed trade、0 rejected orders，数据指纹已持久化。资产类型错误和未选择执行模型的前置尝试均保持失败记录，未伪造事实或改写结果。
  - Provider 与费用证据：实验 `feb08ef1-5d62-4d3a-a8e8-176170790b4e`、`ce8dd34d-bbb6-4620-9b2e-2639e8d1a2cc`、`2c9a9e9e-6d21-4b76-8a85-7fe830993c62` 分别真实调用已配置的 DeepSeek free、`openrouter/free` 与 NVIDIA Lightning free 路由；每个实验严格限制 1 次 AI 调用，最后一次把输出预算收紧为 3,000 token。三次均在约 30 秒后返回缺少 `choices[0].message.content` 的不可消费响应，attempt 收敛为 `unknown_outcome`、实验为 `no_valid_candidate`；费用汇总因响应缺失元数据保持 `partial / historical_missing_metadata`，未把未知费用记为 0。
  - Provider 诊断修复：真实调用还暴露了 HTTP 已响应但格式错误时被误记为 `unknown_outcome` 的状态分类缺陷。新增 `AiProviderResponseError`，将非 2xx、200 `error` envelope 和缺失内容统一标记为已收到 Provider 响应的已知失败；真正的网络超时/中断仍保持 unknown outcome。新增 error envelope 与缺失内容回归断言，编译产物已在最终容器中确认导出该错误类型；前三条历史 attempt 保持原始状态不改写。
  - Provider 重放诊断（2026-09-18）：三个最小 `json_object` 探针均收到 HTTP 200 和 `choices[0].message.content`：DeepSeek 返回 `{"ok":true}`；`openrouter/free` 实际路由至 `nvidia/nemotron-3.5-content-safety:free`，返回非 JSON 的 `User Safety: safe`；NVIDIA Lightning 在 128 token 上限处以 `finish_reason=length` 截断，正文是未完成的推理文本。随后克隆原 DeepSeek 实验为 `d9f67000-dbd4-413d-af1a-3b8695528281`，真实策略请求在 30.018 秒后再次失败；使用同一实验数据重建完全相同的 messages 并直接请求 Provider，40 秒内仍未完成响应体读取，得到 `TimeoutError: The operation was aborted due to timeout`，没有完整 HTTP body 可记录。结合适配器 `response.json().catch(() => null)`，确认原“缺少 content”会把读取响应体阶段的超时吞掉并误报为缺字段。
  - Provider 恢复证据（2026-09-18）：适配器现仅把 JSON 语法错误归类为已响应失败，响应流超时/中断原样上抛；默认 Provider 超时及策略优化单次调用上限提升至 120 秒，数据库 `openrouter.timeoutMs` 已通过正式接口同步为 `120000`。DeepSeek `high` 在 120 秒仍超时；诊断证明 `reasoning:none` 可在 12.7 秒返回正文，但候选 AST 无效。NVIDIA Lightning 在 `reasoning:none` 下可返回结构化正文；新增首版 `benchmark:null` 到“未提供”的无语义归一化，并在 prompt 中补齐 indicator、sizing 与 risk 的严格对象形状。最终真实实验 `88a610ac-1cdd-43e0-8aaf-4a906fff7e84` 的 Provider attempt 于 35.213 秒成功，记录 1,579 input / 374 output token，持久化 1 个合法 StrategySchemaV2 候选并实际启动 development/validation 回测，证明 `choices[0].message.content` 消费链已恢复。目标容器通过 `sync-code.sh thesis-ledger` 使用当前源码，镜像摘要保持 `sha256:d0e91073cb1d1b5f3a6e4dbd00227d3be01a4df8ac4a017a16d4db09db3ea4e7`，该更新仅存在于容器可写层。
  - Provider 修复验证：Provider adapter、环境配置和 discovery prompt/归一化共 39 个定向测试通过；Server 全量 113 个文件、712 个测试通过，33 个依赖外部 PostgreSQL 的用例按条件跳过；Server typecheck、build、相关文件 ESLint 与 `git diff --check` 通过。
  - 可比指纹修复（2026-09-19）：逐 artifact 对比确认 development 的 161 根区间内 K 线在 OHLC、成交量、Provider 与 revision 上完全一致，差异仅来自同一 UTC 时刻的 `+00:00` / `.000Z` 表示及 `amount` 的浮点尾差，例如 `102238562.39999999` / `102238562.4`。可比指纹现仅对 `occurredAt`、`availableAt` 做 UTC 规范化，并将 `amount` 归一到 6 位小数；价格与 Provider revision 的真实变化继续产生不同指纹。新增回归同时断言等价时间/金额相等、真实时间/金额/价格/revision 差异不相等。旧快照在目标容器重算后，development 基准/候选均为 `78faa264d1bdf3794240d0732534f431721e2e54ddab50924e6bda6deb637441`，validation 均为 `54cf2525547bbfd6538be55ad367063055a158bf6a089f572f9d1f21a040d625`。
  - 完整候选输出修复（2026-09-19）：两次零费用克隆实验分别因返回非法 AST 和不完整策略片段按 `no_valid_candidate` 失败，历史记录保持不变。discovery prompt 随后增加完整 `responseTemplate` 复制式契约，解析端仍严格要求完整 StrategySchemaV2，不由服务端静默补字段。第三次实验 `b7c47264-2b66-46ab-9b33-57f9e7106b51` 的 Provider attempt 在 20.296 秒成功，记录 1,927 input / 535 output token、费用 `0 CNY`；development、validation 与封存 test 共 6 次真实 Backtest Run 均为 complete/valid，统一揭示后实验收敛为 `succeeded / completed`。候选只是复制隐藏种子的简单策略，development/validation 为负且各只有 1 笔闭合交易，仅证明闭环可用，不构成可投产策略结论。
  - 采纳与风险应用证据（2026-09-19）：候选 `c4959af9-7369-4ebf-9ab7-51fe5829199f` 在统一揭示后按确认 hash 采纳为正式 Strategy V2 v1 `c1f13736-9010-4f3c-9633-7b5bf258f04f`，相同幂等键重放返回同一版本。该候选没有可映射风险规则，因此未伪造规则；另复用既有 G2 固定止损策略版本 `7c179961-1c70-4f8d-8f22-accbd694c930` 完成真实账户/标的预览，生成 1 条 `cost-stop` 规则，并以通知关闭、应用停用方式保存应用 `1249e9d6-76dd-402c-82e7-80368b50b818`；同一幂等键重放保持同一应用与 revision 1，未触发真实通知副作用。
  - 最终验证与部署边界：Server 全量 114 个文件、717 个测试通过，33 个依赖外部 PostgreSQL 的用例按条件跳过；新增相关 2 个文件 10 个断言、Server typecheck、目标 ESLint、build 与 `git diff --check` 通过。最终通过 `./scripts/sync-code.sh thesis-ledger` 同步并确认 Server/Worker healthy，镜像摘要仍为 `sha256:d0e91073cb1d1b5f3a6e4dbd00227d3be01a4df8ac4a017a16d4db09db3ea4e7`；更新只存在于容器可写层，容器重建后会恢复镜像内代码。G2 据此完成，实际浏览器消费仍归 G3。

- [x] G3：目标运行态浏览器工作流与 UI 验收
  - 覆盖：AC-01—AC-18 的用户可见断言及 AC-19—AC-30 的跨页消费行为；具体实施责任仍见下表。
  - 依赖：T07—T16、G2，目标 Desktop 静态资源与源码一致。
  - 责任与入口：本主题前端集成负责人；实际浏览器从策略中心开始，操作目标运行态。
  - 完成条件：手动创建/编辑 → 明确版本 → 回测详情；已有/从零实验 → 候选 → 封存统一揭示 → 采纳返回新版本；该版本打开风险规则 Drawer → 预览 → 保存/启用 → 查看风险应用 → 返回源版本。回测中直接打开详情直到完整结果自动出现。
  - 代表边界：旧基线二次并发变化、部分测试技术失败、旧风险应用冲突、旧版定义限制、151 条历史分页、历史身份缺失、费用未知、图表真实性；历史夹具明确标注，不能宣称其为在线历史事实。
  - 视觉：1440×900 首屏、窄屏、浅深主题、侧栏伸缩、策略详情信息层级与版本回显、风险 Drawer、图表范围及明细、键盘导航与标签不激活、无嵌套弹层和全页横向溢出；记录关键路径截图、控制台与必要网络证据。
  - 边界：真实权限、凭证或环境不可用时保留未勾选，记录具体场景；本轮不涉及 Mobile 改造或原生工程验证。
  - 已完成浏览器证据（2026-09-19）：真实创建策略 v1、Drawer 编辑并保存 v2、未保存保护、直接 URL 刷新、焦点进入/返回、风险预览与同源复用、风险中心来源反链均通过。实验 `b7c47264-2b66-46ab-9b33-57f9e7106b51` 的候选、封存测试指标、正式采纳版本、20.296 秒 Provider attempt、1,927/535 token 与 6 次回测在实际页面可读；成功任务 `f9a42c9b-91e4-4489-921a-087fee677ec5` 的四页签、图表、成交/交易、数据假设及诊断边界通过，失败任务 `cec0e390-162f-4eda-9b60-83295961dfc2` 明确展示失败与封存测试读取门禁。1440×900、768×900、浅深主题、侧栏伸缩及页面无全局横向溢出均已实测并截图。
  - 浏览器缺陷修复（2026-09-19）：真实验收先后发现路由型 Drawer 关闭后焦点落到 `body`，以及回测、实验和风险路径共 11 处 Link/Button 组合触发 Base UI 原生按钮语义错误。现以明确触发元素、路由焦点状态与 `finalFocus` 恢复编辑/风险焦点，并为所有发现的 Link/Button 声明 `nativeButton={false}`；新开标签的成功/失败回测、实验详情、编辑/风险 Drawer 与风险中心路径控制台均为 0 error/0 warning。
  - 自动化补充：策略中心相关 5 个文件 37 个断言、Desktop 全量 65 个文件 431 个断言、目标 ESLint、Desktop typecheck/生产 build 与 `git diff --check` 通过；构建仅保留既有大 chunk 警告。
  - 已接受验证边界（2026-09-19）：新建 V1 验收策略提交回测时因“主标的没有可用行情”明确失败，未伪造成功；未从运行中任务直接打开并等待自动终态，也未在浏览器完成 151 条历史分页、路由前进/后退、错误边界故障注入重试及实际启用风险监控。为避免开启真实监控副作用，本轮只进入已停用应用并验证来源反链。用户确认接受上述边界，G3 标记完成；这些场景不记为已经执行过的验证证据。

## 3. 验收责任映射

| 验收标准 / 关键断言                              | 实现与本地验证         | 跨组件/真实门禁 |
| ------------------------------------------------ | ---------------------- | --------------- |
| AC-01 / 创建编辑并保存到明确版本                 | T07、T16               | G3              |
| AC-02 / 从零采纳、来源反链                       | T01、T03、T09          | G1、G2、G3      |
| AC-03 / 原策略新版本、稳定基线                   | T03、T07、T09          | G1、G2、G3      |
| AC-04 / 防重、已采纳状态恢复                     | T03、T09               | G1、G2、G3      |
| AC-05 / 唯一版本入口、Drawer 与源追溯            | T05、T10、T15          | G2、G3          |
| AC-06 / 预览失效、不自动升级                     | T05、T10、T15          | G2、G3          |
| AC-07 / 实验列表与创建拆分                       | T01、T08、T16          | G3              |
| AC-08 / 模型、Token、费用确认                    | T04、T08、T09          | G1、G2、G3      |
| AC-09 / 揭示、访问、读取/导出保护                | T02、T06、T09、T13     | G1、G2、G3      |
| AC-10 / 独立详情与首屏                           | T11、T12               | G3              |
| AC-11 / 历史/候选身份与错误降级                  | T01、T11               | G2、G3          |
| AC-12 / 指标零值、缺失与格式                     | T11                    | G3              |
| AC-13 / CH-01—CH-06                              | T12                    | G3              |
| AC-14 / 真实序列、缺口和时间                     | T12                    | G3              |
| AC-15 / 明细分页与全区间导出                     | T12                    | G3              |
| AC-16 / 哈希分层、完整复制、脱敏导出             | T02、T13               | G2、G3          |
| AC-17 / 实际运行状态、失败与动作资格             | T06、T09、T11          | G1、G2、G3      |
| AC-18 / 主题、窄屏、键盘与返回                   | T07—T16 各自受影响页面 | G3              |
| AC-19 / 旧版定义保留能力与提示                   | T07、T11、T14          | G3              |
| AC-20 / 整批自动揭示、技术重试与历史兼容         | T02、T06、T09          | G1、G2、G3      |
| AC-21 / 三方差异、再次冲突、原子采纳             | T03、T09               | G1、G2、G3      |
| AC-22 / 同币种、未知费用与硬预算                 | T04、T08、T09          | G1、G2、G3      |
| AC-23 / 名称、全部历史分页、实验分组             | T01、T08、T11          | G2、G3          |
| AC-24 / 同源判重、单启用、历史重复保留           | T05、T10、T15          | G2、G3          |
| AC-25 / 新数据重新回测与原配置                   | T11、T02（保护）       | G2、G3          |
| AC-26 / 直接打开、终态取结果、断线恢复           | T07、T11               | G3              |
| AC-27 / Spec 第 4 节逐页交互                     | T07—T16 各自页面       | G3              |
| AC-28 / 详情摘要、版本显示与缺失语义             | T14                    | G3              |
| AC-29 / 风险规则 Drawer 与上下文恢复             | T15                    | G3              |
| AC-30 / 编辑及实验创建可渲染、离开保护与错误降级 | T16                    | G3              |

启动依赖没有指向 G2/G3；本地任务可在其声明范围通过后完成，真实产品完成必须等 G2/G3。G1 在 UI 完成前验证实际领域连接，不制造所有任务依赖最后门禁的环。

## 4. 验证入口与证据记录

以下命令来自当前 package.json 与现有工程脚本；实施时先确认相关包输入及测试路径仍有效，再运行受影响集合。T00 仅核对命令存在；T01 已完成定向 Schema/Server/Desktop 类型检查、读取 mock 测试、真实隔离 PostgreSQL、边界/依赖检查和 migration matrix；T02 已完成定向 Schema/Server/Desktop 类型检查、读取旁路测试、真实隔离 PostgreSQL、边界/依赖检查和 migration matrix；T03 已完成定向 Schema/Server/Desktop 类型检查、采纳与并发测试、真实隔离 PostgreSQL、边界/依赖检查和 migration matrix。目标运行态仍未验证。

| 层级           | 入口                                                                                                                 | 使用范围                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 定向 Schema    | `pnpm --filter @thesis-ledger/schemas exec vitest run test/strategy-optimization.test.ts`                            | 输入/预算/状态契约；补新增相关用例                 |
| 定向 Server    | `pnpm --filter @thesis-ledger/server exec vitest run test/strategy-optimization`                                     | 同目录相关服务测试；补来源与回测保护测试入口       |
| 定向 Desktop   | `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/strategy test/strategy-optimization-form.test.ts` | 已有 UI 与表单入口，加各任务新行为用例             |
| 包级           | 对受影响包分别运行 `pnpm --filter <包名> test`、`build`、`typecheck`                                                 | 按依赖顺序构建，不用旧 dist 证明新契约             |
| 边界/依赖/结构 | `node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs`、`pnpm migration:matrix`        | 依实际改动触发；结构含 raw-owned 与 runtime 输入   |
| 仓库门禁       | `pnpm lint`、`pnpm guardrails:complexity`、`pnpm security:secrets`                                                   | 局部通过后执行；区分既有债务与新引入失败           |
| 隔离结构/API   | `pnpm db:integration` 及服务测试中的隔离 DB 入口                                                                     | 先核对脚本实际目标和前提，不连接未确认的用户数据库 |
| 文档           | 目标文件格式、相对链接、AC/依赖映射                                                                                  | 当前文档交付执行；不替代上述实现验证               |

实际 Shell 遵循 RTK 规则。现有命令不能覆盖新增断言时，在其责任任务补测试；不用读源码字符串的断言代替用户行为与数据库并发保证。修改 Prisma 后单独审查 Schema diff，静态 validate 使用一次性占位 DATABASE_URL；不格式化历史 migration。

每条执行证据记录：命令/入口、输入文件或版本范围、环境与数据库目标、最后结果、覆盖断言及限制。跨任务共用证据引用原记录，输入未变不重复跑高成本验证。

## 5. 本轮文档检查

- T00 阶段仅更新本 Task 的基线与只读证据；T01/T02/T03 阶段另有源码、Schema、测试和新增 migration 输入，均在一次性隔离 PostgreSQL 完成验证；未部署、未写目标数据库或 Git 提交。
- T00 使用目标库只读证据；T01/T02/T03 只在各自唯一临时隔离数据库执行测试写入，测试后精确清理容器及其临时存储。目标 API 健康且可读，但不作为当前未提交源码的部署证明。
- 稳定 AC-01—AC-27 保留；2026-09-19 新增 AC-28—AC-30，覆盖策略详情可读性、风险规则 Drawer 和创建/编辑入口可用性。
- 文档默认与已确认业务选择在 Spec 第 18 节区分；本轮没有浏览器原型或像素验收证据。
- 2026-09-19 实施更新：T00—T16 与 G1—G3 保留既有源码、受控领域、目标运行态与浏览器证据；T16 的真实入口、刷新、保存和未保存保护已通过并标记完成。在线 Provider、真实回测、统一揭示、采纳与风险应用闭环已在浏览器读取路径确认；未实测的浏览器历史、错误边界故障注入及其他 G3 场景作为用户确认接受的验证边界保留。
- 本轮无已确认延期范围，不修改 TODO，不归档当前任务。
- 2026-09-19 缺陷证据：应用根节点为声明式 `BrowserRouter`；`StrategyEditorPage` 与 `StrategyExperimentCreatePage` 在渲染时调用 Data Router 专属 `useBlocker`。该静态证据解释了用户报告的两个入口首屏白屏。T16 修复前，T07/T08 的“独立编辑闭环”和“新建实验入口”不得作为实际可用结论。
- 2026-09-19 交互修订：策略详情使用图标返回与紧凑标题行，默认摘要展示交易逻辑、仓位、风险和执行假设；版本触发器与选项复用可读标签，UUID 与定义格式下沉；生成风险规则改由单层 Drawer 承载。对应实施与浏览器证据分别归 T14、T15 和 G3。
- T07/T08 Desktop 证据：`pnpm typecheck` 通过；策略中心定向 7 个测试文件共 39 个断言通过；`pnpm build` 通过。完成 T08 时的全量 Desktop 测试 55 个文件中 54 个通过、365 个断言中 364 个通过，唯一失败是本轮开始前已存在的 `performance` / `risk-center` 导航顺序与 `routes.test.ts` 期望不一致，本轮未覆盖该无关脏改。
- T07/T08 页面边界：`/strategy/*` 提供三列表入口、明确 strategy/version 路由、独立新建页、绑定版本详情的编辑 Drawer、实验筛选分页和三步创建；未知费用禁用金额上限且要求确认，已知混币种在客户端拒绝，提交重试复用同一 `idempotencyKey`。未修改任务引擎、采纳或风险规则生效逻辑。
- T07/T08 真实窗口限制：本地浏览器连接在打开预览时中断；已获批启动 Electron，但 Electron 43.2.0 二进制在 `pnpm rebuild electron` 后仍连续下载失败。因此浅深色、窄屏、前进后退的实际窗口验收仍归入 G3，不能由 typecheck、测试或 build 替代。
- T09 Desktop 证据：新增实验详情稳定路由、候选与运行页签、基线和真实参数差异、服务端 `readEligibility` 揭示门禁、原批次封存测试重试/放弃、采纳三方差异及刷新可恢复的已采纳版本入口。定向 4 个测试文件 17 个断言通过，其中包含精确实验/候选标识、确认版本和幂等意图的 API 消费断言；Desktop typecheck、局部 ESLint、生产 build 与 `git diff --check` 通过。
- T09 全量 Desktop 回归：56 个文件中 54 个通过、369 个断言中 367 个通过。既有 `performance` / `risk-center` 导航顺序断言继续失败；共享 sticky 操作列契约在全量并发运行时超过 5 秒超时，但同一测试文件单独运行 2/2 通过且未发现语义违规。该性能型门禁不冒充全量通过，亦不修改无关测试阈值。
- T09 证据边界：T03/T06 已验证隔离 PostgreSQL 中的采纳、统一揭示与原批次恢复；本项复用其服务端事实并验证 Desktop 消费，没有写目标数据库。实际窗口、在线 Provider、目标运行态与采纳后的真实回跳仍保留在 G1—G3。
- T10 Desktop 证据：具体策略版本提供唯一“生成风险规则”工作页；账户/范围变化使旧预览失效，通知配置与身份分离；同源单条直接管理、多条历史明确列出，启用冲突只允许先保存为停用；保存成功定位风险中心应用。风险中心保留源版本反链、通知独立编辑、归档只读及升级差异预览，确认前不改变原绑定。
- T10 验证证据：定向 4 个测试文件 34 个断言通过，覆盖同源身份、历史重复、单启用冲突、配置指纹、通知冷却、精确预览/保存 API 输入及稳定应用定位地址；Desktop typecheck、局部 ESLint、生产 build 与 `git diff --check` 通过。全量 Desktop 57 个文件中 56 个通过、375 个断言中 374 个通过，唯一失败仍为本轮开始前已存在的 `performance` / `risk-center` 导航顺序断言。
- T10 证据边界：T05 已验证隔离 PostgreSQL 中的同源判重、单启用冲突与历史重复；本项消费该服务端契约，没有写目标数据库。真实应用启停、通知投递、目标运行态和实际窗口仍保留在 G2/G3。
- T11 实现证据：回测列表改用服务端游标分页与实验分组，用户任务使用精确策略版本身份；`/strategy/jobs/:jobId` 统一承载排队、运行、失败、取消与完成状态。详情将来源解析错误与结果读取分离，运行态每 5 秒兜底读取，终态 SSE 事件强制失效精确任务查询；四页签区分已平仓交易、成交、委托与拒单，并按任务币种格式化金额，缺失指标不补零，未完成产物明确标记。再次运行固定原版本、区间、资金、币种和已记录执行模型，重新获取数据并创建新任务；配置缺失或封存测试未揭示时禁用旁路。
- T11 验证证据：Desktop 定向 3 个测试文件 14 个断言、Server 定向 1 个测试文件 3 个断言通过；Server 全量 113 个文件、708 个断言通过，另有 10 个文件 32 个隔离集成断言因未提供数据库前提而跳过；Desktop 与 Server typecheck、局部 ESLint、生产 build、`git diff --check` 通过。Desktop 全量 58 个文件中 57 个通过、385 个断言中 384 个通过，唯一失败仍为本轮开始前已存在的 `performance` / `risk-center` 导航顺序断言。
- T11 证据边界：未重算年化、夏普或回撤等领域指标；T12 仍负责联动图表与分页权益明细。没有写目标数据库、部署或执行实际窗口验收；运行中直达终态、SSE 实际断线恢复、浅深色与窄屏仍保留在 G3。
- T12 实现证据：结果总览使用 `lightweight-charts` 的共享时间轴承载权益与回撤上下窗格，联动十字线、缩放、平移、重置及区间快捷键均消费真实时间点；权威 `drawdownCurve` 优先，缺失时仅为展示按完整序列历史高点派生并明确披露，不修改服务端全任务指标。折叠权益明细默认每页 25 条、可选 50 条，筛选跟随可见区间，CSV 导出覆盖完整筛选区间而非当前页；缺口、时区与币种限制按事实展示。
- T12 验证证据：图表模型、详情适配、导出及回测详情 4 个定向测试文件共 25 个断言通过，覆盖空、单点、平直、负收益、权威/派生回撤、分钟级时间、缺口限制、50/250/5,000 点、缩放平移边界及完整筛选区间导出；Desktop typecheck、变更范围 ESLint、生产 build、全量 59 个文件 396 个断言与 `git diff --check` 均通过。仓库 `pnpm guardrails:complexity` 仍因共享脏工作树中的既有问题失败，包括被跟踪的 Mobile `node_modules` 解析错误及多处无关告警；本次 T12 文件单独执行同等复杂度规则无告警，不把仓库级失败冒充通过。
- T12 证据边界：当前环境无可用 Playwright，且既有浏览器连接与 Electron 二进制均不可用，因此没有实际窗口中的固定视口渲染耗时、连续拖动/十字线流畅度、主题、窄屏、侧栏伸缩、隐藏页签恢复和触屏证据。5,000 点仅有模型测试，不作为浏览器性能验收；这些实际消费验证继续保留在 G3。没有写目标数据库、部署或提交。
- T13 实现证据：“诊断与复现”按“策略与任务 / 数据与执行 / 结果与校验”分组折叠，长值缩略展示并可展开、逐字段复制完整值，复制结果通过 `aria-live` 反馈。诊断摘要保留完整字段；JSON 使用 `thesis-ledger.backtest-diagnostics` 格式及版本号，只输出任务身份、冻结配置摘要、指标与不可用原因、失败摘要、追溯版本/哈希和复现边界白名单。错误、警告及 URL 在输出前脱敏，不序列化请求、日志或 Provider 配置；相同值的数据快照标识与内容哈希仍按不同语义保留。导出明确仅含引用、依赖访问未验证，不称完整复现包。
- T13 验证证据：新增 8 个诊断模型与 SSR 行为断言，覆盖固定根字段、请求/日志/Provider 排除、相同字符串不同语义、原始指标精度与不可用原因、鉴权头/API Key/Cookie/带凭证 URL 脱敏、完整长值、缺失字段、安全换行及封存测试未揭示时无复制/导出入口；与回测详情及图表合跑 3 个文件 28 个断言通过。Desktop typecheck、变更范围 ESLint、同等复杂度规则、生产 build、全量 60 个文件 404 个断言、全仓 `security:secrets` 13,938 个文件扫描及 `git diff --check` 均通过。
- T13 证据边界：SSR 和模型测试不能证明实际系统剪贴板权限、下载文件落盘、键盘焦点顺序、浅深色或窄屏视觉；当前浏览器/Electron 条件仍不可用，这些实际窗口验证保留在 G3。没有写目标数据库、部署或提交；仓库整体复杂度门禁仍沿用 T12 已记录的共享脏工作树既有阻塞，本次 T13 文件单独执行同等规则无告警。
- 文档结构检查：25 条核心决策、30 条 AC 全部映射；T00—T16 与 G1—G3 已勾选；本次新增链接目标存在。
- 格式检查边界：仓库 Prettier 默认忽略 specs/tasks；本次对两份目标文档执行独立 `prettier --check --ignore-path /dev/null`，Markdown 解析成功，但两份完整文档均有既有格式差异提示。为避免对当前未提交文档做全文件机械改写，本轮未执行 `--write`；该结果只证明可解析，不作为格式门禁通过。

### 2026-09-19 规划预检

- 结论：Ready。D-20—D-25 与 AC-28—AC-30 已有明确用户决策，无 Blocking 产品问题；T14—T16 均可在现有契约上开始。
- 覆盖：策略详情信息层级与版本显示由 T14 负责，风险规则 Drawer 由 T15 负责，路由白屏、未保存离开确认与错误降级由 T16 负责；三项用户可见结果统一由 G3 在目标浏览器验收。
- 依赖与边界：T14/T15 可并行但共享策略详情入口，须协调写入；T16 不依赖 G2。G2 的可比指纹阻塞不影响三项 Desktop 修订开始，但仍阻止完整在线实验至风险应用闭环的功能验收。
- 证据边界：本次只读取用户截图、当前源码与 React Router 依赖实现并修订文档；没有修改源码或执行浏览器、Docker、Provider、数据库验证。
- TODO 与生命周期：新增内容属于当前 Spec/Task 完成条件，不迁入 TODO；当前任务不可归档。

### 2026-09-19 编辑 Drawer 反馈增补预检

- 结论：Ready。用户已明确已有版本编辑改为 Drawer；新建策略仍为独立页面，版本创建、保存返回和幂等语义不变，无 Blocking 问题。
- 覆盖与边界：修订 D-24、页面职责、编辑交互和 AC-30，由 T16 承担源码与本地验证，G3 继续承担真实点击、焦点、Escape、遮罩、滚动、刷新和前进后退验收；不修改 Schema、API、路由地址或服务端状态机。
- 依赖与复用：复用 T15 已采用的共享右侧 `Sheet` Drawer 布局；编辑路由同时渲染来源详情和编辑 Drawer，新建页继续使用编辑器的 page 呈现，不引入第二套编辑表单。
- TODO 与生命周期：该修订属于当前 T16 完成条件，不迁入 TODO；T16 与 G3 均已完成，任务可进入归档流程。

## 6. 最终一致性 Review

以下检查用于最终功能交付；当前仅勾选已有充分证据的项目：

- [x] Spec 核心验收断言均有实际实现与验证，未实测场景已明确记录为用户接受的验证边界
- [x] 已勾选任务的源码交付与当前可执行验证证据有效；T07/T08 的类型、测试和构建证据仍有效，后续运行反馈暴露的入口可用性问题已由 T16 补齐
- [x] 隔离集成、目标运行态、在线 Provider 与浏览器必要门禁已通过或明确记录为接受边界
- [x] 依赖、契约就绪里程碑和验收关系正确且无循环
- [x] 类型、状态、时间、身份、费用、错误及副作用语义在生产者/消费者间一致
- [x] 无未解决的产品阻塞、占位实现或未定义接口
- [x] 不扩大引擎/Schema/Provider 能力，不以条件增强掩盖核心未完成
- [x] 历史数据、已揭示结果、旧版定义能力与既有风险应用按约定保留
- [x] 代码、文档、测试和真实运行态支持所声明的完成状态及验证边界
- [x] 未覆盖、回滚或提交无关工作树修改；提交和部署遵循实际授权
- [x] 不将当前未完成实现或环境门禁转入 TODO 或提前归档

### Review 结论

- 功能验收结论：通过。T00—T16 与 G1—G3 已完成；现有实现、自动化、目标运行态及浏览器证据支持本次交付，未实测场景按用户确认保留为验证边界。
- 当前交付：已实现详情摘要与版本显示、风险规则 Drawer、保留源详情的编辑 Drawer、Data Router 兼容的离开保护及策略中心局部错误边界；修复 Provider 响应消费、完整候选输出与可比指纹，并完成真实 Provider → development/validation/test 回测 → 统一揭示 → 采纳 → 风险应用保存闭环。Desktop 既有全量 64 个文件 424 个断言、Server 最新全量 114 个文件 717 个断言、目标 ESLint、typecheck 和生产 build 通过。所有变更仍在共享未提交工作树中；Server/Worker 仅通过正式快更入口更新容器可写层，未形成新镜像或提交。
- 已接受验证边界：浏览器历史前进/后退、错误边界故障注入重试、运行中任务直达终态、151 条历史分页、浏览器内风险应用保存/启用以及新建策略的成功回测未执行或未成功完成。实际启用风险监控涉及真实副作用，本轮没有执行；这些场景不作为已验证能力陈述。
- 已知风险：新建 V1 策略的行情可用性、免费 Provider 输出稳定性、容器可写层更新非持久性，以及实际窗口中的运行态长轮询、剪贴板和下载权限仍需后续门禁。可比指纹仅规范已确认等价的时间表示与 `amount` 浮点尾差，后续新增 Artifact 字段仍需保持 fail-closed 回归。
