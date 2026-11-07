type DecimalTextFormatter = (value: string | number | bigint) => string;
type DecimalSignDisplay = 'auto' | 'always' | 'exceptZero';
const formatter = (options: Intl.NumberFormatOptions) => {
  const instance = new Intl.NumberFormat('en-US', options);
  return instance.format.bind(instance) as DecimalTextFormatter;
};
const fixedText = formatter({
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const preciseText = formatter({ useGrouping: true, maximumFractionDigits: 6 });
const summaryText = formatter({ useGrouping: true, maximumFractionDigits: 3 });
const scientificText = formatter({ notation: 'scientific', maximumFractionDigits: 6 });
const textFormats = { 2: fixedText, 3: summaryText, 6: preciseText };

type DecimalDisplay = {
  fractionDigits: 2 | 3 | 6;
  decimalShift: 0 | 2;
  format: DecimalTextFormatter;
  suffix: '' | '%';
  signDisplay?: DecimalSignDisplay;
};
function formatValue(value: string | null | undefined, options: DecimalDisplay): string {
  if (value === null || value === undefined) return '—';
  const parts = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i.exec(value.trim());
  if (!parts) return '—';
  const { fractionDigits, decimalShift, format, suffix, signDisplay = 'auto' } = options;
  const [integer = '', fraction = ''] = parts[2]!.split('.');
  const digits = integer + fraction;
  const first = digits.search(/[1-9]/);
  if (first < 0) return (signDisplay === 'always' ? '+' : '') + format('0') + suffix;
  const significant = digits.slice(first);
  const negative = parts[1] === '-';
  const sign = negative ? '-' : '';
  const positiveSign = !negative && signDisplay !== 'auto' ? '+' : '';
  const mantissa = sign + significant[0] + '.' + (significant.slice(1) || '0');
  // 指数独立保存，不按指数分配字符串，也不转换原始有效数字。
  const exponent = BigInt(parts[3] ?? '0') + BigInt(integer.length - first - 1 + decimalShift);
  const scientific = () => {
    const [coefficient, carry = '0'] = scientificText(mantissa).split('E');
    return positiveSign + coefficient + 'E' + (exponent + BigInt(carry)) + suffix;
  };
  if (exponent >= 21n || exponent < -BigInt(fractionDigits + 1)) return scientific();
  const formatted = format(mantissa + 'e' + exponent);
  if (/^-?0(?:\.0+)?$/.test(formatted)) return scientific();
  return positiveSign + formatted + suffix;
}

/** 只读十进制差额最多六位；保留原始有效数字、非零与正负符号。 */
export function formatDecimalNumber(
  value: string | null | undefined,
  signDisplay: DecimalSignDisplay = 'auto',
): string {
  return formatValue(value, {
    fractionDigits: 6,
    decimalShift: 0,
    format: preciseText,
    suffix: '',
    signDisplay,
  });
}

/** 比例模块的内部单位适配，公开入口仍由 ratio-percent 拥有。 */
export function formatDecimalPercent(
  value: string | null | undefined,
  fractionDigits: 2 | 3 | 6,
  decimalShift: 0 | 2,
): string {
  return formatValue(value, {
    fractionDigits,
    decimalShift,
    format: textFormats[fractionDigits],
    suffix: '%',
  });
}
