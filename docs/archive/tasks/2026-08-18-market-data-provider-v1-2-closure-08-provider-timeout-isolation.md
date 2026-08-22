# 08 — 隔离不可取消的 Provider 调用

**要构建的能力：** Provider 目录调用超时、挂起或异常时，不会长期占用 API worker 或遗留无法管理的后台线程；Job 会进入可解释、可恢复的终态。

**阻塞于：** 07 — 将 Catalog Trigger 改为真正的异步任务。

**状态：** completed

- [x] Provider 原生 timeout 或隔离执行边界能够真正终止或回收超时调用。
- [x] 超时、上游失败和无有效数据具有稳定、可诊断的 Job 错误分类。
- [x] retry 次数和退避有明确上限，不会形成线程、进程或请求风暴。
- [x] 故障注入证明 API 可用性、Job lease 和后续目录同步不受挂起调用影响。

## 实施结果

- DSA 不再使用只能取消 Future、无法终止运行中 Provider 的 `ThreadPoolExecutor`；每次目录 Provider 调用都在 `spawn` 子进程中执行，超时后按 terminate → join → kill → join 顺序回收，不回退到不可终止线程。
- 增加固定进程并发槽、最多两次调用和指数退避上限；`catalog_provider_timeout`、`catalog_provider_unavailable`、`catalog_provider_empty`、`catalog_provider_invalid_response` 和隔离启动错误均保持稳定错误码。Catalog Job 失败时保留对应 code、message 和 retryable，不阻塞 lease/status 查询。
- 真实 Provider callable 仍从现有 `PROVIDER_CATALOG_LOADERS` 入口执行；fixture 模式继续走既有确定性管线，不借 fixture 掩盖生产超时路径。

## 验证证据

- `cd daily-stock-analysis && .venv/bin/pytest -q tests/test_thesis_ledger_catalog.py`：4 passed；覆盖 hanging worker 真正退出、有限 retry、一个 Provider 超时不阻塞另一 Provider，以及 Job 失败后后续 Job 成功。
- `cd daily-stock-analysis && .venv/bin/pytest -q tests/test_thesis_ledger_catalog.py tests/test_thesis_ledger_catalog_job.py tests/test_thesis_ledger_control.py tests/test_thesis_ledger_contract.py tests/test_thesis_ledger_data_gateway.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_core_facades.py tests/test_thesis_ledger_consumer_boundary.py`：56 passed、6 warnings。
- `cd daily-stock-analysis && .venv/bin/python -m py_compile src/services/thesis_ledger_catalog.py src/services/thesis_ledger_control.py api/thesis_ledger.py tests/test_thesis_ledger_catalog.py tests/test_thesis_ledger_catalog_job.py`：通过；DSA 与 ThesisLedger `git diff --check`：通过。

未覆盖 Docker 重启、真实 AKShare/efinance 在线源和发布/回滚演练；这些仍由 closure-10/11 记录，不能由本地故障注入替代。
