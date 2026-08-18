# 05 — 保证 Policy revision 跨连接原子单调

**要构建的能力：** 多 worker 或多个数据库连接同时 Apply Policy 时，revision 的读取、校验和写入作为同一个原子操作执行，旧 revision 永远不能覆盖新 Effective Policy。

**阻塞于：** 无——可立即开始。

**状态：** completed

- [x] 并发提交不同 revision 时最终状态始终为最高合法 revision。
- [x] 相同 revision、相同内容保持幂等；相同 revision、不同内容返回稳定冲突错误。
- [x] 竞争失败通过 Control Contract 错误表达，不暴露数据库唯一键异常或通用 500。
- [x] 跨连接并发回归测试能够稳定复现并防止旧 revision 覆盖问题。

## 实施结果

- `ThesisLedgerControlStore.apply_policy` 在同一 `BEGIN IMMEDIATE` 事务内完成当前状态读取、revision 校验、Effective Policy 计算以及 Desired/History 写入；跨 worker 的 SQLite 连接会按提交顺序重新读取最新 revision。
- SQLite 唯一键和锁竞争被转换为稳定的 `REVISION_CONFLICT` 或 `POLICY_APPLY_CONFLICT` Control Contract 错误，不向 API 泄漏数据库异常。
- 测试通过独立 SQLite 连接、去除进程内锁遮蔽并协调暂停点，稳定覆盖高 revision 最终获胜，以及同 revision 竞争返回 `REVISION_CONFLICT` 的反例。

## 验证证据

- `cd daily-stock-analysis && .venv/bin/python -m pytest -q tests/test_thesis_ledger_control.py`：11 passed。
- `cd daily-stock-analysis && .venv/bin/python -m py_compile src/services/thesis_ledger_control.py tests/test_thesis_ledger_control.py`：通过。
- `cd daily-stock-analysis && git diff --check -- src/services/thesis_ledger_control.py tests/test_thesis_ledger_control.py`：通过。

未执行 Docker、在线 Provider、浏览器视觉或跨仓 Contract smoke；本 closure 仅验证 DSA ControlStore 及其直接 API 回归路径。
