# Efinance 新建默认路由来源更正

## 合同与范围

当前本地与运行中 DSA 容器安装的 `efinance 0.5.9` 已静态证明报价和净值入口实际归 EastMoney，详见 [R02.7](2026-09-28-cont-r02-7-efinance-fallback-identity.md) 与 [R02.12](2026-09-28-cont-r02-12-efinance-upstream-identity.md)。本叶仅修新建 V2 Desired Policy 的四组 Efinance 默认 RouteTarget：`REALTIME_QUOTE/STOCK+ETF`、`FUND_NAV/FUND_NAV_HISTORY/MUTUAL_FUND` 均使用 `upstreamSource=eastmoney`。DSA Efinance manifest 对该精确 source 登记相同资产能力并把 manifest version 从 1 提至 2。现有 `efinance` alias 继续声明以读取旧 Desired/Effective；显式旧路由和历史冻结字节不在本叶改写。

## 失败复现与实现

Server 默认路由断言修前 1 failed、同文件其他 19 项通过；显式旧 `efinance/efinance` 仍保持原字节。Server 默认值改后该文件 20 passed。跨仓预检发现 DSA manifest 虽列 `eastmoney`，但其 source capability 原仅有 `DAILY_BAR`，新默认报价/净值会被 Control 拒绝。DSA 精确 source 断言修前 1 failed（缺 `REALTIME_QUOTE`），修后 V2 Apply 接受四组新目标；通用 manifest helper 未放宽其他 Provider 的 source 能力。版本 2 使新增能力不沿用旧 manifest revision。

## 验证与未完成项

- Server `market-control.service.test.ts`：20 passed；`@thesis-ledger/server` typecheck、build、限定 ESLint/Prettier 与 `scripts/check-boundaries.mjs` 通过。
- DSA `test_thesis_ledger_provider_route_v2.py`、`test_thesis_ledger_control.py`、`test_thesis_ledger_control_v3.py`：36 passed、4 条第三方/pytest 收集 warning；新 manifest 模块及 V2 路由测试 flake8、相关 Python 编译、改动空白通过。
- 没有迁移持久化 Desired/Effective、预算/健康键或历史冻结；也未调用真实 Provider、运行目标同步或第三次 DSA 官方全包。当前运行中容器的应用代码/manifest 仍是旧版本，本地通过不授目标验收。

旧 `efinance/efinance` 在 Runtime 仍可能把包装别名写作 `upstreamSource`；跨版本兼容和真实上游字段需按主 Task 的后继迁移阶段处理。AKShare 的包装别名及其他来源亦未由本叶更正，不能据此宣称独立备用或 G0-M 通过。
