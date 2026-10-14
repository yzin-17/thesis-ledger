import type { PrismaClient } from '@prisma/client';
import type { IdentityService } from '../../src/identity/identity.service.js';
import type { AuthoringOperationRepository } from '../../src/strategy-authoring/authoring-operation.repository.js';
import type { AuthoringProvenanceRepository } from '../../src/strategy-authoring/authoring-provenance.repository.js';
import type { StrategyAccessService } from '../../src/backtest/strategy-access.service.js';

export type AuthoringExecutionCaseContext = {
  output: unknown;
  readonly providerCalls: number;
  request: (
    path: string,
    status: number,
    body?: unknown,
    token?: string,
    method?: 'PATCH',
  ) => Promise<Record<string, unknown>>;
  observe: (id: string) => Promise<Record<string, unknown>>;
  selection: (key: string) => {
    kind: string;
    expectedRevision: number;
    idempotencyKey: string;
    providerId: string;
    model: string;
    intent: string;
    unknownCostAcknowledgedAt: null;
  };
  alice: Awaited<ReturnType<IdentityService['register']>>;
  bob: Awaited<ReturnType<IdentityService['register']>>;
  draftId: string;
  instrumentId: string;
  operations: AuthoringOperationRepository;
  db: PrismaClient;
  sources: AuthoringProvenanceRepository;
  access: StrategyAccessService;
  blank: {
    title: string;
    description: string;
    questions: never[];
    requirements: never[];
    runtimeIntents: never[];
    removedRequirements: never[];
    definitionText: string;
    manualChanges: never[];
  };
  modelBodies: Array<{ model: string }>;
};
