# 服务端标的目录聚合实施任务

对应 Spec：[服务端标的目录聚合 Spec](../specs/2026-09-18-instrument-directory-server-read-aggregation.md)

> 状态：已完成本地实现、分层验证和 Docker 运行态更新；浏览器和安装态门禁未执行

## 任务

- [x] T1：建立共享 InstrumentDirectory Schema、类型和 Server 目录解析模块。
  - 覆盖验收标准：AC1、AC4
  - 依赖：无；现有 `Instrument` 目录表、MarketModule 和目录同步状态已存在。
  - 涉及范围：`packages/schemas` 的目录展示契约、`apps/server/src/market/instruments` 的批量精确解析、MarketModule 导出；不新增数据库结构、不改变模糊搜索和目录同步。
  - 完成条件：输入代码被标准化、去重并一次批量查询；active/inactive 选择规则、未解析结果和 generation 有定向测试；目录查询不触发远程请求。
  - 验证方式：Schema 测试、InstrumentDirectoryService 定向测试、MarketModule 类型检查。
  - 证据：`packages/schemas` 契约测试通过；`apps/server/test/instrument-directory.service.test.ts` 4 项定向测试通过；Server typecheck 通过。

- [x] T2：将 Ledger 有效事件、审计事件和重放响应改为服务端聚合标的目录。
  - 覆盖验收标准：AC2、AC4
  - 依赖：T1 的响应契约和解析模块接口就绪。
  - 涉及范围：LedgerModule 依赖 MarketModule；`LedgerQueryService` 和 `trade-api` 响应 Schema；保留 LedgerEvent 原始 payload 和账本投影行为。
  - 完成条件：所有 Ledger 读响应包含与返回事件对应的目录聚合；清仓后无 Position 仍能通过目录显示名称；目录解析失败不丢失事件。
  - 验证方式：Ledger Query 定向测试覆盖 effective、audit、replay、清仓后历史事件和目录缺失；API contract 测试通过。
  - 证据：`ledger-query.service.test.ts` 覆盖 effective/audit/replay 的目录字段；目录服务失败场景保持业务读取降级；Server typecheck 通过。

- [x] T3：将 Journal 复盘候选改为服务端聚合标的目录。
  - 覆盖验收标准：AC3、AC4
  - 依赖：T1 的响应契约和解析模块接口就绪；不依赖 T2 的实现代码。
  - 涉及范围：JournalModule 依赖 MarketModule；`JournalService` 和 Journal candidates 响应 Schema；不修改 Trade Projection、复盘计算或 Journal 持久化。
  - 完成条件：复盘候选按返回项代码批量聚合目录；已平仓交易和目录缺失场景均有明确返回语义。
  - 验证方式：Journal Service 定向测试和 API contract 测试，覆盖 trade cycle、close slice、分页和未知代码。
  - 证据：`apps/server/test/journal/services.test.ts` 通过并断言目录名称随候选响应返回；Journal/API schemas 契约测试通过。

- [x] T4：让 Desktop 账户数据和投资复盘消费主接口中的目录聚合。
  - 覆盖验收标准：AC5
  - 依赖：T2、T3 的响应字段就绪；前端只消费既有账户事件和复盘候选请求。
  - 涉及范围：账户数据成交/现金展示、Journal candidate 展示、相关类型和测试；移除名称对当前持仓的唯一依赖；不新增目录 query、搜索请求或名称持久化。
  - 完成条件：清仓后的交易名称和已平仓复盘名称正常展示；未知代码显示代码；网络 mock 证明没有额外目录请求。
  - 验证方式：Desktop 定向组件/查询测试，受影响包 typecheck/build。
  - 证据：账户数据和复盘 UI/API 定向测试覆盖目录名称与代码回退；页面仍只使用既有 Ledger/Journal 查询；Desktop typecheck 通过。

- [x] T5：完成跨包验证和最终一致性 Review。
  - 覆盖验收标准：AC6
  - 依赖：T1、T2、T3、T4 均完成本地验证。
  - 涉及范围：Schema、Server、Desktop 受影响包测试与仓库门禁；Docker 更新按独立运行态门禁执行，不进行安装替换或未授权提交。
  - 完成条件：定向测试、包级 typecheck/build、必要边界检查通过；Spec/Task 状态、验收映射和证据同步。
  - 验证方式：按“定向测试 → 包级检查 → 仓库门禁 → Docker 运行态”顺序执行，并记录未执行的浏览器/安装态门禁。
  - 证据：受影响包 build、`scripts/check-boundaries.mjs`、`scripts/check-workspace-dependencies.mjs`、作用域 ESLint、Prettier 和 `git diff --check` 均通过；`thesis-ledger-infra/scripts/update.sh thesis-ledger` 在默认 `DEV_DATABASE_MODE=check` 下通过，`thesis-ledger`、`backtest-worker` 容器健康，`/api/v1/health` 返回 healthy；未执行浏览器和安装态验收。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / 批量精确解析、generation、未解析语义 | T1 | T1 定向测试 |
| AC2 / Ledger 三类读响应聚合且不受清仓影响 | T2 | T2 Ledger Query/API contract 测试 |
| AC3 / Journal 复盘候选聚合 | T3 | T3 Journal/API contract 测试 |
| AC4 / 目录失败不丢业务数据，安全回退 | T1、T2、T3 | 各任务失败场景测试 |
| AC5 / Desktop 只消费主响应，无第二目录请求 | T4 | T4 Desktop 定向测试 |
| AC6 / 分层验证和证据边界 | T5 | T5 受影响包与仓库门禁 |

## 规划前置 Review

- 结论：可实施。
- Blocking：无。
- 范围边界：服务端负责目录聚合；Desktop 仅消费主响应；不新增持久化名称字段、不修改目录同步策略、不替换或部署用户运行中的应用。
- 集成责任：T2/T3 负责服务端响应契约，T4 负责 Desktop 消费；T5 负责跨包一致性检查。

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [x] 必要集成、Docker 运行态与条件性门禁均已通过或有合法不适用依据
- [x] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [x] 跨任务接口、类型、状态、时间、错误与副作用语义一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [x] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [x] 证据类型、场景覆盖、代码版本与目标环境支持所声明的验收结果
- [x] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [x] 必要实施 Step 已验证；提交处理符合授权且保留既有用户修改
- [x] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

- 结论：通过；本地实现、定向测试、受影响包构建、仓库静态门禁和 Docker 运行态更新均已完成。
- 已确认的问题及责任任务：无。
- 尚未通过的必要门禁与阻塞原因：无；浏览器和安装态验收属于本次明确保留的后续运行态门禁，未用本地静态证据替代。
- 遗留风险或已确认的后续范围：其他 symbol 消费页面在本任务后按同一 Server 模块迁移；不影响本次账户数据和投资复盘验收。
- 验证命令/过程、结果与证据引用：Schema、API Client、Server、Desktop 定向测试通过；Schema/API Client/Server/Desktop build 通过；`scripts/check-boundaries.mjs` 与 `scripts/check-workspace-dependencies.mjs` 通过；作用域 ESLint、Prettier 和 `git diff --check` 通过；Docker `update.sh thesis-ledger`、容器健康检查和 `/api/v1/health` 通过。
