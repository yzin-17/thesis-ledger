import { aiExecutionReadModel } from '../ai/ai-execution-read-model.js';
import { toRecord, type AttemptRow } from './strategy-optimization-common.js';

type AttemptCostPart = { costStatus: unknown; costCurrency: unknown; cost: unknown };

export const optimizationAttemptCostParts = (
  attempt: Pick<AttemptRow, 'modelMetadata' | 'cost'>,
): AttemptCostPart[] => {
  const metadata = toRecord(attempt.modelMetadata);
  if (!Object.hasOwn(metadata, 'sdkExecution'))
    return [
      { costStatus: metadata.costStatus, costCurrency: metadata.costCurrency, cost: attempt.cost },
    ];
  const execution = aiExecutionReadModel(metadata);
  if (!execution) return [{ costStatus: 'unknown', costCurrency: null, cost: null }];
  return execution.requests.flatMap((request): AttemptCostPart[] => {
    const facts = request.cost;
    const unknown = {
      costStatus: 'unknown',
      costCurrency: facts?.currency ?? request.reservation.cost.currency,
      cost: null,
    };
    if (facts?.status !== 'known') return [unknown];
    const known = { costStatus: 'known', costCurrency: facts.currency, cost: facts.amount };
    if (request.state === 'unknown' || request.state === 'dispatching') return [known, unknown];
    return [known];
  });
};
