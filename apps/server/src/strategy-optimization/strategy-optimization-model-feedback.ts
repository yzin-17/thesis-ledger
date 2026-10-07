import { z } from 'zod';
import {
  runConfigSchemaV3,
  strategyParameterDescriptorSchema,
  type StrategyParameterDescriptor,
} from '@thesis-ledger/schemas';
import { toRecord } from './strategy-optimization-common.js';

const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const count = z.number().int().nonnegative();
const summary = z.object({
  status: z.enum(['valid', 'invalid']),
  completeness: z.enum(['complete', 'partial', 'unavailable']).optional(),
  tradeCount: count.optional(),
  fillCount: count.optional(),
  rejectedOrderCount: count.optional(),
  totalReturn: decimal.optional(),
  maxDrawdown: decimal.optional(),
  turnover: decimal.optional(),
  score: z.number().finite().optional(),
  failureCategory: z
    .enum([
      'data-unavailable',
      'protocol-incompatible',
      'strategy-ineligible',
      'strategy-performance',
    ])
    .optional(),
});

/** 模型只消费明确许可的开发/验证绩效，持久化结果本身不充当提示词合同。 */
export function optimizationModelMetrics(value: unknown) {
  const record = toRecord(value);
  const allowed: Record<string, z.infer<typeof summary>> = {};
  for (const split of ['development', 'validation']) {
    const parsed = summary.safeParse(record[split]);
    if (parsed.success) allowed[split] = parsed.data;
  }
  return allowed;
}

export function optimizationModelDiff(
  value: unknown,
  descriptors: readonly StrategyParameterDescriptor[],
  discovery: boolean,
) {
  if (discovery) return [{ kind: 'full-strategy', sourceMode: 'discovery' }];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = toRecord(item);
    const descriptor = descriptors.find((candidate) => candidate.parameterId === row.parameterId);
    const before = strategyParameterDescriptorSchema.shape.currentValue.safeParse(row.before);
    const after = strategyParameterDescriptorSchema.shape.currentValue.safeParse(row.after);
    if (!descriptor || !before.success || !after.success) return [];
    return [
      {
        parameterId: descriptor.parameterId,
        label: descriptor.label,
        unit: descriptor.unit,
        before: before.data,
        after: after.data,
      },
    ];
  });
}

export function optimizationModelResearchNotice(value: unknown): string {
  if (toRecord(value).schemaVersion !== '3')
    return '仅使用开发与验证摘要；未提供严格历史无前视证明，不得据此声称严格样本外有效。';
  const { executionPriceProtocol: protocol } = runConfigSchemaV3.parse(value);
  const facts = {
    adjustment: protocol.priceBasis.adjustment,
    accountingBasis: protocol.accountingBasis,
    quantityBasis: protocol.priceBasis.quantityBasis,
    historyBasis: protocol.history.basis,
  };
  return (
    `冻结研究语义：${JSON.stringify(facts)}。` +
    (protocol.history.basis === 'fixed-provider-snapshot'
      ? '这是事后固定供应商序列研究，复权价格可能包含后来事件影响，不得描述为严格无前视样本外。'
      : '严格历史时点语义仍须逐项证据验证，不得仅凭实验标签宣称通过。')
  );
}
