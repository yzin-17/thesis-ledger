# 账户永久删除实施任务

对应 Spec：[账户永久删除 Spec](../specs/2026-09-14-permanent-account-deletion.md)

> 状态：T1-T5、G1-G2 已完成；G3 受浏览器控制面阻塞；G4 模拟器验收按用户要求暂缓，原生编译受本机工具链阻塞

## 执行约束

- 一次只完成一个任务；前置任务完成并记录证据后才进入下一依赖前沿。
- 保留当前工作区已有修改，不清理、覆盖、提交或暂存无关变更。
- 数据库、Docker、浏览器和原生模拟器验收逐级执行；低层失败时不提前运行高成本门禁。
- 不执行破坏性数据库重建，不自动处理 migration 发现的孤立引用。
- 每个任务仅在自身实现、定向验证和验收依赖全部通过后勾选；代码已写但验证不足仍保持未勾选。

## 任务

- [x] T1：补齐账户引用的数据库限制删除约束与升级保护
  - 覆盖验收标准：AC3（数据库最终保护）、AC5、AC10（迁移与并发引用基础）、AC11（migration 输入与结构门禁）
  - 依赖：无
  - 涉及范围：`schema.prisma`、新增 migration、五个缺失 Account relation 的模型、migration matrix/runtime 输入/结构检查及定向测试；不实现 HTTP 删除和客户端。
  - 完成条件：五个模型均建立 `ON DELETE RESTRICT`；migration 在新增约束前检测并报告每个表的孤立账户引用，且不修改数据；Prisma relation 双向定义正确；新 migration 自动成为结构 head 并被现有门禁完整纳入。
  - 验证方式：Schema diff 审查；一次性 `DATABASE_URL` 的 Prisma validate；migration SQL 定向测试；migration matrix、runtime database input 和结构 head 测试。
  - 验证证据：通过；`prisma validate`、平台定向测试 17 项、migration matrix/runtime input（8 条 migration、65 张 SQL 表、58 个 Prisma model、7 张 raw-owned 表、head=`20260914090000_permanent_account_deletion`）及 `git diff --check` 通过。父级审查确认 Schema 仅增加五组双向 relation，migration 只做孤立引用检查和 `RESTRICT` 外键创建。证据边界：未执行真实 PostgreSQL，实际升级阻断、FK 与并发行为由 G1 验证。

- [x] T2：实现独立永久删除服务、HTTP 路由与共享客户端契约
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC6、AC10
  - 依赖：T1
  - 涉及范围：Portfolio/Account 所属 Server module、独立删除服务、controller、共享 schemas/API client、Server/contract 定向测试；保留现有停用实现和路由。
  - 完成条件：新 endpoint 严格返回 204/404/409；事务内锁行、完整检查 Prisma/raw-owned 关联并删除；查询/删除异常回滚；重复和并发写入行为符合 Spec；共享 API client 可供两个客户端复用。
  - 验证方式：服务单元/事务测试、controller 测试、共享 contract 测试；覆盖空账户、停用空账户、每类关联、零余额历史、查询失败、删除失败、重复请求、并发写入和旧停用接口。
  - 验证证据：通过；Server 42 项、Schemas 171 项、API client 16 项测试及三个包的 typecheck/build 通过。服务定向测试逐项覆盖 23 个 Prisma delegate、raw-owned `StrategyRiskApplication`、零余额历史、查询/删除失败、P2003、重复删除、204 route 和旧停用兼容。父级 Review 发现 API client 曾接受任意 2xx，已收紧为只接受 204，并补充非 204 成功拒绝与 409 中文 payload 保留测试（5/5、typecheck 通过）。证据边界：事务测试使用 mock seam；真实行锁、FK 竞争和目标 Server 响应由 G1/G2 验证。

