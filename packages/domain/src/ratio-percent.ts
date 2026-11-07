import { formatDecimalPercent } from './decimal-number-display.js';

/** 比例的百分比文本；只移动十进制位置，不做浮点乘法或舍入。 */
export function ratioToPercentText(ratio: number): string {
  if (!Number.isFinite(ratio)) return String(ratio);
  const text = String(ratio);
  const negative = text.startsWith('-');
  const [coefficient, exponent = '0'] = (negative ? text.slice(1) : text).split('e');
  const [integer = '0', fraction = ''] = coefficient!.split('.');
  const digits = integer + fraction;
  const point = integer.length + Number(exponent) + 2;
  let projected: string;
  if (point <= 0) projected = `0.${'0'.repeat(-point)}${digits}`;
  else if (point >= digits.length) projected = digits + '0'.repeat(point - digits.length);
  else projected = `${digits.slice(0, point)}.${digits.slice(point)}`;
  const [whole = '0', tail = ''] = projected.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  const normalizedTail = tail.replace(/0+$/, '');
  return `${negative ? '-' : ''}${normalizedWhole}${normalizedTail ? `.${normalizedTail}` : ''}`;
}

/** 在现有 number API 边界转换一次；非法和非零下溢输入返回 null。 */
export function percentTextToRatio(percent: string): number | null {
  const parts = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:e([+-]?\d+))?$/i.exec(percent.trim());
  if (!parts) return null;
  const exponent = Number(parts[2] ?? '0') - 2;
  const ratio = Number(`${parts[1]}e${exponent}`);
  if (!Number.isFinite(ratio)) return null;
  if (ratio === 0 && /[1-9]/.test(parts[1]!)) return null;
  return ratio;
}

/** 两位紧凑、摘要最多三位或费率最多六位；文本原值不经过 Number。 */
export function formatDecimalRatioPercent(
  ratio: string | null | undefined,
  fractionDigits: 2 | 3 | 6 = 2,
): string {
  return formatDecimalPercent(ratio, fractionDigits, 2);
}

type PercentSignDisplay = 'auto' | 'always' | 'exceptZero';
function formatNumberPercent(
  value: number | null | undefined,
  decimalShift: 0 | 2,
  signDisplay: PercentSignDisplay,
  fractionDigits: 2 | 6 = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  let showPlus = false;
  if (signDisplay === 'always') showPlus = value >= 0;
  else if (signDisplay === 'exceptZero') showPlus = value > 0;
  return (showPlus ? '+' : '') + formatDecimalPercent(String(value), fractionDigits, decimalShift);
}

/** 紧凑只读比例展示；极小非零值不归零，既有 number 调用保持兼容。 */
export function formatRatioPercent(
  ratio: number | null | undefined,
  signDisplay: PercentSignDisplay = 'auto',
): string {
  return formatNumberPercent(ratio, 2, signDisplay);
}

/** 输入已经是百分数值；直接展示，不通过除 100 转换造成非零下溢。 */
export function formatPercentValue(
  percent: number | null | undefined,
  signDisplay: PercentSignDisplay = 'auto',
  fractionDigits: 2 | 6 = 2,
): string {
  return formatNumberPercent(percent, 0, signDisplay, fractionDigits);
}
