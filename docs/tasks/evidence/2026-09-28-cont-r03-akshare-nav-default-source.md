# AKShare 净值新建默认来源更正

## 范围

DSA `AkshareFetcher.get_fund_nav_history()` 固定调用 `ak.fund_open_fund_info_em(symbol, indicator='单位净值走势')`；[既有净值来源证据](../../../../daily-stock-analysis/docs/thesis-ledger-nav-source-evidence.md)记录目标 000001 样本和 EastMoney `pingzhongdata` 调用链。本叶只把新建 V2 Desired Policy 的 `FUND_NAV`、`FUND_NAV_HISTORY` 中 AKShare RouteTarget 从包装别名 `akshare` 改为实际 `eastmoney`，并在 DSA AKShare manifest 的该精确 source 增加两项 `MUTUAL_FUND` 能力，manifest version 由 1 提至 2。报价、日线、持仓、筹码及旧显式/持久化 RouteTarget 均不改。

## 反例与验证

Server 默认路由断言修前 1 failed，显式旧 `akshare/akshare` 保真断言通过；修后 `market-control.service.test.ts` 20 passed。DSA 精确 source 版本/净值能力断言修前 1 failed；修后 V2 Apply 接受两项新目标，`test_thesis_ledger_provider_route_v2.py`、Control V1/V2/V3 及分页净值四文件合并 49 passed、4 条第三方/pytest 收集 warning。Server typecheck/build、限定 ESLint/Prettier 和 import 边界通过；DSA 新 manifest 模块及 V2 路由测试 flake8、相关 Python 编译和改动空白通过。

旧 Desired/Effective、预算/健康键及冻结原文仍保留旧 alias。当前目标容器应用代码未同步，本轮没有真实净值请求、数据库变更或 DSA 第三次官方全包。两条默认 RouteTarget 现在同属 EastMoney，不能当成独立备用；净值披露/可见时刻、源端修订、成立以来覆盖与 G0-M 继续开放。
