import { randomUUID } from 'node:crypto';
import type { MarketPeriodCalendarFact } from '@thesis-ledger/domain';
import type {
  ObservationCalendar,
  ObservationClaim,
  ObservationPrices,
} from '../../src/research/research-observation-method.js';

/** 合成交易日历，只用于方法反例，不表示任何真实市场历史资格。 */
export function observationMethodFixture(tradingDays: 5 | 20 = 5) {
  const claim: Extract<ObservationClaim, { kind: 'price-direction' }> = {
    id: 'direction-1',
    kind: 'price-direction',
    instrumentId: randomUUID(),
    description: '受控方向断言',
    direction: 'up',
    tradingDays,
    evidenceIds: [randomUUID()],
    rationale: '受控依据',
  };
  const fact: MarketPeriodCalendarFact = {
    market: 'CN',
    timezone: 'Asia/Shanghai',
    revision: 'controlled-calendar-1',
    availableAt: '2026-10-01T00:00:00Z',
    coverageStart: '2026-10-01',
    coverageEnd: '2026-12-01',
    sessions: [],
  };
  const sessions: Array<MarketPeriodCalendarFact['sessions'][number]> = [];
  for (
    let time = Date.parse(fact.coverageStart);
    time <= Date.parse(fact.coverageEnd);
    time += 86_400_000
  ) {
    const date = new Date(time).toISOString().slice(0, 10),
      weekday = new Date(time).getUTCDay();
    if ([0, 6].includes(weekday) || date <= '2026-10-08') continue;
    sessions.push(
      { tradingDate: date, startAt: date + 'T01:30:00Z', endAt: date + 'T03:30:00Z' },
      { tradingDate: date, startAt: date + 'T05:00:00Z', endAt: date + 'T07:00:00Z' },
    );
  }
  fact.sessions = sessions;
  const calendar: ObservationCalendar = { status: 'ready', calendar: fact };
  const prices: ObservationPrices = {
    status: 'ready',
    currency: 'CNY',
    fingerprint: 'a'.repeat(64),
    points: [
      { date: '2026-10-19', close: '100', state: 'traded', availableAt: '2026-10-19T07:01:00Z' },
      { date: '2026-10-26', close: '110', state: 'traded', availableAt: '2026-10-26T07:01:00Z' },
    ],
  };
  return {
    claim,
    calendar,
    fact,
    prices,
    input: {
      claim,
      calendar,
      market: 'CN' as const,
      createdAt: '2026-10-16T08:00:00Z',
      asOf: '2026-11-30T08:00:00Z',
    },
  };
}
