export type Severity = 'info' | 'warning' | 'error' | 'critical';
export type RuleScope = 'security' | 'account' | 'portfolio';
export type RuleKind =
  | 'fixed-stop'
  | 'cost-stop'
  | 'take-profit'
  | 'price-above'
  | 'price-below'
  | 'position-concentration'
  | 'trailing-stop'
  | 'drawdown'
  | 'ma'
  | 'rsi'
  | 'macd'
  | 'atr'
  | 'volume'
  | 'chip-peak'
  | 'chip-ratio'
  | 'chip-migration'
  | 'sector-concentration'
  | 'asset-concentration'
  | 'volatility-exposure'
  | 'correlation';

export interface RiskRule {
  id: string;
  version: number;
  kind: RuleKind;
  scope: RuleScope;
  severity: Severity;
  threshold: number;
  enabled: boolean;
  symbol?: string;
  accountId?: string;
  parameters?: Record<string, unknown>;
}

export interface RiskEvaluationContext {
  value: number;
  reference?: number;
  symbol?: string;
  accountId?: string;
  marketTime: string;
  inputs: Record<string, number>;
  metadata?: Record<string, string | number | boolean>;
}

export interface RiskEvent {
  id: string;
  ruleId: string;
  triggered: boolean;
  severity: Severity;
  message: string;
  evaluatedAt: string;
  context: RiskEvaluationContext;
}

export const evaluateThresholdRule = (
  rule: RiskRule,
  context: RiskEvaluationContext,
): RiskEvent => {
  const lowerIsRisk = ['trailing-stop', 'drawdown', 'ma', 'rsi', 'chip-migration'].includes(
    rule.kind,
  );
  const triggered = lowerIsRisk ? context.value <= rule.threshold : context.value >= rule.threshold;
  return {
    id: `${rule.id}:${context.marketTime}`,
    ruleId: rule.id,
    triggered,
    severity: rule.severity,
    message: triggered ? `${rule.kind} 已触发` : `${rule.kind} 未触发`,
    evaluatedAt: new Date().toISOString(),
    context,
  };
};

export interface V01RiskContext {
  symbol: string;
  price?: number;
  costPrice?: number;
  weight?: number;
  marketTime: string;
}

export interface CompleteRiskContext extends V01RiskContext {
  holdingPeak?: number;
  portfolioValues?: readonly number[];
  indicators?: Readonly<Record<string, number>>;
  chip?: {
    mainPeak?: number;
    profitRatio: number;
    concentration: number;
    previousMainPeaks?: readonly number[];
    engineVersion: string;
    calculatedAt: string;
  };
  positions?: readonly {
    symbol: string;
    weight: number;
    sector?: string;
    assetType?: string;
    volatility?: number;
  }[];
  returns?: Readonly<Record<string, readonly number[]>>;
  dataQuality?: Readonly<Record<string, string>>;
}

