import { importDraftReviewListSchema, importDraftSchema } from '@thesis-ledger/schemas';
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
type Request = <T>(path: string, schema: Schema<T>, init?: RequestInit) => Promise<T>;

export function ledgerImportClient(request: Request) {
  return {
    getReviews(accountId: string, signal?: AbortSignal) {
      return request(
        `/imports/review?accountId=${encodeURIComponent(accountId)}`,
        importDraftReviewListSchema.refine((rows) =>
          rows.every((row) => row.accountId === accountId),
        ),
        { cache: 'no-store', ...(signal ? { signal } : {}) },
      );
    },
    uploadScreenshot(body: FormData, accountId: string) {
      return request(
        '/imports/screenshot',
        importDraftSchema.refine((draft) => draft.accountId === accountId),
        {
          method: 'POST',
          body,
        },
      );
    },
  };
}
