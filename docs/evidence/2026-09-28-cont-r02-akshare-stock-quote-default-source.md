# AKShare 股票报价新建默认来源本地证据

## 范围与来源事实

- AKShare `get_realtime_quote` 对股票默认使用 `em`，最终调用 `stock_zh_a_spot_em`；本机安装包 `akshare 1.18.94` 的 `stock_hist_em.py` 将该函数指向 EastMoney HTTPS `https://82.push2.eastmoney.com/api/qt/clist/get`。这是本机静态链核对，不是远端请求或目标容器确认。
- 新建 V2 默认 `REALTIME_QUOTE/STOCK` 的 AKShare RouteTarget 改为 `akshare/eastmoney`。DSA manifest version 3 仅给该精确 source 新增 `STOCK` 报价能力，Runtime 对 adapter 传 `em`，执行身份保留 `eastmoney`。
- 显式旧 `akshare/akshare` 的 Desired/Effective 原文及 ETF 路由不改；旧冻结、健康/预算键和现网策略未迁移。默认 AKShare/Efinance 股票报价均为 EastMoney 包装，不能当作独立上游备用。

## 定向验证

- Server 默认策略断言修前 1 failed、修后 `market-control.service.test.ts` 20 passed；显式旧 RouteTarget 保真测试仍通过。
- DSA EastMoney source 缺 `REALTIME_QUOTE` 的断言修前失败；新增精确 source 运行测试核对 `em` adapter 参数和 `eastmoney` provenance，旧 alias 测试核对 Desired/Effective。最终四文件合并 66 passed、4 条第三方/pytest warning。
- Server `typecheck`、`build`、改动 TS 限定 ESLint/Prettier、import boundary 通过。DSA 新 manifest/测试 flake8、Runtime critical flake8、三文件 `py_compile` 及两仓 `git diff --check` 通过。

## 未通过的层级

- 未发真实 AKShare/EastMoney 请求；单位、来源时点、覆盖、权限和 G0-M 未验。目标容器应用源码未更新，不把本机源码核对视为目标执行。
- DSA 官方完整离线门禁此前一次隔离重试仍失败，本次按已用尽的同前提预算跳过；不据本地定向测试执行 `sync-code.sh` 或 `update.sh`。旧 alias 的版本化迁移仍需策略库存与跨运行时合同。
