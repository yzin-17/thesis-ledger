import type { ImportDraft as StoredImportDraft } from '@prisma/client';
import { importDraftSchema } from '@thesis-ledger/schemas';

export function importDraftResponse(draft: StoredImportDraft) {
  return importDraftSchema.parse({
    ...draft,
    sourceConfidence: Number(draft.sourceConfidence),
    baselineHash: draft.baselineHash ?? undefined,
    createdAt: draft.createdAt.toISOString(),
  });
}
