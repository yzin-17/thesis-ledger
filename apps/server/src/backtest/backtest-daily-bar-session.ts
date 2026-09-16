import type { TradingCalendar } from '@thesis-ledger/domain';

const localParts = (value: Date, timezone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

const utcForLocalMinute = (date: string, minute: number, timezone: string): Date => {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = date.split('-').map(Number);
  if (![year, month, day].every(Number.isInteger)) throw new Error(`无效日线交易日: ${date}`);
  const hour = Math.floor(minute / 60);
  const localMinute = minute % 60;
  const wantedUtc = Date.UTC(year, month - 1, day, hour, localMinute);
  let candidate = new Date(wantedUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = localParts(candidate, timezone);
    const renderedUtc = Date.UTC(
      Number(rendered.year),
      Number(rendered.month) - 1,
      Number(rendered.day),
      Number(rendered.hour),
      Number(rendered.minute),
    );
    const offset = renderedUtc - wantedUtc;
    if (offset === 0) return candidate;
    candidate = new Date(candidate.getTime() - offset);
  }
  return candidate;
};

export const dailyBarSessionTimes = (
  row: Readonly<Record<string, unknown>>,
  calendar: TradingCalendar,
): { openedAt?: string; openAvailableAt?: string } => {
  const explicitOpenedAt = typeof row.openedAt === 'string' ? row.openedAt : undefined;
  const explicitOpenAvailableAt =
    typeof row.openAvailableAt === 'string' ? row.openAvailableAt : undefined;
  if (row.timeframe !== '1d') {
    return {
      ...(explicitOpenedAt ? { openedAt: explicitOpenedAt } : {}),
      ...(explicitOpenAvailableAt ? { openAvailableAt: explicitOpenAvailableAt } : {}),
    };
  }

  const occurredAt = typeof row.occurredAt === 'string' ? row.occurredAt : '';
  const sessionDate = occurredAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    throw new Error('日线 Bar 缺少有效交易日标签');
  }
  const probe = utcForLocalMinute(sessionDate, 12 * 60, calendar.timezone);
  if (!calendar.isTradingDay(probe)) {
    throw new Error(`日线 Bar 不属于冻结 Calendar 交易日: ${sessionDate}`);
  }
  const firstSession = calendar.sessionsForDate(probe)[0];
  if (!firstSession) throw new Error(`冻结 Calendar 缺少交易时段: ${sessionDate}`);
  const derivedOpenedAt = utcForLocalMinute(
    sessionDate,
    firstSession.start,
    calendar.timezone,
  ).toISOString();
  const openedAt = explicitOpenedAt ?? derivedOpenedAt;
  return {
    openedAt,
    openAvailableAt: explicitOpenAvailableAt ?? openedAt,
  };
};
