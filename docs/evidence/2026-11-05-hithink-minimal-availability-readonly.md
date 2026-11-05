# HiThink现有配置的最小只读可用性核验

日期：2026-11-05，北京时间17:34起；责任门禁：[基金G2.2](../tasks/2026-11-04-fund-intraday-valuation.md)。用户最新要求先不切换来源，沿用HiThink做最小可用性核验，不新增付费调用；可用且符合费用限制后再继续基金估值验收。复用[费用核查](2026-11-05-fund-price-cost-qualification.md)，不重复询问用户已明确表示没有的费用材料。

## 核验方法

本轮只读取目标保存/生效策略、DSA来源配置元数据、Redis既有报价、已有运行日志及冻结日线窗口统计。没有发出新的HiThink快照、日线或连接测试，没有用可能命中上游的Market报价GET作为缓存检查。所有Docker命令均明确只读，没有修改配置、准入、凭据、数据或运行态。

## 当前控制状态

17:34反读策略仍为修订188、`applied / effectiveStale=false`：

- CN/STOCK/REALTIME_QUOTE唯一目标仍是 `hithink/a-share-prices-snapshot`，生效投影 `eligible=true / reason=null`。
- CN/STOCK/1d/qfq仍为 `hithink/hithink-financial-api` 第一、腾讯第二，均 `eligible=true / reason=null`。
- HiThink保持启用，配置版本9、内部凭据版本1；本轮只读版本元数据，未取得或输出凭据。

控制可执行只证明现有配置/资格就绪，不替代上游当次返回和账号费用证明。免费替代调研方案未执行；没有启用TickFlow或替换任何价格目标。

## 可复用的今日成功响应

Redis既有 `quote:4:600000.SH:STOCK:...:last-valid` 中保存一份HiThink快照：

| 字段 | 原记录 |
| --- | --- |
| 标的 | `600000.SH` |
| Provider / 来源 | `hithink / a-share-prices-snapshot` |
| 现价 | 9.87 CNY |
| 源端行情时间 | `2026-11-05T07:05:39Z`，北京时间15:05:39 |
| 取得时间 | `2026-11-05T07:05:43.273311Z`，北京时间15:05:43 |
| 原响应状态 | `servedFromCache=false / fallbackUsed=false / freshness=live / stale=false` |

DSA已有运行日志在北京时间15:05:43记录同标的、同Provider的 `provider-call started → success`，耗时258ms、attempt1，随后原报价接口HTTP200；请求/追踪标识为 `70f63302-41ce-4b68-98b3-2d7a19fc4b4c`。本轮读取该原回执，没有重新请求或删除缓存来制造新探针。

由此能够确认：**HiThink股票快照至少在今日15:05存在一次成功调用，不能将其判断为已经证实不可用。** 不能外推：17:34此刻新请求成功、其他持仓全覆盖、qfq同步可用、该原调用费用为0，或原响应可用于当前五分钟估值。缓存中的live/stale字段是当时记录；本次时点距行情已超过两小时，不把原live标记当作当前新鲜状态。600000也不属于000001本次十只披露股票，不能代收基金覆盖门禁。

## qfq与费用仍未闭合

目标冻结窗口中，HiThink股票qfq共56个，最新取得于 `2026-10-30T19:23:32.264Z`（北京时间10月31日03:23）；未找到本日新增qfq窗口。`MarketDerivedSeriesSnapshotV3` 为0行；本次所读的DSA容器日志自本日14:45起未找到新的日线/图表请求记录。日志范围和表范围有限，这不是“全天没有任何qfq调用”或“qfq失败”的证明；只能说明本轮没有取得足以确认当前qfq可用的新证据。

费用依据仍沿原结论：官方仅明确不限制累计调用次数；用户已回复没有账号或服务商的额外费用证明。日志success、HTTP200、凭据已配置和缓存命中都不能证明调用免费。因此本轮不追加收费状态未知的行情探针，也不通过生产接入披露候选触发更多请求。

## 当前执行结论

最小只读核验已完成：保存配置不变、控制目标就绪、复用今日单标快照成功证据；**当前qfq与零新增费用资格仍未确认，G2.2保持开放**。待明确费用依据后，才能在原配置内做有界新请求，随后沿原Task接入披露参考、核对至少两个真实交易分钟及同日正式净值误差。000001披露候选保留在忽略目录，生产参考表未变；今日240个失败分钟不回填。

机器目录：`.recovery-artifacts/hithink-minimal-readonly-20261105/`，包含 `policy.json`、`quote-cache.json`、`dsa-existing-source-lines.log`、`dsa-existing-bars-lines.log`、`bar-window-summary.json`、`derived-summary.json`、`derived-latest.json`。本轮新增行情/模型/付费调用均0、配置写入0、Docker状态变更0；未stage、commit、push或清理。研究价格门槛保持，没有新研究观察或模型实验。
