import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AiExecutionSummary, AiRequestAttempt } from '@thesis-ledger/schemas';
import {
  AiExecutionStateStore,
  type AiRequestCompletion,
} from '../ai/ai-execution-state.store.js';

type LockedOptimizationAttempt = {
  id: string;
  experimentId: string;
  aiRunId: string | null;
  status: string;
};

type OptimizationAccount = {
  inputTokensUsed: number;
  outputTokensUsed: number;
  costUsed: Prisma.Decimal;
  budget: unknown;
};

type OptimizationBudget = {
  maxInputTokens?: unknown;
  maxOutputTokens?: unknown;
  maxCost?: unknown;
};

export type StrategyOptimizationAiCompletion = AiRequestCompletion & {
  attemptId: string;
  proposal?: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const budgetNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const decimalAmount = (value: string | null) => new Prisma.Decimal(value ?? 0);

const revisionCharge = (request: AiRequestAttempt, revision: number) => {
  const facts = revision === 0 ? null : request.usageRevisions[revision - 1];
  const reportedCost = facts?.cost.amount !== null && facts?.cost.amount !== undefined;
  return {
    inputTokens: facts?.usage.inputTokens ?? request.reservation.inputTokens,
    outputTokens: facts?.usage.outputTokens ?? request.reservation.outputTokens,
    cost: reportedCost
      ? decimalAmount(facts.cost.amount)
      : decimalAmount(request.reservation.cost.amount),
    costCurrency: reportedCost ? facts.cost.currency : request.reservation.cost.currency,
  };
};

@Injectable()
export class StrategyOptimizationAiSettlementStore {
  constructor(private readonly executions: AiExecutionStateStore) {}

  private async lockAttempt(
    transaction: Prisma.TransactionClient,
    attemptId: string,
    runId: string,
  ) {
    const rows = await transaction.$queryRaw<LockedOptimizationAttempt[]>(Prisma.sql`
      SELECT "id", "experimentId", "aiRunId", "status"
      FROM "OptimizationAttempt" WHERE "id"=${attemptId}::uuid FOR UPDATE
    `);
    const attempt = rows[0];
    if (!attempt || attempt.aiRunId !== runId || attempt.status !== 'running')
      throw new Error('OptimizationAttempt 已失去执行权或 AiRun 绑定不一致');
    return attempt;
  }

  private async settle(
    transaction: Prisma.TransactionClient,
    attemptId: string,
    runId: string,
    request: AiRequestAttempt,
    revision: number,
  ) {
    const attempt = await this.lockAttempt(transaction, attemptId, runId);
    const accounts = await transaction.$queryRaw<OptimizationAccount[]>(Prisma.sql`
      SELECT "inputTokensUsed", "outputTokensUsed", "costUsed", "budget"
      FROM "OptimizationExperiment" WHERE "id"=${attempt.experimentId}::uuid FOR UPDATE
    `);
    const account = accounts[0];
    if (!account) throw new Error('OptimizationExperiment 不存在');
    const previous = revisionCharge(request, request.settledRevision);
    const current = revisionCharge(request, revision);
    const nextInput = account.inputTokensUsed + current.inputTokens - previous.inputTokens;
    const nextOutput = account.outputTokensUsed + current.outputTokens - previous.outputTokens;
    const currencyMismatch =
      previous.costCurrency !== null &&
      current.costCurrency !== null &&
      previous.costCurrency !== current.costCurrency;
    const nextCost = currencyMismatch
      ? account.costUsed
      : account.costUsed.plus(current.cost.minus(previous.cost));
    const budget = asRecord(account.budget) as OptimizationBudget;
    const maxInput = budgetNumber(budget.maxInputTokens);
    const maxOutput = budgetNumber(budget.maxOutputTokens);
    const maxCost = typeof budget.maxCost === 'string' ? new Prisma.Decimal(budget.maxCost) : null;
    const latest = request.usageRevisions[revision - 1];
    const freeEvidenceAuthorized = request.reservation.cost.source?.startsWith('free_evidence:');
    let blocked: AiExecutionSummary['continuationBlockedReason'] = null;
    if (
      (maxInput !== null && nextInput > maxInput) ||
      (maxOutput !== null && nextOutput > maxOutput) ||
      (maxCost !== null && nextCost.greaterThan(maxCost))
    )
      blocked = 'budget_exceeded';
    else if (
      currencyMismatch ||
      (maxCost !== null &&
        latest?.cost.status === 'unknown' &&
        request.reservation.cost.amount === null &&
        !freeEvidenceAuthorized)
    )
      blocked = 'cost_unknown';
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "inputTokensUsed"=${nextInput}, "outputTokensUsed"=${nextOutput},
          "costUsed"=${nextCost}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${attempt.experimentId}::uuid
    `);
    return blocked;
  }

  completeAndSettle(input: StrategyOptimizationAiCompletion) {
    const { attemptId, proposal, ...completion } = input;
    return this.executions.completeAndSettle(completion, {
      settle: ({ transaction, runId, request, revision }) =>
        this.settle(transaction, attemptId, runId, request, revision),
      commit: async ({ transaction, runId, completedAt }) => {
        if (proposal === undefined) return;
        const changed = await transaction.$executeRaw(Prisma.sql`
          UPDATE "OptimizationAttempt"
          SET "status"='succeeded', "proposal"=${JSON.stringify(proposal)}::jsonb,
              "error"=NULL, "leaseUntil"=NULL, "completedAt"=${completedAt}
          WHERE "id"=${attemptId}::uuid AND "aiRunId"=${runId}::uuid AND "status"='running'
        `);
        if (changed !== 1) throw new Error('OptimizationAttempt 终态提交失去执行权');
      },
    });
  }
}
