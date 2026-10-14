import { readFileSync } from 'node:fs';
import { marketTradingStatusResponseV3Schema } from '@thesis-ledger/schemas';
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
