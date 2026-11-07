import { describe, expect, it } from 'vitest';
import {
  referenceContractChoices,
  referenceContractReadInput,
  isReferenceOptionUnderlying,
} from '../src/market-reference-contracts.js';
import type { MarketReferenceResult } from '@thesis-ledger/schemas';
const page = (
  dataset: MarketReferenceResult['dataset'],
  rows: Array<Record<string, string | null>>,
) => ({
  dataset,
  start: '2026-11-06',
  fetchedAt: '2026-11-07T01:00:00Z',
  items: rows.map((values, index) => ({ id: String(index), values })),
});
describe('Market Reference observed contract choices', () => {
  it('keeps source product/date/exchange and normalizes case without inventing contracts or a market suffix', () => {
    const result = referenceContractChoices(
      page('futures-daily-shfe', [
        { contract: 'cu2611', product: '铜', date: '2026-11-06', exchange: '上期所' },
        { contract: 'cu2611', product: '铜', date: '2026-11-06' },
        { contract: 'TA611', product: 'TA' },
        { contract: 'RB0' },
        { contract: 'cu2613' },
      ]),
    );
    expect(result).toEqual([
      {
        id: 'futures-daily-shfe:0',
        value: 'CU2611',
        label: '铜 · CU2611',
        description: '上期所 · 2026-11-06',
      },
    ]);
  });
  it('keeps the exact observed option code and near-month metadata, and excludes unrelated source rows', () => {
    expect(
      referenceContractChoices(
        page('etf-option-contracts', [
          { contract: '10012637', underlying: '510050.SH', month: '2026-11', optionType: '认购' },
          { contract: '10012637.SH' },
        ]),
      ),
    ).toEqual([
      {
        id: 'etf-option-contracts:0',
        value: '10012637',
        label: '10012637',
        description: '510050.SH · 2026-11 · 认购',
      },
    ]);
    expect(referenceContractChoices(page('financial-balance', [{ contract: '10012637' }]))).toEqual(
      [],
    );
  });
  it('limits reads to a single explicit date and 20 rows; underlying restrictions remain in the existing schema', () => {
    expect(referenceContractReadInput('futures-daily-shfe', '2026-11-06', '')).toMatchObject({
      symbol: null,
      start: '2026-11-06',
      end: '2026-11-06',
      page: 1,
      pageSize: 20,
    });
    expect(() => referenceContractReadInput('futures-daily-shfe', '', '')).toThrow();
    expect(referenceContractReadInput('etf-option-contracts', '', '510050.SH')).toMatchObject({
      symbol: '510050.SH',
      start: null,
      end: null,
    });
    expect(isReferenceOptionUnderlying('159915.SZ')).toBe(false);
    expect(() => referenceContractReadInput('etf-option-contracts', '', '159915.SZ')).toThrow();
  });
});
