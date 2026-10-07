# DSA 稳定源码官方门禁证据

日期：2026-09-28。任务：`CONT-DSA-stable-gates`。执行状态：`worker_done`；门禁结论：**不通过，不能升级目标运行态**。源码、测试、manifest、lock 和配置全程只读；只写本文及 `/private/tmp/cont-dsa-stable-*` 隔离辅助/日志。未修复源码、未格式化、未安装依赖、未提交、未部署。

## 官方入口与环境

已读取 `scripts/ci_gate.sh`、`setup.cfg` 与测试隔离相关实现。官方 `syntax` 编译入口和所有 `data_provider/*.py`；`flake8` 使用 `--count --select=E9,F63,F7,F82 --show-source --statistics`。官方 `offline-tests` 保留以下实际参数，没有分片：

```bash
python -m pytest -m "not network" --timeout=120 -o timeout_method=thread \
  -o faulthandler_timeout=300 --durations=30 --durations-min=0.5
```

`env -i` 保证 `PYTEST_SPLITS/PYTEST_GROUP` 未继承，官方日志确认 7229 collected / 4 deselected / 7225 selected。没有新增 marker、ignore、跳过列表或提高 timeout。

使用原工作区 `.venv`：Python 3.12.14、pytest 9.1.1、pytest-timeout 2.4.0、flake8 7.3.0、pyflakes 3.4.0、pycodestyle 2.14.0、mccabe 0.7.0、litellm 1.100.0、pandas 3.0.5、yfinance 1.7.0、requests 2.34.2、anyio 4.15.1、httpx 0.28.1、SQLAlchemy 2.0.52。没有修改这些依赖。

## 隔离方式与缺口

测试 `conftest.py` 只有既有 ASGI/thread 兼容钩子，不提供全局账号/数据库隔离；部分测试 collection 调用 `load_dotenv()`，默认数据库为 `./data/stock_analysis.db`。因此使用协调者批准的 `/private/tmp/cont-dsa-stable-sandbox/workspace` 非秘密输入副本，排除真实 `.env*`（保留 `.env.example`）、根 `/data/`、`/logs/`、依赖/缓存/发布产物及数据库文件；原 `.venv` 和主仓稳定 Schemas 为只读复用接缝，不复制用户配置或凭据。

`/private/tmp/cont-dsa-stable-run.sh` 实际以 `env -i` 启动官方脚本，显式固定 `.venv` PATH、临时 `TMPDIR/ENV_FILE/DATABASE_PATH/LOG_DIR`、隔离 `PYTHONPATH`，只提供 synthetic DSA master/token；其环境不含真实 Provider 账号。

辅助 `sitecustomize.py` 保护的范围：Python socket 的 connect/connect_ex、外部 DNS、已知真实 `.env`/数据库及用户配置目录访问、用户目录写入、`sqlite3.connect` 审计，以及 Python 子进程继承该辅助边界。localhost 只允许本进程实际 bind 注册的端口，禁止业务 3000/8000；不认识的跨进程端口不放行。原生 shell 子进程默认拒绝，node/rtk 只用于既有离线 Schema 路径。SQLite 审计同时作用于常规 sqlite3/dbapi2 调用，不能当作所有原生数据库驱动的隔离证明。

自检实际拒绝外部 DNS、127.0.0.1:8000、原工作区数据库和原 `.env` 读取；允许测试自己 bind 的临时 localhost 端口。guard 日志共记录 connect 77、DNS 5、database 1、user-file 1、native-subprocess 7 次拒绝，含四项自检。只统计脱敏分类，不记录账号、域名请求载荷或环境值。

**该隔离不是 OS-wide sandbox。** `sandbox-exec` 预检返回 `sandbox_apply: Operation not permitted`。HOME 被清环境删除，但未显式固定临时 HOME/XDG，也未覆盖 SDK 通过系统用户目录 fallback 的全部读取；不能宣称已证实零真实账号读取。Python 受保护路径的外连拒绝已验证，本叶没有主动发起真实 Provider/业务请求，但没有可用于证明所有原生库/C 网络和 node 子进程均零外连的 OS-wide 证据。后继必须先明确补齐这些测试前提，不能直接沿用此结果升级目标。

