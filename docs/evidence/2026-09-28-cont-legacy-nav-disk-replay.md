# G-Legacy NAV 本地冻结重放

## 验证范围

新增 `apps/server/test/backtest/legacy-nav-snapshot-replay.test.ts`。测试用现有 V2 NAV Schema 构造一份合成 CN 基金策略与 RunConfig，在实际临时目录通过 `LocalSnapshotStore` 写入 NAV 信号、正式净值事实、冻结日历和策略元数据，再 `finalize`。同一 Snapshot 首次执行与重新打开本地仓库后的 `LocalSnapshotRunner` 重放均消费真实落盘工件；断言一笔净值 12 的申购成交、无买卖配对交易、完整结果及 `resultChecksum` 一致。临时测试目录由测试清理，生产源码与既有工作树改动均未修改。

## 本地检查

- `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/legacy-nav-snapshot-replay.test.ts`：1 passed。
- 同命令加相邻 `legacy-exchange-snapshot-replay.test.ts`、`v2-runner.test.ts`：3 文件 6 passed，包含 CN/HK/US 既有旧 exchange 冻结重放与 NAV 领域执行。
- `pnpm --filter @thesis-ledger/server typecheck` 与 `pnpm exec eslint apps/server/test/backtest/legacy-nav-snapshot-replay.test.ts`：退出 0。首次 Prettier 检查发现新文件排版，限定格式化该文件后 `prettier --check` 退出 0。

## 证据边界

本例是新建合成 V2 NAV 快照的本地文件系统重放，不是历史线上 NAV 工件、真实基金净值披露或目标容器复放；合成会话与净值时刻不构成真实市场规则证据。G-Legacy 仍需保留旧历史/其他市场/真实域及依赖门禁的完整审计，不能因此关闭父项或 Spec AC01–AC20。
