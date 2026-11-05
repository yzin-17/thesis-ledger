import {
  createRecurringFundInvestmentPlanSchema,
  updateRecurringFundInvestmentPlanSchema,
  confirmRecurringFundInvestmentOccurrenceSchema,
  type AccountResponse,
  type InstrumentSearchResult,
} from '@thesis-ledger/schemas';
export function isFundInvestmentInstrument(
  item: Pick<InstrumentSearchResult, 'instrumentType' | 'symbol'>,
) {
  return item.instrumentType === 'MUTUAL_FUND' && /^\d{6}\.OF$/.test(item.symbol);
}
export function fundPlanInput(
  form: { name: string; amount: string; day: string; startPeriod: string; symbol: string },
  account: AccountResponse,
  version?: number,
) {
  if (!account.active || account.mode !== 'actual' || account.type !== 'fund')
    throw new Error('基金定投只支持启用的实际基金账户。');
  if (version !== undefined)
    return updateRecurringFundInvestmentPlanSchema.parse({
      expectedVersion: version,
      name: form.name,
      expectedAmount: form.amount.trim(),
      dayOfMonth: Number(form.day),
    });
  return createRecurringFundInvestmentPlanSchema.parse({
    accountId: account.id,
    name: form.name,
    symbol: form.symbol,
    expectedAmount: form.amount.trim(),
    dayOfMonth: Number(form.day),
    startPeriod: form.startPeriod,
    timezone: 'Asia/Shanghai',
  });
}
export function fundOccurrenceInput(
  form: { quantity: string; price: string; commission: string; occurredAt: string },
  version: number,
) {
  return confirmRecurringFundInvestmentOccurrenceSchema.parse({
    expectedVersion: version,
    actualQuantity: form.quantity.trim(),
    unitPrice: form.price.trim(),
    occurredAt: form.occurredAt.trim(),
    ...(form.commission.trim() ? { commission: form.commission.trim() } : {}),
  });
}
