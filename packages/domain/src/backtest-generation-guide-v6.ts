import {
  backtestGenerationExamplesV6,
  backtestProtectionExamplesV6,
} from './backtest-generation-examples-v6.js';
import { backtestComparisonLabels, backtestCrossLabels } from './backtest-expression-display.js';
import type { ResearchDataScopeSource } from './backtest-research-data-scope.js';
import type { BacktestSeriesField } from './backtest-strategy.js';

export const BACKTEST_PROTECTION_GENERATION_GUIDE_V6 = [
  '固定止损分开始保护和触发退出。首笔成交后就开始保护用activation.kind=immediate，只有原话另设启用门槛时才写condition。止损线等于首笔买入成交价×(1−跌幅)，跌幅只写在initialStop.percent。收盘价达到或低于止损线（含等于）发出清仓信号，回读也使用“达到或低于止损线”。首笔成交价由引擎固定，positionState.averageCost是含费用的持仓均价。不要重复把止损线写进activation或普通exit。',
  '以下两个计划的止损线相同。前者建仓后即保护，后者只因另有“持有至少两根再启用”的要求才附带条件。按本次原话选择启用方式和距离。示例比例不是本次参数。',
  'PROTECTION_V6_REFERENCE_JSON:' + JSON.stringify(backtestProtectionExamplesV6()),
].join('\n');

type ReferenceSource = Pick<ResearchDataScopeSource, 'timeframe' | 'fields'>;

const comparisonReadback = [
  `先输出完整strategy，再按实际操作符写reason。大小比较可直接用公式，gt用“>”或“${backtestComparisonLabels.gt}”，gte用“≥”或“${backtestComparisonLabels.gte}”，lt用“<”或“${backtestComparisonLabels.lt}”，lte用“≤”或“${backtestComparisonLabels.lte}”。`,
  `交叉有前根和当前两次比较，cross.above才读“${backtestCrossLabels.above}”，cross.below才读“${backtestCrossLabels.below}”。大小比较没有前根穿越要求，不用“突破”“上穿”或“下穿”表述。consecutive内的gt读“连续多根每根收盘分别高于当根指标”，不用“连续上穿”。`,
].join('\n');

function frozenScopeReferences(sources: readonly ReferenceSource[]) {
  const examples = backtestGenerationExamplesV6();
  const has = (...fields: BacktestSeriesField[]) =>
    sources.some((source) => fields.every((field) => source.fields.includes(field)));
  return {
    noOrdinaryExit: {
      type: 'compare', operator: 'eq',
      left: { type: 'constant', value: '0' }, right: { type: 'constant', value: '1' },
    },
    flat: examples.flat,
    ...(has('close', 'open') ? {
      count: examples.count,
      mixedComparisonBoundaries: examples.mixedComparisonBoundaries,
    } : {}),
    ...(has('close') ? { consecutive: examples.consecutive } : {}),
    ...(has('close', 'high') ? { frozenBreakout: examples.frozenBreakout } : {}),
    ...(sources.some((source) => source.timeframe === '60m' && source.fields.includes('close'))
      ? { latestHour: examples.latestHour } : {}),
    ...(sources.some((source) => source.timeframe === '1d' && source.fields.includes('volume'))
      ? { previousDailyCumulative: examples.previousDailyCumulative } : {}),
    ...(sources.some((source) => source.timeframe !== '1d' &&
      source.fields.includes('close') && source.fields.includes('volume'))
      ? { sessionDeviation: examples.sessionDeviation } : {}),
  };
}

