import {
  cashBalanceObservationInputSchema,
  cashBalanceObservationResponseSchema,
  type CashBalanceObservationInput,
  createRecurringCashDepositPlanSchema,
  updateRecurringCashDepositPlanSchema,
  confirmRecurringCashDepositOccurrenceSchema,
  recurringCashDepositPlanSchema,
  recurringCashDepositPlansResponseSchema,
  recurringCashDepositOccurrenceSchema,
  recurringCashDepositOccurrencesResponseSchema,
  recurringCashDepositPlanQuerySchema,
  recurringCashDepositOccurrenceQuerySchema,
  recurringCashDepositPlanStateCommandSchema,
  skipRecurringCashDepositOccurrenceSchema,
  createRecurringFundInvestmentPlanSchema,
  updateRecurringFundInvestmentPlanSchema,
  confirmRecurringFundInvestmentOccurrenceSchema,
  recurringFundInvestmentPlanSchema,
  recurringFundInvestmentPlansResponseSchema,
  recurringFundInvestmentOccurrenceSchema,
  recurringFundInvestmentOccurrencesResponseSchema,
  recurringFundInvestmentPlanQuerySchema,
  recurringFundInvestmentOccurrenceQuerySchema,
} from '@thesis-ledger/schemas';
import { ThesisLedgerContractError } from './api-error.js';

type Schema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};
type Input<T> = { parse(value: unknown): T };
type Request = <T>(path: string, schema: Schema<T>, init?: RequestInit) => Promise<T>;
type PlanQuery = {
  accountId?: string | undefined;
  status?: 'ACTIVE' | 'PAUSED' | 'ENDED' | undefined;
};
type OccurrenceQuery = {
  accountId?: string | undefined;
  planId?: string | undefined;
  status?: 'PENDING' | 'CONFIRMED' | 'SKIPPED' | undefined;
};
type Identity = { id: string; accountId: string };

function recurringPlanClient<P extends Identity, O extends Identity, C, U, F>(
  request: Request,
  contract: {
    prefix: string;
    plan: Schema<P>;
    plans: Schema<P[]>;
    occurrence: Schema<O>;
    occurrences: Schema<O[]>;
    create: Input<C>;
    update: Input<U>;
    confirm: Input<F>;
    planQuery: Input<PlanQuery>;
    occurrenceQuery: Input<OccurrenceQuery>;
  },
) {
  const plansPath = `/${contract.prefix}-plans`;
  const occurrencesPath = `/${contract.prefix}-occurrences`;
  const query = (params: object) => {
    const entries = Object.entries(params).filter(([, value]) => value !== undefined);
    const suffix = new URLSearchParams(entries.map(([key, value]) => [key, String(value)]));
    return suffix.size ? `?${suffix}` : '';
  };
  const write = <T>(path: string, body: unknown, schema: Schema<T>, method = 'POST') =>
    request(path, schema, { method, body: JSON.stringify(body) });
  const planState = (id: string, action: 'pause' | 'resume' | 'end', version: number) =>
    write(
      `${plansPath}/${encodeURIComponent(id)}/${action}`,
      recurringCashDepositPlanStateCommandSchema.parse({ expectedVersion: version }),
      contract.plan,
    );
  return {
    async getPlans(params: PlanQuery = {}, signal?: AbortSignal) {
      const path = `${plansPath}${query(contract.planQuery.parse(params))}`;
      const rows = await request(path, contract.plans, {
        ...(signal ? { signal } : {}),
        cache: 'no-store',
      });
      if (params.accountId && rows.some((row) => row.accountId !== params.accountId))
        throw new ThesisLedgerContractError(path);
      return rows;
    },
    createPlan: (input: C) => write(plansPath, contract.create.parse(input), contract.plan),
    updatePlan: (id: string, input: U) =>
      write(
        `${plansPath}/${encodeURIComponent(id)}`,
        contract.update.parse(input),
        contract.plan,
        'PATCH',
      ),
    pausePlan: (id: string, version: number) => planState(id, 'pause', version),
    resumePlan: (id: string, version: number) => planState(id, 'resume', version),
    endPlan: (id: string, version: number) => planState(id, 'end', version),
    async getOccurrences(params: OccurrenceQuery = {}, signal?: AbortSignal) {
      const path = `${occurrencesPath}${query(contract.occurrenceQuery.parse(params))}`;
      const rows = await request(path, contract.occurrences, {
        ...(signal ? { signal } : {}),
        cache: 'no-store',
      });
      if (params.accountId && rows.some((row) => row.accountId !== params.accountId))
        throw new ThesisLedgerContractError(path);
      return rows;
    },
    confirmOccurrence: (id: string, input: F) =>
      write(
        `${occurrencesPath}/${encodeURIComponent(id)}/confirm`,
        contract.confirm.parse(input),
        contract.occurrence,
      ),
    skipOccurrence: (id: string, input: { expectedVersion: number; reason: string }) =>
      write(
        `${occurrencesPath}/${encodeURIComponent(id)}/skip`,
        skipRecurringCashDepositOccurrenceSchema.parse(input),
        contract.occurrence,
      ),
    reopenOccurrence: (id: string, version: number) =>
      write(
        `${occurrencesPath}/${encodeURIComponent(id)}/reopen`,
        recurringCashDepositPlanStateCommandSchema.parse({ expectedVersion: version }),
        contract.occurrence,
      ),
  };
}

export function cashManagementClient(request: Request) {
  return {
    cash: {
      recordBalance(input: CashBalanceObservationInput) {
        const body = cashBalanceObservationInputSchema.parse(input);
        return request('/portfolio/cash', cashBalanceObservationResponseSchema, {
          method: 'POST',
          body: JSON.stringify(body),
        }).then((result) => {
          if (
            result.accountId !== body.accountId ||
            result.amount !== body.amount ||
            (body.currency && result.currency !== body.currency)
          )
            throw new ThesisLedgerContractError('/portfolio/cash');
          return result;
        });
      },
    },
    cashDeposits: recurringPlanClient(request, {
      prefix: 'cash-deposit',
      plan: recurringCashDepositPlanSchema,
      plans: recurringCashDepositPlansResponseSchema,
      occurrence: recurringCashDepositOccurrenceSchema,
      occurrences: recurringCashDepositOccurrencesResponseSchema,
      create: createRecurringCashDepositPlanSchema,
      update: updateRecurringCashDepositPlanSchema,
      confirm: confirmRecurringCashDepositOccurrenceSchema,
      planQuery: recurringCashDepositPlanQuerySchema,
      occurrenceQuery: recurringCashDepositOccurrenceQuerySchema,
    }),
    fundInvestments: recurringPlanClient(request, {
      prefix: 'fund-investment',
      plan: recurringFundInvestmentPlanSchema,
      plans: recurringFundInvestmentPlansResponseSchema,
      occurrence: recurringFundInvestmentOccurrenceSchema,
      occurrences: recurringFundInvestmentOccurrencesResponseSchema,
      create: createRecurringFundInvestmentPlanSchema,
      update: updateRecurringFundInvestmentPlanSchema,
      confirm: confirmRecurringFundInvestmentOccurrenceSchema,
      planQuery: recurringFundInvestmentPlanQuerySchema,
      occurrenceQuery: recurringFundInvestmentOccurrenceQuerySchema,
    }),
  };
}
