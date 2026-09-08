const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

const parsePeriodKey = (periodKey: string) => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodKey);
  if (!match) throw new Error(`非法月份: ${periodKey}`);
  return { year: Number(match[1]), month: Number(match[2]) };
};

export const fundPeriodKeyAtShanghai = (date: Date) =>
  new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 7);

const nextPeriodKey = (periodKey: string) => {
  const { year, month } = parsePeriodKey(periodKey);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
};

export const scheduledFundInvestmentForPeriod = (periodKey: string, dayOfMonth: number) => {
  const { year, month } = parsePeriodKey(periodKey);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(Math.max(dayOfMonth, 1), lastDay), 1));
};

export const nextFundInvestmentAtOrAfter = (now: Date, dayOfMonth: number, startPeriod: string) => {
  const currentPeriod = fundPeriodKeyAtShanghai(now);
  let periodKey = currentPeriod < startPeriod ? startPeriod : currentPeriod;
  let scheduledFor = scheduledFundInvestmentForPeriod(periodKey, dayOfMonth);
  if (scheduledFor < now) {
    periodKey = nextPeriodKey(periodKey);
    scheduledFor = scheduledFundInvestmentForPeriod(periodKey, dayOfMonth);
  }
  return scheduledFor;
};

export const dueFundInvestments = (nextDueAt: Date, now: Date, dayOfMonth: number) => {
  const due: Array<{ periodKey: string; scheduledFor: Date }> = [];
  let periodKey = fundPeriodKeyAtShanghai(nextDueAt);
  let scheduledFor = scheduledFundInvestmentForPeriod(periodKey, dayOfMonth);
  while (scheduledFor <= now) {
    due.push({ periodKey, scheduledFor });
    periodKey = nextPeriodKey(periodKey);
    scheduledFor = scheduledFundInvestmentForPeriod(periodKey, dayOfMonth);
  }
  return { due, nextDueAt: scheduledFor };
};