/** V6单一算子说明；完整Schema另外提供，旧用途提示保持。 */
export function backtestGenerationGuideV6(sources?: readonly ReferenceSource[]) {
  const examples = sources ? frozenScopeReferences(sources) : backtestGenerationExamplesV6();
  return [
    'V6语义与结构对照。你按用户需求生成AST，程序只派生机械依赖，不补来源、capture、lag或条件。先确定每个操作数，再完整写AST，最后按实际AST写说明。',
    '当前持仓：positionState.isOpen为已持仓；空仓必须not(positionState.isOpen)。isOpen本身绝不能表示空仓。空仓是动态下单资格，放最外层all，不放历史窗口或事件内部。新策略未另有要求选rising-edge，修改保留原政策；空仓资格不等于while-flat重入政策。',
    '同时要求用all，各项条件完整保留；先后等待才用sequence。最近N根至少K根用compare(countTrue(periods=N,condition),gte,K)，含当前根；连续M根用consecutive，历史各根比较各自指标。sequence不统计次数，within不是计数窗口。无退出用不同常量eq恒假。未要求独立风控risk=[]，不附送控制。',
    'MA为简单均线，EMA为指数均线。指标值是完整indicator AST，周期只在params，不能用constant(周期)代替均线结果。数值四则用arithmetic，绝对值absolute；常量为十进制字符串，比例20%写0.2，不能近似成固定金额或数量。除零不可用，不混合不同价格坐标。',
    'rolling包含当前根：sum求和；standardDeviation总体ddof=0、样本ddof=1；quantile为线性插值，quantile是比例字符串。比值的分位数input必须仍为完整比值。',
    '逐项决定边界，left=A、right=B：A小于／低于B用lt，A不大于／不高于B用lte；A大于／高于B用gt，A不小于／不低于B用gte。等于阈值时，只有lte、gte通过。各个过滤单独判断；同一all可同时含lte和lt。交换操作数时同时反转方向。',
    ...(!sources ? [
      '每个来源当前值已经是决策时刻完成且可见的最新一根。最新小时close和小时MA.input直接用小时series，不再lag；lag(1)是额外前移该来源一根。前一日线累计值的lag只包裹日线cumulative。anchorAt按用户时点写完整ISO日期、秒及Z或时区偏移，同一锚点比较两侧保持一致。',
    ] : [
      '当前值已是该来源最新完成可见的一根。明确比较最新值时直接用series及其indicator，不再lag。',
      ...('latestHour' in examples ? ['最近已完成的小时close与小时MA使用当前小时来源。'] : []),
      ...('previousDailyCumulative' in examples ? [
        '前一日累计值的lag只包裹日线cumulative。anchorAt保留完整日期、秒与时区偏移，两侧使用同一锚点。',
      ] : []),
    ]),
    'sequence需要冻结时必须显式capture。capture逐层等于被冻结的完整触发操作数，包括原lag；confirm和invalidation用eventValue引用，不用当前close或常量价格冒充冻结值。trigger与capture没有eventValue绑定，事件不嵌套；失效优先，缺值取消等待。within按来源根数，触发后第N根仍有效；allowSameBar独立决定同根确认。',
    '每轮首次确认和全历史只确认一次不同：repeat=true允许确认完成后后续新触发重新启动，repeat=false成功确认一次后不再启动。用户要求结束后可重新启动必须true。',
    ...(!sources ? [
      '会话累计均价用sessionValue.vwap，按交易日重置、午休不重置；indicator.VWAP是固定窗口，period=1也不是会话累计。ADX/ATR需要同源high/low/close，ADX.output明确adx/plusDI/minusDI；MACD各参数角色和output不能互换。',
    ] : [
      ...('sessionDeviation' in examples ? ['会话累计均价是sessionValue.vwap，午休不重置，区别于固定窗口VWAP。'] : []),
      'ADX/ATR需要同源high/low/close，ADX.output明确adx/plusDI/minusDI；MACD各参数角色与output独立。',
    ]),
    'confirmedPivot明确side、左右根数、offset及input，右侧完成后才可见；价格低点用input=low且无sample，低点当时RSI用同一input再sample=RSI(close)，不能用RSI本身找价格低点。',
    'cross以left为主语：above是前值left<=right且当前left>right，below相反；交换操作数须反转方向。不得为普通严格高于过滤擅自加上穿；用户明确突破时核对是否要求跨越。',
    '固定止损用首笔成交价锚定initialStop.percent。收盘触发退出的跌幅只写在percent；没有独立启用条件时，写activation.kind=immediate。',
    '下面是独立语法示例，不是本次策略，不能整组复制或附送无关条件。示例d/h/m分别表示已声明的同标的日线/小时/分钟来源；本次ID、周期、价格坐标、全部参数及锚点必须按用户意图和dataScope选择，不能照搬示例值。引用哪个示例ID也必须声明对应来源。',
    ...('mixedComparisonBoundaries' in examples ? [
      'mixedComparisonBoundaries示例把两个不同边界合在一起：带宽不高于分位数（允许等值），且跳空幅度小于阈值（不允许等值）。',
    ] : []),
    ...(sources ? [
      '编写普通退出时先判断用户是否要求退出。明确“退出永不触发”时，exit逐字用noOrdinaryExit结构，左右均为不同constant，不用市场价格与零比较。用户有退出规则时仍按原规则生成。',
      '相对参考价的百分比偏离以现值除以参考值再减1。绝对偏离对应absolute(subtract(divide(现值,参考值),1))，左侧是无量纲比例，右侧百分比写比例小数。开盘相对上一收盘用open与lag(1,close)作除法。仅用开盘减前收是价格差，不能拿它与百分比比较。保留算式的除法和减一两层。',
      '区分“最新值”和“此前N根”。Highest(high,N)包含判断用的当根，其值至少达到当根最高价，不能代表此前N根。此前窗口先写Highest(high,N)，再在整个指标外写lag(1)。需要冻结该前高时，trigger与capture都使用带lag的完整操作数，confirm与invalidation使用eventValue。',
    ] : []),
    'EXPRESSION_V6_REFERENCE_JSON:' + JSON.stringify(examples),
    '输出前对照用户逐项检查：空仓否定、每个指标操作数、比较方向和等值边界、当前与lag、capture/eventValue绑定、repeat、实际阈值及未要求控制。按实际AST写说明：lt读“小于”，lte读“不高于”，不能按原话描述另一个操作符。下一可交易开盘按策略主周期，不默认跨日。',
    ...(sources ? [comparisonReadback] : []),
  ].join('\n');
}

export const BACKTEST_GENERATION_GUIDE_V6 = backtestGenerationGuideV6();
