import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { arenaSubmitDecision, arenaMatchOrders, arenaExpireOrders, arenaAvailableCash, arenaAvailableShares } from '../../packages/domain/dist/index.js';
import * as schemas from '../../packages/schemas/dist/index.js';
const { arenaLiveFixture } = createRequire(import.meta.url)('./arena-live.cjs');
export const fixtureAt = '2026-11-13T15:00:00.000Z';
export function protectionDecision() {
  return schemas.arenaLiveDecisionSchema.parse({ summary: '买入后用355美元保护本批股票。',
    orders: [{ clientId: 'AAPL-entry', symbol: 'AAPL.US', side: 'buy', kind: 'limit', quantity: '27', price: '359.50',
      expiresOn: '2026-11-13', exitGroup: null,
      onFill: { activation: 'on_full_fill', activateOrders: [{ clientId: 'AAPL-stop', side: 'sell', kind: 'stop_loss', price: '355',
        quantity: { basis: 'parent_open_quantity' }, reduceOnly: true, validUntil: { kind: 'date', expiresOn: '2026-11-16' } }] },
    }], cancelOrderIds: [], watchedSymbols: [], wakeups: [{ kind: 'price', symbol: 'AAPL.US', operator: 'lte', price: '357' }] });
}
export function researchOnlyDecision() {
  return schemas.arenaLiveDecisionSchema.parse({ summary: '32.50美元止损。',
    orders: [{ clientId: 'TOPT-entry', symbol: 'TOPT.US', side: 'buy', kind: 'limit', quantity: '300', price: '34',
      expiresOn: '2026-11-13', exitGroup: null }], cancelOrderIds: [], watchedSymbols: [],
    wakeups: [{ kind: 'price', symbol: 'TOPT.US', operator: 'lte', price: '32.50' }] });
}
export function protectionContext(at = fixtureAt, price = '360') {
  return { at, tradingDate: '2026-11-13', maxPositionBps: 10000, maxActiveSymbols: 50,
    allowedSymbols: new Set(['AAPL.US', 'TOPT.US']), fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
    quotes: ['AAPL.US', 'TOPT.US'].map((symbol) => ({ symbol, price, marketTime: at, observedAt: at, tradingDate: '2026-11-13',
      positionAvailableOn: '2026-11-13', cashAvailableOn: '2026-11-13', lot: '1', tick: '0.01', buyBlocked: null, sellBlocked: null,
      sourceRef: 'independent-simulation', evidence: { synthetic: true }, statutoryBuyFee: () => '0', statutorySellFee: () => '0' })),
    expiresAt: (day) => (day ?? '2026-11-13') + 'T21:00:00.000Z', newId: randomUUID };
}
export function emptyProtectionAccount() {
  return { revision: 0, cash: '100000', positions: [], cashSettlements: [], orders: [], fills: [], wakeups: [], watchedSymbols: [] };
}
function advancedDecision(stage) {
  const d = protectionDecision(), plan = d.orders[0].onFill, stop = plan.activateOrders[0];
  if (stage === 'partial') { plan.activation = 'on_each_fill'; plan.afterExit = 'cancel_entry_remainder'; }
  if (stage === 'oco') { stop.exitGroup = 'attached'; plan.activateOrders.push({ ...stop, clientId: 'take', kind: 'take_profit', price: '375' }); }
  if (stage === 'staged' || stage.startsWith('staged_each')) { plan.exitPolicy = 'staged'; plan.activateOrders.push({ ...stop, clientId: 'take', kind: 'take_profit', price: '375',
    quantity: { basis: 'parent_filled_fraction', numerator: 1, denominator: 3 } }); }
  if (stage.startsWith('staged_each')) { plan.activation = 'on_each_fill'; plan.afterExit = 'keep_entry_remainder'; }
  if (stage === 'trailing') stop.trailing = { priceSource: 'executable_quote', reference: 'highest_since_activation',
    distance: { kind: 'percent', value: '2' }, breakEven: null };
  if (stage === 'sequential') {
    d.orders[0].quantity = '10';
    d.orders.push({ ...d.orders[0], clientId: 'second', quantity: '17', entryAfter: { clientId: d.orders[0].clientId, activation: 'on_full_fill' }, onFill: null });
  }
  return d;
}
function advanceBrowserAccount(account, stage) {
  if (stage === 'waiting' || stage === 'sequential') return account;
  if (stage.startsWith('staged_each')) {
    const prices = ['359', '380'];
    if (stage === 'staged_each_growing') prices.push('359');
    if (stage === 'staged_each_zero') prices.splice(1);
    for (const [i, price] of prices.entries()) account = arenaMatchOrders(account, {
      ...protectionContext(`2026-11-13T15:0${i + 1}:00.000Z`, price),
      matching: { kind: 'simulated_volume', maxSharesPerObservation: stage === 'staged_each_zero' ? '2' : '10' },
    }, true);
    return account;
  }
  if (stage === 'partial') {
    for (let n = 1; n <= 7; n++) account = arenaMatchOrders(account, { ...protectionContext(`2026-11-13T15:0${n}:00.000Z`, n <= 5 ? '359' : '350'),
      matching: { kind: 'simulated_volume', maxSharesPerObservation: '2' } }, true);
    return account;
  }
  account = arenaMatchOrders(account, protectionContext('2026-11-13T15:01:00.000Z', '359'), true);
  if (stage === 'staged') account = arenaMatchOrders(account, protectionContext('2026-11-13T15:02:00.000Z', '380'), true);
  if (stage === 'trailing') account = arenaMatchOrders(account, protectionContext('2026-11-13T15:02:00.000Z', '400'), true);
  if (stage === 'expired') account = arenaExpireOrders(account, '2026-11-16T21:00:00.000Z');
  return account;
}
export function protectionBrowserFixture(stage = 'waiting') {
  const fixture = arenaLiveFixture(schemas);
  fixture.detail.protocol.initialCash = '100000'; fixture.detail.protocol.maxPositionBps = 10000;
  fixture.detail.instrumentDirectory['TOPT.US'] = '模拟标的';
  if (stage === 'partial') fixture.detail.protocol.matching = { kind: 'simulated_volume', maxSharesPerObservation: '2' };
  if (stage.startsWith('staged_each')) fixture.detail.protocol.matching = { kind: 'simulated_volume', maxSharesPerObservation: stage === 'staged_each_zero' ? '2' : '10' };
  for (const [index, agent] of fixture.detail.agents.entries()) {
    const decision = index ? researchOnlyDecision() : advancedDecision(stage);
    let account = arenaSubmitDecision(emptyProtectionAccount(), 0, decision, protectionContext());
    if (!index) account = advanceBrowserAccount(account, stage);
    agent.account = schemas.arenaLiveAccountSchema.parse(account);
    agent.availability = { tradingDate: '2026-11-13', cash: arenaAvailableCash(account, '2026-11-13'),
      shares: Object.fromEntries(['AAPL.US', 'TOPT.US'].map(symbol => [symbol, arenaAvailableShares(account, symbol, '2026-11-13')])) };
    agent.cycles[0].decision = decision;
    agent.cycles[0].createdAt = fixtureAt; agent.cycles[0].completedAt = fixtureAt;
  }
  fixture.detail = schemas.arenaLiveDetailSchema.parse(fixture.detail);
  return fixture;
}
