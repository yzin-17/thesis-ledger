# scripts 维护归属与清理审计

日期：2026-11-15（Asia/Shanghai）。范围：主仓 `scripts/`，同时核对主仓、DSA、infra 的代码、配置、CI 与文档引用。

本报告保留整理前的审计判断；后续实施见[整理证据](../evidence/2026-11-15-scripts-maintenance.md)与[当前工具索引](../../scripts/README.md)。已移动文件的可执行路径已同步更新，分类与数量仍是原审计快照。

## 结论

目录具备整理价值：长期工程工具、运维入口、可复用回归和任务专用验收混放，尤其根目录的业务验收脚本较多。建议先明确归属、归类和归档，再决定删除；目前没有足够依据支持批量删除 `*-target*`、`*-acceptance*`、`*-browser*` 或零显式引用文件。

本次完成全量文件及静态引用扫描，并人工核查重点脚本族和关联资料。没有执行验收脚本、Docker、数据库恢复、模型请求或通知投递；没有移动或删除原文件，没有修改业务源码、CI、任务状态或 Git 索引。只新增本报告与[逐文件清单](2026-11-15-scripts-maintenance-inventory.md)。

| 维护判断 | 文件数 | 建议 |
| --- | ---: | --- |
| 长期工具及其依赖 | 128 | 保留；补维护说明，修正已发现的陈旧实现 |
| 当前新增工具，保留待定 | 15 | 由进行中的任务决定归属，不参与历史清理 |
| 已结案专项工具，候选归档 | 5 | 按原任务成组归档，保留复现关系 |
| 已结案界面验收，建议转回归 | 7 | 按领域整理为可重复浏览器回归 |
| 缺少入口归属，候选清理复核 | 13 | 核对语义覆盖和人工使用，再决定去留 |
| 业务验收与回归，按领域归类 | 294 | 保守保留，不能仅凭任务资料所在目录判定过期 |
| 合计 | 462 | 分类互斥；不等同于 462 个可直接执行的命令 |

“长期”表示有当前工程或运维用途、稳定夹具生产关系及其依赖，不表示每项都通过了当前运行验收。其余 294 项主要完成引用级盘点，尚未逐项证明所属任务已结案或能力已被替代。

## 盘点依据与范围

- 代码基线：`1ed418780d1970e8380955453667edc2fed4b126`，包含当前未提交修改。扫描三仓 8,449 个文本文件；排除本次审计文档、忽略的生成物、大型或二进制文件及部分锁文件。引用结论限于本地可见输入。
- `scripts/` 根目录 303 个文件，`local-runtime/` 134 个，`mobile-release/` 10 个，`deployment/` 5 个，`fixtures/` 5 个，`p0-target/` 5 个。合计约 5.5 万行，包含夹具、测试和配置。
- 按 `.test.` 命名统计有 98 个测试文件；其中根目录 63 个，`local-runtime/` 31 个（含 2 个 Shell 测试），`deployment/` 1 个，`mobile-release/` 3 个。
- 当前 `scripts/` 原有 18 个工作区变更条目，其中 15 个新增文件、3 个已修改文件，均保留。此清单是工作区快照，不覆盖其他会话后续变更；审计期间观察到并行新增和移除，最终清单以本次冻结的 462 个文件为准。
- 核对包命令、CI 显式调用及通配符、脚本依赖、应用测试引用、运维指南、活动任务、历史证据和跨仓调用；对 P0 探针的动态加载单独补证。
- 静态扫描不能证明仓外自动化、人工命令或动态拼接调用不存在；文件年龄、历史引用和零引用均不能单独证明可删除。

## 应长期保留的工具

