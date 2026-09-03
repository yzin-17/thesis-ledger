import type { LedgerCommandResponseV2, LedgerEventV2 } from '@thesis-ledger/api-client';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';

import type { InstrumentLookup } from '../portfolio/portfolio.types.js';
import type { AccountDataEventFilter } from './account-data.queries.js';
import type {
  ChargeCategory,
  Currency,
  ExecutionEvent,
  ExecutionDraft,
  LedgerAuditEvent,
  TimePrecision,
  VoidEvent,
} from './account-data.types.js';

export const currencies: Currency[] = ['CNY', 'HKD', 'USD'];
export const chargeCategoryOptions: Array<{ value: ChargeCategory; label: string }> = [
  { value: 'COMMISSION', label: '佣金' },
  { value: 'TAX', label: '税费' },
  { value: 'LEVY', label: '征费' },
  { value: 'EXCHANGE', label: '交易所费用' },
  { value: 'REGULATORY', label: '监管费' },
  { value: 'OTHER', label: '其他费用' },
];

export const chargeCategoryLabel = (category: ChargeCategory) =>
  chargeCategoryOptions.find((option) => option.value === category)?.label ?? '其他';

export const transactionFilters: Array<{ value: AccountDataEventFilter; label: string }> = [
  { value: 'executions', label: '成交记录' },
  { value: 'other', label: '其他账本事件' },
  { value: 'all', label: '全部事件' },
];

export const isExecutionEvent = (event: LedgerEventV2): event is ExecutionEvent =>
  event.revisionAction !== 'VOID' &&
  (event.type === 'BUY_EXECUTION' || event.type === 'SELL_EXECUTION');

export const isVoidEvent = (event: LedgerEventV2): event is VoidEvent =>
  event.revisionAction === 'VOID';

export const isLegacyAuditEvent = (
  event: LedgerAuditEvent,
): event is Extract<LedgerAuditEvent, { version: 1 }> => event.version === 1;

export const isCurrency = (value: string | null): value is Currency =>
  value === 'CNY' || value === 'HKD' || value === 'USD';

export const supportedCurrency = (value: string): Currency => {
  if (value === 'HKD' || value === 'USD') return value;
  return 'CNY';
};

export const dateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export const formatDate = (value: string | null) => {
  if (!value) return '时间未知';
  if (dateOnly(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
};

export const formatDecimal = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  return String(value);
};

export const formatCurrencyAmount = (amount: number, currency: Currency) =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 8,
  }).format(amount);

export const currencyLabel = (currency: Currency) => {
  if (currency === 'CNY') return 'CNY · 人民币';
  if (currency === 'HKD') return 'HKD · 港币';
  return 'USD · 美元';
};

const sourceChannelLabels: Record<string, string> = {
  manual: '桌面端 · 资产录入',
  'desktop-account-data': '桌面端 · 资产录入',
  'desktop-account-data-reconciliation': '桌面端 · 快照对账',
  'desktop-cash-deposit': '桌面端 · 现金入账',
  'desktop-cash-transfer': '桌面端 · 资金划转',
  'recurring-cash-deposit': '服务端 · 周期存款',
  'screenshot:rollback': '服务端 · 截图回滚',
};

export const sourceChannelLabel = (channel: string) => sourceChannelLabels[channel] ?? channel;

export const cashFlowCategoryLabel = (category: string) => {
  if (category === 'DEPOSIT') return '现金入账';
  if (category === 'WITHDRAWAL') return '现金支出';
  if (category === 'TRANSFER') return '账户间划转';
  if (category === 'INTEREST') return '利息收入';
  if (category === 'FEE') return '费用';
  if (category === 'TAX') return '税费';
  return '现金流';
};

export const eventTypeLabel = (event: LedgerEventV2) => {
  if (event.type === 'BUY_EXECUTION') return '买入成交';
  if (event.type === 'SELL_EXECUTION') return '卖出成交';
  if (event.type === 'POSITION_BASELINE_OBSERVATION') return '持仓快照';
  if (event.type === 'CASH_BALANCE_OBSERVATION') return '现金快照';
  if (event.type === 'BASELINE_RECONCILIATION') return '快照对账';
  if (event.type === 'BONUS_SHARE') return '送股';
  if (event.type === 'SPLIT') return '拆分';
  if (event.type === 'MERGE') return '合并';
  if (event.type === 'DIVIDEND') return '分红';
  return '现金流';
};

