import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { convertStrategyDefinition } from '../../src/platform/named-v1-strategy-conversion.js';

export function namedStrategyFixture(input: unknown): BacktestStrategy {
  const prior = input as { schemaVersion?: string };
  const ordinal = prior.schemaVersion === 'strategy-definition-v1' ? 1 : Number(prior.schemaVersion);
  const result = convertStrategyDefinition(ordinal, input);
  if ('definition' in result) return result.definition;
  throw new Error(result.reason);
}
