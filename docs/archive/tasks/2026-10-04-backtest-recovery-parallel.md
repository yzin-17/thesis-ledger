# 当前 Backtest Run 隔离故障恢复执行包

权威合同：[生命周期 Spec](../../specs/2026-09-09-backtest-bullmq-lifecycle.md)、[原 T4 的归档任务](2026-09-09-backtest-bullmq-lifecycle.md)、Canonical C02 当前实现。本文保存隔离叶历史范围；2026-10-06 父任务已完成目标门禁，本文随之归档。

## 范围与基线

工作区 `/Users/yzin/.codex/worktrees/44dc/thesis-ledger`；HEAD `514abeebfe57bac0c16271439d8b777ff3b02a9f`。原主仓同 HEAD，开始时有 262 项 dirty WIP；Backtest 源码/测试及 Prisma 输入逐文件相同。Domain、Schemas 的原主仓未提交增量涉及其他主题，详见证据；不复制这些增量。

仅拥有本主题隔离测试、专属入口和证据。原主仓、DSA、infra 只读；不部署、不改数据库结构、不使用收费 Provider、不创建子代理。

## 独立叶与门禁

- [x] R1 领取后硬杀：当前 Run 通过真实领域快照创建，独立 PID 的真实 BullMQ Worker/生产 processor 完成数据库领取后 SIGKILL；重启后由既有 transport/reconciler 恢复到 owner=2 和唯一成功结果。
- [x] R1-CAS 晚到提交：真实数据库上的旧 owner CAS 探针更新0行；结果/checksum/终态不变。生产取消确认语义仍留给目标验收。
- [x] R2 Redis 短停：专属 Redis 停止后查询失败不能误恢复 running；恢复后数据库终态收敛。
- [x] R3 运输记录重建：独立删除专属运输键后重新投递，BullMQ 本地 attempt 重置；数据库 owner 继续单调增加，有限预算不变。
- [x] V 定向测试、受影响 Server typecheck/build、必要门禁和最终一致性检查。
- [x] 目标 T4：2026-10-06 父任务独立完成目标 claimed 后硬杀、Redis 短停、429、真实 Electron SSE/取消/结果、正式保留数据更新及新镜像一致性；本项依据[最终目标证据](../../tasks/evidence/2026-10-06-backtest-target-lifecycle.md)完成，隔离叶本身仍只证明其原范围。

R1 先独立验收，再进入 R2/R3；每叶保存独立时序与断言。使用全量 migration、自动结构 head、raw-owned 表和受限 app role。独立随机容器/loopback 端口/队列前缀/Run 身份/Worker PID/本工作区构建产物。只终止本测试 ChildProcess、按标签清理本测试容器，不删除共享卷。

## 实施与验收约束

领取屏障只阻塞专属冻结 manifest 的文件读取，生产执行器与结果校验保持真实；不硬编码成功、不 mock 进程。BullMQ 默认锁/停滞扫描与数据库最多三次 owner 预算不调整。协调器使用生产类；测试显式触发既有 reconcile，不伪称目标 Server 定时器通过。

失败时保存最小重现，不扩展到行情、策略编写、Schema 或 AI。共享 helper 由父对话统一集成。结果与清理记录写入 [专属证据](../../tasks/evidence/2026-10-04-backtest-recovery-parallel.md)。

## 执行检查点

R1/R2/R3 为 `worker_done`：可复现入口3项通过，Backtest包级585项通过，Server类型与标准构建、边界、migration matrix、runtime输入、尺寸ratchet、全仓guardrails及专属lint通过。临时进程/容器/数据目录已清理。只新增本主题测试、入口和文档，无生产修复、Schema变更、部署或提交。原T4保持开放，父对话拥有最终复核与集成。

2026-10-05 父对话接受：8 个文件最小集成，按当时 28 项 migration、351 项冻结执行输入复跑入口，三场景成功并清理；19 项定向及组合回归通过。当时接受隔离叶，原目标 T4 继续开放。见[主仓集成复验](../../tasks/evidence/2026-10-05-backtest-recovery-integration.md)。

2026-10-06 父任务完成：同一最终镜像下九组目标保护场景、浏览器/真实 Electron、33 项结构保留数据升级及独立生产启动通过。最终状态与证据维护在父任务和最终目标证据，历史隔离边界保持原范围。