export const revisionLabel = (event: LedgerEventV2) => {
  if (event.revisionAction === 'REPLACE') return '已更正';
  if (event.revisionAction === 'RESTORE') return '已恢复';
  return '当前有效';
};

export const revisionBadgeVariant = (event: LedgerEventV2): 'default' | 'secondary' | 'outline' => {
  if (event.revisionAction === 'REPLACE') return 'secondary';
  if (event.revisionAction === 'RESTORE') return 'default';
  return 'outline';
};

export const executionSideLabel = (event: ExecutionEvent) =>
  event.type === 'BUY_EXECUTION' ? '买入' : '卖出';

export const eventSymbol = (event: LedgerEventV2): string | null => {
  if (event.revisionAction === 'VOID') return null;
  switch (event.type) {
    case 'BUY_EXECUTION':
    case 'SELL_EXECUTION':
    case 'POSITION_BASELINE_OBSERVATION':
    case 'BASELINE_RECONCILIATION':
    case 'BONUS_SHARE':
    case 'SPLIT':
    case 'MERGE':
    case 'DIVIDEND':
      return event.payload.symbol;
    default:
      return null;
  }
};

export const eventSubjectDetail = (event: LedgerEventV2): string | null => {
  if (event.revisionAction === 'VOID') return null;
  switch (event.type) {
    case 'POSITION_BASELINE_OBSERVATION': {
      const { quantity, averageCost, currency } = event.payload;
      const cost = averageCost !== undefined ? ` · ${formatDecimal(averageCost)} ${currency}` : '';
      return `${eventTypeLabel(event)} · ${formatDecimal(quantity)}${cost}`;
    }
    case 'BASELINE_RECONCILIATION':
      return `${eventTypeLabel(event)} · ${formatDecimal(event.payload.coveredQuantity)} · ${formatDecimal(event.payload.coveredCost)}`;
    case 'BONUS_SHARE':
      return `${eventTypeLabel(event)} · ${formatDecimal(event.payload.quantity)}`;
    case 'SPLIT':
    case 'MERGE':
      return `${eventTypeLabel(event)} · ${formatDecimal(event.payload.fromUnits)} → ${formatDecimal(event.payload.toUnits)}`;
    case 'DIVIDEND':
      return `${eventTypeLabel(event)} · ${formatDecimal(event.payload.amount)} ${event.payload.currency}`;
    default:
      return null;
  }
};

const multiplyDecimalStrings = (left: string, right: string) => {
  const parse = (value: string) => {
    if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error(`非法十进制值: ${value}`);
    const negative = value.startsWith('-');
    const unsigned = negative ? value.slice(1) : value;
    const [integer, fraction = ''] = unsigned.split('.');
    return {
      coefficient: BigInt(`${integer}${fraction}`) * (negative ? -1n : 1n),
      scale: fraction.length,
    };
  };
  const a = parse(left);
  const b = parse(right);
  const coefficient = a.coefficient * b.coefficient;
  const scale = a.scale + b.scale;
  const sign = coefficient < 0n ? '-' : '';
  const digits = (coefficient < 0n ? -coefficient : coefficient).toString();
  if (scale === 0) return `${sign}${digits}`;
  const padded = digits.padStart(scale + 1, '0');
  const integer = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/, '');
  return fraction ? `${sign}${integer}.${fraction}` : `${sign}${integer}`;
};

export const transactionAmount = (event: LedgerEventV2, execution: ExecutionEvent | null) => {
  if (execution) {
    try {
      const gross = multiplyDecimalStrings(execution.payload.quantity, execution.payload.price);
      return `${gross} ${execution.payload.currency}`;
    } catch {
      return `${formatDecimal(execution.payload.quantity)} ${execution.payload.currency}`;
    }
  }
  if (event.revisionAction !== 'VOID' && event.type === 'POSITION_BASELINE_OBSERVATION') {
    const { quantity, averageCost, currency } = event.payload;
    if (averageCost !== undefined) {
      try {
        return `${multiplyDecimalStrings(quantity, averageCost)} ${currency}`;
      } catch {
        return `${formatDecimal(quantity)} ${currency}`;
      }
    }
    return `${formatDecimal(quantity)} ${currency}`;
  }
  if (event.revisionAction !== 'VOID' && event.type === 'CASH_BALANCE_OBSERVATION')
    return formatDecimal(event.payload.amount);
  return '—';
};