- [x] T3：在 Desktop 账户管理中接入永久删除交互
  - 覆盖验收标准：AC7、AC10（客户端重复提交）
  - 依赖：T2 的共享契约和 endpoint 行为已通过定向验证
  - 涉及范围：现有账户管理操作区、全局确认弹窗、TanStack Query mutation、相关缓存/选择状态及 Desktop 定向测试；不重做账户管理 UI，不新增传统 CSS。
  - 完成条件：确认内容显示账户名和不可恢复提示；取消零请求；pending 防重；成功刷新并清理所删选择，最后账户进入空态；业务冲突显示服务端原因，网络失败提供重试提示并保留账户。
  - 验证方式：Desktop API/mutation/action/component 定向 Vitest；断言 endpoint、缓存失效、清选、失败保留和重复点击。
  - 验证证据：通过；Desktop 永久删除定向测试 8/8 与 build 通过，`git diff --check -- apps/desktop` 通过。复用既有确认弹窗和 destructive Button，取消零请求；增加确认期间与请求期间双重防重；成功失效 Portfolio 查询并刷新管理列表/路由，后续列表刷新失败不会倒置已成功删除的结果；409 保留中文原因，其他失败显示网络重试；选择 helper 覆盖删除当前账户和最后账户，页面 effect 清理 URL、sessionStorage、Sheet 与草稿状态。shadcn CLI docs 因本机 MCP SDK/Zod 冲突不可用，已核对项目 Base UI/lucide 配置、本地组件和官方 Alert Dialog/Button 文档，未更新组件或依赖。证据边界：未执行浏览器交互，G3 仍未通过。

- [x] T4：在 Mobile 新增账户页签及查询/删除交互
  - 覆盖验收标准：AC8、AC9、AC10（客户端重复提交）
  - 依赖：T2 的共享契约和 endpoint 行为已通过定向验证
  - 涉及范围：Mobile 导航、独立账户 Screen、TanStack Query Provider/query/mutation、原生确认、选择/空态和定向测试；不替换 Portfolio/Risk store，不增加创建编辑能力。
  - 完成条件：当前 actual/shadow 范围内账户列表包含停用账户；取消零请求、pending 防重；成功后账户与既有业务数据刷新并清选；失败保留账户并区分业务原因与网络重试；最后账户显示空态。
  - 验证方式：mock fetch/store/query 定向测试及可自动化组件断言；实际原生确认交互留给 G4。
  - 验证证据：通过；Mobile 账户/既有 store 定向测试 15/15、TypeScript build 和 `git diff --check -- apps/mobile pnpm-lock.yaml` 通过。账户页使用独立 TanStack Query，按 actual/shadow 请求并包含停用账户；Portfolio/Risk store 未替换。原生 Alert 覆盖取消、Android dismiss、名称与不可恢复提示；同 handler 防重；删除成功后账户 refetch 与 store refresh 均按最佳努力执行且不倒置删除结果；409/网络错误、缓存列表查询失败重试、选择 fallback 与最后账户空态均有定向断言。证据边界：React Native 组件因当前 Vitest 未配置 Flow 转换，仅能对部分 UI 采用源级断言；Android/iOS 原生编译与模拟器交互由 G4 验证。

- [x] T5：完成受影响包级检查、构建与仓库门禁
  - 覆盖验收标准：AC10、AC11
  - 依赖：T1、T2、T3、T4
  - 涉及范围：Schemas、API client、Server、Desktop、Mobile 和仓库级静态门禁；不包含 PostgreSQL、浏览器或模拟器运行验收。
  - 完成条件：所有受影响包的测试、typecheck/build 通过；lint、boundary、migration matrix、runtime database input、diff check 等相关仓库门禁通过；失败项有明确责任任务并修复后重跑。
  - 验证方式：按“定向测试 → 包级测试/typecheck/build → 仓库门禁”执行并记录命令、结果和工作区基线。
  - 验证证据：通过；Schemas 171/171、API client 18/18、Server 90 个测试文件（593 通过、11 跳过）、Desktop 253/253、Mobile 15/15；五个受影响包的 typecheck/build 均通过。`prisma validate`、migration matrix（8 条 migration，head=`20260914090000_permanent_account_deletion`）、runtime database input、import boundaries、workspace dependency graph、根 lint 和 `git diff --check` 通过。仅修复本功能测试 mock 的显式 `any` 与 API client 类型转出 lint 问题。React Native Flow 文件仍打印既有解析 warning，但 lint 退出码为 0 且无 error。证据边界：未运行 PostgreSQL、目标 Server、浏览器或原生平台门禁。

## 产品级运行门禁

