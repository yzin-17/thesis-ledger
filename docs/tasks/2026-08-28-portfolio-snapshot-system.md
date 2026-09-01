# 投资组合快照系统实施任务

对应 Spec：[`../specs/2026-08-28-portfolio-snapshot-system.md`](../specs/2026-08-28-portfolio-snapshot-system.md)

状态：待实现

## 执行约束

- 以 Spec 的 `scope + accountId + mode` 作为快照身份，不新增持久化 Portfolio 或用户 owner 模型。
- 保持 Ledger 为唯一资产事实源；Snapshot 只保存 Server 计算出的不可变历史派生记录。
- 所有创建来源都调用同一个 `SnapshotService.create()`；禁止 Performance、Automation、Import 或消费者复制写入逻辑。
- 先扩展新字段和兼容适配，再迁移消费者，最后删除确认无调用方的旧字段；实现期间保持 `/performance/history` 和 `/performance/summary` 可用。
- 新增或修改说明性文档使用中文；路径、代码标识符、协议名和必要技术术语保留原文。
- 只在对应验证通过后勾选任务；确定性测试、数据库迁移、真实 Scheduler/Worker 和 Desktop 视觉验收分别记录证据。

## 跨任务契约

- `SnapshotScope`：`account | portfolio`。
- `PortfolioMode`：`actual | shadow`。
- `SnapshotSource`：`DAILY_CLOSE | TRANSACTION | IMPORT | MANUAL | SYSTEM`；`SYNC` 仅为后续扩展。
- `SnapshotStatus`：MVP 为 `VALID | INVALID`。
- `SnapshotPayloadV2`：`accountScopePolicy`、顶层摘要、`accounts[]`、`positions[]`、`nativeByCurrency[]`、`dataQuality`、`projection` 和可选 `fx`；组合口径固定为 `investment-only-v1`。
- `SnapshotService.create/list/get/invalidate`：唯一创建和状态管理入口。
- `SnapshotTrigger`：事务后 `TRANSACTION/IMPORT` 请求，使用唯一 `idempotencyKey` 和 `PENDING/RUNNING/SUCCEEDED/FAILED` 状态。
- 公开手动创建不接受 `source`、`idempotencyKey` 或历史 `snapshotAt`；Server 填充 `MANUAL`、当前时间和随机幂等键。

## 任务

- [ ] **T1：扩展 Snapshot 数据模型并完成旧数据兼容迁移**
  - 覆盖验收标准：AC1、AC2、AC8
  - 依赖：无
  - 涉及范围：Prisma `PortfolioSnapshot`、迁移 SQL、旧 `capturedAt` 映射、scope/mode/source/status/valuationStatus、金额可空性、计数、备注、幂等键、失效字段和 payload v2 版本标记。
  - 完成条件：数据库能表达 account/portfolio 两种范围和 actual/shadow 两种模式；旧行可重复迁移且不生成伪历史；唯一幂等键和 scope/account 不变量在数据库层生效；旧字段适配说明写入迁移测试。
  - 验证方式：Prisma validate、迁移矩阵、隔离旧数据迁移、scope/account CHECK、重复幂等键和回滚演练；核对 `git diff --check`。

- [ ] **T2：实现 SnapshotService 的一致性估值和幂等创建闭环**
  - 覆盖验收标准：AC3、AC4、AC5、AC6、AC7
  - 依赖：T1
  - 涉及范围：Server SnapshotService、SnapshotPayloadV2、Quote/Fund NAV/FX 适配、账户/现金/持仓聚合、projection generation 重检、`SnapshotTrigger` 表和服务端错误码。
  - 完成条件：手动、自动和触发请求都能通过统一服务创建；单币种直接汇总，多币种按原币保存并遵守 FX 阻断/陈旧规则；partial 不丢可用金额；同一自动幂等键并发只保留一条；投影变化最多重试 3 次后返回稳定冲突。
  - 验证方式：Domain/Server 单测覆盖金额、现金、partial、FX 直接/反向/陈旧/缺失、并发幂等、投影版本冲突和错误码；使用 Decimal 字符串核对冻结 payload。

- [ ] **T3：提供快照创建、列表、详情和兼容读取 API**
  - 覆盖验收标准：AC3、AC9、AC10、AC12
  - 依赖：T2
  - 涉及范围：`PerformanceController`、共享 Schema、API Client、`POST/GET /performance/snapshots`、详情路由、`/performance/history` 和 `/performance/summary` 适配。
  - 完成条件：公开手动请求由 Server 填充 MANUAL/current time/random key；列表支持 scope/account/mode/source/status/time range/limit/cursor，默认 `snapshotAt DESC, id DESC`；详情返回冻结摘要和 payload；旧 history/summary 请求和字段继续可读。
  - 验证方式：Schema contract、Controller/API Client 测试；覆盖空列表、详情不存在、partial、FX blocked、游标稳定排序、旧 capturedAt 适配和错误响应。

