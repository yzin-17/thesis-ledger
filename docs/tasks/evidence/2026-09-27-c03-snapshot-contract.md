# C03 快照版本核验

共享 Schema 定向 15 项通过，覆盖新运行显式协议、V3 必填来源/比较指纹、旧 raw 默认、adjusted=true 保持未知、未知版本拒绝，以及模型上下文仅允许开发/验证摘要。新旧实际快照落盘重放 12 项通过，包含 CN/HK/US 原始路径、NAV、旧 V3 日历与完整 V3 离线输入。

源码复核发现 `LocalSnapshotStore.load` 未使用共享解码器，仅拒绝 V3，其他未知版本会被强制视为旧 Manifest。已将该入口限定为字符串 `snapshot-manifest-v1/v2`，其他版本或缺失版本抛 `SnapshotIntegrityError`；不改变旧快照内容或回填价格口径。大文件行数减少，没有新增职责。

新增实际文件边界测试覆盖 V3、未来版本、缺失、null、数字及对象值，即使 allowMissing=true 也拒绝。修复后旧 Store 边界、原 snapshot、旧交易所/NAV 重放共 20 项通过，Server tsc --noEmit 与相关 ESLint 通过。测试使用临时目录，不访问真实 Provider、数据库或账户。

命令：Schemas `vitest run test/backtest-snapshot-v3.test.ts test/backtest-price-input-bindings.test.ts test/market-price-protocol.test.ts`；Server 定向文件为 `legacy-snapshot-version-boundary`、`snapshot`、`legacy-exchange-snapshot-replay`、`legacy-nav-snapshot-replay`；先行重放另含 `v3-complete-snapshot`、`v3-legacy-calendar-replay`。

## 写入链与部署补验

完整 Schemas 38 文件 330 项通过；实际 V3 创建/领取/执行/持久结果/冻结重试测试 18 项通过，模块依赖门禁通过。源码 `BacktestV2RunService.createRun` 按显式 contractVersion=3 分派 `BacktestV3RunLifecycle`，后者写 schemaVersion=3、V3 RunConfig 与实际 manifestVersion；旧 raw 请求保留原入口，符合主 Spec §13 的旧 raw 缺省兼容约束，新复权研究不降级或双写。C03 的格式、解码、封存与写入条件已核对，不代替 S09 全部故障场景。

infra `./scripts/sync-code.sh thesis-ledger` 退出 0，日志 `/private/tmp/goal-snapshot-version-sync-20260927.log`。Server/Worker healthy，编译产物宿主及两容器 SHA-256 均为 `94f30e8e47b17cee66ce132997f8037102b1769aff10a6fdf1cf8606a7aa386d`。探针 `/private/tmp/goal-snapshot-version-probe-20260927.py` 在每个容器的独占临时目录写入未来版本 building Manifest，实际加载器均抛 SnapshotIntegrityError，随后清理临时目录。未访问真实快照、账户或 Provider；容器镜像不变，同步仅更新可写层。

C03 范围复核通过，C04/F02 的其他完成条件仍须分别核验，不因本项完成自动关闭。
