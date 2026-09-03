import { z } from 'zod';
import { isDateOnly } from './temporal.js';

const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

const hasNonZeroDigit = (value: string) => /[1-9]/.test(value.replace(/^-/, ''));

export const decimalStringSchema = z.string().regex(decimalPattern, '必须是规范十进制字符串');

export const nonNegativeDecimalStringSchema = decimalStringSchema.refine(
  (value) => !value.startsWith('-'),
  '必须大于等于 0',
);

export const positiveDecimalStringSchema = nonNegativeDecimalStringSchema.refine(
  hasNonZeroDigit,
  '必须大于 0',
);

export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, '必须是三位大写币种代码');

export const moneySchemaV2 = z
  .object({
    amount: decimalStringSchema,
    currency: currencyCodeSchema,
  })
  .strict();

export const executionChargeSchemaV2 = z
  .object({
    category: z.enum(['COMMISSION', 'TAX', 'LEVY', 'EXCHANGE', 'REGULATORY', 'OTHER']),
    amount: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    description: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const ledgerEventTypesV2 = [
  'BUY_EXECUTION',
  'SELL_EXECUTION',
  'POSITION_BASELINE_OBSERVATION',
  'CASH_BALANCE_OBSERVATION',
  'BASELINE_RECONCILIATION',
  'BONUS_SHARE',
  'SPLIT',
  'MERGE',
  'DIVIDEND',
  'CASH_FLOW',
] as const;

const executionPayloadSchema = z
  .object({
    symbol: z.string().trim().min(1),
    quantity: positiveDecimalStringSchema,
    price: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    expectedAt: z.iso.datetime().optional(),
    settledAt: z.iso.datetime().optional(),
    capabilityVerification: z.enum(['VERIFIED', 'UNVERIFIED']),
    charges: z.array(executionChargeSchemaV2).default([]),
    note: z.string().max(1000).optional(),
  })
  .strict();

const positionBaselinePayloadSchema = z
  .object({
    symbol: z.string().trim().min(1),
    batchId: z.uuid(),
    batchScope: z.enum(['FULL', 'PARTIAL']),
    quantity: nonNegativeDecimalStringSchema,
    averageCost: nonNegativeDecimalStringSchema.optional(),
    currency: currencyCodeSchema,
    costIncludesFees: z.enum(['INCLUDES_FEES', 'EXCLUDES_FEES', 'UNKNOWN']),
    capturedAt: z.iso.datetime().optional(),
  })
  .strict();

const cashBalancePayloadSchema = z
  .object({
    currency: currencyCodeSchema,
    amount: decimalStringSchema,
    capturedAt: z.iso.datetime().optional(),
  })
  .strict();

const baselineReconciliationPayloadSchema = z
  .object({
    symbol: z.string().trim().min(1),
    baselineFactId: z.uuid(),
    executionFactIds: z.array(z.uuid()).min(1),
    coveredQuantity: positiveDecimalStringSchema,
    coveredCost: nonNegativeDecimalStringSchema,
    ruleVersion: z.number().int().positive(),
  })
  .strict()
  .superRefine((payload, context) => {
    if (new Set(payload.executionFactIds).size !== payload.executionFactIds.length)
      context.addIssue({ code: 'custom', message: 'executionFactIds 不能重复' });
  });

const bonusSharePayloadSchema = z
  .object({
    symbol: z.string().trim().min(1),
    quantity: positiveDecimalStringSchema,
  })
  .strict();

const ratioPayloadSchema = z
  .object({
    symbol: z.string().trim().min(1),
    fromUnits: positiveDecimalStringSchema,
    toUnits: positiveDecimalStringSchema,
  })
  .strict();

const dividendPayloadSchema = z
  .object({
    symbol: z.string().trim().min(1),
    amount: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    expectedAt: z.iso.datetime().optional(),
    settledAt: z.iso.datetime().optional(),
  })
  .strict();

export const cashTransferMetadataSchemaV2 = z
  .object({
    transferId: z.uuid(),
    counterpartyAccountId: z.uuid(),
    leg: z.enum(['OUTFLOW', 'INFLOW']),
  })
  .strict();

export const cashFlowPayloadSchemaV2 = z
  .object({
    direction: z.enum(['INFLOW', 'OUTFLOW']),
    category: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'INTEREST', 'FEE', 'TAX']),
    amount: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    expectedAt: z.iso.datetime().optional(),
    settledAt: z.iso.datetime().optional(),
    note: z.string().trim().min(1).max(1000).optional(),
    transfer: cashTransferMetadataSchemaV2.optional(),
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.category === 'TRANSFER') {
      if (payload.transfer === undefined)
        context.addIssue({ code: 'custom', message: '现金划转必须包含 transfer 元数据' });
      if (payload.transfer?.leg !== payload.direction)
        context.addIssue({ code: 'custom', message: '现金划转 leg 必须与 direction 一致' });
      return;
    }
    if (payload.transfer !== undefined)
      context.addIssue({ code: 'custom', message: '非现金划转不得包含 transfer 元数据' });
  });

