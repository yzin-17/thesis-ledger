import {
  strategySchema,
  type BacktestStrategy,
  type Expression,
  type NumericExpression,
  type BooleanExpression,
} from './backtest-strategy.js';
import { tradePlanProtectionRules } from './backtest-trade-plan.js';
import { numericOperationAnalysis } from './backtest-numeric-unit-validation.js';

type Coordinate = 'research' | 'actual';

const indicatorZeroThreshold = (left: NumericExpression, right: NumericExpression): boolean => {
  const zero = (node: NumericExpression) =>
    node.type === 'constant' && /^-?0(?:\.0+)?$/.test(node.value);
  const homogeneous = (node: NumericExpression): boolean => {
    if (node.type === 'constant') return zero(node);
    if (node.type === 'arithmetic') {
      if (node.operator === 'multiply')
        return (
          (node.left.type === 'constant' && homogeneous(node.right)) ||
          (node.right.type === 'constant' && homogeneous(node.left))
        );
      if (node.operator === 'divide')
        return node.right.type === 'constant' && homogeneous(node.left);
      return homogeneous(node.left) && homogeneous(node.right);
    }
    if ('input' in node) return homogeneous(node.input);
    return node.type === 'series';
  };
  const derived = (node: NumericExpression) => node.type !== 'series' && homogeneous(node);
  return (derived(left) && zero(right)) || (derived(right) && zero(left));
};

/** Explicit projection for the version preview; callers save it as a new immutable version. */
export function projectPriceResearchStrategy(input: BacktestStrategy): BacktestStrategy {
  const ids = new Set(input.signalSources.map((source) => source.id));
  const coordinateIds = new Map<string, string>();
  const used = new Set<string>();
  const sources = input.signalSources.map((source) => ({
    ...source,
    priceCoordinate: source.priceCoordinate ?? 'research',
  }));
  const series = <T extends Extract<NumericExpression, { type: 'series' | 'sessionValue' }>>(
    node: T,
    coordinate: Coordinate,
  ): T => {
    const source = sources.find((candidate) => candidate.id === node.sourceId);
    if (!source) throw new Error(`未知价格来源: ${node.sourceId}`);
    if (source.priceCoordinate === coordinate) {
      used.add(node.sourceId);
      return { ...node };
    }
    const key = `${node.sourceId}:${coordinate}`;
    let id = coordinateIds.get(key);
    if (!id) {
      id = `${node.sourceId}:${coordinate}`;
      while (ids.has(id)) id += `:${coordinate}`;
      ids.add(id);
      coordinateIds.set(key, id);
      sources.push({ ...source, id, priceCoordinate: coordinate });
    }
    used.add(id);
    return { ...node, sourceId: id };
  };
  const numeric = (node: NumericExpression, coordinate: Coordinate): NumericExpression => {
    if (node.type === 'confirmedPivot')
      return {
        ...node,
        input: numeric(node.input, coordinate),
        ...(node.sample ? { sample: numeric(node.sample, coordinate) } : {}),
      };
    if (node.type === 'countTrue')
      return { ...node, condition: expression(node.condition) as BooleanExpression };
    if (node.type === 'rolling' || node.type === 'cumulative')
      return { ...node, input: numeric(node.input, coordinate) };
    if (node.type === 'series' || node.type === 'sessionValue') return series(node, coordinate);
    if (node.type === 'arithmetic')
      return {
        ...node,
        left: numeric(node.left, coordinate),
        right: numeric(node.right, coordinate),
      };
    if (node.type === 'lag' || node.type === 'absolute')
      return { ...node, input: numeric(node.input, coordinate) };
    if (node.type === 'indicator') return { ...node, input: numeric(node.input, coordinate) };
    return { ...node };
  };
  const expression = (node: Expression): Expression => {
    if (node.type === 'sequence')
      return {
        ...node,
        trigger: expression(node.trigger) as BooleanExpression,
        confirm: expression(node.confirm) as BooleanExpression,
        invalidation: expression(node.invalidation) as BooleanExpression,
        ...(node.capture ? { capture: numeric(node.capture, 'research') } : {}),
      };
    if (node.type === 'consecutive')
      return { ...node, condition: expression(node.condition) as BooleanExpression };
    if (node.type === 'all' || node.type === 'any')
      return {
        ...node,
        conditions: node.conditions.map((child) => expression(child) as BooleanExpression),
      };
    if (node.type === 'not')
      return { ...node, expression: expression(node.expression) as BooleanExpression };
    if (node.type === 'compare' || node.type === 'cross') {
      const priceConstant = (value: NumericExpression): boolean => {
        if (value.type === 'confirmedPivot') return priceConstant(value.sample ?? value.input);
        if (value.type === 'rolling' || value.type === 'cumulative')
          return priceConstant(value.input);
        if (value.type === 'lag' || value.type === 'absolute') return priceConstant(value.input);
        if (value.type === 'arithmetic')
          return numericOperationAnalysis(value, input.signalSources).unit.endsWith(':price');
        if (value.type === 'sessionValue') return value.field === 'vwap';
        if (value.type === 'indicator')
          return value.name !== 'RSI' && value.name !== 'ADX' && priceConstant(value.input);
        return (
          value.type === 'series' && ['open', 'high', 'low', 'close', 'nav'].includes(value.field)
        );
      };
      const actual =
        !indicatorZeroThreshold(node.left, node.right) &&
        ((node.left.type === 'constant' && priceConstant(node.right)) ||
          (node.right.type === 'constant' && priceConstant(node.left)));
      const coordinate = actual ? 'actual' : 'research';
      return {
        ...node,
        left: numeric(node.left, coordinate),
        right: numeric(node.right, coordinate),
      };
    }
    return { ...node };
  };
  const entry = expression(input.entry);
  const exit = expression(input.exit);
  const tradePlan = input.tradePlan ? structuredClone(input.tradePlan) : undefined;
  for (const { key, expression: condition } of tradePlanProtectionRules(tradePlan)) {
    const rule = tradePlan![key]!;
    const converted = expression(condition) as BooleanExpression;
    if (rule.activation?.kind === 'condition') rule.activation.condition = converted;
  }
  if (input.tradePlan?.initialStop?.kind === 'entryAtr')
    used.add(input.tradePlan.initialStop.sourceId);
  if (input.tradePlan?.trailing && 'sourceId' in input.tradePlan.trailing)
    used.add(input.tradePlan.trailing.sourceId);
  const execution =
    input.execution.timing === 'dailyBarOrders'
      ? {
          ...input.execution,
          orders: input.execution.orders.map((template) => ({
            ...template,
            order:
              template.order.kind === 'market'
                ? template.order
                : { ...template.order, price: numeric(template.order.price, 'research') },
          })),
        }
      : input.execution;
  const selected = sources.filter((source) => used.has(source.id));
  return strategySchema.parse({
    ...input,
    schemaVersion: 'strategy-definition-v1',
    entry,
    exit,
    execution,
    ...(tradePlan ? { tradePlan } : {}),
    signalSources: selected.length ? selected : sources.slice(0, 1),
  }) as BacktestStrategy;
}