- [x] G1：隔离 PostgreSQL migration 与数据完整性验收
  - 覆盖验收标准：AC3、AC4、AC5、AC10、AC11
  - 依赖：T1、T2、T5
  - 环境前提：隔离 PostgreSQL；可创建干净库与受控孤立引用/并发会话；不得使用目标开发数据卷。
  - 关键场景：干净升级、五表分别存在孤立引用时升级阻断、FK `RESTRICT`、并发引用写入、重复删除、检查/删除失败回滚、旧停用接口兼容。
  - 通过证据：数据库版本、migration head、Server 源码/工作区基线、SQL/HTTP 断言和最终无悬空引用检查。
  - 验证证据：通过；两个无宿主/外部卷的临时 `postgres:17-alpine` 环境完成验证并已精确清理，开发容器未停止或修改。8 条 migration clean apply 到 head=`20260914090000_permanent_account_deletion`；五个新增 FK 均为 PostgreSQL `confdeltype=r`。五张表分别注入 orphan 后升级均按表名和数量失败且原行保留。真实 Prisma/service 验证 active/inactive 空账户删除、零余额 Ledger 历史 `ACCOUNT_IN_USE` 且数据保留、`FOR UPDATE` 期间并发子写入最终失败且无孤儿、并发重复删除一成功一 404、再次删除 404。只读清理核对确认仅既有 `thesis-ledger-dev-*` 等容器仍运行。证据边界：G1 为隔离 DB/进程内验证，不证明目标 HTTP route 或客户端交互。

- [x] G2：目标 Server 运行时 endpoint 验收
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC6
  - 依赖：G1；目标运行时已加载当前源码/镜像和 migration head
  - 关键场景：启用/停用空账户 204、不存在 404、代表性各类关联 409 中文原因、重复请求与事务失败。
  - 通过证据：运行配置、route 可达性、HTTP 响应、数据库前后状态及日志摘要。
  - 验证证据：通过；当前工作树 commit 基线 `c7c03c9` 的新 build 在隔离 Server `http://127.0.0.1:3317/api/v1` 与无卷 PostgreSQL/Redis 上运行，8 条 migration 与 `SchemaVersion` 均为当前 head。active/inactive 空账户 204，无 body；malformed/missing 404；Ledger、ImportDraft、RiskRule、AiDecisionLog、StrategyRiskApplication 均 409 `ACCOUNT_IN_USE` 中文原因；零余额 Ledger 历史保留；并发重复删除一 204 一 404；旧 DELETE 返回 200、仅 `active=false`。临时 rename raw-owned 表使检查失败时返回通用 500、无 SQL 泄漏且账户保留。DSA 故意不可用使整体 health 为 degraded，但隔离 DB/Redis 和本功能 route 就绪。临时 Server、Network、PostgreSQL、Redis 均已精确清理，只读核对确认 3317 无监听且既有开发容器保持原状态。

- [ ] G3：Desktop 浏览器关键交互验收
  - 覆盖验收标准：AC7、AC12
  - 依赖：T3、T5、G2
  - 关键场景：取消、成功、业务拒绝、网络失败、重复点击、删除当前账户、删除最后账户、实际/模拟账户显示与选择收敛。
  - 通过证据：目标 Server/前端版本、浏览器操作结果、必要的 Network/Console 摘要和关键状态截图。
  - 当前证据：阻塞；隔离无卷 PostgreSQL/Redis、当前 Server `3318` 和 Vite `5179` 曾就绪，migration head 正确且 Vite `/api` 代理实测 200。为支持不触碰默认 3000 开发栈，Vite proxy 复用既有 `THESIS_LEDGER_API_URL`，默认仍为 `http://localhost:3000`；Desktop 定向测试 8/8、build、diff check 通过。Browser 自动选择的 Edge 对 `tabs.new/list/goto` 均超时或请求失败，故障指引后的 in-app Browser 与 Chrome 也不可用；未执行点击或 DELETE，无 Network/Console/截图证据。临时进程、无卷容器和端口均已精确清理，既有开发环境未触碰。