- [ ] **T4：完成 Performance 快照查询迁移与收益状态兼容**
  - 覆盖验收标准：AC3、AC6、AC12
  - 依赖：T3
  - 涉及范围：`PerformanceService.history/summary`、Performance 查询层、SnapshotRecord 适配、partial/快照不足/FX 阻断状态。
  - 完成条件：Performance 不再直接依赖旧表字段推断来源；默认只消费有效快照但保留 partial 明细；单币种全部账户、混合币种分组和 FX 合并行为与现有收益分析契约一致；缺少快照不触发创建。
  - 验证方式：Server performance correctness、Desktop performance query contract、单/多币种和 actual/shadow 隔离测试；确认 TTWROR/XIRR 原有公式不变。

- [ ] **T5：增加 Portfolio 与收益分析的手动创建和历史入口**
  - 覆盖验收标准：AC9、AC10
  - 依赖：T3、T4
  - 涉及范围：Desktop Performance/Portfolio 页面、Snapshot Create Sheet、历史列表/详情局部面板、TanStack Query Mutation 和精确失效键。
  - 完成条件：无历史时主按钮为“创建第一个快照”；Portfolio 和 Performance 均可创建当前范围快照；当前时间只读、备注可编辑、失败保留草稿；partial 成功不显示为失败；历史列表和详情可访问且不增加一级导航。
  - 验证方式：Desktop UI contract、Query/Mutation 测试，覆盖创建中、成功、partial、失败重试、键盘操作、窄屏 Sheet 底部操作和缓存范围隔离。

- [ ] **T6：扩展 Snapshot Automation Job 配置和日终执行**
  - 覆盖验收标准：AC7、AC11
  - 依赖：T2、T3
  - 涉及范围：AutomationJob settings Schema/迁移、创建/编辑/启停/立即运行 API、Automation Runtime Handler、Scheduler 日历保护、Desktop“收益快照”配置卡片或 Sheet。
  - 完成条件：任务显式保存 cron、timezone、scope、accountIds、mode、fxMerge 和 baseCurrency；组合范围调用一次 portfolio Snapshot；账户范围只处理配置账户；日终幂等键按业务日期去重；最近运行、失败原因和重试入口可见。
  - 验证方式：Server automation service/runtime/scheduler 测试、任务配置 contract、Desktop 状态测试；隔离数据库执行同一业务日期两次并核对唯一快照。

- [ ] **T7：接入 Ledger 交易后和 Import 完成后的 SnapshotTrigger**
  - 覆盖验收标准：AC3、AC7、AC13
  - 依赖：T2、T6
  - 涉及范围：Ledger V2 命令成功提交后的触发、ImportDraft 最终提交后的触发、SnapshotTrigger worker/poll、重试和失败记录。
  - 完成条件：触发请求只在原事务成功后创建；交易修正/作废/恢复和跨账户移动使用稳定 event/fact key；Import 只有最终 committed revision 创建一次；部分提交、失败和重试不生成伪造完成快照。
  - 验证方式：Server integration/transaction tests、并发重复提交、失败重试、进程重启后 pending trigger 恢复和实际 Scheduler 运行演练；核对 AutomationRun/Trigger/Snapshot 关联。

- [ ] **T8：实现 Snapshot 状态失效和维护边界**
  - 覆盖验收标准：AC8、AC14
  - 依赖：T2、T3
  - 涉及范围：`SnapshotService.invalidate()`、内部维护命令、状态查询过滤、单租户网络边界说明、失效审计字段。
  - 完成条件：失效只能改变 status、invalidatedAt 和 reason；原摘要、payload、来源和时点保持不变；普通 Desktop 不出现编辑冻结内容或失效入口；不存在未实现的用户 owner 声明。
  - 验证方式：Service/API regression、不可变字段断言、历史默认过滤和文档/权限边界检查。

- [ ] **T9：完成端到端回归、文档同步和最终一致性 Review**
  - 覆盖验收标准：AC1–AC15
  - 依赖：T1、T2、T3、T4、T5、T6、T7、T8
  - 涉及范围：Domain/Schema/Server/API Client/Desktop 测试汇总，`CONTEXT.md`、ADR-003、`docs/domain/2026-08-18-ledger-and-performance.md`、README、旧 Snapshot 自动化 Spec/Task 的链接和状态。
  - 完成条件：新 Spec 与 Task、现状文档和代码命名一致；旧快照/旧 API/新 API 的兼容边界有证据；所有验收标准都有测试或运行时证据；真实定时任务、数据库迁移、宽窄屏 Desktop 验收分别记录，不用单测替代。
  - 验证方式：定向 Domain/Server/Desktop/API Client tests、typecheck、build、lint、migration matrix、`git diff --check`，以及至少一次真实 Scheduler/数据库和 Desktop 运行验收；完成 Spec/Task 最终一致性 Review。

## 最终一致性 Review

- [ ] Spec 中的全部验收标准均有对应实现
- [ ] 所有已勾选任务均有验证证据
- [ ] 所有任务依赖均已满足且无错误阻塞关系
- [ ] 跨任务接口、类型和命名保持一致（如适用）
- [ ] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [ ] 实现未超出 Spec 声明的范围
- [ ] 测试策略、测试实现与验证结果一致
- [ ] 测试与文档已同步更新
- [ ] 必要实施 Step 均已验证；如已获提交授权，已形成合理 commit，否则已记录提交状态或建议边界
- [ ] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：
- 发现的问题：
- 遗留风险：
- 验证命令与结果：
