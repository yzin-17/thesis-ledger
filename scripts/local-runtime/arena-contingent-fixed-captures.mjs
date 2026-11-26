// 固定样本仅生成隔离验收输入，不调用模型，不读取或改写真实比赛。
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arenaLiveDecisionSchema, arenaLiveProtocolSchema } from '../../packages/schemas/dist/index.js';
import { protectionBrowserFixture, protectionDecision } from '../fixtures/arena-contingent-orders.mjs';
import { contingentIntentCases, initialCaseAccount, simulationMatching } from './arena-contingent-model-scenarios.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
export function prepareFixedContingentCaptures(output) {
assert(output.startsWith(resolve(root, 'var/acceptance') + '/'));
mkdirSync(output, { mode: 0o700 });
const template = protectionBrowserFixture().detail.protocol;
const protocol = arenaLiveProtocolSchema.parse({ ...template, universe: 'market', instruments: [], matching: simulationMatching, startsOn: '2026-11-13', endsOn: '2026-11-16',
  entrants: [template.entrants[0]], initialCash: '100000', maxPositionBps: 10000 });
for (const sample of contingentIntentCases) {
  const d = protectionDecision(), initial = initialCaseAccount(sample), plan = d.orders[0].onFill, stop = plan.activateOrders[0];
  if (sample.id === 'research') { d.orders[0].onFill = null; d.wakeups[0].price = '355'; }
  if (sample.id === 'each') { plan.activation = 'on_each_fill'; plan.afterExit = 'cancel_entry_remainder'; }
  if (sample.id === 'oco') { stop.exitGroup = 'exit'; plan.activateOrders.push({ ...stop, clientId: 'take', kind: 'take_profit', price: '375' }); }
  if (sample.id === 'staged' || sample.id.startsWith('staged_each_')) { plan.exitPolicy = 'staged'; plan.activateOrders.push({ ...stop, clientId: 'take', kind: 'take_profit', price: '375',
    quantity: { basis: 'parent_filled_fraction', numerator: 1, denominator: 3 } }); }
  if (sample.id.startsWith('staged_each_')) { plan.activation = 'on_each_fill'; plan.afterExit = sample.id.endsWith('keep') ? 'keep_entry_remainder' : 'cancel_entry_remainder'; }
  if (sample.id === 'trailing') stop.trailing = { priceSource: 'executable_quote', reference: 'highest_since_activation',
    distance: { kind: 'percent', value: '2' }, breakEven: { triggerGainPercent: '1', reference: 'gross_average_entry_price' } };
  if (['parallel', 'sequential'].includes(sample.id)) {
    d.orders[0].quantity = '10'; d.orders[0].onFill = null;
    d.orders.push({ ...d.orders[0], clientId: 'second', quantity: '17', entryAfter: sample.id === 'sequential' ? { clientId: d.orders[0].clientId, activation: 'on_full_fill' } : null });
  }
  if (sample.id.startsWith('cancel_')) { d.orders = []; d.cancelOrderIds = [initial.orders[sample.id === 'cancel_remaining' ? 0 : 1].id]; }
  const decision = arenaLiveDecisionSchema.parse(d);
  writeFileSync(resolve(output, sample.id + '.json'), JSON.stringify({ intent: sample.intent, fixedFixture: true,
    cycle: { state: 'succeeded', input: { protocol, account: initial, replay: true, asOf: '2026-11-13T15:00:00.000Z' } },
    result: { configuration: decision, supported: true, category: 'fixed_fixture' } }, null, 2), { flag: 'wx', mode: 0o600 });
}
console.log(JSON.stringify({ status: 'prepared', fixtures: contingentIntentCases.length, modelCalls: 0, output }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepareFixedContingentCaptures(resolve(process.argv[2] ?? ''));
