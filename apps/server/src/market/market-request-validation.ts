export const assertCalendarDateRange = (start?: string, end?: string) => {
  const parse = (value: string | undefined, field: string) => {
    if (value === undefined) return undefined;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new Error(`${field} 必须是 YYYY-MM-DD 日期`);
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (
      date.getUTCFullYear() !== Number(match[1]) ||
      date.getUTCMonth() !== Number(match[2]) - 1 ||
      date.getUTCDate() !== Number(match[3])
    )
      throw new Error(`${field} 必须是有效日历日期`);
    return value;
  };
  const parsedStart = parse(start, 'start');
  const parsedEnd = parse(end, 'end');
  if (parsedStart && parsedEnd && parsedStart > parsedEnd) throw new Error('start 不能晚于 end');
  return { start: parsedStart, end: parsedEnd };
};

export const assertIndicatorParameters = (
  name: 'MA' | 'MACD' | 'RSI' | 'ATR',
  input: Readonly<Record<string, number>> = {},
) => {
  const supported = new Set([
    'period',
    'fast',
    'slow',
    'signal',
    'short',
    'mid',
    'long',
    'macdFast',
    'macdSlow',
    'macdSignal',
    'rsiShort',
    'rsiMid',
    'rsiLong',
  ]);
  if (Object.keys(input).some((key) => !supported.has(key)))
    throw new Error('indicatorParams 包含不支持的参数');
  if (Object.values(input).some((value) => !Number.isInteger(value) || value < 2 || value > 200))
    throw new Error('indicatorParams 的值必须是 2 到 200 之间的整数');
  const fast = input.fast ?? input.macdFast;
  const slow = input.slow ?? input.macdSlow ?? 26;
  if (name === 'MACD' && fast !== undefined && fast >= slow)
    throw new Error('MACD fast 必须小于 slow');
  return input;
};

export const parseMarketDetailIndicatorParams = (
  input: DetailIndicatorParams,
): Readonly<Record<string, number>> | undefined => {
  if (input === undefined) return undefined;
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      throw new BadRequestException('indicatorParams 必须是 JSON 对象');
    }
  }
  if (!isRecord(value)) throw new BadRequestException('indicatorParams 必须是 JSON 对象');
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === 'number' && Number.isFinite(item)))
    throw new BadRequestException('indicatorParams 的值必须是有限数字');
  try {
    return assertIndicatorParameters(
      'MACD',
      Object.fromEntries(entries) as Readonly<Record<string, number>>,
    );
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : '指标参数无效');
  }
};

export const parseMarketDetailDateRange = (start?: string, end?: string) => {
  try {
    return assertCalendarDateRange(start, end);
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : '日期范围无效');
  }
};
import { BadRequestException } from '@nestjs/common';

type DetailIndicatorParams = string | Readonly<Record<string, number>> | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
