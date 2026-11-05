# G-Legacy 父项收口对账

当前源码重新执行旧快照/旧运行 5 个 Server 文件，共 **29 passed / 0 failed**：CN/HK/US 交易所快照重放、NAV 落盘重放、旧/新版本边界、V2 Run 生命周期和 V2 Snapshot Builder 均通过。

既有 [legacy replay isolation 证据](2026-09-27-legacy-replay-isolation.md) 已在独立 PostgreSQL 中验证真实 Prisma 创建/幂等/领取/终态/冻结重试，并确认账户、账本、持仓、交易等真实域摘要不变；同批还验证 CN/HK/US 原始价格与 NAV 的实际 Parquet 落盘/Store/Runner 完整重放。

[本地 NAV 重放证据](2026-09-28-cont-legacy-nav-disk-replay.md) 又补充合成 CN 基金 NAV 的 LocalSnapshotStore finalize → runner → 重新打开本地仓库重放，交易和结果校验和一致。

本父项原先保留的两个依赖 S09、A03 现在均已完成。故 G-Legacy 的旧 raw、其他市场、NAV、历史快照读取/重放与真实域隔离完成条件满足。

该结论仍不证明任何真实外部 Provider 的在线可用性，也不替代 G-Run / G-Deploy / G-UI。
