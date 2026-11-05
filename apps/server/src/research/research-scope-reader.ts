import { Injectable, Inject } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  researchScopeSnapshotV2Schema,
  type ResearchScopeSnapshotV2,
  type ResearchSubmissionV2,
} from '@thesis-ledger/schemas';
import { InstrumentService } from '../market/instrument.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import type { AiResearchSubmissionV2Access } from '../ai/ai-research-submission-v2.store.js';
import { ResearchScopePermissions } from './research-scope-permissions.js';
import { readLedgerResearchContext } from './research-ledger-context.js';
import { readStrategyResearchContext } from './research-strategy-context.js';
import type { ResearchPreparedContext } from './research-preparation-contract.js';

/** 对象权限与事实在同一次只读准备中确认；不写 Asset、账本、策略或新运行状态。 */
@Injectable()
export class ResearchScopeReader implements AiResearchSubmissionV2Access {
  private readonly permissions = new ResearchScopePermissions();
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InstrumentService) private readonly instruments: InstrumentService,
  ) {}
  assertSubmission(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    input: ResearchSubmissionV2,
  ) {
    return this.permissions.assertSubmission(transaction, ownerId, input);
  }
  assertSnapshot(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    snapshot: ResearchScopeSnapshotV2,
  ) {
    return this.permissions.assertSnapshot(transaction, ownerId, snapshot);
  }
  assertLegacy(transaction: Prisma.TransactionClient, ownerId: string, context: unknown) {
    return this.permissions.assertLegacy(transaction, ownerId, context);
  }
  allowedScopes(ownerId: string) {
    return this.permissions.allowedScopes(ownerId);
  }
  resolve(ownerId: string, input: ResearchSubmissionV2): Promise<ResearchPreparedContext> {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.assertSubmission(transaction, ownerId, input);
        if (input.scope.scope === 'instrument') {
          const instrument = await this.instruments.resolveCanonicalIdentity(
            input.scope.instrumentId,
            transaction,
          );
          const fetchedAt = new Date().toISOString();
          return {
            scopeSnapshot: researchScopeSnapshotV2Schema.parse({
              version: 'research-scope-v2',
              mode: input.mode,
              scope: 'instrument',
              confirmedAt: fetchedAt,
              instrument,
            }),
            privateMaterial: null,
            fetchedAt,
            reasons: [],
          };
        }
        if (input.scope.scope === 'strategy')
          return readStrategyResearchContext(transaction, this.instruments, input);
        return readLedgerResearchContext(transaction, this.instruments, input);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
