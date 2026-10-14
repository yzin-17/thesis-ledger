import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backtestUnknownListingWarningV3 } from '@thesis-ledger/schemas';
import { backtestListingWarningsV3 } from '../../src/backtest/backtest-listing-disclosure-v3.js';

const proof = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json',
      import.meta.url,
    ),
    'utf8',
  ),
).coverageProof;

describe('冻结上市信息说明', () => {
  it('已知上市信息不增加警告，未知信息只返回固定中文说明', () => {
    expect(backtestListingWarningsV3({ coverageProof: JSON.stringify(proof) })).toEqual([]);
    const row = Object.freeze({
      coverageProof: JSON.stringify({
        ...proof,
        listing: { symbol: '600519.SH', status: 'unknown' },
      }),
    });
    expect(backtestListingWarningsV3(row)).toEqual([backtestUnknownListingWarningV3]);
    expect(backtestListingWarningsV3(row)).toEqual([
      '未获取上市日期，未验证回测窗口与上市日期的边界关系',
    ]);
  });

  it.each([undefined, {}, { coverageProof: 'invalid' }, { coverageProof: '{}' }])(
    '无效冻结信息不能作为非阻断说明接受',
    (row) => {
      expect(() => backtestListingWarningsV3(row)).toThrow();
    },
  );

  it('未知信息附带上市日期仍拒绝，不用说明掩盖错误', () => {
    expect(() =>
      backtestListingWarningsV3({
        coverageProof: JSON.stringify({
          ...proof,
          listing: { symbol: '600519.SH', status: 'unknown', firstTradingDate: '2026-05-18' },
        }),
      }),
    ).toThrow();
  });
});
