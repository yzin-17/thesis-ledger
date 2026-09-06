import { trailingStopTriggered } from './statistics.js';
import {
  completeRiskEvent,
  formatRiskEventName,
  type CompleteRiskContext,
  type RiskEvent,
  type RiskEventMetric,
  type RiskRule,
  type V01RiskContext,
} from './types.js';

export const evaluateThresholdRule = (
  rule: RiskRule,
  context: {
    value: number;
    reference?: number;
    symbol?: string;
    accountId?: string;
    accountName?: string;
    assetName?: string;
    marketTime: string;
    inputs: Record<string, number>;
    metadata?: Record<string, string | number | boolean>;
  },
): RiskEvent => {
  const lowerIsRisk = ['trailing-stop', 'drawdown', 'ma', 'rsi', 'chip-migration'].includes(
    rule.kind,
  );
  const triggered = lowerIsRisk ? context.value <= rule.threshold : context.value >= rule.threshold;
  return {
    id: `${rule.id}:${context.accountId ?? 'all'}:${context.symbol ?? 'all'}:${context.marketTime}`,
    ruleId: rule.id,
    triggered,
    severity: rule.severity,
    message: `${formatRiskEventName(rule, context)} ${triggered ? '已触发' : '未触发'}`,
    evaluatedAt: new Date().toISOString(),
    context,
  };
};

export const evaluateV01Rule = (rule: RiskRule, context: V01RiskContext): RiskEvent | null => {
  if (context.price === undefined && rule.kind !== 'position-concentration') return null;
  let value: number;
  let triggered: boolean;
  let valueMetric: RiskEventMetric | undefined;
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
      valueMetric = 'distance_to_cost';
      break;
    }
    case 'position-concentration':
      value = rule.accountId
        ? (context.accountWeight ?? context.weight ?? NaN)
        : (context.weight ?? NaN);
      if (!Number.isFinite(value)) return null;
      triggered = value > rule.threshold;
      valueMetric = 'weight';
      break;
    default:
      return null;
  }
  return {
    id: `${rule.id}:${context.accountId ?? 'all'}:${context.symbol}:${context.marketTime}`,
    ruleId: rule.id,
    triggered,
    severity: rule.severity,
    message: `${formatRiskEventName(rule, context)} ${triggered ? '已触发' : '未触发'}`,
    evaluatedAt: new Date().toISOString(),
    context: {
      value,
      reference: rule.threshold,
      ...(context.accountId === undefined ? {} : { accountId: context.accountId }),
      ...(context.accountName === undefined ? {} : { accountName: context.accountName }),
      ...(context.assetName === undefined ? {} : { assetName: context.assetName }),
      ...(context.positionId === undefined ? {} : { positionId: context.positionId }),
      ...(context.quantity === undefined ? {} : { quantity: context.quantity }),
      ...(context.positionUpdatedAt === undefined
        ? {}
        : { positionUpdatedAt: context.positionUpdatedAt }),
      symbol: context.symbol,
      marketTime: context.marketTime,
      inputs: {
        ...(context.price === undefined ? {} : { price: context.price }),
        ...(context.costPrice === undefined ? {} : { costPrice: context.costPrice }),
        ...(context.weight === undefined ? {} : { weight: context.weight }),
        ...(context.accountWeight === undefined ? {} : { accountWeight: context.accountWeight }),
      },
      ...(valueMetric === undefined ? {} : { metadata: { valueMetric } }),
    },
  };
};

export const evaluatePriceRule = (
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

  if (rule.kind !== 'trailing-stop') return null;
  if (context.price === undefined || context.holdingPeak === undefined) return null;
  const result = trailingStopTriggered(
    context.price,
    context.holdingPeak,
    Math.abs(rule.threshold),
  );
  return result
    ? completeRiskEvent(rule, context, result.drawdown, result.triggered, {
        price: context.price,
        holdingPeak: context.holdingPeak,
      })
    : null;
};
