import { describe, expect, it } from 'vitest';
import { journalDraftPriceErrors } from '../src/features/journal/review/JournalDraftSheet.js';

describe('复盘新草稿计划价格', () => {
  it.each(['plannedEntry', 'plannedExit', 'stopLoss'] as const)('%s 的非法价格就近标记', (key) => {
    for (const value of ['-1', '0', '0.000', '-0', 'NaN', 'Infinity', '1e2', 'abc'])
      expect(journalDraftPriceErrors({ [key]: value })[key]).toContain('大于零');
  });
  it('空值可用，合法十进制保留原精度，不转为浮点数', () => {
    expect(journalDraftPriceErrors({})).toEqual({});
    expect(journalDraftPriceErrors({ plannedEntry: null, stopLoss: undefined })).toEqual({});
    expect(
      journalDraftPriceErrors({
        plannedEntry: '0.00000000000000000000000001',
        plannedExit: '123.456789',
      }),
    ).toEqual({});
  });
});
