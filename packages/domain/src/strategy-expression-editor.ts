import type { StrategyEditorField } from './strategy-definition-editor.js';
import type { StrategyDefinitionDraft } from './strategy-definition-draft.js';
const series = { type: 'series', sourceId: '', field: 'close' };
const compare = {
  type: 'compare',
  operator: 'gt',
  left: series,
  right: { type: 'constant', value: '0' },
};

export function expressionEditorVariants(
  context: string,
): Readonly<Record<string, StrategyDefinitionDraft>> | undefined {
  if (context === 'boolean')
    return {
      compare,
      consecutive: { type: 'consecutive', periods: 3, condition: compare },
      sequence: {
        type: 'sequence',
        trigger: compare,
        confirm: compare,
        invalidation: {
          type: 'compare',
          operator: 'lt',
          left: series,
          right: { type: 'constant', value: '0' },
        },
        within: 5,
        allowSameBar: false,
        repeat: true,
      },
      cross: {
        type: 'cross',
        direction: 'above',
        left: series,
        right: { type: 'constant', value: '0' },
      },
      all: { type: 'all', conditions: [compare] },
      any: { type: 'any', conditions: [compare] },
      not: { type: 'not', expression: compare },
      positionState: { type: 'positionState', field: 'isOpen' },
      corporateActionEvent: { type: 'corporateActionEvent', eventType: 'CASH_DIVIDEND' },
    };
  if (context === 'numeric')
    return {
      series,
      arithmetic: {
        type: 'arithmetic',
        operator: 'multiply',
        left: series,
        right: { type: 'constant', value: '1.02' },
      },
      absolute: { type: 'absolute', input: series },
      lag: { type: 'lag', periods: 1, input: series },
      rolling: {
        type: 'rolling',
        statistic: 'standardDeviation',
        periods: 20,
        ddof: 0,
        input: series,
      },
      cumulative: { type: 'cumulative', statistic: 'sum', anchorAt: '', input: series },
      countTrue: { type: 'countTrue', periods: 5, condition: compare },
      eventValue: { type: 'eventValue' },
      confirmedPivot: {
        type: 'confirmedPivot',
        side: 'low',
        leftBars: 2,
        rightBars: 2,
        offset: 0,
        input: series,
      },
      constant: { type: 'constant', value: '0' },
      indicator: { type: 'indicator', name: 'MA', input: series, params: { period: 20 } },
      sessionValue: { type: 'sessionValue', sourceId: '', field: 'vwap' },
      positionState: { type: 'positionState', field: 'quantity' },
    };
  return undefined;
}

const text = (key: string, label: string): StrategyEditorField => ({ key, label, kind: 'text' });
const integer = (key: string, label: string): StrategyEditorField => ({
  key,
  label,
  kind: 'integer',
});
const choice = (key: string, label: string, choices: readonly string[]): StrategyEditorField => ({
  key,
  label,
  choices,
  kind: 'choice',
});
const object = (
  key: string,
  label: string,
  context: string,
  optional = false,
): StrategyEditorField => ({ key, label, context, optional, kind: 'object' });
const array = (key: string, label: string, context: string): StrategyEditorField => ({
  key,
  label,
  context,
  kind: 'array',
});
const optional = (field: StrategyEditorField): StrategyEditorField => ({
  ...field,
  optional: true,
});

