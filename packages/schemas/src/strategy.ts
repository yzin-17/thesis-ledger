import { z } from 'zod';

const signal = z.object({
  indicator: z.string().min(1),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'crossesAbove', 'crossesBelow']),
  value: z.union([z.number(), z.string()]),
});

const signalExpression: z.ZodTypeAny = z.lazy(() =>
  z.union([
    signal,
    z.object({ all: z.array(signalExpression).min(1) }),
    z.object({ any: z.array(signalExpression).min(1) }),
    z.object({ not: signalExpression }),
  ]),
);

const universe = z
  .object({
    symbols: z.array(z.string().min(1)).min(1),
    assetTypes: z.array(z.enum(['stock', 'etf', 'fund', 'index', 'convertible'])).optional(),
    filterRef: z.string().min(1).optional(),
    asOf: z.iso.datetime({ offset: true }),
    validFrom: z.iso.date().optional(),
    validTo: z.iso.date().optional(),
  })
  .superRefine((value, context) => {
    if (value.validFrom && value.validTo && value.validFrom > value.validTo) {
      context.addIssue({ code: 'custom', path: ['validTo'], message: 'universe 有效期无效' });
    }
  });

export const strategySchemaV1 = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  description: z.string().max(2000).optional(),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  universe,
  entrySignals: z.array(signal).min(1),
  exitSignals: z.array(signal).min(1),
  entryCondition: signalExpression.optional(),
  exitCondition: signalExpression.optional(),
  stopLoss: z.object({ type: z.enum(['fixed', 'trailing', 'atr']), value: z.number().positive() }),
  takeProfit: z
    .object({ type: z.enum(['fixed', 'trailing']), value: z.number().positive() })
    .optional(),
  sizing: z.object({ type: z.enum(['fixed', 'weight', 'risk']), value: z.number().positive() }),
  execution: z.object({
    price: z.enum(['open', 'close', 'nextOpen']),
    tPlusOne: z.boolean(),
    lotSize: z.number().int().positive(),
  }),
  cost: z.object({
    commissionRate: z.number().nonnegative(),
    minimumCommission: z.number().nonnegative(),
    stampDutyRate: z.number().nonnegative(),
    slippageRate: z.number().nonnegative(),
  }),
  riskConstraints: z.array(z.object({ kind: z.string(), threshold: z.number() })),
  benchmark: z.string().min(1),
});

export const backtestJobSchema = z
  .object({
    id: z.uuid(),
    strategyVersionId: z.uuid(),
    status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    period: z.object({ start: z.iso.date(), end: z.iso.date() }),
    inSampleEnd: z.iso.date().optional(),
    dataAsOf: z.iso.datetime({ offset: true }),
    warnings: z.array(z.string()),
  })
  .passthrough();
