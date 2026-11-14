import { describe, expect, it } from 'vitest';
import { instrumentConfirmationPresentation } from '../src/instrument-confirmation.js';
import { instrumentSearchResultSchema } from '@thesis-ledger/schemas';

describe('目录确认中文状态', () => {
  it('确认能力保留，只有明确已保存才显示已确认', () => {
    expect(instrumentConfirmationPresentation({ confirmable: true, confirmed: false }).label).toBe('确认标的');
    expect(instrumentConfirmationPresentation({ confirmable: true }).status).toBe('unconfirmed');
    expect(instrumentConfirmationPresentation({ confirmable: true, confirmed: true }).label).toBe('已确认');
    const unsupported = instrumentConfirmationPresentation({ confirmable: false, confirmed: true, disabledReason: 'unsupported_market' });
    expect(unsupported).toMatchObject({ status: 'unsupported', label: '不支持关联', description: '当前市场暂不支持持仓关联。' });
    expect(instrumentConfirmationPresentation({ confirmable: false, disabledReason: 'unsupported_instrument_type' }).description).toContain('证券类型');
  });

  it('搜索合同兼容旧响应，同时保留明确的布尔状态并拒绝无效值', () => {
    const row = { id: '11111111-1111-4111-8111-111111111111', symbol: '600036.SH', canonicalCode: '600036',
      displayName: '招商银行', market: 'SH', instrumentType: 'STOCK', confirmable: true, disabledReason: null, active: true, generation: 1 };
    expect(instrumentSearchResultSchema.parse({ ...row, confirmed: true }).confirmed).toBe(true);
    expect(instrumentSearchResultSchema.parse(row).confirmed).toBeUndefined();
    expect(instrumentSearchResultSchema.safeParse({ ...row, confirmed: 'true' }).success).toBe(false);
  });
});
