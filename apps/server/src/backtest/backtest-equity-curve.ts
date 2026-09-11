import {
  valueSimulationLedger,
  type BacktestEquityPoint,
  type PortfolioValuationPolicy,
  type SimulationFxRate,
  type SimulationLedgerState,
  type SimulationTick,
  type SimulationValuationPrice,
  type TradingCalendar,
} from '@thesis-ledger/domain';

interface DailyValuationTicksInput {
  startDate: string;
  endDate: string;
  policy: PortfolioValuationPolicy;
  calendar: TradingCalendar;
}

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const localParts = (instant: number, timezone: string): LocalDateTimeParts => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const value = (key: keyof LocalDateTimeParts) => {
    const part = parts[key];
    if (part === undefined || !Number.isFinite(part)) throw new Error(`估值时间缺少 ${key}`);
    return part;
  };
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
};

const localValuationInstant = (date: string, time: string, timezone: string) => {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = localParts(instant, timezone);
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    instant += target - represented;
  }
  const parts = localParts(instant, timezone);
  if (
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day ||
    parts.hour !== hour ||
    parts.minute !== minute
  ) {
    throw new Error(`无法解析估值时点: ${date} ${time} ${timezone}`);
  }
  return new Date(instant).toISOString();
};

export const buildDailyValuationTicks = (input: DailyValuationTicksInput): SimulationTick[] => {
  const ticks: SimulationTick[] = [];
  const cursor = new Date(`${input.startDate}T00:00:00Z`);
  const last = new Date(`${input.endDate}T00:00:00Z`);
  while (cursor <= last) {
    const date = cursor.toISOString().slice(0, 10);
    const calendarStatus = input.calendar.status(`${date}T12:00:00Z`);
    if (calendarStatus.date === date && calendarStatus.open) {
      const valuationAt = localValuationInstant(
        date,
        input.policy.dailyValuationTime,
        input.policy.baseTimezone,
      );
      ticks.push({ occurredAt: valuationAt, availableAt: valuationAt });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return ticks;
};

interface BacktestEquityPointInput {
  state: SimulationLedgerState;
  valuationAt: string;
  policy: PortfolioValuationPolicy;
  fxRates: readonly SimulationFxRate[];
  price?: SimulationValuationPrice;
}

export type BacktestEquityPointResult =
  { status: 'available'; point: BacktestEquityPoint } | { status: 'unavailable'; reason: string };

export const buildBacktestEquityPoint = (
  input: BacktestEquityPointInput,
): BacktestEquityPointResult => {
  const valuation = valueSimulationLedger(input.state, {
    valuationAt: input.valuationAt,
    policy: input.policy,
    prices: input.price ? [input.price] : [],
    fxRates: input.fxRates,
  });
  if (valuation.status !== 'available' || valuation.baseCurrencyValue === undefined) {
    return {
      status: 'unavailable',
      reason: `PORTFOLIO_VALUATION_${valuation.status.toUpperCase()}:${input.valuationAt}:${valuation.unavailableReasons.join(',') || 'VALUE_UNAVAILABLE'}`,
    };
  }
  return {
    status: 'available',
    point: {
      occurredAt: input.valuationAt,
      availableAt: input.valuationAt,
      value: { amount: valuation.baseCurrencyValue, currency: valuation.baseCurrency },
    },
  };
};

const GREGORIAN_YEAR_MILLISECONDS = 365.2425 * 24 * 60 * 60 * 1000;

export const annualizationFactorFromValuations = (
  points: readonly BacktestEquityPoint[],
): number => {
  if (points.length < 2) return Number.NaN;
  const first = Date.parse(points[0]!.occurredAt);
  const last = Date.parse(points.at(-1)!.occurredAt);
  const duration = last - first;
  if (!Number.isFinite(first) || !Number.isFinite(last) || duration <= 0) return Number.NaN;
  return ((points.length - 1) * GREGORIAN_YEAR_MILLISECONDS) / duration;
};
