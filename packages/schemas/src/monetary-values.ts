import { z } from 'zod';
const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export const decimalStringSchema = z.string().regex(decimalPattern, '必须是规范十进制字符串');

export const nonNegativeDecimalStringSchema = z.string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, '必须是大于等于 0 的规范十进制字符串');

export const positiveDecimalStringSchema = z.string()
  .regex(/^(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)$/, '必须是大于 0 的规范十进制字符串');

export const positiveRatioStringSchema = z.string()
  .regex(/^(?:1(?:\.0+)?|0\.\d*[1-9]\d*)$/, 'ratio 必须大于 0 且小于或等于 1');

export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, '必须是三位大写币种代码');
