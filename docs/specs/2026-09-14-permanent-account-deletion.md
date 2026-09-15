# 账户永久删除 Spec

> 任务标识：`permanent-account-deletion`
> 日期：2026-09-14
> 状态：代码实现与 Server/数据库运行验收完成；Desktop 浏览器和 Mobile 原生验收未完成
> 对应任务：[账户永久删除实施任务](../tasks/2026-09-14-permanent-account-deletion.md)

## 背景与问题

现有 `DELETE /accounts/:id` 表示停用账户，桌面端可以停用或重新启用账户，但两个客户端都没有永久删除入口。账户余额归零或当前无持仓并不能证明账户未使用；流水、历史状态、导入草稿、定投、风险、日志及其他引用都必须保留完整性，不能因用户请求删除账户而被级联清理。

本功能在保留现有停用语义的前提下，为从未产生任何关联业务记录的空账户提供显式、不可恢复的永久删除能力，并以数据库约束和事务内检查共同防止并发写入产生悬空引用。

## 目标

1. 为 Desktop 和 Mobile 提供具有明确不可恢复提示的永久删除入口。
2. 只有完全没有关联业务记录的账户可以被删除；账户启用或停用状态不影响资格。
3. 在账户所属 Server 模块建立独立删除服务，以事务、账户行锁、完整关联检查和限制删除外键保证数据完整性。
4. 通过共享 Schema 和 API client 暴露统一的账户查询、永久删除及错误契约。
5. 删除成功后让账户列表、相关业务数据和客户端选择状态一致收敛；失败时保留账户与用户上下文。

## 非目标

- 不改变 `DELETE /accounts/:id` 的停用语义，不删除现有停用/重新启用能力。
- 不允许级联删除、自动清理、自动归档或修改账户关联的历史数据。
- 不以余额、持仓数量或账户状态推断账户是否从未使用。
- 不在 Mobile 增加账户创建、编辑、停用或重新启用功能。
- 不改变 Mobile 现有 Portfolio、Risk 数据加载机制，只在删除成功后触发其既有刷新入口。
- 不把开发数据库重建当作正式升级或本功能迁移验收。

## 现状与约束

- 截至 2026-09-14，`AccountsController` 的 `DELETE /accounts/:id` 调用现有停用服务；停用只检查当前持仓和投影现金余额。
- Prisma 中大部分账户关联已有 `onDelete: Restrict`，但 `TargetAllocation`、`RiskEvent`、`JournalEntry`、`JournalReviewSnapshot`、`AiDecisionLog` 的 `accountId` 尚无账户外键。
- raw-owned 的 `StrategyRiskApplication.accountId` 已有 `ON DELETE RESTRICT`；其审计记录通过应用关系间接阻止账户删除。
- Desktop 账户管理列表已经请求 `includeInactive=true` 并可复用全局确认弹窗。
- Mobile 当前只有 Portfolio/Risk 页签，尚未使用 TanStack Query；新增账户数据路径必须独立接入 TanStack Query，不替换已有读取 store。
- 当前工作区存在其他未提交修改，尤其涉及 Server 平台数据库门禁、`packages/api-client`、Desktop `package.json`、migration matrix 和锁文件；实施必须保留并兼容这些改动。

## 设计方案

### 删除资格与关联范围

账户仅在所有已知关联检查结果均为“无记录”时可永久删除。检查按领域分组汇总中文原因，至少覆盖：

- Ledger 与交易：账户 Ledger 状态、Ledger 事件、持仓、交易、现金余额、现金结算、基线观察批次；
- 导入与计划：导入草稿、交易计划、定投计划及发生记录；
- 成本与快照：成本策略版本、组合快照、账户估值点；
- 风险：风险规则、风险持仓状态、风险事件、raw-owned 策略风险应用；
- 配置与日志：目标配置、Journal、Journal Review 快照、AI 决策日志；
- Prisma Schema 后续新增的账户关系及 raw-owned 清单中新登记的账户引用。

任何查询失败都视为无法证明账户可删除，事务终止并保留账户。已有关系即使对应余额、数量为零、记录已停用或处于历史状态，也返回业务冲突；服务端不自动清理。

### 事务与并发

