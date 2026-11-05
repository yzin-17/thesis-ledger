/** 交易市场的本地午夜／Session边界换算；保留夏令时规则，不使用固定UTC偏移。 */
export function marketCivilInstant(date: string, minute: number, timeZone: string): string {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(midnight) ||
    new Date(midnight).toISOString().slice(0, 10) !== date ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute >= 1440
  )
    throw new Error('市场本地日期或分钟边界无效');
  const wanted = midnight + minute * 60_000;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let candidate = wanted;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    const rendered = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    if (rendered === wanted) return new Date(candidate).toISOString();
    candidate += wanted - rendered;
  }
  throw new Error('市场本地时刻无法映射');
}
