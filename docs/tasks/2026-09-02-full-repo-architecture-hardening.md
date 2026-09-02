# 全仓架构审查与核心边界加固 Tasks

> 日期：2026-09-02  
> 状态：Completed  
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
| P0 | Portfolio 复合持仓写拆成多个 Ledger 命令 | 已由 #26 收敛 |
| P1 | `RiskService` 多职责巨型服务 | 已由 #27 按变化理由拆分 |
| P1 | `PerformanceService` 多职责巨型服务 | 已由 #28 拆分 |
| P2 | workspace runtime dependency 无 graph guard | 已由 #29 增加机器守卫 |
| P2 | `POST /ledger/events` 已失效但仍暴露 | 已由 #30 删除 |
| P2 | Ledger baseline import 较大 | 暂缓，未混入本轮实现 |
| P2 | API Client 单文件集中 | 观察，未混入本轮实现 |
| P3 | Desktop bundle / 外部 smoke | 继续按现有验收文档处理，不属于本轮架构主线 |

## 3. TASK-ARCH-072：确认 Ledger V2 复合命令语义

优先级：P0

### 实施

- [x] 核对 `LedgerV2Repository.withAccountWrite()` / `withAccountsWrite()` 的 revision 与 projection generation 推进规则。
- [x] 明确一次复合命令内追加多条 V2 event 时的 `ledgerRevision` 语义。
- [x] 明确批次内 `economicOrderKey` 的唯一、稳定与可重放规则。
- [x] 确认跨账户命令沿 Repository 稳定账户顺序锁定。
- [x] 将最终规则写入 Server/Ledger Architecture SSOT，不另建第二套 Ledger 协议。

### 验收

- [x] 不破坏 `asOfRevision` / replay。
- [x] 不破坏现有 execution / cash / baseline 单命令语义。
- [x] 复合命令失败时 revision / generation 不产生半提交。

实施证据：#26；Architecture SSOT：`docs/architecture/2026-09-02-server-module-boundaries.md`。

## 4. TASK-ARCH-073：原子持仓身份迁移

优先级：P0

### 实施

- [x] 在 Ledger application boundary 增加窄范围 position baseline move 命令。
- [x] 同账户换 symbol 使用单个账户写上下文。
- [x] 跨账户使用单个 `withAccountsWrite()`。
- [x] 同一事务内追加旧位置归零与新位置 Baseline Observation。
- [x] 每个受影响账户只做一次最终 projection rebuild。
- [x] `PortfolioService.updatePosition()` 不再顺序调用两个 `setPosition()`。

### 测试

- [x] 同账户换 symbol 成功。
- [x] 第二步故障时旧 Position 保持不变。
- [x] 跨账户迁移成功。
- [x] 目标账户校验、event append、rebuild 任一失败时两个账户全部回滚。
- [x] 并发跨账户写遵守稳定锁序。

实施证据：#26。

## 5. TASK-ARCH-074：原子批量清仓

优先级：P0/P1

### 实施

- [x] 在 Ledger 层增加 `clearPositions(accountId)` 窄命令。
- [x] 在账户写事务内读取实际 Position 集合。
- [x] 按稳定 symbol 顺序追加 quantity=0 Baseline Observation。
- [x] 全部 event 追加完成后仅 rebuild 一次。
- [x] 返回事务内实际 cleared 数量。
- [x] `PortfolioService.clearPositions()` 只调用复合命令，不在事务外读取后循环写。

### 测试

- [x] 空账户稳定返回 0。
- [x] 多 Position 一次性清空。
- [x] 中间 append 失败全部回滚。
- [x] rebuild 失败全部回滚。
- [x] 多 Position 仅一次最终 rebuild。

实施证据：#26。

## 6. TASK-ARCH-075：RiskService characterization 与职责拆分

优先级：P1

### 6.1 先锁定现有语义

- [x] 为 Rule create/update/archive/audit 补足 service characterization tests。
- [x] 锁定 account/symbol target validation 与 needsRepair 语义。
- [x] 锁定 `testRule()` 的 context enrichment / stale / holding peak 行为。
- [x] 锁定 regular trigger state transition、dedupe、重复 scan 行为。
- [x] 锁定 trailing-stop breach state 行为。
- [x] 锁定 notification enqueue 失败时 RiskEvent 已持久化、结果返回 error 的现有语义。

