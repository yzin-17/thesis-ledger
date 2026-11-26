import { expect, it } from 'vitest';
import { arenaAppointmentLabel } from '../src/arena-live-display.js';
import { arenaDecisionPlanLines } from '../src/arena-live-plan-display.js';
import type { ArenaPaperDecision } from '../src/arena-live-types.js';

it('配置回读区分到价卖出与重新研究，不从摘要补止损', () => {
  const d: ArenaPaperDecision = { summary: '32.50美元止损', orders: [{ clientId: 'buy', symbol: 'TOPT.US',
    side: 'buy', kind: 'limit', quantity: '300', price: '34', expiresOn: '2026-11-13', exitGroup: null }],
    cancelOrderIds: [], watchedSymbols: [], wakeups: [{ kind: 'price', symbol: 'TOPT.US', operator: 'lte', price: '32.50' }] };
  expect(arenaDecisionPlanLines(d).join('')).toContain('自动卖出委托 0 张');
  expect(arenaDecisionPlanLines(d).join('')).not.toContain('止损');
  expect(arenaAppointmentLabel(d.wakeups[0]!)).toContain('32.50 时重新研究');
  d.orders[0]!.onFill = { activation: 'on_full_fill', afterExit: 'keep_entry_remainder', activateOrders: [{ clientId: 'stop', side: 'sell', kind: 'stop_loss', price: '32.50',
    quantity: { basis: 'parent_open_quantity' }, reduceOnly: true, validUntil: { kind: 'date', expiresOn: '2026-11-16' } }] };
  const lines = arenaDecisionPlanLines(d).join('');
  expect(lines).toContain('自动卖出委托 1 张'); expect(lines).toContain('全部成交后');
  expect(lines).toContain('2026-11-16 收盘（可跨夜）'); expect(lines).toContain('成交价可能不同于触发价');
  expect(lines).not.toContain('后续成交会再次建立');
  d.orders[0]!.onFill.activation = 'on_each_fill';
  expect(arenaDecisionPlanLines(d).join('')).toContain('后续成交会再次建立');
});