## 执行顺序与结果

初次隔离复制误用递归 `--exclude=data`，导致源码 `src/data` 的三个非秘密 Python 输入缺失。初次 syntax/critical 在不完整副本通过，不能作为完整源码门禁；首次 offline 停在 collection：2608 collected / 225 errors / 0 executed，退出码 2，30.09 秒。根因是缺 `src.data`，不是源码回归。

唯一隔离修复将排除收窄为根 `/data/`、`/logs/`，补齐 `src/data` 并重核摘要，未修改任何原源码。**顺序偏差明示：唯一重试启动后才补跑完整输入的低层官方 syntax/critical**，不能称本轮已按严格顺序通过完整 ladder。两次完整输入低层最终均通过，但 offline 重试本身失败；没有第三次全包重试或继续放宽限制。

| 实际命令 | 最终结果与日志 |
| --- | --- |
| `rtk proxy bash /private/tmp/cont-dsa-stable-run.sh syntax > /private/tmp/cont-dsa-stable-syntax-final.log 2>&1` | 完整输入最终退出码 0。 |
| `rtk proxy bash /private/tmp/cont-dsa-stable-run.sh flake8 > /private/tmp/cont-dsa-stable-flake8-final.log 2>&1` | 完整输入最终退出码 0；critical 计数 0。不是 ordinary style 全通过。 |
| `rtk proxy bash /private/tmp/cont-dsa-stable-run.sh offline-tests > /private/tmp/cont-dsa-stable-offline-tests.log 2>&1` | 首次 collection 错误，退出码 2，225 errors；不计源码失败或通过。 |
| `rtk proxy bash /private/tmp/cont-dsa-stable-run.sh offline-tests > /private/tmp/cont-dsa-stable-offline-tests-retry.log 2>&1` | 唯一重试退出码 1；**7208 passed / 16 failed / 1 skipped / 4 deselected / 594 subtests passed / 66 warnings**，244.81 秒。完整跑至 100%，日志无 KeyboardInterrupt。 |
| `rtk proxy node /private/tmp/cont-dsa-stable-snapshot.mjs complete` 与 `final` | 从 original 完整排除集合枚举预期 regular inputs，1347 项；original↔copy missing/extra/hash mismatch 全部 0；起终摘要一致。 |

普通 style 的既有 95/200/E302 债务按协调者已有记录保留，本叶未执行或声称 ordinary style 全通过。未重复 Server 1769/88、类型/build、Schemas 546 等不变输入验证。

## 失败明细

以下是日志真实 nodeid/断言；分类只是本叶可直接确定的边界，其他根因由协调者另派 repair 或明确 skip。本叶未修复、未局部重试这些用例。

