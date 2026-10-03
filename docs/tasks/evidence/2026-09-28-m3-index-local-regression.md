# M3 指数选择组合离线回归证据

日期：2026-09-28。任务：`M3-index-local-regression-0928`。状态：`worker_done`，仅表示指定稳定输入的本地组合验证完成；M3、AC20 与真实准入门禁仍未通过。

## 边界与前置核对

本叶只写本证据，DSA 源码、测试、配置、文档和大量既有 WIP 全部只读保留。未安装依赖、联网、调用真实 Provider、访问数据库或实施部署，也未修改 baseline、门禁或 skip。所有进程均已退出，没有后台测试进程。

读取 RTK、Codex 和工作区/仓库 AGENTS 规则。Context Mode 工具在本会话不可用，使用 Python 过滤与统计输出。核对主 Spec `docs/specs/2026-09-25-multi-source-adjustment-aware-backtest.md` §3.3：新浪完整身份唯一精确选择、Tushare 请求身份/合法日期/请求窗口及日期唯一校验后取最新原始行；本地验证不能授予来源时点、实时性或真实准入。

六个稳定输入与前证据 `2026-09-28-r02-11-index-identity.md`、`2026-09-28-r02-13-index-row-implementation.md` 的最终 SHA-256 一致，验证结束后再次读取，全部无漂移。前证据中的新浪 lint 缺口由本次完整 flake8 补齐。

当前 `scripts/ci_gate.sh` 分离 syntax、flake8、deterministic、offline-tests：关键 flake8 为 `E9,F63,F7,F82`；deterministic 调用 `scripts/test.sh code/yfinance`；离线全包使用 `pytest -m "not network"` 并有 timeout/shard 参数。`.github/workflows/ci.yml` 分阶段运行这些入口并安装 CI requirements。本次未运行会写 bytecode 的 py_compile，也未安装 CI requirements。

`scripts/test.sh all` 明确进入 dry-run/quick 真实抓取，不适用本叶；现有 pytest 全包包含 347 个 `test_*.py` 文件，尚未逐个确认所有非 network 测试的实际外部行为和依赖，不能仅凭 `not network` 标签声称全包安全。本次选择以下已审查实际关联的 mock 范围，不把未跑全包记为通过。

## 最后验证结果

全部执行目录为 `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis`；Python 使用已有 `.venv/bin/python`，`PYTHONDONTWRITEBYTECODE=1`；flake8 无持久缓存，pytest 禁用 cacheprovider。

| 检查 | 输入范围 | 最后结果 |
| --- | --- | --- |
| 组合 unittest | 两个新指数测试 + Efinance 指数 + TickFlow Manager fallback + Yfinance US/HK/JP/KR 指数 | 46 项通过，0 失败、0 错误、0 skip、0 网络尝试；0.066 秒 |
| 扩展 pytest | realtime quote fallback logging、Akshare realtime logging、Tushare HTTP client、Tushare followups、fetcher logging 五文件 + Analyzer 指数呈现三个精确 node | 41 项通过，0 失败、0 skip、0 deselected、0 网络尝试；4.07 秒，4 个依赖弃用 warning |
| 新增文件完整 flake8 | 两个 helper + 两个新 test；沿用 `setup.cfg` | 0 错误 |
| 存量 fetcher 关键 flake8 | Akshare/Tushare 两文件；仓库既有关键规则 | 0 错误 |
| AST | 六个稳定 Python 输入 | 6 项通过，无 bytecode 写入 |
| diff 空白检查 | 两个存量 fetcher 当前完整工作树 diff | 通过，exit 0 |
| 最终摘要与尺寸 | 六个稳定输入 | SHA 无漂移；fetcher 保持 2633/1351 行；新增文件 21/46/109/121 行 |

两组测试合计 87 项通过。新增测试 15 项包含真实 fetcher 接缝与新浪 Manager → MarketAnalyzer 消费成功/拒绝；既有指数 31 项补充其他来源映射、区域分派与失败 fallback；扩展 41 项验证相邻 quote/Manager/fetcher 行为与消费呈现，没有把真实外部链路 mock 证据升级成真实验收。

首次扩展回归为 38 通过、3 失败，失败均在 `tests/test_fetcher_logging.py` 的 `assertLogs`：`test_base_fetcher_logs_start_and_success`、`test_efinance_logs_eastmoney_endpoint_on_remote_disconnect`、`test_manager_logs_fallback_and_final_success` 提示无 INFO 日志。根因为本叶验证封装误加 `logging.disable(logging.CRITICAL)`，关闭了测试所需日志。移除这一封装语句后，仅重跑同一 41 项范围，全通过；没有修改源码、测试断言、门禁或 skip。第一次也为 0 网络尝试，未升级执行更高运行时。

## 可复现命令

组合回归使用以下命令；socket connect/connect_ex/create_connection 与 HTTP Session 在收集和执行期间阻断，尝试数非零也会导致命令失败，避免业务吞掉网络异常后伪通过。测试自身已有更严格 socket/HTTP mock 保持。

