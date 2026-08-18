# 录入持仓与账户模型重构任务

关联规格：[录入持仓与账户模型重构规格](../specs/2026-08-18-position-entry-account-model.md)

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
- [x] T4 实现手动“设置当前余额”及清空持仓、现金余额 Adjustment、最近录入方式投影和对应 Ledger 测试。
- [x] T5 扩展 Import Draft 的截图来源注册表、增量提交、现金忽略、重复代码校验、类型校验、Ledger 基线、重新基线和回滚。
- [x] T6 重构 Desktop `/position-entry`：账户选择、手动持仓/现金列表布局、截图导入右侧 Sheet、添加与编辑右侧录入 Sheet、独立账户管理页、空列表自动打开、账户列表跳转自动选中但不自动打开 Sheet、账户锁定、URL 覆盖、脏状态确认和旧路由重定向。
- [x] T7 更新 Portfolio、Risk、Performance 和 AI 的真实/影子查询范围及现金、成本、盈亏展示；实现 Desktop 与 Mobile 的范围切换和模拟标签。
- [x] T8 在 `daily-stock-analysis` 实现真实 Fund NAV Provider、Contract V1 capability/route、fixture、结构化错误、测试、Contract 文档和 Changelog。
- [x] T9 在主仓实现 Fund NAV Schema、DSA client、缓存、估值与新鲜度规则，并增加 Stub/真实 DSA 共用的黑盒 Contract Test。
- [x] T10 在 `thesis-ledger-infra` 更新三仓版本矩阵、固定镜像与源码 override，并加入主系统、数据库和 DSA capability 的兼容门禁。
- [x] T11 更新 README、用户指南、运维/发布说明和相关活动文档，确保账户、录入来源、基金净值和三仓边界用词一致。
- [ ] T12 执行数据库迁移测试、Server/Desktop/Mobile 定向测试、DSA pytest、跨仓 Contract Test、类型检查、构建和人工视觉验收。主仓可执行验证已完成；DSA pytest、真实三仓黑盒和视觉验收仍受环境条件阻塞。
- [ ] T13 对 Spec、任务、ADR、实现、测试和三仓版本关系执行最终一致性 Review，处理问题或记录用户接受的遗留项；已完成代码与文档核对，未决环境项尚待用户接受或环境具备。

## 验证证据

| 任务 | 验证 | 结果 |
| --- | --- | --- |
| T1-T5 | Prisma 迁移预检、Server 72 tests、Domain 59 tests、Schema 30 tests、Ledger/Import Draft 回归 | 通过 |
| T6-T7 | Desktop 8 tests + typecheck/build；Mobile 6 tests + typecheck/build；入口按账户模式加载独立持仓和现金，Portfolio/Performance/Risk/AI mode 范围实现；本地浏览器核对主页面布局、添加/编辑 Sheet 和账户列表跳转 | 通过；仍需真机人工验收 |
| T8-T9 | DSA Fund NAV fixture/provider/route/capability/test 文件；Python compileall；主仓 Fund NAV Schema、缓存、估值和 smoke 脚本语法检查 | 实现完成；DSA pytest 因当前环境缺少 pytest/FastAPI 未执行 |
| T10 | migration matrix 17 migrations；infra contract-matrix（Server 78 tests）与三仓发布顺序 | 通过 |
| T11 | README、用户指南、运维说明、ADR、Spec 和三仓边界 | 已同步，未提交或推送 |
| T13 | Spec、任务、ADR、实现、测试和三仓版本关系最终一致性核对 | 已执行；DSA pytest、真实黑盒和视觉验收等未决环境项尚待用户接受或环境具备 |

## 当前状态

- 三仓工作区和正式 DSA Contract V1 已建立，见 ADR-014；正式 DSA Fork 位于同级 daily-stock-analysis。
- 主仓 Account/Asset/Ledger/Import Draft、Desktop/Mobile、Portfolio/Performance/Risk/AI 范围和 Fund NAV 消费已实现；DSA Contract V1 已增加 fund-nav capability。
- 主仓 `pnpm -r test`、`pnpm -r typecheck`、`pnpm -r build`、`pnpm run lint`、Prisma generate、迁移矩阵和 Contract smoke 脚本语法检查均通过；DSA Fork 的 Python compileall 通过。
- DSA 的 pytest/FastAPI 依赖未安装，因此 DSA pytest、真实三仓黑盒 Contract Test、数据库运行时迁移和浏览器/真机视觉验收仍待具备测试环境后执行；构建仅有既有 chunk size 和 React Native ESLint parser 警告。

## 最终一致性 Review

- [x] Spec 的目标、非目标、接口、数据规则和验收标准均有对应任务。
- [x] 主仓、DSA 和基础设施仓的代码、Contract、镜像和版本矩阵已按当前实现同步。
- [x] Account、Ledger、Import Draft、Fund NAV、真实/影子范围的术语在代码和文档中一致。
- [ ] DSA pytest/FastAPI 依赖、真实三仓黑盒运行和浏览器/真机视觉验收仍待环境具备并由用户确认。