/**
 * 仅用于读取 20260826050000_migrate_legacy_ledger_v2 产生的历史划转。
 * 该载荷故意不提供对手账户语义；新的 CASH_FLOW / TRANSFER 仍必须使用上面的完整契约。
 */
export const legacyMigratedCashTransferPayloadSchemaV2 = z
  .object({
    direction: z.enum(['INFLOW', 'OUTFLOW']),
    category: z.literal('TRANSFER'),
    amount: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    settledAt: z.iso.datetime().optional(),
    note: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

const standaloneCashFlowPayloadSchemaV2 = cashFlowPayloadSchemaV2.superRefine(
  (payload, context) => {
    if (payload.category === 'TRANSFER')
      context.addIssue({ code: 'custom', message: 'TRANSFER 必须使用现金划转命令' });
  },
);

export const ledgerEventSourceSchemaV2 = z
  .object({
    category: z.enum(['MANUAL', 'IMPORT', 'INTEGRATION', 'MIGRATION']),
    channel: z.string().trim().min(1).max(100),
    externalId: z.string().trim().min(1).max(255).optional(),
    draftId: z.uuid().optional(),
    sourceRowId: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

const commonEnvelopeShape = {
  version: z.literal(2),
  eventId: z.uuid(),
  factId: z.uuid(),
  accountId: z.uuid(),
  ledgerRevision: z.string().regex(/^[1-9]\d*$/, 'ledgerRevision 必须是正整数字符串'),
  occurredAt: z.union([z.iso.datetime(), z.iso.date()]).nullable(),
  timePrecision: z.enum(['INSTANT', 'DATE', 'UNKNOWN']),
  sourceTimezone: z.string().trim().min(1).max(100),
  economicOrderKey: z.string().trim().min(1).max(255),
  recordedAt: z.iso.datetime(),
  payloadVersion: z.number().int().positive(),
  source: ledgerEventSourceSchemaV2,
  actorId: z.string().trim().min(1).max(255),
  supersedesEventId: z.uuid().optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
};

export const legacyMigratedCashTransferEventSchemaV2 = z
  .object({
    ...commonEnvelopeShape,
    payloadVersion: z.literal(1),
    actorId: z.literal('migration:legacy-ledger-v2'),
    type: z.literal('CASH_FLOW'),
    revisionAction: z.literal('CREATE'),
    payload: legacyMigratedCashTransferPayloadSchemaV2,
  })
  .strict()
  .superRefine((event, context) => {
    if (event.occurredAt === null) {
      if (event.timePrecision !== 'UNKNOWN')
        context.addIssue({ code: 'custom', message: '只有 UNKNOWN 精度允许缺少 occurredAt' });
    } else {
      if (event.timePrecision === 'DATE' && !isDateOnly(event.occurredAt))
        context.addIssue({ code: 'custom', message: 'DATE 精度必须使用 YYYY-MM-DD' });
      if (event.timePrecision === 'INSTANT' && isDateOnly(event.occurredAt))
        context.addIssue({ code: 'custom', message: 'INSTANT 精度必须使用 ISO 时间' });
    }
  });

const revisionedEvent = <
  TType extends (typeof ledgerEventTypesV2)[number],
  TPayload extends z.ZodType,
>(
  type: TType,
  payload: TPayload,
) =>
  z
    .object({
      ...commonEnvelopeShape,
      type: z.literal(type),
      revisionAction: z.enum(['CREATE', 'REPLACE', 'RESTORE']),
      payload,
    })
    .strict();

const payloadEventsSchema = z.discriminatedUnion('type', [
  revisionedEvent('BUY_EXECUTION', executionPayloadSchema),
  revisionedEvent('SELL_EXECUTION', executionPayloadSchema),
  revisionedEvent('POSITION_BASELINE_OBSERVATION', positionBaselinePayloadSchema),
  revisionedEvent('CASH_BALANCE_OBSERVATION', cashBalancePayloadSchema),
  revisionedEvent('BASELINE_RECONCILIATION', baselineReconciliationPayloadSchema),
  revisionedEvent('BONUS_SHARE', bonusSharePayloadSchema),
  revisionedEvent('SPLIT', ratioPayloadSchema),
  revisionedEvent('MERGE', ratioPayloadSchema),
  revisionedEvent('DIVIDEND', dividendPayloadSchema),
  revisionedEvent('CASH_FLOW', cashFlowPayloadSchemaV2),
]);

const voidEventSchema = z
  .object({
    ...commonEnvelopeShape,
    type: z.enum(ledgerEventTypesV2),
    revisionAction: z.literal('VOID'),
    supersedesEventId: z.uuid(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const ledgerEventEnvelopeSchemaV2 = z
  .union([payloadEventsSchema, voidEventSchema])
  .superRefine((event, context) => {
    if (event.occurredAt === null) {
      if (event.timePrecision !== 'UNKNOWN')
        context.addIssue({ code: 'custom', message: '只有 UNKNOWN 精度允许缺少 occurredAt' });
    } else {
      if (event.timePrecision === 'DATE' && !isDateOnly(event.occurredAt))
        context.addIssue({ code: 'custom', message: 'DATE 精度必须使用 YYYY-MM-DD' });
      if (event.timePrecision === 'INSTANT' && isDateOnly(event.occurredAt))
        context.addIssue({ code: 'custom', message: 'INSTANT 精度必须使用 ISO 时间' });
    }

    if (event.revisionAction === 'CREATE') {
      if (event.supersedesEventId !== undefined)
        context.addIssue({ code: 'custom', message: 'CREATE 不能包含 supersedesEventId' });
      return;
    }

    if (event.supersedesEventId === undefined)
      context.addIssue({ code: 'custom', message: '修正版本必须包含 supersedesEventId' });
    if (event.reason === undefined)
      context.addIssue({ code: 'custom', message: '修正版本必须包含 reason' });
  });

export const ledgerCommandErrorCodesV2 = [
  'LEDGER_VALIDATION_FAILED',
  'LEDGER_REVISION_CONFLICT',
  'LEDGER_IDEMPOTENCY_CONFLICT',
  'LEDGER_FACT_NOT_FOUND',
  'LEDGER_CORRECTION_NOT_CHAIN_TIP',
  'LEDGER_CORRECTION_ACCOUNT_MISMATCH',
  'LEDGER_RESTORE_REQUIRES_VOID',
  'LEDGER_INSUFFICIENT_POSITION',
  'LEDGER_INSUFFICIENT_CASH',
  'LEDGER_PROJECTION_FAILED',
] as const;

export const ledgerCommandErrorSchemaV2 = z
  .object({
    errorCode: z.enum(ledgerCommandErrorCodesV2),
    message: z.string().trim().min(1),
    accountId: z.uuid().optional(),
    currentLedgerRevision: z.string().regex(/^\d+$/).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const ledgerCommandSourceSchemaV2 = ledgerEventSourceSchemaV2.extend({
  externalId: z.string().trim().min(1).max(255),
});

const ledgerCommandTimeShapeV2 = {
  occurredAt: z.union([z.iso.datetime(), z.iso.date()]),
  timePrecision: z.enum(['INSTANT', 'DATE']),
  sourceTimezone: z.string().trim().min(1).max(100),
  economicOrderKey: z.string().trim().min(1).max(255),
};

const withCommandTimePrecision = <TSchema extends z.ZodType>(schema: TSchema) =>
  schema.superRefine((command, context) => {
    const value = command as { occurredAt?: string; timePrecision?: string };
    if (value.occurredAt === undefined || value.timePrecision === undefined) return;
    if (value.timePrecision === 'DATE' && !isDateOnly(value.occurredAt))
      context.addIssue({ code: 'custom', message: 'DATE 精度必须使用 YYYY-MM-DD' });
    if (value.timePrecision === 'INSTANT' && isDateOnly(value.occurredAt))
      context.addIssue({ code: 'custom', message: 'INSTANT 精度必须使用 ISO 时间' });
  });

const executionCommandBaseShapeV2 = {
  accountId: z.uuid(),
  ...ledgerCommandTimeShapeV2,
  side: z.enum(['BUY', 'SELL']),
  payload: executionPayloadSchema,
  source: ledgerCommandSourceSchemaV2,
  actorId: z.string().trim().min(1).max(255),
};

export const createExecutionCommandSchemaV2 = withCommandTimePrecision(
  z
    .object({
      command: z.literal('CREATE_EXECUTION'),
      ...executionCommandBaseShapeV2,
    })
    .strict(),
);

const executionCorrectionBaseShapeV2 = {
  ...executionCommandBaseShapeV2,
  expectedLedgerRevision: z.string().regex(/^\d+$/),
  supersedesEventId: z.uuid(),
  reason: z.string().trim().min(1).max(1000),
};

export const replaceExecutionCommandSchemaV2 = withCommandTimePrecision(
  z
    .object({
      command: z.literal('REPLACE_EXECUTION'),
      ...executionCorrectionBaseShapeV2,
    })
    .strict(),
);

export const restoreExecutionCommandSchemaV2 = withCommandTimePrecision(
  z
    .object({
      command: z.literal('RESTORE_EXECUTION'),
      ...executionCorrectionBaseShapeV2,
    })
    .strict(),
);

export const voidExecutionCommandSchemaV2 = z
  .object({
    command: z.literal('VOID_EXECUTION'),
    accountId: z.uuid(),
    expectedLedgerRevision: z.string().regex(/^\d+$/),
    supersedesEventId: z.uuid(),
    source: ledgerCommandSourceSchemaV2,
    actorId: z.string().trim().min(1).max(255),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const moveExecutionAccountCommandSchemaV2 = withCommandTimePrecision(
  z
    .object({
      command: z.literal('MOVE_EXECUTION_ACCOUNT'),
      sourceAccountId: z.uuid(),
      targetAccountId: z.uuid(),
      expectedSourceLedgerRevision: z.string().regex(/^\d+$/),
      expectedTargetLedgerRevision: z.string().regex(/^\d+$/),
      supersedesEventId: z.uuid(),
      ...ledgerCommandTimeShapeV2,
      side: z.enum(['BUY', 'SELL']),
      payload: executionPayloadSchema,
      source: ledgerCommandSourceSchemaV2,
      actorId: z.string().trim().min(1).max(255),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict()
    .refine((command) => command.sourceAccountId !== command.targetAccountId, {
      message: '源账户与目标账户必须不同',
      path: ['targetAccountId'],
    }),
);

export const executionCommandSchemaV2 = z.union([
  createExecutionCommandSchemaV2,
  replaceExecutionCommandSchemaV2,
  voidExecutionCommandSchemaV2,
  restoreExecutionCommandSchemaV2,
  moveExecutionAccountCommandSchemaV2,
]);

const standaloneCashFlowCommandBaseShapeV2 = {
  accountId: z.uuid(),
  ...ledgerCommandTimeShapeV2,
  payload: standaloneCashFlowPayloadSchemaV2,
  source: ledgerCommandSourceSchemaV2,
  actorId: z.string().trim().min(1).max(255),
};

export const createCashFlowCommandSchemaV2 = withCommandTimePrecision(
  z
    .object({
      command: z.literal('CREATE_CASH_FLOW'),
      ...standaloneCashFlowCommandBaseShapeV2,
    })
    .strict(),
);

const cashFlowCorrectionBaseShapeV2 = {
  ...standaloneCashFlowCommandBaseShapeV2,
  expectedLedgerRevision: z.string().regex(/^\d+$/),
  supersedesEventId: z.uuid(),
  reason: z.string().trim().min(1).max(1000),
};

export const replaceCashFlowCommandSchemaV2 = withCommandTimePrecision(
  z
    .object({
      command: z.literal('REPLACE_CASH_FLOW'),
      ...cashFlowCorrectionBaseShapeV2,
    })
    .strict(),
);

export const restoreCashFlowCommandSchemaV2 = withCommandTimePrecision(
  z
    .object({
      command: z.literal('RESTORE_CASH_FLOW'),
      ...cashFlowCorrectionBaseShapeV2,
    })
    .strict(),
);

export const voidCashFlowCommandSchemaV2 = z
  .object({
    command: z.literal('VOID_CASH_FLOW'),
    accountId: z.uuid(),
    expectedLedgerRevision: z.string().regex(/^\d+$/),
    supersedesEventId: z.uuid(),
    source: ledgerCommandSourceSchemaV2,
    actorId: z.string().trim().min(1).max(255),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

const cashTransferCommandBaseShapeV2 = {
  transferId: z.uuid(),
  sourceAccountId: z.uuid(),
  targetAccountId: z.uuid(),
  expectedSourceLedgerRevision: z.string().regex(/^\d+$/),
  expectedTargetLedgerRevision: z.string().regex(/^\d+$/),
  ...ledgerCommandTimeShapeV2,
  amount: positiveDecimalStringSchema,
  currency: currencyCodeSchema,
  expectedAt: z.iso.datetime().optional(),
  settledAt: z.iso.datetime().optional(),
  note: z.string().trim().min(1).max(1000).optional(),
  source: ledgerCommandSourceSchemaV2,
  actorId: z.string().trim().min(1).max(255),
};

const distinctCashTransferAccounts = <TSchema extends z.ZodType>(schema: TSchema) =>
  withCommandTimePrecision(schema).superRefine((command, context) => {
    const value = command as { sourceAccountId?: string; targetAccountId?: string };
    if (value.sourceAccountId === value.targetAccountId)
      context.addIssue({
        code: 'custom',
        message: '源账户与目标账户必须不同',
        path: ['targetAccountId'],
      });
  });

export const createCashTransferCommandSchemaV2 = distinctCashTransferAccounts(
  z
    .object({
      command: z.literal('CREATE_CASH_TRANSFER'),
      ...cashTransferCommandBaseShapeV2,
    })
    .strict(),
);

const cashTransferCorrectionIdsShapeV2 = {
  supersedesSourceEventId: z.uuid(),
  supersedesTargetEventId: z.uuid(),
  reason: z.string().trim().min(1).max(1000),
};

export const replaceCashTransferCommandSchemaV2 = distinctCashTransferAccounts(
  z
    .object({
      command: z.literal('REPLACE_CASH_TRANSFER'),
      ...cashTransferCommandBaseShapeV2,
      ...cashTransferCorrectionIdsShapeV2,
    })
    .strict(),
);

export const restoreCashTransferCommandSchemaV2 = distinctCashTransferAccounts(
  z
    .object({
      command: z.literal('RESTORE_CASH_TRANSFER'),
      ...cashTransferCommandBaseShapeV2,
      ...cashTransferCorrectionIdsShapeV2,
    })
    .strict(),
);

export const voidCashTransferCommandSchemaV2 = z
  .object({
    command: z.literal('VOID_CASH_TRANSFER'),
    transferId: z.uuid(),
    sourceAccountId: z.uuid(),
    targetAccountId: z.uuid(),
    expectedSourceLedgerRevision: z.string().regex(/^\d+$/),
    expectedTargetLedgerRevision: z.string().regex(/^\d+$/),
    supersedesSourceEventId: z.uuid(),
    supersedesTargetEventId: z.uuid(),
    source: ledgerCommandSourceSchemaV2,
    actorId: z.string().trim().min(1).max(255),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.sourceAccountId === command.targetAccountId)
      context.addIssue({
        code: 'custom',
        message: '源账户与目标账户必须不同',
        path: ['targetAccountId'],
      });
  });

export const cashFlowCommandSchemaV2 = z.union([
  createCashFlowCommandSchemaV2,
  replaceCashFlowCommandSchemaV2,
  voidCashFlowCommandSchemaV2,
  restoreCashFlowCommandSchemaV2,
]);

export const cashTransferCommandSchemaV2 = z.union([
  createCashTransferCommandSchemaV2,
  replaceCashTransferCommandSchemaV2,
  voidCashTransferCommandSchemaV2,
  restoreCashTransferCommandSchemaV2,
]);

export const ledgerCommandResponseSchemaV2 = z
  .object({
    eventIds: z.array(z.uuid()).min(1),
    factIds: z.array(z.uuid()).min(1),
    ledgerRevisions: z.record(z.uuid(), z.string().regex(/^\d+$/)),
    projectionGenerations: z.record(z.uuid(), z.string().regex(/^\d+$/)),
    affectedSymbols: z.array(z.string().trim().min(1)),
    idempotentReplay: z.boolean(),
  })
  .strict();

export type DecimalString = z.infer<typeof decimalStringSchema>;
export type LedgerEventV2 = z.infer<typeof ledgerEventEnvelopeSchemaV2>;
export type ExecutionChargeV2 = z.infer<typeof executionChargeSchemaV2>;
export type MoneyV2 = z.infer<typeof moneySchemaV2>;
export type CashFlowPayloadV2 = z.infer<typeof cashFlowPayloadSchemaV2>;
export type LegacyMigratedCashTransferPayloadV2 = z.infer<
  typeof legacyMigratedCashTransferPayloadSchemaV2
>;
export type LegacyMigratedCashTransferEventV2 = z.infer<
  typeof legacyMigratedCashTransferEventSchemaV2
>;
export type CashTransferMetadataV2 = z.infer<typeof cashTransferMetadataSchemaV2>;
export type LedgerCommandErrorCodeV2 = (typeof ledgerCommandErrorCodesV2)[number];
export type LedgerCommandErrorV2 = z.infer<typeof ledgerCommandErrorSchemaV2>;
export type CreateExecutionCommandV2 = z.infer<typeof createExecutionCommandSchemaV2>;
export type ReplaceExecutionCommandV2 = z.infer<typeof replaceExecutionCommandSchemaV2>;
export type VoidExecutionCommandV2 = z.infer<typeof voidExecutionCommandSchemaV2>;
export type RestoreExecutionCommandV2 = z.infer<typeof restoreExecutionCommandSchemaV2>;
export type MoveExecutionAccountCommandV2 = z.infer<typeof moveExecutionAccountCommandSchemaV2>;
export type ExecutionCommandV2 = z.infer<typeof executionCommandSchemaV2>;
export type CreateCashFlowCommandV2 = z.infer<typeof createCashFlowCommandSchemaV2>;
export type ReplaceCashFlowCommandV2 = z.infer<typeof replaceCashFlowCommandSchemaV2>;
export type VoidCashFlowCommandV2 = z.infer<typeof voidCashFlowCommandSchemaV2>;
export type RestoreCashFlowCommandV2 = z.infer<typeof restoreCashFlowCommandSchemaV2>;
export type CashFlowCommandV2 = z.infer<typeof cashFlowCommandSchemaV2>;
export type CreateCashTransferCommandV2 = z.infer<typeof createCashTransferCommandSchemaV2>;
export type ReplaceCashTransferCommandV2 = z.infer<typeof replaceCashTransferCommandSchemaV2>;
export type VoidCashTransferCommandV2 = z.infer<typeof voidCashTransferCommandSchemaV2>;
export type RestoreCashTransferCommandV2 = z.infer<typeof restoreCashTransferCommandSchemaV2>;
export type CashTransferCommandV2 = z.infer<typeof cashTransferCommandSchemaV2>;
export type LedgerCommandResponseV2 = z.infer<typeof ledgerCommandResponseSchemaV2>;
