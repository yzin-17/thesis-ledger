# ETF 日线独立备用源实施任务

对应 Spec：[`../specs/2026-09-08-etf-daily-independent-fallback.md`](../specs/2026-09-08-etf-daily-independent-fallback.md)

## 任务

- [x] T1：为 AkShare ETF 日线补齐腾讯独立备用通道并完成端到端验收
  - 覆盖验收标准：AC1、AC2、AC3、AC4
  - 依赖：无
  - 涉及范围：同级 `daily-stock-analysis` 仓库的 AkShare Provider、ETF 日线路由测试和中英文说明；本仓 Spec/Task；本地 DSA 容器运行时。
  - 完成条件：主通道成功路径保持不变；异常或空结果会尝试腾讯前复权日线；双通道失败仍明确报错；外部 Contract 与 Policy 语义不变；文档同步。
  - 验证方式：运行 ETF 路由确定性测试和 Python 编译检查；构建当前 DSA 镜像并仅重建 DSA 服务；通过 ThesisLedger facade 对真实 ETF 请求日线并检查 HTTP 200、数据非空、来源和日期范围。
  - 验证证据：
    - `.venv/bin/python -m pytest -q tests/test_etf_daily_routing.py tests/test_thesis_ledger_provider_runtime.py tests/test_eastmoney_patch.py tests/test_efinance_realtime_quote.py`：38 passed。
    - `.venv/bin/python -m py_compile data_provider/akshare_fetcher.py tests/test_etf_daily_routing.py`：通过。
    - `./scripts/ci_gate.sh syntax`：通过；在 DSA `.venv` 激活状态下运行 `./scripts/ci_gate.sh deterministic`：通过。
    - `docker compose -f compose.yml -f compose.dev.yml build dsa`：重试一次后通过；首次被 PyPI 临时 TLS EOF 中断。
    - `docker compose -f compose.yml -f compose.dev.yml up -d --no-deps --force-recreate dsa`：通过，仅重建 DSA 服务并保留数据卷及其他服务。
    - ThesisLedger facade 真实请求：`510300.SH` 和 `159919.SZ` 均返回 HTTP 200、27 根日线、最新日期 `2026-09-08`；响应保持 `provider=akshare`、`fallbackUsed=false`。DSA 日志确认两次均为东方财富断连后腾讯财经成功。
    - Provider health：`akshare + DAILY_BAR + ETF` 更新为 `healthy`、`errorCode=null`。
    - DSA `git diff --check`：通过。

## 规划 Review

- 结论：Ready
- 覆盖检查：AC1 至 AC4 均由 T1 覆盖，T1 未引入 Spec 之外的实现范围。
- 依赖检查：T1 无前置依赖，可直接实施。
- 未决问题：无 Blocking 或 Non-blocking 问题。
- 占位与契约检查：未发现需要实施者猜测的占位描述；外部 Contract 与内部通道边界已明确。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证；未获提交授权，改动保持未提交
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：通过。AC1 至 AC4 均有当前自动化和真实运行时证据，Spec、任务、实现与文档一致。
- 发现的问题：完整 `./scripts/ci_gate.sh` 未执行完毕，因为 DSA `.venv` 缺少 `flake8`/`pytest-timeout`，而补装依赖时 PyPI TLS handshake EOF；该失败发生在门禁环境准备阶段，不是测试失败。
- 遗留风险：腾讯财经仍属于免费第三方上游；若东财与腾讯同时不可用，现有跨 Provider fallback 仍可能最终返回 `503`。
- 验证命令与结果：38 个 Provider/ETF 回归通过；Python 编译、syntax gate、deterministic gate、镜像构建、DSA 重建、双市场 ETF facade 请求、Provider health 和 diff check 均通过。
