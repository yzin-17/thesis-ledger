import { z } from 'zod';

const text = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);

export const priceAdjustmentSchema = z.enum(['none', 'qfq', 'hfq']);
export const accountingBasisSchema = z.enum(['raw-events', 'normalized-series']);
export const quantityBasisSchema = z.enum(['actual-units', 'normalized-units']);

const revisionSchema = z.discriminatedUnion('origin', [
  z.strictObject({ origin: z.literal('provider'), id: text }),
  z.strictObject({ origin: z.literal('local-observation'), contentHash: fingerprint }),
]);

const derivationSchema = z.strictObject({
  inputFingerprint: fingerprint,
  factorOrEventFingerprint: fingerprint,
  algorithmVersion: text,
});

const sourcePriceBasisFields = {
  adjustment: priceAdjustmentSchema,
  method: z.enum(['provider-native', 'local-derived']),
  methodVersion: text,
  basisScope: z.enum(['global', 'request-window', 'provider-defined']),
  anchor: text.nullable(),
  revision: revisionSchema,
  observedAt: timestamp,
  volumeBasis: z.enum(['original', 'split-adjusted', 'unknown']),
  fieldUnits: z
    .strictObject({
      volume: z.enum(['hand', 'share', 'fund-unit', 'unknown']),
      amount: z.enum(['CNY', 'unknown']),
    })
    .optional(),
  dividendMeaning: z.enum(['explicit-cash', 'embedded-verified', 'provider-defined']),
  dividendEvidenceRef: text.nullable(),
  conversionAvailable: z.boolean(),
  conversionEvidenceRef: text.nullable(),
  derivation: derivationSchema.nullable(),
};

type SourcePriceBasis = z.infer<z.ZodObject<typeof sourcePriceBasisFields>>;

const validateSourcePriceBasis = (value: SourcePriceBasis, context: z.RefinementCtx) => {
  if (value.method === 'local-derived' && value.derivation === null) {
    context.addIssue({
      code: 'custom',
      path: ['derivation'],
      message: '本地派生序列必须记录冻结输入与算法',
    });
  }
  if (value.method === 'provider-native' && value.derivation !== null) {
    context.addIssue({
      code: 'custom',
      path: ['derivation'],
      message: '供应商原生序列不能标为本地派生',
    });
  }
  if (value.dividendMeaning === 'embedded-verified' && value.dividendEvidenceRef === null) {
    context.addIssue({
      code: 'custom',
      path: ['dividendEvidenceRef'],
      message: '已核实的分红语义必须有证据引用',
    });
  }
  if (
    value.conversionAvailable &&
    (value.anchor === null || value.conversionEvidenceRef === null)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['conversionEvidenceRef'],
      message: '可转换序列必须有明确基准和转换证据',
    });
  }
};

/** DSA reports source facts; it does not select the backtest accounting basis. */
export const sourcePriceBasisSchema = z
  .strictObject(sourcePriceBasisFields)
  .superRefine(validateSourcePriceBasis);
export type SourcePriceBasisFact = z.infer<typeof sourcePriceBasisSchema>;

export const resolvedPriceBasisSchema = z
  .strictObject({
    ...sourcePriceBasisFields,
    quantityBasis: quantityBasisSchema,
  })
  .superRefine(validateSourcePriceBasis);
export type ResolvedPriceBasis = z.infer<typeof resolvedPriceBasisSchema>;

export const historyInputSchema = z.discriminatedUnion('basis', [
  z.strictObject({
    basis: z.literal('point-in-time'),
    reconstructionEvidenceRef: text,
  }),
  z.strictObject({ basis: z.literal('fixed-provider-snapshot') }),
]);
export type HistoryInput = z.infer<typeof historyInputSchema>;

/** Applies to the execution price coordinate, not a separate signal-only indicator series. */
export const executionPriceProtocolSchema = z
  .strictObject({
    protocolVersion: z.literal('execution-price-v1'),
    priceBasis: resolvedPriceBasisSchema,
    accountingBasis: accountingBasisSchema,
    history: historyInputSchema,
  })
  .superRefine((value, context) => {
    const { priceBasis, accountingBasis } = value;
    if (accountingBasis === 'raw-events') {
      if (priceBasis.adjustment !== 'none') {
        context.addIssue({
          code: 'custom',
          path: ['priceBasis', 'adjustment'],
          message: '原始份额成交必须使用原始价格',
        });
      }
      if (priceBasis.quantityBasis !== 'actual-units') {
        context.addIssue({
          code: 'custom',
          path: ['priceBasis', 'quantityBasis'],
          message: '原始份额记账必须使用实际数量',
        });
      }
    } else {
      if (priceBasis.adjustment === 'none') {
        context.addIssue({
          code: 'custom',
          path: ['priceBasis', 'adjustment'],
          message: '归一化记账需要明确的复权价格',
        });
      }
      if (priceBasis.quantityBasis !== 'normalized-units') {
        context.addIssue({
          code: 'custom',
          path: ['priceBasis', 'quantityBasis'],
          message: '归一化记账必须使用归一化数量',
        });
      }
      if (priceBasis.dividendMeaning === 'explicit-cash') {
        context.addIssue({
          code: 'custom',
          path: ['priceBasis', 'dividendMeaning'],
          message: '归一化序列不能重复注入现金分红',
        });
      }
    }
  });
export type ExecutionPriceProtocol = z.infer<typeof executionPriceProtocolSchema>;
