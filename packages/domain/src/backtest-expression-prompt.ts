/** 所有策略生成入口共用的算子含义；以正式 Schema 决定字段与可执行范围。 */
export const BACKTEST_EXPRESSION_PROMPT =
  'MA仅表示简单移动均线，EMA才是指数移动均线；不能把用户指定的指数均线写成MA。' +
  '数值运算用arithmetic，operator为add/subtract/multiply/divide/min/max，left/right均为数值AST；absolute.input取绝对值。十进制常量保持字符串，除零不可用；价格、股数和比例不能混加，乘法须有比例项。' +
  'lag={type:"lag",periods:N,input:数值AST}按该来源此前N根观测取值，不按自然日。Highest/Lowest/MA均含当根；突破此前20根最高应比较close与lag(1,Highest(high,20))，不是close>含当根最高。历史节点必须唯一锚定一个行情源，不能对持仓或会话状态做历史预计算。' +
  'rolling包含当根，statistic=sum/standardDeviation/quantile，必填periods和input；总体标准差明确ddof=0，样本标准差明确ddof=1，不能互换；分位数必填quantile十进制字符串并使用线性插值。不高于为lte，严格低于为lt。需求中的绝对跳空比例写作absolute(open/lag(1,close)-1)，各过滤只按本次原意生成。countTrue={type:"countTrue",periods:N,condition:布尔AST}计数；consecutive同字段但返回连续N根均成立的布尔结果，各根比较自己的指标。cumulative使用明确anchorAt和sum/max；锚点必须有冻结数据覆盖。' +
  '事件先后用sequence，必填trigger/confirm/invalidation布尔AST、within正整数、allowSameBar/repeat布尔值；第i根触发后第i+N根仍有效，失效优先，缺值取消等待。capture直接放数值AST以冻结触发时数值，confirm/invalidation内用{type:"eventValue"}引用它；等待期间不能重新计算lag或前高来替代冻结价。此前20根最高必须是lag(1,Highest(high,20))而非lag(1,high)。没有失效条件可用恒假比较，不省略必填字段，不嵌套sequence。' +
  'ADX需同源high/low/close且input为close，params.period为Wilder周期，output明确adx/plusDI/minusDI，不能替用户选择输出。confirmedPivot用side=low/high、leftBars/rightBars、offset=0最近或1上一个、input；可选sample在摆动点时取值，必须等右侧完成后确认，不能提前交易。' +
  '摆动返回值取决于sample：价格低点比较使用input=low且省略sample，返回低点价格；对应低点当时的RSI比较仍使用input=low、再设置sample=RSI，返回该低点的RSI。两组各以offset=0和1比较，不能用close或RSI本身寻找价格低点，也不能给价格比较附加RSI的sample。中文必须据最终配置回读严格／非严格比较、来源周期、历史窗口是否排除当根、分位算法、事件失效与冻结值及摆动确认延迟。未指定均线类型时提出待确认问题；只授权改周期时保留操作数、方向和其他规则。';