| 精确测试位置 | 实际失败与层 |
| --- | --- |
| `tests/test_docker_entrypoint.py:13` `test_docker_entrypoint_has_valid_shell_syntax` | native shell 被辅助 guard 拒绝；隔离前提，不是 shell syntax 已证明错误。 |
| 同文件 `:198` `test_docker_entrypoint_repairs_nested_mount_ownership` | 测试 fake-tools 子进程被 guard 拒绝；未执行该场景。 |
| 同文件 `:219` `test_docker_entrypoint_skips_owner_chmod_when_chown_fails` | 测试 fake-tools 子进程被 guard 拒绝；未执行该场景。 |
| `tests/test_packaging_build_scripts.py:171` `test_macos_signature_audit_normalizes_invalid_signatures` | 测试原生子进程被 guard 拒绝；未验证。 |
| 同文件 `:203` `test_macos_signature_audit_rejects_invalid_signatures` | 测试原生子进程被 guard 拒绝；未验证。 |
| `tests/test_thesis_ledger_tushare_events_v3.py:332` `test_http_success_consumes_actual_built_schema_exchange_without_rebuild` | 隔离 PATH 没有 `/Users/yzin/.volta/bin`；rtk 无法找到 node，退出码 1。不是 Schema 校验断言失败，既有定向跨仓成功证据未被此环境失败推翻。 |
| `tests/test_alphavantage_fetcher.py:192` `TestAlphaVantageFetcherInit::test_init_without_key` | 实际 `_api_key=''`，断言期望 `None`；源码/测试语义差异。 |
| `tests/test_finnhub_fetcher.py:188` `TestFinnhubFetcherInit::test_init_without_key` | 实际 `_api_key=''`，断言期望 `None`；源码/测试语义差异。 |
| `tests/test_check_env_encoding.py:47` `test_requirements_file_is_ascii_decodable` | `requirements.txt` ASCII 解码在 byte 402 遇到非 ASCII；输入格式门禁失败。 |
| `tests/test_config_registry.py:573` `TestEnvExampleWebSettingsCoverage::test_active_env_example_keys_are_registered_or_hidden_from_web_ui` | `.env.example` 的 `THESIS_LEDGER_DSA_TOKEN`、`THESIS_LEDGER_FIXTURE_MODE` 不在注册/隐藏集合；配置合同断言失败。 |
| `tests/test_provider_cache.py:448` `test_litellm_openai_prompt_cache_key_is_not_passed_through_without_verified_capture` | 本测试自有 localhost capture 观察 `prompt_cache_key` 仍被转发；断言失败，未放行其他本机服务。 |
| `tests/test_thesis_ledger_control_v3.py:233` `test_v3_route_catalog_is_exact_complete_and_independent_of_policy` | 实际事件库存比旧断言多 Tushare CN ETF CASH、state=not_admitted；预期库存需对账。 |
| `tests/test_thesis_ledger_provider_route_v2.py:52` `test_every_manifest_capability_has_an_executable_unique_source` | `hithink/DAILY_BAR has no executable source`；manifest/适配断言需对账。 |
| `tests/test_thesis_ledger_provider_runtime.py:131` `test_provider_registry_exposes_fetchers_and_gated_sources` | 注册集合比旧断言多 `rqdata`；预期库存需对账。 |
| `tests/test_yfinance_fundamental_adapter.py:160` `TestYfinanceFundamentalAdapter::test_dividends_parsed_from_single_column_dataframe` | `ttm_event_count` 实际 3、期望 4；固定日期 fixture 与 rolling 年窗需核查。 |
| 同文件 `:123` `test_populates_growth_earnings_dividend_boards_for_us_stock` | 同上；fixture 包含 2025-08-11，当前 2026-09-28 已超一年，未在本叶改 fixture/时钟。 |

skip 为 `tests/test_provider_oauth_native_storage.py::test_native_builder_loads_encrypted_snapshot_without_authorization`；该用例要求安装定制 SDK wheel，未通过。4 deselected 由官方 `not network` 条件产生，不是实网验收。没有将 skip/deselected、7208 个局部通过或 594 subtests 当作全包或真实业务验收通过。

## SourceBaseline 与日志摘要

修复后的 start、original 完整预期集合和 final 1347 项 aggregate SHA-256 均为 `6d603b62dd9efcc8df74782086ca74deac179c5509e72a1970f83978f262c9bd`。第一次不完整 1344 项摘要为 `433591a100d57a722957c8e7cb64ccc140368f00df8bdc4fe55fe2ddce1dc5b9`，不能用于完整门禁。源输入详细列表留在 `/private/tmp/cont-dsa-stable-start-inputs.json`、`complete-inputs.json`、`final-inputs.json`；它们是完整排除集合内 regular files，不宣称包含 `.venv`/用户数据/秘密/生成缓存。