| 工具族 | 代表文件 | 保留依据 |
| --- | --- | --- |
| 工程与架构门禁 | `check-boundaries.mjs`、`lint-workspace.mjs`、`check-file-size-guardrails.mjs`、`check-workspace-dependencies.mjs` | 根 `package.json`、CI 与项目规则直接使用 |
| 门禁的领域规则及配套测试 | `date-input-boundaries*`、`draft-close-boundaries*`、`instrument-display-boundaries*`、`market-session-boundaries*`、`market-window-consumer-boundaries*` | `check-boundaries.mjs` 直接导入规则；历史资料已归档不影响当前规则用途 |
| 安全、许可证、发布产物 | `check-secrets.mjs`、`check-licenses.mjs`、`check-release-artifacts.mjs` | 已登记包命令，承担持续工程检查 |
| 数据库结构和集成 | `check-migration-matrix.mjs`、`check-runtime-database-input.mjs`、部分 `test-*-postgres.mjs` | migration 门禁或 CI 持续调用 |
| 应用部署合同 | `local-deployment.sh`、`deployment/`、`local-runtime/ai-deployment-contract.test.sh`、`database-role-contract.test.sh` | infra 调用应用合同；指南和 CI 保持职责边界 |
| 移动端发布 | `mobile-release.mjs`、`mobile-release/` | 发布 workflow、签名配置、构建及测试入口 |
| 备份、恢复和保留验证 | `backup-db.sh`、`restore-db.sh`、`local-runtime/research-state-*`、`research-observation-retention*`、`backtest-target-recovery*` | 有现行运维指南；旧恢复入口存在缺陷，见下节 |
| 协议与固定基准 | `market-v3-*-smoke.mjs`、`evaluate-research-trace.mjs`、`print-market-*-indicator-fixture.mjs`、`build-research-stage-benchmark.ts` | 包命令、CI、跨仓协议夹具或当前基准生成用途 |
| 共享验收夹具 | `fixtures/arena-detail-refresh.cjs` 等实际被消费的文件 | Desktop、Mobile 测试及检查脚本直接引用 |

入口依据：[包命令](../../package.json)、[CI](../../.github/workflows/ci.yml)、[本地部署合同](../guides/local-deployment-interface.md)、[运行工具指南](../guides/local-runtime-tools.md)、[提供方健康记录维护指南](../guides/provider-health-record-maintenance.md)。

### 明确发现的维护缺陷：旧恢复入口与当前结构不一致

[`restore-db.sh`](../../scripts/restore-db.sh) 第 16 行执行 `pg_restore --clean --if-exists`，第 17 行把期望的 Schema 版本固定为 `20260905000000_fresh_database_baseline`。当前最后一条 migration 为 `20261114010000_journal_period_review_snapshots`，其 SQL 也更新 `SchemaVersion`；[`database-structure.ts`](../../apps/server/src/platform/database-structure.ts) 已从实际 migration 输入派生 head。

因此，从当前结构导出的备份即使恢复成功，也会在旧 marker 检查处失败；这一步发生在恢复写入之后。此结论来自源码比较，未执行恢复验证。

[`发布、备份与恢复指南`](../guides/2026-08-18-release-and-recovery.md) 第 5 行还宣称该脚本执行 Prisma migration、integrity check 和核心 E2E；实际脚本只做可选 checksum 核对、恢复、固定 marker 检查及提示。这是工具与当前操作文档的明确漂移。

建议单独修正或明确退役这个旧入口，并同步更新指南。保留数据库恢复职责不等于原脚本可继续被视为已验证的正式恢复流程；修正需要按数据库升级与恢复规则独立实施，不能在清理文件时顺手执行。

## 已结案专项工具：第一批候选归档

| 文件 | 已核对依据 | 处理建议与条件 |
| --- | --- | --- |
| `scripts/archive/2026-10-08-announcement-preparation/announcement_preparation_target.py` | [公告准备验收](../archive/reviews/2026-10-08-announcement-preparation-acceptance.md)记录原范围完成；脚本被该历史报告引用 | 与公告准备专项验收成组归档，保留原命令和环境边界；脚本含路由更新，不作为普通只读检查 |
| `scripts/archive/2026-10-08-announcement-preparation/announcement_restart_target.py` | 同一历史报告列出重启验收入口 | 与上项一起归档，不拆散原验收过程 |
| `scripts/archive/2026-08-28-unified-backtest-v2/backtest-v1-inventory.mjs` | [统一回测 V2 任务](../archive/tasks/2026-08-28-unified-backtest-v2.md)已完成，脚本只检出该归档任务的外部引用 | 作为 V1 迁移盘点工具归档；历史行数盘点的旧记录不能改写成当前数据库结论 |
| `scripts/archive/2026-11-12-strategy-cross-direction/strategy-cross-repair.mjs` | [交叉方向修复任务](../archive/tasks/2026-11-12-strategy-cross-direction.md)已完成，已有新版本和对照回测 | 专项纠错与历史复现入口，适合归档到原任务名下；不应直接删除其通用交叉检查能力 |
| `scripts/archive/2026-11-12-strategy-cross-direction/strategy-cross-repair.test.mjs` | 上项配套测试，同时被 CI 通配符发现 | 若成组移动，必须显式维护测试发现规则；不能借归档静默减少 CI 覆盖 |

这些是经过结案资料核对的候选，不代表其他带 `target` 的脚本也都已结束生命周期。代码归档建议使用 `scripts/archive/<原任务标识>/`，并修正相对导入和历史引用；不把可执行源码混入文档归档目录。

## 已结案界面验收：优先转为回归

