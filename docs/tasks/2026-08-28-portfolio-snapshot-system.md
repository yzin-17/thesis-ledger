# 投资组合快照系统 V2 实施任务

> 状态对账（2026-10-03）：已实现待验收：旧“Docker 仍是旧镜像”描述已过期，当前镜像/结构见多源后继 P01/P02；本任务三个受管任务的可见、立即执行、幂等 provision 和点位质量仍需运行证据。隔离恢复成功及估值 API 空响应不证明这些行为，AC6 等义务保留在本文。 本段为当前对账结论；下文历史时点的环境与协议描述仅在其原范围有效。对账依据见[本轮 Review](../reviews/2026-10-03-task-state-reconciliation.md)。

对应 Spec：[`../specs/2026-08-28-portfolio-snapshot-system.md`](../specs/2026-08-28-portfolio-snapshot-system.md)

## 执行约束

- 先扩展 Snapshot V2 契约和 fresh baseline，再迁移消费者，最后收缩旧接口。
- 已勾选任务必须附当前工作树的验证证据；历史绿灯不能替代本次验证。
- 不清理或覆盖用户现有未提交改动。

## 任务

- [x] T1：建立 Snapshot V2 不可变修订模型
  - 覆盖验收标准：AC2、AC3、AC4、AC5、AC8
  - 依赖：无
  - 涉及范围：Prisma Schema、fresh baseline、Snapshot 领域类型与服务。
  - 完成条件：逻辑槽位、revision、替代链、幂等键、覆盖率和质量状态均有数据库约束；创建与校准保持不可变并发安全。
  - 验证方式：Prisma validate、数据库约束测试、Snapshot Service 集成测试、`git diff --check`。

- [x] T2：收缩公开接口并迁移 Performance 消费者
  - 覆盖验收标准：AC1、AC4、AC7、AC9
  - 依赖：T1
  - 涉及范围：Performance Controller/Service、Schemas、Desktop API、兼容 history/summary。
  - 完成条件：公开创建 API 和 MANUAL 契约不存在；默认查询只消费当前有效 DAILY_CLOSE 槽位；详情保留修订链；兼容接口继续工作。
  - 验证方式：Server API 测试、Performance 正确性测试、Desktop 类型检查和入口回归测试。

- [x] T3：提供三个受管估值自动化任务
  - 覆盖验收标准：AC3、AC6、AC7、AC10
  - 依赖：T1
  - 涉及范围：Automation Schema、baseline provision、Runtime Handler、`CN/HK/US` 交易日历与交易时段门禁、持仓市场识别、自动化中心。
  - 完成条件：三个 systemKey 幂等存在；可启停、改计划、立即运行和查看历史；不能改类型或删除；自动盘中采样只处理至少一个实际持仓市场处于常规交易时段的账户，整批无符合条件账户时不创建运行历史；立即运行绕过市场门禁；运行使用确定性业务幂等键。
  - 验证方式：Automation Runtime/Service 测试、交易日历时区与边界测试、估值采样账户过滤测试、Desktop 自动化 UI 测试。
  - 验证证据（2026-09-09）：
    - `pnpm --filter @thesis-ledger/server test`：51 个测试文件、425 项测试通过。
    - `pnpm --filter @thesis-ledger/server exec vitest run test/automation-market-gate.test.ts test/performance/valuation-series.test.ts`：2 个测试文件、11 项测试通过。
    - 只读运行库核对：事发时刻开放市场为 `US`，当前 actual 正数持仓中的 `US` 标的数为 0；新门禁应在创建运行历史前跳过。

- [x] T4：完成 Snapshot V2 一致性验证与文档同步
  - 覆盖验收标准：AC1–AC10
  - 依赖：T2、T3
  - 涉及范围：Snapshot/Performance/Automation 回归、边界门禁、相关领域文档。
  - 完成条件：全部 AC 有实现和证据；当前现状文档与 V2 状态无冲突；没有占位或未定义契约。
  - 验证方式：Server 测试、Desktop 测试、类型检查、边界检查、Prettier、`git diff --check`。
  - 验证证据（2026-09-09）：
    - `pnpm typecheck`：全工作区构建和类型检查通过；Desktop 构建仅有既有 chunk-size 提示。
    - `pnpm --filter @thesis-ledger/domain test`：9 个测试文件、106 项测试通过。
    - 目标文件 ESLint、Prettier、模块边界、文件尺寸 ratchet 与 `git diff --check` 通过；文件尺寸检查仅报告既有存量警告。

## 当前运行时验收拆分（2026-10-04）

原 T1–T4 的确定性实现证据保留，产品验收按以下依赖前沿继续，不以旧最终 Review 代替运行时条件。

- [x] R1：真实隔离 PostgreSQL 验证受管 provision、调度门禁和快照修订竞争。
  - 输入：原 Spec AC2–AC6、AC7、AC10；现行 Automation、Snapshot、估值服务与全部 migration。
  - 写入范围：本任务、专用隔离测试及入口；只在新建临时数据库写入固定经济输入。
  - 验证：三个 systemKey 幂等且配置保留；计划执行与立即运行；无合格市场账户时无历史/点位；分钟唯一键；相同证据竞争、正式替代及日终去重。
  - 边界：行情固定输入仅验证领域和存储，不代表在线 Provider；不写目标旧验收事实。
- [x] R2：目标 Scheduler、受管任务及真实点位闭环。
  - 依赖：R1；目标结构/代码核对通过。
  - 验证：任务可见、三个立即运行结果可追溯；真实 Scheduler 跳过关闭市场；启停与计划设置安全恢复；点位质量和兼容 history/summary；目标账户事实保持不变。
  - 运行策略：现有专用验收账户只读复用；新增数据必须明确标记验收。不得重写旧 Ledger、计划及发生记录。
- [ ] R3：自动化中心消费与最终验收对账。
  - 依赖：R2；与组合走势 T4 的浏览器验收共用同一目标运行态。
  - 验证：启停、计划、运行、历史和受管保护；逐项核对原 AC，不遗漏外部来源与交易日历边界。
  - 当前结果：受管 UI 运行、历史与配置恢复通过；目标正式校准因现行行情/NAV 输入缺失保持待补齐，最终门禁仍开放。[本轮证据](evidence/2026-10-04-portfolio-valuation-runtime.md)记录隔离库 8 项与目标实际边界。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证，并记录未提交状态
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：Snapshot V2 的修订模型、公开接口收缩与三个受管自动化任务已完成；盘中估值已按账户实际持仓识别 `CN/HK/US` 市场并通过当前工作树验证。
- 发现的问题：原实现只判断 A 股交易日，未判断交易时段，也未按持仓市场过滤账户；本轮已修复并新增独立回归测试。
- 遗留风险：交易日历静态覆盖 2025–2026，后续年度需按交易所公告更新；当前 Docker Server 仍是旧镜像，尚未在不混入其他未提交改动的前提下重建运行态。历史错误采样记录保持不变。
- 验证命令与结果：Server 51 个文件、425 项测试和 Domain 9 个文件、106 项测试通过；全工作区构建/typecheck、目标文件 ESLint/Prettier、模块边界、文件尺寸 ratchet 与 `git diff --check` 通过。