const parameter = (rule: RiskRule, name: string, fallback: number) => {
  const value = rule.parameters?.[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const direction = (rule: RiskRule, fallback: 'above' | 'below') => {
  const value = rule.parameters?.direction;
  return value === 'above' || value === 'below' ? value : fallback;
};

const completeEvent = (
  rule: RiskRule,
  context: CompleteRiskContext,
  value: number,
  triggered: boolean,
  inputs: Record<string, number>,
  metadata?: Record<string, string | number | boolean>,
): RiskEvent => ({
  id: `${rule.id}:${context.symbol}:${context.marketTime}`,
  ruleId: rule.id,
  triggered,
  severity: rule.severity,
  message: triggered ? `${rule.kind} 已触发` : `${rule.kind} 未触发`,
  evaluatedAt: new Date().toISOString(),
  context: {
    value,
    reference: rule.threshold,
    symbol: context.symbol,
    marketTime: context.marketTime,
    inputs,
    ...(metadata === undefined ? {} : { metadata }),
  },
});

export const evaluateCompleteRule = (
  rule: RiskRule,
  context: CompleteRiskContext,
): RiskEvent | null => {
  if (
    [
      'fixed-stop',
      'cost-stop',
      'take-profit',
      'price-above',
      'price-below',
      'position-concentration',
    ].includes(rule.kind)
  )
    return evaluateV01Rule(rule, context);

  if (rule.kind === 'trailing-stop') {
    if (context.price === undefined || context.holdingPeak === undefined) return null;
    const result = trailingStopTriggered(
      context.price,
      context.holdingPeak,
      Math.abs(rule.threshold),
    );
    return result
      ? completeEvent(rule, context, result.drawdown, result.triggered, {
          price: context.price,
          holdingPeak: context.holdingPeak,
        })
      : null;
  }
  if (rule.kind === 'drawdown') {
    const value = currentDrawdown(context.portfolioValues ?? []);
    return value === null
      ? null
      : completeEvent(rule, context, value, value < -Math.abs(rule.threshold), {
          observations: context.portfolioValues?.length ?? 0,
        });
  }
  if (rule.kind === 'ma') {
    const price = context.price;
    const ma = context.indicators?.ma;
    if (price === undefined || ma === undefined) return null;
    const targetDirection = direction(rule, 'below');
    const previousPrice = context.indicators?.previousPrice;
    const previousMa = context.indicators?.previousMa;
    const triggered =
      previousPrice === undefined || previousMa === undefined
        ? targetDirection === 'above'
          ? price > ma
          : price < ma
        : crossed(previousPrice, previousMa, price, ma, targetDirection);
    return completeEvent(
      rule,
      context,
      price - ma,
      triggered,
      { price, ma },
      { direction: targetDirection },
    );
  }
  if (rule.kind === 'rsi') {
    const value = context.indicators?.rsi;
    if (value === undefined) return null;
    const targetDirection = direction(rule, 'below');
    return completeEvent(
      rule,
      context,
      value,
      targetDirection === 'above' ? value > rule.threshold : value < rule.threshold,
      { rsi: value },
    );
  }
  if (rule.kind === 'macd') {
    const dif = context.indicators?.dif;
    const dea = context.indicators?.dea;
    if (dif === undefined || dea === undefined) return null;
    const targetDirection = direction(rule, 'below');
    const previousDif = context.indicators?.previousDif;
    const previousDea = context.indicators?.previousDea;
    const triggered =
      previousDif === undefined || previousDea === undefined
        ? targetDirection === 'above'
          ? dif > dea
          : dif < dea
        : crossed(previousDif, previousDea, dif, dea, targetDirection);
    return completeEvent(
      rule,
      context,
      dif - dea,
      triggered,
      { dif, dea },
      { direction: targetDirection },
    );
  }
  if (rule.kind === 'atr') {
    const result = ratioThreshold(context.indicators?.atr, context.price, rule.threshold);
    return result === null
      ? null
      : completeEvent(rule, context, result.ratio, result.triggered, {
          atr: context.indicators!.atr!,
          price: context.price!,
        });
  }
  if (rule.kind === 'volume') {
    const result = ratioThreshold(
      context.indicators?.volume,
      context.indicators?.averageVolume,
      rule.threshold,
    );
    return result === null
      ? null
      : completeEvent(rule, context, result.ratio, result.triggered, {
          volume: context.indicators!.volume!,
          averageVolume: context.indicators!.averageVolume!,
        });
  }
  if (rule.kind === 'chip-peak') {
    if (
      context.price === undefined ||
      context.chip === undefined ||
      context.chip.mainPeak === undefined
    )
      return null;
    const value = context.price / context.chip.mainPeak - 1;
    const targetDirection = direction(rule, 'below');
    const triggered =
      targetDirection === 'above'
        ? value > Math.abs(rule.threshold)
        : value < -Math.abs(rule.threshold);
    return completeEvent(
      rule,
      context,
      value,
      triggered,
      { price: context.price, mainPeak: context.chip.mainPeak },
      {
        direction: targetDirection,
        chipEngineVersion: context.chip.engineVersion,
        chipCalculatedAt: context.chip.calculatedAt,
      },
    );
  }
  if (rule.kind === 'chip-ratio') {
    if (context.chip === undefined) return null;
    if (context.chip.calculatedAt.slice(0, 10) !== context.marketTime.slice(0, 10)) return null;
    const metric = rule.parameters?.metric === 'concentration' ? 'concentration' : 'profitRatio';
    const value = context.chip[metric];
    return completeEvent(
      rule,
      context,
      value,
      value > rule.threshold,
      { [metric]: value },
      {
        metric,
        chipEngineVersion: context.chip.engineVersion,
        chipCalculatedAt: context.chip.calculatedAt,
      },
    );
  }
  if (rule.kind === 'chip-migration') {
    const history = context.chip?.previousMainPeaks;
    if (!context.chip || context.chip.mainPeak === undefined || !history?.length) return null;
    const previousPeak = history.at(-1)!;
    if (previousPeak <= 0) return null;
    const value = context.chip.mainPeak / previousPeak - 1;
    const targetDirection = direction(rule, 'below');
    const triggered =
      targetDirection === 'above'
        ? value > Math.abs(rule.threshold)
        : value < -Math.abs(rule.threshold);
    return completeEvent(
      rule,
      context,
      value,
      triggered,
      { previousPeak, mainPeak: context.chip.mainPeak },
      {
        direction: targetDirection,
        chipEngineVersion: context.chip.engineVersion,
        chipCalculatedAt: context.chip.calculatedAt,
      },
    );
  }
  if (rule.kind === 'sector-concentration' || rule.kind === 'asset-concentration') {
    if (!context.positions?.length) return null;
    const key = rule.kind === 'sector-concentration' ? 'sector' : 'assetType';
    const result = concentratedExposure(
      context.positions.map((position) => ({
        symbol: position.symbol,
        ...(position[key] === undefined ? {} : { key: position[key] }),
        weight: position.weight,
      })),
      rule.threshold,
    );
    const top = result.exposures[0];
    return top
      ? completeEvent(
          rule,
          context,
          top.weight,
          top.triggered,
          { coverage: result.coverage, missingCount: result.missingCount },
          { topGroup: top.key, missingSymbols: result.missingSymbols.join(',') },
        )
      : null;
  }
  if (rule.kind === 'volatility-exposure') {
    if (!context.positions?.length) return null;
    const assetThreshold = parameter(rule, 'assetThreshold', 0.3);
    const known = context.positions.filter((position) => position.volatility !== undefined);
    if (!known.length) return null;
    const value = known.reduce(
      (sum, position) => sum + (position.volatility! > assetThreshold ? position.weight : 0),
      0,
    );
    return completeEvent(rule, context, value, value > rule.threshold, {
      assetThreshold,
      coverage: known.reduce((sum, position) => sum + position.weight, 0),
    });
  }
  if (rule.kind === 'correlation') {
    const entries = Object.entries(context.returns ?? {});
    if (entries.length < 2) return null;
    let maximum: number | null = null;
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const correlation = pearsonCorrelation(entries[left]![1], entries[right]![1]);
        if (correlation !== null && (maximum === null || correlation > maximum))
          maximum = correlation;
      }
    }
    return maximum === null
      ? null
      : completeEvent(rule, context, maximum, maximum > rule.threshold, {
          seriesCount: entries.length,
        });
  }
  return null;
};

