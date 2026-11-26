// 只读目标容器验收：所有订单与账本仅在进程内存中，不连接业务数据库。
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { aiGenerationContracts, arenaLiveDecisionSchema, arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { arenaSubmitDecision, arenaMatchOrders, arenaExpireOrders, arenaDecisionPlanLines } from '@thesis-ledger/domain';
assert.equal(aiGenerationContracts.arenaLiveResearch.ref.version, 'arena-live-research-v5');
const context = (minute, price) => {
  const at = '2026-11-13T15:' + String(minute).padStart(2, '0') + ':00.000Z';
  return { at, tradingDate: '2026-11-13', allowedSymbols: new Set(['AAPL.US']), maxActiveSymbols: 50, maxPositionBps: 10000,
    fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
    expiresAt: day => (day ?? '2026-11-13') + 'T21:00:00.000Z', newId: randomUUID,
    quotes: [{ symbol: 'AAPL.US', price, marketTime: at, observedAt: at, sourceRef: 'independent-runtime-fixture', evidence: { synthetic: true },
      tradingDate: '2026-11-13', positionAvailableOn: '2026-11-13', cashAvailableOn: '2026-11-13', lot: '1', tick: '0.01',
      buyBlocked: null, sellBlocked: null, statutoryBuyFee: () => '0', statutorySellFee: () => '0' }] };
};
const original = arenaLiveAccountSchema.parse({ revision: 0, cash: '100000', positions: [], orders: [], fills: [], cashSettlements: [], watchedSymbols: [], wakeups: [] });
const plan = arenaLiveDecisionSchema.parse({ summary: '目标容器内独立模拟', orders: [{ clientId: 'entry', side: 'buy', symbol: 'AAPL.US', kind: 'limit',
  price: '359.50', quantity: '27', expiresOn: '2026-11-13', exitGroup: null,
  onFill: { activation: 'on_full_fill', activateOrders: [{ clientId: 'stop', side: 'sell', kind: 'stop_loss', price: '355',
    quantity: { basis: 'parent_open_quantity' }, reduceOnly: true, validUntil: { kind: 'date', expiresOn: '2026-11-16' } }] } }],
  cancelOrderIds: [], watchedSymbols: [], wakeups: [{ kind: 'price', symbol: 'AAPL.US', operator: 'lte', price: '357' }] });
const submitted = arenaSubmitDecision(original, 0, plan, context(0, '360'));
assert.deepEqual(submitted.orders.map(o => o.state), ['active', 'waiting_parent']);
const entered = arenaLiveAccountSchema.parse(JSON.parse(JSON.stringify(arenaMatchOrders(submitted, context(1, '354'), true))));
assert.deepEqual(entered.fills.map(f => f.side), ['buy']); assert.equal(entered.orders[1].quantity, '27');
assert.equal(entered.orders[1].parentOrderId, entered.orders[0].id);
assert.deepEqual(arenaMatchOrders(entered, context(1, '354'), true), entered);
const exited = arenaMatchOrders(entered, context(2, '350'), true);
assert.deepEqual(exited.fills.map(f => [f.side, f.quantity, f.price]), [['buy', '27', '354'], ['sell', '27', '350']]);
assert.deepEqual(exited.positions, []);
assert.deepEqual(arenaMatchOrders(exited, context(3, '349'), true), exited);
assert.equal(arenaExpireOrders(submitted, '2026-11-13T21:00:00Z').orders[1].state, 'cancelled');
const research = structuredClone(plan); research.summary = '355美元止损'; research.orders[0].onFill = null;
const observed = arenaMatchOrders(arenaMatchOrders(arenaSubmitDecision(original, 0, research, context(0, '360')), context(1, '359'), true), context(2, '350'), true);
assert.deepEqual(observed.fills.map(f => f.side), ['buy']); assert.equal(observed.positions[0].quantity, '27');
assert(arenaDecisionPlanLines(research)[0].includes('0 张'));
const partialPlan = structuredClone(plan); partialPlan.orders[0].onFill.activation = 'on_each_fill';
partialPlan.orders[0].onFill.afterExit = 'cancel_entry_remainder';
const partialContext = (minute, price) => ({ ...context(minute, price), matching: { kind: 'simulated_volume', maxSharesPerObservation: '2' } });
let partial = arenaSubmitDecision(original, 0, partialPlan, partialContext(0, '360'));
for (let n = 1; n <= 7; n++) partial = arenaMatchOrders(partial, partialContext(n, n <= 5 ? '359' : '350'), true);
partial = arenaLiveAccountSchema.parse(JSON.parse(JSON.stringify(partial)));
assert.equal(partial.orders[0].state, 'cancelled'); assert.equal(partial.orders[0].remainingQuantity, '17');
assert.equal(partial.orders[1].filledQuantity, '4'); assert.equal(partial.orders[1].remainingQuantity, '6');
const stagedPlan = structuredClone(plan); stagedPlan.orders[0].onFill.exitPolicy = 'staged';
stagedPlan.orders[0].onFill.activateOrders.push({ ...stagedPlan.orders[0].onFill.activateOrders[0], clientId: 'take', kind: 'take_profit', price: '375',
  quantity: { basis: 'parent_filled_fraction', numerator: 1, denominator: 3 } });
const staged = arenaMatchOrders(arenaMatchOrders(arenaSubmitDecision(original, 0, stagedPlan, context(0, '360')), context(1, '359'), true), context(2, '380'), true);
assert.equal(staged.orders[1].remainingQuantity, '18'); assert.equal(staged.orders[2].filledQuantity, '9');
const eachStagedPlan = structuredClone(stagedPlan);
eachStagedPlan.orders[0].onFill.activation = 'on_each_fill'; eachStagedPlan.orders[0].onFill.afterExit = 'keep_entry_remainder';
const stagedContext = (minute, price) => ({ ...context(minute, price), matching: { kind: 'simulated_volume', maxSharesPerObservation: '10' } });
let eachStaged = arenaSubmitDecision(original, 0, eachStagedPlan, stagedContext(0, '360'));
eachStaged = arenaMatchOrders(arenaMatchOrders(eachStaged, stagedContext(1, '359'), true), stagedContext(2, '380'), true);
assert.equal(eachStaged.orders[2].filledQuantity, '3'); assert.equal(eachStaged.orders[1].remainingQuantity, '7');
assert.equal(eachStaged.orders[2].reason, 'awaiting_parent_quantity');
const eachStagedIds = eachStaged.orders.map(o => o.id);
eachStaged = arenaLiveAccountSchema.parse(JSON.parse(JSON.stringify(eachStaged)));
assert.deepEqual(arenaMatchOrders(eachStaged, stagedContext(2, '380'), true), eachStaged);
eachStaged = arenaMatchOrders(eachStaged, stagedContext(3, '359'), true);
assert.equal(eachStaged.orders[2].remainingQuantity, '3'); assert.equal(eachStaged.orders[1].remainingQuantity, '17');
eachStaged = arenaMatchOrders(eachStaged, stagedContext(4, '380'), true);
eachStaged = arenaSubmitDecision(eachStaged, eachStaged.revision, { ...plan, orders: [], cancelOrderIds: [eachStaged.orders[0].id] }, stagedContext(5, '360'));
assert.equal(eachStaged.orders[2].state, 'filled'); assert.equal(eachStaged.orders[2].filledQuantity, '6');
assert.equal(eachStaged.orders[1].remainingQuantity, '14'); assert.deepEqual(eachStaged.orders.map(o => o.id), eachStagedIds);
const ocoPlan = structuredClone(plan); ocoPlan.orders[0].onFill.exitPolicy = 'oco';
ocoPlan.orders[0].onFill.activateOrders[0].exitGroup = 'attached';
ocoPlan.orders[0].onFill.activateOrders.push({ ...ocoPlan.orders[0].onFill.activateOrders[0], clientId: 'take', kind: 'take_profit', price: '375' });
const oco = arenaMatchOrders(arenaMatchOrders(arenaSubmitDecision(original, 0, ocoPlan, context(0, '360')), context(1, '359'), true), context(2, '380'), true);
assert.equal(oco.orders[1].state, 'cancelled'); assert.equal(oco.orders[2].filledQuantity, '27'); assert.deepEqual(oco.positions, []);
const dynamicPlan = structuredClone(plan); dynamicPlan.orders[0].onFill.activateOrders[0].trailing = {
  priceSource: 'executable_quote', reference: 'highest_since_activation', distance: { kind: 'percent', value: '2' }, breakEven: null };
const dynamic = arenaMatchOrders(arenaMatchOrders(arenaSubmitDecision(original, 0, dynamicPlan, context(0, '360')), context(1, '359'), true), context(2, '400'), true);
assert.equal(dynamic.orders[1].trailingState.triggerPrice, '392');
const sequence = structuredClone(plan); sequence.orders[0].quantity = '10'; sequence.orders[0].onFill = null;
sequence.orders.push({ ...sequence.orders[0], clientId: 'second', quantity: '17', entryAfter: { clientId: 'entry', activation: 'on_full_fill' } });
const firstBatch = arenaMatchOrders(arenaSubmitDecision(original, 0, sequence, context(0, '360')), context(1, '359'), true);
assert.equal(firstBatch.fills.length, 1); assert.equal(arenaMatchOrders(firstBatch, context(2, '359'), true).fills.length, 2);
console.log(JSON.stringify({ status: 'passed', contract: aiGenerationContracts.arenaLiveResearch.ref, writes: 0, protected: 27,
  fills: exited.fills.map(f => [f.side, f.quantity, f.price]), researchOnlyShares: observed.positions[0].quantity,
  partial: { bought: 10, exited: 4, protected: partial.orders[1].remainingQuantity }, staged: { exited: 9, protected: 18 },
  eachStaged: { bought: 20, exited: 6, protected: eachStaged.orders[1].remainingQuantity, stableIdentities: true },
  attachedOcoExited: oco.orders[2].filledQuantity, trailingLine: dynamic.orders[1].trailingState.triggerPrice, sequentialBatches: 2 }));
