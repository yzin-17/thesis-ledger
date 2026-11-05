import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import type {
  AccountResponse,
  RecurringCashDepositPlan,
  RecurringFundInvestmentPlan,
  RecurringCashDepositOccurrence,
  RecurringFundInvestmentOccurrence,
} from '@thesis-ledger/schemas';
import { cashPlanInput, cashOccurrenceInput } from '../recurring-cash/cash-plan';
import { fundPlanInput, fundOccurrenceInput } from '../recurring-funds/fund-plan';
export type PlanKind = 'cash' | 'fund';
export type MonthlyPlan = RecurringCashDepositPlan | RecurringFundInvestmentPlan;
export type MonthlyOccurrence = RecurringCashDepositOccurrence | RecurringFundInvestmentOccurrence;
export type MonthlyPlanDraft = {
  name: string;
  amount: string;
  day: string;
  startPeriod: string;
  symbol: string;
};
export type OccurrenceDraft = {
  amount: string;
  quantity: string;
  price: string;
  commission: string;
  occurredAt: string;
  reason: string;
};
export const planStatusOptions = [
  { value: 'ACTIVE', label: '启用' },
  { value: 'PAUSED', label: '暂停' },
  { value: 'ENDED', label: '结束' },
] as const;
export const occurrenceStatusOptions = [
  { value: 'PENDING', label: '待确认' },
  { value: 'CONFIRMED', label: '已确认' },
  { value: 'SKIPPED', label: '已跳过' },
] as const;
type PlanClient = {
  getPlans(params: { accountId: string }, signal?: AbortSignal): Promise<MonthlyPlan[]>;
  getOccurrences(params: { accountId: string }, signal?: AbortSignal): Promise<MonthlyOccurrence[]>;
  pausePlan(id: string, version: number): Promise<MonthlyPlan>;
  resumePlan(id: string, version: number): Promise<MonthlyPlan>;
  endPlan(id: string, version: number): Promise<MonthlyPlan>;
  skipOccurrence(
    id: string,
    input: { expectedVersion: number; reason: string },
  ): Promise<MonthlyOccurrence>;
  reopenOccurrence(id: string, version: number): Promise<MonthlyOccurrence>;
};
export function monthlyClient(api: ThesisLedgerApiClient, kind: PlanKind): PlanClient {
  return kind === 'cash' ? api.cashDeposits : api.fundInvestments;
}
export function saveMonthlyPlan(
  api: ThesisLedgerApiClient,
  kind: PlanKind,
  form: MonthlyPlanDraft,
  account: AccountResponse,
  plan?: MonthlyPlan,
) {
  if (kind === 'fund') {
    const input = fundPlanInput(form, account, plan?.version);
    if ('expectedVersion' in input) {
      if (!plan) throw new Error('原计划不存在。');
      return api.fundInvestments.updatePlan(plan.id, input);
    }
    return api.fundInvestments.createPlan(input);
  }
  const input = cashPlanInput(form, account, plan?.version);
  if ('expectedVersion' in input) {
    if (!plan) throw new Error('原计划不存在。');
    return api.cashDeposits.updatePlan(plan.id, input);
  }
  return api.cashDeposits.createPlan(input);
}
export function confirmMonthlyOccurrence(
  api: ThesisLedgerApiClient,
  kind: PlanKind,
  occurrence: MonthlyOccurrence,
  form: OccurrenceDraft,
) {
  if (kind === 'fund')
    return api.fundInvestments.confirmOccurrence(
      occurrence.id,
      fundOccurrenceInput(form, occurrence.version),
    );
  return api.cashDeposits.confirmOccurrence(
    occurrence.id,
    cashOccurrenceInput(form, occurrence.version),
  );
}
