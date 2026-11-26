import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

// 重新取得来源事实只交由正式准备入口；用户选择和业务参数沿用旧运行。
export function refreezeRequest(original, strategyVersionId, requestId) {
  const {
    schemaVersion, executionPriceProtocol, priceInputBindings, frozenExecutionWindow,
    frozenWarmupBudgetSessions, frozenPriceWarmupPolicy, lifecyclePreparation,
    knownCashPreparation, priceResearch, ...runConfig
  } = original;
  assert.equal(priceResearch?.protocolVersion, 'price-research-v1');
  assert.equal(executionPriceProtocol.history.basis, 'fixed-provider-snapshot');
  assert(!lifecyclePreparation && !knownCashPreparation && !frozenPriceWarmupPolicy);
  return {
    contractVersion: 1, requestId, strategyVersionId, runConfig,
    adjustment: executionPriceProtocol.priceBasis.adjustment,
    accountingBasis: executionPriceProtocol.accountingBasis,
    history: executionPriceProtocol.history, priceResearch: priceResearch.protocolVersion,
    freezeTimePolicy: 'after-acquisition',
    ...(frozenWarmupBudgetSessions === undefined ? {} : { warmupBudgetSessions: frozenWarmupBudgetSessions }),
  };
}

export function assertRefreezeScope(original, prepared, sourceId) {
  const strip = ({ dataAsOf, frozenExecutionWindow, executionPriceProtocol, priceInputBindings, ...rest }) => rest;
  assert.deepEqual(strip(prepared), strip(original), '重新冻结不得改变历史区间、资金或执行模型');
  assert.deepEqual(prepared.priceInputBindings, {
    signals: [{ sourceId, binding: 'execution-series' }], benchmark: { binding: 'execution-series' },
  });
  const protocol = ({ priceBasis, ...rest }) => rest;
  assert.deepEqual(protocol(prepared.executionPriceProtocol), protocol(original.executionPriceProtocol));
  assert.equal(prepared.executionPriceProtocol.priceBasis.adjustment, 'hfq');
  assert.equal(prepared.executionPriceProtocol.priceBasis.quantityBasis, 'normalized-units');
  assert(Date.parse(prepared.dataAsOf) >= Date.parse(original.dataAsOf));
}

export function compareFrozenRows(previous, current) {
  const index = (rows) => {
    const result = new Map(rows.map((row) => [row.occurredAt, row]));
    assert.equal(result.size, rows.length, '行情日期重复');
    return result;
  };
  const oldRows = index(previous), newRows = index(current);
  const missingDates = [...oldRows.keys()].filter((date) => !newRows.has(date));
  const addedDates = [...newRows.keys()].filter((date) => !oldRows.has(date));
  const differences = [];
  const fieldCounts = {};
  for (const [date, oldRow] of oldRows) {
    const newRow = newRows.get(date);
    if (!newRow) continue;
    const fields = Object.keys({ ...oldRow, ...newRow }).filter((key) => !isDeepStrictEqual(oldRow[key], newRow[key]));
    if (fields.length) differences.push({ date, fields, previous: oldRow, current: newRow });
    for (const field of fields) fieldCounts[field] = (fieldCounts[field] ?? 0) + 1;
  }
  const priceFields = ['open', 'high', 'low', 'close', 'volume', 'amount', 'turnover'];
  return { previousRows: previous.length, currentRows: current.length, missingDates, addedDates,
    sameRows: !missingDates.length && !addedDates.length && !differences.length,
    samePrices: !missingDates.length && !addedDates.length && !priceFields.some((field) => fieldCounts[field]),
    changedRows: differences.length, fieldCounts, differences };
}
