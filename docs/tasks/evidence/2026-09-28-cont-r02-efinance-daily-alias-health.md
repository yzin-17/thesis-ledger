# Efinance 股票与 ETF 日线别名健康作用域

## 缺口与范围

当前 DSA Runtime 的 `efinance × DAILY_BAR × STOCK/ETF` 在旧 `efinance`、新 `eastmoney` 以及无 source 的 V1 请求下，对无显式 adjustment 均调用同一个 `get_daily_data`；显式 adjustment 当前被拒绝。此前健康和进程内熔断仍按 route source 分开，旧 alias 最近 open 时切到新 alias 能越过阻断。本叶仅按资产类型分别合并健康作用域，保留执行来源与旧记录，不扩大价格口径或请求预算。

## 实施与验证

- 新增公开日线请求反例：旧 `efinance` 健康 open 后改走 `eastmoney`，修前读取器被调用，`1 failed`；修后旧/新双向及 V1 无 source、股票/ETF 共 12 项通过。
- `source_aliases` 在这两组内返回规范 `eastmoney` 及只读兼容的 `efinance`、无 source 旧键。过期旧 open 允许探测且原行不变；新结果保留选中路由的 `upstreamSource`。股票与 ETF 两组互不合并，也不并入报价、净值或 AKShare。
- 新文件与相邻 7 文件合并 `98 passed`；改动 Python 文件的完整 `flake8`、`py_compile`、限定 `git diff --check` 通过。DSA 来源目录补旧 alias 两行，当前 §2/§3/§4 分别为 35/67/38 行。

未调用真实 Efinance 来源，未运行此前失败的 DSA 官方完整离线门禁，也未同步目标容器。实际日线 endpoint、默认价格口径、历史修订、覆盖与 G0-M 准入仍开放；完整 source alias 迁移及独立备用合同仍需后续实施。
