# R02 腾讯精确日线原生成交额门禁（2026-09-29）

## 来源观察

只读向 `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get` 请求 `sh510300,day,2025-06-13,2025-06-30,20,none` 和相同窗口的 `qfq`，各一次，超时 10 秒。两次均返回 `12` 根；`day`、`qfqday` 各行均为日期、开、收、高、低、成交量六字段，没有第七个原生成交额字段。例：`none` 首行日期 `2025-06-13`，行长 `6`。固定版 [a-stock-data v3.10.0 §1.2](https://github.com/simonlin1212/a-stock-data/blob/2e0ae6383c649b2bc5f68d3bc430d357f1c59ae7/SKILL.md)也声明该接口无成交额。这个短窗只能证明本次返回的形状；未核历史完整度、量价单位、复权锚点、来源修订或数据使用条款。

## 反例与修复

`data_provider/tencent_fetcher.py::get_daily_data_for_source` 原先在 `amount` 缺失时计算 `close × volume`，再把结果作为 Bar 金额交给下游。Spec §5.3 的量价约束不允许把复权价乘原始量视为真实成交额。将既有测试改成精确读取必须拒绝缺额，修前定向测试 `1 failed`：未抛 `DataFetchError`。修后缺原生成交额整窗抛错；带原生 `amount` 的既有测试仍通过且继续标记 `amount_normalization=provider`。普通旧 `get_daily_data` 路径未改。

## 验证与边界

- `tests/test_tencent_fetcher.py`：16 passed。
- 与 `test_thesis_ledger_provider_route_v2.py`、`test_thesis_ledger_provider_runtime.py` 合并：58 passed。
- 限定 flake8、`py_compile`：通过；官方 `ci_gate.sh syntax` 和 `flake8`：通过，critical flake8 计数 0。
- 官方 `offline-tests` 首次：7556 passed、1 skipped、4 deselected、626 subtests passed，另 1 failed。失败为无关 `test_local_cli_backend.py::test_output_stat_error_is_structured_and_kills_process_group` 在子进程 PID 文件刚建立但尚未写入时读到空串；该用例定向复核 1 passed。唯一全包复试：7557 passed、1 skipped、4 deselected、626 subtests passed。
- 相邻 infra 官方 `./scripts/sync-code.sh dsa` 兼容性预检和快更成功，目标 DSA `running/healthy`。宿主与容器 `/app/data_provider/tencent_fetcher.py` 的 SHA-256 同为 `79e10e52f64735d8d2c97f8b1cffa6ebbe2e76ae122cedf4df3f0ac44eb2fa50`；目标容器对同一 `510300` 短窗实际抛 `DataFetchError`，错误明确为缺原生成交额。镜像 ID 保持 `sha256:2e75542952ca40f69c5b96b7f6ec75a184e4ea0db6ba362874c4b7607d287543`；本次只改可写层，容器重建后会恢复镜像内版本。

本修复只保证精确腾讯 Bar 在缺原生成交额时失败，不证明有原生金额的其他窗口、股票或来源真实可用；G0-M、M2 价格和产品整体验收均继续开放。容器健康或代码同步不等于来源准入。
