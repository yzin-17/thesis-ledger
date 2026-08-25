import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerContractError } from '@thesis-ledger/api-client';
import type { DesktopRequestClient } from '../src/features/shared/request.js';
import {
  analyzeBehavior,
  analyzeSingleTrade,
  explainSingleTrade,
  fetchReviewCandidates,
} from '../src/features/journal/journal.api.js';
import { journalKeys } from '../src/features/journal/journal.queries.js';
import type { ReviewTrade } from '../src/features/journal/journal.types.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const trade: ReviewTrade = {
  symbol: '600519.SH',
  entryAt: '2026-01-02T09:30:00.000Z',
  exitAt: '2026-01-06T09:30:00.000Z',
  pnl: -120,
  plannedStop: 1400,
};

const candidateResponse = {
  items: [
    {
      id: 'review:account-1:600519.SH:entry:sell',
      accountId,
      symbol: trade.symbol,
      entryAt: trade.entryAt,
      exitAt: trade.exitAt,
      pnl: trade.pnl,
      quantity: 100,
      plan: null,
      evidenceCompleteness: 'actual-only' as const,
      missingEvidence: ['交易计划'],
      sources: { entryEventIds: [], exitEventIds: [], journalEntryIds: [] },
    },
  ],
  total: 1,
  nextCursor: null,
};

const clientFor = (response: unknown) => {
  const request = vi.fn(async <T>(path: string) => {
    if (path.startsWith('/journal/review-candidates')) return response as T;
    return {} as T;
  });
  return { client: { request } as unknown as DesktopRequestClient, request };
};

describe('投资复盘 Desktop 数据访问契约', () => {
  it('候选读取携带账户、窗口、标的和分页，并区分响应契约错误', async () => {
    const { client, request } = clientFor(candidateResponse);
    await fetchReviewCandidates(
      {
        accountId,
        symbol: '600519.SH',
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-31T23:59:59.000Z',
        cursor: 'cursor-1',
        limit: 20,
      },
      client,
    );
    expect(request).toHaveBeenCalledWith(
      '/journal/review-candidates?accountId=11111111-1111-4111-8111-111111111111&symbol=600519.SH&start=2026-01-01T00%3A00%3A00.000Z&end=2026-01-31T23%3A59%3A59.000Z&cursor=cursor-1&limit=20',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(journalKeys.candidates({ accountId, start: 'a' })).not.toEqual(
      journalKeys.candidates({ accountId, start: 'b' }),
    );

    const invalid = clientFor({ items: [], total: 'bad', nextCursor: null });
    await expect(fetchReviewCandidates({ accountId }, invalid.client)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });

  it('确定性分析与 AI 解读是独立请求，周期分析携带显式窗口', async () => {
    const { client, request } = clientFor({});
    await analyzeSingleTrade(trade, client);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/journal/analysis/planned-vs-actual',
      '/journal/analysis/behavior',
      '/journal/analysis/counterfactual',
    ]);

    request.mockClear();
    await explainSingleTrade(
      trade,
      { plannedVsActual: {}, behavior: {}, counterfactual: {} },
      client,
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe('/ai/runs');

    request.mockClear();
    await analyzeBehavior(
      [trade],
      { start: '2026-01-01T00:00:00.000Z', end: '2026-01-31T23:59:59.000Z' },
      client,
    );
    expect(request).toHaveBeenCalledWith('/journal/analysis/review', expect.anything());
    expect(JSON.parse(request.mock.calls[1]?.[1]?.body as string)).toMatchObject({
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-31T23:59:59.000Z',
    });
  });
});
