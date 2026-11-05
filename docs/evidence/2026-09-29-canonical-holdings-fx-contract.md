# 基金持仓与 FX 合同收敛

## 改动

- DSA ThesisLedger 专属基金持仓与 FX 路由迁到 `/api/v3/thesis-ledger/market/*`，旧 V1 URL 删除；响应使用 `version: 3`，V1 capabilities 不再声明这两项能力。
- 主仓 Schemas 删除 `FundHoldingsV1`、`FxRateV1`、`FxRatesResponseV1`、`CurrencyV1` 等旧名称，当前响应拒绝旧版本。Server 不再补写基金持仓上游版本和代码，按响应校验，并用新缓存键隔离旧值。
- FX 转换证据标识和 Portfolio 响应中的 FX 版本更新为 3；仍保留币种、来源、日期、时效、披露期间和持仓权重等实际业务字段。
- DSA 合同文档及 Changelog 同步更新，测试确认旧持仓与 FX URL 返回 404。

## 本地验证

- Schemas 全包 563 项、Server 全包 1687 项且 81 项跳过、DSA 官方离线 7601 项且 1 项跳过、API Client 36 项、Desktop 508 项通过。
- Schemas、API Client、Server、Desktop 构建及 Server/Desktop 类型检查通过；DSA syntax/flake8 关键检查、主仓模块边界检查、两仓 `git diff --check` 通过。

## 保留门禁

目标 DSA/Server/Worker、真实 Provider、客户端及历史数据验收尚未执行；当前 DB 中旧基金净值/持仓数据只有在明确开发重建后才能排除误读，D01/D02 仍未完成。Backtest、Ledger 和其他旧合同继续待处理。
