import { DecimalValue as D } from './decimal.js';

/** 平方根截取到 20 位小数；整数牛顿迭代不把价格转为二进制浮点。 */
export function decimalSquareRoot(value: D): D {
  if (value.isNegative()) throw Error('平方根输入不能为负');
  const [whole, fraction = ''] = value.toString().split('.');
  const exponent = 40 - fraction.length;
  let digits = whole! + fraction;
  digits = exponent >= 0 ? digits + '0'.repeat(exponent) : digits.slice(0, exponent);
  const n = BigInt(digits || '0');
  if (n === 0n) return D.from('0');
  let current = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  let next = (current + n / current) / 2n;
  while (next < current) {
    current = next;
    next = (current + n / current) / 2n;
  }
  const text = current.toString().padStart(21, '0');
  return D.from(text.slice(0, -20) + '.' + text.slice(-20));
}

export function calculateWindowStatistic(
  statistic: 'sum' | 'standardDeviation' | 'quantile' | 'max',
  values: readonly D[],
  options: { ddof?: 0 | 1 | undefined; quantile?: string | undefined } = {},
): string {
  const sum = values.reduce((total, value) => total.plus(value), D.from('0'));
  if (statistic === 'sum') return sum.toString();
  const sorted = [...values].sort((a, b) => a.compareTo(b));
  if (statistic === 'max') return sorted.at(-1)!.toString();
  if (statistic === 'quantile') {
    const rank = D.from(options.quantile!).times(String(values.length - 1));
    const index = Number(rank.toString().split('.')[0]);
    const fraction = rank.minus(String(index));
    return sorted[index]!.plus(
      (sorted[index + 1] ?? sorted[index]!).minus(sorted[index]!).times(fraction),
    ).toString();
  }
  const mean = sum.dividedBy(String(values.length), 40);
  const squared = values.reduce((total, value) => {
    const deviation = value.minus(mean);
    return total.plus(deviation.times(deviation));
  }, D.from('0'));
  return decimalSquareRoot(squared.dividedBy(String(values.length - options.ddof!), 40)).toString();
}
