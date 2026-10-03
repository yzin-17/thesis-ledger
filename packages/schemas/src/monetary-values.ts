import { z } from 'zod';
const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

const hasNonZeroDigit = (value: string) => /[1-9]/.test(value.replace(/^-/, ''));

export const decimalStringSchema = z.string().regex(decimalPattern, '必须是规范十进制字符串');

export const nonNegativeDecimalStringSchema = decimalStringSchema.refine(
  (value) => !value.startsWith('-'),
  '必须大于等于 0',
);

export const positiveDecimalStringSchema = nonNegativeDecimalStringSchema.refine(
  hasNonZeroDigit,
  '必须大于 0',
);

export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, '必须是三位大写币种代码');
