# D01 受控 HTTP 到独立 Worker 纵向闭环

## 范围

在原 `v3-worker-runtime.integration.test.ts` 的显式 loopback PostgreSQL/Redis 测试中保留旧单窗口成功与损坏 Snapshot 失败两条运行，并增加普通 HTTP 创建的 `159516.SZ` 双窗口运行。共享合成响应由 19 条 Bar、两份有交易日交集的子观测构成；受控 DSA HTTP 在多窗口模式返回完整响应及 `market-multi-window-content-v1` 能力。实际 `DsaClient`、V3 Reader、证据仓库、Snapshot Builder、BullMQ、独立生产 Worker 进程与离线 Runner 均参与，未模拟这些消费层。

## 验证记录

- 默认无隔离连接时，两个数据库/Worker 用例跳过，相邻多窗口 Snapshot 用例 1 passed；Server typecheck、四个改动测试文件的 ESLint 和 Prettier 通过。
- `python3 /private/tmp/run-worker-runtime-fixture.py` 使用 `postgres:17-alpine` 与 `redis:7-alpine` 的专名临时容器，PostgreSQL 应用当前全部 migration；测试先核对 loopback、专名数据库及非默认 Redis 端口。第一次隔离运行中，单窗口与多窗口均到成功终态、重放一致，损坏快照到 `DATA_UNAVAILABLE`，但新增的“能力端点恰好一次”断言得到两次而失败。该次数不是合同；改为核对启用多窗口后的能力读取增量，唯一一次定向重试为 **1 passed**。
- 多窗口普通创建返回 `queued`、BullMQ 状态 `waiting`；冻结 manifest 标记多窗口协议，真实 PostgreSQL 证据行含两份子观测。独立 Worker 将运行提交为 `succeeded` 且 attempt 为 1；离线重放 checksum 与已存结果相同。原单窗口成功、损坏快照失败、16 张业务账本表的哨兵前后快照和 HTTP 结果读取均在同一通过用例中保留。
- 两个临时容器停止后按精确名称检查均不存在；无目标数据库、真实 HiThink、AI 或其他 Provider 请求。生产源码和构建输入未在本叶改变，Worker 使用此前已通过 build 的当前生产源码；本叶仅变更测试与记录。
- `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` 通过，保留 13 条存量尺寸警告；没有提高阈值或添加忽略。

## 未关闭

这是合成受控 HTTP/隔离运行态证明，不是五年真实 HiThink 窗口、原标的 G0-H 准入、目标容器同步或 DSA 已失败的官方完整离线门禁。`D01-runtime` 的目标阶段、父 D01、I01 其余依赖以及 Spec AC01–AC20 继续开放；首次失败和修正重试均保留，不把局部通过倒填为整体验收。
