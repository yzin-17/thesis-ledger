const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

const parsePeriodKey = (periodKey: string) => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodKey);
  if (!match) throw new Error(`非法月份: ${periodKey}`);
  return { year: Number(match[1]), month: Number(match[2]) };
};

export const periodKeyAtShanghai = (date: Date) =>
  new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 7);

export const nextPeriodKey = (periodKey: string) => {
  const { year, month } = parsePeriodKey(periodKey);
  const next = new Date(Date.UTC(year, month, 1));
  return next.toISOString().slice(0, 7);
};

export const scheduledForPeriod = (periodKey: string, dayOfMonth: number) => {
  const { year, month } = parsePeriodKey(periodKey);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Math.max(dayOfMonth, 1), lastDay);
  return new Date(Date.UTC(year, month - 1, day, 1, 0, 0));
};

export const nextScheduledAtOrAfter = (
  now: Date,
  dayOfMonth: number,
  startPeriod: string,
) => {
  const currentPeriod = periodKeyAtShanghai(now);
  let candidatePeriod = currentPeriod < startPeriod ? startPeriod : currentPeriod;
  let candidate = scheduledForPeriod(candidatePeriod, dayOfMonth);
  if (candidate.getTime() < now.getTime()) {
    candidatePeriod = nextPeriodKey(candidatePeriod);
    candidate = scheduledForPeriod(candidatePeriod, dayOfMonth);
  }
  return candidate;
};

export const dueOccurrences = (nextDueAt: Date, now: Date, dayOfMonth: number) => {
  const due: Array<{ periodKey: string; scheduledFor: Date }> = [];
  let periodKey = periodKeyAtShanghai(nextDueAt);
  let scheduledFor = scheduledForPeriod(periodKey, dayOfMonth);
  while (scheduledFor.getTime() <= now.getTime()) {
    due.push({ periodKey, scheduledFor });
    periodKey = nextPeriodKey(periodKey);
    scheduledFor = scheduledForPeriod(periodKey, dayOfMonth);
  }
  return { due, nextDueAt: scheduledFor };
};
