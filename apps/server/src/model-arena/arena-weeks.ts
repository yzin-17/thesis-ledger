import { marketCivilInstant } from '@thesis-ledger/domain';
export const arenaWeeklyMethod = 'weekly-v1';
const shift = (day: string, delta: number) =>
  new Date(Date.parse(day + 'T00:00:00Z') + delta * 86400000).toISOString().slice(0, 10);
export function arenaWeekStart(day: string) {
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  return shift(day, -((weekday + 6) % 7));
}
export function arenaWeeks(
  p: { startsOn: string; endsOn: string; timeZone: string },
  started: Date,
  ended: Date | null,
  slots: { tradingDate: string }[],
  now: Date,
) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: p.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const start = [p.startsOn, date.format(started)].sort().at(-1)!;
  const end = [p.endsOn, ended ? date.format(ended) : p.endsOn].sort()[0]!;
  const result = [];
  for (
    let week = arenaWeekStart(start);
    week <= end && week <= date.format(now);
    week = shift(week, 7)
  ) {
    const periodStart = week < start ? start : week,
      periodEnd = [shift(week, 6), end].sort()[0]!;
    if (periodEnd < periodStart) continue;
    const last = slots
      .filter((s) => s.tradingDate >= periodStart && s.tradingDate <= periodEnd)
      .map((s) => s.tradingDate)
      .sort()
      .at(-1);
    let cutoff = new Date(marketCivilInstant(shift(last ?? periodEnd, 1), 0, p.timeZone));
    if (ended && date.format(ended) === periodEnd && ended < cutoff) cutoff = ended;
    if (cutoff <= now)
      result.push({ week, periodStart, periodEnd, cutoff, method: arenaWeeklyMethod });
  }
  return result;
}
