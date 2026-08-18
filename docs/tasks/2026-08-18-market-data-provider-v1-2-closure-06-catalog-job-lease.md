# 06 — 为 Catalog Job 增加 lease 与失效回收

**要构建的能力：** Catalog Job 具有明确的所有权和有效期；任务进程失联或崩溃后，陈旧的 running 记录能够安全回收，新同步请求不会被永久阻塞。

**阻塞于：** 无——可立即开始。

**状态：** completed

- [x] Job 状态能够区分仍受有效 lease 保护的任务与已经失联的任务。
- [x] 有效 running Job 继续对并发手工和定时触发去重。
- [x] 超过 lease 的 Job 会进入明确的超时或可重试状态，并允许新的触发请求继续执行。
- [x] 进程崩溃和服务重启场景由确定性回归测试覆盖。

## 实施结果

- `thesis_ledger_catalog_job` 增加 `owner`、`lease_expires_at` 和 `updated_at`；已有 SQLite 文件通过幂等 `ALTER TABLE` 补列，不依赖删除持久卷。
- Job claim、过期 lease 回收和 running 去重在同一个 `BEGIN IMMEDIATE` 事务中完成；过期任务进入 `timeout`，返回稳定 `CATALOG_JOB_LEASE_EXPIRED` 且标记 `retryable`，新触发可以重新 claim。
- 完成/失败写入带 owner fencing 和 lease 校验，失联进程不能覆盖已超时任务的结果；Job payload 暴露 owner、lease 有效性、更新时间和可重试状态。

## 验证证据

- `cd daily-stock-analysis && .venv/bin/python -m pytest -q tests/test_thesis_ledger_catalog_job.py -k 'claim_exposes or valid_running or expired_running or old_catalog'`：4 passed；覆盖 owner/lease payload、有效 running 去重、过期任务回收/重新实例化和旧 SQLite schema 升级。该测试文件后来追加了 07 的异步 worker 回归，完整文件当前为 6 passed。
- `cd daily-stock-analysis && .venv/bin/python -m py_compile src/services/thesis_ledger_control.py tests/test_thesis_ledger_catalog_job.py`：通过。
- `cd daily-stock-analysis && git diff --check -- src/services/thesis_ledger_control.py tests/test_thesis_ledger_catalog_job.py`：通过。

本票不提前声称 07 的真正异步 Trigger、完整 Job Manager 生命周期或 08 的 Provider 调用终止隔离已完成；这些仍由后续 ticket 覆盖。
