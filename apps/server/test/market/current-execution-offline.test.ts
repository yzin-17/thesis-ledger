import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { quoteSchema } from '@thesis-ledger/schemas';
import { MarketLiveExecutionReader } from '../../src/market/market-live-execution-reader.js';
import { readLiveResearchQuote } from '../../src/model-arena/live/live-research-quote.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';
import { DsaV3ProtocolError } from '../../src/integration/dsa/dsa-v3-protocol.js';
import { exerciseSzEtfState } from './sz-etf-offline-business.js';

afterEach(() => vi.useRealTimers());
it.skipIf(!process.env.ARENA_G03_DSA_ROOT)(
  '富途 SDK 字段经实际 Data HTTP 和 TS Schema 到竞技场研究入口，零网络和数据库尝试',
  async () => {
    const dsaRoot = process.env.ARENA_G03_DSA_ROOT!;
    const receipt = JSON.parse(
      execFileSync(
        resolve(dsaRoot, '.venv/bin/python'),
        [fileURLToPath(new URL('./fixtures/current-execution-offline.py', import.meta.url))],
        {
          cwd: dsaRoot,
          encoding: 'utf8',
          timeout: 15000,
          env: { ...process.env, PYTHONPATH: dsaRoot, PYTHONDONTWRITEBYTECODE: '1' },
        },
      ),
    );
    expect(receipt.deniedAttempts).toEqual([]);
    expect(receipt.quoteReads).toBe(1);
    const quote = quoteSchema.parse(receipt.quote);
    expect(quote).toMatchObject({
      symbol: '00700.HK',
      price: 336.4,
      units: { priceCurrency: 'HKD' },
      executionFacts: { market: 'HK', tradingState: 'normal', sharesPerLot: '100' },
    });
    expect(quote.executionRules).toBeUndefined();
    expect(
      quoteSchema.safeParse({
        ...quote,
        executionFacts: { ...quote.executionFacts, market: 'US' },
      }).success,
    ).toBe(false);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T01:31:37Z'));
    const market = {
      getQuote: vi.fn().mockResolvedValue(quote),
      getSession: vi.fn().mockResolvedValue({
        state: 'open',
        date: '2026-11-23',
        sessions: [
          {
            tradingDate: '2026-11-23',
            startAt: '2026-11-23T01:30:00Z',
            endAt: '2026-11-23T04:00:00Z',
          },
        ],
      }),
    };
    const status = { readComposition: vi.fn() };
    const dsa = {
      backtestInstrumentFacts: vi.fn(),
      effectiveControlPolicyV3: vi.fn().mockResolvedValue({
        projection: {
          effective: {
            enabled: true,
            revision: 202,
            routes: [
              {
                key: {
                  kind: 'data',
                  market: 'HK',
                  assetType: 'STOCK',
                  capability: 'HISTORICAL_PUBLIC_FEES',
                },
                enabled: true,
                targets: [
                  {
                    providerId: 'local-materials',
                    upstreamSource: 'local-materials',
                    routeIndex: 0,
                    eligible: true,
                  },
                ],
              },
            ],
          },
        },
      }),
      marketPublicFeesV3: vi
        .fn()
        .mockRejectedValue(new DsaV3ProtocolError('当前费用未覆盖腾讯', 'insufficient-coverage')),
      post: vi.fn(async (_path, body) => ({
        contractVersion: 1,
        consumer: 'thesis-ledger',
        requestId: body.requestId,
        symbol: '00700.HK',
        sharesPerLot: '100',
        historicalChanges: 'unverified',
        fetchedAt: quote.fetchedAt,
        policyRevision: 202,
        routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
        source: {
          provider: 'futu',
          sourceUrl: 'https://openapi.futunn.com/futu-api-doc/quote/get-static-info.html',
          sha256: 'a'.repeat(64),
          observedAt: quote.fetchedAt,
        },
      })),
    };
    const reader = new MarketLiveExecutionReader(
      market as never,
      { read: vi.fn() },
      status,
      { read: vi.fn() },
      dsa as never,
    );
    const value = await readLiveResearchQuote(
      liveProtocolFixture({ market: 'HK', currency: 'HKD', timeZone: 'Asia/Hong_Kong' }),
      '00700.HK',
      'STOCK',
      new AbortController().signal,
      market,
      reader,
    );
    expect(value).toMatchObject({
      units: { priceCurrency: 'HKD' },
      executionFacts: { tradingState: 'normal' },
      orderRuleReference: {
        boardLot: { sharesPerLot: '100' },
        spreadTable: { incrementAtQuote: '0.2' },
      },
      execution: {
        status: 'unavailable',
        reason: 'execution_rules_unavailable',
        diagnostics: expect.arrayContaining([
          {
            field: 'HISTORICAL_PUBLIC_FEES',
            status: 'unavailable',
            reason: 'insufficient-coverage',
          },
          { field: 'cashSettlement', status: 'unavailable', reason: 'unsupported-capability' },
        ]),
      },
    });
    expect(status.readComposition).not.toHaveBeenCalled();
    expect(dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
    expect(dsa.marketPublicFeesV3).toHaveBeenCalledTimes(1);
    await exerciseSzEtfState(receipt.szEtfState, receipt.szEtfFacts);
    const sampled = new MarketLiveExecutionReader(market as never, { read: vi.fn().mockResolvedValue({
      status: 'ready', calendar: { sessions: [{ tradingDate: '2026-11-23',
        startAt: '2026-11-23T01:30:00Z', endAt: '2026-11-23T08:00:00Z' }] },
    }) }, status, { read: vi.fn() }, dsa as never);
    const research = await readLiveResearchQuote(liveProtocolFixture({ simulationPolicy: 'sampled-v1',
      market: 'HK', currency: 'HKD', timeZone: 'Asia/Hong_Kong' }), '00700.HK', 'STOCK',
      new AbortController().signal, market, sampled);
    expect(research).toMatchObject({ execution: { status: 'available', price: '336.4' } });
    expect(dsa.marketPublicFeesV3).toHaveBeenCalledTimes(1);
  },
);
