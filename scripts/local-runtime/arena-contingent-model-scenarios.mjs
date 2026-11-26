import { arenaMatchOrders, arenaSubmitDecision, DecimalValue as D } from '../../packages/domain/dist/index.js';
import { protectionContext, protectionDecision, emptyProtectionAccount, fixtureAt } from '../fixtures/arena-contingent-orders.mjs';
import { stagedPartialIntentCases, isStagedPartialCase, stagedPartialEvents, stagedPartialConfigurationConforms, stagedPartialExecutionConforms } from './arena-staged-partial-scenarios.mjs';

const entry = '现在空仓。以359.50美元限价买入27股AAPL，入场单到今天收盘有效；';
const protection = '保护持续到11月16日收盘，跌到355美元时自动卖出本批仍持有股份。';
export const contingentIntentCases = [
  { id: 'sell', intent: entry + '全部买到后，' + protection },
  { id: 'research', intent: entry + '跌到355美元只唤醒重新研究，不自动卖出。' },
  { id: 'full', intent: entry + '等27股全部成交才保护，若只买到10股就先不保护。' + protection },
  { id: 'each', intent: entry + '每成交一部分就立即保护已买到的余仓。未来若人工撤掉未成交部分，仍保留已买部分的保护。首次止损成交时撤掉尚未买到的入场余量。' + protection },
  { id: 'oco', intent: entry + '全部买到后，跌到355止损或涨到375止盈，任意一方首次成交就取消另一方，已选中的退出继续卖完。两种退出都到11月16日收盘有效。' },
  { id: 'trailing', intent: entry + '全部买到后，用355作为初始最低止损线；之后跟踪合格可执行报价的最高点，回撤2%自动卖出；较本批成交均价上涨1%后至少把保护线提高到成交均价，不含手续费。保护到11月16日收盘。' },
  { id: 'staged', intent: entry + '全部买到后，涨到375只卖本批累计买到股数的三分之一，按每手一股向下取整；其余股份继续用355止损，止盈成交不能取消余仓止损。两种退出到11月16日收盘有效。' },
  { id: 'parallel', intent: '现在空仓。两批AAPL分别10股和17股，都以359.50美元限价买入，到今天收盘有效；两笔现在就一起挂出，不附退出单。' },
  { id: 'sequential', intent: '现在空仓。两批AAPL分别10股和17股，都以359.50美元限价买入，到今天收盘有效；第一批10股全部成交后才激活第二批17股，第一批没全成就结束时取消第二批。不附退出单。' },
  { id: 'cancel_remaining', intent: '账户里本批计划已经买到10股，入场还有17股未成交。只撤掉尚未买到的17股，继续保留这10股到355美元自动卖出的保护。' },
  { id: 'cancel_protection', intent: '账户里本批计划已经买到10股，入场还有17股未成交。只撤掉保护性止损，不撤入场余量，也不立即卖掉这10股。' },
  ...stagedPartialIntentCases,
].map(s => ({ ...s, supported: true }));

