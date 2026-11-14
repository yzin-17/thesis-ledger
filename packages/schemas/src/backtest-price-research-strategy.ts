import {
  strategySchema,
  type BacktestStrategy,
  type Expression,
  type NumericExpression,
  type BooleanExpression,
} from './backtest-strategy.js';

type Coordinate = 'research' | 'actual';

const indicatorZeroThreshold = (left: NumericExpression, right: NumericExpression): boolean => {
  const isZero = (node: NumericExpression) =>
    node.type === 'constant' && /^-?0(?:\.0+)?$/.test(node.value);
  return (
    (left.type === 'indicator' && isZero(right)) || (right.type === 'indicator' && isZero(left))
  );
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
  const series = (node: Extract<NumericExpression, { type: 'series' }>, coordinate: Coordinate) => {
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
    if (node.type === 'series') return series(node, coordinate);
    if (node.type === 'indicator') return { ...node, input: numeric(node.input, coordinate) };
    return { ...node };
  };
  const expression = (node: Expression): Expression => {
    if (node.type === 'all' || node.type === 'any')
      return {
        ...node,
        conditions: node.conditions.map((child) => expression(child) as BooleanExpression),
      };
    if (node.type === 'not')
      return { ...node, expression: expression(node.expression) as BooleanExpression };
    if (node.type === 'compare' || node.type === 'cross') {
      const priceConstant = (value: NumericExpression): boolean => {
        if (value.type === 'indicator') return value.name !== 'RSI' && priceConstant(value.input);
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
  const selected = sources.filter((source) => used.has(source.id));
  return strategySchema.parse({
    ...input,
    schemaVersion: '3',
    entry,
    exit,
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
    strategy.signalSources.map((source) => [source.id, source.priceCoordinate]),
  );
  const numeric = (node: NumericExpression): string => {
    if (node.type === 'constant') return 'constant';
    if (node.type === 'positionState') {
      if (node.field === 'averageCost') return 'research:price';
      return node.field;
    }
    if (node.type === 'series') {
      if (node.field === 'volume') return 'volume';
      return `${coordinates.get(node.sourceId)}:price`;
    }
    if (node.name === 'RSI') return 'ratio';
    return numeric(node.input);
  };
  const visit = (node: Expression, path: (string | number)[]): void => {
    if (node.type === 'all' || node.type === 'any') {
      node.conditions.forEach((child, i) => visit(child, [...path, 'conditions', i]));
    } else if (node.type === 'not') visit(node.expression, [...path, 'expression']);
    else if (node.type === 'corporateActionEvent') {
      issues.push({ path, message: '价格研究不支持权益事件信号，请改用价格条件' });
    } else if (node.type === 'compare' || node.type === 'cross') {
      const left = numeric(node.left),
        right = numeric(node.right);
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
  const describe = (node: Expression): string => {
    if (node.type === 'constant') return node.value;
    if (node.type === 'series')
      return `${sources.get(node.sourceId)?.priceCoordinate === 'actual' ? '实际' : '后复权'}${fields[node.field]}`;
    if (node.type === 'positionState') return position[node.field];
    if (node.type === 'indicator')
      return `${node.name}${node.params.period ?? ''}（${describe(node.input)}）`;
    if (node.type === 'not')
      return node.expression.type === 'positionState' && node.expression.field === 'isOpen'
        ? '未持仓'
        : `未满足（${describe(node.expression)}）`;
    if (node.type === 'all' || node.type === 'any')
      return node.conditions.map(describe).join(node.type === 'all' ? '，且' : '，或');
    if (node.type === 'compare')
      return `${describe(node.left)}${operators[node.operator]}${describe(node.right)}`;
    if (node.type === 'cross')
      return `${describe(node.left)}${node.direction === 'above' ? '上穿' : '下穿'}${describe(node.right)}`;
    return '权益事件条件';
  };
  let sizing = '按研究权益配置投入';
  if (strategy.sizing.type === 'fixedQuantity')
    sizing = `以 ${strategy.sizing.quantity} ${strategy.executionInstrument.assetType === 'stock' ? '股' : '份'}的操作时点原价确定投入金额`;
  else if (strategy.sizing.type === 'fixedAmount') sizing = `固定投入 ${strategy.sizing.amount}`;
  return { entry: describe(strategy.entry), exit: describe(strategy.exit), sizing };
}