| DSA 输入 | SHA-256，起终相同 |
| --- | --- |
| `scripts/ci_gate.sh` | `802906b197df896d9711514f8e5c5bf25b6d4e837701e5b8688c96974c3ce584` |
| `setup.cfg` | `ab8e40ffc8e8d60f30e5533f2abd861cccfabae061bc662281607a466c85043c` |
| `requirements.txt` | `2dafb1468c834c5acd53aed1b89207c547f767fa3719b407bf64cf41f5809684` |
| `.env.example` | `d5790da77e05c4fb6ac42dfe751daa35315e4b395bc3d5fbac25b92e7bdcd55c` |
| `data_provider/akshare_fetcher.py` | `216cde9232b86da25d7fbce64c268354ec1afebae1ced1dd96876f9f42cb7a2e` |
| `src/services/thesis_ledger_tushare_event_v3.py` | `fe15cbfec0ab2525513ee90bdaea38d36d72adbff5f0bf0c027dd6c58349fc08` |
| `src/services/thesis_ledger_provider_runtime.py` | `c4d82eedfe83d27b2a5fde90128e37b5c30bb4f356a5f6f5b4110af6147e87a1` |
| `src/services/thesis_ledger_event_v3.py` | `cfb32fb696326746d60198befb5edccf3d37c2dd8e97be774e561fabe2b687ab` |
| `src/services/thesis_ledger_event_v3_adapters.py` | `bad2af395f112b322b3c46401cc89668c7976d3a3f9bf4217ab538ffa0d9c491` |
| `src/services/thesis_ledger_market_v3_revisions.py` | `4888eafaeb29c9479f710d69cdc91da62cd1233bf029c18dc865dcf135dc1c42` |
| `src/services/thesis_ledger_control.py` | `ab21053693486ee06cd433f2a128197db0b1cced063825dd485d85afd9026b38` |
| `api/thesis_ledger_events_v3.py` | `e29e7402b2dee51a764c66430b24e7959d6e7d167cbbb2758b68081526461331` |
| `src/config.py` | `1584637959c26d53c51df0b13be1d710c56c356dbeb47f7310ae1b042c941390` |
| `tests/conftest.py` | `40dba0f87b3dfc9f8cd10bc1eef6925dc02fad054015940810eea458c58bf8c6` |

| 临时证据文件 | SHA-256 |
| --- | --- |
| `/private/tmp/cont-dsa-stable-syntax-final.log` | `c461d5d9d5f2ff652a729393a475a52ba4fac3fdbfb3c4f162f76ff7d6ce1acf` |
| `/private/tmp/cont-dsa-stable-flake8-final.log` | `59aaac8936a142d191981d79bcfcf1bd0c3d58f96c16e150e934d4fa4e609390` |
| `/private/tmp/cont-dsa-stable-offline-tests.log` | `31bf2be1eae30952eb96044157b82cf25669d4283dd99d993b291bc0176d76cb` |
| `/private/tmp/cont-dsa-stable-offline-tests-retry.log` | `014208fcab6b2a80b6e687108d71c50768ecfa89a548dcb2414b0b945b95dd92` |
| `/private/tmp/cont-dsa-stable-isolation/sitecustomize.py` | `4144ec4263147837689a86e1aa6e6ae7f784994a750bd81cef5e23a0459c913f` |
| `/private/tmp/cont-dsa-stable-run.sh` | `bd2701b2aad9b7726505dbd11d2679fb3a8fa5f2adb75d09c290edc33d48ba34` |

原日志留在本机临时路径，未上传；本文只记录脱敏统计/断言。SourceBaseline 供后继核对源码，不是允许目标同步的信号；当前全包 gate 失败且隔离前提未完全满足。

## 进程与交接

本叶启动过 exec sessions `71300`（首次 collection）和 `41501`（唯一重试）；均已终止/完成。停止排查时系统 sandbox 内 ps/pgrep 不可用，获自动审查允许后只读定位 PID 89168 / parent 89167，`lsof` 确认 cwd 为本叶临时副本，随后仅向 89168 发 INT；最终日志实际已完成全包且无 KeyboardInterrupt，不能把终态写成截断测试。最后只读 pgrep 无 pytest/gate 进程，pending wait 已返回。没有广泛 kill、没有用户服务操作。

所有本叶进程结束，写权交回协调者。下一步由协调者拆分失败修复、测试隔离完善或明确 skip；本叶不再执行第三重试、Provider/AI 请求、目标 DB/HTTP、build 或部署。