export const decimalPattern = /^\d+(?:\.\d+)?$/;

export const isPositiveDecimal = (value: string) => {
  const normalized = value.trim();
  return decimalPattern.test(normalized) && /[1-9]/.test(normalized.replace('.', ''));
};

export const isNonNegativeDecimal = (value: string) => {
  const normalized = value.trim();
  return decimalPattern.test(normalized) && !normalized.startsWith('-');
};

export const createClientCommandId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `desktop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const localDateTimeValue = (value: string | null | undefined, precision: TimePrecision) => {
  if (precision === 'DATE') {
    if (!value) return '';
    if (dateOnly(value)) return value;
    return value.slice(0, 10);
  }
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

export const currentLocalDateTime = () => localDateTimeValue(new Date().toISOString(), 'INSTANT');

export const sourceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const toCommandTime = (value: string, precision: TimePrecision) => {
  if (precision === 'DATE') return value;
  return new Date(value).toISOString();
};

export const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ThesisLedgerApiError) return error.payload?.message ?? fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

export const errorCode = (error: unknown) =>
  error instanceof ThesisLedgerApiError ? error.payload?.errorCode : undefined;

export const commandFeedback = (response: LedgerCommandResponseV2, action: string) =>
  response.idempotentReplay ? `${action}已存在，未重复写入` : `${action}已写入账本`;

export const executionSubmitLabel = (submitting: boolean, editing: boolean) => {
  if (submitting) return '写入中…';
  if (editing) return '提交更正';
  return '记录成交';
};

export const correctionSubmitLabel = (pending: boolean, action: 'void' | 'restore') => {
  if (pending) return '提交中…';
  return action === 'void' ? '确认作废' : '确认恢复';
};

export const reconciliationBadgeLabel = (conflicted: boolean, selected: boolean) => {
  if (conflicted) return '存在冲突';
  if (selected) return '待确认';
  return '可用';
};

export const reconciliationBadgeVariant = (
  conflicted: boolean,
  selected: boolean,
): 'default' | 'destructive' | 'outline' => {
  if (conflicted) return 'destructive';
  if (selected) return 'default';
  return 'outline';
};

export const readLastAccount = () => {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem('thesis-ledger-last-account') ?? '';
  } catch {
    return '';
  }
};

export const existingInstrument = (event: ExecutionEvent | null): InstrumentLookup | null => {
  if (!event) return null;
  const market = event.payload.symbol.split('.').at(-1) ?? '';
  return {
    id: `existing:${event.eventId}`,
    symbol: event.payload.symbol,
    canonicalCode: event.payload.symbol.split('.')[0] ?? event.payload.symbol,
    instrumentType: 'STOCK',
    market,
    displayName: event.payload.symbol,
    confirmable: true,
  };
};

export const executionDraft = (
  event: ExecutionEvent | null,
  defaultCurrency: Currency = 'CNY',
): ExecutionDraft => ({
  side: event?.type === 'SELL_EXECUTION' ? 'SELL' : 'BUY',
  symbol: event?.payload.symbol ?? '',
  quantity: event?.payload.quantity ?? '',
  price: event?.payload.price ?? '',
  currency: supportedCurrency(event?.payload.currency ?? defaultCurrency),
  occurredAt:
    localDateTimeValue(event?.occurredAt, event?.timePrecision === 'DATE' ? 'DATE' : 'INSTANT') ||
    currentLocalDateTime(),
  timePrecision: event?.timePrecision === 'DATE' ? 'DATE' : 'INSTANT',
  settledAt: localDateTimeValue(
    event?.payload.settledAt ?? event?.payload.expectedAt,
    'INSTANT',
  ),
  capabilityVerification: event?.payload.capabilityVerification ?? 'UNVERIFIED',
  note: event?.payload.note ?? '',
  reason: '',
});
