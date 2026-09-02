# 全仓架构审查与核心边界加固 Tasks

> 日期：2026-09-02  
> 状态：Planned  
> 对应 Spec：[`2026-09-02-full-repo-architecture-hardening`](../specs/2026-09-02-full-repo-architecture-hardening.md)

## 1. 执行原则

- 本任务来自对当前 `main` 的全仓重新审查，不以最近提交或上一轮遗留项作为范围。
- 正确性问题优先于结构美化；结构重构必须保持 API 与业务语义不变。
- 每个阶段独立形成小 PR，不要求一次性完成所有任务。
- 不引入新的通用框架来“统一”尚未稳定重复的模式。
- 每个拆分任务必须先有 characterization / regression tests，再移动职责。
- 所有说明性文档继续使用中文。

## 2. 全仓候选项与本轮排序

| 优先级 | 候选项 | 本轮结论 |
| --- | --- | --- |
| P0 | Portfolio 复合持仓写拆成多个 Ledger 命令 | 立即处理，存在部分提交风险 |
| P1 | `RiskService` 多职责巨型服务 | 处理，沿变化理由拆分 |
| P1 | `PerformanceService` 多职责巨型服务 | 处理，分离 Snapshot / Analysis |
| P2 | workspace runtime dependency 无 graph guard | 处理，补机器守卫 |
| P2 | `POST /ledger/events` 已失效但仍暴露 | 审计并收敛 |
| P2 | Ledger baseline import 较大 | 暂缓，先不扩大 V2 迁移链 |
| P2 | API Client 单文件集中 | 观察，当前契约边界仍一致 |
| P3 | Desktop bundle / 外部 smoke | 继续按现有验收文档处理，不属于本轮架构主线 |

## 3. TASK-ARCH-072：确认 Ledger V2 复合命令语义

优先级：P0

### 实施

- [ ] 核对 `LedgerV2Repository.withAccountWrite()` / `withAccountsWrite()` 的 revision 与 projection generation 推进规则。
- [ ] 明确一次复合命令内追加多条 V2 event 时的 `ledgerRevision` 语义。
- [ ] 明确批次内 `economicOrderKey` 的唯一、稳定与可重放规则。
- [ ] 确认跨账户命令沿 Repository 稳定账户顺序锁定。
- [ ] 将最终规则写入 Server/Ledger Architecture SSOT，不另建第二套 Ledger 协议。

### 验收

- [ ] 不破坏 `asOfRevision` / replay。
- [ ] 不破坏现有 execution / cash / baseline 单命令语义。
- [ ] 复合命令失败时 revision / generation 不产生半提交。

## 4. TASK-ARCH-073：原子持仓身份迁移

优先级：P0

### 实施

- [ ] 在 Ledger application boundary 增加窄范围 position baseline move 命令。
- [ ] 同账户换 symbol 使用单个账户写上下文。
- [ ] 跨账户使用单个 `withAccountsWrite()`。
- [ ] 同一事务内追加旧位置归零与新位置 Baseline Observation。
- [ ] 每个受影响账户只做一次最终 projection rebuild。
- [ ] `PortfolioService.updatePosition()` 不再顺序调用两个 `setPosition()`。

### 测试

- [ ] 同账户换 symbol 成功。
- [ ] 第二步故障时旧 Position 保持不变。
- [ ] 跨账户迁移成功。
- [ ] 目标账户校验、event append、rebuild 任一失败时两个账户全部回滚。
- [ ] 并发跨账户写遵守稳定锁序。

## 5. TASK-ARCH-074：原子批量清仓

优先级：P0/P1

### 实施

- [ ] 在 Ledger 层增加 `clearPositions(accountId)` 或等价窄命令。
- [ ] 在账户写事务内读取实际 Position 集合。
- [ ] 按稳定 symbol 顺序追加 quantity=0 Baseline Observation。
- [ ] 全部 event 追加完成后仅 rebuild 一次。
- [ ] 返回事务内实际 cleared 数量。
- [ ] `PortfolioService.clearPositions()` 只调用复合命令，不在事务外读取后循环写。

### 测试

