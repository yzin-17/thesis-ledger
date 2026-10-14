import { BadRequestException } from '@nestjs/common';
import { assertIndicatorParameters } from './market-request-validation.js';

type IndicatorName = 'MA' | 'MACD' | 'RSI';
const indicatorKeys: Record<IndicatorName, readonly string[]> = {
  MA: ['period'],
  MACD: ['fast', 'slow', 'signal', 'macdFast', 'macdSlow', 'macdSignal'],
  RSI: ['short', 'mid', 'long', 'rsiShort', 'rsiMid', 'rsiLong'],
};
const parseParameters = (value: string | undefined): Record<string, number> => {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object');
    if (!Object.values(parsed).every((item) => typeof item === 'number' && Number.isFinite(item)))
      throw new Error('number');
    return parsed as Record<string, number>;
  } catch {
    throw new BadRequestException('parameters 必须是 JSON 数字对象');
  }
};
export const normalizeIndicatorName = (value: string): IndicatorName => {
  const normalized = value.toUpperCase();
  if (normalized !== 'MA' && normalized !== 'MACD' && normalized !== 'RSI')
    throw new BadRequestException('指标名称不支持');
  return normalized;
};
export const selectIndicatorParameters = (name: IndicatorName, value: string | undefined) => {
  const parsed = parseParameters(value);
  const selected = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => indicatorKeys[name].includes(key)),
  );
  try {
    assertIndicatorParameters(name, selected);
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : '指标参数无效');
  }
  if (name === 'MA') return { period: selected.period ?? 5 };
  if (name === 'MACD')
    return {
      fast: selected.fast ?? selected.macdFast ?? 12,
      slow: selected.slow ?? selected.macdSlow ?? 26,
      signal: selected.signal ?? selected.macdSignal ?? 9,
    };
  return {
    short: selected.short ?? selected.rsiShort ?? 6,
    mid: selected.mid ?? selected.rsiMid ?? 12,
    long: selected.long ?? selected.rsiLong ?? 24,
  };
};
