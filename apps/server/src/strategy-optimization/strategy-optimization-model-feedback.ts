import { z } from 'zod';
import {
  runConfigSchemaV3,
  backtestRuleDiagnosticsSchema,
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
  tradedNotional: decimal.optional(),
  turnoverRate: decimal.optional(),
  analyticsVersion: z.literal('research-analytics-v2').optional(),
  scoreVersion: z.literal('optimization-score-v2').optional(),
  ruleDiagnostics: backtestRuleDiagnosticsSchema.optional(),
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
    if (parsed.success) {
      const value = parsed.data;
      if (value.ruleDiagnostics) value.ruleDiagnostics = { ...value.ruleDiagnostics,
        rules: value.ruleDiagnostics.rules.map((rule) => ({ ...rule,
          unavailableReasons: rule.unavailableReasons.map((reason) => ({ ...reason, samples: [] })),
        })),
      };
      allowed[split] = value;
    }
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

export function optimizationModelResearchNotice(value: unknown, dataScopeInRequest = false): string {
  if (toRecord(value).schemaVersion !== 'backtest-trade-config-v1')
    return '仅使用开发与验证摘要；未提供严格历史无前视证明，不得据此声称严格样本外有效。';
  const config = runConfigSchemaV3.parse(value);
  const protocol = config.executionPriceProtocol;
  const facts = {
    adjustment: protocol.priceBasis.adjustment,
    accountingBasis: protocol.accountingBasis,
    quantityBasis: protocol.priceBasis.quantityBasis,
    historyBasis: protocol.history.basis,
  };
  const notice =
    `冻结价格/记账/数量/历史：${Object.values(facts).join('/')}。` +
    (protocol.history.basis === 'fixed-provider-snapshot'
      ? '事后固定序列可能含后来事件影响，不得声称严格无前视样本外。'
      : '严格历史时点语义仍须逐项证据验证，不得仅凭实验标签宣称通过。');
  if (config.priceResearch?.dataScope)
    return notice + '本次候选只能使用已冻结dataScope中的价格坐标、周期、字段、窗口与投入方式。缺少actual时仅使用纯指标和金额／比例投入；不得添加原价条件、固定份数或临时补取行情。' +
      (dataScopeInRequest ? '' : JSON.stringify(config.priceResearch.dataScope));
  if (config.priceResearch)
    return notice + '指标与模拟收益使用后复权；具体价格常量使用已冻结的不复权参考价。固定投入参考份数按操作时点原价确定投入，再换算研究单位；由共享研究规则装配，不得自行推导复权因子或改写阈值。';
  if (protocol.accountingBasis === 'normalized-series')
    return (
      notice +
      '归一化研究用同坐标相对价/资金比例/持仓状态；真实报价、股数及实物单位须可核验转换证据，否则禁止。用户明确指定本次模拟执行坐标中的委托触发价时，同坐标直接使用该价位。'
    );
  return notice;
}