- [ ] 空账户稳定返回 0。
- [ ] 多 Position 一次性清空。
- [ ] 中间 append 失败全部回滚。
- [ ] rebuild 失败全部回滚。
- [ ] 多 Position 仅一次最终 rebuild。

## 6. TASK-ARCH-075：RiskService characterization 与职责拆分

优先级：P1

### 6.1 先锁定现有语义

- [ ] 为 Rule create/update/archive/audit 补足 service characterization tests。
- [ ] 锁定 account/symbol target validation 与 needsRepair 语义。
- [ ] 锁定 `testRule()` 的 context enrichment / stale / holding peak 行为。
- [ ] 锁定 regular trigger state transition、dedupe、重复 scan 行为。
- [ ] 锁定 trailing-stop breach state 行为。
- [ ] 锁定 notification enqueue 失败时 RiskEvent 已持久化、结果返回 error 的现有语义。

### 6.2 按变化理由拆分

建议目标：

- [ ] `RiskRuleService`：Rule CRUD / target validation / version / audit。
- [ ] `RiskContextService`：scan input parse、context derive/enrich、holding peak 准备。
- [ ] `RiskEventService`：trigger state、dedupe、RiskEvent persistence、regular/trailing transition。
- [ ] `RiskService`：保留 scan/test orchestration facade 与 domain evaluator 调用。

如果实现过程中发现某两个职责没有独立变化理由，可以合并；禁止为了文件数制造空壳 service。

### 验收

- [ ] Controller contract 不变。
- [ ] domain `evaluateCompleteRule()` 不迁回 Server 私有实现。
- [ ] NotificationService 仍拥有通知投递/重试职责。
- [ ] 主 Risk facade 不再同时实现完整 Rule 生命周期与底层 event state machine。
- [ ] 不新增新的 >600 行 server service。
- [ ] 现有 risk tests + characterization tests 全部通过。

## 7. TASK-ARCH-076：PerformanceService characterization 与职责拆分

优先级：P1

### 7.1 先锁定现有语义

- [ ] capture：position / cash / market / FX / partial data 行为。
- [ ] history：单账户、多账户、mixed currency、historical FX blocked 行为。
- [ ] summary：TTWROR / XIRR 与 external portfolio flow 语义。
- [ ] layers / allocation / rebalance 行为。
- [ ] targets：explicit target、多账户 target aggregation 与 fallback 行为。

### 7.2 最小拆分

- [ ] 增加 `PerformanceSnapshotService`，拥有 capture/history 与 snapshot persistence/materialization。
- [ ] 增加 `PerformanceAnalysisService`，拥有 summary、TTWROR/XIRR 输入编排、layers/allocation/rebalance。
- [ ] TargetAllocation 先归 Analysis；只有测试与依赖显示其变化理由独立时再增加 `PerformanceTargetService`。
- [ ] `PerformanceService` 可作为兼容 facade，避免一次修改 Controller / 客户端 contract。
- [ ] 所有 FX 路径继续复用 `market/fx-conversion.ts`。

### 验收

- [ ] HTTP response shape 不变。
- [ ] mixed-currency / partial / FX evidence 不变。
- [ ] Snapshot 与 Analysis 可以独立测试。
- [ ] 不复制 FX conversion 算法。
- [ ] 不新增新的 >600 行 server service。

## 8. TASK-ARCH-077：Workspace runtime dependency graph guard

优先级：P2

### 实施

- [ ] 基于 workspace `package.json` 读取内部 runtime dependency graph。
- [ ] runtime 至少覆盖 `dependencies`、`optionalDependencies`、`peerDependencies`。
- [ ] `devDependencies` 作为测试/构建 graph 单独处理，避免把 test-only 依赖误判成生产反向依赖。
- [ ] 检测 `@thesis-ledger/*` runtime cycle。
- [ ] packages 禁止依赖 `apps/*` / `services/*`。
- [ ] 固化当前允许 runtime 关系：`shared` 底层、`domain -> shared`、`api-client -> schemas`、adapter -> domain/schemas。
- [ ] 接入 `pnpm lint` 或等价 CI quality gate。

