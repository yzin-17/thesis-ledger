# D01 目标运行态核对

## 结论

本叶只关闭 `D01-runtime` 的目标运行态一致性义务，不签发真实 HiThink 来源准入。此前受控 DSA HTTP、隔离 PostgreSQL/Redis、Snapshot 冻结/重放及独立 Worker 成功终态已经由 `2026-09-28-cont-d01-controlled-http-worker.md` 验证；本次补齐官方更新后的目标协议与运行代码身份核对。

目标 `thesis-ledger`、`backtest-worker`、`dsa`、PostgreSQL、Redis 均为 running/healthy。infra `node scripts/check-compatibility.mjs` 通过，仍声明 Market V3 需要 Data/Control Contract V3 和独立协议 smoke。

## V3 协议 smoke

按 infra README 的最小环境注入方式，只从正在运行的 DSA 容器读取已配置的 Data/Control token 到当前子进程环境，未打印或落盘 token；`CONTRACT_DSA_ORIGIN=http://127.0.0.1:8000 bash scripts/market-v3-contract-test.sh` 通过。

最终输出：Data Contract V3、Control Contract V3 均通过；Data 鉴权以无行情读取方式验证；精确目录 `integrity=complete`，catalog revision 为 `4135056022866140`。前两次启动仅分别因缺少 origin、整份 .env 触发开发镜像 immutable 校验而在协议请求前停止，不记为协议失败。

## 运行代码身份

下列宿主当前文件与目标容器 SHA-256 完全一致：
- DSA `api/thesis_ledger_multi_window_v3.py`：`2bfd7d778eb939a4663df62945748a7d7f5305de726764c169c774715ccf1457`
- DSA `src/services/thesis_ledger_hithink_etf.py`：`956d0ec811d778906defcd6b61dd3b8fae2aaa54bb91560d128d31cd377d40e0`
- DSA `src/services/thesis_ledger_multi_window_response.py`：`7f616b8299ae5bf2be491ae8b1b36ac173e867ff8a396ca7149643086d78f4a0`
- DSA `src/services/thesis_ledger_provider_runtime.py`：`7333ea6fe189c3ea402457508d029fbbb6f8d69a1ced3ff800262b548660a51f`
- Server 与 Worker 的 `market-bar-reader-v3.js`、`backtest-snapshot-builder.js`、`backtest-v3-run-execution.js`、`backtest-v3-runner.js` 均分别与宿主当前 build 产物一致；Server/Worker 四份摘要分别为 `d41dbb20...`、`f46990fc...`、`2238b6c1...`、`31a03ea0...`。

因此目标运行态加载的是已经通过受控多窗口、冻结/重放和独立 Worker 验证的同一实现，而不是旧容器代码。

## 失败关闭与保留门禁

只读查询目标 V3 精确目录，`CN/ETF/DAILY_BAR/1d/qfq` 的 `hithink/fund-market-historical` 仍为 `not_admitted`；本叶没有发起 HiThink 行情请求、没有写准入行、没有创建真实回测或修改数据库。

故 `D01-runtime` 可以按其“目标运行态核对”完成条件收口；`G0-H-target` 的正式 ETF 量额单位、全窗价格基准/修订及精确 RouteAdmission 仍未通过，`G-Deploy-159516` 的正向真实多窗口读取/冻结/重放和 `G-Run` 继续阻塞。
