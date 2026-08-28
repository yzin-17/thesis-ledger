const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

type DecimalParts = {
  coefficient: bigint;
  scale: number;
};

const powerOfTen = (scale: number) => 10n ** BigInt(scale);

const normalize = ({ coefficient, scale }: DecimalParts): DecimalParts => {
  if (coefficient === 0n) return { coefficient: 0n, scale: 0 };
  let nextCoefficient = coefficient;
  let nextScale = scale;
  while (nextScale > 0 && nextCoefficient % 10n === 0n) {
    nextCoefficient /= 10n;
    nextScale -= 1;
  }
  return { coefficient: nextCoefficient, scale: nextScale };
};

const parseDecimal = (value: string): DecimalParts => {
  if (!decimalPattern.test(value)) throw new Error(`非法十进制值: ${value}`);
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer, fraction = ''] = unsigned.split('.');
  const coefficient = BigInt(`${integer}${fraction}`) * (negative ? -1n : 1n);
  return normalize({ coefficient, scale: fraction.length });
};

const formatDecimal = ({ coefficient, scale }: DecimalParts) => {
  if (coefficient === 0n) return '0';
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString();
  if (scale === 0) return `${negative ? '-' : ''}${digits}`;
  const padded = digits.padStart(scale + 1, '0');
  const integer = padded.slice(0, -scale) || '0';
  const fraction = padded.slice(-scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
};

const compareParts = (left: DecimalParts, right: DecimalParts) => {
  const scale = Math.max(left.scale, right.scale);
  const leftCoefficient = left.coefficient * powerOfTen(scale - left.scale);
  const rightCoefficient = right.coefficient * powerOfTen(scale - right.scale);
  return leftCoefficient < rightCoefficient ? -1 : leftCoefficient > rightCoefficient ? 1 : 0;
};

const roundedQuotient = (numerator: bigint, denominator: bigint) => {
  const negative = numerator < 0n !== denominator < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  let quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  if (remainder * 2n >= absoluteDenominator) quotient += 1n;
  return negative ? -quotient : quotient;
};

/**
 * Decimal arithmetic for domain projections.
 *
 * Values are kept as integer coefficients plus a decimal scale so projection
 * code never passes quantities or money through JavaScript `number`.
 */
export class DecimalValue {
  private readonly parts: DecimalParts;

  private constructor(parts: DecimalParts) {
    this.parts = normalize(parts);
  }

  static from(value: string | DecimalValue) {
    return value instanceof DecimalValue ? value : new DecimalValue(parseDecimal(value));
  }

  plus(value: string | DecimalValue) {
    const right = DecimalValue.from(value).parts;
    const scale = Math.max(this.parts.scale, right.scale);
    return new DecimalValue({
      coefficient:
        this.parts.coefficient * powerOfTen(scale - this.parts.scale) +
        right.coefficient * powerOfTen(scale - right.scale),
      scale,
    });
  }

  minus(value: string | DecimalValue) {
    const right = DecimalValue.from(value);
    return this.plus(
      new DecimalValue({ coefficient: -right.parts.coefficient, scale: right.parts.scale }),
    );
  }

  times(value: string | DecimalValue) {
    const right = DecimalValue.from(value).parts;
    return new DecimalValue({
      coefficient: this.parts.coefficient * right.coefficient,
      scale: this.parts.scale + right.scale,
    });
  }

  dividedBy(value: string | DecimalValue, scale = 40) {
    const right = DecimalValue.from(value).parts;
    if (right.coefficient === 0n) throw new Error('不能除以零');
    const numerator = this.parts.coefficient * powerOfTen(right.scale + scale);
    const denominator = right.coefficient * powerOfTen(this.parts.scale);
    return new DecimalValue({ coefficient: roundedQuotient(numerator, denominator), scale });
  }

  compareTo(value: string | DecimalValue) {
    return compareParts(this.parts, DecimalValue.from(value).parts);
  }

  isZero() {
    return this.parts.coefficient === 0n;
  }

  isPositive() {
    return this.parts.coefficient > 0n;
  }

  isNegative() {
    return this.parts.coefficient < 0n;
  }

  toString() {
    return formatDecimal(this.parts);
  }
}
