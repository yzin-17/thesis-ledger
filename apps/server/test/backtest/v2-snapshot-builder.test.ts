import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BacktestCapabilities, StrategySchemaV2 } from '@thesis-ledger/schemas';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';

const temporaryDirectories: string[] = [];

const fixture = async <T>(name: string): Promise<T> =>
  JSON.parse(
    await readFile(
      new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url),
      'utf8',
    ),
  ) as T;

const runConfig = {
  startDate: '2024-01-02',
  endDate: '2024-01-03',
  dataAsOf: '2026-09-09T08:45:00Z',
  baseCurrency: 'CNY' as const,
  initialCash: { CNY: '1000000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '15:00',
    pricePolicy: 'latestAvailable' as const,
    fxPolicy: 'latestAvailable' as const,
  },
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('DsaSnapshotBuilder dependency-scoped facts', () => {
  it('freezes trusted empty corporate-action coverage without inventing a fact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backtest-v2-builder-'));
    temporaryDirectories.push(root);
    const strategyFixture = await fixture<StrategySchemaV2>('backtest-v2.exchange.json');
    const strategy = { ...strategyFixture, signalSources: [strategyFixture.signalSources[0]!] };
    const capabilities = await fixture<BacktestCapabilities>('backtest-v2.capabilities.json');
    const dsa = {
      backtestCapabilities: vi.fn().mockResolvedValue(capabilities),
      backtestBars: vi.fn().mockResolvedValue([
        {
          symbol: '600519.SH',
          market: 'CN',
          timeframe: '1d',
          occurredAt: '2024-01-02T07:00:00Z',
          availableAt: '2024-01-02T07:00:00Z',
          open: '10',
          high: '11',
          low: '9',
          close: '10.5',
          volume: '1000',
          provider: 'akshare',
          providerRevision: 'bars-v1',
          quality: 'complete',
        },
      ]),
      backtestCalendar: vi.fn().mockResolvedValue({
        version: 2,
        status: 'supported',
        provider: 'exchange-calendars',
        providerRevision: 'exchange-calendars-4',
        coverage: { start: '2023-12-25', end: '2024-01-03', complete: true },
        facts: [
          {
            market: 'CN',
            timezone: 'Asia/Shanghai',
            provider: 'exchange-calendars',
            providerRevision: 'exchange-calendars-4',
            availableAt: '2024-01-01T00:00:00Z',
            sessions: [
              { startMinute: 570, endMinute: 690 },
              { startMinute: 780, endMinute: 900 },
            ],
            sessionOverrides: [],
            holidays: ['2024-01-01'],
            range: { start: '2023-12-25', end: '2024-01-03' },
          },
        ],
      }),
      backtestInstrumentFacts: vi.fn().mockResolvedValue({
        version: 2,
        status: 'supported',
        provider: 'cn-market-rules',
        providerRevision: 'cn-stock-v1',
        coverage: { start: null, end: null, complete: true },
        facts: [
          {
            symbol: '600519.SH',
            market: 'CN',
            instrumentType: 'STOCK',
            currency: 'CNY',
            lotSize: '100',
            tickSize: '0.01',
            tradable: true,
            provider: 'cn-market-rules',
            providerRevision: 'cn-stock-v1',
            occurredAt: '2020-01-01T00:00:00Z',
            availableAt: '2020-01-01T00:00:00Z',
          },
        ],
      }),
      backtestCorporateActions: vi.fn().mockResolvedValue({
        version: 2,
        status: 'supported',
        provider: 'akshare',
        providerRevision: 'akshare-corporate-actions-v1',
        coverage: { start: '2023-12-25', end: '2024-01-03', complete: true },
        facts: [],
        reason: null,
      }),
    } as unknown as DsaClient;
    const builder = new DsaSnapshotBuilder(dsa, new LocalSnapshotStore(root));

    const result = await builder.build({
      runId: '11111111-1111-4111-8111-111111111111',
      strategyVersionId: '22222222-2222-4222-8222-222222222222',
      strategyVersionHash: 'strategy-hash',
      strategy,
      runConfig,
    });

    expect(result.manifest.status).toBe('finalized');
    expect(
      result.artifactRefs.some((artifact) => artifact.key.includes('empty-corporateActions')),
    ).toBe(true);
    expect(dsa.backtestCorporateActions).toHaveBeenCalledOnce();
  });

  it('rejects an empty corporate-action response without complete coverage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backtest-v2-builder-'));
    temporaryDirectories.push(root);
    const strategyFixture = await fixture<StrategySchemaV2>('backtest-v2.exchange.json');
    const strategy = { ...strategyFixture, signalSources: [strategyFixture.signalSources[0]!] };
    const capabilities = await fixture<BacktestCapabilities>('backtest-v2.capabilities.json');
    const dsa = {
      backtestCapabilities: vi.fn().mockResolvedValue(capabilities),
      backtestBars: vi.fn().mockResolvedValue([]),
      backtestCalendar: vi.fn(),
      backtestInstrumentFacts: vi.fn(),
      backtestCorporateActions: vi.fn().mockResolvedValue({
        version: 2,
        status: 'unavailable',
        provider: 'akshare',
        providerRevision: 'akshare-corporate-actions-v1',
        coverage: { start: '2023-12-25', end: '2024-01-03', complete: false },
        facts: [],
        reason: 'Provider 未确认公司行动覆盖完整性',
      }),
    } as unknown as DsaClient;
    const builder = new DsaSnapshotBuilder(dsa, new LocalSnapshotStore(root));

    await expect(
      builder.build({
        runId: '33333333-3333-4333-8333-333333333333',
        strategyVersionId: '44444444-4444-4444-8444-444444444444',
        strategyVersionHash: 'strategy-hash',
        strategy,
        runConfig,
      }),
    ).rejects.toThrow('Provider 未确认公司行动覆盖完整性');
  });
});
