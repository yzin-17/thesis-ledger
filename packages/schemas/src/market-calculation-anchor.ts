import { z } from 'zod';

/** 与来源bar一致，日期窗口按市场本地日确定，点位比较保留完整时刻。 */
export function marketCalculationAnchor(input: {
  symbol: string;
  timeframe?: string | undefined;
  calculationAnchor?: string | undefined;
  end?: string | undefined;
}) {
  if (input.calculationAnchor === undefined) return undefined;
  const timestamp = new Date(
    z.iso.datetime({ offset: true }).parse(input.calculationAnchor),
  ).toISOString();
  const suffix = input.symbol.toUpperCase().split('.').at(-1);
  let timeZone = 'Asia/Shanghai';
  if (suffix === 'HK') timeZone = 'Asia/Hong_Kong';
  else if (suffix === 'US') timeZone = 'America/New_York';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value;
  const end = `${part('year')}-${part('month')}-${part('day')}`;
  if (input.end !== undefined && input.end !== end)
    throw new Error('end必须与calculationAnchor的行情末日一致');
  return { timestamp, end };
}
