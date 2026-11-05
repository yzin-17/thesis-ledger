# 中港美ETF公共收费与执行冻结扩展

对应[任务](../archive/tasks/2026-11-05-etf-public-fee-slices.md)及[父规格AC08](2026-11-04-todo-4-15-delivery.md)。用户已确认现有中港美股票／ETF及当前券商未覆盖切片。既有三市场股票切片及富途香港成本研究预设复用，不重新验证旧股票历史来源。

## 缺口与本轮范围

公共收费标准合同和本地精确来源当前仅接受STOCK。补三个ETF切片：510300.SH／2023-08-28～29、02800.HK／2025-08-06～11、SPY.US／2024-05-10～24。三个来源仍属于现有official-rules、official-hk-rules、official-us-rules；新增精确ETF来源键，不借用股票来源、不改变现有策略路由。

| 切片 | 本轮有证据的公共费项 | 计算与限制 |
| --- | --- | --- |
| 上交所股票ETF | 竞价经手费，成交额双侧0.004% | 明确部分收费范围；其他费项由已选研究模型持有，不将缺项设零或宣称完整账单 |
| 香港ETF | 交易费、SFC、AFRC及印花税豁免 | 复用相同期间已验费率，ETF印花税使用独立2015年港交所豁免公告；正常二级市场交易 |
| 美国SPY | Section31及TAF | 复用既有2024年T+2收费日边界、费率与上限，追加FINRA ETF适用依据；TAF仍要求实际股数，归一化数量拒绝组合 |

上交所依据为[2023年8月收费管理规则](https://www.sse.com.cn/lawandrules/sselawsrules2025/charge/c/c_20250610_10781461.shtml)及其附件；港股豁免依据为[港交所2015年公告](https://www.hkex.com.hk/News/Market-Communications/2015/150204news?sc_lang=en)；美股ETF适用范围依据为[FINRA TAF FAQ Q100.22](https://www.finra.org/rules-guidance/guidance/faqs/trading-activity-fee)。新读取仅核对这三个公开材料及必要附件，最多4次、单件2MiB、0 USD，失败不自动重发；不占用也不扩充图表富途／Yahoo整窗账本。

## 合同、执行与消费

公共收费V3允许STOCK／ETF，外层instrumentType须与精确routeKey一致；来源包须匹配证券、资产、来源与有界日期。原股票请求和来源摘要不变。CN完整四费项检查继续约束STOCK；ETF接受本来源明确声明的部分收费，组合时保留覆盖说明与所选模型其他设置，不推断未覆盖费项的历史事实。

组合后的执行模型继续绑定symbol、market、instrumentType、currency、窗口和来源摘要；错误资产、日期越界、未知费用、来源时钟晚于dataAsOf及归一化TAF均拒绝。冻结副本独立，来源或配置后续变化不能改写已冻结执行模型。当前富途香港HK／US股票与ETF成本研究沿用现有预设及单次成交扣收，保留current-schedule-research，不宣称历史客户实际协议；不新增CN券商模板。

## 验收与部署

分别验证来源／合同、执行冻结／费项数值与旧股票兼容、API与客户端现有模型消费、正式DSA／Server运行态。真实本地官方资料读取和受控价格执行分开记录，不冒充新增ETF实际股数行情或全历史回测。运行策略保持用户当前值，产品允许显式选择新来源后再准备执行。
