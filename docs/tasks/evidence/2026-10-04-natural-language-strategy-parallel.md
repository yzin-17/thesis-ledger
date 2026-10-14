# 自然语言策略编写并行交付证据

日期：2026-10-04，Asia/Shanghai。工作区：`/Users/yzin/.codex/worktrees/11ea/thesis-ledger`。

结论：T00 能力及所有权冻结、T01-C/R/O/P 独立底层叶完成。T01 分组尚缺可信身份/API 接入，全部产品 AC 与 G1—G3 仍未整项验收。此交付不包含模型执行、转换、正式用户确认保存或客户端功能。

## 1. 权威输入与基线

- 权威来源为原主仓现行 `docs/specs/2026-09-18-natural-language-strategy-authoring.md` 与配对 Task，完整 NL-D-01—06、NL-AC-01—16 保留。
- 原主仓 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger` 与本工作区 HEAD 均为 `514abeebfe57bac0c16271439d8b777ff3b02a9f`；本工作区开始时干净。原主仓、DSA、infra 只读；未复制整仓 dirty WIP。
- 原主仓 Spec SHA-256：`e58b19b172388092355b8695909d5c1cec003c04b4b006c7afec84432fc0e72d`。
- 原主仓 Task SHA-256：`41f7b36c854b636d601a9ad2bed556ab0a6763f3f50f8cbfcf0a2a685d5bcd53`；基线比本工作区多 2026-10-03 状态对账段，交付更新为本阶段结论。
- 原主仓 Prisma Schema SHA-256：`0429df973d0702497ec0201457a85db9ba3b7df7d8a1517283ea7b5272d8c3d0`，两处一致且本批没有修改。
- 原主仓 Canonical 策略合同 SHA-256：`76bb422410c7d23ebeeaded147df7703e6d909a43a36b583cc79fc7b76e60589`，两处一致且本批没有修改。

直接比较确认一致的输入：`backtest-strategy.ts`、`backtest-values.ts`、领域指标/风险/仓位/模拟器、`BacktestService`、场内执行适配、NAV 策略执行、`InstrumentDirectoryService`、`network-security.ts`、策略中心导航和版本摘要。原 Spec 提及的 `backtest-v2.ts` 已不存在；现行是 `strategySchema` / `BacktestStrategy`、AST 版本 `'2'` 与 Canonical Run V3。没有恢复旧 Run 或从实验创建入口调用编写流程。

本工作区缺少原主仓以下 AI 新文件：`ai-research-submission.ts`、`ai-provider-configuration-transaction.ts`、`ai-provider-validation-interruption.ts`、`ai-frozen-research.ts`。以下原主仓 AI 文件有未提交差异：`ai-run.service.ts`、`ai-research.executor.ts`、`ai-routing-settings.service.ts`、`ai-provider-save.service.ts`、`ai-provider.service.ts`、`ai.controller.ts`、`ai-provider-validation-runner.ts`，相关 AI tests 也有差异。未将这些输入视为已集成或已通过本批测试。

最后核对时，原主仓另有父对话正在实施的市场周期与 Journal Schema/domain 文件，`schemas/index.ts`、`market-bar-series.ts`、`market.ts`、`domain/index.ts`、`trade-costs.ts` 有差异；本批不消费其新增周期能力，也未复制它们。`check-boundaries.mjs` 在原主仓也有其他补丁，须按新增规则合并。

## 2. T00 冻结结果与所有权

能力表、限制和交接以 Spec 新增的“2026-10-04 契约冻结与交接”为唯一正文。定向样本覆盖 CN/HK/US 场内、六种单周期、CN NAV 日频、八种指标、四种仓位、风险、布尔组合以及多源/多周期/比例/费用/执行时机等拒绝场景。样本仅证明结构与首期能力规则，未声称目录、市场数据或真实撮合已经就绪。

目录入口为 `InstrumentDirectoryService.resolveSymbols`，标的代码必须在 T03 从目录确认；模型字符串不能直接作为权威标识。正式版本入口为 `BacktestService.createStrategy/createVersion`：现有嵌套创建可原子产生策略及 v1，但尚未暴露给草稿保存使用的外部事务参数，也没有 owner 字段。AI SDK generation 合同当前只有研究、参数优化、策略探索；本批不修改公共注册表或研究领取逻辑。

- `strategy-authoring`：内容、修订、澄清/回答、需求、运行意图、操作、提案及来源快照。
- `backtest`：正式策略、版本及事务创建；`market`：目录与行情事实；`ai`：配置、路由和 SDK 调用事实。已有模块不得反向依赖编写 feature。
- M-入口：现有 `/strategy/library/new` 和 `StrategyEditorPage` 可作为接入位置，当前仍是手动创建。
- M-来源：已有正式版本/摘要没有 AI 编写来源联合合同；内部来源表和读合同已提供，正式版本详情接入归 T04/T06。
- M-定义：当前编辑只保存原文及派生结构结论；语义映射、审核资格归 T03。
- M-执行：操作类型固定 analyze/generate/modify，绑定选定模型及修订；只提供持久化，T02 负责专属执行器及用途注册。

资源与费用固定为 `authoring-v1`：12,000 字符描述、64 项问题/需求/意图、65,536 字符编辑文本、131,072 字节内容及模型快照；输出 65,536 字节、8,192 tokens，AST 深度 8/节点 128；操作期限 120 秒、租约 60 秒、最多 2 次明确未发送情况下的补投。deadline、续租、补投、队列预检与 Provider 限制由 T02 实装；本批只实装快照/输出及定义边界、领取租约、终态租约/attempt 校验。未知费用保持 null，提交必须携带确认时间，不显示零费用。

## 3. 完成叶与验收边界

| 叶 | 本批可独立证明的结果 | AC 底层断言 |
| --- | --- | --- |
| T00 | 支持交集、领域/接口/缺口、限制、用途与交接冻结 | NL-AC-03/04/11/14 前置 |
| T01-C | 严格写入/读取合同、不完整内容、派生校验、快照/费用/提案边界 | NL-AC-06/08/13/14 前置 |
| T01-R | 草稿创建/分页/读取/更新/丢弃、不可变修订、owner 过滤与行锁 | NL-AC-06/08/13/14 底层 |
| T01-O | 单活动操作、意图幂等、固定快照、领取/终态 CAS、过期结果事实、提案与来源持久化 | NL-AC-08/11/13/14 底层 |
| T01-P | 全部迁移、旧行保留、真实竞争、受限角色、来源事务与隔离 | 上述断言的 PostgreSQL 证据 |

服务端从编辑文本派生 `incomplete/invalid/structurally_valid`，不接受客户端“已验证”字段。`structurally_valid` 不代表需求完整、能力/语义已审核或可正式保存。操作成功结果只保留 outcome；T03 尚未把它转成草稿内容。提案只持久化待审信息，未实现授权范围校验或确认应用；读取时识别修订失效。没有新增 Controller、Nest Module 或公开路由。

当前 outcome 持久化覆盖有效租约中的成功/失败/取消及草稿修订失效。租约已失效、attempt 或终态已变化时 finish 拒绝，不追加独立调用审计；T02 必须在终态 CAS 之外先持久化每次 Provider attempt 的用量/费用，使被拒绝的晚到结果也可追溯。续租、排队取消、结果未知恢复和租约过期收敛尚未实现，不以本批持久化测试宣称完整 AI 生命周期通过。

源码用 owner 参数过滤所有读取与修改、统一 404 防止泄露他人修订。当前 Server 实际只有本机/LAN token，没有用户 principal、User 表或正式 Strategy 归属。本批“跨 owner 拒绝”是在真实 repository/数据库上验证调用方传入两种 owner，不能冒充已认证用户 API 验收。身份适配必须来自可信服务端上下文，禁止从正文或自报 header 取得 owner。

`recordSource` 是 T04 使用的外部事务内 helper，要求草稿已经保存到指定版本/修订、最终定义与正式版本 JSONB 等价、存在可追溯的成功生成操作。隔离测试手动创建版本并更新状态作为 fixture；不表示正式确认保存业务已经实现。

## 4. 全部变更文件

新增：

- `packages/schemas/src/strategy-authoring.ts`
- `packages/schemas/src/strategy-authoring-definition.ts`
- `packages/schemas/fixtures/strategy-authoring.exchange.json`
- `packages/schemas/test/strategy-authoring.test.ts`
- `apps/server/src/strategy-authoring/authoring-store.ts`
- `apps/server/src/strategy-authoring/authoring-draft.repository.ts`
- `apps/server/src/strategy-authoring/authoring-operation.repository.ts`
- `apps/server/src/strategy-authoring/authoring-provenance.repository.ts`
- `apps/server/test/strategy-authoring/draft.repository.test.ts`
- `apps/server/test/strategy-authoring/operation.repository.test.ts`
- `apps/server/test/strategy-authoring/postgres.fixture.ts`
- `apps/server/test/strategy-authoring/authoring-postgres.integration.test.ts`
- `apps/server/prisma/migrations/20261004130000_strategy_authoring_drafts/migration.sql`
- `apps/server/prisma/migrations/20261004140000_strategy_authoring_records/migration.sql`
- 本证据文件。

修改：

- `packages/schemas/src/index.ts`：仅两个导出。
- `apps/server/prisma/raw-owned-tables.json`：五个编写表登记。
- `scripts/check-boundaries.mjs`：四条禁止反向依赖规则。
- `docs/engineering/2026-08-18-migration-test-matrix.md`：两项增量与隔离验证入口。
- 原自然语言 Spec/Task：当前合同、叶与检查点；保留六项决策及完整 16 项 AC。

两项 migration 只新增表/索引/约束并推进动态 head，未改历史 SQL、Prisma Schema、公共 AI、行情/Journal、客户端或根 lockfile。选择 raw-owned 是为 owner 复合外键、当前修订延迟外键、行锁和单活动操作部分唯一索引保持显式 SQL 所有权，遵循现有项目做法。runtime 输入及部署结构清单动态读取 migrations/Prisma/inventory，无第二份静态表清单需要补写。

## 5. 命令、结果与输入范围

所有 Shell 按 RTK 规则执行；以下省略 `rtk proxy` 包装，完整输出保存在本机 `/tmp/tl-nl-11ea-*.log`。

| 检查 | 结果与输入范围 |
| --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts` | 本工作区安装成功，lockfile 无变化 |
| `pnpm --filter @thesis-ledger/server exec prisma generate` | 从未修改的 Prisma Schema 生成本地 client，通过 |
| `pnpm --filter @thesis-ledger/schemas test` | 最终 52 个文件、616 tests 通过；编写定向 27 tests 在其中 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/strategy-authoring/draft.repository.test.ts test/strategy-authoring/operation.repository.test.ts` | 2 文件、9 tests 通过；没有声称全 Server 测试通过 |
| `pnpm --filter @thesis-ledger/schemas typecheck` / `build` | 最终编写共享合同通过 |
| `pnpm --filter @thesis-ledger/server typecheck` / `build` | 最终持久化源码及共享合同通过 |
| `pnpm --filter './packages/*' build` | 准备仓库 lint 所需 workspace 类型产物，通过 |
| `pnpm exec eslint packages/schemas/src/strategy-authoring*.ts packages/schemas/test/strategy-authoring.test.ts apps/server/src/strategy-authoring apps/server/test/strategy-authoring` | 最终新增源码及测试通过 |
| `node scripts/check-boundaries.mjs` | 通过，包含四条新规则 |
| `node scripts/check-migration-matrix.mjs` | 28 migrations、76 SQL tables、60 Prisma models、16 raw-owned tables；head `20261004140000_strategy_authoring_records` |
| `node scripts/check-runtime-database-input.mjs` | 当前全部迁移/Schema/inventory 的运行时打包输入检查通过 |
| `pnpm guardrails:complexity` | 最终通过；存量复杂度/文件尺寸警告保留，没有增加 ignore 或阈值 |
| `node scripts/check-secrets.mjs` | 通过 |
| `git diff --check` | 最终通过；未改历史 migration、Schema 或 lockfile |
| `NL_AUTHORING_TEST_CONTAINER=tl-nl-authoring-11ea-20261004 pnpm --filter @thesis-ledger/server exec vitest run test/strategy-authoring/authoring-postgres.integration.test.ts` | 最终 1 文件、13 tests 通过，无 skip 或未处理异常；最后运行 22:22:20 |

首次复杂度检查因其他包 dist 类型未准备而失败，补齐 package build 后通过。首次 PostgreSQL 11 项断言均通过，但测试等待方式造成未处理 Promise rejection，进程 exit 1；修正测试后复用同一容器/head，11 项及补充后的 13 项均 exit 0。未把这些早期失败写成通过。

## 6. 真实 PostgreSQL 证据

- 使用本地已有 `postgres:17-alpine`，容器 `tl-nl-authoring-11ea-20261004`，数据库 `nl_authoring_11ea`，owner `nl_owner_11ea`，app role `nl_app_11ea`。
- 容器只用 tmpfs；动态回环端口实际 `127.0.0.1:52845`。没有目标 volume、数据库、Server、Worker 或父对话端口访问。
- 首次 setup 顺序执行当前 26 项原迁移，在两项新增迁移前插入 AST1 策略/版本，再执行两项新增迁移；保留 `保留的旧策略|1` 和 `保留原值|1`，没有回填或转写旧定义。
- 只读消费 infra 的 `scripts/bootstrap-app-role.sql` 初始化角色，`buildUpgradePermissionsCheck` 返回 `t`。app role 查询实际为 `nl_app_11ea|nl_authoring_11ea`，superuser/createdb/createrole/bypassrls 均 `f`；禁止修改 SchemaVersion 的断言通过。
- 实际 head 为 `20261004140000_strategy_authoring_records`，76 张 public 表，与全部预期表一致；没有用 `db push` 或仅 head 判断完整性。
- 同修订并发写入：两个 Prisma 事务只有一个 fulfilled，另一方 `AUTHORING_REVISION_CONFLICT` 且 `currentRevision: 2`。
- 并发同幂等意图返回相同 operation ID；不同新意图被单活动约束拒绝；并发领取只有一个成功；错误 attempt、过期租约和再次提交均拒绝。
- 他人读取/更新/丢弃、操作读取/终态、提案读取/放弃、来源读取/写入均返回 `AUTHORING_NOT_FOUND`；分页仅返回同 owner。
- 手动改修订、丢弃、已保存三种情形的晚到成功结果为 `stale`，草稿读取结果不变；未知执行失败 outcome 的 amount 保持 null。
- 提案保存基线及差异、修订后显示 expired；来源快照/操作引用、重复 recordSource 不改快照、版本不一致时事务整体回滚均通过。
- 最后汇总保留 7 条 succeeded/stale 审计记录；所有临时状态来自受控 fixture，没有模型调用。已执行 `docker stop` 和 `docker rm` 精确移除该专用容器，tmpfs 和动态端口释放；没有清理其他容器或 volume。

## 7. 父对话集成顺序与剩余门禁

1. 按本批新文件和最小共享补丁合并，保留原主仓 dirty AI/行情/Journal；原 Spec/Task 只整合本主题新增段和状态，不能覆盖父对话同期记录。
2. `schemas/index.ts` 追加两行；raw-owned inventory 合并五条；边界脚本合并四条。Prisma Schema 没有冲突；migration 名称应先核对原主仓新目录，不能因父对话较晚迁移而手工把 head 固定成此值。所有输入取排序 head。
3. 在集成版本执行定向测试、受影响包 build/typecheck、必要仓库/结构门禁；隔离测试 fixture 容器已移除，重跑需按本节同样的专属名称/env/tmpfs 和动态端口新建。不得连接目标库。该集成测试只允许精确容器名，测试角色由 bootstrap 初始化。
4. 先提供可信 principal 与 owner 映射，再注册编写 Controller/Module/API 并补 HTTP 跨用户验证；当前内部 repository 不接受客户端 owner，不能通过固定 owner 或自报 header 放行。
5. T02 消费父对话最新 AI 事务/冻结路由补丁，新增专属用途与输出合同、队列预检、deadline/续租/恢复；不要复用研究 fallback/claim。T03 完成目录与语义覆盖验证、结果应用；T04 提供正式策略事务创建、确认修订与幂等保存、来源联合读取。
6. 按原 Task 继续 G1 → T05 → T06/T07 → G2 → G3 → T08；每阶段单独验证。实际收费 Provider、目标 Docker/Worker/API、保数据目标升级和浏览器仍全部未执行。

共享文件冲突集中在：`packages/schemas/src/index.ts`、`scripts/check-boundaries.mjs`、`raw-owned-tables.json`、migration matrix 及本主题 Spec/Task；没有修改公共 AI、根 lockfile 或其他 feature。尚无 stage/commit/push、部署或发往其他对话的消息。
