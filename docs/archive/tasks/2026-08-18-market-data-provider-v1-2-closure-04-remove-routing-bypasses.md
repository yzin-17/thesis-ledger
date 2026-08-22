# 04 — 删除 ThesisLedger consumer 的旧路由旁路

**要构建的能力：** 所有 ThesisLedger consumer facade 都只能通过统一数据网关访问市场数据，同时继续保留 DSA native analysis 的独立运行边界。

**阻塞于：** 02 — 将核心市场数据能力迁入统一网关；03 — 收口 Indicator 与 Chip 的 Provider 路由。

**状态：** completed

- [x] Consumer facade 中不存在对原生 manager 或具体 Provider SDK 的直接调用。
- [x] 自动化架构检查能够阻止新增旁路或跨越 consumer namespace 的调用。
- [x] DSA native analysis 的默认 Provider 路径、配置和 fallback 行为不受迁移影响。
- [x] Data Contract 全能力黑盒测试证明 Effective Policy 是唯一运行时路由来源。

## 实施与验证证据

- 删除 `api/thesis_ledger.py` 中遗留的 `_manager`、`_daily_data` 旁路；Quote、Daily Bar、Fund NAV、Fund NAV History、Indicator 与 CHIP_SUMMARY facade 均保留 gateway 入口。
- Fund NAV 的具体 SDK 调用下沉到 `AkshareFetcher.get_fund_nav_history` 与 `EfinanceFetcher.get_fund_nav_history`；runtime 只通过 adapter 兼容方法调用并负责统一校验。
- 架构边界回归：`tests/test_thesis_ledger_consumer_boundary.py` 检查 consumer facade 禁止 `DataFetcherManager`、native manager 及具体 Provider SDK，同时检查 runtime 不直接 import SDK；DSA native analysis 位于该检查范围之外，仍保持独立边界。
- 真实链路黑盒回归：`tests/test_thesis_ledger_data_gateway.py::test_fastapi_data_contract_uses_applied_effective_policy_for_all_six_capabilities` 使用 FastAPI `TestClient`，通过真实 Control API 写入 revision 17，再读取 Effective Policy，随后调用 Quote、Daily Bar、Fund NAV、Fund NAV History、Indicator 和 `CHIP_SUMMARY` 六项 Data Contract endpoint。测试不 mock gateway，runtime 只注入 deterministic fake adapters；断言了 Effective route、实际 Provider、fallback 结果、调用顺序和 Provider 裸 symbol。`REALTIME_QUOTE`、`DAILY_BAR`、`FUND_NAV`、`FUND_NAV_HISTORY` 均验证 `akshare -> efinance` fallback；Indicator 验证继承 `DAILY_BAR` route；`CHIP_SUMMARY` 按 manifest 仅使用 `akshare + STOCK` 且不发生隐藏 fallback。
- 定向回归：`rtk .venv/bin/pytest -q tests/test_thesis_ledger_data_gateway.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_consumer_boundary.py tests/test_thesis_ledger_core_facades.py`，`30 passed`、`3 warnings`。
- ThesisLedger 相关回归：`rtk .venv/bin/pytest -q tests/test_thesis_ledger*.py`，`46 passed`、`5 warnings`。
- native DSA analysis 定向回归：`rtk .venv/bin/pytest -q tests/test_chip_distribution_manager.py tests/test_stock_analyzer_rsi.py`，`5 passed`、`1 warning`；覆盖 native `DataFetcherManager` 的筹码 fallback 和 `StockTrendAnalyzer` 的 RSI 计算，未进入 `consumer=thesis-ledger` Control/Gateway namespace。
- 环境前置缺口：`rtk .venv/bin/pytest -q tests/test_chip_structure_fallback.py` 在收集阶段因 `.venv` 缺少 `json_repair` 失败；此前尝试的 native pipeline 定向收集也因缺少 `sqlalchemy` 失败。未为交接擅自安装依赖。
- 静态验证：`rtk .venv/bin/python -m py_compile tests/test_thesis_ledger_data_gateway.py` 与两仓 `rtk git diff --check` 通过。
- 尚未执行 Docker、在线 Provider、真实 AKShare/efinance、原生完整 analysis pipeline 和重启/回滚验收；本票黑盒使用 deterministic fake adapters，不等同于在线或容器验收。