export const priceResearchNeedsActualPrice = (strategy: BacktestStrategy): boolean =>
  strategy.sizing.type === 'fixedQuantity' ||
  strategy.signalSources.some((source) => source.priceCoordinate === 'actual');

export interface PriceResearchRuleIssue {
  path: (string | number)[];
  message: string;
}

/** Unit checks for this protocol; no price conversion is inferred from a paired observation. */
export function priceResearchStrategyIssues(strategy: BacktestStrategy): PriceResearchRuleIssue[] {
  const issues: PriceResearchRuleIssue[] = [];
  const coordinates = new Map(
    strategy.signalSources.map((source) => [
      source.id,
      source.priceCoordinate === 'run' ? 'research' : source.priceCoordinate,
    ]),
  );
  const numeric = (node: NumericExpression, capturedUnit = 'constant'): string => {
    if (node.type === 'confirmedPivot') return numeric(node.sample ?? node.input, capturedUnit);
    if (node.type === 'eventValue') return capturedUnit;
    if (node.type === 'countTrue') return 'periods';
    if (node.type === 'rolling' || node.type === 'cumulative')
      return numeric(node.input, capturedUnit);
    if (node.type === 'lag' || node.type === 'absolute') return numeric(node.input, capturedUnit);
    if (node.type === 'arithmetic') {
      const left = numeric(node.left, capturedUnit),
        right = numeric(node.right, capturedUnit);
      if (node.operator === 'divide' && left === right) return 'ratio';
      if (left === 'constant' || left === 'ratio') return right;
      return left;
    }
    if (node.type === 'constant') return 'constant';
    if (node.type === 'sessionValue')
      return node.field === 'vwap' ? `${coordinates.get(node.sourceId)}:price` : 'minutes';
    if (node.type === 'positionState') {
      if (node.field === 'averageCost') return 'research:price';
      return node.field;
    }
    if (node.type === 'series') {
      if (node.field === 'volume') return 'volume';
      return `${coordinates.get(node.sourceId)}:price`;
    }
    if (node.name === 'RSI' || node.name === 'ADX') return 'ratio';
    return numeric(node.input, capturedUnit);
  };
  const visit = (node: Expression, path: (string | number)[], capturedUnit = 'constant'): void => {
    if (node.type === 'sequence') {
      visit(node.trigger, [...path, 'trigger']);
      visit(node.confirm, [...path, 'confirm'], node.capture ? numeric(node.capture) : 'constant');
      visit(
        node.invalidation,
        [...path, 'invalidation'],
        node.capture ? numeric(node.capture) : 'constant',
      );
      return;
    }
    if (node.type === 'consecutive')
      return visit(node.condition, [...path, 'condition'], capturedUnit);
    if (node.type === 'all' || node.type === 'any') {
      node.conditions.forEach((child, i) => visit(child, [...path, 'conditions', i], capturedUnit));
    } else if (node.type === 'not') visit(node.expression, [...path, 'expression'], capturedUnit);
    else if (node.type === 'corporateActionEvent') {
      issues.push({ path, message: '价格研究不支持权益事件信号，请改用价格条件' });
    } else if (node.type === 'compare' || node.type === 'cross') {
      const left = numeric(node.left, capturedUnit),
        right = numeric(node.right, capturedUnit);
      if (
        (left.endsWith(':price') && right.endsWith(':price') && left !== right) ||
        (!indicatorZeroThreshold(node.left, node.right) &&
          ((left === 'constant' && right === 'research:price') ||
            (right === 'constant' && left === 'research:price')))
      ) {
        issues.push({
          path,
          message: '此条件混用了实际价格与后复权价格，请选择同一价格口径或拆成独立条件',
        });
      }
    }
  };
  visit(strategy.entry, ['entry']);
  visit(strategy.exit, ['exit']);
  for (const { expression, path } of tradePlanProtectionRules(strategy.tradePlan))
    visit(expression, path);
  if (strategy.execution.timing === 'dailyBarOrders')
    strategy.execution.orders.forEach((template, index) => {
      if (template.order.kind === 'market') return;
      const unit = numeric(template.order.price);
      if (!['constant', 'research:price', 'run:price'].includes(unit))
        issues.push({
          path: ['execution', 'orders', index, 'order', 'price'],
          message: '委托价格必须采用本次研究执行价格坐标',
        });
    });
  return issues;
}

