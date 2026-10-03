export type MarketPitEvidenceInstantV1 = { seconds: bigint; fraction: string };

/** 证据时钟：四位公历年、显式已知偏移、秒精度及最多 1,024 位小数。 */
export function parseMarketPitEvidenceInstantV1(value: string): MarketPitEvidenceInstantV1 {
  if (typeof value !== 'string' || value.length > 1_050) throw new Error('capture-clock-invalid');
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,1024}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!parts) throw new Error('capture-clock-invalid');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction, zone] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > monthDays[month - 1]! ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    throw new Error('capture-clock-invalid');
  const offset = parseOffsetSeconds(zone!);
  // Date 仅转换已经逐字段验证的整数秒；小数从未进入毫秒转换。
  const seconds = BigInt(
    Date.parse(`${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}Z`) /
      1_000,
  );
  return { seconds: seconds - BigInt(offset), fraction: (fraction ?? '').replace(/0+$/, '') };
}

function parseOffsetSeconds(zone: string): number {
  if (zone === 'Z') return 0;
  const hours = Number(zone.slice(1, 3));
  const minutes = Number(zone.slice(4, 6));
  if (hours > 23 || minutes > 59 || zone === '-00:00') throw new Error('capture-clock-invalid');
  const magnitude = (hours * 60 + minutes) * 60;
  if (zone[0] === '-') return -magnitude;
  return magnitude;
}

export function compareMarketPitEvidenceInstantsV1(
  left: MarketPitEvidenceInstantV1,
  right: MarketPitEvidenceInstantV1,
): number {
  if (left.seconds < right.seconds) return -1;
  if (left.seconds > right.seconds) return 1;
  const width = Math.max(left.fraction.length, right.fraction.length);
  const a = left.fraction.padEnd(width, '0');
  const b = right.fraction.padEnd(width, '0');
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** 非法证据瞬时返回 undefined，调用方须显式失败关闭。 */
export function compareMarketPitEvidenceInstantStringsV1(
  left: string,
  right: string,
): number | undefined {
  try {
    return compareMarketPitEvidenceInstantsV1(
      parseMarketPitEvidenceInstantV1(left),
      parseMarketPitEvidenceInstantV1(right),
    );
  } catch {
    return undefined;
  }
}
