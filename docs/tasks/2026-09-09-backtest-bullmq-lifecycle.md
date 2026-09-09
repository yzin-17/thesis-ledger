# V1 回测任务 BullMQ 生命周期实施任务

对应 Spec：[`../specs/2026-09-09-backtest-bullmq-lifecycle.md`](../specs/2026-09-09-backtest-bullmq-lifecycle.md)

## 任务

- [x] T1：建立持久化任务状态与幂等 BullMQ 投递闭环
  - 覆盖验收标准：AC1、AC2、AC4
  - 依赖：无
  - 涉及范围：`BacktestJob` Schema/迁移、BullMQ 依赖、队列适配器、创建与兼容运行接口、协调器。
  - 完成条件：数据库是唯一事实源；队列消息只含 jobId；Redis 故障时任务可保存并在恢复后补投；旧非终态任务安全收口。
  - 验证方式：先从 HTTP 和公开队列服务边界补失败测试，再验证迁移 SQL、幂等投递、双写窗口和协调器恢复。
  - 验证证据：Backtest 定向测试覆盖 Redis 不可用、旧 BullMQ 终态记录补投、运行中任务不因 Redis 查询失败被误重排；隔离 PostgreSQL 升级演练得到 `failed|100|legacy_execution_incomplete|preserved|true`，确认状态收口且 input/result 保留；migration matrix 为 3 个迁移并通过。

- [x] T2：交付独立 Worker 的领取、重试、取消与终态保护
  - 覆盖验收标准：AC1、AC2、AC3、AC8
  - 依赖：T1
  - 涉及范围：Worker 入口、sandbox processor、执行状态机、结构化错误、心跳与健康检查。
  - 完成条件：默认并发 1；最多尝试 3 次；确定性错误不重试；重复或晚到 attempt 不能覆盖终态；协作式取消收敛。
  - 验证方式：状态机行为测试、真实 BullMQ/Redis 集成测试、Worker 重启与取消故障注入。
  - 接口契约：Consumes T1 的 `BacktestJob.id` 和队列消息；Produces PostgreSQL 终态与 `BacktestJobSummary` 事件。
  - 验证证据：单元测试覆盖首次失败、第三次耗尽、确定性失败、重复领取、晚到结果、queued/running 取消；隔离 Docker 中 Worker 停止时任务保持 queued，恢复后以 `executionAttempt=1` 成功，重复调用 `/run` 两次仍仅执行一次，queued 取消在 Worker 恢复后保持 cancelled；15 秒/45 秒心跳健康入口返回成功。

- [x] T3：交付轻量任务读取与 SSE 状态通道
  - 覆盖验收标准：AC5、AC6、AC7
  - 依赖：T1
  - 涉及范围：摘要 DTO/查询、Redis Pub/Sub、SSE、Desktop API/Query/缓存、结果详情按需读取、Electron 流式代理。
  - 完成条件：摘要与事件不包含 input/result；旧完整接口兼容；页面仅有一个 SSE 连接；非终态任务每 30 秒兜底且终态后停止；代理断开时释放上游。
  - 验证方式：Server HTTP/SSE 测试、Desktop 假计时器与 EventSource 测试、Electron 代理流测试、响应体积对比和 429 回归。
  - 接口契约：Consumes T1/T2 发布的 `BacktestJobSummary`；Produces Strategy 页面任务摘要缓存和按需详情。
  - 验证证据：Server 事件测试确认 Pub/Sub/SSE 摘要剔除 input/result；Desktop 测试确认摘要与详情分离、多个订阅者共享一个 EventSource、重连刷新和非终态 30 秒兜底；Electron 代理测试确认上游结束前首个 SSE 分片已到达。隔离单任务响应中完整列表为 2744 B、摘要为 703 B；原运行环境约 453 KB 的历史全量响应未在本轮改写或清理。

- [ ] T4：完成 Compose 部署、故障恢复 Smoke 与全量一致性验证
  - 覆盖验收标准：AC2、AC8、AC9
  - 依赖：T2、T3
  - 涉及范围：生产镜像、`thesis-ledger-infra` 开发/生产 Compose、运行脚本、CI/边界与文档同步。
  - 完成条件：API、Worker、PostgreSQL、Redis 健康；Worker/Redis 短停后任务收敛；无重复结果、永久非终态或 429；三仓职责边界清晰。
  - 验证方式：目标测试、Server/Desktop 全量测试、typecheck、production build、migration matrix、边界检查、Compose smoke、浏览器/Electron 验收和 `git diff --check`。

## 计划 Preflight

- Spec 覆盖：AC1 至 AC9 均映射到至少一个实施任务；任务未引入 Spec 范围外的 Backtest V2 或引擎语义。
- 占位扫描：未发现占位词、未定义错误处理或需实施者临场决策的契约。
- 依赖检查：T1 建立数据库与队列契约；T2、T3 可在 T1 后独立推进；T4 依赖 Worker 与客户端链路完成。
- 跨任务契约：统一使用 `BacktestJob.id`、`BacktestJobSummary`、`backtest-v1`、三次 attempt 和 PostgreSQL 事实源语义。
- 未决问题：无 Blocking 或 Non-blocking 问题。
- 结论：Ready。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [ ] 必要实施 Step 均已验证；当前请求未授权提交，保持未提交状态
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：T1 至 T3 实现和自动化验证完成；T4 的隔离故障恢复已通过，但真实 Electron 页面与完整生产 Compose 健康验收尚未完成，因此 T4 和“必要实施 Step 均已验证”保持未勾选。
- 发现的问题：全仓复杂度命令仍被任务范围外的 `apps/mobile/node_modules/react-native/index.js` Flow 解析和既有 lint 错误阻断；本次修改文件的定向 ESLint 通过。
- 遗留风险：尚未在真实 Electron 窗口记录 SSE 长连接、running 取消文案与结果展示；未对 CPU 执行中硬重启做真实故障注入，当前由 attempt 条件提交测试覆盖；已有外部数据库卷未自动应用迁移或重建。
- 验证命令与结果：Server 55 个测试文件、441 项通过；Desktop 30 个测试文件、211 项通过；Server/Desktop production build、Prisma validate、边界检查、migration matrix、Compose contract、最终镜像构建和双仓 `git diff --check` 通过。隔离 Docker 验证 Worker 停止恢复、Redis 短停补投、重复派发、queued 取消和最终终态收敛；临时容器与网络已删除。