### 6.2 按变化理由拆分

- [x] `RiskRuleService`：Rule CRUD / target validation / version / audit。
- [x] `RiskContextService`：scan input parse、context derive/enrich、holding peak 准备。
- [x] `RiskEventService`：trigger state、dedupe、RiskEvent persistence、regular/trailing transition。
- [x] `RiskService`：保留 scan/test orchestration facade 与 domain evaluator 调用。

### 验收

- [x] Controller contract 不变。
- [x] domain `evaluateCompleteRule()` 不迁回 Server 私有实现。
- [x] NotificationService 仍拥有通知投递/重试职责。
- [x] 主 Risk facade 不再同时实现完整 Rule 生命周期与底层 event state machine。
- [x] 不新增新的 >600 行 server service。
- [x] 现有 risk tests + characterization tests 纳入回归门禁。

实施证据：#27。

## 7. TASK-ARCH-076：PerformanceService characterization 与职责拆分

优先级：P1

### 7.1 先锁定现有语义

- [x] capture：position / cash / market / FX / partial data 行为。
- [x] history：单账户、多账户、mixed currency、historical FX blocked 行为。
- [x] summary：TTWROR / XIRR 与 external portfolio flow 语义。
- [x] layers / allocation / rebalance 行为。
- [x] targets：explicit target、多账户 target aggregation 与 fallback 行为。

### 7.2 最小拆分

- [x] 增加 `PerformanceSnapshotService`，拥有 capture/history 与 snapshot persistence/materialization。
- [x] 增加 `PerformanceAnalysisService`，拥有 summary、TTWROR/XIRR 输入编排与 allocation/rebalance。
- [x] 根据独立持久化生命周期与聚合依赖，增加 `PerformanceTargetService`；Layers 同样按独立 read-model 装配职责拆出。
- [x] `PerformanceService` 保留为兼容 facade，Controller / 客户端 contract 不变。
- [x] 所有 FX 路径继续复用 `market/fx-conversion.ts`。

### 验收

- [x] HTTP response shape 不变。
- [x] mixed-currency / partial / FX evidence 不变。
- [x] Snapshot 与 Analysis 可以独立测试。
- [x] 不复制 FX conversion 算法。
- [x] 不新增新的 >600 行 server service。

实施证据：#28。

## 8. TASK-ARCH-077：Workspace runtime dependency graph guard

优先级：P2

### 实施

- [x] 基于 workspace `package.json` 读取内部 runtime dependency graph。
- [x] runtime 覆盖 `dependencies`、`optionalDependencies`、`peerDependencies`。
- [x] `devDependencies` 不参与 runtime cycle 判定，避免 test-only 依赖误报。
- [x] 检测 `@thesis-ledger/*` runtime cycle。
- [x] packages 禁止依赖 `apps/*` / `services/*`。
- [x] 固化当前允许 runtime 关系：`shared` 底层、`domain -> shared`、`api-client -> schemas`、adapter -> domain/schemas。
- [x] 接入 `pnpm lint` CI quality gate。

### 测试

- [x] 当前 graph fixture 通过。
- [x] package reverse dependency fixture 失败。
- [x] runtime cycle fixture 失败。
- [x] dev-only 合法依赖不会被误报成 runtime cycle。

实施证据：#29；机器入口：`scripts/check-workspace-dependencies.mjs`。

## 9. TASK-ARCH-078：收敛 Ledger V2 旧公共写入口

优先级：P2

### 审计

- [x] Desktop 不调用 `POST /ledger/events`。
- [x] Mobile 不调用该 endpoint。
- [x] `packages/api-client` 不暴露该通用写接口。
- [x] tests / scripts / docs 无必须兼容的调用方。

### 决策：无兼容调用方，直接删除

- [x] 删除 `LedgerController.append()` endpoint。
- [x] 删除 `LedgerService.append()` dead method。
- [x] 删除旧入口行为测试，并保留“旧写面不存在”的 regression test。

兼容窗口路径不适用，因此未保留 deprecated 400 endpoint。

实施证据：#30；回归测试：`apps/server/test/ledger/legacy-endpoint-removal.test.ts`。

## 10. TASK-DOC-079：Server module boundary SSOT 与 Spec 收敛

