# 07 — 将 Catalog Trigger 改为真正的异步任务

**要构建的能力：** 目录同步触发请求只负责创建或复用 Job 并快速返回，Provider 目录抓取由独立 worker 执行；调用方可以通过 Job 状态观察完成、失败和重试结果。

**阻塞于：** 06 — 为 Catalog Job 增加 lease 与失效回收。

**状态：** completed

- [x] Trigger 不等待 Provider 网络调用完成即可返回稳定 Job 标识和状态。
- [x] 手工触发与定时同步进入同一个 Job Manager，并共享并发去重规则。
- [x] Job 状态查询能够观察 pending、running、succeeded、failed 和 timeout 生命周期。
- [x] Worker 重启后能够继续处理可恢复 Job，不会重复发布同一 generation。

## 实施结果

- DSA 将 Catalog Job 的 claim、execute、status query 拆开；POST trigger 只创建或复用 pending/running Job 并入队，进程内 daemon worker 负责执行 Provider 目录构建。
- DSA 增加 Control Token 保护的 Job status endpoint；Job payload 统一返回状态、generation/checksum、owner、lease、retryable 和时间字段。Manager 启动时恢复 pending/lease 回收后的 Job，并通过 checksum 防止重复发布 generation。
- ThesisLedger `DsaClient` 增加 Job status 查询，`MarketDataController` 增加受控的 catalog job 查询入口；目录同步在 Job 未完成时返回 pending/running，而不是等待 Provider 网络请求或伪造 ACK。Desktop 同步提示不再把未 ACK 的任务显示为成功。

## 验证证据

- `cd daily-stock-analysis && .venv/bin/pytest -q tests/test_thesis_ledger_catalog_job.py`：6 passed；覆盖快速返回、状态查询、有效 lease 去重、失败/timeout 可观察、旧 schema、worker 重新实例化恢复和 generation 去重。
- `cd daily-stock-analysis && .venv/bin/pytest -q tests/test_thesis_ledger_control.py tests/test_thesis_ledger_contract.py tests/test_thesis_ledger_data_gateway.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_core_facades.py tests/test_thesis_ledger_consumer_boundary.py`：46 passed、5 warnings。
- `cd thesis-ledger/apps/server && pnpm typecheck`：通过；Server tests 87 passed。
- `cd thesis-ledger/apps/desktop && pnpm typecheck`：通过；Desktop tests 15 passed。
- DSA `py_compile` 与两仓 `git diff --check`：通过。

本票不覆盖 08 的 Provider 调用真正终止/回收、进程级隔离和故障风暴控制；这些仍需在 closure-08 中补齐。
