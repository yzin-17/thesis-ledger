import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const positionId = '00000000-0000-4000-8000-000000000002';

const valuation = {
  positions: [
    {
      id: positionId,
      accountId,
      symbol: '600519.SH',
      quantity: 1,
      costPrice: 10,
      marketPrice: 11,
      marketValue: 11,
      costValue: 10,
      pnl: 1,
      pnlRatio: 0.1,
      stale: false,
    },
  ],
  cashValue: 5,
  cashByAccount: [{ accountId, amount: 5 }],
  totalCost: 10,
  totalMarketValue: 16,
  totalPnl: 1,
  partial: false,
  mode: 'actual',
  valuedAt: '2026-08-20T00:00:00.000Z',
};

describe('ThesisLedgerApiClient', () => {
  it('保留带路径的 API 基址并清理请求路径前导斜杠', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await client.request('/portfolio/valuation?t=1');

    const [request, init] = fetcher.mock.calls[0] ?? [];
    expect(String(request)).toBe('https://thesis-ledger.test/api/v1/portfolio/valuation?t=1');
    expect(init).toEqual(
      expect.objectContaining({ headers: { 'content-type': 'application/json' } }),
    );
  });

  it('默认 fetch 保留全局上下文', async () => {
    const fetcher = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new Error('fetch receiver mismatch');
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetcher);

    try {
      const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1');

      await expect(client.request('/health')).resolves.toEqual({ ok: true });
      expect(fetcher).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('FormData 请求不强制写入 JSON Content-Type', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    const body = new FormData();
    body.set('file', new Blob(['fixture']), 'fixture.png');

    await client.request('/imports/screenshot', { method: 'POST', body });

    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.body).toBe(body);
    expect(init?.headers).toBeUndefined();
  });

  it('typed portfolio endpoint validates the shared response schema', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(valuation), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.portfolio.getValuation({ mode: 'actual' })).resolves.toMatchObject({
      cashValue: 5,
      totalMarketValue: 16,
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/portfolio/valuation?mode=actual');
  });

  it('typed endpoint rejects malformed successful responses instead of normalizing them', async () => {
    const malformed = { ...valuation } as Record<string, unknown>;
    delete malformed.cashValue;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.portfolio.getValuation()).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });

  it('typed journal endpoint validates and serializes review candidate queries', async () => {
    const candidate = {
      id: `review:${accountId}:600519.SH:buy-1:sell-1`,
      accountId,
      accountMode: 'actual',
      reviewObjectType: 'TRADE_CYCLE',
      reviewObjectId: 'trade:account:600519.SH:buy-1',
      tradeId: 'trade:account:600519.SH:buy-1',
      reviewStatus: 'CURRENT',
      stale: false,
      statisticsEligible: true,
      excludedReasons: [],
      symbol: '600519.SH',
      entryAt: '2026-08-01T09:30:00.000Z',
      exitAt: '2026-08-03T09:30:00.000Z',
      pnl: 187,
      quantity: 100,
      entryPrice: 10,
      exitPrice: 12,
      actualExit: 12,
      turnover: 2200,
      plannedStop: 9,
      plannedHoldingDays: 2,
      plannedEntry: 10,
      plannedExit: 13,
      targetWeight: 0.1,
      plan: {
        id: '00000000-0000-4000-8000-000000000003',
        plannedEntry: 10,
        plannedExit: 13,
        stopLoss: 9,
        takeProfit: 13,
        targetWeight: 0.1,
        expectedHoldingDays: 2,
        plannedEntryAt: '2026-08-01T09:30:00.000Z',
        plannedExitAt: '2026-08-03T09:30:00.000Z',
        status: 'executed',
      },
      evidenceCompleteness: 'complete',
      missingEvidence: [],
      sources: {
        entryEventIds: ['00000000-0000-4000-8000-000000000004'],
        exitEventIds: ['00000000-0000-4000-8000-000000000005'],
        journalEntryIds: ['00000000-0000-4000-8000-000000000006'],
        planId: '00000000-0000-4000-8000-000000000003',
      },
      projection: {
        ledgerRevision: '1',
        projectionGeneration: '1',
        projectionFingerprint: 'fingerprint-1',
        factIds: ['00000000-0000-4000-8000-000000000004'],
        eventIds: ['00000000-0000-4000-8000-000000000005'],
        fxEvidenceVersion: null,
        conversionFingerprint: null,
      },
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [candidate], total: 1, nextCursor: null, legacyItems: [] }),
        {
          status: 200,
        },
      ),
    );
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(
      client.journal.getReviewCandidates({
        accountId,
        start: '2026-08-01T00:00:00.000Z',
        end: '2026-08-31T00:00:00.000Z',
        limit: 10,
      }),
    ).resolves.toMatchObject({ total: 1, items: [{ symbol: '600519.SH' }] });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      '/journal/review-candidates?accountId=00000000-0000-4000-8000-000000000001&start=2026-08-01T00%3A00%3A00.000Z&end=2026-08-31T00%3A00%3A00.000Z&limit=10',
    );
  });

  it('typed ledger endpoint validates reconciliation preview and posts confirmation', async () => {
    const response = {
      eventIds: ['00000000-0000-4000-8000-000000000003'],
      factIds: ['00000000-0000-4000-8000-000000000004'],
      ledgerRevisions: { [accountId]: '3' },
      projectionGenerations: { [accountId]: '3' },
      affectedSymbols: ['600519.SH'],
      idempotentReplay: false,
    };
    const preview = { accountId, ruleVersion: 1, checkpoints: [], candidates: [] };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.ledger.getReconciliationCandidates(accountId)).resolves.toEqual(preview);
    await expect(
      client.ledger.confirmBaselineReconciliation({
        command: 'CONFIRM_BASELINE_RECONCILIATION',
        accountId,
        baselineFactId: '00000000-0000-4000-8000-000000000005',
        executionFactIds: ['00000000-0000-4000-8000-000000000006'],
        coveredQuantity: '10',
        coveredCost: '100',
        ruleVersion: 1,
        expectedLedgerRevision: '2',
        source: { category: 'MANUAL', channel: 'desktop', externalId: 'reconcile-1' },
        actorId: 'user-1',
        reason: '确认历史成交覆盖',
      }),
    ).resolves.toEqual(response);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      `/ledger/${accountId}/reconciliation-candidates`,
    );
    expect(fetcher.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('CONFIRM_BASELINE_RECONCILIATION'),
      }),
    );
  });

  it('typed V2 command and Trade 查询使用专用路径并校验十进制字符串契约', async () => {
    const commandResponse = {
      eventIds: ['00000000-0000-4000-8000-000000000003'],
      factIds: ['00000000-0000-4000-8000-000000000004'],
      ledgerRevisions: { [accountId]: '1' },
      projectionGenerations: { [accountId]: '1' },
      affectedSymbols: ['AAPL.US'],
      idempotentReplay: false,
    };
    const tradeResponse = {
      accountId,
      mode: 'actual',
      items: [
        {
          id: 'trade:trade-projection-v1:account:AAPL.US:fact',
          accountId,
          accountMode: 'actual',
          symbol: 'AAPL.US',
          lifecycle: 'ACTIVE',
          exitProgress: 'NONE',
          endEvidence: 'UNKNOWN',
          openedAt: '2026-08-26T02:30:00.000Z',
          closedAt: null,
          earliestEvidenceAt: '2026-08-26T02:30:00.000Z',
          sourceQuantity: '1.25',
          closedQuantity: '0',
          remainingQuantity: '1.25',
          grossRealizedPnl: null,
          netRealizedPnl: null,
          realizedNetReturnRate: null,
          costEstimated: false,
          completeness: 'COMPLETE',
          issues: [],
          costIssues: [],
          algorithmVersion: 'trade-projection-v1',
          projectionFingerprint: null,
          projectionGeneration: '1',
          excludedReasons: ['LIFECYCLE_ACTIVE'],
        },
      ],
      nextCursor: null,
      projectionGenerations: { [accountId]: '1' },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(commandResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(tradeResponse), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(
      client.ledger.createExecution({
        command: 'CREATE_EXECUTION',
        accountId,
        occurredAt: '2026-08-26T02:30:00.000Z',
        timePrecision: 'INSTANT',
        sourceTimezone: 'Asia/Shanghai',
        economicOrderKey: 'buy-1',
        side: 'BUY',
        payload: {
          symbol: 'AAPL.US',
          quantity: '1.25',
          price: '205.30',
          currency: 'USD',
          capabilityVerification: 'VERIFIED',
          charges: [],
        },
        source: { category: 'MANUAL', channel: 'desktop', externalId: 'buy-1' },
        actorId: 'user-1',
      }),
    ).resolves.toEqual(commandResponse);
    await expect(
      client.portfolio.getTrades({ accountId, mode: 'actual', limit: 10 }),
    ).resolves.toMatchObject({ items: [{ sourceQuantity: '1.25' }] });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/ledger/executions');
    expect(String(fetcher.mock.calls[1]?.[0])).toContain(
      `/portfolio/trades?accountId=${accountId}&mode=actual&limit=10`,
    );
  });

  it('通过共享 API Client 请求行情详情并保留 AbortSignal', async () => {
    const detail = {
      version: 1,
      symbol: '600519.SH',
      assetType: 'STOCK',
      identity: { source: 'asset', status: 'confirmed' },
      requested: ['quote', 'bars'],
      capabilities: {
        supported: ['quote', 'bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI', 'chip'],
        unsupported: ['fund-nav'],
      },
      limits: { bars: 30, nav: 30 },
      sections: {
        quote: { capability: 'quote', status: 'empty', data: null },
        bars: { capability: 'bars', status: 'empty', data: [] },
      },
      dependencies: {},
      requestId: 'trace-1',
      generatedAt: '2026-08-21T00:00:00.000Z',
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(detail), { status: 200 }));
    const signal = new AbortController().signal;
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(
      client.market.getDetail('600519.SH', {
        include: ['quote', 'bars'],
        barsLimit: 30,
        refresh: true,
        signal,
      }),
    ).resolves.toMatchObject({ symbol: '600519.SH', assetType: 'STOCK' });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      '/market/600519.SH/detail?barsLimit=30&refresh=1&include=quote%2Cbars',
    );
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal }));
  });

  it('将非 2xx 响应转换为共享错误模型', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'offline', message: '服务不可用' }), { status: 503 }),
      );
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.request('/health')).rejects.toThrow('ThesisLedger API 503: 服务不可用');
  });
});
