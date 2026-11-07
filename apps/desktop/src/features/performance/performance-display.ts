import { formatRatioPercent } from '@thesis-ledger/domain';
import { money } from '../shared/display.js';
import type { Currency } from './performance.types.js';

const moneyByCurrency: Record<Currency, Intl.NumberFormat> = {
  CNY: money,
  HKD: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'HKD' }),
  USD: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD' }),
};

export const formatMoney = (value: number, currency?: Currency) =>
  (currency ? moneyByCurrency[currency] : money).format(value);

export const formatDate = (value?: string | null) => {
  if (!value) return '尚无数据时点';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '尚无数据时点' : date.toLocaleString('zh-CN');
};

export const signedMoney = (value: number, currency?: Currency) =>
  value >= 0 ? `+${formatMoney(value, currency)}` : formatMoney(value, currency);

export const signedPercent = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  const formatted = formatRatioPercent(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
};
