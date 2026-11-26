/** 日线委托的生成合同。按请求分别确定信号、委托、保护与等待。 */
export const BACKTEST_DAILY_ORDER_PROMPT =
  '\n仅当本次明确要求限价、触价、特殊有效期或父单保护，选择日线委托分支时才应用本段；普通收盘判断后开盘市价成交沿用原执行，不生成orders。该分支execution.mode="exchange"，timing="dailyBarOrders"，orders是扁平数组。在已选择该分支的前提下，列出建仓、普通退出两个模板，再仅为明确的阶段和附属保护追加模板。id唯一，每张独立填写action、order、validity。' +
  '建仓单的限价和期限只写在建仓单。信号日最低价挂限价买单时，order={kind:"limit",price:{type:"series",sourceId:执行价格来源ID,field:"low"}}；按下一开盘市价买入时 order={kind:"market"}。买单仅当天有效用 validity={kind:"DAY"}，自激活起 N 根有效用 {kind:"bars",bars:N}。' +
  '即使没有普通退出条件，第二张也保留普通退出模板 {"id":"exit","action":{"kind":"exit"},"order":{"kind":"market"},"validity":{"kind":"DAY"}}。只有明确指定普通退出委托的价格或期限才改变其字段。' +
  '每次父买单成交后按量保护用 eachFill，全部成交才保护用 fullFill。触价止损单的 action.kind="stopLoss"，order.kind="stopMarket"，parent.templateId 引用第一张买单的实际 id。明确本次模拟计价的固定价格 P 写 price={type:"constant",value:原价位的十进制字符串}；持仓结束才终止写 validity={kind:"position"}。止盈单使用 takeProfit 和 limit。只有明确要求同一父单关联一张止损和一张止盈时，两张才填写相同 exitGroup；独立保护单省略 exitGroup。' +
  '收盘判断、后续开盘退出的比例保护只写 tradePlan.initialStop：kind="percent"，percent 为跌幅的小数比例，按要求设置 activation；该条规则在 orders 中占零张附属委托。仅在明确要求阶段性加减仓时使用 stage。数量按仓位与阶段规则计算。开盘父成交可参与同根后续区间，区间父成交的保护下根才撮合；日线双触止损优先。\n';