以下 7 个入口的主仓外部引用集中在已归档的界面验收资料，源码保留了可复用的实际组件或页面断言：

- `scripts/local-runtime/browser/instruments/instrument-multiselect-mobile.regression.mjs`
- `scripts/local-runtime/browser/instruments/multiselect-inline.regression.mjs`
- `scripts/local-runtime/browser/providers/provider-health-record.regression.mjs`
- `scripts/local-runtime/browser/risk/risk-notification-mobile.regression.mjs`
- `scripts/local-runtime/browser/risk/risk-notification-unification.regression.mjs`
- `scripts/local-runtime/browser/risk/strategy-risk-monitoring.regression.mjs`
- `scripts/local-runtime/browser/risk/strategy-rule-notification.regression.mjs`

建议分别归入标的多选、提供方、风险与策略领域的浏览器回归；保留现有 Desktop/Mobile、1440/1024/768/390 宽度、交互断言和请求隔离。运行所需的页面宿主、固定样本与测试入口一起登记，不能仅移动顶层脚本。

例如 `provider-health-record.regression.mjs` 是该页面的回归候选，而 `provider-health-record-maintenance.mjs` 有[现行维护指南](../guides/provider-health-record-maintenance.md)，必须保留运维入口。两者名称相近但职责与生命周期不同。

依据：[多选一致性](../archive/evidence/2026-11-12-instrument-multiselect-consistency.md)、[多选回显](../archive/evidence/2026-11-12-multiselect-inline-values.md)、[提供方健康记录](../archive/evidence/2026-11-12-provider-health-records.md)、[风险通知统一](../archive/evidence/2026-11-12-risk-notification-unification.md)、[策略监控](../archive/evidence/2026-11-13-strategy-risk-automatic-monitoring.md)。

## 13 个缺少明确入口归属的复核项

这组是清理调查清单，未证明可安全删除。静态扫描未检出入站引用或已有明确调用装配；还需核对人工运行约定和是否有等价覆盖。

| 文件或工具组 | 当前观察 | 下一判断依据 |
| --- | --- | --- |
| `fixtures/projection-shadow-pass.json` | 未发现引用；`projection-shadow-diff.mjs` 要求调用者显式传 `--input`，不默认加载此文件 | 如果仍是 CLI 示例，补入运行说明；否则属于最小的删除候选 |
| `ai-credential-type-web.mjs` | 未发现明确入口 | 核对凭证类型界面验收是否被当前用例完整覆盖 |
| `authoring-provider-validation.mjs`、`authoring-target-live.mjs` | 固定开发目标，前者还固定 lmstudio 模型；与当前自动化入口没有已检出的引用关系 | 找到原任务和验收承接后归档，或参数化成维护工具；不能试跑来判断是否有用 |
| `cn-status-independent.py`、`hk-share-window-independent.py`、`share-window-independent.py`、`share-window-target.mjs` | 独立复算或按股场景验收；未检出明确入站引用 | 核对冻结复算证据、上游产生器及当前回归覆盖，按工具族成组处理 |
| `eastmoney-cash-research-policy.mjs`、`market-rule-target.mjs`、`market-composition-success-reconciliation.mjs` | 有业务验收语义，缺少当前入口归属 | 核对所属市场/研究规则是否仍是当前合同；确认后转领域回归或专项归档 |
| `local-runtime/arena-us-runtime-check.mjs` | 没有已检出的静态调用；仍可能是人工运行入口 | 核对美国市场 Arena 的人工验收及现行运行检查是否需要它 |
| `test-fund-disclosure-contract.mjs` | 基金披露合同测试装配，没有已检出的 CI/包命令入口 | 若合同仍维护，应补测试登记；否则查明继任用例后归档 |

## 不能按零引用或历史归档直接删除的情况

1. **CI 通配符。** `.github/workflows/ci.yml` 第 39 行执行 `local-runtime/*.test.mjs` 与 `deployment/*.test.mjs`，第 133 行执行 `mobile-release/*.test.mjs`。当前覆盖 29、1、3 个文件；另外两个 Shell 合同测试显式调用。许多测试没有文件级入站引用，但仍在 CI 执行范围内。
2. **动态装载。** `local-runtime/p0-target-runtime.mjs` 第 56 行通过目录与名称拼接加载 `scripts/p0-target/*.mjs`。该目录 5 个探针的零显式引用属于静态扫描盲区，不能当作闲置文件。
3. **当前工作区新增。** `ai-provider-status-browser.mjs`、`arena-contingent-*`、`rule-monitor-source-growth-browser.mjs`、`run-arena-*-upgrade.mjs`、`upgrade-arena-research-route.mjs`、`test-strategy-regressions-postgres.mjs` 等属于当前新增输入。完整 15 项见逐文件清单，不纳入历史删除候选。
4. **共用夹具和规则。** `fixtures/arena-detail-refresh.cjs` 同时被两端测试引用；`date-input-boundaries.mjs` 等已被当前 `check-boundaries.mjs` 导入。原功能任务结案不会使这些维护职责结束。
5. **跨仓基准。** `print-market-period-indicator-fixture.mjs` 是 DSA 周期指标合同记载的夹具生产入口；`build-research-stage-benchmark.ts` 拥有固定研究基准的源定义。任务时间较早不等于基准可删除。