/** 交易意图到既有算子的对应关系，不根据自然语言替模型生成或修补AST。 */
export const BACKTEST_EXPRESSION_INTENT_PROMPT =
  '同一决策时刻同时要求多个过滤，使用all合并，不为它们增加sequence。最近窗口计数用countTrue，连续各根成立用consecutive；只有用户明确要求先触发、再等待确认的事件先后才使用sequence。普通退出恒假直接比较两个不同常量，不包装sequence。' +
  '持仓或空仓是当前动态资格，不放入countTrue、consecutive、sequence等历史预计算内部；需要时放在外层all。' +
  '比较先明确主语和参照：A不高于B是left=A、operator=lte、right=B；交换两侧必须改为gte才能等价。A严格高于B是left=A、gt、right=B；不能只交换两侧而保留方向。reason和intentCheck必须按实际AST回读，不复制未实现的原话。' +
  '用户要求冻结触发比较中的某个操作数时，capture显式写出那个完整表达式，包括原有lag；例如排除触发当根的前窗值不能换成包含当根的窗口值。程序不会补capture或修改lag。' +
  '当日开盘以来累计成交量加权均价使用{type:"sessionValue",sourceId:已声明来源,field:"vwap"}，随会话重置；indicator.VWAP是固定period根的滚动均价，period=1也不能代替会话累计均价。' +
  '来源当前值已是完成且可见的最新一根。最新小时收盘和最新小时均线都使用当前表达式，不为防未来额外加lag；仅用户确实要求再前一根时才用lag。lag的步长属于其唯一来源的周期；要求前一日线的累计量，就使用日线量来源，不能把小时量来源的lag(1)当成前一天。' +
  '空仓资格不等于持续真值重新入场政策；未明确要求持续真值重入的新定义用rising-edge，修改以原政策为准。权益20%对应percent="0.2"，中文不能读成0.2%；投入比例不能以假设净值近似为固定金额或份数。';

/** 放在完整结构说明之后，核对容易被误当作重复字段的模型决定。 */
export const BACKTEST_GENERATION_FINAL_CHECK_PROMPT =
  '\n输出前先按规则类型核对AST：最近N根至少K根满足P，写compare(left={type:"countTrue",periods:N,condition:P},operator="gte",right={type:"constant",value:K的十进制字符串})；连续M根各自满足Q写{type:"consecutive",periods:M,condition:Q}，同时要求两者用all合并。sequence只返回一次事件是否确认，不统计成立次数，within=N也不代表N根窗口计数。' +
  '区分指标周期与指标结果：MA(close,N)是{type:"indicator",name:"MA",input:close的series表达式,params:{period:N}}，N仅是params.period，不能把整个指标替换成constant(N)。标准差除以均线时arithmetic.divide.right必须为该MA表达式；带宽的分位数rolling.input必须复用完整的标准差除均线表达式，不是标准差除以周期数字。' +
  '最新已完成且可见的小时收盘直接用小时series，小时均线的input也直接用同一小时series，不加lag。若另外要求前一日线累计量，lag(1)只包裹日线来源的cumulative，不包裹当前小时收盘或小时均线。anchorAt必须为完整带时区ISO时点，例如北京时间2026年1月5日15点写"2026-01-05T15:00:00+08:00"；不能写缺时区的"2026-01-05T15:00"。锚点、周期和阈值按本次用户要求选择，格式示例不是本次参数。' +
  '再核对事件冻结：如果用户要冻结trigger比较中的某个操作数，capture必须与那个完整操作数逐层相同。例如该操作数是lag包裹指标时，capture也保留同一lag层、periods及完整input，不能只复制里面的指标。eventValue不能改为等待时重新计算的窗口值。' +
  'sequence.repeat决定全历史能否重复启动：true允许确认完成后的后续新触发再次启动，false在成功确认一次后永久消费。用户要求结束后允许新的突破重新启动时必须repeat=true；每轮等待中首次确认不等于全历史只确认一次。within控制每轮期限，allowSameBar控制是否同根确认，均不能替代repeat。' +
  '固定止损的退出触发阈值与保护启用条件是两件事。用户仅要求固定距离保护时，initialStop写距离，activation显式写{"kind":"immediate"}，表示保护随持仓立即生效；不得把同一个跌幅再写成activation条件，不得改用averageCost替代首笔成交价。只有另行明确要求在盈利、时间或其他条件成立后才启用时才选择相应条件启用。' +
  'intentCheck与reason描述实际交易行为：上述固定保护写立即生效，不声称省略activation。确实说明字段存在或省略时必须与最终JSON逐项一致，不能描述计划中的写法而输出另一种写法。' +
  '最后按已写AST核对中文：lte读不高于，lt读低于；下一可交易开盘按策略周期，不一律读成次日。';
