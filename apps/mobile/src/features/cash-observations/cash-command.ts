import {
  cashBalanceObservationInputSchema,
  createCashFlowCommandSchema,
  type AccountResponse,
} from '@thesis-ledger/schemas';
import { ledgerInputTime } from '../accounts/ledger-input-time';

export type CashForm = {
  amount: string;
  currency: 'CNY' | 'HKD' | 'USD';
  occurredAt: string;
  expectedAt: string;
  settledAt: string;
  note: string;
};
export function initialCashForm(currency: CashForm['currency']): CashForm {
  return { amount: '', currency, occurredAt: '', expectedAt: '', settledAt: '', note: '' };
}
export function buildCashObservation(form: CashForm, accountId: string, now: number) {
  const capturedAt = ledgerInputTime(form.occurredAt, 'INSTANT');
  if (Date.parse(capturedAt) > now) throw new Error('快照时间不能晚于当前时间。');
  return cashBalanceObservationInputSchema.parse({
    accountId,
    amount: form.amount.trim(),
    currency: form.currency,
    capturedAt,
    source: 'manual',
  });
}
export function buildCashDeposit(form: CashForm, account: AccountResponse, id: string) {
  if (!account.active || account.mode !== 'actual' || account.type !== 'cash')
    throw new Error('手工入账只支持启用的实际现金账户。');
  if (form.currency !== account.currency) throw new Error('入账币种必须与账户一致。');
  return createCashFlowCommandSchema.parse({
    command: 'CREATE_CASH_FLOW',
    accountId: account.id,
    occurredAt: ledgerInputTime(form.occurredAt, 'INSTANT'),
    timePrecision: 'INSTANT',
    sourceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    economicOrderKey: id,
    payload: {
      direction: 'INFLOW',
      category: 'DEPOSIT',
      amount: form.amount.trim(),
      currency: form.currency,
      ...(form.expectedAt.trim()
        ? { expectedAt: ledgerInputTime(form.expectedAt, 'INSTANT') }
        : {}),
      ...(form.settledAt.trim() ? { settledAt: ledgerInputTime(form.settledAt, 'INSTANT') } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
    },
    source: { category: 'MANUAL', channel: 'mobile-cash', externalId: id },
    actorId: 'mobile-user',
  });
}