### 测试

- [ ] 当前 graph fixture 通过。
- [ ] package reverse dependency fixture 失败。
- [ ] runtime cycle fixture 失败。
- [ ] dev-only 合法依赖不会被误报成 runtime cycle。

## 9. TASK-ARCH-078：收敛 Ledger V2 旧公共写入口

优先级：P2

### 审计

- [ ] Desktop 不调用 `POST /ledger/events`。
- [ ] Mobile 不调用该 endpoint。
- [ ] `packages/api-client` 不再暴露该写接口。
- [ ] tests / scripts / docs 无必须兼容的调用方。

### 决策

若无兼容调用方：

- [ ] 删除 `LedgerController.append()` endpoint。
- [ ] 删除 `LedgerService.append()` dead method。
- [ ] 删除仅服务旧入口的 contract/tests/docs。

若仍需兼容窗口：

- [ ] 定义明确 deprecated/removed response contract；
- [ ] 写明删除版本；
- [ ] 增加 contract test；
- [ ] 不继续保留普通 BadRequest 作为永久行为。

## 10. TASK-DOC-079：Server module boundary SSOT 与 Spec 收敛

优先级：P2

- [ ] 在 `docs/architecture/` 增加一份简洁 Server module boundary 文档。
- [ ] 记录 Ledger -> Portfolio 的写边界：Portfolio 发起用户命令，Ledger 拥有多事实事务。
- [ ] 记录 Risk -> Notification 单向依赖；Notification 不反向依赖 Risk。
- [ ] 记录 Performance 读取 Ledger/Market projection，但不拥有 Ledger 写入。
- [ ] 记录 package runtime dependency graph 与机器检查入口。
- [ ] 标明 V2 已覆盖旧 Position Adjustment 写入语义。
- [ ] 不复制各 Spec 的完整业务协议，只维护模块所有权与依赖方向。

## 11. TASK-REVIEW-080：最终全仓回归 Review

优先级：P2

每个实施阶段完成后重新从全仓视角检查，不只 review diff。

- [ ] 搜索是否出现新的多 `setPosition()` / 多 Ledger 写编排入口。
- [ ] 检查 Risk / Performance 新 service 是否形成反向依赖或循环 facade。
- [ ] 检查 workspace graph 是否与 package.json 实际状态一致。
- [ ] 检查旧 endpoint 是否还有残留调用方。
- [ ] 检查 Spec / Task / Architecture 是否互相冲突。
- [ ] 确认未把本轮明确暂缓的 Baseline Import / API Client 组织债偷偷混入实现。

## 12. 推荐实施顺序

```text
072 V2 compound semantics
 ├─> 073 atomic position move
 └─> 074 atomic clear positions

075 Risk characterization + split

076 Performance characterization + split

077 workspace dependency guard

078 legacy Ledger endpoint convergence
        ↓
079 architecture SSOT
        ↓
080 full-repo final review
```

072-074 应最先完成。075 与 076 可以独立并行，但各自只做结构重构，不混入功能新增。

## 13. 完整验证门禁

最终收口至少执行：

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm contract:test`
- [ ] `pnpm guardrails:complexity`
- [ ] `pnpm migration:matrix`（若有 schema/migration 变化）

定向验证：

- [ ] Ledger atomic rollback / lock order / rebuild count。
- [ ] Risk regular + trailing state / dedupe / notification retry。
- [ ] Performance mixed currency / historical FX / target aggregation。
- [ ] workspace dependency fixtures。
- [ ] `/ledger/events` contract。

## 14. 风险控制

- Ledger：禁止为了批量写方便退回旧 V1 Adjustment 或多个独立事务。
- Risk：禁止在拆分同时修改 rule semantics、通知策略或 domain evaluator。
- Performance：禁止复制 FX 算法；拆分不改变响应 shape。
- Packages：guard 首次上线以当前合法 graph 为基线，不顺带做大规模依赖搬迁。
- API：旧 endpoint 删除前必须完成调用方审计。
- 文档：本任务的“全仓 review”只代表审查覆盖全仓，不代表要求一次代码 PR 修改全仓。