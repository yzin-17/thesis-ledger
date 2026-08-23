import type { LoadState } from './types.js';

export const money = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
});

export const formText = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

export const displayValue = (value: unknown) => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '不可用';
};

export const isDataLoaded = (state: LoadState) => state === 'ready' || state === 'empty';
