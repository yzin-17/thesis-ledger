# 图表指标计算合同收敛

> 2026-09-29。Server、Schemas、Desktop 与 DSA 源码和本地门禁已接线；目标 Server→DSA HTTP 尚未验收。

## 接线

- DSA 停用 ThesisLedger `/api/v2` Router，纯指标计算直接注册在 `POST /api/v3/thesis-ledger/market/indicators/calculate`，请求和响应要求 `contractVersion: 3`；旧合同在计算前拒绝。当前引擎标识是 `dsa-indicator-v3`。
- Server `DsaClient.calculateIndicators()` 解析当前请求与响应合同，并发送 V3 路径。Market Controller 继续核对完整输入指纹、请求集合与引擎版本；Desktop 投影携带相同引擎标识。Schemas 删除指标计算专属的旧 V2 命名导出，当前图表结果类型改为 `MarketIndicatorResult`。
- 图表 BarSeries、详情 HTTP 响应及部分其他当前消费者仍使用 `contractVersion: 2` / `*V2` 命名；这次只替换指标计算传输合同，不宣称整个 Market/ThesisLedger V1/V2 已清除。

## 验证

- Schemas 定向 5 项、全包 569 项通过，构建通过。
- Server 指标定向 18 项、DSA Client 传输定向 13 项通过；最终输入全包 1687 项通过、81 项跳过，Server 类型/build、模块边界通过。
- Desktop 图表定向 8 项、全包 508 项、类型/build 通过。DSA 定向 27 项通过；官方隔离 `offline-tests` 为 7603 项通过、1 项跳过、4 项未选、626 项子测试通过。
- API Client 36 项、类型/build 通过；主仓与 DSA 的 `git diff --check` 通过。
- 以上均未包含目标 HTTP 鉴权、Server→DSA 实际响应、Electron 图表或真实行情准入。

## 待办

完成目标同源部署；继续收敛 Data V1、图表 BarSeries/详情的当前合同、缓存键与 Ledger/Backtest 旧导出。E04/U01/U02/D02/D03 保持未完成。
