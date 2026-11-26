import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareFrozenRows, assertRefreezeScope } from './strategy-cross-live-preparation.mjs';

test('重新冻结逐行区分价格变化、观察事实变化及增删日期', () => {
  const old = [{ occurredAt: '2026-01-01', open: '10', close: '12', inputFingerprint: 'old' }];
  const changedFact = [{ ...old[0], inputFingerprint: 'new' }];
  const facts = compareFrozenRows(old, changedFact);
  assert.equal(facts.sameRows, false);
  assert.equal(facts.samePrices, true);
  assert.deepEqual(facts.fieldCounts, { inputFingerprint: 1 });
  assert.equal(compareFrozenRows(old, [{ ...old[0], close: '13' }]).samePrices, false);
  assert.deepEqual(compareFrozenRows(old, []).missingDates, ['2026-01-01']);
  assert.deepEqual(compareFrozenRows([], old).addedDates, ['2026-01-01']);
  assert.throws(() => compareFrozenRows(old, [...old, ...old]), /日期重复/);
});

test('重新冻结可以更新来源事实与引用，但拒绝改变资金、区间或费用', () => {
  const original = { startDate: '2025-11-12', endDate: '2026-11-12', initialCash: { HKD: '100000' },
    executionModel: { fees: '0' }, dataAsOf: '2026-11-12T15:00:00Z', frozenExecutionWindow: { id: 'old' },
    priceInputBindings: { signals: [{ sourceId: 'old', binding: 'execution-series' }], benchmark: { binding: 'execution-series' } },
    executionPriceProtocol: { history: { basis: 'fixed-provider-snapshot' }, priceBasis: { adjustment: 'hfq', quantityBasis: 'normalized-units', observedAt: 'old' } } };
  const prepared = structuredClone(original);
  prepared.dataAsOf = '2026-11-15T15:00:00Z';
  prepared.frozenExecutionWindow = { id: 'new' };
  prepared.executionPriceProtocol.priceBasis.observedAt = 'new';
  prepared.priceInputBindings.signals[0].sourceId = 'source1';
  assert.doesNotThrow(() => assertRefreezeScope(original, prepared, 'source1'));
  for (const change of [{ initialCash: { HKD: '200000' } }, { startDate: '2025-11-13' }, { executionModel: { fees: '0.1' } }])
    assert.throws(() => assertRefreezeScope(original, { ...prepared, ...change }, 'source1'), /资金或执行模型/);
});
