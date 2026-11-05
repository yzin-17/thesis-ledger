# 旧日线与逐指标入口拆除

> 2026-09-29。源码、包级与 DSA 隔离离线检查通过；目标运行态仍需核验。

## 调用链核对

- Server、Desktop 与 API Client 生产源码已无 `GET /api/v1/thesis-ledger/market/bars` 调用。Server `MarketService.getIndicator()` 仅被旧测试调用，当前图表指标经 `MarketController`、V3 图表 Reader 与 `DsaClient.calculateIndicators()` 获取。
- DSA 旧日线 GET 与逐指标 GET 现已删除，旧 URL 返回 404。对应 `_fixture_indicator`、`_real_indicator` 和 Server 的旧请求构造器、陈旧回退缓存、Redis `indicator:` 前缀也删除。V1 capabilities 不再宣告已删除的两类入口。
- DSA `_fixture_bars`、`_real_bars` 和 Data Gateway `bars()` 仍被现行回测 V2 依赖入口调用，保留其源码。当前图表纯指标计算及精确 V3 日线继续使用各自合同。

## 验证与边界

- Server 定向 13 项、全包 1686 项通过且 81 项跳过，类型/build 与模块边界通过。DSA 定向 52 项通过；官方隔离 `offline-tests` 为 7601 项通过、1 项跳过、4 项未选、626 项子测试通过。主仓与 DSA `git diff --check` 通过。
- 旧 GET 的删除不等于整个 Data V1/V2 收敛。回测 `GET /api/v1/thesis-ledger/v2/market/bars`、日历、标的事实与公司行动仍有 Server 调用；报价、基金净值、持仓、筹码、FX 和 Control 仍含 V1 路由。目标 Docker 与真实来源未验收，C01/C03/E02/E04/U02/D02/D03 均不勾选。
