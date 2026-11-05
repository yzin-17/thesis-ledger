import {
  createRecurringCashDepositPlanSchema,
  updateRecurringCashDepositPlanSchema,
  confirmRecurringCashDepositOccurrenceSchema,
  type AccountResponse,
} from '@thesis-ledger/schemas';
export type CashPlanDraft = { name: string; amount: string; day: string; startPeriod: string };
export function cashPlanInput(form: CashPlanDraft, account: AccountResponse, version?: number) {
  if (!account.active || account.mode !== 'actual' || account.type !== 'cash')
    throw new Error('定期入账只支持启用的实际现金账户。');
  if (version !== undefined)
    return updateRecurringCashDepositPlanSchema.parse({
      expectedVersion: version,
      name: form.name,
      expectedAmount: form.amount.trim(),
      dayOfMonth: Number(form.day),
    });
  return createRecurringCashDepositPlanSchema.parse({
    accountId: account.id,
    name: form.name,
    expectedAmount: form.amount.trim(),
    dayOfMonth: Number(form.day),
    startPeriod: form.startPeriod,
    timezone: 'Asia/Shanghai',
  });
}
export function cashOccurrenceInput(form: { amount: string; occurredAt: string }, version: number) {
  return confirmRecurringCashDepositOccurrenceSchema.parse({
    expectedVersion: version,
    actualAmount: form.amount.trim(),
    occurredAt: form.occurredAt.trim(),
  });
}
