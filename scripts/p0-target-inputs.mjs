import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DsaSnapshotBuilder } from '../apps/server/src/backtest/backtest-snapshot-builder.ts';
import { LocalSnapshotStore, hashCanonicalManifest } from '../apps/server/src/backtest/backtest-snapshot.ts';
import { buildInput, makeReaderResult } from '../apps/server/test/backtest/v3-snapshot-fixtures.ts';
import { tradabilityFixtureV3 } from '../apps/server/test/backtest/v3-tradability-fixtures.ts';
import { tradabilityWindowFromResponseV3 } from '../apps/server/src/backtest/backtest-snapshot-v3-tradability.ts';

const destination = process.argv[2];
assert(destination && resolve(destination) === destination, '必须提供绝对输入文件路径');
const root = await mkdtemp(join(tmpdir(), 'p0-inputs-'));
const cases = [];
try {
  for (const name of ['RSI', 'ATR']) {
    const { input } = await buildInput();
    input.runId = `p0-controlled-${name.toLowerCase()}`;
    input.runConfig.priceInputBindings = {
      signals: [{ sourceId: 'execution', binding: 'execution-series' }],
      benchmark: { binding: 'execution-series' },
    };
    const expression = {
      type: 'indicator', name, params: { period: 2 },
      input: { type: 'series', sourceId: 'execution', field: 'close' },
    };
    input.strategy.entry = {
      type: 'compare', operator: name === 'ATR' ? 'lte' : 'gte',
      left: name === 'RSI'
        ? { type: 'indicator', name: 'EMA', params: { period: 2 }, input: expression }
        : expression,
      right: name === 'ATR'
        ? { type: 'series', sourceId: 'execution', field: 'close' }
        : { type: 'constant', value: '0' },
    };
    input.strategyVersionHash = hashCanonicalManifest(input.strategy);
    const tape = [];
    const record = (method, fn) => async (request) => {
      const response = await fn(request);
      tape.push({ method, request: structuredClone(request), response: structuredClone(response) });
      return response;
    };
    const dsa = {
      backtestCalendar: record('calendar', async (request) => ({
        version: 3, status: 'supported', provider: 'controlled-calendar',
        providerRevision: 'controlled-not-live-v1',
        coverage: { start: request.start, end: request.end, complete: true },
        facts: [{
          market: 'CN', timezone: 'Asia/Shanghai', provider: 'controlled-calendar',
          providerRevision: 'controlled-not-live-v1', availableAt: '2025-12-31T00:00:00Z',
          sessions: [{ startMinute: 570, endMinute: 690 }, { startMinute: 780, endMinute: 900 }],
          sessionOverrides: [], holidays: [], range: { start: request.start, end: request.end },
        }],
      })),
      backtestInstrumentFacts: record('instrument', async (request) => {
        const result = await makeReaderResult({
          symbol: request.symbol, market: request.market,
          routeKey: { kind: 'bar', market: request.market, assetType: 'ETF', capability: 'DAILY_BAR',
            timeframe: '1d', adjustment: request.barAdjustment ?? 'qfq' },
          window: { start: request.start, end: request.end },
        });
        assert.equal(result.status, 'selected');
        return {
          version: 3, status: 'supported', provider: 'controlled-instrument',
          providerRevision: 'controlled-not-live-v1',
          coverage: { start: request.start, end: request.end, complete: true },
          ...(request.identityOnly ? {} : {
            historicalTradability: tradabilityFixtureV3(tradabilityWindowFromResponseV3(result.selection.response)),
          }),
          facts: [{ symbol: request.symbol, market: request.market, instrumentType: request.instrumentType,
            currency: 'CNY', lotSize: '100', tickSize: '0.001', tradable: !request.identityOnly,
            executionRules: { status: 'unavailable', reason: '合成输入使用显式执行模型' },
            provider: 'controlled-instrument', providerRevision: 'controlled-not-live-v1',
            occurredAt: '2023-07-27T00:00:00Z', availableAt: '2023-07-27T00:00:00Z' }],
        };
      }),
    };
    const reader = { readV3: record('bars', makeReaderResult) };
    await new DsaSnapshotBuilder(dsa, new LocalSnapshotStore(join(root, name)), reader).buildV3(input);
    cases.push({ name, input, tape });
  }
  const bundle = { version: 'p0-target-inputs-v1', datasetKind: 'synthetic', cases };
  await writeFile(destination, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600 });
  const bytes = await readFile(destination);
  console.log(JSON.stringify({ path: destination, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    cases: cases.map((item) => ({ name: item.name, sourceReads: item.tape.length })) }));
} finally {
  await rm(root, { recursive: true, force: true });
}
