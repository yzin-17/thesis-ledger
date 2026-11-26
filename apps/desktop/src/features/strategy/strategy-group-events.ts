import type { StrategyBacktestGroupPage } from './strategy-optimization.api.js';
import type { BacktestJobSummary } from './strategy.types.js';
import { isBacktestRunUpdateOlder } from '@thesis-ledger/domain';

export function applyBacktestGroupEvent(current: unknown, incoming: BacktestJobSummary): unknown {
  if (!current || typeof current !== 'object' || !('items' in current)) return current;
  const page = current as StrategyBacktestGroupPage;
  if (!Array.isArray(page.items)) return current;
  return {
    ...page,
    items: page.items.map((group) => ({
      ...group,
      jobs: group.jobs.map((job) => (job.id === incoming.id && !isBacktestRunUpdateOlder(job, incoming) ? { ...job, ...incoming } : job)),
    })),
  };
}
