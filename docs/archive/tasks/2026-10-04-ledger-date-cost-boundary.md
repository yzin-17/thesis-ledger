# Ledger 日期精度成本策略修复任务

对应 Spec：[日期精度成本策略边界](../../specs/2026-10-04-ledger-date-cost-boundary.md)

状态：全部修复与验收完成，工作保持未提交。

- [x] T1：修复成本策略时间比较并验证领域边界
  - 覆盖：AC1、AC2、AC3；依赖无。
  - 范围：`packages/domain/src/trade-costs.ts`、定向领域回归。
  - 完成条件：等时策略可用、未来策略拒绝、offset 排序正确；成本守恒及策略固定回归通过。
- [x] T2：通过基金定投生产 HTTP 与隔离数据库闭环
  - 覆盖：AC4；依赖 T1。
  - 范围：原基金定投 T2.R1/R2 的隔离 PostgreSQL 测试、Domain/Server 构建及仓库门禁。
  - 完成条件：确认、幂等、竞争回滚通过；原定期现金与 Ledger 定向回归通过；记录当前迁移 head 和清理证据。

## 最终一致性 Review

- [x] 验收标准全部有验证证据，跨模块接口与依赖方向保持一致。
- [x] 定向测试、构建和门禁通过，输入范围与结果已记录。
- [x] 目标 Docker 与 Browser 在原 T2.R3 独立通过，未用本地证据替代。

Review 结论：同日零点 DATE/INSTANT 等时、未来策略拒绝和 UTC offset 排序的 5 项回归通过；原成本定向 16 项、Domain 全包 300 项通过；基金定投隔离 PostgreSQL 13 项与目标首次日期成交确认通过。实现无新增公共接口或依赖方向变化，无未解决实施义务，可归档。命令、输入及结果见[分层证据](../../tasks/evidence/2026-10-04-recurring-fund-runtime.md)。

提交边界：保留工作树已有改动，不提交或推送。
