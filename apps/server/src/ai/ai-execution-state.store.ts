import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  aiExecutionSummarySchema,
  aiGenerationErrorSchema,
  aiGenerationOutcomeSchema,
  aiRequestReservationSchema,
  aiUsageRevisionSchema,
  type AiExecutionSummary,
  type AiGenerationError,
  type AiRequestAttempt,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';

type Database = PrismaService | Prisma.TransactionClient;

type LockedAiRun = {
  id: string;
  status: string;
  executionAttempt: number;
  leaseUntil: Date | null;
  modelMetadata: unknown;
};

export type AiExecutionOwnership = {
  runId: string;
  executionAttempt: number;
};

export type AiRequestPreparation = AiExecutionOwnership & {
  requestId: string;
  reservation: unknown;
  preparedAt?: Date;
};

export type AiRequestCompletion = AiExecutionOwnership & {
  requestId: string;
  revision: unknown;
  outcome: unknown;
  error?: unknown;
  completedAt?: Date;
  checkpoint?: unknown;
  result?: unknown;
  continuationBlockedReason?: AiExecutionSummary['continuationBlockedReason'];
  finalization?: {
    provider: string;
    model: string;
    durationMs?: number;
  };
};

export type AiExecutionSettlementContext = {
  transaction: Prisma.TransactionClient;
  runId: string;
  request: AiRequestAttempt;
  revision: number;
  completedAt: Date;
  execution: AiExecutionSummary;
};

export type AiExecutionSettlementParticipant = {
  settle(context: AiExecutionSettlementContext): Promise<AiExecutionSummary['continuationBlockedReason']>;
  commit?(context: AiExecutionSettlementContext): Promise<void>;
};

