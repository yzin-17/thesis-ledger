# 研究解析失败后的预约恢复：实施记录

- [x] 根因：预约在研究前消费；完整 Schema 失败使成功提交未写入下一次观察，fail 只检测未消费旧预约。
- [x] 解析 `schema_invalid` 审计中独立合法的未来 time wakeup，优先使用模型最早的有效未来时刻；输出截断、缺失或无法独立校验时安排 60 分钟保底时间预约，不保存非法委托。
- [x] `LiveResearchBudget.fail` 在同一 PostgreSQL 事务中收敛失败周期、审计、账户预约和模型状态；连续第二次 `model_output_invalid` 强制进入 `needs_attention`，暂停、回放、预算耗尽、未知用量不续接。没有改 Schema 或交易指令。
- [x] 覆盖合法下一预约、无效/截断、重复时间、残留价格事件、连续失败、暂停/回放及未知用量；新增单测 11 项，相关 Server 回归共 43/43 通过。
- [x] `pnpm --dir apps/server exec vitest run` 9 个相关测试文件、43 项全部通过；`pnpm --dir apps/server build` 成功；`git diff --check` 通过。未编辑 Schema、交易校验和其它工作区未提交修改。
- [x] 2026-11-13 从 `thesis-ledger-infra` 目录运行 `PATH=/Users/yzin/.volta/tools/image/packages/pnpm/bin:$PATH ./scripts/sync-code.sh thesis-ledger`，退出码 0。正式兼容性预检、Server/Worker 健康通过，运行容器含新 `planFailedResearchWakeup`、60 分钟保底及连续失败门禁；HTTP `/api/v1/health` 和 `/api/v1/arena-matches` 均 200。镜像未更新，数据库与 volume 未变动，更新位于容器可写层，重建后失效。
- [ ] 未主动触发真实模型重试、未回填历史失败。美股运行场模型仍处于 `needs_attention / model_output_invalid`，无待执行预约。用户明确重新预约后，后续若发生新的无效输出才启用恢复策略。