- [ ] G4：Mobile Android/iOS 原生编译与模拟器关键交互验收
  - 覆盖验收标准：AC8、AC9、AC12
  - 依赖：T4、T5、G2
  - 关键场景：两个平台原生编译；账户页签、实际/模拟切换、包含停用账户、取消、成功、业务拒绝、网络失败、重复点击、最后账户空态，以及 Portfolio/Risk 仍按既有机制刷新。
  - 通过证据：Android/iOS 编译结果、模拟器与 Server 版本、关键交互记录和必要截图；只完成一端不得勾选 G4。
  - 当前证据：阻塞并暂缓。用户于 2026-09-14 明确要求先不验证原生模拟器，因此未启动、安装或操作 Android/iOS 模拟器，也未执行删除交互。compile-only 尝试中，Android Studio JDK 21 与 SDK 可用，但无 Gradle 9.3.1 本地分发缓存；普通与提升网络权限后的唯一重试均在下载固定 Gradle 时因 `SSLHandshakeException` / `EOFException` 失败，未进入项目源码编译。iOS 使用 generic device、`CODE_SIGNING_ALLOWED=NO` 执行 `xcodebuild`，到达构建图和 Asset Catalog 后因 `iOS 26.5 Platform Not Installed` 失败，未进入 Swift/React Native 源码编译。全部临时 Gradle cache、DerivedData 和本轮启动的 adb daemon 已清理；未安装工具链、未改文件。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / 新旧 DELETE 语义与状态码 | T2 | T2、G2 |
| AC2 / 启用与停用空账户 | T2 | T2、G1、G2 |
| AC3 / 全关联拒绝与中文原因 | T1、T2 | T2、G1、G2 |
| AC4 / 锁、事务、并发与回滚 | T2 | T2、G1、G2 |
| AC5 / 五个 FK 与孤立引用阻断 | T1 | T1、G1 |
| AC6 / 共享 Schema/API client | T2 | T2、T5、G2 |
| AC7 / Desktop 交互 | T3 | T3、G3 |
| AC8 / Mobile 页签与数据机制 | T4 | T4、G4 |
| AC9 / Mobile 交互矩阵 | T4 | T4、G4 |
| AC10 / 定向回归矩阵 | T1-T4 | T1-T5、G1 |
| AC11 / 分级工程与数据库验证 | T1-T5 | T5、G1、G2 |
| AC12 / 浏览器、原生编译与模拟器 | T3、T4 | G3、G4 |

## 规划 Preflight

- 结论：Ready
- 审查范围：账户永久删除 Spec、T1-T5、G1-G4、AC1-AC12 映射和依赖前沿。
- 覆盖与责任：全部功能规则、数据完整性要求、两端交互矩阵及分级验证均有实现与验证责任。
- 粒度与集成：数据库约束、Server/共享契约、两个客户端和高成本运行环境可独立接受；G1-G4 没有承接缺失的本地实现。
- 依赖与契约：T1 → T2 → 客户端，T3/T4 仅在 T2 契约就绪后启动；T5 汇总低成本门禁，G1/G2/G3/G4 逐级推进，无循环依赖。
- 未决问题：无 Blocking；“当前实际／模拟范围”已按现有全局 mode 明确解释。
- 证据边界：规划已就绪不代表实现或任何运行态门禁已通过。

## 实施证据

实施后按任务记录命令、结果、工作区基线和证据边界。

## 最终一致性 Review

- [ ] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [ ] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据
- [x] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [x] 跨任务接口、类型、状态、时间、错误与副作用语义一致
- [x] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [x] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [x] 证据类型、场景覆盖、代码版本与目标环境支持所声明的验收结果
- [x] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [ ] 必要实施 Step 已验证；提交处理符合授权且保留既有用户修改
- [x] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

- 结论：阻塞；本地实现、包级/仓库门禁、隔离 PostgreSQL 与目标 Server HTTP 验收通过，但完整产品运行验收尚未通过。
- 已确认的问题及责任任务：G3 的浏览器控制面不可用；G4 的 Android Gradle 分发下载和 iOS Platform 缺失阻止原生编译，模拟器交互按用户要求暂缓。
- 尚未通过的必要门禁与阻塞原因：G3 无浏览器点击、Network/Console 或截图证据；G4 无 Android/iOS compile pass 和模拟器关键交互证据。
- 遗留风险或已确认的后续范围：Desktop 的真实取消/重复点击/错误展示/最后账户空态尚待浏览器；Mobile 的原生 Alert、账户页签及 actual/shadow 交互尚待两个平台模拟器。
- 验证命令/过程、结果与证据引用：T1-T5、G1-G2 的逐项证据见各任务；G3/G4 的环境、尝试、清理和证据边界见对应门禁。
