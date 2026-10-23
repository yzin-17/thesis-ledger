# Finnhub 免费能力范围验收

对应：[来源凭据 Spec](../../specs/2026-09-14-market-provider-credentials.md#finnhub-free-scope-20261022)、[来源凭据 Task](../2026-09-14-market-provider-credentials.md)、[原始在线实测](2026-10-21-continuation-frontier.md#provider-followup-2026-10-22)。

## 用户决定与核实依据

用户于 2026-10-22 授权：核实免费账号是否支持日线；若不支持，按免费能力范围验收，日线明确标为受限，继续其他非移动端任务。Longbridge 仍暂缓。

本轮读取 Finnhub 官方仓库的 [Issue #546](https://github.com/finnhubio/Finnhub-API/issues/546)。官方维护者 `finnhubio`、页面标记 `Owner`，于 2025-04-15 明确答复：免费方案不开放 `/stock/candle`，恢复该接口访问需要相应付费套餐。该答复针对的正是 `AAPL`、`resolution=D` 的股票日线问题；本次核实日期为 2026-10-22，不把答复发布日期写成本次日期。

官网套餐页与日线文档本轮未返回可读正文，浏览器读取超时；随后在限定的一次官方仓库核对中取得上述维护者明确答复，不使用第三方套餐说明作为验收依据。当前免费 Key 当日已记录的真实日线拒绝与该官方说明一致。

## 复用的真实证据

| 已接入目标 | 原实际结果 | 本次验收结论 |
| --- | --- | --- |
| US STOCK 报价，`AAPL.US` | HTTP 201、`healthy`、`readOnly=true`、`attempted=true`，1818ms；请求 ID `9cab9d5c-acff-467f-b439-a3507e86fb5e` | 当前已接入的免费报价范围通过，复用原实测 |
| US STOCK 日线，1d/qfq | HTTP 201 包装响应为 `degraded`，目标 `unavailable`、`attempted=true`、`permission_denied`；请求 ID `3e6cd945-0075-4d11-8fbd-58bea45eb13f` | 免费范围外，明确受限；该日线读取没有通过，不再作为本轮待修复阻塞 |

本次范围只覆盖现有已接入能力，不扩展到其他免费接口、证券、复权或窗口。保留日线绑定及原失败事实，未来账号权限改变时再独立验证；不以免费范围收口证明日线可用。

## 状态与保护边界

Finnhub 当前免费范围验收完成。凭据已保存、配置版本 1、来源停用的既有状态保持；本轮仅核实公开官方说明与维护验收合同，未保存凭据、启用来源、修改路由或重发行情请求。先前通过的配置、报价与启停修复证据继续按其输入和断言复用。

Spec、Task、来源合同与最新总表同步采用上述范围。T5b 父项保留 Longbridge 的真实授权、行情及刷新恢复未完成状态；用户暂缓不计为通过，不归档整个父任务。Tushare 当前积分及 ETF 跳过、Alpha Vantage 免费近期及更早历史受限范围保持。

一致性核验通过：本轮 8 份合同、任务、总表、TODO 和证据的 147 个本地链接均存在，写集 `git diff --check` 通过。Finnhub 免费子项已勾选，Longbridge 与 T5b 父项保持未勾选；没有使用范围收口改写日线实测结果，也没有重跑行情或构建。