export function expressionEditorFields(
  context: string,
  row: StrategyDefinitionDraft,
): StrategyEditorField[] | undefined {
  const seriesFields = ['open', 'high', 'low', 'close', 'volume', 'nav'];
  if (context === 'numeric' || context === 'boolean') {
    if (row.type === 'eventValue') return [];
    if (row.type === 'arithmetic')
      return [
        {
          ...choice('operator', '数值运算', [
            'add',
            'subtract',
            'multiply',
            'divide',
            'min',
            'max',
          ]),
          choiceLabels: {
            add: '加法',
            subtract: '减法',
            multiply: '乘法',
            divide: '除法',
            min: '较小值',
            max: '较大值',
          },
        },
        object('left', '左侧数值', 'numeric'),
        object('right', '右侧数值', 'numeric'),
      ];
    if (row.type === 'absolute') return [object('input', '绝对值输入', 'numeric')];
    if (row.type === 'lag')
      return [integer('periods', '向前取样根数'), object('input', '历史输入', 'numeric')];
    if (row.type === 'rolling')
      return [
        choice('statistic', '统计量', ['sum', 'standardDeviation', 'quantile']),
        integer('periods', '含当根观察根数'),
        object('input', '统计输入', 'numeric'),
        ...(row.statistic === 'standardDeviation'
          ? [
              {
                ...integer('ddof', '标准差口径'),
                choices: ['0', '1'],
                choiceLabels: { '0': '总体标准差（N）', '1': '样本标准差（N−1）' },
              },
            ]
          : []),
        ...(row.statistic === 'quantile' ? [text('quantile', '分位水平（0 到 1，线性插值）')] : []),
      ];
    if (row.type === 'cumulative')
      return [
        choice('statistic', '累计统计', ['sum', 'max']),
        text('anchorAt', '累计起点（带时区）'),
        object('input', '累计输入', 'numeric'),
      ];
    if (row.type === 'countTrue' || row.type === 'consecutive')
      return [integer('periods', '含当根观察根数'), object('condition', '逐根条件', 'boolean')];
    if (row.type === 'sequence')
      return [
        object('trigger', '开始条件', 'boolean'),
        object('capture', '开始时冻结取值', 'numeric', true),
        object('confirm', '确认条件', 'boolean'),
        object('invalidation', '失效条件', 'boolean'),
        integer('within', '后续有效根数'),
        { key: 'allowSameBar', label: '允许同根确认', kind: 'boolean' },
        { key: 'repeat', label: '允许重复启动', kind: 'boolean' },
      ];
    if (row.type === 'confirmedPivot')
      return [
        {
          ...choice('side', '摆动方向', ['low', 'high']),
          choiceLabels: { low: '低点', high: '高点' },
        },
        integer('leftBars', '左侧确认根数'),
        integer('rightBars', '右侧确认根数'),
        {
          ...integer('offset', '已确认事件'),
          choices: ['0', '1'],
          choiceLabels: { '0': '最近一个', '1': '上一个' },
        },
        object('input', '摆动点输入', 'numeric'),
        object('sample', '摆动时点取样', 'numeric', true),
      ];
    if (row.type === 'constant') return [text('value', '常量（原始十进制）')];
    if (row.type === 'series')
      return [text('sourceId', '信号来源'), choice('field', '行情字段', seriesFields)];
    if (row.type === 'sessionValue')
      return [
        text('sourceId', '信号来源'),
        choice('field', '会话统计', ['vwap', 'elapsedMinutes']),
      ];
    if (row.type === 'positionState')
      return [
        choice(
          'field',
          '持仓状态',
          context === 'boolean' ? ['isOpen'] : ['quantity', 'averageCost', 'holdingPeriods'],
        ),
      ];
    if (row.type === 'indicator')
      return [
        choice('name', '指标', [
          'MA',
          'EMA',
          'RSI',
          'MACD',
          'ATR',
          'VWAP',
          'Highest',
          'Lowest',
          'ADX',
        ]),
        object('input', '指标输入', 'numeric'),
        object('params', '指标参数', row.name === 'MACD' ? 'macdParams' : 'periodParams'),
        ...(row.name === 'MACD' || row.name === 'ADX' || row.output !== undefined
          ? [
              optional(
                choice(
                  'output',
                  '指标输出',
                  row.name === 'ADX'
                    ? ['adx', 'plusDI', 'minusDI']
                    : ['macd', 'signal', 'histogram'],
                ),
              ),
            ]
          : []),
      ];
    if (row.type === 'all' || row.type === 'any')
      return [array('conditions', row.type === 'all' ? '全部满足' : '任一满足', 'boolean')];
    if (row.type === 'not') return [object('expression', '取反条件', 'boolean')];
    if (row.type === 'corporateActionEvent')
      return [choice('eventType', '权益事件', ['CASH_DIVIDEND', 'SPLIT', 'REVERSE_SPLIT'])];
    if (row.type === 'compare' || row.type === 'cross')
      return [
        object('left', '左侧数值', 'numeric'),
        object('right', '右侧数值', 'numeric'),
        row.type === 'compare'
          ? choice('operator', '比较关系', ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'])
          : choice('direction', '穿越方向', ['above', 'below']),
      ];
    return [];
  }
  return undefined;
}

export const expressionEditorLabels = {
  arithmetic: '数值运算',
  absolute: '绝对值',
  lag: '历史取值',
  rolling: '滚动统计',
  cumulative: '锚定累计',
  countTrue: '条件成立根数',
  consecutive: '连续确认',
  sequence: '事件顺序',
  eventValue: '事件冻结取值',
  confirmedPivot: '已确认摆动点',
  add: '加法',
  subtract: '减法',
  multiply: '乘法',
  divide: '除法',
  min: '较小值',
  max: '较大值',
  sum: '总和',
  standardDeviation: '标准差',
  quantile: '分位数',
  adx: 'ADX 趋势强度',
  plusDI: '正方向 +DI',
  minusDI: '负方向 −DI',
};
