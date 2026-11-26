import { isDeepStrictEqual } from 'node:util';
import { DecimalValue } from '@thesis-ledger/domain';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { intentEntry, intentExpression, intentPlan } from './practical-v6-intent-normalization.fixture.js';
import { practicalIntentReference, type PracticalIntentParameters } from './practical-v6-intent-contract.fixture.js';

/** 受控七例的独立原意检查，不能用于生产中按样本ID构造策略。 */
export function practicalV6IntentReview(id: string, actual: BacktestStrategy,
  baseline?: BacktestStrategy, changes: Partial<PracticalIntentParameters> = {}) {
  const expected = practicalIntentReference(id, changes, baseline);
  const issues: { path: string; message: string; expected: unknown; actual: unknown }[] = [];
  const check = (path: string, wanted: unknown, value: unknown) => {
    if (!isDeepStrictEqual(wanted, value)) issues.push({ path,
      message: '实际配置与本例已确认需求不一致', expected: wanted, actual: value });
  };
  let expectedEntry = intentEntry(expected.entry, expected);
  // “突破”允许明确上穿或严格高于；其他比较不因此放宽。
  if (id === 'captured-retest' && actual.entry.type === 'sequence' && actual.entry.trigger.type === 'cross' && expected.entry.type === 'sequence') {
    const trigger = expected.entry.trigger;
    if (trigger.type === 'compare') expectedEntry = intentEntry({ ...expected.entry,
      trigger: { type: 'cross', direction: 'above', left: trigger.left, right: trigger.right } }, expected);
  }
  check('entry', expectedEntry, intentEntry(actual.entry, actual));
  check('exit', intentExpression(expected.exit, expected), intentExpression(actual.exit, actual));
  check('entryTrigger', expected.entryTrigger, actual.entryTrigger);
  check('sizing', expected.sizing.type === 'percentOfEquity' ? DecimalValue.from(expected.sizing.percent).toString() : expected.sizing,
    actual.sizing.type === 'percentOfEquity' ? DecimalValue.from(actual.sizing.percent).toString() : actual.sizing);
  for (const field of ['schemaVersion', 'risk', 'execution', 'primaryTimeframe', 'executionInstrument'] as const) check(field, expected[field], actual[field]);
  check('tradePlan', intentPlan(expected), intentPlan(actual));
  const cost = (value: BacktestStrategy['cost']) => ({ ...value,
    commissionRate: DecimalValue.from(value.commissionRate).toString(),
    slippageRate: DecimalValue.from(value.slippageRate).toString() });
  check('cost', cost(expected.cost), cost(actual.cost));
  if (id === 'hfq-only-discovery') check('signalSources.priceCoordinate', true,
    actual.signalSources.every((source) => !source.series.length || source.priceCoordinate === 'research'));
  if (id === 'stop-only-policy' && baseline) for (const [field, value] of Object.entries(baseline)) {
    if (['tradePlan', 'signalSources', 'entryTrigger'].includes(field)) continue;
    check(`baseline.${field}`, value, (actual as unknown as Record<string, unknown>)[field]);
  }
  return { passed: !issues.length, issues, oracleVersion: 'practical-seven-intent-v1' };
}