独立 `AccountPermanentDeletionService` 在单个数据库事务中：

1. 使用 `SELECT ... FOR UPDATE` 按 ID 锁定账户；不存在则返回 `404`。
2. 执行所有 Prisma 关系与 raw-owned 关系检查；查询异常直接回滚。
3. 仅当所有检查为空时删除账户。

缺少账户外键的五个模型通过新增 migration 建立 `ON DELETE RESTRICT` 外键。migration 在创建约束前显式检查孤立 `accountId`，发现时抛出包含表名和引用数量的错误并终止升级，不删除、不置空、不改写历史数据。事务内行锁与引用表外键共同保证检查期间的并发写入不能在删除后提交悬空引用。

同一账户的重复并发删除中，最多一个请求成功返回 `204`；后取得锁或重新检查的请求在账户已不存在时返回 `404`。数据库限制冲突或检查命中的业务引用统一映射为 `409 ACCOUNT_IN_USE`，不得泄漏底层 SQL 错误。

### 服务端接口与错误契约

- 保留 `DELETE /accounts/:id`：原有停用行为与响应兼容。
- 新增 `DELETE /accounts/:id/permanent`：无请求体，成功返回 `204` 且无响应体。
- 账户不存在：`404`，沿用平台标准错误格式。
- 账户有关联记录：`409`，错误码 `ACCOUNT_IN_USE`，`message` 为中文原因；原因至少指出阻止删除的关联类别，不返回敏感记录内容。
- 无法可靠完成检查或事务：按平台标准内部错误返回；不得误报为可删除或删除成功。

共享 Schema 定义账户查询参数、账户 DTO、永久删除成功的空响应语义及 `ACCOUNT_IN_USE` 错误码；共享 API client 提供账户列表与永久删除方法，Desktop/Mobile 不自行拼接不一致的请求。

### Desktop 交互

- 在现有账户管理操作区增加“删除”，与停用/重新启用并列且不改变其语义。
- 复用全局确认弹窗，正文展示账户名称和“删除后无法恢复”；只有确认动作调用 mutation，取消或关闭弹窗不发送请求。
- 使用 TanStack Query mutation；请求期间禁用该账户的重复删除及冲突操作，不进行乐观移除。
- 成功后失效账户列表、估值及相关查询，重新加载管理列表并刷新页面数据。若删除当前选择，优先选择当前范围内仍存在的账户；没有账户时清空 URL、sessionStorage 和局部 Sheet/草稿状态并展示空状态。
- `409` 显示服务端中文原因；网络错误保留账户并显示可重试提示。

### Mobile 交互

- 导航新增“账户”页签，不增加创建、编辑、停用或重新启用入口。
- 账户页按当前全局 `actual | shadow` 范围列出账户，并始终包含该范围内已停用账户。范围切换后账户列表与现有 Portfolio/Risk 视图保持同一范围。
- 新增账户查询与永久删除均使用 TanStack Query；现有 Portfolio/Risk store 保持不变。
- 使用 React Native 原生确认交互，显示账户名称和“删除后无法恢复”；取消不请求，提交期间禁止重复删除。
- 成功后刷新账户查询并调用现有 Portfolio/Risk 刷新入口；清理被删账户的选择状态。当前范围最后一个账户删除后显示空状态。
- 业务冲突显示服务端中文原因；网络错误保留列表并提供重试提示。

## 数据、状态与兼容性影响

- 新 migration 只增加五个限制删除外键及其孤立引用 preflight，不迁移或清理业务数据。
- `Account` 本身不新增状态；启用和停用账户适用同一永久删除资格规则。
- 现有停用 API、Desktop 停用/重新启用交互及现有客户端调用保持兼容。
- migration matrix、runtime 数据库输入清单和数据库结构门禁必须纳入新 migration；Schema head 从 migration 目录自动派生。
- API client 扩展是向后兼容新增；Desktop/Mobile 只能在 Server 已具备永久删除路由时启用该动作。

## 测试策略

### 关键可观察行为

- 启用空账户和停用空账户均可删除。
- 任一关联类别存在记录时均拒绝；零余额历史账户仍拒绝。
- 查询失败、删除失败和并发写入冲突时事务回滚且账户仍存在。
- 重复并发请求只允许一次成功，不产生悬空记录。
- 两端取消不请求、提交防重、成功刷新与清选、业务拒绝、网络失败、最后账户空状态和实际/模拟切换行为一致。