优先级：P2

- [x] 在 `docs/architecture/` 增加简洁 Server module boundary 文档。
- [x] 记录 Ledger -> Portfolio 的写边界：Portfolio 发起用户命令，Ledger 拥有多事实事务。
- [x] 记录 Risk -> Notification 单向依赖；Notification 不反向依赖 Risk。
- [x] 记录 Performance 读取 Ledger/Market projection，但不拥有 Ledger 写入。
- [x] 记录 package runtime dependency graph 与机器检查入口。
- [x] 标明 V2 已覆盖旧 Position Adjustment 写入语义。
- [x] 不复制各 Spec 的完整业务协议，只维护模块所有权与依赖方向。

实施证据：#31；文档：`docs/architecture/2026-09-02-server-module-boundaries.md`。

## 11. TASK-REVIEW-080：最终全仓回归 Review

优先级：P2

- [x] 检查是否出现新的多 `setPosition()` / 多 Ledger 写编排入口：复合迁移与批量清仓均由 Ledger compound command 持有事务，未发现新的 Portfolio 复合写编排。
- [x] 检查 Risk / Performance 新 service 是否形成反向依赖或循环 facade：Risk -> Notifications 单向；Notifications 不依赖 Risk；Performance 未注入 Ledger 写服务。
- [x] 检查 workspace graph 是否与 package.json 实际状态一致：#29 guard 从 manifest runtime fields 构图并以内置 fixtures 校验。
- [x] 检查旧 endpoint 是否还有残留调用方：Controller 已无 `POST /ledger/events`，API Client 未暴露旧写入口，并有 removal regression test。
- [x] 检查 Spec / Task / Architecture 是否互相冲突：Architecture SSOT 按 #25 与 #26–#30 的实际实现收敛，无新增第二套协议。
- [x] 确认未把本轮明确暂缓的 Baseline Import / API Client 组织债混入实现：#26–#30 changed-file scope 未包含对应组织重构。

Review 收口：#31。

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

实际实施遵循上述阶段边界：#26–#30 分阶段合并，#31 负责 CI 与文档收口。

## 13. 完整验证门禁

#31 的代码与架构收口已通过 GitHub Actions CI #233 的完整代码门禁：

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm contract:test`
- [x] `pnpm guardrails:complexity`
- [x] `pnpm migration:matrix`（本轮无 schema/migration 变化；CI 仍执行现有 matrix）

定向验证：

- [x] Ledger atomic rollback / lock order / rebuild count。
- [x] Risk regular + trailing state / dedupe / notification retry。
- [x] Performance mixed currency / historical FX / target aggregation。
- [x] workspace dependency fixtures。
- [x] 旧 `/ledger/events` 写面不存在的 regression contract。

## 14. 风险控制

- Ledger：禁止为了批量写方便退回旧 V1 Adjustment 或多个独立事务。
- Risk：禁止在拆分同时修改 rule semantics、通知策略或 domain evaluator。
- Performance：禁止复制 FX 算法；拆分不改变响应 shape。
- Packages：guard 首次上线以当前合法 graph 为基线，不顺带做大规模依赖搬迁。
- API：旧 endpoint 删除前必须完成调用方审计。
- 文档：本任务的“全仓 review”只代表审查覆盖全仓，不代表要求一次代码 PR 修改全仓。

## 15. PR 与实施证据

| Task | PR | 结果 |
| --- | --- | --- |
| `TASK-ARCH-072`–`074` | #26 | Ledger V2 compound semantics、atomic position move、atomic clear |
| `TASK-ARCH-075` | #27 | Risk Rule / Context / Event / facade 职责拆分 |
| `TASK-ARCH-076` | #28 | Performance Snapshot / Analysis / Layer / Target / facade 拆分 |
| `TASK-ARCH-077` | #29 | workspace runtime dependency graph guard |
| `TASK-ARCH-078` | #30 | 删除旧通用 Ledger 写入口 |
| `TASK-DOC-079` / `TASK-REVIEW-080` | #31 | Architecture SSOT、全仓回归 Review、CI 收口 |

本轮 `TASK-ARCH-072`–`TASK-REVIEW-080` 已全部完成；#31 负责承载最终 CI 修复、Architecture SSOT 与任务状态收口。
