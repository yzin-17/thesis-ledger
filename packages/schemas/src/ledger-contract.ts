import { z } from 'zod';
import { isDateOnly } from './temporal.js';
import {
  decimalStringSchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
} from './monetary-values.js';
import { currencyCodeSchema } from './monetary-values.js';
export {
  decimalStringSchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
  currencyCodeSchema,
} from './monetary-values.js';
export const moneySchema = z
  .object({
    amount: decimalStringSchema,
    currency: currencyCodeSchema,
  })
  .strict();

export const executionChargeSchema = z
  .object({
    category: z.enum(['COMMISSION', 'TAX', 'LEVY', 'EXCHANGE', 'REGULATORY', 'OTHER']),
    amount: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    description: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const ledgerEventTypes = [
  'BUY_EXECUTION',
  'SELL_EXECUTION',
  'POSITION_BASELINE_OBSERVATION',
  'TRADE_OPENING_BOUNDARY_ASSERTION',
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
    charges: z.array(executionChargeSchema).default([]),
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

const tradeOpeningBoundaryAssertionPayloadSchema = z
  .object({
    symbol: z.string().trim().min(1),
    tradeId: z.string().trim().min(1).max(255),
    baselineFactId: z.uuid(),
  })
  .strict();

const tradeOpeningBoundaryAssertionCommandPayloadSchema = z
  .object({
    symbol: z.string().trim().min(1),
    baselineFactId: z.uuid(),
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

export const cashTransferMetadataSchema = z
  .object({
    transferId: z.uuid(),
    counterpartyAccountId: z.uuid(),
    leg: z.enum(['OUTFLOW', 'INFLOW']),
  })
  .strict();

export const cashFlowPayloadSchema = z
  .object({
    direction: z.enum(['INFLOW', 'OUTFLOW']),
    category: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'INTEREST', 'FEE', 'TAX']),
    amount: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    expectedAt: z.iso.datetime().optional(),
    settledAt: z.iso.datetime().optional(),
    note: z.string().trim().min(1).max(1000).optional(),
    transfer: cashTransferMetadataSchema.optional(),
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

const standaloneCashFlowPayloadSchemaV2 = cashFlowPayloadSchema.superRefine((payload, context) => {
  if (payload.category === 'TRANSFER')
    context.addIssue({ code: 'custom', message: 'TRANSFER 必须使用现金划转命令' });
});

export const ledgerEventSourceSchema = z
  .object({
    category: z.enum(['MANUAL', 'IMPORT', 'INTEGRATION', 'MIGRATION']),
    channel: z.string().trim().min(1).max(100),
    externalId: z.string().trim().min(1).max(255).optional(),
    draftId: z.uuid().optional(),
    sourceRowId: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

const commonEnvelopeShape = {
  version: z.literal(3),
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
  source: ledgerEventSourceSchema,
  actorId: z.string().trim().min(1).max(255),
  supersedesEventId: z.uuid().optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
};

const revisionedEvent = <
  TType extends (typeof ledgerEventTypes)[number],
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
  revisionedEvent('TRADE_OPENING_BOUNDARY_ASSERTION', tradeOpeningBoundaryAssertionPayloadSchema),
  revisionedEvent('CASH_BALANCE_OBSERVATION', cashBalancePayloadSchema),
  revisionedEvent('BASELINE_RECONCILIATION', baselineReconciliationPayloadSchema),
  revisionedEvent('BONUS_SHARE', bonusSharePayloadSchema),
  revisionedEvent('SPLIT', ratioPayloadSchema),
  revisionedEvent('MERGE', ratioPayloadSchema),
  revisionedEvent('DIVIDEND', dividendPayloadSchema),
  revisionedEvent('CASH_FLOW', cashFlowPayloadSchema),
]);

const voidEventSchema = z
  .object({
    ...commonEnvelopeShape,
    type: z.enum(ledgerEventTypes),
    revisionAction: z.literal('VOID'),
    supersedesEventId: z.uuid(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const ledgerEventEnvelopeSchema = z
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

export const ledgerCommandErrorCodes = [
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

export const ledgerCommandErrorSchema = z
  .object({
    errorCode: z.enum(ledgerCommandErrorCodes),
    message: z.string().trim().min(1),
    accountId: z.uuid().optional(),
    currentLedgerRevision: z.string().regex(/^\d+$/).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const ledgerCommandSourceSchema = ledgerEventSourceSchema.extend({
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
  source: ledgerCommandSourceSchema,
  actorId: z.string().trim().min(1).max(255),
};

export const createExecutionCommandSchema = withCommandTimePrecision(
  z
    .object({
      command: z.literal('CREATE_EXECUTION'),
      ...executionCommandBaseShapeV2,
    })
    .strict(),
);

export const createTradeOpeningBoundaryAssertionCommandSchema = z
  .object({
    command: z.literal('CREATE_TRADE_OPENING_BOUNDARY_ASSERTION'),
    accountId: z.uuid(),
    occurredAt: z.iso.datetime(),
    timePrecision: z.literal('INSTANT'),
    sourceTimezone: z.string().trim().min(1).max(100),
    economicOrderKey: z.string().trim().min(1).max(255),
    payload: tradeOpeningBoundaryAssertionCommandPayloadSchema,
    source: ledgerCommandSourceSchema,
    actorId: z.string().trim().min(1).max(255),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

const executionCorrectionBaseShapeV2 = {
  ...executionCommandBaseShapeV2,
  expectedLedgerRevision: z.string().regex(/^\d+$/),
  supersedesEventId: z.uuid(),
  reason: z.string().trim().min(1).max(1000),
};

export const replaceExecutionCommandSchema = withCommandTimePrecision(
  z
    .object({
      command: z.literal('REPLACE_EXECUTION'),
      ...executionCorrectionBaseShapeV2,
    })
    .strict(),
);

export const restoreExecutionCommandSchema = withCommandTimePrecision(
  z
    .object({
      command: z.literal('RESTORE_EXECUTION'),
      ...executionCorrectionBaseShapeV2,
    })
    .strict(),
);

export const voidExecutionCommandSchema = z
  .object({
    command: z.literal('VOID_EXECUTION'),
    accountId: z.uuid(),
    expectedLedgerRevision: z.string().regex(/^\d+$/),
    supersedesEventId: z.uuid(),
    source: ledgerCommandSourceSchema,
    actorId: z.string().trim().min(1).max(255),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const moveExecutionAccountCommandSchema = withCommandTimePrecision(
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
      source: ledgerCommandSourceSchema,
      actorId: z.string().trim().min(1).max(255),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict()
    .refine((command) => command.sourceAccountId !== command.targetAccountId, {
      message: '源账户与目标账户必须不同',
      path: ['targetAccountId'],
    }),
);

export const executionCommandSchema = z.union([
  createExecutionCommandSchema,
  replaceExecutionCommandSchema,
  voidExecutionCommandSchema,
  restoreExecutionCommandSchema,
  moveExecutionAccountCommandSchema,
]);

const standaloneCashFlowCommandBaseShapeV2 = {
  accountId: z.uuid(),
  ...ledgerCommandTimeShapeV2,
  payload: standaloneCashFlowPayloadSchemaV2,
  source: ledgerCommandSourceSchema,
  actorId: z.string().trim().min(1).max(255),
};

export const createCashFlowCommandSchema = withCommandTimePrecision(
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

export const replaceCashFlowCommandSchema = withCommandTimePrecision(
  z
    .object({
      command: z.literal('REPLACE_CASH_FLOW'),
      ...cashFlowCorrectionBaseShapeV2,
    })
    .strict(),
);

export const restoreCashFlowCommandSchema = withCommandTimePrecision(
  z
    .object({
      command: z.literal('RESTORE_CASH_FLOW'),
      ...cashFlowCorrectionBaseShapeV2,
    })
    .strict(),
);

export const voidCashFlowCommandSchema = z
  .object({
    command: z.literal('VOID_CASH_FLOW'),
    accountId: z.uuid(),
    expectedLedgerRevision: z.string().regex(/^\d+$/),
    supersedesEventId: z.uuid(),
    source: ledgerCommandSourceSchema,
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
  source: ledgerCommandSourceSchema,
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

export const createCashTransferCommandSchema = distinctCashTransferAccounts(
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

export const replaceCashTransferCommandSchema = distinctCashTransferAccounts(
  z
    .object({
      command: z.literal('REPLACE_CASH_TRANSFER'),
      ...cashTransferCommandBaseShapeV2,
      ...cashTransferCorrectionIdsShapeV2,
    })
    .strict(),
);

export const restoreCashTransferCommandSchema = distinctCashTransferAccounts(
  z
    .object({
      command: z.literal('RESTORE_CASH_TRANSFER'),
      ...cashTransferCommandBaseShapeV2,
      ...cashTransferCorrectionIdsShapeV2,
    })
    .strict(),
);

export const voidCashTransferCommandSchema = z
  .object({
    command: z.literal('VOID_CASH_TRANSFER'),
    transferId: z.uuid(),
    sourceAccountId: z.uuid(),
    targetAccountId: z.uuid(),
    expectedSourceLedgerRevision: z.string().regex(/^\d+$/),
    expectedTargetLedgerRevision: z.string().regex(/^\d+$/),
    supersedesSourceEventId: z.uuid(),
    supersedesTargetEventId: z.uuid(),
    source: ledgerCommandSourceSchema,
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

export const cashFlowCommandSchema = z.union([
  createCashFlowCommandSchema,
  replaceCashFlowCommandSchema,
  voidCashFlowCommandSchema,
  restoreCashFlowCommandSchema,
]);

export const cashTransferCommandSchema = z.union([
  createCashTransferCommandSchema,
  replaceCashTransferCommandSchema,
  voidCashTransferCommandSchema,
  restoreCashTransferCommandSchema,
]);

export const ledgerCommandResponseSchema = z
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
export type LedgerEvent = z.infer<typeof ledgerEventEnvelopeSchema>;
export type ExecutionCharge = z.infer<typeof executionChargeSchema>;
export type LedgerMoney = z.infer<typeof moneySchema>;
export type CashFlowPayload = z.infer<typeof cashFlowPayloadSchema>;
export type CashTransferMetadata = z.infer<typeof cashTransferMetadataSchema>;
export type LedgerCommandErrorCode = (typeof ledgerCommandErrorCodes)[number];
export type LedgerCommandError = z.infer<typeof ledgerCommandErrorSchema>;
export type CreateExecutionCommand = z.infer<typeof createExecutionCommandSchema>;
export type CreateTradeOpeningBoundaryAssertionCommand = z.infer<
  typeof createTradeOpeningBoundaryAssertionCommandSchema
>;
export type ReplaceExecutionCommand = z.infer<typeof replaceExecutionCommandSchema>;
export type VoidExecutionCommand = z.infer<typeof voidExecutionCommandSchema>;
export type RestoreExecutionCommand = z.infer<typeof restoreExecutionCommandSchema>;
export type MoveExecutionAccountCommand = z.infer<typeof moveExecutionAccountCommandSchema>;
export type ExecutionCommand = z.infer<typeof executionCommandSchema>;
export type CreateCashFlowCommand = z.infer<typeof createCashFlowCommandSchema>;
export type ReplaceCashFlowCommand = z.infer<typeof replaceCashFlowCommandSchema>;
export type VoidCashFlowCommand = z.infer<typeof voidCashFlowCommandSchema>;
export type RestoreCashFlowCommand = z.infer<typeof restoreCashFlowCommandSchema>;
export type CashFlowCommand = z.infer<typeof cashFlowCommandSchema>;
export type CreateCashTransferCommand = z.infer<typeof createCashTransferCommandSchema>;
export type ReplaceCashTransferCommand = z.infer<typeof replaceCashTransferCommandSchema>;
export type VoidCashTransferCommand = z.infer<typeof voidCashTransferCommandSchema>;
export type RestoreCashTransferCommand = z.infer<typeof restoreCashTransferCommandSchema>;
export type CashTransferCommand = z.infer<typeof cashTransferCommandSchema>;
export type LedgerCommandResponse = z.infer<typeof ledgerCommandResponseSchema>;
