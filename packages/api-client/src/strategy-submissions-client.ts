import {
  strategySubmissionIdSchema,
  strategySubmissionInputSchema,
  strategySubmissionReceiptSchema,
  type StrategySubmissionInput,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
export function strategySubmissionsClient(request: ParsedRequest) {
  const path = '/strategy-submissions';
  return {
    submit: (id: string, input: StrategySubmissionInput) =>
      request(path, strategySubmissionReceiptSchema, {
        method: 'POST',
        body: JSON.stringify({
          id: strategySubmissionIdSchema.parse(id),
          input: strategySubmissionInputSchema.parse(input),
        }),
      }),
    list: (signal?: AbortSignal) =>
      request(path, strategySubmissionReceiptSchema.array(), {
        signal: signal ?? null,
        cache: 'no-store',
      }),
    confirm: (id: string) =>
      request(
        path + '/' + strategySubmissionIdSchema.parse(id) + '/confirm',
        strategySubmissionReceiptSchema,
        {
          method: 'POST',
        },
      ),
  };
}
