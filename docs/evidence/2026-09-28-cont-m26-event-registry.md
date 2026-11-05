# Tushare 事件库存与当前修订本地证据

日期：2026-09-28。任务：`M26-b2-event-registry-local`。状态：`worker_done`。只完成精确库存和本地修订登记，生产事件与受控 HTTP 接线仍待后继叶。

## 范围与实际接缝

依据主 Task §12.9、`2026-09-28-cont-m26-runtime-seams.md` 与 `2026-09-28-cont-m26-mapped-read.md`。独占修改 DSA 两个库存/修订模块、新测试与本文。全部其他源码、测试、Spec/Task 只读；保留既有脏工作区，无暂存、提交、重置、子代理或共享构建。Context Mode 工具未提供，Shell 全部使用 RTK 并限制输出。

- `src/services/thesis_ledger_event_v3_adapters.py:6` 单向 import mapped-read 的 adapter/source 常量；mapped-read 无反向 import。常量只描述本地适配协议，不是历史 `upstreamDataVersion` 或首次可见时间。
- 同文件 `:34`、`:42`、`:56` 只加入 `data/CN/ETF/CASH_DISTRIBUTION` × `tushare/tushare`。交叉/未知来源、Tushare SPLIT/NAV/非 ETF/非 CN 不通过；目标附带 `routeIndex` 时仍核对相同来源并返回正确修订。
- `src/services/thesis_ledger_market_v3_revisions.py:78` 事件分支要求 Tushare manifest 的 `requiresCredential` 为严格布尔 `True`。缺/非法 HMAC 修订返回 `None`，仅 `credential_version=0` 不能替代当前 HMAC；没有用恒真 stub 绕过生产 matcher。
- `tests/test_thesis_ledger_tushare_event_registry_v3.py:120` 使用真实临时 SQLite ControlStore、合成环境 token/endpoint/master、实际不可变快照和 HMAC、真实 policy/准入及 runtime current matcher。`:149` 验证陈旧适配/source/凭据、consumer/state/scope 拒绝；`:160` 验证实际 token/endpoint/master 轮换与撤销拒绝。

fixture 的 `fixture://synthetic-registry` 只验证库存与修订门禁，未加载身份证据，也未执行事件、HTTP 或来源 reader；不能据此认定身份、币种、权限或完整历史已核验。现有 policy 仅凭临时准入可判定合成 target eligible，这仍需生产叶的先验 identity guard 与完整当前性检查。未写真实目标 admission/账号、未读取真实账号、未联网、未操作目标数据库或部署。

## 验证结果

执行目录：`/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis`。

| 实际命令 | 结果 |
| --- | --- |
| `rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_tushare_event_registry_v3.py -q` | 34 passed，2 个既有弃用警告；0.81 秒。首次 collection 错把 manifest import 指向 `provider_manifest`，查明实际定义在 control 后修正，唯一失败重试通过。 |
| `rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_event_control_v3.py tests/test_thesis_ledger_events_v3.py tests/test_thesis_ledger_rqdata_events_v3.py tests/test_thesis_ledger_split_event_control_v3.py tests/test_thesis_ledger_tushare_credential_revision.py tests/test_thesis_ledger_market_v3_admission_runtime.py tests/test_thesis_ledger_tushare_market_v3.py tests/test_thesis_ledger_market_v3.py -q` | 87 passed，8 个既有警告；8.64 秒。 |
| `rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_tushare_event_registry_v3.py tests/test_thesis_ledger_event_control_v3.py tests/test_thesis_ledger_events_v3.py tests/test_thesis_ledger_rqdata_events_v3.py tests/test_thesis_ledger_split_event_control_v3.py tests/test_thesis_ledger_tushare_credential_revision.py tests/test_thesis_ledger_market_v3_admission_runtime.py tests/test_thesis_ledger_tushare_market_v3.py tests/test_thesis_ledger_market_v3.py -q --disable-warnings` | 补充 `routeIndex` 修订处理及断言后按输入变化重验，最终 121 passed，8 warnings；8.51 秒。 |
| `rtk proxy .venv/bin/python -m flake8 src/services/thesis_ledger_event_v3_adapters.py src/services/thesis_ledger_market_v3_revisions.py tests/test_thesis_ledger_tushare_event_registry_v3.py` | 最终输入通过，退出码 0。 |
| `rtk proxy .venv/bin/python -m py_compile src/services/thesis_ledger_event_v3_adapters.py src/services/thesis_ledger_market_v3_revisions.py tests/test_thesis_ledger_tushare_event_registry_v3.py` | 最终输入通过，退出码 0。 |
| `rtk git diff --check -- src/services/thesis_ledger_event_v3_adapters.py src/services/thesis_ledger_market_v3_revisions.py tests/test_thesis_ledger_tushare_event_registry_v3.py` | 退出码 0；三个文件原本未跟踪，另用 `rtk proxy node -e` 逐行 `/[ \t]+$/` 检查，全部 0 尾随空白。 |

RQData/Eastmoney 事件与 SPLIT、Tushare 凭据及 bar 修订回归通过。没有执行全包/build、consumer、生产 runtime/HTTP 修改、目标同步、真实 Provider、故障注入或历史覆盖验收。没有新增外部请求或重置既有失败预算。

## 最终输入摘要

通过 `rtk proxy shasum -a 256` 取得，路径相对 DSA；仅识别本地输入，不是部署或真实来源证据。

| 文件 | SHA-256 |
| --- | --- |
| `src/services/thesis_ledger_event_v3_adapters.py` | `bad2af395f112b322b3c46401cc89668c7976d3a3f9bf4217ab538ffa0d9c491` |
| `src/services/thesis_ledger_market_v3_revisions.py` | `4888eafaeb29c9479f710d69cdc91da62cd1233bf029c18dc865dcf135dc1c42` |
| `tests/test_thesis_ledger_tushare_event_registry_v3.py` | `829daeb9ea6e2a45ffb7b814b8b8c97845389018b0ca03ad68657103590bcd1f` |
| `src/services/thesis_ledger_tushare_mapped_read.py` | `436d4fc0d4daccb69d10388ce266d505ae3a0db37f7983448cc98c3b894acf95` |
| `src/services/thesis_ledger_control.py` | `ab21053693486ee06cd433f2a128197db0b1cced063825dd485d85afd9026b38` |
| `src/services/thesis_ledger_provider_runtime.py` | `ef5ec245a27214fe2909d69ca583b216fd0b9b4fe0611d309b21776b488960d1` |

## 交接

两处源码与新测试已稳定，所有命令结束，无后台进程。写权交回协调者，本叶不领取下一任务。后继生产叶必须在 policy/catalog 读取账号前完成当前准入及原文 identity guard，再核 HMAC/policy/catalog/security 前后完整当前性，维持真实读取 `coverage.complete=false`。真实身份/币种、fund_div 权限、分页/完整历史、目标容器和冻结业务验收仍未完成，不授予真实 ready/coverage 条件。