### 测试层级与证据边界

1. 定向测试：Schema/API contract、migration SQL preflight、删除服务事务与错误映射、Desktop mutation/交互、Mobile query/mutation/store 协作。
2. 包级检查与构建：Schemas、API client、Server、Desktop、Mobile 的相关测试、typecheck 和 build。
3. 仓库门禁：migration matrix、runtime 数据库输入、boundary、lint 及受影响的仓库级检查。
4. 隔离 PostgreSQL：在干净库和包含孤立引用的受控库上验证升级；验证外键、行锁、并发插入、重复删除和回滚。
5. 目标运行时：实际 Server + Desktop 浏览器完成关键交互；Android/iOS 完成原生编译及模拟器关键交互。

较低层验证通过不代表更高层门禁通过。未执行的 Docker、浏览器、原生编译或模拟器验收必须保持未完成状态。

## 风险与备选方案

| 风险 | 处理方式 |
| --- | --- |
| 服务层关联清单随 Schema 演进漏项 | 数据库 `RESTRICT` 作为最终完整性保护；测试和门禁核对 Prisma/raw-owned 账户引用清单 |
| 检查后并发写入 | 锁定账户行，并为无外键引用补齐 `RESTRICT` 外键；并发集成测试验证 |
| 旧数据库存在孤立引用 | migration preflight 阻止升级并报告表与数量，不自动修复 |
| 客户端误把停用当永久删除 | 使用独立 endpoint、独立 API client 方法和独立 mutation 名称 |
| 删除后选择状态残留 | 两端把清选与相关数据刷新作为成功处理的必要部分 |
| 工作区已有共享文件修改 | 小步编辑并逐文件检查 diff，不覆盖或回退用户改动 |

## 未决问题

### Blocking

无。

### Non-blocking

无。移动端“当前实际／模拟范围”按现有全局 `actual | shadow` 模式解释；账户页只显示当前范围，但包含该范围的停用账户。

## 验收标准

- AC1：`DELETE /accounts/:id` 保持停用兼容；`DELETE /accounts/:id/permanent` 成功返回空的 `204`，不存在返回 `404`。
- AC2：启用或停用的空账户均可永久删除；账户状态不参与删除资格判断。
- AC3：任一 Prisma 关系、raw-owned 策略风险应用或其他已登记账户引用存在时，接口返回 `409 ACCOUNT_IN_USE` 和中文原因；零余额、零持仓或历史记录状态不构成例外。
- AC4：独立删除服务在事务内锁定账户、完成 fail-closed 关联检查并删除；查询失败、删除失败或并发冲突时不产生部分结果或悬空引用。
- AC5：五个既有无账户外键模型获得 `ON DELETE RESTRICT` 外键；migration 遇到孤立引用时阻止升级并报告，不修改历史数据。
- AC6：共享 Schemas/API client 提供两个客户端复用的账户查询、永久删除和错误契约。
- AC7：Desktop 在现有账户管理操作区提供删除，确认展示账户名与不可恢复提示；取消不请求、请求防重、成功刷新清选、失败保留并显示正确原因。
- AC8：Mobile 新增账户页签，按当前实际/模拟范围列出包括停用状态的账户且不提供创建/编辑；查询和删除使用 TanStack Query，现有 Portfolio/Risk 数据机制保持不变。
- AC9：Mobile 取消、成功、业务拒绝、网络失败、重复点击、最后账户空状态和实际/模拟切换均有验证证据。
- AC10：定向测试覆盖空账户、停用空账户、所有关联类别、零余额历史、重复请求、并发写入、事务回滚及旧停用接口兼容。
- AC11：Schema/Server/Desktop/Mobile 按定向测试、包级检查与构建、仓库门禁、隔离 PostgreSQL 的层级完成验证，并同步 migration matrix 与数据库结构门禁。
- AC12：Desktop 完成浏览器验收；Mobile 完成 Android/iOS 原生编译及模拟器关键交互。任何未完成的目标运行时门禁均保持未勾选，功能不得声明完整验收通过。