## 目录重分类建议

先新增一份中文工具索引与可校验的维护登记，记录入口、职责、运行位置、数据副作用、依赖工具、测试方式和生命周期。`deployment/maintenance.json` 已经是 infra 锁与维护合同的正式输入，应保持其原职责，不往里面混放所有脚本的审计元数据。

建议的目标职责如下，具体移动路径在实施时按依赖族确定：

| 职责 | 建议位置 | 迁移优先级 |
| --- | --- | --- |
| 架构、安全、复杂度等门禁 | 保持现有入口，后续可成组进入 `scripts/checks/` | 低：引用面广，先修正确性与登记问题 |
| 数据库备份、恢复、结构检查 | `scripts/database/`；容器维护编排继续服从 infra 合同 | 高：先修正旧恢复流程与文档漂移 |
| 移动端发布、应用部署准备 | 保留 `mobile-release/`、`deployment/` 及正式入口 | 保持当前稳定合同 |
| 性能与固定夹具生成 | `scripts/benchmarks/`，按领域保存生成器 | 中：同时维护跨仓使用说明 |
| 宿主运行、浏览器及目标验收 | `scripts/local-runtime/<领域>/` | 高：先整理已结案界面验收，再逐族迁移；容器程序与宿主驱动明确区分 |
| 验收辅助、复算器和测试 | 跟随所属工具族，稳定跨领域夹具继续放 `fixtures/` | 中：避免入口移动后辅助模块继续散在根目录 |
| 已结案且不再承担当前门禁的专项工具 | `scripts/archive/<原任务标识>/` | 高：先处理已核实的 5 项候选及其依赖 |

应按入口、辅助模块、夹具、测试、宿主页和文档组成的完整工具族迁移，不按扩展名或文件数量分组。跨仓调用路径、当前包命令、CI 发现规则、部署打包与 `maintenance.json` 都属于受影响消费者。

根目录的 63 个 `.test.mjs` 没有像 `local-runtime/` 一样的显式 CI 通配符登记；包级 `test` 主要运行各 workspace 的 Vitest。建议为继续维护的工具测试增加明确、经过运行属性审查的测试入口。本次未执行它们，也未把缺少 CI 登记等同于测试无效。

## 建议处理顺序及验收边界

1. 修正或明确退役旧 `restore-db.sh`，同步恢复指南；独立核验恢复目标、完整结构和失败处理。
2. 建立工具索引及生命周期登记，先登记长期入口、15 个当前新增文件、5 个专项归档候选和 7 个界面回归候选。
3. 按领域整理已结案浏览器用例；保留测试能力和相同宽度覆盖，不用归档减少验证范围。
4. 核对 13 个缺少归属的文件；最先处理无调用的示例夹具，其余须确认原任务、当前合同与替代覆盖。
5. 再逐族整理其余 294 个验收及回归文件。对统一数据能力、研究窗口、冻结复算等工具，继续保留原证据边界，不能因为相关历史材料已归档就宣告现行义务已结束。

后续若实施目录、契约或工程门禁调整，应按项目规则建立对应 Spec/Task，修改引用后先做路径和定向测试，再执行受影响的包级检查。真实运行验收单独安排；本报告没有新增外部调用、运行预算或数据写入授权，也没有把上述建议登记为已确认 TODO。

## 本次审计验证

- 已扫描本次冻结清单的所有 462 个目录文件，核对主仓与两个相邻仓库的可见引用；逐文件给出保守分类和代表性证据。
- 已人工核对正式入口、CI 通配符、门禁 helper、P0 动态装载、重点结案资料、共享夹具及当前工作区新增文件。
- 已从实际 migration SQL、数据库结构实现、旧恢复脚本与指南核对恢复语义漂移。
- 静态验证通过：逐文件清单 462 项且无重复，分类总和一致，481 处 Markdown 本地链接目标存在，两份文档无行尾空白。不以这些检查声称脚本运行通过。
- 未运行全仓测试、构建或真实业务验收：本轮只做静态审计，既有源码和运行环境未改变。未提交、推送或删除文件。
