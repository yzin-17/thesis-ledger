# S07 / S08 / S09 / I01 父项收口对账

## 对账边界

本轮只判断 M1 内部实现父项是否已达到各自完成条件，不签发严格 PIT 历史资格、HiThink 真实来源准入或目标业务 Run。S05 的最终历史来源资格仍保持失败关闭；`G0-H-target`、`G-Deploy-159516`、`G-Run`、`G-UI-159516` 均不由本轮提升。

当前源码未新增生产逻辑。针对“联合预检 → 冻结输入 → 完整 Snapshot/多窗口 → 执行/终态/重放”重新执行 14 个 Server 测试文件，共 **124 passed / 0 failed**；随后 `pnpm --filter @thesis-ledger/server typecheck` 退出 0。

## S07：服务端预检 API 与失效规则

三个子项 `S07-dependencies`、`S07-api`、`S07-revision` 均已有完成证据。本轮再次覆盖非价格依赖、执行预检及配置准备；缺失事实或不合格历史资格继续返回诊断/拒绝，不生成快照或任务。

结合 [S07 API 当前实现对账](2026-09-28-cont-s07-api-reconciliation.md) 已验证的 Server/API Client 合同、目标 HTTP 400 非法请求及任务数不变，S07 的“API、诊断、revision 失效、直接非法提交拒绝”完成条件已满足。S05 未取得严格历史资格只会使预检保持不可 ready，不构成 S07 实现缺口。

## S08：冻结统一价格协议与实际输入

本轮通过 `backtest-snapshot-v3-input-plan/source/dependencies`、`v3-complete-snapshot`、`v3-multi-window-snapshot`、`v3-snapshot-builder` 与严格重放保护测试。覆盖实际用途价格计划、来源/证据、依赖事实、多窗口完整响应、Parquet 落盘、篡改拒绝、完整性重算及原子 finalize。

完整 Snapshot 用例证明：冻结后断开 Reader 仍可重放；不能相信外部 `complete` 标签，必须从冻结事实重算绑定/版本/规则；行情证明与执行日历冲突时阻止 finalized 并清除未完成写入。多窗口用例证明删除/改写证据或执行价格会拒绝重放。
严格 PIT 当前没有最终来源资格时，`v3-strict-snapshot-replay-guard` 仍拒绝旧严格重放、伪最终证据与首次 finalize，且保持原文件字节；固定 V3 路径仍可重放和幂等 finalize。因此 S08 的冻结实现已完成，而严格来源资格继续由 S05 独立门禁所有。

## S09：Run 执行、持久终态与离线重放

本轮 `v3-run-execution` 15 项、`v3-run-lifecycle` 8 项、configured run 与 legacy version boundary 均通过。V3 执行会从完整 Builder Snapshot 离线执行并通过 attempt CAS 持久化；错误 frozen identity、伪 checksum、缺 Schema 字段均拒绝。

此前 [S09 执行审计](2026-09-27-s09-execution-audit.md) 已覆盖队列 CAS、重复投递、晚到结果、取消竞争及队列查询失败不误补投；[I01 JSONB 修复](2026-09-28-cont-i01-jsonb-orm-fix.md) 又以真实隔离 PostgreSQL/Redis、HTTP 创建、BullMQ 与独立生产 Worker 子进程验证成功/失败终态、结果查询和离线重放。S08 本轮收口后，S09 前置已满足。

## I01：最早可执行的真实领域语义联通

I01 的完成条件明确允许 fixture 来源，只要求普通 Run 从创建、投递、领取、冻结、真实引擎到数据库终态、查询与离线重放完整联通，并确保真实账户域无模拟写入。[I01 JSONB 修复](2026-09-28-cont-i01-jsonb-orm-fix.md) 已在修复实际 ORM JSONB 位模式问题后重新通过该组合；[D01 目标运行态核对](2026-09-28-cont-d01-target-runtime.md) 进一步确认目标 Server/Worker/DSA 关键运行代码与当前已验证实现一致。

随着 S07、S08、S09 父项完成，I01 的内部依赖链已满足，可按其 fixture 纵向联通完成条件收口。它仍不证明 HiThink 账号在线、真实 `159516.SZ` 来源可用或 AC17 产品验收通过。

## 本轮结论

收口：`S07`、`S08`、`S09`、`I01`。保持开放：`S05` 最终严格 PIT 资格、`G0-H-target`、`G-Deploy-159516`、`G-Run`、`G-UI-159516` 及完整 G0/M1/AC 总验收。