export const simulationMatching = { kind: 'simulated_volume', maxSharesPerObservation: '2' };
export const caseContext = (at = fixtureAt, price = '360') => ({ ...protectionContext(at, price), matching: simulationMatching });
const minuteAt = n => new Date(Date.parse(fixtureAt) + n * 60000).toISOString();
export function initialCaseAccount(sample) {
  if (!sample.id.startsWith('cancel_')) return emptyProtectionAccount();
  const d = protectionDecision(); d.orders[0].onFill.activation = 'on_each_fill'; d.orders[0].onFill.afterExit = 'keep_entry_remainder';
  let book = arenaSubmitDecision(emptyProtectionAccount(), 0, d, caseContext(minuteAt(-10)));
  for (let n = -9; n <= -5; n++) book = arenaMatchOrders(book, caseContext(minuteAt(n), '359'), true);
  return book;
}
export function caseEvents(sample) {
  if (isStagedPartialCase(sample)) return stagedPartialEvents(sample, minuteAt);
  if (sample.id.startsWith('cancel_')) return [1, 2].map(n => ({ at: minuteAt(n), price: '350' }));
  const count = sample.id === 'each' ? 5 : 14;
  const events = Array.from({ length: count }, (_, i) => ({ at: minuteAt(i + 1), price: '359' }));
  if (['parallel', 'sequential'].includes(sample.id)) return events;
  if (sample.id === 'trailing') events.push({ at: minuteAt(15), price: '400' });
  const length = sample.id === 'each' ? 2 : 14;
  for (let n = 1; n <= length; n++) events.push({ at: minuteAt(events.length + 1), price: '350' });
  if (sample.id === 'trailing') events.slice(15).forEach(e => { e.price = '390'; });
  if (sample.id === 'oco') events.slice(14).forEach(e => { e.price = '380'; });
  if (sample.id === 'staged') events.slice(14, 19).forEach(e => { e.price = '380'; });
  return events;
}
export function simulateCase(sample, submitted) {
  let book = submitted;
  const snapshots = [];
  for (const event of caseEvents(sample)) {
    book = arenaMatchOrders(book, caseContext(event.at, event.price), true);
    snapshots.push({ at: event.at, book });
  }
  return { final: book, snapshots };
}
const equal = (a, b) => typeof a === 'string' && D.from(a).compareTo(b) === 0;
export function caseConfigurationConforms(sample, decision, initial) {
  if (!decision) return false;
  if (sample.id.startsWith('cancel_')) {
    const target = sample.id === 'cancel_remaining' ? initial.orders[0] : initial.orders[1];
    return decision.orders.length === 0 && decision.cancelOrderIds.length === 1 && decision.cancelOrderIds[0] === target.id;
  }
  if (['parallel', 'sequential'].includes(sample.id)) {
    const buys = decision.orders.filter(o => o.side === 'buy');
    return buys.length === 2 && equal(buys[0].quantity, '10') && equal(buys[1].quantity, '17') &&
      buys.every(o => o.symbol === 'AAPL.US' && o.kind === 'limit' && equal(o.price, '359.50') && o.expiresOn === '2026-11-13' && !o.onFill) &&
      (sample.id === 'parallel' ? buys.every(o => !o.entryAfter) : !buys[0].entryAfter && buys[1].entryAfter?.clientId === buys[0].clientId);
  }
  const entry = decision.orders.find(o => o.side === 'buy' && o.symbol === 'AAPL.US' && o.kind === 'limit' && equal(o.quantity, '27') && equal(o.price, '359.50') && o.expiresOn === '2026-11-13');
  if (!entry || decision.orders.length !== 1) return false;
  if (sample.id === 'research') return !entry.onFill && decision.wakeups.some(w => w.kind === 'price' && w.symbol === 'AAPL.US' && w.operator === 'lte' && equal(w.price, '355'));
  const plan = entry.onFill, stop = plan?.activateOrders.find(c => c.kind === 'stop_loss' && equal(c.price, '355'));
  if (!stop || !plan || !plan.activateOrders.every(c => c.validUntil.kind === 'date' && c.validUntil.expiresOn === '2026-11-16')) return false;
  if (sample.id === 'each') return plan.activation === 'on_each_fill' && plan.afterExit === 'cancel_entry_remainder' && plan.activateOrders.length === 1;
  const take = plan.activateOrders.find(c => c.kind === 'take_profit' && equal(c.price, '375'));
  if (isStagedPartialCase(sample)) return stagedPartialConfigurationConforms(sample, plan, take);
  if (plan.activation !== 'on_full_fill') return false;
  if (sample.id === 'oco') return plan.activateOrders.length === 2 && !!stop.exitGroup && stop.exitGroup === take?.exitGroup;
  if (sample.id === 'staged') return plan.exitPolicy === 'staged' && take?.quantity.basis === 'parent_filled_fraction' && take.quantity.numerator * 3 === take.quantity.denominator;
  if (sample.id === 'trailing') return stop.trailing?.distance.kind === 'percent' && equal(stop.trailing.distance.value, '2') && equal(stop.trailing.breakEven?.triggerGainPercent, '1');
  return plan.activateOrders.length === 1 && !stop.trailing;
}
export function caseExecutionConforms(sample, submitted, simulation) {
  if (isStagedPartialCase(sample)) return stagedPartialExecutionConforms(sample, simulation);
  const { final, snapshots } = simulation, sells = final.fills.filter(f => f.side === 'sell');
  if (sample.id === 'cancel_protection') return final.orders[1]?.state === 'cancelled' && sells.length === 0;
  if (sample.id === 'cancel_remaining') return final.orders[0]?.state === 'cancelled' && final.orders[1]?.remainingQuantity === '6';
  if (sample.id === 'research') return sells.length === 0 && final.positions.reduce((n, p) => n.plus(p.quantity), D.from('0')).compareTo('27') === 0;
  if (['parallel', 'sequential'].includes(sample.id)) return final.orders.every(o => o.state === 'filled') && sells.length === 0 &&
    (sample.id !== 'sequential' || submitted.orders[1]?.state === 'waiting_entry');
  if (sample.id === 'each') return final.orders[0]?.filledQuantity === '10' && final.orders[0]?.state === 'cancelled' && final.orders[1]?.remainingQuantity === '6';
  if (sample.id === 'staged' && snapshots[18]?.book.orders.find(o => o.parentOrderId && o.kind === 'stop_loss')?.remainingQuantity !== '18') return false;
  return sells.reduce((n, f) => n.plus(f.quantity), D.from('0')).compareTo('27') === 0 && final.positions.length === 0;
}
