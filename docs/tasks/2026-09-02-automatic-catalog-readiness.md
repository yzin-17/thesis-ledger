# 自动标的目录就绪实施任务

对应 Spec：[`../specs/2026-09-02-automatic-catalog-readiness.md`](../specs/2026-09-02-automatic-catalog-readiness.md)

## 任务

- [x] T1：实现并验证 Server 自动目录就绪闭环
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC5、AC6、AC7
  - 依赖：无
  - 涉及范围：`apps/server/src/market` 的目录协调、现有 DSA Catalog Client/Controller 边界、Desktop 标的搜索错误提示、`infra/docker/server.Dockerfile` 的构建期原生依赖，以及相应 Server/Desktop 定向测试。
  - 完成条件：Server 启动后自动恢复空目录；已有目录只在成功同步超过 24 小时时刷新；搜索最多等待 5 秒但后台持续跟踪同一 DSA Job 至终态或 lease 到期；已有上一代完整目录时刷新失败不阻断搜索；进程内与跨实例并发不提交重复或不一致投影；状态接口和稳定错误契约可诊断当前状态；Desktop 将目录未就绪说明为后台准备而非要求用户手动同步；不改变 DSA Contract、已确认身份或上一代完整目录。
  - 验证方式：覆盖真实启动生命周期、空目录自动同步、24 小时刷新边界、长 Job 在搜索超时后成功、进程内去重、跨实例投影竞争、ready/stale/unavailable 状态、稳定 `503 catalog_not_ready` 契约、DSA 失败与既有非空目录回归；覆盖 Desktop 的目录未就绪提示；执行受影响 Server/Desktop 类型检查、测试、Lint、构建与 `git diff --check`；必要时再更新现有容器进行黑盒验证。
  - 当前实现：Server 每 5 分钟执行一次轻量本地状态检查，仅在目录不可用或上次成功同步超过 24 小时时触发 DSA Job；搜索只等待 5 秒，后台按 DSA lease 持续跟踪同一 Job。ready、stale、unavailable 与 refreshInProgress 分离；stale 目录刷新失败仍可搜索。成功但 generation 未变化时更新 `CatalogSyncState.syncedAt`，重新开始 24 小时窗口。状态接口暴露 Job、最近尝试、错误与退避信息；`catalog_not_ready` 使用稳定 `errorCode` 并保留通用 `error` 兼容字段。
  - 验证证据：
    - `rtk pnpm vitest run test/market/catalog-readiness.service.test.ts test/instrument.service.test.ts`：2 个文件、18/18 通过；覆盖真实启动钩子、空目录、24 小时边界、31 秒长 Job、搜索等待结束后的后台继续、进程内去重、并发投影竞争、同 generation 成功时间更新、ready/stale/unavailable、诊断字段和 DSA 失败。
    - `rtk pnpm test`（`apps/server`）：46 个文件、341/341 通过；`rtk pnpm run typecheck` 与 `rtk pnpm run build`：通过。
    - `rtk pnpm test`（`apps/desktop`）：20 个文件、116/116 通过；`rtk pnpm run typecheck`：通过。
    - 目标 ESLint（含复杂度、嵌套三元和函数行数规则）：0 warning；`rtk node scripts/check-boundaries.mjs`：`Import boundaries: OK`；全仓文件尺寸 ratchet：通过，保留既有 warning。
    - `rtk git diff --check`：通过。
  - 运行边界：本轮未重建或替换运行容器；下一次容器更新后需黑盒复核 `GET /market-data/catalog/status`、空目录自动恢复和 `GET /market-data/instruments/search?q=159516`。既有 Docker build-stage 原生依赖改动未在本轮变更。

## 计划预检

- Spec 覆盖：通过；AC1 至 AC7 均由 T1 覆盖，T1 未引入 Spec 外范围。
- 占位与未定义契约扫描：通过；没有 `TBD`、`TODO` 或依赖实施者猜测的任务描述。
- 依赖审查：通过；这是可独立验证的单一纵向闭环，无需拆分人为依赖。
- 未决问题：无 Blocking；实际目录刷新采用用户确认后的 24 小时边界，轻量状态检查默认 5 分钟。
- 跨任务一致性：通过；仅复用既有 Catalog Job、snapshot/delta、ACK 与 `Instrument` 名称。
- 结论：Ready with non-blocking assumptions。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证；未获提交授权，改动保持未提交状态
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：完成。AC1 至 AC7 均有实现和确定性验证证据，Spec、Task、Server、Desktop 与错误契约一致。
- 发现的问题：同 generation 的成功刷新若不更新 syncedAt，会导致目录持续处于 stale；已通过受 generation/checksum 约束的持久化更新时间修复并覆盖回归测试。
- 遗留风险：真实目录源仍受外部网络与上游可用性影响；已有完整目录时按 stale 可用策略继续搜索。运行容器尚未更新，本轮结论不包含新实现的容器黑盒验收。
- 验证命令与结果：Server 341/341、Desktop 116/116、定向 18/18、两端 typecheck、Server build、目标 ESLint、边界检查和 `git diff --check` 均通过；运行容器验收待下一次部署。