export const evaluateV01Rule = (rule: RiskRule, context: V01RiskContext): RiskEvent | null => {
  if (context.price === undefined && rule.kind !== 'position-concentration') return null;
  let value: number;
  let triggered: boolean;
  switch (rule.kind) {
    case 'fixed-stop':
    case 'price-below':
      value = context.price!;
      triggered = value < rule.threshold;
      break;
    case 'price-above':
      value = context.price!;
      triggered = value > rule.threshold;
      break;
    case 'cost-stop':
    case 'take-profit': {
      if (context.costPrice === undefined || context.costPrice <= 0) return null;
      value = context.price! / context.costPrice - 1;
      triggered =
        rule.kind === 'cost-stop' ? value < -Math.abs(rule.threshold) : value > rule.threshold;
      break;
    }
    case 'position-concentration':
      if (context.weight === undefined) return null;
      value = context.weight;
      triggered = value > rule.threshold;
      break;
    default:
      return null;
  }
  return {
    id: `${rule.id}:${context.symbol}:${context.marketTime}`,
    ruleId: rule.id,
    triggered,
    severity: rule.severity,
    message: triggered ? `${rule.kind} 已触发` : `${rule.kind} 未触发`,
    evaluatedAt: new Date().toISOString(),
    context: {
      value,
      reference: rule.threshold,
      symbol: context.symbol,
      marketTime: context.marketTime,
      inputs: {
        ...(context.price === undefined ? {} : { price: context.price }),
        ...(context.costPrice === undefined ? {} : { costPrice: context.costPrice }),
        ...(context.weight === undefined ? {} : { weight: context.weight }),
      },
    },
  };
};

export const currentDrawdown = (values: readonly number[]) => {
  if (values.length === 0) return null;
  const peak = Math.max(...values);
  const current = values.at(-1)!;
  return peak <= 0 ? null : current / peak - 1;
};

export const trailingStopTriggered = (price: number, holdingPeak: number, threshold: number) => {
  if (holdingPeak <= 0 || threshold < 0) return null;
  return { drawdown: price / holdingPeak - 1, triggered: price / holdingPeak - 1 < -threshold };
};

export const crossed = (
  previousLeft: number,
  previousRight: number,
  currentLeft: number,
  currentRight: number,
  direction: 'above' | 'below',
) =>
  direction === 'above'
    ? previousLeft <= previousRight && currentLeft > currentRight
    : previousLeft >= previousRight && currentLeft < currentRight;

export const ratioThreshold = (
  numerator: number | undefined,
  denominator: number | undefined,
  threshold: number,
) => {
  if (numerator === undefined || denominator === undefined || denominator <= 0) return null;
  const ratio = numerator / denominator;
  return { ratio, triggered: ratio > threshold };
};

export const concentratedExposure = (
  positions: readonly { symbol?: string; key?: string; weight: number }[],
  threshold: number,
) => {
  const known = positions.filter((position) => position.key);
  const coverage = positions.reduce(
    (sum, position) => sum + (position.key ? position.weight : 0),
    0,
  );
  const grouped = known.reduce<Record<string, number>>((result, position) => {
    result[position.key!] = (result[position.key!] ?? 0) + position.weight;
    return result;
  }, {});
  const exposures = Object.entries(grouped)
    .map(([key, weight]) => ({ key, weight, triggered: weight > threshold }))
    .sort((left, right) => right.weight - left.weight);
  return {
    coverage,
    missingCount: positions.length - known.length,
    missingSymbols: positions
      .filter((position) => !position.key)
      .map((position) => position.symbol ?? 'unknown'),
    exposures,
  };
};

export const pearsonCorrelation = (left: readonly number[], right: readonly number[]) => {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index]! - leftMean;
    const rightDelta = right[index]! - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  if (leftVariance === 0 || rightVariance === 0) return null;
  return covariance / Math.sqrt(leftVariance * rightVariance);
};
