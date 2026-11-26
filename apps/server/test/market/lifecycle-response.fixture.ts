import { readFileSync } from 'node:fs';
import { marketTradingStatusResponseV3Schema } from '@thesis-ledger/schemas';
import { MarketLifecycleReaderV3 } from '../../src/market/market-lifecycle-reader-v3.js';
import { compositionFixture } from './status-composition-fixtures.js';
/** 标准合同替身，只用于测试，不证明来源或生产验收。 */
export function lifecycleResponseFixtureV3(
  symbol: string,
  start: string,
  end: string,
  ipoDate: string | null,
  outDate: string | null = null,
) {
  const raw = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/market-basic-lifecycle-v3.response.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ).response;
  raw.symbol = symbol;
  raw.range = { start, end };
  raw.days = [];
  for (
    let cursor = new Date(`${start}T00:00:00Z`);
    cursor.toISOString().slice(0, 10) <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  )
    raw.days.push({ date: cursor.toISOString().slice(0, 10), state: 'unknown' });
  raw.basicLifecycle = {
    ipoDate,
    outDate,
    ipoDateStatus: ipoDate ? 'known' : 'notProvided',
    outDateStatus: outDate ? 'known' : 'notProvided',
    sourceRecordId: 'basic',
  };
  raw.sourceRecords.forEach((record: { symbol: string; range: { start: string; end: string } }) => {
    record.symbol = symbol;
    record.range = { start, end };
  });
  const dates = raw.days.map((day: { date: string }) => day.date);
  raw.structuredCoverage = {
    expectedSessions: dates,
    statusUnknownDates: dates,
    stUnknownDates: dates,
    calendarUnknownDates: [],
    complete: false,
  };
  return marketTradingStatusResponseV3Schema.parse(raw);
}

export function lifecycleCapabilitiesFixture(
  symbol: string, start: string, end: string, ipoDate: string | null, outDate: string | null = null,
) {
  const original = lifecycleResponseFixtureV3(symbol, start, end, ipoDate, outDate);
  const dates = original.days.map((day) => day.date);
  const fixture = compositionFixture({ symbol, dates });
  const status = fixture.samples.find((sample: { name: string }) => sample.name === 'DAILY_TRADING_STATUS').result;
  status.days = original.days.map(({ date }) => ({ date, state: 'unknown', intradayHalts: [], evidenceRefs: [] }));
  status.coverage = { ...status.coverage, unknownDates: dates, complete: false };
  const basic = fixture.samples.find((sample: { name: string }) => sample.name === 'SECURITY_BASIC_DATES').result;
  basic.dates = { ...original.basicLifecycle, sourceRecordId: basic.dates.sourceRecordId };
  const reader = new MarketLifecycleReaderV3({
    dataCapabilities: fixture.reader,
    effectiveControlPolicyV3: async () => ({ projection: { effective: await fixture.readPolicy() } }),
  } as never);
  return { ...fixture, read: () => reader.read({ market: 'CN', symbol, start, end }) };
}
