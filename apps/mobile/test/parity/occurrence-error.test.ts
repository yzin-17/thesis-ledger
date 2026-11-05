import { describe, expect, it } from 'vitest';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { occurrenceRequiresReload } from '../../src/features/recurring-plans/occurrence-error';

describe('定投确认错误恢复', () => {
  it('现金不足不锁定为旧版本，用户可保留输入并补足资金重试', () => {
    expect(
      occurrenceRequiresReload(
        new ThesisLedgerApiError(409, {
          error: 'conflict',
          errorCode: 'LEDGER_INSUFFICIENT_CASH',
          message: '可用现金余额不足',
        }),
      ),
    ).toBe(false);
  });
  it('版本冲突仍需显式重读，其他错误不冒充版本冲突', () => {
    expect(
      occurrenceRequiresReload(
        new ThesisLedgerApiError(409, {
          error: 'conflict',
          errorCode: 'FUND_INVESTMENT_PLAN_VERSION_CONFLICT',
          message: '版本已变化',
        }),
      ),
    ).toBe(true);
    expect(occurrenceRequiresReload(new Error('network unavailable'))).toBe(false);
  });
});
