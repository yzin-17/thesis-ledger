# HiThink Quote 接线后的 DSA 隔离离线门禁

## 输入与隔离

为本轮 Quote 接线建立新的 `/private/tmp/cont-dsa-quote-gate-20260929/` 临时副本，保留此前 `/private/tmp/cont-dsa-schemas-gate-20260928/` 及其统计。副本包含当前 DSA 源码与测试、相邻主仓 Schemas 当前 `dist`（186 个文件）、fixtures（25 个文件）、`package.json` 和 Zod 运行依赖。`rsync -acn` 核对 DSA 受控输入、Schemas `dist` 与 fixtures 均无内容差异。副本排除真实 `.env`、根目录 `data/`、日志、`.venv`、Git、依赖缓存及用户 HOME；检查未发现真实 `.env`、数据库文件或指向副本外的符号链接。

运行器沿用已验证的临时 HOME/XDG/TMPDIR、合成控制令牌与密钥，以及 Python `sitecustomize` 对外部 DNS/连接的阻断；运行依赖仍来自宿主 DSA `.venv`。这不是所有子进程的操作系统级网络隔离，不据此宣称真实来源零调用的普遍证明。

## 执行与结果

执行入口：`/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/.venv/bin/python /private/tmp/cont-dsa-quote-gate-20260929/run_gate.py offline-tests`，内部调用 DSA 官方 `scripts/ci_gate.sh offline-tests`；日志为副本内 `logs/offline-tests.log`。

首次执行在收集阶段报告 254 个 `ModuleNotFoundError: No module named 'src.data'`，原因是临时复制规则误将源码目录 `src/data/` 与根数据目录一起排除。仅向副本补入该源码目录并按摘要核对后，唯一一次完整复试退出 0：**7608 passed、1 skipped、4 deselected、67 warnings、626 subtests passed**，耗时 268.32 秒。首次失败属于隔离输入缺失，不能记为源码测试通过；复试证明上述当前副本输入的官方离线门禁通过。

本门禁不证明目标 Docker 已同步、真实 HiThink Quote 准入、Server→目标 DSA 链路或 ETF 原生量额单位。前序 Quote 定向测试、静态检查及 Server 消费证据见[本地接线记录](2026-09-29-cont-r02-hithink-quote-runtime-local.md)。