export function priceResearchStrategySummary(strategy: BacktestStrategy) {
  const sources = new Map(strategy.signalSources.map((source) => [source.id, source]));
  const fields = {
    open: '开盘价',
    high: '最高价',
    low: '最低价',
    close: '收盘价',
    volume: '成交量',
    nav: '净值',
  };
  const operators = {
    eq: '等于',
    neq: '不等于',
    gt: '高于',
    gte: '不低于',
    lt: '低于',
    lte: '不高于',
  };
  const position = {
    isOpen: '已持仓',
    quantity: '研究单位',
    averageCost: '研究持仓成本',
    holdingPeriods: '持有期数',
  };
  const sourceLabel = (id: string) => {
    const source = sources.get(id);
    let coordinate = '本次运行';
    if (source?.priceCoordinate === 'actual') coordinate = '实际';
    else if (source?.priceCoordinate === 'research') coordinate = '后复权';
    else if (source?.priceCoordinate === 'native-nav') coordinate = '发布单位';
    return `${coordinate}（来源 ${id}：${source?.asset.symbol ?? '未知标的'}／${source?.timeframe ?? '未知周期'}）的`;
  };
  const describeSession = (node: Extract<Expression, { type: 'sessionValue' }>): string => {
    if (node.field === 'elapsedMinutes')
      return `${sourceLabel(node.sourceId)}距当日首个开市分钟数（午休不重置）`;
    return `${sourceLabel(node.sourceId)}当日累计均价（收盘价乘成交量）`;
  };
  const describe = (node: Expression): string => {
    if (node.type === 'confirmedPivot')
      return `第 ${node.offset + 1} 个最近已确认摆动${node.side === 'low' ? '低' : '高'}点（左 ${node.leftBars} 根、右 ${node.rightBars} 根；右侧完成后可用；${describe(node.input)}${node.sample ? `；取摆动点当时的 ${describe(node.sample)}` : ''}）`;
    if (node.type === 'eventValue') return '事件触发时冻结的值';
    if (node.type === 'sequence')
      return `先满足（${describe(node.trigger)}），随后 ${node.within} 根内满足（${describe(node.confirm)}）；${node.allowSameBar ? '允许' : '不允许'}同根确认，失效条件（${describe(node.invalidation)}），${node.repeat ? '可重复启动' : '只确认一次'}${node.capture ? `；触发时冻结（${describe(node.capture)}）` : ''}`;
    if (node.type === 'consecutive')
      return `含当前根连续 ${node.periods} 根均满足（${describe(node.condition)}）`;
    if (node.type === 'countTrue')
      return `含当前根最近 ${node.periods} 根中满足（${describe(node.condition)}）的根数`;
    if (node.type === 'cumulative')
      return `自 ${new Date(node.anchorAt).toLocaleString('zh-CN', { timeZone: 'UTC', hour12: false })}（UTC）起累计${node.statistic === 'sum' ? '求和' : '最高值'}（${describe(node.input)}）`;
    if (node.type === 'rolling') {
      let statistic = '总和';
      if (node.statistic === 'standardDeviation') statistic = `标准差（自由度 ${node.ddof}）`;
      if (node.statistic === 'quantile') statistic = `${node.quantile} 分位数（线性插值）`;
      return `含当前根最近 ${node.periods} 根的${statistic}（${describe(node.input)}）`;
    }
    if (node.type === 'lag')
      return `此前 ${node.periods} 根来源观测的（${describe(node.input)}；排除当前 ${node.periods} 根）`;
    if (node.type === 'absolute') return `绝对值（${describe(node.input)}）`;
    if (node.type === 'arithmetic')
      return `（${describe(node.left)}）${{ add: '加', subtract: '减', multiply: '乘以', divide: '除以', min: '与其取较小值', max: '与其取较大值' }[node.operator]}（${describe(node.right)}）`;
    if (node.type === 'constant') return node.value;
    if (node.type === 'sessionValue') return describeSession(node);
    if (node.type === 'series') return `${sourceLabel(node.sourceId)}${fields[node.field]}`;
    if (node.type === 'positionState') return position[node.field];
    if (node.type === 'indicator') {
      if (node.name === 'MACD') {
        const output = node.output ?? 'macd';
        return `MACD${{ macd: '主线', signal: '信号线', histogram: '柱线', adx: '', plusDI: '', minusDI: '' }[output]}（快周期 ${node.params.fastPeriod}、慢周期 ${node.params.slowPeriod}、信号周期 ${node.params.signalPeriod}；${describe(node.input)}）`;
      }
      if (node.name === 'ADX')
        return `ADX${{ adx: '趋势强度', plusDI: '正方向 +DI', minusDI: '负方向 −DI', macd: '', signal: '', histogram: '' }[node.output ?? 'adx']}（周期 ${node.params.period}；Wilder 平滑；${describe(node.input)}）`;
      return `${node.name === 'VWAP' ? '滚动成交量加权均价 VWAP' : node.name}${node.params.period ?? ''}（${describe(node.input)}）`;
    }
    if (node.type === 'not')
      return node.expression.type === 'positionState' && node.expression.field === 'isOpen'
        ? '未持仓'
        : `未满足（${describe(node.expression)}）`;
    if (node.type === 'all' || node.type === 'any')
      return node.conditions
        .map((condition) => `（${describe(condition)}）`)
        .join(node.type === 'all' ? '，且' : '，或');
    if (node.type === 'compare')
      return `${describe(node.left)}${operators[node.operator]}${describe(node.right)}`;
    if (node.type === 'cross')
      return `${describe(node.left)}${node.direction === 'above' ? '上穿' : '下穿'}${describe(node.right)}`;
    return `权益事件 ${node.eventType}`;
  };
  let sizing = '按研究权益配置投入';
  if (strategy.tradePlan?.volatilityTarget)
    sizing = '每日收盘按目标波动率主动增减仓，替代普通投入；公式与限制见交易计划';
  else if (strategy.tradePlan?.monthlyRebalance)
    sizing = '最后交易日收盘按目标仓位与偏离阈值调仓，替代普通投入；规则见交易计划';
  else if (strategy.sizing.type === 'fixedQuantity' && strategy.execution.mode === 'nav')
    sizing = `申购实际基金份额 ${strategy.sizing.quantity} 份`;
  else if (strategy.sizing.type === 'fixedQuantity')
    sizing = `以 ${strategy.sizing.quantity} ${strategy.executionInstrument.assetType === 'stock' ? '股' : '份'}的操作时点原价确定投入金额`;
  else if (strategy.sizing.type === 'fixedAmount') sizing = `固定投入 ${strategy.sizing.amount}`;
  else if (strategy.sizing.type === 'percentOfEquity')
    sizing = `按权益比例 ${strategy.sizing.percent} 投入（1 = 100%）`;
  else if (strategy.sizing.type === 'targetWeight')
    sizing = `目标权益仓位比例 ${strategy.sizing.weight}（1 = 100%）`;
  return {
    entry: describe(strategy.entry),
    exit: describe(strategy.exit),
    sizing,
    ...(strategy.tradePlan ? { tradePlan: strategy.tradePlan } : {}),
  };
}
