import {
  strategyDefinitionCreateSchema,
  strategyDefinitionListSchema,
  strategyDefinitionReadSchema,
  strategyVersionCreateSchema,
  strategyVersionReadSchema,
  type StrategyDefinitionCreate,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';

export function strategyDefinitionClient(request: ParsedRequest) {
  return {
    list: (signal?: AbortSignal) =>
      request(
        '/backtests/strategies',
        strategyDefinitionListSchema,
        signal ? { signal } : undefined,
      ),
    create: (input: StrategyDefinitionCreate) => {
      strategyDefinitionCreateSchema.parse(input);
      return request('/backtests/strategies', strategyDefinitionReadSchema, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
    },
    createVersion: (strategyId: string, schema: Record<string, unknown>) => {
      if (!strategyId) throw new Error('缺少策略编号');
      strategyVersionCreateSchema.parse({ schema });
      return request(
        `/backtests/strategies/${encodeURIComponent(strategyId)}/versions`,
        strategyVersionReadSchema.refine(
          (v) => v.strategyId === undefined || v.strategyId === strategyId,
        ),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ schema }),
        },
      );
    },
  };
}
