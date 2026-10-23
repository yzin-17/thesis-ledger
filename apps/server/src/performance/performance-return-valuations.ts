import type { ValuationPoint } from '@thesis-ledger/domain';
import { snapshotValue, type PerformanceLedgerEvent } from './performance-types.js';

export const performanceReturnValuations = (
  snapshots: readonly (Parameters<typeof snapshotValue>[0] & { capturedAt: Date })[],
  events: readonly PerformanceLedgerEvent[],
  convertFlow: (event: PerformanceLedgerEvent) => number,
): ValuationPoint[] =>
  snapshots.map((snapshot, index) => {
    const current = { date: snapshot.capturedAt.toISOString(), value: snapshotValue(snapshot) };
    const previous = snapshots[index - 1];
    if (!previous) return current;
    const interval = events.filter(
      (event) =>
        event.occurredAt !== null &&
        event.occurredAt > previous.capturedAt &&
        event.occurredAt <= snapshot.capturedAt,
    );
    const amounts = interval.map(convertFlow);
    return {
      ...current,
      externalFlow: amounts.reduce((sum, amount) => sum + amount, 0),
      externalFlowCount: amounts.filter((amount) => amount !== 0).length,
    };
  });
