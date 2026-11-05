# 录入持仓与账户模型重构任务

<a id="priority"></a>
> 完成归档（2026-10-22）：T1～T13 及现行九项 AC 全部通过。T12 复用各自适用的账户、基金、原生、草稿与对账证据；T13 完成后继合同、实现、三仓版本及数据保护的最终一致性核对，详见下方 Review。
> [全局优先级与接续规则](../../tasks/README.md#priority-policy)。本页保留任务编号、阶段记录与证据；[现行规格](../../specs/2026-08-18-position-entry-account-model.md)继续维护账户合同。

## 历史接续记录

> 历史对账（2026-10-03）：当时 T12/T13 的原生与账户模式交互仍开放。DSA pytest/FastAPI 缺依赖是旧环境记录，最新 DSA 全包已执行；不再要求安装旧环境依赖或恢复 V1 Contract。账户与 Ledger 的 Canonical E03 证据只证明相应范围。此段保留当时结论，后续证据及本页最终 Review 接续其状态。对账依据见[当时 Review](../../archive/reviews/2026-10-03-task-state-reconciliation.md)。

> 2026-10-16 接续：Android/iOS 已恢复验收，原生编译、实际/模拟隔离、停用账户及 Portfolio/Risk 刷新通过，见[三端完成记录](2026-09-14-permanent-account-deletion.md#2026-10-16-交互验收与证据边界)。[富途当前证据](../../tasks/evidence/2026-10-15-futu-minute-integration.md)包含最新 DSA 全包与正式链路；“缺 pytest/FastAPI”不再是待办。仍不能据此关闭原 Spec 的基金 NAV 正向及全部原视觉断言；暂未开放入口不在本轮恢复。

> 2026-10-20 接续：T12.NAV 的现行 V3 当前净值及历史五点接口实读已通过，临时路由已恢复、正常缓存以外的业务数据未变，见[本次证据](../../tasks/evidence/2026-10-20-fund-nav-source-acceptance.md)。该记录不替代基金产品展示、披露/正式校准及仍未覆盖的原产品断言，T12/T13 父项继续开放。

> 2026-10-21 接续：基金正式修订、披露、qfq 分钟/Web 及跨日误差已通过，[组合十九项 AC 对账](../../tasks/evidence/2026-10-21-portfolio-final-acceptance.md)关闭相应基金消费缺口。本次修复 USD 币种回显并实测 Ledger 模式锁定拒绝，25 项测试及 Web/数据保护通过，见[账户产品对账](../../tasks/evidence/2026-10-21-account-product-acceptance.md)。手动绝对余额、现金、清空与五观察审计的实际 Web 闭环也已通过，正常 ETF 确认时间刷新经备份重算摘要独立核对，严格失败不改写为成功。

> 2026-10-21 接续：[基金实源正式校准及 Web 日线](../../tasks/evidence/2026-10-21-fund-calibration-acceptance.md)和[真实披露/维护分钟/Web](../../tasks/evidence/2026-10-21-fund-disclosure-acceptance.md)已通过，两项专用账户结清停用；原失败、正常目录刷新及有限恢复均保留证据。日级及分钟消费不再构成阻塞，继续核对账户产品本身尚未覆盖的原断言与未开放入口。

> 2026-10-21 当前接续：用户选择的[草稿/对账无模型路径](2026-10-21-account-draft-reconciliation-web.md)及[乱序投影一致性修复](2026-10-21-baseline-projection-consistency.md)已通过正式同步、真实 Web 与差集保护，[完整证据](../../tasks/evidence/2026-10-21-account-draft-reconciliation-acceptance.md)记录修订、部分提交、409 恢复、冻结、对账幂等/撤回及结清停用。当前已有规范化持仓草稿审核与确定性对账入口，T12/T13 按现行范围完成最终证据核对。


关联规格：[录入持仓与账户模型重构规格](../../specs/2026-08-18-position-entry-account-model.md)

## 执行约束

- 开始实施前重新读取关联 Spec、ADR-009 至 ADR-014 和三个仓库各自的 `AGENTS.md`。
- 这是跨三个独立 Git 仓库的原子交付；每项修改在所属仓库完成，不复制 DSA Provider 源码到主仓。
- 实现范围或验收标准变化时，先更新 Spec，再同步本任务和实现。
- 只有对应实现与验证均完成后才能勾选任务；外部阻塞只记录，不重复尝试。
- 不提交、不推送、不发布镜像，除非用户另行明确授权。

## 任务清单

- [x] T1 在主仓完成数据库迁移预检与 Account 模型重构：移除 `source`，新增 `institution`、`mode`，处理历史 shadow、非 CNY、字段锁定和停用规则。
- [x] T2 更新共享 Schema、主系统 `/api/v1`、版本握手、fixture 和 API client，并为不兼容客户端与数据库 Schema 增加快速失败测试。
- [x] T3 实现 Asset Identity 状态和股票、ETF、场外基金的容器校验，包括用户确认资产与 Provider 冲突阻断。
- [x] T4 实现手动“设置当前余额”及清空持仓、现金余额 Observation、最近录入方式投影和对应 Ledger 测试（事件语义按现行 Ledger Spec）。
- [x] T5 扩展 Import Draft 的增量提交、现金忽略、重复代码校验、类型校验、Ledger 基线、重新基线和回滚。
- [x] T6 完成 Desktop 账户录入与导航；现行 `/accounts` 按后继产品合同提供账户选择、持仓/成交/现金页签、录入 Sheet、账户设置 Drawer、空账户引导、账户锁定、URL 优先、脏状态保护和旧路由重定向。
- [x] T7 更新 Portfolio、Risk、Performance 和 AI 的真实/影子查询范围及现金、成本、盈亏展示；实现 Desktop 与 Mobile 的范围切换和模拟标签。
- [x] T8 在 `daily-stock-analysis` 实现真实 Fund NAV Provider、capability/route、fixture、结构化错误、测试、Contract 文档和 Changelog；当前接口由 Data/Control V3 承接。
- [x] T9 在主仓实现 Fund NAV Schema、DSA client、缓存、估值与新鲜度规则，并增加 Stub/真实 DSA 共用的黑盒 Contract Test。
- [x] T10 在 `thesis-ledger-infra` 更新三仓版本矩阵、固定镜像与源码 override，并加入主系统、数据库和 DSA capability 的兼容门禁。
- [x] T11 更新 README、用户指南、运维/发布说明和相关活动文档，确保账户、录入来源、基金净值和三仓边界用词一致。
- [x] T12：账户、Ledger、消费范围、Fund NAV、设备交互与草稿/对账的适用证据全部核对通过；各子项证据及边界见下方和最终 Review。
  - [x] T12.NAV：复用组合 R3.I6 的当前净值及五点历史实读、原日期年龄状态与恢复核对；只关闭接口读取叶，[证据](../../tasks/evidence/2026-10-20-fund-nav-source-acceptance.md)。
  - [x] T12.FUND：当前 V3 NAV 的缓存/日级正式修订、真实披露、同序列 qfq 分钟、覆盖率、误差及 Web 消费通过；[完整证据映射](../../tasks/evidence/2026-10-21-portfolio-final-acceptance.md)。
  - [x] T12.WEB：实际 USD/CNY 币种回显、已有 Ledger 账户模式变更拒绝、失败草稿保留和取消恢复通过；原十一账户、十三张业务表、57 个 V3、来源/政策/模型计数完全不变；[本次证据](../../tasks/evidence/2026-10-21-account-product-acceptance.md)。
  - [x] T12.MANUAL：按预案完成新账户 `019a28a7-1b21-41bf-85ed-ec67b82f0ecd` 的绝对数量 10→15、现金 1000→0、清空不动现金、五观察与来源/原因审计，最终归零停用。字段丢失先失败复现，再修复持仓“账本”中文回显；31 项、构建及实际 Web 通过。原十一账户和十三张业务表不变，正常 ETF 确认仅刷新三处时间，既有备份代入重算精确复原前摘要；保留原严格失败及独立复核，[完整证据](../../tasks/evidence/2026-10-21-account-product-acceptance.md)。
  - [x] T12.DRAFT：恢复规范化持仓草稿审核、显式修订/选行提交、部分提交冻结、409 双重重读及确定性对账。新增乱序观察修复已通过，专用第十五账户结清停用，原十四账户/十三表、57 个 V3 结果、来源/路由和零模型计数保持；[完整验收](../../tasks/evidence/2026-10-21-account-draft-reconciliation-acceptance.md)。
- [x] T13 对现行 Spec、任务、ADR-009 至 ADR-014、实现、测试和三仓版本关系完成最终一致性 Review；后继合同与旧表述已对齐，结论通过，无本任务持有的未完成事项。

## 验证证据

| 任务 | 验证 | 结果 |
| --- | --- | --- |
| T1-T5 | Prisma 迁移预检、Server 72 tests、Domain 59 tests、Schema 30 tests、Ledger/Import Draft 回归 | 通过 |
| T6-T7 | Desktop 8 tests + typecheck/build；Mobile 6 tests + typecheck/build；入口按账户模式加载独立持仓和现金，Portfolio/Performance/Risk/AI mode 范围实现；本地浏览器核对主页面布局、添加/编辑 Sheet 和账户列表跳转 | 既有局部检查通过；双端原生基本读取、模式切换与错误恢复已由[原生记录](2026-08-18-market-data-provider-v1-2-closure-09-mobile-native-acceptance.md#已执行验证)补齐。T12 的其余产品断言继续保留，不再把基本模式列为待重跑。 |
| T8-T9 | 原 DSA Fund NAV 实现、compileall、Schema/缓存/估值与脚本语法；后续 DSA 全包、V3 实读和基金产品证据 | T12.NAV 与 T12.FUND 已补齐各自接口、产品及正式校准条件；旧环境缺依赖只作历史记录。 |
| T10 | 原 migration matrix 17 项、infra contract-matrix（Server 78 tests）与发布顺序；后继 Canonical 结构及正式更新 | 原检查通过；当前结构 head、Data/Control V3 及目标更新见最终 Review，不把原迁移项数当作当前库存。 |
| T11 | README、用户指南、运维说明、ADR、Spec 和三仓边界 | 已同步，未提交或推送 |
| T13 | Spec、任务、ADR、实现、测试和三仓版本关系最终一致性核对 | 2026-10-22 全部通过；现行九项 AC、ADR 适用性与补充只读检查见最终 Review。 |

## 当前状态

- 三仓边界沿用 ADR-014，正式 DSA Fork 位于同级 `daily-stock-analysis`；当前接口/信封按 [Canonical](../../architecture/canonical-runtime.md) 的 V3 合同，不恢复原 V1。
- 主仓账户、Ledger、消费范围及 Fund NAV 底层已有实现；规范化草稿审核与确定性对账入口已有验收证据。
- 早期基础测试、类型、构建、Prisma generate、迁移矩阵及 Contract 检查通过；后续修改的定向/包级、构建与运行态结果由对应证据接续，不将旧全量结果声称为最终工作区的远端 CI 结果。
- DSA 全包、目标 V3 链路、双端原生基本模式、基金产品、绝对余额/清空及草稿/对账均有相应分层证据。最终 Review 通过，本任务退出当前执行清单，现行 Spec 保留。

## 最终一致性 Review

- [x] Spec 的目标、非目标、接口、数据规则和验收标准均有对应任务。
- [x] 主仓、DSA 和基础设施仓的代码、Contract、镜像和版本矩阵已按当前实现同步。
- [x] Account、Ledger、Import Draft、Fund NAV、真实/影子范围的术语在代码和文档中一致。
- [x] 当前 V3、账户、Fund NAV、手工录入与草稿/对账的证据适用性完成最终核对，已过的 DSA 与原生基本模式不重做。

### 2026-10-22 最终结论

**通过。** 核对现行九项 AC、后继规格、生产入口和既有回执后，没有尚未验收的本任务义务。本轮只修正文档衔接：账户数据入口/设置、账户本位币、完整/部分快照及当前协议均已由后继合同明确，现将本规格同步；未新增业务能力或修改代码。

| 验收断言 | 实现与适用证据 | 结论 |
| --- | --- | --- |
| AC1 直接录入、空账户引导与导航 | `app/routes.tsx`、`LegacyImportReviewRedirect`、`useAccountDataNavigation`、`AccountDataPage`；[现行入口及恢复](../../tasks/evidence/2026-10-18-ui-final-ac.md)、[账户产品记录](../../tasks/evidence/2026-10-21-account-product-acceptance.md)。旧路径转 `/accounts`，已有账户直接记录快照，空态先区分加载/失败再引导设置。 | 通过 |
| AC2 身份、机构与来源分离 | Prisma `Account`、`schemas/src/portfolio.ts`、`AccountsService`、Ledger 审计及账户标签；本次实际账户 API 也无 `source` 字段。来源字段修复及真实审计见账户产品记录。 | 通过 |
| AC3 类型、模式、币种锁定与生命周期 | `accounts.service.ts`、`assertWritableAccount`、`assertAccountCanHoldAsset`；复用原迁移预检、Canonical 完整结构及[三端账户验收](2026-09-14-permanent-account-deletion.md#2026-10-16-交互验收与证据边界)。真实 Ledger 锁定拒绝、失败保留和结清停用见账户产品记录。多币种按后继 Ledger 合同，不恢复早期 CNY 限制。 | 通过 |
| AC4 绝对余额、现金、清空和审计 | `LedgerService` 的当前 Observation 命令与投影；复用 T12.MANUAL 的数量 10→15、现金 1000→0、清空不动现金及五观察审计。31 项回归、构建和真实 Web 均有回执。 | 通过 |
| AC5 草稿、类型/重复/CAS 冲突和冻结 | `BaselineImportService`、审核只读查询、`ImportDraftReviewSheet`；[草稿与对账验收](../../tasks/evidence/2026-10-21-account-draft-reconciliation-acceptance.md)覆盖显式修订、两次真实 409、双重重读、部分提交冻结、后续修订及后续事实阻止回滚。FULL/PARTIAL 影响按现行基线合同，部分更新未提交标的和现金保持。 | 通过 |
| AC6 真实/模拟与消费范围 | `investment-account-scope.ts`、Portfolio/Risk/Performance/AI 范围及 Mobile store；[全局模式](../../tasks/evidence/2026-10-18-global-account-mode.md)与[Android/iOS 原生模式和错误恢复](2026-08-18-market-data-provider-v1-2-closure-09-mobile-native-acceptance.md#已执行验证)分别证明各自范围。本次账户 API 的实际/模拟集合不重叠且完整覆盖全部账户。 | 通过 |
| AC7 基金来源、独立合同、缓存与估值 | `market-fund-reader.ts`、当前 DSA 两来源净值能力、契约测试和 Portfolio 估值；T12.NAV、T12.FUND 及[组合十九项对账](../../tasks/evidence/2026-10-21-portfolio-final-acceptance.md)覆盖当前/历史读取、缓存、正式修订、披露、误差与真实 Web。 | 通过 |
| AC8 三仓版本与快速失败 | Canonical E03 的持久信封 V3/旧行拒绝、完整 migration 与运行结构证据；[正式更新记录](../../tasks/evidence/2026-10-21-provider-account-level.md#正式更新与目标运行态验收)证明 `update.sh all` 退出 0、同源构建与保留数据。补查 infra `check-compatibility.mjs` 通过，目标健康/结构 head 相符。 | 通过 |
| AC9 分层验证、视觉、原生与最终 Review | 原基础验证及后续账户 31 项、草稿 Server 39/客户端 57 项、Domain 455 项、Server 相邻 43 项、类型/构建和工程门禁均按实际输入复用。目标 Web、Android/iOS 独立证据已有归属；本次九项及下列 ADR/版本对账通过。 | 通过 |

### ADR 与版本适用性

- ADR-009、ADR-010：账户身份与来源、容器类型与实际/影子模式的边界继续有效。
- ADR-011：独立 Fund NAV 和三仓所有权继续有效；原 DSA V1 路径由 Canonical Data/Control V3 接续。
- ADR-012：基线冲突、人工确认和受保护回滚继续有效；当前使用账户账本修订、草稿修订与事务锁，并冻结已提交行。
- ADR-013：主系统 `/api/v1` 原子升级和快速失败原则继续有效；健康接口 `contractVersion=1` 不等于 DSA 或 Ledger 的版本。
- ADR-014：三仓同级、DSA 拥有 Provider、主仓消费合同、infra 拥有部署门禁继续有效；其协议与能力库存仅表示决策当时状态。

当前主系统 `0.1.0`、DSA `v3.28.0-thesisledger.1`、Data/Control `3/3`、运行配置 `dsa-data-runtime-v1` 与 infra 矩阵一致。Ledger 持久信封固定为 `3`，旧空版本拒绝读取或修订。完整 migration 目录最大 head 和目标健康接口均为 `20261019020000_research_observation_versions`；没有重新执行原迁移或改写历史 SQL。

### 本轮补充检查与保护边界

- `thesis-ledger-infra` 中执行 `rtk proxy node scripts/check-compatibility.mjs`：通过，固定 digest、Contract/Protocol/Business smoke 的发布要求均保留。
- 2026-10-22 03:00（北京时间）两次只读核对健康与账户 API，共 8 个 GET。目标 Server、数据库、Redis、DSA 均健康；全部 15 账户与既有账户数一致，实际 11、模拟 4，集合隔离且完备，账户无 `source`，手工及草稿专用账户仍停用。私有回执为 `.recovery-artifacts/remaining-p1-2026-10-20/account-final-review-20261022.json`。
- 本轮不发送业务写请求，不调用真实 Provider 或模型，不启停来源，不运行 Docker 状态变更；既有数据、审计和草稿修订保留。后续正式更新已有同源构建与数据留存证据，未为归档重复构建、原生编译或业务验收。
- 当前有效 Spec 留在 `docs/specs/`；本任务归档，当前任务总表、接续索引及入站/出站相对链接同步更新。原日期的失败与保护差异保留，不改写为本轮成功。
- 归档检查：11 份相关文档的 208 条相对链接及锚点全部可达，归档 Task 无未完成 checkbox，旧活动任务路径及失效引用已移除；作用域内差异和新归档正文的空白检查通过。与开工快照比较，仅这些文档及任务移位发生变化，三个仓库的其余源码、依赖与既有工作区修改均保持。
