import type { LedgerEventV2 as DomainLedgerEventV2 } from '@thesis-ledger/domain';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createExecutionCommandSchemaV2,
  decimalStringSchema,
  ledgerCommandErrorSchemaV2,
  ledgerEventEnvelopeSchemaV2,
  ledgerCommandResponseSchemaV2,
  moneySchemaV2,
  moveExecutionAccountCommandSchemaV2,
  positiveDecimalStringSchema,
  type LedgerEventV2,
} from '../src/ledger-v2.js';

const baseEnvelope = {
  version: 2 as const,
  eventId: '11111111-1111-4111-8111-111111111111',
  factId: '22222222-2222-4222-8222-222222222222',
  accountId: '33333333-3333-4333-8333-333333333333',
  ledgerRevision: '1',
  occurredAt: '2026-08-26T02:30:00.000Z',
  timePrecision: 'INSTANT' as const,
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'a0',
  recordedAt: '2026-08-26T02:31:00.000Z',
  payloadVersion: 1,
  source: {
    category: 'MANUAL' as const,
    channel: 'desktop',
    externalId: 'command-1',
  },
  actorId: 'user-1',
};

describe('LedgerEvent V2 契约', () => {
  it('与领域层 LedgerEvent 类型保持双向兼容', () => {
    expectTypeOf<LedgerEventV2>().toMatchTypeOf<DomainLedgerEventV2>();
    expectTypeOf<DomainLedgerEventV2>().toMatchTypeOf<LedgerEventV2>();
  });

  it('接受使用十进制字符串和多币种费用的真实买入', () => {
    const parsed = ledgerEventEnvelopeSchemaV2.parse({
      ...baseEnvelope,
      type: 'BUY_EXECUTION',
      revisionAction: 'CREATE',
      payload: {
        symbol: 'AAPL.US',
        quantity: '1.25',
        price: '205.30',
        currency: 'USD',
        settledAt: '2026-08-28T02:30:00.000Z',
        capabilityVerification: 'VERIFIED',
        charges: [
          { category: 'COMMISSION', amount: '1.00', currency: 'USD' },
          { category: 'TAX', amount: '7.50', currency: 'HKD', description: '代扣税费' },
        ],
      },
    });

    expect(parsed.type).toBe('BUY_EXECUTION');
    expect(parsed.payload).toMatchObject({ quantity: '1.25', price: '205.30' });
  });

  it('接受日期级精度和明确经济排序键', () => {
    const parsed = ledgerEventEnvelopeSchemaV2.parse({
      ...baseEnvelope,
      occurredAt: '2025-06-01',
      timePrecision: 'DATE',
      economicOrderKey: 'a0V',
      type: 'SELL_EXECUTION',
      revisionAction: 'CREATE',
      payload: {
        symbol: '600519.SH',
        quantity: '100',
        price: '1450.00',
        currency: 'CNY',
        capabilityVerification: 'UNVERIFIED',
        charges: [],
      },
    });

    expect(parsed.timePrecision).toBe('DATE');
    expect(parsed.occurredAt).toBe('2025-06-01');
  });

  it('允许迁移事实保留未知来源时间精度和时区', () => {
    const parsed = ledgerEventEnvelopeSchemaV2.parse({
      ...baseEnvelope,
      timePrecision: 'UNKNOWN',
      sourceTimezone: 'UNKNOWN',
      type: 'BUY_EXECUTION',
      revisionAction: 'CREATE',
      payload: {
        symbol: 'AAPL.US',
        quantity: '1',
        price: '200',
        currency: 'USD',
        capabilityVerification: 'UNVERIFIED',
        charges: [],
      },
    });

    expect(parsed.timePrecision).toBe('UNKNOWN');
    expect(parsed.sourceTimezone).toBe('UNKNOWN');
  });

  it('拒绝数字类型、零价格和负数量', () => {
    const event = {
      ...baseEnvelope,
      type: 'BUY_EXECUTION',
      revisionAction: 'CREATE',
      payload: {
        symbol: 'AAPL.US',
        quantity: -1,
        price: '0',
        currency: 'USD',
        capabilityVerification: 'VERIFIED',
        charges: [],
      },
    };

    expect(() => ledgerEventEnvelopeSchemaV2.parse(event)).toThrow();
  });

  it('要求替代版本引用链末端并填写原因', () => {
    const replacement = {
      ...baseEnvelope,
      eventId: '44444444-4444-4444-8444-444444444444',
      type: 'BUY_EXECUTION',
      revisionAction: 'REPLACE',
      payload: {
        symbol: 'AAPL.US',
        quantity: '2',
        price: '200',
        currency: 'USD',
        capabilityVerification: 'VERIFIED',
        charges: [],
      },
    };

    expect(() => ledgerEventEnvelopeSchemaV2.parse(replacement)).toThrow('supersedesEventId');
    expect(() =>
      ledgerEventEnvelopeSchemaV2.parse({
        ...replacement,
        supersedesEventId: baseEnvelope.eventId,
      }),
    ).toThrow('reason');
  });

  it('作废版本不携带 payload，恢复版本必须携带完整 payload', () => {
    const voided = ledgerEventEnvelopeSchemaV2.parse({
      ...baseEnvelope,
      eventId: '44444444-4444-4444-8444-444444444444',
      type: 'BUY_EXECUTION',
      revisionAction: 'VOID',
      supersedesEventId: baseEnvelope.eventId,
      reason: '原成交重复导入',
    });
    expect(voided.revisionAction).toBe('VOID');
    expect('payload' in voided).toBe(false);

    expect(() =>
      ledgerEventEnvelopeSchemaV2.parse({
        ...baseEnvelope,
        eventId: '55555555-5555-4555-8555-555555555555',
        type: 'BUY_EXECUTION',
        revisionAction: 'RESTORE',
        supersedesEventId: voided.eventId,
        reason: '撤销误作废',
      }),
    ).toThrow();
  });

  it('验证 Baseline 对账和拆股的类型化载荷', () => {
    expect(
      ledgerEventEnvelopeSchemaV2.parse({
        ...baseEnvelope,
        type: 'BASELINE_RECONCILIATION',
        revisionAction: 'CREATE',
        payload: {
          symbol: '600519.SH',
          baselineFactId: '44444444-4444-4444-8444-444444444444',
          executionFactIds: ['55555555-5555-4555-8555-555555555555'],
          coveredQuantity: '50',
          coveredCost: '8500.00',
          ruleVersion: 1,
        },
      }).type,
    ).toBe('BASELINE_RECONCILIATION');

    expect(
      ledgerEventEnvelopeSchemaV2.parse({
        ...baseEnvelope,
        type: 'SPLIT',
        revisionAction: 'CREATE',
        payload: { symbol: 'AAPL.US', fromUnits: '1', toUnits: '4' },
      }).payload,
    ).toMatchObject({ fromUnits: '1', toUnits: '4' });
  });

  it.each([
    [
      'POSITION_BASELINE_OBSERVATION',
      {
        symbol: 'AAPL.US',
        batchId: '44444444-4444-4444-8444-444444444444',
        batchScope: 'FULL',
        quantity: '12.5',
        averageCost: '180.25',
        currency: 'USD',
        costIncludesFees: 'UNKNOWN',
      },
    ],
    [
      'CASH_BALANCE_OBSERVATION',
      { currency: 'USD', amount: '-125.50', capturedAt: '2026-08-26T02:30:00.000Z' },
    ],
    ['BONUS_SHARE', { symbol: '600519.SH', quantity: '10' }],
    ['MERGE', { symbol: 'AAPL.US', fromUnits: '4', toUnits: '1' }],
    [
      'DIVIDEND',
      {
        symbol: 'AAPL.US',
        amount: '5.25',
        currency: 'USD',
        settledAt: '2026-08-28T02:30:00.000Z',
      },
    ],
    [
      'CASH_FLOW',
      {
        direction: 'OUTFLOW',
        category: 'TRANSFER',
        amount: '500.00',
        currency: 'CNY',
        note: '旧现金划转迁移',
      },
    ],
  ] as const)('接受 %s 的专用载荷', (type, payload) => {
    const parsed = ledgerEventEnvelopeSchemaV2.parse({
      ...baseEnvelope,
      type,
      revisionAction: 'CREATE',
      payload,
    });

    expect(parsed.type).toBe(type);
  });

  it('拒绝事件类型与载荷字段混用', () => {
    expect(() =>
      ledgerEventEnvelopeSchemaV2.parse({
        ...baseEnvelope,
        type: 'DIVIDEND',
        revisionAction: 'CREATE',
        payload: {
          symbol: 'AAPL.US',
          quantity: '1',
          price: '200',
          currency: 'USD',
          capabilityVerification: 'VERIFIED',
          charges: [],
        },
      }),
    ).toThrow();
  });

  it('拒绝现金余额观察携带基线批次引用', () => {
    expect(() =>
      ledgerEventEnvelopeSchemaV2.parse({
        ...baseEnvelope,
        type: 'CASH_BALANCE_OBSERVATION',
        revisionAction: 'CREATE',
        payload: {
          currency: 'USD',
          amount: '100.00',
          batchId: '44444444-4444-4444-8444-444444444444',
        },
      }),
    ).toThrow();
  });
});

