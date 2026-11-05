/** 将用户明确给出的时区偏移转换为账本要求的 UTC；不猜测本地时间。 */
export function ledgerInputTime(value: string, precision: 'DATE' | 'INSTANT') {
  const input = value.trim();
  if (precision === 'DATE') return input;
  const syntax =
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  const date = new Date(input);
  const calendarDate = new Date(`${input.slice(0, 10)}T00:00:00.000Z`);
  if (
    !syntax.test(input) ||
    !Number.isFinite(date.getTime()) ||
    !Number.isFinite(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== input.slice(0, 10)
  ) {
    throw new Error('请输入有效 ISO 时间，包含秒及 Z 或时区偏移，例如 2026-10-22T15:00:00+08:00。');
  }
  return date.toISOString();
}
