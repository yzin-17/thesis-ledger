# Alpha Vantage 免费近期日线

> 日期：2026-10-22
> 状态：实现与目标验收完成，本页保留为当前来源合同
> 对应任务：[已完成任务](../archive/tasks/2026-10-22-alphavantage-free-recent-daily.md)
> 承接：[来源凭据 T5b](../tasks/2026-09-14-market-provider-credentials.md)及[来源专属合同](2026-10-09-unified-data-capability-source-contracts.md)

## 背景与范围

用户授权适配 Alpha Vantage 免费近期日线，更早历史保持受限。现行精确日线固定请求 `outputsize=full`，免费 Key 无法完成；此前同一 Key 直连 `compact` 已返回 100 条 AAPL 日线，见[前置证据](../tasks/evidence/2026-10-21-continuation-frontier.md#provider-followup-2026-10-22)。

本切片只调整既有 US/STOCK/DAILY_BAR/1d/none 绑定的来源读取。工厂、凭据、报价、路由键、上游来源名称及消费者接口继续复用。Finnhub 日线权限与 Longbridge 暂缓由原任务持有；凭据首次保存状态另按[独立合同](2026-10-22-provider-first-credential-state.md)验证。

## 来源行为与覆盖边界

- 每次读取只向官方 `TIME_SERIES_DAILY` 请求一次 `outputsize=compact`，保留原 4.5 秒 HTTP 超时，不请求 full、不重试或切源。官方参数合同见[日线文档](https://www.alphavantage.co/documentation/#daily)。
- 响应必须回显请求的证券，日线映射非空且最多 100 条，日期为合法标准交易日期字符串，行必须为字段映射。错误证券、非法日期、非法结构或超额响应为 `invalid_response`；无数据为 `not_covered`。
- 以同次响应最早、最晚日期作为保守可读边界。只有请求起止均在该区间且区间内有实际数据时才规范化返回；起点早于最早数据、终点晚于最新数据、跨越边界或空窗均返回 `not_covered`，不返回截断片段冒充完整窗口。未知交易日历不用于推断边缘空白日已覆盖。
- 保留现有日线规范化、窗口筛选、日期排序、缺失字段与源摘要语义；不合成量额，不把 compact 的 100 条扩大为任意历史完整性或严格 PIT 证明。
- 限流、HTTP 权限及上游失败继续复用既有稳定错误边界。`Note/Information` 保留 `quota_unavailable`，不在本切片扩展账户等级或套餐识别。

## 修订与兼容性

日线适配修订更新为 `dsa-v3-us-stock-alphavantage-none-exact-daily-v2`，单响应协议及来源修订更新为 `dsa-alphavantage-compact-daily-single-response-v2`，声明最多 100 行。缓存与冻结继续使用已有修订隔离；旧快照及其原修订不改写。报价修订、通用 SDK 的其他用途、其他来源均不改变。

## 验收标准

- **AV1**：真实来源处理器仅发送一次 compact 请求，核对证券、响应结构及 100 行上限。
- **AV2**：近期区间成功；更早、跨界、晚于响应边界与无数据区间明确拒绝，不成功返回部分窗口。
- **AV3**：既有规范化、凭据隔离、错误边界及唯一绑定回归通过；新旧日线修订隔离，报价修订保持。
- **AV4**：通过正式最小 DSA 更新入口部署；目标 HTTP 近期检查通过，目标同版来源处理器使用真实 compact 对更早窗口明确拒绝；凭据、启停及路由保持原状态。

## 验证与停止边界

先执行来源定向用例与回归，再执行语法、能力边界和运行载荷门禁，最后正式 `sync-code.sh dsa` 及只读目标验收。纯代码快更不代表镜像更新。真实读取最多近期、旧窗各一次；新的额度/权限、兼容性预检或运行环境卡点出现时停止确认，不深入替代方案。

## 未决问题

无阻塞设计问题。窗口边缘采用上述保守拒绝规则，不自动增加交易日历或完整历史能力。
