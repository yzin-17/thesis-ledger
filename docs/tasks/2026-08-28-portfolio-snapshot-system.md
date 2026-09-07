# 投资组合快照系统 V2 实施任务

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
  - 覆盖验收标准：AC3、AC6、AC7
  - 依赖：T1
  - 涉及范围：Automation Schema、baseline provision、Runtime Handler、Scheduler 日历与交易时段门禁、自动化中心。
  - 完成条件：三个 systemKey 幂等存在；可启停、改计划、立即运行和查看历史；不能改类型或删除；运行使用确定性业务幂等键。
  - 验证方式：Automation Runtime/Service 测试、Scheduler 测试、Desktop 自动化 UI 测试。

- [x] T4：完成 Snapshot V2 一致性验证与文档同步
  - 覆盖验收标准：AC1–AC9
  - 依赖：T2、T3
  - 涉及范围：Snapshot/Performance/Automation 回归、边界门禁、相关领域文档。
  - 完成条件：全部 AC 有实现和证据；当前现状文档与 V2 状态无冲突；没有占位或未定义契约。
  - 验证方式：Server 测试、Desktop 测试、类型检查、边界检查、Prettier、`git diff --check`。

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

- 结论：Snapshot V2 的修订模型、公开接口收缩与三个受管自动化任务已完成，当前工作树验证通过。
- 发现的问题：无 Snapshot V2 Blocking 问题。
- 遗留风险：完整浏览器端到端验收依赖使用 fresh baseline 启动的新 Server；该项由组合估值走势任务继续记录，不影响 Snapshot 服务与自动化契约验收。
- 验证命令与结果：Server `397` 项、Desktop `161` 项、Schemas `103` 项测试通过；三包 typecheck、目标文件 ESLint、模块边界、文件尺寸 ratchet 与两仓库 `git diff --check` 通过。