export type AiRequestSettlementResult = {
  applied: boolean;
  idempotent: boolean;
  continuationBlockedReason: AiExecutionSummary['continuationBlockedReason'];
  execution: AiExecutionSummary;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

const executionFrom = (metadata: unknown) => {
  const candidate = asRecord(metadata).sdkExecution;
  const parsed = aiExecutionSummarySchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};

const withExecution = (metadata: unknown, execution: AiExecutionSummary) => ({
  ...asRecord(metadata),
  sdkExecution: execution,
});

const requestIndex = (execution: AiExecutionSummary, requestId: string) =>
  execution.requests.findIndex((request) => request.requestId === requestId);

const activeOwner = (run: LockedAiRun, ownership: AiExecutionOwnership, now: Date) =>
  run.status === 'running' &&
  run.executionAttempt === ownership.executionAttempt &&
  run.leaseUntil !== null &&
  run.leaseUntil.getTime() >= now.getTime();

const decimalAmount = (value: string | null) => new Prisma.Decimal(value ?? 0);

const aggregateRequestFacts = (requests: readonly AiRequestAttempt[]) =>
  requests.reduce(
    (total, request) => {
      const latest = request.usageRevisions.at(-1);
      let usageCompleteness = total.usageCompleteness;
      if (!latest || latest.usage.status === 'unknown') usageCompleteness = 'unknown';
      else if (latest.usage.status === 'partial' && usageCompleteness === 'reported')
        usageCompleteness = 'partial';
      return {
        inputTokens: total.inputTokens + (latest?.usage.inputTokens ?? 0),
        outputTokens: total.outputTokens + (latest?.usage.outputTokens ?? 0),
        cost: total.cost.plus(decimalAmount(latest?.cost.amount ?? null)),
        usageCompleteness,
      };
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cost: new Prisma.Decimal(0),
      usageCompleteness: 'reported',
    },
  );

const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

@Injectable()
export class AiExecutionStateStore {
  constructor(private readonly prisma: PrismaService) {}

  private lockRun(database: Database, runId: string) {
    return database.$queryRaw<LockedAiRun[]>(Prisma.sql`
      SELECT "id", "status", "executionAttempt", "leaseUntil", "modelMetadata"
      FROM "AiRun" WHERE "id"=${runId}::uuid FOR UPDATE
    `);
  }

  async initialize(
    ownership: AiExecutionOwnership,
    executionInput: unknown,
    now = new Date(),
  ): Promise<AiExecutionSummary | null> {
    const execution = aiExecutionSummarySchema.parse(executionInput);
    return this.prisma.$transaction(async (transaction) => {
      const run = (await this.lockRun(transaction, ownership.runId))[0];
      if (!run || !activeOwner(run, ownership, now)) return null;
      const existing = executionFrom(run.modelMetadata);
      if (existing) return existing;
      await transaction.aiRun.update({
        where: { id: ownership.runId },
        data: { modelMetadata: asJson(withExecution(run.modelMetadata, execution)) },
      });
      return execution;
    });
  }

  async prepareRequest(input: AiRequestPreparation): Promise<AiRequestAttempt | null> {
    const reservation = aiRequestReservationSchema.parse(input.reservation);
    const preparedAt = input.preparedAt ?? new Date();
    return this.prisma.$transaction(async (transaction) => {
      const run = (await this.lockRun(transaction, input.runId))[0];
      if (!run || !activeOwner(run, input, preparedAt)) return null;
      const execution = executionFrom(run.modelMetadata);
      if (!execution) throw new Error('AiRun 缺少 sdkExecution');
      const existingIndex = requestIndex(execution, input.requestId);
      if (existingIndex >= 0) return execution.requests[existingIndex] ?? null;
      const request: AiRequestAttempt = {
        requestId: input.requestId,
        sequence: execution.requests.length + 1,
        state: 'prepared',
        reservation,
        dispatchExecutionAttempt: null,
        preparedAt: preparedAt.toISOString(),
        dispatchingAt: null,
        completedAt: null,
        outcome: null,
        error: null,
        usageRevisions: [],
        settledRevision: 0,
      };
      const updated = aiExecutionSummarySchema.parse({
        ...execution,
        requests: [...execution.requests, request],
      });
      await transaction.aiRun.update({
        where: { id: input.runId },
        data: { modelMetadata: asJson(withExecution(run.modelMetadata, updated)) },
      });
      return request;
    });
  }

  async authorizeDispatch(
    ownership: AiExecutionOwnership,
    requestId: string,
    now = new Date(),
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const run = (await this.lockRun(transaction, ownership.runId))[0];
      if (!run || !activeOwner(run, ownership, now)) return false;
      const execution = executionFrom(run.modelMetadata);
      if (!execution) return false;
      const index = requestIndex(execution, requestId);
      const request = execution.requests[index];
      if (!request || request.state !== 'prepared') return false;
      const requests = [...execution.requests];
      requests[index] = {
        ...request,
        state: 'dispatching',
        dispatchExecutionAttempt: ownership.executionAttempt,
        dispatchingAt: now.toISOString(),
      };
      const updated = aiExecutionSummarySchema.parse({ ...execution, requests });
      await transaction.aiRun.update({
        where: { id: ownership.runId },
        data: { modelMetadata: asJson(withExecution(run.modelMetadata, updated)) },
      });
      return true;
    });
  }

  async renewLease(
    ownership: AiExecutionOwnership,
    leaseMs: number,
    now = new Date(),
  ) {
    const result = await this.prisma.aiRun.updateMany({
      where: {
        id: ownership.runId,
        status: 'running',
        executionAttempt: ownership.executionAttempt,
        leaseUntil: { gte: now },
      },
      data: { leaseUntil: new Date(now.getTime() + leaseMs) },
    });
    return result.count === 1;
  }

  async markUnknown(
    ownership: AiExecutionOwnership,
    requestId: string,
    errorInput: unknown,
    now = new Date(),
    revisionInput?: unknown,
  ) {
    const error = aiGenerationErrorSchema.parse(errorInput);
    const revision =
      revisionInput === undefined ? null : aiUsageRevisionSchema.parse(revisionInput);
    return this.prisma.$transaction(async (transaction) => {
      const run = (await this.lockRun(transaction, ownership.runId))[0];
      if (!run || !activeOwner(run, ownership, now)) return false;
      const execution = executionFrom(run.modelMetadata);
      if (!execution) return false;
      const index = requestIndex(execution, requestId);
      const request = execution.requests[index];
      if (!request || request.state !== 'dispatching') return false;
      const requests = [...execution.requests];
      requests[index] = {
        ...request,
        state: 'unknown',
        completedAt: now.toISOString(),
        error,
        ...(revision === null
          ? {}
          : { usageRevisions: [...request.usageRevisions, revision] }),
      };
      const aggregate = aggregateRequestFacts(requests);
      const updated = aiExecutionSummarySchema.parse({
        ...execution,
        generationStatus: 'unknown',
        usageCompleteness: aggregate.usageCompleteness,
        requests,
      });
      await transaction.aiRun.update({
        where: { id: ownership.runId },
        data: {
          modelMetadata: asJson(withExecution(run.modelMetadata, updated)),
          ...(revision === null
            ? {}
            : {
                inputTokens: aggregate.inputTokens,
                outputTokens: aggregate.outputTokens,
                cost: aggregate.cost,
              }),
        },
      });
      return true;
    });
  }

  async completeAndSettle(
    input: AiRequestCompletion,
    participant?: AiExecutionSettlementParticipant,
  ): Promise<AiRequestSettlementResult | null> {
    const revision = aiUsageRevisionSchema.parse(input.revision);
    const outcome = aiGenerationOutcomeSchema.parse(input.outcome);
    const error: AiGenerationError | null =
      input.error === undefined ? null : aiGenerationErrorSchema.parse(input.error);
    const completedAt = input.completedAt ?? new Date();
    return this.prisma.$transaction(async (transaction) => {
      const run = (await this.lockRun(transaction, input.runId))[0];
      if (!run || run.executionAttempt !== input.executionAttempt) return null;
      const execution = executionFrom(run.modelMetadata);
      if (!execution) throw new Error('AiRun 缺少 sdkExecution');
      const index = requestIndex(execution, input.requestId);
      const currentRequest = execution.requests[index];
      if (!currentRequest) return null;
      const existingRevision = currentRequest.usageRevisions[revision.revision - 1];
      if (existingRevision && !sameJson(existingRevision, revision))
        throw new Error('同一计量修订包含冲突事实');
      if (currentRequest.settledRevision >= revision.revision) {
        return {
          applied: false,
          idempotent: true,
          continuationBlockedReason: execution.continuationBlockedReason,
          execution,
        };
      }
      if (
        !activeOwner(run, input, completedAt) ||
        !['dispatching', 'completed'].includes(currentRequest.state)
      )
        return null;
      if (!existingRevision && revision.revision !== currentRequest.usageRevisions.length + 1)
        throw new Error('计量修订必须连续写入');
      let request: AiRequestAttempt = {
        ...currentRequest,
        state: 'completed',
        completedAt: completedAt.toISOString(),
        outcome,
        error,
        usageRevisions: existingRevision
          ? currentRequest.usageRevisions
          : [...currentRequest.usageRevisions, revision],
      };
      let blocked = input.continuationBlockedReason ?? execution.continuationBlockedReason;
      const settlementContext = {
        transaction,
        runId: input.runId,
        request,
        revision: revision.revision,
        completedAt,
        execution,
      } satisfies AiExecutionSettlementContext;
      if (participant) blocked = (await participant.settle(settlementContext)) ?? blocked;
      request = { ...request, settledRevision: revision.revision };
      const requests = [...execution.requests];
      requests[index] = request;
      const aggregate = aggregateRequestFacts(requests);
      const updated = aiExecutionSummarySchema.parse({
        ...execution,
        generationStatus: outcome.status,
        continuationBlockedReason: blocked,
        usageCompleteness: aggregate.usageCompleteness,
        requests,
      });
      const data: Prisma.AiRunUpdateInput = {
        modelMetadata: asJson(withExecution(run.modelMetadata, updated)),
        inputTokens: aggregate.inputTokens,
        outputTokens: aggregate.outputTokens,
        cost: aggregate.cost,
        ...(input.checkpoint === undefined ? {} : { checkpoint: asJson(input.checkpoint) }),
      };
      if (input.result !== undefined) {
        data.status = 'succeeded';
        data.result = asJson(input.result);
        data.completedAt = completedAt;
        data.claimedAt = null;
        data.leaseUntil = null;
      }
      if (input.finalization) {
        data.provider = input.finalization.provider;
        data.model = input.finalization.model;
        if (input.finalization.durationMs !== undefined)
          data.durationMs = input.finalization.durationMs;
      }
      await transaction.aiRun.update({ where: { id: input.runId }, data });
      if (participant?.commit) await participant.commit(settlementContext);
      return {
        applied: true,
        idempotent: false,
        continuationBlockedReason: blocked,
        execution: updated,
      };
    });
  }

  async failOwned(
    ownership: AiExecutionOwnership,
    input: {
      errorCode: string;
      errorSummary: string;
      durationMs?: number;
      continuationBlockedReason?: AiExecutionSummary['continuationBlockedReason'];
    },
    now = new Date(),
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const run = (await this.lockRun(transaction, ownership.runId))[0];
      if (!run || !activeOwner(run, ownership, now)) return false;
      const execution = executionFrom(run.modelMetadata);
      const updated = execution
        ? aiExecutionSummarySchema.parse({
            ...execution,
            generationStatus:
              execution.generationStatus === 'pending' ? 'incomplete' : execution.generationStatus,
            continuationBlockedReason:
              input.continuationBlockedReason ?? execution.continuationBlockedReason,
          })
        : null;
      await transaction.aiRun.update({
        where: { id: ownership.runId },
        data: {
          status: 'failed',
          errorCode: input.errorCode.slice(0, 100),
          errorSummary: input.errorSummary.slice(0, 500),
          completedAt: now,
          claimedAt: null,
          leaseUntil: null,
          ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
          ...(updated === null
            ? {}
            : { modelMetadata: asJson(withExecution(run.modelMetadata, updated)) }),
        },
      });
      return true;
    });
  }
}
