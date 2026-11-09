import { randomUUID } from 'node:crypto';
import { backtestRunPreparationRequestV3Schema, backtestRunPreparationResultV3Schema } from '@thesis-ledger/schemas';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

export async function preparationFailureFixture() {
  const fixture = await completeSnapshotFixture();
  const c = fixture.input.runConfig;
  const preparation = backtestRunPreparationRequestV3Schema.parse({
    contractVersion: 3, requestId: randomUUID(), strategyVersionId: randomUUID(),
    adjustment: 'qfq', accountingBasis: 'normalized-series',
    history: { basis: 'fixed-provider-snapshot' },
    runConfig: { startDate: c.startDate, endDate: c.endDate, dataAsOf: c.dataAsOf,
      baseCurrency: c.baseCurrency, initialCash: c.initialCash,
      valuationPolicy: c.valuationPolicy, executionModel: c.executionModel },
  });
  const blocked = backtestRunPreparationResultV3Schema.parse({
    status: 'blocked', contractVersion: 3, requestId: preparation.requestId,
    scope: 'execution-window', checkedAt: new Date().toISOString(),
    diagnostics: [{ category: 'data-unavailable', code: 'DATA_UNAVAILABLE', severity: 'error',
      purpose: 'execution', message: '主源未识别代码', capability: 'DAILY_BAR',
      routeKey: fixture.input.executionRouteKey, symbol: fixture.input.strategy.executionInstrument.symbol,
      dateRange: { startDate: c.startDate, endDate: c.endDate },
      targetSources: [], missingFields: [], incompatibleRules: [],
      suggestedActions: [{ action: 'select-compatible-route', description: '请核对行情来源。' }] }],
  });
  return { preparation, strategy: fixture.input.strategy, blocked };
}
