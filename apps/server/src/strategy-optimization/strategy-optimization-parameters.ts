import { BadRequestException } from '@nestjs/common';
import { DecimalValue } from '@thesis-ledger/domain';
import {
  strategySchemaV2,
  type OptimizationProposal,
  type StrategyParameterDescriptor,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';

const decimalDescriptor = (
  input: Omit<StrategyParameterDescriptor, 'valueType' | 'schemaRange' | 'optimizationRange'> & {
    schemaRange?: { min: string; max: string };
    optimizationRange?: { min: string; max: string; step?: string };
  },
): StrategyParameterDescriptor => ({ ...input, valueType: 'decimal' });

export const describeStrategyParameters = (strategy: StrategySchemaV2): StrategyParameterDescriptor[] => {
  const descriptors: StrategyParameterDescriptor[] = [];
  strategy.risk.forEach((rule, index) => {
    if (rule.type === 'fixedStop' || rule.type === 'fixedTakeProfit') {
      descriptors.push(
        decimalDescriptor({
          parameterId: `risk.${index}.percent`,
          label: rule.type === 'fixedStop' ? '成本止损比例' : '成本止盈比例',
          unit: 'ratio',
          currentValue: rule.percent,
          target: { kind: 'risk', index, field: 'percent' },
          schemaRange: { min: '0.000001', max: '1' },
          optimizationRange: {
            min: rule.type === 'fixedStop' ? '0.01' : '0.02',
            max: rule.type === 'fixedStop' ? '0.3' : '1',
            step: '0.005',
          },
        }),
      );
    } else if (rule.type === 'maxHoldingPeriod') {
      descriptors.push({
        parameterId: `risk.${index}.periods`,
        label: '最大持有周期',
        valueType: 'integer',
        unit: 'periods',
        currentValue: rule.periods,
        target: { kind: 'risk', index, field: 'periods' },
        schemaRange: { min: 1, max: 10_000 },
        optimizationRange: { min: 1, max: Math.max(rule.periods * 3, 30), step: 1 },
      });
    }
  });

  if (strategy.sizing.type === 'fixedAmount') {
    descriptors.push(
      decimalDescriptor({
        parameterId: 'sizing.amount',
        label: '固定投入金额',
        unit: 'amount',
        currentValue: strategy.sizing.amount,
        target: { kind: 'sizing', field: 'amount' },
        schemaRange: { min: '0.000001', max: '999999999999' },
      }),
    );
  } else if (strategy.sizing.type === 'percentOfEquity') {
    descriptors.push(
      decimalDescriptor({
        parameterId: 'sizing.percent',
        label: '权益投入比例',
        unit: 'ratio',
        currentValue: strategy.sizing.percent,
        target: { kind: 'sizing', field: 'percent' },
        schemaRange: { min: '0.000001', max: '1' },
        optimizationRange: { min: '0.05', max: '1', step: '0.05' },
      }),
    );
  } else if (strategy.sizing.type === 'fixedQuantity') {
    descriptors.push(
      decimalDescriptor({
        parameterId: 'sizing.quantity',
        label: '固定数量',
        unit: 'quantity',
        currentValue: strategy.sizing.quantity,
        target: { kind: 'sizing', field: 'quantity' },
        schemaRange: { min: '0.000001', max: '999999999999' },
      }),
    );
  } else if (strategy.sizing.type === 'targetWeight') {
    descriptors.push(
      decimalDescriptor({
        parameterId: 'sizing.weight',
        label: '目标权重',
        unit: 'ratio',
        currentValue: strategy.sizing.weight,
        target: { kind: 'sizing', field: 'weight' },
        schemaRange: { min: '0.000001', max: '1' },
        optimizationRange: { min: '0.05', max: '1', step: '0.05' },
      }),
    );
  }

  descriptors.push(
    decimalDescriptor({
      parameterId: 'cost.commissionRate',
      label: '佣金比例',
      unit: 'ratio',
      currentValue: strategy.cost.commissionRate,
      target: { kind: 'cost', field: 'commissionRate' },
      schemaRange: { min: '0', max: '1' },
    }),
    decimalDescriptor({
      parameterId: 'cost.slippageRate',
      label: '滑点比例',
      unit: 'ratio',
      currentValue: strategy.cost.slippageRate,
      target: { kind: 'cost', field: 'slippageRate' },
      schemaRange: { min: '0', max: '1' },
    }),
  );
  return descriptors;
};

const compareValue = (left: string | number, right: string | number) =>
  DecimalValue.from(String(left)).compareTo(String(right));

const multipleOfStep = (value: string | number, min: string | number, step: string | number) => {
  const delta = DecimalValue.from(String(value)).minus(String(min));
  if (delta.isNegative()) return false;
  const units = delta.dividedBy(String(step), 16).toString();
  return /^\d+$/.test(units);
};

const validateParameterValue = (descriptor: StrategyParameterDescriptor, value: string | number) => {
  if (descriptor.valueType === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
    throw new BadRequestException(`${descriptor.parameterId} 必须是整数`);
  }
  const range = descriptor.optimizationRange ?? descriptor.schemaRange;
  if (!range) return;
  if (compareValue(value, range.min) < 0 || compareValue(value, range.max) > 0)
    throw new BadRequestException(`${descriptor.parameterId} 超出授权范围`);
  const step =
    'step' in range && (typeof range.step === 'string' || typeof range.step === 'number')
      ? range.step
      : undefined;
  if (step !== undefined && !multipleOfStep(value, range.min, step))
    throw new BadRequestException(`${descriptor.parameterId} 不符合授权步长`);
};

export const applyOptimizationProposal = (
  baseline: StrategySchemaV2,
  descriptors: readonly StrategyParameterDescriptor[],
  allowedParameterIds: readonly string[],
  proposal: OptimizationProposal,
): StrategySchemaV2 => {
  const allowed = new Set(allowedParameterIds);
  const byId = new Map(descriptors.map((descriptor) => [descriptor.parameterId, descriptor]));
  const next = structuredClone(baseline);
  for (const change of proposal.changes) {
    if (!allowed.has(change.parameterId))
      throw new BadRequestException(`参数未授权: ${change.parameterId}`);
    const descriptor = byId.get(change.parameterId);
    if (!descriptor) throw new BadRequestException(`未知参数: ${change.parameterId}`);
    validateParameterValue(descriptor, change.value);
    if (descriptor.target.kind === 'risk') {
      const index = descriptor.target.index;
      if (index === undefined || !next.risk[index])
        throw new BadRequestException(`风险参数目标不存在: ${change.parameterId}`);
      (next.risk[index] as unknown as Record<string, unknown>)[descriptor.target.field] = change.value;
    } else if (descriptor.target.kind === 'sizing') {
      (next.sizing as unknown as Record<string, unknown>)[descriptor.target.field] = change.value;
    } else {
      (next.cost as unknown as Record<string, unknown>)[descriptor.target.field] = change.value;
    }
  }
  return strategySchemaV2.parse(next) as StrategySchemaV2;
};

export const proposalDiff = (
  baseline: StrategySchemaV2,
  candidate: StrategySchemaV2,
  descriptors: readonly StrategyParameterDescriptor[],
) => {
  const before = new Map(describeStrategyParameters(baseline).map((item) => [item.parameterId, item.currentValue]));
  const after = new Map(describeStrategyParameters(candidate).map((item) => [item.parameterId, item.currentValue]));
  return descriptors
    .map((descriptor) => ({
      parameterId: descriptor.parameterId,
      label: descriptor.label,
      before: before.get(descriptor.parameterId),
      after: after.get(descriptor.parameterId),
      unit: descriptor.unit,
    }))
    .filter((item) => item.before !== item.after);
};
