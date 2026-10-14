# 市场数据“尚未准入”只读诊断

## 检查范围与时间

2026-10-07 02:48（Asia/Shanghai），核对本机 Server 的 Provider registry、V3 精确路由能力目录，以及 `thesis-ledger-dev-dsa-1` 中 SQLite 的准入表。数据库连接使用 `mode=ro` 和 `PRAGMA query_only=ON`。仅输出配置标志、路由维度、准入状态及有效期，没有读取或输出凭证明文，没有写入、撤销或恢复准入。

## 已核对结果

| 来源/能力 | 配置与凭证 | 准入事实 | 当前影响 |
| --- | --- | --- | --- |
| HiThink ETF 前复权日线 | 已启用、环境 API Key 存在 | 旧记录截至 2026-10-05 21:28；基础价格当前不依赖该记录 | `ready`，可选主源 |
| HiThink 股票三种日线 | 已启用、环境 API Key 存在 | 没有对应准入记录 | `not_admitted` |
| HiThink 股票/ETF 实时行情 | 已启用、环境 API Key 存在 | 两条记录均为 `revoked`，原因 `bounded_target_probe_finished`，旧有界目标探测结束后撤销 | `not_admitted`，不自动恢复旧记录 |
| HiThink ETF 分红 | 已启用、环境 API Key 存在 | 没有对应事件准入记录 | `not_admitted` |
| AKShare 日线、股票报价及筹码等 | 已配置并启用，无需凭证 | 没有对应准入记录 | 当前具体能力未就绪，不能由 Provider 启用状态推断可选 |
| efinance 基金净值历史 | 已配置并启用，无需凭证 | 旧记录截至 2026-10-01 21:22，已过期 | `not_admitted`；报价等其他能力缺记录 |
| pytdx、yfinance 的已登记能力 | 已配置并启用，无需凭证 | 没有对应准入记录 | `not_admitted` |
| Tushare 已登记能力 | 已配置并启用，凭证存在 | 没有对应准入记录 | `not_admitted`；本次没有调用外部收费接口 |
| RQData | 未配置、无页面凭证 | 没有对应准入记录 | 首先缺配置；不能据此判断账号权限 |
| 腾讯基础价格 | 已配置并启用，无需凭证 | 已实现的基础价格按配置开放，不依赖人工准入记录 | 股票 none/qfq 与 ETF none/qfq/hfq 为 `ready` |

检查时数据库准入表只有五条记录：HiThink ETF 前复权一条、已撤销 HiThink 报价两条、efinance 净值历史一条、腾讯 ETF 后复权一条。说明主要阻断是没有当前有效的精确能力记录，不是大部分 Provider 的启用开关或凭证缺失。

## 代码路径与配置缺口

前端下拉框消费完整目录中精确 routeKey 且 `state=ready` 的条目。DSA 的 `_catalog_market_v3_admission_is_current` 对基础价格检查配置，对其余能力读取当前准入；因此宽 Provider manifest 中声明的能力并不会直接成为路由候选。

HiThink 的 `credentialSchema.methods` 在检查时为空，`credentialSource=environment`。其凭证定义没有注册 `api_key/apiKey`，前端因而没有“配置凭证”按钮。日线、报价和分红的运行时也存在只接受 `environment` 的检查；通用 smoke 依赖普通 Fetcher 方法，与 HiThink 专属适配器不匹配。这些是本次凭证链修复的直接输入。

## 证据边界

本次只读诊断解释目标目录为何阻止选择。它不证明缺记录的外部接口可用，也不证明历史报价记录可安全恢复；新的准入仍须在相应能力的维护任务中完成有效账号、精确来源及范围验证。本次默认主源与页面凭证修复不修改这些记录。
