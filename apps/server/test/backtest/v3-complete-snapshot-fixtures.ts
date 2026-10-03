import { vi } from 'vitest';
import type {
  BacktestCalendarResponse,
  BacktestInstrumentFactsResponse,
} from '@thesis-ledger/schemas';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { buildInput, makeReaderResult } from './v3-snapshot-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';

export const completeSnapshotFixture = async () => {
  const { input } = await buildInput();
  input.runConfig.priceInputBindings = {
    signals: [{ sourceId: 'execution', binding: 'execution-series' }],
    benchmark: { binding: 'execution-series' },
  };
  input.strategy.entry = {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'execution', field: 'close' },
    right: {
      type: 'indicator',
      name: 'MA',
      input: { type: 'series', sourceId: 'execution', field: 'close' },
      params: { period: 5 },
    },
  };
  const dsa = {
    backtestCalendar: vi.fn(
      async (
        request: Parameters<DsaClient['backtestCalendar']>[0],
      ): Promise<BacktestCalendarResponse> => ({
        version: 3,
        status: 'supported',
        provider: 'fixture-calendar',
        providerRevision: 'calendar-v1',
        coverage: { start: request.start, end: request.end, complete: true },
        facts: [
          {
            market: 'CN',
            timezone: 'Asia/Shanghai',
            provider: 'fixture-calendar',
            providerRevision: 'calendar-v1',
            availableAt: '2025-12-31T00:00:00Z',
            sessions: [
              { startMinute: 570, endMinute: 690 },
              { startMinute: 780, endMinute: 900 },
            ],
            sessionOverrides: [],
            holidays: [],
            range: { start: request.start, end: request.end },
          },
        ],
      }),
    ),
    backtestInstrumentFacts: vi.fn(
      async (
        request: Parameters<DsaClient['backtestInstrumentFacts']>[0],
      ): Promise<BacktestInstrumentFactsResponse> => {
        const result = await makeReaderResult({
          symbol: request.symbol,
          market: request.market,
          routeKey: {
            kind: 'bar',
            market: request.market,
            assetType: 'ETF',
            capability: 'DAILY_BAR',
            timeframe: '1d',
            adjustment: request.barAdjustment ?? 'qfq',
          },
          window: { start: request.start, end: request.end },
        });
        if (result.status !== 'selected') throw new Error('fixture 行情不可用');
        return {
          version: 3,
          status: 'supported',
          provider: 'fixture-instrument',
          providerRevision: 'instrument-v1',
          coverage: { start: request.start, end: request.end, complete: true },
          ...(request.identityOnly ? {} : { historicalTradability: tradabilityFixtureV3(
            tradabilityWindowFromResponseV3(result.selection.response),
          ) }),
          facts: [
            {
              symbol: request.symbol,
              market: request.market,
              instrumentType: request.instrumentType,
              currency: 'CNY',
              lotSize: '100',
              tickSize: '0.001',
              tradable: !request.identityOnly,
              executionRules: { status: 'unavailable', reason: '本 fixture 使用显式执行模型' },
              provider: 'fixture-instrument',
              providerRevision: 'instrument-v1',
              occurredAt: '2023-07-27T00:00:00Z',
              availableAt: '2023-07-27T00:00:00Z',
            },
          ],
        };
      },
    ),
  };
  const reader = { read: vi.fn(), readV3: vi.fn(makeReaderResult) };
  return { input, dsa, reader };
};