```sh
rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python - <<'PY'
import socket, requests, unittest, logging
from unittest.mock import patch
logging.disable(logging.CRITICAL)
attempts = []
def block(*args, **kwargs):
    attempts.append('blocked network attempt')
    raise AssertionError('离线验证禁止网络')
modules = [
    'tests.test_sina_index_identity', 'tests.test_tushare_index_daily_rows',
    'tests.test_efinance_main_indices', 'tests.test_tickflow_market_review_fallback',
    'tests.test_yfinance_us_indices', 'tests.test_yfinance_hk_indices',
    'tests.test_yfinance_jp_kr_indices',
]
with patch.object(socket.socket, 'connect', block), patch.object(socket.socket, 'connect_ex', block), patch.object(socket, 'create_connection', block), patch.object(requests.sessions.Session, 'request', block):
    suite = unittest.TestLoader().loadTestsFromNames(modules)
    result = unittest.TextTestRunner(verbosity=0).run(suite)
print('NETWORK_ATTEMPTS', len(attempts))
print('FINAL', result.testsRun, 'failures', len(result.failures), 'errors', len(result.errors), 'skips', len(result.skipped))
raise SystemExit(not result.wasSuccessful() or bool(attempts))
PY
```

扩展回归最后命令如下。首次失败命令与下方的区别仅是在导入后加入 `logging.disable(logging.CRITICAL)`；该失败如实保留在上节。

```sh
rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python - <<'PY'
import socket, requests
from unittest.mock import patch
import pytest
attempts = []
def block(*args, **kwargs):
    attempts.append('blocked network attempt')
    raise AssertionError('离线验证禁止网络')
files = [
    'tests/test_realtime_quote_fallback_logging.py',
    'tests/test_akshare_realtime_logging.py',
    'tests/test_tushare_fetcher_http_client.py',
    'tests/test_tushare_fetcher_followups.py',
    'tests/test_fetcher_logging.py',
]
base = 'tests/test_market_analyzer_generate_text.py::TestMarketAnalyzerBypassFix::'
files += [base + n for n in [
    'test_us_english_indices_do_not_label_turnover_as_cny',
    'test_indices_block_uses_configured_red_up_color_scheme',
    'test_indices_block_keeps_green_up_default_color_scheme',
]]
with patch.object(socket.socket, 'connect', block), patch.object(socket.socket, 'connect_ex', block), patch.object(socket, 'create_connection', block), patch.object(requests.sessions.Session, 'request', block):
    result = pytest.main(['-q', '-o', 'addopts=', '-p', 'no:cacheprovider', '-m', 'not network', '--tb=short'] + files)
print('NETWORK_ATTEMPTS', len(attempts), 'PYTEST_EXIT', result)
raise SystemExit(result or bool(attempts))
PY
```

静态验证命令：

```sh
rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m flake8 data_provider/sina_index_identity.py data_provider/tushare_index_daily_rows.py tests/test_sina_index_identity.py tests/test_tushare_index_daily_rows.py --count --statistics
rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m flake8 data_provider/akshare_fetcher.py data_provider/tushare_fetcher.py --count --select=E9,F63,F7,F82 --show-source --statistics
rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python - <<'PY'
import ast, hashlib, json
from pathlib import Path
files = ['data_provider/sina_index_identity.py', 'data_provider/akshare_fetcher.py', 'data_provider/tushare_index_daily_rows.py', 'data_provider/tushare_fetcher.py', 'tests/test_sina_index_identity.py', 'tests/test_tushare_index_daily_rows.py']
print(json.dumps({n: dict(sha=hashlib.sha256(Path(n).read_bytes()).hexdigest(), lines=len(Path(n).read_text().splitlines())) for n in files}))
for n in files:
    ast.parse(Path(n).read_text(), filename=n)
print('AST 6 passed')
PY
rtk git diff --check -- data_provider/akshare_fetcher.py data_provider/tushare_fetcher.py
```

最后 diff 空白检查由 `rtk proxy python3 -` 包装中 `subprocess.run(['git', 'diff', '--check', '--', ...], cwd=DSA)` 执行；上方提供等效独立命令。工作树整体 diff 的 numstat 为 Akshare `10/50`、Tushare `25/44`，包含前置 WIP，不能归属为本叶修改。2638 → 2633、1354 → 1351 的缩减基线来自前实施证据；本叶当前读数与前证据最终 SHA 一致，无规模增加。

## 最终稳定输入

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `data_provider/sina_index_identity.py` | 21 | `c65f98eb974c98d7b3c364ff8193aa3e9cd8e0f45fca33cfdc5b3c21ad6204ed` |
| `data_provider/akshare_fetcher.py` | 2633 | `abb60ee7c54661f53e81babf6186bf183aa5aae4d455e3e8d5c820cc09da566c` |
| `data_provider/tushare_index_daily_rows.py` | 46 | `25f13b0abaa406b53c7ba8ff47e18022dbf300a5240ebecf7ea2d1fcd0f3dacc` |
| `data_provider/tushare_fetcher.py` | 1351 | `fe0d7c99e91433571d1bbd496c734511854e8e399db3d89497f8a107a746919f` |
| `tests/test_sina_index_identity.py` | 109 | `bb3d82cf6e6549ee44173336af1d15eacca4c1cea22d7380d0e74cb2051461f9` |
| `tests/test_tushare_index_daily_rows.py` | 121 | `8ee91f6d36ada53b9b4411e9b174e8e478ce7893ce1bf3ccc2512bebc822e21b` |

## 未执行层与遗留风险

本次无 skip；未执行项目全包、完整 `ci_gate.sh`、build、真实 SDK/Provider、在线故障注入、数据库、Server/Worker、目标 Docker、部署或浏览器。未运行覆盖全部 347 文件的全包及 Analyzer 文件未选节点，是限定验证范围，不是测试 skip，也不是全包通过。

真实返回身份、权限、来源时点、交易阶段、实时性、历史完整性和金额事实仍待独立真实验收；严格重复身份/日期拒绝是否影响真实可用性也未在线验证。四个依赖弃用 warning 不影响本次断言，但本叶未处理依赖升级。源码零写入；撤销本叶时仅删除本证据，不得回退 DSA 文件。
