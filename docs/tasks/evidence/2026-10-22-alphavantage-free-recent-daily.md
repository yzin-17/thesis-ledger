# Alpha Vantage 免费近期日线实施与验收证据

对应 [Spec](../../specs/2026-10-22-alphavantage-free-recent-daily.md) 与[已完成 Task](../../archive/tasks/2026-10-22-alphavantage-free-recent-daily.md)。本次授权为免费近期窗口，更早历史继续受限；原 T5b 的其他来源、真实完整历史及首存启停偏差不由本切片关闭。

## 本地实现与验证

DSA 来源模块的精确日线改为单次 `outputsize=compact`；核对 Meta Data 的证券回显、非空映射、合法日期、最多 100 行及实际响应起止边界。超出边界、跨界或无行区间报 `not_covered`；非法结构或证券报 `invalid_response`。原规范化、4.5 秒超时、凭据工厂及报价保持。

日线适配修订为 `dsa-v3-us-stock-alphavantage-none-exact-daily-v2`，协议与来源修订为 `dsa-alphavantage-compact-daily-single-response-v2`，最大行数 100；没有更改路由键、上游来源名称或旧冻结。

执行目录均为 `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis`，在既有未提交工作区运行：

| 检查 | 实际结果 |
| --- | --- |
| `rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_alphavantage_capability_path.py tests/test_multimarket_exact_daily.py -q --tb=short` | 37 项通过；覆盖实际工厂/Runtime、单响应、近期与旧窗/跨界/空窗、1/100/101 行、证券/日期/结构及原 HTTP 错误边界 |
| `rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_capability_registry.py tests/test_thesis_ledger_generic_probe_lifecycle.py tests/test_thesis_ledger_provider_credentials_runtime.py tests/test_data_runtime_contract.py tests/test_data_runtime_compatibility.py -q --tb=short` | 433 项通过；注册、probe 隔离、凭据快照与运行载荷回归 |
| `rtk proxy ./scripts/ci_gate.sh syntax` | 退出 0；运行文件 386，语法通过 |
| `rtk proxy ./scripts/ci_gate.sh deterministic` | 退出 0；能力边界、运行载荷、数据测试范围及既有代码/证券转换检查通过 |
| `rtk proxy .venv/bin/python -m flake8 data_provider/thesis_ledger_sources/alphavantage.py tests/test_thesis_ledger_alphavantage_capability_path.py tests/test_multimarket_exact_daily.py --select=E9,F63,F7,F82 --count --statistics` | 退出 0，问题数 0 |

门禁调用仅为本次子进程将 DSA `.venv/bin` 前置到 PATH，未修改用户配置。既有 Starlette/TestClient 弃用及收集告警不属于本切片，未安装或升级依赖。原 CHANGELOG 等文件的其他未提交改动保留。

## 目标运行态

### 正式更新入口

- 执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`；入口：`rtk proxy ./scripts/sync-code.sh dsa`；目标仅 DSA，无额外功能参数。
- 首次默认沙箱执行退出 1：进程锁校验缺少 `ps` 权限，脚本明确尚未取得锁或修改 Docker。按工作区规则，以所需权限执行同一正式入口 `rtk proxy /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/scripts/sync-code.sh dsa`，未绕过锁或兼容性检查。
- 正式入口退出 0：装配数据代码/资产、同步并重启 DSA，健康检查通过；脚本未执行数据库结构或外部卷变更。镜像保持 `sha256:ebe9d9a742b396b5e885f007dedc49c960010094d095545be9b33ff2dfa8b632`，没有重建镜像；本次为容器可写层快更。
- 独立读取目标模块：源码 SHA256 为 `79cc547e4d484d691ca6bc70bc0fd37663d12f62e0e142b741de5e8ab53c1725`，与本地相同；日线适配/协议均为本次 v2，最大行数 100；报价仍为 `alphavantage-us-stock-exact-quote-v2`。

### 真实近期与旧窗验收

| 检查 | 实际结果 |
| --- | --- |
| 正式目标 `POST /api/market-data/providers/alphavantage/test`，US STOCK/1d/none，`AAPL.US`，2026-10-14～2026-10-21 | HTTP 201，`healthy`、`readOnly=true`、`attempted=true`，2521ms；样本窗口一致，请求标识 `ff196c3f-ba31-4804-ac6c-fe1c924142e7` |
| 目标同版模块 `read_frame()`，`AAPL.US`，2024-01-02～2024-01-05 | 实际官方请求仅一次 compact，返回 `not_covered`，零行数据；没有 full 回退或第二次请求 |

旧窗检查使用明确只读的 `docker exec -i ... python -B -c ...`：独立子进程加载目标来源模块，以原真实 Key 访问官方接口；Key 仅经内存标准输入传递，不出现在命令参数、文件或输出。仅审计函数/证券/outputsize 三个非敏感参数，同次真实响应保留原传输函数；无响应替换，不初始化业务仓储或写入业务数据。该子进程不是业务路由启用或完整历史消费证据。

### 状态保全与结论

更新前、更新后及两项验收后独立读取一致：

- 30 家来源完整公开清单 SHA256 为 `ea73dab05929d3c8d2c7c4def75720278b6863cd99da69adc56d0f058ffb4ae5`，包含启停、凭据公开状态及配置版本；三家仍停用，TickFlow/Finnhub/Alpha Vantage 版本仍为 2/1/1；Longbridge 无凭据、停用、版本 0。
- 195 个目录目标的精确键、目标和准入状态 SHA256 为 `8a12efc6d061e363ae441a8bef6b3aeb63b3d4e15e1b6a7b5a3fa59367a8be2f`，前后相同。Alpha Vantage 的公开传输协议已更新为 compact v2；`not_admitted` 与独立只读检查健康分别记录，不据此宣称业务默认路由已启用。
- 容器及镜像 ID 保持，目标模块与本地源码一致；未调用来源配置或政策/路由写接口，未调用模型。

结论：AV1～AV4 的本地、正式更新和目标真实读取证据通过；免费近期适配完成，旧历史保持明确受限。没有用本次结果关闭 Finnhub 日线权限、Longbridge 暂缓、首存启停偏差或原 T5b 整体门禁。未提交代码。
