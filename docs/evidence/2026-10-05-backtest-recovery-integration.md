# 当前 Backtest Run 恢复主仓集成复验

## 接受范围

已读取正式 chat `01a1072c-4236-7971-b9f1-0998a3401f45`（标题“回测当前 Run 独立进程恢复并行验收”）及[原报告](2026-10-04-backtest-recovery-parallel.md)，最小集成其 8 个测试、fixture、脚本、Task 与证据文件。该 chat 元数据 cwd 为 `/`，实际工作区为 `/Users/yzin/.codex/worktrees/44dc/thesis-ledger`；旧“等待初始化”记录已过期。

没有生产修复补丁、Schema 变更或新的 migration。原 T4 的目标故障注入、默认 Worker 入口心跳、429、Electron 与部署一致性保持开放。

## 主仓输入与必要复验

与子工作区相比，Backtest/Platform、全部 Prisma 输入、Shared/Domain/Schemas 源码及 manifest/TypeScript 配置中有 32 项内容差异或新增；当前共 351 个输入。路径与内容联合 SHA-256 为 `d98f2590c781a5a388e145aace0b87fbe0993a599d53f4780936bf39e947704e`。包含自然语言策略的两个新增 migration，不能沿用子工作区的 26 项结构结论。

先完成 durable-owner/reconciler/queue-CAS 的 19 项定向测试，再运行主仓 `node scripts/test-backtest-recovery.mjs`。入口构建当前冻结执行依赖和专属 Server 产物，创建独立 PostgreSQL/Redis、受限 app role、随机队列前缀与 Worker PID。当前结构为 28 migration、76 表，head 为 `20261004140000_strategy_authoring_records`。

## 三个真实场景

| 场景 | 主仓 Run | 收敛结果 |
| --- | --- | --- |
| R1 领取后 SIGKILL | `c8cb2df2-f967-47ab-ac7c-3dd37a7e2cfe` | owner 1→2；唯一成功结果，2 fills/3 equity points，checksum `b00b8f7c24b5da1b`。 |
| R2 独立 Redis 短停 | `a96a4732-8e58-4718-bf8b-22837029dfa7` | 查询失败保留 running/owner 1，恢复后 owner 1 成功，唯一结果，checksum `6803a16e58305b1f`。 |
| R3 专属运输键删除重建 | `5c949596-06cf-469e-b432-0017043c9c00` | 本地 attemptsMade 重置为 0，durable owner 1→2；旧 owner CAS 拒绝，唯一成功结果，checksum `c7b5c0fe115d424b`。 |

入口最终 exit 0，3 项通过。UTC `2026-10-04T16:04:30.382Z` 清理完成：本测试 Worker PID 82074/82105/82797/82890/82911、容器 `tl-backtest-recovery-81504-47586eb1` 与 `tl-backtest-recovery-redis-81504-37fed5be`、专属快照/Redis 临时目录均由标签及身份保护入口清理。未操作目标 Compose 或共享卷。

组合行情/Backtest 回归最终 1355 项通过，50 项独立环境测试跳过；其中 Backtest 585 项与子报告一致。Server 类型/标准 build、受影响 lint、边界、尺寸 ratchet、28 项 migration matrix 和 runtime 输入检查通过。主仓证据不能扩展为目标 Worker、Server 定时器或 Electron 已通过。

原始主仓日志：`/tmp/backtest-recovery-parent-directed.log`、`/tmp/backtest-recovery-parent-entry.log`、`/tmp/market-period-public-and-backtest-final.log`。本接受范围不含提交、推送、数据库重建或生产部署。
