# 当前 Run 取消与投递的模式 CAS

## 修改

当前 Run 的公开运行、重试、取消入口在进入队列或执行服务前，已核验完整持久化 RunConfig、Snapshot 与结果合同。底层取消入口现在先拒绝旧 `mode/input`，投递状态和取消更新的数据库条件均包含 `mode='V3'`；若读取后模式在 CAS 前变化，取消复读当前记录并明确拒绝，不将旧记录作为取消成功返回。未对旧行执行转换或更新。

## 验证

- `queue-cas-isolation`、`queue-lifecycle`、`current-run-boundary`：3 文件 30 项通过，含旧合同底层取消、读取后模式变化、无副作用拒绝及原有取消竞态。
- `retry-cancel-recovery`：7 项通过。
- Server typecheck、build、定向 ESLint 与 `check-boundaries.mjs`：通过。

上述是模拟 Prisma/队列的本地验证；隔离 PostgreSQL 中的真实 CAS、目标 Worker 和故障恢复仍未通过，`C02-b/C02-c` 保持开放。
