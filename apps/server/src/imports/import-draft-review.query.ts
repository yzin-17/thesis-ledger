import { z } from 'zod';
import { importDraftReviewListSchema } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';

export const readImportDraftReviews = (prisma: PrismaService, accountId: string) =>
  prisma.$transaction(
    async (transaction) => {
      const drafts = await transaction.importDraft.findMany({
        where: { accountId },
        orderBy: { createdAt: 'desc' },
      });
      if (drafts.length === 0) return [];
      const revisions = await transaction.importDraftRevision.findMany({
        where: {
          OR: drafts.map((draft) => ({ draftId: draft.id, revision: draft.currentRevision })),
        },
      });
      const submitted = await transaction.importDraftRevision.findMany({
        where: { draftId: { in: drafts.map((draft) => draft.id) }, submittedAt: { not: null } },
        select: { draftId: true, submittedRowIds: true },
      });
      return importDraftReviewListSchema.parse(
        drafts.map((draft) => {
          const revision = revisions.find(
            (item) => item.draftId === draft.id && item.revision === draft.currentRevision,
          );
          let review = null;
          if (revision) {
            let observedAt = revision.observedAt?.toISOString() ?? null;
            if (observedAt && revision.timePrecision === 'DATE')
              observedAt = observedAt.slice(0, 10);
            review = {
              revision: revision.revision,
              parserVersion: revision.parserVersion,
              rawEvidenceRef: revision.rawEvidenceRef,
              contentHash: revision.contentHash,
              scope: revision.scope,
              observedAt,
              capturedAt: revision.capturedAt?.toISOString() ?? null,
              timePrecision: revision.timePrecision ?? 'UNKNOWN',
              sourceTimezone: revision.sourceTimezone,
              rows: revision.rows,
              frozenRowIds: [
                ...new Set(
                  submitted
                    .filter((item) => item.draftId === draft.id)
                    .flatMap((item) => z.array(z.string().min(1)).parse(item.submittedRowIds)),
                ),
              ],
            };
          }
          return {
            id: draft.id,
            accountId: draft.accountId,
            source: draft.source,
            status: draft.status,
            createdAt: draft.createdAt.toISOString(),
            review,
          };
        }),
      );
    },
    { isolationLevel: 'RepeatableRead' },
  );
