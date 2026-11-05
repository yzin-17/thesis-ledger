import { describe, expect, it } from 'vitest';
import type { LedgerEvent } from '@thesis-ledger/api-client';
import type { ExecutionEvent } from '../src/features/account-data/account-data.types.js';
import {
  executionDetailLabel,
  sourceChannelLabel,
  transactionAmount,
} from '../src/features/account-data/account-data.helpers.js';
import { fundInvestmentOccurrenceId } from '../src/features/account-data/account-data.fund-investment.display.js';

const execution = {
  type: 'BUY_EXECUTION',
  revisionAction: 'CREATE',
  payload: { symbol: '000001.OF', quantity: '80', price: '1.25', currency: 'CNY' },
} as ExecutionEvent;

describe('账本记录的金额、数量和来源投影', () => {
  it('基金成交带份额和净值，其他标的明确数量与成交价', () => {
    expect(executionDetailLabel(execution)).toBe('买入 80 份 · 单位净值 ¥1.25');
    expect(
      executionDetailLabel({
        ...execution,
        payload: { ...execution.payload, symbol: 'AAPL.US', currency: 'USD' },
      }),
    ).toBe('买入 · 数量 80 · 成交价 US$1.25');
    expect(transactionAmount(execution, execution)).toBe('¥100');
  });

  it('原始十进制精度不经过浮点乘法，非法金额不回退为货币数量', () => {
    const precise = {
      ...execution,
      payload: { ...execution.payload, quantity: '9007199254740993', price: '0.00000001' },
    };
    expect(transactionAmount(precise, precise)).toBe('¥90071992.54740993');
    const invalid = { ...execution, payload: { ...execution.payload, price: 'unknown' } };
    expect(transactionAmount(invalid, invalid)).toBe('金额暂不可用');
  });

  it('无成本的持仓快照明确展示数量，有币种的现金快照明确展示金额', () => {
    expect(
      transactionAmount(
        {
          type: 'POSITION_BASELINE_OBSERVATION',
          revisionAction: 'CREATE',
          payload: { symbol: '000001.OF', quantity: '90', currency: 'CNY' },
        } as LedgerEvent,
        null,
      ),
    ).toBe('90 份');
    expect(
      transactionAmount(
        {
          type: 'CASH_BALANCE_OBSERVATION',
          revisionAction: 'CREATE',
          payload: { amount: '123.45678901', currency: 'HKD' },
        } as LedgerEvent,
        null,
      ),
    ).toBe('HK$123.45678901');
  });

  it('定投来源只通过稳定标识关联，不根据其他渠道或说明猜测', () => {
    const source = {
      category: 'MANUAL' as const,
      channel: 'recurring-fund-investment',
      externalId: 'fund-investment-occurrence:occurrence-1',
    };
    expect(sourceChannelLabel(source.channel)).toBe('基金定投');
    expect(fundInvestmentOccurrenceId(source)).toBe('occurrence-1');
    expect(fundInvestmentOccurrenceId({ ...source, channel: 'manual' })).toBeNull();
    expect(fundInvestmentOccurrenceId({ ...source, externalId: 'unknown' })).toBeNull();
  });

  it('其他事件把分红金额、送股数量和拆分比例明确区分', () => {
    expect(
      transactionAmount(
        {
          type: 'DIVIDEND',
          revisionAction: 'CREATE',
          payload: { amount: '1.23456789', currency: 'USD' },
        } as LedgerEvent,
        null,
      ),
    ).toBe('US$1.23456789');
    expect(
      transactionAmount(
        {
          type: 'BONUS_SHARE',
          revisionAction: 'CREATE',
          payload: { quantity: '10' },
        } as LedgerEvent,
        null,
      ),
    ).toBe('数量 10');
    expect(
      transactionAmount(
        {
          type: 'SPLIT',
          revisionAction: 'CREATE',
          payload: { fromUnits: '1', toUnits: '2' },
        } as LedgerEvent,
        null,
      ),
    ).toBe('比例 1 : 2');
  });
});