describe('账本命令错误码', () => {
  it('接受稳定错误码和字符串 Revision', () => {
    expect(
      ledgerCommandErrorSchemaV2.parse({
        errorCode: 'LEDGER_REVISION_CONFLICT',
        message: '账本已变更，请刷新后重试',
        accountId: baseEnvelope.accountId,
        currentLedgerRevision: '9007199254740993',
      }),
    ).toMatchObject({ currentLedgerRevision: '9007199254740993' });
  });

  it('拒绝未定义错误码和数字 Revision', () => {
    expect(() =>
      ledgerCommandErrorSchemaV2.parse({
        errorCode: 'CONFLICT',
        message: '冲突',
        currentLedgerRevision: 2,
      }),
    ).toThrow();
  });
});

describe('成交命令契约', () => {
  const command = {
    command: 'CREATE_EXECUTION' as const,
    accountId: baseEnvelope.accountId,
    occurredAt: baseEnvelope.occurredAt,
    timePrecision: baseEnvelope.timePrecision,
    sourceTimezone: baseEnvelope.sourceTimezone,
    economicOrderKey: baseEnvelope.economicOrderKey,
    side: 'BUY' as const,
    payload: {
      symbol: 'AAPL.US',
      quantity: '1',
      price: '200',
      currency: 'USD',
      capabilityVerification: 'VERIFIED' as const,
      charges: [],
    },
    source: baseEnvelope.source,
    actorId: baseEnvelope.actorId,
  };

  it('接受专用成交命令并要求稳定 externalId', () => {
    expect(createExecutionCommandSchemaV2.parse(command).side).toBe('BUY');
    expect(() =>
      createExecutionCommandSchemaV2.parse({
        ...command,
        source: { category: 'MANUAL', channel: 'desktop' },
      }),
    ).toThrow();
  });

  it('拒绝命令时间值与精度不一致', () => {
    expect(() =>
      createExecutionCommandSchemaV2.parse({
        ...command,
        occurredAt: '2026-08-26',
        timePrecision: 'INSTANT',
      }),
    ).toThrow('INSTANT');
  });

  it('跨账户更正必须使用两个不同账户与字符串 Revision', () => {
    expect(() =>
      moveExecutionAccountCommandSchemaV2.parse({
        ...command,
        command: 'MOVE_EXECUTION_ACCOUNT',
        sourceAccountId: baseEnvelope.accountId,
        targetAccountId: baseEnvelope.accountId,
        expectedSourceLedgerRevision: '1',
        expectedTargetLedgerRevision: 0,
        supersedesEventId: baseEnvelope.eventId,
        reason: '账户选错',
      }),
    ).toThrow();
  });

  it('命令响应保留超过 JavaScript 安全整数的版本', () => {
    expect(
      ledgerCommandResponseSchemaV2.parse({
        eventIds: [baseEnvelope.eventId],
        factIds: [baseEnvelope.factId],
        ledgerRevisions: { [baseEnvelope.accountId]: '9007199254740993' },
        projectionGenerations: { [baseEnvelope.accountId]: '9007199254740994' },
        affectedSymbols: ['AAPL.US'],
        idempotentReplay: false,
      }).ledgerRevisions[baseEnvelope.accountId],
    ).toBe('9007199254740993');
  });
});

describe('十进制字符串', () => {
  it('保留 Money 金额的原始十进制精度', () => {
    expect(moneySchemaV2.parse({ amount: '100.2300', currency: 'CNY' })).toEqual({
      amount: '100.2300',
      currency: 'CNY',
    });
  });

  it.each(['0', '0.00', '1', '1.2500', '-2.5'])(`接受 %s`, (value) =>
    expect(decimalStringSchema.parse(value)).toBe(value),
  );

  it.each(['1', '0.0001', '100.00'])(`接受正数 %s`, (value) =>
    expect(positiveDecimalStringSchema.parse(value)).toBe(value),
  );

  it.each(['', '01', '.5', '1.', 'NaN', 'Infinity', '0', '-1'])(`拒绝非正规范值 %s`, (value) =>
    expect(() => positiveDecimalStringSchema.parse(value)).toThrow(),
  );
});
